import os
from contextlib import asynccontextmanager
from typing import Literal

import jwt
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from db import Base, SessionLocal, engine, get_db
from models import User
from security import create_token, decode_token, hash_password, verify_password


def seed_users():
    """Buat akun awal (admin & petugas) kalau belum ada."""
    seeds = [
        ("Admin Posyandu", "ADMIN_EMAIL", "ADMIN_PASSWORD", "admin"),
        ("Petugas 1", "PETUGAS_EMAIL", "PETUGAS_PASSWORD", "petugas"),
    ]
    db = SessionLocal()
    try:
        for name, env_email, env_pw, role in seeds:
            email, pw = os.getenv(env_email), os.getenv(env_pw)
            if not email or not pw:
                continue
            if not db.query(User).filter_by(email=email).first():
                db.add(User(name=name, email=email, password_hash=hash_password(pw), role=role))
        db.commit()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    seed_users()
    yield


app = FastAPI(title="Auth Service", lifespan=lifespan)


class LoginIn(BaseModel):
    email: str
    password: str


class RegisterIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: str = Field(min_length=3, max_length=150)
    password: str = Field(min_length=8, max_length=72)
    role: Literal["admin", "petugas"] = "petugas"


def user_out(u: User) -> dict:
    return {"id": u.id, "name": u.name, "email": u.email, "role": u.role}


def current_user(authorization: str = Header(default=""), db: Session = Depends(get_db)) -> User:
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(401, "Token tidak ditemukan")
    try:
        claims = decode_token(token)
    except jwt.PyJWTError:
        raise HTTPException(401, "Token tidak valid atau kedaluwarsa")
    user = db.get(User, int(claims["sub"]))
    if not user:
        raise HTTPException(401, "User tidak ditemukan")
    return user


@app.get("/health")
def health():
    return {"status": "ok", "service": "auth"}


@app.post("/auth/login")
def login(data: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter_by(email=data.email).first()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(401, "Email atau password salah")
    return {"token": create_token(user), "role": user.role, "user": user_out(user)}


@app.get("/auth/me")
def me(user: User = Depends(current_user)):
    return user_out(user)


@app.post("/auth/register", status_code=201)
def register(data: RegisterIn, admin: User = Depends(current_user), db: Session = Depends(get_db)):
    if admin.role != "admin":
        raise HTTPException(403, "Hanya admin yang boleh menambah akun")
    if db.query(User).filter_by(email=data.email).first():
        raise HTTPException(409, "Email sudah terdaftar")
    user = User(name=data.name, email=data.email,
                password_hash=hash_password(data.password), role=data.role)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user_out(user)
