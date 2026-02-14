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
    if (params?.status)     q.set("status", params.status);
    if (params?.codigo)     q.set("codigo", params.codigo);
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

  // ============================================================
  // LER SAÍDA (POST /saidas/ler — fluxo unificado de leitura)
  // ============================================================
  // Foco em performance:
  // - 1 único request leve (1 SELECT + 1 INSERT/UPDATE no backend)
  // - Sem GET /saidas/listar?codigo= antes de decidir POST/PATCH
  // - 200/201 tratam idempotência; 409 é reservado para troca de entregador.
  window.TrackAPI.lerSaida = async function ({ entregador_id, entregador, codigo, servico, registrar_nao_coletado, qr_payload_raw }) {
    try {
      const body = {
        codigo,
        servico
      };
      if (entregador_id != null) body.entregador_id = entregador_id;
      if (entregador != null) body.entregador = entregador;
      if (registrar_nao_coletado === true) body.registrar_nao_coletado = true;
      if (qr_payload_raw != null && qr_payload_raw !== "") body.qr_payload_raw = qr_payload_raw;

      const res = await req("/saidas/ler", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

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
  // LISTA ENTREGADORES
  // ============================================================
  window.TrackAPI.getEntregadores = async function () {
    const res = await req("/entregadores");
    let data = null; try { data = await res.json(); } catch {}
    return data;
  };

})();
