"""API Gateway: satu-satunya pintu masuk. Cek token JWT + role, lalu teruskan ke service."""
import os
import re
from contextlib import asynccontextmanager

import httpx
import jwt
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret-ganti-di-produksi")
JWT_ALG = "HS256"

UPSTREAMS = {
    "auth": os.getenv("AUTH_URL", "http://auth-service:8000"),
    "antrian": os.getenv("ANTRIAN_URL", "http://antrian-service:8000"),
    "pasien": os.getenv("PASIEN_URL", "http://pasien-service:8000"),
}

STAFF = {"admin", "petugas"}
ADMIN = {"admin"}

# (method, regex path, role yang boleh). None = publik. Aturan pertama yang cocok dipakai.
RULES = [
    ("POST", r"^/api/auth/login$", None),
    ("POST", r"^/api/auth/register$", ADMIN),
    ("GET", r"^/api/auth/me$", STAFF),
    # antrian: pasien boleh ambil nomor dan lihat layar display tanpa login
    ("GET", r"^/api/antrian/layanan$", None),
    ("POST", r"^/api/antrian$", None),
    ("GET", r"^/api/antrian/hari-ini$", None),
    ("GET", r"^/api/antrian/\d+$", None),
    ("*", r"^/api/antrian(/.*)?$", STAFF),
    ("*", r"^/api/pasien(/.*)?$", STAFF),
]

HOP_HEADERS = {"host", "content-length", "connection", "keep-alive", "transfer-encoding", "upgrade"}
RESP_SKIP = {"content-encoding", "content-length", "transfer-encoding", "connection"}


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.client = httpx.AsyncClient(timeout=10)
    yield
    await app.state.client.aclose()


app = FastAPI(title="API Gateway", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


def find_rule(method: str, path: str):
    for m, pattern, roles in RULES:
        if (m == "*" or m == method) and re.match(pattern, path):
            return True, roles
    return False, None


def error(status: int, msg: str):
    return JSONResponse({"detail": msg}, status_code=status)


@app.get("/health")
def health():
    return {"status": "ok", "service": "gateway"}


@app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def proxy(path: str, request: Request):
    full_path = "/api/" + path
    found, roles = find_rule(request.method, full_path)
    if not found:
        return error(404, "Endpoint tidak ditemukan")

    claims = None
    if roles is not None:
        scheme, _, token = request.headers.get("authorization", "").partition(" ")
        if scheme.lower() != "bearer" or not token:
            return error(401, "Login diperlukan")
        try:
            claims = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        except jwt.PyJWTError:
            return error(401, "Token tidak valid atau kedaluwarsa")
        if claims.get("role") not in roles:
            return error(403, "Akses ditolak")

    base = UPSTREAMS.get(path.split("/")[0])
    if not base:
        return error(404, "Service tidak dikenal")

    headers = {
        k: v for k, v in request.headers.items()
        if k.lower() not in HOP_HEADERS and not k.lower().startswith("x-user-")
    }
    if claims:
        headers["X-User-Id"] = str(claims["sub"])
        headers["X-User-Role"] = claims["role"]

    try:
        r = await app.state.client.request(
            request.method, f"{base}/{path}",
            params=request.query_params, content=await request.body(), headers=headers,
        )
    except httpx.RequestError:
        return error(502, "Service tidak dapat dihubungi")

    out = {k: v for k, v in r.headers.items() if k.lower() not in RESP_SKIP}
    return Response(content=r.content, status_code=r.status_code, headers=out)
