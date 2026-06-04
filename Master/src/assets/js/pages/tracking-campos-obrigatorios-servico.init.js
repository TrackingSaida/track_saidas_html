(function () {
  "use strict";

  const API_URL = window.TRACK_API_URL || "https://track-saidas-api.onrender.com/api";
  const API_RULES = `${API_URL.replace(/\/+$/, "")}/configuracoes/campos-obrigatorios-pedido`;
  const API_META = `${API_RULES}/meta`;
  const qs = (s) => document.querySelector(s);

  const offcanvasRule = new bootstrap.Offcanvas("#oc-rule");
  let CACHE_RULES = [];
  let CACHE_META = { servicos: [], contextos: [], campos: [] };
  let SELECTED_ID = null;

  function toast(msg, ok = true) {
    const el = document.createElement("div");
    el.className = `toast align-items-center text-bg-${ok ? "primary" : "danger"} border-0 position-fixed bottom-0 end-0 m-3`;
    el.innerHTML = `<div class="d-flex"><div class="toast-body">${msg}</div><button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div>`;
    el.style.zIndex = 1080;
    document.body.appendChild(el);
    const t = new bootstrap.Toast(el, { delay: 2500 });
    t.show();
    setTimeout(() => el.remove(), 3000);
  }

  async function http(url, options = {}) {
    const opts = { credentials: "include", headers: { "Content-Type": "application/json" }, ...options };
    const r = await fetch(url, opts);
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      throw new Error(text || r.statusText);
    }
    return r.json().catch(() => null);
  }

  function updateActionButtons() {
    const enabled = !!SELECTED_ID;
    qs("#btnEditRule").disabled = !enabled;
    qs("#btnDeleteRule").disabled = !enabled;
  }

  function renderRows(data) {
    const tbody = qs("#tbody-rules");
    const empty = qs("#emptyRules");
    const term = (qs("#searchRule")?.value || "").trim().toLowerCase();
    const filtered = !term ? data : data.filter((r) =>
      `${r.servico} ${r.contexto} ${(r.campos_obrigatorios || []).join(" ")}`.toLowerCase().includes(term)
    );
    tbody.innerHTML = "";
    if (!filtered.length) {
      empty.classList.remove("d-none");
      return;
    }
    empty.classList.add("d-none");
    const badgeServico = (servico) => {
      const s = String(servico || "").toLowerCase();
      if (s.includes("shopee")) return '<span class="badge bg-warning-subtle text-warning">Shopee</span>';
      if (s.includes("mercado") || s.includes("livre") || s.includes("ml") || s.includes("flex")) {
        return '<span class="badge bg-info-subtle text-info">Mercado Livre</span>';
      }
      return '<span class="badge bg-secondary-subtle text-secondary">Avulso</span>';
    };
    const badgeContexto = (ctx) => {
      const c = String(ctx || "").toUpperCase();
      if (c === "ENTREGUE") return '<span class="badge bg-success-subtle text-success">Entregue</span>';
      if (c === "AUSENTE") return '<span class="badge bg-danger-subtle text-danger">Ausente</span>';
      return '<span class="badge bg-primary-subtle text-primary">Ambos</span>';
    };
    const badgeCampos = (campos) => {
      const arr = Array.isArray(campos) ? campos : [];
      if (!arr.length) return "—";
      return arr.map((c) => `<span class="badge bg-light text-body me-1 mb-1">${c}</span>`).join("");
    };
    tbody.innerHTML = filtered.map((r) => `
      <tr data-id="${r.id}" class="row-selectable">
        <td class="text-center"><input class="form-check-input sel-row" type="radio" name="sel-rule" value="${r.id}"></td>
        <td>${badgeServico(r.servico)}</td>
        <td>${badgeContexto(r.contexto)}</td>
        <td>${badgeCampos(r.campos_obrigatorios)}</td>
        <td>${r.ativo ? '<span class="badge bg-success-subtle text-success">Ativo</span>' : '<span class="badge bg-secondary-subtle text-secondary">Inativo</span>'}</td>
      </tr>
    `).join("");
  }

  function fillFormOptions() {
    qs("#ruleServico").innerHTML = (CACHE_META.servicos || []).map((s) => `<option value="${s}">${s}</option>`).join("");
    qs("#ruleContexto").innerHTML = (CACHE_META.contextos || []).map((c) => `<option value="${c}">${c}</option>`).join("");
    const checklist = qs("#ruleCamposChecklist");
    checklist.innerHTML = (CACHE_META.campos || []).map((c) => `
      <div class="form-check mb-1">
        <input class="form-check-input rule-campo-check" type="checkbox" value="${c}" id="campo_${c}">
        <label class="form-check-label" for="campo_${c}">${c}</label>
      </div>
    `).join("");
  }

  function getSelectedRule() {
    return CACHE_RULES.find((r) => String(r.id) === String(SELECTED_ID)) || null;
  }

  function openRuleForm(mode, rule = null) {
    const isEdit = mode === "edit" && rule;
    qs("#ocRuleLabel").textContent = isEdit ? "Editar regra" : "Nova regra";
    qs("#ruleId").value = isEdit ? String(rule.id) : "";
    qs("#ruleServico").value = isEdit ? (rule.servico || "") : (CACHE_META.servicos[0] || "");
    qs("#ruleContexto").value = isEdit ? (rule.contexto || "") : (CACHE_META.contextos[0] || "");
    const selected = new Set((isEdit ? (rule.campos_obrigatorios || []) : []));
    document.querySelectorAll(".rule-campo-check").forEach((el) => {
      if (el instanceof HTMLInputElement) {
        el.checked = selected.has(el.value);
      }
    });
    qs("#ruleAtivo").checked = isEdit ? !!rule.ativo : true;
    offcanvasRule.show();
  }

  async function loadAll() {
    const [meta, rules] = await Promise.all([http(API_META), http(API_RULES)]);
    CACHE_META = meta || { servicos: [], contextos: [], campos: [] };
    CACHE_RULES = Array.isArray(rules) ? rules : [];
    fillFormOptions();
    renderRows(CACHE_RULES);
  }

  async function saveRule(ev) {
    ev.preventDefault();
    const id = qs("#ruleId").value.trim();
    const payload = {
      servico: qs("#ruleServico").value,
      contexto: qs("#ruleContexto").value,
      campos_obrigatorios: Array.from(document.querySelectorAll(".rule-campo-check"))
        .filter((el) => el instanceof HTMLInputElement && el.checked)
        .map((el) => el.value),
      ativo: !!qs("#ruleAtivo").checked,
    };
    if (!payload.servico || !payload.contexto) {
      toast("Preencha serviço e contexto.", false);
      return;
    }
    const url = id ? `${API_RULES}/${id}` : API_RULES;
    const method = id ? "PUT" : "POST";
    await http(url, { method, body: JSON.stringify(payload) });
    toast(id ? "Regra atualizada." : "Regra criada.");
    offcanvasRule.hide();
    await loadAll();
  }

  async function deleteSelectedRule() {
    const rule = getSelectedRule();
    if (!rule) return;
    if (!window.confirm("Deseja excluir esta regra?")) return;
    await http(`${API_RULES}/${rule.id}`, { method: "DELETE" });
    SELECTED_ID = null;
    updateActionButtons();
    toast("Regra excluída.");
    await loadAll();
  }

  function bindEvents() {
    qs("#btnAddRule")?.addEventListener("click", () => openRuleForm("create"));
    qs("#btnEditRule")?.addEventListener("click", () => {
      const rule = getSelectedRule();
      if (rule) openRuleForm("edit", rule);
    });
    qs("#btnDeleteRule")?.addEventListener("click", () => deleteSelectedRule().catch((e) => toast(e.message || "Erro ao excluir.", false)));
    qs("#formRule")?.addEventListener("submit", (ev) => saveRule(ev).catch((e) => toast(e.message || "Erro ao salvar.", false)));
    qs("#searchRule")?.addEventListener("input", () => renderRows(CACHE_RULES));

    document.addEventListener("change", (ev) => {
      const t = ev.target;
      if (!(t instanceof HTMLInputElement)) return;
      if (t.classList.contains("sel-row")) {
        SELECTED_ID = t.value || null;
        updateActionButtons();
      }
    });
  }

  async function init() {
    try {
      bindEvents();
      updateActionButtons();
      await loadAll();
    } catch (e) {
      console.error(e);
      toast("Falha ao carregar tela de configuração.", false);
    }
  }

  init();
})();
