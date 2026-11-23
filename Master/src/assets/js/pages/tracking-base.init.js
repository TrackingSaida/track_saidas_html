// tracking-base.init.js
// =======================================================
// CRUD de Bases de Preço
// =======================================================

(function () {
  "use strict";

  const API_URL = window.getTrackApiUrl();
  const API_BASES = `${API_URL}/base/`;
  const API_OWNER_ME = `${API_URL}/owner/me`;

  const qs = (s) => document.querySelector(s);
  const qsa = (s) => Array.from(document.querySelectorAll(s));

  const escapeToast = (msg) => String(msg == null ? "" : msg)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  const toast = (msg, ok = true) => {
    const el = document.createElement("div");
    el.className = `toast align-items-center text-bg-${ok ? "primary" : "danger"} border-0 position-fixed bottom-0 end-0 m-3`;
    el.innerHTML = `<div class="d-flex">
        <div class="toast-body">${escapeToast(msg)}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
      </div>`;
    el.style.zIndex = 1080;
    document.body.appendChild(el);
    const t = new bootstrap.Toast(el, { delay: 2500 });
    t.show();
    setTimeout(() => el.remove(), 3000);
  };

  const onlyDigits = (s) => (s || "").replace(/\D/g, "");

  // CEP & CNPJ helpers reaproveitando padrão das outras telas
  function maskCep(value) {
    const digits = (value || "").replace(/\D/g, "").slice(0, 8);
    if (digits.length > 5) {
      return digits.replace(/(\d{5})(\d{0,3})/, "$1-$2");
    }
    return digits;
  }

  function maskCnpj(value) {
    const digits = (value || "").replace(/\D/g, "").slice(0, 14);
    if (digits.length <= 2) return digits;
    if (digits.length <= 5) return digits.replace(/(\d{2})(\d+)/, "$1.$2");
    if (digits.length <= 8) return digits.replace(/(\d{2})(\d{3})(\d+)/, "$1.$2.$3");
    if (digits.length <= 12) return digits.replace(/(\d{2})(\d{3})(\d{3})(\d+)/, "$1.$2.$3/$4");
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2}).*/, "$1.$2.$3/$4-$5");
  }

  async function lookupCepViaCep(cep) {
    const direct = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    if (!direct.ok) throw new Error("Falha ao consultar CEP");
    const data = await direct.json();
    if (data && data.erro) throw new Error("CEP não encontrado");
    return data;
  }

  async function lookupCep(cepRaw) {
    const cep = (cepRaw || "").replace(/\D/g, "");
    if (cep.length !== 8) throw new Error("CEP incompleto. Informe 8 dígitos.");
    try {
      const r = await fetch(`${API_URL}/cep/${cep}`, { credentials: "include" });
      if (r.ok) {
        const data = await r.json();
        if (data && data.erro) throw new Error("CEP não encontrado");
        return data;
      }
    } catch (err) {
      if (err && /não encontrado/i.test(String(err.message || ""))) throw err;
      // Proxy indisponível ou resposta inválida: cai no ViaCEP.
    }
    return lookupCepViaCep(cep);
  }

  function parseMoeda(valorRaw = "") {
    if (typeof valorRaw === "number") return valorRaw;
    const clean = valorRaw.replace(/[R$\s.]/g, "").replace(",", ".");
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
  }

  function normalizeNome(nomeRaw = "") {
  return nomeRaw.replace(/\s+/g, " ").trim().toUpperCase();
}


 // =======================================================
// API Helpers
// =======================================================
async function http(url, options = {}) {
  const opts = {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options
  };

  const r = await fetch(url, opts);

    if (!r.ok) {
      let errText = "";
      try {
        errText = await r.text();
      } catch (e) {}
      try {
        const j = JSON.parse(errText);
        if (typeof j.detail === "string") errText = j.detail;
        else if (j.detail && typeof j.detail.message === "string") errText = j.detail.message;
      } catch (e) {}
      const err = new Error(errText || r.statusText);
      err.status = r.status;
      throw err;
    }

  // Se houver JSON, retorna JSON
  try {
    return await r.json();
  } catch {
    return null;
  }
}

// =======================================================
// API: Lista de Bases (obedece toggle "Somente ativos")
// =======================================================
async function apiList() {
  const ativoOn = qs("#toggleAtivos")?.checked;

  // ✔ ligado = ativos
  // ✔ desligado = inativos (não "todos")
  const status = ativoOn ? "ativo" : "inativo";

  return http(`${API_BASES}?status=${status}`);
}

// =======================================================
// API: Get Base por ID
// =======================================================
async function apiGet(id) {
  return http(`${API_BASES}${encodeURIComponent(id)}`);
}

// =======================================================
// API: Criar Base
// (inclui suporte para status 409 — duplicidade)
// =======================================================
async function apiCreate(payload) {
  try {
    return await http(API_BASES, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  } catch (err) {
    if (err.status === 409) {
      toast(typeof window.ownerTerm === "function" ? window.ownerTerm("ja_existe_nome") : "Já existe uma base com esse nome nesta sub-base.", false);
      throw err;
    }
    throw err;
  }
}

// =======================================================
// API: Atualizar Base (PATCH)
// =======================================================
async function apiUpdate(id, payload) {
  try {
    return await http(`${API_BASES}${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
  } catch (err) {
    if (err.status === 409) {
      toast(typeof window.ownerTerm === "function" ? window.ownerTerm("ja_existe_nome") : "Já existe uma base com esse nome nesta sub-base.", false);
      throw err;
    }
    throw err;
  }
}

// =======================================================
// API: Delete Base
// =======================================================
async function apiDelete(id) {
  return http(`${API_BASES}${encodeURIComponent(id)}`, {
    method: "DELETE"
  });
}


  // =======================================================
  // Renderização da Tabela
  // =======================================================
  let PAPEL_TAB = "seller";
  let PAPEL_TAB_USER_SET = false;
  let DATA_ALL = [];

  function seloPapel(papel) {
    if (papel === "base_parceira") return '<span class="badge bg-secondary-subtle text-secondary">Base</span>';
    if (papel === "seller") return '<span class="badge bg-primary-subtle text-primary">Seller</span>';
    return "";
  }

  function countByPapel(papel) {
    return DATA_ALL.filter((b) => (b.papel || "seller") === papel).length;
  }

  function syncPapelTabsActive() {
    qsa("#clientesPapelTabs .nav-link").forEach((el) => {
      el.classList.toggle("active", el.getAttribute("data-papel-tab") === PAPEL_TAB);
    });
  }

  /** Pós-promote: só bases → abre Bases. Se o usuário já clicou numa aba, respeita. */
  function escolherAbaPapelInicial() {
    if (!isOwnerTipoBase() || PAPEL_TAB_USER_SET) return;
    const nSeller = countByPapel("seller");
    const nBase = countByPapel("base_parceira");
    if (nSeller === 0 && nBase > 0) {
      PAPEL_TAB = "base_parceira";
    } else if (nSeller > 0) {
      PAPEL_TAB = "seller";
    }
    syncPapelTabsActive();
  }

  function mostrarColunaAuth() {
    return isOwnerTipoBase() && PAPEL_TAB === "seller";
  }

  function celulaAuth(b) {
    if (!mostrarColunaAuth()) return "";
    const id = b.id_base || b.id;
    const mlContas = Array.isArray(b.ml_contas) ? b.ml_contas : [];
    const shContas = Array.isArray(b.shopee_contas) ? b.shopee_contas : [];
    const badges = [];
    if (mlContas.length) {
      badges.push('<span class="badge bg-warning-subtle text-warning">ML</span>');
    }
    if (shContas.length) {
      badges.push('<span class="badge bg-danger-subtle text-danger">Shopee</span>');
    }
    const statusHtml = badges.length
      ? `<div class="d-flex flex-wrap gap-1 justify-content-center mb-1">${badges.join("")}</div>`
      : '<div class="small text-muted mb-1">Sem conta</div>';
    return `
      <td class="text-center align-middle" data-auth-cell>
        ${statusHtml}
        <div class="dropdown d-inline-block">
          <button type="button" class="btn btn-soft-primary btn-sm dropdown-toggle" data-bs-toggle="dropdown" aria-expanded="false" data-auth-gerar="${id}">
            Gerar link
          </button>
          <ul class="dropdown-menu dropdown-menu-end">
            <li><button type="button" class="dropdown-item" data-auth-platform="ml" data-auth-id="${id}">Mercado Livre</button></li>
            <li><button type="button" class="dropdown-item" data-auth-platform="shopee" data-auth-id="${id}">Shopee</button></li>
          </ul>
        </div>
      </td>`;
  }

  function buildRow(b) {
    const ativoChecked = b.ativo ? "checked" : "";
    const id = b.id_base || b.id;
    const papelCol = isOwnerTipoBase()
      ? `<td class="text-center">${seloPapel(b.papel)}</td>`
      : "";
    const authCol = celulaAuth(b);
    return `
      <tr class="row-selectable" data-id="${id}" data-papel="${b.papel || ""}">
        <td class="text-center"><input class="form-check-input sel-row" type="radio" name="sel-base" value="${id}"></td>
        <td>${b.base || "-"}</td>
        ${papelCol}
        ${authCol}
        <td class="text-end">R$ ${Number(b.ml).toFixed(2).replace(".", ",")}</td>
        <td class="text-end">R$ ${Number(b.shopee).toFixed(2).replace(".", ",")}</td>
        <td class="text-end">R$ ${Number(b.avulso).toFixed(2).replace(".", ",")}</td>
        <td class="text-center"><input type="checkbox" class="form-check-input" ${ativoChecked} disabled></td>
      </tr>
    `;
  }

  function renderTable(data) {
    const tbody = qs("#tbody-bases");
    if (!tbody) return;
    tbody.innerHTML = "";
    if (!data || !data.length) {
      qs("#empty")?.classList.remove("d-none");
      return;
    }
    qs("#empty")?.classList.add("d-none");
    tbody.innerHTML = data.map(buildRow).join("");
  }

  // =======================================================
  // Estado
  // =======================================================
  let DATA_CACHE = [];
  let SELECTED_ID = null;
  let OWNER_INFO = null;
  let CURRENT_PAGE = 1;
  let PER_PAGE = 10;
  const formModal = new bootstrap.Modal("#oc-form");

  async function carregarOwnerInfo() {
    try {
      const owner = await http(API_OWNER_ME);
      OWNER_INFO = owner || null;
    } catch (err) {
      OWNER_INFO = null;
    }
  }

  function preencherFormSellerDados(seller) {
    if (!seller) return;
    const setVal = (id, v) => {
      const el = qs(id);
      if (el && v != null) el.value = v || "";
    };
    setVal("#sellerCnpj", seller.cnpj ? maskCnpj(seller.cnpj) : "");
    if (window.PixChave) {
      PixChave.preencher(qs("#sellerPixTipo"), qs("#sellerPix"), seller.chave_pix_tipo, seller.chave_pix);
    } else {
      setVal("#sellerPix", seller.chave_pix || "");
    }
    setVal("#sellerCep", seller.cep ? maskCep(seller.cep) : "");
    setVal("#sellerRua", seller.rua || "");
    setVal("#sellerNumero", seller.numero || "");
    setVal("#sellerComplemento", seller.complemento || "");
    setVal("#sellerBairro", seller.bairro || "");
    setVal("#sellerCidade", seller.cidade || "");
    setVal("#sellerEstado", seller.estado || "");
  }

  let sellerDadosSeq = 0;

  async function carregarSellerDados(baseId = null) {
    if (!OWNER_INFO || !OWNER_INFO.id_owner) return;
    const seq = ++sellerDadosSeq;
    try {
      const url = baseId != null
        ? `${API_URL}/owner/${encodeURIComponent(OWNER_INFO.id_owner)}/seller-dados?base_id=${encodeURIComponent(baseId)}`
        : `${API_URL}/owner/${encodeURIComponent(OWNER_INFO.id_owner)}/seller-dados`;
      const seller = await http(url);
      if (seq !== sellerDadosSeq || !seller) return;
      preencherFormSellerDados(seller);
    } catch (err) {
      // se 404 ou outro erro, apenas não preenche
    }
  }

  const PERIODOS_FECHAMENTO = ["semanal", "quinzenal", "mensal"];

  function codigoPeriodoFechamento(codigo) {
    const valor = String(codigo || "").trim().toLowerCase();
    return PERIODOS_FECHAMENTO.includes(valor) ? valor : "";
  }

  function rotuloPeriodoFechamento(codigo) {
    return { semanal: "Semanal", quinzenal: "Quinzenal", mensal: "Mensal" }[codigoPeriodoFechamento(codigo)] || "Nenhum";
  }

  function aplicarPeriodoFechamento(codigo) {
    const select = qs("#periodoFechamento");
    if (!select || select.dataset.tocado === "1") return;
    const valor = codigoPeriodoFechamento(codigo);
    select.dataset.carregado = valor;
    select.value = valor;
    Array.from(select.options).forEach((op) => { op.selected = op.value === valor; });
  }

  function periodoFechamentoDoFormulario() {
    const select = qs("#periodoFechamento");
    if (!select) return null;
    const codigo = select.dataset.tocado === "1" ? select.dataset.escolhido : select.value;
    return codigoPeriodoFechamento(codigo) || null;
  }

  function periodoFechamentoSelecionado() {
    const id = SELECTED_ID ? Number(SELECTED_ID) : null;
    const row = DATA_CACHE.find((b) => (b.id_base || b.id) === id);
    return row?.periodo_fechamento || "";
  }

  function showSellerDetailEmpty(message) {
    const wrap = qs("#seller-detail");
    if (!wrap) return;
    wrap.classList.remove("d-none");
    const empty = qs("#seller-detail-empty");
    const content = qs("#seller-detail-content");
    if (empty) {
      empty.classList.remove("d-none");
      if (typeof message === "string" && message.trim()) {
        empty.textContent = message;
      } else {
        empty.textContent = typeof window.ownerTerm === "function"
          ? window.ownerTerm("selecione_detalhe")
          : "Selecione uma Base na lista acima para ver os detalhes de CNPJ e endereço.";
      }
    }
    if (content) content.classList.add("d-none");
    const nomeEl = qs("#seller-detail-nome");
    if (nomeEl) nomeEl.textContent = "";
    const authBlock = qs("#auth-marketplace-block");
    if (authBlock) authBlock.classList.add("d-none");
  }

  function renderSellerDetail(seller) {
    const wrap = qs("#seller-detail");
    if (!wrap) return;
    const empty = qs("#seller-detail-empty");
    const content = qs("#seller-detail-content");

    const nomeBase = (() => {
      const id = SELECTED_ID ? Number(SELECTED_ID) : null;
      const row = DATA_CACHE.find(b => (b.id_base || b.id) === id);
      return row?.base || "";
    })();

    const setText = (id, value) => {
      const el = qs(id);
      if (el) el.textContent = value || "—";
    };

    const endereco = [seller.rua, seller.numero, seller.complemento].filter(Boolean).join(", ");
    const cidadeUf = [seller.cidade, seller.estado].filter(Boolean).join(" / ");

    const cnpjFormatado = maskCnpj(seller.cnpj || "");
    setText("#s-cnpj", cnpjFormatado);
    setText("#s-pix", window.PixChave ? PixChave.exibir(seller.chave_pix_tipo, seller.chave_pix) : seller.chave_pix);
    setText("#s-periodo", rotuloPeriodoFechamento(periodoFechamentoSelecionado()));
    setText("#s-cep", seller.cep);
    setText("#s-endereco", endereco);
    setText("#s-cidade-uf", cidadeUf);

    const nomeEl = qs("#seller-detail-nome");
    if (nomeEl) nomeEl.textContent = nomeBase ? `(${nomeBase})` : "";

    wrap.classList.remove("d-none");
    if (empty) empty.classList.add("d-none");
    if (content) content.classList.remove("d-none");
    atualizarVisibilidadePortalSeller();
    if (isSellerSelecionado()) loadPortalAcesso();
    renderAuthMarketplaceBlock();
  }

  async function loadSellerDetail() {
    if (!OWNER_INFO || !OWNER_INFO.id_owner || !SELECTED_ID) {
      showSellerDetailEmpty();
      return;
    }
    try {
      const seller = await http(
        `${API_URL}/owner/${encodeURIComponent(OWNER_INFO.id_owner)}/seller-dados?base_id=${encodeURIComponent(SELECTED_ID)}`
      );
      if (!seller) {
        renderSellerDetail({});
        return;
      }
      renderSellerDetail(seller);
    } catch (err) {
      if (err && err.status === 404) {
        renderSellerDetail({});
        return;
      }
      showSellerDetailEmpty(typeof window.ownerTerm === "function" ? window.ownerTerm("sem_dados_detalhe") : "Não há dados de CNPJ e endereço cadastrados para a Base selecionada.");
    }
  }

  // =======================================================
  // CRUD Actions
  // =======================================================
  function getPagedData() {
    const total = DATA_CACHE.length;
    if (total === 0) {
      return { pageItems: [], start: 0, end: 0, total: 0, totalPages: 1 };
    }
    const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
    if (CURRENT_PAGE > totalPages) CURRENT_PAGE = totalPages;
    const startIndex = (CURRENT_PAGE - 1) * PER_PAGE;
    const endIndex = Math.min(startIndex + PER_PAGE, total);
    return {
      pageItems: DATA_CACHE.slice(startIndex, endIndex),
      start: startIndex + 1,
      end: endIndex,
      total,
      totalPages,
    };
  }

  function renderPage() {
    const { pageItems, start, end, total, totalPages } = getPagedData();
    renderTable(pageItems);

    const empty = qs("#empty");
    if (empty) {
      if (total === 0) empty.classList.remove("d-none");
      else empty.classList.add("d-none");
    }

    const pageInfo = qs("#page-info");
    if (pageInfo) {
      if (total === 0) pageInfo.textContent = "Nenhum item";
      else pageInfo.textContent = `Exibindo ${start} a ${end} de ${total}`;
    }

    const pgPrev = qs("#pg-prev");
    const pgNext = qs("#pg-next");
    const pgNumbers = qs("#pg-numbers");

    if (pgPrev) {
      pgPrev.classList.toggle("disabled", CURRENT_PAGE <= 1 || totalPages <= 1);
    }
    if (pgNext) {
      pgNext.classList.toggle("disabled", CURRENT_PAGE >= totalPages || totalPages <= 1);
    }

    if (pgNumbers) {
      if (totalPages <= 1) {
        pgNumbers.innerHTML = "";
      } else {
        let html = "";
        for (let p = 1; p <= totalPages; p++) {
          const active = p === CURRENT_PAGE ? " active" : "";
          html += `<li class="page-item${active}" data-page="${p}"><a class="page-link" href="#">${p}</a></li>`;
        }
        pgNumbers.innerHTML = html;
      }
    }
  }

  function aplicarFiltroPapelEBusca() {
    const term = (qs("#search")?.value || "").toLowerCase();
    let rows = DATA_ALL.slice();
    if (isOwnerTipoBase()) {
      rows = rows.filter((b) => (b.papel || "seller") === PAPEL_TAB);
    }
    if (term) {
      rows = rows.filter((b) => (b.base || "").toLowerCase().includes(term));
    }
    DATA_CACHE = rows;
  }

  function atualizarUiClientesOwnerBase() {
    const tabs = qs("#clientesPapelTabs");
    const thPapel = qs("#thPapel");
    const thAuth = qs("#thAuth");
    if (tabs) tabs.classList.toggle("d-none", !isOwnerTipoBase());
    if (thPapel) thPapel.classList.toggle("d-none", !isOwnerTipoBase());
    if (thAuth) thAuth.classList.toggle("d-none", !mostrarColunaAuth());
    if (isOwnerTipoBase()) {
      const title = document.querySelector("[data-owner-term='bases']");
      if (title) title.textContent = "Clientes";
      document.title = "Clientes | Tracking Saídas";
    }
  }

  function formatMoedaInput(valor) {
    if (valor == null || valor === "") return "";
    const n = Number(valor);
    if (!Number.isFinite(n)) return "";
    return `R$ ${n.toFixed(2).replace(".", ",")}`;
  }

  function atualizarBadgePrecoPagar(campo, origem) {
    const el = qs(`#lblPagar${campo}`);
    if (!el) return;
    const key = String(origem || "").toLowerCase();
    const proprio = key === "proprio" || key === "excecao";
    el.textContent = proprio ? "Preço próprio" : "Padrão";
    el.className = proprio ? "badge bg-warning-subtle text-warning" : "badge bg-light text-muted";
  }

  let PRECO_PAGAR_GLOBAL = { shopee_valor: null, ml_valor: null, avulso_valor: null };
  let PRECO_PAGAR_CARREGADO = false;

  function limparPrecoPagarForm() {
    PRECO_PAGAR_CARREGADO = false;
    PRECO_PAGAR_GLOBAL = { shopee_valor: null, ml_valor: null, avulso_valor: null };
    ["Shopee", "Ml", "Avulso"].forEach((c) => {
      const inp = qs(`#pagar${c}`);
      if (inp) inp.value = "";
      atualizarBadgePrecoPagar(c, "global");
    });
  }

  function aplicarPrecoPagarView(data, { soGlobal = false } = {}) {
    const mapa = { Shopee: "shopee_valor", Ml: "ml_valor", Avulso: "avulso_valor" };
    const global = data?.global || {};
    PRECO_PAGAR_GLOBAL = {
      shopee_valor: global.shopee_valor != null ? Number(global.shopee_valor) : null,
      ml_valor: global.ml_valor != null ? Number(global.ml_valor) : null,
      avulso_valor: global.avulso_valor != null ? Number(global.avulso_valor) : null,
    };
    const origem = soGlobal ? {} : (data?.origem || {});
    const fonte = soGlobal ? global : (data?.efetivo || global);
    Object.entries(mapa).forEach(([label, key]) => {
      const inp = qs(`#pagar${label}`);
      if (inp) inp.value = formatMoedaInput(fonte[key]);
      const origemKey = origem[key] || "global";
      atualizarBadgePrecoPagar(label, soGlobal ? "global" : origemKey);
    });
    PRECO_PAGAR_CARREGADO = true;
  }

  async function carregarPrecoPagar(idBase, opts = {}) {
    if (!idBase) return;
    try {
      const data = await http(`${API_URL}/base-repasse/bases/${encodeURIComponent(idBase)}/preco-pagar`);
      aplicarPrecoPagarView(data, opts);
    } catch (_) {
      limparPrecoPagarForm();
    }
  }

  /** Carrega preço a pagar ao ligar entrega; para cadastro novo usa outra base parceira só para ler o global. */
  async function garantirPrecoPagarNoFormulario() {
    const idForm = qs("#baseId")?.value;
    if (idForm) {
      await carregarPrecoPagar(idForm);
      return;
    }
    if (PRECO_PAGAR_CARREGADO) return;
    const proxy = DATA_ALL.find((b) => (b.papel || "") === "base_parceira");
    const proxyId = proxy ? (proxy.id_base || proxy.id) : null;
    if (proxyId) {
      await carregarPrecoPagar(proxyId, { soGlobal: true });
    }
  }

  function valorCanalOuNullSePadrao(inputSel, globalKey) {
    const raw = qs(inputSel)?.value?.trim();
    if (!raw) return null;
    const valor = parseMoeda(raw);
    const padrao = PRECO_PAGAR_GLOBAL[globalKey];
    if (padrao != null && Number(valor) === Number(padrao)) return null;
    return valor;
  }

  async function salvarPrecoPagar(idBase) {
    if (!idBase) return;
    const body = {
      shopee_valor: valorCanalOuNullSePadrao("#pagarShopee", "shopee_valor"),
      ml_valor: valorCanalOuNullSePadrao("#pagarMl", "ml_valor"),
      avulso_valor: valorCanalOuNullSePadrao("#pagarAvulso", "avulso_valor"),
    };
    await http(`${API_URL}/base-repasse/bases/${encodeURIComponent(idBase)}/preco-pagar`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  }

  function selecionarPapelForm(papel) {
    const hid = qs("#basePapel");
    if (hid) hid.value = papel || "";
    qsa(".papel-card").forEach((btn) => {
      const ativo = !!papel && btn.getAttribute("data-papel") === papel;
      btn.classList.toggle("active", ativo);
      btn.classList.toggle("btn-primary", ativo);
      btn.classList.toggle("btn-outline-primary", !ativo);
      btn.setAttribute("aria-pressed", ativo ? "true" : "false");
    });
    const help = qs("#papelHelp");
    if (help) {
      if (papel === "base_parceira") {
        help.textContent = "Coleta parceira. Opcionalmente entrega pedidos nossos (interruptor abaixo).";
      } else if (papel === "seller") {
        help.textContent = "Autenticação e Portal do Seller disponíveis; CNPJ obrigatório.";
      } else {
        help.textContent = "Escolha Seller ou Base.";
      }
    }
    const blocoEntrega = qs("#blocoEntregaPedidos");
    const blocoPagar = qs("#blocoPrecoPagar");
    const isBase = papel === "base_parceira";
    if (blocoEntrega) blocoEntrega.classList.toggle("d-none", !isBase);
    if (blocoPagar) {
      const ligado = !!qs("#entregaPedidos")?.checked;
      blocoPagar.classList.toggle("d-none", !isBase || !ligado);
    }
    atualizarAjudaCamposSeller();
  }

  async function listarBases() {
    try {
      const data = await apiList();
      DATA_ALL = Array.isArray(data) ? data : [];
      atualizarUiClientesOwnerBase();
      escolherAbaPapelInicial();
      aplicarFiltroPapelEBusca();
      CURRENT_PAGE = 1;
      renderPage();
      showSellerDetailEmpty();
    } catch (err) {
      console.error(err);
      toast(typeof window.ownerTerm === "function" ? window.ownerTerm("falha_carregar_bases") : "Falha ao carregar bases.", false);
    }
  }

  function openForm(modo, data = null) {
    const form = qs("#formBase");
    form.reset();
    form.classList.remove("was-validated");
    qs("#ocLabel").textContent = modo === "edit"
      ? (typeof window.ownerTerm === "function" ? window.ownerTerm("editar_base") : "Editar Base")
      : (typeof window.ownerTerm === "function" ? window.ownerTerm("nova_base") : "Nova Base");
    if (isOwnerTipoBase()) {
      qs("#ocLabel").textContent = modo === "edit" ? "Editar Cliente" : "Novo Cliente";
    }

    qs("#baseId").value = data?.id_base || "";
    qs("#base").value = data?.base || "";
    qs("#flex").value = data ? `R$ ${Number(data.ml).toFixed(2).replace(".", ",")}` : "";
    qs("#shopee").value = data ? `R$ ${Number(data.shopee).toFixed(2).replace(".", ",")}` : "";
    qs("#avulso").value = data ? `R$ ${Number(data.avulso).toFixed(2).replace(".", ",")}` : "";
    qs("#ativo").checked = data != null ? !!data.ativo : true;
    const dias = new Set(data?.dias_coleta || [1, 2, 3, 4, 5, 6]);
    qsa(".dia-coleta").forEach((el) => { el.checked = dias.has(Number(el.value)); });
    qs("#agendaConfirmada").checked = !!data?.agenda_coleta_confirmada;
    const chave = Array.from(dias).sort((a, b) => a - b).join(",");
    qs("#agendaPreset").value = ["1,2,3,4,5", "1,2,3,4,5,6"].includes(chave) ? chave : "custom";
    if (window.PixChave) PixChave.limpar(qs("#sellerPixTipo"), qs("#sellerPix"), "#sellerPixErro");
    else if (qs("#sellerPix")) qs("#sellerPix").value = "";
    const periodoSelect = qs("#periodoFechamento");
    if (periodoSelect) {
      delete periodoSelect.dataset.tocado;
      delete periodoSelect.dataset.escolhido;
    }
    aplicarPeriodoFechamento(data?.periodo_fechamento);

    const cards = qs("#papelCards");
    if (cards) cards.classList.toggle("d-none", !isOwnerTipoBase());
    let papelInicial = data?.papel || "";
    if (!papelInicial && isOwnerTipoBase()) {
      papelInicial = PAPEL_TAB === "base_parceira" ? "base_parceira" : "seller";
    }
    if (qs("#entregaPedidos")) qs("#entregaPedidos").checked = !!data?.entrega_pedidos;
    selecionarPapelForm(papelInicial);
    limparPrecoPagarForm();
    const cepStatusEl = qs("#sellerCepStatus");
    if (cepStatusEl) {
      cepStatusEl.textContent = "";
      cepStatusEl.className = "small mt-1 d-none";
    }
    if (data?.id_base && papelInicial === "base_parceira" && data?.entrega_pedidos) {
      carregarPrecoPagar(data.id_base);
    }

    atualizarAjudaCamposSeller();
    formModal.show();
  }

  function ownerTipoAtual() {
    return (
      OWNER_INFO?.tipo_owner ||
      window.TIPO_OWNER ||
      "subbase"
    ).toLowerCase();
  }

  function isOwnerTipoBase() {
    return ownerTipoAtual() === "base";
  }

  function atualizarVisibilidadePortalSeller() {
    const block = qs("#portal-seller-block");
    if (!block) return;
    // Portal do Seller: só papel seller no detalhe (nunca Base parceira).
    block.classList.toggle("d-none", !isSellerSelecionado());
  }

  function selectedBaseRow() {
    const id = SELECTED_ID ? Number(SELECTED_ID) : null;
    if (id == null) return null;
    return DATA_CACHE.find((b) => Number(b.id_base || b.id) === id)
      || DATA_ALL.find((b) => Number(b.id_base || b.id) === id)
      || null;
  }

  function isSellerSelecionado() {
    if (!isOwnerTipoBase()) return false;
    const row = selectedBaseRow();
    return !!(row && (row.papel || "seller") === "seller");
  }

  function subBaseAtual() {
    return String(OWNER_INFO?.sub_base || "").trim();
  }

  function authApi() {
    return window.AuthMarketplace || null;
  }

  async function gerarLinkAuthParaSeller(platform, idBase, nomeBase) {
    const AM = authApi();
    if (!AM) {
      toast("Módulo de autenticação indisponível.", false);
      return;
    }
    const subBase = subBaseAtual();
    if (!subBase && platform === "ml") {
      toast("Sub-base não definida. Ajuste o cadastro do usuário.", false);
      return;
    }
    try {
      await AM.gerarECopiar(platform, subBase, {
        context: {
          id_base: Number(idBase),
          nome: nomeBase || "",
          platform: platform === "ml" ? "mercado_livre" : "shopee",
        },
      });
      toast("Link copiado. Envie ao seller para autorizar a conta.");
    } catch (err) {
      toast(err.message || "Falha ao gerar link.", false);
    }
  }

  function statusLabelConta(status, temDetalhe) {
    if (!temDetalhe) return { texto: "Vinculada", classe: "bg-secondary-subtle text-secondary" };
    if (status === "expirado") return { texto: "Sessão expirada", classe: "bg-warning-subtle text-warning" };
    if (status === "requer_reautorizacao") return { texto: "Requer nova autorização", classe: "bg-danger-subtle text-danger" };
    return { texto: "Conectada", classe: "bg-success-subtle text-success" };
  }

  function htmlContaAuthDetalhe(platKey, contaLeve, contaRica) {
    const isMl = platKey === "ml";
    const nome = isMl
      ? (contaRica?.user_nickname_ml || contaLeve?.nickname || String(contaLeve?.user_id_ml || contaRica?.user_id_ml || ""))
      : (contaRica?.user_nickname_shopee || contaRica?.shop_name || contaLeve?.shop_name || String(contaLeve?.shop_id || contaRica?.shop_id || ""));
    const contaId = isMl
      ? (contaRica?.user_id_ml ?? contaLeve?.user_id_ml)
      : (contaRica?.shop_id ?? contaLeve?.shop_id);
    const st = statusLabelConta(contaRica?.status, !!contaRica);
    const podeSync = !contaRica || contaRica.status === "conectado";
    const sigla = isMl ? "ML" : "Shopee";
    const badgePlat = isMl
      ? '<span class="badge bg-warning-subtle text-warning">ML</span>'
      : '<span class="badge bg-danger-subtle text-danger">Shopee</span>';
    const syncBtn = podeSync
      ? `<button type="button" class="btn btn-soft-primary btn-sm" data-auth-sync="${platKey}" data-auth-conta-id="${contaId}">Sincronizar</button>`
      : `<button type="button" class="btn btn-soft-secondary btn-sm" disabled title="Reautorize a conta para sincronizar">Sincronizar</button>`;
    return `
      <div class="border rounded p-2" data-auth-conta="${sigla}">
        <div class="d-flex flex-wrap align-items-center gap-2 mb-1">
          ${badgePlat}
          <strong class="small">${escapeHtmlPortal(nome)}</strong>
          <span class="badge ${st.classe}">${st.texto}</span>
        </div>
        <div class="d-flex flex-wrap gap-2">
          ${syncBtn}
          <button type="button" class="btn btn-soft-danger btn-sm" data-auth-desvincular="${platKey}" data-auth-conta-id="${contaId}">Desvincular</button>
        </div>
      </div>`;
  }

  function htmlSemContaAuth(platKey) {
    const label = platKey === "ml" ? "Gerar link ML" : "Gerar link Shopee";
    return `
      <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 border rounded p-2">
        <span class="small text-muted">${platKey === "ml" ? "Mercado Livre" : "Shopee"}: sem conta</span>
        <button type="button" class="btn btn-soft-primary btn-sm" data-auth-detail-gerar="${platKey}">${label}</button>
      </div>`;
  }

  async function renderAuthMarketplaceBlock() {
    const block = qs("#auth-marketplace-block");
    const body = qs("#auth-marketplace-body");
    const pending = qs("#auth-marketplace-pending");
    if (!block || !body) return;

    const show = isSellerSelecionado();
    block.classList.toggle("d-none", !show);
    if (!show) {
      body.innerHTML = "";
      if (pending) pending.classList.add("d-none");
      return;
    }

    const row = selectedBaseRow();
    const idBase = Number(row.id_base || row.id);
    const mlContas = Array.isArray(row.ml_contas) ? row.ml_contas : [];
    const shContas = Array.isArray(row.shopee_contas) ? row.shopee_contas : [];

    let mlRica = null;
    let shRica = null;
    const AM = authApi();
    if (AM) {
      try {
        const [mls, shs] = await Promise.all([
          AM.listarContasPlataforma("ml"),
          AM.listarContasPlataforma("shopee"),
        ]);
        mlRica = mls.find((c) => Number(c.id_base) === idBase) || null;
        shRica = shs.find((c) => Number(c.id_base) === idBase) || null;
      } catch (_) {}
    }

    const partes = [];
    if (mlRica || mlContas[0]) {
      partes.push(htmlContaAuthDetalhe("ml", mlContas[0], mlRica));
    } else {
      partes.push(htmlSemContaAuth("ml"));
    }
    if (shRica || shContas[0]) {
      partes.push(htmlContaAuthDetalhe("shopee", shContas[0], shRica));
    } else {
      partes.push(htmlSemContaAuth("shopee"));
    }
    body.innerHTML = partes.join("");

    await atualizarBannerVinculoPendente(idBase, row.base || "");
  }

  async function atualizarBannerVinculoPendente(idBase, nomeBase) {
    const pending = qs("#auth-marketplace-pending");
    if (!pending) return;
    const AM = authApi();
    if (!AM) {
      pending.classList.add("d-none");
      return;
    }
    const ctx = AM.getPendingSellerContext();
    if (!ctx || Number(ctx.id_base) !== Number(idBase)) {
      pending.classList.add("d-none");
      pending.innerHTML = "";
      return;
    }
    const platFiltro = ctx.platform === "shopee" ? "shopee" : "ml";
    let contasLivres = [];
    try {
      contasLivres = await AM.listarContasSemSeller(platFiltro);
    } catch (_) {}
    if (!contasLivres.length) {
      pending.classList.add("d-none");
      return;
    }
    if (contasLivres.length > 1) {
      pending.classList.remove("d-none");
      pending.innerHTML = `
        Há ${contasLivres.length} contas sem seller nesta plataforma.
        <a href="tracking-autenticacao.html" class="alert-link ms-1">Escolher em Autenticação</a>`;
      return;
    }
    const preferida = contasLivres[0];
    const nick = preferida.user_nickname_ml || preferida.user_nickname_shopee || preferida.shop_name
      || String(preferida.user_id_ml || preferida.shop_id || "");
    const plat = preferida.platform === "shopee" ? "shopee" : "ml";
    const contaId = preferida.user_id_ml != null ? preferida.user_id_ml : preferida.shop_id;
    pending.classList.remove("d-none");
    pending.innerHTML = `
      Conta conectada (${escapeHtmlPortal(nick)}).
      <button type="button" class="btn btn-sm btn-warning ms-2"
        data-auth-vincular-pendente="${plat}"
        data-auth-conta-id="${contaId}"
        data-auth-id-base="${idBase}">
        Vincular a ${escapeHtmlPortal(nomeBase || ctx.nome || "este seller")}
      </button>`;
  }

  function papelFormAtual() {
    return (qs("#basePapel")?.value || "").trim();
  }

  function atualizarAjudaCamposSeller() {
    const papel = papelFormAtual();
    const exigeSeller = isOwnerTipoBase() && papel !== "base_parceira";
    const cnpjHelp = qs("#sellerCnpjHelp");
    const cepHelp = qs("#sellerCepHelp");
    if (cnpjHelp) {
      cnpjHelp.textContent = exigeSeller
        ? "Obrigatório para Seller."
        : isOwnerTipoBase()
          ? "Opcional para Base parceira."
          : "Opcional quando o owner for do tipo Subbase.";
    }
    if (cepHelp) {
      cepHelp.textContent = exigeSeller
        ? "Digite o CEP completo (8 dígitos) para preencher o endereço. Obrigatório para Seller."
        : "Opcional. Digite o CEP completo (8 dígitos) para preencher o endereço.";
    }
    // Portal fica no detalhe (não no modal); visibilidade só via isSellerSelecionado.
    atualizarVisibilidadePortalSeller();
  }

  function formPayload() {
    const payload = {
      base: normalizeNome(qs("#base").value || ""),
      ml: parseMoeda(qs("#flex").value),
      shopee: parseMoeda(qs("#shopee").value),
      avulso: parseMoeda(qs("#avulso").value),
      ativo: qs("#ativo").checked,
      dias_coleta: qsa(".dia-coleta:checked").map((el) => Number(el.value)),
      agenda_coleta_confirmada: qs("#agendaConfirmada").checked,
      periodo_fechamento: periodoFechamentoDoFormulario(),
    };
    if (isOwnerTipoBase()) {
      payload.papel = papelFormAtual() || null;
      if (payload.papel === "base_parceira") {
        payload.entrega_pedidos = !!qs("#entregaPedidos")?.checked;
      }
    }
    return payload;
  }

  let PORTAL_ACCESS = null;

  function portalSellerUrl() {
    try {
      return new URL("portal-login.html", window.location.href).href;
    } catch (_) {
      const base = String(window.location.href || "").split("?")[0].replace(/[^/]*$/, "");
      return base + "portal-login.html";
    }
  }

  function escapeHtmlPortal(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function textoAcessoPortal(login, senha) {
    const linhas = [
      "Portal do Seller — Rotevo",
      "",
      "Link: " + portalSellerUrl(),
      "Login: " + (login || ""),
    ];
    if (senha) linhas.push("Senha temporária: " + senha);
    linhas.push("", "Entre no link, faça login e troque a senha no primeiro acesso.");
    return linhas.join("\n");
  }

  function copiarTextoPortal(texto, okMsg) {
    const done = () => toast(okMsg || "Dados copiados.");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(texto).then(done).catch(() => {
        toast("Não foi possível copiar. Selecione o texto manualmente.", false);
      });
    }
    const ta = document.createElement("textarea");
    ta.value = texto;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      done();
    } catch (_) {
      toast("Não foi possível copiar. Selecione o texto manualmente.", false);
    }
    ta.remove();
    return Promise.resolve();
  }

  function preencherLinkPortal() {
    const url = portalSellerUrl();
    const a = qs("#portal-seller-url");
    if (!a) return;
    a.href = url;
    a.textContent = url;
  }

  function showPortalSenha(login, senha) {
    const url = portalSellerUrl();
    const texto = textoAcessoPortal(login, senha);
    if (window.Swal) {
      Swal.fire({
        icon: "success",
        title: "Acesso ao portal",
        html:
          `<div class="text-start">` +
          `<p class="mb-2"><strong>Link:</strong> <a href="${escapeHtmlPortal(url)}" target="_blank" rel="noopener">${escapeHtmlPortal(url)}</a></p>` +
          `<p class="mb-2"><strong>Login:</strong> ${escapeHtmlPortal(login || "")}</p>` +
          `<p class="mb-3"><strong>Senha temporária:</strong> ${escapeHtmlPortal(senha || "")}</p>` +
          `<button type="button" class="btn btn-primary w-100" id="btnCopiarAcessoPortal">Copiar link e dados de acesso</button>` +
          `<p class="text-muted small mt-3 mb-0">Cole no WhatsApp ou e-mail do seller. A senha temporária não será exibida de novo.</p>` +
          `</div>`,
        confirmButtonText: "Fechar",
        didOpen: () => {
          document.getElementById("btnCopiarAcessoPortal")?.addEventListener("click", () => {
            copiarTextoPortal(texto, "Link e dados copiados. Cole e envie ao seller.");
          });
        },
      });
      return;
    }
    alert(texto);
  }

  async function loadPortalAcesso() {
    const statusEl = qs("#portal-seller-status");
    const btnLib = qs("#btnPortalLiberar");
    const btnReset = qs("#btnPortalReset");
    const btnOff = qs("#btnPortalDesativar");
    PORTAL_ACCESS = null;
    atualizarVisibilidadePortalSeller();
    if (!isSellerSelecionado()) {
      return;
    }
    if (!SELECTED_ID || !statusEl) return;
    try {
      const data = await http(`${API_URL}/portal/acessos?id_base=${encodeURIComponent(SELECTED_ID)}`);
      PORTAL_ACCESS = data;
      const st = data?.status || "sem_acesso";
      if (st === "ativo") {
        statusEl.textContent = `Acesso ativo. Login: ${data.acesso?.login || "—"}.`;
        btnLib?.classList.add("d-none");
        btnReset?.classList.remove("d-none");
        btnOff?.classList.remove("d-none");
      } else if (st === "desativado") {
        statusEl.textContent = "Acesso desativado.";
        btnLib?.classList.add("d-none");
        btnReset?.classList.remove("d-none");
        btnOff?.classList.add("d-none");
      } else {
        statusEl.textContent = data?.endereco_completo
          ? "Sem acesso ao portal."
          : "Complete o endereço do seller para liberar o portal.";
        btnLib?.classList.remove("d-none");
        btnReset?.classList.add("d-none");
        btnOff?.classList.add("d-none");
      }
    } catch (_) {
      statusEl.textContent = "Portal indisponível para esta operação.";
      btnLib?.classList.add("d-none");
      btnReset?.classList.add("d-none");
      btnOff?.classList.add("d-none");
    }
  }

  // =======================================================
  // Importação via planilha (PRD-002)
  // =======================================================
  let IMPORT_PREVIEW = null;
  let importModal = null;

  function formatMoedaImport(valor) {
    if (valor == null || Number.isNaN(Number(valor))) return "—";
    return "R$ " + Number(valor).toFixed(2).replace(".", ",");
  }

  function escapeHtmlImport(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function setImportStep(step) {
    const file = qs("#import-step-file");
    const preview = qs("#import-step-preview");
    const result = qs("#import-step-result");
    const btnAnalisar = qs("#btnImportAnalisar");
    const btnConfirmar = qs("#btnImportConfirmar");
    const btnVoltar = qs("#btnImportVoltar");

    file?.classList.toggle("d-none", step !== "file");
    preview?.classList.toggle("d-none", step !== "preview");
    result?.classList.toggle("d-none", step !== "result");

    btnAnalisar?.classList.toggle("d-none", step !== "file");
    btnConfirmar?.classList.toggle("d-none", step !== "preview");
    btnVoltar?.classList.toggle("d-none", step !== "preview");

    if (step === "preview") {
      const validas = (IMPORT_PREVIEW?.linhas || []).filter(
        (l) => l.acao === "criar" || l.acao === "atualizar"
      ).length;
      if (btnConfirmar) btnConfirmar.disabled = validas === 0;
    }
  }

  function resetImportModal() {
    IMPORT_PREVIEW = null;
    const input = qs("#importFile");
    if (input) input.value = "";
    const tbody = qs("#import-preview-tbody");
    if (tbody) tbody.innerHTML = "";
    const rtbody = qs("#import-result-tbody");
    if (rtbody) rtbody.innerHTML = "";
    ["imp-criar", "imp-atualizar", "imp-erro", "imp-res-criadas", "imp-res-atualizadas", "imp-res-erros"].forEach((id) => {
      const el = qs("#" + id);
      if (el) el.textContent = "0";
    });
    const btnAnalisar = qs("#btnImportAnalisar");
    const btnConfirmar = qs("#btnImportConfirmar");
    if (btnAnalisar) {
      btnAnalisar.disabled = false;
      btnAnalisar.textContent = "Analisar arquivo";
    }
    if (btnConfirmar) {
      btnConfirmar.disabled = false;
      btnConfirmar.textContent = "Confirmar importação";
    }
    setImportStep("file");
  }

  function syncImportModalLabels() {
    const ownerBase = isOwnerTipoBase();
    const help = qs("#importHelpText");
    if (help) {
      help.textContent = ownerBase
        ? "Importe cliente, tipo (seller ou base) e valores (Flex, Shopee e Avulso). Se já existir, os preços e o tipo serão atualizados. CNPJ e endereço você completa depois no sistema."
        : "Importe nome e valores (Flex, Shopee e Avulso). Se já existir, os preços serão atualizados. CNPJ e endereço você completa depois no sistema.";
    }
    const thNome = qs("#importThNome");
    if (thNome) thNome.textContent = ownerBase ? "Cliente" : "Base";
    const thRes = qs("#importResThNome");
    if (thRes) thRes.textContent = ownerBase ? "Cliente" : "Base";
    qs("#importThTipo")?.classList.toggle("d-none", !ownerBase);
  }

  function openImportModal() {
    if (!importModal) {
      const el = qs("#modalImportBases");
      if (!el) return;
      importModal = new bootstrap.Modal(el);
      el.addEventListener("hidden.bs.modal", () => resetImportModal());
    }
    resetImportModal();
    syncImportModalLabels();
    importModal.show();
  }

  function renderImportPreview(data) {
    IMPORT_PREVIEW = data;
    const resumo = data?.resumo || {};
    const setN = (id, v) => {
      const el = qs("#" + id);
      if (el) el.textContent = String(v ?? 0);
    };
    setN("imp-criar", resumo.criar);
    setN("imp-atualizar", resumo.atualizar);
    setN("imp-erro", resumo.erro);

    const tbody = qs("#import-preview-tbody");
    if (!tbody) return;
    const ownerBase = isOwnerTipoBase();
    const colSpan = ownerBase ? 8 : 7;
    const linhas = data?.linhas || [];
    if (!linhas.length) {
      tbody.innerHTML = `<tr><td colspan="${colSpan}" class="text-muted text-center py-3">Nenhuma linha encontrada na planilha.</td></tr>`;
      return;
    }

    tbody.innerHTML = linhas
      .map((l) => {
        const acao = l.acao || "erro";
        let acaoLabel = "Erro";
        let badge = "bg-danger-subtle text-danger";
        if (acao === "criar") {
          acaoLabel = "Criar";
          badge = "bg-success-subtle text-success";
        } else if (acao === "atualizar") {
          acaoLabel = "Atualizar";
          badge = "bg-primary-subtle text-primary";
        }

        let detalhe = l.motivo || "—";
        if (acao === "atualizar" && l.atual) {
          detalhe =
            `Flex ${formatMoedaImport(l.atual.flex)} → ${formatMoedaImport(l.flex)}; ` +
            `Shopee ${formatMoedaImport(l.atual.shopee)} → ${formatMoedaImport(l.shopee)}; ` +
            `Avulso ${formatMoedaImport(l.atual.avulso)} → ${formatMoedaImport(l.avulso)}`;
        } else if (acao === "criar") {
          detalhe = "Nova";
        }

        const tipoCell = ownerBase
          ? `<td>${escapeHtmlImport(l.tipo || (l.papel === "base_parceira" ? "base" : l.papel) || "—")}</td>`
          : "";

        return (
          `<tr>` +
          `<td>${escapeHtmlImport(l.linha)}</td>` +
          `<td>${escapeHtmlImport(l.base || "—")}</td>` +
          tipoCell +
          `<td class="text-end">${acao === "erro" ? "—" : formatMoedaImport(l.flex)}</td>` +
          `<td class="text-end">${acao === "erro" ? "—" : formatMoedaImport(l.shopee)}</td>` +
          `<td class="text-end">${acao === "erro" ? "—" : formatMoedaImport(l.avulso)}</td>` +
          `<td><span class="badge ${badge}">${acaoLabel}</span></td>` +
          `<td class="small">${escapeHtmlImport(detalhe)}</td>` +
          `</tr>`
        );
      })
      .join("");
  }

  function renderImportResult(data) {
    const setN = (id, v) => {
      const el = qs("#" + id);
      if (el) el.textContent = String(v ?? 0);
    };
    setN("imp-res-criadas", data?.criadas);
    setN("imp-res-atualizadas", data?.atualizadas);
    setN("imp-res-erros", data?.erros);

    const tbody = qs("#import-result-tbody");
    if (!tbody) return;
    const detalhes = data?.detalhes || [];
    if (!detalhes.length) {
      tbody.innerHTML = `<tr><td colspan="4" class="text-muted text-center py-3">Sem detalhes.</td></tr>`;
      return;
    }
    tbody.innerHTML = detalhes
      .map((d) => {
        const st = d.status || "erro";
        let label = st;
        let badge = "bg-secondary-subtle text-secondary";
        if (st === "criada") {
          label = "Criada";
          badge = "bg-success-subtle text-success";
        } else if (st === "atualizada") {
          label = "Atualizada";
          badge = "bg-primary-subtle text-primary";
        } else if (st === "erro") {
          label = "Erro";
          badge = "bg-danger-subtle text-danger";
        }
        return (
          `<tr>` +
          `<td>${escapeHtmlImport(d.linha)}</td>` +
          `<td>${escapeHtmlImport(d.base || "—")}</td>` +
          `<td><span class="badge ${badge}">${label}</span></td>` +
          `<td class="small">${escapeHtmlImport(d.motivo || "—")}</td>` +
          `</tr>`
        );
      })
      .join("");
  }

  async function baixarModeloImport() {
    try {
      const r = await fetch(`${API_URL}/base/import/modelo`, { credentials: "include" });
      if (!r.ok) {
        let msg = "Não foi possível baixar o modelo.";
        try {
          const j = await r.json();
          if (typeof j.detail === "string") msg = j.detail;
        } catch (_) {}
        throw new Error(msg);
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = isOwnerTipoBase()
        ? "modelo-importacao-clientes.xlsx"
        : "modelo-importacao-bases.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast(err.message || "Falha ao baixar o modelo.", false);
    }
  }

  async function analisarArquivoImport() {
    const input = qs("#importFile");
    const file = input?.files?.[0];
    if (!file) {
      toast("Selecione um arquivo .xlsx.", false);
      return;
    }
    const btn = qs("#btnImportAnalisar");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Analisando…";
    }
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(`${API_URL}/base/import/preview`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      if (!r.ok) {
        let msg = "Não foi possível analisar a planilha.";
        try {
          const j = await r.json();
          if (typeof j.detail === "string") msg = j.detail;
        } catch (_) {}
        throw new Error(msg);
      }
      const data = await r.json();
      renderImportPreview(data);
      setImportStep("preview");
    } catch (err) {
      toast(err.message || "Falha ao analisar a planilha.", false);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Analisar arquivo";
      }
    }
  }

  async function confirmarArquivoImport() {
    const validas = (IMPORT_PREVIEW?.linhas || []).filter(
      (l) => l.acao === "criar" || l.acao === "atualizar"
    );
    if (!validas.length) {
      toast("Nenhuma linha válida para importar.", false);
      return;
    }
    const btn = qs("#btnImportConfirmar");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Importando…";
    }
    try {
      const payload = {
        linhas: validas.map((l) => {
          const row = {
            linha: l.linha,
            base: l.base,
            flex: l.flex,
            shopee: l.shopee,
            avulso: l.avulso,
          };
          if (l.papel) row.papel = l.papel;
          else if (l.tipo) row.tipo = l.tipo;
          return row;
        }),
      };
      const data = await http(`${API_URL}/base/import/confirmar`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      renderImportResult(data);
      setImportStep("result");
      qs("#btnImportVoltar")?.classList.add("d-none");
      qs("#btnImportConfirmar")?.classList.add("d-none");
      await listarBases();
      const criadas = data?.criadas || 0;
      const atualizadas = data?.atualizadas || 0;
      toast(`Importação concluída: ${criadas} criada(s), ${atualizadas} atualizada(s).`);
    } catch (err) {
      toast(err.message || "Falha ao confirmar a importação.", false);
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Confirmar importação";
      }
    }
  }

  // =======================================================
  // Eventos
  // =======================================================
  document.addEventListener("DOMContentLoaded", async () => {
    if (window.PixChave) PixChave.ligar(qs("#sellerPixTipo"), qs("#sellerPix"), "#sellerPixErro");
    qs("#periodoFechamento")?.addEventListener("change", (ev) => {
      ev.currentTarget.dataset.tocado = "1";
      ev.currentTarget.dataset.escolhido = codigoPeriodoFechamento(ev.currentTarget.value);
    });
    qs("#oc-form")?.addEventListener("shown.bs.modal", () => {
      aplicarPeriodoFechamento(qs("#periodoFechamento")?.dataset.carregado);
    });
    preencherLinkPortal();
    await carregarOwnerInfo();
    atualizarVisibilidadePortalSeller();
    atualizarAjudaCamposSeller();

    const perPageSelect = qs("#perPage");
    if (perPageSelect) {
      const val = parseInt(perPageSelect.value, 10);
      if (!Number.isNaN(val) && val > 0) PER_PAGE = val;
      perPageSelect.addEventListener("change", () => {
        const v = parseInt(perPageSelect.value, 10);
        PER_PAGE = !Number.isNaN(v) && v > 0 ? v : 10;
        CURRENT_PAGE = 1;
        renderPage();
      });
    }

    const usuario = typeof window.ensureAuthUser === "function" ? await window.ensureAuthUser() : window.__USER__;
    const agendaCard = qs("#agendaColetaCard");
    const coletaHabilitada = !(usuario?.ignorar_coleta === true || window.IGNORAR_COLETA === true);
    agendaCard?.classList.toggle("d-none", !coletaHabilitada);

    await listarBases();
    await carregarSellerDados();

    qs("#agendaPreset")?.addEventListener("change", (ev) => {
      if (ev.target.value === "custom") return;
      const dias = new Set(ev.target.value.split(",").map(Number));
      qsa(".dia-coleta").forEach((el) => { el.checked = dias.has(Number(el.value)); });
    });
    qsa(".dia-coleta").forEach((el) => el.addEventListener("change", () => {
      const chave = qsa(".dia-coleta:checked").map((item) => Number(item.value)).sort((a, b) => a - b).join(",");
      qs("#agendaPreset").value = ["1,2,3,4,5", "1,2,3,4,5,6"].includes(chave) ? chave : "custom";
    }));

    // Máscaras e auto-preenchimento dos campos de CNPJ/CEP do Seller/Base
    const cnpjEl = qs("#sellerCnpj");
    if (cnpjEl) {
      cnpjEl.addEventListener("input", (ev) => {
        ev.target.value = maskCnpj(ev.target.value);
      });
    }

    const cepEl = qs("#sellerCep");
    const cepStatus = qs("#sellerCepStatus");
    function setCepStatus(msg, ok) {
      if (!cepStatus) return;
      if (!msg) {
        cepStatus.textContent = "";
        cepStatus.className = "small mt-1 d-none";
        return;
      }
      cepStatus.textContent = msg;
      cepStatus.className = ok
        ? "small mt-1 text-success"
        : "small mt-1 text-danger";
    }

    if (cepEl) {
      cepEl.addEventListener("input", (ev) => {
        ev.target.value = maskCep(ev.target.value);
        const digits = (ev.target.value || "").replace(/\D/g, "");
        if (digits.length < 8) setCepStatus("");
      });

      async function buscarCepSeller() {
        const raw = (cepEl.value || "").replace(/\D/g, "");
        if (!raw) {
          setCepStatus("");
          return;
        }
        if (raw.length !== 8) {
          setCepStatus("CEP incompleto. Informe 8 dígitos.", false);
          return;
        }
        setCepStatus("Buscando endereço…", true);
        try {
          const data = await lookupCep(raw);
          if (data && !data.erro) {
            qs("#sellerRua").value = data.logradouro || "";
            qs("#sellerBairro").value = data.bairro || "";
            qs("#sellerCidade").value = data.localidade || "";
            qs("#sellerEstado").value = data.uf || "";
            setCepStatus("Endereço preenchido. Confira e informe o número.", true);
            qs("#sellerNumero")?.focus();
          } else {
            setCepStatus("CEP não encontrado. Preencha o endereço manualmente.", false);
          }
        } catch (e) {
          setCepStatus(e?.message || "Não foi possível consultar o CEP. Preencha o endereço manualmente.", false);
        }
      }

      cepEl.addEventListener("blur", buscarCepSeller);
      cepEl.addEventListener("keyup", function (ev) {
        if (ev.key === "Enter" || (this.value || "").replace(/\D/g, "").length === 8) {
          buscarCepSeller();
        }
      });
    }

    const tbody = qs("#tbody-bases");
    tbody?.addEventListener("click", (e) => {
      const tr = e.target.closest("tr.row-selectable");
      if (!tr) return;
      qsa("#tbody-bases tr").forEach((r) => r.classList.remove("table-active"));
      tr.classList.add("table-active");
      SELECTED_ID = tr.dataset.id;
      qs("#btnHeaderEdit").disabled = false;
      qs("#btnHeaderDel").disabled = false;
      loadSellerDetail();
    });

    qs("#search")?.addEventListener("input", () => {
      CURRENT_PAGE = 1;
      aplicarFiltroPapelEBusca();
      renderPage();
    });
    qs("#toggleAtivos")?.addEventListener("change", () => {
      CURRENT_PAGE = 1;
      listarBases();
    });
    qs("#clientesPapelTabs")?.addEventListener("click", (ev) => {
      const btn = ev.target.closest("[data-papel-tab]");
      if (!btn) return;
      PAPEL_TAB_USER_SET = true;
      PAPEL_TAB = btn.getAttribute("data-papel-tab") || "seller";
      syncPapelTabsActive();
      atualizarUiClientesOwnerBase();
      CURRENT_PAGE = 1;
      aplicarFiltroPapelEBusca();
      renderPage();
      showSellerDetailEmpty();
      SELECTED_ID = null;
      qs("#btnHeaderEdit").disabled = true;
      qs("#btnHeaderDel").disabled = true;
    });

    qs("#tbody-bases")?.addEventListener("click", async (ev) => {
      const item = ev.target.closest("[data-auth-platform]");
      if (!item) return;
      ev.preventDefault();
      ev.stopPropagation();
      const id = item.getAttribute("data-auth-id");
      const platform = item.getAttribute("data-auth-platform");
      const row = DATA_CACHE.find((b) => String(b.id_base || b.id) === String(id))
        || DATA_ALL.find((b) => String(b.id_base || b.id) === String(id));
      await gerarLinkAuthParaSeller(platform, id, row?.base || "");
    });

    qs("#auth-marketplace-block")?.addEventListener("click", async (ev) => {
      const gerar = ev.target.closest("[data-auth-detail-gerar]");
      if (gerar) {
        const platform = gerar.getAttribute("data-auth-detail-gerar");
        const row = selectedBaseRow();
        if (!row) return;
        await gerarLinkAuthParaSeller(platform, row.id_base || row.id, row.base || "");
        return;
      }
      const syncBtn = ev.target.closest("[data-auth-sync]");
      if (syncBtn) {
        const AM = authApi();
        if (!AM) return;
        const platform = syncBtn.getAttribute("data-auth-sync");
        const contaId = syncBtn.getAttribute("data-auth-conta-id");
        syncBtn.disabled = true;
        try {
          const data = await AM.syncEnvios(platform, contaId);
          const n = data?.novos != null ? data.novos : (data?.criados != null ? data.criados : null);
          toast(n != null ? `Sincronização concluída (${n} novo(s)).` : "Sincronização concluída.");
        } catch (err) {
          toast(err.message || "Falha ao sincronizar.", false);
        } finally {
          syncBtn.disabled = false;
        }
        return;
      }
      const desv = ev.target.closest("[data-auth-desvincular]");
      if (desv) {
        const AM = authApi();
        if (!AM) return;
        const platform = desv.getAttribute("data-auth-desvincular");
        const contaId = desv.getAttribute("data-auth-conta-id");
        if (!window.confirm("Desvincular esta conta deste seller?")) return;
        desv.disabled = true;
        try {
          await AM.patchVinculo(platform, contaId, null);
          toast("Conta desvinculada.");
          await listarBases();
          if (SELECTED_ID) await loadSellerDetail();
        } catch (err) {
          toast(err.message || "Não foi possível desvincular.", false);
        } finally {
          desv.disabled = false;
        }
        return;
      }
      const vinc = ev.target.closest("[data-auth-vincular-pendente]");
      if (vinc) {
        const AM = authApi();
        if (!AM) return;
        const platform = vinc.getAttribute("data-auth-vincular-pendente");
        const contaId = vinc.getAttribute("data-auth-conta-id");
        const idBase = vinc.getAttribute("data-auth-id-base");
        vinc.disabled = true;
        try {
          await AM.patchVinculo(platform, contaId, idBase);
          AM.clearPendingSellerContext();
          toast("Conta vinculada a este seller.");
          await listarBases();
          SELECTED_ID = String(idBase);
          await loadSellerDetail();
        } catch (err) {
          const det = err.detalhe && err.detalhe.detail;
          const code = det && det.code;
          if (err.status === 409 || code === "seller_ja_vinculado") {
            toast(err.message || "Este seller já possui outra conta nesta plataforma.", false);
          } else {
            toast(err.message || "Não foi possível vincular.", false);
          }
        } finally {
          vinc.disabled = false;
        }
      }
    });
    qsa(".papel-card").forEach((btn) => {
      btn.addEventListener("click", () => selecionarPapelForm(btn.getAttribute("data-papel")));
    });
    qs("#entregaPedidos")?.addEventListener("change", async () => {
      selecionarPapelForm(papelFormAtual());
      const ligado = !!qs("#entregaPedidos")?.checked;
      if (ligado && papelFormAtual() === "base_parceira") {
        // Não sobrescreve se já carregou preço próprio nesta abertura do form.
        if (!PRECO_PAGAR_CARREGADO) {
          await garantirPrecoPagarNoFormulario();
        } else if (!qs("#pagarShopee")?.value?.trim() && !qs("#pagarMl")?.value?.trim() && !qs("#pagarAvulso")?.value?.trim()) {
          await garantirPrecoPagarNoFormulario();
        }
      }
    });

    const pgPrev = qs("#pg-prev");
    const pgNext = qs("#pg-next");
    const pgNumbers = qs("#pg-numbers");

    pgPrev?.addEventListener("click", (e) => {
      e.preventDefault();
      const { total } = getPagedData();
      if (total === 0) return;
      if (CURRENT_PAGE > 1) {
        CURRENT_PAGE -= 1;
        renderPage();
      }
    });

    pgNext?.addEventListener("click", (e) => {
      e.preventDefault();
      const { totalPages, total } = getPagedData();
      if (total === 0) return;
      if (CURRENT_PAGE < totalPages) {
        CURRENT_PAGE += 1;
        renderPage();
      }
    });

    pgNumbers?.addEventListener("click", (e) => {
      const li = e.target.closest("li[data-page]");
      if (!li) return;
      e.preventDefault();
      const page = parseInt(li.getAttribute("data-page"), 10);
      if (!Number.isNaN(page) && page >= 1) {
        CURRENT_PAGE = page;
        renderPage();
      }
    });


    const openNovaBase = () => {
      openForm("create");
      qs("#btnHeaderEdit").disabled = true;
      qs("#btnHeaderDel").disabled = true;
    };

    qs("#btnAdd")?.addEventListener("click", openNovaBase);
    qs("#btnAddManual")?.addEventListener("click", openNovaBase);
    qs("#btnImportPlanilha")?.addEventListener("click", () => openImportModal());
    qs("#btnBaixarModeloImport")?.addEventListener("click", () => baixarModeloImport());
    qs("#btnImportAnalisar")?.addEventListener("click", () => analisarArquivoImport());
    qs("#btnImportConfirmar")?.addEventListener("click", () => confirmarArquivoImport());
    qs("#btnImportVoltar")?.addEventListener("click", () => {
      IMPORT_PREVIEW = null;
      setImportStep("file");
    });

    qs("#btnPortalLiberar")?.addEventListener("click", async () => {
      if (!SELECTED_ID || !isOwnerTipoBase()) return;
      try {
        const data = await http(`${API_URL}/portal/acessos`, {
          method: "POST",
          body: JSON.stringify({ id_base: Number(SELECTED_ID) }),
        });
        showPortalSenha(data.login, data.senha_temporaria);
        await loadPortalAcesso();
      } catch (err) {
        toast(err.message || "Não foi possível liberar o portal.", false);
      }
    });

    qs("#btnPortalReset")?.addEventListener("click", async () => {
      const id = PORTAL_ACCESS?.acesso?.id;
      if (!id || !isOwnerTipoBase()) return;
      try {
        const data = await http(`${API_URL}/portal/acessos/${id}/reset-senha`, { method: "POST", body: "{}" });
        showPortalSenha(data.login, data.senha_temporaria);
        await loadPortalAcesso();
      } catch (err) {
        toast(err.message || "Não foi possível resetar a senha.", false);
      }
    });

    qs("#btnPortalDesativar")?.addEventListener("click", async () => {
      const id = PORTAL_ACCESS?.acesso?.id;
      if (!id || !isOwnerTipoBase()) return;
      try {
        await http(`${API_URL}/portal/acessos/${id}`, {
          method: "POST",
          body: JSON.stringify({ ativo: false }),
        });
        toast("Acesso ao portal desativado.");
        await loadPortalAcesso();
      } catch (err) {
        toast(err.message || "Não foi possível desativar o acesso.", false);
      }
    });

    qs("#btnCopiarLinkPortal")?.addEventListener("click", () => {
      if (!isOwnerTipoBase()) return;
      const login = PORTAL_ACCESS?.acesso?.login || "";
      if (!login) {
        copiarTextoPortal(
          "Portal do Seller — Rotevo\n\nLink: " + portalSellerUrl() + "\n\nAinda sem login liberado para este seller.",
          "Link copiado. Liberar acesso para gerar o login."
        );
        return;
      }
      const texto =
        "Portal do Seller — Rotevo\n\n" +
        "Link: " + portalSellerUrl() + "\n" +
        "Login: " + login + "\n\n" +
        "Se o seller ainda não tiver senha, use Resetar senha e copie os dados do aviso.";
      copiarTextoPortal(texto, "Link e login copiados. Cole e envie ao seller.");
    });

    qs("#btnHeaderEdit")?.addEventListener("click", async () => {
      if (!SELECTED_ID) return;
      try {
        const data = await apiGet(SELECTED_ID);
        openForm("edit", data);
        // Carregar Dados do Seller/Base para a base selecionada (preenche CNPJ, CEP, endereço no modal)
        if (OWNER_INFO?.id_owner) {
          const baseId = data?.id_base ?? data?.id ?? Number(SELECTED_ID);
          await carregarSellerDados(baseId);
        }
      } catch (err) {
        toast("Erro ao carregar base.", false);
      }
    });

    qs("#btnHeaderDel")?.addEventListener("click", () => {
      if (!SELECTED_ID) return;
      const modal = new bootstrap.Modal("#modalDelete");
      modal.show();
      qs("#btnConfirmDelete").onclick = async () => {
        try {
          await apiDelete(SELECTED_ID);
          toast("Base excluída.");
          await listarBases();
          modal.hide();
          SELECTED_ID = null;
          qs("#btnHeaderEdit").disabled = true;
          qs("#btnHeaderDel").disabled = true;
        } catch (err) {
          toast("Erro ao excluir base.", false);
        }
      };
    });

    qs("#formBase")?.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const form = ev.currentTarget;
      if (!form.checkValidity()) {
        form.classList.add("was-validated");
        return;
      }

      const id = qs("#baseId").value.trim();
      const payload = formPayload();

      // Validação adicional de CNPJ/Endereço do Seller/Base
      const ownerTipo = ownerTipoAtual();
      const cnpjDig = onlyDigits(qs("#sellerCnpj")?.value || "");
      const cepDig = onlyDigits(qs("#sellerCep")?.value || "");
      const rua = (qs("#sellerRua")?.value || "").trim();
      const numero = (qs("#sellerNumero")?.value || "").trim();
      const bairro = (qs("#sellerBairro")?.value || "").trim();
      const cidade = (qs("#sellerCidade")?.value || "").trim();
      const estado = (qs("#sellerEstado")?.value || "").trim();
      const complemento = (qs("#sellerComplemento")?.value || "").trim();
      const pix = window.PixChave
        ? PixChave.ler(qs("#sellerPixTipo"), qs("#sellerPix"))
        : { tipo: null, chave: (qs("#sellerPix")?.value || "").trim() || null, erro: "" };

      const errosSeller = [];
      const papelSel = papelFormAtual();
      if (ownerTipo === "base" && !papelSel) {
        errosSeller.push("Escolha se o cliente é Seller ou Base.");
      }
      const exigeSeller = ownerTipo === "base" && papelSel !== "base_parceira";
      const baseComCnpj = papelSel === "base_parceira" && !!cnpjDig;
      if (exigeSeller || baseComCnpj) {
        const ot = (k) => (typeof window.ownerTerm === "function" ? window.ownerTerm(k) : k);
        if (!cnpjDig) errosSeller.push(ot("cnpj_obrigatorio_entidade"));
        if (cepDig.length !== 8) errosSeller.push(ot("cep_obrigatorio_entidade"));
        if (!rua) errosSeller.push(ot("rua_obrigatoria_entidade"));
        if (!numero) errosSeller.push(ot("numero_obrigatorio_entidade"));
        if (!bairro) errosSeller.push(ot("bairro_obrigatorio_entidade"));
        if (!cidade) errosSeller.push(ot("cidade_obrigatoria_entidade"));
      }

      if (pix.erro) errosSeller.push(pix.erro);
      if (window.PixChave) PixChave.mostrarErro(qs("#sellerPix"), "#sellerPixErro", pix.erro);

      if (errosSeller.length) {
        toast(errosSeller.join(" "), false);
        return;
      }

      try {
        let baseIdForSeller = id ? Number(id) : null;

        if (id) {
          const updated = await apiUpdate(id, payload);
          baseIdForSeller = updated?.id_base || Number(id);
        } else {
          const created = await apiCreate(payload);
          baseIdForSeller = created?.id_base || null;
        }

        if (
          baseIdForSeller != null &&
          payload.papel === "base_parceira" &&
          payload.entrega_pedidos
        ) {
          try {
            await salvarPrecoPagar(baseIdForSeller);
          } catch (errPagar) {
            toast(errPagar.message || "Cliente salvo, mas falhou o preço a pagar.", false);
            formModal.hide();
            await listarBases();
            return;
          }
        }

        // Atualiza CNPJ/endereço do Seller; Base parceira só grava se houver CNPJ/endereço.
        const deveSalvarSellerDados =
          OWNER_INFO &&
          OWNER_INFO.id_owner &&
          baseIdForSeller != null &&
          (exigeSeller || baseComCnpj || pix.chave || (qs("#sellerPix")?.value || "").trim());
        if (deveSalvarSellerDados) {
          const bodySeller = {
            base_id: baseIdForSeller,
            cnpj: cnpjDig || null,
            cep: cepDig || null,
            rua: rua || null,
            numero: numero || null,
            complemento: complemento || null,
            bairro: bairro || null,
            cidade: cidade || null,
            estado: estado || null,
            chave_pix: pix.chave,
            chave_pix_tipo: pix.tipo,
          };
          const rSeller = await fetch(`${API_URL}/owner/${encodeURIComponent(OWNER_INFO.id_owner)}/seller-dados`, {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(bodySeller),
          });
          if (!rSeller.ok) {
            const errBody = await rSeller.json().catch(() => ({}));
            const detalhe = errBody.detail || errBody.message;
            const msg = typeof detalhe === "string" && detalhe
              ? detalhe
              : (typeof window.ownerTerm === "function" ? window.ownerTerm("falha_salvar_dados") : "Falha ao salvar dados da Base.");
            if (window.PixChave && /chave PIX|CPF inválido|CNPJ inválido|Celular inválido|E-mail inválido|Chave aleatória/.test(msg)) {
              PixChave.mostrarErro(qs("#sellerPix"), "#sellerPixErro", msg);
            }
            // Seller novo: se CNPJ/endereço falhar, o cliente não permanece gravado.
            if (!id && exigeSeller && baseIdForSeller != null) {
              try {
                await http(`${API_BASES}${encodeURIComponent(baseIdForSeller)}`, { method: "DELETE" });
              } catch (_) {}
              await listarBases();
            }
            toast(msg, false);
            return;
          }
        }

        toast(id
          ? (typeof window.ownerTerm === "function" ? window.ownerTerm("base_atualizada") : "Base atualizada com sucesso.")
          : (typeof window.ownerTerm === "function" ? window.ownerTerm("base_criada") : "Base criada com sucesso."));
        formModal.hide();
        await listarBases();
      } catch (err) {
        if (err.status === 409) {
          toast("Já existe uma base com esse nome.", false);
        } else {
          toast("Erro ao salvar base.", false);
        }
      }
    });
  });
})();
