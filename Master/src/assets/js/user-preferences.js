/**
 * Preferências de usuário (TrackPrefs) — persistidas em localStorage.
 * Usado para o modo de indicadores: "operacional" (status válidos) vs "entregue" (app mobile).
 */
(function () {
  "use strict";

  const STORAGE_KEY = "track_indicadores_status_mode";
  const VALID_MODES = ["saiu", "operacional", "entregue"];

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

  window.TrackPrefs = {
    getIndicadorStatusMode: getIndicadorStatusMode,
    setIndicadorStatusMode: setIndicadorStatusMode,
  };
})();
