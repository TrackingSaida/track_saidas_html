/* assets/js/pages/track-entregador.init.js */

/* =================== Config =================== */
const API_BASE      = "https://track-saidas-api.onrender.com/api";
const ENDPOINT      = `${API_BASE}/entregadores/`; // CRUD
const AUTH_ME       = `${API_BASE}/auth/me`;        // (opcional) verificação de sessão

/* =============== Helpers / UI ================= */
const qs  = (s)=>document.querySelector(s);
const qsa = (s)=>Array.from(document.querySelectorAll(s));

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

// Wrapper para fetch sempre com cookie de sessão
async function http(url, options = {}) {
  const opts = {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  };
  return fetch(url, opts);
}

/* =============== Estado de página ============= */
let DATA_CACHE   = [];   // dados filtrados (toggle + busca)
let CUR_PAGE     = 1;    // página atual
let offcanvas    = null;
let deletingId   = null;
let SELECTED_ID  = null; // linha selecionada para header Editar/Excluir

function setHeaderActionsState() {
  const can = !!SELECTED_ID;
  const btnE = qs("#btnHeaderEdit");
  const btnD = qs("#btnHeaderDel");
  if (btnE) btnE.disabled = !can;
  if (btnD) btnD.disabled = !can;
}

/* =============== (opcional) Sessão ============ */
async function ensureSession() {
  // Descomente para forçar verificação de sessão antes de carregar a página
  // try {
  //   const r = await http(AUTH_ME);
  //   if (!r.ok) throw 0;
  // } catch {
  //   location.replace("landing-tracking.html?next=" + encodeURIComponent(location.pathname));
  // }
}

/* =============== API CRUD ===================== */
async function apiList() {
  const r = await http(ENDPOINT);
  if (!r.ok) throw new Error("Falha ao listar entregadores");
  return r.json();
}
async function apiGet(id) {
  const r = await http(`${ENDPOINT}${id}`);
  if (!r.ok) throw new Error("Falha ao carregar entregador");
  return r.json();
}
async function apiCreate(payload) {
  // Cadastro nasce ativo
  const body = JSON.stringify({
    nome: payload.nome,
    documento: payload.documento,
    telefone: payload.telefone,
    ativo: true
  });
  const r = await http(ENDPOINT, { method: "POST", body });
  if (!r.ok) throw new Error(await r.text());
}
async function apiUpdate(id, payload) {
  const body = JSON.stringify({
    nome: payload.nome,
    documento: payload.documento,
    telefone: payload.telefone
  });
  const r = await http(`${ENDPOINT}${id}`, { method: "PUT", body });
  if (!r.ok) throw new Error(await r.text());
}
async function apiUpdateAtivo(id, ativo) {
  const body = JSON.stringify({ ativo: !!ativo });
  const r = await http(`${ENDPOINT}${id}`, { method: "PUT", body });
  if (!r.ok) throw new Error(await r.text());
}
async function apiDelete(id) {
  const r = await http(`${ENDPOINT}${id}`, { method: "DELETE" });
  if (!r.ok) throw new Error(await r.text());
}

/* =============== Listagem + Paginação ========= */
function buildRow(e) {
  const id           = e.id_entregador || e.id || "";
  const ativoChecked = e.ativo ? "checked" : "";
  const baseBadge    = e.base ? `<span class="badge bg-primary-subtle text-primary">${e.base}</span>` : "-";

  return `
    <tr class="row-selectable" data-id="${id}">
      <td>${e.nome || "-"}</td>
      <td>${e.telefone || "-"}</td>
      <td>${e.documento || "-"}</td>
      <td>${baseBadge}</td>
      <td>
        <div class="form-check form-switch">
          <input class="form-check-input chk-ativo" type="checkbox" data-id="${id}" ${ativoChecked}>
        </div>
      </td>
      <td>
        <button class="btn btn-sm btn-soft-primary btn-edit" data-id="${id}">
          <i class="ri-edit-2-line"></i> Editar
        </button>
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

  // seleção de linha
  qsa("#tbody-entregadores tr.row-selectable").forEach(tr => {
    tr.addEventListener("click", (ev) => {
      if (ev.target.closest("button, .form-check-input")) return; // ignora clique em ações
      qsa("#tbody-entregadores tr.row-selectable").forEach(x => x.classList.remove("table-active"));
      tr.classList.add("table-active");
      SELECTED_ID = tr.dataset.id || null;
      setHeaderActionsState();
    });
  });

  // mudou de página → limpa seleção
  SELECTED_ID = null;
  setHeaderActionsState();
}

function updatePagination(pages) {
  const prev = qs("#pg-prev"), next = qs("#pg-next"), nums = qs("#pg-numbers");
  if (prev) prev.classList.toggle("disabled", CUR_PAGE === 1);
  if (next) next.classList.toggle("disabled", CUR_PAGE === pages || pages === 1);

  const MAX_BTNS = 7;
  let first = Math.max(1, CUR_PAGE - Math.floor(MAX_BTNS/2));
  let last  = Math.min(pages, first + MAX_BTNS - 1);
  first = Math.max(1, last - MAX_BTNS + 1);

  if (nums) {
    nums.innerHTML = "";
    for (let p = first; p <= last; p++) {
      const li = document.createElement("li");
      li.className = "page-item";
      li.innerHTML = `<a class="page-link ${p===CUR_PAGE?"active":""}" href="javascript:void(0);">${p}</a>`;
      li.querySelector("a").addEventListener("click", ()=>renderPage(p));
      nums.appendChild(li);
    }
  }
}

async function listarEntregadores() {
  qs("#tbody-entregadores").innerHTML = ""; qs("#empty").classList.add("d-none");
  try {
    const all = await apiList();

    const onlyActive = qs("#toggleAtivos")?.checked ?? true;
    const baseList   = onlyActive ? all.filter(e => e.ativo === true) : all;

    const term = (qs("#search")?.value || "").trim().toLowerCase();
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
  const form = qs("#formEntregador");
  form.reset();
  form.classList.remove("was-validated");

  qs("#entregadorId").value = data?.id_entregador || data?.id || "";
  qs("#nome").value         = data?.nome || "";
  qs("#telefone").value     = data?.telefone || "";
  qs("#documento").value    = data?.documento || "";

  // "Ativo" só no editar
  qs("#grp-ativo")?.classList.toggle("d-none", modo !== "edit");
  const ativoSwitch = qs("#ativo");
  if (ativoSwitch) ativoSwitch.checked = !!data?.ativo;

  qs("#ocLabel").textContent = (modo === "edit") ? "Editar Entregador" : "Novo Entregador";
  offcanvas.show();
}

function formPayload() {
  return {
    nome: qs("#nome").value.trim(),
    documento: qs("#documento").value.trim(),
    telefone: qs("#telefone").value.trim()
  };
}

/* =================== Init ===================== */
document.addEventListener("DOMContentLoaded", async () => {
  offcanvas = new bootstrap.Offcanvas("#oc-form");

  await ensureSession();           // opcional
  await listarEntregadores();

  // busca/toggle/paginação
  qs("#search")?.addEventListener("input", listarEntregadores);
  qs("#toggleAtivos")?.addEventListener("change", listarEntregadores);
  qs("#perPage")?.addEventListener("change", ()=>renderPage(1));
  qs("#pg-prev")?.addEventListener("click", ()=> renderPage(CUR_PAGE - 1));
  qs("#pg-next")?.addEventListener("click", ()=> renderPage(CUR_PAGE + 1));

  // header: adicionar
  qs("#btnAdd")?.addEventListener("click", () => openForm("create"));

  // header: editar selecionado
  qs("#btnHeaderEdit")?.addEventListener("click", async () => {
    if (!SELECTED_ID) return;
    try {
      const data = await apiGet(SELECTED_ID);
      openForm("edit", data);
    } catch {
      toast("Não foi possível abrir para edição.", "danger");
    }
  });

  // header: excluir selecionado (se usar exclusão)
  qs("#btnHeaderDel")?.addEventListener("click", () => {
    if (!SELECTED_ID) return;
    deletingId = SELECTED_ID;
    new bootstrap.Modal("#modalDelete").show();
  });

  // submit (criar/editar)
  qs("#formEntregador")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const form = ev.currentTarget;
    if (!form.checkValidity()) { form.classList.add("was-validated"); return; }

    const id = qs("#entregadorId").value;
    try {
      if (id) {
        await apiUpdate(id, formPayload());
        // aplicar ativo se visível no offcanvas
        if (!qs("#grp-ativo")?.classList.contains("d-none")) {
          await apiUpdateAtivo(id, qs("#ativo").checked);
        }
      } else {
        await apiCreate(formPayload()); // inclui ativo:true
      }
      toast("Salvo com sucesso.", "success");
      offcanvas.hide();
      await listarEntregadores();
    } catch (err) {
      console.error(err);
      toast("Erro ao salvar. Verifique os dados.", "danger");
    }
  });

  // Delegação: botão editar por linha
  qs("#tbody-entregadores")?.addEventListener("click", async (e) => {
    const btnEdit = e.target.closest(".btn-edit");
    if (btnEdit) {
      try {
        const data = await apiGet(btnEdit.dataset.id);
        openForm("edit", data);
      } catch {
        toast("Não foi possível abrir para edição.", "danger");
      }
    }
  });

  // Delegação: toggle ativo direto na tabela
  qs("#tbody-entregadores")?.addEventListener("change", async (e) => {
    const chk = e.target.closest(".chk-ativo");
    if (!chk) return;
    const id = chk.dataset.id;
    const ativo = chk.checked;

    try {
      await apiUpdateAtivo(id, ativo);
      toast(ativo ? "Entregador ativado." : "Entregador desativado.", "success");
      // se estiver em “Somente ativos” e desativou, recarrega
      if ((qs("#toggleAtivos")?.checked ?? true) && !ativo) await listarEntregadores();
    } catch (err) {
      console.error(err);
      toast("Falha ao atualizar ativo.", "danger");
      chk.checked = !ativo; // desfaz UI
    }
  });

  // Confirmação de exclusão
  qs("#btnConfirmDelete")?.addEventListener("click", async () => {
    try {
      await apiDelete(deletingId);
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
