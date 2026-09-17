(function () {
  "use strict";

  var ADMIN_ROLES = [0, 1];
  var WEB_ROLES = [0, 1, 2, 3];

  var JOURNEYS = [
    {
      id: "configurar",
      title: "Começar a configurar",
      roles: ADMIN_ROLES,
      topics: [
        {
          id: "ordem",
          title: "Ordem recomendada",
          summary: "O que fazer antes de começar o dia.",
          roles: ADMIN_ROLES,
          steps: [
            {
              title: "Entenda os perfis",
              text: "Administrador configura e fecha o financeiro. Operador registra e consulta o dia. Motoboy usa o aplicativo.",
            },
            {
              title: "Cadastre {bases}",
              text: "Em Cadastros, crie {as_bases_lower} que vão aparecer nas coletas e no fechamento.",
            },
            {
              title: "Cadastre usuários",
              text: "Crie o administrador da operação, os operadores e os motoboys com as permissões certas.",
            },
            {
              title: "Confira os preços",
              text: "Ajuste os valores de entrega antes do primeiro fechamento.",
            },
            {
              title: "Comece a operar",
              text: "Com o cadastro pronto, use Registrar Saídas no dia a dia e feche o período em Financeiro.",
            },
          ],
        },
        {
          id: "perfis",
          title: "Perfis de usuário",
          summary: "O que cada pessoa vê no painel.",
          roles: ADMIN_ROLES,
          steps: [
            {
              title: "Administrador",
              text: "Vê Cadastros, Configuração, Financeiro e Indicadores. É quem configura o sistema e gera fechamentos.",
            },
            {
              title: "Operador",
              text: "Fica na operação do dia: registrar saídas, lançar avulso, consultar registros e acompanhar o andamento.",
            },
            {
              title: "Motoboy",
              text: "Não usa este painel. Entra pelo aplicativo para inserir pacotes, preparar rota e dar baixa nas entregas.",
            },
            {
              title: "Root",
              text: "Perfil interno. Além do que o administrador vê, acessa Owners e o indicador Admin.",
            },
          ],
        },
        {
          id: "bases",
          title: "Cadastrar {bases}",
          summary: "Clientes usados em coletas e fechamento.",
          href: "tracking-base.html",
          roles: ADMIN_ROLES,
          coleta: true,
          steps: [
            {
              title: "Abra Cadastros",
              text: "No menu, abra {bases}. Se o seu owner for do tipo Base, este item aparece como Sellers.",
            },
            {
              title: "Clique em Adicionar",
              text: "Informe o nome {da_base_lower}. Esse nome aparece nas coletas, nos registros e no fechamento.",
            },
            {
              title: "Preencha os valores",
              text: "Informe os valores de Flex, Shopee e Avulso quando {a_base_lower} tiver preço próprio.",
            },
            {
              title: "Salve e mantenha ativo",
              text: "Deixe {a_base_lower} ativa. Cadastros inativos não entram nas novas leituras.",
            },
          ],
        },
        {
          id: "usuarios",
          title: "Cadastrar usuários e motoboys",
          summary: "Perfis, login e permissões de avulso.",
          href: "tracking-usuarios.html",
          roles: ADMIN_ROLES,
          steps: [
            {
              title: "Abra Cadastros → Usuários",
              text: "Clique em Adicionar. Escolha o perfil: Administrador, Operador ou Motoboy.",
            },
            {
              title: "Administrador e operador",
              text: "Username e e-mail são obrigatórios. Eles entram no painel web com senha.",
            },
            {
              title: "Motoboy",
              text: "Preencha os dados do motoboy, incluindo documento e endereço. Username e e-mail não são obrigatórios.",
            },
            {
              title: "Permissões do motoboy",
              text: "Marque se ele pode ler saídas, lançar avulso e se o avulso exige foto. Use Avulso (todos) para aplicar a todos da base.",
            },
            {
              title: "Salve",
              text: "O motoboy passa a aparecer em Registrar Saídas e no aplicativo, conforme as permissões.",
            },
          ],
        },
        {
          id: "precos",
          title: "Preços de entrega",
          summary: "Valores usados no fechamento.",
          href: "tracking-valores-entrega.html",
          roles: ADMIN_ROLES,
          steps: [
            {
              title: "Abra Cadastros → Preços de Entrega",
              text: "A tela mostra os valores padrão e as exceções por entregador.",
            },
            {
              title: "Use exceção só quando precisar",
              text: "Clique em Adicionar Exceção para um motoboy com preço diferente do padrão.",
            },
            {
              title: "Confira antes do fechamento",
              text: "Os valores daqui entram no Fechamento de Motoboys. Ajuste antes de gerar o período.",
            },
          ],
        },
        {
          id: "campos",
          title: "Comprovante da entrega",
          summary: "O que o motoboy precisa preencher na baixa, por serviço.",
          href: "tracking-campos-obrigatorios-servico.html",
          roles: ADMIN_ROLES,
          steps: [
            {
              title: "Abra Configuração → Comprovante da entrega",
              text: "Clique em Nova regra para definir o que é obrigatório em cada serviço.",
            },
            {
              title: "Escolha o serviço e o contexto",
              text: "A regra vale para aquele serviço no momento da entrega ou da ausência, como foto ou recebedor.",
            },
            {
              title: "Salve a regra",
              text: "O aplicativo passa a exigir esses dados na baixa. Regras inativas não são aplicadas.",
            },
          ],
        },
        {
          id: "dados-avulso",
          title: "Dados do avulso",
          summary: "O que identificar um pacote sem etiqueta de marketplace.",
          href: "tracking-campos-avulso.html",
          roles: ADMIN_ROLES,
          steps: [
            {
              title: "Abra Configuração → Dados do avulso",
              text: "Cadastre o que o operador preenche no lançamento: primeiro nome, segundo nome, CEP, telefone.",
            },
            {
              title: "Escolha o tipo pelo formato",
              text: "Nome e bairro são Texto. CEP, telefone, número, lista e foto têm validação própria.",
            },
            {
              title: "Marque identificação e lista",
              text: "Identificação entra na busca. Exibir na seleção mostra o valor na lista do dia para o motoboy.",
            },
          ],
        },
        {
          id: "autenticacao",
          title: "Conectar sellers",
          summary: "Link de autorização das plataformas.",
          href: "tracking-autenticacao.html",
          roles: ADMIN_ROLES,
          baseOnly: true,
          steps: [
            {
              title: "Abra Cadastros → Autenticação",
              text: "Esta tela aparece quando o owner é do tipo Base (Seller).",
            },
            {
              title: "Gere o link",
              text: "Selecione Mercado Livre ou Shopee e clique em Gerar link.",
            },
            {
              title: "Envie ao seller",
              text: "Depois que ele autorizar, o seller entra na lista de conectados.",
            },
          ],
        },
        {
          id: "owners",
          title: "Owners e flags da operação",
          summary: "Tipo Base/Subbase, coleta e entrada.",
          href: "admin-owners.html",
          roles: [0],
          rootOnly: true,
          steps: [
            {
              title: "Abra Configuração → Owners",
              text: "Selecione o owner e clique em Editar.",
            },
            {
              title: "Tipo Base ou Subbase",
              text: "Owner Base troca os nomes do menu para Seller. Owner Subbase mantém Bases.",
            },
            {
              title: "Coleta e entrada",
              text: "Ignorar coleta esconde telas de coleta. Entrada obrigatória libera Registrar Entrada.",
            },
          ],
        },
      ],
    },
    {
      id: "operar",
      title: "Operar no dia a dia",
      roles: WEB_ROLES,
      topics: [
        {
          id: "saidas",
          title: "Registrar saídas",
          summary: "Ler códigos e vincular ao motoboy.",
          href: "tracking-leitura.html",
          roles: WEB_ROLES,
          steps: [
            {
              title: "Abra Operação → Registrar Saídas",
              text: "Selecione o motoboy. Sem motoboy, a leitura não é registrada.",
            },
            {
              title: "Bipe ou digite o código",
              text: "Use o campo Código. Se preferir a câmera, clique no ícone ao lado do campo.",
            },
            {
              title: "Clique em Registrar",
              text: "O pacote entra na sessão atual. O resumo no topo mostra o que já foi lido.",
            },
            {
              title: "Modo Monitor",
              text: "Use Modo Monitor quando o scanner estiver no computador e os números precisarem aparecer grandes.",
            },
          ],
        },
        {
          id: "avulso",
          title: "Lançar avulso",
          summary: "Pacote sem código de marketplace.",
          href: "tracking-leitura.html",
          roles: WEB_ROLES,
          steps: [
            {
              title: "Na tela de leituras",
              text: "Com o motoboy selecionado, clique em Lançar Avulso. O botão também existe na leitura de coletas, quando a coleta está habilitada.",
            },
            {
              title: "Informe os dados",
              text: "Preencha os dados do avulso configurados em Configuração → Dados do avulso. Confirme para gravar o pacote.",
            },
            {
              title: "Foto, se for obrigatória",
              text: "Alguns motoboys exigem foto no avulso. Essa regra é definida em Usuários, no cadastro do entregador.",
            },
            {
              title: "Confira em Registros",
              text: "O avulso aparece em Registros Gerais e entra no fechamento do motoboy.",
            },
          ],
        },
        {
          id: "coletas",
          title: "Registrar coletas",
          summary: "Entrada de volume por {base_lower}.",
          href: "tracking-coleta-leitura.html",
          roles: WEB_ROLES,
          coleta: true,
          coletaLeitura: true,
          steps: [
            {
              title: "Abra Operação → Registrar Coletas",
              text: "Selecione {a_base_lower}. Sem isso, a coleta não é gravada.",
            },
            {
              title: "Faça a leitura",
              text: "Bipe os códigos ou lance avulso, do mesmo jeito das saídas.",
            },
            {
              title: "Confira depois",
              text: "Use Consultar Coletas para revisar quantidades do dia.",
            },
          ],
        },
        {
          id: "entrada",
          title: "Registrar entrada",
          summary: "Conferência na chegada do pacote.",
          href: "tracking-entrada-leitura.html",
          roles: WEB_ROLES,
          entrada: true,
          steps: [
            {
              title: "Abra Operação → Registrar Entrada",
              text: "Esta tela só aparece quando a entrada obrigatória está ligada no owner.",
            },
            {
              title: "Leia os códigos",
              text: "Registre a chegada dos pacotes antes da saída para entrega.",
            },
          ],
        },
        {
          id: "registros",
          title: "Consultar e editar registros",
          summary: "Buscar, filtrar e corrigir saídas.",
          href: "tracking-registros.html",
          roles: WEB_ROLES,
          steps: [
            {
              title: "Abra Operação → Registros Gerais",
              text: "Busque por código, motoboy ou {base_lower}.",
            },
            {
              title: "Filtre o período",
              text: "Use o calendário e Filtros para serviço, motoboy, {base_lower} ou avulso.",
            },
            {
              title: "Edite quando precisar",
              text: "Selecione um ou mais registros e clique em Editar. Dá para corrigir dados em lote.",
            },
            {
              title: "Exporte se necessário",
              text: "Use a exportação da tela quando precisar levar a lista para planilha.",
            },
          ],
        },
        {
          id: "consultar-coletas",
          title: "Consultar coletas",
          summary: "Revisar e corrigir quantidades.",
          href: "tracking-coletas-operacao.html",
          roles: WEB_ROLES,
          coleta: true,
          steps: [
            {
              title: "Abra Operação → Consultar Coletas",
              text: "Localize a coleta do dia {da_base_lower}.",
            },
            {
              title: "Corrija a quantidade",
              text: "Ajuste o que foi lançado errado. A correção vale para o acompanhamento e o fechamento.",
            },
          ],
        },
        {
          id: "acompanhamento",
          title: "Acompanhar o dia",
          summary: "Visão das saídas e da operação atual.",
          href: "tracking-acompanhamento.html",
          roles: WEB_ROLES,
          steps: [
            {
              title: "Abra Operação → Acompanhamento do Dia",
              text: "Comece por Saídas do Dia para ver o volume lido.",
            },
            {
              title: "Troque para Visão Atual",
              text: "Use Visão Atual para acompanhar o andamento das entregas no campo.",
            },
            {
              title: "Filtre por motoboy",
              text: "Em Filtros, escolha um motoboy quando quiser olhar só a rota dele.",
            },
          ],
        },
        {
          id: "fechamento-motoboys",
          title: "Fechamento de motoboys",
          summary: "Gerar o período para pagamento.",
          href: "tracking-entregadores-resumo.html",
          roles: ADMIN_ROLES,
          steps: [
            {
              title: "Abra Financeiro → Fechamento de Motoboys",
              text: "Escolha o período, em geral a quinzena.",
            },
            {
              title: "Revise a lista",
              text: "Confira feitos, cancelados e valores. Filtre por motoboy ou situação se precisar.",
            },
            {
              title: "Clique em Gerar Fechamento",
              text: "O botão libera quando o recorte está pronto. Depois disso, o período segue para A Pagar.",
            },
          ],
        },
        {
          id: "a-pagar",
          title: "Marcar motoboys como pagos",
          summary: "Baixa financeira depois do fechamento.",
          href: "tracking-entregadores-a-pagar.html",
          roles: ADMIN_ROLES,
          steps: [
            {
              title: "Abra Financeiro → A Pagar",
              text: "A lista mostra os fechamentos já gerados, aguardando pagamento.",
            },
            {
              title: "Selecione o motoboy",
              text: "Marque o fechamento e clique em Marcar como pago.",
            },
          ],
        },
        {
          id: "fechamento-bases",
          title: "{fechamento_base}",
          summary: "Cobrança {da_base_lower} no período.",
          href: "tracking-coletas-resumo.html",
          roles: ADMIN_ROLES,
          coleta: true,
          steps: [
            {
              title: "Abra Financeiro → {fechamento_base}",
              text: "No passo 1, selecione {a_base_lower}.",
            },
            {
              title: "Revise os totais",
              text: "Confira coletas, avulsos e valores antes de gerar.",
            },
            {
              title: "Gere o fechamento",
              text: "Depois de gerado, o valor segue para A Receber.",
            },
          ],
        },
        {
          id: "a-receber",
          title: "Marcar como recebido",
          summary: "Baixa do valor combinado com {a_base_lower}.",
          href: "tracking-bases-a-receber.html",
          roles: ADMIN_ROLES,
          coleta: true,
          steps: [
            {
              title: "Abra Financeiro → A Receber",
              text: "A lista mostra os fechamentos já gerados, aguardando recebimento.",
            },
            {
              title: "Marque como recebido",
              text: "Selecione o item e clique em Marcar como recebido.",
            },
          ],
        },
      ],
    },
  ];

  function term(key, fallback) {
    if (typeof window.ownerTerm === "function") {
      return window.ownerTerm(key, fallback);
    }
    return fallback != null ? fallback : key;
  }

  function fillTerms(text) {
    if (!text) return "";
    return String(text)
      .replaceAll("{as_bases_lower}", term("as_bases_lower", "as bases"))
      .replaceAll("{fechamento_base}", term("fechamento_base", "Fechamento de Bases"))
      .replaceAll("{da_base_lower}", term("da_base_lower", "da base"))
      .replaceAll("{a_base_lower}", term("a_base_lower", "a base"))
      .replaceAll("{bases}", term("bases", "Bases"))
      .replaceAll("{base_lower}", term("base_lower", "base"))
      .replaceAll("{base}", term("base", "Base"));
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function ctxFromUser(user) {
    var role = Number(user && user.role);
    if (!Number.isFinite(role)) role = 2;
    var modo = (user && user.modo_operacao) || window.MODO_OPERACAO || "codigo";
    return {
      role: role,
      ignorarColeta: !!(user && user.ignorar_coleta) || window.IGNORAR_COLETA === true,
      tipoOwner: String((user && user.tipo_owner) || window.TIPO_OWNER || "subbase").toLowerCase(),
      entrada: !!(user && user.entrada_obrigatoria_habilitada),
      modoOperacao: modo,
    };
  }

  function topicVisible(topic, ctx) {
    if (topic.roles && topic.roles.indexOf(ctx.role) === -1) return false;
    if (topic.rootOnly && ctx.role !== 0) return false;
    if (topic.coleta && ctx.ignorarColeta) return false;
    if (topic.coletaLeitura && ["codigo", "ambos"].indexOf(ctx.modoOperacao) === -1) return false;
    if (topic.entrada && !ctx.entrada) return false;
    if (topic.baseOnly && ctx.tipoOwner !== "base") return false;
    return true;
  }

  function visibleJourneys(ctx) {
    return JOURNEYS.map(function (journey) {
      if (journey.roles && journey.roles.indexOf(ctx.role) === -1) return null;
      var topics = journey.topics.filter(function (topic) {
        return topicVisible(topic, ctx);
      });
      if (!topics.length) return null;
      return { id: journey.id, title: journey.title, topics: topics };
    }).filter(Boolean);
  }

  function flattenTopics(journeys) {
    var list = [];
    journeys.forEach(function (journey) {
      journey.topics.forEach(function (topic) {
        list.push(topic);
      });
    });
    return list;
  }

  function matchesSearch(topic, query) {
    if (!query) return true;
    var hay = (fillTerms(topic.title) + " " + fillTerms(topic.summary)).toLowerCase();
    return hay.indexOf(query) !== -1;
  }

  function renderNav(journeys, activeId, query) {
    var nav = document.getElementById("guiaNav");
    if (!nav) return;
    if (!journeys.length) {
      nav.innerHTML = '<div class="guia-empty">Nenhum tópico disponível para o seu perfil.</div>';
      return;
    }
    nav.innerHTML = journeys
      .map(function (journey) {
        var topics = journey.topics.filter(function (topic) {
          return matchesSearch(topic, query);
        });
        if (!topics.length) return "";
        var items = topics
          .map(function (topic) {
            var active = topic.id === activeId ? " is-active" : "";
            return (
              '<button type="button" class="guia-nav-item' +
              active +
              '" data-topic="' +
              escapeHtml(topic.id) +
              '">' +
              '<span class="guia-nav-item-title">' +
              escapeHtml(fillTerms(topic.title)) +
              "</span>" +
              '<span class="guia-nav-item-summary">' +
              escapeHtml(fillTerms(topic.summary)) +
              "</span>" +
              "</button>"
            );
          })
          .join("");
        return (
          '<div class="guia-nav-group">' +
          '<div class="guia-nav-title">' +
          escapeHtml(journey.title) +
          "</div>" +
          items +
          "</div>"
        );
      })
      .join("");
  }

  function renderTopic(topic) {
    var root = document.getElementById("guiaTopic");
    if (!root) return;
    if (!topic) {
      root.innerHTML = '<div class="guia-empty">Selecione um tópico ao lado para ver os passos.</div>';
      return;
    }
    var steps = (topic.steps || [])
      .map(function (step, index) {
        return (
          '<div class="guia-step">' +
          '<div class="guia-step-num">' +
          (index + 1) +
          "</div>" +
          "<div>" +
          '<div class="guia-step-title">' +
          escapeHtml(fillTerms(step.title)) +
          "</div>" +
          '<p class="guia-step-text">' +
          escapeHtml(fillTerms(step.text)) +
          "</p>" +
          "</div>" +
          "</div>"
        );
      })
      .join("");
    var action = topic.href
      ? '<a class="btn btn-primary" href="' +
        escapeHtml(topic.href) +
        '"><i class="ri-external-link-line me-1"></i>Abrir tela</a>'
      : "";
    root.innerHTML =
      "<div class=\"d-flex flex-wrap align-items-start justify-content-between gap-3 mb-3\">" +
      "<div>" +
      "<h4 class=\"mb-1\">" +
      escapeHtml(fillTerms(topic.title)) +
      "</h4>" +
      '<p class="text-muted mb-0">' +
      escapeHtml(fillTerms(topic.summary)) +
      "</p>" +
      "</div>" +
      action +
      "</div>" +
      steps;
  }

  function currentHash() {
    return (window.location.hash || "").replace(/^#/, "");
  }

  function setHash(id) {
    if (currentHash() === id) return;
    if (history.replaceState) {
      history.replaceState(null, "", "#" + id);
    } else {
      window.location.hash = id;
    }
  }

  function findTopic(topics, id) {
    for (var i = 0; i < topics.length; i += 1) {
      if (topics[i].id === id) return topics[i];
    }
    return null;
  }

  document.addEventListener("DOMContentLoaded", function () {
    var searchEl = document.getElementById("guiaSearch");
    var navEl = document.getElementById("guiaNav");
    var state = { ctx: ctxFromUser(window.__USER__), journeys: [], topics: [], activeId: "" };

    function paint() {
      var query = ((searchEl && searchEl.value) || "").trim().toLowerCase();
      var filtered = state.journeys
        .map(function (journey) {
          return {
            id: journey.id,
            title: journey.title,
            topics: journey.topics.filter(function (topic) {
              return matchesSearch(topic, query);
            }),
          };
        })
        .filter(function (journey) {
          return journey.topics.length;
        });
      var visibleTopics = flattenTopics(filtered);
      var active = findTopic(visibleTopics, state.activeId) || visibleTopics[0] || null;
      state.activeId = active ? active.id : "";
      renderNav(state.journeys, state.activeId, query);
      renderTopic(active);
      if (state.activeId) setHash(state.activeId);
    }

    function applyUser(user) {
      state.ctx = ctxFromUser(user);
      if (typeof window.applyOwnerLabels === "function") {
        window.applyOwnerLabels();
      }
      state.journeys = visibleJourneys(state.ctx);
      state.topics = flattenTopics(state.journeys);
      var hashId = currentHash();
      state.activeId = findTopic(state.topics, hashId) ? hashId : (state.topics[0] && state.topics[0].id) || "";
      paint();
    }

    if (navEl) {
      navEl.addEventListener("click", function (event) {
        var btn = event.target.closest("[data-topic]");
        if (!btn) return;
        state.activeId = btn.getAttribute("data-topic") || "";
        paint();
      });
    }
    if (searchEl) {
      searchEl.addEventListener("input", paint);
    }
    window.addEventListener("hashchange", function () {
      var hashId = currentHash();
      if (hashId && hashId !== state.activeId && findTopic(state.topics, hashId)) {
        state.activeId = hashId;
        paint();
      }
    });

    applyUser(window.__USER__);
    var loadUser = window.ensureAuthUser || window.ensureAuth;
    if (typeof window.ensureAuthUser === "function") {
      window.ensureAuthUser().then(applyUser);
    } else if (typeof loadUser === "function") {
      Promise.resolve(loadUser()).then(function () {
        applyUser(window.__USER__);
      });
    }
  });
})();
