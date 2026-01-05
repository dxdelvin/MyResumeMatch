# app/dependencies.py
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
import os

# Security scheme (allow graceful dev fallback when missing token)
bearer = HTTPBearer(description="Google ID Token (JWT)", auto_error=False)


def _dev_fallback(reason: str) -> str:
    # Local dev convenience: default to admin email when auth is unavailable
    email = os.getenv("DEV_ADMIN_EMAIL", "dxdelvin@gmail.com").lower()
    print(f"[dev-auth-fallback] {reason}. Using {email}")
    return email


def get_verified_email(credentials: HTTPAuthorizationCredentials = Depends(bearer)) -> str:
    env = os.getenv("ENV", "dev")
    client_id = os.getenv("GOOGLE_CLIENT_ID")

    # Missing auth header
    if not credentials:
        if env != "prod":
            return _dev_fallback("missing credentials")
        raise HTTPException(status_code=401, detail="Missing authentication token")

    token = credentials.credentials

    # Client ID not configured
    if not client_id:
        print("CRITICAL: GOOGLE_CLIENT_ID is not set in environment variables!")
        if env != "prod":
            return _dev_fallback("GOOGLE_CLIENT_ID not set")
        raise HTTPException(status_code=500, detail="Server Configuration Error")

    try:
        idinfo = id_token.verify_oauth2_token(
            token, google_requests.Request(), client_id, clock_skew_in_seconds=10
        )
        return idinfo["email"].lower()
    except ValueError as e:
        print(f"Token validation failed: {e}")
        if env != "prod":
            return _dev_fallback(f"token invalid: {e}")
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")
    except Exception as e:
        print(f"Unexpected auth error: {e}")
        if env != "prod":
            return _dev_fallback(f"unexpected auth error: {e}")
        raise HTTPException(status_code=401, detail="Authentication failed")