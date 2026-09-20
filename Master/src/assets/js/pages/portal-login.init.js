(function () {
  var form = document.getElementById("portalLoginForm");
  var err = document.getElementById("loginError");
  if (!form) return;
  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    if (err) {
      err.classList.add("d-none");
      err.textContent = "";
    }
    var login = (document.getElementById("login") || {}).value || "";
    var password = (document.getElementById("password") || {}).value || "";
    try {
      var res = await fetch(window.PortalSeller.apiBase() + "/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ login: login.trim(), password: password }),
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok) {
        throw new Error(window.PortalSeller.parseDetail(data));
      }
      window.PortalSeller.setToken(data.access_token);
      if (data.must_change_password) {
        location.href = "portal-emitir.html?trocar=1";
      } else {
        location.href = "portal-emitir.html";
      }
    } catch (ex) {
      if (err) {
        err.textContent = ex.message || "Login ou senha incorretos.";
        err.classList.remove("d-none");
      }
    }
  });
})();
