// assets/js/pages/tracking-leitura.init.js

  (async function () {
  "use strict";
  // ---------- autenticação ----------
  if (typeof window !== 'undefined' && typeof window.ensureAuth === 'function') {
    try { await window.ensureAuth(); } catch (_) {}
  }

  // ---------- elementos ----------
  const $ = (id) => document.getElementById(id);
  const selEnt = $("entregador");
  const inpCod = $("codigo");
  const btnReg = $("btnRegistrar");
  const msg    = $("msgArea");
  const tbLast = $("ultimos-rows");

  // ---------- resumo dos últimos registros ----------
// Elementos para mostrar o total de registros por serviço (Shopee, Mercado Livre, Avulso) e o total geral.
const sumShopeeEl   = document.getElementById('ult-sum-shopee');
const sumMercadoEl  = document.getElementById('ult-sum-ml');
const sumAvulsoEl   = document.getElementById('ult-sum-avulso');
const sumTotalEl    = document.getElementById('ult-sum-total');

function updateSummary() {
  if (!sumShopeeEl || !sumMercadoEl || !sumAvulsoEl || !sumTotalEl) return;

  let shopee = 0, mercado = 0, avulso = 0, total = 0;

  for (const tr of rowsByKey.values()) {
    const srvCell = tr.querySelector('.srv');
    const statusCell = tr.querySelector('.status'); // garante captura do status, se existir
    const servico = (srvCell?.textContent || '').trim().toLowerCase();
    const status  = (statusCell?.textContent || '').trim().toLowerCase();

    // Ignora linhas sem serviço ou com status duplicado
    if (!servico || status === 'duplicado') continue;

    total++;
    if (servico === 'shopee') shopee++;
    else if (servico === 'mercado livre') mercado++;
    else if (servico === 'mercado_livre' || servico === 'mercadolivre') mercado++;
    else if (servico === 'avulso') avulso++;
  }

  sumShopeeEl.textContent  = shopee;
  sumMercadoEl.textContent = mercado;
  sumAvulsoEl.textContent  = avulso;
  sumTotalEl.textContent   = total;
}


  // ---------- mapa de linhas visíveis (evitar duplicar visualmente) ----------
  const rowsByKey = new Map(); // key(ent,cod) -> <tr>
  const keyFor = (entregador, codigo) =>
    `${String(entregador || "").toUpperCase()}||${String(codigo || "").toUpperCase()}`;

  // ---------- fila local de pendentes (mantém "Enviando…" até resposta) ----------
  const PENDING_KEY = "track:leituras:pending";
  const rowsById = new Map();  // id pendente -> <tr>
  const inflight = new Set();  // ids em envio

  function loadPending(){ try { return JSON.parse(localStorage.getItem(PENDING_KEY)||"[]"); } catch{ return []; } }
  function savePending(list){ localStorage.setItem(PENDING_KEY, JSON.stringify(list||[])); }
  function addPending(p){ const list = loadPending(); list.push(p); savePending(list); }
  function removePending(id){ const list = loadPending().filter(x => x.id !== id); savePending(list); rowsById.delete(id); inflight.delete(id); }
  function genId(){ return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2,8); }

  // ---------- sons ----------
  const Sound = (() => {
    let ctx;
    function ensure(){ if (!ctx) ctx = new (window.AudioContext||window.webkitAudioContext)(); if (ctx.state==='suspended') ctx.resume(); return ctx; }
    function beep({ freq=880, dur=120, type="sine", vol=0.06, when=0 }){
      const c=ensure(), t0=c.currentTime+when/1000, o=c.createOscillator(), g=c.createGain();
      o.type=type; o.frequency.value=freq; g.gain.setValueAtTime(vol,t0); g.gain.linearRampToValueAtTime(0.0001,t0+dur/1000);
      o.connect(g).connect(c.destination); o.start(t0); o.stop(t0+dur/1000+0.02); return dur;
    }
    function play(kind){
      if (kind==="ok"){ let d=0; d+=beep({freq:1046,dur:90, type:"sine",vol:0.05,when:d}); beep({freq:1318,dur:140,type:"sine",vol:0.05,when:d+60}); }
      else if (kind==="warn"){ let d=0; d+=beep({freq:660,dur:120,type:"triangle",vol:0.05,when:d}); beep({freq:660,dur:120,type:"triangle",vol:0.05,when:d+160}); }
      else { beep({freq:220,dur:240,type:"square",vol:0.06,when:0}); beep({freq:180,dur:220,type:"square",vol:0.06,when:260}); }
    }
    return { play };
  })();

 // ---------- mensagens ----------
function showMsgIcon(tipo, texto) {
  const map = {
    erro:   { ico: "alert-octagon",  klass: "danger"  },
    alerta: { ico: "alert-triangle", klass: "warning" },
    info:   { ico: "alert-circle",   klass: "info"    }
  };
  const m = map[tipo] || map.info;

  // 1) Mensagem na área padrão da página (fora do overlay)
  if (msg) {
    msg.innerHTML = `
      <div class="d-flex align-items-center gap-2">
        <i data-feather="${m.ico}" class="icon-dual icon-dual-${m.klass}"></i>
        <span>${texto}</span>
      </div>`;
    window.feather && feather.replace();
  }

  // 2) Espelha a mensagem dentro do overlay da câmera, se estiver aberto
  const overlay = document.getElementById('scanFS');
  const hud = document.getElementById('scanFSMsg');
  if (overlay && hud && overlay.classList.contains('show')) {
    hud.textContent = String(texto || '');
    hud.classList.remove('info', 'warning', 'danger', 'show');
    hud.classList.add(m.klass || 'info', 'show');

    // auto-esconde após alguns segundos (renova o timer a cada msg)
    clearTimeout(hud._t);
    hud._t = setTimeout(() => {
      hud.classList.remove('show');
    }, tipo === 'erro' ? 3000 : 2000);
  }
}


  // ---------- normalização / classificação ----------
  function toAsciiDigits(s){
    if (!s) return "";
    const sup = {"⁰":"0","¹":"1","²":"2","³":"3","⁴":"4","⁵":"5","⁶":"6","⁷":"7","⁸":"8","⁹":"9"};
    s = String(s).replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, d => sup[d]);
    s = s.replace(/[０-９]/g, d => String.fromCharCode(d.charCodeAt(0) - 0xFF10 + 0x30));
    return s;
  }
function classifyCodigo(rawInput){
  const raw = toAsciiDigits(String(rawInput || "")).toUpperCase().trim();
  const allDigits = raw.replace(/\D+/g, "");

  // ===========================================================
  // 🆕 PRIORIDADE MÁXIMA: QRCode JSON contendo external_order_id
  // ===========================================================
  try {
    if (raw.startsWith("{") && raw.endsWith("}")) {
      const obj = JSON.parse(raw);

      if (obj && typeof obj.external_order_id === "string") {
        const cod = obj.external_order_id.toUpperCase().trim();
        return { ok: true, servico: "Avulso", codigo: cod };
      }
    }
  } catch(e) {
    // ignora erro de JSON e continua fluxo normal
  }

  // 🚫 NF-e (44 dígitos)
  if (/^\d{44}$/.test(allDigits)) return { ok:false, motivo:"NF-e (44 dígitos)" };

  // Shopee (BR + 13 dígitos OU 12 dígitos + letra)
  const sh = raw.match(/(?:^|[^A-Z0-9])(BR(?:\d{13}|\d{12}[A-Z]))(?=$|[^A-Z0-9])/i);
  if (sh) return { ok:true, servico:"Shopee", codigo: sh[1].toUpperCase() };

  // Mercado Livre (11 dígitos começando com 45–49)
  const mlRun = allDigits.match(/4[5-9]\d{9,}/);
  if (mlRun) return { ok:true, servico:"Mercado Livre", codigo: mlRun[0].slice(0, 11) };

  // ===========================================================
  // 🟢 AVULSO — padrões existentes (exceto LM manual)
  // ===========================================================
  if (
    /^CP\d{3,}/.test(raw) ||
    /^TIME\d{6}$/i.test(raw)
    
  ) {
    return { ok: true, servico: "Avulso", codigo: raw };
  }

  // 🟢 Avulso (telefone)
  const phone = raw.match(/0?(\d{2})[-\s]?(\d{4,5})[-\s]?(\d{4})/);
  if (phone) {
    const cod = `${phone[1]}${phone[2]}${phone[3]}`;
    return { ok: true, servico: "Avulso", codigo: cod };
  }

  // Sem match
  return { ok:false, motivo:"Padrão não configurado" };
}


  // helper: detectar 409 de DUPLICADO (não confundir com 409 de créditos)
  function isDupConflict(err){
    const msg = ((err && (err.error || err.detail || err.message || err.text)) || "").toString();
    return err?.status === 409
      && !/cr[ée]dit/i.test(msg) // outro 409 é de créditos insuficientes
      && /(já\s*(foi\s*)?(registrad[oa]|exist[ea]|cadastrad[oa])|duplicad[oa])/i.test(msg);
  }

  // ---------- últimos registros (DOM) ----------
  function clearUltimos(){
    if (tbLast) tbLast.innerHTML = "";
    rowsByKey.clear();
    // Após limpar as linhas, zera o resumo de contagens
    updateSummary();
  }


// ===== FUNÇÃO REMOVER SAÍDA =====
async function removerSaida(id, tr) {
  if (!id) {
    showMsgIcon("erro", "ID inválido para remoção.");
    return;
  }

  const confirm = await Swal.fire({
    icon: "warning",
    title: "Remover leitura?",
    text: "Deseja remover este registro de saída?",
    showCancelButton: true,
    confirmButtonText: "Sim, remover",
    cancelButtonText: "Cancelar",
  });

  if (!confirm.isConfirmed) return;

  try {
    const resp = await TrackAPI.deleteSaida(id);
    if (!resp.ok) throw new Error(resp.error || "Falha ao remover");

    tr.remove();
    rowsByKey.delete(tr.dataset.key);

    updateSummary();
    showMsgIcon("info", "Leitura removida.");
    Sound.play("ok");
  } catch (e) {
    console.error(e);
    showMsgIcon("erro", "Erro ao remover leitura.");
    Sound.play("err");
  }
}

function createRow(row){
    const tr = document.createElement("tr");
    tr.dataset.key = keyFor(row.entregador, row.codigo);
    tr.innerHTML = `
      <td class="ts">${row.tsFmt || new Date().toLocaleString("pt-BR")}</td>
      <td class="ent">${row.entregador || ""}</td>
      <td class="cod">${row.codigo || ""}</td>
      <td class="srv">${row.servico || ""}</td>
      <td class="st">${row.status || "Enviando…"}</td>
      <td class="remove text-center">
  <button class="btn btn-sm btn-outline-danger btn-remove" data-id="${row.id_saida || ""}">
    <i class="ri-delete-bin-line"></i>
  </button>
</td>`;
    tbLast.prepend(tr);
    rowsByKey.set(tr.dataset.key, tr);
    // Adiciona listener ao botão de remover
    tr.querySelector(".btn-remove")?.addEventListener("click", (ev) => {
  ev.preventDefault();
  removerSaida(ev.currentTarget.dataset.id, tr);
});

    return tr;
  }

 function appendOrUpdateRow(row){
  const k = keyFor(row.entregador, row.codigo);
  const ex = rowsByKey.get(k);

  // ======== ATUALIZAR LINHA EXISTENTE ========
  if (ex) {
    ex.querySelector(".srv").textContent = row.servico || ex.querySelector(".srv").textContent;
    ex.querySelector(".st").textContent  = row.status  || ex.querySelector(".st").textContent;

    // Atualiza o resumo após editar a linha existente
    updateSummary();
    return ex;
  }

  // ======== CRIAR NOVA LINHA ========
  const newRow = createRow(row);

  // Ativar botão REMOVER para a nova linha
  newRow.querySelector(".btn-remove")?.addEventListener("click", (ev) => {
    ev.preventDefault();
    removerSaida(ev.currentTarget.dataset.id, newRow);
  });

  // Atualiza resumo
  updateSummary();
  return newRow;
}


  // ---------- API helpers ----------
  function apiGetEntregadores(){
    return window.TrackAPI?.getEntregadores
      ? TrackAPI.getEntregadores()
      : Promise.reject(new Error("TrackAPI.getEntregadores não disponível"));
  }
  function apiRegistrarSaida({ entregador, codigo, servico }){
    return window.TrackAPI?.registerSaida
      ? TrackAPI.registerSaida({ entregador, codigo, servico })
      : Promise.reject(new Error("TrackAPI.registerSaida não disponível"));
  }

  // ---------- envio (usa fila local) ----------
  async function attemptSend(p){
    if (inflight.has(p.id)) return;
    inflight.add(p.id);
    const tr = rowsById.get(p.id);
    if (tr) tr.querySelector('.st').textContent = 'Enviando…';
    try {
      const res = await apiRegistrarSaida({ entregador: p.entregador, codigo: p.codigo, servico: p.servico });
      // Se a resposta não for OK, lidar com conflitos e outros erros
      if (!res || !res.ok) {
        // Conflito de duplicidade no backend
        if (res && res.status === 409 && isDupConflict(res)) {
          removePending(p.id);
          if (tr) tr.remove();
          rowsById.delete(p.id);
          rowsByKey.delete(keyFor(p.entregador, p.codigo));
          updateSummary();
          showMsgIcon('alerta', `DUPLICADO • ${p.codigo}`);
          Sound.play('warn');
          return;
        }
        // Outros erros: remove a entrada e exibe mensagem
        removePending(p.id);
        if (tr) tr.remove();
        rowsById.delete(p.id);
        rowsByKey.delete(keyFor(p.entregador, p.codigo));
        updateSummary();
        let errMsg;
        if (res && typeof res.error === 'string') {
          errMsg = res.error;
        } else if (res && res.error && typeof res.error === 'object') {
          errMsg = res.error.error || res.error.detail || res.error.message || res.error.msg;
          if (!errMsg && res.error.text) errMsg = res.error.text;
          if (!errMsg) errMsg = JSON.stringify(res.error);
        }
        if (!errMsg) errMsg = 'Erro ao registrar';
        showMsgIcon('erro', errMsg);
        Sound.play('err');
        return;
      }
      // sucesso
      removePending(p.id);
      const apiRow = (res && typeof res === 'object' && typeof res.data === 'object') ? res.data : {};
      const novoServico = apiRow.servico ?? p.servico ?? '';
      const duplicado   = !!apiRow.duplicado;
      const novoStatus  = duplicado ? 'Duplicado' : (apiRow.status ?? 'Saiu');
      if (duplicado) {
        // Se o backend sinalizar duplicado na resposta OK, não exibe a linha
        if (tr) tr.remove();
        rowsById.delete(p.id);
        rowsByKey.delete(keyFor(p.entregador, p.codigo));
        updateSummary();
        showMsgIcon('alerta', `DUPLICADO • ${p.codigo}`);
        Sound.play('warn');
      } else {
        // Caso de sucesso verdadeiro: atualiza e mantém a linha
        if (tr) {
          tr.querySelector('.srv').textContent = novoServico;
          tr.querySelector('.st').textContent  = novoStatus;
          updateSummary();
        }
        showMsgIcon('info', `Registrado: ${p.codigo}${novoServico ? ' • ' + novoServico : ''}`);
        Sound.play('ok');
      }
    } catch (e) {
      // Erro inesperado (promise rejected)
      removePending(p.id);
      if (tr) tr.remove();
      rowsById.delete(p.id);
      rowsByKey.delete(keyFor(p.entregador, p.codigo));
      updateSummary();
      let catchMsg;
      if (e && typeof e.error === 'string') {
        catchMsg = e.error;
      } else if (e && e.error && typeof e.error === 'object') {
        catchMsg = e.error.error || e.error.detail || e.error.message || e.error.msg;
        if (!catchMsg && e.error.text) catchMsg = e.error.text;
        if (!catchMsg) catchMsg = JSON.stringify(e.error);
      } else if (e && typeof e.message === 'string') {
        catchMsg = e.message;
      }
      if (!catchMsg) catchMsg = 'Erro ao registrar';
      showMsgIcon('erro', catchMsg);
      Sound.play('err');
    }
  }

  // ---------- carregar entregadores (sempre inicia vazio) ----------
  function loadEntregadores(){
    return apiGetEntregadores().then(res => {
      const raw = Array.isArray(res) ? res : (res?.data ?? []);
      const lista = raw.map(e => typeof e === "string" ? e : (e?.nome || e?.name)).filter(Boolean);
      if (!selEnt) return;
      selEnt.innerHTML =
        '<option value="" selected disabled>Selecione entregador</option>' +
        lista.map(n => `<option value="${n}">${n}</option>`).join("");
      selEnt.selectedIndex = 0; // não lembrar último
      onEntregadorChange();
    }).catch(() => { showMsgIcon("erro","Falha ao carregar entregadores."); Sound.play("err"); });
  }

  function onEntregadorChange(){
    clearUltimos();
    const entNow = selEnt?.value || "";
    if (!entNow) return;
    // renderiza pendentes deste entregador (ficam como "Enviando…")
    const pend = loadPending().filter(p => p.entregador === entNow);
    for (const p of pend) {
      const tr = appendOrUpdateRow({
        tsFmt: new Date().toLocaleString("pt-BR"),
        entregador: p.entregador,
        codigo: p.codigo,
        servico: p.servico || "",
        status: "Enviando…",
        duplicado: false
      });
      rowsById.set(p.id, tr);
    }
  }

// ---------- registrar ----------
async function registrar() {
  try {
    const entregador = selEnt?.value?.trim() || "";
    if (!entregador) {
      showMsgIcon("erro", "Selecione o entregador.");
      Sound.play("err");
      return { ok:false, tipo:"sem_entregador" };
    }

    const rawInput = inpCod?.value || "";
    if (!rawInput.trim()) {
      showMsgIcon("erro", "Informe o código.");
      Sound.play("err");
      return { ok:false, tipo:"codigo_vazio" };
    }

    const cls = classifyCodigo(rawInput);
    if (!cls.ok) {
      showMsgIcon("erro", `Código inválido: ${cls.motivo}.`);
      Sound.play("err");
      inpCod && inpCod.select();
      return { ok:false, tipo:"codigo_invalido", detalhe:cls.motivo };
    }

    const codigoFinal = cls.codigo;
    const servico = cls.servico;
    const k = keyFor(entregador, codigoFinal);

    // 🔹 Já existe nesta sessão (DUPLICADO LOCAL)
    if (rowsByKey.has(k)) {
      Sound.play("warn");
      const cameraAtiva = document.getElementById("scanFS")?.classList.contains("show");
      const mensagem = `Duplicado • ${codigoFinal}`;
      if (cameraAtiva) {
        // showMsg só existe dentro da IIFE do scanner — proteja a chamada
        if (typeof showMsg === "function") {
          showMsg("alerta", mensagem);
        } else {
          showMsgIcon("alerta", mensagem);
        }
      } else {
        showMsgIcon("alerta", mensagem);
      }

       if (inpCod) { inpCod.value = ""; inpCod.focus(); }

      return { ok:false, tipo:"duplicado" };
    }

    const token = localStorage.getItem("authToken") || localStorage.getItem("access_token");

    // 🔹 Consulta saída
    const resp = await fetch(`${window.TRACK_API_URL}/saidas/listar?codigo=${encodeURIComponent(codigoFinal)}`, {
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "Authorization": `Bearer ${token}` } : {})
      },
      credentials: "include"
    });

    if (!resp.ok) {
      if (resp.status === 401) {
        showMsgIcon("erro", "Sessão expirada. Faça login novamente.");
        Sound.play("err");
        return { ok:false, tipo:"nao_autorizado" };
      }

      return { ok:false, tipo:"erro_http", detalhe:`${resp.status}` };
    }

    const dados = await resp.json();

    // =======================================================
    // IGNORAR COLETA = TRUE
    // =======================================================
    if (window.IGNORAR_COLETA === true && (!Array.isArray(dados) || dados.length === 0)) {

      const postResp = await fetch(`${window.TRACK_API_URL}/saidas/registrar`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {})
        },
        credentials: "include",
        body: JSON.stringify({
          codigo: codigoFinal,
          entregador,
          servico,
          status: "Saiu para entrega"
        })
      });

      if (!postResp.ok) {
        const msg = await postResp.text().catch(() => "");
        return { ok:false, tipo:"erro_ignorar", detalhe:msg };
      }

      const data = await postResp.json();

      appendOrUpdateRow({
        tsFmt: new Date().toLocaleString("pt-BR"),
        entregador,
        codigo: codigoFinal,
        servico,
        status: "Saiu para entrega",
        id_saida: data.id_saida,
        duplicado: false
      });

      updateSummary();
      showMsgIcon("info", `Registrado ✓ ${codigoFinal}`);
      Sound.play("ok");

      if (inpCod) { inpCod.value = ""; inpCod.focus(); }

      return { ok:true, tipo:"ignorar_coleta_saida" };
    }

    // =======================================================
    // FLUXO ORIGINAL — coleta obrigatória
    // =======================================================
    if (!Array.isArray(dados) || dados.length === 0) {
      const overlay = document.getElementById("scanFS");
      const wasActive = overlay?.classList.contains("show");
      if (wasActive) overlay.style.display = "none";

      const confirm = await Swal.fire({
        icon: "warning",
        title: "Código não coletado",
        html: `<p>O código <strong>${codigoFinal}</strong> ainda não foi coletado.</p>
               <p>Deseja registrar mesmo assim?</p>`,
        showCancelButton: true,
        confirmButtonText: "Sim, registrar",
        cancelButtonText: "Cancelar",
        allowOutsideClick: false,
        backdrop: true
      });

      if (!confirm.isConfirmed) {
        if (wasActive) overlay.style.display = "block";
        return { ok:false, tipo:"nao_coletado_cancelado" };
      }

      const postResp = await fetch(`${window.TRACK_API_URL}/saidas/registrar`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {})
        },
        credentials: "include",
        body: JSON.stringify({
          codigo: codigoFinal,
          entregador,
          servico,
          status: "Não Coletado"
        })
      });

      if (!postResp.ok) {
        const msg = await postResp.text().catch(() => "");
        return { ok:false, tipo:"erro_registrar_nao_coletado", detalhe:msg };
      }

      appendOrUpdateRow({
        tsFmt: new Date().toLocaleString("pt-BR"),
        entregador,
        codigo: codigoFinal,
        servico,
        status: "Não Coletado",
        duplicado: false
      });

      updateSummary();
      showMsgIcon("alerta", `Registrado como Não Coletado: ${codigoFinal}`);
      Sound.play("warn");

      return { ok:true, tipo:"nao_coletado_registrado" };
    }

    // =======================================================
    // EXISTE REGISTRO (fluxo normal)
    // =======================================================
    const registro = dados[0];
    const statusAtual = (registro.status || "").toLowerCase();

    if (statusAtual === "saiu" || statusAtual === "saiu para entrega") {
      showMsgIcon("alerta", `O código ${codigoFinal} já saiu para entrega.`);
      Sound.play("warn");
      if (inpCod) { inpCod.value = ""; inpCod.focus(); }
      return { ok:false, tipo:"ja_saiu" };
    }

    if (statusAtual === "coletado") {
      const patchResp = await fetch(`${window.TRACK_API_URL}/saidas/${registro.id_saida}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {})
        },
        credentials: "include",
        body: JSON.stringify({
          status: "Saiu para entrega",
          entregador
        })
      });

      if (!patchResp.ok) {
        const msg = await patchResp.text();
        return { ok:false, tipo:"erro_patch", detalhe:msg };
      }

      appendOrUpdateRow({
        tsFmt: new Date().toLocaleString("pt-BR"),
        entregador,
        codigo: codigoFinal,
        servico,
        status: "Saiu para entrega",
        id_saida: registro.id_saida,
        duplicado: false
      });

      updateSummary();
      showMsgIcon("info", `Registrado ✓ ${codigoFinal} • Saiu para entrega`);
      Sound.play("ok");

      if (inpCod) { inpCod.value = ""; inpCod.focus(); }

      return { ok:true, tipo:"coletado" };
    }

    showMsgIcon("erro", `Status atual: ${registro.status || "desconhecido"}`);
    Sound.play("err");

    return { ok:false, tipo:"status_desconhecido", detalhe:registro.status };

  } catch (err) {
    console.error("Erro registrar():", err);
    return { ok:false, tipo:"erro_excecao", detalhe:String(err) };
  }
}



// ===== Leitor por Câmera — Full-screen (híbrido BarcodeDetector + ZXing) =====
(function leituraScannerIntegrado() {
  const btnScan = document.getElementById("btnScan");
  const inputCodigo = document.getElementById("codigo");
  if (!btnScan) return;

  const overlay = document.getElementById("scanFS");
  const video = document.getElementById("scanFSVideo");
  const hud = document.getElementById("scanFSMsg");
  const contadorEl = document.getElementById("scan-packages-count");
  const closeBtn = document.getElementById("scanCloseBtn");

  let totalLidos = 0;
  let scanLocked = false;
  let interval = null;
  let stream = null;

  // Atualiza contador
  function atualizarContador() {
    contadorEl.textContent = `${totalLidos} ${totalLidos === 1 ? "Saída Lida" : "Saídas Lidas"}`;
  }

  // HUD de mensagens
  function showMsg(tipo, msg) {
    hud.textContent = msg;
    hud.classList.remove("info", "warning", "danger", "show");
    hud.classList.add(tipo === "erro" ? "danger" : tipo === "alerta" ? "warning" : "info", "show");
    clearTimeout(hud._t);
    hud._t = setTimeout(() => hud.classList.remove("show"), tipo === "erro" ? 3000 : 2000);
  }

  // Fecha scanner
  function stopScanner() {
    if (interval) clearInterval(interval);
    if (stream) { try { stream.getTracks().forEach(t => t.stop()); } catch (_) {} }
    stream = null;
    scanLocked = false;
    overlay.classList.remove("show");
    overlay.style.display = "none";
    document.body.style.overflow = "";
  }

  async function startScanner() {
    totalLidos = 0;
    atualizarContador();
    overlay.classList.add("show");
    overlay.style.display = "block";
    document.body.style.overflow = "hidden";

    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      video.srcObject = stream;
      await video.play();
    } catch (err) {
      showMsg("erro", "Câmera não disponível");
      document.body.style.overflow = "";
      return;
    }

    // --- Verifica suporte nativo ---
    if ("BarcodeDetector" in window) {
      try {
        const detector = new BarcodeDetector({ formats: ["qr_code", "ean_13", "code_128", "code_39", "itf", "upc_a", "upc_e"] });
        interval = setInterval(async () => {
          if (scanLocked) return;
          const barcodes = await detector.detect(video);
          if (!barcodes.length) return;
          const code = barcodes[0].rawValue || "";
          processarCodigo(code);
        }, 180);
        return;
      } catch (e) {
        console.warn("Erro BarcodeDetector, fallback ZXing:", e);
      }
    }

    // --- Fallback ZXing para iPhone ---
    if (window.ZXingBrowser) {
      const reader = new ZXingBrowser.BrowserMultiFormatReader();
      try {
        await reader.decodeFromVideoDevice(null, video, (result, err) => {
          if (!result) return;
          processarCodigo(result.getText());
        });
      } catch (e) {
        console.error("Erro ZXing fallback:", e);
        showMsg("erro", "Leitor não suportado neste dispositivo.");
      }
    } else {
      showMsg("erro", "Leitor não suportado neste dispositivo.");
    }

    // Listener do botão Fechar
    if (closeBtn) {
      closeBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        stopScanner();
      };
    }
  }

// 🔹 Processa cada leitura detectada (agora assíncrona)
async function processarCodigo(text) {
  const codigo = String(text || "").trim();
  if (!codigo || scanLocked) return;
  scanLocked = true;

  const entregador = document.getElementById("entregador")?.value;
  if (!entregador) {
    showMsg("alerta", "Selecione o entregador antes de escanear.");
    Sound.play("warn");
    scanLocked = false;
    return;
  }

  if (inputCodigo) inputCodigo.value = codigo;

  try {
    if (typeof registrar === "function") {
      const result = await registrar(); // { ok, tipo }

      if (result?.ok) {
        totalLidos++;
        atualizarContador();

        if (result.tipo === "coletado") {
          showMsg("info", `Saiu para entrega ✓ (${totalLidos})`);
          Sound.play("ok");
        } else if (result.tipo === "nao_coletado_registrado") {
          showMsg("alerta", `Registrado como Não Coletado (${totalLidos})`);
          Sound.play("warn");
        } else {
          showMsg("info", `Registrado ✓ (${totalLidos})`);
          Sound.play("ok");
        }
      } else {
        // 🔹 Exibe mensagem conforme tipo do erro
        switch (result?.tipo) {
          case "duplicado":
            showMsg("alerta", result?.detalhe || "Duplicado — código já lido nesta sessão.");
            Sound.play("warn");
            break;
          case "ja_saiu":
            showMsg("alerta", result?.detalhe || "Código já saiu para entrega.");
            Sound.play("warn");
            break;
          case "nao_coletado_cancelado":
            showMsg("alerta", result?.detalhe || "Registro cancelado (não coletado).");
            Sound.play("warn");
            break;
          case "status_desconhecido":
            showMsg("erro", result?.detalhe || "Status do código desconhecido.");
            Sound.play("err");
            break;
          default:
            if (result?.detalhe) {
              showMsg("erro", result.detalhe);
            } else {
              showMsg("erro", "Leitura ignorada ou erro não especificado.");
            }
            Sound.play("err");
        }
      }
    }
  } catch (err) {
    console.error("Erro ao registrar (camera):", err);
    showMsg("erro", "Falha ao registrar saída.");
    Sound.play("err");
  } finally {
    setTimeout(() => (scanLocked = false), 800);
  }
}


// ======== Botões e listeners fixos ========

  // Botão principal para abrir o scanner
  btnScan.onclick = (ev) => {
    ev.preventDefault();
    startScanner();
  };

  // Botão fechar (X)
  if (closeBtn) {
    closeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      stopScanner();
    });
  }

   // Fecha a câmera ao sair da página
  window.addEventListener("beforeunload", stopScanner);
})();


// ---------- eventos ----------
selEnt?.addEventListener("change", onEntregadorChange);
btnReg?.addEventListener("click", registrar);
inpCod?.addEventListener("keydown", (e) => { 
  if (e.key === "Enter") { 
    e.preventDefault(); 
    registrar(); 
  } 
});

// ---------- init ----------
loadEntregadores().then(() => { inpCod?.focus(); });
// tenta reenviar pendentes (inclusive de sessões anteriores)
for (const p of loadPending()) attemptSend(p);

})();
