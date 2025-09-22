// ============== TrackingSaidas • Página: Leituras ==============
(function () {
  "use strict";

  // ---------- elementos principais ----------
  const selEnt   = document.getElementById("entregador");
  const inpCod   = document.getElementById("codigo");
  const btnReg   = document.getElementById("btnRegistrar");
  const tbodyUlt = document.getElementById("ultimos-rows");
 const msg = document.getElementById('msgArea') || document.getElementById('msgBox');


  // ---------- sons ----------
  const Sound = {
    ok(){ try{ document.getElementById("snd-ok")?.play(); }catch(_){} },
    err(){ try{ document.getElementById("snd-err")?.play(); }catch(_){} }
  };

  // ---------- normalização & classificação ----------
  function toAsciiDigits(s){
    if (!s) return "";
    const sup = { "⁰":"0","¹":"1","²":"2","³":"3","⁴":"4","⁵":"5","⁶":"6","⁷":"7","⁸":"8","⁹":"9" };
    s = String(s).replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, d => sup[d]);
    s = s.replace(/[０-９]/g, d => String.fromCharCode(d.charCodeAt(0) - 0xFF10 + 0x30));
    return s;
  }
  function normUpper(raw){ return toAsciiDigits(String(raw||"").toUpperCase().trim()); }
  function onlyDigits(t){ return String(t||"").replace(/\D+/g, ""); }

  // classificar para montar o campo 'servico' que vai no POST
  function classifyCodigo(rawInput){
    const raw = normUpper(rawInput);
    const digits = onlyDigits(raw);

    // Bloqueio: NF-e 44 dígitos (toda numérica)
    if (/^\d{44}$/.test(digits)) {
      return { ok:false, motivo:"NF-e (44 dígitos)", servico:null, codigo:null };
    }

    // Shopee: 15 no total, começa com BR – último pode ser dígito ou letra
    if (/^BR(?:\d{13}|\d{12}[A-Z])$/i.test(raw)) {
      return { ok:true, servico:"shopee", codigo:raw };
    }

    // Mercado Livre: maior sequência de 10–11 dígitos
    const runs = raw.match(/\d+/g);
    if (runs && runs.length){
      const longest = runs.reduce((a,b)=> b.length>a.length? b:a, "");
      if (/^\d{10,11}$/.test(longest)) {
        return { ok:true, servico:"mercado_livre", codigo:longest };
      }
    }
    if (/^\d{10,11}$/.test(raw)) {
      return { ok:true, servico:"mercado_livre", codigo:raw };
    }

    // Avulso: tudo o que não se enquadra acima vai como 'avulso'
    return { ok:true, servico:"avulso", codigo:raw };
  }

  // ---------- mensagens (mostra na página + HUD do scanner se aberto) ----------
  function showMsgIcon(tipo, texto) {
    const map = {
      erro:   { ico: "alert-octagon",  klass: "danger"  },
      alerta: { ico: "alert-triangle", klass: "warning" },
      info:   { ico: "alert-circle",   klass: "info"    }
    };
    const m = map[tipo] || map.info;

    // Área padrão da página
    if (msg) {
      msg.innerHTML = `
        <div class="d-flex align-items-center gap-2">
          <i data-feather="${m.ico}" class="icon-dual icon-dual-${m.klass}"></i>
          <span>${texto}</span>
        </div>`;
      window.feather && feather.replace();
    }

    // HUD do overlay
    const overlay = document.getElementById("scanFS");
    const hud = document.getElementById("scanFSMsg");
    if (overlay && hud && overlay.classList.contains("show")) {
      hud.textContent = String(texto || "");
      hud.classList.remove("info", "warning", "danger", "show");
      hud.classList.add(m.klass || "info", "show");
      clearTimeout(hud._t);
      hud._t = setTimeout(() => hud.classList.remove("show"), tipo === "erro" ? 3000 : 1800);
    }
  }

  // ---------- Tabela 'Últimos registros' ----------
  function appendUltimoRegistro({ ts = new Date(), entregador, codigo, servico, status, dup=false }) {
    if (!tbodyUlt) return null;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td data-col="ts">${ts.toLocaleString()}</td>
      <td data-col="ent">${entregador || ""}</td>
      <td data-col="cod">${codigo || ""}</td>
      <td data-col="srv">${servico || ""}</td>
      <td data-col="st">${status || ""}</td>
      <td class="text-center"><input type="checkbox" ${dup ? "checked": ""} disabled></td>
    `;
    tbodyUlt.prepend(tr);
    return tr;
  }
  function setRowStatus(tr, text){ tr?.querySelector('[data-col="st"]')?.replaceChildren(document.createTextNode(text)); }

  // ---------- Registrar (botão e scanner chamam isso) ----------
  async function registrar() {
    const entregador = selEnt?.value || "";
    const input = String(inpCod?.value || "").trim();

    if (!entregador) {
      showMsgIcon("erro", "Selecione o entregador.");
      Sound.err(); return;
    }
    if (!input) return;

    const cls = classifyCodigo(input);
    if (!cls.ok) {
      showMsgIcon("erro", `Código inválido: ${cls.motivo}.`);
      Sound.err(); return;
    }

    const row = appendUltimoRegistro({
      entregador,
      codigo: cls.codigo,
      servico: cls.servico === "mercado_livre" ? "Mercado Livre" :
               cls.servico === "shopee"        ? "Shopee"        : "avulso",
      status: "Enviando…"
    });

    // POST com 'servico' incluído (AJUSTE SOLICITADO)
    const r = await TrackAPI.registerSaida({
      entregador,
      codigo: cls.codigo,
      servico: cls.servico
    });

    // Atualiza status conforme retorno
    if (r.status === 201) {
      setRowStatus(row, "Saiu");
      showMsgIcon("info", `Registrado: ${cls.codigo}`);
      Sound.ok();
      inpCod.value = "";  // limpa campo
      return;
    }
    if (r.status === 409) {
      setRowStatus(row, "Duplicado");
      showMsgIcon("alerta", `DUPLICADO • ${cls.codigo}`);
      Sound.err();
      return;
    }
    if (r.status === 422) {
      setRowStatus(row, "Erro 422");
      showMsgIcon("erro", `Erro de validação para ${cls.codigo}.`);
      Sound.err();
      return;
    }
    if (r.status === 0) {
      // erro de rede → mantém "Enviando…" (fila local se você tiver)
      showMsgIcon("alerta", "Sem conexão. Tentaremos de novo.");
      return;
    }
    // outros
    setRowStatus(row, `Erro ${r.status || ""}`.trim());
    showMsgIcon("erro", `Falha (${r.status || "?"}) ao registrar ${cls.codigo}.`);
    Sound.err();
  }

  // ---------- eventos ----------
  btnReg?.addEventListener("click", (e) => { e.preventDefault(); registrar(); });
  inpCod?.addEventListener("keydown", (e) => { if (e.key === "Enter") registrar(); });

  // ===== Leitor por Câmera – Full-screen (ZXing) | Modo contínuo =====
  (function CameraScannerFS(){
    if (!window.ZXingBrowser) return;

    const btnScan   = document.getElementById("btnScan");
    const overlay   = document.getElementById("scanFS");
    const video     = document.getElementById("scanFSVideo");
    const btnBack   = document.getElementById("scanFSBack");
    const btnTorch  = document.getElementById("scanFSTorch");
    const stackBox  = document.getElementById("scanFSStack");

    if (!btnScan || !overlay || !video) return;

    const codeReader = new ZXingBrowser.BrowserMultiFormatReader();
    let currentStream = null;
    let trackWithTorch = null;

    // anti-bounce/cooldown
    let lastText = "", sameCount = 0;
    let cooldownUntil = 0;
    const HIT_COOLDOWN_MS = 1200;

    // evita reprocessar o mesmo código repetidamente enquanto a câmera está ligada
    const RECENT_TTL = 2500;
    const recentHits = new Map();
    function seenRecently(cod){
      const now = Date.now();
      for (const [k,ts] of [...recentHits]) if (now-ts > RECENT_TTL) recentHits.delete(k);
      const ts = recentHits.get(cod);
      recentHits.set(cod, now);
      return ts && (now - ts < RECENT_TTL);
    }

    // Painel inferior: empilha SOMENTE quando o backend confirma 201
    function pushScanCard({ codigo, servico }){
      if (!stackBox) return;
      const div = document.createElement("div");
      div.className = "scanfs-card";
      div.innerHTML = `<div class="c">${codigo}</div><div class="s">${servico ? (servico === "mercado_livre" ? "Mercado Livre" : servico === "shopee" ? "Shopee" : servico) : ""}</div>`;
      stackBox.appendChild(div);
      // mantém no máximo 50 no DOM
      while (stackBox.children.length > 50) {
        stackBox.removeChild(stackBox.firstElementChild);
      }
      stackBox.scrollTop = stackBox.scrollHeight;
    }
    function clearScanStack(){ if (stackBox) stackBox.innerHTML = ""; }

    // conjuntos para controle: confirmados/duplicados/pendentes
    const okKnown  = new Set();
    const dupKnown = new Set();
    const pending  = new Set();

    // back respondeu → decide se empilha (201) ou só avisa (409/422)
    window.addEventListener("saida-resultado", (ev) => {
      const { status, codigo, servico } = ev.detail || {};
      if (!codigo) return;
      pending.delete(codigo);

      if (status === "ok") {
        okKnown.add(codigo);
        pushScanCard({ codigo, servico }); // empilha somente 201
      } else if (status === "dup") {
        dupKnown.add(codigo);
        showMsgIcon("alerta", `DUPLICADO • ${codigo}`); // não empilha
      } else {
        showMsgIcon("erro", `Falha ao registrar ${codigo}.`); // não empilha
      }
    });

    function showOverlay(){ overlay.classList.add("show"); pushHistoryGuard(); }
    function hideOverlay(){ overlay.classList.remove("show"); }
    function stop(){
      try { codeReader.reset(); } catch(_){}
      if (currentStream){ currentStream.getTracks().forEach(t=>t.stop()); currentStream = null; }
      trackWithTorch = null;
    }
    function closeScanner(){ stop(); hideOverlay(); clearScanStack(); }

    async function startWithConstraints(constraints){
      await codeReader.decodeFromConstraints(constraints, video, (result, err) => {
        const now = Date.now();
        if (now < cooldownUntil) return;

        if (!currentStream && video.srcObject){
          currentStream = video.srcObject;
          trackWithTorch = currentStream.getVideoTracks()?.[0] || null;
        }
        if (!result) return;

        const text = String(result.getText() || "");
        if (text === lastText) sameCount++; else { lastText = text; sameCount = 0; }
        if (sameCount < 1) return;

        const ent = selEnt?.value || "";
        if (!ent) { showMsgIcon("erro", "Selecione o entregador antes de escanear."); Sound.err(); cooldownUntil = now + 600; return; }

        const cls = classifyCodigo(text);
        if (!cls.ok){ showMsgIcon("erro", `Código inválido: ${cls.motivo}.`); Sound.err(); cooldownUntil = now + 600; return; }

        if (seenRecently(cls.codigo)) { cooldownUntil = now + 400; return; }
        if (dupKnown.has(cls.codigo) || okKnown.has(cls.codigo) || pending.has(cls.codigo)) { cooldownUntil = now + 400; return; }

        // dispara o mesmo fluxo do botão "Registrar"
        pending.add(cls.codigo);
        if (inpCod) inpCod.value = cls.codigo;
        registrar();                 // NÃO empilha aqui; aguardamos o evento 201
        Sound.ok();

        cooldownUntil = now + HIT_COOLDOWN_MS;
        sameCount = 0;
      });
    }

    async function openScanner(){
      lastText=""; sameCount=0; cooldownUntil=0;
      showOverlay();
      showMsgIcon("info", "Aponte a câmera para o código.");

      try {
        await startWithConstraints({ video: { facingMode: { exact: "environment" } } });
      } catch {
        try { await startWithConstraints({ video: { facingMode: { ideal: "environment" } } }); }
        catch {
          try { await startWithConstraints({ video: true }); }
          catch { await codeReader.decodeFromVideoDevice(null, video, ()=>{}); }
        }
      }
    }

    async function toggleTorch(){
      if (!trackWithTorch) return;
      const caps = trackWithTorch.getCapabilities?.();
      if (!caps || !caps.torch) return;
      const st = trackWithTorch.getSettings?.();
      await trackWithTorch.applyConstraints({ advanced: [{ torch: !st.torch }] });
    }

    // sair sem ler
    btnScan.addEventListener("click", async () => {
      try { await openScanner(); }
      catch { closeScanner(); showMsgIcon("erro","Não foi possível acessar a câmera. Verifique permissões/HTTPS."); Sound.err(); }
    });
    btnBack?.addEventListener("click", closeScanner);
    overlay?.addEventListener("click", (e) => { if (e.target === overlay) closeScanner(); });
    document.addEventListener("keydown", (e) => {
      if (overlay?.classList.contains("show") && e.key === "Escape") closeScanner();
    });
    function pushHistoryGuard(){ try { history.pushState({ scanOpen: true }, ""); } catch(_) {} }
    window.addEventListener("popstate", () => { if (overlay?.classList.contains("show")) closeScanner(); });

    btnTorch?.addEventListener("click", toggleTorch);
    window.addEventListener("pagehide", stop);
  })();

})();