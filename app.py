import os
import sqlite3
from datetime import datetime
from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from google import genai
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
app.secret_key = "aadhaar_guardian_llm_secret_key"

DB_NAME = "aadhaar_guardian_llm.db"


def get_connection():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            full_name TEXT NOT NULL,
            contact TEXT NOT NULL,
            incident_type TEXT NOT NULL,
            city TEXT NOT NULL,
            description TEXT NOT NULL,
            severity TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'Pending',
            created_at TEXT NOT NULL
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS quiz_scores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_name TEXT NOT NULL,
            score INTEGER NOT NULL,
            total INTEGER NOT NULL,
            created_at TEXT NOT NULL
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS validations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            aadhaar_number TEXT NOT NULL,
            is_valid INTEGER NOT NULL,
            risk_level TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS resources (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            category TEXT NOT NULL,
            description TEXT NOT NULL,
            link TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS admins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS chat_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender TEXT NOT NULL,
            message TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    """)

    admin_exists = cur.execute("SELECT id FROM admins WHERE username = ?", ("admin",)).fetchone()
    if not admin_exists:
        cur.execute("INSERT INTO admins (username, password) VALUES (?, ?)", ("admin", "admin123"))

    resource_count = cur.execute("SELECT COUNT(*) AS count FROM resources").fetchone()["count"]
    if resource_count == 0:
        sample_resources = [
            (
                "Ministry of Electronics and IT (MeitY)",
                "Government Policy",
                "Official portal of the Ministry of Electronics and Information Technology for digital guidelines.",
                "https://www.meity.gov.in"
            ),
            (
                "Sanchar Saathi (Chakshu)",
                "Fraud Awareness",
                "Report suspected fraud communications, calls, and SMS to the Department of Telecommunications.",
                "https://sancharsaathi.gov.in/"
            ),
            (
                "MyAadhaar Official Portal",
                "Identity Management",
                "Securely manage your Aadhaar, check authentication history, and manage bank seeding status.",
                "https://myaadhaar.uidai.gov.in/"
            ),
            (
                "National Cyber Crime Reporting",
                "Fraud Awareness",
                "Official portal to report financial fraud, identity theft, and OTP scams immediately.",
                "https://cybercrime.gov.in/"
            )
        ]
        for title, category, description, link in sample_resources:
            cur.execute("""
                INSERT INTO resources (title, category, description, link, created_at)
                VALUES (?, ?, ?, ?, ?)
            """, (title, category, description, link, datetime.now().isoformat()))

    chat_count = cur.execute("SELECT COUNT(*) AS count FROM chat_messages").fetchone()["count"]
    if chat_count == 0:
        cur.execute("""
            INSERT INTO chat_messages (sender, message, created_at)
            VALUES (?, ?, ?)
        """, (
            "bot",
            "Hello! I'm the Guardian AI. How can I help you understand Aadhaar safety, DBT linking, or assist in reporting an incident today?",
            datetime.now().isoformat()
        ))

    conn.commit()
    conn.close()


d_table = [
    [0,1,2,3,4,5,6,7,8,9],
    [1,2,3,4,0,6,7,8,9,5],
    [2,3,4,0,1,7,8,9,5,6],
    [3,4,0,1,2,8,9,5,6,7],
    [4,0,1,2,3,9,5,6,7,8],
    [5,9,8,7,6,0,4,3,2,1],
    [6,5,9,8,7,1,0,4,3,2],
    [7,6,5,9,8,2,1,0,4,3],
    [8,7,6,5,9,3,2,1,0,4],
    [9,8,7,6,5,4,3,2,1,0]
]

p_table = [
    [0,1,2,3,4,5,6,7,8,9],
    [1,5,7,6,2,8,3,0,9,4],
    [5,8,0,3,7,9,6,1,4,2],
    [8,9,1,6,0,4,3,5,2,7],
    [9,4,5,3,1,2,6,8,7,0],
    [4,2,8,6,5,7,3,9,0,1],
    [2,7,9,3,8,0,6,4,1,5],
    [7,0,4,6,9,1,3,2,5,8]
]


def verhoeff_validate(number: str) -> bool:
    c = 0
    reversed_digits = list(map(int, reversed(number)))
    for i, digit in enumerate(reversed_digits):
        c = d_table[c][p_table[i % 8][digit]]
    return c == 0


def calculate_risk(aadhaar_number: str, is_valid: bool):
    if not is_valid:
        return "High"

    score = 0

    if len(set(aadhaar_number)) <= 3:
        score += 2

    if aadhaar_number == aadhaar_number[0] * 12:
        score += 3

    if aadhaar_number.startswith("0000") or aadhaar_number.endswith("0000"):
        score += 2

    patterns = ["1234", "2345", "3456", "4567", "5678", "6789", "9876", "8765"]
    if any(pattern in aadhaar_number for pattern in patterns):
        score += 1

    return "Medium" if score >= 3 else "Low"


def classify_severity(description: str):
    text = description.lower()

    high_terms = ["money deducted", "identity theft", "document misuse", "upi fraud", "account blocked"]
    medium_terms = ["otp", "urgent", "bank", "kyc", "call", "link", "phishing"]

    if any(term in text for term in high_terms):
        return "High"
    if any(term in text for term in medium_terms):
        return "Medium"
    return "Low"


def get_llm_reply(user_message: str):
    api_key = os.getenv("GEMINI_API_KEY", "").strip()

    if not api_key:
        return (
            "Gemini API chat is not configured yet. Set the GEMINI_API_KEY environment variable "
            "and restart the app to enable the real assistant."
        )

    system_prompt = """
You are the Aadhaar Guardian assistant for an educational civic-tech web application.
Answer clearly and briefly.
Focus on:
- Aadhaar safety awareness
- OTP scam prevention
- phishing and fake KYC links
- difference between Aadhaar seeding and DBT bank linking
- safe document sharing
- how to report suspicious activity using this platform

Do not claim government authority.
Do not provide legal guarantees.
If asked something unrelated, gently redirect toward identity safety help.
""".strip()

    conn = get_connection()
    rows = conn.execute("""
        SELECT sender, message
        FROM chat_messages
        ORDER BY id DESC
        LIMIT 10
    """).fetchall()
    conn.close()

    rows = list(reversed(rows))

    context = f"System Instructions:\n{system_prompt}\n\nConversation History:\n"
    for row in rows:
        role = "Assistant" if row["sender"] == "bot" else "User"
        context += f"{role}: {row['message']}\n"

    context += f"\nUser: {user_message}\nAssistant:"

    try:
        client = genai.Client(api_key=api_key)

        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=context
        )

        answer = response.text.strip() if response.text else ""

        if not answer:
            answer = "I could not generate a reply right now. Please try again."

        return answer

    except Exception as e:
        return f"Chat service error: {str(e)}"


@app.route("/")
def home():
    return render_template("index.html")


@app.route("/admin")
def admin_page():
    if "admin_user" not in session:
        return redirect(url_for("admin_login_page"))
    return render_template("admin.html")


@app.route("/admin-login")
def admin_login_page():
    return render_template("admin_login.html")


@app.route("/api/admin/login", methods=["POST"])
def admin_login():
    data = request.get_json()
    username = data.get("username", "").strip()
    password = data.get("password", "").strip()

    conn = get_connection()
    admin = conn.execute(
        "SELECT * FROM admins WHERE username = ? AND password = ?",
        (username, password)
    ).fetchone()
    conn.close()

    if not admin:
        return jsonify({"success": False, "message": "Invalid admin credentials."}), 401

    session["admin_user"] = username
    return jsonify({"success": True, "message": "Login successful."})


@app.route("/api/admin/logout", methods=["POST"])
def admin_logout():
    session.pop("admin_user", None)
    return jsonify({"success": True})


@app.route("/api/validate", methods=["POST"])
def validate_aadhaar():
    data = request.get_json()
    aadhaar_number = data.get("aadhaar", "").strip().replace(" ", "")

    if not aadhaar_number.isdigit() or len(aadhaar_number) != 12:
        return jsonify({"success": False, "message": "Aadhaar number must contain exactly 12 digits."}), 400

    is_valid = verhoeff_validate(aadhaar_number)
    risk_level = calculate_risk(aadhaar_number, is_valid)

    conn = get_connection()
    conn.execute("""
        INSERT INTO validations (aadhaar_number, is_valid, risk_level, created_at)
        VALUES (?, ?, ?, ?)
    """, (aadhaar_number, 1 if is_valid else 0, risk_level, datetime.now().isoformat()))
    conn.commit()
    conn.close()

    return jsonify({"success": True, "is_valid": is_valid, "risk_level": risk_level})


@app.route("/api/report", methods=["POST"])
def submit_report():
    data = request.get_json()

    full_name = data.get("full_name", "").strip()
    contact = data.get("contact", "").strip()
    incident_type = data.get("incident_type", "").strip()
    city = data.get("city", "").strip()
    description = data.get("description", "").strip()

    if not all([full_name, contact, incident_type, city, description]):
        return jsonify({"success": False, "message": "All fields are required."}), 400

    severity = classify_severity(description)

    conn = get_connection()
    conn.execute("""
        INSERT INTO reports (full_name, contact, incident_type, city, description, severity, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'Pending', ?)
    """, (full_name, contact, incident_type, city, description, severity, datetime.now().isoformat()))
    conn.commit()
    conn.close()

    return jsonify({"success": True, "message": "Report submitted successfully.", "severity": severity})


@app.route("/api/quiz", methods=["POST"])
def submit_quiz():
    data = request.get_json()

    user_name = data.get("user_name", "").strip()
    score = data.get("score")
    total = data.get("total")

    if not user_name or score is None or total is None:
        return jsonify({"success": False, "message": "Invalid quiz submission."}), 400

    conn = get_connection()
    conn.execute("""
        INSERT INTO quiz_scores (user_name, score, total, created_at)
        VALUES (?, ?, ?, ?)
    """, (user_name, score, total, datetime.now().isoformat()))
    conn.commit()
    conn.close()

    return jsonify({"success": True, "message": "Quiz saved."})


@app.route("/api/resources", methods=["GET"])
def get_resources():
    conn = get_connection()
    rows = conn.execute("""
        SELECT id, title, category, description, link, created_at
        FROM resources
        ORDER BY id DESC
    """).fetchall()
    conn.close()
    return jsonify([dict(row) for row in rows])


@app.route("/api/admin/resources", methods=["POST"])
def add_resource():
    if "admin_user" not in session:
        return jsonify({"success": False, "message": "Unauthorized"}), 401

    data = request.get_json()
    title = data.get("title", "").strip()
    category = data.get("category", "").strip()
    description = data.get("description", "").strip()
    link = data.get("link", "").strip()

    if not all([title, category, description, link]):
        return jsonify({"success": False, "message": "All fields are required."}), 400

    conn = get_connection()
    conn.execute("""
        INSERT INTO resources (title, category, description, link, created_at)
        VALUES (?, ?, ?, ?, ?)
    """, (title, category, description, link, datetime.now().isoformat()))
    conn.commit()
    conn.close()

    return jsonify({"success": True, "message": "Resource added successfully."})


@app.route("/api/admin/reports", methods=["GET"])
def admin_reports():
    if "admin_user" not in session:
        return jsonify({"success": False, "message": "Unauthorized"}), 401

    conn = get_connection()
    rows = conn.execute("""
        SELECT id, full_name, contact, incident_type, city, description, severity, status, created_at
        FROM reports
        ORDER BY id DESC
    """).fetchall()
    conn.close()

    return jsonify([dict(row) for row in rows])


@app.route("/api/admin/report-status/<int:report_id>", methods=["POST"])
def update_report_status(report_id):
    if "admin_user" not in session:
        return jsonify({"success": False, "message": "Unauthorized"}), 401

    data = request.get_json()
    status = data.get("status", "").strip()

    if status not in ["Pending", "Reviewing", "Resolved"]:
        return jsonify({"success": False, "message": "Invalid status"}), 400

    conn = get_connection()
    conn.execute("UPDATE reports SET status = ? WHERE id = ?", (status, report_id))
    conn.commit()
    conn.close()

    return jsonify({"success": True, "message": "Status updated."})


@app.route("/api/chat/history", methods=["GET"])
def chat_history():
    conn = get_connection()
    rows = conn.execute("""
        SELECT sender, message, created_at
        FROM chat_messages
        ORDER BY id ASC
        LIMIT 100
    """).fetchall()
    conn.close()
    return jsonify([dict(row) for row in rows])


@app.route("/api/chat/send", methods=["POST"])
def chat_send():
    data = request.get_json()
    user_message = data.get("message", "").strip()

    if not user_message:
        return jsonify({"success": False, "message": "Message cannot be empty."}), 400

    bot_message = get_llm_reply(user_message)

    conn = get_connection()
    conn.execute("""
        INSERT INTO chat_messages (sender, message, created_at)
        VALUES (?, ?, ?)
    """, ("user", user_message, datetime.now().isoformat()))
    conn.execute("""
        INSERT INTO chat_messages (sender, message, created_at)
        VALUES (?, ?, ?)
    """, ("bot", bot_message, datetime.now().isoformat()))
    conn.commit()
    conn.close()

    return jsonify({"success": True, "reply": bot_message})


@app.route("/api/dashboard", methods=["GET"])
def dashboard():
    conn = get_connection()

    total_reports = conn.execute("SELECT COUNT(*) AS count FROM reports").fetchone()["count"]
    total_validations = conn.execute("SELECT COUNT(*) AS count FROM validations").fetchone()["count"]
    invalid_validations = conn.execute("SELECT COUNT(*) AS count FROM validations WHERE is_valid = 0").fetchone()["count"]
    total_quizzes = conn.execute("SELECT COUNT(*) AS count FROM quiz_scores").fetchone()["count"]
    total_resources = conn.execute("SELECT COUNT(*) AS count FROM resources").fetchone()["count"]

    avg_score_row = conn.execute("SELECT AVG((score * 100.0) / total) AS avg_percent FROM quiz_scores").fetchone()
    avg_score = round(avg_score_row["avg_percent"], 2) if avg_score_row["avg_percent"] is not None else 0

    incident_rows = conn.execute("""
        SELECT incident_type, COUNT(*) AS count
        FROM reports
        GROUP BY incident_type
        ORDER BY count DESC
    """).fetchall()

    severity_rows = conn.execute("""
        SELECT severity, COUNT(*) AS count
        FROM reports
        GROUP BY severity
        ORDER BY count DESC
    """).fetchall()

    risk_rows = conn.execute("""
        SELECT risk_level, COUNT(*) AS count
        FROM validations
        GROUP BY risk_level
        ORDER BY count DESC
    """).fetchall()

    recent_reports = conn.execute("""
        SELECT full_name, incident_type, city, severity, status, created_at
        FROM reports
        ORDER BY id DESC
        LIMIT 6
    """).fetchall()

    conn.close()

    return jsonify({
        "summary": {
            "total_reports": total_reports,
            "total_validations": total_validations,
            "invalid_validations": invalid_validations,
            "total_quizzes": total_quizzes,
            "avg_quiz_score_percent": avg_score,
            "total_resources": total_resources
        },
        "incident_breakdown": [dict(row) for row in incident_rows],
        "severity_breakdown": [dict(row) for row in severity_rows],
        "risk_breakdown": [dict(row) for row in risk_rows],
        "recent_reports": [dict(row) for row in recent_reports]
    })


init_db()

if __name__ == "__main__":
    app.run(debug=True)
