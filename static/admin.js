let allReports = [];

document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    loadResources();
    loadReports();

    document.getElementById("addResourceBtn").addEventListener("click", addResource);
    document.getElementById("logoutBtn").addEventListener("click", logout);
    document.getElementById("reportSearchInput").addEventListener("input", renderFilteredReports);
});

// --- Theme Toggle Logic for Admin ---
function initTheme() {
    const themeToggle = document.getElementById('themeToggle');
    if(!themeToggle) return;

    const currentTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', currentTheme);

    themeToggle.addEventListener('click', () => {
        const theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    });
}

async function addResource() {
    const title = document.getElementById("resourceTitle").value.trim();
    const category = document.getElementById("resourceCategory").value.trim();
    const link = document.getElementById("resourceLink").value.trim();
    const description = document.getElementById("resourceDescription").value.trim();
    const result = document.getElementById("resourceResult");

    try {
        const response = await fetch("/api/admin/resources", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({ title, category, description, link })
        });

        const data = await response.json();
        result.className = "result mt-3";

        if (!response.ok) {
            result.classList.add("error");
            result.textContent = data.message;
            result.classList.remove("hidden");
            return;
        }

        result.classList.add("success");
        result.textContent = "Resource added to global database.";
        result.classList.remove("hidden");

        document.getElementById("resourceTitle").value = "";
        document.getElementById("resourceCategory").value = "";
        document.getElementById("resourceLink").value = "";
        document.getElementById("resourceDescription").value = "";

        loadResources();
        setTimeout(() => result.classList.add("hidden"), 3000);
    } catch {
        result.className = "result error mt-3";
        result.textContent = "Injection failed.";
        result.classList.remove("hidden");
    }
}

async function loadResources() {
    const response = await fetch("/api/resources");
    const data = await response.json();

    const list = document.getElementById("adminResourceList");
    list.innerHTML = "";

    data.forEach(item => {
        const div = document.createElement("div");
        div.className = "feed-item";
        div.innerHTML = `
            <div style="display:flex; justify-content:space-between;">
                <h4 style="color:var(--primary);">${item.title}</h4>
                <span class="text-sm muted">${item.category}</span>
            </div>
            <p class="mt-1">${item.description}</p>
        `;
        list.appendChild(div);
    });
}

async function loadReports() {
    const response = await fetch("/api/admin/reports");

    if (!response.ok) {
        window.location.href = "/admin-login";
        return;
    }

    allReports = await response.json();
    renderFilteredReports();
}

function renderFilteredReports() {
    const query = document.getElementById("reportSearchInput").value.trim().toLowerCase();
    const list = document.getElementById("adminReportList");
    list.innerHTML = "";

    const filtered = allReports.filter(item => {
        return (
            item.full_name.toLowerCase().includes(query) ||
            item.incident_type.toLowerCase().includes(query) ||
            item.city.toLowerCase().includes(query) ||
            item.status.toLowerCase().includes(query) ||
            item.severity.toLowerCase().includes(query)
        );
    });

    if (!filtered.length) {
        list.innerHTML = "<p class='muted text-center mt-4'>No telemetry matches found.</p>";
        return;
    }

    filtered.forEach(item => {
        const div = document.createElement("div");
        div.className = "admin-item-card";
        
        const badgeColor = item.status === 'Resolved' ? 'success-badge' : (item.status === 'Reviewing' ? 'info-badge' : 'warning-badge');
        
        div.innerHTML = `
            <div class="report-header">
                <h4 style="font-size:1.1rem; letter-spacing:-0.5px;">${item.incident_type}</h4>
                <span class="status-badge ${badgeColor}">${item.status}</span>
            </div>
            <div class="report-meta">
                <div><strong>Target:</strong> ${item.full_name}</div>
                <div><strong>Location:</strong> ${item.city}</div>
                <div><strong>Contact:</strong> ${item.contact}</div>
                <div><strong>Severity:</strong> ${item.severity}</div>
            </div>
            <div class="text-sm p-3" style="background:var(--bg-alt); border-radius:6px; border:1px solid var(--border-color);">
                ${item.description}
            </div>
            <div class="action-row">
                <button onclick="updateStatus(${item.id}, 'Pending')">Set Pending</button>
                <button onclick="updateStatus(${item.id}, 'Reviewing')">Set Reviewing</button>
                <button onclick="updateStatus(${item.id}, 'Resolved')">Mark Resolved</button>
            </div>
        `;
        list.appendChild(div);
    });
}

async function updateStatus(id, status) {
    const response = await fetch(`/api/admin/report-status/${id}`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ status })
    });

    if (response.ok) loadReports();
}

async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.href = "/admin-login";
}
