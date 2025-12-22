import os
import stripe
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from fastapi import Request
from pydantic import BaseModel

from app.database import get_db
from app.models.profile import Profile

# Stripe setup
stripe.api_key = os.getenv("STRIPE_SECRET_KEY")

router = APIRouter(prefix="/api/billing", tags=["billing"])

# 🔒 Credit packs (single source of truth)
CREDIT_PACKS = {
    "basic": {
        "price_id": "price_1SgmsRPgGW2HhSGkWMQwg526",
        "credits": 100
    },
    "popular": {
        "price_id": "price_1SgmwzPgGW2HhSGkqnkbBNWY",
        "credits": 300
    },
    "pro": {
        "price_id": "price_1SgmxSPgGW2HhSGkYEpqzVUf",
        "credits": 00
    }
}

class CheckoutRequest(BaseModel):
    plan: str
    email: str


@router.post("/create-checkout-session")
def create_checkout_session(
    data: CheckoutRequest,
    db: Session = Depends(get_db)
):
    plan = data.plan
    email = data.email

    if plan not in CREDIT_PACKS:
        raise HTTPException(status_code=400, detail="Invalid plan")

    user = db.query(Profile).filter(Profile.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    price_id = CREDIT_PACKS[plan]["price_id"]

    session = stripe.checkout.Session.create(
        mode="payment",
        payment_method_types=["card"],
        line_items=[{
            "price": price_id,
            "quantity": 1
        }],
        customer_email=email,
        success_url="http://localhost:8000/builder?payment=success",
        cancel_url="http://localhost:8000/pricing?payment=cancelled",
        metadata={
            "pack_id": plan,
            "email": email
        }
    )

    return {"checkout_url": session.url}





@router.post("/webhook")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    try:
        event = stripe.Webhook.construct_event(
            payload,
            sig_header,
            os.getenv("STRIPE_WEBHOOK_SECRET")
        )
    except Exception:
        return {"status": "invalid signature"}

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]

        metadata = session.get("metadata", {})

        email = metadata.get("email")
        pack_id = metadata.get("pack_id")

        # 👇 IMPORTANT: ignore fake CLI events
        if not email or not pack_id:
            print("Webhook received test event without metadata, ignoring.")
            return {"status": "ignored"}

        if pack_id not in CREDIT_PACKS:
            return {"status": "invalid pack"}

        user = db.query(Profile).filter(Profile.email == email).first()
        if not user:
            return {"status": "user not found"}

        user.credits = (user.credits or 0) + CREDIT_PACKS[pack_id]["credits"]
        db.commit()

    return {"status": "ok"}
