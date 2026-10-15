/* ======================================================
   Fechamento de Bases
   GET   /api/coletas/fechamentos/resumo-por-base  (uma linha por base)
   GET   /api/coletas/fechamentos/calcular         (prévia de uma base)
   POST  /api/coletas/fechamentos                  (gerar uma base)
   POST  /api/coletas/fechamentos/lote             (todas as pendentes elegíveis)
   GET   /api/coletas/fechamentos/{id}             (reajuste)
   PATCH /api/coletas/fechamentos/{id}             (salvar reajuste)
   ====================================================== */

document.addEventListener("DOMContentLoaded", async () => {
  "use strict";

  const usuario = typeof window.ensureAuthUser === "function" ? await window.ensureAuthUser() : window.__USER__;
  if (usuario?.ignorar_coleta === true || window.IGNORAR_COLETA === true || localStorage.getItem("ignorar_coleta") === "1") {
    window.location.replace("dashboard-saidas.html");
    return;
  }

  const API_URL = (typeof window.getTrackApiUrl === "function" ? window.getTrackApiUrl() : window.TRACK_API_URL || "").replace(/\/+$/, "");
  const API_FECH = `${API_URL}/coletas/fechamentos`;
  const API_BASES = `${API_URL}/base/?status=ativo`;
  const API_CALENDARIO = `${API_URL}/coletas/operacionais/calendario`;
  const COR_PRIMARIA = "#0B1F3A";

  const qs = (s) => document.querySelector(s);
  const esc = (v) =>
    String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const moeda = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);
  const num = (v) => Number(v) || 0;
  const centavos = (v) => Math.round(num(v) * 100) / 100;
  const termo = (chave, padrao) => (typeof window.ownerTerm === "function" ? window.ownerTerm(chave, padrao) : padrao);
  const TERMO_BASE = termo("base", "Base");
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  const pluralBase = (n) => plural(n, TERMO_BASE.toLowerCase(), `${TERMO_BASE.toLowerCase()}s`);

  function dmy(ymd) {
    if (!ymd) return "—";
    const [y, m, d] = String(ymd).slice(0, 10).split("-");
    return d && m && y ? `${d}/${m}/${y}` : String(ymd);
  }

  function dm(ymd) {
    return dmy(ymd).slice(0, 5);
  }

  function periodoTexto(ini, fim) {
    return ini && fim ? `${dm(ini)} a ${dmy(fim)}` : "—";
  }

  function hojeYmd() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  const periodoAberto = (fim) => !fim || fim >= hojeYmd();

  function mensagemErro(data, status) {
    const d = data && data.detail;
    if (typeof d === "string") return d;
    if (d && typeof d === "object" && !Array.isArray(d) && d.message) return d.message;
    if (Array.isArray(d) && d.length) {
      return d.map((i) => (typeof i === "string" ? i : i && i.msg) || "").filter(Boolean).join(" | ");
    }
    return `Não foi possível concluir (erro ${status}).`;
  }

  const TEMPO_LIMITE_CONSULTA_MS = 90000;

  async function api(url, options) {
    const opts = { credentials: "include", ...(options || {}) };
    const consulta = !opts.method || opts.method.toUpperCase() === "GET";
    if (consulta && !opts.signal && typeof AbortSignal !== "undefined" && AbortSignal.timeout) {
      opts.signal = AbortSignal.timeout(TEMPO_LIMITE_CONSULTA_MS);
    }
    let res;
    try {
      res = await fetch(url, opts);
    } catch (e) {
      if (e && (e.name === "TimeoutError" || e.name === "AbortError")) {
        throw new Error("A consulta demorou mais que o esperado. Tente novamente em instantes.");
      }
      throw new Error("Não foi possível falar com o servidor. Verifique a conexão e tente novamente.");
    }
    if (res.status === 401) {
      window.location.href = "auth-signin-tracking-v2.html";
      throw new Error("Sessão expirada.");
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(res.status === 403 ? "Seu perfil não tem acesso ao financeiro de bases." : mensagemErro(data, res.status));
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  function avisoErro(titulo, err) {
    const texto = (err && err.message) || "Tente novamente.";
    if (window.Swal) Swal.fire({ icon: "error", title: titulo, text: texto, confirmButtonColor: COR_PRIMARIA });
    else alert(titulo + ": " + texto);
  }

  const STATUS_LABEL = { PENDENTE: "Pendente", GERADO: "Gerado", REAJUSTADO: "Reajustado", RECEBIDO: "Recebido" };
  const MOTIVO_LOTE = {
    PACOTES_G: "Tem pacotes grandes de tamanho sem valor de cobrança: revise em Revisar e gerar.",
    DIAS_PENDENTES: "Há dias de coleta sem lançamento.",
    SEM_COLETAS: "Sem coletas no período.",
    JA_GERADO: "Já tem fechamento neste período.",
  };

  const state = {
    items: [],
    totais: {},
    periodoAberto: true,
    filtro: "",
    busca: "",
    expandidos: new Set(),
    gerandoLote: false,
    painel: null,
    fecharConfirmado: false,
  };

  const fltFrom = qs("#flt-from");
  const fltTo = qs("#flt-to");
  const tbody = qs("#tbody-bases");
  const msgEl = qs("#resumoMsg");
  const painelEl = qs("#painelBase");
  const painel = painelEl && typeof bootstrap !== "undefined" ? bootstrap.Offcanvas.getOrCreateInstance(painelEl) : null;

  function periodo() {
    return { ini: fltFrom?.value || "", fim: fltTo?.value || "" };
  }

  function updatePeriodLabel(from, to) {
    const label = qs("#coletas-resumo-period-label");
    if (label) label.textContent = from && to ? `${dmy(from)} — ${dmy(to)}` : "Período";
  }

  // ====== Lista por base ======
  function colunas() {
    return document.querySelectorAll("#tbl-bases thead th").length || 8;
  }

  function linhaMensagem(html) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="${colunas()}" class="text-center text-muted py-4">${html}</td></tr>`;
  }

  function grupoDe(r) {
    const st = String(r.situacao || "PENDENTE").toUpperCase();
    if (st === "GERADO" || st === "REAJUSTADO") return "A_RECEBER";
    return st;
  }

  function itensVisiveis() {
    const busca = state.busca.trim().toLocaleLowerCase("pt-BR");
    return state.items.filter((r) => {
      if (busca && !String(r.base || "").toLocaleLowerCase("pt-BR").includes(busca)) return false;
      if (!state.filtro) return true;
      if (state.filtro === "REVISAO") return !!r.precisa_reajuste;
      return grupoDe(r) === state.filtro;
    });
  }

  function servicosHtml(r) {
    const itens = [
      ["shopee", "Shopee", r.shopee],
      ["ml", "ML", r.mercado_livre],
      ["avulso", "Avulso", r.avulso],
    ].filter(([, , q]) => num(q) > 0);
    if (!itens.length) return "";
    return (
      '<div class="fm-servicos">' +
      itens
        .map(([k, rot, q]) => `<span class="fm-servico fm-servico--${k} fm-num">${rot} ${num(q)}</span>`)
        .join("") +
      "</div>"
    );
  }

  function statusHtml(r) {
    const st = String(r.situacao || "PENDENTE").toUpperCase();
    let html = `<span class="fm-status fm-status--${esc(st.toLowerCase())}">${esc(STATUS_LABEL[st] || st)}</span>`;
    const pend = (r.dias_pendentes || []).length;
    if (st === "PENDENTE" && pend) {
      html += ` <span class="fm-chip fm-chip--aviso" title="Dias de coleta sem lançamento">${esc(plural(pend, "dia pendente", "dias pendentes"))}</span>`;
    } else if (st === "PENDENTE" && r.motivo_bloqueio === "PACOTES_G") {
      html += ' <span class="fm-chip fm-chip--info" title="Há pacotes grandes de tamanho sem valor de cobrança: revise antes de gerar">Revisar pacotes G</span>';
    }
    if (r.precisa_reajuste) html += ' <span class="fm-chip fm-chip--revisao">Precisa revisão</span>';
    if (r.alerta_pos_recebido) html += ' <span class="fm-chip fm-chip--info" title="As coletas mudaram depois do recebimento">Mudou após receber</span>';
    return html;
  }

  function acoesHtml(r) {
    const st = String(r.situacao || "PENDENTE").toUpperCase();
    const id = r.fechamento?.id_fechamento;
    const pdf = id
      ? `<button type="button" class="btn btn-sm btn-link text-secondary px-1" data-acao="pdf" data-id="${esc(id)}" title="Baixar PDF" aria-label="Baixar PDF de ${esc(r.base)}"><i class="ri-file-pdf-line fs-5"></i></button>`
      : "";
    if (st === "PENDENTE") {
      const motivo = state.periodoAberto ? "Período ainda em aberto: escolha um período que termine antes de hoje." : "";
      const btn = `<button type="button" class="btn btn-sm btn-outline-secondary" data-acao="gerar" data-base="${esc(r.base)}"${motivo ? " disabled" : ""}>Revisar e gerar</button>`;
      return motivo ? `<span class="d-inline-block" tabindex="0" title="${esc(motivo)}">${btn}</span>` : btn;
    }
    if (st === "RECEBIDO") return pdf;
    const classe = r.precisa_reajuste ? "btn-fm-primary" : "btn-outline-secondary";
    return `<button type="button" class="btn btn-sm ${classe}" data-acao="reajustar" data-id="${esc(id)}">Reajustar</button>${pdf}`;
  }

  function diasHtml(r) {
    const dias = Array.isArray(r.dias) ? r.dias : [];
    const recebido = String(r.situacao || "").toUpperCase() === "RECEBIDO";
    const pend = r.dias_pendentes || [];
    let html = "";
    if (dias.length) {
      html +=
        '<table class="table table-sm"><thead><tr>' +
        '<th>Dia</th><th class="text-end">Shopee</th><th class="text-end">Mercado Livre</th><th class="text-end">Avulso</th>' +
        '<th class="text-end">Pacotes G</th><th class="text-end">Cancelados</th>' +
        "</tr></thead><tbody>" +
        dias
          .map(
            (d) =>
              "<tr>" +
              `<td>${esc(dmy(d.data))}</td>` +
              `<td class="text-end fm-num">${num(d.shopee)}</td>` +
              `<td class="text-end fm-num">${num(d.mercado_livre)}</td>` +
              `<td class="text-end fm-num">${num(d.avulso)}</td>` +
              `<td class="text-end fm-num">${num(d.pacotes_g)}</td>` +
              `<td class="text-end fm-num">${num(d.cancelados)}</td>` +
              "</tr>"
          )
          .join("") +
        "</tbody></table>";
    } else {
      html += '<div class="fm-sub py-1">Sem coletas lançadas neste período.</div>';
    }
    if (pend.length) {
      html += `<div class="fm-sub mt-1">Dias sem lançamento: ${pend.map((d) => esc(dm(d))).join(", ")}</div>`;
    }
    if (recebido) html += '<div class="fm-sub mt-1">Fechamento recebido: as coletas deste período não podem mais ser alteradas.</div>';
    return html;
  }

  function renderTabela() {
    if (!tbody) return;
    if (!state.items.length) {
      linhaMensagem(`Nenhuma ${esc(TERMO_BASE.toLowerCase())} com coletas neste período.`);
      return;
    }
    const items = itensVisiveis();
    if (!items.length) {
      const vazio = {
        PENDENTE: "Nenhuma pendente. Tudo gerado neste período.",
        A_RECEBER: "Nenhum fechamento aguardando recebimento.",
        RECEBIDO: "Nenhum recebimento registrado neste período.",
        REVISAO: "Nenhum fechamento precisa de revisão.",
      };
      linhaMensagem(esc(state.busca ? "Nenhum resultado para a busca." : vazio[state.filtro] || "Nada para mostrar."));
      return;
    }
    tbody.innerHTML = items
      .map((r) => {
        const k = String(r.base);
        const aberto = state.expandidos.has(k);
        const st = String(r.situacao || "PENDENTE").toUpperCase();
        const coletas = num(r.shopee) + num(r.mercado_livre) + num(r.avulso);
        const valor = st === "PENDENTE" ? r.valor_atual : r.fechamento?.valor_final;
        let subValor = "";
        if (r.precisa_reajuste && r.valor_final_recalculado != null) {
          subValor = `<div class="fm-sub fm-num">valor atual ${moeda(r.valor_final_recalculado)}</div>`;
        } else if (st === "PENDENTE" && num(r.valor_g) > 0) {
          subValor = `<div class="fm-sub fm-num">inclui ${moeda(r.valor_g)} de pacotes G</div>`;
        }
        const idDias = `fm-dias-${esc(k.replace(/[^\w-]/g, "_"))}`;
        return (
          `<tr class="${r.precisa_reajuste ? "fm-linha--revisao" : ""}">` +
          `<td><button type="button" class="fm-expandir" data-acao="expandir" data-base="${esc(k)}" aria-expanded="${aberto}" aria-controls="${idDias}" aria-label="Ver dias de ${esc(r.base)}"><i class="ri-arrow-right-s-line fs-5"></i></button></td>` +
          `<td><div class="fw-semibold">${esc(r.base)}</div>${r.cnpj ? `<div class="fm-sub">${esc(r.cnpj)}</div>` : ""}</td>` +
          `<td class="text-end"><div class="fm-num fw-semibold">${coletas}</div>${servicosHtml(r)}</td>` +
          `<td class="text-end fm-num">${num(r.pacotes_g)}</td>` +
          `<td class="text-end fm-num">${num(r.cancelados)}</td>` +
          `<td class="text-end"><div class="fw-semibold fm-num">${moeda(valor)}</div>${subValor}</td>` +
          `<td>${statusHtml(r)}</td>` +
          `<td class="text-end text-nowrap">${acoesHtml(r)}</td>` +
          "</tr>" +
          `<tr class="fm-dias${aberto ? "" : " d-none"}" id="${idDias}"><td colspan="${colunas()}">${diasHtml(r)}</td></tr>`
        );
      })
      .join("");
  }

  function renderCards() {
    const t = state.totais || {};
    const set = (id, txt) => {
      const el = qs(id);
      if (el) el.textContent = txt;
    };
    set("#card-pendentes-valor", moeda(t.PENDENTE?.valor));
    set("#card-pendentes-qtd", pluralBase(num(t.PENDENTE?.qtd)));
    set("#card-areceber-valor", moeda(t.A_RECEBER?.valor));
    set("#card-areceber-qtd", pluralBase(num(t.A_RECEBER?.qtd)));
    set("#card-recebidos-valor", moeda(t.RECEBIDO?.valor));
    set("#card-recebidos-qtd", pluralBase(num(t.RECEBIDO?.qtd)));
    set("#card-revisao-qtd", String(num(t.REVISAO?.qtd)));
    document.querySelectorAll("#fm-cards .fm-card").forEach((c) => {
      c.setAttribute("aria-pressed", String(c.dataset.filtro === state.filtro));
    });
  }

  function elegiveisLote() {
    return state.items.filter((r) => String(r.situacao).toUpperCase() === "PENDENTE" && r.pode_gerar_lote);
  }

  function atualizarBtnGerarTodos() {
    const btn = qs("#btnGerarTodos");
    const wrap = qs("#wrapBtnGerarTodos");
    const label = qs("#btnGerarTodosLabel");
    if (!btn || !wrap) return;
    const n = elegiveisLote().length;
    let motivo = "";
    if (state.periodoAberto) motivo = "Período ainda em aberto: escolha um período que termine antes de hoje.";
    else if (n === 0) motivo = "Nenhuma pendente pode ser gerada de uma vez neste período.";
    if (label) label.textContent = n > 0 ? `Gerar todos os pendentes (${n})` : "Gerar todos os pendentes";
    btn.disabled = !!motivo || state.gerandoLote;
    wrap.title = motivo;
  }

  function renderTudo() {
    renderCards();
    renderTabela();
    atualizarBtnGerarTodos();
  }

  async function carregar() {
    const { ini, fim } = periodo();
    if (!ini || !fim) {
      linhaMensagem("Selecione um período.");
      return;
    }
    if (msgEl) msgEl.innerHTML = "";
    linhaMensagem("Carregando…");
    try {
      const data = await api(`${API_FECH}/resumo-por-base?${new URLSearchParams({ periodo_inicio: ini, periodo_fim: fim })}`);
      state.items = Array.isArray(data.items) ? data.items : [];
      state.totais = data.totais || {};
      state.periodoAberto = !!data.periodo_aberto;
    } catch (err) {
      console.error("Fechamento de Bases — carregar:", err);
      state.items = [];
      state.totais = {};
      renderCards();
      atualizarBtnGerarTodos();
      linhaMensagem(`<span class="text-danger">${esc(err.message || "Não foi possível carregar.")}</span>`);
      return;
    }
    if (msgEl && state.periodoAberto) {
      msgEl.innerHTML = '<div class="fm-sub">O período ainda está em aberto. Você pode conferir as coletas, mas só gera o fechamento depois que o período terminar.</div>';
    }
    renderTudo();
  }

  // ====== Gerar todos os pendentes ======
  function listaHtml(itens) {
    if (!itens.length) return "";
    return (
      '<div class="text-start border rounded mt-2" style="max-height:220px;overflow:auto">' +
      '<table class="table table-sm mb-0"><tbody>' +
      itens
        .map(
          (i) =>
            `<tr><td>${esc(i.nome)}${i.motivo ? `<div class="small text-muted">${esc(i.motivo)}</div>` : ""}</td>` +
            `<td class="text-end fm-num">${i.valor != null ? moeda(i.valor) : ""}</td></tr>`
        )
        .join("") +
      "</tbody></table></div>"
    );
  }

  async function gerarTodosPendentes() {
    if (state.gerandoLote || !window.Swal) return;
    const { ini, fim } = periodo();
    const geraveis = elegiveisLote();
    const deFora = state.items.filter((r) => String(r.situacao).toUpperCase() === "PENDENTE" && !r.pode_gerar_lote);
    if (!geraveis.length) return;
    const total = geraveis.reduce((s, r) => s + num(r.valor_atual), 0);
    const conf = await Swal.fire({
      icon: "question",
      title: `Gerar ${plural(geraveis.length, "fechamento", "fechamentos")}?`,
      html:
        `<p class="mb-1">Período ${esc(periodoTexto(ini, fim))} · total <strong class="fm-num">${moeda(total)}</strong></p>` +
        '<p class="small text-muted mb-0">Os fechamentos saem sem ajustes. Ajustes podem ser feitos depois, em Reajustar.</p>' +
        listaHtml(geraveis.map((r) => ({ nome: r.base, valor: r.valor_atual }))) +
        (deFora.length
          ? `<p class="small text-muted mt-3 mb-0">Ficam de fora (gere individualmente):</p>${listaHtml(deFora.map((r) => ({ nome: r.base, motivo: MOTIVO_LOTE[r.motivo_bloqueio] || "" })))}`
          : ""),
      showCancelButton: true,
      confirmButtonText: `Gerar ${plural(geraveis.length, "fechamento", "fechamentos")}`,
      cancelButtonText: "Cancelar",
      confirmButtonColor: COR_PRIMARIA,
      focusCancel: true,
    });
    if (!conf.isConfirmed) return;

    state.gerandoLote = true;
    atualizarBtnGerarTodos();
    Swal.fire({ title: "Gerando fechamentos…", text: "Isso pode levar alguns segundos.", allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
      const res = await api(`${API_FECH}/lote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodo_inicio: ini, periodo_fim: fim, bases: geraveis.map((r) => r.base) }),
      });
      const criados = res.criados || [];
      const totalGerado = criados.reduce((s, c) => s + num(c.valor_final), 0);
      const naoGerados = [...(res.erros || []), ...(res.ignorados || [])].map((e) => ({ nome: e.base, motivo: MOTIVO_LOTE[e.motivo] || e.motivo }));
      const existentes = res.ja_existentes || [];
      let html = `<p class="mb-1"><strong>${esc(plural(criados.length, "fechamento gerado", "fechamentos gerados"))}</strong> · total <strong class="fm-num">${moeda(totalGerado)}</strong></p>`;
      if (existentes.length) html += `<p class="small text-muted mb-1">${esc(pluralBase(existentes.length))} já tinha(m) fechamento neste período.</p>`;
      if (naoGerados.length) html += `<p class="small text-danger mb-0 mt-2">Não gerados (${naoGerados.length}):</p>${listaHtml(naoGerados)}`;
      await Swal.fire({ icon: naoGerados.length ? "warning" : "success", title: "Geração concluída", html, confirmButtonColor: COR_PRIMARIA });
    } catch (err) {
      Swal.close();
      avisoErro("Não foi possível gerar os fechamentos", err);
    } finally {
      state.gerandoLote = false;
      await carregar();
    }
  }

  // ====== Ajustes gravados (agregados por tipo no backend) ======
  const RE_ROTULO_G = /^\[(Pacotes G|Ajuste G)\]\s*Motivo:\s*(.*?);\s*Valor:\s*R\$\s*([\d.,]+)\s*$/;
  const PREFIXO_ECO_G = "Ajuste Pacotes G - ";

  function decomporAjustes(tipo, valorTotal, motivoTotal) {
    const valor = centavos(valorTotal);
    if (valor <= 0) return { manuais: [], g: null };
    const partes = String(motivoTotal || "").split(" | ").map((p) => p.trim()).filter(Boolean);
    let valorG = null;
    let motivoG = "";
    let ajusteG = false;
    let eco = false;
    const manuais = [];
    partes.forEach((p) => {
      const m = p.match(RE_ROTULO_G);
      if (m) {
        valorG = (valorG || 0) + (parseFloat(m[3].replace(",", ".")) || 0);
        motivoG = m[2].trim();
        ajusteG = m[1] === "Ajuste G";
      } else if (p.startsWith(PREFIXO_ECO_G)) {
        eco = true;
        motivoG = motivoG || p.slice(PREFIXO_ECO_G.length).trim();
      } else {
        manuais.push(p);
      }
    });
    if (valorG !== null && valorG > 0 && valorG <= valor + 0.005) {
      const resto = centavos(valor - valorG);
      return {
        g: { valor: centavos(valorG), motivo: motivoG && motivoG !== "Ajuste Pacotes G" ? motivoG : "", ajuste: ajusteG },
        manuais: resto > 0 ? [{ tipo, valor: resto, motivo: manuais.join(" | ") || "Ajuste anterior sem motivo" }] : [],
      };
    }
    if (tipo === "ADICAO" && eco) {
      return { g: null, legadoG: true, manuais: [{ tipo, valor, motivo: String(motivoTotal || "").trim(), legadoG: true }] };
    }
    return { g: null, manuais: [{ tipo, valor, motivo: String(motivoTotal || "").trim() || "Ajuste anterior sem motivo" }] };
  }

  // ====== Painel (gerar e reajustar) ======
  const CAMPOS_QTDE = ["shopee", "mercado_livre", "avulso", "cancelados_shopee", "cancelados_ml", "cancelados_avulso"];
  const COLETADO_DE = { cancelados_shopee: "shopee", cancelados_ml: "mercado_livre", cancelados_avulso: "avulso" };

  function normalizarItem(it) {
    const out = { data: String(it.data).slice(0, 10) };
    [...CAMPOS_QTDE, "pacotes_g", "g_shopee", "g_ml", "g_avulso"].forEach((c) => {
      out[c] = Math.max(0, parseInt(it[c], 10) || 0);
    });
    out.g_categorias = it.g_categorias && typeof it.g_categorias === "object" ? it.g_categorias : null;
    return out;
  }

  function totaisG(itens) {
    return itens.reduce(
      (acc, it) => ({
        total: acc.total + num(it.pacotes_g),
        s: acc.s + num(it.g_shopee),
        m: acc.m + num(it.g_ml),
        a: acc.a + num(it.g_avulso),
      }),
      { total: 0, s: 0, m: 0, a: 0 }
    );
  }

  function calculo() {
    const p = state.painel;
    const pr = p.precos || {};
    const soma = (campo) => p.itens.reduce((s, it) => s + num(it[campo]), 0);
    const qtd = { shopee: soma("shopee"), ml: soma("mercado_livre"), avulso: soma("avulso") };
    const canc = { shopee: soma("cancelados_shopee"), ml: soma("cancelados_ml"), avulso: soma("cancelados_avulso") };
    const bruto = centavos(qtd.shopee * num(pr.shopee) + qtd.ml * num(pr.ml) + qtd.avulso * num(pr.avulso));
    const cancelados = centavos(canc.shopee * num(pr.shopee) + canc.ml * num(pr.ml) + canc.avulso * num(pr.avulso));
    const g = totaisG(p.itens);
    const gAuto = centavos(num(p.valorGAuto));
    const ajusteG = p.ajusteG ? centavos(p.ajusteG.valor) : 0;
    const valorG = centavos(gAuto + ajusteG);
    const adicoes = p.ajustes.filter((a) => a.tipo === "ADICAO").reduce((s, a) => s + num(a.valor), 0);
    const descontos = p.ajustes.filter((a) => a.tipo !== "ADICAO").reduce((s, a) => s + num(a.valor), 0);
    const total = centavos(bruto - cancelados + valorG + adicoes - descontos);
    return { qtd, canc, bruto, cancelados, g, gAuto, ajusteG, valorG, adicoes: centavos(adicoes), descontos: centavos(descontos), total };
  }

  function errosValidacao(c) {
    const p = state.painel;
    const erros = [];
    if (p.modo === "gerar" && p.pendentes.length) erros.push("Resolva os dias de coleta sem lançamento.");
    if (c.total < 0) erros.push("O total não pode ficar negativo. Revise os descontos.");
    return erros;
  }

  function diasCanceladosAcima() {
    return state.painel.itens
      .filter((it) => Object.entries(COLETADO_DE).some(([cc, col]) => num(it[cc]) > num(it[col])))
      .map((it) => it.data);
  }

  function assinatura() {
    const p = state.painel;
    return JSON.stringify([p.itens, p.ajustes, p.ajusteG]);
  }

  function painelAlterado() {
    const p = state.painel;
    if (!p || !p.pronto) return false;
    const digitando = ["#ajuste-valor", "#ajuste-motivo", "#g-ajuste-valor", "#g-ajuste-motivo"].some((sel) => (qs(sel)?.value || "").trim());
    return assinatura() !== p.assinaturaInicial || !!digitando;
  }

  function linhaComp(rotulo, detalhe, valor, classe) {
    return `<tr class="${classe || ""}"><td>${esc(rotulo)}${detalhe ? ` <span class="fm-detalhe">${esc(detalhe)}</span>` : ""}</td><td class="fm-num">${valor}</td></tr>`;
  }

  function renderComposicao(c) {
    const p = state.painel;
    const pr = p.precos || {};
    let html = "";
    html += linhaComp("Shopee", `${c.qtd.shopee} × ${moeda(pr.shopee)}`, moeda(c.qtd.shopee * num(pr.shopee)));
    html += linhaComp("Mercado Livre", `${c.qtd.ml} × ${moeda(pr.ml)}`, moeda(c.qtd.ml * num(pr.ml)));
    html += linhaComp("Avulso", `${c.qtd.avulso} × ${moeda(pr.avulso)}`, moeda(c.qtd.avulso * num(pr.avulso)));
    const totalCanc = c.canc.shopee + c.canc.ml + c.canc.avulso;
    if (totalCanc > 0) html += linhaComp("Cancelados", plural(totalCanc, "pacote", "pacotes"), `− ${moeda(c.cancelados)}`);
    if (c.g.total > 0) html += linhaComp("Pacotes grandes", plural(c.g.total, "pacote", "pacotes"), `+ ${moeda(c.gAuto)}`);
    if (c.ajusteG) html += linhaComp("Ajuste de pacotes grandes", "", `${c.ajusteG > 0 ? "+" : "−"} ${moeda(Math.abs(c.ajusteG))}`);
    if (c.adicoes > 0) html += linhaComp("Adicionais", "", `+ ${moeda(c.adicoes)}`);
    if (c.descontos > 0) html += linhaComp("Descontos", "", `− ${moeda(c.descontos)}`);
    html += linhaComp("Total", "", moeda(c.total), "fm-linha-total");
    qs("#painel-composicao").innerHTML = html;
  }

  function renderGrade() {
    const p = state.painel;
    const orig = p.itensOriginais;
    const tb = qs("#painel-dias-tbody");
    if (!p.itens.length) {
      tb.innerHTML = '<tr><td colspan="8" class="text-muted text-center py-2">Sem coletas no período.</td></tr>';
      qs("#painel-dias-tfoot").innerHTML = "";
      return;
    }
    let algumaAlterada = false;
    tb.innerHTML = p.itens
      .map((it, i) => {
        const o = orig ? orig[it.data] : null;
        const celulas = CAMPOS_QTDE.map((c) => {
          const alterada = !!orig && num(o ? o[c] : 0) !== num(it[c]);
          if (alterada) algumaAlterada = true;
          const invalida = COLETADO_DE[c] && num(it[c]) > num(it[COLETADO_DE[c]]);
          const titulo = alterada ? ` title="Antes: ${num(o ? o[c] : 0)}"` : "";
          return `<td class="text-end"><input type="number" min="0" step="1" inputmode="numeric" class="form-control form-control-sm${alterada ? " fm-celula-alterada" : ""}${invalida ? " is-invalid" : ""}" data-i="${i}" data-campo="${c}" value="${num(it[c])}" aria-label="${esc(c)} em ${esc(dmy(it.data))}"${titulo}></td>`;
        }).join("");
        return `<tr><td class="text-nowrap">${esc(dm(it.data))}</td>${celulas}<td class="text-end fm-num">${num(it.pacotes_g)}</td></tr>`;
      })
      .join("");
    const soma = (c) => p.itens.reduce((s, it) => s + num(it[c]), 0);
    qs("#painel-dias-tfoot").innerHTML =
      `<tr><td>Total</td>${CAMPOS_QTDE.map((c) => `<td class="text-end fm-num">${soma(c)}</td>`).join("")}<td class="text-end fm-num">${soma("pacotes_g")}</td></tr>`;
    qs("#painel-dias-legenda").classList.toggle("d-none", !algumaAlterada);
  }

  function renderPendencias() {
    const p = state.painel;
    const sec = qs("#painel-pendencias");
    const mostrar = p.modo === "gerar" && p.pendentes.length > 0;
    sec.classList.toggle("d-none", !mostrar);
    if (!mostrar) return;
    qs("#painel-pendencias-lista").innerHTML = p.pendentes
      .map(
        (d) =>
          `<div class="fm-pendencia"><span class="fm-num me-auto">${esc(dmy(d))}</span>` +
          `<button type="button" class="btn btn-sm btn-outline-secondary" data-acao="justificar" data-data="${esc(d)}">Justificar</button></div>`
      )
      .join("");
  }

  function renderAjustes() {
    const p = state.painel;
    const el = qs("#painel-ajustes");
    if (!p.ajustes.length) {
      el.innerHTML = '<div class="fm-painel-sub">Nenhum ajuste.</div>';
      return;
    }
    el.innerHTML = p.ajustes
      .map(
        (a, i) =>
          `<div class="fm-ajuste"><div><div class="fw-semibold fm-num">${a.tipo === "ADICAO" ? "+" : "−"} ${moeda(a.valor)}</div><div class="fm-painel-sub">${esc(a.motivo)}</div></div>` +
          `<button type="button" class="btn btn-sm btn-link text-danger" data-acao="remover-ajuste" data-i="${i}" aria-label="Remover ajuste">Remover</button></div>`
      )
      .join("");
  }

  function renderG(c) {
    const p = state.painel;
    const sec = qs("#painel-g");
    const mostrar = c.g.total > 0 || !!p.ajusteG;
    sec.classList.toggle("d-none", !mostrar);
    if (!mostrar) return;
    qs("#painel-g-info").textContent = `${plural(c.g.total, "pacote grande", "pacotes grandes")} no período. Valor calculado pelas categorias de Preços de Entrega.`;
    qs("#painel-g-categorias").innerHTML = (p.gCategorias || [])
      .map((cat) => {
        const valor = cat.valor == null ? "—" : num(cat.valor) > 0 ? `+ ${moeda(cat.valor)}` : "sem cobrança";
        return linhaComp(cat.nome, plural(num(cat.qtd), "pacote", "pacotes"), valor);
      })
      .join("");
    const semCobranca = (p.gCategorias || []).filter((cat) => num(cat.qtd) > 0 && cat.valor != null && !(num(cat.valor) > 0));
    const avisos = [p.avisoG];
    if (semCobranca.length && !p.ajusteG) {
      avisos.push(
        `${semCobranca.map((cat) => cat.nome).join(", ")} sem valor de cobrança para a ${TERMO_BASE.toLowerCase()}. ` +
          "Configure em Preços de Entrega ou faça um ajuste se houver cobrança."
      );
    }
    const textoAviso = avisos.filter(Boolean).join(" ");
    const aviso = qs("#painel-g-aviso");
    aviso.textContent = textoAviso;
    aviso.classList.toggle("d-none", !textoAviso);
    qs("#painel-g-ajuste").innerHTML = p.ajusteG
      ? `<div class="fm-ajuste"><div><div class="fw-semibold fm-num">${p.ajusteG.valor > 0 ? "+" : "−"} ${moeda(Math.abs(p.ajusteG.valor))}</div><div class="fm-painel-sub">${esc(p.ajusteG.motivo)}</div></div>` +
        '<button type="button" class="btn btn-sm btn-link text-danger" data-acao="remover-ajuste-g" aria-label="Remover ajuste de pacotes grandes">Remover</button></div>'
      : "";
    qs("#btnAjustarG").classList.toggle("d-none", !!p.ajusteG);
    if (p.ajusteG) qs("#painel-g-form").classList.add("d-none");
  }

  function aplicarAjusteG() {
    const p = state.painel;
    const tipo = qs("#g-ajuste-tipo").value;
    const valor = centavos(qs("#g-ajuste-valor").value);
    const motivo = (qs("#g-ajuste-motivo").value || "").trim();
    const erro = qs("#g-ajuste-erro");
    let msg = "";
    if (!(valor > 0)) msg = "Informe um valor maior que zero.";
    else if (!motivo) msg = "Informe o motivo do ajuste.";
    erro.textContent = msg;
    erro.classList.toggle("d-none", !msg);
    if (msg) return;
    p.ajusteG = { valor: tipo === "ADICAO" ? valor : -valor, motivo };
    qs("#g-ajuste-valor").value = "";
    qs("#g-ajuste-motivo").value = "";
    qs("#btnAjustarG").setAttribute("aria-expanded", "false");
    atualizarPainel();
  }

  function atualizarPainel() {
    const p = state.painel;
    if (!p || !p.pronto) return;
    const c = calculo();
    renderComposicao(c);
    renderG(c);
    const erros = errosValidacao(c);
    const totalEl = qs("#painel-total");
    totalEl.textContent = moeda(c.total);
    qs("#painel-total-wrap").classList.toggle("fm-total--negativo", c.total < 0);
    const anterior = qs("#painel-anterior");
    if (p.modo === "reajustar") {
      const dif = centavos(c.total - p.valorAnterior);
      anterior.classList.remove("d-none");
      anterior.textContent = `Valor anterior ${moeda(p.valorAnterior)} · diferença ${dif > 0 ? "+" : dif < 0 ? "−" : ""} ${moeda(Math.abs(dif))}`;
    } else {
      anterior.classList.add("d-none");
    }
    const erroEl = qs("#painel-total-erro");
    erroEl.textContent = erros[0] || "";
    erroEl.classList.toggle("d-none", !erros.length);
    qs("#painel-dias-erro").classList.toggle("d-none", !diasCanceladosAcima().length);
    const btn = qs("#btnPainelSalvar");
    const semMudanca = p.modo === "reajustar" && !painelAlterado();
    btn.disabled = !!erros.length || semMudanca || !!p.salvando;
    const totalDias = p.itens.length;
    qs("#painel-dias-resumo").textContent = totalDias ? `(${plural(totalDias, "dia", "dias")})` : "";
  }

  function renderPainelCompleto() {
    renderPendencias();
    renderGrade();
    renderAjustes();
    atualizarPainel();
  }

  async function calcularBase(base, ini, fim) {
    return api(`${API_FECH}/calcular?${new URLSearchParams({ base, periodo_inicio: ini, periodo_fim: fim })}`);
  }

  async function abrirPainel(opts) {
    if (!painel) return;
    state.fecharConfirmado = false;
    state.painel = { modo: opts.modo, pronto: false, itens: [], ajustes: [], pendentes: [], precos: {}, salvando: false };
    qs("#painel-carregando").textContent = "Carregando…";
    qs("#painel-carregando").classList.remove("d-none");
    qs("#painel-conteudo").classList.add("d-none");
    qs("#painel-divergencia").classList.add("d-none");
    qs("#painel-pendencias").classList.add("d-none");
    qs("#painel-anterior").classList.add("d-none");
    qs("#painel-total-erro").classList.add("d-none");
    qs("#btnPainelSalvar").disabled = true;
    qs("#painelBaseTitulo").textContent = opts.modo === "reajustar" ? "Reajustar fechamento" : "Revisar e gerar fechamento";
    qs("#painel-sub").textContent = opts.base ? `${opts.base} · ${periodoTexto(opts.ini, opts.fim)}` : "—";
    qs("#btnPainelSalvar").textContent = opts.modo === "reajustar" ? "Salvar reajuste" : "Gerar fechamento";
    qs("#painel-total-label").textContent = opts.modo === "reajustar" ? "Novo valor" : "Total a receber";
    ["#ajuste-valor", "#ajuste-motivo", "#g-ajuste-valor", "#g-ajuste-motivo"].forEach((s) => {
      const el = qs(s);
      if (el) el.value = "";
    });
    qs("#g-ajuste-erro").classList.add("d-none");
    qs("#painel-g-form").classList.add("d-none");
    qs("#btnAjustarG").setAttribute("aria-expanded", "false");
    qs("#ajuste-erro").classList.add("d-none");
    qs("#painel-dias").classList.add("d-none");
    qs("#btnConferirDias").setAttribute("aria-expanded", "false");
    painel.show();

    const p = state.painel;
    try {
      if (opts.modo === "gerar") {
        const calc = await calcularBase(opts.base, opts.ini, opts.fim);
        Object.assign(p, {
          base: calc.base,
          ini: opts.ini,
          fim: opts.fim,
          precos: calc.precos || {},
          itens: (calc.itens || []).map(normalizarItem),
          pendentes: (calc.calendario?.dias_pendentes || []).map((d) => d.data),
          itensOriginais: null,
          cnpj: calc.seller_info?.cnpj || "",
          valorGAuto: num(calc.valor_g),
          gCategorias: calc.g_por_categoria || [],
          ajusteG: null,
          avisoG: "",
        });
      } else {
        const fech = await api(`${API_FECH}/${encodeURIComponent(opts.idFech)}`);
        if (String(fech.status || "").toUpperCase() === "RECEBIDO") {
          painel.hide();
          Swal.fire({ icon: "info", title: "Fechamento recebido", text: "Fechamentos já recebidos não podem ser reajustados.", confirmButtonColor: COR_PRIMARIA });
          return;
        }
        const ini = String(fech.periodo_inicio).slice(0, 10);
        const fim = String(fech.periodo_fim).slice(0, 10);
        let calc = null;
        try {
          calc = await calcularBase(fech.base, ini, fim);
        } catch (e) {
          calc = null;
        }
        const itens = (fech.itens || []).map(normalizarItem);
        const adicoes = decomporAjustes("ADICAO", fech.valor_adicao, fech.motivo_adicao);
        const descontos = decomporAjustes("SUBTRACAO", fech.valor_subtracao, fech.motivo_subtracao);
        const gCategorias = fech.g_por_categoria || [];
        let ajusteG = null;
        let avisoG = "";
        if (adicoes.g && adicoes.g.ajuste) ajusteG = { valor: adicoes.g.valor, motivo: adicoes.g.motivo || "Ajuste de pacotes grandes" };
        else if (adicoes.g) avisoG = `Antes o valor dos pacotes grandes era informado à mão (${moeda(adicoes.g.valor)}). Agora ele é calculado pelas categorias.`;
        if (descontos.g) ajusteG = { valor: -descontos.g.valor, motivo: descontos.g.motivo || "Ajuste de pacotes grandes" };
        if (adicoes.legadoG) avisoG = "Um ajuste anterior já inclui o valor dos pacotes grandes. Como agora ele é calculado pelas categorias, remova ou corrija esse ajuste para não cobrar duas vezes.";
        Object.assign(p, {
          idFech: fech.id_fechamento,
          base: fech.base,
          ini,
          fim,
          precos: calc?.precos || {},
          itens,
          itensOriginais: Object.fromEntries(itens.map((it) => [it.data, { ...it }])),
          itensAtuais: calc ? (calc.itens || []).map(normalizarItem) : null,
          ajustes: [...adicoes.manuais, ...descontos.manuais].map((a) => ({ tipo: a.tipo, valor: a.valor, motivo: a.motivo })),
          valorGAuto: gCategorias.reduce((s, cat) => s + num(cat.valor), 0),
          gCategorias,
          ajusteG,
          avisoG,
          calcAtual: calc,
          valorAnterior: num(fech.valor_final),
          divergente: !!fech.divergencia_valor,
          valorRecalculado: fech.valor_final_recalculado,
          cnpj: fech.seller_info?.cnpj || "",
        });
        if (p.divergente && p.itensAtuais) {
          qs("#painel-divergencia").classList.remove("d-none");
          qs("#painel-divergencia-texto").textContent = `Valor gerado ${moeda(p.valorAnterior)} · com as coletas atuais ${moeda(p.valorRecalculado)}`;
        }
      }
      qs("#painel-sub").textContent = `${p.base} · ${periodoTexto(p.ini, p.fim)}${p.cnpj ? ` · CNPJ ${p.cnpj}` : ""}`;
      p.pronto = true;
      p.assinaturaInicial = assinatura();
      qs("#painel-carregando").classList.add("d-none");
      qs("#painel-conteudo").classList.remove("d-none");
      renderPainelCompleto();
    } catch (err) {
      console.error("Fechamento de Bases — abrirPainel:", err);
      qs("#painel-carregando").innerHTML = `<span class="text-danger">${esc(err.message || "Não foi possível carregar.")}</span>`;
    }
  }

  async function recarregarPendencias() {
    const p = state.painel;
    if (!p || p.modo !== "gerar") return;
    try {
      const calc = await calcularBase(p.base, p.ini, p.fim);
      p.pendentes = (calc.calendario?.dias_pendentes || []).map((d) => d.data);
      const sig = JSON.parse(p.assinaturaInicial);
      if (JSON.stringify(p.itens) === JSON.stringify(sig[0])) {
        p.itens = (calc.itens || []).map(normalizarItem);
        p.valorGAuto = num(calc.valor_g);
        p.gCategorias = calc.g_por_categoria || [];
        sig[0] = p.itens;
        p.assinaturaInicial = JSON.stringify(sig);
      }
      renderPainelCompleto();
    } catch (err) {
      avisoErro("Não foi possível atualizar", err);
    }
  }

  function liberarFocoDoAviso(evento) {
    const alvo = evento.target;
    if (alvo instanceof Element && alvo.closest(".swal2-container")) {
      evento.stopImmediatePropagation();
    }
  }

  async function justificarDia(data) {
    const p = state.painel;
    document.addEventListener("focusin", liberarFocoDoAviso, true);
    let r;
    try {
      r = await Swal.fire({
        title: `Justificar ${dmy(data)}`,
        html:
          '<div class="text-start">' +
          '<label class="form-label small" for="sw-tipo">Motivo do dia sem coleta</label>' +
          '<select id="sw-tipo" class="form-select mb-2"><option value="FERIADO">Feriado</option><option value="SEM_COLETA">Sem coleta / base fechada</option><option value="JUSTIFICADO">Outro motivo justificado</option></select>' +
          '<label class="form-label small" for="sw-motivo">Descrição</label>' +
          '<input id="sw-motivo" class="form-control" maxlength="200" placeholder="Ex.: Feriado municipal">' +
          "</div>",
        showCancelButton: true,
        confirmButtonText: "Salvar justificativa",
        cancelButtonText: "Cancelar",
        confirmButtonColor: COR_PRIMARIA,
        didOpen: () => {
          document.getElementById("sw-motivo")?.focus();
        },
        preConfirm: () => {
          const tipo = document.getElementById("sw-tipo").value;
          const motivo = document.getElementById("sw-motivo").value.trim();
          if (!motivo) {
            Swal.showValidationMessage("Descreva o motivo.");
            return false;
          }
          return { tipo, motivo };
        },
      });
    } finally {
      document.removeEventListener("focusin", liberarFocoDoAviso, true);
    }
    if (!r?.isConfirmed) return;
    try {
      const bases = await carregarBasesAtivas();
      const baseObj = bases.find((b) => String(b.base || "").toUpperCase() === String(p.base || "").toUpperCase());
      await api(API_CALENDARIO, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data, tipo: r.value.tipo, motivo: r.value.motivo, base_id: baseObj?.id_base || null }),
      });
      await recarregarPendencias();
    } catch (err) {
      avisoErro("Não foi possível justificar o dia", err);
    }
  }

  function adicionarAjuste() {
    const p = state.painel;
    const tipo = qs("#ajuste-tipo").value;
    const valor = centavos(qs("#ajuste-valor").value);
    const motivo = (qs("#ajuste-motivo").value || "").trim();
    const erro = qs("#ajuste-erro");
    let msg = "";
    if (!(valor > 0)) msg = "Informe um valor maior que zero.";
    else if (!motivo) msg = "Informe o motivo do ajuste.";
    erro.textContent = msg;
    erro.classList.toggle("d-none", !msg);
    if (msg) return;
    p.ajustes.push({ tipo, valor, motivo });
    qs("#ajuste-valor").value = "";
    qs("#ajuste-motivo").value = "";
    renderAjustes();
    atualizarPainel();
  }

  async function removerAjuste(i) {
    const p = state.painel;
    const a = p.ajustes[i];
    if (!a) return;
    const r = await Swal.fire({
      icon: "question",
      title: "Remover ajuste?",
      text: `${a.tipo === "ADICAO" ? "+" : "−"} ${moeda(a.valor)} · ${a.motivo}`,
      showCancelButton: true,
      confirmButtonText: "Remover",
      cancelButtonText: "Cancelar",
      confirmButtonColor: COR_PRIMARIA,
    });
    if (!r.isConfirmed) return;
    p.ajustes.splice(i, 1);
    renderAjustes();
    atualizarPainel();
  }

  function montarPayloadAjustes(c) {
    const p = state.painel;
    const adicoes = p.ajustes.filter((a) => a.tipo === "ADICAO");
    const descontos = p.ajustes.filter((a) => a.tipo !== "ADICAO");
    const somaManual = (lista) => centavos(lista.reduce((s, a) => s + num(a.valor), 0));
    return {
      adicoesManuais: adicoes,
      valorAdicao: centavos(somaManual(adicoes) + Math.max(c.ajusteG, 0)),
      valorSubtracao: centavos(somaManual(descontos) + Math.max(-c.ajusteG, 0)),
      motivoAdicaoManual: adicoes.map((a) => a.motivo).join(" | "),
      motivoSubtracao: descontos.map((a) => a.motivo).join(" | "),
    };
  }

  function resumoMudancasHtml() {
    const p = state.painel;
    if (!p.itensOriginais) return "";
    const nomes = { shopee: "Shopee", mercado_livre: "ML", avulso: "Avulso", cancelados_shopee: "Canc. Shopee", cancelados_ml: "Canc. ML", cancelados_avulso: "Canc. Avulso" };
    const linhas = [];
    p.itens.forEach((it) => {
      const o = p.itensOriginais[it.data];
      const mud = CAMPOS_QTDE.filter((c) => num(o ? o[c] : 0) !== num(it[c])).map((c) => `${nomes[c]} ${num(o ? o[c] : 0)} → ${num(it[c])}`);
      if (mud.length) linhas.push(`<li>${esc(dm(it.data))}: ${esc(mud.join(", "))}</li>`);
    });
    return linhas.length ? `<ul class="text-start small mb-2 ps-3">${linhas.slice(0, 8).join("")}${linhas.length > 8 ? `<li>e mais ${linhas.length - 8} dia(s)</li>` : ""}</ul>` : "";
  }

  async function salvarPainel() {
    const p = state.painel;
    if (!p || !p.pronto || p.salvando) return;
    const c = calculo();
    if (errosValidacao(c).length) return;

    const titulo = p.modo === "reajustar" ? "Salvar reajuste?" : "Gerar fechamento?";
    let html = `<p class="mb-1">${esc(p.base)} · ${esc(periodoTexto(p.ini, p.fim))}</p>`;
    if (p.modo === "reajustar") {
      const dif = centavos(c.total - p.valorAnterior);
      html += resumoMudancasHtml();
      html += `<p class="mb-0 fm-num">${moeda(p.valorAnterior)} → <strong>${moeda(c.total)}</strong> (${dif >= 0 ? "+" : "−"} ${moeda(Math.abs(dif))})</p>`;
    } else {
      html += `<p class="mb-0">Total a receber <strong class="fm-num">${moeda(c.total)}</strong></p>`;
    }
    const acima = diasCanceladosAcima();
    if (acima.length) {
      html += `<p class="small text-warning-emphasis mt-2 mb-0">Cancelados acima do coletado em ${esc(acima.map(dm).join(", "))}. Confira antes de confirmar.</p>`;
    }
    const conf = await Swal.fire({
      icon: acima.length ? "warning" : "question",
      title: titulo,
      html,
      showCancelButton: true,
      confirmButtonText: p.modo === "reajustar" ? "Salvar reajuste" : "Gerar fechamento",
      cancelButtonText: "Voltar",
      confirmButtonColor: COR_PRIMARIA,
    });
    if (!conf.isConfirmed) return;

    const aj = montarPayloadAjustes(c);
    const itens = p.itens.map((it) => ({ ...it }));
    p.salvando = true;
    const btn = qs("#btnPainelSalvar");
    btn.disabled = true;
    btn.textContent = "Salvando…";
    try {
      let idFech = p.idFech;
      if (p.modo === "reajustar") {
        const rotuloG = c.ajusteG ? `[Ajuste G] Motivo: ${p.ajusteG.motivo}; Valor: R$ ${Math.abs(c.ajusteG).toFixed(2)}` : "";
        await api(`${API_FECH}/${encodeURIComponent(p.idFech)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            itens,
            valor_adicao: aj.valorAdicao,
            motivo_adicao: [aj.motivoAdicaoManual, c.ajusteG > 0 ? rotuloG : ""].filter(Boolean).join(" | "),
            valor_subtracao: aj.valorSubtracao,
            motivo_subtracao: [aj.motivoSubtracao, c.ajusteG < 0 ? rotuloG : ""].filter(Boolean).join(" | "),
          }),
        });
      } else {
        const criado = await api(API_FECH, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            base: p.base,
            periodo_inicio: p.ini,
            periodo_fim: p.fim,
            itens,
            valor_adicao: aj.valorAdicao,
            motivo_adicao: aj.motivoAdicaoManual || null,
            valor_subtracao: aj.valorSubtracao,
            motivo_subtracao: aj.motivoSubtracao || null,
            ajuste_g_valor: c.ajusteG || 0,
            ajuste_g_motivo: c.ajusteG ? p.ajusteG.motivo : null,
          }),
        });
        idFech = criado.id_fechamento;
      }
      state.fecharConfirmado = true;
      painel.hide();
      carregar();
      const r = await Swal.fire({
        icon: "success",
        title: p.modo === "reajustar" ? "Reajuste salvo" : "Fechamento gerado",
        html: `<p class="mb-0">${esc(p.base)} · <strong class="fm-num">${moeda(c.total)}</strong></p>`,
        showCancelButton: true,
        confirmButtonText: "Baixar PDF",
        cancelButtonText: "Fechar",
        confirmButtonColor: COR_PRIMARIA,
      });
      if (r.isConfirmed && idFech && typeof window.gerarPdfFechamentoBases === "function") {
        window.gerarPdfFechamentoBases(Number(idFech));
      }
    } catch (err) {
      if (err.status === 409 && err.data?.detail?.calendario) {
        p.pendentes = (err.data.detail.calendario.dias_pendentes || []).map((d) => d.data);
        renderPainelCompleto();
      }
      avisoErro(p.modo === "reajustar" ? "Não foi possível salvar o reajuste" : "Não foi possível gerar o fechamento", err);
    } finally {
      p.salvando = false;
      btn.textContent = p.modo === "reajustar" ? "Salvar reajuste" : "Gerar fechamento";
      atualizarPainel();
    }
  }

  // ====== Bases ativas ======
  let basesAtivasCache = null;

  async function carregarBasesAtivas() {
    if (basesAtivasCache) return basesAtivasCache;
    const data = await api(API_BASES);
    basesAtivasCache = (Array.isArray(data) ? data : data.items || []).filter((b) => b && b.base);
    basesAtivasCache.sort((a, b) => String(a.base).localeCompare(String(b.base), "pt-BR", { sensitivity: "base" }));
    return basesAtivasCache;
  }

  // ====== Gerar individual (escolher base) ======
  async function gerarIndividual() {
    const { ini, fim } = periodo();
    if (periodoAberto(fim)) {
      Swal.fire({ icon: "info", title: "Período em aberto", text: "Escolha um período que termine antes de hoje para gerar o fechamento.", confirmButtonColor: COR_PRIMARIA });
      return;
    }
    let bases;
    try {
      bases = await carregarBasesAtivas();
    } catch (err) {
      avisoErro(`Não foi possível carregar as ${TERMO_BASE.toLowerCase()}s`, err);
      return;
    }
    if (!bases.length) {
      Swal.fire({ icon: "info", title: `Nenhuma ${TERMO_BASE.toLowerCase()} ativa`, confirmButtonColor: COR_PRIMARIA });
      return;
    }
    const inputOptions = {};
    bases.forEach((b) => {
      inputOptions[b.base] = b.base;
    });
    const { value } = await Swal.fire({
      title: `Escolha a ${TERMO_BASE.toLowerCase()}`,
      input: "select",
      inputOptions,
      inputPlaceholder: "Selecione",
      showCancelButton: true,
      confirmButtonText: "Revisar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: COR_PRIMARIA,
      inputValidator: (v) => (!v ? `Selecione uma ${TERMO_BASE.toLowerCase()}` : null),
    });
    if (!value) return;
    abrirPainel({ modo: "gerar", base: value, ini, fim });
  }

  // ====== Eventos ======
  qs("#btnGerarTodos")?.addEventListener("click", gerarTodosPendentes);
  qs("#btnGerarIndividual")?.addEventListener("click", gerarIndividual);

  document.querySelectorAll("#fm-cards .fm-card").forEach((card) => {
    card.addEventListener("click", () => {
      state.filtro = state.filtro === card.dataset.filtro ? "" : card.dataset.filtro;
      renderCards();
      renderTabela();
    });
  });

  qs("#flt-busca")?.addEventListener("input", (e) => {
    state.busca = e.target.value || "";
    renderTabela();
  });

  tbody?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-acao]");
    if (!btn) return;
    const acao = btn.dataset.acao;
    if (acao === "expandir") {
      const k = btn.dataset.base;
      if (state.expandidos.has(k)) state.expandidos.delete(k);
      else state.expandidos.add(k);
      const aberto = state.expandidos.has(k);
      btn.setAttribute("aria-expanded", String(aberto));
      qs(`#${btn.getAttribute("aria-controls")}`)?.classList.toggle("d-none", !aberto);
    } else if (acao === "gerar") {
      const { ini, fim } = periodo();
      abrirPainel({ modo: "gerar", base: btn.dataset.base, ini, fim });
    } else if (acao === "reajustar") {
      abrirPainel({ modo: "reajustar", idFech: btn.dataset.id });
    } else if (acao === "pdf" && typeof window.gerarPdfFechamentoBases === "function") {
      window.gerarPdfFechamentoBases(Number(btn.dataset.id));
    }
  });

  painelEl?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-acao]");
    if (!btn) return;
    const acao = btn.dataset.acao;
    if (acao === "remover-ajuste") removerAjuste(Number(btn.dataset.i));
    else if (acao === "remover-ajuste-g") {
      state.painel.ajusteG = null;
      atualizarPainel();
    }
    else if (acao === "justificar") justificarDia(btn.dataset.data);
  });

  painelEl?.addEventListener("input", (e) => {
    const el = e.target;
    const p = state.painel;
    if (!p || !p.pronto) return;
    if (el.matches("input[data-campo]")) {
      const it = p.itens[Number(el.dataset.i)];
      if (!it) return;
      it[el.dataset.campo] = Math.max(0, parseInt(el.value, 10) || 0);
      const o = p.itensOriginais ? p.itensOriginais[it.data] : null;
      if (p.itensOriginais) el.classList.toggle("fm-celula-alterada", num(o ? o[el.dataset.campo] : 0) !== it[el.dataset.campo]);
      const linha = el.closest("tr");
      Object.entries(COLETADO_DE).forEach(([cc, col]) => {
        const inp = linha.querySelector(`input[data-campo="${cc}"]`);
        if (inp) inp.classList.toggle("is-invalid", num(it[cc]) > num(it[col]));
      });
      const soma = (c) => p.itens.reduce((s, x) => s + num(x[c]), 0);
      qs("#painel-dias-tfoot").innerHTML =
        `<tr><td>Total</td>${CAMPOS_QTDE.map((c) => `<td class="text-end fm-num">${soma(c)}</td>`).join("")}<td class="text-end fm-num">${soma("pacotes_g")}</td></tr>`;
      qs("#painel-dias-legenda").classList.toggle("d-none", !painelEl.querySelector(".fm-celula-alterada"));
      atualizarPainel();
    } else if (el.id === "ajuste-valor" || el.id === "ajuste-motivo") {
      qs("#ajuste-erro").classList.add("d-none");
      atualizarPainel();
    } else if (el.id === "g-ajuste-valor" || el.id === "g-ajuste-motivo") {
      qs("#g-ajuste-erro").classList.add("d-none");
      atualizarPainel();
    }
  });

  qs("#btnAdicionarAjuste")?.addEventListener("click", adicionarAjuste);
  qs("#btnAplicarAjusteG")?.addEventListener("click", aplicarAjusteG);
  qs("#btnAjustarG")?.addEventListener("click", (e) => {
    const btn = e.currentTarget;
    const aberto = btn.getAttribute("aria-expanded") !== "true";
    btn.setAttribute("aria-expanded", String(aberto));
    qs("#painel-g-form").classList.toggle("d-none", !aberto);
    if (aberto) qs("#g-ajuste-valor").focus();
  });
  qs("#btnPainelSalvar")?.addEventListener("click", salvarPainel);
  qs("#btnConferirDias")?.addEventListener("click", (e) => {
    const btn = e.currentTarget;
    const aberto = btn.getAttribute("aria-expanded") !== "true";
    btn.setAttribute("aria-expanded", String(aberto));
    qs("#painel-dias").classList.toggle("d-none", !aberto);
  });
  qs("#btnUsarAtuais")?.addEventListener("click", () => {
    const p = state.painel;
    if (!p || !p.itensAtuais) return;
    p.itens = p.itensAtuais.map((it) => ({ ...it }));
    if (p.calcAtual) {
      p.valorGAuto = num(p.calcAtual.valor_g);
      p.gCategorias = p.calcAtual.g_por_categoria || [];
    }
    qs("#painel-divergencia").classList.add("d-none");
    qs("#painel-dias").classList.remove("d-none");
    qs("#btnConferirDias").setAttribute("aria-expanded", "true");
    renderPainelCompleto();
  });

  painelEl?.addEventListener("hide.bs.offcanvas", async (e) => {
    if (state.fecharConfirmado || !painelAlterado() || !window.Swal) return;
    e.preventDefault();
    const r = await Swal.fire({
      icon: "warning",
      title: "Descartar alterações?",
      text: "As mudanças feitas neste fechamento não foram salvas.",
      showCancelButton: true,
      confirmButtonText: "Descartar",
      cancelButtonText: "Continuar editando",
      confirmButtonColor: COR_PRIMARIA,
    });
    if (r.isConfirmed) {
      state.fecharConfirmado = true;
      painel.hide();
    }
  });
  painelEl?.addEventListener("hidden.bs.offcanvas", () => {
    state.painel = null;
    state.fecharConfirmado = false;
  });

  // ====== Período ======
  const periodBtn = qs("#coletas-resumo-period-btn");
  if (typeof window.initDatePickerDashboard === "function") {
    const picker = window.initDatePickerDashboard({
      containerId: "coletas-resumo-date-picker-container",
      prefix: "coletas-resumo-dp",
      defaultPreset: "quinzena-ant",
      onApply(start, end) {
        fltFrom.value = start;
        fltTo.value = end;
        updatePeriodLabel(start, end);
        bootstrap.Dropdown.getInstance(periodBtn)?.hide();
        state.expandidos.clear();
        carregar();
      },
      onCancel() {
        bootstrap.Dropdown.getInstance(periodBtn)?.hide();
      },
    });
    picker?.applyPreset("quinzena-ant");
    const r = picker?.getResolvedRange() || { start: "", end: "" };
    fltFrom.value = r.start;
    fltTo.value = r.end;
    updatePeriodLabel(r.start, r.end);
  }

  await carregar();

  const url = new URL(window.location.href);
  const revisar = Number(url.searchParams.get("revisar"));
  if (revisar > 0) {
    url.searchParams.delete("revisar");
    window.history.replaceState({}, "", url.toString());
    abrirPainel({ modo: "reajustar", idFech: revisar });
  }
});
