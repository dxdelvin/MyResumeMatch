# Resume Builder AI

A web-based AI-powered resume builder that generates ATS-optimized resumes
based on user input, job descriptions, and selected resume styles
(Harvard, Normal, Minimal, Custom).
<img width="1733" height="899" alt="image" src="https://github.com/user-attachments/assets/152d801e-57b4-4aa4-bb56-174de0a2d182" />
<img width="1919" height="983" alt="image" src="https://github.com/user-attachments/assets/21f54159-7b35-4858-8cdd-41f5875de541" />
<img width="1017" height="963" alt="image" src="https://github.com/user-attachments/assets/06bbc1fd-8c4c-48a0-9cd7-ad87fdba6f47" />
<img width="1783" height="961" alt="image" src="https://github.com/user-attachments/assets/c01a4e90-ca72-4b8f-a822-b7ed2d3b6fa7" />

---

## 🚀 Tech Stack

### Frontend
- HTML
- CSS
- Vanilla JavaScript

### Backend
- Python
- FastAPI

### Database
- Supabase (PostgreSQL)

### Authentication
- Google Sign-In (Client-side)

### AI
- OpenAI API

---

## 🧠 Core Features

- Google Login
- User Profile Management
- AI Resume Generation (HTML + CSS)
- Multiple Resume Styles
- Inline Resume Editing
- Print / Save as PDF
- Credit-based usage (planned)

---
## ⚙️ Environment Variables

Create a `.env` file in the project root:

```env
OPENAI_API_KEY=your_openai_key
DATABASE_URL=your_supabase_postgres_url
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
```

▶️ Run Locally
1️⃣ Create virtual environment
```
python -m venv venv
```
2️⃣ Activate it
# Windows
```
venv\Scripts\activate
```
# macOS/Linux
```
source venv/bin/activate
```
3️⃣ Install dependencies
```
pip install -r requirements.txt
```
4️⃣ Run server
uvicorn app.main:app --reload


Open:

http://localhost:8000


