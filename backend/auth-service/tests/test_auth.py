def login(client, email, pw):
    return client.post("/auth/login", json={"email": email, "password": pw})


def bearer(client, email, pw):
    return {"Authorization": "Bearer " + login(client, email, pw).json()["token"]}


def test_login_berhasil_mengembalikan_token_dan_role(client):
    r = login(client, "admin@test.com", "adminpass123")
    assert r.status_code == 200
    assert r.json()["role"] == "admin" and r.json()["token"]


def test_password_salah_ditolak(client):
    assert login(client, "admin@test.com", "salah").status_code == 401


def test_email_tidak_dikenal_ditolak(client):
    assert login(client, "tidak@ada.com", "apapun123").status_code == 401


def test_password_tidak_tersimpan_polos(client):
    from db import SessionLocal
    from models import User
    db = SessionLocal()
    u = db.query(User).filter_by(email="admin@test.com").one()
    assert "adminpass123" not in u.password_hash and u.password_hash.startswith("$2")
    db.close()


def test_me_butuh_token(client):
    assert client.get("/auth/me").status_code == 401
    assert client.get("/auth/me", headers={"Authorization": "Bearer palsu"}).status_code == 401


def test_me_mengembalikan_user(client):
    r = client.get("/auth/me", headers=bearer(client, "petugas@test.com", "petugaspass123"))
    assert r.status_code == 200 and r.json()["role"] == "petugas"
    assert "password_hash" not in r.json()


def test_register_hanya_admin(client):
    body = {"name": "Baru", "email": "baru@test.com", "password": "password123"}
    petugas = bearer(client, "petugas@test.com", "petugaspass123")
    assert client.post("/auth/register", json=body, headers=petugas).status_code == 403
    assert client.post("/auth/register", json=body).status_code == 401


def test_register_oleh_admin_lalu_bisa_login(client):
    admin = bearer(client, "admin@test.com", "adminpass123")
    body = {"name": "Petugas Dua", "email": "dua@test.com", "password": "password123"}
    assert client.post("/auth/register", json=body, headers=admin).status_code == 201
    assert login(client, "dua@test.com", "password123").json()["role"] == "petugas"
    assert client.post("/auth/register", json=body, headers=admin).status_code == 409  # email dobel


def test_register_password_pendek_ditolak(client):
    admin = bearer(client, "admin@test.com", "adminpass123")
    r = client.post("/auth/register", json={"name": "X", "email": "x@test.com", "password": "pendek"}, headers=admin)
    assert r.status_code == 422
