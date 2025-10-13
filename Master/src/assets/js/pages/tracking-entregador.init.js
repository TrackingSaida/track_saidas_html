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
      <td class="text-center"><input type="checkbox" class="form-check-input" ${e.coletador ? "checked" : ""} disabled></td>
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

function normalizeNome(nomeRaw = "") {
  return nomeRaw
    .toLowerCase()                            // tudo minúsculo
    .split(/\s+/)                             // divide por espaços
    .filter(Boolean)                          // remove vazios
    .map(w => w.charAt(0).toUpperCase() + w.slice(1)) // capitaliza
    .join(" ");                               // junta de volta
}


function formPayload(){
  const payload = {
    nome:        normalizeNome(qs("#nome").value || ""),
    documento:   (qs("#documento").value || "").trim(),
    telefone:    (qs("#telefone").value || "").trim(),
    rua:         (qs("#rua").value || "").trim(),
    numero:      (qs("#numero").value || "").trim(),
    complemento: (qs("#complemento").value || "").trim(),
    cep:         (qs("#cep").value || "").trim(),
    cidade:      (qs("#cidade").value || "").trim(),
    bairro:      (qs("#bairro").value || "").trim(),
  };

  // === Coletador ===
  const chk = qs("#coletador");
  if (chk && chk.checked) {
    payload.coletador = true;
    payload.username_entregador = (qs("#username_entregador")?.value || "").trim();
    payload.senha = (qs("#senha_entregador")?.value || "").trim();
  }

  return payload;
}


/* =================== Init ===================== */
document.addEventListener("DOMContentLoaded", async () => {
  // Garante a autenticação antes de prosseguir com qualquer inicialização da página.
  if (typeof window.ensureAuth === 'function') {
    try { await window.ensureAuth(); } catch(_) {}
  }

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
  if (!form.checkValidity()) {
    form.classList.add("was-validated");
    return;
  }

  const id = safeId(qs("#entregadorId").value);
  const payload = formPayload();

  try {
    if (id) {
      // entregador já existente → PATCH (sempre)
      try {
        await apiUpdate(id, payload);
        toast("Entregador atualizado com sucesso.");
      } catch (err) {
        if (err?.status === 422) {
          toast("Erro de validação. Verifique os dados.", false);
        } else if (err?.status === 401) {
          toast("Sessão expirada. Faça login novamente.", false);
          return;
        } else if (err?.status === 409) {
          toast("Conflito: já existe um entregador com esse documento nesta sub-base.", false);
        } else {
          toast("Erro ao atualizar entregador.", false);
        }
      }

      if (!qs("#grp-ativo").classList.contains("d-none")) {
        await apiUpdateAtivo(id, qs("#ativo").checked);
      }

    } else {
      // novo entregador → POST
      try {
        await apiCreate(payload);
        toast("Entregador criado com sucesso.");
      } catch (err) {
        if (err?.status === 422) {
          toast("Erro de validação. Verifique os dados.", false);
        } else if (err?.status === 401) {
          toast("Sessão expirada. Faça login novamente.", false);
          return;
        } else if (err?.status === 409) {
          toast("Conflito: já existe um entregador com esse documento nesta sub-base.", false);
        } else {
          toast("Erro ao criar entregador.", false);
        }
      }
    }

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

// Máscara + Validação + Normalização

(function () {
  'use strict';

  /* ================= Helpers ================= */
  const qs = (s) => document.querySelector(s);
  const onlyDigits = (s) => (s || '').replace(/\D/g, '');
  const normalizeRG = (v) => (v || '').replace(/[^0-9xX]/g, '').toUpperCase();

  /* ========== Telefone: máscara + validação ========== */
  function formatPhone(v) {
    const d = onlyDigits(v).slice(0, 11);
    if (d.length <= 2) return `(${d}`;
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`; // 11 dígitos
  }
  function isPhoneValid(v) {
    const d = onlyDigits(v);
    return d.length === 10 || d.length === 11;
  }

  /* ========== CPF: máscara + validação (DV) ========== */
  function formatCPF(v) {
    const d = onlyDigits(v).slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
    if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }
  function isValidCPF(v) {
    const s = onlyDigits(v);
    if (s.length !== 11) return false;
    if (/^(\d)\1{10}$/.test(s)) return false; // todos iguais
    const calcDV = (base) => {
      let sum = 0;
      for (let i = 0; i < base.length; i++) sum += parseInt(base[i], 10) * (base.length + 1 - i);
      const r = sum % 11;
      return r < 2 ? 0 : 11 - r;
    };
    const dv1 = calcDV(s.slice(0, 9));
    const dv2 = calcDV(s.slice(0, 9) + dv1);
    return dv1 === +s[9] && dv2 === +s[10];
  }

  /* ========== RG: máscara (heurística) + validação leve ========== */
  function formatRG(v) {
    const s = normalizeRG(v).slice(0, 10); // comum 7–10
    if (s.length <= 2) return s;
    if (s.length <= 5) return `${s.slice(0, 2)}.${s.slice(2)}`;
    if (s.length <= 8) return `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5)}`;
    return `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5, 8)}-${s.slice(8)}`;
  }
  function isValidRG(v) {
    const s = normalizeRG(v);
    if (s.length < 7 || s.length > 10) return false;
    return /^\d{6,9}[0-9X]$/.test(s);
  }

  /* ========== Documento: auto detecta CPF (11 díg.) ou RG ========== */
  function formatDocumento(v) {
    const d = onlyDigits(v);
    if (d.length === 11) return formatCPF(v);
    return formatRG(v);
  }
  function validateDocumento(v) {
    const d = onlyDigits(v);
    if (d.length === 11) return isValidCPF(v) ? '' : 'CPF inválido.';
    return isValidRG(v) ? '' : 'RG inválido. Use 7–10 dígitos (DV pode ser X).';
  }

  /* ========== Anexa máscaras e validações (UX) ========== */
  function attachMasks() {
    const tel = qs('#telefone');
    const doc = qs('#documento');

    if (tel) {
      tel.addEventListener('input', () => {
        const cur = tel.selectionStart;
        tel.value = formatPhone(tel.value);
        tel.setCustomValidity(isPhoneValid(tel.value) ? '' : 'Telefone inválido (inclua DDD).');
      });
      tel.addEventListener('blur', () => {
        tel.setCustomValidity(isPhoneValid(tel.value) ? '' : 'Telefone inválido (inclua DDD).');
        if (!tel.checkValidity()) tel.reportValidity(); // hint nativo
      });
    }

    if (doc) {
      doc.addEventListener('input', () => {
        const before = doc.value;
        doc.value = formatDocumento(doc.value);
        const msg = validateDocumento(doc.value);
        doc.setCustomValidity(msg);
      });
      doc.addEventListener('blur', () => {
        const msg = validateDocumento(doc.value);
        doc.setCustomValidity(msg);
        if (msg) doc.reportValidity(); // mostra tooltip nativa em vermelho
      });
    }
  }

  
  /* ========== Normalização no payload (sem quebrar o arquivo) ========== */
  // Se já existe formPayload(), envolvemos para ajustar telefone/documento.
  const originalFormPayload = window.formPayload;
  window.formPayload = function () {
    const base = typeof originalFormPayload === 'function' ? originalFormPayload() : {};
    const telV = qs('#telefone') ? qs('#telefone').value : '';
    const docV = qs('#documento') ? qs('#documento').value : '';

    // telefone: envie só dígitos (ajuste aqui se seu back preferir formatado)
    const telOut = onlyDigits(telV);

    // documento: CPF => só dígitos; RG => mantém DV X
    const docDigits = onlyDigits(docV);
    const docOut = docDigits.length === 11 ? docDigits : normalizeRG(docV);

    return { ...base, telefone: telOut, documento: docOut };
  };

  /* ========== Gate de validade no submit (não interfere no seu handler) ========== */
  document.addEventListener('DOMContentLoaded', () => {
    attachMasks();

    const form = qs('#formEntregador');
    if (!form) return;

    // Antes do submit real do seu handler, barramos se inválido
    form.addEventListener(
      'submit',
      (ev) => {
        const tel = qs('#telefone');
        const doc = qs('#documento');
        let ok = true;

        if (tel) {
          tel.setCustomValidity(isPhoneValid(tel.value) ? '' : 'Telefone inválido (inclua DDD).');
          if (!tel.checkValidity()) {
            tel.reportValidity();
            ok = false;
          }
        }
        if (doc) {
          const msg = validateDocumento(doc.value);
          doc.setCustomValidity(msg);
          if (msg) {
            doc.reportValidity();
            ok = false;
          }
        }
        if (!ok) {
          ev.stopImmediatePropagation(); // impede outros listeners de prosseguirem
          ev.preventDefault();
        }
      },
      true // capture: roda antes do submit da sua página
    );
  });
})();

// Ajusta dinamicamente a altura útil do body do offcanvas
(function () {
  const oc = document.getElementById('oc-form');
  if (!oc) return;

  function fitOffcanvas() {
    const head = oc.querySelector('.offcanvas-header');
    const body = oc.querySelector('.offcanvas-body');
    const foot = oc.querySelector('.offcanvas-footer');
    if (!head || !body || !foot) return;

    // Altura disponível = viewport - header - footer
    const avail = window.innerHeight - head.offsetHeight - foot.offsetHeight;
    body.style.maxHeight = Math.max(160, avail) + 'px';
    body.style.overflowY = 'auto';
  }

  oc.addEventListener('shown.bs.offcanvas', fitOffcanvas);
  window.addEventListener('resize', () => {
    if (oc.classList.contains('show')) fitOffcanvas();
  });
  window.addEventListener('orientationchange', () => {
    if (oc.classList.contains('show')) setTimeout(fitOffcanvas, 150);
  });
})();



// === COLETADOR: Mostrar/Ocultar campos extras ===
const chkColetador = document.getElementById("coletador");
const grpColetadorExtra = document.getElementById("grp-coletador-extra");
if (chkColetador && grpColetadorExtra) {
  chkColetador.addEventListener("change", () => {
    if (chkColetador.checked) {
      grpColetadorExtra.classList.remove("d-none");
    } else {
      grpColetadorExtra.classList.add("d-none");
      const u = document.getElementById("username_entregador");
      const s = document.getElementById("senha_entregador");
      if (u) u.value = "";
      if (s) s.value = "";
    }
  });
}

// === Alternar visibilidade da senha (Coletador) ===
document.querySelectorAll('[data-toggle="ver-senha"]').forEach(btn => {
  btn.addEventListener("click", () => {
    const input = btn.closest(".position-relative").querySelector(".senha-input");
    if (!input) return;
    const isPassword = input.getAttribute("type") === "password";
    input.setAttribute("type", isPassword ? "text" : "password");
    btn.querySelector("i").classList.toggle("ri-eye-fill", !isPassword);
    btn.querySelector("i").classList.toggle("ri-eye-off-fill", isPassword);
  });
});
