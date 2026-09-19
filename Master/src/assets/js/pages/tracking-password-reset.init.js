(() => {
    const params = new URLSearchParams(window.location.search);
    const identifier = params.get("identifier");

    const form = document.getElementById("resetForm");
    if (form) {
        form.addEventListener("submit", (e) => e.preventDefault());
    }

    Swal.fire({
        icon: "info",
        title: "Redefinição de senha",
        text: identifier
            ? "Por segurança, a senha não pode mais ser redefinida por esta tela. Solicite o reset ao administrador da operação."
            : "Solicite o reset de senha ao administrador da operação.",
        confirmButtonText: "Voltar ao login",
    }).then(() => {
        window.location.href = "auth-signin-tracking-v2.html";
    });
})();
