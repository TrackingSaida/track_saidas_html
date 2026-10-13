/**
 * Página Autenticação — conectar contas (ML Int / Shopee), vincular conta ML ao seller cadastrado e sincronizar.
 * ML: /api/ml-int/connect?state=sub_base, /api/ml-int/sellers, PATCH /api/ml-int/sellers/{id}/vinculo, POST /api/ml-int/sync-envios.
 * Cada seller cadastrado aceita uma única conta ML; o backend responde 409 (code seller_ja_vinculado) se já houver outra.
 * Ao voltar da autenticação (query ml=ok / shopee=ok), atualiza a lista e mostra feedback.
 * Acesso: role 0 (root) sempre; role 1 (admin) só quando tipo_owner === "base".
 */
const API_BASE = window.getTrackApiUrl();

let me = null;

const state = {
    contas: [],
    bases: [],
    filtro: "todas",
    busca: "",
    erro: false,
};

const PLATAFORMA = {
    mercado_livre: { nome: "Mercado Livre", sigla: "ML", classe: "bg-warning-subtle text-warning" },
    shopee: { nome: "Shopee", sigla: "SH", classe: "bg-danger-subtle text-danger" },
};

const STATUS = {
    conectado: { texto: "Conectada", classe: "bg-success-subtle text-success" },
    expirado: { texto: "Sessão expirada", classe: "bg-warning-subtle text-warning" },
    requer_reautorizacao: { texto: "Requer nova autorização", classe: "bg-danger-subtle text-danger" },
};

document.addEventListener("DOMContentLoaded", async () => {
    me = await fetch(`${API_BASE}/auth/me`, { credentials: "include" })
        .then(r => r.ok ? r.json() : null);

    if (!me) {
        if (typeof Swal !== "undefined") {
            Swal.fire({ icon: "error", title: "Sessão inválida", text: "Faça login novamente." })
                .then(() => { window.location.href = "auth-signin-tracking-v2.html"; });
        } else {
            window.location.href = "auth-signin-tracking-v2.html";
        }
        return;
    }

    const role = Number(me.role);
    const tipoOwner = (me.tipo_owner || "").toLowerCase();

    const allowed = role === 0 || (role === 1 && tipoOwner === "base");
    if (!allowed) {
        if (typeof Swal !== "undefined") {
            Swal.fire({
                icon: "error",
                title: "Acesso negado",
                text: "Esta página é restrita a root ou a admin com owner tipo base."
            }).then(() => { window.location.href = "index.html"; });
        } else {
            window.location.href = "index.html";
        }
        return;
    }

    initPage();
    checkReturnFromAuth();
});

function initPage() {
    loadSellers();

    document.getElementById("btnGerarLink").addEventListener("click", gerarLink);
    document.getElementById("btnCopiarLink").addEventListener("click", copiarLink);
    document.getElementById("btnAtualizarLista").addEventListener("click", () => loadSellers());
    document.querySelectorAll('input[name="platform"]').forEach(r => r.addEventListener("change", () => {
        document.getElementById("linkResult").classList.add("d-none");
        document.getElementById("authUrl").value = "";
    }));

    document.getElementById("filtrosContas").addEventListener("change", (ev) => {
        if (ev.target.name === "filtroContas") {
            state.filtro = ev.target.value;
            renderContas();
        }
    });
    let buscaTimer = null;
    document.getElementById("buscaContas").addEventListener("input", (ev) => {
        clearTimeout(buscaTimer);
        buscaTimer = setTimeout(() => {
            state.busca = ev.target.value;
            renderContas();
        }, 150);
    });

    const lista = document.getElementById("listaContas");
    lista.addEventListener("change", (ev) => {
        const sel = ev.target.closest("select[data-ml-vinculo]");
        if (sel) aoTrocarVinculo(sel);
    });
    lista.addEventListener("click", (ev) => {
        const btnSync = ev.target.closest("button[data-ml-sync]");
        if (btnSync) return sincronizarSeller(btnSync);
        const btnReauth = ev.target.closest("button[data-reautorizar]");
        if (btnReauth) return irParaGerarLink(btnReauth.getAttribute("data-reautorizar"));
    });
    document.getElementById("estadoContas").addEventListener("click", (ev) => {
        if (ev.target.closest("[data-recarregar]")) loadSellers();
        if (ev.target.closest("[data-limpar-filtros]")) limparFiltros();
    });
}

// ───────────────────────── Utilidades ─────────────────────────

function escapeHtml(text) {
    if (text == null) return "";
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

function notificar(icon, title, text) {
    if (typeof Swal !== "undefined") {
        const multilinha = String(text || "").indexOf("\n") >= 0;
        Swal.fire({
            icon,
            title,
            ...(multilinha ? { html: String(text).split("\n").map(escapeHtml).join("<br>") } : { text }),
            timer: icon === "success" && !multilinha ? 2500 : undefined,
            showConfirmButton: icon !== "success" || multilinha,
        });
    } else {
        alert(text ? `${title}\n${text}` : title);
    }
}

async function lerErroDetalhe(res) {
    const err = await res.json().catch(() => ({}));
    return err && err.detail;
}

function mensagemDoDetalhe(d, fallback) {
    if (typeof d === "string" && d.trim()) return d.trim();
    if (d && typeof d.message === "string") return d.message;
    return fallback;
}

function normalizar(texto) {
    return String(texto || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function nickDaConta(row) {
    const nick = (row.user_nickname_ml || row.user_nickname_shopee || "").trim();
    return nick || String(row.user_id_ml != null ? row.user_id_ml : row.shop_id);
}

function idDaConta(row) {
    return row.user_id_ml != null ? row.user_id_ml : row.shop_id;
}

function plataformaParam() {
    const sel = document.querySelector('input[name="platform"]:checked');
    return sel ? sel.value : "ml";
}

function nomeDaBase(idBase) {
    const b = state.bases.find(x => String(x.id_base) === String(idBase));
    return b ? (b.base || `#${b.id_base}`) : null;
}

/** Mapa id_base → conta ML que já usa o seller. */
function donosDosSellers() {
    const mapa = new Map();
    state.contas.forEach(c => {
        if (c.platform === "mercado_livre" && c.id_base != null) mapa.set(String(c.id_base), c);
    });
    return mapa;
}

function precisaAutorizacao(row) {
    return row.status && row.status !== "conectado";
}

function semSeller(row) {
    return row.platform === "mercado_livre" && row.id_base == null;
}

// ───────────────────────── Carregamento e render ─────────────────────────

async function loadSellers() {
    renderCarregando();
    try {
        const [mlIntRes, shopeeRes, basesRes] = await Promise.all([
            fetch(`${API_BASE}/ml-int/sellers`, { credentials: "include" }),
            fetch(`${API_BASE}/shopee/sellers`, { credentials: "include" }),
            fetch(`${API_BASE}/base/?status=ativo`, { credentials: "include" })
        ]);
        if (!mlIntRes.ok) throw new Error("ml-int");

        const mlIntList = await mlIntRes.json();
        const shopeeList = shopeeRes.ok ? await shopeeRes.json() : [];
        state.bases = basesRes.ok ? await basesRes.json() : [];

        state.contas = [
            ...mlIntList.map(x => ({ ...x, platform: "mercado_livre" })),
            ...shopeeList.map(x => ({ ...x, platform: "shopee" })),
        ].sort((a, b) => (b.criado_em || "").localeCompare(a.criado_em || ""));
        state.erro = false;
    } catch (_) {
        state.contas = [];
        state.erro = true;
    }
    renderContas();
}

function renderCarregando() {
    const lista = document.getElementById("listaContas");
    const estado = document.getElementById("estadoContas");
    estado.classList.add("d-none");
    lista.innerHTML = [0, 1].map(() => `
        <div class="list-group-item py-3 placeholder-glow" aria-hidden="true">
            <div class="d-flex align-items-center gap-3">
                <span class="placeholder rounded-circle" style="width:2.5rem;height:2.5rem"></span>
                <div class="flex-grow-1">
                    <span class="placeholder col-4 d-block mb-2"></span>
                    <span class="placeholder col-2 d-block"></span>
                </div>
                <span class="placeholder col-3"></span>
            </div>
        </div>`).join("");
}

function atualizarContadores() {
    const total = state.contas.length;
    const sem = state.contas.filter(semSeller).length;
    const atencao = state.contas.filter(precisaAutorizacao).length;
    const set = (k, v) => {
        const el = document.querySelector(`[data-contador="${k}"]`);
        if (el) el.textContent = String(v);
    };
    set("todas", total);
    set("sem_seller", sem);
    set("atencao", atencao);
}

function contasFiltradas() {
    const termo = normalizar(state.busca.trim());
    return state.contas.filter(row => {
        if (state.filtro === "sem_seller" && !semSeller(row)) return false;
        if (state.filtro === "atencao" && !precisaAutorizacao(row)) return false;
        if (!termo) return true;
        const alvo = normalizar([nickDaConta(row), idDaConta(row), row.base_nome || nomeDaBase(row.id_base)].join(" "));
        return alvo.includes(termo);
    });
}

function renderEstado(html) {
    const estado = document.getElementById("estadoContas");
    estado.innerHTML = html;
    estado.classList.remove("d-none");
}

function renderContas() {
    const lista = document.getElementById("listaContas");
    const estado = document.getElementById("estadoContas");
    atualizarContadores();
    lista.innerHTML = "";
    estado.classList.add("d-none");

    if (state.erro) {
        renderEstado(`
            <i class="ri-error-warning-line fs-2 text-danger d-block mb-2"></i>
            <div class="mb-3">Não foi possível carregar as contas conectadas.</div>
            <button type="button" class="btn btn-soft-primary btn-sm" data-recarregar><i class="ri-refresh-line align-bottom me-1"></i> Tentar novamente</button>`);
        return;
    }
    if (state.contas.length === 0) {
        renderEstado(`
            <i class="ri-plug-line fs-2 d-block mb-2"></i>
            <div class="fw-medium text-body">Nenhuma conta conectada ainda</div>
            <div>Gere um link acima e envie ao seller para começar a importar os pedidos.</div>`);
        return;
    }
    const visiveis = contasFiltradas();
    if (visiveis.length === 0) {
        renderEstado(`
            <div class="mb-3">Nenhuma conta encontrada com esse filtro.</div>
            <button type="button" class="btn btn-soft-secondary btn-sm" data-limpar-filtros>Limpar filtros</button>`);
        return;
    }

    const donos = donosDosSellers();
    lista.innerHTML = visiveis.map(row => contaHtml(row, donos)).join("");
}

function contaHtml(row, donos) {
    const plat = PLATAFORMA[row.platform] || { nome: row.platform, sigla: "?", classe: "bg-light text-body" };
    const st = STATUS[row.status] || { texto: row.status || "—", classe: "bg-light text-body" };
    let conectadaEm = "";
    if (row.criado_em) {
        const d = new Date(row.criado_em);
        conectadaEm = isNaN(d) ? "" : ` · conectada em ${d.toLocaleDateString("pt-BR")}`;
    }
    const classeLinha = precisaAutorizacao(row) ? "conta-alerta" : (semSeller(row) ? "conta-pendente" : "");
    const chave = `${row.platform}:${idDaConta(row)}`;

    return `
        <div class="list-group-item py-3 conta-row ${classeLinha}" data-conta="${escapeHtml(chave)}">
            <div class="row g-3 align-items-center">
                <div class="col-lg-4 d-flex align-items-center gap-3">
                    <span class="conta-plataforma rounded-circle d-inline-flex align-items-center justify-content-center flex-shrink-0 ${plat.classe}" title="${escapeHtml(plat.nome)}">${escapeHtml(plat.sigla)}</span>
                    <div class="min-w-0">
                        <div class="fw-semibold text-truncate">${escapeHtml(nickDaConta(row))}</div>
                        <div class="small text-muted">${escapeHtml(plat.nome)} · ID ${escapeHtml(String(idDaConta(row)))}${escapeHtml(conectadaEm)}</div>
                    </div>
                </div>
                <div class="col-lg-2">
                    <span class="badge ${st.classe}">${escapeHtml(st.texto)}</span>
                    ${precisaAutorizacao(row) ? `<div><button type="button" class="btn btn-link btn-sm p-0 mt-1" data-reautorizar="${row.platform === "shopee" ? "shopee" : "ml"}">Gerar novo link</button></div>` : ""}
                </div>
                <div class="col-lg-3 conta-vinculo">${vinculoHtml(row, donos)}</div>
                <div class="col-lg-3 text-lg-end">${acoesHtml(row)}</div>
            </div>
        </div>`;
}

function vinculoHtml(row, donos) {
    if (row.platform !== "mercado_livre") {
        return '<span class="small text-muted">Importação de pedidos disponível só para Mercado Livre</span>';
    }
    const atual = row.id_base != null ? String(row.id_base) : "";
    const opcoes = state.bases.map(b => ({ id: String(b.id_base), nome: b.base || `#${b.id_base}` }));
    if (atual && !opcoes.some(o => o.id === atual)) {
        opcoes.unshift({ id: atual, nome: row.base_nome || `#${atual}` });
    }
    const options = ['<option value="">Não associado</option>']
        .concat(opcoes.map(o => {
            const dono = donos.get(o.id);
            const ocupado = dono && String(dono.user_id_ml) !== String(row.user_id_ml);
            const rotulo = ocupado ? `${o.nome} — vinculado a ${nickDaConta(dono)}` : o.nome;
            return `<option value="${escapeHtml(o.id)}"${o.id === atual ? " selected" : ""}${ocupado ? ` data-dono="${escapeHtml(String(dono.user_id_ml))}"` : ""}>${escapeHtml(rotulo)}</option>`;
        }))
        .join("");
    const idSelect = `vinculo-${escapeHtml(String(row.user_id_ml))}`;
    const aviso = atual
        ? '<div class="small text-success mt-1"><i class="ri-checkbox-circle-line align-bottom me-1"></i>Pedidos importados com este seller</div>'
        : '<div class="small text-warning mt-1"><i class="ri-error-warning-line align-bottom me-1"></i>Sem seller — os pedidos desta conta não são importados</div>';
    return `
        <label class="form-label small text-muted mb-1" for="${idSelect}">Seller vinculado</label>
        <select class="form-select form-select-sm" id="${idSelect}" data-ml-vinculo="${escapeHtml(String(row.user_id_ml))}" data-atual="${escapeHtml(atual)}">${options}</select>
        ${aviso}`;
}

function acoesHtml(row) {
    if (row.platform !== "mercado_livre") return "";
    const podeSync = row.id_base != null && row.status === "conectado";
    const titulo = row.id_base == null
        ? "Vincule um seller para importar os pedidos"
        : (row.status !== "conectado" ? "A conta precisa ser autorizada novamente" : "Importar agora os pedidos Flex pendentes de coleta");
    return `<button type="button" class="btn btn-soft-primary btn-sm text-nowrap" data-ml-sync="${escapeHtml(String(row.user_id_ml))}" title="${escapeHtml(titulo)}"${podeSync ? "" : " disabled"}>
        <i class="ri-download-cloud-2-line align-bottom me-1"></i> Sincronizar agora
    </button>`;
}

function limparFiltros() {
    state.filtro = "todas";
    state.busca = "";
    document.getElementById("filtroTodas").checked = true;
    document.getElementById("buscaContas").value = "";
    renderContas();
}

function destacarConta(userIdMl) {
    if (state.filtro !== "todas" || state.busca) limparFiltros();
    const el = document.querySelector(`[data-conta="mercado_livre:${CSS.escape(String(userIdMl))}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("conta-destaque");
    const sel = el.querySelector("select[data-ml-vinculo]");
    if (sel) setTimeout(() => sel.focus(), 400);
    setTimeout(() => el.classList.remove("conta-destaque"), 3500);
}

function irParaGerarLink(plataforma) {
    const radio = document.getElementById(plataforma === "shopee" ? "platformShopee" : "platformMl");
    if (radio) {
        radio.checked = true;
        radio.dispatchEvent(new Event("change", { bubbles: true }));
    }
    const card = document.getElementById("cardConectar");
    card.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => document.getElementById("btnGerarLink").focus(), 400);
}

// ───────────────────────── Vínculo conta ML ↔ seller ─────────────────────────

async function alertarSellerOcupado({ baseNome, nickDono, userIdDono }) {
    const nick = escapeHtml(nickDono);
    const base = escapeHtml(baseNome);
    if (typeof Swal === "undefined") {
        alert(`O seller "${baseNome}" já está vinculado à conta ${nickDono}. Desvincule essa conta (Não associado) antes de vincular a esta.`);
        return;
    }
    const r = await Swal.fire({
        icon: "warning",
        title: "Seller já vinculado",
        html: `
            <p class="mb-3">O seller <strong>${base}</strong> já está vinculado à conta <strong>${nick}</strong> do Mercado Livre. Cada seller aceita apenas uma conta.</p>
            <div class="text-start bg-light rounded p-3 small">
                <div class="fw-semibold mb-2">Para vincular o seller correto:</div>
                <ol class="mb-0 ps-3">
                    <li>Na conta <strong>${nick}</strong>, selecione <strong>Não associado</strong>.</li>
                    <li>Volte a esta conta e selecione <strong>${base}</strong>.</li>
                </ol>
            </div>`,
        showCancelButton: true,
        confirmButtonText: `Ir para a conta ${nickDono}`,
        cancelButtonText: "Fechar",
        customClass: { confirmButton: "btn btn-primary me-2", cancelButton: "btn btn-light" },
        buttonsStyling: false,
    });
    if (r.isConfirmed && userIdDono != null) destacarConta(userIdDono);
}

async function confirmarDesvinculo(nick, baseNome) {
    if (typeof Swal === "undefined") {
        return confirm(`Remover o vínculo de ${nick} com ${baseNome}? Os pedidos desta conta deixarão de ser importados.`);
    }
    const r = await Swal.fire({
        icon: "question",
        title: "Remover vínculo?",
        html: `A conta <strong>${escapeHtml(nick)}</strong> deixará de importar pedidos como <strong>${escapeHtml(baseNome)}</strong> até ser vinculada de novo.`,
        showCancelButton: true,
        confirmButtonText: "Remover vínculo",
        cancelButtonText: "Cancelar",
        customClass: { confirmButton: "btn btn-danger me-2", cancelButton: "btn btn-light" },
        buttonsStyling: false,
    });
    return r.isConfirmed;
}

async function aoTrocarVinculo(sel) {
    const userIdMl = sel.getAttribute("data-ml-vinculo");
    const anterior = sel.getAttribute("data-atual") || "";
    const valor = sel.value;
    const conta = state.contas.find(c => c.platform === "mercado_livre" && String(c.user_id_ml) === String(userIdMl));
    const nick = conta ? nickDaConta(conta) : userIdMl;

    const opt = sel.selectedOptions[0];
    const donoId = opt ? opt.getAttribute("data-dono") : null;
    if (donoId) {
        sel.value = anterior;
        const dono = state.contas.find(c => c.platform === "mercado_livre" && String(c.user_id_ml) === donoId);
        await alertarSellerOcupado({
            baseNome: nomeDaBase(valor) || `#${valor}`,
            nickDono: dono ? nickDaConta(dono) : donoId,
            userIdDono: donoId,
        });
        return;
    }

    if (!valor && anterior) {
        const ok = await confirmarDesvinculo(nick, (conta && conta.base_nome) || nomeDaBase(anterior) || `#${anterior}`);
        if (!ok) {
            sel.value = anterior;
            return;
        }
    }

    await salvarVinculo(sel, userIdMl, valor, anterior);
}

async function salvarVinculo(sel, userIdMl, valor, anterior) {
    sel.disabled = true;
    try {
        const res = await fetch(`${API_BASE}/ml-int/sellers/${encodeURIComponent(userIdMl)}/vinculo`, {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id_base: valor ? Number(valor) : null }),
        });
        if (!res.ok) {
            const detalhe = await lerErroDetalhe(res);
            sel.value = anterior;
            sel.disabled = false;
            if (res.status === 409 && detalhe && detalhe.code === "seller_ja_vinculado") {
                await alertarSellerOcupado({
                    baseNome: detalhe.base_nome || nomeDaBase(valor) || `#${valor}`,
                    nickDono: detalhe.nickname || String(detalhe.user_id_ml),
                    userIdDono: detalhe.user_id_ml,
                });
                loadSellers();
                return;
            }
            notificar("error", "Não foi possível salvar o vínculo", mensagemDoDetalhe(detalhe, "Tente novamente."));
            return;
        }
        const data = await res.json();
        notificar(
            "success",
            data.base_nome ? "Seller vinculado" : "Vínculo removido",
            data.base_nome ? `Pedidos desta conta serão importados como "${data.base_nome}".` : "Os pedidos desta conta não serão importados."
        );
        loadSellers();
    } catch (_) {
        sel.value = anterior;
        sel.disabled = false;
        notificar("error", "Erro", "Falha de conexão ao salvar o vínculo.");
    }
}

// ───────────────────────── Sincronização ─────────────────────────

async function sincronizarSeller(btn) {
    const userIdMl = btn.getAttribute("data-ml-sync");
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Sincronizando...';
    try {
        const res = await fetch(`${API_BASE}/ml-int/sync-envios?user_id_ml=${encodeURIComponent(userIdMl)}`, {
            method: "POST",
            credentials: "include",
        });
        if (!res.ok) throw new Error(mensagemDoDetalhe(await lerErroDetalhe(res), "Falha ao sincronizar."));
        const data = await res.json();
        const s = (data.sellers || [])[0] || {};
        const motivos = {
            sem_vinculo: "Conta não associada a um seller.",
            requer_reautorizacao: "A conta precisa ser autorizada novamente no Mercado Livre.",
            erro_conexao: "Não foi possível acessar a conta no Mercado Livre.",
            erro_api_ml: "O Mercado Livre não respondeu. Tente novamente em instantes.",
        };
        if (s.motivo) {
            notificar("warning", "Sincronização não concluída", motivos[s.motivo] || "Tente novamente.");
            return;
        }
        const erros = (s.erros || []).length;
        const linhas = [
            `Pendentes de coleta no Mercado Livre: ${s.pendentes || 0}`,
            `Novos pedidos importados: ${s.criados || 0}`,
            `Já existiam no sistema: ${s.ja_registrados || 0}`,
        ];
        if (erros) linhas.push(`Não importados por erro: ${erros}`);
        notificar(erros ? "warning" : "success", "Sincronização concluída", linhas.join("\n"));
    } catch (e) {
        notificar("error", "Erro", e.message || "Falha ao sincronizar.");
    } finally {
        btn.disabled = false;
        btn.innerHTML = original;
    }
}

// ───────────────────────── Conectar conta ─────────────────────────

/** Verifica se o usuário voltou da página de sucesso do ML ou Shopee e atualiza a lista. */
function checkReturnFromAuth() {
    const params = new URLSearchParams(window.location.search);
    const retornos = [
        { chave: "ml", texto: "A conta foi autorizada. Agora escolha o seller cadastrado dela na lista abaixo." },
        { chave: "shopee", texto: "A conta Shopee foi autorizada e já aparece na lista abaixo." },
    ];
    retornos.forEach(({ chave, texto }) => {
        if (params.get(chave) !== "ok") return;
        if (typeof Swal !== "undefined") {
            Swal.fire({ icon: "success", title: "Conta conectada", text: texto, timer: 3500, showConfirmButton: false });
        }
        try {
            const url = new URL(window.location.href);
            url.searchParams.delete(chave);
            window.history.replaceState({}, "", url.toString());
        } catch (_) {}
    });
}

async function gerarLink() {
    const platform = plataformaParam();
    const btn = document.getElementById("btnGerarLink");
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Gerando...';
    try {
        const subBase = (me && me.sub_base) ? String(me.sub_base).trim() : "";
        let url;
        if (platform === "ml") {
            if (!subBase) {
                notificar("warning", "Sub-base não definida", "Seu usuário não tem sub-base. Ajuste o cadastro do usuário antes de conectar contas.");
                return;
            }
            url = `${API_BASE}/ml-int/connect?state=${encodeURIComponent(subBase)}`;
        } else {
            url = subBase
                ? `${API_BASE}/shopee/auth-url?state=${encodeURIComponent(subBase)}`
                : `${API_BASE}/shopee/auth-url`;
        }
        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) throw new Error(mensagemDoDetalhe(await lerErroDetalhe(res), "Erro ao gerar link."));
        const data = await res.json();
        const authUrl = data.auth_url || data.url || "";
        document.getElementById("authUrl").value = authUrl;
        document.getElementById("linkResult").classList.remove("d-none");
        document.getElementById("btnCopiarLink").focus();
    } catch (e) {
        notificar("error", "Erro", e.message || "Falha ao gerar link.");
    } finally {
        btn.disabled = false;
        btn.innerHTML = original;
    }
}

function copiarLink() {
    const input = document.getElementById("authUrl");
    const btn = document.getElementById("btnCopiarLink");
    const url = input.value.trim();
    if (!url) return;
    const feito = () => {
        const original = btn.innerHTML;
        btn.innerHTML = '<i class="ri-check-line align-bottom me-1"></i> Copiado';
        setTimeout(() => { btn.innerHTML = original; }, 1800);
    };
    navigator.clipboard.writeText(url).then(feito).catch(() => {
        input.select();
        document.execCommand("copy");
        feito();
    });
}
