const SIGNUP_URL = "https://track-saidas-api.onrender.com/api/users/";

// mostrar/ocultar senha
(function () {
  const input = document.getElementById("senha-input");
  const btn = document.getElementById("senha-addon");
  if (input && btn) {
    btn.addEventListener("click", () => {
      input.type = input.type === "password" ? "text" : "password";
    });
  }
})();

document.getElementById("signup-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  const form = e.target;
  if (!form.checkValidity()) {
    form.classList.add('was-validated');
    return;
  }

  const email = document.getElementById("useremail").value.trim();
  const username = document.getElementById("username").value.trim();
  const contato = document.getElementById("contato").value.trim();
  const password_hash = document.getElementById("senha-input").value; // <-- nome que a API espera

  const btn = document.getElementById("signup-btn");
  const originalText = btn.innerText;
  btn.disabled = true; btn.innerText = "Enviando...";

  try {
    const resp = await fetch(SIGNUP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, username, contato, password_hash })
    });

    if (resp.ok) {
      alert("Conta criada com sucesso!");
      window.location.href = "auth-signin-basic.html";
    } else {
      const data = await resp.json().catch(() => ({}));
      const msg = data?.detail || data?.message || "Erro ao criar conta.";
      alert(msg);
    }
  } catch (err) {
    console.error(err);
    alert("Falha ao comunicar com o servidor.");
  } finally {
    btn.disabled = false; btn.innerText = originalText;
  }
});

