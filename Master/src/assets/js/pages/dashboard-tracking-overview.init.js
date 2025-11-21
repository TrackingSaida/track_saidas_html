// Dashboard de visão geral para o Tracking.

(async function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // Utilidades de data
  // ---------------------------------------------------------------------------
  function fmtYMD(d) {
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${mm}-${dd}`;
  }
  function parseYMD(str) {
    if (!str) return null;
    const [y, m, d] = str.split("-").map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  }
  function todayYMD() {
    return fmtYMD(new Date());
  }
  function daysBefore(days) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return fmtYMD(d);
  }

  // ---------------------------------------------------------------------------
  // Helpers de API
  // ---------------------------------------------------------------------------
  const API_BASE = (window.TRACK_API_URL || "").replace(/\/+$/, "");

  async function fetchJson(url) {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return res.json();
  }

  // Busca informações do usuário autenticado
  async function getCurrentUser() {
    try {
      const data = await fetchJson(`${API_BASE}/auth/me`);
      return data || null;
    } catch (err) {
      console.warn("Erro ao obter usuário atual:", err);
      return null;
    }
  }

  // Busca lista de coletas no período
  async function listColetas(from, to) {
    const params = new URLSearchParams();
    if (from) params.set("data_inicio", from);
    if (to) params.set("data_fim", to);
    const url = `${API_BASE}/coletas?${params.toString()}`;
    return fetchJson(url);
  }

  // Busca saídas no período (todas, sem paginação) via endpoint direto
  async function listSaidasRaw(from, to) {
    const params = new URLSearchParams();
    if (from) params.set("de", from);
    if (to) params.set("ate", to);
    // limite alto para garantir todos os registros no intervalo
    params.set("limit", "6000");
    params.set("offset", "0");
    const url = `${API_BASE}/saidas/listar?${params.toString()}`;
    return fetchJson(url);
  }

  // Busca preços das bases para calcular valores cancelados
  async function listBasePrices() {
    try {
      const data = await fetchJson(`${API_BASE}/base`);
      const map = {};
      if (Array.isArray(data)) {
        data.forEach((b) => {
          const nome = (b.base || "").trim();
          if (!nome) return;
          map[nome] = {
            shopee: parseFloat(b.shopee) || 0,
            ml: parseFloat(b.ml) || 0,
            avulso: parseFloat(b.avulso) || 0,
          };
        });
      }
      return map;
    } catch (err) {
      console.warn("Erro ao carregar preços das bases:", err);
      return {};
    }
  }

  // Classifica serviço/origem em uma das chaves shopee, ml, avulso, outros
  function classifyServico(servico) {
    if (!servico) return "outros";
    const v = servico.toString().toLowerCase();
    if (v.includes("shopee")) return "shopee";
    if (v.includes("mercado") || v.includes("ml") || v.includes("flex")) return "ml";
    if (v.includes("avulso")) return "avulso";
    return "outros";
  }

  // Determina se uma saída saiu para entrega (entregue)
  function isSaiuParaEntrega(row) {
    const txt = (row && row.status || "").toString().toLowerCase();
    return /saiu.*entrega/.test(txt);
  }

  // ---------------------------------------------------------------------------
  // Estado e referências de DOM
  // ---------------------------------------------------------------------------
  const elFrom = document.getElementById("dash-from");
  const elTo = document.getElementById("dash-to");
  const btnRefresh = document.getElementById("btn-dash-refresh");
  const zoomGroup = document.getElementById("revenue-zoom-group");

  const greetingEl = document.getElementById("greeting");
  const greetingSubEl = document.getElementById("greeting-sub");

  const kpiGanhosEl = document.getElementById("kpi-ganhos");
  const kpiColetadosEl = document.getElementById("kpi-coletados");
  const kpiEntreguesEl = document.getElementById("kpi-entregues");
  const kpiConversionEl = document.getElementById("kpi-conversion");
  const kpiCanceladosEl = document.getElementById("kpi-cancelados");

  const kpiRevenueTotalEl = document.getElementById("kpi-revenue-total");
  const kpiRevenueAvgEl = document.getElementById("kpi-revenue-avg");
  const kpiRevenueMaxEl = document.getElementById("kpi-revenue-max");
  const revenuePeriodEl = document.getElementById("revenue-period");

  const baseListEl = document.getElementById("base-list");
  const origensLegendEl = document.getElementById("origens-legend");

  // Entregas: referências de KPI e texto
  const kpiDeliveredTotal = document.getElementById("kpi-delivered-total");
  const kpiDeliveredAvg = document.getElementById("kpi-delivered-avg");
  const kpiDeliveredMax = document.getElementById("kpi-delivered-max");
  const deliveredPeriodEl = document.getElementById("delivered-period");

  // ECharts instância para entregas
  let deliveredChart = null;

  // ECharts instâncias
  let revenueChart = null;
  let origensChart = null;

  // ---------------------------------------------------------------------------
  // Inicialização da página
  // ---------------------------------------------------------------------------
  async function init() {
    // Garantir que o usuário está autenticado
    if (typeof window.ensureAuth === "function") {
      try {
        await window.ensureAuth();
      } catch (_) {}
    }

    // Carrega usuário para saudação
    const user = await getCurrentUser();
    const username = user && (user.username || user.email || user.id);
    if (username) {
      greetingEl.textContent = `Olá, ${username}!!`;
    } else {
      greetingEl.textContent = "Olá!!";
    }
    greetingSubEl.textContent = "Aqui está o desempenho da sua operação na quinzena atual";

    // Define intervalo padrão fixo por quinzena:
    // Se hoje está entre 1 e 15 -> 01 a 15; se >=16 -> 16 ao último dia do mês
    (function setDefaultFortnight() {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      const day = now.getDate();
      let startDay = 1;
      let endDay = 15;
      if (day > 15) {
        startDay = 16;
        endDay = new Date(year, month + 1, 0).getDate();
      }
      const startDate = new Date(year, month, startDay);
      const endDate = new Date(year, month, endDay);
      elFrom.value = fmtYMD(startDate);
      elTo.value = fmtYMD(endDate);
    })();

    // Listeners
    btnRefresh.addEventListener("click", loadAll);
    zoomGroup.addEventListener("click", (ev) => {
      const btn = ev.target.closest("button[data-zoom]");
      if (!btn) return;
      const days = parseInt(btn.getAttribute("data-zoom"), 10);
      if (isNaN(days)) return;
      // define range com base em hoje
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - (days - 1));
      elFrom.value = fmtYMD(start);
      elTo.value = fmtYMD(end);
      loadAll();
    });

    // Carrega dados iniciais
    await loadAll();
  }

  // Função principal de carregamento
  async function loadAll() {
    const from = elFrom.value || todayYMD();
    const to = elTo.value || from;
    let fromDate = parseYMD(from);
    let toDate = parseYMD(to);
    if (!fromDate && toDate) fromDate = toDate;
    if (!toDate && fromDate) toDate = fromDate;
    if (fromDate > toDate) {
      // troca
      [fromDate, toDate] = [toDate, fromDate];
    }
    // Ajusta para a quinzena fixa em que o 'toDate' se encontra
    (function alignToFortnight() {
      const year = toDate.getFullYear();
      const month = toDate.getMonth();
      const day = toDate.getDate();
      let startDay = 1;
      let endDay = 15;
      if (day > 15) {
        startDay = 16;
        endDay = new Date(year, month + 1, 0).getDate();
      }
      fromDate = new Date(year, month, startDay);
      toDate = new Date(year, month, endDay);
      elFrom.value = fmtYMD(fromDate);
      elTo.value = fmtYMD(toDate);
    })();
    const fromYMD = fmtYMD(fromDate);
    const toYMD = fmtYMD(toDate);

    // Mostra período no gráfico
    revenuePeriodEl.textContent = `Período: ${fromDate.toLocaleDateString("pt-BR")} a ${toDate.toLocaleDateString("pt-BR")}`;

    // Carrega dados em paralelo
    try {
      const [coletas, saidas, basePrices] = await Promise.all([
        listColetas(fromYMD, toYMD),
        listSaidasRaw(fromYMD, toYMD),
        listBasePrices(),
      ]);

      processData(coletas || [], saidas || [], basePrices);
    } catch (err) {
      console.error("Erro ao carregar dados:", err);
    }
  }

  // Processa dados e atualiza a UI
  function processData(coletas, saidas, basePrices) {
    // Normalizador de base para agrupar (ignora diferenças de caixa e espaços)
    function normalizeBaseName(name) {
      return (name || '').trim().toUpperCase();
    }
    // -----------------------------------------------------------------------
    // 1. KPIs básicos
    // -----------------------------------------------------------------------
    let totalValorColetas = 0;
    let totalColetados = 0;
    const originCounts = { shopee: 0, ml: 0, avulso: 0, outros: 0 };
    const baseCollected = {};
    const baseDisplayName = {};

    coletas.forEach((c) => {
      const rawBase = c.base || "";
      const baseKey = normalizeBaseName(rawBase);
      const base = baseKey;
      const valor = parseFloat(c.valor_total) || 0;
      totalValorColetas += valor;
      const qtShopee = Number(c.shopee) || 0;
      const qtML = Number(c.mercado_livre) || 0;
      const qtAvulso = Number(c.avulso) || 0;
      const totalOrd = qtShopee + qtML + qtAvulso;
      totalColetados += totalOrd;
      originCounts.shopee += qtShopee;
      originCounts.ml += qtML;
      originCounts.avulso += qtAvulso;
      // nenhum campo para outros nas coletas
      if (!baseCollected[base]) baseCollected[base] = 0;
      baseCollected[base] += totalOrd;
      if (!baseDisplayName[base]) baseDisplayName[base] = (rawBase || '').trim() || base;
    });

    // -----------------------------------------------------------------------
    // 2. Saídas: entregues e cancelados
    // -----------------------------------------------------------------------
    let totalEntregues = 0;
    let totalCancelados = 0;
    // mapa de entregues por base
    const baseEntregues = {};
    // valor cancelado
    let totalCanceladosValor = 0;

    saidas.forEach((s) => {
      const rawBase = s.base || "";
      const base = normalizeBaseName(rawBase);
      if (!baseDisplayName[base] && rawBase) baseDisplayName[base] = rawBase.trim();
      const servKey = classifyServico(s.servico || s.origem || "");
      const isEntregue = isSaiuParaEntrega(s);
      if (isEntregue) {
        totalEntregues += 1;
        if (!baseEntregues[base]) baseEntregues[base] = 0;
        baseEntregues[base] += 1;
      }
      const statusTxt = (s.status || "").toString().toLowerCase();
      if (statusTxt.includes("cancelado")) {
        totalCancelados += 1;
        // calcula valor perdido por cancelamento (base x serviço)
        const price = (basePrices[base] && basePrices[base][servKey]) || 0;
        totalCanceladosValor += price;
      }
    });

    // -----------------------------------------------------------------------
    // 3. Ganho líquido
    // -----------------------------------------------------------------------
    const ganhoLiquido = totalValorColetas - totalCanceladosValor;
    const ganhoLiquidoFormat = ganhoLiquido.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    kpiGanhosEl.textContent = `R$ ${ganhoLiquidoFormat}`;
    kpiColetadosEl.textContent = totalColetados.toLocaleString("pt-BR");
    kpiEntreguesEl.textContent = totalEntregues.toLocaleString("pt-BR");
    kpiCanceladosEl.textContent = totalCancelados.toLocaleString("pt-BR");

    // Conversão (% entregues / coletados)
    const conv = totalColetados > 0 ? (totalEntregues / totalColetados) * 100 : 0;
    kpiConversionEl.textContent = `${conv.toFixed(1)}%`;

    // -----------------------------------------------------------------------
    // 4. Séries diárias
    // -----------------------------------------------------------------------
    // 4a. Série diária de receita (valor total das coletas)
    const revenueByDay = {};
    coletas.forEach((c) => {
      const dt = c.timestamp ? fmtYMD(new Date(c.timestamp)) : null;
      if (!dt) return;
      const v = parseFloat(c.valor_total) || 0;
      if (!revenueByDay[dt]) revenueByDay[dt] = 0;
      revenueByDay[dt] += v;
    });
    const dates = Object.keys(revenueByDay).sort();
    const revSeries = dates.map((d) => revenueByDay[d]);
    const totalRev = revSeries.reduce((a, b) => a + b, 0);
    const avgRev = revSeries.length ? totalRev / revSeries.length : 0;
    const maxRev = revSeries.length ? Math.max(...revSeries) : 0;
    kpiRevenueTotalEl.textContent = `R$ ${totalRev.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    kpiRevenueAvgEl.textContent = `R$ ${avgRev.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    kpiRevenueMaxEl.textContent = `R$ ${maxRev.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // 4b. Série diária de pedidos entregues (agrupado por serviço)
    const deliveredByDay = {};
    saidas.forEach((s) => {
      if (!isSaiuParaEntrega(s)) return;
      const dt = s.timestamp ? fmtYMD(new Date(s.timestamp)) : null;
      if (!dt) return;
      const serv = classifyServico(s.servico || s.origem || "");
      if (!deliveredByDay[dt]) deliveredByDay[dt] = { shopee: 0, ml: 0, avulso: 0 };
      if (serv === 'shopee') deliveredByDay[dt].shopee += 1;
      else if (serv === 'ml') deliveredByDay[dt].ml += 1;
      else if (serv === 'avulso') deliveredByDay[dt].avulso += 1;
    });
    const deliveredDates = Object.keys(deliveredByDay).sort();
    const deliveredSeriesShopee = deliveredDates.map((d) => deliveredByDay[d].shopee);
    const deliveredSeriesMl     = deliveredDates.map((d) => deliveredByDay[d].ml);
    const deliveredSeriesAvulso= deliveredDates.map((d) => deliveredByDay[d].avulso);
    // Totais por dia para KPIs
    const deliveredSeriesTotal = deliveredDates.map((d) => deliveredByDay[d].shopee + deliveredByDay[d].ml + deliveredByDay[d].avulso);
    const totalDeliv = deliveredSeriesTotal.reduce((a, b) => a + b, 0);
    const avgDeliv = deliveredSeriesTotal.length ? totalDeliv / deliveredSeriesTotal.length : 0;
    const maxDeliv = deliveredSeriesTotal.length ? Math.max(...deliveredSeriesTotal) : 0;
    kpiDeliveredTotal.textContent = totalDeliv.toLocaleString('pt-BR');
    kpiDeliveredAvg.textContent = avgDeliv.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    kpiDeliveredMax.textContent = maxDeliv.toLocaleString('pt-BR');
    deliveredPeriodEl.textContent = revenuePeriodEl.textContent;

    // -----------------------------------------------------------------------
    // 5. Distribuição por origem (donut)
    // -----------------------------------------------------------------------
    // soma total de coletas por origem
    const totalOrigins = originCounts.shopee + originCounts.ml + originCounts.avulso;
    const originLabels = [];
    const originValues = [];
    const originColors = [];
    // definimos cores fixas, semelhantes ao CSS de cards ou padrões Velzon
    const palette = {
      shopee: "#FF6F61", // laranja
      ml: "#FFD700",     // amarelo
      avulso: "#5B9BD5", // azul
    };
    ["shopee", "ml", "avulso"].forEach((key) => {
      const count = originCounts[key];
      if (count > 0) {
        originLabels.push(key === "ml" ? "Mercado Livre" : key.charAt(0).toUpperCase() + key.slice(1));
        originValues.push(count);
        originColors.push(palette[key]);
      }
    });
    // Se não houver dados, gera um valor nulo para evitar erro no gráfico
    if (originValues.length === 0) {
      originLabels.push("Sem dados");
      originValues.push(1);
      originColors.push("#d1d1d1");
    }

    // -----------------------------------------------------------------------
    // 6. Conversão por base (lista com barra de progresso)
    // -----------------------------------------------------------------------
    // Monta lista de bases ordenada pela taxa de conversão (maior → menor)
    const baseArray = Object.keys(baseCollected).map((b) => {
      const collected = baseCollected[b] || 0;
      const delivered = baseEntregues[b] || 0;
      const ratio = collected > 0 ? delivered / collected : 0;
      const display = baseDisplayName[b] || b;
      return { key: b, display, collected, delivered, ratio };
    });
    baseArray.sort((a, b) => b.ratio - a.ratio);
    let baseHtml = "";
    baseArray.forEach(({ key, display, collected, delivered, ratio }) => {
      const pct = (ratio * 100).toFixed(0);
      const label = display || '(sem base)';
      const tooltip = `Coletados: ${collected}\nSaiu para entrega: ${delivered}`;
      baseHtml += `
        <div class="mb-3">
          <div class="d-flex justify-content-between mb-1">
            <h6 class="mb-0 fs-13 fw-medium">${label}</h6>
            <span class="text-muted fs-12">${pct}%</span>
          </div>
          <div class="progress progress-sm" style="height: 6px;">
            <div class="progress-bar bg-primary progress-bar-striped progress-bar-animated" role="progressbar" title="${tooltip}" data-final-width="${pct}" style="width: 0%; transition: width 0.8s ease;"></div>
          </div>
        </div>`;
    });
    baseListEl.innerHTML = baseHtml;
    // Anima barras de progresso após inserção
    requestAnimationFrame(() => {
      baseListEl.querySelectorAll('.progress-bar').forEach((el) => {
        const finalWidth = el.getAttribute('data-final-width');
        if (finalWidth !== null) {
          el.style.width = finalWidth + '%';
        }
      });
    });

    // -----------------------------------------------------------------------
    // 7. Atualiza ou cria gráficos
    // -----------------------------------------------------------------------
    // Gráfico de receita: barras + linha de média
    const avgSeriesArray = dates.map(() => avgRev);
    const revenueOptions = {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: function (params) {
          const brDate = (() => {
            const [y, m, d] = params[0].name.split('-');
            return `${d}/${m}/${y}`;
          })();
          let tooltip = `${brDate}`;
          params.forEach(p => {
            if (p.seriesName === 'Receita') {
              tooltip += `<br/><span style="color:${p.color}">●</span> Receita: R$ ${Number(p.value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            } else if (p.seriesName === 'Média') {
              tooltip += `<br/><span style="color:${p.color}">●</span> Média: R$ ${Number(p.value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            }
          });
          return tooltip;
        }
      },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: {
        type: 'category',
        data: dates,
        axisTick: { alignWithLabel: true },
        axisLabel: {
          formatter: function (val) {
            if (!val) return '';
            const [y, m, d] = val.split('-');
            return `${d}/${m}`;
          }
        }
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          formatter: function (val) {
            return `R$ ${Number(val).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
          }
        }
      },
      series: [
        {
          name: 'Receita',
          type: 'bar',
          data: revSeries,
          barWidth: '60%',
          itemStyle: { color: '#556ee6' }
        },
        {
          name: 'Média',
          type: 'line',
          data: avgSeriesArray,
          smooth: true,
          lineStyle: { color: '#34c38f', width: 2 },
          itemStyle: { color: '#34c38f' }
        }
      ]
    };
    if (revenueChart) {
      revenueChart.setOption(revenueOptions);
    } else {
      const el = document.getElementById('chart-revenue');
      revenueChart = echarts.init(el);
      revenueChart.setOption(revenueOptions);
      window.addEventListener('resize', () => revenueChart && revenueChart.resize());
    }

    // Gráfico de entregas (barras)
    const deliveredOptions = {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: function (params) {
          const brDate = (() => {
            const [y, m, d] = params[0].name.split('-');
            return `${d}/${m}/${y}`;
          })();
          let tooltip = `${brDate}`;
          params.forEach(p => {
            tooltip += `<br/><span style="color:${p.color}">●</span> ${p.seriesName}: ${p.value}`;
          });
          return tooltip;
        }
      },
      legend: {
        show: true,
        top: 0
      },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: {
        type: 'category',
        data: deliveredDates,
        axisLabel: {
          formatter: function (val) {
            if (!val) return '';
            const [y, m, d] = val.split('-');
            return `${d}/${m}`;
          }
        }
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          formatter: function (val) {
            return Number(val).toLocaleString('pt-BR');
          }
        }
      },
      series: [
        {
          name: 'Shopee',
          type: 'bar',
          stack: 'total',
          data: deliveredSeriesShopee,
          barWidth: '60%',
          itemStyle: { color: '#FF6F61' }
        },
        {
          name: 'Mercado Livre',
          type: 'bar',
          stack: 'total',
          data: deliveredSeriesMl,
          barWidth: '60%',
          itemStyle: { color: '#FFD700' }
        },
        {
          name: 'Avulso',
          type: 'bar',
          stack: 'total',
          data: deliveredSeriesAvulso,
          barWidth: '60%',
          itemStyle: { color: '#5B9BD5' }
        }
      ]
    };
    if (deliveredChart) {
      deliveredChart.setOption(deliveredOptions);
    } else {
      const el = document.getElementById('chart-delivered');
      deliveredChart = echarts.init(el);
      deliveredChart.setOption(deliveredOptions);
      window.addEventListener('resize', () => deliveredChart && deliveredChart.resize());
    }

    // Gráfico de origens (donut)
    const originOptions = {
      tooltip: {
        trigger: 'item',
        formatter: function (params) {
          const pct = params.percent.toFixed(1);
          return `${params.name}: ${params.value} (${pct}%)`;
        }
      },
      legend: {
        show: false
      },
      color: originColors,
      series: [
        {
          name: 'Origens',
          type: 'pie',
          radius: ['40%', '70%'],
          avoidLabelOverlap: false,
          label: {
            show: false,
            position: 'center'
          },
          emphasis: {
            label: {
              show: true,
              fontSize: '14',
              fontWeight: 'bold',
              formatter: function (params) {
                const pct = params.percent.toFixed(1);
                return `${pct}%\n${params.name}`;
              }
            }
          },
          labelLine: {
            show: false
          },
          data: originLabels.map((label, idx) => ({ name: label, value: originValues[idx] }))
        }
      ]
    };
    if (origensChart) {
      origensChart.setOption(originOptions);
    } else {
      const el = document.getElementById('chart-origens');
      origensChart = echarts.init(el);
      origensChart.setOption(originOptions);
      window.addEventListener('resize', () => origensChart && origensChart.resize());
    }
    // Atualiza legenda customizada para as origens
    origensLegendEl.innerHTML = originLabels.map((label, idx) => {
      const value = originValues[idx];
      const pct = totalOrigins > 0 ? ((value / totalOrigins) * 100).toFixed(1) : '0.0';
      const color = originColors[idx];
      return `<div class="d-flex align-items-center mb-1"><span class="me-2" style="display:inline-block;width:12px;height:12px;border-radius:2px;background-color:${color};"></span><span class="flex-grow-1">${label}</span><span class="text-muted">${pct}%</span></div>`;
    }).join('');
  }

  // Chama a inicialização
  document.addEventListener('DOMContentLoaded', init);
})();