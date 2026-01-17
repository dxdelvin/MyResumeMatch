from sqlalchemy import Column, Integer, String, Boolean, DateTime
from datetime import datetime
from app.database import Base


class Promocode(Base):
    __tablename__ = "promocodes"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, unique=True, index=True, nullable=False)  # e.g., "SUMMER2024"
    credits_reward = Column(Integer, default=10)  # Credits given when code is used
    is_active = Column(Boolean, default=True)  # Can be toggled on/off for events
    max_uses = Column(Integer, nullable=True)  # Null = unlimited, Otherwise limits total uses
    used_count = Column(Integer, default=0)  # Track how many times this code has been used
    expires_at = Column(DateTime, nullable=True)  # When the code expires (None = no expiry)
    created_at = Column(DateTime, default=datetime.utcnow)
