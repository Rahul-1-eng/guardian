# Aadhaar Guardian LLM

A full-stack identity awareness and fraud reporting platform with a real Gemini-powered chat assistant.

## Features

- Aadhaar validator using Verhoeff checksum
- Pattern-based risk scoring
- Structured fraud reporting
- Admin dashboard for report status updates
- Backend-driven resources section
- Explainer video section
- Awareness quiz with score storage
- Analytics dashboard with charts
- Real LLM support chatbox with Mic input
- Multi-lingual Support via Google Translate
- Light/Dark Mode toggle
- Separate citizen and admin workflows

## Default Admin Credentials

- Username: admin
- Password: admin123

## Setup

Create a virtual environment and install dependencies:

```bash
python -m venv venv
source venv/bin/activate  # On Windows use: venv\Scripts\activate
pip install -r requirements.txt
```

Set up the environment and run:

```bash
cp .env.example .env
# Edit .env and add your GEMINI_API_KEY
python app.py
```
