async function carregarUsuarioLogado() {
  try {
    const resp = await fetch("https://track-saidas-api.onrender.com/api/auth/me", {
      credentials: "include"
    });
    if (!resp.ok) return;

    const user = await resp.json();
    // Atualiza nome no topbar e sidebar
const nome = (user.nome || "").trim();
const sobrenome = (user.sobrenome || "").trim();
const username = (user.username || "").trim();
const email = (user.email || "").trim();
const display = (nome || sobrenome) ? `${nome} ${sobrenome}`.trim() : (username || email || "Usuário");

// Topbar e Sidebar: mostra Nome Sobrenome > username > email
document.querySelectorAll(".user-name-text, .sidebar-user-name-text")
  .forEach(el => el.textContent = display);

// Header de boas-vindas (substitui o placeholder "Anna")
document.querySelectorAll(".dropdown-header")
  .forEach(el => {
    if (el.textContent.includes("Anna")) {
      el.textContent = `Bem-vindo ${display}!`;
    }
  });


  } catch (e) {
    console.error("Erro ao carregar usuário logado:", e);
  }
}



document.addEventListener("DOMContentLoaded", carregarUsuarioLogado);
