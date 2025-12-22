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
    const statusCell = tr.querySelector('.st'); // garante captura do status, se existir
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

  // ---------- lock temporário por código (anti-rajada) ----------
const CODE_LOCK_TTL_MS = 3000; // 3 segundos
const codeLocks = new Map(); // codigo -> timestamp

function isCodeLocked(codigo) {
  const ts = codeLocks.get(codigo);
  if (!ts) return false;
  if (Date.now() - ts > CODE_LOCK_TTL_MS) {
    codeLocks.delete(codigo);
    return false;
  }
  return true;
}

function lockCode(codigo) {
  codeLocks.set(codigo, Date.now());
}


  function loadPending(){ try { return JSON.parse(localStorage.getItem(PENDING_KEY)||"[]"); } catch{ return []; } }
  function savePending(list){ localStorage.setItem(PENDING_KEY, JSON.stringify(list||[])); }
  function addPending(p){ const list = loadPending(); list.push(p); savePending(list); }
  function removePending(id){ const list = loadPending().filter(x => x.id !== id); savePending(list); rowsById.delete(id); inflight.delete(id); }
  function genId(){ return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2,8); }

  // ---------- sons ----------
  const Sound = (() => {
    let ctx;
    function ensure(){ if (!ctx) ctx = new (window.AudioContext||window.webkitAudioContext)(); if (ctx.state==='suspended') ctx.resume(); return ctx; }
    function beep({ freq=880, dur=120, type="sine", vol=1.2, when=0 }){
      const c=ensure(), t0=c.currentTime+when/1000, o=c.createOscillator(), g=c.createGain();
      o.type=type; o.frequency.value=freq; g.gain.setValueAtTime(vol,t0); g.gain.linearRampToValueAtTime(0.0001,t0+dur/1000);
      o.connect(g).connect(c.destination); o.start(t0); o.stop(t0+dur/1000+0.02); return dur;
    }
    function play(kind){
      if (kind==="ok"){ let d=0; d+=beep({freq:1046,dur:90, type:"sine",vol:1.2,when:d}); beep({freq:1318,dur:140,type:"sine",vol:1.2,when:d+60}); }
      else if (kind==="warn"){ let d=0; d+=beep({freq:660,dur:120,type:"triangle",vol:1.2,when:d}); beep({freq:660,dur:120,type:"triangle",vol:1.2,when:d+160}); }
      else { beep({freq:220,dur:240,type:"square",vol:1.2,when:0}); beep({freq:180,dur:220,type:"square",vol:1.2,when:260}); }
    }
    return { play };
  })();

// =====================================================
// MÉTRICAS DE LEITURA (FRONT)
// =====================================================
window.LeituraMetrics = {
  seq: 0,
  lastReadTs: null
};

function startLeituraMetric({ origem, raw }) {
  const now = performance.now();
  const delta = window.LeituraMetrics.lastReadTs
    ? now - window.LeituraMetrics.lastReadTs
    : null;

  window.LeituraMetrics.seq++;
  window.LeituraMetrics.lastReadTs = now;

  return {
    seq: window.LeituraMetrics.seq,
    origem,
    raw,
    ts_read: now,
    delta_from_last_read_ms: delta
  };
}

function markEnvioMetric(m) {
  m.ts_send = performance.now();
  m.delta_read_to_send_ms = m.ts_send - m.ts_read;
}

function markRespostaMetric(m, ok, tipo) {
  m.ts_response = performance.now();
  m.delta_send_to_response_ms = m.ts_response - m.ts_send;
  m.ok = ok;
  m.resultado = tipo;
}

// =====================================================
// ENVIO DE LOG (FIRE-AND-FORGET)
// =====================================================
function enviarLogLeitura(payload) {
  try {
    const token =
      localStorage.getItem("authToken") ||
      localStorage.getItem("access_token");

    fetch(`${window.TRACK_API_URL}/logs/leituras`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "Authorization": `Bearer ${token}` } : {})
      },
      credentials: "include",
      body: JSON.stringify(payload)
    }).catch(() => {});
  } catch (_) {}
}


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
  // PRIORIDADE 1 — QRCode JSON com external_order_id
  // ===========================================================
  try {
    if (raw.startsWith("{") && raw.endsWith("}")) {
      const obj = JSON.parse(raw);
      if (typeof obj.external_order_id === "string") {
        return { ok:true, servico:"Avulso", codigo: obj.external_order_id.toUpperCase().trim() };
      }
    }
  } catch(_) {}

  // ===========================================================
  // PRIORIDADE 2 — external_order_id fora de JSON
  // ===========================================================
  const extMatch = raw.match(/external_order_id["']?\s*[:=]\s*["']?([\w-]+)/i);
  if (extMatch) {
    return { ok:true, servico:"Avulso", codigo: extMatch[1].toUpperCase() };
  }

  // ===========================================================
  // PRIORIDADE 3 — MAGALU (external_grouper_code)
  // ===========================================================
  const magaluMatch = raw.match(/external_grouper_code\^Ç\^(\d{10,})\^/i);
  if (magaluMatch) {
    return { ok:true, servico:"Avulso", codigo: magaluMatch[1] };
  }

  // ===========================================================
  // PRIORIDADE 4 — LMxxxx é sempre Avulso
  // ===========================================================
  if (/^LM[\w\d-]+$/i.test(raw)) {
    return { ok:true, servico:"Avulso", codigo: raw };
  }

  // ===========================================================
  // 🚫 NF-e (44 dígitos)
  // ===========================================================
  if (/^\d{44}$/.test(allDigits)) {
    return { ok:false, motivo:"NF-e (44 dígitos)" };
  }

  // ===========================================================
  // Shopee
  // ===========================================================
  const sh = raw.match(/(?:^|[^A-Z0-9])(BR(?:\d{13}|\d{12}[A-Z]))(?=$|[^A-Z0-9])/i);
  if (sh) {
    return { ok:true, servico:"Shopee", codigo: sh[1].toUpperCase() };
  }

  // ===========================================================
  // Mercado Livre (45–49 → 11 dígitos)
  // ===========================================================
  const mlRun = allDigits.match(/4[5-9]\d{9,}/);
  if (mlRun) {
    return { ok:true, servico:"Mercado Livre", codigo: mlRun[0].slice(0, 11) };
  }

  // ===========================================================
  // AVULSO — CEP (8 dígitos)
  // ===========================================================
  if (/^\d{8}$/.test(allDigits)) {
    return { ok:true, servico:"Avulso", codigo: allDigits };
  }

  // ===========================================================
  // AVULSO — EVAS (7 dígitos)
  // ===========================================================
  if (/^\d{7}$/.test(allDigits)) {
    return { ok:true, servico:"Avulso", codigo: allDigits };
  }

  // ===========================================================
  // AVULSO — padrões antigos
  // ===========================================================
  if (
    /^CP\d{3,}/.test(raw) ||
    /^TIME\d{6}$/i.test(raw)
  ) {
    return { ok:true, servico:"Avulso", codigo: raw };
  }

  // ===========================================================
  // Avulso — telefone
  // ===========================================================
  const phone = raw.match(/0?(\d{2})[-\s]?(\d{4,5})[-\s]?(\d{4})/);
  if (phone) {
    const cod = `${phone[1]}${phone[2]}${phone[3]}`;
    return { ok:true, servico:"Avulso", codigo: cod };
  }

  return { ok:false, motivo:"Padrão não configurado" };
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
      <td class="st">${row.status || "Processando..."}</td>
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
  // 🔒 não reenviar erro de negócio
  if (!p) return;
  if (p.noRetry === true) {
  removePending(p.id);
  return;
  }



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
          p.noRetry = true;
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

// =====================================================
// WRAPPER DE REGISTRO COM LOG
// =====================================================
async function registrarComLog(origem = "teclado") {
  const leituraMetric = startLeituraMetric({
    origem,
    raw: inpCod?.value || ""
  });

  let result;
  try {
    // ✅ marca o momento em que o envio começa
    markEnvioMetric(leituraMetric);

    // 🔒 fluxo original intacto
    result = await registrar();
    return result;

  } finally {
    // ✅ mede o tempo até a resposta
    markRespostaMetric(
      leituraMetric,
      !!result?.ok,
      result?.tipo
    );

    // 🔎 classifica o tipo de resultado (novo, sem quebrar nada)
    const resultadoTipo = result?.resultado || result?.tipo || "erro_desconhecido";
    const resultadoClasse = (
      resultadoTipo === "duplicado" ||
      resultadoTipo === "ja_saiu" ||
      resultadoTipo === "lock_temporario" ||
      resultadoTipo === "nao_coletado_cancelado"
    ) ? "negocio" : "tecnico";

    enviarLogLeitura({
      origem: leituraMetric.origem,
      tipo: "saida",
      codigo: result?.codigo || leituraMetric.raw,
      resultado: resultadoTipo,
      resultado_classe: resultadoClasse, // 🔹 campo extra (backend pode ignorar)
      delta_from_last_read_ms: leituraMetric.delta_from_last_read_ms,
      delta_read_to_send_ms: leituraMetric.delta_read_to_send_ms,
      delta_send_to_response_ms: leituraMetric.delta_send_to_response_ms,
      ts_read: leituraMetric.ts_read
    });
  }
}


// ---------- registrar ----------
async function registrar() {
  let codigoFinal;        // 🔹 necessário para o finally
  let lockAtivo = false;  // 🔹 garante liberação correta do lock

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

    codigoFinal = cls.codigo;
    const servico = cls.servico;
    const k = keyFor(entregador, codigoFinal);

    // 🔹 DUPLICADO LOCAL POR SESSÃO (primeiro, sem lock)
    if (rowsByKey.has(k)) {
      Sound.play("warn");
      showMsgIcon("alerta", `Já registrado • ${codigoFinal}`);
      if (inpCod) { inpCod.value = ""; inpCod.focus(); }
      return { ok:false, tipo:"duplicado" };
    }

    // 🔒 LOCK TEMPORÁRIO POR CÓDIGO (anti-rajada)
    if (isCodeLocked(codigoFinal)) {
      Sound.play("warn");
      showMsgIcon("info", `Processando ${codigoFinal}…`);
      return { ok:false, tipo:"lock_temporario" };
    }
    lockCode(codigoFinal);
    lockAtivo = true;

    const token = localStorage.getItem("authToken") || localStorage.getItem("access_token");

    // 🔹 Consulta situação da saída
    const resp = await fetch(
      `${window.TRACK_API_URL}/saidas/listar?codigo=${encodeURIComponent(codigoFinal)}`,
      {
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {})
        },
        credentials: "include"
      }
    );

    if (!resp.ok) {
      if (resp.status === 401) {
        showMsgIcon("erro", "Sessão expirada. Faça login novamente.");
        Sound.play("err");
        return { ok:false, tipo:"nao_autorizado" };
      }
      const msg = await resp.text().catch(()=> "");
      return { ok:false, tipo:"erro_http", detalhe:msg };
    }

    const dados = await resp.json();

    // Normaliza formatos
    let registros = [];
    if (Array.isArray(dados)) registros = dados;
    else if (Array.isArray(dados?.items)) registros = dados.items;
    else if (Array.isArray(dados?.rows)) registros = dados.rows;
    else if (Array.isArray(dados?.data)) registros = dados.data;

    // =======================================================
    // 1️⃣ SE EXISTE REGISTRO → TRATAR STATUS
    // =======================================================
    if (registros.length > 0) {
      const registro = registros[0];
      const statusAtual = ((registro.status || registro.st || "") + "").toLowerCase();
      const entregadorAtual = registro.entregador || registro.ent || "Desconhecido";
      const usuarioRegistro = registro.username || registro.user || registro.usuario || "Desconhecido";
      const entregadorNovo = entregador;
      const registroId = registro.id_saida || registro.id || registro._id || registro.idSaida;

      // 🚨 SAIU / SAIU PARA ENTREGA
      if (statusAtual === "saiu" || statusAtual === "saiu para entrega") {
        if (String(entregadorAtual) === String(entregadorNovo)) {
          showMsgIcon("alerta", `O código ${codigoFinal} já saiu para entrega.`);
          Sound.play("warn");
          return { ok:false, tipo:"ja_saiu" };
        }

        const overlay = document.getElementById("scanFS");
        const wasActiveOverlay = overlay?.classList.contains("show");
        if (wasActiveOverlay) {
          try { window.leituraStopScanner?.(); }
          catch(_) { overlay.style.display = "none"; }
        }

        const confirm = await Swal.fire({
          icon: "warning",
          title: "Código já saiu para entrega",
          html: `
            <p><strong>${codigoFinal}</strong></p>
            <p>Registrado por: ${usuarioRegistro}</p>
            <p>Entregador atual: ${entregadorAtual}</p>
            <hr>
            <p>Alterar para ${entregadorNovo}?</p>
          `,
          showCancelButton: true,
          confirmButtonText: "Sim, alterar entregador",
          cancelButtonText: "Não",
          allowOutsideClick: false,
          backdrop: true
        });

        if (!confirm.isConfirmed) {
          if (wasActiveOverlay) {
            try { window.leituraStartScanner?.(); }
            catch(_) { overlay.style.display = "block"; }
          }
          return { ok:false, tipo:"ja_saiu" };
        }

        const patchResp = await fetch(
          `${window.TRACK_API_URL}/saidas/${registroId}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { "Authorization": `Bearer ${token}` } : {})
            },
            credentials: "include",
            body: JSON.stringify({
              status: "Saiu para entrega",
              entregador: entregadorNovo
            })
          }
        );

        if (!patchResp.ok) {
          const msg = await patchResp.text().catch(() => "");
          return { ok:false, tipo:"erro_patch_troca_entregador", detalhe:msg };
        }

        appendOrUpdateRow({
          tsFmt: new Date().toLocaleString("pt-BR"),
          entregador: entregadorNovo,
          codigo: codigoFinal,
          servico,
          status: "Saiu para entrega",
          id_saida: registroId,
          duplicado: false
        });

        updateSummary();
        showMsgIcon("info", `Entregador alterado ✓ ${codigoFinal}`);
        Sound.play("ok");

        return { ok:true, tipo:"troca_entregador", codigo: codigoFinal };
      }

      // 🚚 COLETADO → SAIU
      if (statusAtual === "coletado") {
        const patchResp = await fetch(
          `${window.TRACK_API_URL}/saidas/${registroId}`,
          {
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
          }
        );

        if (!patchResp.ok) {
          const msg = await patchResp.text().catch(() => "");
          return { ok:false, tipo:"erro_patch", detalhe:msg };
        }

        appendOrUpdateRow({
          tsFmt: new Date().toLocaleString("pt-BR"),
          entregador,
          codigo: codigoFinal,
          servico,
          status: "Saiu para entrega",
          id_saida: registroId,
          duplicado: false
        });

        updateSummary();
        showMsgIcon("info", `Registrado ✓ ${codigoFinal} • Saiu para entrega`);
        Sound.play("ok");

        if (inpCod) { inpCod.value = ""; inpCod.focus(); }

        return { ok:true, tipo:"coletado", codigo: codigoFinal };
      }

      showMsgIcon("erro", `Status atual: ${registro.status || "desconhecido"}`);
      Sound.play("err");
      return { ok:false, tipo:"status_desconhecido", detalhe:registro.status };
    }

       // =======================================================
    // 2️⃣ SOMENTE SE NÃO EXISTE → FLUXO "NÃO COLETADO"
    // =======================================================

    // IGNORAR_COLETA = TRUE → registra direto
    if (window.IGNORAR_COLETA === true) {

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

      return { ok:true, tipo:"ignorar_coleta_saida", codigo: codigoFinal };
    }

    // FLUXO ORIGINAL — popup "Não Coletado"
    const overlay = document.getElementById("scanFS");
    const wasActive = overlay?.classList.contains("show");
    if (wasActive) {
      try { window.leituraStopScanner?.(); }
      catch(_) { overlay.style.display = "none"; }
    }

    const confirm = await Swal.fire({
      icon: "warning",
      title: "Código não coletado",
      html: `
        <p>O código <strong>${codigoFinal}</strong> ainda não foi coletado.</p>
        <p>Deseja registrar mesmo assim?</p>
      `,
      showCancelButton: true,
      confirmButtonText: "Sim, registrar",
      cancelButtonText: "Cancelar",
      allowOutsideClick: false,
      backdrop: true
    });

    if (!confirm.isConfirmed) {
      if (wasActive) {
        try { window.leituraStartScanner?.(); }
        catch(_) { overlay.style.display = "block"; }
      }
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

    return { ok:true, tipo:"nao_coletado_registrado", codigo: codigoFinal };

  } catch (err) {
    console.error("Erro registrar():", err);
    return { ok:false, tipo:"erro_excecao", detalhe:String(err) };

  } finally {
    // 🔓 libera lock somente se foi adquirido
    if (lockAtivo && codigoFinal) {
      setTimeout(() => {
        codeLocks.delete(codigoFinal);
      }, CODE_LOCK_TTL_MS);
    }
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

  // 🔒 Lock por código visível (anti-repetição)
  const SCAN_CODE_TTL_MS = 2000;
  const recentScanCodes = new Map();

  function isRecentlyScanned(code) {
    const ts = recentScanCodes.get(code);
    if (!ts) return false;
    if (Date.now() - ts > SCAN_CODE_TTL_MS) {
      recentScanCodes.delete(code);
      return false;
    }
    return true;
  }

  function markScanned(code) {
    recentScanCodes.set(code, Date.now());
  }

  function atualizarContador() {
    contadorEl.textContent =
      `${totalLidos} ${totalLidos === 1 ? "Saída Lida" : "Saídas Lidas"}`;
  }

  function showMsg(tipo, msg) {
    hud.textContent = msg;
    hud.classList.remove("info", "warning", "danger", "show");
    hud.classList.add(
      tipo === "erro" ? "danger" :
      tipo === "alerta" ? "warning" : "info",
      "show"
    );
    clearTimeout(hud._t);
    hud._t = setTimeout(
      () => hud.classList.remove("show"),
      tipo === "erro" ? 3000 : 2000
    );
  }

  function stopScanner() {
    if (interval) { clearInterval(interval); interval = null; }
    try { if (stream) stream.getTracks().forEach(t => t.stop()); } catch (_) {}
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
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false
      });
      video.srcObject = stream;
      await video.play();

      // 🔍 Zoom automático (quando suportado)
      try {
        const track = stream.getVideoTracks()[0];
        const caps = track?.getCapabilities?.();
        const settings = track?.getSettings?.();
        if (caps?.zoom) {
          const target = Math.min(Math.max(1.5, caps.zoom.min ?? 1), caps.zoom.max ?? 1);
          if (!settings.zoom || Math.abs(settings.zoom - target) > 0.05) {
            await track.applyConstraints({ advanced: [{ zoom: target }] });
          }
        }
      } catch (_) {}
    } catch (_) {
      showMsg("erro", "Câmera não disponível");
      document.body.style.overflow = "";
      return;
    }

    if ("BarcodeDetector" in window) {
      try {
        const detector = new BarcodeDetector({
          formats: ["qr_code", "ean_13", "code_128", "code_39", "itf", "upc_a", "upc_e"]
        });

        interval = setInterval(async () => {
          if (scanLocked) return;
          const barcodes = await detector.detect(video);
          if (barcodes.length) processarCodigo(barcodes[0].rawValue || "");
        }, 120);
        return;
      } catch (_) {}
    }

    if (window.ZXingBrowser) {
      const reader = new ZXingBrowser.BrowserMultiFormatReader();
      try {
        await reader.decodeFromVideoDevice(null, video, result => {
          if (result) processarCodigo(result.getText());
        });
      } catch (_) {
        showMsg("erro", "Leitor não suportado.");
      }
    } else {
      showMsg("erro", "Leitor não suportado.");
    }
  }

  // 🌍 Exposição controlada
  window.leituraStartScanner = startScanner;
  window.leituraStopScanner  = stopScanner;

  async function processarCodigo(text) {
    const codigo = String(text || "").trim();
    if (!codigo || scanLocked) return;

    if (isRecentlyScanned(codigo)) return;
    markScanned(codigo);

    scanLocked = true;
    overlay.classList.add("scan-lock");
    showMsg("info", "Processando…");

    const entregador = document.getElementById("entregador")?.value;
    if (!entregador) {
      showMsg("alerta", "Selecione o entregador antes de escanear.");
      scanLocked = false;
      overlay.classList.remove("scan-lock");
      return;
    }

    if (inputCodigo) inputCodigo.value = codigo;

    showMsg("info", "Processando…");

    try {
      const result = await registrarComLog("camera");

      if (result?.ok) {
        totalLidos++;
        atualizarContador();
      }

    } finally {
      overlay.classList.remove("scan-lock");
      setTimeout(() => (scanLocked = false), 200);
    }
  }

  btnScan.addEventListener("click", (e) => {
    e.preventDefault();
    startScanner();
  });

  closeBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    stopScanner();
  });

    window.addEventListener("beforeunload", stopScanner);
})(); // 🔚 fecha leituraScannerIntegrado


// ---------- init ----------
loadEntregadores().then(() => {
  inpCod?.focus();
});

// tenta reenviar pendentes (somente técnicos)
for (const p of loadPending()) {
  if (p && p.noRetry !== true) {
    attemptSend(p);
  }
}

// ---------- eventos (registro manual) ----------
btnReg?.addEventListener("click", (e) => {
  e.preventDefault();
  registrarComLog("teclado");
});

inpCod?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    registrarComLog("teclado");
  }
});

})(); 

