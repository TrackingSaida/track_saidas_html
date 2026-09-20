(function () {
  "use strict";
  var form = document.getElementById("portalLoginForm");
  var err = document.getElementById("loginError");
  var btn = document.getElementById("btnLogin");
  var pass = document.getElementById("password");
  var toggle = document.getElementById("btnTogglePass");

  if (window.PortalSeller && window.PortalSeller.token()) {
    location.href = "portal-visao-geral.html";
    return;
  }

  toggle?.addEventListener("click", function () {
    if (!pass) return;
    var show = pass.type === "password";
    pass.type = show ? "text" : "password";
    toggle.setAttribute("aria-label", show ? "Ocultar senha" : "Mostrar senha");
    toggle.title = show ? "Ocultar senha" : "Mostrar senha";
    var icon = toggle.querySelector("i");
    if (icon) {
      icon.className = show ? "ri-eye-off-line" : "ri-eye-line";
    }
  });

  if (!form) return;
  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    if (err) {
      err.classList.add("d-none");
      err.textContent = "";
    }
    var login = (document.getElementById("login") || {}).value || "";
    var password = (pass || {}).value || "";
    if (btn) {
      btn.disabled = true;
      var label = btn.querySelector(".btn-label");
      if (label) label.textContent = "Entrando…";
      else btn.textContent = "Entrando…";
    }
    try {
      var res = await fetch(window.PortalSeller.apiBase() + "/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ login: login.trim(), password: password }),
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok) {
        throw new Error(window.PortalSeller.parseDetail(data));
      }
      window.PortalSeller.setToken(data.access_token);
      if (data.must_change_password) {
        location.href = "portal-emitir.html?trocar=1";
      } else {
        location.href = "portal-visao-geral.html";
      }
    } catch (ex) {
      if (err) {
        err.textContent = ex.message || "Login ou senha incorretos.";
        err.classList.remove("d-none");
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        var label2 = btn.querySelector(".btn-label");
        if (label2) label2.textContent = "Entrar";
        else btn.textContent = "Entrar";
      }
    }
  });
})();
