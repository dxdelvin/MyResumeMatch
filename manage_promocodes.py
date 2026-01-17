"""
🎉 PROMOCODE MANAGEMENT HELPER
Quick script to create and manage promocodes in the database.

Usage:
    python manage_promocodes.py --create "SUMMER2024" --credits 10 --max-uses 100 --expires 2024-08-31
    python manage_promocodes.py --list
    python manage_promocodes.py --deactivate "SUMMER2024"
    python manage_promocodes.py --activate "SUMMER2024"
"""

import sys
import os
from datetime import datetime

# Add the app directory to the path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models.promocode import Promocode


def create_promocode(code, credits=10, max_uses=None, expires=None):
    """Create a new promocode"""
    db = SessionLocal()
    
    try:
        # Check if code already exists
        existing = db.query(Promocode).filter(Promocode.code == code.upper()).first()
        if existing:
            print(f"❌ Promocode '{code}' already exists!")
            return False
        
        # Parse expiry date if provided
        expires_at = None
        if expires:
            try:
                expires_at = datetime.fromisoformat(expires)
            except ValueError:
                print(f"❌ Invalid date format. Use YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS")
                return False
        
        # Create the promocode
        promo = Promocode(
            code=code.upper(),
            credits_reward=credits,
            max_uses=max_uses,
            expires_at=expires_at,
            is_active=True
        )
        
        db.add(promo)
        db.commit()
        
        print(f"✅ Promocode created successfully!")
        print(f"   Code: {promo.code}")
        print(f"   Credits: {promo.credits_reward}")
        print(f"   Max Uses: {promo.max_uses if promo.max_uses else 'Unlimited'}")
        print(f"   Expires: {promo.expires_at.isoformat() if promo.expires_at else 'Never'}")
        print(f"   Active: {promo.is_active}")
        
        return True
    finally:
        db.close()


def list_promocodes():
    """List all promocodes"""
    db = SessionLocal()
    
    try:
        promos = db.query(Promocode).all()
        
        if not promos:
            print("No promocodes found.")
            return
        
        print("\n📋 ACTIVE PROMOCODES:\n")
        print(f"{'Code':<20} {'Credits':<10} {'Uses':<20} {'Status':<15} {'Expires':<20}")
        print("-" * 85)
        
        for p in promos:
            status = "🟢 Active" if p.is_active else "🔴 Inactive"
            expires = p.expires_at.strftime("%Y-%m-%d") if p.expires_at else "Never"
            uses = f"{p.used_count}/{p.max_uses}" if p.max_uses else f"{p.used_count}/∞"
            print(f"{p.code:<20} {p.credits_reward:<10} {uses:<20} {status:<15} {expires:<20}")
        
        print()
    finally:
        db.close()


def deactivate_promocode(code):
    """Deactivate a promocode"""
    db = SessionLocal()
    
    try:
        promo = db.query(Promocode).filter(Promocode.code == code.upper()).first()
        
        if not promo:
            print(f"❌ Promocode '{code}' not found!")
            return False
        
        promo.is_active = False
        db.commit()
        
        print(f"✅ Promocode '{code}' has been deactivated")
        return True
    finally:
        db.close()


def activate_promocode(code):
    """Activate a promocode"""
    db = SessionLocal()
    
    try:
        promo = db.query(Promocode).filter(Promocode.code == code.upper()).first()
        
        if not promo:
            print(f"❌ Promocode '{code}' not found!")
            return False
        
        promo.is_active = True
        db.commit()
        
        print(f"✅ Promocode '{code}' has been activated")
        return True
    finally:
        db.close()


def delete_promocode(code):
    """Delete a promocode"""
    db = SessionLocal()
    
    try:
        promo = db.query(Promocode).filter(Promocode.code == code.upper()).first()
        
        if not promo:
            print(f"❌ Promocode '{code}' not found!")
            return False
        
        db.delete(promo)
        db.commit()
        
        print(f"✅ Promocode '{code}' has been deleted")
        return True
    finally:
        db.close()


def get_promocode_stats(code):
    """Get detailed stats for a promocode"""
    db = SessionLocal()
    
    try:
        promo = db.query(Promocode).filter(Promocode.code == code.upper()).first()
        
        if not promo:
            print(f"❌ Promocode '{code}' not found!")
            return False
        
        is_expired = promo.expires_at < datetime.utcnow() if promo.expires_at else False
        
        print(f"\n📊 PROMOCODE STATS: {promo.code}\n")
        print(f"Credits Reward:  {promo.credits_reward}")
        print(f"Status:          {'🟢 Active' if promo.is_active else '🔴 Inactive'}")
        print(f"Created:         {promo.created_at.strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"Used Count:      {promo.used_count}")
        print(f"Max Uses:        {promo.max_uses if promo.max_uses else 'Unlimited'}")
        
        if promo.max_uses:
            usage_pct = (promo.used_count / promo.max_uses) * 100
            remaining = promo.max_uses - promo.used_count
            print(f"Usage:           {usage_pct:.1f}% ({remaining} remaining)")
        
        print(f"Expires:         {promo.expires_at.strftime('%Y-%m-%d') if promo.expires_at else 'Never'}")
        print(f"Expired:         {'Yes ⚠️' if is_expired else 'No'}")
        print()
        
        return True
    finally:
        db.close()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    
    command = sys.argv[1]
    
    if command == "--create":
        if len(sys.argv) < 3:
            print("Usage: python manage_promocodes.py --create <code> [--credits N] [--max-uses N] [--expires YYYY-MM-DD]")
            sys.exit(1)
        
        code = sys.argv[2]
        credits = 10
        max_uses = None
        expires = None
        
        # Parse optional arguments
        i = 3
        while i < len(sys.argv):
            if sys.argv[i] == "--credits" and i + 1 < len(sys.argv):
                credits = int(sys.argv[i + 1])
                i += 2
            elif sys.argv[i] == "--max-uses" and i + 1 < len(sys.argv):
                max_uses = int(sys.argv[i + 1])
                i += 2
            elif sys.argv[i] == "--expires" and i + 1 < len(sys.argv):
                expires = sys.argv[i + 1]
                i += 2
            else:
                i += 1
        
        create_promocode(code, credits, max_uses, expires)
    
    elif command == "--list":
        list_promocodes()
    
    elif command == "--deactivate":
        if len(sys.argv) < 3:
            print("Usage: python manage_promocodes.py --deactivate <code>")
            sys.exit(1)
        deactivate_promocode(sys.argv[2])
    
    elif command == "--activate":
        if len(sys.argv) < 3:
            print("Usage: python manage_promocodes.py --activate <code>")
            sys.exit(1)
        activate_promocode(sys.argv[2])
    
    elif command == "--delete":
        if len(sys.argv) < 3:
            print("Usage: python manage_promocodes.py --delete <code>")
            sys.exit(1)
        delete_promocode(sys.argv[2])
    
    elif command == "--stats":
        if len(sys.argv) < 3:
            print("Usage: python manage_promocodes.py --stats <code>")
            sys.exit(1)
        get_promocode_stats(sys.argv[2])
    
    else:
        print(f"Unknown command: {command}")
        print(__doc__)
        sys.exit(1)
