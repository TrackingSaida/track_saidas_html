(function(){
  // ============ CONFIG ============
  const API_BASE = window.TRACK_API_BASE || 'https://track-saidas-api.onrender.com/api';
  // Ajuste conforme seu backend
  const ENDPOINT_SAIDAS = API_BASE + '/saidas'; // espera ?start=YYYY-MM-DD&end=YYYY-MM-DD

  // ===== Util: datas / período =====
  function fmtISO(d){ return d.toISOString().slice(0,10); }
  function startEndLastNDays(n){
    const end = new Date(); end.setHours(0,0,0,0);
    const start = new Date(end); start.setDate(start.getDate() - (n-1));
    return {start, end};
  }
  function daysArray(start, end){
    const arr=[]; const cur=new Date(start);
    while(cur<=end){ arr.push(fmtISO(cur)); cur.setDate(cur.getDate()+1); }
    return arr;
  }

  // ===== Normalizadores =====
  function toDateISO(rec){
    if (rec.data) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(rec.data)) return rec.data;
      try { return new Date(rec.data).toISOString().slice(0,10); } catch { /* noop */ }
    }
    if (rec.data_hora) {
      if (typeof rec.data_hora === 'number') return new Date(rec.data_hora).toISOString().slice(0,10);
      try { return new Date(rec.data_hora).toISOString().slice(0,10); } catch { /* noop */ }
    }
    const d=new Date(); d.setHours(0,0,0,0); return fmtISO(d);
  }
  function toOrigem(rec){
    return (rec.origem || rec.servico || '').toString().toLowerCase();
  }
  function toEntregador(rec){
    return rec.entregador_nome || rec.entregador || (rec.id_entregador?`ID ${rec.id_entregador}`:'Sem nome');
  }

  // ===== API =====
  async function fetchSaidas(startISO, endISO){
    const url = new URL(ENDPOINT_SAIDAS);
    url.searchParams.set('start', startISO);
    url.searchParams.set('end', endISO);
    // Se sua API usa outros nomes: url.searchParams.set('inicio', startISO); url.searchParams.set('fim', endISO);

    const res = await fetch(url.toString(), { headers: { 'Accept': 'application/json' } });
    if (!res.ok) throw new Error('Falha ao buscar saídas: '+res.status);
    const data = await res.json();

    const items = Array.isArray(data) ? data : (Array.isArray(data.items) ? data.items : []);
    return items.map(r=>({ data: toDateISO(r), origem: toOrigem(r), entregador: toEntregador(r) }));
  }

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
    const porDia=groupBy(saidas,s=>s.data);
    const shopee=days.map(d=> (porDia[d]||[]).filter(x=>x.origem==='shopee').length );
    const ml    =days.map(d=> (porDia[d]||[]).filter(x=>x.origem==='mercado_livre').length );
    const total =days.map((_,i)=> shopee[i]+ml[i]);
    return {shopee, ml, total};
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
    const showTotal=(modo==='total');
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
    try {
      const {start,end}=startEndLastNDays(15); const startISO=fmtISO(start), endISO=fmtISO(end);
      document.getElementById('ranking-period').textContent=`Período: ${startISO} a ${endISO}`;
      document.getElementById('diario-period').textContent=`Período: ${startISO} a ${endISO}`;

      const saidas=await fetchSaidas(startISO,endISO);
      const {names,values}=buildRanking(saidas);
      renderRanking(names,values);

      const days=daysArray(start,end);
      const {shopee,ml,total}=buildSerieDiaria(saidas,days);
      renderDiario(days,shopee,ml,total,currentModo);
    } catch (err) {
      console.error(err);
      chartRanking.clear();
      chartDiario.clear();
      chartRanking.setOption({title:{text:'Erro ao carregar dados', left:'center'}});
      chartDiario.setOption({title:{text:'Erro ao carregar dados', left:'center'}});
    }
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
