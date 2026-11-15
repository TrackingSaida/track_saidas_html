(async function () {
  "use strict";

  if (typeof window.ensureAuth === "function") {
    try { await window.ensureAuth(); } catch (_) {}
  }

  const $ = (id) => document.getElementById(id);
  const listaEl = $("conf-lista");
  const detalheEl = $("conf-detalhe");
  const statusEl = $("conf-status");
  const dataEl = $("conf-data");
  const nomeEl = $("conf-nome");
  const listaCountEl = $("conf-lista-count");
  let aba = "pendente";
  let itens = [];
  let contagens = { pendente: 0, reconferir: 0, conferida: 0 };
  let detalhe = null;
  let selecionadoId = null;
  let carregando = false;
  let conferindo = false;

  function hojeIso() {
    const agora = new Date();
    const mes = String(agora.getMonth() + 1).padStart(2, "0");
    const dia = String(agora.getDate()).padStart(2, "0");
    return `${agora.getFullYear()}-${mes}-${dia}`;
  }

  function dataBr(iso) {
    const partes = String(iso || "").split("-");
    if (partes.length !== 3) return iso || "—";
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
  }

  function horaBr(iso) {
    if (!iso) return "";
    const data = new Date(iso);
    if (Number.isNaN(data.getTime())) return "";
    return data.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  function escapeHtml(text) {
    return String(text == null ? "" : text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function rotuloStatus(status) {
    if (status === "reconferir") return "Reconferir";
    if (status === "conferida") return "Concluída";
    return "Pendente";
  }

  function classeStatus(status) {
    if (status === "conferida") return "bg-success-subtle text-success";
    if (status === "reconferir") return "bg-danger-subtle text-danger";
    return "bg-warning-subtle text-warning-emphasis";
  }

  function mensagemStatus(texto) {
    if (statusEl) statusEl.textContent = texto || "";
  }

  function itensFiltrados() {
    const q = String(nomeEl?.value || "").trim().toLocaleLowerCase("pt-BR");
    if (!q) return itens;
    return itens.filter((item) => String(item.motoboy_nome || "").toLocaleLowerCase("pt-BR").includes(q));
  }

  function chaveItem(item) {
    return String(item?.id ?? "");
  }

  function pintarContagensAbas() {
    document.querySelectorAll("[data-count-aba]").forEach((el) => {
      const key = el.getAttribute("data-count-aba");
      const n = Number(contagens[key] || 0);
      el.textContent = String(n);
    });
  }

  function pintarLista() {
    if (!listaEl) return;
    const visiveis = itensFiltrados();
    if (listaCountEl) {
      listaCountEl.textContent = carregando && itens.length === 0
        ? ""
        : (visiveis.length ? `${visiveis.length} lote(s)` : "");
    }
    if (carregando && itens.length === 0) {
      listaEl.innerHTML = '<p class="conf-empty">Carregando conferências…</p>';
      return;
    }
    if (visiveis.length === 0) {
      listaEl.innerHTML = '<p class="conf-empty">Não há lotes nesta aba para a data.</p>';
      return;
    }
    listaEl.innerHTML = visiveis.map((item) => {
      const id = chaveItem(item);
      const quando = horaBr(item.ultima_abertura_em || item.conferido_em);
      const lote = item.sessao_id != null ? "Lote da sessão" : "Lote do dia";
      const selected = id && id === String(selecionadoId);
      return (
        '<button type="button" class="conf-lote' + (selected ? " is-selected" : "") +
          '" data-id="' + escapeHtml(id) + '" role="option" aria-selected="' + (selected ? "true" : "false") + '">' +
          '<span class="conf-lote__nome">' + escapeHtml(item.motoboy_nome || "Motoboy") + "</span>" +
          '<span class="conf-lote__meta">' + escapeHtml(lote) + " · " + escapeHtml(dataBr(item.data_ref)) +
            (quando ? " · " + escapeHtml(quando) : "") +
            " · " + Number(item.qtd_no_momento || 0) + " pacote(s)</span>" +
          '<span class="badge conf-lote__badge ' + classeStatus(item.status) + '">' +
            escapeHtml(rotuloStatus(item.status)) + "</span>" +
        "</button>"
      );
    }).join("");
    listaEl.querySelectorAll("button[data-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const item = itens.find((row) => chaveItem(row) === btn.getAttribute("data-id"));
        if (item) void abrirDetalhe(item);
      });
    });
  }

  function metricasHtml(total, shopee, ml, avulso) {
    function card(classe, label, valor) {
      return (
        '<div class="col-6 col-md-3">' +
          '<div class="p-3 rounded text-center ' + classe + '">' +
            '<span class="fw-semibold d-block">' + label + "</span>" +
            '<div class="fs-5 fw-semibold">' + Number(valor || 0) + "</div>" +
          "</div>" +
        "</div>"
      );
    }
    return (
      '<div class="row g-2 mb-3 conf-metrics" aria-label="Quantidade operacional">' +
        card("card-shopee", "Shopee", shopee) +
        card("card-ml", "Mercado Livre", ml) +
        card("card-avulso", "Avulso", avulso) +
        card("card-total", "Total", total) +
      "</div>"
    );
  }

  function pacotesNovosHtml(pacotes) {
    const rows = Array.isArray(pacotes) ? pacotes : [];
    if (!rows.length) return "";
    return (
      '<div class="mt-3">' +
        '<p class="fw-semibold mb-2">Pacotes novos para reconferir</p>' +
        '<div class="table-responsive">' +
          '<table class="table table-sm table-hover conf-pacotes">' +
            "<thead><tr><th>Código</th><th>Serviço</th><th>Status</th></tr></thead>" +
            "<tbody>" +
            rows.map((p) => (
              "<tr>" +
                "<td>" + escapeHtml(p.codigo || "—") + "</td>" +
                "<td>" + escapeHtml(p.servico || "—") + "</td>" +
                "<td>" + escapeHtml(p.status || "—") + "</td>" +
              "</tr>"
            )).join("") +
            "</tbody>" +
          "</table>" +
        "</div>" +
      "</div>"
    );
  }

  function pintarDetalhe() {
    if (!detalheEl) return;
    if (!detalhe) {
      detalheEl.innerHTML =
        '<p class="conf-empty">Selecione um lote à esquerda para conferir a quantidade operacional.</p>';
      return;
    }
    const operacional = detalhe.operacional_total != null ? detalhe.operacional_total : detalhe.total;
    const shopee = detalhe.operacional_shopee != null ? detalhe.operacional_shopee : detalhe.sum_shopee;
    const ml = detalhe.operacional_ml != null ? detalhe.operacional_ml : detalhe.sum_mercado;
    const avulso = detalhe.operacional_avulso != null ? detalhe.operacional_avulso : detalhe.sum_avulso;
    const temSnapshot = detalhe.snapshot_total != null;
    const snapshotDifere = temSnapshot && Number(detalhe.snapshot_total) !== Number(operacional);
    const podeConferir = detalhe.status !== "conferida";
    const labelAcao = detalhe.status === "reconferir" ? "Reconferir saída" : "Conferir saída";

    detalheEl.innerHTML =
      '<div class="conf-detalhe__body">' +
        '<div class="conf-detalhe__head">' +
          "<div>" +
            '<p class="conf-detalhe__nome">' + escapeHtml(detalhe.motoboy_nome || "Motoboy") + "</p>" +
            '<p class="conf-detalhe__sub">' + escapeHtml(dataBr(detalhe.data_ref)) +
              (detalhe.sessao_id != null ? " · Lote da sessão" : " · Lote do dia") +
            "</p>" +
          "</div>" +
          '<span class="badge ' + classeStatus(detalhe.status) + '">' +
            escapeHtml(rotuloStatus(detalhe.status)) +
          "</span>" +
        "</div>" +
        '<p class="small text-muted mb-2">Quantidade operacional — pacotes que ainda estão com este motoboy</p>' +
        metricasHtml(operacional, shopee, ml, avulso) +
        (temSnapshot
          ? '<div class="alert alert-light border mb-0" role="note">' +
              "<strong>Registro da finalização.</strong> " +
              Number(detalhe.snapshot_total) + " pacote(s) foram congelados" +
              " (Shopee " + Number(detalhe.snapshot_shopee || 0) +
              ", Mercado Livre " + Number(detalhe.snapshot_ml || 0) +
              ", Avulso " + Number(detalhe.snapshot_avulso || 0) + "). " +
              (snapshotDifere
                ? "A operação mostra só os pacotes que ainda estão com este motoboy. O registro original não é reescrito."
                : "Este registro permanece disponível para auditoria.") +
            "</div>"
          : "") +
        pacotesNovosHtml(detalhe.novos_pacotes) +
      "</div>" +
      '<div class="conf-detalhe__footer">' +
        (podeConferir
          ? '<button type="button" class="btn btn-success" id="conf-concluir" ' +
              (conferindo ? "disabled" : "") + ">" +
              (conferindo ? "Conferindo…" : labelAcao) +
            "</button>" +
            '<span class="small text-muted">Confirma a quantidade operacional deste lote.</span>'
          : '<p class="text-muted mb-0">Este lote já foi conferido.</p>') +
      "</div>";
    $("conf-concluir")?.addEventListener("click", () => void concluirConferencia());
  }

  async function carregarContagensAbas(dataIso) {
    if (!window.TrackAPI?.listarConferenciasSaida) return;
    const abas = ["pendente", "reconferir", "conferida"];
    const resultados = await Promise.all(
      abas.map((a) =>
        window.TrackAPI.listarConferenciasSaida({
          data_inicio: dataIso,
          data_fim: dataIso,
          aba: a
        })
      )
    );
    const next = { pendente: 0, reconferir: 0, conferida: 0 };
    resultados.forEach((res, idx) => {
      if (!res?.ok) return;
      const lista = Array.isArray(res.data?.items) ? res.data.items : [];
      next[abas[idx]] = lista.length;
    });
    contagens = next;
    pintarContagensAbas();
  }

  async function carregarLista() {
    if (!window.TrackAPI?.listarConferenciasSaida) {
      mensagemStatus("A consulta de conferência não está disponível nesta tela.");
      return;
    }
    const dataIso = dataEl?.value || hojeIso();
    carregando = true;
    mensagemStatus("Carregando conferências…");
    pintarLista();
    const [res] = await Promise.all([
      window.TrackAPI.listarConferenciasSaida({
        data_inicio: dataIso,
        data_fim: dataIso,
        aba
      }),
      carregarContagensAbas(dataIso)
    ]);
    carregando = false;
    if (res?.status === 0) {
      itens = [];
      mensagemStatus("Sem conexão para carregar as conferências.");
      pintarLista();
      return;
    }
    if (!res?.ok) {
      itens = [];
      mensagemStatus(res?.error || "Não foi possível carregar as conferências.");
      pintarLista();
      return;
    }
    itens = Array.isArray(res.data?.items) ? res.data.items : [];
    contagens = { ...contagens, [aba]: itens.length };
    pintarContagensAbas();
    if (selecionadoId && !itens.some((row) => chaveItem(row) === String(selecionadoId))) {
      selecionadoId = null;
      detalhe = null;
      pintarDetalhe();
    }
    mensagemStatus(itens.length ? "" : "Não há lotes nesta aba para a data.");
    pintarLista();
    const visiveis = itensFiltrados();
    if (!selecionadoId && visiveis.length) {
      await abrirDetalhe(visiveis[0]);
    }
  }

  async function abrirDetalhe(item) {
    selecionadoId = chaveItem(item);
    pintarLista();
    mensagemStatus("Abrindo o lote…");
    const res = await window.TrackAPI.detalheConferenciaSaida({
      motoboy_id: item.motoboy_id,
      data_ref: item.data_ref,
      sessao_id: item.sessao_id
    });
    if (res?.status === 409 || res?.code === "SESSAO_VERSAO_CONFLITO") {
      mensagemStatus("O lote mudou. Atualizamos a lista.");
      detalhe = null;
      selecionadoId = null;
      pintarDetalhe();
      await carregarLista();
      return;
    }
    if (!res?.ok) {
      mensagemStatus(res?.status === 0 ? "Sem conexão para abrir o lote." : (res?.error || "Não foi possível abrir o lote."));
      return;
    }
    detalhe = res.data;
    mensagemStatus("");
    pintarDetalhe();
  }

  async function concluirConferencia() {
    if (!detalhe || conferindo) return;
    conferindo = true;
    pintarDetalhe();
    const res = await window.TrackAPI.conferirSaida({
      motoboy_id: detalhe.motoboy_id,
      data_ref: detalhe.data_ref,
      sessao_id: detalhe.sessao_id
    });
    conferindo = false;
    if (res?.status === 409 || res?.code === "SESSAO_VERSAO_CONFLITO") {
      mensagemStatus("O lote foi alterado por outra pessoa. Atualizamos a conferência.");
      detalhe = null;
      selecionadoId = null;
      pintarDetalhe();
      await carregarLista();
      return;
    }
    if (!res?.ok) {
      mensagemStatus(res?.status === 0 ? "Sem conexão para concluir a conferência." : (res?.error || "Não foi possível concluir a conferência."));
      pintarDetalhe();
      return;
    }
    detalhe = res.data;
    mensagemStatus(detalhe?.status === "conferida" ? "Saída conferida." : "Conferência atualizada.");
    pintarDetalhe();
    await carregarLista();
  }

  if (dataEl && !dataEl.value) dataEl.value = hojeIso();
  document.querySelectorAll("[data-aba]").forEach((btn) => {
    btn.addEventListener("click", () => {
      aba = btn.getAttribute("data-aba") || "pendente";
      document.querySelectorAll("[data-aba]").forEach((outro) => {
        const ativo = outro === btn;
        outro.classList.toggle("active", ativo);
        outro.setAttribute("aria-selected", ativo ? "true" : "false");
      });
      detalhe = null;
      selecionadoId = null;
      pintarDetalhe();
      void carregarLista();
    });
  });
  nomeEl?.addEventListener("input", pintarLista);
  dataEl?.addEventListener("change", () => {
    detalhe = null;
    selecionadoId = null;
    pintarDetalhe();
    void carregarLista();
  });
  $("conf-atualizar")?.addEventListener("click", () => void carregarLista());
  void carregarLista();
})();
