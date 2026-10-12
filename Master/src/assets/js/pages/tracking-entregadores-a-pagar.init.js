/* ======================================================
   A Pagar — fechamentos gerados do período e registro de pagamento
   GET  /api/entregadores/fechamentos
   POST /api/entregadores/fechamentos/marcar-pago
   ====================================================== */

document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  const API_URL = String(
    typeof window.getTrackApiUrl === "function" ? window.getTrackApiUrl() : window.TRACK_API_URL || ""
  ).replace(/\/+$/, "");
  const API_FECHAMENTOS = `${API_URL}/entregadores/fechamentos`;
  const COR_PRIMARIA = "#0B1F3A";

  const qs = (s) => document.querySelector(s);
  const num = (v) => Number(v) || 0;
  const moeda = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(num(v));
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

  const STATUS = {
    GERADO: { label: "Gerado", cls: "gerado" },
    FECHADO: { label: "Gerado", cls: "gerado" },
    REAJUSTADO: { label: "Reajustado", cls: "reajustado" },
    PAGO: { label: "Pago", cls: "pago" },
  };

  const state = {
    items: [],
    filtro: "A_PAGAR",
    selecionados: new Set(),
    pagando: false,
  };

  const fltDataInicio = qs("#flt-data-inicio");
  const fltDataFim = qs("#flt-data-fim");
  const tbody = qs("#tbody-a-pagar");
  const msgEl = qs("#aPagarMsg");
  const chkTodos = qs("#chkTodos");
  const barra = qs("#barraSelecao");
  const btnMarcarPago = qs("#btnMarcarPago");
  const btnExportar = qs("#btnExportar");

  const statusDe = (i) => String(i.status || "").toUpperCase();
  const aPagar = (i) => ["GERADO", "REAJUSTADO", "FECHADO"].includes(statusDe(i));

  function nomeMotoboy(item) {
    const raw = (item && (item.nome_exibicao || item.username_entregador)) || "—";
    if (typeof window.formatPersonName === "function" && raw !== "—") return window.formatPersonName(raw) || raw;
    return String(raw);
  }

  function compararNome(a, b) {
    const la = nomeMotoboy(a);
    const lb = nomeMotoboy(b);
    if (typeof window.comparePersonNames === "function") return window.comparePersonNames(la, lb);
    return la.localeCompare(lb, "pt-BR", { sensitivity: "base" });
  }

  function dmy(iso) {
    if (!iso) return "";
    const [y, m, d] = String(iso).slice(0, 10).split("-");
    return `${d}/${m}/${y}`;
  }

  function periodoTexto(ini, fim) {
    if (!ini || !fim) return "—";
    return `${dmy(ini).slice(0, 5)} a ${dmy(fim)}`;
  }

  function dataHora(iso) {
    if (!iso) return "";
    const s = String(iso);
    const d = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s : `${s}Z`);
    if (Number.isNaN(d.getTime())) return "";
    const p = (n) => String(n).padStart(2, "0");
    return `${p(d.getDate())}/${p(d.getMonth() + 1)} às ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function valorAtual(item) {
    return num(item.valor_base_recalculado) + num(item.valor_adicao) - num(item.valor_subtracao);
  }

  function itensVisiveis() {
    const lista = state.items.filter((i) => {
      if (state.filtro === "A_PAGAR") return aPagar(i);
      if (state.filtro === "PAGO") return statusDe(i) === "PAGO";
      if (state.filtro === "REVISAO") return !!i.precisa_reajuste || !!i.alerta_pos_pago;
      return true;
    });
    return lista.sort(compararNome);
  }

  // ====== Cards ======
  function renderCards() {
    const pendentes = state.items.filter(aPagar);
    const pagos = state.items.filter((i) => statusDe(i) === "PAGO");
    const revisao = state.items.filter((i) => i.precisa_reajuste || i.alerta_pos_pago);
    const soma = (arr) => arr.reduce((s, i) => s + num(i.valor_final), 0);
    qs("#card-a-pagar").textContent = moeda(soma(pendentes));
    qs("#card-a-pagar-qtd").textContent = plural(pendentes.length, "motoboy", "motoboys");
    qs("#card-pago").textContent = moeda(soma(pagos));
    qs("#card-pago-qtd").textContent = plural(pagos.length, "motoboy", "motoboys");
    qs("#card-reajuste").textContent = String(revisao.length);
    document.querySelectorAll("#ap-cards .fm-card").forEach((c) => {
      c.setAttribute("aria-pressed", c.dataset.filtro === state.filtro ? "true" : "false");
    });
  }

  // ====== Tabela ======
  function celulaPix(item) {
    const chave = (item.chave_pix || "").trim();
    if (!chave) return '<span class="fm-chip fm-chip--revisao">Sem PIX cadastrado</span>';
    return (
      `<span class="fm-pix"><span class="fm-pix-chave" title="${esc(chave)}">${esc(chave)}</span>` +
      `<button type="button" class="fm-pix-copiar" data-pix="${esc(chave)}" aria-label="Copiar chave PIX de ${esc(nomeMotoboy(item))}" title="Copiar chave PIX">` +
      '<i class="ri-file-copy-line"></i></button></span>'
    );
  }

  function subLinha(item) {
    if (statusDe(item) === "PAGO") {
      const quando = dataHora(item.pago_em);
      const quem = (item.pago_por || "").trim();
      if (!quando) return "";
      return `Pago em ${quando}${quem ? ` por ${quem}` : ""}`;
    }
    const partes = [];
    if (num(item.valor_adicao) > 0) partes.push(`adicional de ${moeda(item.valor_adicao)}`);
    if (num(item.valor_subtracao) > 0) partes.push(`desconto de ${moeda(item.valor_subtracao)}`);
    return partes.length ? `Inclui ${partes.join(" e ")}` : "";
  }

  function celulaSituacao(item) {
    const st = STATUS[statusDe(item)] || { label: statusDe(item) || "—", cls: "pendente" };
    let html = `<span class="fm-status fm-status--${st.cls}">${esc(st.label)}</span>`;
    if (item.precisa_reajuste) html += ' <span class="fm-chip fm-chip--revisao">Precisa revisão</span>';
    if (item.alerta_pos_pago) html += ' <span class="fm-chip fm-chip--info" title="O valor mudou depois do pagamento">Mudou após pagar</span>';
    return html;
  }

  function linhaMensagem(html) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">${html}</td></tr>`;
  }

  function mensagemVazia() {
    if (!state.items.length) {
      return 'Nenhum fechamento gerado neste período. <a href="tracking-entregadores-resumo.html">Ir para Fechamento de Motoboys</a>';
    }
    if (state.filtro === "A_PAGAR") return "Tudo pago neste período.";
    if (state.filtro === "PAGO") return "Nenhum pagamento registrado neste período.";
    if (state.filtro === "REVISAO") return "Nenhum fechamento precisa de revisão.";
    return "Nenhum fechamento neste período.";
  }

  function renderTabela() {
    const lista = itensVisiveis();
    const visiveisIds = new Set(lista.filter(aPagar).map((i) => Number(i.id_fechamento)));
    state.selecionados.forEach((id) => {
      if (!visiveisIds.has(id)) state.selecionados.delete(id);
    });

    if (!lista.length) {
      linhaMensagem(mensagemVazia());
    } else {
      tbody.innerHTML = lista
        .map((item) => {
          const id = Number(item.id_fechamento);
          const pagavel = aPagar(item);
          const marcado = state.selecionados.has(id);
          const nome = nomeMotoboy(item);
          const sub = subLinha(item);
          const classes = [item.precisa_reajuste ? "fm-linha--revisao" : "", marcado ? "fm-linha--selecionada" : ""].join(" ").trim();
          const chk = pagavel
            ? `<input class="form-check-input chk-pagar" type="checkbox" value="${id}" ${marcado ? "checked" : ""} aria-label="Selecionar ${esc(nome)}">`
            : "";
          const valorSub = item.precisa_reajuste && item.valor_base_recalculado != null
            ? `<div class="fm-linha-sub">valor atual ${moeda(valorAtual(item))}</div>`
            : "";
          const btnRevisar = pagavel
            ? `<button type="button" class="btn btn-sm ${item.precisa_reajuste ? "btn-fm-primary" : "btn-outline-primary"} btn-revisar" data-id="${id}">Revisar</button>`
            : "";
          const btnPdf = `<button type="button" class="btn btn-sm btn-link text-muted px-1 btn-pdf" data-id="${id}" title="Baixar PDF" aria-label="Baixar PDF de ${esc(nome)}"><i class="ri-file-pdf-line fs-5"></i></button>`;
          return (
            `<tr class="${classes}" data-id="${id}">` +
            `<td>${chk}</td>` +
            `<td><div class="fw-semibold">${esc(nome)}</div><div class="fm-linha-sub">${esc(periodoTexto(item.periodo_inicio, item.periodo_fim))}${sub ? ` · ${esc(sub)}` : ""}</div></td>` +
            `<td>${celulaPix(item)}</td>` +
            `<td class="text-end"><span class="fw-semibold fm-num">${moeda(item.valor_final)}</span>${valorSub}</td>` +
            `<td>${celulaSituacao(item)}</td>` +
            `<td class="text-end text-nowrap">${btnRevisar} ${btnPdf}</td>` +
            "</tr>"
          );
        })
        .join("");
    }
    renderSelecao();
    if (btnExportar) btnExportar.disabled = !lista.length;
  }

  function renderSelecao() {
    const pagaveis = itensVisiveis().filter(aPagar);
    const selecionados = pagaveis.filter((i) => state.selecionados.has(Number(i.id_fechamento)));
    if (chkTodos) {
      chkTodos.disabled = !pagaveis.length || state.pagando;
      chkTodos.checked = pagaveis.length > 0 && selecionados.length === pagaveis.length;
      chkTodos.indeterminate = selecionados.length > 0 && selecionados.length < pagaveis.length;
    }
    if (!barra) return;
    barra.classList.toggle("d-none", !pagaveis.length);
    qs("#selecaoQtd").textContent = selecionados.length
      ? plural(selecionados.length, "selecionado", "selecionados")
      : "Selecione os motoboys que você já pagou";
    qs("#selecaoTotal").textContent = selecionados.length ? moeda(selecionados.reduce((s, i) => s + num(i.valor_final), 0)) : "";
    qs("#btnLimparSelecao").classList.toggle("d-none", !selecionados.length);
    btnMarcarPago.disabled = state.pagando || !selecionados.length;
    btnMarcarPago.innerHTML = state.pagando
      ? "Registrando…"
      : `<i class="ri-checkbox-circle-line me-1"></i> Marcar ${selecionados.length === 1 ? "como pago" : "como pagos"}`;
  }

  function render() {
    renderCards();
    renderTabela();
  }

  // ====== API ======
  function mensagemErro(data, status) {
    const d = data && data.detail;
    if (typeof d === "string") return d;
    if (d && typeof d === "object" && !Array.isArray(d) && d.message) return d.message;
    if (Array.isArray(d) && d.length) {
      return d.map((i) => (typeof i === "string" ? i : i && i.msg) || "").filter(Boolean).join(" | ");
    }
    return `Não foi possível concluir (erro ${status}).`;
  }

  async function api(url, options) {
    const res = await fetch(url, { credentials: "include", ...(options || {}) });
    if (res.status === 401) {
      window.location.href = "auth-signin-tracking-v2.html";
      throw new Error("Sessão expirada.");
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(res.status === 403 ? "Seu perfil não tem acesso aos pagamentos de motoboys." : mensagemErro(data, res.status));
      err.status = res.status;
      err.detail = data && data.detail;
      throw err;
    }
    return data;
  }

  async function carregarLista() {
    const inicio = (fltDataInicio?.value || "").trim();
    const fim = (fltDataFim?.value || "").trim();
    if (!inicio || !fim) return;
    if (!API_URL) {
      linhaMensagem('<span class="text-danger">URL da API não configurada.</span>');
      return;
    }
    if (msgEl) msgEl.innerHTML = "";
    linhaMensagem("Carregando…");
    try {
      const data = await api(`${API_FECHAMENTOS}?${new URLSearchParams({ periodo_inicio: inicio, periodo_fim: fim })}`);
      state.items = Array.isArray(data.items) ? data.items : [];
    } catch (err) {
      console.error("A Pagar — carregarLista:", err);
      state.items = [];
      state.selecionados.clear();
      renderCards();
      linhaMensagem(`<span class="text-danger">${esc(err.message || "Não foi possível carregar.")}</span>`);
      renderSelecao();
      if (btnExportar) btnExportar.disabled = true;
      return;
    }
    render();
  }

  // ====== Marcar como pago ======
  async function marcarSelecionados() {
    if (state.pagando) return;
    const lista = itensVisiveis().filter((i) => aPagar(i) && state.selecionados.has(Number(i.id_fechamento)));
    if (!lista.length) return;
    const total = lista.reduce((s, i) => s + num(i.valor_final), 0);
    const divergentes = lista.filter((i) => i.precisa_reajuste).length;
    const semPix = lista.filter((i) => !(i.chave_pix || "").trim()).length;

    const linhas = lista
      .map((i) => `<tr><td>${esc(nomeMotoboy(i))}${i.precisa_reajuste ? ' <span class="fm-chip fm-chip--revisao">Precisa revisão</span>' : ""}</td><td class="text-end fm-num">${moeda(i.valor_final)}</td></tr>`)
      .join("");
    const avisos = [
      divergentes
        ? `${divergentes === 1 ? "1 fechamento teve" : `${divergentes} fechamentos tiveram`} o valor alterado depois de gerado e ${divergentes === 1 ? "será pago" : "serão pagos"} pelo valor gerado.`
        : "",
      semPix ? `${plural(semPix, "motoboy está", "motoboys estão")} sem chave PIX cadastrada.` : "",
    ].filter(Boolean);

    const conf = await Swal.fire({
      icon: divergentes ? "warning" : "question",
      title: `Marcar ${plural(lista.length, "pagamento", "pagamentos")}?`,
      html:
        `<p class="mb-2">Total <strong class="fm-num">${moeda(total)}</strong></p>` +
        `<div class="text-start border rounded" style="max-height:220px;overflow:auto"><table class="table table-sm mb-0"><tbody>${linhas}</tbody></table></div>` +
        avisos.map((a) => `<p class="small text-warning-emphasis mt-2 mb-0 text-start">${esc(a)}</p>`).join("") +
        '<p class="small text-muted mt-2 mb-0">Confirme somente depois de fazer as transferências.</p>',
      showCancelButton: true,
      confirmButtonText: lista.length === 1 ? "Marcar como pago" : "Marcar como pagos",
      cancelButtonText: "Cancelar",
      confirmButtonColor: COR_PRIMARIA,
      focusCancel: true,
    });
    if (!conf.isConfirmed) return;

    state.pagando = true;
    renderSelecao();
    const body = {
      periodo_inicio: (fltDataInicio?.value || "").trim(),
      periodo_fim: (fltDataFim?.value || "").trim(),
      todos_elegiveis: false,
      ids_fechamento: lista.map((i) => Number(i.id_fechamento)),
      confirmar_com_divergencia: true,
    };
    try {
      const data = await api(`${API_FECHAMENTOS}/marcar-pago`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      state.selecionados.clear();
      const qtd = num(data.marcados);
      Swal.fire({
        icon: "success",
        title: "Pagamento registrado",
        html: `<strong>${esc(plural(qtd, "fechamento pago", "fechamentos pagos"))}</strong> · total <strong class="fm-num">${moeda(total)}</strong>`,
        confirmButtonColor: COR_PRIMARIA,
      });
    } catch (err) {
      Swal.fire({ icon: "error", title: "Não foi possível registrar o pagamento", text: err.message || "Tente novamente.", confirmButtonColor: COR_PRIMARIA });
    } finally {
      state.pagando = false;
      await carregarLista();
    }
  }

  // ====== Copiar PIX ======
  function copiarViaSelecao(texto) {
    const tmp = document.createElement("textarea");
    tmp.value = texto;
    tmp.setAttribute("readonly", "");
    tmp.style.position = "fixed";
    tmp.style.opacity = "0";
    document.body.appendChild(tmp);
    tmp.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    tmp.remove();
    return ok;
  }

  async function copiarPix(btn) {
    const chave = btn.dataset.pix || "";
    let ok = false;
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(chave);
        ok = true;
      } catch (e) {
        ok = false;
      }
    }
    if (!ok) ok = copiarViaSelecao(chave);
    if (ok) {
      const icone = btn.querySelector("i");
      btn.classList.add("is-copiado");
      btn.title = "Copiado";
      if (icone) icone.className = "ri-check-line";
      setTimeout(() => {
        btn.classList.remove("is-copiado");
        btn.title = "Copiar chave PIX";
        if (icone) icone.className = "ri-file-copy-line";
      }, 1500);
      return;
    }
    Swal.fire({
      title: "Copie a chave PIX",
      html: `<input type="text" class="form-control text-center" readonly value="${esc(chave)}" id="apPixManual">` +
        `<div class="text-muted small mt-2">Seu navegador bloqueou a cópia automática. Use Ctrl+C.</div>`,
      confirmButtonText: "Fechar",
      confirmButtonColor: COR_PRIMARIA,
      didOpen: () => {
        const input = document.getElementById("apPixManual");
        if (input) input.select();
      },
    });
  }

  // ====== Exportar CSV ======
  function celulaCsv(v) {
    let s = String(v ?? "");
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function exportarCsv() {
    const lista = itensVisiveis();
    if (!lista.length) return;
    const cab = ["Motoboy", "Chave PIX", "Valor", "Período", "Situação", "Pago em"];
    const linhas = lista.map((i) => [
      nomeMotoboy(i),
      (i.chave_pix || "").trim(),
      num(i.valor_final).toFixed(2).replace(".", ","),
      periodoTexto(i.periodo_inicio, i.periodo_fim),
      (STATUS[statusDe(i)] || { label: statusDe(i) }).label,
      statusDe(i) === "PAGO" ? dataHora(i.pago_em) : "",
    ]);
    const csv = "\uFEFF" + [cab, ...linhas].map((l) => l.map(celulaCsv).join(";")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `a-pagar_${fltDataInicio?.value || ""}_${fltDataFim?.value || ""}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // ====== Eventos ======
  qs("#ap-cards")?.addEventListener("click", (ev) => {
    const card = ev.target.closest(".fm-card");
    if (!card) return;
    state.filtro = state.filtro === card.dataset.filtro ? "TODOS" : card.dataset.filtro;
    render();
  });

  tbody?.addEventListener("change", (ev) => {
    const chk = ev.target.closest(".chk-pagar");
    if (!chk) return;
    const id = Number(chk.value);
    if (chk.checked) state.selecionados.add(id);
    else state.selecionados.delete(id);
    chk.closest("tr")?.classList.toggle("fm-linha--selecionada", chk.checked);
    renderSelecao();
  });

  tbody?.addEventListener("click", (ev) => {
    const copiar = ev.target.closest(".fm-pix-copiar");
    if (copiar) {
      copiarPix(copiar);
      return;
    }
    const pdf = ev.target.closest(".btn-pdf");
    if (pdf) {
      const id = Number(pdf.dataset.id);
      if (window.TrackSaidasFechamentoPdf && id) window.TrackSaidasFechamentoPdf.gerar(id);
      return;
    }
    const revisar = ev.target.closest(".btn-revisar");
    if (revisar) {
      window.location.href = `tracking-entregadores-resumo.html?revisar=${encodeURIComponent(revisar.dataset.id)}`;
    }
  });

  chkTodos?.addEventListener("change", () => {
    const pagaveis = itensVisiveis().filter(aPagar);
    pagaveis.forEach((i) => {
      if (chkTodos.checked) state.selecionados.add(Number(i.id_fechamento));
      else state.selecionados.delete(Number(i.id_fechamento));
    });
    renderTabela();
  });

  qs("#btnLimparSelecao")?.addEventListener("click", () => {
    state.selecionados.clear();
    renderTabela();
  });
  btnMarcarPago?.addEventListener("click", marcarSelecionados);
  btnExportar?.addEventListener("click", exportarCsv);

  // ====== Período ======
  function atualizarRotuloPeriodo(start, end) {
    const label = qs("#a-pagar-period-label");
    if (label && start && end) label.textContent = `${dmy(start)} — ${dmy(end)}`;
  }

  const periodBtn = qs("#a-pagar-period-btn");
  const fecharPeriodo = () => {
    if (typeof bootstrap !== "undefined" && bootstrap.Dropdown && periodBtn) bootstrap.Dropdown.getInstance(periodBtn)?.hide();
  };
  if (typeof window.initDatePickerDashboard === "function") {
    const picker = window.initDatePickerDashboard({
      containerId: "a-pagar-date-picker-container",
      prefix: "a-pagar-dp",
      defaultPreset: "quinzena-ant",
      onApply: (start, end) => {
        if (fltDataInicio) fltDataInicio.value = start;
        if (fltDataFim) fltDataFim.value = end;
        atualizarRotuloPeriodo(start, end);
        fecharPeriodo();
        state.selecionados.clear();
        carregarLista();
      },
      onCancel: fecharPeriodo,
    });
    if (picker && picker.applyPreset) picker.applyPreset("quinzena-ant");
    const r = picker ? picker.getResolvedRange() : { start: "", end: "" };
    if (fltDataInicio) fltDataInicio.value = r.start;
    if (fltDataFim) fltDataFim.value = r.end;
    atualizarRotuloPeriodo(r.start, r.end);
    carregarLista();
  }
});
