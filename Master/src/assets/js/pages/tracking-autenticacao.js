/**
 * Página Autenticação — Gerar link de autorização (ML Int / Shopee) e listar sellers conectados.
 * ML: usa /api/ml-int/connect?state=sub_base e /api/ml-int/sellers.
 * Ao voltar da autenticação (query ml=ok), atualiza a lista e mostra feedback.
 * Acesso: role 0 (root) sempre; role 1 (admin) só quando tipo_owner === "base".
 */
const API_BASE = window.getTrackApiUrl();

let me = null;

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

    const tbody = document.getElementById("tbody-sellers");
    tbody.addEventListener("change", (ev) => {
        const sel = ev.target.closest("select[data-ml-vinculo]");
        if (sel) salvarVinculo(sel);
    });
    tbody.addEventListener("click", (ev) => {
        const btn = ev.target.closest("button[data-ml-sync]");
        if (btn) sincronizarSeller(btn);
    });
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

async function lerErro(res, fallback) {
    const err = await res.json().catch(() => ({}));
    const d = err && err.detail;
    if (typeof d === "string" && d.trim()) return d.trim();
    if (d && typeof d.message === "string") return d.message;
    return fallback;
}

async function salvarVinculo(sel) {
    const userIdMl = sel.getAttribute("data-ml-vinculo");
    const anterior = sel.getAttribute("data-atual") || "";
    const valor = sel.value;
    sel.disabled = true;
    try {
        const res = await fetch(`${API_BASE}/ml-int/sellers/${encodeURIComponent(userIdMl)}/vinculo`, {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id_base: valor ? Number(valor) : null }),
        });
        if (!res.ok) throw new Error(await lerErro(res, "Não foi possível salvar o vínculo."));
        const data = await res.json();
        notificar(
            "success",
            data.base_nome ? "Seller vinculado" : "Vínculo removido",
            data.base_nome ? `Pedidos desta conta serão importados como "${data.base_nome}".` : "Os pedidos desta conta não serão importados."
        );
        loadSellers();
    } catch (e) {
        sel.value = anterior;
        sel.disabled = false;
        notificar("error", "Erro", e.message || "Falha ao salvar o vínculo.");
    }
}

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
        if (!res.ok) throw new Error(await lerErro(res, "Falha ao sincronizar."));
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

function vinculoCellHtml(row, bases) {
    if (row.platform !== "mercado_livre") return "—";
    const atual = row.id_base != null ? String(row.id_base) : "";
    const opcoes = bases.map(b => ({ id: String(b.id_base), nome: b.base || `#${b.id_base}` }));
    if (atual && !opcoes.some(o => o.id === atual)) {
        opcoes.unshift({ id: atual, nome: row.base_nome || `#${atual}` });
    }
    const options = ['<option value="">Não associado</option>']
        .concat(opcoes.map(o => `<option value="${escapeHtml(o.id)}"${o.id === atual ? " selected" : ""}>${escapeHtml(o.nome)}</option>`))
        .join("");
    const aviso = atual
        ? ""
        : '<div class="small text-warning mt-1">Não associado — pedidos não serão importados</div>';
    return `<select class="form-select form-select-sm" style="min-width:180px" data-ml-vinculo="${escapeHtml(String(row.user_id_ml))}" data-atual="${escapeHtml(atual)}">${options}</select>${aviso}`;
}

function acoesCellHtml(row) {
    if (row.platform !== "mercado_livre") return "—";
    const podeSync = row.id_base != null && row.status === "conectado";
    const titulo = row.id_base == null
        ? "Associe a um seller para importar os pedidos"
        : (row.status !== "conectado" ? "A conta precisa ser autorizada novamente" : "Importar agora os pedidos Flex pendentes de coleta");
    return `<button type="button" class="btn btn-soft-primary btn-sm" data-ml-sync="${escapeHtml(String(row.user_id_ml))}" title="${escapeHtml(titulo)}"${podeSync ? "" : " disabled"}>
        <i class="ri-download-cloud-2-line align-bottom me-1"></i> Sincronizar agora
    </button>`;
}

/** Verifica se o usuário voltou da página de sucesso do ML ou Shopee e atualiza a lista. */
function checkReturnFromAuth() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("ml") === "ok") {
        loadSellers();
        if (typeof Swal !== "undefined") {
            Swal.fire({ icon: "success", title: "Conta conectada", text: "O seller foi autorizado e já aparece na lista abaixo.", timer: 3000, showConfirmButton: false });
        }
        try {
            const url = new URL(window.location.href);
            url.searchParams.delete("ml");
            window.history.replaceState({}, "", url.toString());
        } catch (_) {}
    }
    if (params.get("shopee") === "ok") {
        loadSellers();
        if (typeof Swal !== "undefined") {
            Swal.fire({ icon: "success", title: "Conta conectada", text: "O seller Shopee foi autorizado e já aparece na lista abaixo.", timer: 3000, showConfirmButton: false });
        }
        try {
            const url = new URL(window.location.href);
            url.searchParams.delete("shopee");
            window.history.replaceState({}, "", url.toString());
        } catch (_) {}
    }
}

async function gerarLink() {
    const platform = document.getElementById("platform").value;
    const btn = document.getElementById("btnGerarLink");
    btn.disabled = true;
    try {
        if (platform === "ml") {
            const subBase = (me && me.sub_base) ? String(me.sub_base).trim() : "";
            if (!subBase) {
                if (typeof Swal !== "undefined") {
                    Swal.fire({ icon: "warning", title: "Sub-base não definida", text: "Seu usuário não tem sub_base. Defina no cadastro ou use um state manual na URL." });
                } else {
                    alert("Sub-base não definida para seu usuário.");
                }
                btn.disabled = false;
                return;
            }
            const res = await fetch(`${API_BASE}/ml-int/connect?state=${encodeURIComponent(subBase)}`, { credentials: "include" });
            if (!res.ok) {
                const err = await res.json().catch(() => ({ detail: res.statusText }));
                throw new Error(err.detail || "Erro ao gerar link");
            }
            const data = await res.json();
            const authUrl = data.auth_url || "";
            document.getElementById("authUrl").value = authUrl;
            document.getElementById("linkResult").classList.remove("d-none");
            if (typeof Swal !== "undefined") {
                Swal.fire({ icon: "success", title: "Link gerado", text: "Copie e envie ao seller. Após autorizar no Mercado Livre, ele aparecerá na lista abaixo.", timer: 2500, showConfirmButton: false });
            }
        } else {
            const shopeeState = (me && me.sub_base) ? String(me.sub_base).trim() : "";
            const shopeeUrl = shopeeState
                ? `${API_BASE}/shopee/auth-url?state=${encodeURIComponent(shopeeState)}`
                : `${API_BASE}/shopee/auth-url`;
            const res = await fetch(shopeeUrl, { credentials: "include" });
            if (!res.ok) {
                const err = await res.json().catch(() => ({ detail: res.statusText }));
                throw new Error(err.detail || "Erro ao gerar link");
            }
            const data = await res.json();
            const authUrl = data.auth_url || data.url || "";
            document.getElementById("authUrl").value = authUrl;
            document.getElementById("linkResult").classList.remove("d-none");
            if (typeof Swal !== "undefined") {
                Swal.fire({ icon: "success", title: "Link gerado", text: "Copie e envie ao seller.", timer: 2000, showConfirmButton: false });
            }
        }
    } catch (e) {
        if (typeof Swal !== "undefined") {
            Swal.fire({ icon: "error", title: "Erro", text: e.message || "Falha ao gerar link." });
        } else {
            alert(e.message || "Falha ao gerar link.");
        }
    } finally {
        btn.disabled = false;
    }
}

function copiarLink() {
    const input = document.getElementById("authUrl");
    const url = input.value.trim();
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => {
        if (typeof Swal !== "undefined") {
            Swal.fire({ icon: "success", title: "Copiado!", text: "Link copiado para a área de transferência.", timer: 1500, showConfirmButton: false });
        } else {
            alert("Link copiado.");
        }
    }).catch(() => {
        input.select();
        document.execCommand("copy");
        if (typeof Swal !== "undefined") {
            Swal.fire({ icon: "success", title: "Copiado!", timer: 1500, showConfirmButton: false });
        }
    });
}

async function loadSellers() {
    const tbody = document.getElementById("tbody-sellers");
    const emptyEl = document.getElementById("emptySellers");
    tbody.innerHTML = "";

    try {
        const [mlIntRes, shopeeRes, basesRes] = await Promise.all([
            fetch(`${API_BASE}/ml-int/sellers`, { credentials: "include" }),
            fetch(`${API_BASE}/shopee/sellers`, { credentials: "include" }),
            fetch(`${API_BASE}/base/?status=ativo`, { credentials: "include" })
        ]);

        const mlIntList = mlIntRes.ok ? await mlIntRes.json() : [];
        const shopeeList = shopeeRes.ok ? await shopeeRes.json() : [];
        const basesAtivas = basesRes.ok ? await basesRes.json() : [];

        const mlWithPlatform = mlIntList.map(x => ({ ...x, platform: "mercado_livre", _sort: x.criado_em || "" }));
        const shopeeWithPlatform = shopeeList.map(x => ({ ...x, platform: "shopee", _sort: x.criado_em || "" }));
        const merged = [...mlWithPlatform, ...shopeeWithPlatform]
            .sort((a, b) => (b._sort || "").localeCompare(a._sort || ""));

        if (merged.length === 0) {
            emptyEl.classList.remove("d-none");
            return;
        }
        emptyEl.classList.add("d-none");

        const platformLabel = { mercado_livre: "Mercado Livre", shopee: "Shopee" };
        const statusLabel = {
            conectado: "Conectado",
            expirado: "Expirado",
            requer_reautorizacao: "Requer nova autorização",
        };
        const statusClass = {
            conectado: "success",
            expirado: "warning",
            requer_reautorizacao: "danger",
        };

        merged.forEach(row => {
            const id = row.user_id_ml != null ? row.user_id_ml : row.shop_id;
            const nickname = (row.user_nickname_ml || row.user_nickname_shopee || "").trim();
            const plataforma = platformLabel[row.platform] || row.platform || "—";
            const status = statusLabel[row.status] || row.status || "—";
            const badgeClass = statusClass[row.status] || "secondary";
            let dataConexao = "—";
            if (row.criado_em) {
                try {
                    const d = new Date(row.criado_em);
                    dataConexao = d.toLocaleString("pt-BR");
                } catch (_) {
                    dataConexao = row.criado_em;
                }
            }

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${escapeHtml(plataforma)}</td>
                <td>${escapeHtml(String(id))}</td>
                <td>${escapeHtml(nickname) || "—"}</td>
                <td><span class="badge bg-${badgeClass}">${escapeHtml(status)}</span></td>
                <td>${escapeHtml(dataConexao)}</td>
                <td>${vinculoCellHtml(row, basesAtivas)}</td>
                <td>${acoesCellHtml(row)}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (_) {
        emptyEl.classList.remove("d-none");
        const msg = emptyEl.querySelector("div.mt-2");
        if (msg) msg.textContent = "Erro ao carregar a lista. Tente novamente.";
    }
}

function escapeHtml(text) {
    if (text == null) return "";
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}
