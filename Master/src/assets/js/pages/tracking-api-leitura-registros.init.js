// Wrapper da API para Leitura/Registros
(function (global) {
  "use strict";

  const ns = global.TrackAPI || {};

  // Base definida no HTML (ou fallback)
  const API_BASE = (global.TRACK_API_URL || global.API_URL || "https://track-saidas-api.onrender.com/api")
    .replace(/\/+$/, "");

  function url(path) { return API_BASE + (path.startsWith("/") ? "" : "/") + path; }

  function getToken() {
    return localStorage.getItem("access_token")
        || localStorage.getItem("acess_token")
        || sessionStorage.getItem("access_token");
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
      credentials: "include",               // envia cookie/sessão
      ...options,
      headers: authHeaders(options.headers),
    });
    let body = null;
    try { body = await res.json(); } catch (_) {}
    if (!res.ok) {
      throw { status: res.status, ...(body || {}), error: (body && body.error) || res.statusText || "Erro" };
    }
    return body;
  }

  // -------- Endpoints --------

  // Lista entregadores do usuário logado
  ns.getEntregadores = function () {
    return request("/entregadores/");  // barra final evita 307 sem CORS
  };

  // Registrar saída (agora enviando também "servico")
  ns.registerSaida = async function ({ entregador, codigo, servico }) {
    // Tenta rota sem e com barra final
    try {
      return await request("/saidas/registrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entregador, codigo, servico }),
      });
    } catch (e1) {
      if (e1?.status !== 404) throw e1;
      return await request("/saidas/registrar/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entregador, codigo, servico }),
      });
    }
  };

  // Marcar/atualizar duplicado (somente update)
  // Preferido: PATCH /saidas/duplicado  { entregador, codigo, duplicado:true }
  // Fallbacks:  POST /saidas/duplicado  |  PATCH /saidas/marcar-duplicado
  ns.setDuplicado = async function ({ entregador, codigo, duplicado = true }) {
    try {
      return await request("/saidas/duplicado", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entregador, codigo, duplicado }),
      });
    } catch (e1) {
      if (e1?.status !== 404) throw e1;
      try {
        return await request("/saidas/duplicado", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entregador, codigo, duplicado }),
        });
      } catch (e2) {
        if (e2?.status !== 404) throw e2;
        return await request("/saidas/marcar-duplicado", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entregador, codigo, duplicado }),
        });
      }
    }
  };

  // opcional
  ns.ping = function () { return request("/health"); };

  global.TrackAPI = ns;
})(window);
