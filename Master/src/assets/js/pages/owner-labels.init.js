/**
 * Aplica labels Base/Seller conforme tipo do owner (window.TIPO_OWNER).
 * Elementos com data-owner-term são atualizados.
 * Use window.ownerTerm("chave") em JS dinâmico (toasts, modais, PDF).
 */
(function () {
  "use strict";

  var LABELS = {
    base: { subbase: "Base", base: "Seller" },
    bases: { subbase: "Bases", base: "Sellers" },
    base_lower: { subbase: "base", base: "seller" },
    bases_lower: { subbase: "bases", base: "sellers" },
    a_base: { subbase: "a Base", base: "o Seller" },
    a_base_lower: { subbase: "a base", base: "o seller" },
    da_base: { subbase: "da Base", base: "do Seller" },
    da_base_lower: { subbase: "da base", base: "do seller" },
    uma_base: { subbase: "uma Base", base: "um Seller" },
    uma_base_lower: { subbase: "uma base", base: "um seller" },
    as_bases_lower: { subbase: "as bases", base: "os sellers" },
    esta_base_lower: { subbase: "esta base", base: "este seller" },
    fechamento_base: { subbase: "Fechamento de Bases", base: "Fechamento Seller" },
    fechamento_de_base: { subbase: "Fechamento de Base", base: "Fechamento Seller" },
    nova_base: { subbase: "Nova Base", base: "Novo Seller" },
    editar_base: { subbase: "Editar Base", base: "Editar Seller" },
    dados_da_base: { subbase: "Dados da Base", base: "Dados do Seller" },
    dados_da_base_selecionada: { subbase: "Dados da Base selecionada", base: "Dados do Seller selecionado" },
    selecione_detalhe: {
      subbase: "Selecione uma Base na lista acima para ver os detalhes de CNPJ e endereço.",
      base: "Selecione um Seller na lista acima para ver os detalhes de CNPJ e endereço.",
    },
    sem_dados_detalhe: {
      subbase: "Não há dados de CNPJ e endereço cadastrados para a Base selecionada.",
      base: "Não há dados de CNPJ e endereço cadastrados para o Seller selecionado.",
    },
    nome_da_base: { subbase: "Nome da Base", base: "Nome do Seller" },
    selecione_a_base: { subbase: "Selecione a Base", base: "Selecione o Seller" },
    selecione_uma_base: { subbase: "Selecione uma Base", base: "Selecione um Seller" },
    selecione_a_base_fechamento: {
      subbase: "Selecione a base para gerar o fechamento.",
      base: "Selecione o seller para gerar o fechamento.",
    },
    base_obrigatoria: { subbase: "Base obrigatória", base: "Seller obrigatório" },
    selecionar_base: { subbase: "Selecionar Base", base: "Selecionar Seller" },
    passo1_selecionar_base: { subbase: "Passo 1 — Selecionar Base", base: "Passo 1 — Selecionar Seller" },
    gerar_fechamento_base: { subbase: "Gerar Fechamento de Base", base: "Gerar Fechamento Seller" },
    reajustar_fechamento_base: { subbase: "Reajustar Fechamento de Base", base: "Reajustar Fechamento Seller" },
    excluir_base: { subbase: "Excluir base?", base: "Excluir seller?" },
    buscar_por_base: { subbase: "Buscar por base...", base: "Buscar por seller..." },
    buscar_codigo_entregador_base: {
      subbase: "Buscar por código, entregador ou base...",
      base: "Buscar por código, entregador ou seller...",
    },
    nenhuma_base_encontrada: { subbase: "Nenhuma base encontrada.", base: "Nenhum seller encontrado." },
    nenhuma_base_ativa: {
      subbase: "Nenhuma base ativa cadastrada. Cadastre uma base para registrar coletas.",
      base: "Nenhum seller ativo cadastrado. Cadastre um seller para registrar coletas.",
    },
    informe_nome_base: { subbase: "Informe o nome da base.", base: "Informe o nome do seller." },
    cnpj_da_entidade: { subbase: "CNPJ da Base", base: "CNPJ do Seller" },
    cnpj_help_owner_base: {
      subbase: "Obrigatório quando o Owner for do tipo Base (Seller).",
      base: "Obrigatório para Owner do tipo Base (Seller).",
    },
    cep_help_entidade: {
      subbase: "Digite o CEP e saia do campo para preencher automaticamente (obrigatório para a Base).",
      base: "Digite o CEP e saia do campo para preencher automaticamente (obrigatório para o Seller).",
    },
    bases_ativas: { subbase: "Bases Ativas", base: "Sellers Ativos" },
    bases_com_sem_coletas: { subbase: "Bases com e sem coletas por dia", base: "Sellers com e sem coletas por dia" },
    bases_sem_coletas: { subbase: "Bases sem coletas registradas", base: "Sellers sem coletas registradas" },
    ver_bases_sem_coletas: { subbase: "Ver bases sem coletas", base: "Ver sellers sem coletas" },
    ver_bases_sem_coletas_dia: { subbase: "Ver bases sem coletas por dia", base: "Ver sellers sem coletas por dia" },
    ranking_por_base: { subbase: "Ranking por Base", base: "Ranking por Seller" },
    ranking_por_base_cliente: { subbase: "Ranking por Base/Cliente", base: "Ranking por Seller" },
    volume_coletas_por_base: { subbase: "Volume de coletas registradas por base", base: "Volume de coletas registradas por seller" },
    ganho_por_base: { subbase: "Ganho por Base", base: "Ganho por Seller" },
    rentabilidade_por_base: { subbase: "Rentabilidade por Base", base: "Rentabilidade por Seller" },
    ranking_bases_lucro: {
      subbase: "Ranking de bases ordenado por lucro líquido",
      base: "Ranking de sellers ordenado por lucro líquido",
    },
    todas_as_bases: { subbase: "Todas as bases", base: "Todos os sellers" },
    nenhuma_base_periodo: { subbase: "Nenhuma base no período.", base: "Nenhum seller no período." },
    nenhuma_base_sem_coletas: {
      subbase: "Nenhuma base sem coletas no período.",
      base: "Nenhum seller sem coletas no período.",
    },
    ja_existe_nome: {
      subbase: "Já existe uma base com esse nome nesta sub-base.",
      base: "Já existe um seller com esse nome nesta sub-base.",
    },
    base_atualizada: { subbase: "Base atualizada com sucesso.", base: "Seller atualizado com sucesso." },
    base_criada: { subbase: "Base criada com sucesso.", base: "Seller criado com sucesso." },
    selecione_base_antes_registrar: {
      subbase: "Selecione a base antes de registrar.",
      base: "Selecione o seller antes de registrar.",
    },
    selecione_base_antes_reenviar: {
      subbase: "Selecione uma base antes de reenviar.",
      base: "Selecione um seller antes de reenviar.",
    },
    selecione_a_base_toast: { subbase: "Selecione a base", base: "Selecione o seller" },
    selecione_base_inatividade: {
      subbase: "Selecione a base novamente (inatividade).",
      base: "Selecione o seller novamente (inatividade).",
    },
    falha_carregar_bases: { subbase: "Falha ao carregar bases.", base: "Falha ao carregar sellers." },
    erro_carregar_bases: { subbase: "Erro ao carregar bases.", base: "Erro ao carregar sellers." },
    informe_a_base: { subbase: "É necessário informar a base.", base: "É necessário informar o seller." },
    selecione_uma_base_toast: { subbase: "Selecione uma base.", base: "Selecione um seller." },
    selecione_uma_base_validator: { subbase: "Selecione uma base", base: "Selecione um seller" },
    ja_existe_fechamento: {
      subbase: "Já existe um fechamento gerado para esta base e período. Deseja reajustar?",
      base: "Já existe um fechamento gerado para este seller e período. Deseja reajustar?",
    },
    ha_mais_de_uma_base: {
      subbase: "Há mais de uma base com fechamento GERADO. Escolha qual deseja reajustar.",
      base: "Há mais de um seller com fechamento GERADO. Escolha qual deseja reajustar.",
    },
    reajustar_selecione: { subbase: "Reajustar: selecione a base", base: "Reajustar: selecione o seller" },
    escolha_base_cobranca: {
      subbase: "Para gerar a cobrança, escolha uma base específica.",
      base: "Para gerar a cobrança, escolha um seller específico.",
    },
    cnpj_obrigatorio_entidade: { subbase: "CNPJ é obrigatório para a Base.", base: "CNPJ é obrigatório para o Seller." },
    cep_obrigatorio_entidade: {
      subbase: "CEP é obrigatório e deve ter 8 dígitos para a Base.",
      base: "CEP é obrigatório e deve ter 8 dígitos para o Seller.",
    },
    rua_obrigatoria_entidade: { subbase: "Rua é obrigatória para a Base.", base: "Rua é obrigatória para o Seller." },
    numero_obrigatorio_entidade: { subbase: "Número é obrigatório para a Base.", base: "Número é obrigatório para o Seller." },
    bairro_obrigatorio_entidade: { subbase: "Bairro é obrigatório para a Base.", base: "Bairro é obrigatório para o Seller." },
    cidade_obrigatoria_entidade: { subbase: "Cidade é obrigatória para a Base.", base: "Cidade é obrigatória para o Seller." },
    falha_salvar_dados: { subbase: "Falha ao salvar dados da Base.", base: "Falha ao salvar dados do Seller." },
    base_obrigatoria_nao_coletado: {
      subbase: "Base obrigatória para 'Não Coletado'.",
      base: "Seller obrigatório para 'Não Coletado'.",
    },
    lancamento_mesma_data_base: {
      subbase: "Já existe um lançamento para essa mesma data e base. Use Editar no registro existente.",
      base: "Já existe um lançamento para essa mesma data e seller. Use Editar no registro existente.",
    },
  };

  var TITLE_MAP = {
    subbase: {
      Sellers: "Bases",
      "Fechamento Seller": "Fechamento de Bases",
    },
    base: {
      Bases: "Sellers",
      "Fechamento de Bases": "Fechamento Seller",
    },
  };

  function getTipo() {
    var t = window.TIPO_OWNER || (window.__USER__ && window.__USER__.tipo_owner) || "subbase";
    return (t + "").toLowerCase() === "base" ? "base" : "subbase";
  }

  function ownerTerm(term, fallback) {
    var labels = LABELS[(term || "").trim().toLowerCase()];
    if (!labels) return fallback != null ? fallback : term;
    var text = labels[getTipo()];
    return text != null ? text : fallback != null ? fallback : term;
  }

  function applyDocumentTitle() {
    var raw = document.title || "";
    var suffix = " | Tracking Saídas";
    var main = raw.endsWith(suffix) ? raw.slice(0, -suffix.length) : raw;
    var mapped = TITLE_MAP[getTipo()][main];
    if (mapped) document.title = mapped + suffix;
  }

  function applyOwnerLabels() {
    var tipo = getTipo();
    document.querySelectorAll("[data-owner-term]").forEach(function (el) {
      var term = (el.getAttribute("data-owner-term") || "").trim().toLowerCase();
      if (!term) return;
      var labels = LABELS[term];
      if (!labels) return;
      var text = labels[tipo];
      if (text === undefined) return;
      var attr = (el.getAttribute("data-owner-attr") || "").trim().toLowerCase();
      if (el.tagName === "TITLE") {
        document.title = text + " | Tracking Saídas";
        return;
      }
      if (attr === "placeholder" || (!attr && (el.tagName === "INPUT" || el.tagName === "TEXTAREA"))) {
        el.setAttribute("placeholder", text);
        return;
      }
      if (attr && attr !== "text") {
        el.setAttribute(attr, text);
        return;
      }
      el.textContent = text;
    });
    applyDocumentTitle();
  }

  window.ownerTerm = ownerTerm;
  window.applyOwnerLabels = applyOwnerLabels;
  window.isOwnerTipoBase = function () {
    return getTipo() === "base";
  };

  document.addEventListener("DOMContentLoaded", function () {
    applyOwnerLabels();
    setTimeout(applyOwnerLabels, 400);
  });
})();
