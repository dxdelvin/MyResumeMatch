from fastapi import FastAPI
from pydantic import BaseModel
import os
from dotenv import load_dotenv
from openai import OpenAI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from app.api.profile import router as profile_router

from app.database import engine, Base
from app.models.profile import Profile

Base.metadata.create_all(bind=engine)

from app.services.credits import has_credits, deduct_credit, add_credits, get_credits
from app.database import get_db

load_dotenv()
client = OpenAI(api_key=os.getenv("OPEN_API_KEY"))

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)



class ResumeInput(BaseModel):
    style: str
    resume_text: str
    job_description: str

    # User profile data
    full_name: str
    email: str
    phone: str | None = ""
    location: str | None = ""
    linkedin: str | None = ""
    portfolio: str | None = ""
    
@app.post("/api/generate-resume")
def generate_resume(data: ResumeInput):
    
    db = next(get_db())

    if not has_credits(db, data.email):
        return {
            "error": "NO_CREDITS",
            "message": "You have no credits left. Please purchase more."
        }
    
    system_prompt = """
You are a professional resume writer and web developer. Create ATS-friendly resumes in HTML with inline CSS.

Key guidelines:
- Use only the provided candidate data
- Make it professional and industry-standard
- Optimize for ATS systems with proper headings and keywords
- Include contact info, summary, experience, education, skills sections
- Style according to the requested resume style (Harvard, Normal, Minimal, Modern)
- Provide an ATS compatibility score (0-100) based on keyword matching and format
- Give 3-5 improvement suggestions

Output format:
===RESUME_HTML===
[HTML document with embedded CSS]

===ATS_SCORE===
[number]

===IMPROVEMENT_SUGGESTIONS===
- suggestion 1
- suggestion 2
- etc.
"""

    # Build candidate profile string, omitting empty fields
    profile_lines = []
    if data.full_name:
        profile_lines.append(f"Full Name: {data.full_name}")
    if data.email:
        profile_lines.append(f"Email: {data.email}")
    if data.phone:
        profile_lines.append(f"Phone: {data.phone}")
    if data.location:
        profile_lines.append(f"Location: {data.location}")
    if data.linkedin:
        profile_lines.append(f"LinkedIn: {data.linkedin}")
    if data.portfolio:
        profile_lines.append(f"Portfolio: {data.portfolio}")
    profile_info = "\n".join(profile_lines)

    user_prompt = f"""
Hey, act as a professional resume expert and help me create an ATS-friendly resume in HTML with inline CSS.

Use this style: {data.style}

Candidate details:
{profile_info}

My current resume content:
{data.resume_text}

Target job description:
{data.job_description}

Please create a professional resume that matches this job and scores well on ATS systems.
"""

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        max_tokens=3500
    )

    content = response.choices[0].message.content

    try:
        resume_html = content.split("===RESUME_HTML===")[1].split("===ATS_SCORE===")[0].strip()
        ats_score = content.split("===ATS_SCORE===")[1].split("===IMPROVEMENT_SUGGESTIONS===")[0].strip()
        improvement_suggestions = content.split("===IMPROVEMENT_SUGGESTIONS===")[1].strip()
          
        deduct_credit(db, data.email)
        
    except Exception:
        return {
            "error": "Failed to parse AI response",
            "raw_response": content
        }

    # Debug: Print generated content
    print("DEBUG: Generated resume_html (first 500 chars):")
    print(resume_html[:500])
    print("DEBUG: ATS Score:", ats_score)
    print("DEBUG: Improvement Suggestions:", improvement_suggestions)

    return {
        "resume_html": resume_html,
        "ats_score": ats_score,
        "improvement_suggestions": improvement_suggestions
    }
    
@app.get("/dx")
def home():
    return {"message": "Hello Resume AI"}

@app.get("/health")
def health_check():
    return {"status": "ok"}

# Page Routes

@app.get("/")
def login_page():
    return FileResponse("app/static/pages/login.html")

@app.get("/profile")
def profile_page():
    return FileResponse("app/static/pages/profile.html")

@app.get("/builder")
def builder_page():
    return FileResponse("app/static/pages/builder.html")

@app.get("/pricing")
def pricing_page():
    return FileResponse("app/static/pages/pricing.html")

@app.get("/result/{resume_id}")
def result_page(resume_id: int):
    return FileResponse("app/static/pages/result.html")

app.mount("/static", StaticFiles(directory="app/static"), name="static")

app.include_router(profile_router, prefix="/api")