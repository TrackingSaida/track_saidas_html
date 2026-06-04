// assets/js/pages/tracking-api-leitura-registros.init.js
// Wrapper oficial da API para listagem/CRUD de SAÍDAS.

(function () {
  // Normaliza base URL
  let baseUrl = (window.TRACK_API_URL || "").replace(/\/+$/, "");
  if (!baseUrl.endsWith("/api")) baseUrl += "/api";
  const BASE = baseUrl;

  if (!window.TrackAPI) window.TrackAPI = {};

  // -------- REQ UTIL --------
  async function req(path, opts) {
    return fetch(BASE + path, Object.assign({
      credentials: "include",
      headers: { "Accept": "application/json" }
    }, opts || {}));
  }

  // ============================================================
  // LISTAR SAÍDAS (limit + offset, compatível com backend novo)
  // ============================================================
  window.TrackAPI.listSaidas = async function (params) {
    const limit  = Number(params?.limit  || params?.pageSize || 200);
    const offset = Number(params?.offset || 0);

    const q = new URLSearchParams();
    if (params?.de)         q.set("de", params.de);
    if (params?.ate)        q.set("ate", params.ate);
    if (params?.base)       q.set("base", params.base);
    if (params?.entregador) q.set("entregador", params.entregador);
    if (Array.isArray(params?.status)) {
      params.status.forEach(v => { if (v != null && String(v).trim()) q.append("status", String(v).trim()); });
    } else if (params?.status) {
      q.set("status", params.status);
    }
    if (Array.isArray(params?.servico)) {
      params.servico.forEach(v => { if (v != null && String(v).trim()) q.append("servico", String(v).trim()); });
    } else if (params?.servico) {
      q.set("servico", params.servico);
    }
    if (Array.isArray(params?.acao)) {
      params.acao.forEach(v => { if (v != null && String(v).trim()) q.append("acao", String(v).trim()); });
    } else if (params?.acao) {
      q.set("acao", params.acao);
    }
    if (params?.somente_g)  q.set("somente_g", "true");
    if (params?.localizar)  q.set("localizar", params.localizar);
    if (params?.codigo)     q.set("codigo", params.codigo);
    if (params?.codigo_exato) q.set("codigo_exato", "true");
    if (params?.sort)       q.set("sort", params.sort);

    q.set("limit",  String(limit));
    q.set("offset", String(offset));

    try {
      const res = await req("/saidas/listar?" + q);
      const ok  = res.ok;

      // total vindo do backend (header)
      let total = null;
      const hTotal = res.headers.get("X-Total-Count") || res.headers.get("x-total-count");
      if (hTotal != null) total = Number(hTotal);

      let data = null;
      try { data = await res.json(); } catch {}

      let rows = [];
      if (Array.isArray(data)) rows = data;
      else if (Array.isArray(data?.items)) { rows = data.items; if (typeof data.total === 'number') total = data.total; }
      else if (Array.isArray(data?.rows))  { rows = data.rows;  if (typeof data.total === 'number') total = data.total; }
      else if (Array.isArray(data?.data))  { rows = data.data;  if (typeof data.total === 'number') total = data.total; }

      // fallback caso backend não envie total
      if (total == null) total = offset + rows.length;

      const hasMore = rows.length === limit;

      // Extrair somas/aggregados com tolerância a diferentes nomes de campo
      const sumCandidates = (d, keys) => {
        for (const k of keys) {
          if (d && typeof d[k] !== 'undefined') return d[k];
        }
        return undefined;
      };

      const sumShopee = sumCandidates(data, ['sumShopee', 'sum_shopee', 'shopee']) ?? data?.sums?.shopee ?? data?.meta?.sumShopee;
      const sumMercado = sumCandidates(data, ['sumMercado', 'sum_mercado', 'mercado']) ?? data?.sums?.mercado ?? data?.meta?.sumMercado;
      const sumAvulso = sumCandidates(data, ['sumAvulso', 'sum_avulso', 'avulso']) ?? data?.sums?.avulso ?? data?.meta?.sumAvulso;

      return {
        ok,
        status: res.status,
        rows,
        total,
        limit,
        offset,
        hasMore,
        // apenas repassa valores se backend enviar; se undefined, o front pode computar ou exibir fallback
        sumShopee: typeof sumShopee === 'number' ? sumShopee : undefined,
        sumMercado: typeof sumMercado === 'number' ? sumMercado : undefined,
        sumAvulso: typeof sumAvulso === 'number' ? sumAvulso : undefined
      };


    } catch (err) {
      return { ok: false, status: 0, error: String(err?.message || err) };
    }
  };

  // Timeout para POST /saidas/ler: não adiciona delay em respostas normais; só aborta se travar (rede/servidor).
  const LER_SAIDA_TIMEOUT_MS = 10000; // 10s

  // ============================================================
  // LER SAÍDA (POST /saidas/ler — fluxo unificado de leitura)
  // ============================================================
  // Foco em performance:
  // - 1 único request leve (1 SELECT + 1 INSERT/UPDATE no backend)
  // - Sem GET /saidas/listar?codigo= antes de decidir POST/PATCH
  // - 200/201 tratam idempotência; 409 é reservado para troca de entregador.
  // - Timeout evita request pendurado; em caso de abort, front pode chamar revertOtimista e permitir rebipar.
  window.TrackAPI.lerSaida = async function ({ entregador_id, entregador, motoboy_id, codigo, servico, registrar_nao_coletado, qr_payload_raw }) {
    try {
      const body = {
        codigo,
        servico
      };
      if (motoboy_id != null) body.motoboy_id = motoboy_id;
      if (entregador_id != null) body.entregador_id = entregador_id;
      if (entregador != null) body.entregador = entregador;
      if (registrar_nao_coletado === true) body.registrar_nao_coletado = true;
      if (qr_payload_raw != null && qr_payload_raw !== "") body.qr_payload_raw = qr_payload_raw;

      const ac = new AbortController();
      const to = setTimeout(() => ac.abort(), LER_SAIDA_TIMEOUT_MS);

      let res;
      try {
        res = await req("/saidas/ler", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: ac.signal
        });
      } finally {
        clearTimeout(to);
      }

      let data = null;
      try { data = await res.json(); } catch {}

      const code = data?.code;
      const error = res.ok ? null : (data?.message || data?.error || null);
      // Para 409/422, manter data para o front usar (id_saida, entregador_atual, etc.)
      const outData = res.ok ? data : (code ? data : null);
      const backendMs = res.headers.get("X-Backend-Process-Time");
      const backend_processing_ms = backendMs ? parseFloat(backendMs) : null;

      return {
        ok: res.ok,
        status: res.status,
        data: outData,
        error,
        code,
        backend_processing_ms: Number.isFinite(backend_processing_ms) ? backend_processing_ms : null
      };

    } catch (err) {
      const msg = err?.name === "AbortError" ? "Tempo esgotado. Tente bipar novamente." : String(err?.message || err);
      return { ok: false, status: 0, error: msg };
    }
  };

  window.TrackAPI.confirmarNovaSaidaMesmoEntregador = async function ({ id_saida, motoboy_id, entregador_id, entregador, origem }) {
    try {
      const body = { id_saida };
      if (motoboy_id != null) body.motoboy_id = motoboy_id;
      if (entregador_id != null) body.entregador_id = entregador_id;
      if (entregador != null) body.entregador = entregador;
      if (origem != null) body.origem = origem;
      const res = await req("/saidas/confirmar-nova-saida-mesmo-entregador", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      let data = null;
      try { data = await res.json(); } catch {}
      return {
        ok: res.ok,
        status: res.status,
        data: data,
        error: res.ok ? null : (data?.message || data?.error || null),
        code: data?.code
      };
    } catch (err) {
      return { ok: false, status: 0, error: String(err?.message || err) };
    }
  };

  // ============================================================
  // REGISTRAR SAÍDA (legado — mantido para compatibilidade)
  // ============================================================
  window.TrackAPI.registerSaida = async function ({ entregador_id, entregador, codigo, servico, status, qr_payload_raw }) {
    try {
      const body = { codigo, servico, status };
      if (entregador_id != null) body.entregador_id = entregador_id;
      if (entregador != null) body.entregador = entregador;
      if (qr_payload_raw != null && qr_payload_raw !== "") body.qr_payload_raw = qr_payload_raw;
      const res = await req("/saidas/registrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      let data = null;
      try { data = await res.json(); } catch {}

      return { ok: res.ok, status: res.status, data, error: data?.error };

    } catch (err) {
      return { ok: false, status: 0, error: String(err?.message || err) };
    }
  };

  window.TrackAPI.lancarAvulso = async function ({ identificacao, quantidade, motoboy_id, entregador_id, entregador }) {
    try {
      const body = { quantidade };
      if (identificacao != null) body.identificacao = identificacao;
      if (motoboy_id != null) body.motoboy_id = motoboy_id;
      if (entregador_id != null) body.entregador_id = entregador_id;
      if (entregador != null) body.entregador = entregador;
      const res = await req("/pedidos/lancar-avulso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      let data = null;
      try { data = await res.json(); } catch {}
      return { ok: res.ok, status: res.status, data, error: data?.error, code: data?.code };
    } catch (err) {
      return { ok: false, status: 0, error: String(err?.message || err) };
    }
  };

  // ============================================================
  // BUSCAR POR CÓDIGO
  // ============================================================
  window.TrackAPI.getSaidaPorCodigo = async function (codigo) {
    if (!codigo) return null;
    try {
      const res = await req("/saidas/listar?codigo=" + encodeURIComponent(codigo));
      let data = null; try { data = await res.json(); } catch {}
      if (Array.isArray(data) && data.length > 0) return data[0];
      if (Array.isArray(data?.data) && data.data.length > 0) return data.data[0];
      return null;
    } catch {
      return null;
    }
  };

  // ============================================================
  // ATUALIZAR SAÍDA
  // ============================================================
  window.TrackAPI.updateSaida = async function (id, payload) {
    const res = await req("/saidas/" + encodeURIComponent(id), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {})
    });
    let data = null; try { data = await res.json(); } catch {}
    return { ok: res.ok, status: res.status, data, error: data?.error };
  };

  // ============================================================
  // EXCLUIR SAÍDA
  // ============================================================
  window.TrackAPI.deleteSaida = async function (id) {
    const res = await req("/saidas/" + encodeURIComponent(id), { method: "DELETE" });
    let data = null; try { data = await res.json(); } catch {}
    return { ok: res.ok, status: res.status, data, error: data?.error };
  };

  // ============================================================
  // LISTA ENTREGADORES (legado)
  // ============================================================
  window.TrackAPI.getEntregadores = async function () {
    const res = await req("/entregadores");
    let data = null; try { data = await res.json(); } catch {}
    return data;
  };

  // ============================================================
  // LISTA MOTOBOYS (users role=4)
  // ============================================================
  window.TrackAPI.getMotoboys = async function () {
    const res = await req("/users/motoboys");
    let data = null; try { data = await res.json(); } catch {}
    return Array.isArray(data) ? data : (data?.data || []);
  };

})();
