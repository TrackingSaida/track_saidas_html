// assets/js/pages/tracking-coletas-resumo.init.js
(function(){
  const tbl = document.getElementById('coletas-resumo-table');
  const tbody = tbl && tbl.querySelector('tbody');
  const msgEl = document.getElementById('resumoMsg');
  const btnRefresh = document.getElementById('btnRefreshResumo');
  const btnExport = document.getElementById('btnExportCsv');
  const sumShopeeEl = document.getElementById('sumShopee');
  const sumMlEl = document.getElementById('sumMl');
  const sumAvulsoEl = document.getElementById('sumAvulso');
  const sumValorEl = document.getElementById('sumValor');

  function showMsg(text, type='info'){
    if (!msgEl) return;
    msgEl.innerHTML = `<div class="alert alert-${type} mb-0">${text}</div>`;
    setTimeout(()=>{ if (msgEl) msgEl.innerHTML = ''; }, 4000);
  }

  function formatMaybeBigNumber(s){
    if (s == null) return '';
    // se for string grande (ex.: valor_total do backend), exibe truncado com tooltip
    const str = String(s);
    if (str.length > 30) {
      return `<span title="${str}">${str.slice(0,24)}…</span>`;
    }
    return str;
  }

  function renderRows(data){
    if (!tbody) return;
    tbody.innerHTML = '';
    let sumShopee = 0, sumMl = 0, sumAvulso = 0;
    // valor_total pode ser string numérica grande; acumular não é trivial, mostramos concatenações
    let valorTotalConcat = [];

    for (const r of (data || [])) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${r.base || ''}</td>
        <td>${r.sub_base || ''}</td>
        <td>${r.username_entregador || ''}</td>
        <td class="text-end">${Number(r.shopee || 0)}</td>
        <td class="text-end">${Number(r.mercado_livre || 0)}</td>
        <td class="text-end">${Number(r.avulso || 0)}</td>
        <td class="text-end">${formatMaybeBigNumber(r.valor_total)}</td>
      `;
      tbody.appendChild(tr);

      sumShopee += Number(r.shopee || 0);
      sumMl += Number(r.mercado_livre || 0);
      sumAvulso += Number(r.avulso || 0);
      if (r.valor_total != null) valorTotalConcat.push(String(r.valor_total));
    }

    sumShopeeEl && (sumShopeeEl.textContent = String(sumShopee));
    sumMlEl && (sumMlEl.textContent = String(sumMl));
    sumAvulsoEl && (sumAvulsoEl.textContent = String(sumAvulso));
    sumValorEl && (sumValorEl.textContent = valorTotalConcat.join(' | '));
  }

  async function fetchResumo(){
    try {
      showMsg('Carregando...', 'info');
      const base = (window.TRACK_API_URL||'').replace(/\/+$/,'');
      if (!base) throw new Error('TRACK_API_URL não configurado');
      const url = `${base}/coletas`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      renderRows(data);
      showMsg('Resumo carregado', 'success');
    } catch (err) {
      console.error('Erro ao carregar resumo de coletas', err);
      showMsg('Falha ao carregar resumo', 'danger');
      if (window.Swal && typeof Swal.fire === 'function') {
        Swal.fire({ icon:'error', title:'Erro', text: String(err.message || err) });
      }
    }
  }

  function exportCsv(){
    if (!tbody) return;
    const rows = Array.from(tbody.querySelectorAll('tr')).map(tr => {
      return Array.from(tr.children).map(td => td.textContent.trim().replace(/\s+/g,' '));
    });
    const hdr = ['base','sub_base','entregador','shopee','mercado_livre','avulso','valor_total'];
    const csv = [hdr, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'resumo_coletas.csv'; document.body.appendChild(a); a.click();
    setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 500);
  }

  btnRefresh && btnRefresh.addEventListener('click', fetchResumo);
  btnExport && btnExport.addEventListener('click', exportCsv);

  // init
  document.addEventListener('DOMContentLoaded', fetchResumo, { once: true });
})();