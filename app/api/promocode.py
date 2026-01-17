"""
🎉 ADMIN API - Promocode Management
This API allows admins to create, update, and manage promocodes.
In production, add proper authentication/authorization checks.
"""

from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from datetime import datetime
from app.database import get_db
from app.models.promocode import Promocode

router = APIRouter()


class PromocodeCreateRequest(BaseModel):
    code: str  # e.g., "SUMMER2024"
    credits_reward: int = 10  # How many credits to award
    is_active: bool = True
    max_uses: int | None = None  # None = unlimited
    expires_at: str | None = None  # ISO format: "2025-12-31T23:59:59"


class PromocodeUpdateRequest(BaseModel):
    credits_reward: int | None = None
    is_active: bool | None = None
    max_uses: int | None = None
    expires_at: str | None = None


@router.post("/admin/promocodes")
def create_promocode(data: PromocodeCreateRequest, db: Session = Depends(get_db)):
    """
    🎉 Create a new promocode.
    
    Example:
    POST /api/admin/promocodes
    {
        "code": "SUMMER2024",
        "credits_reward": 10,
        "is_active": true,
        "max_uses": 100,
        "expires_at": "2024-08-31T23:59:59"
    }
    """
    # 🔒 TODO: Add authentication check here in production
    # Verify user is admin
    
    # Check if code already exists
    existing = db.query(Promocode).filter(Promocode.code == data.code.upper()).first()
    if existing:
        raise HTTPException(status_code=400, detail="Promocode already exists")
    
    expires_at = None
    if data.expires_at:
        try:
            expires_at = datetime.fromisoformat(data.expires_at)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid expires_at format. Use ISO format: YYYY-MM-DDTHH:MM:SS")
    
    promocode = Promocode(
        code=data.code.upper(),
        credits_reward=data.credits_reward,
        is_active=data.is_active,
        max_uses=data.max_uses,
        expires_at=expires_at
    )
    
    db.add(promocode)
    db.commit()
    db.refresh(promocode)
    
    return {
        "message": "Promocode created successfully",
        "code": promocode.code,
        "credits_reward": promocode.credits_reward,
        "is_active": promocode.is_active,
        "max_uses": promocode.max_uses,
        "expires_at": promocode.expires_at.isoformat() if promocode.expires_at else None,
        "created_at": promocode.created_at.isoformat()
    }


@router.get("/admin/promocodes")
def list_promocodes(db: Session = Depends(get_db)):
    """
    📋 List all promocodes with their status and usage stats.
    """
    # 🔒 TODO: Add authentication check here in production
    
    promocodes = db.query(Promocode).all()
    
    return [
        {
            "id": p.id,
            "code": p.code,
            "credits_reward": p.credits_reward,
            "is_active": p.is_active,
            "max_uses": p.max_uses,
            "used_count": p.used_count,
            "usage_percentage": f"{(p.used_count / p.max_uses * 100):.1f}%" if p.max_uses else "Unlimited",
            "expires_at": p.expires_at.isoformat() if p.expires_at else None,
            "created_at": p.created_at.isoformat(),
            "is_expired": p.expires_at < datetime.utcnow() if p.expires_at else False
        }
        for p in promocodes
    ]


@router.get("/admin/promocodes/{code}")
def get_promocode(code: str, db: Session = Depends(get_db)):
    """
    📊 Get detailed info about a specific promocode.
    """
    # 🔒 TODO: Add authentication check here in production
    
    promo = db.query(Promocode).filter(Promocode.code == code.upper()).first()
    if not promo:
        raise HTTPException(status_code=404, detail="Promocode not found")
    
    return {
        "id": promo.id,
        "code": promo.code,
        "credits_reward": promo.credits_reward,
        "is_active": promo.is_active,
        "max_uses": promo.max_uses,
        "used_count": promo.used_count,
        "remaining_uses": promo.max_uses - promo.used_count if promo.max_uses else "Unlimited",
        "usage_percentage": f"{(promo.used_count / promo.max_uses * 100):.1f}%" if promo.max_uses else "Unlimited",
        "expires_at": promo.expires_at.isoformat() if promo.expires_at else None,
        "is_expired": promo.expires_at < datetime.utcnow() if promo.expires_at else False,
        "created_at": promo.created_at.isoformat()
    }


@router.patch("/admin/promocodes/{code}")
def update_promocode(code: str, data: PromocodeUpdateRequest, db: Session = Depends(get_db)):
    """
    ✏️ Update an existing promocode.
    """
    # 🔒 TODO: Add authentication check here in production
    
    promo = db.query(Promocode).filter(Promocode.code == code.upper()).first()
    if not promo:
        raise HTTPException(status_code=404, detail="Promocode not found")
    
    if data.credits_reward is not None:
        promo.credits_reward = data.credits_reward
    
    if data.is_active is not None:
        promo.is_active = data.is_active
    
    if data.max_uses is not None:
        promo.max_uses = data.max_uses
    
    if data.expires_at is not None:
        try:
            promo.expires_at = datetime.fromisoformat(data.expires_at)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid expires_at format. Use ISO format: YYYY-MM-DDTHH:MM:SS")
    
    db.commit()
    db.refresh(promo)
    
    return {
        "message": "Promocode updated successfully",
        "code": promo.code,
        "credits_reward": promo.credits_reward,
        "is_active": promo.is_active,
        "max_uses": promo.max_uses,
        "expires_at": promo.expires_at.isoformat() if promo.expires_at else None
    }


@router.delete("/admin/promocodes/{code}")
def delete_promocode(code: str, db: Session = Depends(get_db)):
    """
    🗑️ Delete a promocode (hard delete).
    """
    # 🔒 TODO: Add authentication check here in production
    
    promo = db.query(Promocode).filter(Promocode.code == code.upper()).first()
    if not promo:
        raise HTTPException(status_code=404, detail="Promocode not found")
    
    db.delete(promo)
    db.commit()
    
    return {"message": f"Promocode '{code}' deleted successfully"}


@router.post("/admin/promocodes/{code}/deactivate")
def deactivate_promocode(code: str, db: Session = Depends(get_db)):
    """
    🛑 Quickly deactivate a promocode (without deleting it).
    """
    # 🔒 TODO: Add authentication check here in production
    
    promo = db.query(Promocode).filter(Promocode.code == code.upper()).first()
    if not promo:
        raise HTTPException(status_code=404, detail="Promocode not found")
    
    promo.is_active = False
    db.commit()
    db.refresh(promo)
    
    return {"message": f"Promocode '{code}' deactivated", "is_active": promo.is_active}


@router.post("/admin/promocodes/{code}/activate")
def activate_promocode(code: str, db: Session = Depends(get_db)):
    """
    ✅ Activate a previously deactivated promocode.
    """
    # 🔒 TODO: Add authentication check here in production
    
    promo = db.query(Promocode).filter(Promocode.code == code.upper()).first()
    if not promo:
        raise HTTPException(status_code=404, detail="Promocode not found")
    
    promo.is_active = True
    db.commit()
    db.refresh(promo)
    
    return {"message": f"Promocode '{code}' activated", "is_active": promo.is_active}
