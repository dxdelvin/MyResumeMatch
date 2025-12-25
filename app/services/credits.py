from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.models.profile import Profile

GENERATE_COST = 1.0  # Resume/Cover Letter generation
REFINE_COST = 0.2    # AI refinement cost

# ✅ CHARACTER LIMITS (for security & quality control)
CHAR_LIMIT_RESUME_EXPERIENCE = 6000  # Your Experience textarea
CHAR_LIMIT_JOB_DESCRIPTION = 6000    # Job Description textarea
CHAR_LIMIT_ASK_AI_ADJUST = 4000      # Ask AI to Adjust (refine) input
CHAR_LIMIT_COVER_LETTER_EXTRA = 1000 # Cover letter extra questions


def has_credits(db: Session, email: str, amount: float = 1.0) -> bool:
    """Check if user has sufficient credits for an operation."""
    user = db.query(Profile).filter(Profile.email == email).first()
    return bool(user and user.credits >= amount)


def deduct_credit_atomic(db: Session, email: str, amount: float = 1.0) -> float:
    """
    🔐 ATOMIC OPERATION: Deduct credits FIRST (cut first).
    Raises HTTPException if insufficient credits.
    Returns remaining credits after deduction.
    
    This prevents multi-tab exploitation by immediately locking the credits.
    If an operation fails, the caller should use refund_credit() to restore.
    """
    user = db.query(Profile).filter(Profile.email == email).first()
    
    if not user or user.credits is None or user.credits < amount:
        raise HTTPException(status_code=402, detail="Insufficient credits")
    
    # ✅ CUT FIRST (deduct immediately)
    user.credits -= amount
    db.commit()
    db.refresh(user)
    
    return user.credits


def refund_credit(db: Session, email: str, amount: float = 1.0) -> float:
    """
    💰 REFUND: Add credits back if operation failed.
    Should be called in except block after deduct_credit_atomic fails to generate.
    """
    user = db.query(Profile).filter(Profile.email == email).first()
    
    if user:
        user.credits += amount
        db.commit()
        db.refresh(user)
    
    return user.credits if user else 0


def deduct_credit(db: Session, email: str):
    """Legacy function - kept for backwards compatibility."""
    user = db.query(Profile).filter(Profile.email == email).first()
    if user:
        user.credits -= 1
        db.commit()


def add_credits(db: Session, email: str, amount: int):
    """Add credits to user account."""
    user = db.query(Profile).filter(Profile.email == email).first()
    if user:
        user.credits += amount
        db.commit()


def get_credits(db: Session, email: str) -> int:
    """Get current credit balance."""
    user = db.query(Profile).filter(Profile.email == email).first()
    return user.credits if user else 0


def deduct_refine_credit(db: Session, email: str) -> float:
    """Legacy - use deduct_credit_atomic instead."""
    user = db.query(Profile).filter(Profile.email == email).first()

    if not user or user.credits is None or user.credits < REFINE_COST:
        raise HTTPException(status_code=402, detail="Insufficient credits")

    user.credits -= REFINE_COST
    db.commit()
    db.refresh(user)

    return user.credits
