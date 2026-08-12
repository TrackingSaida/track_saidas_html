/**
 * Preferências de usuário (TrackPrefs) — persistidas em localStorage.
 * Usado para o modo de indicadores: "operacional" (status válidos) vs "entregue" (app mobile).
 */
(function () {
  "use strict";

  const STORAGE_KEY = "track_indicadores_status_mode";
  const VALID_MODES = ["saiu", "operacional", "entregue"];
  const RANKING_VIEW_KEY = "track_indicadores_ranking_view";
  const VALID_RANKING_VIEWS = ["podio", "ranking"];

  function getIndicadorStatusMode() {
    try {
      const raw = (localStorage.getItem(STORAGE_KEY) || "operacional").trim().toLowerCase();
      // Migração de preferência antiga: "saiu" passa a "operacional"
      const v = raw === "saiu" ? "operacional" : raw;
      return VALID_MODES.includes(v) ? v : "operacional";
    } catch (_) {
      return "operacional";
    }
  }

  function setIndicadorStatusMode(mode) {
    const m = (mode || "operacional").trim().toLowerCase();
    if (!VALID_MODES.includes(m)) return;
    try {
      localStorage.setItem(STORAGE_KEY, m);
    } catch (_) {}
  }

  function getIndicadorRankingView() {
    try {
      const raw = (localStorage.getItem(RANKING_VIEW_KEY) || "podio").trim().toLowerCase();
      return VALID_RANKING_VIEWS.includes(raw) ? raw : "podio";
    } catch (_) {
      return "podio";
    }
  }

  function setIndicadorRankingView(view) {
    const v = (view || "podio").trim().toLowerCase();
    if (!VALID_RANKING_VIEWS.includes(v)) return;
    try {
      localStorage.setItem(RANKING_VIEW_KEY, v);
    } catch (_) {}
  }

  window.TrackPrefs = {
    getIndicadorStatusMode: getIndicadorStatusMode,
    setIndicadorStatusMode: setIndicadorStatusMode,
    getIndicadorRankingView: getIndicadorRankingView,
    setIndicadorRankingView: setIndicadorRankingView,
  };
})();
