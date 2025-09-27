// assets/js/pages/dashboard-tracking-saidas.init.js
// Dashboard: usa dados reais da API de registros para montar ranking e série diária
// dos últimos 15 dias. Inclui a contagem de Avulso e um total geral, além de
// mostrar no tooltip do ranking a decomposição por serviço (Shopee, Mercado Livre, Avulso).

(async function(){
  "use strict";

  // ===== Util: datas / período =====
  function fmtISO(d){ return d.toISOString().slice(0,10); }
  function startEndLastNDays(n){
    const end = new Date();
    end.setHours(0,0,0,0);
    const start = new Date(end);
    start.setDate(start.getDate() - (n-1));
    return {start, end};
  }
  function daysArray(start, end){
    const arr=[];
    const cur=new Date(start);
    while(cur<=end){ arr.push(fmtISO(cur)); cur.setDate(cur.getDate()+1); }
    return arr;
  }

  // ===== Autenticação de sessão =====
  // Garante que a sessão esteja válida antes de acessar a API. Se a função
  // window.ensureAuth estiver disponível (exposta pelo módulo user.js), ela
  // fará a verificação de tokens e cookies e redirecionará para o login se
  // necessário. Ignora eventuais erros, pois a própria função cuidará do redirecionamento.
  if (typeof window !== 'undefined' && typeof window.ensureAuth === 'function') {
    try { await window.ensureAuth(); } catch (_) {}
  }

  // ===== Helpers de normalização =====
  /**
   * Extrai a data no formato AAAA-MM-DD de um registro retornado pela API.
   * Os registros podem ter campos diferentes para a data; esta função tenta
   * diversas propriedades comuns (timestamp, ts, data, date, data_hora, datahora).
   * Retorna null se nenhum campo for encontrado ou se a data for inválida.
   */
  function extractDateISO(row){
    if (!row) return null;
    // considera timestamp ou campos comuns
    let dt = row.data || row.date;
    if (!dt) dt = row.timestamp || row.ts || row.data_hora || row.datahora || null;
    if (!dt) return null;
    try {
      const d = (dt instanceof Date) ? dt : new Date(dt);
      if (isNaN(d.getTime())) return null;
      return fmtISO(d);
    } catch (_) {
      return null;
    }
  }

  /**
   * Normaliza o campo de origem/serviço removendo acentos e convertendo para
   * minúsculas. Serve para agrupar corretamente diferentes formas de escrever
   * "Shopee", "Mercado Livre" e "Avulso".
   */
  function normalizeOrigem(row){
    const v = (row && (row.origem || row.servico) || "").toString().toLowerCase();
    const noAccent = v.normalize ? v.normalize('NFD').replace(/\p{Diacritic}/gu, '') : v;
    return noAccent.replace(/\s+/g, '_');
  }

  // ===== Helpers de agregação =====
  function groupBy(arr, keyFn){
    return arr.reduce((acc,it)=>{ const k=keyFn(it); (acc[k] ||= []).push(it); return acc; },{});
  }

  /**
   * Constrói o ranking de entregadores. Além de retornar nomes e totais
   * ordenados, também retorna um objeto `details` que contém, para cada
   * entregador, a decomposição da quantidade de saídas por serviço (shopee,
   * mercado_livre, avulso) e o total.
   */
  function buildRanking(saidas){
    const counts = {};
    const details = {};
    for (const s of saidas) {
      const ent = s.entregador || '';
      counts[ent] = (counts[ent] || 0) + 1;
      if (!details[ent]) details[ent] = { shopee: 0, mercado_livre: 0, avulso: 0, total: 0 };
      const orig = normalizeOrigem(s);
      if (orig === 'shopee') details[ent].shopee++;
      else if (orig === 'mercado_livre' || orig === 'mercadolivre') details[ent].mercado_livre++;
      else if (orig === 'avulso') details[ent].avulso++;
      details[ent].total++;
    }
    const entries = Object.entries(counts).sort((a,b) => b[1] - a[1]);
    const top = entries.slice(0,10);
    const names = top.map(e => e[0]).reverse();
    const values = top.map(e => e[1]).reverse();
    return { names, values, details };
  }

  /**
   * Constrói a série diária para o gráfico de linhas. Para cada dia, conta
   * quantas saídas foram de Shopee, Mercado Livre, Avulso e calcula o total
   * geral. Recebe a lista de saídas e o array de dias (ISO) a serem
   * considerados.
   */
  function buildSerieDiaria(saidas, days){
    // Agrupa por data ISO
    const porDia = groupBy(saidas, s => extractDateISO(s));
    const shopee = [];
    const ml     = [];
    const avulso = [];
    const total  = [];
    for (const d of days) {
      const arr = porDia[d] || [];
      let cShopee=0, cML=0, cAvulso=0;
      for (const row of arr) {
        const o = normalizeOrigem(row);
        if (o === 'shopee') cShopee++;
        else if (o === 'mercado_livre' || o === 'mercadolivre') cML++;
        else if (o === 'avulso') cAvulso++;
      }
      shopee.push(cShopee);
      ml.push(cML);
      avulso.push(cAvulso);
      total.push(cShopee + cML + cAvulso);
    }
    return { shopee, ml, avulso, total };
  }

  // ===== Charts =====
  const elRanking = document.getElementById('chart-entregadores-ranking');
  const elDiario  = document.getElementById('chart-pedidos-diarios');
  const chartRanking = echarts.init(elRanking, null, {renderer:'canvas'});
  const chartDiario  = echarts.init(elDiario,  null, {renderer:'canvas'});
  // Detalhes do último ranking, usado pelo tooltip
  let lastRankingDetails = {};

  /**
   * Renderiza o gráfico de barras do ranking. Recebe os nomes dos
   * entregadores, os valores totais e o objeto `details` (decomposição por
   * serviço). Configura o tooltip para exibir a soma por serviço ao passar
   * o mouse sobre a barra.
   */
  function renderRanking(names, values, details){
    lastRankingDetails = details || {};
    chartRanking.setOption({
      grid: { left: 8, right: 16, top: 10, bottom: 10, containLabel: true },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        // custom formatter para mostrar contagem por serviço
        formatter: function(params){
          if (!params || !params.length) return '';
          const idx = params[0].dataIndex;
          const name = names[idx];
          const det  = lastRankingDetails[name] || {};
          const s = det.shopee || 0;
          const m = det.mercado_livre || 0;
          const a = det.avulso || 0;
          const t = det.total || (s+m+a);
          return `${name}<br/>Shopee: ${s}<br/>Mercado Livre: ${m}<br/>Avulso: ${a}<br/>Total Geral: ${t}`;
        }
      },
      xAxis: { type: 'value' },
      yAxis: { type: 'category', data: names },
      series: [ {
        name: 'Total Geral',
        type: 'bar',
        data: values,
        barWidth: '55%',
        label: { show: true, position: 'right' },
        itemStyle: { borderRadius: [0, 6, 6, 0] }
      } ]
    });
  }

  /**
   * Renderiza o gráfico de linhas diárias. Mostra todas as origens (Shopee,
   * Mercado Livre, Avulso) e o total geral. Não aplica filtros por "modo"
   * neste dashboard; todas as séries são sempre exibidas.
   */
  function renderDiario(days, serieShopee, serieML, serieAvulso, serieTotal){
    chartDiario.setOption({
      grid: { left: 8, right: 16, top: 20, bottom: 40, containLabel: true },
      tooltip: { trigger: 'axis' },
      legend: { bottom: 0 },
      xAxis: { type: 'category', data: days.map(d => d.slice(5)) },
      yAxis: { type: 'value' },
      series: [
        { name: 'Shopee', type: 'line', smooth: true, areaStyle: {}, showSymbol: false, lineStyle: { width: 2 }, data: serieShopee },
        { name: 'Mercado Livre', type: 'line', smooth: true, areaStyle: {}, showSymbol: false, lineStyle: { width: 2 }, data: serieML },
        { name: 'Avulso', type: 'line', smooth: true, areaStyle: {}, showSymbol: false, lineStyle: { width: 2 }, data: serieAvulso },
        { name: 'Total Geral', type: 'line', smooth: true, showSymbol: false, lineStyle: { width: 3 }, data: serieTotal }
      ]
    });
  }

  // ===== Fluxo =====
  async function loadAll(){
    const { start, end } = startEndLastNDays(15);
    const startISO = fmtISO(start), endISO = fmtISO(end);
    const rankingPeriodEl = document.getElementById('ranking-period');
    const diarioPeriodEl  = document.getElementById('diario-period');
    if (rankingPeriodEl) rankingPeriodEl.textContent = `Período: ${startISO} a ${endISO}`;
    if (diarioPeriodEl)  diarioPeriodEl.textContent  = `Período: ${startISO} a ${endISO}`;

    // Busca saídas reais via API. Usamos pageSize alto para tentar obter
    // todos os registros no intervalo de 15 dias. Filtramos manualmente
    // depois para garantir que caibam no período correto.
    let saidas = [];
    try {
      if (window.TrackAPI && typeof window.TrackAPI.listSaidas === 'function') {
        const res = await window.TrackAPI.listSaidas({ from: startISO, to: endISO, pageSize: 1000, page: 1 });
        if (res && res.ok && Array.isArray(res.rows)) saidas = res.rows;
      }
    } catch (e) {
      console.error('Erro ao carregar saídas para dashboard:', e);
    }
    // Filtra para garantir que a data da saída esteja no período desejado (caso o backend ignore os filtros)
    const filtered = saidas.filter(s => {
      const iso = extractDateISO(s);
      return iso && iso >= startISO && iso <= endISO;
    });

    // Monta ranking e série diária
    const { names, values, details } = buildRanking(filtered);
    renderRanking(names, values, details);
    const days = daysArray(start, end);
    const { shopee, ml, avulso, total } = buildSerieDiaria(filtered, days);
    renderDiario(days, shopee, ml, avulso, total);
  }

  // Eventos de recarregar
  document.getElementById('btn-refresh-ranking')?.addEventListener('click', loadAll);
  document.getElementById('btn-refresh-diario')?.addEventListener('click', loadAll);
  // Nota: se futuramente forem adicionados botões de filtro por origem, o
  // handler deverá chamar renderDiario() com as séries filtradas.

  // Resize charts on window resize
  window.addEventListener('resize', () => { chartRanking.resize(); chartDiario.resize(); });

  // Boot inicial
  loadAll();
})();