from fastapi import FastAPI, HTTPException, Depends
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel
import os
from dotenv import load_dotenv
from openai import OpenAI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from app.api.profile import router as profile_router
from app.api.billing import router as billing_router
from sqlalchemy.orm import Session

from app.database import engine, Base, get_db
from app.models.profile import Profile
from app.models.payment import Payment

from app.dependencies import get_verified_email

Base.metadata.create_all(bind=engine)

from app.services.credits import (
    has_credits, 
    deduct_credit, 
    add_credits, 
    get_credits, 
    deduct_credit_atomic, 
    refund_credit,
    GENERATE_COST,
    CHAR_LIMIT_RESUME_EXPERIENCE,
    CHAR_LIMIT_JOB_DESCRIPTION
)
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

ENV = os.getenv("ENV", "dev")

app = FastAPI(
    docs_url=None if ENV == "prod" else "/docs",
    redoc_url=None if ENV == "prod" else "/redoc"
)

class ResumeInput(BaseModel):
    style: str
    resume_text: str
    job_description: str

    # User profile data
    full_name: str
    email: str | None = ""
    phone: str | None = ""
    location: str | None = ""
    linkedin: str | None = ""
    portfolio: str | None = ""
    
@app.post("/api/generate-resume")
def generate_resume(data: ResumeInput, email: str = Depends(get_verified_email), db: Session = Depends(get_db)):
    """
    Generate an optimized resume. Email is extracted from verified Google token.
    🔒 SECURITY: Email comes from verified JWT token, never from request body.
    """
    
    db = next(get_db())
    
    # ✅ VALIDATION 1: Character Limits
    if len(data.resume_text) > CHAR_LIMIT_RESUME_EXPERIENCE:
        raise HTTPException(
            status_code=400, 
            detail=f"Your Experience exceeds {CHAR_LIMIT_RESUME_EXPERIENCE} characters. Please trim it down."
        )
    
    if len(data.job_description) > CHAR_LIMIT_JOB_DESCRIPTION:
        raise HTTPException(
            status_code=400,
            detail=f"Job Description exceeds {CHAR_LIMIT_JOB_DESCRIPTION} characters. Please trim it down."
        )
    
    # ✅ VALIDATION 2: Check credits exist
    if not has_credits(db, email, GENERATE_COST):
        raise HTTPException(
            status_code=402, 
            detail=f"Insufficient credits. You need {GENERATE_COST} credits to generate a resume."
        )
    
    # ✅ ATOMIC OPERATION 1: Deduct credits FIRST
    try:
        remaining_credits = deduct_credit_atomic(db, email, GENERATE_COST)
    except HTTPException as e:
        raise e
    
    # --- 🧠 SUPERIOR PROMPT ENGINEERING ---
    system_prompt = """
    You are a Senior CSS Architect and Elite Career Strategist.
    Your task is to take raw resume data and a job description, and transform it into a visually stunning, ATS-optimized HTML resume.

    🚨 CORE DIRECTIVE: VISUAL STYLE IS PARAMOUNT.
    You must strictly adhere to the requested "Visual Style" defined below. The CSS you generate must be distinct, professional, and pixel-perfect.

    ---
    🎨 STYLE DEFINITIONS (STRICTLY FOLLOW THE CSS RULES FOR THE SELECTED STYLE):

    1. "Harvard" (The Classic / Academic)
       - Use the Famous Harvard CSS Style as reference

    2. "Tech" (The Modern / Startup)
       - LAYOUT: Clean single column or subtle grid.
       - TYPOGRAPHY: Modern Sans-Serif (Inter, Roboto, Helvetica, System UI).
       - DESIGN ELEMENTS: Use "Pills" or "Tags" for Skills (e.g., background: #e0e7ff; color: #3730a3; padding: 4px 8px; border-radius: 4px;).
       - COLORS: Dark grey text (#1f2937) with subtle Blue/Indigo accents (#4f46e5) for headers or links.
       - VIBE: Silicon Valley, Software Engineer, Product Manager.

    3. "Creative" (The Designer / Two-Column)
       - LAYOUT: STRICT Two-Column Layout (CSS Grid or Flexbox).
         - Left/Right Sidebar (30% width) for Skills, Contact, Education.
         - Main Content (70% width) for Experience and Summary.
       - COLORS: Use a soft background color for the sidebar (e.g., #f3f4f6 or #1e293b with white text).
       - TYPOGRAPHY: Bold, distinct headers. Sans-serif.
       - VIBE: UI/UX Designer, Marketing, Creative Director.

    ---
    ✍️ CONTENT OPTIMIZATION RULES:
    1. **ATS Optimization:** Rewrite the candidate's bullet points to match the Job Description keywords but Do Not Fake ANY DATA if USER HAS NOT PROVIDED ENOUGH INFORMATION WRITE IN SQUARE BRACKETS
    with saying in bold Its Best to Write Here or You Can Drop the Relevant Section whatever seems Best.
    2. **Impact First:** Use the "Action Verb + Task + Result" formula. (e.g., "Reduced latency by 40%..." instead of "Worked on optimization") Do Not Try to Fake the DATA Too much and be realistic according to candidate.
    3. **No Fluff:** Remove generic phrases like "Hard worker". Replace with hard skills.
    4. **Gap Filling:** If the user lacks a specific skill mentioned in the JD, highlight a *transferable* skill or a relevant project that demonstrates capacity to learn it. DO NOT LIE.

    ---
    💻 TECHNICAL OUTPUT RULES:
    1. **Output ONLY HTML.** No markdown blocks, no ```html``` wrapper, no explanations.
    2. **Embedded CSS:** All CSS must be inside <style> tags within the HTML.
    3. **NO SCRIPTS:** Do not include any <script> tags or JavaScript.
    4. **Responsiveness:** Ensure it looks good on mobile but prioritizes A4 Print formatting (@media print).
    5. **Structure:** Use semantic tags (<header>, <section>, <ul>, <li>).
    6. **Do Not add Page Borders or shadows in the css design**

    Format your response EXACTLY like this:
    ===RESUME_HTML===
    [Your HTML code here]
    ===ATS_SCORE===
    [Number 0-100]
    """

    # Build candidate profile string
    profile_lines = []
    if data.full_name: profile_lines.append(f"Name: {data.full_name}")
    if data.email: profile_lines.append(f"Email: {data.email}")
    if data.phone: profile_lines.append(f"Phone: {data.phone}")
    if data.location: profile_lines.append(f"Location: {data.location}")
    if data.linkedin: profile_lines.append(f"LinkedIn: {data.linkedin}")
    if data.portfolio: profile_lines.append(f"Portfolio: {data.portfolio}")
    profile_info = "\n".join(profile_lines)

    user_prompt = f"""
    GENERATE THIS RESUME:
    
    🔹 SELECTED STYLE: {data.style} (Apply the {data.style} CSS rules strictly!)
    
    🔹 CANDIDATE INFO:
    {profile_info}
    
    🔹 RAW EXPERIENCE (REWRITE THIS):
    {data.resume_text}
    
    🔹 TARGET JOB DESCRIPTION (OPTIMIZE FOR THIS):
    {data.job_description}
    """

    try:
        response = client.chat.completions.create(
            model="gpt-4o",  # Using the smartest model for design + logic
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.7, # Slightly creative to allow for better phrasing
        )

        content = response.choices[0].message.content

        # Clean logic
        content = content.replace('```html', '').replace('```', '').strip()
        
        if "===RESUME_HTML===" in content:
            parts = content.split("===ATS_SCORE===")
            resume_html = parts[0].replace("===RESUME_HTML===", "").strip()
            ats_score = parts[1].strip() if len(parts) > 1 else "85"
        else:
            # Fallback if AI forgets format
            resume_html = content
            ats_score = "80"
          
        if not resume_html:
            raise ValueError("Empty HTML from AI")
          
    except Exception as e:
        refund_credit(db, email, GENERATE_COST)
        print(f"Generation Error: {e}")
        raise HTTPException(status_code=500, detail="AI generation failed. Credits refunded.")

    return {
        "resume_html": resume_html,
        "ats_score": ats_score,
        "credits_left": remaining_credits
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
    return FileResponse("app/static/pages/index.html")

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

@app.get("/robots.txt")
def robots():
    return FileResponse("app/static/robots.txt")

@app.get("/privacy-policy")
def privacy_policy():
    return FileResponse("app/static/pages/extra/privacy.html")

app.mount("/static", StaticFiles(directory="app/static"), name="static")

app.include_router(profile_router, prefix="/api")
app.include_router(billing_router)

from app.api.refine import router as refine_router
app.include_router(refine_router)

from app.api.cover_letter import router as cover_letter_router
app.include_router(cover_letter_router)

# Custom 404 Error Handler
@app.exception_handler(StarletteHTTPException)
async def custom_http_exception_handler(request, exc):
    if exc.status_code == 404:
        return FileResponse("app/static/pages/extra/404.html", status_code=404)
    raise exc
