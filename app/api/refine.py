from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from openai import OpenAI
import os
import re

from app.database import get_db
from app.dependencies import get_verified_email
from app.services.credits import (
    deduct_credit_atomic, 
    refund_credit, 
    has_credits,
    REFINE_COST,
    CHAR_LIMIT_ASK_AI_ADJUST
)
from app.models.profile import Profile
from pydantic import BaseModel

router = APIRouter(prefix="/api", tags=["refine"])

client = OpenAI(api_key=os.getenv("OPEN_API_KEY"))
CHAR_LIMIT_HTML_SAFETY = 30000

class RefineRequest(BaseModel):
    html: str
    instruction: str
    job_description: str = "" 
    current_ats_score: float = 0.0 
    type: str = "resume"
    

@router.post("/refine-resume")
def refine_resume(data: RefineRequest, email: str = Depends(get_verified_email), db: Session = Depends(get_db)):
    """
    Refine a resume/cover letter. Email is extracted from verified Google token.
    🔒 SECURITY: Email comes from verified JWT token, never from request body.
    """
    # ✅ VALIDATION 1: Character Limit on instruction
    if len(data.instruction) > CHAR_LIMIT_ASK_AI_ADJUST:
        raise HTTPException(
            status_code=400,
            detail=f"Your instruction exceeds {CHAR_LIMIT_ASK_AI_ADJUST} characters. Please be more concise."
        )
    
    if len(data.html) > CHAR_LIMIT_HTML_SAFETY:
        raise HTTPException(
            status_code=400,
            detail=f"Resume is too large to process ({len(data.html)} chars)."
        )
        
    # ✅ VALIDATION 2: Check if user has credits
    if not has_credits(db, email, REFINE_COST):
        raise HTTPException(
            status_code=402, 
            detail=f"Insufficient credits. You need {REFINE_COST} credits to refine."
        )

    # ✅ ATOMIC OPERATION 1: Deduct credits FIRST
    try:
        remaining_credits = deduct_credit_atomic(db, email, REFINE_COST)
    except HTTPException as e:
        raise e

    # 2️⃣ AI Prompt
    context_instruction = "You are refining a Resume."
    if data.type == "cover_letter":
        context_instruction = "You are refining a Cover Letter. Maintain the letter format, flow, and professional tone."

    job_desc_snippet = (data.job_description or "")[:6000]
    current_html_snippet = (data.html or "")[:CHAR_LIMIT_HTML_SAFETY]
    current_score = data.current_ats_score or 0.0

    system_prompt = """
    You are an expert resume/cover-letter editor.
    You must preserve the HTML structure and styling.

    GLOBAL RULES:
    - Input is HTML.
    - DO NOT remove structure.
    - DO NOT invent new experiences, companies, employers, degrees, certifications, dates, titles, or projects. unless user has mentioned to do it in prompt. 
    - Only modify what the instruction explicitly asks.
    - Preserve formatting, tags, and layout.
    - Return ONLY the required format. No markdown and no commentary.

    ATS SCORING RULES (only for resumes when a Job Description is provided):
    - Be strict.
    - Score must be a decimal number with exactly 2 decimals (example: 73.42). Never return a whole number.
    - Score range is 0.00 to 100.00.
    - Compare the UPDATED resume content against the Job Description.
    - Do not guess. If evidence is missing in the resume, do not award points.
    """

    if data.type == "resume" and job_desc_snippet and len(job_desc_snippet) > 10:
        prompt = (
            "CONTEXT: " + context_instruction + "\n\n"
            "INSTRUCTION:\n" + data.instruction + "\n\n"
            "CURRENT ATS SCORE (reference only):\n" + str(current_score) + "\n\n"
            "JOB DESCRIPTION:\n" + job_desc_snippet + "\n\n"
            "CURRENT CONTENT HTML:\n" + current_html_snippet + "\n\n"
            "Return your response EXACTLY like this:\n"
            "===UPDATED_HTML===\n"
            "[FULL updated HTML here]\n"
            "===ATS_SCORE===\n"
            "[A strict decimal score with exactly 2 decimals, 0.00-100.00]\n"
        )
    else:
        prompt = (
            "CONTEXT: " + context_instruction + "\n\n"
            "INSTRUCTION:\n" + data.instruction + "\n\n"
            "CURRENT CONTENT HTML:\n" + current_html_snippet + "\n\n"
            "Return FULL updated HTML only.\n"
        )

    try:
        response = client.chat.completions.create(
            model="gpt-5.1",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt}
            ],
            temperature=0.2,
            max_completion_tokens=5000,
        )
        content = response.choices[0].message.content.strip()
        content = content.replace('```html', '').replace('```', '').strip()
        
        # ✅ VALIDATION 3: Validate we got content back
        if not content:
            raise ValueError("Empty response from AI")

        updated_html = content
        new_ats_score = data.current_ats_score

        if data.type == "resume" and job_desc_snippet and len(job_desc_snippet) > 10:
            if "===UPDATED_HTML===" in content and "===ATS_SCORE===" in content:
                parts = content.split("===ATS_SCORE===")
                updated_html = parts[0].replace("===UPDATED_HTML===", "").strip()
                score_text = parts[1].strip() if len(parts) > 1 else ""

                match = re.search(r"(\d+(?:\.\d+)?)", score_text)
                if match:
                    parsed = float(match.group(1))
                    if 0.0 <= parsed <= 100.0:
                        new_ats_score = round(parsed, 2)
            else:
                print("⚠️ AI did not return ATS delimiter format; keeping previous score.")
        
        # ✅ SUCCESS! Credits already deducted (atomic)
        return {
            "updated_html": updated_html,
            "ats_score": new_ats_score,
            "credits_left": remaining_credits
        }

    except Exception as e:
        # ✅ REFUND: Operation failed, return credits
        refund_credit(db, email, REFINE_COST)
        print(f"Refine failed, refunding {REFINE_COST} credits. Error: {e}")
        raise HTTPException(
            status_code=500, 
            detail="AI refinement failed. Credits have been refunded."
        )