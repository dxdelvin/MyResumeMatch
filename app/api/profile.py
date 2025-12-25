from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db, SessionLocal
from app.models.profile import Profile
from app.dependencies import get_verified_email
from app.models.payment import Payment

router = APIRouter()


class ProfileRequest(BaseModel):
    full_name: str
    phone: str | None = None
    location: str | None = None
    linkedin: str | None = None
    portfolio: str | None = None


@router.get("/profile")
def get_profile(email: str = Depends(get_verified_email), db: Session = Depends(get_db)):
    profile = db.query(Profile).filter(Profile.email == email).first()
    
    # Fetch last 5 payments
    payments_query = db.query(Payment).filter(Payment.email == email).order_by(Payment.created_at.desc()).limit(5).all()
    
    # Format payments
    payment_history = []
    for p in payments_query:
        payment_history.append({
            "date": p.created_at.strftime("%Y-%m-%d"),
            "amount": f"{p.amount:.2f} {p.currency.upper()}",
            "credits": f"+{p.credits_added}",
            "plan": p.plan_name.title()
        })


    if not profile:
        return None

    return {
        "email": profile.email,
        "full_name": profile.full_name,
        "phone": profile.phone,
        "location": profile.location,
        "linkedin": profile.linkedin,
        "portfolio": profile.portfolio,
        "credits": profile.credits,
        "history": payment_history  # <--- NEW FIELD
    }


@router.post("/profile")
def save_profile(data: ProfileRequest, email: str = Depends(get_verified_email), db: Session = Depends(get_db)):
    """
    Save/update user profile. Email is extracted from verified Google token.
    """
    profile = db.query(Profile).filter(Profile.email == email).first()

    if profile:
        # update existing
        profile.full_name = data.full_name
        profile.phone = data.phone
        profile.location = data.location
        profile.linkedin = data.linkedin
        profile.portfolio = data.portfolio
    else:
        # create new user with FREE CREDITS
        profile = Profile(
            email=email,
            full_name=data.full_name,
            phone=data.phone,
            location=data.location,
            linkedin=data.linkedin,
            portfolio=data.portfolio,
            credits=5  # 🔑 FREE CREDITS ON SIGNUP
        )
        db.add(profile)

    db.commit()
    db.refresh(profile)

    return {
        "message": "Profile saved successfully",
        "credits": profile.credits
    }


@router.delete("/profile")
def delete_profile(email: str = Depends(get_verified_email)):
    """
    Soft-delete the account to prevent credit abuse.
    Wipes all personal data and credits, but keeps the email record.
    """
    db = SessionLocal()
    
    profile = db.query(Profile).filter(Profile.email == email).first()
    
    if not profile:
        db.close()
        raise HTTPException(status_code=404, detail="User not found")
        
    # 🛑 THE FIX: Anonymize instead of Delete
    # We keep the row so they can't sign up again for free credits
    profile.full_name = "Deleted User"
    profile.phone = None
    profile.location = None
    profile.linkedin = None
    profile.portfolio = None
    profile.credits = 0  # 💀 Wipe their credits
    
    # Note: We keep the email so we recognize them if they return
    
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Deletion failed")
    finally:
        db.close()
    
    return {"message": "Account data wiped successfully"}