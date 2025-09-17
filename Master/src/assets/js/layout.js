/* TrackingSaidas – layout fixo para todos os usuários */

(function () {
  const R = document.documentElement;

  // 1) Limpa preferências antigas salvas pelo Velzon
  [
    "data-bs-theme","data-layout","data-layout-width","data-layout-position",
    "data-topbar","data-sidebar","data-sidebar-size","data-theme","data-sidebar-color",
    "data-sidebar-image","data-theme-colors","data-preloader"
  ].forEach(k => localStorage.removeItem(k));

  // 2) Aplica os atributos padrão do layout
  function applyDefaults() {
    R.setAttribute("data-bs-theme", "light");      // Color Scheme
    R.setAttribute("data-layout", "vertical");     // Layout
    R.setAttribute("data-layout-width", "fluid");  // Layout Width
    R.setAttribute("data-layout-position", "fixed"); // Layout Position
    R.setAttribute("data-topbar", "dark");         // Topbar Color
    R.setAttribute("data-sidebar", "gradient");    // Sidebar Color (gradient)
    R.setAttribute("data-sidebar-color", "gradient-1"); // 1ª bolinha do gradient (se suportado)
    R.setAttribute("data-sidebar-size", "lg");     // Sidebar Size (Default)
    R.setAttribute("data-theme", "default");       // Theme (Default)
    R.setAttribute("data-preloader", "enable");    // Preloader ligado (se suportado)
  }

  // 3) Garante o padrão mesmo após scripts do template
  document.addEventListener("DOMContentLoaded", () => {
    applyDefaults();
    setTimeout(applyDefaults, 0);
  });

  // 4) Desativa qualquer input do customizer caso o HTML ainda exista
  document.addEventListener("click", (ev) => {
    const el = ev.target.closest('[name^="data-"],[data-bs-target="#theme-settings-offcanvas"]');
    if (el) {
      ev.stopImmediatePropagation();
      ev.preventDefault();
      applyDefaults();
      return false;
    }
  });

  // 5) Remove o botão e o offcanvas se estiverem na página
  const btn = document.querySelector('.customizer-setting');
  const offcanvas = document.getElementById('theme-settings-offcanvas');
  if (btn) btn.remove();
  if (offcanvas) offcanvas.remove();
})();
