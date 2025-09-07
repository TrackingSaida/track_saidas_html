
(function(){
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

  // ===== PRNG determinístico (seed baseado em string) =====
  function xmur3(str){
    let h=1779033703^str.length; for(let i=0;i<str.length;i++){h=Math.imul(h^str.charCodeAt(i),3432918353); h=h<<13|h>>>19;} return function(){ h=Math.imul(h^h>>>16,2246822507); h=Math.imul(h^h>>>13,3266489909); return (h^h>>>16)>>>0; } }
  function mulberry32(a){ return function(){ let t=a+=0x6D2B79F5; t=Math.imul(t^t>>>15,t|1); t^=t+Math.imul(t^t>>>7,t|61); return ((t^t>>>14)>>>0)/4294967296; } }
  function seededRand(min,max,seedStr){ const seed=xmur3(seedStr)(); const rnd=mulberry32(seed)(); return Math.floor(rnd*(max-min+1))+min; }

  // ===== FAKE DATA determinístico =====
  const ENTREGADORES = [
    "Ana Souza","Carlos Lima","João Pedro","Maria Fernandes","Rafael Silva",
    "Thiago Santos","Luiz Henrique","Priscila Medeiros","Guilherme A.","Beatriz Ramos"
  ];

  function fakeSaidas(startISO, endISO){
    const dias = daysArray(new Date(startISO), new Date(endISO));
    const out=[];
    dias.forEach(d=>{
      ENTREGADORES.forEach((nome,idx)=>{
        // Determinístico por (dia+nome)
        const baseKey = d+"::"+nome;
        const qShopee = Math.max(0, seededRand(0,3, baseKey+"S"));
        const qML     = Math.max(0, seededRand(0,2, baseKey+"M"));
        for(let k=0;k<qShopee;k++) out.push({data:d, origem:"shopee", entregador:nome});
        for(let k=0;k<qML;k++) out.push({data:d, origem:"mercado_livre", entregador:nome});
      });
    });
    return out;
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
    const {start,end}=startEndLastNDays(15); const startISO=fmtISO(start), endISO=fmtISO(end);
    document.getElementById('ranking-period').textContent=`Período: ${startISO} a ${endISO}`;
    document.getElementById('diario-period').textContent=`Período: ${startISO} a ${endISO}`;

    const saidas=fakeSaidas(startISO,endISO);
    const {names,values}=buildRanking(saidas);
    renderRanking(names,values);

    const days=daysArray(start,end);
    const {shopee,ml,total}=buildSerieDiaria(saidas,days);
    renderDiario(days,shopee,ml,total,currentModo);
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
