import asyncio
import logging
import os
import re
from contextlib import asynccontextmanager
from datetime import date, datetime
from typing import Optional
from zoneinfo import ZoneInfo

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from db import Base, SessionLocal, engine, get_db
from models import Antrian, Layanan, utcnow

TZ = ZoneInfo("Asia/Jakarta")
STAFF = {"admin", "petugas"}
PASIEN_URL = os.getenv("PASIEN_URL", "http://pasien-service:8000")
INTERNAL_KEY = os.getenv("INTERNAL_KEY", "dev-internal-key")
SYNC_INTERVAL = int(os.getenv("SYNC_INTERVAL", "30"))
log = logging.getLogger("antrian")

SEED_LAYANAN = [
    ("Poli Anak (Balita)", "A", "balita"),
    ("KIA (Ibu Hamil)", "B", "ibu_hamil"),
    ("Pelayanan Umum", "C", "umum"),
]


def hari_ini() -> date:
    return datetime.now(TZ).date()


def iso(dt: Optional[datetime]):
    return dt.isoformat() + "Z" if dt else None


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        for nama, kode, tipe in SEED_LAYANAN:
            if not db.query(Layanan).filter_by(kode=kode).first():
                db.add(Layanan(nama=nama, kode=kode, tipe=tipe))
        db.commit()
    finally:
        db.close()
    task = asyncio.create_task(retry_loop())
    yield
    task.cancel()


app = FastAPI(title="Antrian Service", lifespan=lifespan)


# ---------- sinkronisasi ke pasien-service ----------
def kirim_ke_pasien(db: Session, a: Antrian, layanan: Layanan) -> bool:
    """Kirim data kunjungan ke pasien-service. Gagal = nomor tetap sah, dicoba lagi nanti."""
    payload = {"antrian_id": a.id, "tanggal": a.tanggal.isoformat(), "jenis": layanan.tipe,
               "nama": a.nama_pasien, "nik": a.nik,
               "tanggal_lahir": a.tanggal_lahir.isoformat() if a.tanggal_lahir else None}
    try:
        r = httpx.post(f"{PASIEN_URL}/internal/kunjungan", json=payload,
                       headers={"X-Internal-Key": INTERNAL_KEY}, timeout=3)
    except httpx.RequestError as e:
        log.warning("pasien-service tidak terjangkau (antrian %s): %s", a.id, e)
        return False
    if r.status_code in (200, 201):
        pass
    elif 400 <= r.status_code < 500 and r.status_code not in (408, 429):
        log.error("pasien-service menolak antrian %s: %s %s", a.id, r.status_code, r.text[:200])
    else:
        log.warning("pasien-service error %s untuk antrian %s", r.status_code, a.id)
        return False
    a.pasien_sinkron = True
    db.commit()
    return True


def kirim_yang_tertunda():
    db = SessionLocal()
    try:
        rows = (db.query(Antrian, Layanan).join(Layanan)
                .filter(Antrian.pasien_sinkron.is_(False)).order_by(Antrian.id).limit(50).all())
        for a, l in rows:
            if not kirim_ke_pasien(db, a, l):
                break  # pasien-service masih bermasalah, coba lagi di putaran berikutnya
    finally:
        db.close()


async def retry_loop():
    while True:
        await asyncio.sleep(SYNC_INTERVAL)
        try:
            await asyncio.to_thread(kirim_yang_tertunda)
        except Exception:
            log.exception("retry sinkronisasi gagal")


# ---------- schemas ----------
class AmbilNomorIn(BaseModel):
    layanan_id: int
    nama_pasien: str = Field(min_length=1, max_length=100)
    nik: Optional[str] = None
    tanggal_lahir: Optional[date] = None

    @field_validator("nama_pasien")
    @classmethod
    def strip_nama(cls, v):
        v = v.strip()
        if not v:
            raise ValueError("Nama wajib diisi")
        return v

    @field_validator("nik")
    @classmethod
    def cek_nik(cls, v):
        if v in (None, ""):
            return None
        if not re.fullmatch(r"\d{16}", v):
            raise ValueError("NIK harus 16 digit angka")
        return v


# ---------- helpers ----------
def require_staff(x_user_role: str = Header(default=""), x_user_id: str = Header(default="")):
    """Gateway mengisi header ini setelah memverifikasi JWT."""
    if x_user_role not in STAFF:
        raise HTTPException(403, "Akses ditolak")
    return int(x_user_id) if x_user_id.isdigit() else None


def menunggu_di_depan(db: Session, a: Antrian) -> int:
    return db.query(Antrian).filter(
        Antrian.layanan_id == a.layanan_id, Antrian.tanggal == a.tanggal,
        Antrian.status == "menunggu", Antrian.nomor < a.nomor).count()


def publik(db: Session, a: Antrian, layanan: Layanan) -> dict:
    """Data aman untuk publik: tanpa nama dan NIK."""
    return {
        "id": a.id, "no_antrian": a.no_antrian, "layanan": layanan.nama,
        "status": a.status, "menunggu_di_depan": menunggu_di_depan(db, a)
        if a.status == "menunggu" else 0,
    }


def staff_view(a: Antrian, layanan: Layanan) -> dict:
    return {
        "id": a.id, "no_antrian": a.no_antrian, "layanan_id": layanan.id,
        "layanan": layanan.nama, "tipe": layanan.tipe, "tanggal": a.tanggal.isoformat(),
        "nama_pasien": a.nama_pasien, "nik": a.nik,
        "tanggal_lahir": a.tanggal_lahir.isoformat() if a.tanggal_lahir else None,
        "status": a.status, "jumlah_panggil": a.jumlah_panggil,
        "created_at": iso(a.created_at), "dipanggil_at": iso(a.dipanggil_at),
        "selesai_at": iso(a.selesai_at),
    }


def get_antrian(db: Session, antrian_id: int):
    row = db.query(Antrian, Layanan).join(Layanan).filter(Antrian.id == antrian_id).first()
    if not row:
        raise HTTPException(404, "Antrian tidak ditemukan")
    return row


# ---------- publik ----------
@app.get("/health")
def health():
    return {"status": "ok", "service": "antrian"}


@app.get("/antrian/layanan")
def daftar_layanan(db: Session = Depends(get_db)):
    rows = db.query(Layanan).filter_by(aktif=True).order_by(Layanan.id).all()
    return [{"id": l.id, "nama": l.nama, "kode": l.kode, "tipe": l.tipe} for l in rows]


@app.post("/antrian", status_code=201)
def ambil_nomor(data: AmbilNomorIn, db: Session = Depends(get_db)):
    layanan = db.get(Layanan, data.layanan_id)
    if not layanan or not layanan.aktif:
        raise HTTPException(404, "Layanan tidak ditemukan")
    if layanan.tipe == "balita":
        if not data.tanggal_lahir:
            raise HTTPException(422, "Tanggal lahir wajib diisi untuk layanan balita")
        if data.tanggal_lahir > hari_ini():
            raise HTTPException(422, "Tanggal lahir tidak boleh di masa depan")

    tanggal = hari_ini()
    for _ in range(8):  # ulangi kalau bentrok nomor dengan pasien lain
        terakhir = db.query(func.max(Antrian.nomor)).filter_by(
            layanan_id=layanan.id, tanggal=tanggal).scalar() or 0
        nomor = terakhir + 1
        a = Antrian(layanan_id=layanan.id, tanggal=tanggal, nomor=nomor,
                    no_antrian=f"{layanan.kode}-{nomor:03d}",
                    nama_pasien=data.nama_pasien, nik=data.nik,
                    tanggal_lahir=data.tanggal_lahir)
        db.add(a)
        try:
            db.commit()
            break
        except IntegrityError:
            db.rollback()
    else:
        raise HTTPException(503, "Gagal mengambil nomor, coba lagi")
    db.refresh(a)
    kirim_ke_pasien(db, a, layanan)   # kalau gagal, nomor tetap jadi dan dikirim ulang otomatis
    return publik(db, a, layanan)


@app.get("/antrian/hari-ini")
def layar_display(db: Session = Depends(get_db)):
    """Untuk layar display: hanya nomor, layanan, status."""
    tgl = hari_ini()
    rows = db.query(Antrian, Layanan).join(Layanan).filter(Antrian.tanggal == tgl).all()
    dipanggil = sorted((r for r in rows if r[0].status == "dipanggil"),
                       key=lambda r: r[0].dipanggil_at or r[0].created_at, reverse=True)
    menunggu = sorted((r for r in rows if r[0].status == "menunggu"), key=lambda r: r[0].id)
    sel = lambda a, l: {"id": a.id, "no_antrian": a.no_antrian, "layanan": l.nama}
    return {
        "tanggal": tgl.isoformat(),
        "dipanggil": [{**sel(a, l), "dipanggil_at": iso(a.dipanggil_at)} for a, l in dipanggil],
        "menunggu": [sel(a, l) for a, l in menunggu],
        "selesai": sum(1 for a, _ in rows if a.status == "selesai"),
    }


# ---------- staff ----------
@app.get("/antrian/ringkasan")
def ringkasan(tanggal: Optional[date] = None, _=Depends(require_staff), db: Session = Depends(get_db)):
    tgl = tanggal or hari_ini()
    rows = (db.query(Layanan.id, Layanan.nama, Antrian.status, func.count(Antrian.id))
            .outerjoin(Antrian, (Antrian.layanan_id == Layanan.id) & (Antrian.tanggal == tgl))
            .group_by(Layanan.id, Antrian.status).all())
    out = {}
    for lid, nama, status, n in rows:
        d = out.setdefault(lid, {"layanan_id": lid, "layanan": nama, "menunggu": 0,
                                 "dipanggil": 0, "selesai": 0, "batal": 0, "total": 0})
        if status:
            d[status] = n
            d["total"] += n
    return {"tanggal": tgl.isoformat(), "per_layanan": list(out.values())}


@app.get("/antrian")
def daftar_antrian(tanggal: Optional[date] = None, status: Optional[str] = None,
                   layanan_id: Optional[int] = None, limit: int = Query(200, le=500),
                   _=Depends(require_staff), db: Session = Depends(get_db)):
    q = db.query(Antrian, Layanan).join(Layanan).filter(Antrian.tanggal == (tanggal or hari_ini()))
    if status:
        q = q.filter(Antrian.status == status)
    if layanan_id:
        q = q.filter(Antrian.layanan_id == layanan_id)
    rows = q.order_by(Antrian.id).limit(limit).all()
    return [staff_view(a, l) for a, l in rows]


def ubah_status(db: Session, antrian_id: int, user_id, dari: set, ke: str):
    a, l = get_antrian(db, antrian_id)
    if a.status not in dari:
        raise HTTPException(409, f"Antrian berstatus '{a.status}', tidak bisa diubah ke '{ke}'")
    a.status = ke
    a.ditangani_oleh = user_id
    if ke == "dipanggil":
        a.jumlah_panggil += 1
        a.dipanggil_at = utcnow()
    elif ke == "selesai":
        a.selesai_at = utcnow()
    db.commit()
    db.refresh(a)
    return staff_view(a, l)


@app.post("/antrian/{antrian_id}/panggil")
def panggil(antrian_id: int, user_id=Depends(require_staff), db: Session = Depends(get_db)):
    # status 'dipanggil' diperbolehkan lagi = panggil ulang
    return ubah_status(db, antrian_id, user_id, {"menunggu", "dipanggil"}, "dipanggil")


@app.post("/antrian/{antrian_id}/selesai")
def selesai(antrian_id: int, user_id=Depends(require_staff), db: Session = Depends(get_db)):
    return ubah_status(db, antrian_id, user_id, {"dipanggil"}, "selesai")


@app.post("/antrian/{antrian_id}/batal")
def batal(antrian_id: int, user_id=Depends(require_staff), db: Session = Depends(get_db)):
    return ubah_status(db, antrian_id, user_id, {"menunggu", "dipanggil"}, "batal")


@app.get("/antrian/{antrian_id}")
def status_antrian(antrian_id: int, db: Session = Depends(get_db)):
    a, l = get_antrian(db, antrian_id)
    return publik(db, a, l)
