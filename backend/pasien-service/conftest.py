import os
import tempfile

_d = tempfile.mkdtemp()
os.environ.update(DATABASE_URL=f"sqlite:///{_d}/test.db", INTERNAL_KEY="kunci-tes")
import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="session")
def client():
    from main import app
    with TestClient(app) as c:
        yield c
