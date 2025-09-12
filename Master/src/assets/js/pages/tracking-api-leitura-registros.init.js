(function (global) {
  "use strict";

  const ns = global.TrackAPI || {};

  // Base: usa TRACK_API_URL do HTML; senão API_URL global; senão fallback
  const API_BASE = (global.TRACK_API_URL || global.API_URL || "https://track-saidas-api.onrender.com/api")
    .replace(/\/+$/, ""); // remove barra(s) finais

  function url(path) {
    return API_BASE + (path.startsWith("/") ? "" : "/") + path;
  }

  function getToken() {
    return (
      localStorage.getItem("access_token") ||
      localStorage.getItem("acess_token") || // cobre typo
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
    credentials: "include",               // <<--- adiciona isto
    ...options,
    headers: authHeaders(options.headers),
  });

  let body = null;
  try { body = await res.json(); } catch (_) {}

  if (!res.ok) {
    throw {
      status: res.status,
      ...(body || {}),
      error: (body && body.error) || res.statusText || "Erro na requisição",
    };
  }
  return body;
}


  // -------- Endpoints --------

  // GET /entregadores/  (barra final evita 307 e problemas de CORS em redirect)
  ns.getEntregadores = function () {
    return request("/entregadores/"); // já filtrado pelo usuário logado no back
  };

  // POST /saidas/registrar  { entregador, codigo }
  ns.registerSaida = function ({ entregador, codigo }) {
    return request("/saidas/registrar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entregador, codigo }),
    });
  };

  // opcional
  ns.ping = function () { return request("/health"); };

  global.TrackAPI = ns;
})(window);
