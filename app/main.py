from fastapi import FastAPI, HTTPException, Depends
from pydantic import BaseModel
import os
from dotenv import load_dotenv
from openai import OpenAI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from app.api.profile import router as profile_router
from app.api.billing import router as billing_router

from app.database import engine, Base
from app.models.profile import Profile
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
def generate_resume(data: ResumeInput, email: str = Depends(get_verified_email)):
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
    
    # ✅ ATOMIC OPERATION 1: Deduct credits FIRST (cut first)
    try:
        remaining_credits = deduct_credit_atomic(db, email, GENERATE_COST)
    except HTTPException as e:
        raise e
    
    system_prompt = """
You are an Expert Senior Resume Writer, ATS (Applicant Tracking System) Algorithm Specialist, and Creative Web Developer.

Your goal is to create a high-scoring, ATS-optimized resume in HTML/CSS format that perfectly matches the requested visual style, based on the provided user details and job description, and then provide insightful gap analysis and improvement suggestions.

CONTENT OPTIMIZATION & REWRITING:
- Analyze the candidate's current experience against the Target Job Description
- Rewrite resume content to maximize ATS Match Rate by integrating hard and soft keywords naturally
- Focus on transferable skills if experience doesn't match perfectly - reframe existing experience to fit new contexts
- Use "Action Verb + Task + Result" format (Google XYZ formula) for quantifiable results
- Do not fabricate experience - only enhance and optimize what's provided
- If user has no relevant experience, suggest building portfolio projects, certifications, or volunteer work
- Be creative with layout and design while maintaining professionalism

HTML/CSS GENERATION REQUIREMENTS:
- Generate ONLY the resume content HTML with embedded CSS (not a full HTML document)
- Start directly with the resume content (name, contact, sections, etc.)
- Include all CSS in <style> tags within the HTML
- PERFECTLY implement the specified visual style - be creative and detailed in your interpretation
- Include @media print CSS for perfect A4/Letter printing
- Use semantic HTML structure for ATS parsing
- Use clean, professional fonts appropriate to the style
- NO <html>, <head>, or <body> tags - just the resume content
- NO code blocks, NO backticks, NO markdown formatting in the output

VISUAL STYLE IMPLEMENTATION:

For "Harvard" style:
- Traditional, academic layout with left-aligned text
- Name in large, bold serif font at top center
- Contact info below name, right-aligned
- Section headers in ALL CAPS, bold, with underlines or borders
- Bullet points with consistent indentation
- Professional black text, minimal color accents
- Classic typography with serif headers and sans-serif body

For "Tech Focus" style:
- Modern tech-inspired design with subtle tech colors
- Name with modern font, possibly with accent color
- Clean layout with tech-appropriate sections
- Subtle use of blue/green accent colors
- Professional yet approachable design
- Include relevant tech certifications prominently

For "Two Column" style:
- Two-column layout using CSS Grid or Flexbox
- Left column: Contact info, skills, education
- Right column: Professional summary, work experience
- Modern typography with clear section separation
- Balanced white space distribution

For "Fancy" style:
- Elegant design with tasteful styling
- Decorative elements like subtle borders or icons
- Professional color scheme with accent colors
- Elegant typography (serif for headers, sans-serif for body)
- Creative layout while maintaining readability

STYLE CREATIVITY GUIDELINES:
- Each style should have distinct visual characteristics
- Use appropriate fonts, colors, spacing, and layout for the chosen style
- Be creative within professional bounds - don't be afraid to experiment with layout
- Ensure the design is ATS-friendly (semantic HTML, readable fonts)
- Make the resume visually appealing while prioritizing content optimization

ATS SCORING:
- Provide honest ATS score (0-100) based on keyword matching, formatting, and JD relevance

CRITICAL: Your output must be ONLY the content between the markers. No explanations, no code blocks, no markdown.

Output format:
===RESUME_HTML===
[Resume content HTML with embedded CSS - NO full HTML document structure]

===ATS_SCORE===
[number 0-100]
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
Create a high-scoring, ATS-optimized resume based on the following:

VISUAL STYLE: {data.style}

CANDIDATE PROFILE INFORMATION (MANDATORY - USE THIS IN RESUME HEADER):
{profile_info}

CURRENT RESUME CONTENT:
{data.resume_text}

TARGET JOB DESCRIPTION:
{data.job_description}

CRITICAL REQUIREMENTS:
- STYLE IMPLEMENTATION: You MUST implement the "{data.style}" visual style exactly as specified in the system prompt
- PROFILE USAGE: If candidate profile information is provided above, you MUST include it in the resume header/contact section
- If no profile information is provided, create a generic professional header with placeholder information
- The profile information is provided for context but is not mandatory - use it if available

INSTRUCTIONS:
- Analyze experience against the JD and optimize for maximum ATS matching
- Integrate relevant keywords naturally and strategically throughout the resume
- Focus on transferable skills and quantifiable achievements using action verbs
- If the candidate has limited or no relevant experience, suggest and include:
  * Personal projects that demonstrate relevant skills
  * Online courses, certifications, or bootcamps
  * Volunteer work, internships, or freelance projects
  * Transferable skills from other life experiences
- Be creative with the layout while maintaining ATS compatibility
- Ensure the resume highlights the candidate's potential and growth mindset
"""

    response = client.chat.completions.create(
        model="gpt-4",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        max_completion_tokens=5000,
    )

    content = response.choices[0].message.content

    try:
        # ✅ ATOMIC OPERATION 2: Parse response successfully before we committed credits
        # Clean the content first - remove any code blocks
        content = content.replace('```html', '').replace('```', '').strip()
        
        resume_html = content.split("===RESUME_HTML===")[1].split("===ATS_SCORE===")[0].strip()
        ats_score = content.split("===ATS_SCORE===")[1].strip()
          
        # Clean up any remaining markdown or code formatting
        resume_html = resume_html.replace('```', '').strip()
        ats_score = ats_score.replace('```', '').strip()
        
        # Validate we got valid output
        if not resume_html or not ats_score:
            raise ValueError("Empty HTML or ATS score from AI")
          
    except Exception as e:
        # ✅ REFUND: Operation failed, return credits
        refund_credit(db, email, GENERATE_COST)
        raise HTTPException(
            status_code=500,
            detail="AI generation failed. Credits have been refunded."
        )

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

@app.get("/sitemap.xml")
def sitemap():
    return FileResponse("app/static/sitemap.xml")

app.mount("/static", StaticFiles(directory="app/static"), name="static")

app.include_router(profile_router, prefix="/api")
app.include_router(billing_router)

from app.api.refine import router as refine_router
app.include_router(refine_router)

from app.api.cover_letter import router as cover_letter_router
app.include_router(cover_letter_router)
