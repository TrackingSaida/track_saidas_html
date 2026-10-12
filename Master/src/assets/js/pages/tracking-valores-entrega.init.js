// tracking-valores-entrega.init.js
// Cadastros → Preços de Entrega: preço padrão, categorias de pacote grande e preço por motoboy.

(function () {
  "use strict";

  const API_URL = window.getTrackApiUrl();
  const API_ENTREGADORES = `${API_URL.replace(/\/+$/, "")}/entregadores`;
  const API_PRECOS_GLOBAL = `${API_ENTREGADORES}/precos/global`;
  const API_PRECOS_INDIVIDUAIS = `${API_ENTREGADORES}/precos/individuais`;
  const API_PRECOS_EXECUTORES = `${API_ENTREGADORES}/precos/executores`;
  const API_CATEGORIAS_G = `${API_ENTREGADORES}/precos/categorias-g`;

  const SERVICOS = [
    { chave: "shopee_valor", nome: "Shopee" },
    { chave: "ml_valor", nome: "Flex" },
    { chave: "avulso_valor", nome: "Avulso" },
  ];
  const CAMPOS_EXCECAO = [
    { chave: "shopee_valor", input: "#excecaoShopee" },
    { chave: "ml_valor", input: "#excecaoMl" },
    { chave: "avulso_valor", input: "#excecaoAvulso" },
    { chave: "coleta_valor", input: "#excecaoColeta", coleta: true },
  ];

  const qs = (s) => document.querySelector(s);
  const qsa = (s) => Array.from(document.querySelectorAll(s));
  const coletaHabilitada = () => !(
    window.__USER__?.ignorar_coleta === true ||
    window.IGNORAR_COLETA === true ||
    localStorage.getItem("ignorar_coleta") === "1"
  );

  let GLOBAL = null;
  let CATEGORIAS = [];
  let EXCECOES = [];
  let EXCECAO_EDITANDO = null;
  let EXCLUIR_ID = null;

  function syncCamposColeta() {
    qsa(".coleta-preco").forEach((el) => el.classList.toggle("d-none", !coletaHabilitada()));
  }

  function esc(v) {
    return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  const toast = (msg, ok = true) => {
    const el = document.createElement("div");
    el.className = `toast align-items-center text-bg-${ok ? "primary" : "danger"} border-0 position-fixed bottom-0 end-0 m-3`;
    el.setAttribute("role", ok ? "status" : "alert");
    el.innerHTML = `<div class="d-flex">
        <div class="toast-body">${esc(msg)}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Fechar"></button>
      </div>`;
    el.style.zIndex = 1080;
    document.body.appendChild(el);
    const t = new bootstrap.Toast(el, { delay: 3000 });
    t.show();
    setTimeout(() => el.remove(), 3500);
  };

  // ---------- Números ----------
  function numero(v) {
    if (v === "" || v == null) return null;
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    let s = String(v).replace(/[R$\s]/g, "");
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
  }

  function brl(v) {
    const n = numero(v);
    if (n == null) return "—";
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function brlInput(v) {
    const n = numero(v);
    return n == null ? "" : brl(n);
  }

  function multiplo(v) {
    const n = numero(v) ?? 0;
    return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}x`;
  }

  function arred(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  function adicional(preco, modo, valor) {
    const v = numero(valor) ?? 0;
    return modo === "valor_fixo" ? arred(v) : arred((numero(preco) ?? 0) * v);
  }

  // ---------- Regras em linguagem simples ----------
  function textoRegraMotoboy(modo, valor) {
    const v = numero(valor) ?? 0;
    if (v === 0) return "Sem adicional";
    return modo === "valor_fixo" ? `+ ${brl(v)} por pacote` : `+ ${multiplo(v)} o serviço`;
  }

  function textoRegraBase(modo, valor) {
    const v = numero(valor) ?? 0;
    if (v === 0) return null;
    return modo === "valor_fixo" ? `+ ${brl(v)} por pacote` : `+ ${multiplo(v)} o preço da base`;
  }

  function adicionalLigado() {
    return !!GLOBAL?.considerar_pacote_g_adicional;
  }

  // ---------- HTTP ----------
  async function http(url, options = {}) {
    const r = await fetch(url, {
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    if (!r.ok) {
      let detalhe = "";
      try {
        const body = await r.json();
        const d = body?.detail;
        detalhe = typeof d === "string" ? d : d?.message || (Array.isArray(d) ? d[0]?.msg : "");
      } catch (e) {}
      const err = new Error(detalhe || mensagemPadrao(r.status));
      err.status = r.status;
      throw err;
    }
    if (r.status === 204) return null;
    try {
      return await r.json();
    } catch {
      return null;
    }
  }

  function mensagemPadrao(status) {
    if (status === 403) return "Você não tem permissão para alterar preços.";
    if (status === 401) return "Sessão expirada. Entre novamente.";
    return "Não foi possível concluir. Tente novamente.";
  }

  // ---------- Preço padrão ----------
  const modalGlobal = new bootstrap.Modal("#oc-global");

  function renderGlobal() {
    qs("#globalShopeeVal").textContent = brl(GLOBAL?.shopee_valor);
    qs("#globalMlVal").textContent = brl(GLOBAL?.ml_valor);
    qs("#globalAvulsoVal").textContent = brl(GLOBAL?.avulso_valor);
    qs("#globalColetaVal").textContent = brl(GLOBAL?.coleta_valor);
    const ligado = adicionalLigado();
    qs("#chkAdicionalG").checked = ligado;
    qs("#adicionalGTexto").textContent = ligado
      ? "Ligado: cada pacote G soma ao motoboy o adicional da categoria."
      : "Desligado: o motoboy recebe só o preço do serviço, mesmo em pacote G.";
    qs(".pe-adicional")?.classList.toggle("pe-adicional--off", !ligado);
  }

  async function loadPrecosGlobal() {
    try {
      GLOBAL = await http(API_PRECOS_GLOBAL);
    } catch (err) {
      console.error(err);
      GLOBAL = null;
      toast("Não foi possível carregar o preço padrão.", false);
    }
    renderGlobal();
  }

  function openGlobalEdit() {
    qs("#editGlobalShopee").value = brlInput(GLOBAL?.shopee_valor);
    qs("#editGlobalMl").value = brlInput(GLOBAL?.ml_valor);
    qs("#editGlobalAvulso").value = brlInput(GLOBAL?.avulso_valor);
    qs("#editGlobalColeta").value = brlInput(GLOBAL?.coleta_valor);
    modalGlobal.show();
  }

  async function savePrecosGlobal(ev) {
    ev.preventDefault();
    const payload = {};
    const campos = [
      ["shopee_valor", "#editGlobalShopee"],
      ["ml_valor", "#editGlobalMl"],
      ["avulso_valor", "#editGlobalAvulso"],
    ];
    if (coletaHabilitada()) campos.push(["coleta_valor", "#editGlobalColeta"]);
    campos.forEach(([chave, sel]) => {
      const v = numero(qs(sel).value);
      if (v != null) payload[chave] = v;
    });
    if (!Object.keys(payload).length) {
      toast("Informe ao menos um valor.", false);
      return;
    }
    const btn = qs("#btnSalvarGlobal");
    btn.disabled = true;
    try {
      GLOBAL = await http(API_PRECOS_GLOBAL, { method: "PATCH", body: JSON.stringify(payload) });
      renderGlobal();
      renderCategorias();
      renderExcecoes();
      modalGlobal.hide();
      toast("Preço padrão salvo.");
    } catch (err) {
      toast(err.message, false);
    } finally {
      btn.disabled = false;
    }
  }

  async function toggleAdicionalG(ev) {
    const chk = ev.currentTarget;
    const ligado = chk.checked;
    chk.disabled = true;
    try {
      GLOBAL = await http(API_PRECOS_GLOBAL, {
        method: "PATCH",
        body: JSON.stringify({ considerar_pacote_g_adicional: ligado }),
      });
      toast(ligado ? "Adicional de pacote grande ligado." : "Adicional de pacote grande desligado.");
    } catch (err) {
      toast(err.message, false);
    } finally {
      chk.disabled = false;
      renderGlobal();
      renderCategorias();
    }
  }

  // ---------- Categorias de pacote grande ----------
  const modalCategoria = new bootstrap.Modal("#ocCategoria");

  function categoriasVisiveis() {
    const mostrarInativas = qs("#chkMostrarInativas").checked;
    return CATEGORIAS.filter((c) => mostrarInativas || c.ativo);
  }

  function exemploMotoboy(cat) {
    if (!adicionalLigado()) return "Adicional desligado";
    const preco = numero(GLOBAL?.shopee_valor);
    if (preco == null) return "";
    const total = arred(preco + adicional(preco, cat.motoboy_modo, cat.motoboy_valor));
    return `Shopee ${brl(preco)} → ${brl(total)}`;
  }

  function linhaCategoria(cat, idx, lista) {
    const ativas = lista.filter((c) => c.ativo);
    const posAtiva = ativas.indexOf(cat);
    const regraBase = textoRegraBase(cat.base_modo, cat.base_valor);
    const qtd = Number(cat.qtd_pacotes || 0);
    return `<tr class="${cat.ativo ? "" : "pe-cat--inativa"}" data-id="${cat.id}">
      <td>
        <div class="d-flex align-items-center gap-2">
          <span class="pe-cat-nome">${esc(cat.nome)}</span>
          <div>
            ${cat.descricao ? `<div>${esc(cat.descricao)}</div>` : ""}
            ${cat.ativo ? "" : '<div class="fm-linha-sub">Desativada</div>'}
          </div>
        </div>
      </td>
      <td>
        <div class="pe-regra-texto">${esc(textoRegraMotoboy(cat.motoboy_modo, cat.motoboy_valor))}</div>
        <div class="fm-linha-sub">${esc(exemploMotoboy(cat))}</div>
      </td>
      <td>${regraBase ? `<span class="pe-regra-texto">${esc(regraBase)}</span>` : '<span class="pe-sem-cobranca">Sem cobrança a mais</span>'}</td>
      <td class="text-end fm-num">${qtd.toLocaleString("pt-BR")}</td>
      <td>
        <div class="pe-acoes">
          ${cat.ativo ? `
          <button type="button" class="pe-acao" data-acao="subir" aria-label="Mover ${esc(cat.nome)} para cima" title="Mover para cima" ${posAtiva <= 0 ? "disabled" : ""}><i class="ri-arrow-up-line"></i></button>
          <button type="button" class="pe-acao" data-acao="descer" aria-label="Mover ${esc(cat.nome)} para baixo" title="Mover para baixo" ${posAtiva >= ativas.length - 1 ? "disabled" : ""}><i class="ri-arrow-down-line"></i></button>` : ""}
          <button type="button" class="pe-acao" data-acao="editar" aria-label="Editar ${esc(cat.nome)}" title="Editar"><i class="ri-edit-2-line"></i></button>
          ${cat.ativo
            ? `<button type="button" class="pe-acao pe-acao--perigo" data-acao="desativar" aria-label="Desativar ${esc(cat.nome)}" title="Desativar"><i class="ri-forbid-line"></i></button>`
            : `<button type="button" class="pe-acao" data-acao="reativar" aria-label="Reativar ${esc(cat.nome)}" title="Reativar"><i class="ri-restart-line"></i></button>`}
        </div>
      </td>
    </tr>`;
  }

  function renderCategorias() {
    const tbody = qs("#tbodyCategorias");
    const lista = categoriasVisiveis();
    if (!lista.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-muted py-4 text-center">Nenhuma categoria. Crie a primeira para marcar pacotes grandes.</td></tr>';
      return;
    }
    tbody.innerHTML = lista.map((c, i) => linhaCategoria(c, i, lista)).join("");
  }

  async function loadCategorias() {
    try {
      const data = await http(`${API_CATEGORIAS_G}?incluir_inativas=true`);
      CATEGORIAS = (Array.isArray(data) ? data : []).sort((a, b) =>
        (Number(b.ativo) - Number(a.ativo)) || (a.ordem - b.ordem) || (a.id - b.id));
      renderCategorias();
    } catch (err) {
      console.error(err);
      CATEGORIAS = [];
      qs("#tbodyCategorias").innerHTML = '<tr><td colspan="5" class="text-danger py-4 text-center">Não foi possível carregar as categorias.</td></tr>';
    }
  }

  function modoSelecionado(nome) {
    return qs(`input[name="${nome}"]:checked`)?.value || "multiplicador";
  }

  function formatarValorRegra(modo, valor) {
    const n = numero(valor);
    if (n == null) return "";
    return modo === "valor_fixo" ? brl(n) : n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  }

  function syncAjudaRegras() {
    const mModo = modoSelecionado("catMotoboyModo");
    const bModo = modoSelecionado("catBaseModo");
    qs("#catMotoboyValor").placeholder = mModo === "valor_fixo" ? "R$ 0,00" : "1";
    qs("#catMotoboyAjuda").textContent = mModo === "valor_fixo"
      ? "Somado ao preço do serviço em cada pacote."
      : "Ex.: 1 = mais um serviço; 0,5 = metade do serviço.";
    qs("#catBaseValor").placeholder = bModo === "valor_fixo" ? "R$ 0,00" : "1";
    qs("#catBaseAjuda").textContent = bModo === "valor_fixo"
      ? "Deixe R$ 0,00 para não cobrar a mais da base."
      : "Multiplica o preço que a base paga pelo serviço.";
  }

  function renderPrevia() {
    const mModo = modoSelecionado("catMotoboyModo");
    const mValor = numero(qs("#catMotoboyValor").value) ?? 0;
    const ligado = adicionalLigado();
    qs("#pePreviaMotoboy").innerHTML = SERVICOS.map((s) => {
      const preco = numero(GLOBAL?.[s.chave]);
      if (preco == null) return `<tr><td>${s.nome}</td><td>—</td></tr>`;
      const total = ligado ? arred(preco + adicional(preco, mModo, mValor)) : preco;
      return `<tr><td>${s.nome}<span class="pe-previa-de">serviço ${brl(preco)}</span></td><td><strong>${brl(total)}</strong></td></tr>`;
    }).join("");
    qs("#pePreviaAdicionalOff").textContent = ligado
      ? ""
      : "O adicional está desligado. Ligue em Pacotes grandes para o motoboy receber a mais.";
    const regraBase = textoRegraBase(modoSelecionado("catBaseModo"), qs("#catBaseValor").value);
    qs("#pePreviaBase").textContent = regraBase || "Sem cobrança a mais";
  }

  function proximoNomeCategoria() {
    const usados = new Set(CATEGORIAS.map((c) => String(c.nome || "").toUpperCase()));
    let n = 2;
    while (usados.has(`G${n}`)) n += 1;
    return `G${n}`;
  }

  function openCategoria(cat = null) {
    const form = qs("#formCategoria");
    form.reset();
    qs("#catNome").classList.remove("is-invalid");
    qs("#catId").value = cat ? cat.id : "";
    qs("#ocCategoriaLabel").textContent = cat ? `Editar categoria ${cat.nome}` : "Nova categoria";
    qs("#catNome").value = cat?.nome || "";
    qs("#catNome").placeholder = cat ? "" : proximoNomeCategoria();
    qs("#catDescricao").value = cat?.descricao || "";
    const mModo = cat?.motoboy_modo || "multiplicador";
    const bModo = cat?.base_modo || "valor_fixo";
    qs(mModo === "valor_fixo" ? "#catMotoboyFixo" : "#catMotoboyMult").checked = true;
    qs(bModo === "valor_fixo" ? "#catBaseFixo" : "#catBaseMult").checked = true;
    qs("#catMotoboyValor").value = formatarValorRegra(mModo, cat ? cat.motoboy_valor : 1);
    qs("#catBaseValor").value = formatarValorRegra(bModo, cat ? cat.base_valor : 0);
    syncAjudaRegras();
    renderPrevia();
    modalCategoria.show();
  }

  function onModoChange(ev) {
    const campo = ev.target.name === "catMotoboyModo" ? "#catMotoboyValor" : "#catBaseValor";
    qs(campo).value = formatarValorRegra(ev.target.value, numero(qs(campo).value) ?? 0);
    syncAjudaRegras();
    renderPrevia();
  }

  async function saveCategoria(ev) {
    ev.preventDefault();
    const nomeEl = qs("#catNome");
    const nome = nomeEl.value.trim().toUpperCase();
    if (!nome) {
      qs("#catNomeErro").textContent = "Informe o nome.";
      nomeEl.classList.add("is-invalid");
      nomeEl.focus();
      return;
    }
    const mValor = numero(qs("#catMotoboyValor").value) ?? 0;
    const bValor = numero(qs("#catBaseValor").value) ?? 0;
    if (mValor < 0 || bValor < 0) {
      toast("Use valores a partir de zero.", false);
      return;
    }
    const payload = {
      nome,
      descricao: qs("#catDescricao").value.trim() || null,
      motoboy_modo: modoSelecionado("catMotoboyModo"),
      motoboy_valor: mValor,
      base_modo: modoSelecionado("catBaseModo"),
      base_valor: bValor,
    };
    const id = qs("#catId").value;
    const btn = qs("#btnSalvarCategoria");
    btn.disabled = true;
    try {
      await http(id ? `${API_CATEGORIAS_G}/${id}` : API_CATEGORIAS_G, {
        method: id ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      modalCategoria.hide();
      toast(id ? "Categoria atualizada." : `Categoria ${nome} criada.`);
      await loadCategorias();
    } catch (err) {
      if (err.status === 409) {
        qs("#catNomeErro").textContent = err.message;
        nomeEl.classList.add("is-invalid");
        nomeEl.focus();
      } else {
        toast(err.message, false);
      }
    } finally {
      btn.disabled = false;
    }
  }

  async function patchCategoria(id, body) {
    return http(`${API_CATEGORIAS_G}/${id}`, { method: "PATCH", body: JSON.stringify(body) });
  }

  async function moverCategoria(id, direcao) {
    const ativas = CATEGORIAS.filter((c) => c.ativo);
    const i = ativas.findIndex((c) => String(c.id) === String(id));
    const j = direcao === "subir" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= ativas.length) return;
    [ativas[i], ativas[j]] = [ativas[j], ativas[i]];
    const mudancas = ativas
      .map((c, ordem) => ({ c, ordem }))
      .filter(({ c, ordem }) => c.ordem !== ordem);
    try {
      await Promise.all(mudancas.map(({ c, ordem }) => patchCategoria(c.id, { ordem })));
    } catch (err) {
      toast(err.message, false);
    }
    await loadCategorias();
  }

  async function alterarAtivo(id, ativo) {
    const cat = CATEGORIAS.find((c) => String(c.id) === String(id));
    try {
      await patchCategoria(id, { ativo });
      toast(ativo
        ? `Categoria ${cat?.nome || ""} reativada.`
        : `Categoria ${cat?.nome || ""} desativada. Pacotes já marcados continuam com ela.`);
      await loadCategorias();
    } catch (err) {
      toast(err.message, false);
    }
  }

  function onAcaoCategoria(ev) {
    const btn = ev.target.closest("button[data-acao]");
    if (!btn) return;
    const id = btn.closest("tr")?.dataset.id;
    const acao = btn.dataset.acao;
    if (acao === "editar") openCategoria(CATEGORIAS.find((c) => String(c.id) === String(id)));
    else if (acao === "subir" || acao === "descer") moverCategoria(id, acao);
    else if (acao === "desativar") alterarAtivo(id, false);
    else if (acao === "reativar") alterarAtivo(id, true);
  }

  // ---------- Preço por motoboy ----------
  const modalExcecao = new bootstrap.Modal("#oc-excecao");
  const modalDelete = new bootstrap.Modal("#modalDelete");

  const idExcecao = (item) => item.motoboy_id || item.entregador_id;
  const nomeExcecao = (item) => item.motoboy_nome || item.entregador_nome || "—";

  function celulaPreco(v) {
    return numero(v) == null
      ? '<span class="pe-padrao">Padrão</span>'
      : `<span class="fm-num">${brl(v)}</span>`;
  }

  function renderExcecoes() {
    const tbody = qs("#tbody-excecoes");
    const empty = qs("#emptyExcecoes");
    const term = (qs("#search")?.value || "").toLowerCase().trim();
    const filtrados = !term
      ? EXCECOES
      : EXCECOES.filter((i) => nomeExcecao(i).toLowerCase().includes(term));
    qs("#tbl-excecoes").closest(".table-responsive").classList.toggle("d-none", !filtrados.length);
    if (!filtrados.length) {
      tbody.innerHTML = "";
      qs("#emptyExcecoesTexto").textContent = term
        ? "Nenhum motoboy encontrado com esse nome."
        : "Nenhum motoboy com preço próprio. Todos recebem o preço padrão.";
      empty.classList.remove("d-none");
      return;
    }
    empty.classList.add("d-none");
    tbody.innerHTML = filtrados.map((item) => {
      const nome = nomeExcecao(item);
      return `<tr data-id="${esc(idExcecao(item))}">
        <td class="fw-semibold">${esc(nome)}</td>
        <td class="text-end">${celulaPreco(item.shopee_valor)}</td>
        <td class="text-end">${celulaPreco(item.ml_valor)}</td>
        <td class="text-end">${celulaPreco(item.avulso_valor)}</td>
        ${coletaHabilitada() ? `<td class="text-end">${celulaPreco(item.coleta_valor)}</td>` : ""}
        <td>
          <div class="pe-acoes">
            <button type="button" class="pe-acao" data-acao="editar" aria-label="Editar preço de ${esc(nome)}" title="Editar"><i class="ri-edit-2-line"></i></button>
            <button type="button" class="pe-acao pe-acao--perigo" data-acao="remover" aria-label="Remover preço próprio de ${esc(nome)}" title="Remover preço próprio"><i class="ri-delete-bin-6-line"></i></button>
          </div>
        </td>
      </tr>`;
    }).join("");
  }

  async function loadExcecoes() {
    try {
      const data = await http(API_PRECOS_INDIVIDUAIS);
      EXCECOES = (data?.items || []).slice().sort((a, b) =>
        nomeExcecao(a).localeCompare(nomeExcecao(b), "pt-BR", { sensitivity: "base" }));
    } catch (err) {
      console.error(err);
      EXCECOES = [];
      toast("Não foi possível carregar os preços por motoboy.", false);
    }
    renderExcecoes();
  }

  async function loadMotoboysSelect() {
    const select = qs("#selectMotoboy");
    select.innerHTML = '<option value="">Carregando…</option>';
    try {
      const list = await http(`${API_PRECOS_EXECUTORES}?status=ativo`);
      const comPreco = new Set(EXCECOES.map((e) => Number(idExcecao(e))));
      const unicos = new Map();
      (Array.isArray(list) ? list : []).forEach((e) => {
        const id = Number(e?.executor_id ?? e?.motoboy_id);
        if (!Number.isFinite(id) || id <= 0 || comPreco.has(id) || unicos.has(id)) return;
        const nomeRaw = String(e?.nome || id).trim();
        const nome = typeof window.formatPersonName === "function" ? window.formatPersonName(nomeRaw) : nomeRaw;
        unicos.set(id, { id, nome });
      });
      const ordenados = Array.from(unicos.values()).sort((a, b) =>
        typeof window.comparePersonNames === "function"
          ? window.comparePersonNames(a.nome, b.nome)
          : a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));
      select.innerHTML = ordenados.length
        ? '<option value="">Selecione o motoboy</option>' +
          ordenados.map((e) => `<option value="${e.id}">${esc(e.nome)}</option>`).join("")
        : '<option value="">Todos os motoboys ativos já têm preço próprio</option>';
    } catch (err) {
      console.error(err);
      select.innerHTML = '<option value="">Não foi possível carregar os motoboys</option>';
    }
  }

  function openExcecaoForm(item = null) {
    EXCECAO_EDITANDO = item;
    qs("#formExcecao").reset();
    qs("#ocExcecaoLabel").textContent = item ? "Editar preço do motoboy" : "Preço próprio de motoboy";
    qs("#excecaoEntregadorId").value = item ? idExcecao(item) : "";
    qs("#groupSelectEntregador").classList.toggle("d-none", !!item);
    qs("#groupNomeEntregador").classList.toggle("d-none", !item);
    qs("#nomeEntregadorEdit").textContent = item ? nomeExcecao(item) : "";
    CAMPOS_EXCECAO.forEach(({ chave, input }) => {
      const el = qs(input);
      el.value = item ? brlInput(item[chave]) : "";
      el.placeholder = `Padrão: ${brl(GLOBAL?.[chave])}`;
    });
    if (!item) loadMotoboysSelect();
    modalExcecao.show();
  }

  async function submitExcecao(ev) {
    ev.preventDefault();
    const idMotoboy = qs("#excecaoEntregadorId").value.trim() || qs("#selectMotoboy").value;
    if (!idMotoboy) {
      toast("Selecione um motoboy.", false);
      qs("#selectMotoboy").focus();
      return;
    }
    const payload = {};
    CAMPOS_EXCECAO.forEach(({ chave, input, coleta }) => {
      if (coleta && !coletaHabilitada()) return;
      const v = numero(qs(input).value);
      if (v != null) payload[chave] = v;
      else if (EXCECAO_EDITANDO && numero(EXCECAO_EDITANDO[chave]) != null) payload[chave] = null;
    });
    if (!Object.keys(payload).length) {
      toast(EXCECAO_EDITANDO ? "Nada foi alterado." : "Informe ao menos um valor diferente do padrão.", false);
      return;
    }
    const removeuTudo = !!EXCECAO_EDITANDO && CAMPOS_EXCECAO.every(({ input }) => numero(qs(input).value) == null);
    const btn = qs("#btnSalvarExcecao");
    btn.disabled = true;
    try {
      await http(`${API_ENTREGADORES}/motoboys/${idMotoboy}/precos`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      modalExcecao.hide();
      toast(removeuTudo ? "Motoboy voltou ao preço padrão." : "Preço do motoboy salvo.");
      await loadExcecoes();
    } catch (err) {
      toast(err.message, false);
    } finally {
      btn.disabled = false;
    }
  }

  function confirmarRemocao(item) {
    EXCLUIR_ID = idExcecao(item);
    qs("#modalDeleteTitulo").textContent = `Remover preço próprio de ${nomeExcecao(item)}?`;
    modalDelete.show();
  }

  async function removerExcecao() {
    if (!EXCLUIR_ID) return;
    const btn = qs("#btnConfirmDelete");
    btn.disabled = true;
    try {
      await http(`${API_ENTREGADORES}/motoboys/${EXCLUIR_ID}/precos`, { method: "DELETE" });
      modalDelete.hide();
      toast("Motoboy voltou ao preço padrão.");
      EXCLUIR_ID = null;
      await loadExcecoes();
    } catch (err) {
      toast(err.message, false);
    } finally {
      btn.disabled = false;
    }
  }

  function onAcaoExcecao(ev) {
    const btn = ev.target.closest("button[data-acao]");
    if (!btn) return;
    const id = btn.closest("tr")?.dataset.id;
    const item = EXCECOES.find((i) => String(idExcecao(i)) === String(id));
    if (!item) return;
    if (btn.dataset.acao === "editar") openExcecaoForm(item);
    else confirmarRemocao(item);
  }

  // ---------- Eventos ----------
  document.addEventListener("DOMContentLoaded", async () => {
    if (typeof window.ensureAuthUser === "function") await window.ensureAuthUser();
    syncCamposColeta();

    qs("#btnEditarGlobal").addEventListener("click", openGlobalEdit);
    qs("#formGlobal").addEventListener("submit", savePrecosGlobal);
    qs("#chkAdicionalG").addEventListener("change", toggleAdicionalG);

    qs("#btnNovaCategoria").addEventListener("click", () => openCategoria());
    qs("#tbodyCategorias").addEventListener("click", onAcaoCategoria);
    qs("#chkMostrarInativas").addEventListener("change", renderCategorias);
    qs("#formCategoria").addEventListener("submit", saveCategoria);
    qsa('input[name="catMotoboyModo"], input[name="catBaseModo"]').forEach((el) =>
      el.addEventListener("change", onModoChange));
    ["#catMotoboyValor", "#catBaseValor"].forEach((sel) => {
      qs(sel).addEventListener("input", renderPrevia);
      qs(sel).addEventListener("blur", (ev) => {
        const nome = sel === "#catMotoboyValor" ? "catMotoboyModo" : "catBaseModo";
        ev.target.value = formatarValorRegra(modoSelecionado(nome), numero(ev.target.value) ?? 0);
      });
    });
    qs("#catNome").addEventListener("input", (ev) => ev.target.classList.remove("is-invalid"));

    qs("#search").addEventListener("input", renderExcecoes);
    qs("#btnAddExcecao").addEventListener("click", () => openExcecaoForm());
    qs("#tbody-excecoes").addEventListener("click", onAcaoExcecao);
    qs("#formExcecao").addEventListener("submit", submitExcecao);
    qs("#btnConfirmDelete").addEventListener("click", removerExcecao);
    qsa(".pe-usar-padrao").forEach((btn) => btn.addEventListener("click", () => {
      const input = qs(btn.dataset.limpar);
      input.value = "";
      input.focus();
    }));

    await loadPrecosGlobal();
    await Promise.all([loadCategorias(), loadExcecoes()]);
  });
})();
