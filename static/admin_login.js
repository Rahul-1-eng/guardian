document.getElementById("adminLoginBtn").addEventListener("click", async () => {
    const username = document.getElementById("adminUsername").value.trim();
    const password = document.getElementById("adminPassword").value.trim();
    const result = document.getElementById("adminLoginResult");

    const btn = document.getElementById("adminLoginBtn");
    btn.textContent = "Authenticating...";

    try {
        const response = await fetch("/api/admin/login", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();
        result.className = "result mt-4";

        if (!response.ok) {
            result.classList.add("error");
            result.textContent = data.message;
            btn.textContent = "Establish Connection";
            result.classList.remove("hidden");
            return;
        }

        result.classList.add("success");
        result.textContent = "Authentication Verified. Redirecting...";
        result.classList.remove("hidden");
        setTimeout(() => window.location.href = "/admin", 500);
    } catch {
        result.className = "result error mt-4";
        result.textContent = "Server communication failure.";
        result.classList.remove("hidden");
        btn.textContent = "Establish Connection";
    }
});
