/**
 * Preferências de usuário (TrackPrefs) — persistidas em localStorage.
 * Usado para o modo de indicadores: "saiu para entrega" vs "entregue" (app mobile).
 */
(function () {
  "use strict";

  const STORAGE_KEY = "track_indicadores_status_mode";
  const VALID_MODES = ["saiu", "entregue"];

  function getIndicadorStatusMode() {
    try {
      const v = (localStorage.getItem(STORAGE_KEY) || "saiu").trim().toLowerCase();
      return VALID_MODES.includes(v) ? v : "saiu";
    } catch (_) {
      return "saiu";
    }
  }

  function setIndicadorStatusMode(mode) {
    const m = (mode || "saiu").trim().toLowerCase();
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
