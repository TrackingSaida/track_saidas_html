async function carregarUsuarioLogado() {
  try {
    const resp = await fetch("https://track-saidas-api.onrender.com/api/auth/me", {
      credentials: "include"
    });
    if (!resp.ok) return;

    const user = await resp.json();
    // Atualiza nome no topbar e sidebar
    document.querySelectorAll(".user-name-text, .sidebar-user-name-text")
      .forEach(el => el.textContent = user.username || user.email);

    // Atualiza header de boas-vindas
    document.querySelectorAll(".dropdown-header")
      .forEach(el => {
        if (el.textContent.includes("Anna")) {
          el.textContent = `Bem-vindo ${user.username || ""}!`;
        }
      });

  } catch (e) {
    console.error("Erro ao carregar usuário logado:", e);
  }
}

document.addEventListener("DOMContentLoaded", carregarUsuarioLogado);
