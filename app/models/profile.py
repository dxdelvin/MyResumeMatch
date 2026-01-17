from sqlalchemy import Column, Float, Integer, String, Boolean
from app.database import Base

class Profile(Base):
    __tablename__ = "profiles"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)

    full_name = Column(String, nullable=False)
    phone = Column(String)
    location = Column(String)
    linkedin = Column(String)
    portfolio = Column(String)
    credits = Column(Float, default=5.0)  # Default free credits upon profile creation
    
    # Promocode tracking
    promocode_used = Column(String, nullable=True)  # Track which promocode (if any) was used
    promocode_redeemed = Column(Boolean, default=False)  # Ensure one-time use per profile    