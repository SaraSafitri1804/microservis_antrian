import os
from datetime import datetime, timedelta, timezone
import bcrypt
import jwt

JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret-ganti-di-produksi")
JWT_ALG = "HS256"
TOKEN_HOURS = 8


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


def create_token(user) -> str:
    payload = {
        "sub": str(user.id),
        "name": user.name,
        "role": user.role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=TOKEN_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def decode_token(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
