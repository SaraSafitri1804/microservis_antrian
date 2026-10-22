import itertools

KEY = {"X-Internal-Key": "kunci-tes"}
STAFF = {"X-User-Role": "petugas"}
ADMIN = {"X-User-Role": "admin"}
_id = itertools.count(1000)


def kirim(client, jenis="balita", nama="Budi", nik=None, lahir="2024-05-01", antrian_id=None, headers=KEY):
    from main import hari_ini
    body = {"antrian_id": antrian_id or next(_id), "tanggal": hari_ini().isoformat(),
            "jenis": jenis, "nama": nama, "nik": nik, "tanggal_lahir": lahir}
    return client.post("/internal/kunjungan", json=body, headers=headers)


def test_endpoint_internal_butuh_kunci(client):
    assert kirim(client, headers={}).status_code == 403
    assert kirim(client, headers={"X-Internal-Key": "salah"}).status_code == 403
    assert kirim(client).status_code == 201


def test_kirim_ulang_idempoten(client):
    a = kirim(client, nama="Idem", antrian_id=1)
    b = kirim(client, nama="Idem", antrian_id=1)
    assert a.status_code == 201 and b.status_code == 200
    assert a.json()["id"] == b.json()["id"]


def test_balita_yang_sama_tidak_dobel_via_nik(client):
    kirim(client, nama="Kembar Satu", nik="3201000000000011")
    kirim(client, nama="Kembar Satu (typo)", nik="3201000000000011")
    hasil = client.get("/pasien/balita?q=Kembar", headers=STAFF).json()
    assert len(hasil) == 1 and hasil[0]["jumlah_kunjungan"] == 2


def test_ibu_hamil_dicocokkan_lewat_nama_jika_tanpa_nik(client):
    kirim(client, jenis="ibu_hamil", nama="Ibu Rina", lahir=None)
    kirim(client, jenis="ibu_hamil", nama="ibu rina", lahir=None)
    hasil = client.get("/pasien/ibu-hamil?q=rina", headers=STAFF).json()
    assert len(hasil) == 1 and hasil[0]["jumlah_kunjungan"] == 2


def test_balita_wajib_tanggal_lahir_dan_nik_valid(client):
    assert kirim(client, lahir=None).status_code == 422
    assert kirim(client, nik="abc").status_code == 422


def test_umum_hanya_mencatat_kunjungan(client):
    r = kirim(client, jenis="umum", nama="Pak Umum", lahir=None)
    assert r.status_code == 201 and r.json()["balita_id"] is None and r.json()["ibu_hamil_id"] is None


def test_endpoint_staff_butuh_role(client):
    for path in ["/pasien/balita", "/pasien/ibu-hamil", "/pasien/kunjungan"]:
        assert client.get(path).status_code == 403
        assert client.get(path, headers=STAFF).status_code == 200


def test_nik_disamarkan_di_daftar(client):
    kirim(client, nama="Nik Tersamar", nik="3201000000000022")
    p = client.get("/pasien/balita?q=Tersamar", headers=STAFF).json()[0]
    assert p["nik"] == "************0022" and "3201000000000022" not in str(p)


def test_umur_bulan_dihitung(client):
    from main import umur_bulan
    from datetime import date
    assert umur_bulan(date(2024, 5, 15), date(2026, 5, 14)) == 23
    assert umur_bulan(date(2024, 5, 15), date(2026, 5, 15)) == 24


def test_statistik_hanya_admin(client):
    assert client.get("/pasien/statistik").status_code == 403
    assert client.get("/pasien/statistik", headers=STAFF).status_code == 403
    d = client.get("/pasien/statistik", headers=ADMIN).json()
    assert d["total_balita"] >= 1 and d["total_kunjungan"] >= d["kunjungan_hari_ini"] >= 1
    assert sum(x["jumlah"] for x in d["balita_per_umur"]) == d["total_balita"]
    assert len(d["kunjungan_per_bulan"]) == 6
