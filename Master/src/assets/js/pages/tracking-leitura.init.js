// assets/js/pages/tracking-leitura.init.js
// Leitura: classificação, fila local, sons, "Dup?" como checkbox
// Regras:
//  - Não lembrar último entregador (select inicia vazio)
//  - Se já existir NA SESSÃO: não cria linha e não envia; só avisa
//  - Se for DUPLICADO no BACK (409): mantém a linha e marca Status="Duplicado" (checkbox checado)
  (async function () {
  "use strict";

  // Certifica que a sessão está válida antes de iniciar a leitura. Aguarda a
  // resolução de ensureAuth() para evitar que a lógica da página rode
  // enquanto a autenticação ainda não foi checada.
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

  /**
   * Atualiza o resumo visível dos últimos registros. Percorre todas as linhas
   * atualmente exibidas no card "Últimos registros" (mantidas em rowsByKey)
   * e contabiliza quantos códigos pertencem a cada serviço. O resultado
   * alimenta os elementos definidos no HTML. Chamado sempre que uma linha
   * é criada ou atualizada e quando o quadro é limpo.
   */
  function updateSummary() {
    // Se os elementos do resumo não existirem, não faz nada. Permite manter
    // compatibilidade caso o HTML não tenha os IDs esperados.
    if (!sumShopeeEl || !sumMercadoEl || !sumAvulsoEl || !sumTotalEl) return;
    let shopee = 0, mercado = 0, avulso = 0, total = 0;
    for (const tr of rowsByKey.values()) {
      const srvCell = tr.querySelector('.srv');
      const servico = (srvCell?.textContent || '').trim().toLowerCase();
      if (!servico) continue;
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
    function beep({ freq=880, dur=120, type="sine", vol=1.5, when=0 }){
      const c=ensure(), t0=c.currentTime+when/1000, o=c.createOscillator(), g=c.createGain();
      o.type=type; o.frequency.value=freq; g.gain.setValueAtTime(vol,t0); g.gain.linearRampToValueAtTime(0.0001,t0+dur/1000);
      o.connect(g).connect(c.destination); o.start(t0); o.stop(t0+dur/1000+0.02); return dur;
    }
    function play(kind){
      if (kind==="ok"){ let d=0; d+=beep({freq:1046,dur:90, type:"sine",vol:1.5,when:d}); beep({freq:1318,dur:140,type:"sine",vol:1.5,when:d+60}); }
      else if (kind==="warn"){ let d=0; d+=beep({freq:660,dur:120,type:"triangle",vol:1.5,when:d}); beep({freq:660,dur:120,type:"triangle",vol:1.5,when:d+160}); }
      else { beep({freq:220,dur:240,type:"square",vol:1.5,when:0}); beep({freq:180,dur:220,type:"square",vol:1.5,when:260}); }
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


    // TIME + 6 dígitos → Avulso (Time)
if (/^TIME\d{6}$/i.test(raw)) {
  return { ok:true, servico:"Avulso", codigo:raw };
}


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
      // Atualiza o resumo após editar a linha existente
      updateSummary();
      return ex;
    }
    const newRow = createRow(row);
    // Atualiza o resumo após criar nova linha
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

// ===== Leitor por Câmera — Unificado (ScannerService + contador UX) =====
(function LeituraCameraUnificada() {
  const btnScan = document.getElementById("btnScan");
  const inputCodigo = document.getElementById("codigo");
  const btnRegistrar = document.getElementById("btnRegistrar");

  // --- Validação de status opcional (mantida do código anterior) ---
  async function checkCollected(code) {
    if (!code) return false;
    if (window.ENABLE_STATUS_CHECK === false) return true;

    if (typeof window.checkCodigoStatus === "function") {
      try {
        const r = await window.checkCodigoStatus(code);
        const st = (r && (r.status || r.data?.status || r.state)) || r;
        return String(st || "").toLowerCase() === "coletado";
      } catch (e) {
        console.warn("checkCodigoStatus failed, permitindo registro por fallback", e);
        return true;
      }
    }

    if (!window.TRACK_API_URL) return true;

    const urls = [
      `${window.TRACK_API_URL}/coletas/status?codigo=${encodeURIComponent(code)}`,
      `${window.TRACK_API_URL}/packages/status?codigo=${encodeURIComponent(code)}`
    ];

    for (const u of urls) {
      try {
        const res = await fetch(u, { credentials: "include" });
        if (!res.ok) continue;
        const j = await res.json().catch(() => null);
        const status = (j.status || j.data?.status || j.state || j.result || "").toString();
        if (status.toLowerCase() === "coletado") return true;
        return false;
      } catch (err) {
        console.warn("status-check failed (network), permitindo registro por fallback", err);
        return true;
      }
    }

    return true;
  }

  function showNotCollectedAlert(code) {
    const title = "Coleta não realizada";
    const text = `O código "${String(code || "")}" não foi coletado.`;
    if (window.Swal && typeof Swal.fire === "function") {
      Swal.fire({ icon: "warning", title, text, confirmButtonText: "Ok" });
    } else {
      alert(`${title}\n\n${text}`);
    }
  }

  // --- Quando um código é lido com sucesso ---
async function handleScanResult(text) {
  // 🔹 Garante que o contador sempre aparece ao abrir o scanner
  if (Scanner.getCount() === 0) Scanner.updateCountUI();

  const code = String(text || "").trim();
  if (!code) return;
  if (inputCodigo) inputCodigo.value = code;

    try {
      const ok = await checkCollected(code);
      if (ok) {
        // Chama o mesmo fluxo já usado pelo botão "Registrar"
        if (typeof registrarCodigo === "function") {
          registrarCodigo(true);
        } else if (typeof registrar === "function") {
          registrar();
        } else if (btnRegistrar) {
          btnRegistrar.click();
        }

        // Incrementa contador e atualiza UI
        Scanner.incCount(1);
        const el = document.getElementById("scanFSCount");
        if (el) {
          const total = Scanner.getCount();
          el.textContent = `${total} ${total === 1 ? "Pacote Lido" : "Pacotes Lidos"}`;
        }

      } else {
        showNotCollectedAlert(code);
      }
    } catch (e) {
      console.error("Erro ao validar status:", e);
      showNotCollectedAlert(code);
    }
  }

  // --- Inicializa o botão da câmera ---
  if (btnScan) {
    // Remove binds antigos (caso existam)
    const newBtn = btnScan.cloneNode(true);
    btnScan.parentNode.replaceChild(newBtn, btnScan);

    newBtn.addEventListener("click", (ev) => {
      ev.preventDefault();
      if (!window.Scanner || typeof window.Scanner.open !== "function") {
        (window.toast && window.toast("Scanner indisponível.", false)) || console.warn("Scanner não encontrado");
        return;
      }

      // Zera contador local
      Scanner.setCount(0);

      // Abre scanner overlay
      Scanner.open({
        autoClose: false, // mantém câmera aberta entre leituras
        onScan: (txt) => handleScanResult(txt),
      }).catch((err) => {
        console.error("Scanner.open erro:", err);
        (window.toast && window.toast("Não foi possível abrir o scanner.", false)) || null;
      });
    });
  }

  // --- Limpa contador ao sair da página ---
  window.addEventListener("beforeunload", () => {
    Scanner.setCount(0);
    Scanner.close();
  });
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