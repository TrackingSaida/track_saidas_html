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

    loadOwners();
}


// -------------------------------------------------------------------------
// CARREGAR LISTA DO BACKEND
// -------------------------------------------------------------------------
async function loadOwners() {
    const tbody = document.getElementById("tbody-owners");
    tbody.innerHTML = `
        <tr><td colspan="10" class="text-center py-4 text-muted">Carregando...</td></tr>
    `;

    try {
        const resp = await fetch(API, { credentials: "include" });
        if (!resp.ok) throw new Error("Erro ao carregar");

        ALL_OWNERS = await resp.json();
        applyFilters();

    } catch (err) {
        tbody.innerHTML = `
            <tr><td colspan="10" class="text-center text-danger py-4">Erro ao carregar owners.</td></tr>
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
            <td>${o.sub_base}</td>
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
        img.removeAttribute("src");
        img.classList.add("d-none");
    }
    if (ph) {
        ph.textContent = "Logo padrão ROTEVO";
        ph.classList.remove("d-none");
    }
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
                img.classList.remove("d-none");
                if (ph) ph.classList.add("d-none");
            } else if (ph) {
                ph.textContent = "Logo cadastrada (preview indisponível)";
            }
        }
    } catch (_) {
        /* preview opcional */
    }
}

function openEdit(o) {
    document.getElementById("ownerId").value = o.id_owner;
    document.getElementById("ownerSubBase").value = o.sub_base;
    document.getElementById("ownerTipo").value = (o.tipo_owner || "subbase").toLowerCase();
    document.getElementById("ownerUsername").value = o.username;
    document.getElementById("ownerNomeFantasia").value = o.nome_fantasia || "";
    document.getElementById("ownerEmail").value = o.email;
    document.getElementById("ownerContato").value = o.contato || "";
    document.getElementById("ownerValor").value = Number(o.valor).toFixed(2);

    document.getElementById("ownerColetaHabilitadaToggle").checked = !o.ignorar_coleta;
    document.getElementById("ownerBloquearSaidaSemColetaToggle").checked = !!o.bloquear_saida_sem_coleta;
    document.getElementById("ownerDevolucaoToggle").checked = !!o.devolucao_sub_base_habilitada;
    document.getElementById("ownerEntradaToggle").checked = !!o.entrada_obrigatoria_habilitada;
    document.getElementById("ownerConferenciaToggle").checked = !!o.conferencia_saida_habilitada;
    document.getElementById("ownerModoOperacao").value = ["codigo", "coleta_manual", "ambos"].includes(o.modo_operacao) ? o.modo_operacao : "codigo";
    document.getElementById("ownerTesteToggle").checked = !!o.teste;
    document.getElementById("ownerAtivoToggle").checked = o.ativo;

    syncModoOperacaoSelect();
    fillOwnerIdentidade(o.id_owner);

    new bootstrap.Modal("#oc-owner").show();
}



// -------------------------------------------------------------------------
// SALVAR (PATCH)
// -------------------------------------------------------------------------
document.getElementById("formOwner").addEventListener("submit", async (ev) => {
    ev.preventDefault();

    const id = document.getElementById("ownerId").value;

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

        if (!resp.ok) throw new Error("Erro ao salvar.");

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
    const fd = new FormData();
    fd.append("file", file);
    try {
        const resp = await fetch(`${API}/${id}/logo`, {
            method: "POST",
            credentials: "include",
            body: fd,
        });
        if (!resp.ok) throw new Error("Falha ao enviar logo.");
        await fillOwnerIdentidade(id);
        Swal.fire({ icon: "success", title: "Logo atualizada", timer: 1200, showConfirmButton: false });
    } catch (err) {
        Swal.fire({ icon: "error", title: "Erro", text: err.message || "Erro ao enviar logo." });
    }
});

document.getElementById("btnOwnerRemoverLogo")?.addEventListener("click", async () => {
    const id = document.getElementById("ownerId")?.value;
    if (!id) return;
    try {
        const resp = await fetch(`${API}/${id}/logo`, {
            method: "DELETE",
            credentials: "include",
        });
        if (!resp.ok) throw new Error("Falha ao remover logo.");
        await fillOwnerIdentidade(id);
        Swal.fire({ icon: "success", title: "Logo removida", timer: 1200, showConfirmButton: false });
    } catch (err) {
        Swal.fire({ icon: "error", title: "Erro", text: err.message || "Erro ao remover logo." });
    }
});
