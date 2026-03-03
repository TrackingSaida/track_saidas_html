// assets/js/pages/profile-settings-tracking.init.js

(() => {
  const API_URL = window.TRACK_API_URL || "";
  const PASSWORD_ENDPOINT = window.TRACK_PASSWORD_ENDPOINT || "/users/me/password";

  // Elementos do DOM
  const profileForm = document.getElementById("profile-form");
  const passwordForm = document.getElementById("password-form");
  const nomeInput = document.getElementById("nome");
  const sobrenomeInput = document.getElementById("sobrenome");
  const telefoneInput = document.getElementById("telefone");
  const emailInput = document.getElementById("emailInput");
  const subbaseInput = document.getElementById("subbase");

  const profileName = document.getElementById("profileName");
  const profileSubtitle = document.getElementById("profileSubtitle");

  // =============================
  // SweetAlert padrão
  // =============================
  function swalError(msg) {
    Swal.fire({
      icon: "error",
      title: "Ops...",
      text: msg,
      confirmButtonColor: "#556ee6",
    });
  }

  function swalSuccess(msg) {
    Swal.fire({
      icon: "success",
      title: "Sucesso!",
      text: msg,
      confirmButtonColor: "#556ee6",
    });
  }

  // =============================
  // Garantir sessão válida
  // =============================
  async function ensureSession() {
    try {
      if (window.ensureAuth) {
        await window.ensureAuth(); 
      }
    } catch (e) {
      console.error("Sessão expirada:", e);
      Swal.fire({
        icon: "warning",
        title: "Sessão Expirada",
        text: "Faça login novamente para continuar.",
        confirmButtonColor: "#556ee6",
      }).then(() => {
        window.location.href = "auth-login.html";
      });
    }
  }

  // =============================
  // Query params helper
  // =============================
  function getQueryParam(name) {
    try {
      const u = new URL(window.location.href);
      return u.searchParams.get(name);
    } catch {
      return null;
    }
  }

  // =============================
  // Carrega usuário completo
  // =============================
  async function loadCurrentUser() {
    try {
      const res = await fetch(`${API_URL}/users/me`, {
        credentials: "include",
      });

      if (!res.ok) throw new Error("Erro ao buscar dados do usuário.");

      const user = await res.json();

      // Preenche campos
      nomeInput.value = user.nome ?? "";
      sobrenomeInput.value = user.sobrenome ?? "";
      telefoneInput.value = user.contato ?? "";
      emailInput.value = user.email ?? "";
      subbaseInput.value = user.sub_base ?? "";

      // Nome do card
      if (user.nome || user.sobrenome) {
        profileName.innerText = `${user.nome || ""} ${user.sobrenome || ""}`.trim();
      } else {
        profileName.innerText = user.username ?? "Usuário";
      }

      profileSubtitle.innerText = `@${user.username}`;

      // Se veio da tela de login com exigência de troca de senha, focar aba de senha
      const forceChange = getQueryParam("force_password_change");
      if (forceChange === "1") {
        const passwordTabTrigger = document.querySelector('[data-bs-target="#password-pane"]') ||
                                   document.querySelector('[href="#password-pane"]');
        if (passwordTabTrigger && window.bootstrap && bootstrap.Tab) {
          const tab = new bootstrap.Tab(passwordTabTrigger);
          tab.show();
        }
        Swal.fire({
          icon: "info",
          title: "Troca de senha obrigatória",
          text: "Defina uma nova senha para continuar utilizando o sistema.",
          confirmButtonColor: "#556ee6",
        });
      }

    } catch (err) {
      console.error(err);
      swalError("Não foi possível carregar seus dados. Faça login novamente.");
    }
  }

  // =============================
  // Salvar Perfil (PATCH)
  // =============================
  async function handleProfileSubmit(e) {
    e.preventDefault();

    const payload = {
      nome: nomeInput.value.trim(),
      sobrenome: sobrenomeInput.value.trim(),
      contato: telefoneInput.value.trim(),
      email: emailInput.value.trim(),
    };

    try {
      const res = await fetch(`${API_URL}/users/me`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        swalError(err.detail || "Erro ao atualizar seus dados.");
        return;
      }

      swalSuccess("Dados atualizados com sucesso!");
      loadCurrentUser();

    } catch (err) {
      console.error(err);
      swalError("Não foi possível salvar suas alterações.");
    }
  }

  // =============================
  // Alterar senha
  // =============================
  async function handlePasswordSubmit(e) {
    e.preventDefault();

    const currentPass = document.getElementById("current-pass").value;
    const newPass = document.getElementById("new-pass").value;
    const confirmPass = document.getElementById("confirm-pass").value;

    if (!currentPass || !newPass || !confirmPass) {
      swalError("Preencha todos os campos de senha.");
      return;
    }

    if (newPass !== confirmPass) {
      swalError("A nova senha e a confirmação não coincidem.");
      return;
    }

    try {
      const res = await fetch(`${API_URL}${PASSWORD_ENDPOINT}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          current_password: currentPass,
          new_password: newPass,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        swalError(err.detail || "Erro ao alterar senha.");
        return;
      }

      swalSuccess("Senha alterada com sucesso!");

      // limpar campos
      document.getElementById("current-pass").value = "";
      document.getElementById("new-pass").value = "";
      document.getElementById("confirm-pass").value = "";

    } catch (err) {
      console.error(err);
      swalError("Erro ao comunicar com o servidor.");
    }
  }

  // =============================
  // Toggle olho da senha
  // =============================
  function initPasswordToggle() {
    const toggles = document.querySelectorAll('[data-toggle="eye"]');
    toggles.forEach(btn => {
      btn.addEventListener("click", () => {
        const parent = btn.closest(".auth-pass-inputgroup");
        const input = parent?.querySelector("input");
        if (!input) return;

        const icon = btn.querySelector("i");

        if (input.type === "password") {
          input.type = "text";
          icon.classList.replace("ri-eye-fill", "ri-eye-off-fill");
        } else {
          input.type = "password";
          icon.classList.replace("ri-eye-off-fill", "ri-eye-fill");
        }
      });
    });
  }

  // =============================
  // Inicialização
  // =============================
  document.addEventListener("DOMContentLoaded", async () => {
    await ensureSession();  
    await loadCurrentUser(); 

    initPasswordToggle();

    profileForm.addEventListener("submit", handleProfileSubmit);
    passwordForm.addEventListener("submit", handlePasswordSubmit);
  });

})();
