/* ======================================================
   TrackSaídas — Resumo de Coletas (com paginação real)
   Compatível com /coletas/resumo (items + total)
   ====================================================== */

(function checkAcessoColetasResumo() {
  var ignorar = window.IGNORAR_COLETA === true || localStorage.getItem("ignorar_coleta") === "1";
  var modo = window.MODO_OPERACAO || "codigo";
  if (ignorar && modo !== "coleta_manual") {
    window.location.replace("dashboard-tracking-overview.html");
    return;
  }
})();

document.addEventListener("DOMContentLoaded", async () => {
  var ignorar = window.IGNORAR_COLETA === true;
  var modo = window.MODO_OPERACAO || "codigo";
  if (ignorar && modo !== "coleta_manual") {
    window.location.replace("dashboard-tracking-overview.html");
    return;
  }
  setTimeout(function () {
    ignorar = window.IGNORAR_COLETA === true;
    modo = window.MODO_OPERACAO || "codigo";
    if (ignorar && modo !== "coleta_manual") {
      window.location.replace("dashboard-tracking-overview.html");
      return;
    }
  }, 600);

  // ====== CACHE GLOBAL (cancelados) ======
  let cacheCancelados = null;
  let cacheCanceladosKey = "";


  // ====== APIs ======
  const API_URL      = `${window.TRACK_API_URL}/coletas/resumo`;
  const API_BASES    = `${window.TRACK_API_URL}/base/`;
  const API_SAIDAS   = `${window.TRACK_API_URL}/saidas/listar`;
  const API_MANUAL   = `${window.TRACK_API_URL}/coletas/manual`;
  const API_AUTH_ME  = `${window.TRACK_API_URL}/auth/me`;

  // ====== Helpers ======
  const qs  = (s) => document.querySelector(s);
  const qsa = (s) => Array.from(document.querySelectorAll(s));

  const formatarMoeda = (v) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

  function fmtDMY(ymd) {
    if (!ymd) return "";
    const [y, m, d] = String(ymd).split("-");
    return d && m && y ? `${d}/${m}/${y}` : ymd;
  }

  function updatePeriodLabel(from, to) {
    const label = document.getElementById("coletas-resumo-period-label");
    if (!label) return;
    if (from && to) label.textContent = fmtDMY(from) + " — " + fmtDMY(to);
    else label.textContent = "Período";
  }

  function addOneDayYMD(str) {
    if (!str) return "";
    const dt = new Date(str);
    dt.setDate(dt.getDate() + 1);
    return dt.toISOString().slice(0,10);
  }

  // ====== Elementos ======
  const fltFrom = qs("#flt-from");
  const fltTo   = qs("#flt-to");
  const fltBase = qs("#flt-base");

  const tbody = qs("#coletas-resumo-table tbody");
  const btnGerar = document.getElementById("btnGerarCobranca");
  const btnColetaManual = document.getElementById("btnColetaManual");
  const thAcoes = document.getElementById("th-acoes");

  let modoOperacao = "codigo";

  // ====== PAGINAÇÃO ======
  const state = {
    page: 1,
    pageSize: 200,
    total: 0,
    items: []
  };

  const pagerFirst   = qs("#pager-first");
  const pagerPrev    = qs("#pager-prev");
  const pagerNext    = qs("#pager-next");
  const pagerLast    = qs("#pager-last");
  const pagerInfo    = qs("#pager-info");
  const pagerSummary = qs("#pager-summary");

function updatePager() {
    const totalPages = Math.max(1, Math.ceil(state.total / state.pageSize));
    const page = state.page;

    const start = (page - 1) * state.pageSize + 1;
    const end = Math.min(state.total, page * state.pageSize);

    pagerInfo.textContent = `Exibindo ${start} a ${end} de ${state.total} registros`;
    pagerSummary.textContent = `Página ${page} de ${totalPages}`;

    pagerFirst.disabled = page <= 1;
    pagerPrev.disabled  = page <= 1;
    pagerNext.disabled  = page >= totalPages;
    pagerLast.disabled  = page >= totalPages;
}


  pagerFirst.onclick = () => { state.page = 1; carregarResumo(); };
  pagerPrev.onclick  = () => { if (state.page > 1) { state.page--; carregarResumo(); } };
  pagerNext.onclick  = () => {
    const tp = Math.ceil(state.total / state.pageSize);
    if (state.page < tp) { state.page++; carregarResumo(); }
  };
  pagerLast.onclick = () => {
    state.page = Math.ceil(state.total / state.pageSize);
    carregarResumo();
  };

  // ====== Obter modo_operacao ======
  async function obterModoOperacao() {
    if (window.__USER__?.modo_operacao) {
      modoOperacao = window.__USER__.modo_operacao;
      return;
    }
    try {
      const res = await fetch(API_AUTH_ME, { credentials: "include", headers: { Accept: "application/json" } });
      if (res.ok) {
        const user = await res.json();
        modoOperacao = user?.modo_operacao || "codigo";
      }
    } catch (_) {}
  }

  // ====== Carregar Bases ======
  async function carregarBases() {
    try {
      const res  = await fetch(API_BASES, { credentials: "include" });
      const data = await res.json();
      fltBase.innerHTML = `<option value="">(Todas)</option>`;
      data.forEach((b) => {
        fltBase.innerHTML += `<option value="${b.base}">${b.base}</option>`;
      });
    } catch (err) {
      console.error("Erro ao carregar bases:", err);
    }
  }

  // ====== Carregar Bases para modal (ativas) ======
  async function carregarBasesModal() {
    try {
      const res = await fetch(`${API_BASES}?status=ativo`, { credentials: "include" });
      const data = await res.json();
      const sel = document.getElementById("modalColetaManualBase");
      sel.innerHTML = `<option value="">Selecione...</option>`;
      (data || []).forEach((b) => {
        if (b.base) sel.innerHTML += `<option value="${b.base}">${b.base}</option>`;
      });
    } catch (err) {
      console.error("Erro ao carregar bases para modal:", err);
    }
  }

  // ====== Buscar Cancelados ======
async function buscarCancelados() {

    const base = fltBase.value || "";
    const de   = fltFrom.value || "";
    const ate  = fltTo.value || "";

    const key = `${base}|${de}|${ate}`;

    // Se já existe no cache → retorna imediatamente
    if (cacheCancelados && cacheCanceladosKey === key) {
        return cacheCancelados;
    }

    // Nova consulta → reseta cache
    cacheCancelados = null;
    cacheCanceladosKey = key;

    const params = new URLSearchParams();
    params.append("status", "cancelado");
    if (base) params.append("base", base);
    if (de)   params.append("de", de);
    if (ate)  params.append("ate", ate);

    const res = await fetch(`${API_SAIDAS}?${params.toString()}`, { credentials: "include" });
    const json = await res.json();

    const list = json.items || [];

    cacheCancelados = list.map((s) => {
        const dt = new Date(s.timestamp);
        return {
            base: (s.base || "").trim().toUpperCase(),
            dataISO: dt.toISOString().slice(0, 10)
        };
    });

    return cacheCancelados;
}



  // ====== RENDER ======
  function renderTable(items) {
    const temManual = items.some((r) => r.origem === "manual");
    if (thAcoes) thAcoes.classList.toggle("d-none", !temManual);

    tbody.innerHTML = "";
    items.forEach((r) => {
      const acoesCell = r.origem === "manual" && r.id_coleta
        ? `<td class="text-center no-export"><button type="button" class="btn btn-sm btn-outline-primary btn-editar-coleta" data-id="${r.id_coleta}" data-data="${r.data_raw || r.data}" data-base="${r.base}" data-shopee="${r.shopee}" data-ml="${r.mercado_livre}" data-avulso="${r.avulso}" title="Editar"><i class="ri-pencil-line"></i></button></td>`
        : (temManual ? `<td class="text-center no-export"></td>` : "");
      tbody.innerHTML += `
        <tr>
          <td>${r.data}</td>
          <td>${r.base}</td>
          <td>${r.entregadores}</td>
          <td class="text-center">${r.shopee}</td>
          <td class="text-center">${r.mercado_livre}</td>
          <td class="text-center">${r.avulso}</td>
          <td class="text-center text-danger fw-bold">${r.cancelados}</td>
          <td class="text-center">${formatarMoeda(r.valor_total)}</td>
          ${acoesCell}
        </tr>`;
    });

    tbody.querySelectorAll(".btn-editar-coleta").forEach((btn) => {
      btn.onclick = () => abrirModalEditar(btn);
    });
  }

function atualizarCards(shopee, ml, avulso, valor, canc, totalColetas) {
    qs("#sum-shopee").textContent      = shopee;
    qs("#sum-ml").textContent          = ml;
    qs("#sum-avulso").textContent      = avulso;
    qs("#sum-total").textContent       = totalColetas;       // 👈 agora usa o TOTAL da API
    qs("#sum-cancelados").textContent  = canc;
    qs("#sum-total-valor").textContent = formatarMoeda(valor);
}


 // ======================================================
// ===============   CARREGAR RESUMO   ==================
// ======================================================
async function carregarResumo() {
    qs("#resumoMsg").innerHTML = `<div class="text-muted">Carregando...</div>`;
    tbody.innerHTML = "";

    // Envia a paginação correta exigida pelo backend
    const params = new URLSearchParams({
        page: state.page,
        pageSize: state.pageSize
    });

    // Filtros
    if (fltBase.value) params.append("base", fltBase.value);
    if (fltFrom.value) params.append("data_inicio", fltFrom.value);
    if (fltTo.value)   params.append("data_fim", fltTo.value);

    // Consulta ao backend
    const res = await fetch(`${API_URL}?${params.toString()}`, { credentials: "include" });
    const data = await res.json();

    // Atualiza estado
    state.total = Number(data.totalItems || 0);
    state.items = Array.isArray(data.items) ? data.items : [];

    // ===== Buscar cancelados (não paginado) =====
    const cancelados = await buscarCancelados();
    const mapaCanc = {};
    cancelados.forEach(c => {
        const key = `${c.dataISO}_${c.base}`;
        mapaCanc[key] = (mapaCanc[key] || 0) + 1;
    });

    let totalShopee = 0;
    let totalML = 0;
    let totalAvulso = 0;
    let totalValor = 0;
    let totalCanc = 0;

    // ===== Monta linhas normalizadas =====
    const linhas = state.items.map((r) => {
        const baseKey = (r.base || "").trim().toUpperCase();

        // r.data já vem em YYYY-MM-DD da API
        const dtISO = r.data;
        const dtBR = dtISO.split("-").reverse().join("/");
        const key = `${dtISO}_${baseKey}`;

        const item = {
            data: dtBR,
            data_raw: dtISO,
            base: baseKey,
            entregadores: (r.entregadores || "").toUpperCase(),
            shopee: r.shopee,
            mercado_livre: r.mercado_livre,
            avulso: r.avulso,
            valor_total: Number(r.valor_total),
            cancelados: mapaCanc[key] || 0,
            id_coleta: r.id_coleta || null,
            origem: r.origem || null
        };

        totalShopee += item.shopee;
        totalML     += item.mercado_livre;
        totalAvulso += item.avulso;
        totalValor  += item.valor_total;
        totalCanc   += item.cancelados;

        return item;
    });

    // Atualiza tabela e totais
    renderTable(linhas);
    atualizarCards(
    data.sumShopee,
    data.sumMercado,
    data.sumAvulso,
    data.sumValor,
    data.sumCancelados,
    data.sumTotalColetas
);


    // Atualiza paginação
    updatePager();

    qs("#resumoMsg").innerHTML = "";
}


async function carregarResumoCompleto() {

    const pageSize = 500; // máximo suportado pelo backend
    let page = 1;
    let todos = [];
    let totalItems = 0;

    while (true) {

        const params = new URLSearchParams();

        if (fltBase.value) params.append("base", fltBase.value);
        if (fltFrom.value) params.append("data_inicio", fltFrom.value);
        if (fltTo.value)   params.append("data_fim", fltTo.value);

        params.append("page", page);
        params.append("pageSize", pageSize);

        const res = await fetch(`${API_URL}?${params.toString()}`, {
            credentials: "include"
        });

        if (!res.ok) break;

        const data = await res.json();
        const items = data.items || [];

        totalItems = data.totalItems ?? 0;

        todos.push(...items);

        // Se já coletou tudo → parar
        if (todos.length >= totalItems) break;

        page++;
    }

    // ===== Buscar cancelados =====
    const cancelados = await buscarCancelados();
    const mapaCanc = {};

    cancelados.forEach(c => {
        const key = `${c.dataISO}_${c.base}`;
        mapaCanc[key] = (mapaCanc[key] || 0) + 1;
    });

    // ===== Normalizar igual tabela =====
    return todos.map(r => {

        const baseKey = (r.base || "").trim().toUpperCase();
        const dtISO   = r.data;
        const dtBR    = dtISO.split("-").reverse().join("/");
        const key     = `${dtISO}_${baseKey}`;

        return {
            data: dtISO,             
            data_br: dtBR, 
            base: baseKey,
            entregadores: (r.entregadores || "").toUpperCase(),
            shopee: r.shopee,
            mercado_livre: r.mercado_livre,
            avulso: r.avulso,
            valor_total: Number(r.valor_total),
            cancelados: mapaCanc[key] || 0
        };
    });
}



btnGerar.addEventListener("click", async () => {
    
    const base = (fltBase.value || "").trim();
    if (!base) {
        Swal.fire({
            icon: "warning",
            title: "Selecione uma Base",
            text: "É necessário escolher uma base para gerar a cobrança."
        });
        return;
    }

    Swal.showLoading();

    // 🔥 Buscar todas as linhas com os mesmos filtros aplicados
    const resumoCompleto = await carregarResumoCompleto();

    Swal.close();

    if (!resumoCompleto.length) {
        Swal.fire({
            icon: "info",
            title: "Nenhum dado encontrado",
            text: "Não há dados suficientes para gerar o relatório."
        });
        return;
    }

    // 🔥 Gerar o PDF com TODOS os dados filtrados
    gerarPdfResumoColetas(
        resumoCompleto,
        base,
        fltFrom.value,
        fltTo.value
    );
});


    // ====== Date Picker ======
  let datePickerInstance = null;
  const periodBtn = document.getElementById("coletas-resumo-period-btn");
  if (typeof window.initDatePickerDashboard === "function") {
    datePickerInstance = window.initDatePickerDashboard({
      containerId: "coletas-resumo-date-picker-container",
      prefix: "coletas-resumo-dp",
      defaultPreset: "quinzena-ant",
      onApply: function (start, end) {
        if (fltFrom) fltFrom.value = start;
        if (fltTo) fltTo.value = end;
        updatePeriodLabel(start, end);
        if (typeof bootstrap !== "undefined" && bootstrap.Dropdown && periodBtn) {
          const d = bootstrap.Dropdown.getInstance(periodBtn);
          if (d) d.hide();
        }
        state.page = 1;
        carregarResumo();
      },
      onCancel: function () {
        if (typeof bootstrap !== "undefined" && bootstrap.Dropdown && periodBtn) {
          const d = bootstrap.Dropdown.getInstance(periodBtn);
          if (d) d.hide();
        }
      }
    });
    if (datePickerInstance && datePickerInstance.applyPreset) {
      datePickerInstance.applyPreset("quinzena-ant");
    }
    const r = datePickerInstance ? datePickerInstance.getResolvedRange() : { start: "", end: "" };
    if (fltFrom) fltFrom.value = r.start;
    if (fltTo) fltTo.value = r.end;
    updatePeriodLabel(r.start, r.end);
  }

  // ====== Eventos ======
  qs("#btnFilter").onclick = () => { state.page = 1; carregarResumo(); };
  qs("#btnRefreshResumo").onclick = () => carregarResumo();

  qs("#btnClear").onclick = () => {
    fltBase.value = "";
    if (datePickerInstance && datePickerInstance.applyPreset) {
      datePickerInstance.applyPreset("quinzena-ant");
      const r = datePickerInstance.getResolvedRange();
      if (fltFrom) fltFrom.value = r.start;
      if (fltTo) fltTo.value = r.end;
      updatePeriodLabel(r.start, r.end);
    } else {
      if (fltFrom) fltFrom.value = "";
      if (fltTo) fltTo.value = "";
    }
    state.page = 1;
    carregarResumo();
  };

  qs("#btnExportCsv").onclick = () => {
    const rows = [
      ["Data","Base","Entregador","Shopee","Mercado Livre","Avulso","Cancelados","Valor Total"]
    ];
    qsa("#coletas-resumo-table tbody tr").forEach(tr => {
      const cells = [...tr.querySelectorAll("td:not(.no-export)")].map(td => td.textContent.trim());
      rows.push(cells);
    });
    const blob = new Blob([rows.map(r => r.join(";")).join("\n")], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "resumo-coletas.csv";
    a.click();
  };

  document.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      state.page = 1;
      carregarResumo();
    }
  });

  const selBase  = document.getElementById("flt-base");

  // Estado inicial — sempre desabilitado até escolher uma base
  btnGerar.disabled = true;

  // Ativa somente quando Base ≠ (Todas)
  selBase.addEventListener("change", () => {
    btnGerar.disabled = (selBase.value.trim() === "");
  });

  // ====== Modal Coleta Manual ======
  const modalEl = document.getElementById("modalColetaManual");
  const modalData = document.getElementById("modalColetaManualData");
  const modalBase = document.getElementById("modalColetaManualBase");
  const modalShopee = document.getElementById("modalColetaManualShopee");
  const modalMl = document.getElementById("modalColetaManualMl");
  const modalAvulso = document.getElementById("modalColetaManualAvulso");
  const modalId = document.getElementById("modalColetaManualId");
  const modalSalvar = document.getElementById("modalColetaManualSalvar");

  function abrirModalNova() {
    modalId.value = "";
    modalData.value = new Date().toISOString().slice(0, 10);
    modalBase.value = "";
    modalShopee.value = "0";
    modalMl.value = "0";
    modalAvulso.value = "0";
    modalData.disabled = false;
    modalBase.disabled = false;
    document.getElementById("modalColetaManualLabel").textContent = "Coleta Manual";
    if (modalEl && window.bootstrap?.Modal) {
      const m = new bootstrap.Modal(modalEl);
      m.show();
    }
  }

  async function abrirModalEditar(btn) {
    await carregarBasesModal();
    const id = btn.getAttribute("data-id");
    const dataYmd = btn.getAttribute("data-data");
    const base = btn.getAttribute("data-base") || "";
    const shopee = btn.getAttribute("data-shopee") || "0";
    const ml = btn.getAttribute("data-ml") || "0";
    const avulso = btn.getAttribute("data-avulso") || "0";
    // data-data pode vir como DD/MM/YYYY ou YYYY-MM-DD
    let dataVal = dataYmd;
    if (dataYmd && dataYmd.includes("/")) {
      const [d, m, y] = dataYmd.split("/");
      dataVal = y && m && d ? `${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}` : dataVal;
    }
    modalId.value = id;
    modalData.value = dataVal || new Date().toISOString().slice(0, 10);
    modalBase.value = base;
    modalShopee.value = shopee;
    modalMl.value = ml;
    modalAvulso.value = avulso;
    modalData.disabled = true;
    modalBase.disabled = true;
    document.getElementById("modalColetaManualLabel").textContent = "Editar Coleta Manual";
    if (modalEl && window.bootstrap?.Modal) {
      const m = new bootstrap.Modal(modalEl);
      m.show();
    }
  }

  async function salvarModalColetaManual() {
    const id = modalId.value.trim();
    const data = modalData.value;
    const base = modalBase.value?.trim();
    const shopee = parseInt(modalShopee.value, 10) || 0;
    const ml = parseInt(modalMl.value, 10) || 0;
    const avulso = parseInt(modalAvulso.value, 10) || 0;

    if (!base) {
      Swal.fire({ icon: "warning", title: "Campo obrigatório", text: "Selecione uma base." });
      return;
    }

    modalSalvar.disabled = true;
    try {
      if (id) {
        const res = await fetch(`${API_MANUAL}/${id}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shopee, mercado_livre: ml, avulso })
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.detail || res.statusText || "Erro ao atualizar");
        }
        const coleta = await res.json();
        Swal.fire({ icon: "success", title: "Salvo", text: `Valor total: ${formatarMoeda(coleta.valor_total)}` });
      } else {
        const res = await fetch(API_MANUAL, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data, base, shopee, mercado_livre: ml, avulso })
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.detail || res.statusText || "Erro ao criar");
        }
        const coleta = await res.json();
        Swal.fire({ icon: "success", title: "Coleta criada", text: `Valor total: ${formatarMoeda(coleta.valor_total)}` });
      }
      if (modalEl && window.bootstrap?.Modal) {
        const m = bootstrap.Modal.getInstance(modalEl);
        if (m) m.hide();
      }
      carregarResumo();
    } catch (e) {
      Swal.fire({ icon: "error", title: "Erro", text: e?.message || "Falha ao salvar." });
    } finally {
      modalSalvar.disabled = false;
    }
  }

  if (btnColetaManual) {
    btnColetaManual.onclick = async () => {
      await carregarBasesModal();
      abrirModalNova();
    };
  }
  if (modalSalvar) modalSalvar.onclick = salvarModalColetaManual;

  // =====================================================================

  (async function init() {
    await obterModoOperacao();
    if (btnColetaManual && modoOperacao === "coleta_manual") {
      btnColetaManual.classList.remove("d-none");
    }
    await carregarBases();
    await carregarResumo();
  })();

});
