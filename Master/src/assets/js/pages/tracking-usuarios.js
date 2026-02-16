const API = "https://track-saidas-api.onrender.com/api/users";


// =====================================================================
// MÁSCARA DE CELULAR — (99) 99999-9999
// =====================================================================
function maskCellphone(value) {
    value = value.replace(/\D/g, ""); // remove tudo que não for número

    if (value.length > 11) value = value.substring(0, 11);

    // (11) 98888-7777
    if (value.length >= 7) {
        return value.replace(/^(\d{2})(\d{5})(\d{0,4}).*/, "($1) $2-$3");
    }

    // (11) 98888
    if (value.length >= 3) {
        return value.replace(/^(\d{2})(\d{0,5}).*/, "($1) $2");
    }

    // (11
    if (value.length >= 1) {
        return value.replace(/^(\d{0,2}).*/, "($1");
    }

    return value;
}

function gerarLinkWhatsapp(contatoRaw) {
    if (!contatoRaw) return null;

    // mantém só números
    let numero = contatoRaw.toString().replace(/\D/g, "");

    // validar se tem 11 dígitos (celular)
    if (numero.length !== 11) {
        return null; // número inválido → sem link
    }

    // adicionar prefixo brasileiro
    numero = "55" + numero;

    return `https://wa.me/${numero}`;
}




// =====================================================================
// SOMENTE ADMIN (role 0 ou 1).
// =====================================================================
document.addEventListener("DOMContentLoaded", async () => {

    const me = await fetch(`${API}/me`, { credentials: "include" })
        .then(r => r.ok ? r.json() : null);

    if (!me || ![0,1].includes(me.role)) {
        Swal.fire({
            icon: "error",
            title: "Acesso negado",
            text: "Esta área é restrita a administradores."
        }).then(() => location.href = "index.html");
        return;
    }

    window.CURRENT_USER = me;

    initUsers();
});


// =====================================================================
// ESTADO GLOBAL
// =====================================================================
let ALL_USERS = [];
let FILTERED = [];
let CURRENT_PAGE = 1;
let PER_PAGE = 10;


// =====================================================================
// INICIALIZAÇÃO
// =====================================================================

function initUsers() {
    document.getElementById("btnAdd").addEventListener("click", openCreate);
    document.getElementById("btnHeaderEdit").addEventListener("click", openEditFromSelection);
    document.getElementById("btnHeaderDel").addEventListener("click", deleteFromSelection);

    document.getElementById("toggleAtivos").addEventListener("change", applyFilters);
    document.getElementById("search").addEventListener("input", applyFilters);

    document.getElementById("perPage").addEventListener("change", () => {
        PER_PAGE = Number(document.getElementById("perPage").value);
        CURRENT_PAGE = 1;
        renderTable();
    });

    document.getElementById("pg-prev").addEventListener("click", () => changePage(-1));
    document.getElementById("pg-next").addEventListener("click", () => changePage(1));

    document.getElementById("formUser").addEventListener("submit", saveUser);

    document.getElementById("contato").addEventListener("input", (ev) => {
    ev.target.value = maskCellphone(ev.target.value);
});


    loadUsers();
}


// =====================================================================
// CARREGAR USERS
// =====================================================================

async function loadUsers() {

    document.getElementById("tbody-users").innerHTML = `
        <tr><td colspan="8" class="text-center py-4 text-muted">Carregando...</td></tr>
    `;

    try {
        const resp = await fetch(`${API}/all`, { credentials: "include" });
        if (!resp.ok) throw new Error("Falha ao carregar usuários");

        let users = await resp.json();

        // Remove o próprio usuário da listagem
        users = users.filter(u => u.id !== CURRENT_USER.id);

        ALL_USERS = users;
        applyFilters();

    } catch (err) {
        console.error(err);
        document.getElementById("tbody-users").innerHTML = `
            <tr><td colspan="8" class="text-center text-danger py-4">Erro ao carregar usuários.</td></tr>
        `;
    }
}


// =====================================================================
// FILTROS
// =====================================================================

function applyFilters() {
    const onlyActives = document.getElementById("toggleAtivos").checked;
    const q = document.getElementById("search").value.trim().toLowerCase();

    FILTERED = ALL_USERS.filter(u => {

        if (onlyActives && !u.status) return false;

        return (
            (u.nome || "").toLowerCase().includes(q) ||
            (u.sobrenome || "").toLowerCase().includes(q) ||
            (u.email || "").toLowerCase().includes(q) ||
            (u.username || "").toLowerCase().includes(q)
        );
    });

    CURRENT_PAGE = 1;
    renderTable();
}


// =====================================================================
// RENDERIZA TABELA
// =====================================================================

function renderTable() {
    const tbody = document.getElementById("tbody-users");
    const empty = document.getElementById("empty");

    if (FILTERED.length === 0) {
        tbody.innerHTML = "";
        empty.classList.remove("d-none");
        return;
    } else {
        empty.classList.add("d-none");
    }

    const start = (CURRENT_PAGE - 1) * PER_PAGE;
    const rows = FILTERED.slice(start, start + PER_PAGE);

    tbody.innerHTML = rows.map(u => {

        const roleName = ({
            1: "Administrador",
            2: "Operador",
            3: "Coletador"
        })[u.role] || "Desconhecido";

        return `
        <tr data-id="${u.id}">
            <td><input class="form-check-input row-select" type="checkbox"></td>
            <td>${u.nome || "-"}</td>
            <td>${u.sobrenome || "-"}</td>
            <td>${u.username}</td>
            <td>${u.email}</td>
           <td>
    ${(() => {
        const formatted = u.contato ? maskCellphone(u.contato) : null;
        const link = gerarLinkWhatsapp(u.contato);

        if (!formatted) return "-";        // sem contato
        if (!link) return formatted;       // contato inválido → exibe sem link

        return `
            <a href="${link}" target="_blank" class="text-success">
                <i class="ri-whatsapp-line me-1"></i>${formatted}
            </a>`;
    })()}
</td>
            <td>${roleName}</td>
            <td>${u.status ? "Ativo" : "Inativo"}</td>
        </tr>`;
    }).join("");

    setupRowSelection();
    renderPagination();
}


// =====================================================================
// SELEÇÃO
// =====================================================================

function setupRowSelection() {
    document.querySelectorAll(".row-select").forEach(chk => {
        chk.addEventListener("change", () => {
            const ids = getSelectedIds();
            document.getElementById("btnHeaderEdit").disabled = ids.length !== 1;
            document.getElementById("btnHeaderDel").disabled = ids.length < 1;
        });
    });
}

function getSelectedIds() {
    return [...document.querySelectorAll(".row-select:checked")]
        .map(el => Number(el.closest("tr").dataset.id));
}


// =====================================================================
// PAGINAÇÃO
// =====================================================================

function changePage(delta) {
    const total = Math.ceil(FILTERED.length / PER_PAGE);
    CURRENT_PAGE += delta;

    if (CURRENT_PAGE < 1) CURRENT_PAGE = 1;
    if (CURRENT_PAGE > total) CURRENT_PAGE = total;

    renderTable();
}

function renderPagination() {
    const total = Math.ceil(FILTERED.length / PER_PAGE);

    document.getElementById("pg-prev").classList.toggle("disabled", CURRENT_PAGE <= 1);
    document.getElementById("pg-next").classList.toggle("disabled", CURRENT_PAGE >= total);

    const ul = document.getElementById("pg-numbers");
    ul.innerHTML = "";

    for (let i = 1; i <= total; i++) {
        ul.innerHTML += `
            <li class="page-item ${i === CURRENT_PAGE ? "active" : ""}">
                <a class="page-link" href="javascript:void(0);" onclick="goToPage(${i})">${i}</a>
            </li>`;
    }
}

function goToPage(n) {
    CURRENT_PAGE = n;
    renderTable();
}


// =====================================================================
// CREATE
// =====================================================================

function openCreate() {
    document.getElementById("ocLabel").textContent = "Novo Usuário";
    document.getElementById("userId").value = "";

    document.getElementById("nome").value = "";
    document.getElementById("sobrenome").value = "";
    document.getElementById("username").value = "";
    document.getElementById("contato").value = "";
    document.getElementById("email").value = "";
    document.getElementById("password").value = "";
    document.getElementById("statusToggle").checked = true;
    document.getElementById("role").value = 2;

    document.getElementById("groupPassword").classList.remove("d-none");

    new bootstrap.Offcanvas("#oc-user").show();
}


// =====================================================================
// EDIT
// =====================================================================

function openEditFromSelection() {
    const ids = getSelectedIds();
    if (ids.length === 1) openEdit(ids[0]);
}

async function openEdit(id) {
    const data = await fetch(`${API}/${id}`, { credentials: "include" })
        .then(r => r.json());

    document.getElementById("ocLabel").textContent = "Editar Usuário";
    document.getElementById("userId").value = id;

    document.getElementById("nome").value = data.nome || "";
    document.getElementById("sobrenome").value = data.sobrenome || "";
    document.getElementById("username").value = data.username;
    document.getElementById("contato").value = data.contato || "";
    document.getElementById("email").value = data.email;
    document.getElementById("statusToggle").checked = data.status;

    document.getElementById("role").value = data.role || 2;

    document.getElementById("groupPassword").classList.add("d-none");

    new bootstrap.Offcanvas("#oc-user").show();
}


// =====================================================================
// SALVAR (CREATE / UPDATE) — versão corrigida com validação + erro 401
// =====================================================================

async function saveUser(ev) {
    ev.preventDefault();

    const id = document.getElementById("userId").value;

    const nome = document.getElementById("nome").value.trim();
    const sobrenome = document.getElementById("sobrenome").value.trim();
    const username = document.getElementById("username").value.trim();
    const contato = document.getElementById("contato").value.trim();
    const email = document.getElementById("email").value.trim();
    const senha = document.getElementById("password").value.trim();
    const status = document.getElementById("statusToggle").checked;
    const role = Number(document.getElementById("role").value);

    // -------------------------------------------------------
    // VALIDAÇÃO
    // -------------------------------------------------------
    const erros = [];

    if (!nome) erros.push("Nome é obrigatório.");
    if (!sobrenome) erros.push("Sobrenome é obrigatório.");
    if (!username) erros.push("Username é obrigatório.");
    if (!contato) erros.push("Contato é obrigatório.");
    if (!email) erros.push("E-mail é obrigatório.");

    if (email && !/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
        erros.push("Formato de e-mail inválido.");
    }

    const isNew = !id;
    if (isNew && senha.length < 4) {
        erros.push("Senha deve ter no mínimo 4 caracteres.");
    }

    if (erros.length > 0) {
        Swal.fire({
            icon: "error",
            title: "Corrija os campos obrigatórios",
            html: erros.join("<br>")
        });
        return;
    }

    // -------------------------------------------------------
    // MONTAR PAYLOAD
    // -------------------------------------------------------
    const payload = {
        nome,
        sobrenome,
        username,
        contato: contato.replace(/\D/g, ""), // só números
        email,
        status,
        role
    };

    if (isNew) payload.password = senha;

    try {
        const resp = await fetch(isNew ? `${API}/` : `${API}/${id}`, {
            method: isNew ? "POST" : "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        // -------------------------------------------------------
        // TRATAR ERROS DO BACKEND
        // -------------------------------------------------------
        if (!resp.ok) {

            // 🔥 se for sessão expirada → redireciona
            if (resp.status === 401) {
                Swal.fire({
                    icon: "warning",
                    title: "Sessão expirada",
                    text: "Faça login novamente para continuar."
                }).then(() => location.href = "login.html");
                return;
            }

            // extrai detalhes do erro
            let mensagem = "Erro ao salvar.";
            try {
                const json = await resp.json();
                if (json.detail) {
                    if (Array.isArray(json.detail)) {
                        mensagem = json.detail.map(e => `• ${e.msg}`).join("<br>");
                    } else {
                        mensagem = json.detail;
                    }
                }
            } catch {}

            Swal.fire({
                icon: "error",
                title: "Erro ao salvar",
                html: mensagem
            });

            return;
        }

        // -------------------------------------------------------
        // SUCESSO!
        // -------------------------------------------------------
        Swal.fire({
            icon: "success",
            title: "Salvo com sucesso!",
            timer: 1200,
            showConfirmButton: false
        });

        bootstrap.Offcanvas.getInstance(document.getElementById("oc-user")).hide();
        loadUsers();

    } catch (err) {
        Swal.fire({
            icon: "error",
            title: "Erro inesperado",
            text: err.message
        });
    }
}


// =====================================================================
// DELETE
// =====================================================================

function deleteFromSelection() {
    const ids = getSelectedIds();
    if (ids.length < 1) return;

    Swal.fire({
        icon: "warning",
        title: "Excluir usuário?",
        text: `Você está prestes a excluir ${ids.length} usuário(s). Esta ação é irreversível.`,
        showCancelButton: true,
        confirmButtonText: "Excluir",
        cancelButtonText: "Cancelar"
    }).then(result => {
        if (result.isConfirmed) deleteUsers(ids);
    });
}

async function deleteUsers(ids) {
    try {
        for (const id of ids) {
            await fetch(`${API}/${id}`, {
                method: "DELETE",
                credentials: "include"
            });
        }

        Swal.fire({
            icon: "success",
            title: "Excluído!",
            timer: 1000,
            showConfirmButton: false
        });

        loadUsers();

    } catch (err) {
        Swal.fire({
            icon: "error",
            title: "Erro ao excluir",
            text: err.message
        });
    }
}
