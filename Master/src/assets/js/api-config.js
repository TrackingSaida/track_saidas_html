(function (w) {
  "use strict";

  var configured = "__INJECT_API_URL__";
  var apiUrl = String(configured || "").trim().replace(/\/+$/, "");

  if (
    !apiUrl ||
    apiUrl.indexOf("__INJECT_") === 0 ||
    !/^https?:\/\//i.test(apiUrl)
  ) {
    throw new Error(
      "URL da API não configurada. Defina API_URL ou VITE_API_URL no ambiente de build."
    );
  }

  w.TRACK_API_URL = apiUrl;
  w.TRACK_API_ORIGIN = apiUrl.replace(/\/api$/i, "");

  w.getTrackApiUrl = function () {
    var url = String(w.TRACK_API_URL || "").trim().replace(/\/+$/, "");
    if (!url) {
      throw new Error("URL da API não configurada (window.TRACK_API_URL).");
    }
    return url;
  };

  w.getTrackApiOrigin = function () {
    var origin = String(w.TRACK_API_ORIGIN || "").trim().replace(/\/+$/, "");
    if (origin) return origin;
    return w.getTrackApiUrl().replace(/\/api$/i, "");
  };
})(window);
