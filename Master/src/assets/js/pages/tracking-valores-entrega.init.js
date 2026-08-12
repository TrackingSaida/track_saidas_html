// tracking-valores-entrega.init.js
// Configuração de valores globais e exceções por entregador
// Padrão: tracking-base.init.js / tracking-usuarios.js

(function () {
  "use strict";

  const API_URL = window.TRACK_API_URL || "https://track-saidas-api.onrender.com/api";
  const API_ENTREGADORES = `${API_URL.replace(/\/+$/, "")}/entregadores`;
  const API_PRECOS_GLOBAL = `${API_ENTREGADORES}/precos/global`;
  const API_PRECOS_INDIVIDUAIS = `${API_ENTREGADORES}/precos/individuais`;
  const API_PRECOS_EXECUTORES = `${API_ENTREGADORES}/precos/executores`;

  const qs = (s) => document.querySelector(s);
  const qsa = (s) => Array.from(document.querySelectorAll(s));

  const toast = (msg, ok = true) => {
    const el = document.createElement("div");
    el.className = `toast align-items-center text-bg-${ok ? "primary" : "danger"} border-0 position-fixed bottom-0 end-0 m-3`;
    el.innerHTML = `<div class="d-flex">
        <div class="toast-body">${msg}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
      </div>`;
    el.style.zIndex = 1080;
    document.body.appendChild(el);
    const t = new bootstrap.Toast(el, { delay: 2500 });
    t.show();
    setTimeout(() => el.remove(), 3000);
  };

  function parseMoeda(valorRaw = "") {
    if (valorRaw === "" || valorRaw == null) return null;
    if (typeof valorRaw === "number") return valorRaw;
    const clean = String(valorRaw).replace(/[R$\s.]/g, "").replace(",", ".");
    const num = parseFloat(clean);
    return isNaN(num) ? null : num;
  }

  function formatMoeda(val) {
    if (val == null || val === "") return "Global";
    const n = Number(val);
    if (isNaN(n)) return "Global";
    return "R$ " + n.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  function formatMoedaInput(val) {
    if (val == null || val === "") return "";
    const n = Number(val);
    if (isNaN(n)) return "";
    return "R$ " + n.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  function formatMoedaGrid(val) {
    if (val == null || val === "") return "—";
    const n = Number(val);
    if (isNaN(n)) return "—";
    return "R$ " + n.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  async function http(url, options = {}) {
    const opts = {
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      ...options,
    };
    const r = await fetch(url, opts);
    if (!r.ok) {
      let errText = "";
      try {
        errText = await r.text();
      } catch (e) {}
      const err = new Error(errText || r.statusText);
      err.status = r.status;
      throw err;
    }
    try {
      return await r.json();
    } catch {
      return null;
    }
  }

  // ---------- Valores globais (grid = estado persistido) ----------
  const offcanvasGlobal = new bootstrap.Offcanvas("#oc-global");

  async function loadPrecosGlobal() {
    try {
      const data = await http(API_PRECOS_GLOBAL);
      qs("#globalShopeeVal").textContent = formatMoedaGrid(data?.shopee_valor);
      qs("#globalMlVal").textContent = formatMoedaGrid(data?.ml_valor);
      qs("#globalAvulsoVal").textContent = formatMoedaGrid(data?.avulso_valor);
      const chk = qs("#editGlobalPacoteGAdicional");
      if (chk) chk.checked = !!data?.considerar_pacote_g_adicional;
    } catch (err) {
      console.error(err);
      toast("Falha ao carregar valores globais.", false);
    }
  }

  function openGlobalEdit() {
    http(API_PRECOS_GLOBAL).then((data) => {
      qs("#editGlobalShopee").value = formatMoedaInput(data?.shopee_valor);
      qs("#editGlobalMl").value = formatMoedaInput(data?.ml_valor);
      qs("#editGlobalAvulso").value = formatMoedaInput(data?.avulso_valor);
      const chk = qs("#editGlobalPacoteGAdicional");
      if (chk) chk.checked = !!data?.considerar_pacote_g_adicional;
      offcanvasGlobal.show();
    }).catch((err) => {
      console.error(err);
      toast("Falha ao carregar valores para edição.", false);
    });
  }

  async function savePrecosGlobal(ev) {
    ev.preventDefault();
    const shopee = parseMoeda(qs("#editGlobalShopee").value);
    const ml = parseMoeda(qs("#editGlobalMl").value);
    const avulso = parseMoeda(qs("#editGlobalAvulso").value);
    const considerarPacoteG = !!qs("#editGlobalPacoteGAdicional")?.checked;
    const payload = {};
    if (shopee != null) payload.shopee_valor = shopee;
    if (ml != null) payload.ml_valor = ml;
    if (avulso != null) payload.avulso_valor = avulso;
    payload.considerar_pacote_g_adicional = considerarPacoteG;
    try {
      await http(API_PRECOS_GLOBAL, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      toast("Valores globais salvos.");
      offcanvasGlobal.hide();
      await loadPrecosGlobal();
    } catch (err) {
      console.error(err);
      toast(err.message || "Erro ao salvar valores globais.", false);
    }
  }

  // ---------- Lista de exceções ----------
  let CACHE_EXCECOES = [];
  let SELECTED_ID = null;
  const offcanvasExcecao = new bootstrap.Offcanvas("#oc-excecao");

  function buildRow(item) {
    const id = item.motoboy_id || item.entregador_id;
    const nome = item.motoboy_nome || item.entregador_nome || "-";
    const shopee = formatMoeda(item.shopee_valor);
    const flex = formatMoeda(item.ml_valor);
    const avulso = formatMoeda(item.avulso_valor);
    return `<tr class="row-selectable" data-id="${id}">
        <td class="text-center"><input class="form-check-input sel-row" type="radio" name="sel-excecao" value="${id}"></td>
        <td>${nome}</td>
        <td>${shopee}</td>
        <td>${flex}</td>
        <td>${avulso}</td>
      </tr>`;
  }

  function renderExcecoes(data) {
    const tbody = qs("#tbody-excecoes");
    const empty = qs("#emptyExcecoes");
    if (!tbody) return;
    const term = (qs("#search")?.value || "").toLowerCase().trim();
    const filtrados = !term
      ? data
      : data.filter((i) => String(i.motoboy_nome || i.entregador_nome || "").toLowerCase().includes(term));
    tbody.innerHTML = "";
    if (!filtrados || !filtrados.length) {
      empty?.classList.remove("d-none");
      return;
    }
    empty?.classList.add("d-none");
    tbody.innerHTML = filtrados.map(buildRow).join("");
  }

  async function loadExcecoes() {
    try {
      const data = await http(API_PRECOS_INDIVIDUAIS);
      const items = data?.items || [];
      CACHE_EXCECOES = items;
      renderExcecoes(items);
    } catch (err) {
      console.error(err);
      toast("Falha ao carregar exceções.", false);
      CACHE_EXCECOES = [];
      renderExcecoes([]);
    }
  }

  // ---------- Motoboys (select) ----------
  async function loadMotoboysSelect() {
    try {
      const list = await http(`${API_PRECOS_EXECUTORES}?status=ativo`);
      const arr = Array.isArray(list) ? list : [];
      const select = qs("#selectMotoboy");
      if (!select) return;
      const idsComExcecao = new Set((CACHE_EXCECOES || []).map((e) => Number(e.motoboy_id || e.entregador_id)));
      const unicos = new Map();
      arr.forEach((e) => {
        const id = Number(e?.executor_id ?? e?.motoboy_id);
        if (!Number.isFinite(id) || id <= 0) return;
        if (idsComExcecao.has(id)) return;
        const nomeRaw = String(e?.nome || id).trim();
        const nome = (typeof window.formatPersonName === "function")
          ? window.formatPersonName(nomeRaw)
          : nomeRaw;
        const key = String(id);
        if (!unicos.has(key)) {
          unicos.set(key, { id_motoboy: id, nome });
        }
      });
      const ordenados = Array.from(unicos.values())
        .sort((a, b) => (typeof window.comparePersonNames === "function"
          ? window.comparePersonNames(a?.nome, b?.nome)
          : String(a?.nome || a?.id_motoboy || "").localeCompare(String(b?.nome || b?.id_motoboy || ""), "pt-BR", { sensitivity: "base" })));
      select.innerHTML = '<option value="">Selecione o motoboy</option>' +
        ordenados
          .map((e) => `<option value="${e.id_motoboy}">${e.nome || e.id_motoboy}</option>`)
          .join("");
    } catch (err) {
      console.error(err);
      toast("Falha ao carregar motoboys.", false);
    }
  }

  // ---------- Offcanvas: Adicionar / Editar ----------
  function openExcecaoForm(modo, item = null) {
    const form = qs("#formExcecao");
    form.reset();
    form.classList.remove("was-validated");
    const isEdit = modo === "edit" && item;
    qs("#ocExcecaoLabel").textContent = isEdit ? "Editar Exceção" : "Adicionar Exceção";
    qs("#excecaoEntregadorId").value = isEdit ? (item.motoboy_id || item.entregador_id) : "";

    qs("#groupSelectEntregador").classList.toggle("d-none", isEdit);
    qs("#groupNomeEntregador").classList.toggle("d-none", !isEdit);
    if (isEdit) {
      qs("#nomeEntregadorEdit").textContent = item.motoboy_nome || item.entregador_nome || "-";
    }

    qs("#excecaoShopee").value = item ? formatMoedaInput(item.shopee_valor) : "";
    qs("#excecaoMl").value = item ? formatMoedaInput(item.ml_valor) : "";
    qs("#excecaoAvulso").value = item ? formatMoedaInput(item.avulso_valor) : "";

    if (!isEdit) {
      loadMotoboysSelect();
    }
    offcanvasExcecao.show();
  }

  function formExcecaoPayload() {
    const shopee = parseMoeda(qs("#excecaoShopee").value);
    const ml = parseMoeda(qs("#excecaoMl").value);
    const avulso = parseMoeda(qs("#excecaoAvulso").value);
    const payload = {};
    if (shopee != null) payload.shopee_valor = shopee;
    if (ml != null) payload.ml_valor = ml;
    if (avulso != null) payload.avulso_valor = avulso;
    return payload;
  }

  async function submitExcecao(ev) {
    ev.preventDefault();
    const form = ev.currentTarget;
    const idHidden = qs("#excecaoEntregadorId").value.trim();
    const idSelect = qs("#selectMotoboy").value;
    const idMotoboy = idHidden ? idHidden : idSelect;
    if (!idMotoboy) {
      toast("Selecione um motoboy.", false);
      return;
    }
    const payload = formExcecaoPayload();
    if (Object.keys(payload).length === 0) {
      toast("Informe ao menos um valor.", false);
      return;
    }
    try {
      await http(`${API_ENTREGADORES}/motoboys/${idMotoboy}/precos`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      toast("Exceção salva.");
      offcanvasExcecao.hide();
      await loadExcecoes();
    } catch (err) {
      console.error(err);
      toast(err.message || "Erro ao salvar exceção.", false);
    }
  }

  // ---------- Delete ----------
  function confirmDelete() {
    if (!SELECTED_ID) return;
    const modal = new bootstrap.Modal("#modalDelete");
    modal.show();
    qs("#btnConfirmDelete").onclick = async () => {
      try {
        await http(`${API_ENTREGADORES}/motoboys/${SELECTED_ID}/precos`, { method: "DELETE" });
        toast("Exceção excluída.");
        modal.hide();
        SELECTED_ID = null;
        qs("#btnHeaderEdit").disabled = true;
        qs("#btnHeaderDel").disabled = true;
        await loadExcecoes();
      } catch (err) {
        toast("Erro ao excluir exceção.", false);
      }
    };
  }

  // ---------- Eventos ----------
  document.addEventListener("DOMContentLoaded", async () => {
    await loadPrecosGlobal();
    await loadExcecoes();

    qs("#btnEditarGlobal")?.addEventListener("click", openGlobalEdit);
    qs("#formGlobal")?.addEventListener("submit", savePrecosGlobal);
    const helpEl = qs("#helpPacoteGAdicional");
    if (helpEl && window.bootstrap?.Tooltip) {
      new bootstrap.Tooltip(helpEl);
    }

    const tbody = qs("#tbody-excecoes");
    tbody?.addEventListener("click", (e) => {
      const tr = e.target.closest("tr.row-selectable");
      if (!tr) return;
      qsa("#tbody-excecoes tr").forEach((r) => r.classList.remove("table-active"));
      tr.classList.add("table-active");
      SELECTED_ID = tr.dataset.id;
      qs("#btnHeaderEdit").disabled = false;
      qs("#btnHeaderDel").disabled = false;
    });

    qs("#search")?.addEventListener("input", () => renderExcecoes(CACHE_EXCECOES));

    qs("#btnAddExcecao")?.addEventListener("click", () => {
      openExcecaoForm("add");
      qs("#btnHeaderEdit").disabled = true;
      qs("#btnHeaderDel").disabled = true;
      SELECTED_ID = null;
    });

    qs("#btnHeaderEdit")?.addEventListener("click", () => {
      if (!SELECTED_ID) return;
      const item = CACHE_EXCECOES.find((i) => String(i.motoboy_id || i.entregador_id) === String(SELECTED_ID));
      if (item) openExcecaoForm("edit", item);
      else toast("Registro não encontrado.", false);
    });

    qs("#btnHeaderDel")?.addEventListener("click", confirmDelete);

    qs("#formExcecao")?.addEventListener("submit", submitExcecao);
  });
})();
