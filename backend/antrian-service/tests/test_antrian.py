from concurrent.futures import ThreadPoolExecutor

STAFF = {"X-User-Role": "petugas", "X-User-Id": "1"}
UMUM, BALITA, KIA = 3, 1, 2


def ambil(client, layanan_id=UMUM, nama="Tes", **extra):
    return client.post("/antrian", json={"layanan_id": layanan_id, "nama_pasien": nama, **extra})


def urut(no):
    return int(no.split("-")[1])


def test_layanan_awal_tersedia(client):
    data = client.get("/antrian/layanan").json()
    assert [l["kode"] for l in data] == ["A", "B", "C"]
    assert data[0]["tipe"] == "balita"


def test_nomor_berurutan_dan_terpisah_per_layanan(client):
    a = ambil(client, UMUM).json()["no_antrian"]
    b = ambil(client, UMUM).json()["no_antrian"]
    k = ambil(client, KIA).json()["no_antrian"]
    assert a.startswith("C-") and urut(b) == urut(a) + 1
    assert k.startswith("B-")


def test_20_pasien_bersamaan_tidak_dapat_nomor_dobel(client):
    with ThreadPoolExecutor(10) as ex:
        hasil = list(ex.map(lambda i: ambil(client, UMUM, f"P{i}"), range(20)))
    assert all(r.status_code == 201 for r in hasil)
    nomor = [r.json()["no_antrian"] for r in hasil]
    assert len(set(nomor)) == 20


def test_validasi_input(client):
    assert ambil(client, BALITA, "Budi").status_code == 422                       # balita wajib tgl lahir
    assert ambil(client, BALITA, "Budi", tanggal_lahir="2999-01-01").status_code == 422
    assert ambil(client, UMUM, "Ani", nik="123").status_code == 422
    assert ambil(client, UMUM, "   ").status_code == 422
    assert ambil(client, 999, "Ani").status_code == 404


def test_data_publik_tidak_membocorkan_nama_dan_nik(client):
    ambil(client, UMUM, "NamaRahasiaXyz", nik="3201234567890009")
    teks = client.get("/antrian/hari-ini").text
    assert "NamaRahasiaXyz" not in teks and "3201234567890009" not in teks
    r = ambil(client, UMUM, "Lain").json()
    detail = client.get(f"/antrian/{r['id']}").text
    assert "Lain" not in detail and "nik" not in detail


def test_endpoint_staff_butuh_role(client):
    assert client.get("/antrian").status_code == 403
    assert client.get("/antrian/ringkasan").status_code == 403
    assert client.post("/antrian/1/panggil").status_code == 403
    assert client.get("/antrian", headers={"X-User-Role": "pasien"}).status_code == 403
    assert client.get("/antrian", headers=STAFF).status_code == 200


def test_alur_status_panggil_selesai(client):
    t = ambil(client, UMUM, "Alur").json()
    i = t["id"]
    assert client.post(f"/antrian/{i}/selesai", headers=STAFF).status_code == 409   # belum dipanggil
    r = client.post(f"/antrian/{i}/panggil", headers=STAFF).json()
    assert r["status"] == "dipanggil" and r["jumlah_panggil"] == 1
    assert client.post(f"/antrian/{i}/panggil", headers=STAFF).json()["jumlah_panggil"] == 2  # panggil ulang
    assert client.post(f"/antrian/{i}/selesai", headers=STAFF).json()["status"] == "selesai"
    assert client.post(f"/antrian/{i}/batal", headers=STAFF).status_code == 409     # sudah selesai


def test_display_menampilkan_yang_dipanggil(client):
    t = ambil(client, UMUM, "Disp").json()
    client.post(f"/antrian/{t['id']}/panggil", headers=STAFF)
    d = client.get("/antrian/hari-ini").json()
    item = next(x for x in d["dipanggil"] if x["id"] == t["id"])
    assert item["dipanggil_at"]          # dipakai layar display untuk mendeteksi panggil ulang


def test_ringkasan_per_layanan(client):
    r = client.get("/antrian/ringkasan", headers=STAFF).json()
    assert len(r["per_layanan"]) == 3
    assert all(s["total"] == s["menunggu"] + s["dipanggil"] + s["selesai"] + s["batal"] for s in r["per_layanan"])


def test_pasien_service_mati_nomor_tetap_jadi_lalu_dikirim_ulang(client, monkeypatch):
    import httpx
    import main
    from db import SessionLocal
    from models import Antrian

    r = ambil(client, UMUM, "Sinkron")                # pasien-service tidak ada -> gagal kirim
    assert r.status_code == 201
    db = SessionLocal()
    assert db.get(Antrian, r.json()["id"]).pasien_sinkron is False
    db.close()

    terkirim = []

    class Resp:
        status_code, text = 201, ""

    def palsu(url, json, headers, timeout):
        terkirim.append((url, json, headers))
        return Resp()

    monkeypatch.setattr(main.httpx, "post", palsu)
    main.kirim_yang_tertunda()                        # simulasi retry otomatis
    db = SessionLocal()
    assert db.get(Antrian, r.json()["id"]).pasien_sinkron is True
    assert db.query(Antrian).filter_by(pasien_sinkron=False).count() == 0
    db.close()
    url, payload, headers = next(x for x in terkirim if x[1]["antrian_id"] == r.json()["id"])
    assert url.endswith("/internal/kunjungan") and headers["X-Internal-Key"] == "kunci-tes"
    assert payload["jenis"] == "umum" and payload["nama"] == "Sinkron"


def test_payload_balita_membawa_tanggal_lahir(client, monkeypatch):
    import main
    dikirim = []

    class Resp:
        status_code, text = 201, ""

    monkeypatch.setattr(main.httpx, "post", lambda url, json, headers, timeout: dikirim.append(json) or Resp())
    ambil(client, BALITA, "Bayi", tanggal_lahir="2024-05-01")
    assert dikirim[-1]["jenis"] == "balita" and dikirim[-1]["tanggal_lahir"] == "2024-05-01"
