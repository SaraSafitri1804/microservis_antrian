from conftest import token


def auth(role="petugas", **kw):
    return {"Authorization": "Bearer " + token(role, **kw)}


def test_rute_publik_tanpa_token(gw):
    assert gw.post("/api/auth/login", json={}).json()["path"] == "/auth/login"
    assert gw.get("/api/antrian/layanan").status_code == 200
    assert gw.post("/api/antrian", json={}).status_code == 200
    assert gw.get("/api/antrian/hari-ini").status_code == 200
    assert gw.get("/api/antrian/5").status_code == 200


def test_rute_staff_tanpa_token_401(gw):
    for method, path in [("GET", "/api/auth/me"), ("GET", "/api/antrian"), ("POST", "/api/antrian/5/panggil"),
                         ("GET", "/api/pasien/balita"), ("GET", "/api/antrian/ringkasan")]:
        assert gw.request(method, path).status_code == 401, path


def test_token_palsu_dan_kedaluwarsa_401(gw):
    assert gw.get("/api/auth/me", headers={"Authorization": "Bearer palsu"}).status_code == 401
    assert gw.get("/api/auth/me", headers=auth(exp=-10)).status_code == 401


def test_pembatasan_role(gw):
    assert gw.post("/api/auth/register", json={}, headers=auth("petugas")).status_code == 403
    assert gw.post("/api/auth/register", json={}, headers=auth("admin")).status_code == 200
    assert gw.get("/api/pasien/statistik", headers=auth("petugas")).status_code == 403
    assert gw.get("/api/pasien/statistik", headers=auth("admin")).status_code == 200
    assert gw.get("/api/pasien/balita", headers=auth("petugas")).status_code == 200
    assert gw.get("/api/antrian", headers=auth("pasien")).status_code == 403


def test_gateway_mengisi_identitas_dari_token(gw):
    h = gw.get("/api/auth/me", headers=auth("petugas", sub="42")).json()["headers"]
    assert h["x-user-id"] == "42" and h["x-user-role"] == "petugas"


def test_header_x_user_dari_luar_tidak_bisa_dipalsukan(gw):
    h = gw.get("/api/antrian", headers={**auth("petugas"), "X-User-Role": "admin"}).json()["headers"]
    assert h["x-user-role"] == "petugas"                                     # diganti dari token
    h = gw.post("/api/antrian", json={}, headers={"X-User-Role": "admin"}).json()["headers"]
    assert "x-user-role" not in h                                           # rute publik: dibuang


def test_endpoint_tidak_dikenal_404(gw):
    assert gw.get("/api/tidak-ada").status_code == 404
    assert gw.post("/api/internal/kunjungan", json={}).status_code == 404   # internal tidak terekspos
    assert gw.delete("/api/auth/login").status_code == 404                  # metode tidak diizinkan


def test_upstream_mati_502(gw):
    gw.state["down"] = True
    assert gw.get("/api/antrian/layanan").status_code == 502
