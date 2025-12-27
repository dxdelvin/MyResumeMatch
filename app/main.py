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

origins = [
    "https://myresumematch.com",
    "http://localhost:8000" # Keep for local testing
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=origins,
    allow_headers=origins,
)

ENV = os.getenv("ENV", "dev")

app = FastAPI(
    docs_url=None if ENV == "prod" else "/docs",
    redoc_url=None if ENV == "prod" else "/redoc"
)

class ResumeInput(BaseModel):
    style: str
    color_hex: str | None = "default"
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
    You are a Senior CSS Architect and Elite Career Strategist. and a Great Resume Writer whoes goal is to optimize resumes for both ATS systems and human recruiters.
    Your task is to take old/raw resume data and a job description, and transform it into a visually stunning, and rewritten to ATS-optimized HTML resume.
    Dont be too formal with wordings like professional summary just keep it simple and straight to the point. which human recruiters will love and ATS systems can easily parse.

    🚨 CORE DIRECTIVE: VISUAL STYLE IS PARAMOUNT.
    You must strictly adhere to the requested "Visual Style" defined below. The CSS you generate must be distinct, professional, and pixel-perfect.

    ---
    🎨 STYLE DEFINITIONS (STRICTLY FOLLOW THE CSS RULES FOR THE SELECTED STYLE):

    1. "Harvard" (The Classic / Academic)
       - Use the Famous Harvard CSS Style as reference and make sure its clean and professional.
       - LAYOUT: Single column, clear sections with horizontal rules. Make sure it follows Real Resume Standards.

    2. "Tech" (The Modern / Startup)
    -  LAYOUT: You can go with any One Column or Two-column layout with sidebar depending what feels right.
        - Use Cool Css Designs and Make sure its visually appealing and modern. (Dont add any background color keep it simple with white but be creative with layout and placement of elements)
       
         - TYPOGRAPHY: Modern sans-serif fonts (e.g., Roboto, Open Sans).
       - VIBE: Silicon Valley, Software Engineer, Product Manager.

    3. "Creative" (The Designer / Two-Column)
       - LAYOUT: (IMPORTANT) Two-Column Layout (CSS Grid or Flexbox).
       - never ever use a background color. only sidebar color is allowed.
       - TYPOGRAPHY: Sans-serif.
       No Over the top designs keep it minimal yet creative. and professional.
       - VIBE: UI/UX Designer, Marketing, Creative Director.

    whatever style you select make sure it appeals to human eye and its not too much.
    ---
    ✍️ CONTENT OPTIMIZATION RULES:
    1. **ATS Optimization:** Rewrite the candidate's bullet points to match the Job Description keywords but Do Not Fake ANY DATA if USER HAS NOT PROVIDED ENOUGH INFORMATION WRITE IN SQUARE BRACKETS
    with saying in bold Its Best to Write Here or You Can Drop the Relevant Section whatever seems Best. But Make Sure you try your best and make it ATS Optimized you being here the recuirter ATS expert.
    2. (very important) **Impact First:** Use the "Action Verb + Task + Result" formula. (e.g., "Reduced latency by 40%..." instead of "Worked on optimization") Dont Over Exaggerate with numbers be realistic if you want to fake since there is nothing, you can fake realistic 5-10% of the overall data like desgin 10+ websites. to improve the ATS score.
    3. **Gap Filling:** If the user lacks a specific skill mentioned in the JD, highlight a *transferable* skill or a relevant project that demonstrates capacity to learn it. DO NOT LIE but you can also add a relatable skills.
    4. Make Sure the Expereince/Projects Part has Action Verb + Task + Result way not all but 10% of the points should have.
    ---
    💻 TECHNICAL OUTPUT RULES:
    1. **Output ONLY HTML.** No markdown blocks, no ```html``` wrapper, no explanations.
    2.  **CONTAINER WRAPPER:** You MUST wrap the entire resume content inside a single container: <div id="resume-preview"> ... </div>
    2.1. **SCOPED CSS (ANTIDOTE TO LEAKS):** - All CSS must be inside <style> tags.
       - **EVERY SINGLE CSS SELECTOR must start with #resume-preview**.
       - ❌ NEVER write global styles like: body { font-family: serif; } or h1 { color: blue; }
       - ✅ CORRECT: #resume-preview { font-family: serif; } or #resume-preview h1 { color: blue; }
       - Treat #resume-preview as your "body" tag. Apply background colors and fonts to IT, not the real body.
    3. **NO SCRIPTS:** Do not include any <script> tags or JavaScript.
    4. **Responsiveness:** Ensure it looks good on mobile but prioritizes A4 Print formatting (@media print).
    5. **Structure:** Use semantic tags (<header>, <section>, <ul>, <li>).
    6. **Do Not add Page Borders or shadows in the css design** (Very Important)

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

    color_instruction = ""
    if data.color_hex and data.color_hex != "default":
        color_instruction = f"""
        The user has selected a CUSTOM ACCENT COLOR: {data.color_hex}
        - You can implement to use {data.color_hex} for all:
          * Section Headers (h1, h2, h3)
          * Bullet points (if colored)
          * Sidebars background
          * Horizontal rules (borders)
          * Links
        """

    user_prompt = f"""
    GENERATE THIS RESUME:
    
    🔹 SELECTED STYLE: {data.style} (Apply the {data.style} CSS rules!) Make Sure layout is properly followed.
    
    🔹 CANDIDATE INFO:
    {profile_info}
    
    🔹 RAW EXPERIENCE (REWRITE THIS):
    {data.resume_text}
    
    🔹 TARGET JOB DESCRIPTION (OPTIMIZE FOR THIS):
    {data.job_description}

    Use the Following Color Instructions: {color_instruction}
    """

    try:
        response = client.chat.completions.create(
            model="gpt-5.1",  # Using the smartest model for design + logic
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.7, # Slightly creative to allow for better phrasing
            max_tokens=6000,
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

@app.get("/extra/contact")
def contact_page():
    return FileResponse("app/static/pages/extra/contact.html")

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
