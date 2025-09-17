// Wrapper da API para Leitura/Registros
(function (global) {
  "use strict";

  const ns = global.TrackAPI || {};

  // Base definida no HTML (ou fallback)
  const API_BASE = (global.TRACK_API_URL || global.API_URL || "https://track-saidas-api.onrender.com/api")
    .replace(/\/+$/, "");

  function url(path) {
    return API_BASE + (path.startsWith("/") ? "" : "/") + path;
  }

  function getToken() {
    return (
      localStorage.getItem("access_token") ||
      localStorage.getItem("acess_token") ||
      sessionStorage.getItem("access_token")
    );
  }

  function authHeaders(extra) {
    const h = { Accept: "application/json", ...(extra || {}) };
    const t = getToken();
    if (t) h.Authorization = `Bearer ${t}`;
    return h;
  }

  async function request(path, options = {}) {
  const res = await fetch(url(path), {
    mode: "cors",
    credentials: "include",
    ...options,
    headers: authHeaders(options.headers),
  });

  let data = null, text = null;
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (ct.includes("application/json")) {
    try { data = await res.json(); } catch (_) {}
  } else {
    try { text = await res.text(); } catch (_) {}
  }

  if (!res.ok) {
    // <- NOVO: dá suporte a detail = { code, message }
    let code = null;
    let msg =
      (data && (data.error || data.message)) ||
      (Array.isArray(data?.detail) &&
        data.detail.map(d => d.msg || d.message || d.detail).filter(Boolean).join("; ")) ||
      (data?.detail && typeof data.detail === "object" && (code = data.detail.code || null, data.detail.message || data.detail.msg)) ||
      (typeof data === "string" ? data : null) ||
      res.statusText || "Erro";

    const err = { status: res.status, ...(data || {}), error: msg };
    if (code) err.code = code; // <- expõe o code no erro
    throw err;
  }

  if (data && typeof data === "object" && ("ok" in data || "data" in data)) return data;
  return { ok: true, status: res.status, data: (data ?? null), text };
}


  // -------- Endpoints --------

  // Lista entregadores do usuário logado
  ns.getEntregadores = function () {
    return request("/entregadores/"); // barra final evita 307 sem CORS
  };

  // Registrar saída (única rota)
  ns.registerSaida = function ({ entregador, codigo, servico }) {
    return request("/saidas/registrar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entregador, codigo, servico }),
    });
  };

  ns.ping = function () {
    return request("/health");
  };

  global.TrackAPI = ns;
})(window);
