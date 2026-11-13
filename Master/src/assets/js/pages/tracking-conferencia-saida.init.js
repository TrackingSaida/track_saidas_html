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
  let aba = "pendente";
  let itens = [];
  let detalhe = null;
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

  function pintarLista() {
    if (!listaEl) return;
    const visiveis = itensFiltrados();
    if (carregando && itens.length === 0) {
      listaEl.innerHTML = '<p class="text-muted mb-0">Carregando conferências…</p>';
      return;
    }
    if (visiveis.length === 0) {
      listaEl.innerHTML = '<p class="text-muted mb-0">Não há lotes nesta aba para a data.</p>';
      return;
    }
    listaEl.innerHTML = visiveis.map((item) => {
      const quando = horaBr(item.ultima_abertura_em || item.conferido_em);
      const lote = item.sessao_id != null ? "Lote da sessão" : "Lote do dia";
      return (
        '<button type="button" class="btn btn-light text-start border" data-id="' + item.id + '">' +
          '<span class="fw-semibold d-block">' + escapeHtml(item.motoboy_nome || "Motoboy") + "</span>" +
          '<span class="small text-muted d-block">' + escapeHtml(lote) + " · " + escapeHtml(dataBr(item.data_ref)) +
            (quando ? " · " + escapeHtml(quando) : "") +
            " · " + Number(item.qtd_no_momento || 0) + " pacote(s) na operação</span>" +
          '<span class="badge ' + classeStatus(item.status) + ' mt-2">' + escapeHtml(rotuloStatus(item.status)) + "</span>" +
        "</button>"
      );
    }).join("");
    listaEl.querySelectorAll("button[data-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const item = itens.find((row) => String(row.id) === btn.getAttribute("data-id"));
        if (item) void abrirDetalhe(item);
      });
    });
  }

  function linhaTotal(label, valor) {
    return '<div class="col-6 col-md-3"><div class="p-3 rounded border text-center"><span class="fw-semibold">' +
      escapeHtml(label) + '</span><div class="fs-5 fw-semibold">' + Number(valor || 0) + "</div></div></div>";
  }

  function pintarDetalhe() {
    if (!detalheEl) return;
    if (!detalhe) {
      detalheEl.innerHTML = '<p class="text-muted mb-0">Selecione um lote para ver a quantidade operacional e o registro da finalização.</p>';
      return;
    }
    const operacional = detalhe.operacional_total != null ? detalhe.operacional_total : detalhe.total;
    const shopee = detalhe.operacional_shopee != null ? detalhe.operacional_shopee : detalhe.sum_shopee;
    const ml = detalhe.operacional_ml != null ? detalhe.operacional_ml : detalhe.sum_mercado;
    const avulso = detalhe.operacional_avulso != null ? detalhe.operacional_avulso : detalhe.sum_avulso;
    const temSnapshot = detalhe.snapshot_total != null;
    const snapshotDifere = temSnapshot && Number(detalhe.snapshot_total) !== Number(operacional);
    const podeConferir = detalhe.status !== "conferida";
    detalheEl.innerHTML =
      '<p class="fw-semibold mb-1">' + escapeHtml(detalhe.motoboy_nome || "Motoboy") + "</p>" +
      '<p class="small text-muted">Situação da conferência: ' + escapeHtml(rotuloStatus(detalhe.status)) +
        " · " + escapeHtml(dataBr(detalhe.data_ref)) + "</p>" +
      '<p class="mb-2">Quantidade operacional</p>' +
      '<div class="row g-2 mb-3">' +
        linhaTotal("Total", operacional) +
        linhaTotal("Shopee", shopee) +
        linhaTotal("ML", ml) +
        linhaTotal("Avulso", avulso) +
      "</div>" +
      (temSnapshot
        ? '<div class="alert alert-light border mb-3" role="note">' +
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
      (podeConferir
        ? '<button type="button" class="btn btn-success" id="conf-concluir" ' + (conferindo ? "disabled" : "") + ">" +
            (detalhe.status === "reconferir" ? "Reconferir saída" : "Conferir saída") +
          "</button>"
        : '<p class="text-muted mb-0">Este lote já foi conferido.</p>');
    $("conf-concluir")?.addEventListener("click", () => void concluirConferencia());
  }

  async function carregarLista() {
    if (!window.TrackAPI?.listarConferenciasSaida) {
      mensagemStatus("A consulta de conferência não está disponível nesta tela.");
      return;
    }
    carregando = true;
    mensagemStatus("Carregando conferências…");
    pintarLista();
    const res = await window.TrackAPI.listarConferenciasSaida({
      data_inicio: dataEl?.value || hojeIso(),
      data_fim: dataEl?.value || hojeIso(),
      aba
    });
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
    mensagemStatus(itens.length ? "" : "Não há lotes nesta aba para a data.");
    pintarLista();
  }

  async function abrirDetalhe(item) {
    mensagemStatus("Abrindo o lote…");
    const res = await window.TrackAPI.detalheConferenciaSaida({
      motoboy_id: item.motoboy_id,
      data_ref: item.data_ref,
      sessao_id: item.sessao_id
    });
    if (res?.status === 409 || res?.code === "SESSAO_VERSAO_CONFLITO") {
      mensagemStatus("O lote mudou. Atualizamos a lista.");
      detalhe = null;
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
      document.querySelectorAll("[data-aba]").forEach((outro) => outro.classList.toggle("active", outro === btn));
      detalhe = null;
      pintarDetalhe();
      void carregarLista();
    });
  });
  nomeEl?.addEventListener("input", pintarLista);
  dataEl?.addEventListener("change", () => void carregarLista());
  $("conf-atualizar")?.addEventListener("click", () => void carregarLista());
  void carregarLista();
})();
