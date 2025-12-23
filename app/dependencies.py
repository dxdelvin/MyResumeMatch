# app/dependencies.py
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
import os

# Security scheme
bearer = HTTPBearer(description="Google ID Token (JWT)")

def get_verified_email(credentials: HTTPAuthorizationCredentials = Depends(bearer)) -> str:
    token = credentials.credentials
    
    # 1. Check if Client ID is actually loaded
    client_id = os.getenv("GOOGLE_CLIENT_ID")
    if not client_id:
        print("❌ CRITICAL ERROR: GOOGLE_CLIENT_ID is not set in environment variables!")
        raise HTTPException(status_code=500, detail="Server Configuration Error")

    try:
        # 2. Verify the token
        idinfo = id_token.verify_oauth2_token(
            token, google_requests.Request(), client_id
        )
        return idinfo["email"]
        
    except ValueError as e:
        # 3. Print the specific error (e.g. "Token expired", "Audience mismatch")
        print(f"❌ Token Validation Failed: {e}")
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")
    except Exception as e:
        print(f"❌ Unexpected Auth Error: {e}")
        raise HTTPException(status_code=401, detail="Authentication failed")