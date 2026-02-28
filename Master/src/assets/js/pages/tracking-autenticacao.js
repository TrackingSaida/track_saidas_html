/**
 * Página Autenticação — Gerar link de autorização (ML/Shopee) e listar sellers conectados.
 * Acesso: role 0 (root) sempre; role 1 (admin) só quando tipo_owner === "base".
 */
const API_BASE = "https://track-saidas-api.onrender.com/api";

document.addEventListener("DOMContentLoaded", async () => {
    const me = await fetch(`${API_BASE}/auth/me`, { credentials: "include" })
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
});

function initPage() {
    loadSellers();

    document.getElementById("btnGerarLink").addEventListener("click", gerarLink);
    document.getElementById("btnCopiarLink").addEventListener("click", copiarLink);
    document.getElementById("btnAtualizarLista").addEventListener("click", () => loadSellers());
}

async function gerarLink() {
    const platform = document.getElementById("platform").value;
    const btn = document.getElementById("btnGerarLink");
    btn.disabled = true;
    try {
        const path = platform === "shopee" ? "/shopee/auth-url" : "/ml/connect";
        const res = await fetch(`${API_BASE}${path}`, { credentials: "include" });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ detail: res.statusText }));
            throw new Error(err.detail || "Erro ao gerar link");
        }
        const data = await res.json();
        const authUrl = data.auth_url || "";
        document.getElementById("authUrl").value = authUrl;
        document.getElementById("linkResult").classList.remove("d-none");
        if (typeof Swal !== "undefined") {
            Swal.fire({ icon: "success", title: "Link gerado", text: "Copie e envie ao seller.", timer: 2000, showConfirmButton: false });
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
        const [mlRes, shopeeRes] = await Promise.all([
            fetch(`${API_BASE}/ml/sellers`, { credentials: "include" }),
            fetch(`${API_BASE}/shopee/sellers`, { credentials: "include" })
        ]);

        const mlList = mlRes.ok ? await mlRes.json() : [];
        const shopeeList = shopeeRes.ok ? await shopeeRes.json() : [];

        const merged = [
            ...mlList.map(x => ({ ...x, _sort: x.criado_em || "" })),
            ...shopeeList.map(x => ({ ...x, _sort: x.criado_em || "" }))
        ].sort((a, b) => (b._sort || "").localeCompare(a._sort || ""));

        if (merged.length === 0) {
            emptyEl.classList.remove("d-none");
            return;
        }
        emptyEl.classList.add("d-none");

        const platformLabel = { mercado_livre: "Mercado Livre", shopee: "Shopee" };
        const statusLabel = { conectado: "Conectado", expirado: "Expirado" };
        const statusClass = { conectado: "success", expirado: "warning" };

        merged.forEach(row => {
            const id = row.user_id_ml != null ? row.user_id_ml : row.shop_id;
            const plataforma = platformLabel[row.platform] || row.platform || "—";
            const subBase = row.sub_base != null && row.sub_base !== "" ? row.sub_base : "—";
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
                <td>${escapeHtml(subBase)}</td>
                <td>${escapeHtml(String(id))}</td>
                <td><span class="badge bg-${badgeClass}">${escapeHtml(status)}</span></td>
                <td>${escapeHtml(dataConexao)}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (_) {
        emptyEl.classList.remove("d-none");
        emptyEl.querySelector("div.mt-2").textContent = "Erro ao carregar a lista. Tente novamente.";
    }
}

function escapeHtml(text) {
    if (text == null) return "";
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}
