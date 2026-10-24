(function () {
  "use strict";

  const state = {
    itens: [],
    podeCorrigir: false,
    correcao: null,
    temAColetar: false,
    multiDia: false,
    expandidos: new Set(),
  };
  const LOGO_CANAL = {
    "Mercado Livre": "assets/images/canais/mercado-livre.png",
    Shopee: "assets/images/canais/shopee.png",
  };
  const $ = (id) => document.getElementById(id);

  function hoje() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function fmtDMY(ymd) {
    const p = String(ymd || "").slice(0, 10).split("-");
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : "—";
  }

  function rotuloPeriodo(ini, fim) {
    if (ini === fim && ini === hoje()) return `Hoje (${fmtDMY(ini)})`;
    if (ini === fim) return fmtDMY(ini);
    return `${fmtDMY(ini)} — ${fmtDMY(fim)}`;
  }

  function atualizarRotuloPeriodo(ini, fim) {
    const label = $("coletas-operacao-period-label");
    if (label) label.textContent = rotuloPeriodo(ini, fim);
  }

  function periodoSelecionado() {
    let ini = $("coletas-operacao-inicio").value || hoje();
    let fim = $("coletas-operacao-fim").value || ini;
    if (fim < ini) [ini, fim] = [fim, ini];
    return { ini, fim };
  }

  function mensagemApi(payload, fallback) {
    const detail = payload && payload.detail;
    if (typeof detail === "string" && detail.trim()) return detail;
    if (Array.isArray(detail) && detail[0] && typeof detail[0].msg === "string") return detail[0].msg;
    return fallback;
  }

  async function apiGet(url) {
    const response = await fetch(url, { credentials: "include", headers: { Accept: "application/json" } });
    if (response.status === 401) {
      window.location.href = "auth-signin.html";
      throw new Error("Sessão expirada.");
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(mensagemApi(payload, "Não foi possível carregar as coletas."));
    return payload;
  }

  function normalizarExecucao(item) {
    return {
      ...item,
      data_operacao: String(item.data_operacao || "").slice(0, 10),
      precos: item.precos || { shopee: 0, mercado_livre: 0, avulso: 0 },
      pode_corrigir: false,
      contas: Array.isArray(item.contas) ? item.contas : [],
      a_coletar: null,
      participantes: (item.participantes || []).map((p) => ({ ...p, pode_corrigir: false })),
    };
  }

  function complementarHoje(itens, situacao) {
    const porBase = new Map((situacao.itens || []).map((item) => [Number(item.base_id), item]));
    const dia = hoje();
    return itens.map((item) => {
      if (item.data_operacao !== dia) return item;
      const src = porBase.get(Number(item.base_id));
      if (!src) return item;
      const porPart = new Map((src.participantes || []).map((p) => [Number(p.id_participante), p]));
      return {
        ...item,
        precos: src.precos || item.precos,
        atualizado_em: src.atualizado_em || item.atualizado_em,
        pode_corrigir: Boolean(src.pode_corrigir),
        participantes: (item.participantes || []).map((p) => {
          const origem = porPart.get(Number(p.id_participante));
          if (!origem) return p;
          return {
            ...p,
            pode_corrigir: Boolean(origem.pode_corrigir),
            versao: origem.versao ?? p.versao,
            valor_total: origem.valor_total ?? p.valor_total,
          };
        }),
      };
    });
  }

  function resumoDeItens(itens) {
    const resumo = { pendentes: 0, em_coleta: 0, sem_volume: 0, coletadas: 0 };
    itens.forEach((item) => {
      const status = statusNormalizado(item.status);
      if (status === "em_coleta") resumo.em_coleta += 1;
      else if (status === "sem_volume") resumo.sem_volume += 1;
      else if (status === "coletado") resumo.coletadas += 1;
      else resumo.pendentes += 1;
    });
    return resumo;
  }

  function aplicarResumo(resumo) {
    $("coletas-kpi-pendentes").textContent = Number(resumo?.pendentes || 0);
    $("coletas-kpi-em-coleta").textContent = Number(resumo?.em_coleta || 0);
    const kpiSem = $("coletas-kpi-sem-volume");
    if (kpiSem) kpiSem.textContent = Number(resumo?.sem_volume || 0);
    $("coletas-kpi-coletadas").textContent = Number(resumo?.coletadas || 0);
  }

  const STATUS_RESUMO = {
    coletado: ["coletada", "coletadas"],
    em_coleta: ["em coleta", "em coleta"],
    pendente: ["pendente", "pendentes"],
    sem_volume: ["sem volume", "sem volume"],
  };

  function resumoStatusDias(dias) {
    const counts = { coletado: 0, em_coleta: 0, pendente: 0, sem_volume: 0 };
    dias.forEach((dia) => {
      counts[statusNormalizado(dia.status)] += 1;
    });
    const presentes = Object.keys(counts).filter((key) => counts[key] > 0);
    if (presentes.length === 1) return statusBadge(presentes[0]);
    return ["coletado", "em_coleta", "pendente", "sem_volume"]
      .filter((key) => counts[key] > 0)
      .map((key) => {
        const n = counts[key];
        const [um, muitos] = STATUS_RESUMO[key];
        return `${n} ${n === 1 ? um : muitos}`;
      })
      .join(" · ");
  }

  function somarCampo(dias, campo) {
    return dias.reduce((total, dia) => total + Number(dia[campo] || 0), 0);
  }

  function agruparPorBase(itens) {
    const grupos = new Map();
    itens.forEach((item) => {
      const id = Number(item.base_id);
      if (!grupos.has(id)) grupos.set(id, { base_id: id, base: item.base || "", dias: [] });
      grupos.get(id).dias.push(item);
    });
    return [...grupos.values()]
      .map((grupo) => {
        grupo.dias.sort((a, b) => String(b.data_operacao).localeCompare(String(a.data_operacao)));
        return grupo;
      })
      .sort((a, b) => String(a.base).localeCompare(String(b.base), "pt-BR"));
  }

  function esc(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]);
  }

  function statusNormalizado(status) {
    if (status === "em_coleta") return "em_coleta";
    if (status === "sem_volume") return "sem_volume";
    if (status === "coletado") return "coletado";
    return status || "pendente";
  }

  function statusBadge(status) {
    const normal = statusNormalizado(status);
    if (normal === "em_coleta") {
      return '<span class="badge-coleta-status badge-coleta-em-coleta">Em coleta</span>';
    }
    if (normal === "sem_volume") {
      return '<span class="badge-coleta-status badge-coleta-sem-volume">Sem volume</span>';
    }
    if (normal === "coletado") {
      return '<span class="badge-coleta-status badge-coleta-coletada">Coletada</span>';
    }
    return '<span class="badge-coleta-status badge-coleta-pendente">Pendente</span>';
  }

  function modoLabel(modo) {
    if (modo === "codigo") return "Leitura";
    if (modo === "coleta_manual") return "Manual";
    if (modo === "ambos") return "Leitura e manual";
    return "—";
  }

  function money(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "R$ 0,00";
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function participantesComAcao(item) {
    const lista = Array.isArray(item.participantes) ? item.participantes : [];
    if (!lista.length) return "—";
    return lista
      .map((p) => {
        const sufixo = p.sem_volume
          ? " (sem volume)"
          : p.status === "em_coleta"
            ? " (em coleta)"
            : "";
        const nome = `${esc(p.username)}${sufixo}`;
        if (!p.pode_corrigir) return nome;
        return `${nome}<br><button type="button" class="btn btn-sm btn-outline-primary mt-1 js-corrigir-qtde" data-base-id="${Number(item.base_id)}" data-participante-id="${Number(p.id_participante)}">Corrigir quantidades</button>`;
      })
      .join("<br>");
  }

  function formatarDataHora(value) {
    if (!value) return "—";
    // API devolve datetime naive do processo (UTC no servidor). Sem sufixo de fuso,
    // o browser interpreta como horário local e atrasa/adianta a coluna Atualização.
    const raw = String(value).trim();
    const hasTz = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw);
    const iso = hasTz
      ? raw
      : raw.includes("T")
        ? `${raw}Z`
        : `${raw.replace(" ", "T")}Z`;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    // Hora do dia (HH:mm) no fuso de operação Brasil / São Paulo — não é duração em minutos.
    return d.toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function totalAColetar(item) {
    return Number(item.a_coletar?.total || 0);
  }

  function itensFiltrados() {
    const status = $("coletas-operacao-status").value;
    const base = $("coletas-operacao-base").value;
    return state.itens.filter((item) => {
      if (base && String(item.base_id) !== base) return false;
      if (status === "a_coletar") return totalAColetar(item) > 0;
      return !status || statusNormalizado(item.status) === status;
    });
  }

  function contasHtml(item) {
    const contas = Array.isArray(item.contas) ? item.contas : [];
    if (!contas.length) return "";
    return `<span class="coleta-contas">${contas
      .filter((c) => LOGO_CANAL[c.canal])
      .map((c) => {
        const titulo = `Conta ${c.canal} conectada${c.conta ? `: ${c.conta}` : ""}`;
        return `<img src="${LOGO_CANAL[c.canal]}" alt="${esc(titulo)}" title="${esc(titulo)}">`;
      })
      .join("")}</span>`;
  }

  function aColetarHtml(item) {
    if (!item.a_coletar) return '<span class="text-muted" title="Seller sem conta conectada">—</span>';
    const total = totalAColetar(item);
    if (!total) return '<span class="coleta-nada">Nada pendente</span>';
    const texto = statusNormalizado(item.status) === "coletado"
      ? (total === 1 ? "novo após a coleta" : "novos após a coleta")
      : (total === 1 ? "pedido" : "pedidos");
    return `<span class="coleta-a-coletar"><b>${total}</b><span>${texto}</span></span>`;
  }

  function aColetarFrase(item) {
    const total = totalAColetar(item);
    if (!total) return "";
    if (statusNormalizado(item.status) === "coletado") {
      return total === 1 ? "1 novo pedido após a coleta" : `${total} novos pedidos após a coleta`;
    }
    return total === 1 ? "1 pedido a coletar" : `${total} pedidos a coletar`;
  }

  function ownerEhBase() {
    return String(window.TIPO_OWNER || "").toLowerCase() === "base";
  }

  async function garantirTipoOwner() {
    if (window.TIPO_OWNER || typeof window.ensureAuthUser !== "function") return;
    try {
      await window.ensureAuthUser();
    } catch (_) {}
  }

  function renderResumoAColetar(resumo) {
    const card = $("coletas-kpi-a-coletar-card");
    const opcao = $("coletas-opcao-a-coletar");
    state.temAColetar = ownerEhBase() && Boolean(resumo);
    card.classList.toggle("d-none", !state.temAColetar);
    opcao.hidden = !state.temAColetar;
    const coluna = $("coletas-th-a-coletar");
    if (coluna) coluna.classList.toggle("d-none", !state.temAColetar);
    if (!state.temAColetar) {
      if ($("coletas-operacao-status").value === "a_coletar") $("coletas-operacao-status").value = "";
      return;
    }
    $("coletas-kpi-a-coletar").textContent = Number(resumo.total || 0);
    const partes = [];
    if (Number(resumo.mercado_livre || 0)) {
      partes.push(`<span class="coleta-canal-mini"><img src="${LOGO_CANAL["Mercado Livre"]}" alt="Mercado Livre">${Number(resumo.mercado_livre)}</span>`);
    }
    if (Number(resumo.shopee || 0)) {
      partes.push(`<span class="coleta-canal-mini"><img src="${LOGO_CANAL.Shopee}" alt="Shopee">${Number(resumo.shopee)}</span>`);
    }
    const sellers = Number(resumo.sellers || 0);
    partes.push(`<span>${sellers ? `em ${sellers} ${sellers === 1 ? "seller" : "sellers"}` : "nenhum pedido aguardando coleta"}</span>`);
    $("coletas-kpi-a-coletar-sub").innerHTML = partes.join("");
  }

  function linhaDia(item) {
    return (
      "<tr>" +
      `<td>${esc(fmtDMY(item.data_operacao))}</td>` +
      `<td>${statusBadge(item.status)}</td>` +
      `<td class="coleta-participantes">${participantesComAcao(item)}</td>` +
      `<td>${esc(modoLabel(item.modo))}</td>` +
      `<td class="text-center">${Number(item.mercado_livre || 0)}</td>` +
      `<td class="text-center">${Number(item.shopee || 0)}</td>` +
      `<td class="text-center">${Number(item.avulso || 0)}</td>` +
      `<td>${formatarDataHora(item.atualizado_em)}</td>` +
      "</tr>"
    );
  }

  function blocoDiaMobile(item) {
    const botoes = (item.participantes || [])
      .filter((p) => p.pode_corrigir)
      .map(
        (p) =>
          `<button type="button" class="btn btn-sm btn-outline-primary js-corrigir-qtde" data-base-id="${Number(item.base_id)}" data-participante-id="${Number(p.id_participante)}">Corrigir · ${esc(p.username)}</button>`
      )
      .join("");
    return `
      <div class="coleta-dia-bloco">
        <div class="d-flex justify-content-between align-items-start gap-2 mb-2"><strong>${esc(fmtDMY(item.data_operacao))}</strong>${statusBadge(item.status)}</div>
        <div class="small text-muted mb-2">${(item.participantes || []).map((p) => `${esc(p.username)}${p.sem_volume ? " (sem volume)" : p.status === "em_coleta" ? " (em coleta)" : ""}`).join("<br>") || "—"}</div>
        <div class="d-flex flex-wrap gap-2 mb-2">
          <span class="badge bg-light text-body">Flex ${Number(item.mercado_livre || 0)}</span>
          <span class="badge bg-light text-body">Shopee ${Number(item.shopee || 0)}</span>
          <span class="badge bg-light text-body">Avulso ${Number(item.avulso || 0)}</span>
        </div>
        <div class="small text-muted mb-2">${esc(modoLabel(item.modo))} · Atualizada ${formatarDataHora(item.atualizado_em)}</div>
        ${botoes ? `<div class="d-flex flex-wrap gap-2">${botoes}</div>` : ""}
      </div>`;
  }

  function renderPeriodo(itens) {
    const grupos = agruparPorBase(itens);
    const thead = $("coletas-operacao-tabela-wrap").querySelector("thead tr");
    if (thead) {
      thead.innerHTML = "<th></th><th>Base</th><th>Status</th><th class=\"text-center\">Flex</th><th class=\"text-center\">Shopee</th><th class=\"text-center\">Avulso</th>";
    }
    $("coletas-operacao-vazio").classList.toggle("d-none", grupos.length > 0);
    $("coletas-operacao-tabela-wrap").classList.toggle("d-none", grupos.length === 0);
    $("coletas-operacao-tbody").innerHTML = grupos
      .map((grupo) => {
        const aberto = state.expandidos.has(grupo.base_id);
        const idDias = `coleta-dias-${grupo.base_id}`;
        return (
          "<tr>" +
          `<td><button type="button" class="coleta-expandir js-expandir-base" data-base-id="${grupo.base_id}" aria-expanded="${aberto}" aria-controls="${idDias}" aria-label="Ver dias de ${esc(grupo.base)}"><i class="ri-arrow-right-s-line fs-5"></i></button></td>` +
          `<td class="fw-semibold">${esc(grupo.base)}</td>` +
          `<td>${resumoStatusDias(grupo.dias)}</td>` +
          `<td class="text-center">${somarCampo(grupo.dias, "mercado_livre")}</td>` +
          `<td class="text-center">${somarCampo(grupo.dias, "shopee")}</td>` +
          `<td class="text-center">${somarCampo(grupo.dias, "avulso")}</td>` +
          "</tr>" +
          `<tr class="coleta-dias${aberto ? "" : " d-none"}" id="${idDias}"><td colspan="6">` +
          '<table class="table table-sm mb-0"><thead><tr><th>Dia</th><th>Status</th><th>Participantes</th><th>Modo</th><th class="text-center">Flex</th><th class="text-center">Shopee</th><th class="text-center">Avulso</th><th>Atualização</th></tr></thead><tbody>' +
          grupo.dias.map(linhaDia).join("") +
          "</tbody></table></td></tr>"
        );
      })
      .join("");
    $("coletas-operacao-mobile").innerHTML = grupos
      .map((grupo) => {
        const aberto = state.expandidos.has(grupo.base_id);
        return `
      <article class="coleta-mobile-card">
        <button type="button" class="btn btn-link text-body text-start p-0 w-100 js-expandir-base" data-base-id="${grupo.base_id}" aria-expanded="${aberto}" aria-label="Ver dias de ${esc(grupo.base)}">
          <div class="d-flex justify-content-between align-items-start gap-2">
            <strong><i class="ri-arrow-right-s-line" aria-hidden="true" style="${aberto ? "display:inline-block;transform:rotate(90deg)" : ""}"></i> ${esc(grupo.base)}</strong>
            <span>${resumoStatusDias(grupo.dias)}</span>
          </div>
          <div class="d-flex flex-wrap gap-2 mt-2">
            <span class="badge bg-light text-body">Flex ${somarCampo(grupo.dias, "mercado_livre")}</span>
            <span class="badge bg-light text-body">Shopee ${somarCampo(grupo.dias, "shopee")}</span>
            <span class="badge bg-light text-body">Avulso ${somarCampo(grupo.dias, "avulso")}</span>
          </div>
        </button>
        ${aberto ? grupo.dias.map(blocoDiaMobile).join("") : ""}
      </article>`;
      })
      .join("");
  }

  function cabecalhoDiaUnico() {
    const thead = $("coletas-operacao-tabela-wrap").querySelector("thead tr");
    if (!thead) return;
    thead.innerHTML =
      "<th>Base</th><th>Status</th>" +
      (state.temAColetar ? '<th id="coletas-th-a-coletar">A coletar</th>' : "") +
      "<th>Participantes</th><th>Modo</th><th class=\"text-center\">Flex</th><th class=\"text-center\">Shopee</th><th class=\"text-center\">Avulso</th><th>Atualização</th>";
  }

  function render() {
    const itens = itensFiltrados();
    $("coletas-kpi-a-coletar-card").classList.toggle("ativo", $("coletas-operacao-status").value === "a_coletar");
    if (state.multiDia) {
      renderPeriodo(itens);
      return;
    }
    cabecalhoDiaUnico();
    $("coletas-operacao-vazio").classList.toggle("d-none", itens.length > 0);
    $("coletas-operacao-tabela-wrap").classList.toggle("d-none", itens.length === 0);
    $("coletas-operacao-tbody").innerHTML = itens
      .map(
        (item) => `
      <tr class="${state.temAColetar && totalAColetar(item) > 0 ? "coleta-com-pendencia" : ""}">
        <td class="fw-semibold"><span class="coleta-base">${esc(item.base)}${contasHtml(item)}</span></td><td>${statusBadge(item.status)}</td>
        ${state.temAColetar ? `<td>${aColetarHtml(item)}</td>` : ""}
        <td class="coleta-participantes">${participantesComAcao(item)}</td><td>${esc(modoLabel(item.modo))}</td>
        <td class="text-center">${Number(item.mercado_livre || 0)}</td><td class="text-center">${Number(item.shopee || 0)}</td>
        <td class="text-center">${Number(item.avulso || 0)}</td><td>${formatarDataHora(item.atualizado_em)}</td>
      </tr>`
      )
      .join("");
    $("coletas-operacao-mobile").innerHTML = itens
      .map((item) => {
        const botoes = (item.participantes || [])
          .filter((p) => p.pode_corrigir)
          .map(
            (p) =>
              `<button type="button" class="btn btn-sm btn-outline-primary js-corrigir-qtde" data-base-id="${Number(item.base_id)}" data-participante-id="${Number(p.id_participante)}">Corrigir · ${esc(p.username)}</button>`
          )
          .join("");
        return `
      <article class="coleta-mobile-card${state.temAColetar && totalAColetar(item) > 0 ? " coleta-com-pendencia" : ""}">
        <div class="d-flex justify-content-between align-items-start gap-2 mb-2"><strong class="coleta-base">${esc(item.base)}${contasHtml(item)}</strong>${statusBadge(item.status)}</div>
        ${state.temAColetar && aColetarFrase(item) ? `<div class="coleta-a-coletar mb-2"><b>${esc(aColetarFrase(item))}</b></div>` : ""}
        <div class="small text-muted mb-2">${(item.participantes || []).map((p) => `${esc(p.username)}${p.sem_volume ? " (sem volume)" : p.status === "em_coleta" ? " (em coleta)" : ""}`).join("<br>") || "—"}</div>
        <div class="d-flex flex-wrap gap-2 mb-2">
          <span class="badge bg-light text-body">Flex ${Number(item.mercado_livre || 0)}</span>
          <span class="badge bg-light text-body">Shopee ${Number(item.shopee || 0)}</span>
          <span class="badge bg-light text-body">Avulso ${Number(item.avulso || 0)}</span>
        </div>
        <div class="small text-muted mb-2">${esc(modoLabel(item.modo))} · Atualizada ${formatarDataHora(item.atualizado_em)} · ${money(item.valor_total)}</div>
        ${botoes ? `<div class="d-flex flex-wrap gap-2">${botoes}</div>` : ""}
      </article>`;
      })
      .join("");
  }

  function preencherBases() {
    const select = $("coletas-operacao-base");
    const atual = select.value;
    const vistas = new Set();
    const opcoes = [];
    state.itens.forEach((item) => {
      const id = String(Number(item.base_id));
      if (!id || vistas.has(id)) return;
      vistas.add(id);
      opcoes.push({ id, nome: item.base || "" });
    });
    opcoes.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    select.innerHTML = '<option value="">Todas</option>' + opcoes.map((opcao) => `<option value="${opcao.id}">${esc(opcao.nome)}</option>`).join("");
    select.value = [...select.options].some((opt) => opt.value === atual) ? atual : "";
  }

  function calcPreview() {
    const ctx = state.correcao;
    if (!ctx) return;
    const flex = Math.max(0, parseInt($("corr-flex").value || "0", 10) || 0);
    const shopee = Math.max(0, parseInt($("corr-shopee").value || "0", 10) || 0);
    const avulso = Math.max(0, parseInt($("corr-avulso").value || "0", 10) || 0);
    const p = ctx.precos;
    const valorNovo = flex * Number(p.mercado_livre || 0) + shopee * Number(p.shopee || 0) + avulso * Number(p.avulso || 0);
    const dFlex = flex - ctx.ant.mercado_livre;
    const dShopee = shopee - ctx.ant.shopee;
    const dAvulso = avulso - ctx.ant.avulso;
    $("corr-preview").innerHTML = `
      <div class="small">
        <div>Flex: <strong>${ctx.ant.mercado_livre}</strong> → <strong>${flex}</strong> (${dFlex >= 0 ? "+" : ""}${dFlex})</div>
        <div>Shopee: <strong>${ctx.ant.shopee}</strong> → <strong>${shopee}</strong> (${dShopee >= 0 ? "+" : ""}${dShopee})</div>
        <div>Avulso: <strong>${ctx.ant.avulso}</strong> → <strong>${avulso}</strong> (${dAvulso >= 0 ? "+" : ""}${dAvulso})</div>
        <div class="mt-2">Valor: <strong>${money(ctx.valorAnterior)}</strong> → <strong>${money(valorNovo)}</strong></div>
      </div>`;
  }

  function abrirModalCorrecao(baseId, participanteId) {
    let item = null;
    let part = null;
    for (const candidato of state.itens) {
      if (Number(candidato.base_id) !== Number(baseId)) continue;
      const achado = (candidato.participantes || []).find((p) => Number(p.id_participante) === Number(participanteId));
      if (!achado) continue;
      item = candidato;
      part = achado;
      break;
    }
    if (!item || !part || !part.pode_corrigir) return;
    if (state.multiDia && String(item.data_operacao || "").slice(0, 10) !== hoje()) return;
    state.correcao = {
      baseId: item.base_id,
      participanteId: part.id_participante,
      versao: part.versao,
      username: part.username,
      base: item.base,
      modo: item.modo,
      precos: item.precos || { shopee: 0, mercado_livre: 0, avulso: 0 },
      ant: {
        shopee: Number(part.shopee || 0),
        mercado_livre: Number(part.mercado_livre || 0),
        avulso: Number(part.avulso || 0),
      },
      valorAnterior: part.valor_total || item.valor_total || 0,
    };
    $("corr-meta").textContent = `${item.base} · ${part.username} · ${modoLabel(item.modo)}`;
    $("corr-flex").value = String(state.correcao.ant.mercado_livre);
    $("corr-shopee").value = String(state.correcao.ant.shopee);
    $("corr-avulso").value = String(state.correcao.ant.avulso);
    $("corr-erro").classList.add("d-none");
    calcPreview();
    const modal = bootstrap.Modal.getOrCreateInstance($("modal-corrigir-qtde"));
    modal.show();
  }

  async function salvarCorrecao() {
    const ctx = state.correcao;
    if (!ctx) return;
    const flex = Math.max(0, parseInt($("corr-flex").value || "0", 10) || 0);
    const shopee = Math.max(0, parseInt($("corr-shopee").value || "0", 10) || 0);
    const avulso = Math.max(0, parseInt($("corr-avulso").value || "0", 10) || 0);
    const btn = $("corr-salvar");
    const erro = $("corr-erro");
    erro.classList.add("d-none");
    btn.disabled = true;
    try {
      const response = await fetch(`${window.TRACK_API_URL}/coletas/operacionais/participantes/${ctx.participanteId}/corrigir`, {
        method: "POST",
        credentials: "include",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          shopee,
          mercado_livre: flex,
          avulso,
          versao: ctx.versao,
          origem_cliente: "web",
        }),
      });
      if (response.status === 401) {
        window.location.href = "auth-signin.html";
        return;
      }
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = payload.detail;
        throw new Error(typeof detail === "string" ? detail : "Não foi possível salvar a correção.");
      }
      bootstrap.Modal.getOrCreateInstance($("modal-corrigir-qtde")).hide();
      await carregar();
    } catch (error) {
      erro.textContent = typeof error?.message === "string" ? error.message : "Não foi possível salvar a correção.";
      erro.classList.remove("d-none");
    } finally {
      btn.disabled = false;
    }
  }

  async function carregar() {
    const loading = $("coletas-operacao-loading");
    const alert = $("coletas-operacao-alert");
    alert.classList.add("d-none");
    loading.classList.remove("d-none");
    $("coletas-operacao-atualizar").disabled = true;
    state.expandidos.clear();
    try {
      const { ini, fim } = periodoSelecionado();
      $("coletas-operacao-inicio").value = ini;
      $("coletas-operacao-fim").value = fim;
      atualizarRotuloPeriodo(ini, fim);
      state.multiDia = ini !== fim;
      if (state.multiDia && $("coletas-operacao-status").value === "a_coletar") {
        $("coletas-operacao-status").value = "";
      }
      await garantirTipoOwner();
      if (!state.multiDia) {
        const payload = await apiGet(`${window.TRACK_API_URL}/coletas/operacionais/situacao?data_operacao=${encodeURIComponent(ini)}`);
        state.itens = Array.isArray(payload.itens) ? payload.itens : [];
        state.podeCorrigir = Boolean(payload.pode_corrigir_quantidades);
        aplicarResumo(payload.resumo);
        renderResumoAColetar(payload.resumo?.a_coletar || null);
      } else {
        const rows = await apiGet(
          `${window.TRACK_API_URL}/coletas/operacionais/?data_inicio=${encodeURIComponent(ini)}&data_fim=${encodeURIComponent(fim)}`
        );
        let itens = (Array.isArray(rows) ? rows : []).map(normalizarExecucao);
        state.podeCorrigir = false;
        const dia = hoje();
        if (ini <= dia && dia <= fim) {
          try {
            const hojePayload = await apiGet(`${window.TRACK_API_URL}/coletas/operacionais/situacao?data_operacao=${encodeURIComponent(dia)}`);
            itens = complementarHoje(itens, hojePayload);
            state.podeCorrigir = Boolean(hojePayload.pode_corrigir_quantidades);
          } catch (_) {}
        }
        state.itens = itens;
        aplicarResumo(resumoDeItens(itens));
        renderResumoAColetar(null);
      }
      preencherBases();
      render();
    } catch (error) {
      alert.textContent = typeof error?.message === "string" ? error.message : "Não foi possível carregar as coletas.";
      alert.classList.remove("d-none");
    } finally {
      loading.classList.add("d-none");
      $("coletas-operacao-atualizar").disabled = false;
    }
  }

  function fecharExpandidosERender() {
    state.expandidos.clear();
    render();
  }

  document.addEventListener("DOMContentLoaded", function () {
    const dia = hoje();
    $("coletas-operacao-inicio").value = dia;
    $("coletas-operacao-fim").value = dia;
    atualizarRotuloPeriodo(dia, dia);
    if (typeof window.initDatePickerDashboard === "function") {
      window.initDatePickerDashboard({
        containerId: "coletas-operacao-date-picker",
        prefix: "coletas-op-dp",
        defaultPreset: "hoje",
        onApply: function (start, end) {
          let ini = start;
          let fim = end;
          if (fim < ini) [ini, fim] = [fim, ini];
          $("coletas-operacao-inicio").value = ini;
          $("coletas-operacao-fim").value = fim;
          atualizarRotuloPeriodo(ini, fim);
          const btn = $("coletas-operacao-period-btn");
          if (typeof bootstrap !== "undefined" && bootstrap.Dropdown && btn) {
            const dropdown = bootstrap.Dropdown.getInstance(btn);
            if (dropdown) dropdown.hide();
          }
          void carregar();
        },
        onCancel: function () {
          const btn = $("coletas-operacao-period-btn");
          if (typeof bootstrap !== "undefined" && bootstrap.Dropdown && btn) {
            const dropdown = bootstrap.Dropdown.getInstance(btn);
            if (dropdown) dropdown.hide();
          }
        },
      });
    }
    $("coletas-operacao-atualizar").addEventListener("click", carregar);
    $("coletas-operacao-status").addEventListener("change", fecharExpandidosERender);
    $("coletas-operacao-base").addEventListener("change", fecharExpandidosERender);
    $("coletas-kpi-a-coletar-card").addEventListener("click", () => {
      if (state.multiDia) return;
      const select = $("coletas-operacao-status");
      select.value = select.value === "a_coletar" ? "" : "a_coletar";
      fecharExpandidosERender();
    });
    ["corr-flex", "corr-shopee", "corr-avulso"].forEach((id) => {
      $(id).addEventListener("input", calcPreview);
    });
    $("corr-salvar").addEventListener("click", () => void salvarCorrecao());
    document.body.addEventListener("click", (ev) => {
      const expandir = ev.target.closest(".js-expandir-base");
      if (expandir) {
        const id = Number(expandir.dataset.baseId);
        if (state.expandidos.has(id)) state.expandidos.delete(id);
        else state.expandidos.add(id);
        render();
        return;
      }
      const btn = ev.target.closest(".js-corrigir-qtde");
      if (!btn) return;
      abrirModalCorrecao(btn.dataset.baseId, btn.dataset.participanteId);
    });
    void carregar();
  });
})();
