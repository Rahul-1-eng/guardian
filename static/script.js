const quizData = [
    {
        question: "What should you do if someone asks for your Aadhaar OTP on a call claiming to be from the bank?",
        options: ["Share it quickly", "Refuse, disconnect, and call the official bank branch", "Send it later via SMS", "Share if they sound urgent"],
        answer: 1
    },
    {
        question: "What is a safe practice when providing a physical copy of your Aadhaar?",
        options: ["Post it on social media", "Provide a masked/redacted copy stating the purpose", "Keep it in a clear folder", "Give original to stranger"],
        answer: 1
    },
    {
        question: "What is a likely sign of a phishing message?",
        options: ["Official branch visit request", "An SMS with an urgent shortened link to 'update KYC'", "Printed passbook update", "ATM receipt"],
        answer: 1
    },
    {
        question: "What does 'DBT Linkage' refer to in the context of banking?",
        options: ["Crypto wallet linking", "Configuring the account to receive Direct Benefit Transfers from the Govt.", "School attendance", "SIM card recharge"],
        answer: 1
    }
];

let incidentChartInstance = null;
let riskChartInstance = null;
let severityChartInstance = null;

document.addEventListener("DOMContentLoaded", () => {
    initTheme();

    if (document.getElementById("quizContainer")) renderQuiz();
    if (document.getElementById("resourceGrid")) fetchResources();
    if (document.getElementById("totalReports")) fetchDashboard();
    if (document.getElementById("chatToggleBtn")) setupChatbox();

    const valForm = document.getElementById("validatorForm");
    if(valForm) valForm.addEventListener("submit", handleValidation);
    
    const repForm = document.getElementById("reportForm");
    if(repForm) repForm.addEventListener("submit", handleReportSubmit);
    
    const quizBtn = document.getElementById("submitQuizBtn");
    if(quizBtn) quizBtn.addEventListener("click", handleQuizSubmit);
});

// --- Theme Toggle Logic ---
function initTheme() {
    const themeToggle = document.getElementById('themeToggle');
    if(!themeToggle) return; // Not on all pages

    const currentTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', currentTheme);

    themeToggle.addEventListener('click', () => {
        const theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        
        // Re-render charts to update colors if needed
        if (document.getElementById("totalReports")) fetchDashboard(); 
    });
}

function getChartColors() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    return {
        text: isDark ? '#f8fafc' : '#64748b',
        grid: isDark ? '#334155' : '#e2e8f0',
        primary: isDark ? '#818cf8' : '#4f46e5'
    };
}


function setResult(id, message, type) {
    const el = document.getElementById(id);
    el.className = "result mt-3";
    if (type === "success") el.classList.add("success");
    else if (type === "error") el.classList.add("error");
    else el.classList.add("info");
    el.textContent = message;
    el.classList.remove("hidden");
}

async function handleValidation(e) {
    e.preventDefault();
    const aadhaar = document.getElementById("aadhaarInput").value.trim();

    try {
        const response = await fetch("/api/validate", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({ aadhaar })
        });
        const data = await response.json();

        if (!response.ok) {
            setResult("validatorResult", data.message, "error");
            return;
        }

        const text = `Integrity Check: ${data.is_valid ? "Passed" : "Failed Checksum"} | Calculated Risk: ${data.risk_level}`;
        setResult("validatorResult", text, data.is_valid ? "success" : "error");
        fetchDashboard();
    } catch {
        setResult("validatorResult", "Validation endpoint unreachable.", "error");
    }
}

async function handleReportSubmit(e) {
    e.preventDefault();

    const payload = {
        full_name: document.getElementById("fullName").value.trim(),
        contact: document.getElementById("contact").value.trim(),
        incident_type: document.getElementById("incidentType").value,
        city: document.getElementById("city").value.trim(),
        description: document.getElementById("description").value.trim()
    };

    try {
        const response = await fetch("/api/report", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(payload)
        });
        const data = await response.json();

        if (!response.ok) {
            setResult("reportResult", data.message, "error");
            return;
        }

        setResult("reportResult", `Incident Logged. Automatic Severity Classification: ${data.severity}`, "success");
        document.getElementById("reportForm").reset();
        fetchDashboard();
    } catch {
        setResult("reportResult", "Unable to transmit to server.", "error");
    }
}

function renderQuiz() {
    const container = document.getElementById("quizContainer");
    container.innerHTML = "";

    quizData.forEach((item, index) => {
        const div = document.createElement("div");
        div.className = "mb-4";

        let optionsHTML = "";
        item.options.forEach((option, optionIndex) => {
            optionsHTML += `
                <label style="display:block; margin-top:0.5rem; font-weight:400; cursor:pointer;">
                    <input type="radio" name="question_${index}" value="${optionIndex}" style="width:auto; margin-right:0.5rem;">
                    ${option}
                </label>
            `;
        });

        div.innerHTML = `<h4 style="margin-bottom:0.5rem;">${index + 1}. ${item.question}</h4>${optionsHTML}`;
        container.appendChild(div);
    });
}

async function handleQuizSubmit() {
    const userName = document.getElementById("quizUserName").value.trim();

    if (!userName) {
        setResult("quizResult", "Identifier required before compiling.", "error");
        return;
    }

    let score = 0;
    quizData.forEach((item, index) => {
        const selected = document.querySelector(`input[name="question_${index}"]:checked`);
        if (selected && Number(selected.value) === item.answer) score++;
    });

    try {
        const response = await fetch("/api/quiz", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({ user_name: userName, score, total: quizData.length })
        });
        const data = await response.json();

        if (!response.ok) {
            setResult("quizResult", data.message, "error");
            return;
        }

        const percent = (score/quizData.length)*100;
        setResult("quizResult", `Evaluation complete. Score: ${score}/${quizData.length} (${percent}%).`, percent >= 50 ? "success" : "error");
        fetchDashboard();
    } catch {
        setResult("quizResult", "Telemetry sync failed.", "error");
    }
}

async function fetchResources() {
    try {
        const response = await fetch("/api/resources");
        const data = await response.json();

        const grid = document.getElementById("resourceGrid");
        grid.innerHTML = "";

        data.forEach(item => {
            const card = document.createElement("div");
            card.className = "card floating-card hover-up";
            card.innerHTML = `
                <div class="resource-meta">${item.category}</div>
                <h3 style="margin-bottom:0.5rem; font-size:1.1rem;">${item.title}</h3>
                <p class="text-sm muted">${item.description}</p>
                <a href="${item.link}" target="_blank" class="back-link text-sm">Access Documentation →</a>
            `;
            grid.appendChild(card);
        });
    } catch (e) {
        console.error("Resource fetch error", e);
    }
}

async function fetchDashboard() {
    try {
        const response = await fetch("/api/dashboard");
        const data = await response.json();

        document.getElementById("totalReports").textContent = data.summary.total_reports;
        document.getElementById("totalValidations").textContent = data.summary.total_validations;
        document.getElementById("invalidValidations").textContent = data.summary.invalid_validations;
        document.getElementById("avgQuizScore").textContent = `${data.summary.avg_quiz_score_percent}%`;

        renderIncidentChart(data.incident_breakdown);
        renderRiskChart(data.risk_breakdown);
        renderSeverityChart(data.severity_breakdown);
        
        const feed = document.getElementById("recentReports");
        feed.innerHTML = "";
        data.recent_reports.forEach(item => {
            const statusClass = item.status === 'Resolved' ? 'success-badge' : (item.status === 'Reviewing' ? 'info-badge' : 'warning-badge');
            feed.innerHTML += `
                <div class="admin-item-card mb-2 p-3">
                    <div style="display:flex; justify-content:space-between; margin-bottom:0.25rem;">
                        <strong>${item.incident_type}</strong>
                        <span class="status-badge ${statusClass}">${item.status}</span>
                    </div>
                    <div class="text-sm muted">Location: ${item.city} | Target: ${item.full_name}</div>
                </div>
            `;
        });
        
    } catch (e) {
        console.error("Dashboard sync error", e);
    }
}

function renderIncidentChart(items) {
    const ctx = document.getElementById("incidentChart").getContext("2d");
    if (incidentChartInstance) incidentChartInstance.destroy();

    const colors = getChartColors();

    incidentChartInstance = new Chart(ctx, {
        type: "bar",
        data: {
            labels: items.map(x => x.incident_type),
            datasets: [{ 
                label: "Logged Incidents", 
                data: items.map(x => x.count),
                backgroundColor: colors.primary,
                borderRadius: 4
            }]
        },
        options: { 
            maintainAspectRatio: false, 
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { color: colors.text }, grid: { color: colors.grid } },
                y: { ticks: { color: colors.text }, grid: { color: colors.grid } }
            }
        }
    });
}

function renderRiskChart(items) {
    const ctx = document.getElementById("riskChart").getContext("2d");
    if (riskChartInstance) riskChartInstance.destroy();

    const colors = getChartColors();

    riskChartInstance = new Chart(ctx, {
        type: "doughnut",
        data: {
            labels: items.map(x => x.risk_level),
            datasets: [{ 
                data: items.map(x => x.count),
                backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
                borderWidth: 0
            }]
        },
        options: { 
            maintainAspectRatio: false, cutout: '75%',
            plugins: { legend: { labels: { color: colors.text } } }
        }
    });
}

function renderSeverityChart(items) {
    const ctx = document.getElementById("severityChart").getContext("2d");
    if (severityChartInstance) severityChartInstance.destroy();

    const colors = getChartColors();

    severityChartInstance = new Chart(ctx, {
        type: "pie",
        data: {
            labels: items.map(x => x.severity),
            datasets: [{ 
                data: items.map(x => x.count),
                backgroundColor: ['#ef4444', '#f59e0b', '#3b82f6'],
                borderWidth: 0
            }]
        },
        options: { 
            maintainAspectRatio: false,
            plugins: { legend: { labels: { color: colors.text } } }
        }
    });
}

function setupChatbox() {
    const toggleBtn = document.getElementById("chatToggleBtn");
    const closeBtn = document.getElementById("chatCloseBtn");
    const panel = document.getElementById("chatPanel");
    const sendBtn = document.getElementById("chatSendBtn");
    const input = document.getElementById("chatInput");
    const messagesContainer = document.getElementById("chatMessages");
    const micBtn = document.getElementById("chatMicBtn");

    toggleBtn.addEventListener("click", () => panel.classList.remove("hidden-chat"));
    closeBtn.addEventListener("click", () => panel.classList.add("hidden-chat"));

    // Speech Recognition setup
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;

        micBtn.addEventListener("click", () => {
            try {
                recognition.start();
                micBtn.classList.add("recording");
                input.placeholder = "Listening...";
            } catch(e) {
                console.error(e);
            }
        });

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            input.value += transcript;
            input.placeholder = "Query the AI...";
            micBtn.classList.remove("recording");
        };

        recognition.onerror = () => {
            input.placeholder = "Query the AI...";
            micBtn.classList.remove("recording");
        };
        
        recognition.onend = () => {
            input.placeholder = "Query the AI...";
            micBtn.classList.remove("recording");
        }
    } else {
        micBtn.style.display = "none";
    }

    async function fetchHistory() {
        try {
            const res = await fetch("/api/chat/history");
            const data = await res.json();
            messagesContainer.innerHTML = "";
            data.forEach(msg => appendMessage(msg.sender, msg.message));
            scrollToBottom();
        } catch (e) {
            console.error(e);
        }
    }

    function appendMessage(sender, text) {
        const div = document.createElement("div");
        div.className = `chat-bubble ${sender}`;
        div.textContent = text;
        messagesContainer.appendChild(div);
    }

    function scrollToBottom() {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    async function sendMessage() {
        const text = input.value.trim();
        if (!text) return;

        appendMessage("user", text);
        input.value = "";
        scrollToBottom();

        try {
            const res = await fetch("/api/chat/send", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: text })
            });
            const data = await res.json();
            if (data.success) {
                appendMessage("bot", data.reply);
            } else {
                appendMessage("bot", "System Error: " + data.message);
            }
            scrollToBottom();
        } catch (e) {
            appendMessage("bot", "Transmission failed.");
            scrollToBottom();
        }
    }

    sendBtn.addEventListener("click", sendMessage);
    input.addEventListener("keypress", (e) => {
        if (e.key === "Enter") sendMessage();
    });

    fetchHistory();
}
