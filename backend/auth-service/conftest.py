import os
import tempfile

_d = tempfile.mkdtemp()
os.environ.update(
    DATABASE_URL=f"sqlite:///{_d}/test.db", JWT_SECRET="rahasia-tes-1234567890-rahasia-tes",
    ADMIN_EMAIL="admin@test.com", ADMIN_PASSWORD="adminpass123",
    PETUGAS_EMAIL="petugas@test.com", PETUGAS_PASSWORD="petugaspass123",
)
import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="session")
def client():
    from main import app
    with TestClient(app) as c:
        yield c
