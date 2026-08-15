// tracking-base.init.js
// =======================================================
// CRUD de Bases de Preço
// =======================================================

(function () {
  "use strict";

  const API_URL = "https://track-saidas-api.onrender.com/api";
  const API_BASES = `${API_URL}/base/`;
  const API_OWNER_ME = `${API_URL}/owner/me`;

  const qs = (s) => document.querySelector(s);
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

  async function lookupCep(cepRaw) {
    const cep = (cepRaw || "").replace(/\D/g, "");
    if (cep.length !== 8) throw new Error("CEP inválido");
    const r = await fetch(`${API_URL}/cep/${cep}`, { credentials: "include" });
    if (r.ok) return r.json();
    // Se o proxy falhou (ex.: 502 no Render), tenta ViaCEP direto
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
    // Tenta pegar o texto do erro
    let errText = "";
    try {
      errText = await r.text();
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
  function buildRow(b) {
    const ativoChecked = b.ativo ? "checked" : "";
    const id = b.id_base || b.id;
    return `
      <tr class="row-selectable" data-id="${id}">
        <td class="text-center"><input class="form-check-input sel-row" type="radio" name="sel-base" value="${id}"></td>
        <td>${b.base || "-"}</td>
        <td>R$ ${Number(b.ml).toFixed(2).replace(".", ",")}</td>
        <td>R$ ${Number(b.shopee).toFixed(2).replace(".", ",")}</td>
        <td>R$ ${Number(b.avulso).toFixed(2).replace(".", ",")}</td>
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
  const offcanvas = new bootstrap.Offcanvas("#oc-form");

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
    setVal("#sellerCep", seller.cep ? maskCep(seller.cep) : "");
    setVal("#sellerRua", seller.rua || "");
    setVal("#sellerNumero", seller.numero || "");
    setVal("#sellerComplemento", seller.complemento || "");
    setVal("#sellerBairro", seller.bairro || "");
    setVal("#sellerCidade", seller.cidade || "");
    setVal("#sellerEstado", seller.estado || "");
  }

  async function carregarSellerDados(baseId = null) {
    if (!OWNER_INFO || !OWNER_INFO.id_owner) return;
    try {
      const url = baseId != null
        ? `${API_URL}/owner/${encodeURIComponent(OWNER_INFO.id_owner)}/seller-dados?base_id=${encodeURIComponent(baseId)}`
        : `${API_URL}/owner/${encodeURIComponent(OWNER_INFO.id_owner)}/seller-dados`;
      const seller = await http(url);
      if (!seller) return;
      preencherFormSellerDados(seller);
    } catch (err) {
      // se 404 ou outro erro, apenas não preenche
    }
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
    setText("#s-cep", seller.cep);
    setText("#s-endereco", endereco);
    setText("#s-cidade-uf", cidadeUf);

    const nomeEl = qs("#seller-detail-nome");
    if (nomeEl) nomeEl.textContent = nomeBase ? `(${nomeBase})` : "";

    wrap.classList.remove("d-none");
    if (empty) empty.classList.add("d-none");
    if (content) content.classList.remove("d-none");
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
        showSellerDetailEmpty(typeof window.ownerTerm === "function" ? window.ownerTerm("sem_dados_detalhe") : "Não há dados de CNPJ e endereço cadastrados para a Base selecionada.");
        return;
      }
      renderSellerDetail(seller);
    } catch (err) {
      // 404 ou outro erro → indica ausência de dados para a entidade selecionada
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

  async function listarBases() {
    try {
      const data = await apiList();
      const term = (qs("#search")?.value || "").toLowerCase();
      const filtrados = data.filter(b =>
        b.base?.toLowerCase().includes(term)
      );
      DATA_CACHE = filtrados;
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

    qs("#baseId").value = data?.id_base || "";
    qs("#base").value = data?.base || "";
    qs("#flex").value = data ? `R$ ${Number(data.ml).toFixed(2).replace(".", ",")}` : "";
    qs("#shopee").value = data ? `R$ ${Number(data.shopee).toFixed(2).replace(".", ",")}` : "";
    qs("#avulso").value = data ? `R$ ${Number(data.avulso).toFixed(2).replace(".", ",")}` : "";
    qs("#ativo").checked = data != null ? !!data.ativo : true;

    offcanvas.show();
  }

  function formPayload() {
    return {
      base: normalizeNome(qs("#base").value || ""),
      ml: parseMoeda(qs("#flex").value),
      shopee: parseMoeda(qs("#shopee").value),
      avulso: parseMoeda(qs("#avulso").value),
      ativo: qs("#ativo").checked,
    };
  }

  // =======================================================
  // Eventos
  // =======================================================
  document.addEventListener("DOMContentLoaded", async () => {
    await carregarOwnerInfo();

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

    await listarBases();
    await carregarSellerDados();

    // Máscaras e auto-preenchimento dos campos de CNPJ/CEP do Seller/Base
    const cnpjEl = qs("#sellerCnpj");
    if (cnpjEl) {
      cnpjEl.addEventListener("input", (ev) => {
        ev.target.value = maskCnpj(ev.target.value);
      });
    }

    const cepEl = qs("#sellerCep");
    if (cepEl) {
      cepEl.addEventListener("input", (ev) => {
        ev.target.value = maskCep(ev.target.value);
      });

      async function buscarCepSeller() {
        const raw = (cepEl.value || "").replace(/\D/g, "");
        if (raw.length === 8) {
          try {
            const data = await lookupCep(raw);
            if (data && !data.erro) {
              qs("#sellerRua").value = data.logradouro || "";
              qs("#sellerBairro").value = data.bairro || "";
              qs("#sellerCidade").value = data.localidade || "";
              qs("#sellerEstado").value = data.uf || "";
              qs("#sellerNumero").focus();
            }
          } catch (e) {
            // falha silenciosa para não travar fluxo
          }
        }
      }

      cepEl.addEventListener("blur", buscarCepSeller);
      cepEl.addEventListener("keyup", function () {
        if ((this.value || "").replace(/\D/g, "").length === 8) buscarCepSeller();
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
      listarBases();
    });
    qs("#toggleAtivos")?.addEventListener("change", () => {
      CURRENT_PAGE = 1;
      listarBases();
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


    qs("#btnAdd")?.addEventListener("click", () => {
      openForm("create");
      qs("#btnHeaderEdit").disabled = true;
      qs("#btnHeaderDel").disabled = true;
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
      const ownerTipo = (OWNER_INFO?.tipo_owner || "subbase").toLowerCase();
      const cnpjDig = onlyDigits(qs("#sellerCnpj")?.value || "");
      const cepDig = onlyDigits(qs("#sellerCep")?.value || "");
      const rua = (qs("#sellerRua")?.value || "").trim();
      const numero = (qs("#sellerNumero")?.value || "").trim();
      const bairro = (qs("#sellerBairro")?.value || "").trim();
      const cidade = (qs("#sellerCidade")?.value || "").trim();
      const estado = (qs("#sellerEstado")?.value || "").trim();
      const complemento = (qs("#sellerComplemento")?.value || "").trim();

      const errosSeller = [];
      if (ownerTipo === "base") {
        const ot = (k) => (typeof window.ownerTerm === "function" ? window.ownerTerm(k) : k);
        if (!cnpjDig) errosSeller.push(ot("cnpj_obrigatorio_entidade"));
        if (cepDig.length !== 8) errosSeller.push(ot("cep_obrigatorio_entidade"));
        if (!rua) errosSeller.push(ot("rua_obrigatoria_entidade"));
        if (!numero) errosSeller.push(ot("numero_obrigatorio_entidade"));
        if (!bairro) errosSeller.push(ot("bairro_obrigatorio_entidade"));
        if (!cidade) errosSeller.push(ot("cidade_obrigatoria_entidade"));
      }

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

        // Atualiza CNPJ/endereço do Seller para este owner/base (um registro por base)
        if (OWNER_INFO && OWNER_INFO.id_owner && baseIdForSeller != null) {
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
          };
          const rSeller = await fetch(`${API_URL}/owner/${encodeURIComponent(OWNER_INFO.id_owner)}/seller-dados`, {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(bodySeller),
          });
          if (!rSeller.ok) {
            const errBody = await rSeller.json().catch(() => ({}));
            const msg = errBody.detail || errBody.message || (typeof window.ownerTerm === "function" ? window.ownerTerm("falha_salvar_dados") : "Falha ao salvar dados da Base.");
            toast(msg, false);
            return;
          }
        }

        toast(id
          ? (typeof window.ownerTerm === "function" ? window.ownerTerm("base_atualizada") : "Base atualizada com sucesso.")
          : (typeof window.ownerTerm === "function" ? window.ownerTerm("base_criada") : "Base criada com sucesso."));
        offcanvas.hide();
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
