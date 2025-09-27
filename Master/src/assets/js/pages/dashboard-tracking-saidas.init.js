
(async function(){
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
    const arr=[]; const cur=new Date(start);
    while(cur<=end){ arr.push(fmtISO(cur)); cur.setDate(cur.getDate()+1); }
    return arr;
  }

  // ===== Autenticação de sessão =====
  // Garante que o usuário esteja autenticado antes de qualquer chamada à API.
  if (typeof window !== 'undefined' && typeof window.ensureAuth === 'function') {
    try { await window.ensureAuth(); } catch (_) {}
  }

  // ===== Dashboard com dados reais =====
  // Este dashboard utiliza a API de registros (TrackAPI.listSaidas) para buscar
  // as saídas dentro de um período. Não há mais geração de dados "fake".

  // ===== Helpers de agregação =====
  function groupBy(arr, keyFn){
    return arr.reduce((acc,it)=>{ const k=keyFn(it); (acc[k] ||= []).push(it); return acc; },{});
  }
  function buildRanking(saidas){
    const counts={}; for(const s of saidas){ counts[s.entregador]=(counts[s.entregador]||0)+1; }
    const entries=Object.entries(counts).sort((a,b)=>b[1]-a[1]);
    const top=entries.slice(0,10);
    return {names: top.map(e=>e[0]).reverse(), values: top.map(e=>e[1]).reverse()};
  }
  function buildSerieDiaria(saidas, days){
    // Extrai a data (AAAA-MM-DD) de cada saída e normaliza a origem/serviço.
    function extractDateISO(row){
      if (!row) return null;
      let dt = row.data || row.date;
      if (!dt) dt = row.timestamp || row.ts || row.data_hora || row.datahora || null;
      if (!dt) return null;
      try {
        const d = (dt instanceof Date) ? dt : new Date(dt);
        if (isNaN(d.getTime())) return null;
        return fmtISO(d);
      } catch (_) { return null; }
    }
    function normalizeOrigem(row){
      const v = (row && (row.origem || row.servico) || "").toString().toLowerCase();
      const noAccent = v.normalize ? v.normalize('NFD').replace(/\p{Diacritic}/gu, '') : v;
      return noAccent.replace(/\s+/g, '_');
    }
    const porDia = groupBy(saidas, s => extractDateISO(s));
    const shopee = days.map(d => {
      const arr = porDia[d] || [];
      return arr.filter(x => normalizeOrigem(x) === 'shopee').length;
    });
    const ml = days.map(d => {
      const arr = porDia[d] || [];
      return arr.filter(x => {
        const o = normalizeOrigem(x);
        return o === 'mercado_livre' || o === 'mercadolivre';
      }).length;
    });
    // Total geral: todas as saídas por dia (inclui Avulso e outros serviços)
    const total = days.map(d => {
      const arr = porDia[d] || [];
      return arr.length;
    });
    return { shopee, ml, total };
  }

  // ===== Charts =====
  const elRanking=document.getElementById('chart-entregadores-ranking');
  const elDiario=document.getElementById('chart-pedidos-diarios');
  const chartRanking=echarts.init(elRanking,null,{renderer:'canvas'});
  const chartDiario=echarts.init(elDiario,null,{renderer:'canvas'});

  function renderRanking(names, values){
    chartRanking.setOption({
      grid:{left:8,right:16,top:10,bottom:10,containLabel:true},
      tooltip:{trigger:'axis',axisPointer:{type:'shadow'}},
      xAxis:{type:'value'},
      yAxis:{type:'category',data:names},
      series:[{ type:'bar', data:values, barWidth:'55%', label:{show:true,position:'right'}, itemStyle:{borderRadius:[0,6,6,0]} }]
    });
  }
  function renderDiario(days, serieShopee, serieML, serieTotal, modo){
    const showShopee=(modo==='ambos'||modo==='shopee');
    const showML=(modo==='ambos'||modo==='mercado_livre');
    const showTotal=(modo==='ambos'||modo==='total');
    chartDiario.setOption({
      grid:{left:8,right:16,top:20,bottom:40,containLabel:true},
      tooltip:{trigger:'axis'},
      legend:{bottom:0},
      xAxis:{type:'category',data:days.map(d=>d.slice(5))},
      yAxis:{type:'value'},
      series:[
        {name:'Shopee', type:'line', smooth:true, areaStyle:{}, showSymbol:false, lineStyle:{width:2}, data: showShopee?serieShopee:serieShopee.map(()=>null)},
        {name:'Mercado Livre', type:'line', smooth:true, areaStyle:{}, showSymbol:false, lineStyle:{width:2}, data: showML?serieML:serieML.map(()=>null)},
        {name:'Total Geral', type:'line', smooth:true, showSymbol:false, lineStyle:{width:3}, data: showTotal?serieTotal:serieTotal.map(()=>null)}
      ]
    });
  }

  // ===== Fluxo =====
  let currentModo='ambos';
  async function loadAll(){
    const {start,end}=startEndLastNDays(15); const startISO=fmtISO(start), endISO=fmtISO(end);
    document.getElementById('ranking-period').textContent=`Período: ${startISO} a ${endISO}`;
    document.getElementById('diario-period').textContent=`Período: ${startISO} a ${endISO}`;

    // Busca saídas reais via API. Obtém registros ordenados por data desc.
    let saidas = [];
    try {
      if (window.TrackAPI && typeof window.TrackAPI.listSaidas === 'function') {
        const params = { pageSize: 1000, page: 1, sort: '-ts' };
        const res = await window.TrackAPI.listSaidas(params);
        if (res && res.ok && Array.isArray(res.rows)) saidas = res.rows;
      }
    } catch (e) {
      console.error('Erro ao carregar saídas para dashboard:', e);
    }
    // Filtra saídas pelo período desejado (startISO <= data <= endISO)
    function extractDateISO(row){
      if (!row) return null;
      let dt = row.data || row.date;
      if (!dt) dt = row.timestamp || row.ts || row.data_hora || row.datahora || null;
      if (!dt) return null;
      try {
        const d = (dt instanceof Date) ? dt : new Date(dt);
        if (isNaN(d.getTime())) return null;
        return fmtISO(d);
      } catch (_) { return null; }
    }
    const filtered = saidas.filter(s => {
      const iso = extractDateISO(s);
      return iso && iso >= startISO && iso <= endISO;
    });
    const { names, values } = buildRanking(filtered);
    renderRanking(names, values);

    const days = daysArray(start, end);
    const { shopee, ml, total } = buildSerieDiaria(filtered, days);
    renderDiario(days, shopee, ml, total, currentModo);
  }

  document.getElementById('btn-refresh-ranking')?.addEventListener('click', loadAll);
  document.getElementById('btn-refresh-diario')?.addEventListener('click', loadAll);
  document.querySelectorAll('[data-origem]')?.forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      currentModo=e.currentTarget.getAttribute('data-origem');
      e.currentTarget.parentElement.querySelectorAll('button').forEach(b=>b.classList.remove('active'));
      e.currentTarget.classList.add('active');
      loadAll();
    });
  });

  window.addEventListener('resize', ()=>{ chartRanking.resize(); chartDiario.resize(); });

  // Boot
  loadAll();
})();