# Sistem Informasi Antrian dan Pelayanan Posyandu (Microservice, FastAPI)

## Arsitektur
Frontend (Nginx, :3000) -> API Gateway (:8080) -> auth-service | antrian-service | pasien-service
(masing-masing service punya database sendiri)

| Service | Status | Fungsi |
|---|---|---|
| frontend | selesai | HTML + JS: ambil nomor, display, login, petugas, admin |
| gateway | selesai | routing, cek JWT dan role |
| auth-service | selesai | login, JWT, akun admin/petugas |
| antrian-service | selesai | layanan, ambil nomor, panggil, selesai, display |
| pasien-service | selesai | data balita dan ibu hamil, kunjungan, statistik |

## Menjalankan
```bash
cp .env.example .env     # lalu ganti JWT_SECRET dan password
docker compose up --build
```
Aplikasi (frontend): http://localhost:3000
Gateway langsung: http://localhost:8080 (cek `GET /health`).
Akun awal dibuat dari nilai `ADMIN_*` dan `PETUGAS_*` di `.env`.

## Endpoint (lewat gateway)
| Method | Path | Akses | Keterangan |
|---|---|---|---|
| POST | /api/auth/login | publik | mengembalikan token + role |
| GET | /api/auth/me | admin, petugas | |
| POST | /api/auth/register | admin | tambah akun |
| GET | /api/antrian/layanan | publik | daftar layanan |
| POST | /api/antrian/layanan | admin | tambah layanan |
| POST | /api/antrian | publik | ambil nomor |
| GET | /api/antrian/hari-ini | publik | layar display (belum selesai) |
| GET | /api/antrian/{id} | publik | tiket antrian |
| GET | /api/antrian | admin, petugas | daftar lengkap + NIK |
| POST | /api/antrian/{id}/panggil | admin, petugas | |
| POST | /api/antrian/{id}/selesai | admin, petugas | |
| GET | /api/pasien/balita?q= | admin, petugas |
| GET | /api/pasien/ibu-hamil?q= | admin, petugas |
| GET | /api/pasien/kunjungan?tanggal=&jenis= | admin, petugas |
| GET | /api/pasien/statistik | admin | tahap 4 |

Body ambil nomor (`POST /api/antrian`):
```json
{ "nama_pasien": "Siti Aminah", "nik": "3275010101010001",
  "tanggal_lahir": "2024-03-10", "layanan_id": 1 }
```
Respons publik tidak memuat NIK, dan nama disamarkan ("Siti A.").
Filter daftar petugas: `?tanggal=2026-10-09&status=aktif|menunggu|dipanggil|selesai|semua&layanan_id=1`.
Nomor antrian dihitung per layanan per hari (zona waktu Asia/Jakarta): 001, 002, ...

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

## Catatan antrian-service
- Nomor antrian dihitung per layanan per hari (001, 002, ...), memakai zona waktu Asia/Jakarta.
  Database menolak nomor kembar, jadi aman kalau banyak pasien mengambil nomor bersamaan.
- Layar display dan tiket publik hanya menampilkan nama depan. NIK tidak disimpan di antrian-service
  (data identitas nanti ada di pasien-service).
- Jenis layanan (`balita`, `ibu_hamil`, `umum`) disimpan eksplisit di tabel `layanan`,
  dipakai pada tahap integrasi ke pasien-service.
- Status: menunggu -> dipanggil -> selesai.

## Kontrak API antrian (untuk frontend)
Semua lewat gateway (`/api/...`). Endpoint staff butuh header `Authorization: Bearer <token>`.

**Publik**
- `GET /api/antrian/layanan` -> `[{id, nama, kode, tipe}]` (tipe: `balita` | `ibu_hamil` | `umum`)
- `POST /api/antrian` body `{layanan_id, nama_pasien, nik?, tanggal_lahir?}` -> `{id, no_antrian, layanan, status, menunggu_di_depan}`
  - layanan `balita` wajib `tanggal_lahir` (format `YYYY-MM-DD`); `nik` opsional, 16 digit
- `GET /api/antrian/{id}` -> status satu antrian (untuk polling di HP pasien)
- `GET /api/antrian/hari-ini` -> `{tanggal, dipanggil: [...], menunggu: [...], selesai}` (layar display, tanpa nama dan NIK)

**Staff (admin, petugas)**
- `GET /api/antrian?tanggal=&status=&layanan_id=` -> daftar lengkap (dengan nama dan NIK)
- `GET /api/antrian/ringkasan?tanggal=` -> jumlah per status per layanan
- `POST /api/antrian/{id}/panggil` (boleh diulang = panggil ulang)
- `POST /api/antrian/{id}/selesai`
- `POST /api/antrian/{id}/batal`

Alur status: `menunggu -> dipanggil -> selesai` (atau `batal`). Perubahan yang tidak valid mengembalikan 409.
Nomor antrian: kode layanan + urutan harian, contoh `A-003`, reset tiap hari (zona waktu Asia/Jakarta).

## Frontend
HTML, CSS, dan JavaScript biasa di `frontend/public`, disajikan Nginx. Nginx meneruskan `/api/*` ke gateway,
jadi tidak ada masalah CORS dan frontend cukup memanggil path relatif (`/api/...`).

| Halaman | Akses | Fungsi |
|---|---|---|
| index.html | publik | ambil nomor, pantau status tiket (polling 5 detik) |
| display.html | publik | layar antrian + suara pemanggilan (klik sekali untuk aktifkan suara) |
| login.html | publik | login petugas/admin |
| petugas.html | petugas, admin | ringkasan, daftar antrian, panggil/selesai/batal |
| pasien.html | petugas, admin | daftar balita / ibu hamil, cari nama atau NIK |
| admin.html | admin | ringkasan dan laporan per tanggal, statistik, unduh CSV, tambah akun |

Catatan: semua teks dari server dirender lewat `textContent` (bukan `innerHTML`) untuk mencegah XSS,
dan Nginx memakai Content-Security-Policy `default-src 'self'` (tidak boleh ada inline script/style).
Panggil ulang mengubah `dipanggil_at`, itulah yang dideteksi layar display untuk mengumumkan ulang.

## Komunikasi antar service (antrian -> pasien)
Saat pasien mengambil nomor, antrian-service menyimpan antrian lebih dulu, lalu memanggil
`POST /internal/kunjungan` di pasien-service (lewat jaringan Docker, bukan lewat gateway).

- Endpoint `/internal/*` dilindungi header `X-Internal-Key` (nilai `INTERNAL_KEY` di `.env`) dan tidak
  dipetakan di gateway, jadi tidak bisa diakses dari luar.
- Kalau pasien-service sedang mati, pasien **tetap dapat nomor**. Antrian ditandai `pasien_sinkron = false`
  dan dikirim ulang otomatis tiap 30 detik (eventual consistency).
- Pengiriman idempoten: kunci `antrian_id` unik di tabel kunjungan, jadi kirim ulang tidak membuat data dobel.
- Pasien yang sama tidak dobel: balita dicocokkan lewat NIK (atau nama + tanggal lahir), ibu hamil lewat
  NIK (atau nama). Dua orang beda dengan nama sama dan tanpa NIK bisa tergabung, jadi isi NIK kalau ada.

## Catatan pengembangan
- Skema database dibuat saat service pertama jalan (tanpa migrasi). Kalau sebelumnya sudah menjalankan
  versi lama, reset data dulu: `docker compose down -v`.
- Statistik tersedia untuk admin saja. NIK di daftar pasien selalu disamarkan.

## Pengujian otomatis
38 tes (pytest) untuk semua service. Tes memakai database sementara, jadi tidak menyentuh data asli
dan tidak perlu Docker.
```bash
python -m venv .venv && source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
./run_tests.sh                                        # Windows: jalankan "python -m pytest" di tiap folder backend/<service>
```
| Service | Tes | Yang dijaga |
|---|---|---|
| auth-service | 9 | login, password ter-hash, token, register hanya admin, validasi |
| antrian-service | 11 | nomor berurutan, 20 pasien bersamaan tanpa nomor dobel, validasi, data publik tanpa nama/NIK, alur status, retry ke pasien-service |
| pasien-service | 10 | kunci internal, pengiriman idempoten, pasien tidak dobel, NIK tersamar, statistik hanya admin |
| gateway | 8 | rute publik/staff, role, token palsu/kedaluwarsa, header `X-User-*` tidak bisa dipalsukan, upstream mati (502) |
