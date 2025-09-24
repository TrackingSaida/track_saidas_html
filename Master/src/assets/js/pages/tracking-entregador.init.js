/* =================== Config =================== */
const API_URL          = "https://track-saidas-api.onrender.com/api";
const API_ENTREGADORES = `${API_URL}/entregadores/`;

/* =============== Helpers / UI ================= */
const qs  = (s) => document.querySelector(s);
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
  const t = new bootstrap.Toast(el, { delay: 2200 }); t.show();
  setTimeout(()=>el.remove(), 2600);
};

function safeId(raw) {
  if (raw === null || raw === undefined) return "";
  const s = String(raw).trim();
  return (s === "" || s === "null" || s === "undefined") ? "" : s;
}

async function http(url, options = {}) {
  const opts = { credentials: "include", headers: { "Content-Type": "application/json" }, ...options };
  return fetch(url, opts);
}

// CEP utils
function onlyDigits(s){ return (s||"").replace(/\D/g,""); }
function setAddrLoading(on){
  ["rua","bairro","cidade"].forEach(id=>{
    const el = qs("#"+id); if (!el) return;
    el.toggleAttribute("readonly", on);
    el.classList.toggle("bg-light", on);
  });
  // número sempre editável
  qs("#numero")?.removeAttribute("readonly");
}
function fillAddressFromViaCep(data){
  if (!data || data.erro) throw new Error("CEP não encontrado");
  if (qs("#rua"))    qs("#rua").value    = data.logradouro || "";
  if (qs("#bairro")) qs("#bairro").value = data.bairro     || "";
  if (qs("#cidade")) qs("#cidade").value = data.localidade || "";
}
async function lookupCep(cepRaw){
  const cep = onlyDigits(cepRaw);
  if (cep.length !== 8) throw new Error("CEP inválido");
  const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
  if (!r.ok) throw new Error("Falha ao consultar CEP");
  return r.json();
}
function lockAddress(on){
  qsa("[data-autolock]").forEach(el=>{
    el.toggleAttribute("readonly", on);
    el.classList.toggle("bg-light", on);
  });
  qs("#numero")?.removeAttribute("readonly");
}

/* =============== Estado ============= */
let DATA_CACHE  = [];
let CUR_PAGE    = 1;
let offcanvas   = null;
let deletingId  = null;
let SELECTED_ID = null;

/* =============== API ================= */
async function apiList(status) {
  const url = new URL(API_ENTREGADORES);
  if (status) url.searchParams.set("status", status);
  const r = await http(url.toString());
  if (!r.ok) throw new Error(`Falha ao listar (${r.status})`);
  return r.json();
}
async function apiGet(id){
  const clean = safeId(id);
  if (!clean) throw new Error("ID inválido");
  const r = await http(`${API_ENTREGADORES}${encodeURIComponent(clean)}`);
  if (!r.ok) throw new Error(`Falha ao carregar (${r.status})`);
  return r.json();
}
async function apiCreate(payload){
  const r = await http(API_ENTREGADORES, { method: "POST", body: JSON.stringify(payload) });
  if (!r.ok) throw new Error(await r.text());
}
async function apiUpdate(id, payload){
  const r = await http(`${API_ENTREGADORES}${encodeURIComponent(safeId(id))}`, {
    method: "PATCH", body: JSON.stringify(payload)
  });
  if (!r.ok) throw new Error(await r.text());
}
async function apiUpdateAtivo(id, ativo){
  const r = await http(`${API_ENTREGADORES}${encodeURIComponent(safeId(id))}`, {
    method: "PATCH", body: JSON.stringify({ ativo: !!ativo })
  });
  if (!r.ok) throw new Error(await r.text());
}
async function apiDelete(id){
  const r = await http(`${API_ENTREGADORES}${encodeURIComponent(safeId(id))}`, { method: "DELETE" });
  if (!r.ok) throw new Error(await r.text());
}

/* =============== Listagem/Paginação =========== */
function buildRow(e){
  const id = safeId(e.id_entregador ?? e.id);
  const ativoChecked = e.ativo ? "checked" : "";
  const radioAttrs = id ? `value="${id}"` : `value="" disabled`;
  return `
    <tr class="row-selectable ${id ? "" : "row-disabled"}" data-id="${id}">
      <td class="text-center">
        <input class="form-check-input sel-row" type="radio" name="sel-entregador" ${radioAttrs}>
      </td>
      <td>${e.nome || "-"}</td>
      <td>${e.telefone || "-"}</td>
      <td>${e.documento || "-"}</td>
      <td class="text-center"><input type="checkbox" class="form-check-input" ${ativoChecked} disabled></td>
    </tr>`;
}

function setHeaderActionsState(){
  const can = !!safeId(SELECTED_ID);
  qs("#btnHeaderEdit") && (qs("#btnHeaderEdit").disabled = !can);
  qs("#btnHeaderDel")  && (qs("#btnHeaderDel").disabled  = !can);
}

function updatePagination(){ /* simples: só prev/next baseados no slice render */
  // opcional manter contador de páginas; para simplicidade ficam só os botões
}

function renderPage(page=1){
  const perPage = parseInt(qs("#perPage")?.value || "10", 10);
  const total   = DATA_CACHE.length;
  const pages   = Math.max(1, Math.ceil(total / perPage));
  CUR_PAGE = Math.min(Math.max(1, page), pages);

  const start = (CUR_PAGE - 1) * perPage;
  const slice = DATA_CACHE.slice(start, start + perPage);

  const tbody = qs("#tbody-entregadores");
  if (tbody) tbody.innerHTML = slice.map(buildRow).join("");
  qs("#empty")?.classList.toggle("d-none", total !== 0);

  SELECTED_ID = null;
  setHeaderActionsState();
  showEnderecoEmpty();
  updatePagination();
}

async function listarEntregadores(){
  const tbody = qs("#tbody-entregadores");
  if (tbody) tbody.innerHTML = "";
  qs("#empty")?.classList.add("d-none");
  try{
    const status = (qs("#toggleAtivos")?.checked ?? true) ? "ativo" : "todos";
    const data   = await apiList(status);

    const term = (qs("#search")?.value || "").trim().toLowerCase();
    DATA_CACHE = data.filter(e =>
      [e.nome, e.telefone, e.documento]
        .filter(Boolean)
        .some(v => String(v).toLowerCase().includes(term))
    );
    renderPage(1);
  }catch(e){
    console.error(e);
    qs("#empty")?.classList.remove("d-none");
    toast("Falha ao carregar entregadores.", false);
  }
}

/* =============== Detail Endereço ============== */
function showEnderecoEmpty(){
  const wrap = qs("#endereco-detail"); if (!wrap) return;
  wrap.classList.remove("d-none");
  qs("#endereco-empty")?.classList.remove("d-none");
  qs("#endereco-content")?.classList.add("d-none");
  const nm = qs("#endereco-detail-nome"); if (nm) nm.textContent = "";
}
function renderEnderecoDetail(ent){
  const wrap = qs("#endereco-detail"); if (!wrap) return;
  const nm = qs("#endereco-detail-nome");
  if (nm) nm.textContent = ent?.nome ? `(${ent.nome})` : "";

  const assign = (id, v) => qs(id)?.replaceChildren(document.createTextNode(v || "—"));
  assign("#d-rua", ent?.rua);
  assign("#d-numero", ent?.numero);
  assign("#d-complemento", ent?.complemento);
  assign("#d-bairro", ent?.bairro);
  assign("#d-cidade", ent?.cidade);
  assign("#d-cep", ent?.cep);

  wrap.classList.remove("d-none");
  qs("#endereco-empty")?.classList.add("d-none");
  qs("#endereco-content")?.classList.remove("d-none");
}
async function loadEnderecoById(id){
  try{
    const data = await apiGet(id);
    renderEnderecoDetail(data);
  }catch(e){
    showEnderecoEmpty();
  }
}

/* =============== Formulário =================== */
function openForm(modo, data=null){
  const form = qs("#formEntregador");
  if (!form) return;
  form.reset();
  form.classList.remove("was-validated");

  qs("#entregadorId").value = safeId(data?.id_entregador ?? data?.id) || "";
  qs("#nome").value        = data?.nome || "";
  qs("#telefone").value    = data?.telefone || "";
  qs("#documento").value   = data?.documento || "";

  qs("#rua").value         = data?.rua || "";
  qs("#numero").value      = data?.numero || "";
  qs("#complemento").value = data?.complemento || "";
  qs("#cep").value         = data?.cep || "";
  qs("#cidade").value      = data?.cidade || "";
  qs("#bairro").value      = data?.bairro || "";

  qs("#grp-ativo")?.classList.toggle("d-none", modo !== "edit");
  if (qs("#ativo")) qs("#ativo").checked = !!data?.ativo;

  // CEP-first
  if (modo === "edit") { lockAddress(false); }
  else { lockAddress(true); setTimeout(()=>qs("#cep")?.focus(), 50); }

  if (qs("#ocLabel")) qs("#ocLabel").textContent = (modo === "edit") ? "Editar Entregador" : "Novo Entregador";
  offcanvas?.show();
}

function formPayload(){
  return {
    nome:       (qs("#nome").value || "").trim(),
    documento:  (qs("#documento").value || "").trim(),
    telefone:   (qs("#telefone").value || "").trim(),

    rua:         (qs("#rua").value || "").trim(),
    numero:      (qs("#numero").value || "").trim(),
    complemento: (qs("#complemento").value || "").trim(),
    cep:         (qs("#cep").value || "").trim(),
    cidade:      (qs("#cidade").value || "").trim(),
    bairro:      (qs("#bairro").value || "").trim(),
  };
}

/* =================== Init ===================== */
document.addEventListener("DOMContentLoaded", async () => {
  const oc = qs("#oc-form"); if (oc) offcanvas = new bootstrap.Offcanvas(oc);

  await listarEntregadores();

  // filtros
  qs("#search")?.addEventListener("input", listarEntregadores);
  qs("#toggleAtivos")?.addEventListener("change", listarEntregadores);
  qs("#perPage")?.addEventListener("change", () => renderPage(1));
  qs("#pg-prev")?.addEventListener("click", () => renderPage(CUR_PAGE - 1));
  qs("#pg-next")?.addEventListener("click", () => renderPage(CUR_PAGE + 1));

  // seleção na tabela
  const tbody = qs("#tbody-entregadores");
  tbody?.addEventListener("click", (e) => {
    const tr = e.target.closest("tr.row-selectable"); if (!tr || !tbody.contains(tr)) return;
    const id = safeId(tr.dataset.id); if (!id) return;

    const radio = tr.querySelector(".sel-row"); if (radio && !radio.disabled) radio.checked = true;
    qsa("#tbody-entregadores tr.row-selectable").forEach(x=>x.classList.remove("table-active"));
    tr.classList.add("table-active");
    SELECTED_ID = id; setHeaderActionsState();
    loadEnderecoById(SELECTED_ID);
  });

  tbody?.addEventListener("dblclick", async (e) => {
    const tr = e.target.closest("tr.row-selectable"); if (!tr || !tbody.contains(tr)) return;
    const id = safeId(tr.dataset.id); if (!id) return;
    SELECTED_ID = id; setHeaderActionsState(); loadEnderecoById(SELECTED_ID);
    try { const data = await apiGet(SELECTED_ID); openForm("edit", data); }
    catch { toast("Não foi possível abrir para edição.", false); }
  });

  // header actions
  qs("#btnAdd")?.addEventListener("click", () => openForm("create"));
  qs("#btnHeaderEdit")?.addEventListener("click", async () => {
    const id = safeId(SELECTED_ID); if (!id) return;
    try { const data = await apiGet(id); openForm("edit", data); }
    catch { toast("Não foi possível abrir para edição.", false); }
  });
  qs("#btnHeaderDel")?.addEventListener("click", () => {
    const id = safeId(SELECTED_ID); if (!id) return;
    deletingId = id; const m = qs("#modalDelete"); m && new bootstrap.Modal(m).show();
  });

  // submit
  qs("#formEntregador")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const form = ev.currentTarget;
    if (!form.checkValidity()){ form.classList.add("was-validated"); return; }

    const id = safeId(qs("#entregadorId").value);
    const payload = formPayload();
    try {
      if (id) {
        await apiUpdate(id, payload);
        if (!qs("#grp-ativo").classList.contains("d-none")) {
          await apiUpdateAtivo(id, qs("#ativo").checked);
        }
      } else {
        await apiCreate(payload);
      }
      toast("Salvo com sucesso.");
      offcanvas?.hide();
      await listarEntregadores();
    } catch (err) {
      console.error(err);
      toast("Erro ao salvar. Verifique os dados.", false);
    }
  });

  // excluir
  qs("#btnConfirmDelete")?.addEventListener("click", async () => {
    try {
      await apiDelete(deletingId);
      bootstrap.Modal.getInstance(qs("#modalDelete"))?.hide();
      toast("Excluído.");
      await listarEntregadores();
    } catch (err) {
      console.error(err);
      toast("Falha ao excluir.", false);
    } finally { deletingId = null; }
  });

  /* CEP: máscara + auto lookup + botões */
  const cepInput = qs("#cep");
  cepInput?.addEventListener("input", () => {
    let v = onlyDigits(cepInput.value).slice(0,8);
    if (v.length > 5) v = `${v.slice(0,5)}-${v.slice(5)}`;
    cepInput.value = v;
  });
  cepInput?.addEventListener("blur", async () => {
    const cep = onlyDigits(cepInput.value); if (cep.length !== 8) return;
    try { setAddrLoading(true); const data = await lookupCep(cep); fillAddressFromViaCep(data); lockAddress(false); qs("#numero")?.focus(); }
    catch(e){ toast(e.message || "Não foi possível buscar o CEP.", false); }
    finally { setAddrLoading(false); }
  });
  cepInput?.addEventListener("keyup", () => {
    const cep = onlyDigits(cepInput.value); if (cep.length === 8) cepInput.dispatchEvent(new Event("blur"));
  });
  qs("#btnCepBuscar")?.addEventListener("click", async () => {
    const cep = onlyDigits(qs("#cep")?.value || "");
    if (cep.length !== 8){ toast("Informe um CEP válido com 8 dígitos.", false); return; }
    try { setAddrLoading(true); const data = await lookupCep(cep); fillAddressFromViaCep(data); lockAddress(false); qs("#numero")?.focus(); }
    catch(e){ toast(e.message || "Não foi possível buscar o CEP.", false); }
    finally { setAddrLoading(false); }
  });
  qs("#btnEnderecoManual")?.addEventListener("click", () => { lockAddress(false); qs("#rua")?.focus(); });
});
