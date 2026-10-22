import os

os.environ["JWT_SECRET"] = "rahasia-tes-1234567890-rahasia-tes"
import httpx
import jwt
import pytest
import time
from fastapi.testclient import TestClient

SECRET = os.environ["JWT_SECRET"]


def token(role="petugas", sub="7", exp=3600):
    return jwt.encode({"sub": sub, "role": role, "exp": time.time() + exp}, SECRET, algorithm="HS256")


@pytest.fixture
def gw():
    """Gateway dengan upstream palsu: mengembalikan path dan header yang diterimanya."""
    from main import app
    state = {"down": False}

    def handler(request: httpx.Request):
        if state["down"]:
            raise httpx.ConnectError("mati")
        return httpx.Response(200, json={"path": request.url.path,
                                         "headers": {k.lower(): v for k, v in request.headers.items()}})

    with TestClient(app) as c:
        app.state.client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
        c.state = state
        yield c
