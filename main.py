import os
import uvicorn

if __name__ == "__main__":
    env = os.getenv("ENV", "dev")
    reload = env != "prod"

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", 8000)),
        reload=True,
    )
