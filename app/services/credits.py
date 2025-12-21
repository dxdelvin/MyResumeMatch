from sqlalchemy.orm import Session
from app.models.profile import Profile

def has_credits(db: Session, email: str) -> bool:
    user = db.query(Profile).filter(Profile.email == email).first()
    return bool(user and user.credits > 0)

def deduct_credit(db: Session, email: str):
    user = db.query(Profile).filter(Profile.email == email).first()
    if user:
        user.credits -= 1
        db.commit()

def add_credits(db: Session, email: str, amount: int):
    user = db.query(Profile).filter(Profile.email == email).first()
    if user:
        user.credits += amount
        db.commit()

def get_credits(db: Session, email: str) -> int:
    user = db.query(Profile).filter(Profile.email == email).first()
    return user.credits if user else 0
