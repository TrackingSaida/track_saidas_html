/* assets/js/pages/entregadores.init.js */

/* =================== Config =================== */
const API_BASE = "https://track-saidas-api.onrender.com/api";
const ENDPOINT = `${API_BASE}/entregadores/`; // GET/POST/PUT/DELETE
const USERS_ENDPOINT = `${API_BASE}/users/`;

/* =============== Helpers / UI ================= */
const qs  = (s) => document.querySelector(s);
const qsa = (s) => Array.from(document.querySelectorAll(s));

const toast = (msg, type="primary") => {
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
  setTimeout(()=>el.remove(), 2600);
};

const authToken = () => localStorage.getItem("auth_token") || (window.APP_USER && window.APP_USER.token) || "";
const authHeaders = () => ({
  "Content-Type": "application/json",
  ...(authToken() ? { "Authorization": `Bearer ${authToken()}` } : {})
});

const setToday = (el) => {
  const d = new Date(), p = (n)=>String(n).padStart(2,"0");
  el.value = `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
};

/* =============== Estado de página ============= */
let DATA_CACHE = [];   // dados filtrados (toggle + busca)
let CUR_PAGE   = 1;    // página atual
let offcanvas, deletingId = null;

/* =============== Base (lookup) ================ */
async function carregarBases() {
  const sel  = qs("#base");
  const fixa = (window.APP_USER && window.APP_USER.base) || localStorage.getItem("auth_base");
  if (fixa) {
    sel.innerHTML = `<option value="${fixa}" selected>${fixa}</option>`;
    sel.disabled = true;
    return;
  }
  try {
    const r = await fetch(USERS_ENDPOINT, { headers: authHeaders() });
    const data = r.ok ? await r.json() : [];
    const bases = [...new Set(data.map(u => u.base).filter(Boolean))].sort();
    sel.innerHTML = `<option value="" disabled selected>Selecione...</option>` +
      bases.map(b=>`<option value="${b}">${b}</option>`).join("");
  } catch {
    sel.innerHTML = `<option value="" disabled selected>Erro ao carregar bases</option>`;
  }
}

/* =============== API CRUD ===================== */
async function carregarEntregador(id) {
  const r = await fetch(`${ENDPOINT}${id}`, { headers: authHeaders() });
  if (!r.ok) throw new Error("Erro ao carregar");
  return r.json();
}
async function criarEntregador(payload) {
  const r = await fetch(ENDPOINT, { method: "POST", headers: authHeaders(), body: JSON.stringify(payload) });
  if (!r.ok) throw new Error(await r.text());
}
async function atualizarEntregador(id, payload) {
  const r = await fetch(`${ENDPOINT}${id}`, { method: "PUT", headers: authHeaders(), body: JSON.stringify(payload) });
  if (!r.ok) throw new Error(await r.text());
}
async function excluirEntregador(id) {
  const r = await fetch(`${ENDPOINT}${id}`, { method: "DELETE", headers: authHeaders() });
  if (!r.ok) throw new Error(await r.text());
}

/* =============== Listagem + Paginação ========= */
function buildRow(e) {
  const id = e.id_entregador || e.id || "";
  return `
    <tr>
      <td>${e.nome || "-"}</td>
      <td>${e.telefone || "-"}</td>
      <td>${e.documento || "-"}</td>
      <td><span class="badge bg-primary-subtle text-primary">${e.base || "-"}</span></td>
      <td>
        <div class="d-flex gap-2">
          <button class="btn btn-sm btn-soft-primary btn-edit" data-id="${id}">
            <i class="ri-edit-2-line"></i>
          </button>
          <button class="btn btn-sm btn-soft-danger btn-del" data-id="${id}">
            <i class="ri-delete-bin-6-line"></i>
          </button>
        </div>
      </td>
    </tr>`;
}

function renderPage(page=1) {
  const perPage = parseInt(qs("#perPage").value, 10) || 10;
  const total   = DATA_CACHE.length;
  const pages   = Math.max(1, Math.ceil(total / perPage));
  CUR_PAGE = Math.min(Math.max(1, page), pages);

  const start = (CUR_PAGE - 1) * perPage;
  const slice = DATA_CACHE.slice(start, start + perPage);

  qs("#tbody-entregadores").innerHTML = slice.map(buildRow).join("");
  qs("#empty").classList.toggle("d-none", total !== 0);

  updatePagination(pages);
}

function updatePagination(pages) {
  const prev = qs("#pg-prev"), next = qs("#pg-next"), nums = qs("#pg-numbers");
  prev.classList.toggle("disabled", CUR_PAGE === 1);
  next.classList.toggle("disabled", CUR_PAGE === pages || pages === 1);

  const MAX_BTNS = 7;
  let first = Math.max(1, CUR_PAGE - Math.floor(MAX_BTNS/2));
  let last  = Math.min(pages, first + MAX_BTNS - 1);
  first = Math.max(1, last - MAX_BTNS + 1);

  nums.innerHTML = "";
  for (let p = first; p <= last; p++) {
    const li = document.createElement("li");
    li.className = "page-item";
    li.innerHTML = `<a class="page-link ${p===CUR_PAGE?"active":""}" href="javascript:void(0);">${p}</a>`;
    li.querySelector("a").addEventListener("click", ()=>renderPage(p));
    nums.appendChild(li);
  }
}

async function listarEntregadores() {
  const tb = qs("#tbody-entregadores");
  tb.innerHTML = ""; qs("#empty").classList.add("d-none");

  try {
    // Dica: se a API suportar ?status=ativo, pode filtrar no servidor.
    const r = await fetch(ENDPOINT, { headers: authHeaders() });
    const all = r.ok ? await r.json() : [];

    const onlyActive = qs("#toggleAtivos").checked;
    const baseList = onlyActive ? all.filter(e => String(e.status||"").toLowerCase() === "ativo") : all;

    const term = qs("#search").value.trim().toLowerCase();
    DATA_CACHE = baseList.filter(e =>
      [e.nome, e.telefone, e.documento, e.base]
        .filter(Boolean)
        .some(v => String(v).toLowerCase().includes(term))
    );

    renderPage(1);
  } catch (err) {
    console.error(err);
    qs("#empty").classList.remove("d-none");
    toast("Falha ao carregar entregadores.", "danger");
  }
}

/* =============== Offcanvas (form) ============= */
function openForm(modo, data = null) {
  qs("#formEntregador").reset();
  qs("#formEntregador").classList.remove("was-validated");
  if (!qs("#data_cadastro").value) setToday(qs("#data_cadastro"));

  qs("#entregadorId").value    = data?.id_entregador || data?.id || "";
  qs("#nome").value            = data?.nome || "";
  qs("#telefone").value        = data?.telefone || "";
  qs("#documento").value       = data?.documento || "";
  qs("#data_cadastro").value   = (data?.data_cadastro || "").substring(0,10) || qs("#data_cadastro").value;

  // base (se select não estiver travado)
  if (!qs("#base").disabled) {
    if (data?.base) {
      const has = Array.from(qs("#base").options).some(o => o.value === data.base);
      if (!has) qs("#base").insertAdjacentHTML("beforeend", `<option value="${data.base}">${data.base}</option>`);
      qs("#base").value = data.base;
    } else {
      qs("#base").value = "";
    }
  }

  // ativo só no editar
  qs("#grp-ativo").classList.toggle("d-none", modo !== "edit");
  qs("#ativo").checked = String(data?.status || "ativo").toLowerCase() === "ativo";

  qs("#ocLabel").textContent = (modo === "edit") ? "Editar Entregador" : "Novo Entregador";
  offcanvas.show();
}

function formPayload() {
  return {
    nome: qs("#nome").value.trim(),
    telefone: qs("#telefone").value.trim(),
    documento: qs("#documento").value.trim(),
    data_cadastro: qs("#data_cadastro").value,
    base: qs("#base").value,
    // status somente no editar; no criar, backend assume "ativo"
    ...( !qs("#grp-ativo").classList.contains("d-none")
        ? { status: qs("#ativo").checked ? "ativo" : "inativo" }
        : {} )
  };
}

/* =================== Init ===================== */
document.addEventListener("DOMContentLoaded", async () => {
  offcanvas = new bootstrap.Offcanvas("#oc-form");

  await carregarBases();
  await listarEntregadores();

  // busca/toggle/paginação
  qs("#search").addEventListener("input", listarEntregadores);
  qs("#toggleAtivos").addEventListener("change", listarEntregadores);
  qs("#perPage").addEventListener("change", ()=>renderPage(1));
  qs("#pg-prev").addEventListener("click", ()=> renderPage(CUR_PAGE - 1));
  qs("#pg-next").addEventListener("click", ()=> renderPage(CUR_PAGE + 1));

  // adicionar
  qs("#btnAdd").addEventListener("click", () => openForm("create"));

  // submit
  qs("#formEntregador").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const form = ev.currentTarget;
    if (!form.checkValidity()) { form.classList.add("was-validated"); return; }

    const id = qs("#entregadorId").value;
    try {
      if (id) await atualizarEntregador(id, formPayload());
      else    await criarEntregador(formPayload());

      toast("Salvo com sucesso.", "success");
      offcanvas.hide();
      await listarEntregadores();
    } catch (err) {
      console.error(err);
      toast("Erro ao salvar. Verifique os dados.", "danger");
    }
  });

  // delegação editar/excluir
  qs("#tbody-entregadores").addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const id = btn.dataset.id;

    if (btn.classList.contains("btn-edit")) {
      try {
        const data = await carregarEntregador(id);
        openForm("edit", data);
      } catch {
        toast("Não foi possível abrir para edição.", "danger");
      }
    }

    if (btn.classList.contains("btn-del")) {
      deletingId = id;
      new bootstrap.Modal("#modalDelete").show();
    }
  });

  // confirmar exclusão
  qs("#btnConfirmDelete").addEventListener("click", async () => {
    try {
      await excluirEntregador(deletingId);
      bootstrap.Modal.getInstance(qs("#modalDelete")).hide();
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
