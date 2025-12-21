from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.profile import Profile

router = APIRouter()


class ProfileRequest(BaseModel):
    email: str
    full_name: str
    phone: str | None = None
    location: str | None = None
    linkedin: str | None = None
    portfolio: str | None = None


@router.get("/profile")
def get_profile(email: str):
    db: Session = SessionLocal()

    profile = db.query(Profile).filter(Profile.email == email).first()
    db.close()

    if not profile:
        return None

    # ✅ RETURN CLEAN JSON (IMPORTANT)
    return {
        "email": profile.email,
        "full_name": profile.full_name,
        "phone": profile.phone,
        "location": profile.location,
        "linkedin": profile.linkedin,
        "portfolio": profile.portfolio,
        "credits": profile.credits
    }


@router.post("/profile")
def save_profile(data: ProfileRequest):
    db: Session = SessionLocal()

    profile = db.query(Profile).filter(Profile.email == data.email).first()

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
            email=data.email,
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
    db.close()

    return {
        "message": "Profile saved successfully",
        "credits": profile.credits
    }
