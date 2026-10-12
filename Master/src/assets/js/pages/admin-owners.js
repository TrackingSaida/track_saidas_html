const API = `${window.getTrackApiUrl()}/owner`;

// ---------------------------------------------------------------------
// MÁSCARA CELULAR — (99) 99999-9999
// ---------------------------------------------------------------------
function maskCellphone(value) {
    value = value.replace(/\D/g, "");
    if (value.length > 11) value = value.substring(0, 11);

    if (value.length >= 7) {
        return value.replace(/^(\d{2})(\d{5})(\d{0,4}).*/, "($1) $2-$3");
    }
    if (value.length >= 3) {
        return value.replace(/^(\d{2})(\d{0,5}).*/, "($1) $2");
    }
    if (value.length >= 1) {
        return value.replace(/^(\d{0,2}).*/, "($1");
    }
    return value;
}

// ---------------------------------------------------------------------
// GERAR LINK WHATSAPP (valida antes)
// ---------------------------------------------------------------------
function gerarLinkWhatsapp(contatoRaw) {
    if (!contatoRaw) return null;

    let numero = contatoRaw.toString().replace(/\D/g, "");

    // CELULAR TEM QUE TER 11 DÍGITOS
    if (numero.length !== 11) return null;

    return `https://wa.me/55${numero}`;
}

// ---------------------------------------------------------------------
// CEP / CNPJ-CPF
// ---------------------------------------------------------------------
const onlyDigits = (s) => (s || "").toString().replace(/\D/g, "");

function escapeHtml(s) {
    return String(s == null ? "" : s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function maskCep(value) {
    const d = onlyDigits(value).slice(0, 8);
    return d.length > 5 ? d.replace(/(\d{5})(\d{0,3})/, "$1-$2") : d;
}

function maskDocumento(value) {
    const d = onlyDigits(value).slice(0, 14);
    if (d.length <= 11) {
        return d
            .replace(/^(\d{3})(\d)/, "$1.$2")
            .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
            .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
    }
    return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2}).*/, "$1.$2.$3/$4-$5");
}

async function lookupCep(cepRaw) {
    const cep = onlyDigits(cepRaw);
    if (cep.length !== 8) throw new Error("CEP inválido");
    const r = await fetch(`${window.getTrackApiUrl()}/cep/${cep}`, { credentials: "include" });
    if (r.ok) return r.json();
    if (r.status >= 500) {
        const direct = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        if (direct.ok) {
            const data = await direct.json();
            if (data && !data.erro) return data;
        }
    }
    const err = await r.json().catch(() => ({}));
    throw new Error(err.detail || "CEP não encontrado");
}

const SELLER_CAMPOS = {
    cnpj: "ownerCnpj",
    cep: "ownerCep",
    rua: "ownerRua",
    numero: "ownerNumero",
    complemento: "ownerComplemento",
    bairro: "ownerBairro",
    cidade: "ownerCidade",
    estado: "ownerEstado",
};
const SELLER_OBRIGATORIOS_BASE = ["cnpj", "cep", "rua", "numero", "bairro", "cidade"];
let SELLER_ORIGINAL = {};
let OWNER_EDIT_SEQ = 0;


// -------------------------------------------------------------------------
// SOMENTE ADMIN
// -------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
    const me = await fetch(`${window.getTrackApiUrl()}/auth/me`, {
        credentials: "include"
    }).then(r => r.ok ? r.json() : null);

    if (!me || Number(me.role) !== 0) {
        Swal.fire({
            icon: "error",
            title: "Acesso negado",
            text: "Esta área é restrita a administradores."
        }).then(() => {
            window.location.href = "dashboard-saidas.html";
        });
        return;
    }

    initOwners();
});


// -------------------------------------------------------------------------
// ESTADO GLOBAL
// -------------------------------------------------------------------------
let ALL_OWNERS = [];
let FILTERED = [];
let CURRENT_PAGE = 1;
let PER_PAGE = 10;


// -------------------------------------------------------------------------
// INICIALIZAR TELA (setup idêntico ao módulo Entregadores)
// -------------------------------------------------------------------------
function initOwners() {
    document.getElementById("perPage").addEventListener("change", () => {
        PER_PAGE = Number(perPage.value);
        CURRENT_PAGE = 1;
        renderTable();
    });

    document.getElementById("search").addEventListener("input", () => {
        applyFilters();
    });

    document.getElementById("toggleAtivos").addEventListener("change", () => {
        applyFilters();
    });

    document.getElementById("btnHeaderEdit").addEventListener("click", openEditFromSelection);

    document.getElementById("pg-prev").addEventListener("click", () => changePage(-1));
    document.getElementById("pg-next").addEventListener("click", () => changePage(1));

    document.getElementById("ownerContato").addEventListener("input", (ev) => {
        ev.target.value = maskCellphone(ev.target.value);
    });

    document.getElementById("ownerColetaHabilitadaToggle").addEventListener("change", syncModoOperacaoSelect);
    document.getElementById("ownerTipo").addEventListener("change", syncTipoOwner);
    bindEnderecoOwner();
    bindNavOwner();

    loadOwners().then(() => {
        const editar = new URLSearchParams(window.location.search).get("editar");
        const alvo = editar && ALL_OWNERS.find(x => String(x.id_owner) === String(editar));
        if (alvo) openEdit(alvo);
    });
}

function bindEnderecoOwner() {
    const cepEl = document.getElementById("ownerCep");
    const status = document.getElementById("ownerCepStatus");
    const docEl = document.getElementById("ownerCnpj");
    docEl.addEventListener("input", (ev) => { ev.target.value = maskDocumento(ev.target.value); });
    document.getElementById("ownerEstado").addEventListener("input", (ev) => {
        ev.target.value = ev.target.value.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 2);
    });

    let ultimoCep = "";
    async function buscar() {
        const raw = onlyDigits(cepEl.value);
        if (raw.length !== 8 || raw === ultimoCep) return;
        ultimoCep = raw;
        status.innerHTML = '<span class="spinner-border spinner-border-sm" aria-hidden="true"></span><span class="visually-hidden">Buscando CEP</span>';
        try {
            const data = await lookupCep(raw);
            document.getElementById("ownerRua").value = data.logradouro || document.getElementById("ownerRua").value;
            document.getElementById("ownerBairro").value = data.bairro || document.getElementById("ownerBairro").value;
            document.getElementById("ownerCidade").value = data.localidade || document.getElementById("ownerCidade").value;
            document.getElementById("ownerEstado").value = (data.uf || document.getElementById("ownerEstado").value || "").toUpperCase();
            status.innerHTML = '<i class="ri-check-line text-success" aria-hidden="true"></i><span class="visually-hidden">Endereço preenchido</span>';
            document.getElementById("ownerNumero").focus();
        } catch (_) {
            status.innerHTML = '<i class="ri-error-warning-line text-warning" aria-hidden="true"></i><span class="visually-hidden">CEP não encontrado</span>';
            setFooterNote("CEP não encontrado. Preencha o endereço manualmente.");
        }
    }
    cepEl.addEventListener("input", (ev) => {
        ev.target.value = maskCep(ev.target.value);
        if (onlyDigits(ev.target.value).length !== 8) { status.innerHTML = ""; ultimoCep = ""; }
        else buscar();
    });
    cepEl.addEventListener("blur", buscar);
}

function bindNavOwner() {
    const nav = document.querySelector("#oc-owner .of-nav");
    const scroller = document.querySelector("#oc-owner .modal-body");
    if (!nav || !scroller) return;
    const links = [...nav.querySelectorAll("a")];
    nav.addEventListener("click", (ev) => {
        const a = ev.target.closest("a[href^='#']");
        if (!a) return;
        ev.preventDefault();
        const alvo = document.querySelector(a.getAttribute("href"));
        if (alvo) alvo.scrollIntoView({ block: "start" });
    });
    scroller.addEventListener("scroll", () => {
        const topo = scroller.getBoundingClientRect().top;
        let atual = links[0];
        links.forEach((a) => {
            const sec = document.querySelector(a.getAttribute("href"));
            if (sec && sec.getBoundingClientRect().top - topo <= 80) atual = a;
        });
        links.forEach((a) => a.classList.toggle("active", a === atual));
    }, { passive: true });
}

function setFooterNote(msg) {
    const el = document.getElementById("ownerFooterNote");
    if (el) el.textContent = msg || "";
}

function isOwnerBase() {
    return (document.getElementById("ownerTipo").value || "subbase") === "base";
}

function syncTipoOwner() {
    const base = isOwnerBase();
    document.querySelectorAll("#oc-owner .of-req-base").forEach((el) => el.classList.toggle("d-none", !base));
    document.getElementById("ownerEnderecoHelp").textContent = base
        ? "Base (Seller) exige CNPJ e endereço completo. Usados no demonstrativo de cobrança e na mensagem ao Owner."
        : "Opcionais para Subbase. Usados no demonstrativo de cobrança e na mensagem ao Owner; campo vazio sai em branco.";
}

function lerSeller() {
    const out = {};
    Object.keys(SELLER_CAMPOS).forEach((k) => {
        out[k] = (document.getElementById(SELLER_CAMPOS[k]).value || "").trim();
    });
    out.cnpj = onlyDigits(out.cnpj);
    out.cep = onlyDigits(out.cep);
    out.estado = out.estado.toUpperCase();
    return out;
}

function preencherSeller(s) {
    s = s || {};
    document.getElementById("ownerCnpj").value = s.cnpj ? maskDocumento(s.cnpj) : "";
    document.getElementById("ownerCep").value = s.cep ? maskCep(s.cep) : "";
    ["rua", "numero", "complemento", "bairro", "cidade", "estado"].forEach((k) => {
        document.getElementById(SELLER_CAMPOS[k]).value = s[k] || "";
    });
    document.getElementById("ownerCepStatus").innerHTML = "";
    SELLER_ORIGINAL = lerSeller();
}

function validarOwnerForm() {
    const form = document.getElementById("formOwner");
    form.querySelectorAll(".is-invalid").forEach((el) => el.classList.remove("is-invalid"));
    const invalidos = [];
    const marcar = (id) => { const el = document.getElementById(id); el.classList.add("is-invalid"); invalidos.push(el); };

    if (!document.getElementById("ownerUsername").value.trim()) marcar("ownerUsername");
    const email = document.getElementById("ownerEmail");
    if (!email.value.trim() || !email.checkValidity()) marcar("ownerEmail");
    const valor = document.getElementById("ownerValor").value;
    if (valor === "" || Number(valor) < 0) marcar("ownerValor");

    const s = lerSeller();
    if (s.cnpj && s.cnpj.length !== 11 && s.cnpj.length !== 14) marcar("ownerCnpj");
    if (s.cep && s.cep.length !== 8) marcar("ownerCep");
    if (isOwnerBase()) {
        SELLER_OBRIGATORIOS_BASE.forEach((k) => {
            if (!s[k] && invalidos.indexOf(document.getElementById(SELLER_CAMPOS[k])) < 0) marcar(SELLER_CAMPOS[k]);
        });
    }
    if (invalidos.length) {
        invalidos[0].scrollIntoView({ block: "center" });
        invalidos[0].focus({ preventScroll: true });
        setFooterNote(invalidos.length === 1 ? "Corrija o campo destacado." : `Corrija os ${invalidos.length} campos destacados.`);
        return false;
    }
    return true;
}

async function carregarCobrancaOwner(idOwner, seq) {
    const preco = document.getElementById("ownerPrecoVigente");
    const modelo = document.getElementById("ownerModeloCobranca");
    preco.textContent = "—";
    modelo.textContent = "";
    document.getElementById("ownerLinkCobranca").href =
        `tracking-cobranca-owner-detalhe.html?owner_id=${encodeURIComponent(idOwner)}`;
    try {
        const r = await fetch(`${window.getTrackApiUrl()}/admin/cobranca-owners/owners/${idOwner}/configuracao`, { credentials: "include" });
        if (!r.ok || seq !== OWNER_EDIT_SEQ) return;
        const c = await r.json();
        if (seq !== OWNER_EDIT_SEQ) return;
        if (c.preco_vigente !== null && c.preco_vigente !== undefined) {
            const n = Number(c.preco_vigente);
            preco.textContent = n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 4 });
        } else {
            preco.textContent = "Sem preço cadastrado";
        }
        const cfg = c.config || {};
        modelo.textContent = `${cfg.modelo_label || ""}${cfg.confirmado ? "" : " (a confirmar)"} · ${cfg.periodicidade === "mensal" ? "Mensal" : "Quinzenal"}`;
    } catch (_) {
        /* resumo opcional */
    }
}

async function carregarSellerOwner(idOwner, seq) {
    preencherSeller({});
    try {
        const r = await fetch(`${API}/${idOwner}/seller-dados`, { credentials: "include" });
        if (seq !== OWNER_EDIT_SEQ) return;
        if (r.ok) preencherSeller(await r.json());
        else if (r.status !== 404) setFooterNote("Não foi possível carregar o endereço do cadastro.");
    } catch (_) {
        if (seq === OWNER_EDIT_SEQ) setFooterNote("Não foi possível carregar o endereço do cadastro.");
    }
}


// -------------------------------------------------------------------------
// CARREGAR LISTA DO BACKEND
// -------------------------------------------------------------------------
async function loadOwners() {
    const tbody = document.getElementById("tbody-owners");
    tbody.innerHTML = `
        <tr><td colspan="12" class="text-center py-4 text-muted">Carregando...</td></tr>
    `;

    try {
        const resp = await fetch(API, { credentials: "include" });
        if (!resp.ok) throw new Error("Erro ao carregar");

        ALL_OWNERS = await resp.json();
        applyFilters();
        document.getElementById("btnHeaderEdit").disabled = true;

    } catch (err) {
        tbody.innerHTML = `
            <tr><td colspan="12" class="text-center text-danger py-4">Erro ao carregar owners.</td></tr>
        `;
    }
}


// -------------------------------------------------------------------------
// FILTRAR (ativos + busca)
// -------------------------------------------------------------------------
function applyFilters() {
    const onlyActive = document.getElementById("toggleAtivos").checked;
    const q = document.getElementById("search").value.trim().toLowerCase();

    FILTERED = ALL_OWNERS.filter(o => {
        if (onlyActive && !o.ativo) return false;

        return (
            o.username.toLowerCase().includes(q) ||
            o.sub_base.toLowerCase().includes(q) ||
            (o.email || "").toLowerCase().includes(q)
        );
    });

    CURRENT_PAGE = 1;
    renderTable();
}



// -------------------------------------------------------------------------
// PAGINAÇÃO + RENDERIZAÇÃO DA TABELA
// -------------------------------------------------------------------------
function renderTable() {
    const tbody = document.getElementById("tbody-owners");
    const empty = document.getElementById("empty");

    if (!FILTERED.length) {
        tbody.innerHTML = "";
        empty.classList.remove("d-none");
        return;
    } else {
        empty.classList.add("d-none");
    }

    const start = (CURRENT_PAGE - 1) * PER_PAGE;
    const end = start + PER_PAGE;

    const rows = FILTERED.slice(start, end);

    tbody.innerHTML = rows.map(o => `
        <tr data-id="${o.id_owner}">
            <td>
                <input type="checkbox" class="form-check-input row-select">
            </td>
            <td>${escapeHtml(o.sub_base)}${(o.cidade || o.estado) ? `<span class="of-local">${escapeHtml([o.cidade, o.estado].filter(Boolean).join("/"))}</span>` : ""}</td>
            <td>${(o.tipo_owner || "subbase") === "base" ? "Base" : "Subbase"}</td>
            <td>${o.username}</td>
            <td>${o.email}</td>
            <td>
    ${(() => {
        if (!o.contato) return "-";

        const formatted = maskCellphone(o.contato);
        const link = gerarLinkWhatsapp(o.contato);

        if (!link) return formatted; // número inválido → mostra sem link

        return `
            <a href="${link}" target="_blank" class="text-success">
                <i class="ri-whatsapp-line me-1"></i>${formatted}
            </a>
        `;
    })()}
</td>

            <td>R$ ${Number(o.valor).toFixed(2)}</td>
            <td>${o.ignorar_coleta ? "Sem coleta" : o.modo_operacao === "coleta_manual" ? "Manual" : o.modo_operacao === "ambos" ? "Leitura e manual" : "Leitura"}</td>
            <td>${o.ignorar_coleta ? "Não" : "Sim"}</td>
            <td>${o.teste ? "Sim" : "Não"}</td>
            <td>${o.ativo ? "Sim" : "Não"}</td>
            <td class="text-end">
                <a href="tracking-cobranca-owner-detalhe.html?owner_id=${encodeURIComponent(o.id_owner)}" class="btn btn-sm btn-soft-primary">
                    <i class="ri-bill-line me-1"></i>Ver cobrança
                </a>
            </td>
        </tr>
    `).join("");

    setupRowSelection();
    renderPagination();
}


// -------------------------------------------------------------------------
// GERENCIAR SELEÇÃO DE LINHAS
// -------------------------------------------------------------------------
function setupRowSelection() {
    const checks = document.querySelectorAll(".row-select");

    checks.forEach(chk => {
        chk.addEventListener("change", () => {
            const selected = getSelectedIds();
            document.getElementById("btnHeaderEdit").disabled = (selected.length !== 1);
        });
    });
}

function getSelectedIds() {
    return [...document.querySelectorAll(".row-select:checked")]
        .map(chk => Number(chk.closest("tr").dataset.id));
}


// -------------------------------------------------------------------------
// PAGINAÇÃO
// -------------------------------------------------------------------------
function changePage(delta) {
    const totalPages = Math.ceil(FILTERED.length / PER_PAGE);

    CURRENT_PAGE += delta;
    if (CURRENT_PAGE < 1) CURRENT_PAGE = 1;
    if (CURRENT_PAGE > totalPages) CURRENT_PAGE = totalPages;

    renderTable();
}

function renderPagination() {
    const totalPages = Math.ceil(FILTERED.length / PER_PAGE);
    const pgPrev = document.getElementById("pg-prev");
    const pgNext = document.getElementById("pg-next");
    const pgNumbers = document.getElementById("pg-numbers");

    pgPrev.classList.toggle("disabled", CURRENT_PAGE <= 1);
    pgNext.classList.toggle("disabled", CURRENT_PAGE >= totalPages);

    pgNumbers.innerHTML = "";

    for (let i = 1; i <= totalPages; i++) {
        pgNumbers.innerHTML += `
            <li class="page-item ${i === CURRENT_PAGE ? "active" : ""}">
                <a class="page-link" href="javascript:void(0);" onclick="goToPage(${i})">${i}</a>
            </li>`;
    }
}

function goToPage(n) {
    CURRENT_PAGE = n;
    renderTable();
}


// -------------------------------------------------------------------------
// Controle de coleta (API: coleta_habilitada = !ignorar_coleta); modo só se on.
// -------------------------------------------------------------------------
function syncModoOperacaoSelect() {
    const coletaOn = document.getElementById("ownerColetaHabilitadaToggle").checked;
    const wrap = document.getElementById("ownerModoOperacaoWrap");
    const sel = document.getElementById("ownerModoOperacao");
    const bloquearWrap = document.getElementById("ownerBloquearSaidaSemColetaWrap");
    if (wrap) wrap.classList.toggle("d-none", !coletaOn);
    if (sel) sel.disabled = !coletaOn;
    if (bloquearWrap) bloquearWrap.classList.toggle("d-none", !coletaOn);
}

// -------------------------------------------------------------------------
// ABRIR MODAL (edição a partir da seleção)
// -------------------------------------------------------------------------
function openEditFromSelection() {
    const ids = getSelectedIds();
    if (ids.length !== 1) return;

    const id = ids[0];
    const o = ALL_OWNERS.find(x => x.id_owner === id);

    openEdit(o);
}


// -------------------------------------------------------------------------
// ABRIR MODAL COM DADOS
// -------------------------------------------------------------------------
async function fillOwnerIdentidade(idOwner) {
    const sloganEl = document.getElementById("ownerSlogan");
    const img = document.getElementById("ownerLogoPreview");
    const ph = document.getElementById("ownerLogoPlaceholder");
    const btnRem = document.getElementById("btnOwnerRemoverLogo");
    if (sloganEl) sloganEl.value = "";
    if (img) {
        img.src = "assets/images/logo_rotevo.png";
        img.alt = "Logo padrão ROTEVO (fallback)";
        img.classList.remove("d-none");
    }
    if (ph) ph.classList.add("d-none");
    if (btnRem) btnRem.classList.add("d-none");
    if (!idOwner) return;

    try {
        const ident = await fetch(`${API}/${idOwner}/identidade`, { credentials: "include" })
            .then(r => (r.ok ? r.json() : null));
        if (!ident) return;
        if (sloganEl) sloganEl.value = ident.slogan || "";
        if (ident.tem_logo) {
            if (btnRem) btnRem.classList.remove("d-none");
            const presign = await fetch(`${API}/${idOwner}/logo/presign-get`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: "{}",
            }).then(r => (r.ok ? r.json() : null));
            if (presign && presign.download_url && img) {
                img.src = presign.download_url;
                img.alt = "Preview da logo";
                img.classList.remove("d-none");
                if (ph) ph.classList.add("d-none");
            } else if (ph) {
                if (img) img.classList.add("d-none");
                ph.textContent = "Logo cadastrada (preview indisponível)";
                ph.classList.remove("d-none");
            }
        }
    } catch (_) {
        /* preview opcional */
    }
}

async function readApiError(resp, fallback) {
    let detail = "";
    try {
        const j = await resp.json();
        detail = j.detail || j.message || "";
        if (Array.isArray(detail)) detail = detail.map((e) => e.msg || e).join("; ");
    } catch (_) {}
    if (typeof detail === "string" && detail.trim()) return detail.trim();
    if (resp.status === 403) return "Acesso negado para esta operação.";
    if (resp.status === 413) return "Arquivo muito grande. Use até 5 MB.";
    if (resp.status === 422) return "Arquivo inválido. Use PNG, JPG ou WEBP até 5 MB.";
    if (resp.status === 502 || resp.status === 503) return "Serviço de upload indisponível no momento.";
    return fallback || "Não foi possível concluir a operação. Tente novamente.";
}

function openEdit(o) {
    document.getElementById("ownerId").value = o.id_owner;
    document.getElementById("ownerSubBase").value = o.sub_base;
    document.getElementById("ownerTipo").value = (o.tipo_owner || "subbase").toLowerCase();
    document.getElementById("ownerUsername").value = o.username;
    document.getElementById("ownerNomeFantasia").value = o.nome_fantasia || "";
    document.getElementById("ownerEmail").value = o.email;
    document.getElementById("ownerContato").value = maskCellphone(o.contato || "");
    document.getElementById("ownerValor").value = Number(o.valor).toFixed(2);

    document.getElementById("ownerColetaHabilitadaToggle").checked = !o.ignorar_coleta;
    document.getElementById("ownerBloquearSaidaSemColetaToggle").checked = !!o.bloquear_saida_sem_coleta;
    document.getElementById("ownerDevolucaoToggle").checked = !!o.devolucao_sub_base_habilitada;
    document.getElementById("ownerEntradaToggle").checked = !!o.entrada_obrigatoria_habilitada;
    document.getElementById("ownerConferenciaToggle").checked = !!o.conferencia_saida_habilitada;
    document.getElementById("ownerModoOperacao").value = ["codigo", "coleta_manual", "ambos"].includes(o.modo_operacao) ? o.modo_operacao : "codigo";
    document.getElementById("ownerTesteToggle").checked = !!o.teste;
    document.getElementById("ownerAtivoToggle").checked = o.ativo;

    document.getElementById("ownerHeaderSub").textContent =
        `${o.nome_fantasia || o.username} · sub-base ${o.sub_base}`;
    document.querySelectorAll("#formOwner .is-invalid").forEach((el) => el.classList.remove("is-invalid"));
    setFooterNote("");

    syncModoOperacaoSelect();
    syncTipoOwner();
    fillOwnerIdentidade(o.id_owner);
    const seq = ++OWNER_EDIT_SEQ;
    carregarSellerOwner(o.id_owner, seq);
    carregarCobrancaOwner(o.id_owner, seq);

    const modalEl = document.getElementById("oc-owner");
    const body = modalEl.querySelector(".modal-body");
    if (body) body.scrollTop = 0;
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
}



// -------------------------------------------------------------------------
// SALVAR (PATCH)
// -------------------------------------------------------------------------
document.getElementById("formOwner").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!validarOwnerForm()) return;

    const id = document.getElementById("ownerId").value;
    const btnSalvar = document.getElementById("saveOwnerBtn");
    if (btnSalvar.disabled) return;
    const labelSalvar = btnSalvar.innerHTML;
    btnSalvar.disabled = true;
    btnSalvar.innerHTML = '<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>Salvando…';
    setFooterNote("");
    const seller = lerSeller();
    const sellerMudou = Object.keys(seller).some((k) => seller[k] !== (SELLER_ORIGINAL[k] || ""));

    const body = {
        username: document.getElementById("ownerUsername").value.trim(),
        nome_fantasia: document.getElementById("ownerNomeFantasia").value.trim() || null,
        email: document.getElementById("ownerEmail").value.trim(),
        contato: document.getElementById("ownerContato").value.trim(),
        valor: Number(document.getElementById("ownerValor").value),
        modo_operacao: document.getElementById("ownerModoOperacao").value || "codigo",
        ignorar_coleta: !document.getElementById("ownerColetaHabilitadaToggle").checked,
        bloquear_saida_sem_coleta: document.getElementById("ownerBloquearSaidaSemColetaToggle").checked,
        devolucao_sub_base_habilitada: document.getElementById("ownerDevolucaoToggle").checked,
        entrada_obrigatoria_habilitada: document.getElementById("ownerEntradaToggle").checked,
        conferencia_saida_habilitada: document.getElementById("ownerConferenciaToggle").checked,
        teste: document.getElementById("ownerTesteToggle").checked,
        ativo: document.getElementById("ownerAtivoToggle").checked,
        tipo_owner: (document.getElementById("ownerTipo").value || "subbase").toLowerCase()
    };

    try {
        const resp = await fetch(`${API}/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(body)
        });

        if (!resp.ok) throw new Error(await readApiError(resp, "Erro ao salvar."));

        if (sellerMudou) {
            const sellerResp = await fetch(`${API}/${id}/seller-dados`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(seller)
            });
            if (!sellerResp.ok) {
                throw new Error(await readApiError(sellerResp, "Dados salvos, mas falhou ao salvar o endereço."));
            }
            SELLER_ORIGINAL = seller;
        }

        const slogan = (document.getElementById("ownerSlogan")?.value || "").trim() || null;
        const identResp = await fetch(`${API}/${id}/identidade`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
                nome_fantasia: body.nome_fantasia,
                slogan,
            }),
        });
        if (!identResp.ok) throw new Error("Dados salvos, mas falhou ao salvar identidade.");

        Swal.fire({
            icon: "success",
            title: "Salvo com sucesso!",
            timer: 1200,
            showConfirmButton: false
        });

        bootstrap.Modal.getInstance(document.getElementById("oc-owner")).hide();
        loadOwners();

    } catch (err) {
        Swal.fire({
            icon: "error",
            title: "Erro ao salvar",
            text: err.message
        });
    } finally {
        btnSalvar.disabled = false;
        btnSalvar.innerHTML = labelSalvar;
    }
});

document.getElementById("btnOwnerEnviarLogo")?.addEventListener("click", () => {
    document.getElementById("ownerLogoFile")?.click();
});

document.getElementById("ownerLogoFile")?.addEventListener("change", async (ev) => {
    const file = ev.target.files && ev.target.files[0];
    ev.target.value = "";
    const id = document.getElementById("ownerId")?.value;
    if (!file || !id) return;

    let toSend = file;
    try {
        if (typeof window.openLogoCropModal === "function") {
            toSend = await window.openLogoCropModal(file, { title: "Ajustar logo da etiqueta" });
            if (!toSend) return;
        }
    } catch (err) {
        Swal.fire({ icon: "error", title: "Erro", text: err.message || "Não foi possível abrir o recorte." });
        return;
    }

    const btn = document.getElementById("btnOwnerEnviarLogo");
    const prevLabel = btn?.innerHTML;
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Enviando…';
    }
    if (window.Swal) {
        Swal.fire({ title: "Enviando logo…", allowOutsideClick: false, allowEscapeKey: false, didOpen: () => Swal.showLoading() });
    }

    const fd = new FormData();
    fd.append("file", toSend);
    try {
        const resp = await fetch(`${API}/${id}/logo`, {
            method: "POST",
            credentials: "include",
            body: fd,
        });
        if (!resp.ok) throw new Error(await readApiError(resp, "Falha ao enviar logo."));
        if (window.Swal && Swal.isLoading()) Swal.close();
        await fillOwnerIdentidade(id);
        Swal.fire({ icon: "success", title: "Logo atualizada", timer: 1200, showConfirmButton: false });
    } catch (err) {
        if (window.Swal && Swal.isLoading()) Swal.close();
        Swal.fire({ icon: "error", title: "Erro", text: err.message || "Erro ao enviar logo." });
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = prevLabel || "Enviar logo";
        }
    }
});

document.getElementById("btnOwnerRemoverLogo")?.addEventListener("click", async () => {
    const id = document.getElementById("ownerId")?.value;
    if (!id) return;
    try {
        if (window.Swal) {
            Swal.fire({ title: "Removendo logo…", allowOutsideClick: false, allowEscapeKey: false, didOpen: () => Swal.showLoading() });
        }
        const resp = await fetch(`${API}/${id}/logo`, {
            method: "DELETE",
            credentials: "include",
        });
        if (!resp.ok) throw new Error(await readApiError(resp, "Falha ao remover logo."));
        if (window.Swal && Swal.isLoading()) Swal.close();
        await fillOwnerIdentidade(id);
        Swal.fire({ icon: "success", title: "Logo removida", timer: 1200, showConfirmButton: false });
    } catch (err) {
        if (window.Swal && Swal.isLoading()) Swal.close();
        Swal.fire({ icon: "error", title: "Erro", text: err.message || "Erro ao remover logo." });
    }
});
