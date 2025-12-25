from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from openai import OpenAI
import os

from app.database import get_db
from app.dependencies import get_verified_email
from app.services.credits import (
    has_credits, 
    deduct_credit_atomic, 
    refund_credit,
    GENERATE_COST,
    CHAR_LIMIT_COVER_LETTER_EXTRA,
    CHAR_LIMIT_RESUME_EXPERIENCE, 
    CHAR_LIMIT_JOB_DESCRIPTION
)
from app.models.profile import Profile

router = APIRouter(prefix="/api", tags=["cover-letter"])
client = OpenAI(api_key=os.getenv("OPEN_API_KEY"))

class CoverLetterInput(BaseModel):
    style: str 
    resume_text: str
    job_description: str
    hiring_manager: str | None = "Hiring Manager"
    motivation: str | None = "" # "Why this company?"
    highlight: str | None = ""  # "Special Story/Experience"

@router.post("/generate-cover-letter")
def generate_cl(data: CoverLetterInput, email: str = Depends(get_verified_email), db: Session = Depends(get_db)):
    """
    Generate a narrative-focused cover letter.
    🔒 SECURITY: Email comes from verified JWT token.
    """
    
    # ✅ VALIDATION 1: Character Limits
    if len(data.motivation or "") > CHAR_LIMIT_COVER_LETTER_EXTRA:
        raise HTTPException(status_code=400, detail="Motivation text is too long.")
    
    if len(data.highlight or "") > CHAR_LIMIT_COVER_LETTER_EXTRA:
        raise HTTPException(status_code=400, detail="Highlight story is too long.")
    
    if len(data.resume_text) > CHAR_LIMIT_RESUME_EXPERIENCE:
        raise HTTPException(status_code=400, detail="Your Text is too long.")

    if len(data.job_description) > CHAR_LIMIT_JOB_DESCRIPTION:
        raise HTTPException(status_code=400, detail="Job description is too long.")
    
    # ✅ VALIDATION 2: Credits
    if not has_credits(db, email, GENERATE_COST):
        raise HTTPException(
            status_code=402, 
            detail=f"Insufficient credits. You need {GENERATE_COST} credits."
        )
    
    # ✅ ATOMIC OPERATION 1: Deduct credits
    try:
        remaining_credits = deduct_credit_atomic(db, email, GENERATE_COST)
    except HTTPException as e:
        raise e

    # --- 🧠 STORYTELLER PROMPT ---
    system_prompt = """
    You are an Expert Ghostwriter for Executive Careers.
    Your goal is to write a compelling, narrative-driven Cover Letter.

    ❌ WHAT NOT TO DO:
    - DO NOT create fancy layouts, colors, or columns. 
    - DO NOT use bullet points. A cover letter is a story, not a list.
    - DO NOT say "I have X skills." Show, don't tell.

    ✅ DESIGN RULES (SIMPLE & CLEAN):
    - Generate ONLY the HTML content (no <head>, <body>).
    - Embed CSS in <style> tags.
    - STYLE: Professional Business Letter.
      - Size: 11pt or 12pt.
      - Color: #000000 (Pure Black).
      - Layout: Standard 1-inch margins, left-aligned text, clear paragraph spacing.
      - NO background colors. NO creative elements. Just text on paper.

    ✅ CONTENT RULES (THE STORY):
    1. **Salutation:** Use the provided Hiring Manager name.
    2. **The Hook (Paragraph 1):** Why them? Use the user's 'Motivation' input to create a genuine connection to the company.
    3. **The 'Special Experience' (Paragraph 2):** This is the core. Use the user's 'Highlight' input. 
       - If they provided a specific story, polish it and connect it to the Job Description's biggest problem.
       - If they didn't, find the strongest match in their Resume and tell it as a short success story.
    4. **The Closing:** Confident, professional, and requesting a specific next step.
    
    Output format: Just the HTML string starting with <style>...
    """
    manager_name = data.hiring_manager.strip() if data.hiring_manager else "Hiring Manager"
    if not manager_name: manager_name = "Hiring Manager"

    user_prompt = f"""
    TARGET JOB DESCRIPTION: 
    {data.job_description}
    
    CANDIDATE RESUME: 
    {data.resume_text}
    
    ---
    USER INPUTS (USE THESE TO DRIVE THE NARRATIVE):
    
    1. Hiring Manager: {manager_name}
    
    2. THE HOOK (Why this company?): 
    "{data.motivation}"
    (If empty, find a compelling reason in the JD to be excited about).
    
    3. THE SPECIAL STORY (The Highlight): 
    "{data.highlight}"
    (This is the most important part. Weave this story into the letter to prove competency).
    """

    try:
        response = client.chat.completions.create(
            model="gpt-4o",  # Use smart model for better writing flow
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.7, # Slightly creative for better storytelling
        )

        content = response.choices[0].message.content
        cl_html = content.replace('```html', '').replace('```', '').strip()
        
        if not cl_html:
            raise ValueError("Empty response from AI")
        
        return {
            "cover_letter_html": cl_html,
            "credits_left": remaining_credits
        }
    
    except Exception as e:
        refund_credit(db, email, GENERATE_COST)
        raise HTTPException(
            status_code=500,
            detail="Generation failed. Credits refunded."
        )