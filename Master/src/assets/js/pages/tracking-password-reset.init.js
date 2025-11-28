(() => {

    console.log("[tracking-reset] iniciado");

    const API_URL = window.TRACK_API_URL || "https://track-saidas-api.onrender.com/api";

    const params = new URLSearchParams(window.location.search);
    const identifier = params.get("identifier");

    // Evita loop infinito
    if (!identifier || identifier.trim() === "") {
        Swal.fire({
            icon: "error",
            title: "Erro",
            text: "Nenhum usuário informado. Volte e tente novamente.",
        }).then(() => {
            window.location.href = "auth-signin-tracking-v2.html";
        });
        return;
    }

    // Toggle de senha (igual ao login)
    document.querySelectorAll("[data-toggle='toggle-pass']").forEach((btn) => {
        btn.addEventListener("click", () => {
            const input = btn.closest(".auth-pass-inputgroup").querySelector("input");
            if (!input) return;

            input.type = input.type === "password" ? "text" : "password";

            const icon = btn.querySelector("i");
            icon.classList.toggle("ri-eye-fill");
            icon.classList.toggle("ri-eye-off-fill");
        });
    });

    // Formulário
    const form = document.getElementById("resetForm");
    const passInput = document.getElementById("password-input");
    const confirmInput = document.getElementById("confirm-password-input");

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const pass = passInput.value.trim();
        const confirm = confirmInput.value.trim();

        if (pass.length < 8) {
            Swal.fire("Senha muito curta", "Mínimo de 8 caracteres.", "warning");
            return;
        }

        if (pass !== confirm) {
            Swal.fire("As senhas não coincidem", "Verifique e tente novamente.", "error");
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
                Swal.fire("Erro", data.detail || "Falha ao redefinir senha.", "error");
                return;
            }

            Swal.fire({
                icon: "success",
                title: "Senha redefinida!",
                text: "Faça login com sua nova senha.",
            }).then(() => {
                window.location.href = "auth-signin-tracking-v2.html";
            });

        } catch (err) {
            console.error(err);
            Swal.fire("Erro", "Não foi possível comunicar com o servidor.", "error");
        }
    });

})();
