// tracking-base.init.js
// =======================================================
// CRUD de Bases de Preço
// =======================================================

(function () {
  "use strict";

  const API_URL = "https://track-saidas-api.onrender.com/api";
  const API_BASES = `${API_URL}/base/`;

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

  const onlyDigits = (s) => (s || "").replace(/\D/g, "");

  function parseMoeda(valorRaw = "") {
    if (typeof valorRaw === "number") return valorRaw;
    const clean = valorRaw.replace(/[R$\s.]/g, "").replace(",", ".");
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
  }

  function normalizeNome(nomeRaw = "") {
    return nomeRaw
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }

  // =======================================================
  // API Helpers
  // =======================================================
  async function http(url, options = {}) {
    const opts = {
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      ...options
    };
    const r = await fetch(url, opts);
    if (!r.ok) {
      const errText = await r.text();
      const err = new Error(errText || r.statusText);
      err.status = r.status;
      throw err;
    }
    return r.json ? r.json() : null;
  }

  async function apiList() {
    return http(API_BASES);
  }
  async function apiGet(id) {
    return http(`${API_BASES}${encodeURIComponent(id)}`);
  }
  async function apiCreate(payload) {
    return http(API_BASES, { method: "POST", body: JSON.stringify(payload) });
  }
  async function apiUpdate(id, payload) {
    return http(`${API_BASES}${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
  }
  async function apiDelete(id) {
    return http(`${API_BASES}${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  // =======================================================
  // Renderização da Tabela
  // =======================================================
  function buildRow(b) {
    const ativoChecked = b.ativo ? "checked" : "";
    const id = b.id_base || b.id;
    return `
      <tr class="row-selectable" data-id="${id}">
        <td class="text-center"><input class="form-check-input sel-row" type="radio" name="sel-base" value="${id}"></td>
        <td>${b.base || "-"}</td>
        <td>R$ ${Number(b.ml).toFixed(2).replace(".", ",")}</td>
        <td>R$ ${Number(b.shopee).toFixed(2).replace(".", ",")}</td>
        <td>R$ ${Number(b.avulso).toFixed(2).replace(".", ",")}</td>
        <td class="text-center"><input type="checkbox" class="form-check-input" ${ativoChecked} disabled></td>
      </tr>
    `;
  }

  function renderTable(data) {
    const tbody = qs("#tbody-bases");
    if (!tbody) return;
    tbody.innerHTML = "";
    if (!data || !data.length) {
      qs("#empty")?.classList.remove("d-none");
      return;
    }
    qs("#empty")?.classList.add("d-none");
    tbody.innerHTML = data.map(buildRow).join("");
  }

  // =======================================================
  // Estado
  // =======================================================
  let DATA_CACHE = [];
  let SELECTED_ID = null;
  const offcanvas = new bootstrap.Offcanvas("#oc-form");

  // =======================================================
  // CRUD Actions
  // =======================================================
  async function listarBases() {
    try {
      const data = await apiList();
      const term = (qs("#search")?.value || "").toLowerCase();
      const filtrados = data.filter(b =>
        b.base?.toLowerCase().includes(term)
      );
      DATA_CACHE = filtrados;
      renderTable(filtrados);
    } catch (err) {
      console.error(err);
      toast("Falha ao carregar bases.", false);
    }
  }

  function openForm(modo, data = null) {
    const form = qs("#formBase");
    form.reset();
    form.classList.remove("was-validated");
    qs("#ocLabel").textContent = modo === "edit" ? "Editar Base" : "Nova Base";

    qs("#baseId").value = data?.id_base || "";
    qs("#base").value = data?.base || "";
    qs("#flex").value = data ? `R$ ${Number(data.ml).toFixed(2).replace(".", ",")}` : "";
    qs("#shopee").value = data ? `R$ ${Number(data.shopee).toFixed(2).replace(".", ",")}` : "";
    qs("#avulso").value = data ? `R$ ${Number(data.avulso).toFixed(2).replace(".", ",")}` : "";
    qs("#ativo").checked = !!data?.ativo;

    offcanvas.show();
  }

  function formPayload() {
    return {
      base: normalizeNome(qs("#base").value || ""),
      ml: parseMoeda(qs("#flex").value),
      shopee: parseMoeda(qs("#shopee").value),
      avulso: parseMoeda(qs("#avulso").value),
      ativo: qs("#ativo").checked,
    };
  }

  // =======================================================
  // Eventos
  // =======================================================
  document.addEventListener("DOMContentLoaded", async () => {
    await listarBases();

    const tbody = qs("#tbody-bases");
    tbody?.addEventListener("click", (e) => {
      const tr = e.target.closest("tr.row-selectable");
      if (!tr) return;
      qsa("#tbody-bases tr").forEach((r) => r.classList.remove("table-active"));
      tr.classList.add("table-active");
      SELECTED_ID = tr.dataset.id;
      qs("#btnHeaderEdit").disabled = false;
      qs("#btnHeaderDel").disabled = false;
    });

    qs("#search")?.addEventListener("input", listarBases);

    qs("#btnAdd")?.addEventListener("click", () => {
      openForm("create");
      qs("#btnHeaderEdit").disabled = true;
      qs("#btnHeaderDel").disabled = true;
    });

    qs("#btnHeaderEdit")?.addEventListener("click", async () => {
      if (!SELECTED_ID) return;
      try {
        const data = await apiGet(SELECTED_ID);
        openForm("edit", data);
      } catch (err) {
        toast("Erro ao carregar base.", false);
      }
    });

    qs("#btnHeaderDel")?.addEventListener("click", () => {
      if (!SELECTED_ID) return;
      const modal = new bootstrap.Modal("#modalDelete");
      modal.show();
      qs("#btnConfirmDelete").onclick = async () => {
        try {
          await apiDelete(SELECTED_ID);
          toast("Base excluída.");
          await listarBases();
          modal.hide();
          SELECTED_ID = null;
          qs("#btnHeaderEdit").disabled = true;
          qs("#btnHeaderDel").disabled = true;
        } catch (err) {
          toast("Erro ao excluir base.", false);
        }
      };
    });

    qs("#formBase")?.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const form = ev.currentTarget;
      if (!form.checkValidity()) {
        form.classList.add("was-validated");
        return;
      }

      const id = qs("#baseId").value.trim();
      const payload = formPayload();
      try {
        if (id) {
          await apiUpdate(id, payload);
          toast("Base atualizada com sucesso.");
        } else {
          await apiCreate(payload);
          toast("Base criada com sucesso.");
        }
        offcanvas.hide();
        await listarBases();
      } catch (err) {
        if (err.status === 409) {
          toast("Já existe uma base com esse nome.", false);
        } else {
          toast("Erro ao salvar base.", false);
        }
      }
    });
  });
})();
