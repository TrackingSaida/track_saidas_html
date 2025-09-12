// Tela de Leitura — normaliza código, envia para a API e mostra "Últimos" do entregador atual
(function () {
  "use strict";

  // ---------- elementos ----------
  const $ = (id) => document.getElementById(id);

  const selEnt = $("entregador");     // <select id="entregador">
  const inpCod = $("codigo");         // <input  id="codigo">
  const btnReg = $("btnRegistrar");   // <button id="btnRegistrar">
  const msg    = $("msgArea");        // <div    id="msgArea">
  const tbLast = $("ultimos-rows");   // <tbody  id="ultimos-rows">

  const LAST_ENT_KEY = "track:lastEntregador";

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

  // ---------- normalização (igual ao MVP) ----------
  // converte dígitos unicode -> ASCII (ex.: ⁴ → 4, ４ → 4)
  function toAsciiDigits(s) {
    if (!s) return "";
    const sup = { "⁰":"0","¹":"1","²":"2","³":"3","⁴":"4","⁵":"5","⁶":"6","⁷":"7","⁸":"8","⁹":"9" };
    s = String(s).replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, d => sup[d]);
    // ０–９ (fullwidth) -> 0–9
    s = s.replace(/[０-９]/g, d => String.fromCharCode(d.charCodeAt(0) - 0xFF10 + 0x30));
    return s;
  }
  // upper + remove palavras "hífen/traço/menos" + remove traços e tudo que não for A–Z/0–9
  function normalizeCode(s) {
    if (!s) return "";
    return toAsciiDigits(String(s))
      .toUpperCase()
      .replace(/\b(HI[ÍI]FEN|HÍFEN|MENOS|TRACO|TRA[ÇC]O)\b/gi, "")
      .replace(/[–—−-]/g, "")
      .replace(/[^A-Z0-9]/g, "")
      .trim();
  }

  // ---------- últimos registros ----------
  function clearUltimos() { if (tbLast) tbLast.innerHTML = ""; }

  // só adiciona se o registro for do entregador atual; 6 colunas (a 6ª é "Dup?")
  function appendUltimoRegistro(row) {
    if (!tbLast) return;

    const entNow = selEnt?.value || "";
    if (entNow && row?.entregador && row.entregador !== entNow) return;

    const tr = document.createElement("tr");
    const cols = [
      row.tsFmt || new Date().toLocaleString("pt-BR"),
      row.entregador || "",
      row.codigo || "",
      row.servico || "",
      row.status || (row.duplicado ? "Duplicado" : "Saiu"),
      row.duplicado ? "Sim" : ""
    ];
    tr.innerHTML = cols.map(c => `<td>${c}</td>`).join("");
    tbLast.prepend(tr);
  }

  // ---------- API helpers ----------
  function apiGetEntregadores() {
    if (!window.TrackAPI?.getEntregadores) {
      return Promise.reject(new Error("TrackAPI.getEntregadores não disponível"));
    }
    return TrackAPI.getEntregadores(); // GET /entregadores/
  }

  function apiRegistrarSaida({ entregador, codigo }) {
    if (!window.TrackAPI?.registerSaida) {
      return Promise.reject(new Error("TrackAPI.registerSaida não disponível"));
    }
    return TrackAPI.registerSaida({ entregador, codigo }); // POST /saidas/registrar
  }

  // ---------- carregar entregadores ----------
  function loadEntregadores() {
    return apiGetEntregadores().then(res => {
      const raw   = Array.isArray(res) ? res : (res?.data ?? []);
      const lista = raw.map(e => typeof e === "string" ? e : (e?.nome || e?.name)).filter(Boolean);

      if (!selEnt) return;
      selEnt.innerHTML =
        '<option value="" selected disabled>Selecione entregador</option>' +
        lista.map(n => `<option value="${n}">${n}</option>`).join("");

      const last = localStorage.getItem(LAST_ENT_KEY);
      if (last && lista.includes(last)) selEnt.value = last;

      onEntregadorChange(); // limpa "Últimos"
    }).catch(() => {
      showMsgIcon("erro", "Falha ao carregar entregadores.");
    });
  }

  function onEntregadorChange() {
    const v = selEnt?.value || "";
    if (v) localStorage.setItem(LAST_ENT_KEY, v);
    clearUltimos(); // requisito: ao trocar, limpa a tabela
  }

  // ---------- registrar ----------
  async function registrar() {
    const entregador = selEnt?.value?.trim() || "";
    if (!entregador) return showMsgIcon("erro", "Selecione o entregador.");

    const codigo = normalizeCode(inpCod?.value || "");
    if (!codigo)   return showMsgIcon("erro", "Informe o código.");

    showMsgIcon("info", "Registrando…");
    btnReg && (btnReg.disabled = true);

    try {
      const res = await apiRegistrarSaida({ entregador, codigo });
      btnReg && (btnReg.disabled = false);

      if (!res || res.ok === false) {
        showMsgIcon("erro", res?.error || "Falha ao registrar.");
        return;
      }

      const row = res.data || {
        tsFmt: new Date().toLocaleString("pt-BR"),
        entregador,
        codigo,
        servico: "",
        status: "Saiu",
        duplicado: false
      };

      if (row.duplicado) showMsgIcon("alerta", `DUPLICADO • ${row.codigo}`);
      else               showMsgIcon("info",    `Registrado: ${row.codigo} • ${row.servico || ""}`);

      appendUltimoRegistro(row);
      if (inpCod) { inpCod.value = ""; inpCod.focus(); }
    } catch (e) {
      btnReg && (btnReg.disabled = false);
      showMsgIcon("erro", e?.error || String(e));
    }
  }

  // ---------- eventos ----------
  selEnt?.addEventListener("change", onEntregadorChange);
  btnReg?.addEventListener("click", registrar);
  inpCod?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); registrar(); }
  });

  // ---------- init ----------
  loadEntregadores().then(() => { inpCod?.focus(); });
})();
