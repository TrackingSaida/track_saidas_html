// assets/js/pages/tracking-leitura.init.js
// Leitura: classificação, fila local, sons, "Dup?" como checkbox
// Regras:
//  - Não lembrar último entregador (select inicia vazio)
//  - Se já existir NA SESSÃO: não cria linha e não envia; só avisa
//  - Se for DUPLICADO no BACK (409): mantém a linha e marca Status="Duplicado" (checkbox checado)
(function () {
  "use strict";

  // ---------- elementos ----------
  const $ = (id) => document.getElementById(id);
  const selEnt = $("entregador");
  const inpCod = $("codigo");
  const btnReg = $("btnRegistrar");
  const msg    = $("msgArea");
  const tbLast = $("ultimos-rows");

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
    if (!msg) return;
    msg.innerHTML = `
      <div class="d-flex align-items-center gap-2">
        <i data-feather="${m.ico}" class="icon-dual icon-dual-${m.klass}"></i>
        <span>${texto}</span>
      </div>`;
    window.feather && feather.replace();
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

    // 🚫 NF-e (44 dígitos)
    if (/^\d{44}$/.test(allDigits)) return { ok:false, motivo:"NF-e (44 dígitos)" };

    // Shopee: BR + 13 dígitos OU 12 dígitos + 1 letra (total 15)
    const sh = raw.match(/(?:^|[^A-Z0-9])(BR(?:\d{13}|\d{12}[A-Z]))(?=$|[^A-Z0-9])/i);
    if (sh) return { ok:true, servico:"Shopee", codigo: sh[1].toUpperCase() };

    // Mercado Livre: primeiro bloco começando por 45, retorna 11 dígitos
    const mlRun = allDigits.match(/45\d{9,}/);
    if (mlRun) return { ok:true, servico:"Mercado Livre", codigo: mlRun[0].slice(0, 11) };

    // Avulso (CEP): primeira ocorrência de 8 dígitos
    const cep = (allDigits.match(/\d{8}/) || [null])[0];
    if (cep)   return { ok:true, servico:"Avulso", codigo: cep };

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
  function clearUltimos(){ if (tbLast) tbLast.innerHTML = ""; rowsByKey.clear(); }

  function createRow(row){
    const tr = document.createElement("tr");
    tr.dataset.key = keyFor(row.entregador, row.codigo);
    tr.innerHTML = `
      <td class="ts">${row.tsFmt || new Date().toLocaleString("pt-BR")}</td>
      <td class="ent">${row.entregador || ""}</td>
      <td class="cod">${row.codigo || ""}</td>
      <td class="srv">${row.servico || ""}</td>
      <td class="st">${row.status || "Enviando…"}</td>
      <td class="dup text-center">
        <input type="checkbox" class="form-check-input dup-mark" ${row.duplicado ? "checked" : ""} disabled>
      </td>`;
    tbLast.prepend(tr);
    rowsByKey.set(tr.dataset.key, tr);
    return tr;
  }

  function appendOrUpdateRow(row){
    const k = keyFor(row.entregador, row.codigo);
    const ex = rowsByKey.get(k);
    if (ex) {
      ex.querySelector(".srv").textContent = row.servico || ex.querySelector(".srv").textContent;
      ex.querySelector(".st").textContent  = row.status  || ex.querySelector(".st").textContent;
      if (row.duplicado) { const chk = ex.querySelector(".dup-mark"); if (chk) chk.checked = true; }
      return ex;
    }
    return createRow(row);
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
    if (tr) tr.querySelector(".st").textContent = "Enviando…";

    try {
      const res = await apiRegistrarSaida({ entregador: p.entregador, codigo: p.codigo, servico: p.servico });

      // sucesso
      removePending(p.id);

      const apiRow = (res && typeof res === "object" && typeof res.data === "object") ? res.data : {};
      const novoServico = apiRow.servico ?? p.servico ?? "";
      const duplicado   = !!apiRow.duplicado;
      const novoStatus  = duplicado ? "Duplicado" : (apiRow.status ?? "Saiu");

      if (tr) {
        tr.querySelector(".srv").textContent = novoServico;
        tr.querySelector(".st").textContent  = novoStatus;
        if (duplicado) {
          const chk = tr.querySelector(".dup-mark"); if (chk) chk.checked = true;
        }
      }

      if (duplicado) { showMsgIcon("alerta", `DUPLICADO • ${p.codigo}`); Sound.play("warn"); }
      else           { showMsgIcon("info",    `Registrado: ${p.codigo}${novoServico ? " • " + novoServico : ""}`); Sound.play("ok"); }

    } catch (e) {
      // 409 DUPLICADO do back: manter linha e marcar como "Duplicado"
      if (isDupConflict(e)) {
        removePending(p.id);
        if (tr) {
          tr.querySelector(".st").textContent = "Duplicado";
          const chk = tr.querySelector(".dup-mark"); if (chk) chk.checked = true;
        }
        showMsgIcon("alerta", `DUPLICADO • ${p.codigo}`);
        Sound.play("warn");
        return;
      }

      // demais erros (422 validação, 409 créditos etc.) → mantém a linha e mostra erro
      removePending(p.id);
      if (tr) tr.querySelector(".st").textContent = `Erro${e?.status ? " " + e.status : ""}`;
      showMsgIcon("erro", e?.error || "Erro ao registrar");
      Sound.play("err");
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
  async function registrar(){
    const entregador = selEnt?.value?.trim() || "";
    if (!entregador) { showMsgIcon("erro","Selecione o entregador."); Sound.play("err"); return; }

    const rawInput = inpCod?.value || "";
    if (!rawInput.trim()) { showMsgIcon("erro","Informe o código."); Sound.play("err"); return; }

    // Classificação (bloqueia NF-e e padrões inválidos)
    const cls = classifyCodigo(rawInput);
    if (!cls.ok) {
      showMsgIcon("erro", `Código inválido: ${cls.motivo}.`);
      Sound.play("err");
      inpCod && inpCod.select();
      return;
    }

    const codigoFinal = cls.codigo;
    const servico     = cls.servico;
    const k = keyFor(entregador, codigoFinal);

    // Já existe NA SESSÃO → não cria linha, não envia; só mensagem
    if (rowsByKey.has(k)) {
      showMsgIcon("alerta", `DUPLICADO • ${codigoFinal}`);
      Sound.play("warn");
      if (inpCod) { inpCod.value = ""; inpCod.focus(); }
      return;
    }

    // cria linha "Enviando…" e adiciona à fila local
    const pending = { id: genId(), ts: Date.now(), entregador, codigo: codigoFinal, servico };
    addPending(pending);

    const tr = appendOrUpdateRow({
      tsFmt: new Date().toLocaleString("pt-BR"),
      entregador, codigo: codigoFinal, servico, status:"Enviando…", duplicado:false
    });
    rowsById.set(pending.id, tr);

    // envia (assíncrono); se 409 duplicado no back, marcará a linha como Duplicado
    attemptSend(pending);

    if (inpCod) { inpCod.value = ""; inpCod.focus(); }
  }

// ===== Leitor por Câmera (ZXing) =====
(function CameraScanner(){
  if (!window.ZXingBrowser) return; // se a lib não carregou, ignora

  const btnScan = document.getElementById("btnScan");
  const video   = document.getElementById("scanVideo");
  const selCam  = document.getElementById("scanCamera");
  const btnTorch= document.getElementById("scanToggleTorch");
  const modalEl = document.getElementById("scanModal");

  if (!btnScan || !video || !selCam || !modalEl) return;

  const codeReader = new ZXingBrowser.BrowserMultiFormatReader();
  let currentDeviceId = null;
  let currentStream   = null;
  let trackWithTorch  = null;
  let bsModal         = null;
  let decoding        = false;
  let lastText        = "";
  let sameCount       = 0;

  async function listCameras(){
    const devices = await ZXingBrowser.BrowserMultiFormatReader.listVideoInputDevices();
    selCam.innerHTML = devices.map(d => `<option value="${d.deviceId}">${d.label || d.deviceId}</option>`).join("");
    // prioriza câmera traseira quando disponível
    const back = devices.find(d => /back|traseira|environment|trás/i.test(d.label));
    currentDeviceId = (back || devices[devices.length-1] || {}).deviceId || null;
    if (currentDeviceId) selCam.value = currentDeviceId;
  }

  function stop(){
    decoding = false;
    try { codeReader.reset(); } catch(_){}
    if (currentStream){
      currentStream.getTracks().forEach(t=>t.stop());
      currentStream = null;
    }
    trackWithTorch = null;
  }

  async function start(deviceId){
    stop();
    currentDeviceId = deviceId || currentDeviceId;
    decoding = true;

    await codeReader.decodeFromVideoDevice(currentDeviceId, video, (result, err) => {
      // guarda stream/track p/ controlar flash
      if (!currentStream && video.srcObject) {
        currentStream = video.srcObject;
        trackWithTorch = currentStream.getVideoTracks()?.[0] || null;
      }
      if (result) {
        const text = String(result.getText() || "");
        // confirma duas leituras iguais pra evitar falsos positivos
        sameCount = (text === lastText) ? (sameCount+1) : 0;
        lastText = text;
        if (sameCount < 1) return;

        // usa sua classificação já existente
        const cls = (typeof classifyCodigo === "function") ? classifyCodigo(text) : { ok:true, servico:null, codigo:text };
        if (!cls.ok) {
          showMsgIcon("erro", `Código inválido: ${cls.motivo}.`);
          Sound.play("err");
          return;
        }

        const inp = document.getElementById("codigo");
        if (inp) inp.value = cls.codigo;

        stop();
        if (bsModal) bsModal.hide();

        const ent = document.getElementById("entregador")?.value;
        if (!ent) {
          showMsgIcon("erro", "Selecione o entregador antes de escanear.");
          Sound.play("err");
          return;
        }
        // dispara o mesmo fluxo do teclado
        if (typeof registrar === "function") registrar();
      }
    });
  }

  // Flash (quando suportado pelo device)
  async function toggleTorch(){
    if (!trackWithTorch) return;
    const caps = trackWithTorch.getCapabilities?.();
    if (!caps || !caps.torch) return;
    const st = trackWithTorch.getSettings?.();
    const newTorch = !st.torch;
    await trackWithTorch.applyConstraints({ advanced: [{ torch: newTorch }] });
  }

  // Eventos UI
  btnScan.addEventListener("click", async () => {
    lastText = ""; sameCount = 0;
    try {
      bsModal = bsModal || new bootstrap.Modal(modalEl, { backdrop: 'static' });
      await listCameras();
      bsModal.show();
      start(selCam.value);
      showMsgIcon("info", "Aponte a câmera para o código.");
    } catch (e) {
      showMsgIcon("erro", "Não foi possível acessar a câmera. Verifique permissões e HTTPS.");
      Sound.play("err");
    }
  });

  selCam.addEventListener("change", e => start(e.target.value));
  btnTorch?.addEventListener("click", toggleTorch);

  modalEl.addEventListener("hidden.bs.modal", () => stop());
})();


  // ---------- eventos ----------
  selEnt?.addEventListener("change", onEntregadorChange);
  btnReg?.addEventListener("click", registrar);
  inpCod?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); registrar(); } });

  // ---------- init ----------
  loadEntregadores().then(() => { inpCod?.focus(); });
  // tenta reenviar pendentes (inclusive de sessões anteriores)
  for (const p of loadPending()) attemptSend(p);
})();
