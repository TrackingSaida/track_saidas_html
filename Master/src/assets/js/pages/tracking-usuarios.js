const API = "https://track-saidas-api.onrender.com/api/users";
const API_BASE = "https://track-saidas-api.onrender.com/api";

// =====================================================================
// MÁSCARA DOCUMENTO — CPF 11 dígitos ou RG
// =====================================================================
function maskDocumento(value) {
    const digits = value.replace(/\D/g, "");
    if (digits.length <= 11) {
        return digits
            .replace(/(\d{3})(\d)/, "$1.$2")
            .replace(/(\d{3})(\d)/, "$1.$2")
            .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
    }
    return digits.slice(0, 14);
}

// =====================================================================
// MÁSCARA CNPJ — 00.000.000/0000-00
// =====================================================================
function maskCnpj(value) {
    const digits = value.replace(/\D/g, "").slice(0, 14);
    if (digits.length <= 2) return digits;
    if (digits.length <= 5) return digits.replace(/(\d{2})(\d+)/, "$1.$2");
    if (digits.length <= 8) return digits.replace(/(\d{2})(\d{3})(\d+)/, "$1.$2.$3");
    if (digits.length <= 12) return digits.replace(/(\d{2})(\d{3})(\d{3})(\d+)/, "$1.$2.$3/$4");
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2}).*/, "$1.$2.$3/$4-$5");
}

// =====================================================================
// MÁSCARA CEP — 00000-000
// =====================================================================
function maskCep(value) {
    const digits = value.replace(/\D/g, "").slice(0, 8);
    if (digits.length > 5) {
        return digits.replace(/(\d{5})(\d{0,3})/, "$1-$2");
    }
    return digits;
}

// =====================================================================
// VIA CEP
// =====================================================================
async function lookupCep(cepRaw) {
    const cep = (cepRaw || "").replace(/\D/g, "");
    if (cep.length !== 8) throw new Error("CEP inválido");
    const r = await fetch(`${API_BASE}/cep/${cep}`, { credentials: "include" });
    if (r.ok) return r.json();
    if (r.status >= 500) {
        const direct = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        if (direct.ok) {
            const data = await direct.json();
            if (data && !data.erro) return data;
        }
    }
    const err = await r.json().catch(() => ({}));
    throw new Error(err.detail || "Falha ao consultar CEP");
}

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
    const btnReset = document.getElementById("btnHeaderReset");
    if (btnReset) {
        btnReset.addEventListener("click", resetPasswordFromSelection);
    }

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
    document.getElementById("role").addEventListener("change", toggleMotoboySection);

    document.getElementById("contato").addEventListener("input", (ev) => {
        ev.target.value = maskCellphone(ev.target.value);
    });
    document.getElementById("documento").addEventListener("input", (ev) => {
        ev.target.value = maskDocumento(ev.target.value);
    });
    const cnpjInput = document.getElementById("cnpj");
    if (cnpjInput) {
        cnpjInput.addEventListener("input", (ev) => {
            ev.target.value = maskCnpj(ev.target.value);
        });
    }
    document.getElementById("cep").addEventListener("input", (ev) => {
        ev.target.value = maskCep(ev.target.value);
    });
    async function buscarCep() {
        const cepInput = document.getElementById("cep");
        const cep = (cepInput.value || "").replace(/\D/g, "");
        if (cep.length === 8) {
            try {
                const data = await lookupCep(cep);
                if (data && !data.erro) {
                    document.getElementById("rua").value = data.logradouro || "";
                    document.getElementById("bairro").value = data.bairro || "";
                    document.getElementById("cidade").value = data.localidade || "";
                    document.getElementById("estado").value = data.uf || "";
                    document.getElementById("numero").focus();
                }
            } catch (e) {}
        }
    }
    document.getElementById("cep").addEventListener("blur", buscarCep);
    document.getElementById("cep").addEventListener("keyup", function() {
        if ((this.value || "").replace(/\D/g, "").length === 8) buscarCep();
    });

    loadUsers();
}

function toggleMotoboySection() {
    const role = Number(document.getElementById("role").value);
    const colUser = document.getElementById("colUser");
    const colMotoboy = document.getElementById("colMotoboy");
    const ignorarColeta = (CURRENT_USER && CURRENT_USER.ignorar_coleta) || false;

    // Para Admin (1) e Operador (2): Username e E-mail obrigatórios com sinalização (*)
    // Para Motoboy (4): esses campos não são obrigatórios
    const isAdminOrOperador = (role === 1 || role === 2);
    ["reqUsername", "reqEmail"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = isAdminOrOperador ? "" : "none";
    });
    const usernameEl = document.getElementById("username");
    const emailEl = document.getElementById("email");
    const passwordEl = document.getElementById("password");
    const passwordConfirmEl = document.getElementById("passwordConfirm");
    [usernameEl, emailEl].forEach(el => {
        if (!el) return;
        if (isAdminOrOperador) {
            el.classList.add("field-required");
            el.setAttribute("required", "required");
        } else {
            el.classList.remove("field-required");
            el.removeAttribute("required");
        }
    });
    [passwordEl, passwordConfirmEl].forEach(el => {
        if (!el) return;
        el.classList.remove("field-required");
        el.removeAttribute("required");
    });

    if (role === 4) {
        colUser.classList.remove("col-12");
        colUser.classList.add("col-6");
        colMotoboy.classList.remove("d-none");
        document.getElementById("podeLerColeta").disabled = ignorarColeta;
        if (ignorarColeta) document.getElementById("podeLerColeta").checked = false;
    } else {
        colUser.classList.remove("col-6");
        colUser.classList.add("col-12");
        colMotoboy.classList.add("d-none");
    }
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
        let errMsg = "Falha ao carregar usuários.";
        if (!resp.ok) {
            try {
                const body = await resp.json();
                if (body && typeof body.detail === "string") errMsg = body.detail;
                else if (body && Array.isArray(body.detail)) errMsg = body.detail.map(d => d.msg || d).join("; ");
            } catch (_) {}
            throw new Error(errMsg);
        }

        let users = await resp.json();

        // Remove o próprio usuário da listagem
        users = users.filter(u => u.id !== CURRENT_USER.id);

        ALL_USERS = users;
        applyFilters();

    } catch (err) {
        console.error(err);
        const msg = (err && err.message) || "Erro ao carregar usuários.";
        document.getElementById("tbody-users").innerHTML = `
            <tr><td colspan="8" class="text-center text-danger py-4">${msg}</td></tr>
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
            4: "Motoboy"
        })[u.role] || "Desconhecido";

        return `
        <tr data-id="${u.id}" data-role="${u.role || 0}">
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
    showMotoboyDetailEmpty();
}


// =====================================================================
// SELEÇÃO
// =====================================================================

function setupRowSelection() {
    const updateRowStyles = () => {
        document.querySelectorAll("#tbody-users tr").forEach(tr => {
            const chk = tr.querySelector(".row-select");
            tr.classList.toggle("row-selected", chk && chk.checked);
        });
    };
    document.querySelectorAll(".row-select").forEach(chk => {
        chk.addEventListener("change", () => {
            updateRowStyles();
            const ids = getSelectedIds();
            const tr = ids.length === 1 ? document.querySelector(`tr[data-id="${ids[0]}"]`) : null;
            const isMotoboy = tr && Number(tr.dataset.role) === 4;
            document.getElementById("btnHeaderEdit").disabled = ids.length !== 1;
            document.getElementById("btnHeaderDel").disabled = ids.length < 1;
            const btnReset = document.getElementById("btnHeaderReset");
            if (btnReset) {
                btnReset.disabled = ids.length !== 1;
            }
            if (ids.length === 1 && isMotoboy) {
                loadMotoboyDetailById(ids[0]);
            } else {
                showMotoboyDetailEmpty();
            }
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
    document.getElementById("passwordConfirm").value = "";
    document.getElementById("statusToggle").checked = true;
    document.getElementById("role").value = 2;

    document.getElementById("documento").value = "";
    const cnpjEl = document.getElementById("cnpj");
    if (cnpjEl) cnpjEl.value = "";
    document.getElementById("cep").value = "";
    document.getElementById("rua").value = "";
    document.getElementById("numero").value = "";
    document.getElementById("complemento").value = "";
    document.getElementById("bairro").value = "";
    document.getElementById("cidade").value = "";
    document.getElementById("estado").value = "";
    document.getElementById("podeLerColeta").checked = false;
    document.getElementById("podeLerSaida").checked = true;

    document.getElementById("groupPassword").classList.remove("d-none");
    document.getElementById("groupPasswordConfirm").classList.remove("d-none");
    document.getElementById("password").classList.remove("is-invalid");
    document.getElementById("passwordConfirm").classList.remove("is-invalid");
    toggleMotoboySection();
    clearMotoboyValidation();

    new bootstrap.Offcanvas("#oc-user").show();
}

function clearMotoboyValidation() {
    ["documento", "cnpj", "cep", "rua", "numero", "bairro", "cidade", "username", "email", "password", "passwordConfirm"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove("is-invalid");
    });
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

    const m = data.motoboy || {};
    document.getElementById("documento").value = m.documento || "";
    const cnpjEl = document.getElementById("cnpj");
    if (cnpjEl) cnpjEl.value = m.cnpj || "";
    document.getElementById("cep").value = m.cep || "";
    document.getElementById("rua").value = m.rua || "";
    document.getElementById("numero").value = m.numero || "";
    document.getElementById("complemento").value = m.complemento || "";
    document.getElementById("bairro").value = m.bairro || "";
    document.getElementById("cidade").value = m.cidade || "";
    document.getElementById("estado").value = m.estado || "";
    document.getElementById("podeLerColeta").checked = !!m.pode_ler_coleta;
    document.getElementById("podeLerSaida").checked = m.pode_ler_saida !== false;

    document.getElementById("groupPassword").classList.add("d-none");
    document.getElementById("groupPasswordConfirm").classList.add("d-none");
    toggleMotoboySection();
    clearMotoboyValidation();

    new bootstrap.Offcanvas("#oc-user").show();
}

// =====================================================================
// DETAIL MOTOBOY (exibido ao selecionar, igual Entregadores)
// =====================================================================
function showMotoboyDetailEmpty() {
    const wrap = document.getElementById("motoboy-detail");
    if (!wrap) return;
    wrap.classList.remove("d-none");
    document.getElementById("motoboy-empty")?.classList.remove("d-none");
    document.getElementById("motoboy-content")?.classList.add("d-none");
    const nm = document.getElementById("motoboy-detail-nome");
    if (nm) nm.textContent = "";
}

function renderMotoboyDetail(data) {
    const wrap = document.getElementById("motoboy-detail");
    if (!wrap) return;
    const m = data.motoboy || {};
    const nome = [data.nome, data.sobrenome].filter(Boolean).join(" ").trim();
    const nmEl = document.getElementById("motoboy-detail-nome");
    if (nmEl) nmEl.textContent = nome ? `(${nome})` : "";

    const assign = (id, v) => {
        const el = document.getElementById(id);
        if (el) el.textContent = v || "—";
    };
    assign("d-documento", m.documento);
    assign("d-cnpj", m.cnpj);
    assign("d-contato", data.contato ? maskCellphone(data.contato) : null);
    assign("d-rua", m.rua);
    assign("d-numero", m.numero);
    assign("d-complemento", m.complemento);
    assign("d-bairro", m.bairro);
    assign("d-cidade", m.cidade);
    assign("d-cep", m.cep);
    assign("d-pode-coleta", m.pode_ler_coleta ? "Sim" : "Não");
    assign("d-pode-saida", m.pode_ler_saida !== false ? "Sim" : "Não");

    wrap.classList.remove("d-none");
    document.getElementById("motoboy-empty")?.classList.add("d-none");
    document.getElementById("motoboy-content")?.classList.remove("d-none");
}

async function loadMotoboyDetailById(userId) {
    try {
        const data = await fetch(`${API}/${userId}`, { credentials: "include" }).then(r => r.json());
        if (data.role === 4 && data.motoboy) {
            renderMotoboyDetail(data);
        } else {
            showMotoboyDetailEmpty();
        }
    } catch {
        showMotoboyDetailEmpty();
    }
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
    clearMotoboyValidation();

    if (!nome) erros.push("Nome é obrigatório.");
    if (!sobrenome) erros.push("Sobrenome é obrigatório.");
    if (!contato) erros.push("Contato é obrigatório.");

    // Para Administrador e Operador: Username, E-mail e Senha obrigatórios
    const isAdminOrOperador = (role === 1 || role === 2);
    if (isAdminOrOperador) {
        if (!username) {
            erros.push("Username é obrigatório para este perfil.");
            document.getElementById("username").classList.add("is-invalid");
        }
        if (!email) {
            erros.push("E-mail é obrigatório para este perfil.");
            document.getElementById("email").classList.add("is-invalid");
        } else if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
            erros.push("Formato de e-mail inválido.");
            document.getElementById("email").classList.add("is-invalid");
        }
    } else if (email && !/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
        erros.push("Formato de e-mail inválido.");
    }

    const isNew = !id;
    const senhaConfirm = document.getElementById("passwordConfirm").value.trim();
    if (isNew && (senha || senhaConfirm)) {
        if (senha.length < 4) {
            erros.push("Senha deve ter no mínimo 4 caracteres.");
            document.getElementById("password").classList.add("is-invalid");
        } else if (senha !== senhaConfirm) {
            erros.push("As senhas não coincidem.");
            document.getElementById("password").classList.add("is-invalid");
            document.getElementById("passwordConfirm").classList.add("is-invalid");
        }
    }

    if (role === 4) {
        const doc = (document.getElementById("documento").value || "").replace(/\D/g, "");
        const cnpj = (document.getElementById("cnpj").value || "").replace(/\D/g, "");
        const rua = document.getElementById("rua").value.trim();
        const num = document.getElementById("numero").value.trim();
        const bairro = document.getElementById("bairro").value.trim();
        const cidade = document.getElementById("cidade").value.trim();
        const cep = (document.getElementById("cep").value || "").replace(/\D/g, "");
        if (!doc) { erros.push("Documento é obrigatório para Motoboy."); document.getElementById("documento").classList.add("is-invalid"); }
        if (!rua) { erros.push("Rua é obrigatória."); document.getElementById("rua").classList.add("is-invalid"); }
        if (!num) { erros.push("Número é obrigatório."); document.getElementById("numero").classList.add("is-invalid"); }
        if (!bairro) { erros.push("Bairro é obrigatório."); document.getElementById("bairro").classList.add("is-invalid"); }
        if (!cidade) { erros.push("Cidade é obrigatória."); document.getElementById("cidade").classList.add("is-invalid"); }
        if (cep.length !== 8) { erros.push("CEP inválido (8 dígitos)."); document.getElementById("cep").classList.add("is-invalid"); }
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
        contato: contato.replace(/\D/g, ""),
        email,
        status,
        role
    };

    if (isNew) payload.password = senha;

    if (role === 4) {
        payload.documento = (document.getElementById("documento").value || "").replace(/\D/g, "");
        payload.cnpj = (document.getElementById("cnpj").value || "").replace(/\D/g, "");
        payload.rua = document.getElementById("rua").value.trim();
        payload.numero = document.getElementById("numero").value.trim();
        payload.complemento = document.getElementById("complemento").value.trim() || null;
        payload.bairro = document.getElementById("bairro").value.trim();
        payload.cidade = document.getElementById("cidade").value.trim();
        payload.estado = document.getElementById("estado").value.trim() || null;
        payload.cep = (document.getElementById("cep").value || "").replace(/\D/g, "");
        payload.pode_ler_coleta = document.getElementById("podeLerColeta").checked;
        payload.pode_ler_saida = document.getElementById("podeLerSaida").checked;
    }

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


// =====================================================================
// RESET DE SENHA
// =====================================================================

async function resetPasswordFromSelection() {
    const ids = getSelectedIds();
    if (ids.length !== 1) return;
    const id = ids[0];

    const tr = document.querySelector(`#tbody-users tr[data-id="${id}"]`);
    const nome = tr ? (tr.children[1]?.textContent || "").trim() : "";

    const { isConfirmed } = await Swal.fire({
        icon: "warning",
        title: "Resetar senha do usuário?",
        html: `
            <p>Você está prestes a redefinir a senha do usuário <strong>${nome || id}</strong>.</p>
            <p>A nova senha será <strong>123456</strong> e o usuário será obrigado a trocá-la no próximo login.</p>
        `,
        showCancelButton: true,
        confirmButtonText: "Sim, resetar",
        cancelButtonText: "Cancelar",
    });

    if (!isConfirmed) return;

    try {
        const resp = await fetch(`${API}/${id}/reset-password`, {
            method: "POST",
            credentials: "include",
        });

        if (!resp.ok) {
            if (resp.status === 401) {
                await Swal.fire({
                    icon: "warning",
                    title: "Sessão expirada",
                    text: "Faça login novamente para continuar.",
                });
                location.href = "auth-signin-tracking-v2.html";
                return;
            }

            let mensagem = "Erro ao resetar senha.";
            try {
                const json = await resp.json();
                if (json.detail) mensagem = json.detail;
            } catch {}

            await Swal.fire({
                icon: "error",
                title: "Falha ao resetar",
                text: mensagem,
            });
            return;
        }

        await Swal.fire({
            icon: "success",
            title: "Senha redefinida!",
            html: "A nova senha padrão é <strong>123456</strong>.",
            timer: 2000,
            showConfirmButton: false,
        });

        loadUsers();
    } catch (err) {
        await Swal.fire({
            icon: "error",
            title: "Erro inesperado",
            text: err.message || "Falha ao resetar senha.",
        });
    }
}
