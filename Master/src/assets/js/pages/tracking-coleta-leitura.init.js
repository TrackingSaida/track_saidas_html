/* =================== Config =================== */
(function checkIgnorarColeta() {
  const modoColeta = window.__USER__?.modo_operacao || window.MODO_OPERACAO || "codigo";
  if (window.IGNORAR_COLETA === true || localStorage.getItem("ignorar_coleta") === "1" || !["codigo", "ambos"].includes(modoColeta)) {
    window.location.replace("dashboard-saidas.html");
    return;
  }
  document.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => {
      if (window.IGNORAR_COLETA === true) {
        window.location.replace("dashboard-saidas.html");
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
const API_SITUACAO = () => `${getBaseUrl()}/coletas/operacionais/situacao`;
const API_RESUMO_BASE = (baseId) => `${getBaseUrl()}/coletas/operacionais/bases/${encodeURIComponent(baseId)}/resumo`;
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
/** Totais do dia vindos do servidor (ex.: base já coletada). */
let TOTAIS_BASE_DIA = null;
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
    const entidade = typeof window.ownerTerm === "function" ? window.ownerTerm("bases_lower") : "bases";
    const msg = r.status === 401 ? `Faça login para carregar ${entidade}.` : (r.status === 403 ? `Sem permissão para listar ${entidade}.` : `Falha ao carregar ${entidade} (${r.status}).`);
    throw new Error(msg);
  }
  const data = await r.json();
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

function hojeOperacaoLocal() {
  const s = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const [dd, mm, yyyy] = s.split("/");
  return `${yyyy}-${mm}-${dd}`;
}

function statusColetaNormalizado(status) {
  return status === "sem_volume" ? "coletado" : (status || "pendente");
}

async function carregarSituacaoColetas(dataOperacao) {
  const url = API_SITUACAO();
  if (!url || url.includes("undefined")) {
    throw new Error("URL da API não configurada. Verifique TRACK_API_URL.");
  }
  const r = await fetch(`${url}?data_operacao=${encodeURIComponent(dataOperacao)}`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!r.ok) {
    throw new Error(`Falha ao carregar situação das coletas (${r.status}).`);
  }
  return r.json();
}

function nomeBaseItem(b) {
  return (b && b.base != null ? b.base : b).toString().trim();
}

function escAttr(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Agrupa por status: pendentes → em coleta → coletadas; A–Z em cada grupo. */
function basesParaSeletorColeta(bases, situacaoItens) {
  const porId = {};
  const porNome = {};
  (Array.isArray(situacaoItens) ? situacaoItens : []).forEach((item) => {
    if (item && item.base_id != null) porId[item.base_id] = item;
    if (item && item.base) porNome[String(item.base)] = item;
  });
  const rank = (status) => (status === "pendente" ? 0 : status === "em_coleta" ? 1 : 2);

  return (Array.isArray(bases) ? bases : [])
    .map((b) => {
      const nome = nomeBaseItem(b);
      const id = b && b.id_base != null ? Number(b.id_base) : null;
      const situacao = (id != null && porId[id]) || porNome[nome] || null;
      const statusSeletor = statusColetaNormalizado(situacao ? situacao.status : "pendente");
      const idBase = id != null && !Number.isNaN(id) ? id : (situacao && situacao.base_id != null ? Number(situacao.base_id) : null);
      return {
        raw: b,
        nome,
        id_base: idBase,
        statusSeletor,
        totais: situacao
          ? {
              total: Number(situacao.total) || 0,
              shopee: Number(situacao.shopee) || 0,
              mercado_livre: Number(situacao.mercado_livre) || 0,
              avulso: Number(situacao.avulso) || 0,
            }
          : null,
      };
    })
    .filter((item) => item.nome.length > 0)
    .sort((a, b) => {
      const byStatus = rank(a.statusSeletor) - rank(b.statusSeletor);
      if (byStatus !== 0) return byStatus;
      return a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" });
    });
}

const BASE_PICKER_STATE = {
  list: [],
  comGrupos: false,
  open: false,
  expanded: {
    pendente: true,
    em_coleta: true,
    coletado: false,
  },
};

function labelGrupoSeletor(status) {
  if (status === "em_coleta") return "Em coleta";
  if (status === "coletado") return "Coletadas";
  return "Pendentes";
}

function classeBadgeGrupoSeletor(status) {
  if (status === "em_coleta") return "badge-coleta-em-coleta";
  if (status === "coletado") return "badge-coleta-coletada";
  return "badge-coleta-pendente";
}

function syncSelectOptionsFromList(sel, list, placeholder) {
  const current = sel.value || "";
  sel.innerHTML =
    `<option value="" disabled>${escAttr(placeholder || "Selecione...")}</option>` +
    list.map((item) => `<option value="${escAttr(item.nome)}">${escAttr(item.nome)}</option>`).join("");
  if (current && list.some((item) => item.nome === current)) {
    sel.value = current;
  } else {
    sel.selectedIndex = 0;
  }
}

function atualizarLabelPickerBase(sel) {
  const label = qs("#basePickerToggleLabel");
  if (!label) return;
  const valor = (sel && sel.value) || "";
  label.textContent = valor || "Selecione...";
}

function setBasePickerOpen(open) {
  const panel = qs("#basePickerPanel");
  const toggle = qs("#basePickerToggle");
  if (!panel || !toggle) return;
  BASE_PICKER_STATE.open = Boolean(open);
  panel.classList.toggle("d-none", !BASE_PICKER_STATE.open);
  panel.hidden = !BASE_PICKER_STATE.open;
  toggle.setAttribute("aria-expanded", BASE_PICKER_STATE.open ? "true" : "false");
}

function renderBasePickerPanel(sel) {
  const panel = qs("#basePickerPanel");
  if (!panel) return;

  const list = BASE_PICKER_STATE.list || [];
  const selected = (sel && sel.value) || "";

  if (!list.length) {
    panel.innerHTML = '<div class="base-picker-empty">Nenhuma base disponível.</div>';
    return;
  }

  if (!BASE_PICKER_STATE.comGrupos) {
    panel.innerHTML = list
      .map((item) => {
        const active = item.nome === selected ? " is-selected" : "";
        return `<button type="button" class="base-picker-item${active}" data-base-nome="${escAttr(item.nome)}" role="option" aria-selected="${item.nome === selected ? "true" : "false"}">${escAttr(item.nome)}</button>`;
      })
      .join("");
    return;
  }

  const groups = [
    { status: "pendente", items: list.filter((i) => i.statusSeletor === "pendente") },
    { status: "em_coleta", items: list.filter((i) => i.statusSeletor === "em_coleta") },
    { status: "coletado", items: list.filter((i) => i.statusSeletor === "coletado") },
  ].filter((g) => g.items.length > 0);

  panel.innerHTML = groups
    .map((group) => {
      const expanded = Boolean(BASE_PICKER_STATE.expanded[group.status]);
      const chevron = expanded ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line";
      const label = labelGrupoSeletor(group.status);
      const badgeClass = classeBadgeGrupoSeletor(group.status);
      const body = expanded
        ? `<div class="base-picker-group-body">${group.items
            .map((item) => {
              const active = item.nome === selected ? " is-selected" : "";
              const meta =
                item.statusSeletor === "em_coleta"
                  ? '<span class="base-picker-item-meta">Em coleta</span>'
                  : item.statusSeletor === "coletado"
                    ? '<span class="base-picker-item-meta">Coletada</span>'
                    : "";
              return `<button type="button" class="base-picker-item${active}" data-base-nome="${escAttr(item.nome)}" role="option" aria-selected="${item.nome === selected ? "true" : "false"}"><span>${escAttr(item.nome)}</span>${meta}</button>`;
            })
            .join("")}</div>`
        : "";
      return `<div class="base-picker-group" data-group-status="${group.status}">
        <button type="button" class="base-picker-group-toggle" data-group-toggle="${group.status}" aria-expanded="${expanded ? "true" : "false"}">
          <span class="base-picker-group-heading">
            <span class="badge-coleta-status ${badgeClass}">${escAttr(label)}</span>
            <span class="base-picker-group-count">${group.items.length}</span>
          </span>
          <i class="${chevron}" aria-hidden="true"></i>
        </button>
        ${body}
      </div>`;
    })
    .join("");
}

function selecionarBaseNoPicker(sel, nome) {
  if (!sel || !nome) return;
  if (sel.value === nome) {
    setBasePickerOpen(false);
    return;
  }
  sel.value = nome;
  sel.dispatchEvent(new Event("change", { bubbles: true }));
  atualizarLabelPickerBase(sel);
  setBasePickerOpen(false);
  renderBasePickerPanel(sel);
}

function montarSeletorBases(sel, list, { comGrupos, placeholder }) {
  BASE_PICKER_STATE.list = Array.isArray(list) ? list : [];
  BASE_PICKER_STATE.comGrupos = Boolean(comGrupos);
  BASE_PICKER_STATE.expanded = {
    pendente: true,
    em_coleta: true,
    coletado: false,
  };
  syncSelectOptionsFromList(sel, BASE_PICKER_STATE.list, placeholder);
  atualizarLabelPickerBase(sel);
  renderBasePickerPanel(sel);
}

function initBasePicker(sel) {
  const root = qs("#basePicker");
  const toggle = qs("#basePickerToggle");
  const panel = qs("#basePickerPanel");
  if (!root || !toggle || !panel || !sel) return;

  toggle.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    setBasePickerOpen(!BASE_PICKER_STATE.open);
  });

  panel.addEventListener("click", (e) => {
    const groupBtn = e.target.closest("[data-group-toggle]");
    if (groupBtn) {
      e.preventDefault();
      e.stopPropagation();
      const status = groupBtn.getAttribute("data-group-toggle");
      if (!status) return;
      BASE_PICKER_STATE.expanded[status] = !BASE_PICKER_STATE.expanded[status];
      renderBasePickerPanel(sel);
      return;
    }
    const itemBtn = e.target.closest("[data-base-nome]");
    if (itemBtn) {
      e.preventDefault();
      e.stopPropagation();
      selecionarBaseNoPicker(sel, itemBtn.getAttribute("data-base-nome"));
    }
  });

  document.addEventListener("click", (e) => {
    if (!BASE_PICKER_STATE.open) return;
    if (root.contains(e.target)) return;
    setBasePickerOpen(false);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && BASE_PICKER_STATE.open) setBasePickerOpen(false);
  });

  sel.addEventListener("change", () => {
    atualizarLabelPickerBase(sel);
    renderBasePickerPanel(sel);
  });
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
      if (i.is_grande) o.is_grande = true;
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
    if (item.is_grande) it.is_grande = true;
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
      const data = await r.json().catch(() => ({}));
      if (data.saidas_criadas && data.saidas_criadas[0])
        item.id_saida = data.saidas_criadas[0].id_saida;
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

const DDD_VALIDOS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19,
  21, 22, 24, 27, 28,
  31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55,
  61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79,
  81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

function normalizeShopeeCodigo(raw, allDigits) {
  const text = toAsciiDigits(String(raw || "")).toUpperCase().trim();
  if (isCodigoShopee(text)) return text;
  const sh = text.match(/(?:^|[^A-Z0-9])(BR(?:\d{13}|\d{12}[A-Z]))(?=$|[^A-Z0-9])/i);
  if (sh) return sh[1].toUpperCase();
  const digits = String(allDigits || text.replace(/\D+/g, ""));
  if ((digits.length === 12 || digits.length === 13) && /^\d+$/.test(digits)) {
    const candidate = "BR" + digits;
    if (isCodigoShopee(candidate)) return candidate;
  }
  return null;
}

function isAvulsoGerado(raw) {
  return /^AVULSO(-[A-Z0-9-]+)?$/i.test(toAsciiDigits(String(raw || "")).toUpperCase().trim());
}

function isTelefoneBrasil(raw, allDigits) {
  let digits = String(allDigits != null ? allDigits : toAsciiDigits(String(raw || "")).replace(/\D+/g, ""));
  if (!digits) return null;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    digits = digits.slice(2);
  }
  if (digits.length !== 10 && digits.length !== 11) return null;
  const ddd = parseInt(digits.slice(0, 2), 10);
  if (!DDD_VALIDOS.has(ddd)) return null;
  if (digits.length === 11) {
    if (digits[2] !== "9") return null;
  } else if (digits[2] === "9") {
    return null;
  }
  return digits;
}

function classifyCodigoText(codigoRaw) {
  const raw = toAsciiDigits(String(codigoRaw || "")).toUpperCase().trim();
  const allDigits = raw.replace(/\D+/g, "");
  const shopee = normalizeShopeeCodigo(raw, allDigits);
  if (shopee) return { ok: true, servico: "Shopee", codigo: shopee };
  const mlRun = allDigits.match(/4[5-9]\d{9,}/);
  if (mlRun) return { ok: true, servico: "Mercado Livre", codigo: mlRun[0].slice(0, 11) };
  if (isAvulsoGerado(raw)) return { ok: true, servico: "Avulso", codigo: raw.trim().toUpperCase() };
  const phone = isTelefoneBrasil(raw, allDigits);
  if (phone) return { ok: true, servico: "Avulso", codigo: phone };
  return { ok: false, motivo: "Padrão não configurado" };
}

function classifyCodigo(rawInput){
  const rawInputStr = String(rawInput || "").trim();
  const raw = toAsciiDigits(rawInputStr).toUpperCase().trim();
  const allDigits = raw.replace(/\D+/g, "");

  try {
    if (rawInputStr.startsWith("{") && rawInputStr.trim().endsWith("}")) {
      const obj = JSON.parse(rawInputStr);
      if (typeof obj.id === "string" && (obj.sender_id != null || obj.hash_code != null)) {
        const codigo = String(obj.id).trim();
        return { ok:true, servico:"Mercado Livre", codigo, qr_payload_raw: rawInputStr };
      }
    }
  } catch(_) {}

  try {
    if (raw.startsWith("{") && raw.endsWith("}")) {
      const obj = JSON.parse(raw);
      if (typeof obj.external_order_id === "string") {
        return classifyCodigoText(obj.external_order_id);
      }
    }
  } catch(_) {}

  const extMatch = raw.match(/external_order_id["']?\s*[:=]\s*["']?([\w-]+)/i);
  if (extMatch) {
    return classifyCodigoText(extMatch[1]);
  }

  if (/^\d{44}$/.test(allDigits)) {
    return { ok:false, motivo:"NF-e (44 dígitos)" };
  }

  const shopee = normalizeShopeeCodigo(raw, allDigits);
  if (shopee) {
    return { ok:true, servico:"Shopee", codigo: shopee };
  }

  const mlRun = allDigits.match(/4[5-9]\d{9,}/);
  if (mlRun) {
    return { ok:true, servico:"Mercado Livre", codigo: mlRun[0].slice(0, 11), qr_payload_raw: rawInputStr };
  }

  if (isAvulsoGerado(raw)) {
    return { ok:true, servico:"Avulso", codigo: raw.trim().toUpperCase() };
  }

  const phone = isTelefoneBrasil(raw, allDigits);
  if (phone) {
    return { ok:true, servico:"Avulso", codigo: phone };
  }

  return { ok:false, motivo:"Padrão não configurado" };
}

/* =============== Atualiza Resumo ============= */
function contarTotaisLocais() {
  const shopee = COLETAS.filter(c => c.servico === "Shopee" && !(c.status || "").toLowerCase().includes("duplicado")).length;
  const ml = COLETAS.filter(c => (c.servico === "Mercado Livre" || c.servico === "ML") && !(c.status || "").toLowerCase().includes("duplicado")).length;
  const avulso = COLETAS.filter(c => c.servico === "Avulso" && !(c.status || "").toLowerCase().includes("duplicado")).length;
  const total = COLETAS.filter(c => !(c.status || "").toLowerCase().includes("duplicado")).length;
  return { shopee, mercado_livre: ml, avulso, total };
}

function aplicarTotaisNaTela(totais) {
  const t = totais || { shopee: 0, mercado_livre: 0, avulso: 0, total: 0 };
  qs("#sum-shopee").textContent = Number(t.shopee) || 0;
  qs("#sum-ml").textContent = Number(t.mercado_livre) || 0;
  qs("#sum-avulso").textContent = Number(t.avulso) || 0;
  qs("#sum-total").textContent = Number(t.total) || 0;
  atualizarVistaMonitor(t);
}

function setResumoTitulo(texto, detalhe) {
  const titulo = document.querySelector("#modo-padrao .card-header h5");
  const meta = document.querySelector("#modo-padrao .card-header small");
  if (titulo) titulo.textContent = texto || "Resumo das Leituras Atuais";
  if (meta) {
    meta.innerHTML = detalhe || 'Exibindo até <strong>150</strong> itens';
  }
}

function itemSeletorPorNome(nome) {
  const alvo = String(nome || "").trim();
  if (!alvo) return null;
  return (BASE_PICKER_STATE.list || []).find((item) => item.nome === alvo) || null;
}

async function carregarResumoBaseDia(baseId) {
  const url = API_RESUMO_BASE(baseId);
  if (!url || url.includes("undefined")) {
    throw new Error("URL da API não configurada. Verifique TRACK_API_URL.");
  }
  const r = await fetch(`${url}?data_operacao=${encodeURIComponent(hojeOperacaoLocal())}`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!r.ok) {
    throw new Error(`Falha ao carregar resumo da base (${r.status}).`);
  }
  const data = await r.json();
  return {
    total: Number(data.total) || 0,
    shopee: Number(data.shopee) || 0,
    mercado_livre: Number(data.mercado_livre) || 0,
    avulso: Number(data.avulso) || 0,
    status: statusColetaNormalizado(data.status),
  };
}

async function atualizarResumoBaseSelecionada(nomeBase) {
  const item = itemSeletorPorNome(nomeBase);
  const status = item ? item.statusSeletor : "pendente";

  if (status === "coletado") {
    setResumoTitulo("Resumo do dia", "Quantidades já registradas nesta coleta");
    if (item && item.totais) {
      TOTAIS_BASE_DIA = item.totais;
      aplicarTotaisNaTela(TOTAIS_BASE_DIA);
    }
    if (item && item.id_base) {
      try {
        const resumo = await carregarResumoBaseDia(item.id_base);
        TOTAIS_BASE_DIA = {
          total: resumo.total,
          shopee: resumo.shopee,
          mercado_livre: resumo.mercado_livre,
          avulso: resumo.avulso,
        };
        aplicarTotaisNaTela(TOTAIS_BASE_DIA);
      } catch (err) {
        console.warn("Não foi possível atualizar o resumo da base coletada.", err);
        if (!TOTAIS_BASE_DIA) atualizarResumo();
      }
    } else if (!TOTAIS_BASE_DIA) {
      atualizarResumo();
    }
    return;
  }

  TOTAIS_BASE_DIA = null;
  setResumoTitulo("Resumo das Leituras Atuais", 'Exibindo até <strong>150</strong> itens');
  atualizarResumo();
}

function atualizarResumo() {
  if (TOTAIS_BASE_DIA) {
    aplicarTotaisNaTela(TOTAIS_BASE_DIA);
    return;
  }
  aplicarTotaisNaTela(contarTotaisLocais());
}

/* =============== Vista Modo Monitor ============= */
function atualizarVistaMonitor(totaisOverride) {
  const totais = totaisOverride || contarTotaisLocais();
  const shopee = Number(totais.shopee) || 0;
  const ml = Number(totais.mercado_livre) || 0;
  const avulso = Number(totais.avulso) || 0;
  const total = Number(totais.total) || 0;

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
const canEditG = () => window.__USER__ && [0, 1, 2].includes(Number(window.__USER__.role));

function renderTabela() {
  const tbody = qs("#tbody-coletas");
  if (!tbody) return;
  tbody.innerHTML = "";

  const canG = canEditG();
  COLETAS.slice(-150).forEach((item, i) => {
    const isGrande = !!item.is_grande;
    let gCell = "—";
    if (item.id_saida) {
      if (canG)
        gCell = `<button type="button" class="btn btn-sm ${isGrande ? "btn-warning" : "btn-outline-secondary"}" data-toggle-g="${item.id_saida}" data-codigo="${String(item.codigo).replace(/"/g, "&quot;")}" data-g="${isGrande ? "1" : "0"}" title="${isGrande ? "Pacote G — clique para desmarcar" : "Marcar como G (Grande)"}">${isGrande ? "<strong>G</strong>" : "—"}</button>`;
      else
        gCell = isGrande ? '<span class="badge bg-warning text-dark" title="Pacote G (Grande)">G</span>' : "—";
    } else if (canG) {
      gCell = `<label class="mb-0"><input type="checkbox" class="form-check-input fech-check-g-pendente" data-codigo="${String(item.codigo).replace(/"/g, "&quot;")}" ${isGrande ? "checked" : ""} title="Marcar como G antes de enviar"> G</label>`;
    }
    const row = document.createElement("tr");
    if (isGrande) row.classList.add("registro-g-grande");
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
      <td>${gCell}</td>
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

  if (!baseSel) return toast(typeof window.ownerTerm === "function" ? window.ownerTerm("selecione_base_antes_registrar") : "Selecione a base antes de registrar.", false);
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
  qr_payload_raw: parsed.qr_payload_raw || undefined,
  is_grande: false
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
  if (!BASE_ATUAL) return toast(typeof window.ownerTerm === "function" ? window.ownerTerm("selecione_base_antes_reenviar") : "Selecione uma base antes de reenviar.", false);

  const pendentes = COLETAS.filter(c => ["pendente", "erro"].includes(c.status));
  if (!pendentes.length)
    return toast("Nenhum item pendente para reenviar.", false);

  toast(`Reenviando ${pendentes.length} pendentes...`);
  Sound.play("warn");

  try {
    const entId = qs("#selEntregador")?.value || null;
    const r = await enviarColetasLote(BASE_ATUAL, pendentes, entId);
    if (r.status === 201) {
      const data = await r.json().catch(() => ({}));
      // marca todos os pendentes como enviados e associa id_saida
      COLETAS.forEach(c => {
        if (["pendente", "erro"].includes(c.status)) c.status = "enviado";
      });
      (data.saidas_criadas || []).forEach(sc => {
        const c = COLETAS.find(x => x.codigo === sc.codigo);
        if (c) c.id_saida = sc.id_saida;
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

  initBasePicker(sel);

  try {
    const basesPromise = carregarBases();
    const situacaoPromise = carregarSituacaoColetas(hojeOperacaoLocal()).catch((err) => {
      console.warn("Situação de coletas indisponível; usando lista completa de bases.", err);
      return null;
    });
    const [bases, situacaoPayload] = await Promise.all([basesPromise, situacaoPromise]);
    const basesRaw = Array.isArray(bases) ? bases : [];

    let list;
    let comGrupos = false;
    if (situacaoPayload && Array.isArray(situacaoPayload.itens)) {
      list = basesParaSeletorColeta(basesRaw, situacaoPayload.itens);
      comGrupos = true;
    } else {
      if (situacaoPayload === null) {
        toast("Não foi possível agrupar por status. Mostrando todas as bases ativas.", false);
      }
      list = basesRaw
        .map((b) => ({
          raw: b,
          nome: nomeBaseItem(b),
          id_base: b && b.id_base != null ? Number(b.id_base) : null,
          statusSeletor: "pendente",
          totais: null,
        }))
        .filter((item) => item.nome.length > 0)
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));
    }

    montarSeletorBases(sel, list, { comGrupos, placeholder: "Selecione..." });

    if (basesRaw.length === 0) {
      toast(typeof window.ownerTerm === "function" ? window.ownerTerm("nenhuma_base_ativa") : "Nenhuma base ativa cadastrada. Cadastre uma base para registrar coletas.", false);
    }
  } catch (err) {
    const msg = err && err.message ? err.message : (typeof window.ownerTerm === "function" ? window.ownerTerm("falha_carregar_bases") : "Falha ao carregar bases.");
    toast(msg, false);
    montarSeletorBases(sel, [], { comGrupos: false, placeholder: "Selecione..." });
  }

  try {
    const entregadores = await carregarEntregadores();
    const selEnt = qs("#selEntregador");
    if (selEnt && Array.isArray(entregadores)) {
      const ordenados = [...entregadores].sort((a, b) => {
        const naRaw = (a.nome || a.name || String(a.id_entregador ?? a.id)).trim() || String(a.id_entregador ?? a.id);
        const nbRaw = (b.nome || b.name || String(b.id_entregador ?? b.id)).trim() || String(b.id_entregador ?? b.id);
        const na = (typeof window.formatPersonName === "function") ? window.formatPersonName(naRaw) : naRaw;
        const nb = (typeof window.formatPersonName === "function") ? window.formatPersonName(nbRaw) : nbRaw;
        return (typeof window.comparePersonNames === "function")
          ? window.comparePersonNames(na, nb)
          : na.localeCompare(nb, "pt-BR");
      });
      selEnt.innerHTML =
        '<option value="">Usuário logado</option>' +
        ordenados.map(e => {
          const id = e.id_entregador ?? e.id;
          const nomeRaw = (e.nome || e.name || String(id)).trim() || String(id);
          const nome = (typeof window.formatPersonName === "function") ? window.formatPersonName(nomeRaw) : nomeRaw;
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
    sel.addEventListener("change", async e => {
      BASE_ATUAL = e.target.value;
      STORAGE_KEY = `coletasPendentes_${BASE_ATUAL}`;
      TOTAIS_BASE_DIA = null;

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
      await atualizarResumoBaseSelecionada(BASE_ATUAL);
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

  qs("#tbody-coletas")?.addEventListener("click", async e => {
    const checkG = e.target.closest(".fech-check-g-pendente");
    if (checkG && checkG.type === "checkbox") {
      const cod = checkG.getAttribute("data-codigo");
      const item = COLETAS.find(c => c.codigo === cod);
      if (item) {
        item.is_grande = checkG.checked;
        renderTabela();
      }
      return;
    }
    const btnToggleG = e.target.closest("[data-toggle-g]");
    if (btnToggleG) {
      const idSaida = btnToggleG.getAttribute("data-toggle-g");
      const current = btnToggleG.getAttribute("data-g") === "1";
      if (!idSaida || !canEditG()) return;
      btnToggleG.disabled = true;
      try {
        const baseUrl = getBaseUrl();
        const r = await fetch(baseUrl + "/saidas/" + idSaida, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_grande: !current })
        });
        if (r.ok) {
          const item = COLETAS.find(c => c.id_saida == idSaida);
          if (item) item.is_grande = !current;
          renderTabela();
        } else {
          const err = await r.json().catch(() => ({}));
          toast(err?.detail || "Erro ao atualizar G.", false);
        }
      } catch (err) {
        toast("Erro de rede.", false);
      } finally {
        btnToggleG.disabled = false;
      }
      return;
    }
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
      showMsg("alerta", typeof window.ownerTerm === "function" ? window.ownerTerm("selecione_a_base_toast") : "Selecione a base");
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
        TOTAIS_BASE_DIA = null;
        setResumoTitulo("Resumo das Leituras Atuais", 'Exibindo até <strong>150</strong> itens');
        atualizarResumo();
        atualizarLabelPickerBase(sel);
        renderBasePickerPanel(sel);
        setBasePickerOpen(false);

        toast(typeof window.ownerTerm === "function" ? window.ownerTerm("selecione_base_inatividade") : "Selecione a base novamente (inatividade).", false);
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
