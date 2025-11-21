// assets/js/pages/profile-settings-tracking.init.js
//
// Este script inicializa a página de configurações de perfil do Tracking Saídas.
// Ele busca os dados do usuário logado, preenche o formulário de dados pessoais,
// permite a atualização dessas informações e realiza a troca de senha. Caso
// existam endpoints diferentes para atualização de senha, defina
// window.TRACK_PASSWORD_ENDPOINT no HTML.

(() => {
  const API_URL = window.TRACK_API_URL || "";
  // Endpoint relativo para alteração de senha. O HTML pode definir
  // window.TRACK_PASSWORD_ENDPOINT; caso contrário, usa a rota padrão.
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

  /**
   * Mostra um alerta simples. No futuro, pode ser substituído por
   * biblioteca de toast (ex.: Toastify) ou Bootstrap alerts.
   * @param {string} msg
   */
  function showAlert(msg) {
    alert(msg);
  }

  /**
   * Carrega os dados do usuário logado chamando o endpoint /auth/me.
   * Preenche os campos do formulário de dados pessoais.
   */
  async function loadCurrentUser() {
    try {
      const res = await fetch(`${API_URL}/auth/me`, {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("Falha ao obter dados do usuário.");
      }
      const user = await res.json();
      // Preencher campos. Alguns atributos (nome, sobrenome) podem vir como null.
      nomeInput.value = user.nome ?? "";
      sobrenomeInput.value = user.sobrenome ?? "";
      telefoneInput.value = user.contato ?? "";
      emailInput.value = user.email ?? "";
      subbaseInput.value = user.sub_base ?? "";
      // Atualizar cabeçalho da coluna esquerda
      if (user.nome || user.sobrenome) {
        profileName.innerText = `${user.nome ?? ""} ${user.sobrenome ?? ""}`.trim();
      } else {
        // fallback: username como nome principal
        profileName.innerText = user.username ?? "Usuário";
      }
      profileSubtitle.innerText = user.username ? `@${user.username}` : "";
    } catch (err) {
      console.error(err);
      showAlert("Não foi possível carregar seus dados. Faça login novamente.");
    }
  }

  /**
   * Handler para submissão do formulário de dados pessoais.
   * Envia PATCH em /users/me com as informações atualizadas.
   * Caso a API retorne erro, exibirá o detalhe.
   * @param {SubmitEvent} e
   */
  async function handleProfileSubmit(e) {
    e.preventDefault();
    // Monta payload. Apenas campos não vazios serão enviados.
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
        showAlert(err.detail || "Erro ao salvar alterações.");
        return;
      }
      showAlert("Dados atualizados com sucesso!");
      // Recarrega usuário para refletir alterações
      await loadCurrentUser();
    } catch (err) {
      console.error(err);
      showAlert("Não foi possível salvar as alterações.");
    }
  }

  /**
   * Handler para submissão do formulário de senha.
   * Realiza validações básicas e envia a troca de senha para o endpoint
   * configurado. Espera que a API aceite current_password e new_password.
   * @param {SubmitEvent} e
   */
  async function handlePasswordSubmit(e) {
    e.preventDefault();
    const currentPass = document.getElementById("current-pass").value;
    const newPass = document.getElementById("new-pass").value;
    const confirmPass = document.getElementById("confirm-pass").value;
    if (!currentPass || !newPass || !confirmPass) {
      showAlert("Preencha todos os campos de senha.");
      return;
    }
    if (newPass !== confirmPass) {
      showAlert("A nova senha e a confirmação não coincidem.");
      return;
    }
    try {
      const res = await fetch(`${API_URL}${PASSWORD_ENDPOINT}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ current_password: currentPass, new_password: newPass }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showAlert(err.detail || "Erro ao alterar senha.");
        return;
      }
      showAlert("Senha alterada com sucesso!");
      // Limpar campos após sucesso
      document.getElementById("current-pass").value = "";
      document.getElementById("new-pass").value = "";
      document.getElementById("confirm-pass").value = "";
    } catch (err) {
      console.error(err);
      showAlert("Não foi possível alterar a senha.");
    }
  }

  /**
   * Alterna entre mostrar/ocultar a senha nos campos de input. Usa
   * data-toggle="eye" no botão para associar ao input imediatamente anterior.
   */
  function initPasswordToggle() {
    const toggles = document.querySelectorAll('[data-toggle="eye"]');
    toggles.forEach(btn => {
      btn.addEventListener("click", () => {
        const parent = btn.closest(".auth-pass-inputgroup");
        if (!parent) return;
        const input = parent.querySelector("input");
        if (!input) return;
        if (input.type === "password") {
          input.type = "text";
          btn.querySelector("i").classList.remove("ri-eye-fill");
          btn.querySelector("i").classList.add("ri-eye-off-fill");
        } else {
          input.type = "password";
          btn.querySelector("i").classList.remove("ri-eye-off-fill");
          btn.querySelector("i").classList.add("ri-eye-fill");
        }
      });
    });
  }

  // Inicialização
  document.addEventListener("DOMContentLoaded", () => {
    loadCurrentUser();
    initPasswordToggle();
    profileForm.addEventListener("submit", handleProfileSubmit);
    passwordForm.addEventListener("submit", handlePasswordSubmit);
  });
})();