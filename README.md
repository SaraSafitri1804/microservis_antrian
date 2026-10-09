# Sistem Informasi Antrian dan Pelayanan Posyandu (Microservice, FastAPI)

## Arsitektur
Frontend -> API Gateway (:8080) -> auth-service | antrian-service | pasien-service
(masing-masing service punya database sendiri)

| Service | Status | Fungsi |
|---|---|---|
| gateway | selesai | routing, cek JWT dan role |
| auth-service | selesai | login, JWT, akun admin/petugas |
| antrian-service | tahap 3 | layanan, ambil nomor, panggil, selesai, display |
| pasien-service | tahap 4 | balita, ibu hamil, kunjungan, statistik |

## Menjalankan
```bash
cp .env.example .env     # lalu ganti JWT_SECRET dan password
docker compose up --build
```
Gateway: http://localhost:8080 (cek `GET /health`).
Akun awal dibuat dari nilai `ADMIN_*` dan `PETUGAS_*` di `.env`.

## Endpoint (lewat gateway)
| Method | Path | Akses |
|---|---|---|
| POST | /api/auth/login | publik |
| GET | /api/auth/me | admin, petugas |
| POST | /api/auth/register | admin |
| GET | /api/antrian/layanan | publik |
| POST | /api/antrian | publik (ambil nomor) |
| GET | /api/antrian/hari-ini | publik (layar display) |
| GET | /api/antrian/{id} | publik |
| * | /api/antrian/... lainnya | admin, petugas |
| * | /api/pasien/... | admin, petugas |

Contoh login:
```bash
curl -X POST localhost:8080/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@posyandu.com","password":"<password di .env>"}'
```
Respons: `{ "token": "...", "role": "admin", "user": {...} }`.
Kirim token sebagai header `Authorization: Bearer <token>`.

## Kontrak untuk service berikutnya
Gateway meneruskan header `X-User-Id` dan `X-User-Role` (hasil verifikasi token)
ke service. Service di belakang gateway cukup membaca header itu, tidak perlu
memeriksa JWT lagi. Service tidak boleh dibuka langsung ke luar (hanya `expose`,
tidak `ports`).
