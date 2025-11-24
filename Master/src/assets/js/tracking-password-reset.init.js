(() => {

    console.log("[tracking-reset] iniciado");

    const API_URL = window.TRACK_API_URL || "https://track-saidas-api.onrender.com/api";

    // -------------------------------------------------------
    // 🔹 Obter identifier vindo da página anterior (?identifier=)
    // -------------------------------------------------------
    const params = new URLSearchParams(window.location.search);
    const identifier = params.get("identifier");

    if (!identifier) {
        Swal.fire({
            icon: "error",
            title: "Erro",
            text: "Nenhum usuário informado. Volte e tente novamente.",
        }).then(() => {
            window.location.href = "auth-pass-change-cover.html";
        });
        return;
    }

    // -------------------------------------------------------
    // 🔹 Elementos principais
    // -------------------------------------------------------
    const form = document.getElementById("resetForm");
    const passInput = document.getElementById("password-input");
    const confirmInput = document.getElementById("confirm-password-input");

    // -------------------------------------------------------
    // 👁‍🗨 TOGGLE VER SENHA
    // -------------------------------------------------------
    document.querySelectorAll(".auth-pass-inputgroup button").forEach((btn) => {
        btn.addEventListener("click", () => {
            const input = btn.closest(".auth-pass-inputgroup").querySelector("input");
            const icon = btn.querySelector("i");

            if (input.type === "password") {
                input.type = "text";
                icon.classList.remove("ri-eye-fill");
                icon.classList.add("ri-eye-off-fill");
            } else {
                input.type = "password";
                icon.classList.remove("ri-eye-off-fill");
                icon.classList.add("ri-eye-fill");
            }
        });
    });

    // -------------------------------------------------------
    // 🔹 SUBMIT - RESET DE SENHA
    // -------------------------------------------------------
    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const pass = passInput.value.trim();
        const confirm = confirmInput.value.trim();

        // Validações básicas
        if (pass.length < 8) {
            Swal.fire({
                icon: "warning",
                title: "Senha muito curta",
                text: "A senha deve possuir no mínimo 8 caracteres."
            });
            return;
        }

        if (pass !== confirm) {
            Swal.fire({
                icon: "error",
                title: "As senhas não coincidem",
                text: "Verifique e tente novamente."
            });
            return;
        }

        try {
            const res = await fetch(`${API_URL}/auth/reset-password`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    identifier: identifier,
                    new_password: pass
                })
            });

            const data = await res.json();

            if (!res.ok) {
                Swal.fire({
                    icon: "error",
                    title: "Erro ao redefinir senha",
                    text: data.detail || "Tente novamente."
                });
                return;
            }

            Swal.fire({
                icon: "success",
                title: "Senha alterada!",
                text: "Use sua nova senha para entrar no sistema."
            }).then(() => {
                window.location.href = "auth-signin-tracking-v2.html";
            });

        } catch (err) {
            console.error(err);
            Swal.fire({
                icon: "error",
                title: "Erro de comunicação",
                text: "Não foi possível conectar ao servidor."
            });
        }
    });

})();
