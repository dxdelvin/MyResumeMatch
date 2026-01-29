# Resume Builder AI

Build clean, ATS-friendly resumes and also cover letters from a simple web UI. Choose a layout
(Harvard, Normal, Minimal, or Custom), add your details, and export to PDF.

<img width="1545" height="938" alt="Resume builder preview 1" src="https://github.com/user-attachments/assets/4148d8e6-385b-4195-a908-df6668c7cbff" />
<img width="1705" height="965" alt="Resume builder preview 2" src="https://github.com/user-attachments/assets/3a40a347-bb0f-4dc1-ac12-d5ce6d92fda7" />
<img width="1017" height="963" alt="Resume builder preview 3" src="https://github.com/user-attachments/assets/06bbc1fd-8c4c-48a0-9cd7-ad87fdba6f47" />

---

## Highlights

- Google login
- Profile management
- Resume generation (HTML + CSS)
- Multiple resume styles
- Inline editing
- Print / save as PDF
- Credit-based usage (planned)

---

## Tech Stack

- Frontend: HTML, CSS, Vanilla JavaScript
- Backend: Python, FastAPI
- Database: Supabase (PostgreSQL)
- Auth: Google Sign-In (client-side)
- AI: OpenAI API

---

## Getting Started

### 1) Set environment variables

Create a `.env` file in the project root:

```env
OPENAI_API_KEY=your_openai_key
DATABASE_URL=your_supabase_postgres_url
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
```

### 2) Install and run

Create a virtual environment:

```
python -m venv venv
```

Activate it:

**Windows**
```
venv\Scripts\activate
```

**macOS / Linux**
```
source venv/bin/activate
```

Install dependencies:

```
pip install -r requirements.txt
```

Run the server:

```
uvicorn app.main:app --reload
```

Open: http://localhost:8000

---

## Project Structure

- app/ — FastAPI app, routes, services, and models
- static/ — HTML, CSS, JS, and assets

---


