import os
import stripe
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from fastapi import Request
from pydantic import BaseModel

from app.database import get_db
from app.dependencies import get_verified_email
from app.models.profile import Profile
from app.models.payment import Payment

# Stripe setup
stripe.api_key = os.getenv("STRIPE_SECRET_KEY")


router = APIRouter(prefix="/api/billing", tags=["billing"])

# 🔒 Credit packs (single source of truth)
# EUR price IDs are read from environment so you can rotate Stripe prices without code edits.
# Fallbacks point to the previous EUR price IDs to avoid breaking checkout if envs are not set yet.
CREDIT_PACKS = {
    "basic": {
        "credits": 20,
        "prices": {
            "eur": "price_1SkQPi7n4jiFDpJAoP2UCK38",
            "inr": "price_1SihQu7n4jiFDpJA6Mo3MC30"
        }
    },
    "popular": {
        "credits": 60,
        "prices": {
            "eur": "price_1SkQSU7n4jiFDpJAeNvKfob6",
            "inr": "price_1SihSh7n4jiFDpJAN2iCUmIT"
        }
    },
    "pro": {
        "credits": 150,
        "prices": {
            "eur": "price_1SkQTh7n4jiFDpJARPJyKM3j",
            "inr": "price_1SihVO7n4jiFDpJA6XFuuKaG"
        }
    }
}

class CheckoutRequest(BaseModel):
    plan: str
    currency: str = "eur"


@router.post("/create-checkout-session")
def create_checkout_session(
    data: CheckoutRequest,
    email: str = Depends(get_verified_email),
    db: Session = Depends(get_db)
):
    """
    Create Stripe checkout session. Email is extracted from verified Google token.
    🔒 SECURITY: Email comes from verified JWT token, never from request body.
    """
    plan = data.plan
    currency = data.currency.lower()

    if plan not in CREDIT_PACKS:
        raise HTTPException(status_code=400, detail="Invalid plan")
    
    if currency not in CREDIT_PACKS[plan]["prices"]:
        currency = "eur"

    user = db.query(Profile).filter(Profile.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    price_id = CREDIT_PACKS[plan]["prices"][currency]

    # 🔒 Use BASE_URL env var; fall back to production domain (NOT localhost)
    # so a missing/misconfigured env never sends real users to localhost.
    base_url = os.getenv("BASE_URL") or "https://myresumematch.com"
    base_url = base_url.rstrip("/")

    session = stripe.checkout.Session.create(
        mode="payment",
        payment_method_types=["card"],
        line_items=[{
            "price": price_id,
            "quantity": 1
        }],
        customer_email=email,
        success_url=f"{base_url}/builder?payment=success&plan={plan}&session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{base_url}/pricing?payment=cancelled",
        metadata={
            "pack_id": plan,
            "email": email,
            "currency": currency
        }
    )

    return {"checkout_url": session.url}





@router.post("/webhook")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")
    webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET")

    if not webhook_secret:
        # Misconfiguration: refuse to process events with no secret configured.
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    try:
        event = stripe.Webhook.construct_event(
            payload,
            sig_header,
            webhook_secret
        )
    except stripe.error.SignatureVerificationError:
        # Return 400 so Stripe knows the event was rejected (security).
        raise HTTPException(status_code=400, detail="Invalid signature")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid payload")

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        metadata = session.get("metadata", {}) or {}

        email = metadata.get("email")
        pack_id = metadata.get("pack_id")
        session_id = session.get("id")

        # Only count fully paid sessions
        payment_status = session.get("payment_status")
        if payment_status and payment_status != "paid":
            return {"status": "not_paid"}

        # Get financial details
        amount_total = (session.get("amount_total") or 0) / 100.0
        currency = session.get("currency", "eur")

        if not email or not pack_id or not session_id:
            return {"status": "ignored"}

        if pack_id not in CREDIT_PACKS:
            return {"status": "invalid pack"}

        # 🔒 Idempotency: if we already processed this checkout session, skip.
        existing = db.query(Payment).filter(
            Payment.stripe_session_id == session_id
        ).first()
        if existing:
            return {"status": "already_processed"}

        user = db.query(Profile).filter(Profile.email == email).first()
        if not user:
            return {"status": "user not found"}

        credits_to_add = CREDIT_PACKS[pack_id]["credits"]

        try:
            # 1. Update user credits
            user.credits = (user.credits or 0) + credits_to_add

            # 2. Record payment history
            new_payment = Payment(
                email=email,
                amount=amount_total,
                currency=currency,
                credits_added=credits_to_add,
                plan_name=pack_id,
                stripe_session_id=session_id
            )
            db.add(new_payment)
            db.commit()
        except Exception:
            db.rollback()
            # Surface 500 so Stripe retries the webhook.
            raise HTTPException(status_code=500, detail="Failed to record payment")

    return {"status": "ok"}
