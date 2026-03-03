/* =================== Config =================== */
(function checkIgnorarColeta() {
  if (window.IGNORAR_COLETA === true || localStorage.getItem("ignorar_coleta") === "1") {
    window.location.replace("dashboard-tracking-overview.html");
    return;
  }
  document.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => {
      if (window.IGNORAR_COLETA === true) {
        window.location.replace("dashboard-tracking-overview.html");
      }
    }, 600);
  }, { once: true });
})();

function getBaseUrl() {
  const url = (typeof window !== "undefined" && window.TRACK_API_URL) ? window.TRACK_API_URL : "";
  return String(url).replace(/\/+$/, "");
}
const API_URL = () => `${getBaseUrl()}/coletas/lote`;
const API_BASES = () => `${getBaseUrl()}/base/?status=ativo`;
const API_ENTREGADORES = () => `${getBaseUrl()}/entregadores`;

// ⚙️ Agora a chave do localStorage é dinâmica por base
let STORAGE_KEY = null;

/* 🔧 LIMPEZA SEGURA DE LEITURAS ANTIGAS (ANTES DOS HELPERS) */
(function limparLeiturasAntigasGlobais() {
  try {
    const s = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const [dd, mm, yyyy] = s.split("/");
    const hoje = `${yyyy}-${mm}-${dd}`;


    // Percorre todas as chaves que armazenam coletas locais
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith("coletasPendentes")) continue;

      const armazenadas = JSON.parse(localStorage.getItem(key) || "[]");
      if (!Array.isArray(armazenadas) || armazenadas.length === 0) continue;

      // Mantém apenas itens com data válida de hoje
      const atuais = armazenadas.filter(c => {
        const data = typeof c.data === "string" && c.data.length >= 10 ? c.data : hoje;
        return data.startsWith(hoje);
      });

      if (atuais.length !== armazenadas.length) {
        localStorage.setItem(key, JSON.stringify(atuais));
        console.info(`🧹 Limpei leituras antigas da chave ${key} — mantive ${atuais.length}`);
      }
    }
  } catch (err) {
    console.warn("Falha ao limpar leituras antigas:", err);
  }
})();


/* =============== Helpers / UI ================= */
const qs  = (s) => document.querySelector(s);
const qsa = (s) => Array.from(document.querySelectorAll(s));

// === util: retorna data local (Brasil) em formato YYYY-MM-DD ===
function hojeBR() {
  const s = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const [dd, mm, yyyy] = s.split("/");
  return `${yyyy}-${mm}-${dd}`;
}



/* ================== Sons  ================== */
const Sound = (() => {
  let ctx;
  function ensure(){ if (!ctx) ctx = new (window.AudioContext||window.webkitAudioContext)(); if (ctx.state==='suspended') ctx.resume(); return ctx; }
  function beep({ freq=880, dur=120, type="sine", vol=1.2, when=0 }){
    const c = ensure(), t0 = c.currentTime + when/1000, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t0); g.gain.linearRampToValueAtTime(0.0001, t0 + dur/1000);
    o.connect(g).connect(c.destination); o.start(t0); o.stop(t0 + dur/1000 + 0.02); return dur;
  }
  function play(kind){
    if (kind === "ok"){ let d = 0; d += beep({freq:1046,dur:90,type:"sine",vol:1.2,when:d}); beep({freq:1318,dur:140,type:"sine",vol:1.2,when:d+60}); }
    else if (kind === "warn"){ let d = 0; d += beep({freq:660,dur:120,type:"triangle",vol:1.2,when:d}); beep({freq:660,dur:120,type:"triangle",vol:1.2,when:d+160}); }
    else { beep({freq:220,dur:240,type:"square",vol:1.2,when:0}); beep({freq:180,dur:220,type:"square",vol:1.2,when:260}); }
  }
  return { play };
})();

const toast = (msg, ok = true) => {
  const el = document.createElement("div");
  el.className = `toast align-items-center text-bg-${ok ? "primary" : "danger"} border-0 position-fixed bottom-0 end-0 m-3`;
  el.innerHTML = `<div class="d-flex"><div class="toast-body">${msg}</div>
    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div>`;
  el.style.zIndex = 1080;
  document.body.appendChild(el);
  const t = new bootstrap.Toast(el, { delay: 2500 });
  t.show(); setTimeout(()=>el.remove(), 2800);
};

// =====================================================
// MÉTRICAS DE LEITURA (FRONT) — COLETAS
// =====================================================
window.LeituraMetrics = window.LeituraMetrics || {
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
  m.delta_send_to_response_ms =
    typeof m.ts_send === "number"
      ? m.ts_response - m.ts_send
      : null;

  m.ok = ok;
  m.resultado = tipo;
}





/* =============== Estado ============= */
let COLETAS = [];
let BASE_ATUAL = null;
let modoMonitor = false;
try {
  if (localStorage.getItem("coletasModoMonitor") === "1") modoMonitor = true;
} catch (_) {}

/* =============== API ================= */
async function carregarBases() {
  const url = API_BASES();
  if (!url || url.includes("undefined")) {
    throw new Error("URL da API não configurada. Verifique TRACK_API_URL.");
  }
  const r = await fetch(url, { credentials: "include" });
  if (!r.ok) {
    const msg = r.status === 401 ? "Faça login para carregar as bases." : (r.status === 403 ? "Sem permissão para listar bases." : `Falha ao carregar bases (${r.status}).`);
    throw new Error(msg);
  }
  const data = await r.json();
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

async function carregarEntregadores() {
  const url = API_ENTREGADORES();
  if (!url || url.includes("undefined")) return [];
  try {
    const r = await fetch(url, { credentials: "include" });
    if (!r.ok) return [];
    const data = await r.json();
    const raw = Array.isArray(data) ? data : (data?.data ?? []);
    return raw.filter(e => e && (e.id_entregador != null || e.id != null));
  } catch (_) {
    return [];
  }
}

function enviarLogLeitura(payload) {
  try {
    const token =
      localStorage.getItem("authToken") ||
      localStorage.getItem("access_token");

    fetch(`${getBaseUrl()}/logs/leituras`, {
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


/* =================== Envio em Lote =================== */
async function enviarColetasLote(base, itens, entregadorId = null) {
  const body = {
    base,
    itens: itens.map(i => {
      const o = { codigo: i.codigo, servico: i.servico };
      if (i.qr_payload_raw) o.qr_payload_raw = i.qr_payload_raw;
      return o;
    })
  };
  if (entregadorId != null && entregadorId !== "") {
    body.entregador_id = parseInt(entregadorId, 10);
  }
  const r = await fetch(API_URL(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body)
  });

  return r;
}


/* =================== Envio Imediato =================== */
async function enviarColetaUnica(item, entregadorId = null) {
  try {
    // 🔹 Monta corpo apenas com os campos esperados pela API
    const it = { codigo: item.codigo, servico: item.servico };
    if (item.qr_payload_raw) it.qr_payload_raw = item.qr_payload_raw;
    const body = { base: item.base, itens: [it] };
    if (entregadorId != null && entregadorId !== "") {
      body.entregador_id = parseInt(entregadorId, 10);
    }

    const r = await fetch(API_URL(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body)
    });

    if (r.status === 201) {
      item.status = "enviado";
      toast("Enviado com sucesso!");
      Sound.play("ok");
    } else {
      throw new Error(`Status ${r.status}`);
    }
  } catch (err) {
    console.error("Falha no envio imediato:", err);
    item.status = "erro";
    toast("Erro ao enviar coleta.", false);
    Sound.play("error");
  } finally {
    renderTabela();
  }
}


/* =================== Normalização / Classificação =================== */
function toAsciiDigits(s){
  if (!s) return "";
  const sup = {"⁰":"0","¹":"1","²":"2","³":"3","⁴":"4","⁵":"5","⁶":"6","⁷":"7","⁸":"8","⁹":"9"};
  s = String(s).replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, d => sup[d]);
  s = s.replace(/[０-９]/g, d => String.fromCharCode(d.charCodeAt(0) - 0xFF10 + 0x30));
  return s;
}

function isCodigoShopee(codigo) {
  if (!codigo || typeof codigo !== "string") return false;
  const c = String(codigo).toUpperCase().trim();
  return /^BR(\d{13}|\d{12}[A-Z])$/.test(c);
}

function classifyCodigo(rawInput){
  const rawInputStr = String(rawInput || "").trim();
  const raw = toAsciiDigits(rawInputStr).toUpperCase().trim();
  const allDigits = raw.replace(/\D+/g, "");

  // ===========================================================
  // PRIORIDADE 0 — Mercado Livre JSON (id, sender_id, hash_code)
  // ===========================================================
  try {
    if (rawInputStr.startsWith("{") && rawInputStr.trim().endsWith("}")) {
      const obj = JSON.parse(rawInputStr);
      if (typeof obj.id === "string" && (obj.sender_id != null || obj.hash_code != null)) {
        const codigo = String(obj.id).trim();
        return { ok:true, servico:"Mercado Livre", codigo, qr_payload_raw: rawInputStr };
      }
    }
  } catch(_) {}

  // ===========================================================
  // PRIORIDADE 1 — QRCode JSON com external_order_id
  // ===========================================================
  try {
    if (raw.startsWith("{") && raw.endsWith("}")) {
      const obj = JSON.parse(raw);
      if (typeof obj.external_order_id === "string") {
        const codigo = obj.external_order_id.toUpperCase().trim();
        const servico = isCodigoShopee(codigo) ? "Shopee" : "Avulso";
        return { ok:true, servico, codigo };
      }
    }
  } catch(_) {}

  // ===========================================================
  // PRIORIDADE 2 — external_order_id fora de JSON
  // ===========================================================
  const extMatch = raw.match(/external_order_id["']?\s*[:=]\s*["']?([\w-]+)/i);
  if (extMatch) {
    const codigo = extMatch[1].toUpperCase();
    const servico = isCodigoShopee(codigo) ? "Shopee" : "Avulso";
    return { ok:true, servico, codigo };
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
  // Mercado Livre (45–49 → 11 dígitos) — guarda raw para etiqueta
  // ===========================================================
  const mlRun = allDigits.match(/4[5-9]\d{9,}/);
  if (mlRun) {
    return { ok:true, servico:"Mercado Livre", codigo: mlRun[0].slice(0, 11), qr_payload_raw: rawInputStr };
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

/* =============== Atualiza Resumo ============= */
function atualizarResumo() {
  const shopee = COLETAS.filter(c => c.servico === "Shopee" && !(c.status || "").toLowerCase().includes("duplicado")).length;
  const ml = COLETAS.filter(c => (c.servico === "Mercado Livre" || c.servico === "ML") && !(c.status || "").toLowerCase().includes("duplicado")).length;
  const avulso = COLETAS.filter(c => c.servico === "Avulso" && !(c.status || "").toLowerCase().includes("duplicado")).length;
  const total = COLETAS.filter(c => !(c.status || "").toLowerCase().includes("duplicado")).length;

  qs("#sum-shopee").textContent = shopee;
  qs("#sum-ml").textContent = ml;
  qs("#sum-avulso").textContent = avulso;
  qs("#sum-total").textContent = total;
  atualizarVistaMonitor();
}

/* =============== Vista Modo Monitor ============= */
function atualizarVistaMonitor() {
  const shopee = COLETAS.filter(c => c.servico === "Shopee" && !(c.status || "").toLowerCase().includes("duplicado")).length;
  const ml = COLETAS.filter(c => (c.servico === "Mercado Livre" || c.servico === "ML") && !(c.status || "").toLowerCase().includes("duplicado")).length;
  const avulso = COLETAS.filter(c => c.servico === "Avulso" && !(c.status || "").toLowerCase().includes("duplicado")).length;
  const total = COLETAS.filter(c => !(c.status || "").toLowerCase().includes("duplicado")).length;

  const el = (id) => qs("#" + id);
  if (el("monitor-total")) el("monitor-total").textContent = total;
  if (el("monitor-shopee")) el("monitor-shopee").textContent = shopee;
  if (el("monitor-ml")) el("monitor-ml").textContent = ml;
  if (el("monitor-avulso")) el("monitor-avulso").textContent = avulso;
  if (el("monitor-cliente")) el("monitor-cliente").textContent = BASE_ATUAL || "—";

  const ultima = COLETAS.length ? COLETAS[COLETAS.length - 1] : null;
  const wrap = el("monitor-ultima-wrapper");
  if (wrap) {
    if (ultima) {
      if (el("monitor-ultima-codigo")) el("monitor-ultima-codigo").textContent = ultima.codigo;
      const statusEl = el("monitor-ultima-servico");
      if (statusEl) {
        const st = (ultima.status || "pendente").toLowerCase();
        statusEl.textContent = (ultima.status || "Pendente").trim() || "Pendente";
        statusEl.className = "badge " + (st === "enviado" ? "bg-success" : st === "duplicado" ? "bg-warning text-dark" : st === "erro" ? "bg-danger" : st === "reenviando" ? "bg-info text-dark" : "bg-secondary");
      }
    } else {
      if (el("monitor-ultima-codigo")) el("monitor-ultima-codigo").textContent = "—";
      if (el("monitor-ultima-servico")) { el("monitor-ultima-servico").textContent = "—"; el("monitor-ultima-servico").className = "badge bg-secondary"; }
    }
  }
}

function alternarModoColetas() {
  modoMonitor = !modoMonitor;
  try { localStorage.setItem("coletasModoMonitor", modoMonitor ? "1" : "0"); } catch (_) {}
  const padrao = qs("#modo-padrao");
  const monitor = qs("#modo-monitor");
  const btn = qs("#btnModoMonitor");
  const btnText = qs("#btnModoMonitorText");
  if (padrao) padrao.classList.toggle("d-none", modoMonitor);
  if (monitor) monitor.classList.toggle("d-none", !modoMonitor);
  if (btn) {
    btn.classList.toggle("btn-outline-primary", !modoMonitor);
    btn.classList.toggle("btn-primary", modoMonitor);
    btn.title = modoMonitor ? "Voltar para tela padrão (ideal para mobile/câmera)" : "Alternar para tela com contadores em destaque (ideal para scanner no PC)";
  }
  if (btnText) btnText.textContent = modoMonitor ? "Modo Padrão" : "Modo Monitor";
  const icon = btn?.querySelector("i");
  if (icon) icon.className = modoMonitor ? "ri-smartphone-line me-1" : "ri-tv-line me-1";
  atualizarVistaMonitor();
  if (modoMonitor && qs("#codigo")) qs("#codigo").focus();
}

/* =============== Renderização da Tabela ============= */
function renderTabela() {
  const tbody = qs("#tbody-coletas");
  if (!tbody) return;
  tbody.innerHTML = "";

  COLETAS.slice(-150).forEach((item, i) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${i + 1}</td>
      <td>${item.base}</td>
      <td>${item.codigo}</td>
      <td>${item.servico}</td>
      <td>
        ${item.status === "enviado" 
          ? '<span class="badge bg-success">Enviado</span>'
          : item.status === "duplicado"
          ? '<span class="badge bg-warning text-dark">Duplicado</span>'
          : item.status === "erro"
          ? '<span class="badge bg-danger">Erro</span>'
          : item.status === "reenviando"
          ? '<span class="badge bg-info text-dark">Reenviando</span>'
          : '<span class="badge bg-secondary">Pendente</span>'}
      </td>
      <td><button class="btn btn-sm btn-link text-danger" data-remove="${item.codigo}"><i class="ri-delete-bin-line"></i></button></td>
    `;
    tbody.appendChild(row);
  });

  if (STORAGE_KEY) localStorage.setItem(STORAGE_KEY, JSON.stringify(COLETAS));
  atualizarResumo();
}


async function registrarCodigoComLog(origem = "teclado") {
  const raw = qs("#codigo")?.value || "";

  const leituraMetric = startLeituraMetric({ origem, raw });
  let resultado = "desconhecido";

  try {
    markEnvioMetric(leituraMetric);

    const antes = COLETAS.length;
    registrarCodigo(); // fluxo original (inclui envio automático)
    const depois = COLETAS.length;

    if (!raw) resultado = "codigo_vazio";
    else if (depois === antes) resultado = "duplicado_ou_invalido";
    else resultado = "coleta_registrada";
  } finally {
    const sucesso = resultado === "coleta_registrada";

    markRespostaMetric(leituraMetric, sucesso, resultado);

    enviarLogLeitura({
      origem: leituraMetric.origem,
      tipo: "coleta",
      codigo: raw,
      resultado,
      delta_from_last_read_ms: leituraMetric.delta_from_last_read_ms,
      delta_read_to_send_ms: leituraMetric.delta_read_to_send_ms,
      delta_send_to_response_ms: leituraMetric.delta_send_to_response_ms,
      ts_read: leituraMetric.ts_read,
      network_status: navigator.connection?.effectiveType ?? "unknown",
      device_type: /mobile/i.test(navigator.userAgent) ? "mobile" : "desktop",
      os: navigator.platform || "unknown"
    });

    // Retorno para o scanner/UX (ex.: contador da câmera)
    return { resultado, sucesso };
  }
}


/* =================== Registro e Envio =================== */
function registrarCodigo() {
  const baseSel = qs("#selBase")?.value;
  const codRaw = qs("#codigo")?.value;

  if (!baseSel) return toast("Selecione a base antes de registrar.", false);
  if (!codRaw) return toast("Informe ou escaneie um código.", false);

  const parsed = classifyCodigo(codRaw);
  if (!parsed.ok) {
    toast(`Código inválido (${parsed.motivo})`, false);
    Sound.play("error");
    return;
  }

  const codigo = parsed.codigo;
  const servico = parsed.servico;
  const hojeStr = new Date().toISOString().slice(0, 10);

  
// 🔎 Verifica duplicado — NÃO registra linha duplicada (não polui a tela)
if (COLETAS.some(c => c.codigo === codigo)) {
  toast("Código duplicado.", false);
  Sound.play("warn");
  // limpa o campo e volta foco
  qs("#codigo").value = "";
  qs("#codigo")?.focus();
  return;
}

COLETAS.push({
  base: baseSel,
  codigo,
  servico,
  status: "pendente",
  tentativas: 0,
  data: hojeStr,
  qr_payload_raw: parsed.qr_payload_raw || undefined
});
toast("Código registrado.");
Sound.play("ok");

// Envio automático do item recém-adicionado (formato correto)
const novoItem = COLETAS[COLETAS.length - 1];
const entId = qs("#selEntregador")?.value || null;
enviarColetaUnica(novoItem, entId);

   // 💾 Salva imediatamente no localStorage
  try {
    // 🔹 Usa data local (fuso Brasil)
    const s = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const [dd, mm, yyyy] = s.split("/");
    const hoje = `${yyyy}-${mm}-${dd}`;

    // 🔹 Garante que todos tenham o campo data do dia
    const coletasComData = COLETAS.map(c => ({ ...c, data: c.data || hoje }));

    if (STORAGE_KEY) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(coletasComData));
    }
  } catch (err) {
    console.warn("Falha ao salvar coletas localmente:", err);
  }


  // limpa o campo de entrada e volta o foco
  qs("#codigo").value = "";
  qs("#codigo")?.focus();
  renderTabela();
}

/* 🆕 Reenvio manual dos pendentes */
async function reenviarPendentes() {
  if (!BASE_ATUAL) return toast("Selecione uma base antes de reenviar.", false);

  const pendentes = COLETAS.filter(c => ["pendente", "erro"].includes(c.status));
  if (!pendentes.length)
    return toast("Nenhum item pendente para reenviar.", false);

  toast(`Reenviando ${pendentes.length} pendentes...`);
  Sound.play("warn");

  try {
    const entId = qs("#selEntregador")?.value || null;
    const r = await enviarColetasLote(BASE_ATUAL, pendentes, entId);
    if (r.status === 201) {
      // marca todos os pendentes como enviados
      COLETAS.forEach(c => {
        if (["pendente", "erro"].includes(c.status)) c.status = "enviado";
      });

      // 💾 Atualiza armazenamento local
      if (STORAGE_KEY) localStorage.setItem(STORAGE_KEY, JSON.stringify(COLETAS));

      toast("Pendentes reenviados com sucesso!");
      Sound.play("ok");
    } else throw new Error(`Status ${r.status}`);
  } catch (err) {
    console.error("Falha ao reenviar pendentes:", err);
    toast("Erro ao reenviar pendentes.", false);
    Sound.play("error");
  } finally {
    renderTabela();
  }
}


/* =================== Init =================== */
document.addEventListener("DOMContentLoaded", async () => {
  const sel = qs("#selBase");
  if (!sel) return;

  try {
    const bases = await carregarBases();
    const list = (Array.isArray(bases) ? bases : []).slice().sort((a, b) => {
      const va = (a.base != null ? a.base : a).toString();
      const vb = (b.base != null ? b.base : b).toString();
      return va.localeCompare(vb, "pt-BR");
    });
    sel.innerHTML =
      '<option value="" disabled selected>Selecione...</option>' +
      list.map(b => `<option value="${(b.base != null ? b.base : b).toString()}">${(b.base != null ? b.base : b).toString()}</option>`).join("");
    if (list.length === 0) {
      toast("Nenhuma base ativa cadastrada. Cadastre uma base para registrar coletas.", false);
    }
  } catch (err) {
    const msg = err && err.message ? err.message : "Falha ao carregar bases.";
    toast(msg, false);
    sel.innerHTML = '<option value="" disabled selected>Selecione...</option>';
  }

  try {
    const entregadores = await carregarEntregadores();
    const selEnt = qs("#selEntregador");
    if (selEnt && Array.isArray(entregadores)) {
      const ordenados = [...entregadores].sort((a, b) => {
        const na = (a.nome || a.name || String(a.id_entregador ?? a.id)).trim() || String(a.id_entregador ?? a.id);
        const nb = (b.nome || b.name || String(b.id_entregador ?? b.id)).trim() || String(b.id_entregador ?? b.id);
        return na.localeCompare(nb, "pt-BR");
      });
      selEnt.innerHTML =
        '<option value="">Usuário logado</option>' +
        ordenados.map(e => {
          const id = e.id_entregador ?? e.id;
          const nome = (e.nome || e.name || String(id)).trim() || String(id);
          return `<option value="${id}">${nome}</option>`;
        }).join("");
    }
  } catch (_) {
    const selEnt = qs("#selEntregador");
    if (selEnt) selEnt.innerHTML = '<option value="">Usuário logado</option>';
  }

    // 🟢 Função util para data local (Brasil)
    function hojeBR() {
      const s = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
      const [dd, mm, yyyy] = s.split("/");
      return `${yyyy}-${mm}-${dd}`;
    }

    // 🔹 Ao trocar a base
    sel.addEventListener("change", e => {
      BASE_ATUAL = e.target.value;
      STORAGE_KEY = `coletasPendentes_${BASE_ATUAL}`;

      // Lê do localStorage
      const hoje = hojeBR();
      const armazenadas = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");

      // 🔸 Mantém apenas coletas do dia atual
      COLETAS = Array.isArray(armazenadas)
        ? armazenadas.filter(c => String(c.data || "").startsWith(hoje))
        : [];

      // 🔸 Regrava para eliminar registros antigos dessa base
      localStorage.setItem(STORAGE_KEY, JSON.stringify(COLETAS));

      renderTabela();
      atualizarResumo();
      toast(`Base alterada para ${BASE_ATUAL}.`, true);
    });

  qs("#btnRegistrar")?.addEventListener("click", () =>
  registrarCodigoComLog("teclado")
);

  qs("#codigo")?.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();      
      registrarLeituraAuto();
    }
  });

  // 🔄 Botão agora é "Reenviar Pendentes"
  const btnReenvio = qs("#btnIrParaLote");
  if (btnReenvio) {
    btnReenvio.innerHTML = '<i class="ri-refresh-line"></i> Reenviar Pendentes';
    btnReenvio.addEventListener("click", reenviarPendentes);
  }

  qs("#tbody-coletas")?.addEventListener("click", e => {
    const btn = e.target.closest("[data-remove]");
    if (!btn) return;
    const cod = btn.dataset.remove;
    COLETAS = COLETAS.filter(c => c.codigo !== cod);
    renderTabela();
  });

  // Modo Monitor: estado inicial e botão
  const padraoEl = qs("#modo-padrao");
  const monitorEl = qs("#modo-monitor");
  const btnModo = qs("#btnModoMonitor");
  if (padraoEl) padraoEl.classList.toggle("d-none", modoMonitor);
  if (monitorEl) monitorEl.classList.toggle("d-none", !modoMonitor);
  if (btnModo) {
    btnModo.classList.toggle("btn-outline-primary", !modoMonitor);
    btnModo.classList.toggle("btn-primary", modoMonitor);
    btnModo.title = modoMonitor ? "Voltar para tela padrão (ideal para mobile/câmera)" : "Alternar para tela com contadores em destaque (ideal para scanner no PC)";
    const btnModoText = qs("#btnModoMonitorText");
    if (btnModoText) btnModoText.textContent = modoMonitor ? "Modo Padrão" : "Modo Monitor";
    const iconModo = btnModo.querySelector("i");
    if (iconModo) iconModo.className = modoMonitor ? "ri-smartphone-line me-1" : "ri-tv-line me-1";
    btnModo.addEventListener("click", alternarModoColetas);
  }
  atualizarVistaMonitor();

  renderTabela();
  atualizarResumo();
});

function registrarLeituraAuto({ codigo = null, origemForcada = null } = {}) {
  const origem =
    origemForcada ||
    (codigo !== null ? "camera" : "teclado");

  // 🔹 se veio código direto, injeta no input (mantém UX atual)
  if (codigo !== null && qs("#codigo")) {
    qs("#codigo").value = codigo;
  }

  // 🔹 sempre passa pelo fluxo novo (com log)
  return registrarCodigoComLog(origem);
}


/* ======= Coleta — Scanner híbrido (BarcodeDetector + ZXing) ======= */
(function coletaScannerIntegrado() {
  const btnScan = document.getElementById("btnScan");
  const inputCodigo = document.getElementById("codigo");
  if (!btnScan) return;

  const contadorEl = document.getElementById("scan-packages-count");
  const hud = document.getElementById("scanFSMsg");
  const overlay = document.getElementById("scanFS");
  const video = document.getElementById("scanFSVideo");
  const closeBtn = document.getElementById("scanCloseBtn");

  let totalLidos = 0;
  let scanLocked = false;
  let stream = null;
  let interval = null;

  // ---------- Atualiza contador ----------
  function atualizarContador() {
    contadorEl.textContent = `${totalLidos} ${totalLidos === 1 ? "Pacote Lido" : "Pacotes Lidos"}`;
  }

  // ---------- HUD ----------
  function showMsg(tipo, msg) {
    hud.textContent = msg;
    hud.classList.remove("info", "warning", "danger", "show");
    hud.classList.add(tipo === "erro" ? "danger" : tipo === "alerta" ? "warning" : "info", "show");
    clearTimeout(hud._t);
    hud._t = setTimeout(() => hud.classList.remove("show"), tipo === "erro" ? 3000 : 2000);
  }

  // ---------- Fechar scanner ----------
  function stopScanner() {
    if (interval) clearInterval(interval);
    if (stream) {
      try { stream.getTracks().forEach(t => t.stop()); } catch (_) {}
    }
    stream = null;
    scanLocked = false;
    overlay.classList.remove("show");
    overlay.style.display = "none";
    document.body.style.overflow = "";
  }

  // ---------- Inicializa leitor ----------
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
    } catch (err) {
      showMsg("erro", "Câmera não disponível");
      document.body.style.overflow = "";
      return;
    }

    // --- tenta BarcodeDetector ---
    if ("BarcodeDetector" in window) {
      try {
        const detector = new BarcodeDetector({
          formats: ["qr_code", "ean_13", "code_128", "code_39", "itf", "upc_a", "upc_e"]
        });

        interval = setInterval(async () => {
          if (scanLocked) return;
          try {
            const barcodes = await detector.detect(video);
            if (!barcodes.length) return;
            const code = barcodes[0].rawValue || "";
            if (inputCodigo) inputCodigo.value = code;
const res = await registrarLeituraAuto({ codigo: code });
if (res?.sucesso) {
  totalLidos++;
  atualizarContador();
  showMsg("info", `Registrado ✓ (${totalLidos})`);
} else if (res?.resultado === "duplicado_ou_invalido") {
  showMsg("alerta", "Duplicado/Inválido");
}

          } catch (e) {
            console.warn("Erro ao detectar código:", e);
          }
        }, 100);

        // Listener botão fechar
        if (closeBtn) closeBtn.onclick = () => stopScanner();
        return;
      } catch (e) {
        console.warn("BarcodeDetector não disponível, fallback ZXing...");
      }
    }

    // --- fallback ZXing ---
    if (window.ZXingBrowser) {
      const reader = new ZXingBrowser.BrowserMultiFormatReader();
      try {
        await reader.decodeFromVideoDevice(null, video, (result, err) => {
  if (!result) return;
  const code = result.getText();
  if (inputCodigo) inputCodigo.value = code;
  registrarLeituraAuto({ codigo: result.getText() }).then((res) => {
  if (res?.sucesso) {
    totalLidos++;
    atualizarContador();
    showMsg("info", `Registrado ✓ (${totalLidos})`);
  } else if (res?.resultado === "duplicado_ou_invalido") {
    showMsg("alerta", "Duplicado/Inválido");
  }
});

});

      } catch (err) {
        console.error("Erro ZXing fallback:", err);
        showMsg("erro", "Leitor não suportado neste dispositivo.");
      }
    } else {
      showMsg("erro", "Leitor não suportado neste dispositivo.");
    }

    // Listener botão fechar
    if (closeBtn) closeBtn.onclick = () => stopScanner();
  }

     // ---------- Processa leitura ----------
  function processarCodigo(text) {
    const codigo = String(text || "").trim();
    if (!codigo || scanLocked) return;
    scanLocked = true;

    if (inputCodigo) inputCodigo.value = codigo;

    const parsed = classifyCodigo(codigo);
    if (!parsed.ok) {
      showMsg("erro", "Código inválido");
      Sound.play("error");
      scanLocked = false;
      return;
    }

    const baseSel = qs("#selBase")?.value;
    if (!baseSel) {
      showMsg("alerta", "Selecione a base");
      Sound.play("warn");
      scanLocked = false;
      return;
    }

    
const duplicado = COLETAS.some(c => c.codigo === parsed.codigo);
if (duplicado) {
  // NÃO registra linha duplicada (não polui a tela)
  showMsg("alerta", "Duplicado");
  Sound.play("warn");
  if (inputCodigo) inputCodigo.value = "";
  renderTabela();
  setTimeout(() => (scanLocked = false), 180);
  return;
}

      const novoItem = {
        base: baseSel,
        codigo: parsed.codigo,
        servico: parsed.servico,
        status: "pendente",
        tentativas: 0,
        data: hojeBR(),
        qr_payload_raw: parsed.qr_payload_raw || undefined
      };

      COLETAS.push(novoItem);
      totalLidos++;
      atualizarContador();
      showMsg("info", `Registrado ✓ (${totalLidos})`);
      Sound.play("ok");

      const entId = qs("#selEntregador")?.value || null;
      enviarColetaUnica(novoItem, entId);

    if (inputCodigo) inputCodigo.value = "";
    renderTabela();

    setTimeout(() => (scanLocked = false), 180);
  }

  /* ============================================================
      SISTEMA DE INATIVIDADE — Reset automático da base
     ============================================================ */
  const TEMPO_INATIVIDADE_MS = 3 * 60 * 1000; // 3 minutos
  let inatividadeTimer = null;

  function reiniciarInatividade() {
    if (inatividadeTimer) clearTimeout(inatividadeTimer);

    inatividadeTimer = setTimeout(() => {
      const sel = qs("#selBase");
      if (!sel) return;

      if (sel.value !== "") {
        sel.value = "";
        BASE_ATUAL = null;
        STORAGE_KEY = null;

        toast("Selecione a base novamente (inatividade).", false);
        console.warn("⏳ Base resetada por inatividade");
      }
    }, TEMPO_INATIVIDADE_MS);
  }

  // 🔄 Atividade geral reinicia o timer
  document.addEventListener("click", reiniciarInatividade);
  document.addEventListener("keydown", reiniciarInatividade);

  // 🔄 Reinicia timer ao trocar a base
  const selBaseEl = qs("#selBase");
  if (selBaseEl) {
    selBaseEl.addEventListener("change", reiniciarInatividade);
  }

  // 🔄 Reinicia timer no registrar manual
  const OLD_registrarCodigo = registrarCodigo;
  registrarCodigo = function () {
    reiniciarInatividade();
    return OLD_registrarCodigo();
  };

  // 🔥 Integração REAL com scanner (processarCodigo dentro da IIFE)
  const originalProcessarCodigo = processarCodigo;
  processarCodigo = function (text) {
    reiniciarInatividade();
    return originalProcessarCodigo(text);
  };

  // ---------- Botão abrir câmera ----------
  const newBtn = btnScan.cloneNode(true);
  btnScan.parentNode.replaceChild(newBtn, btnScan);
  newBtn.addEventListener("click", (ev) => {
    ev.preventDefault();
    startScanner();
  });

  // ---------- Botão voltar fecha overlay ----------
  const back = document.getElementById("scanFSBack");
  back?.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    stopScanner();
  });

  window.addEventListener("beforeunload", stopScanner);
})();