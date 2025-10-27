/* =================== Config =================== */
const API_URL = `${window.TRACK_API_URL}/coletas/lote`;
const API_BASES = `${window.TRACK_API_URL}/base`;
const STORAGE_KEY = "coletasPendentes";

/* =============== Helpers / UI ================= */
const qs  = (s) => document.querySelector(s);
const qsa = (s) => Array.from(document.querySelectorAll(s));


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

/* =============== Estado ============= */
let COLETAS = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
let BASE_ATUAL = null;

/* =============== API ================= */
async function carregarBases() {
  const r = await fetch(API_BASES, { credentials: "include" });
  if (!r.ok) throw new Error("Falha ao carregar bases");
  return r.json();
}

async function enviarColetasLote(base, itens) {
  const body = JSON.stringify({ base, itens: itens.map(i => ({ codigo: i.codigo, servico: i.servico })) });
  const r = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body
  });
  return r;
}

/* =================== Normalização / Classificação =================== */
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

/* =============== Atualiza Resumo ============= */
function atualizarResumo() {
  const shopee = COLETAS.filter(c => c.servico === "Shopee").length;
  const ml = COLETAS.filter(c => c.servico === "Mercado Livre" || c.servico === "ML").length;
  const avulso = COLETAS.filter(c => c.servico === "Avulso").length;
  const total = COLETAS.length;

  qs("#sum-shopee").textContent = shopee;
  qs("#sum-ml").textContent = ml;
  qs("#sum-avulso").textContent = avulso;
  qs("#sum-total").textContent = total;
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
          : '<span class="badge bg-secondary">Pendente</span>'
        }
      </td>
      <td><button class="btn btn-sm btn-link text-danger" data-remove="${item.codigo}"><i class="ri-delete-bin-line"></i></button></td>
    `;
    tbody.appendChild(row);
  });

  localStorage.setItem(STORAGE_KEY, JSON.stringify(COLETAS));
  atualizarResumo();
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
    Sound.play('error');
    return;
  }

  const codigo = parsed.codigo;
  const servico = parsed.servico;

  if (COLETAS.some(c => c.codigo === codigo)) {
    COLETAS.push({ base: baseSel, codigo, servico, status: "duplicado", tentativas: 0 });
    toast("Código duplicado.", false);
    Sound.play("warn");
  } else {
    COLETAS.push({ base: baseSel, codigo, servico, status: "pendente", tentativas: 0 });
    toast("Código registrado.");
    Sound.play("ok");
  }

 
  qs("#codigo").value = "";
  qs("#codigo")?.focus();
  renderTabela();
}

async function enviarLote() {
  if (!BASE_ATUAL) return toast("Selecione uma base antes de enviar.", false);
  const pendentes = COLETAS.filter(c => ["pendente", "erro"].includes(c.status));
  if (!pendentes.length) return toast("Nenhuma coleta pendente ou com erro para enviar.", false);

  toast(`Tentando enviar ${pendentes.length} coletas da base ${BASE_ATUAL}...`);

  try {
    pendentes.forEach(c => c.status = "reenviando");
    renderTabela();

    const r = await enviarColetasLote(BASE_ATUAL, pendentes);
    if (r.status === 201) {
      COLETAS = COLETAS.map(c => ({ ...c, status: "enviado", tentativas: c.tentativas || 0 }));
      toast("Coleta realizada com sucesso!");
      Sound.play("ok");
    } else {
      throw new Error(`Erro: ${r.status}`);
    }
  } catch (err) {
    console.error(err);
    COLETAS.forEach(c => {
      if (["pendente", "reenviando", "erro"].includes(c.status)) {
        c.tentativas = (c.tentativas || 0) + 1;
        c.status = "erro";
        if (c.tentativas >= 3) {
          toast("Entre em contato com o responsável do sistema.", false);
        }
      }
    });
    toast("Falha ao enviar. Tente novamente.", false);
    Sound.play('error');
  } finally {
    renderTabela();
  }
}

/* =================== Init =================== */
document.addEventListener("DOMContentLoaded", async () => {
  try {
    const bases = await carregarBases();
    const sel = qs("#selBase");
    sel.innerHTML = '<option value="" disabled selected>Selecione...</option>' + 
      bases.map(b => `<option value="${b.base}">${b.base}</option>`).join("");
    sel.addEventListener("change", e => BASE_ATUAL = e.target.value);
  } catch {
    toast("Falha ao carregar bases.", false);
  }

  qs("#btnRegistrar")?.addEventListener("click", registrarCodigo);
  qs("#codigo")?.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {e.preventDefault();
      registrarCodigo();
    }
  });
  qs("#btnIrParaLote")?.addEventListener("click", enviarLote);
  qs("#tbody-coletas")?.addEventListener("click", e => {
    const btn = e.target.closest("[data-remove]");
    if (!btn) return;
    const cod = btn.dataset.remove;
    COLETAS = COLETAS.filter(c => c.codigo !== cod);
    renderTabela();
  });

  renderTabela();
  atualizarResumo();
});

/* ======= Scanner unificado (com showMsgIcon e contador isolado) ======= */
(function coletaScannerIntegrado(){
  try {
    if (window.__scannerDebug) {
      window.__scannerDebug.openScanner = async () => console.warn('scanner antigo desativado');
      window.__scannerDebug.stopScanner = () => {};
    }
  } catch(e){ console.warn('não foi possível neutralizar __scannerDebug', e); }

  const btn = document.getElementById('btnScan');
  const inputCodigo = document.getElementById('codigo');
  if (!btn) return;

  // garante que o overlay existe
  if (!document.getElementById('scanFS')) {
    console.warn('⚠️ Overlay scanner (scanFS) não encontrado — verifique se scan.html foi incluído antes do fechamento do <body>.');
    return;
  }

  // substitui botão antigo
  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);

  // contador isolado da página
  let totalLidos = 0;

  function atualizarContador() {
    const contadorEl = document.getElementById("scan-packages-count");
    if (!contadorEl) return;
    contadorEl.textContent = `${totalLidos} ${totalLidos === 1 ? "Pacote Lido" : "Pacotes Lidos"}`;
  }

  // leitura e validação
  function handleScanResult(text) {
    const codigo = String(text || "").trim();
    if (!codigo) return;

    if (inputCodigo) inputCodigo.value = codigo;

    const parsed = classifyCodigo(codigo);
    if (!parsed.ok) {
      showMsgIcon("erro", "Código inválido");
      Sound.play("error");
      return;
    }

    const baseSel = qs("#selBase")?.value;
    if (!baseSel) {
      showMsgIcon("alerta", "Selecione a base");
      Sound.play("warn");
      return;
    }

    const duplicado = COLETAS.some(c => c.codigo === parsed.codigo);
    if (duplicado) {
      COLETAS.push({ base: baseSel, codigo: parsed.codigo, servico: parsed.servico, status: "duplicado", tentativas: 0 });
      showMsgIcon("alerta", "Duplicado");
      Sound.play("warn");
    } else {
      COLETAS.push({ base: baseSel, codigo: parsed.codigo, servico: parsed.servico, status: "pendente", tentativas: 0 });
      showMsgIcon("info", "Registrado ✓");
      Sound.play("ok");
      totalLidos++;
      atualizarContador();
    }

    if (inputCodigo) inputCodigo.value = "";
    renderTabela();
  }

  // inicializa scanner
  newBtn.addEventListener("click", (ev) => {
    ev.preventDefault();
    if (!window.Scanner || typeof window.Scanner.open !== "function") {
      toast && toast("Scanner não disponível.", false);
      return;
    }

    // zera contador e atualiza label
    totalLidos = 0;
    atualizarContador();

    window.Scanner.open({
      autoClose: false,
      onScan: handleScanResult
    }).then(() => {
      // muda a dica de texto do overlay
      const hint = document.querySelector('.scan-hint');
      if (hint) hint.textContent = "Escanei o código";
    }).catch((err) => {
      console.error("Scanner.open erro:", err);
      toast && toast("Não foi possível abrir o scanner.", false);
    });
  });

  // limpa contador ao sair da página
  window.addEventListener("beforeunload", () => {
    totalLidos = 0;
    atualizarContador();
    if (window.Scanner) window.Scanner.close();
  });
})();
