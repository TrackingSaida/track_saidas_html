(() => {

    const API_URL = window.TRACK_API_URL || "https://track-saidas-api.onrender.com/api";

    // Obter email/username vindo da tela anterior
    const params = new URLSearchParams(window.location.search);
    const identifier = params.get("identifier");

    if (!identifier) {
        Swal.fire({
            icon: "error",
            title: "Erro",
            text: "Nenhum usuário informado. Volte à tela de recuperação."
        }).then(() => window.location.href = "auth-pass-change-cover.html");
        return;
    }

    const form = document.getElementById("resetForm");
    const passInput = document.getElementById("password-input");
    const confirmInput = document.getElementById("confirm-password-input");

    // =============================
    // 🔥 Toggle olho — mesmo do login
    // =============================
    document.querySelectorAll('[data-toggle="ver-senha"]').forEach((btn) => {
        btn.addEventListener("click", () => {
            const group = btn.closest('.auth-pass-inputgroup');
            const input = group ? group.querySelector("input") : null;
            if (!input) return;

            input.type = input.type === "password" ? "text" : "password";

            const icon = btn.querySelector("i");
            if (icon) {
                icon.classList.toggle("ri-eye-fill");
                icon.classList.toggle("ri-eye-off-fill");
            }
        });
    });

    // =============================
    // 🔥 Envio do formulário
    // =============================
    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const pass = passInput.value.trim();
        const confirm = confirmInput.value.trim();

        if (pass.length < 8) {
            Swal.fire({
                icon: "warning",
                title: "Senha muito curta",
                text: "A senha deve ter no mínimo 8 caracteres."
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

            const data = await res.json().catch(() => ({}));

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
                title: "Senha redefinida",
                text: "Agora você pode fazer login com sua nova senha!"
            }).then(() => window.location.href = "auth-signin-tracking-v2.html");

        } catch (err) {
            console.error(err);
            Swal.fire({
                icon: "error",
                title: "Erro de conexão",
                text: "Não foi possível comunicar com o servidor."
            });
        }
    });

})();
