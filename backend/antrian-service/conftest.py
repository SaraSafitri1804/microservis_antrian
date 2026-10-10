import os
import tempfile

_d = tempfile.mkdtemp()
os.environ.update(
    DATABASE_URL=f"sqlite:///{_d}/test.db",
    PASIEN_URL="http://127.0.0.1:9",   # sengaja tidak ada: pasien-service dianggap mati
    INTERNAL_KEY="kunci-tes", SYNC_INTERVAL="3600",
)
import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="session")
def client():
    from main import app
    with TestClient(app) as c:
        yield c
