// assets/js/pages/tracking-leitura.init.js
(function () {
  "use strict";

  // ---------- elementos ----------
  const $ = (id) => document.getElementById(id);
  const selEnt = $("entregador");
  const inpCod = $("codigo");
  const btnReg = $("btnRegistrar");
  const msg    = $("msgArea");
  const tbLast = $("ultimos-rows");
  const LAST_ENT_KEY = "track:lastEntregador";

  // chaves de linha por (entregador||codigo)
  const rowsByKey = new Map();
  const keyFor = (entregador, codigo) =>
    `${String(entregador || "").toUpperCase()}||${String(codigo || "").toUpperCase()}`;

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

  // ---------- normalização ----------
  function toAsciiDigits(s){
    if (!s) return "";
    const sup = {"⁰":"0","¹":"1","²":"2","³":"3","⁴":"4","⁵":"5","⁶":"6","⁷":"7","⁸":"8","⁹":"9"};
    s = String(s).replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, d => sup[d]);
    s = s.replace(/[０-９]/g, d => String.fromCharCode(d.charCodeAt(0) - 0xFF10 + 0x30));
    return s;
  }
  function normalizeCode(s){
    if (!s) return "";
    return toAsciiDigits(String(s))
      .toUpperCase()
      .replace(/\b(HI[ÍI]FEN|HÍFEN|MENOS|TRACO|TRA[ÇC]O)\b/gi, "")
      .replace(/[–—−-]/g, "")
      .replace(/[^A-Z0-9]/g, "")
      .trim();
  }
  function onlyDigits(s){ return String(s||"").replace(/\D+/g, ""); }

  // -------- CLASSIFICAÇÃO (atualizada com suas regras) --------
function classifyCodigo(rawInput){
  // normaliza SOMENTE os dígitos para ASCII e faz UPPER, mas sem “colar” blocos
  const raw = toAsciiDigits(String(rawInput || "")).toUpperCase().trim();

  // 1) bloqueio NF-e: exatamente 44 dígitos no total
  const allDigits = raw.replace(/\D+/g, "");
  if (/^\d{44}$/.test(allDigits)) {
    return { ok:false, motivo:"NF-e (44 dígitos)" };
  }

  // 2) Shopee: exatamente 15 chars, começa com BR; aceita:
  //    - BR + 13 dígitos
  //    - BR + 12 dígitos + 1 letra (no fim)
  //    Usa “guardas” para não capturar pedaços de palavras/underscores.
  const sh = raw.match(/(?:^|[^A-Z0-9])(BR(?:\d{13}|\d{12}[A-Z]))(?=$|[^A-Z0-9])/);
  if (sh) {
    return { ok:true, servico:"Shopee", codigo: sh[1] };
  }

  // 3) Mercado Livre: primeiro trecho que COMEÇA com 45 e tenha >= 11 dígitos;
  //    devolve EXATAMENTE 11 dígitos (ex.: 45431873831)
  const mlRun = allDigits.match(/45\d{9,}/);
  if (mlRun) {
    return { ok:true, servico:"Mercado Livre", codigo: mlRun[0].slice(0, 11) };
  }

  // 4) Avulso (CEP): primeira sequência de 8 dígitos
  const cep = (allDigits.match(/\d{8}/) || [null])[0];
  if (cep) {
    return { ok:true, servico:"Avulso", codigo: cep };
  }

  // 5) nada bateu
  return { ok:false, motivo:"Padrão não configurado" };
}


  // ---------- últimos registros ----------
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

  function markDuplicate(entregador, codigo){
    const k = keyFor(entregador, codigo);
    let tr = rowsByKey.get(k);
    if (!tr) {
      tr = createRow({ tsFmt:new Date().toLocaleString("pt-BR"), entregador, codigo, servico:"", status:"Duplicado", duplicado:true });
    } else {
      tr.querySelector(".st").textContent = "Duplicado";
      const chk = tr.querySelector(".dup-mark"); if (chk) chk.checked = true;
    }
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

  // ---------- carregar entregadores ----------
  function loadEntregadores(){
    return apiGetEntregadores().then(res => {
      const raw = Array.isArray(res) ? res : (res?.data ?? []);
      const lista = raw.map(e => typeof e === "string" ? e : (e?.nome || e?.name)).filter(Boolean);
      if (!selEnt) return;
      selEnt.innerHTML =
        '<option value="" selected disabled>Selecione entregador</option>' +
        lista.map(n => `<option value="${n}">${n}</option>`).join("");
      const last = localStorage.getItem(LAST_ENT_KEY);
      if (last && lista.includes(last)) selEnt.value = last;
      onEntregadorChange();
    }).catch(() => { showMsgIcon("erro","Falha ao carregar entregadores."); Sound.play("err"); });
  }
  function onEntregadorChange(){ const v = selEnt?.value || ""; if (v) localStorage.setItem(LAST_ENT_KEY, v); clearUltimos(); }

  // ---------- registrar ----------
  async function registrar(){
    const entregador = selEnt?.value?.trim() || "";
    if (!entregador) { showMsgIcon("erro","Selecione o entregador."); Sound.play("err"); return; }

    const rawInput = inpCod?.value || "";
    if (!rawInput.trim()) { showMsgIcon("erro","Informe o código."); Sound.play("err"); return; }

    // Classificação usando o texto cru (apenas dígitos ASCII + upper)
    const cls = classifyCodigo(rawInput);
    if (!cls.ok) {
      showMsgIcon("erro", `Código inválido: ${cls.motivo}.`);
      Sound.play("err");
      inpCod && inpCod.select();
      return;
    }
    const codigoFinal = cls.codigo;
    const servico = cls.servico;
    const k = keyFor(entregador, codigoFinal);

    // já lido nesta sessão → marcar duplicado e enviar apenas update (se existir)
    if (rowsByKey.has(k)) {
      markDuplicate(entregador, codigoFinal);
      window.TrackAPI?.setDuplicado?.({ entregador, codigo: codigoFinal, duplicado:true }).catch(()=>{});
      showMsgIcon("alerta", `DUPLICADO • ${codigoFinal}`);
      Sound.play("warn");
      if (inpCod) { inpCod.value = ""; inpCod.focus(); }
      return;
    }

    // UI otimista
    const optimisticRow = {
      tsFmt: new Date().toLocaleString("pt-BR"),
      entregador, codigo: codigoFinal, servico, status: "Enviando…", duplicado: false
    };
    const tr = appendOrUpdateRow(optimisticRow);

    // POST assíncrono
    btnReg && (btnReg.disabled = true);
    showMsgIcon("info","Registrando…");
    try {
      const res = await apiRegistrarSaida({ entregador, codigo: codigoFinal, servico });
      btnReg && (btnReg.disabled = false);

      const apiRow = (res && res.data && typeof res.data === "object") ? res.data : {};
      const finalRow = { ...optimisticRow, ...apiRow };

      tr.querySelector(".srv").textContent = finalRow.servico || servico || "";
      tr.querySelector(".st").textContent  = finalRow.status  || "Saiu";

      if (finalRow.duplicado) {
        const chk = tr.querySelector(".dup-mark"); if (chk) chk.checked = true;
        showMsgIcon("alerta", `DUPLICADO • ${finalRow.codigo || codigoFinal}`);
        Sound.play("warn");
      } else {
        showMsgIcon("info", `Registrado: ${(finalRow.codigo || codigoFinal)} • ${(finalRow.servico || servico)}`);
        Sound.play("ok");
      }
    } catch (e) {
      btnReg && (btnReg.disabled = false);
      tr.querySelector(".st").textContent = `Erro${e?.status ? " " + e.status : ""}`;
      showMsgIcon("erro", e?.error || "Erro ao registrar");
      Sound.play("err");
    } finally {
      if (inpCod) { inpCod.value = ""; inpCod.focus(); }
    }
  }

  // ---------- eventos ----------
  selEnt?.addEventListener("change", onEntregadorChange);
  btnReg?.addEventListener("click", registrar);
  inpCod?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); registrar(); } });

  // ---------- init ----------
  loadEntregadores().then(() => { inpCod?.focus(); });
})();
