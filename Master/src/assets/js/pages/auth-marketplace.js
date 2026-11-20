/**
 * Helpers compartilhados: gerar link OAuth ML/Shopee, copiar, vincular, sync e contexto pós-OAuth.
 * Usado em Clientes (detalhe/coluna) e Autenticação.
 */
(function (global) {
  "use strict";

  var STORAGE_KEY = "rotevo_auth_pending_seller";
  var CONTEXT_TTL_MS = 2 * 60 * 60 * 1000;

  var PLATAFORMA = {
    ml: {
      key: "ml",
      platform: "mercado_livre",
      nome: "Mercado Livre",
      sigla: "ML",
      rota: "ml-int",
      idKey: "user_id_ml",
      queryOk: "ml",
    },
    shopee: {
      key: "shopee",
      platform: "shopee",
      nome: "Shopee",
      sigla: "Shopee",
      rota: "shopee",
      idKey: "shop_id",
      queryOk: "shopee",
    },
  };

  function apiBase() {
    return typeof global.getTrackApiUrl === "function" ? global.getTrackApiUrl() : "";
  }

  function plat(platform) {
    if (platform === "mercado_livre" || platform === "ml") return PLATAFORMA.ml;
    if (platform === "shopee") return PLATAFORMA.shopee;
    return null;
  }

  function setPendingSellerContext(ctx) {
    if (!ctx || !ctx.id_base) return;
    try {
      global.sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          id_base: Number(ctx.id_base),
          nome: ctx.nome || "",
          platform: ctx.platform || "",
          ts: Date.now(),
        })
      );
    } catch (_) {}
  }

  function getPendingSellerContext() {
    try {
      var raw = global.sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || !data.id_base) return null;
      if (data.ts && Date.now() - Number(data.ts) > CONTEXT_TTL_MS) {
        clearPendingSellerContext();
        return null;
      }
      return data;
    } catch (_) {
      return null;
    }
  }

  function clearPendingSellerContext() {
    try {
      global.sessionStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
  }

  async function lerErroDetalhe(res) {
    try {
      return await res.json();
    } catch (_) {
      return {};
    }
  }

  function mensagemDoDetalhe(detalhe, fallback) {
    if (!detalhe) return fallback;
    if (typeof detalhe.detail === "string") return detalhe.detail;
    if (detalhe.detail && typeof detalhe.detail.message === "string") return detalhe.detail.message;
    if (typeof detalhe.message === "string") return detalhe.message;
    return fallback;
  }

  async function gerarAuthUrl(platform, subBase) {
    var p = plat(platform);
    if (!p) throw new Error("Plataforma inválida.");
    var base = apiBase();
    var sb = String(subBase || "").trim();
    if (p.key === "ml") {
      if (!sb) throw new Error("Sub-base não definida. Ajuste o cadastro do usuário.");
      var res = await fetch(base + "/ml-int/connect?state=" + encodeURIComponent(sb), {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error(mensagemDoDetalhe(await lerErroDetalhe(res), "Erro ao gerar link."));
      }
      var data = await res.json();
      var url = data.auth_url || data.url || "";
      if (!url) throw new Error("Link não retornado pela API.");
      return url;
    }
    var params = new URLSearchParams({ redirect: "1" });
    if (sb) params.set("state", sb);
    return new URL(base + "/shopee/auth-url?" + params.toString(), global.location.href).href;
  }

  function copiarTexto(texto) {
    var t = String(texto || "").trim();
    if (!t) return Promise.reject(new Error("Nada para copiar."));
    if (global.navigator.clipboard && global.navigator.clipboard.writeText) {
      return global.navigator.clipboard.writeText(t);
    }
    return new Promise(function (resolve, reject) {
      var ta = global.document.createElement("textarea");
      ta.value = t;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      global.document.body.appendChild(ta);
      ta.select();
      try {
        global.document.execCommand("copy");
        resolve();
      } catch (e) {
        reject(e);
      } finally {
        ta.remove();
      }
    });
  }

  async function gerarECopiar(platform, subBase, opts) {
    var options = opts || {};
    if (options.context) setPendingSellerContext(options.context);
    var url = await gerarAuthUrl(platform, subBase);
    await copiarTexto(url);
    return url;
  }

  async function patchVinculo(platform, contaId, idBase) {
    var p = plat(platform);
    if (!p) throw new Error("Plataforma inválida.");
    var res = await fetch(
      apiBase() + "/" + p.rota + "/sellers/" + encodeURIComponent(contaId) + "/vinculo",
      {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_base: idBase != null ? Number(idBase) : null }),
      }
    );
    var detalhe = await lerErroDetalhe(res);
    if (!res.ok) {
      var err = new Error(mensagemDoDetalhe(detalhe, "Não foi possível salvar o vínculo."));
      err.status = res.status;
      err.detalhe = detalhe;
      throw err;
    }
    return detalhe;
  }

  async function syncEnvios(platform, contaId) {
    var p = plat(platform);
    if (!p) throw new Error("Plataforma inválida.");
    var res = await fetch(
      apiBase() + "/" + p.rota + "/sync-envios?" + p.idKey + "=" + encodeURIComponent(contaId),
      { method: "POST", credentials: "include" }
    );
    if (!res.ok) {
      throw new Error(mensagemDoDetalhe(await lerErroDetalhe(res), "Falha ao sincronizar."));
    }
    return res.json();
  }

  async function listarContasPlataforma(platform) {
    var p = plat(platform);
    if (!p) return [];
    var res = await fetch(apiBase() + "/" + p.rota + "/sellers", { credentials: "include" });
    if (!res.ok) return [];
    var data = await res.json();
    var rows = Array.isArray(data) ? data : data.sellers || data.items || [];
    return rows.map(function (c) {
      return Object.assign({}, c, {
        platform: p.platform,
        _plat: p,
        _id: c[p.idKey],
      });
    });
  }

  async function listarContasSemSeller(platformFilter) {
    var plats = platformFilter ? [platformFilter] : ["ml", "shopee"];
    var out = [];
    for (var i = 0; i < plats.length; i++) {
      var rows = await listarContasPlataforma(plats[i]);
      rows.forEach(function (c) {
        if (c.id_base == null) out.push(c);
      });
    }
    return out;
  }

  global.AuthMarketplace = {
    PLATAFORMA: PLATAFORMA,
    plat: plat,
    setPendingSellerContext: setPendingSellerContext,
    getPendingSellerContext: getPendingSellerContext,
    clearPendingSellerContext: clearPendingSellerContext,
    gerarAuthUrl: gerarAuthUrl,
    copiarTexto: copiarTexto,
    gerarECopiar: gerarECopiar,
    patchVinculo: patchVinculo,
    syncEnvios: syncEnvios,
    listarContasPlataforma: listarContasPlataforma,
    listarContasSemSeller: listarContasSemSeller,
    mensagemDoDetalhe: mensagemDoDetalhe,
  };
})(window);
