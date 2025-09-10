/* =================== Config =================== */
const API_URL          = "https://track-saidas-api.onrender.com/api";
const API_ENTREGADORES = `${API_URL}/entregadores/`;

/* =============== Helpers / UI ================= */
const qs  = (s) => document.querySelector(s);
const qsa = (s) => Array.from(document.querySelectorAll(s));

const toast = (msg, type = "primary") => {
  const el = document.createElement("div");
  el.className = `toast align-items-center text-bg-${type} border-0 position-fixed bottom-0 end-0 m-3`;
  el.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">${msg}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
    </div>`;
  el.style.zIndex = 1080;
  document.body.appendChild(el);
  const t = new bootstrap.Toast(el, { delay: 2200 }); t.show();
  setTimeout(() => el.remove(), 2600);
};

// fetch enviando cookies de sessão
async function http(url, options = {}) {
  const opts = {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  };
  return fetch(url, opts);
}

/* =============== Estado de página ============= */
let DATA_CACHE  = [];
let CUR_PAGE    = 1;
let offcanvas   = null;
let deletingId  = null;
let SELECTED_ID = null;

/* =============== API CRUD ===================== */
// Lista com ?status= (API já filtra por base do usuário logado)
async function apiList(status) {
  const url = new URL(API_ENTREGADORES);
  if (status) url.searchParams.set("status", status);
  const r = await http(url.toString());
  if (!r.ok) throw new Error(`Falha ao listar (${r.status}) ${await r.text().catch(()=> "")}`);
  return r.json();
}

async function apiGet(id) {
  const r = await http(`${API_ENTREGADORES}${id}`);
  if (!r.ok) throw new Error(`Falha ao carregar (${r.status})`);
  return r.json();
}

async function apiCreate(payload) {
  const body = JSON.stringify({
    nome: payload.nome,
    documento: payload.documento,
    telefone: payload.telefone,
  });
  const r = await http(API_ENTREGADORES, { method: "POST", body });
  if (!r.ok) throw new Error(await r.text());
}

async function apiUpdate(id, payload) {
  const body = JSON.stringify({
    nome: payload.nome,
    documento: payload.documento,
    telefone: payload.telefone,
  });
  const r = await http(`${API_ENTREGADORES}${id}`, { method: "PUT", body });
  if (!r.ok) throw new Error(await r.text());
}

async function apiUpdateAtivo(id, ativo) {
  const body = JSON.stringify({ ativo: !!ativo });
  const r = await http(`${API_ENTREGADORES}${id}`, { method: "PUT", body });
  if (!r.ok) throw new Error(await r.text());
}

async function apiDelete(id) {
  const r = await http(`${API_ENTREGADORES}${id}`, { method: "DELETE" });
  if (!r.ok) throw new Error(await r.text());
}

/* =============== Listagem + Paginação ========= */
function buildRow(e) {
  const id           = e.id_entregador || e.id || "";
  const ativoChecked = e.ativo ? "checked" : "";
  return `
    <tr class="row-selectable" data-id="${id}" role="button">
      <td>${e.nome || "-"}</td>
      <td>${e.telefone || "-"}</td>
      <td>${e.documento || "-"}</td>
      <td>
        <div class="form-check form-switch">
          <input class="form-check-input" type="checkbox" ${ativoChecked} disabled>
        </div>
      </td>
    </tr>`;
}

function renderPage(page = 1) {
  const perPage = parseInt(qs("#perPage")?.value || "10", 10);
  const total   = DATA_CACHE.length;
  const pages   = Math.max(1, Math.ceil(total / perPage));
  CUR_PAGE = Math.min(Math.max(1, page), pages);

  const start = (CUR_PAGE - 1) * perPage;
  const slice = DATA_CACHE.slice(start, start + perPage);

  if (qs("#tbody-entregadores")) qs("#tbody-entregadores").innerHTML = slice.map(buildRow).join("");
  qs("#empty")?.classList.toggle("d-none", total !== 0);

  updatePagination(pages);

  // seleção de linha
  qsa("#tbody-entregadores tr.row-selectable").forEach(tr => {
    tr.addEventListener("click", () => {
      qsa("#tbody-entregadores tr.row-selectable").forEach(x => x.classList.remove("table-active"));
      tr.classList.add("table-active");
      SELECTED_ID = tr.dataset.id || null;
      setHeaderActionsState();
    });
  });

  // ao paginar, limpa seleção
  SELECTED_ID = null;
  setHeaderActionsState();
}

function updatePagination(pages) {
  const prev = qs("#pg-prev"), next = qs("#pg-next"), nums = qs("#pg-numbers");
  prev && prev.classList.toggle("disabled", CUR_PAGE === 1);
  next && next.classList.toggle("disabled", CUR_PAGE === pages || pages === 1);

  const MAX_BTNS = 7;
  let first = Math.max(1, CUR_PAGE - Math.floor(MAX_BTNS / 2));
  let last  = Math.min(pages, first + MAX_BTNS - 1);
  first = Math.max(1, last - MAX_BTNS + 1);

  if (nums) {
    nums.innerHTML = "";
    for (let p = first; p <= last; p++) {
      const li = document.createElement("li");
      li.className = "page-item";
      li.innerHTML = `<a class="page-link ${p === CUR_PAGE ? "active" : ""}" href="javascript:void(0);">${p}</a>`;
      li.querySelector("a").addEventListener("click", () => renderPage(p));
      nums.appendChild(li);
    }
  }
}

async function listarEntregadores() {
  if (qs("#tbody-entregadores")) qs("#tbody-entregadores").innerHTML = "";
  qs("#empty")?.classList.add("d-none");
  try {
    const onlyActive = qs("#toggleAtivos")?.checked ?? true;
    const status     = onlyActive ? "ativo" : "todos";
    const data       = await apiList(status);   // API trata base + status

    const term = (qs("#search")?.value || "").trim().toLowerCase();
    DATA_CACHE = data.filter(e =>
      [e.nome, e.telefone, e.documento]
        .filter(Boolean)
        .some(v => String(v).toLowerCase().includes(term))
    );

    renderPage(1);
  } catch (err) {
    console.error(err);
    qs("#empty")?.classList.remove("d-none");
    toast("Falha ao carregar entregadores.", "danger");
  }
}

/* =============== Header (seleção) ============= */
function setHeaderActionsState() {
  const can = !!SELECTED_ID;
  qs("#btnHeaderEdit") && (qs("#btnHeaderEdit").disabled = !can);
  qs("#btnHeaderDel")  && (qs("#btnHeaderDel").disabled  = !can);
}

/* =============== Offcanvas (form) ============= */
function openForm(modo, data = null) {
  const form = qs("#formEntregador");
  if (!form) return;
  form.reset();
  form.classList.remove("was-validated");

  qs("#entregadorId") && (qs("#entregadorId").value = data?.id_entregador || data?.id || "");
  qs("#nome")       && (qs("#nome").value         = data?.nome || "");
  qs("#telefone")   && (qs("#telefone").value     = data?.telefone || "");
  qs("#documento")  && (qs("#documento").value    = data?.documento || "");

  // "Ativo" só no editar
  qs("#grp-ativo")?.classList.toggle("d-none", modo !== "edit");
  if (qs("#ativo")) qs("#ativo").checked = !!data?.ativo;

  if (qs("#ocLabel")) qs("#ocLabel").textContent =
    (modo === "edit") ? "Editar Entregador" : "Novo Entregador";

  offcanvas?.show();
}

function formPayload() {
  return {
    nome: (qs("#nome")?.value || "").trim(),
    documento: (qs("#documento")?.value || "").trim(),
    telefone: (qs("#telefone")?.value || "").trim(),
  };
}

/* =================== Init ===================== */
document.addEventListener("DOMContentLoaded", async () => {
  const oc = qs("#oc-form");
  if (oc) offcanvas = new bootstrap.Offcanvas(oc);

  await listarEntregadores();

  // busca/toggle/paginação
  qs("#search")?.addEventListener("input", listarEntregadores);
  qs("#toggleAtivos")?.addEventListener("change", listarEntregadores);
  qs("#perPage")?.addEventListener("change", () => renderPage(1));
  qs("#pg-prev")?.addEventListener("click", () => renderPage(CUR_PAGE - 1));
  qs("#pg-next")?.addEventListener("click", () => renderPage(CUR_PAGE + 1));

  // header: adicionar
  qs("#btnAdd")?.addEventListener("click", () => openForm("create"));

  // header: editar selecionado
  qs("#btnHeaderEdit")?.addEventListener("click", async () => {
    if (!SELECTED_ID) return;
    try {
      const data = await apiGet(SELECTED_ID);
      openForm("edit", data); // no editar, #grp-ativo aparece para ligar/desligar
    } catch {
      toast("Não foi possível abrir para edição.", "danger");
    }
  });

  // header: excluir selecionado
  qs("#btnHeaderDel")?.addEventListener("click", () => {
    if (!SELECTED_ID) return;
    deletingId = SELECTED_ID;
    const m = qs("#modalDelete");
    m && new bootstrap.Modal(m).show();
  });

  // submit (criar/editar)
  qs("#formEntregador")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const form = ev.currentTarget;
    if (!form.checkValidity()) { form.classList.add("was-validated"); return; }

    const id = qs("#entregadorId")?.value;

    try {
      if (id) {
        await apiUpdate(id, formPayload());
        // aplicar ativo se visível no offcanvas (somente no editar)
        if (!qs("#grp-ativo")?.classList.contains("d-none")) {
          await apiUpdateAtivo(id, qs("#ativo")?.checked);
        }
      } else {
        await apiCreate(formPayload());   // API define base/ativo
      }
      toast("Salvo com sucesso.", "success");
      offcanvas?.hide();
      await listarEntregadores();
    } catch (err) {
      console.error(err);
      toast("Erro ao salvar. Verifique os dados.", "danger");
    }
  });

  // (removido) nenhum toggle de ativo direto na lista — coluna é somente leitura
  // listener de exclusão (modal)
  qs("#btnConfirmDelete")?.addEventListener("click", async () => {
    try {
      await apiDelete(deletingId);
      const m = qs("#modalDelete");
      m && bootstrap.Modal.getInstance(m).hide();
      toast("Excluído.", "success");
      await listarEntregadores();
    } catch (err) {
      console.error(err);
      toast("Falha ao excluir.", "danger");
    } finally {
      deletingId = null;
    }
  });
});
