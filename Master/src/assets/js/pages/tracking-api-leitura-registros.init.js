// assets/js/pages/tracking-api-leitura-registros.init.js
// Wrapper da API (lista/atualiza/exclui saídas) com paginação correta via limit+1.

(function () {
  // 🔹 Garante que sempre chame /api/... apenas uma vez
  let baseUrl = (window.TRACK_API_URL || "").replace(/\/+$/, "");
  if (!baseUrl.endsWith("/api")) baseUrl += "/api";
  const BASE = baseUrl;

  if (!window.TrackAPI) window.TrackAPI = {};

  // -------- util de request --------
  async function req(path, opts) {
    const res = await fetch(BASE + path, Object.assign({
      credentials: "include",
      headers: { "Accept": "application/json" }
    }, opts || {}));
    return res;
  }

    // -------- LISTAR SAÍDAS --------
  window.TrackAPI.listSaidas = async function (params) {
    const page     = Number(params && params.page)     || 1;
    const pageSize = Number(params && params.pageSize) || 200;

    const hasFilter =
      (params && (params.entregador || params.status || params.codigo || params.base || params.de || params.ate));

    let offset = 0;

    const q = new URLSearchParams();
    if (params && params.de)          q.set("de", params.de);
    if (params && params.ate)         q.set("ate", params.ate);
    if (params && params.base)        q.set("base", params.base);
    if (params && params.entregador)  q.set("entregador", params.entregador);
    if (params && params.status)      q.set("status", params.status);
    if (params && params.codigo)      q.set("codigo", params.codigo);
    if (params && params.sort)        q.set("sort", params.sort);

    if (!hasFilter) {
      const limitRequested = pageSize + 1;
      offset = (page - 1) * pageSize;
      q.set("limit",  String(limitRequested));
      q.set("offset", String(offset));
    } else {
      q.set("limit",  "6000");
      q.set("offset", "0");
    }

    try {
      const res = await req("/saidas/listar?" + q.toString());
      const ok  = res.ok;

      let total = null;
      const hTotal = res.headers.get("X-Total-Count") || res.headers.get("x-total-count");
      if (hTotal != null) total = Number(hTotal);

      let data = null;
      try { data = await res.json(); } catch (_) {}

      let rows = [];
      if (Array.isArray(data)) {
        rows = data;
      } else if (data && Array.isArray(data.items)) {
        rows = data.items;
        if (typeof data.total === "number") total = data.total;
      } else if (data && Array.isArray(data.rows)) {
        rows = data.rows;
        if (typeof data.total === "number") total = data.total;
      } else if (data && Array.isArray(data.data)) {
        rows = data.data;
        if (typeof data.total === "number") total = data.total;
      }

      const hasMore = rows.length > pageSize;
      if (!hasFilter && hasMore) rows = rows.slice(0, pageSize);

      if (total == null) {
        total = offset + rows.length + (hasMore ? 1 : 0);
      }

      return { ok, status: res.status, rows, total, page, pageSize, hasMore };
    } catch (err) {
      return { ok: false, status: 0, error: String((err && err.message) || err) };
    }
  };



  // -------- BUSCAR SAÍDA POR CÓDIGO (usado na Leitura)
  // GET /saidas/listar?codigo=XYZ
  window.TrackAPI.getSaidaPorCodigo = async function (codigo) {
    if (!codigo) return null;
    try {
      const res = await req("/saidas/listar?codigo=" + encodeURIComponent(codigo));
      let data = null;
      try { data = await res.json(); } catch (_) {}
      if (Array.isArray(data) && data.length > 0) return data[0];
      if (data && Array.isArray(data.data) && data.data.length > 0) return data.data[0];
      return null;
    } catch (err) {
      console.error("Erro ao buscar saída:", err);
      return null;
    }
  };

  // -------- REGISTRAR SAÍDA
  // POST /saidas/registrar
  window.TrackAPI.registerSaida = async function ({ entregador, codigo, servico, status }) {
    const payload = { entregador, codigo, servico, status };
    try {
      const res = await req("/saidas/registrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      let data = null;
      try { data = await res.json(); } catch (_) {}

      return {
        ok: res.ok,
        status: res.status,
        data,
        error: data && data.error
      };
    } catch (err) {
      return {
        ok: false,
        status: 0,
        error: String((err && err.message) || err)
      };
    }
  };

  // -------- ATUALIZAR SAÍDA
  // PATCH /saidas/{id}
  window.TrackAPI.updateSaida = async function (id, payload) {
    const res = await req("/saidas/" + encodeURIComponent(id), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {})
    });
    let data = null; try { data = await res.json(); } catch (_) {}
    return { ok: res.ok, status: res.status, data, error: data && data.error };
  };

  // -------- EXCLUIR SAÍDA
  // DELETE /saidas/{id}
  window.TrackAPI.deleteSaida = async function (id) {
    const res = await req("/saidas/" + encodeURIComponent(id), { method: "DELETE" });
    let data = null; try { data = await res.json(); } catch (_) {}
    return { ok: res.ok, status: res.status, data, error: data && data.error };
  };

  // -------- LISTA ENTREGADORES
  // GET /entregadores
  window.TrackAPI.getEntregadores = async function () {
    const res = await req("/entregadores");
    let data = null; try { data = await res.json(); } catch (_) {}
    return data;
  };
})();
