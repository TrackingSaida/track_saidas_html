// Leitura: classificação, UI otimista + fila local, sons, "Dup?" como checkbox
(function () {
  "use strict";

  // ---------- elementos ----------
  const $ = (id) => document.getElementById(id);
  const selEnt = $("entregador");
  const inpCod = $("codigo");
  const btnReg = $("btnRegistrar");
  const msg = $("msgArea");
  const tbLast = $("ultimos-rows");

  // linhas ativas (para não duplicar visualmente)
  const rowsByKey = new Map(); // key(ent,cod) -> <tr>
  const keyFor = (entregador, codigo) =>
    `${String(entregador || "").toUpperCase()}||${String(codigo || "").toUpperCase()}`;

  // ---------- Fila local de pendentes (mantém "Enviando…") ----------
  const PENDING_KEY = "track:leituras:pending";
  const rowsById = new Map(); // id pendente -> <tr>
  const inflight = new Set(); // ids em envio

  function loadPending() {
    try {
      return JSON.parse(localStorage.getItem(PENDING_KEY) || "[]");
    } catch {
      return [];
    }
  }
  function savePending(list) {
    localStorage.setItem(PENDING_KEY, JSON.stringify(list || []));
  }
  function addPending(p) {
    const list = loadPending();
    list.push(p);
    savePending(list);
  }
  function removePending(id) {
    const list = loadPending().filter((x) => x.id !== id);
    savePending(list);
    rowsById.delete(id);
    inflight.delete(id);
  }
  function genId() {
    return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  // ---------- sons ----------
  const Sound = (() => {
    let ctx;
    function ensure() {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === "suspended") ctx.resume();
      return ctx;
    }
    function beep({ freq = 880, dur = 120, type = "sine", vol = 0.06, when = 0 }) {
      const c = ensure(),
        t0 = c.currentTime + when / 1000,
        o = c.createOscillator(),
        g = c.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol, t0);
      g.gain.linearRampToValueAtTime(0.0001, t0 + dur / 1000);
      o.connect(g).connect(c.destination);
      o.start(t0);
      o.stop(t0 + dur / 1000 + 0.02);
      return dur;
    }
    function play(kind) {
      if (kind === "ok") {
        let d = 0;
        d += beep({ freq: 1046, dur: 90, type: "sine", vol: 0.05, when: d });
        beep({ freq: 1318, dur: 140, type: "sine", vol: 0.05, when: d + 60 });
      } else if (kind === "warn") {
        let d = 0;
        d += beep({ freq: 660, dur: 120, type: "triangle", vol: 0.05, when: d });
        beep({ freq: 660, dur: 120, type: "triangle", vol: 0.05, when: d + 160 });
      } else {
        beep({ freq: 220, dur: 240, type: "square", vol: 0.06, when: 0 });
        beep({ freq: 180, dur: 220, type: "square", vol: 0.06, when: 260 });
      }
    }
    return { play };
  })();

  // ---------- mensagens ----------
  function showMsgIcon(tipo, texto) {
    const map = {
      erro: { ico: "alert-octagon", klass: "danger" },
      alerta: { ico: "alert-triangle", klass: "warning" },
      info: { ico: "alert-circle", klass: "info" },
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
  function toAsciiDigits(s) {
    if (!s) return "";
    const sup = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9" };
    s = String(s).replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (d) => sup[d]);
    s = s.replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xFF10 + 0x30));
    return s;
  }

  // ---------- CLASSIFICAÇÃO ----------
  function classifyCodigo(rawInput) {
    const raw = toAsciiDigits(String(rawInput || "")).toUpperCase().trim();

    const allDigits = raw.replace(/\D+/g, "");
    // NF-e (44) → bloquear
    if (/^\d{44}$/.test(allDigits)) {
      return { ok: false, motivo: "NF-e (44 dígitos)" };
    }

    // Shopee: BR + (13 dígitos) ou (12 dígitos + 1 letra), total 15
    const sh = raw.match(/(?:^|[^A-Z0-9])(BR(?:\d{13}|\d{12}[A-Z]))(?=$|[^A-Z0-9])/i);
    if (sh) return { ok: true, servico: "Shopee", codigo: sh[1].toUpperCase() };

    // Mercado Livre: primeiro bloco começando por 45, retorna 11 dígitos
    const mlRun = allDigits.match(/45\d{9,}/);
    if (mlRun) return { ok: true, servico: "Mercado Livre", codigo: mlRun[0].slice(0, 11) };

    // Avulso (CEP): primeira ocorrência de 8 dígitos
    const cep = (allDigits.match(/\d{8}/) || [null])[0];
    if (cep) return { ok: true, servico: "Avulso", codigo: cep };

    return { ok: false, motivo: "Padrão não configurado" };
  }

  // ---------- últimos registros ----------
  function clearUltimos() {
    if (tbLast) tbLast.innerHTML = "";
    rowsByKey.clear();
  }

  function createRow(row) {
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

  function appendOrUpdateRow(row) {
    const k = keyFor(row.entregador, row.codigo);
    const ex = rowsByKey.get(k);
    if (ex) {
      ex.querySelector(".srv").textContent = row.servico || ex.querySelector(".srv").textContent;
      ex.querySelector(".st").textContent = row.status || ex.querySelector(".st").textContent;
      if (row.duplicado) {
        const chk = ex.querySelector(".dup-mark");
        if (chk) chk.checked = true;
      }
      return ex;
    }
    return createRow(row);
  }

  function markDuplicateOnRow(tr) {
    if (!tr) return;
    tr.querySelector(".st").textContent = "Duplicado";
    const chk = tr.querySelector(".dup-mark");
    if (chk) chk.checked = true;
  }

  // ---------- API helpers ----------
  function apiGetEntregadores() {
    return window.TrackAPI?.getEntregadores
      ? TrackAPI.getEntregadores()
      : Promise.reject(new Error("TrackAPI.getEntregadores não disponível"));
  }
  function apiRegistrarSaida({ entregador, codigo, servico }) {
    return window.TrackAPI?.registerSaida
      ? TrackAPI.registerSaida({ entregador, codigo, servico })
      : Promise.reject(new Error("TrackAPI.registerSaida não disponível"));
  }

  // tenta enviar um item pendente e atualizar a linha
  async function attemptSend(p) {
    if (inflight.has(p.id)) return;
    inflight.add(p.id);

    const tr = rowsById.get(p.id);
    if (tr) tr.querySelector(".st").textContent = "Enviando…";

    try {
      const res = await apiRegistrarSaida({
        entregador: p.entregador,
        codigo: p.codigo,
        servico: p.servico,
      });

      removePending(p.id);

      const apiRow =
        res && typeof res === "object" && typeof res.data === "object" ? res.data : {};
      const novoServico = apiRow.servico ?? p.servico ?? "";
      const novoStatus = apiRow.status ?? "Saiu";
      const duplicado = !!apiRow.duplicado;

      if (tr) {
        tr.querySelector(".srv").textContent = novoServico;
        tr.querySelector(".st").textContent = novoStatus;
        if (duplicado) markDuplicateOnRow(tr);
      }

      if (duplicado) {
        showMsgIcon("alerta", `DUPLICADO • ${p.codigo}`);
        Sound.play("warn");
      } else {
        showMsgIcon("info", `Registrado: ${p.codigo}${novoServico ? " • " + novoServico : ""}`);
        Sound.play("ok");
      }
    } catch (e) {
  // códigos estruturados vindos do back
  const code = e?.code || e?.detail?.code || null;
  const msg  = String(e?.error || e?.detail?.message || e?.message || "");

  // tiramos da fila (não fica "Enviando…")
  removePending(p.id);

  // linha correspondente (se renderizada)
  const tr = rowsById.get(p.id);

  if (e?.status === 409 && code === "DUPLICATE_SAIDA") {
    // DUPLICADO → mantém a linha e marca o checkbox
    if (tr) {
      tr.querySelector(".st").textContent = "Duplicado";
      const chk = tr.querySelector(".dup-mark"); if (chk) chk.checked = true;
    }
    showMsgIcon("alerta", `DUPLICADO • ${p.codigo}`);
    Sound.play("warn");
    return;
  }

  if (e?.status === 409 && code === "INSUFFICIENT_CREDITS") {
    // SEM CRÉDITOS → não queremos rastro na tabela:
    // remove a linha otimista e limpa os mapas
    if (tr) {
      const key = `${String(p.entregador).toUpperCase()}||${String(p.codigo).toUpperCase()}`;
      rowsByKey.delete(key);
      rowsById.delete(p.id);
      tr.remove();
    }
    // abre o SweetAlert do user.js
    if (window.UserUX && typeof window.UserUX.creditAlert === "function") {
      window.UserUX.creditAlert(msg);
    } else if (window.Swal && Swal.fire) {
      // fallback direto (se não adicionou o helper)
      Swal.fire({
        icon: "warning",
        title: "Créditos insuficientes",
        text: msg || "Créditos insuficientes.",
        confirmButtonText: "Ok",
        buttonsStyling: false,
        customClass: { confirmButton: "btn btn-primary" }
      });
    } else {
      // último fallback
      showMsgIcon("erro", msg || "Créditos insuficientes.");
    }
    Sound.play("err");
    return;
  }

  // outros erros (422 validação, 401, 5xx…)
  if (tr) tr.querySelector(".st").textContent = `Erro${e?.status ? " " + e.status : ""}`;
  showMsgIcon("erro", msg || "Erro ao registrar");
  Sound.play("err");
}


  }

  // ---------- carregar entregadores (sempre começa vazio) ----------
  function loadEntregadores() {
    return apiGetEntregadores()
      .then((res) => {
        const raw = Array.isArray(res) ? res : res?.data ?? [];
        const lista = raw
          .map((e) => (typeof e === "string" ? e : e?.nome || e?.name))
          .filter(Boolean);
        if (!selEnt) return;
        selEnt.innerHTML =
          '<option value="" selected disabled>Selecione entregador</option>' +
          lista.map((n) => `<option value="${n}">${n}</option>`).join("");
        selEnt.selectedIndex = 0; // não lembrar último
        onEntregadorChange();
      })
      .catch(() => {
        showMsgIcon("erro", "Falha ao carregar entregadores.");
        Sound.play("err");
      });
  }

  function onEntregadorChange() {
    clearUltimos();
    const entNow = selEnt?.value || "";
    if (!entNow) return;
    // renderiza pendentes deste entregador
    const pend = loadPending().filter((p) => p.entregador === entNow);
    for (const p of pend) {
      const tr = appendOrUpdateRow({
        tsFmt: new Date().toLocaleString("pt-BR"),
        entregador: p.entregador,
        codigo: p.codigo,
        servico: p.servico || "",
        status: "Enviando…",
        duplicado: false,
      });
      rowsById.set(p.id, tr);
    }
  }

  // ---------- registrar ----------
  async function registrar() {
    const entregador = selEnt?.value?.trim() || "";
    if (!entregador) {
      showMsgIcon("erro", "Selecione o entregador.");
      Sound.play("err");
      return;
    }

    const rawInput = inpCod?.value || "";
    if (!rawInput.trim()) {
      showMsgIcon("erro", "Informe o código.");
      Sound.play("err");
      return;
    }

    // Classificação (bloqueia NF-e e padrões inválidos)
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

    // Já existe linha na sessão: não cria outra.
    // Apenas agenda um envio; se for duplicado, o 409 do back marca a linha.
    if (rowsByKey.has(k)) {
      const existingTr = rowsByKey.get(k);
      const pending = { id: genId(), ts: Date.now(), entregador, codigo: codigoFinal, servico };
      addPending(pending);
      rowsById.set(pending.id, existingTr);
      attemptSend(pending);
      showMsgIcon("info", `Verificando duplicidade • ${codigoFinal}`);
      if (inpCod) {
        inpCod.value = "";
        inpCod.focus();
      }
      return;
    }

    // cria linha "Enviando…" e pendente
    const pending = { id: genId(), ts: Date.now(), entregador, codigo: codigoFinal, servico };
    addPending(pending);

    const tr = appendOrUpdateRow({
      tsFmt: new Date().toLocaleString("pt-BR"),
      entregador,
      codigo: codigoFinal,
      servico,
      status: "Enviando…",
      duplicado: false,
    });
    rowsById.set(pending.id, tr);

    // dispara envio (assíncrono)
    attemptSend(pending);

    if (inpCod) {
      inpCod.value = "";
      inpCod.focus();
    }
  }

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
  loadEntregadores().then(() => {
    inpCod?.focus();
  });
  // tenta reenviar pendentes (inclusive de sessões anteriores)
  for (const p of loadPending()) attemptSend(p);
})();
