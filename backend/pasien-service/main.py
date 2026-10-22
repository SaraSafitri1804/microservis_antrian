import os
import re
import secrets
from contextlib import asynccontextmanager
from datetime import date, datetime
from typing import Literal, Optional
from zoneinfo import ZoneInfo

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from db import Base, engine, get_db
from models import Balita, IbuHamil, Kunjungan

TZ = ZoneInfo("Asia/Jakarta")
INTERNAL_KEY = os.getenv("INTERNAL_KEY", "dev-internal-key")


def hari_ini() -> date:
    return datetime.now(TZ).date()


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="Pasien Service", lifespan=lifespan)


# ---------- akses ----------
def require_staff(x_user_role: str = Header(default="")):
    if x_user_role not in {"admin", "petugas"}:
        raise HTTPException(403, "Akses ditolak")


def require_admin(x_user_role: str = Header(default="")):
    if x_user_role != "admin":
        raise HTTPException(403, "Hanya admin")


def require_internal(x_internal_key: str = Header(default="")):
    """Hanya service lain (antrian-service) yang tahu kunci ini. Tidak lewat gateway."""
    if not secrets.compare_digest(x_internal_key, INTERNAL_KEY):
        raise HTTPException(403, "Akses ditolak")


# ---------- schema ----------
class KunjunganIn(BaseModel):
    antrian_id: int
    tanggal: date
    jenis: Literal["balita", "ibu_hamil", "umum"]
    nama: str = Field(min_length=1, max_length=100)
    nik: Optional[str] = None
    tanggal_lahir: Optional[date] = None

    @field_validator("nik")
    @classmethod
    def cek_nik(cls, v):
        if v in (None, ""):
            return None
        if not re.fullmatch(r"\d{16}", v):
            raise ValueError("NIK harus 16 digit angka")
        return v


# ---------- helper ----------
def umur_bulan(lahir: date, hari: date) -> int:
    return (hari.year - lahir.year) * 12 + hari.month - lahir.month - (1 if hari.day < lahir.day else 0)


def mask_nik(nik: Optional[str]) -> Optional[str]:
    return "*" * 12 + nik[-4:] if nik else None


def cari_atau_buat(db: Session, model, nik, nama, lahir):
    """Pasien yang sama jangan dobel: cocokkan NIK, kalau tidak ada NIK pakai nama (+ tgl lahir)."""
    q = db.query(model)
    if nik:
        found = q.filter(model.nik == nik).first()
    else:
        q = q.filter(func.lower(model.nama) == nama.lower())
        if lahir:
            q = q.filter(model.tanggal_lahir == lahir)
        found = q.first()
    if found:
        if nik and not found.nik:
            found.nik = nik
        return found
    obj = model(nik=nik, nama=nama, tanggal_lahir=lahir)
    db.add(obj)
    db.flush()
    return obj


def kunjungan_out(k: Kunjungan) -> dict:
    return {"id": k.id, "antrian_id": k.antrian_id, "tanggal": k.tanggal.isoformat(),
            "jenis": k.jenis, "nama_pasien": k.nama_pasien,
            "balita_id": k.balita_id, "ibu_hamil_id": k.ibu_hamil_id}


# ---------- internal (dipanggil antrian-service) ----------
@app.get("/health")
def health():
    return {"status": "ok", "service": "pasien"}


@app.post("/internal/kunjungan", status_code=201)
def catat_kunjungan(data: KunjunganIn, response: Response, _=Depends(require_internal),
                    db: Session = Depends(get_db)):
    ada = db.query(Kunjungan).filter_by(antrian_id=data.antrian_id).first()
    if ada:                       # sudah pernah dikirim (retry): jangan dobel
        response.status_code = 200
        return kunjungan_out(ada)
    if data.jenis == "balita" and not data.tanggal_lahir:
        raise HTTPException(422, "Tanggal lahir wajib untuk balita")
    try:
        balita_id = ibu_id = None
        if data.jenis == "balita":
            balita_id = cari_atau_buat(db, Balita, data.nik, data.nama, data.tanggal_lahir).id
        elif data.jenis == "ibu_hamil":
            ibu_id = cari_atau_buat(db, IbuHamil, data.nik, data.nama, data.tanggal_lahir).id
        k = Kunjungan(antrian_id=data.antrian_id, tanggal=data.tanggal, jenis=data.jenis,
                      balita_id=balita_id, ibu_hamil_id=ibu_id, nama_pasien=data.nama)
        db.add(k)
        db.commit()
    except IntegrityError:        # dua request bersamaan untuk antrian yang sama
        db.rollback()
        response.status_code = 200
        return kunjungan_out(db.query(Kunjungan).filter_by(antrian_id=data.antrian_id).one())
    db.refresh(k)
    return kunjungan_out(k)


# ---------- staff ----------
def daftar_pasien(db, model, kunjungan_col, q, limit, dengan_umur):
    query = db.query(model)
    if q:
        like = f"%{q.strip().lower()}%"
        query = query.filter(func.lower(model.nama).like(like) | model.nik.like(like))
    rows = query.order_by(model.nama).limit(limit).all()
    jml = dict(db.query(kunjungan_col, func.count(Kunjungan.id))
               .filter(kunjungan_col.in_([r.id for r in rows])).group_by(kunjungan_col).all()) if rows else {}
    today = hari_ini()
    return [{"id": r.id, "nama": r.nama, "nik": mask_nik(r.nik),
             "tanggal_lahir": r.tanggal_lahir.isoformat() if r.tanggal_lahir else None,
             "umur_bulan": umur_bulan(r.tanggal_lahir, today) if dengan_umur and r.tanggal_lahir else None,
             "jumlah_kunjungan": jml.get(r.id, 0)} for r in rows]


@app.get("/pasien/balita")
def list_balita(q: Optional[str] = None, limit: int = Query(200, le=500),
                _=Depends(require_staff), db: Session = Depends(get_db)):
    return daftar_pasien(db, Balita, Kunjungan.balita_id, q, limit, True)


@app.get("/pasien/ibu-hamil")
def list_ibu_hamil(q: Optional[str] = None, limit: int = Query(200, le=500),
                   _=Depends(require_staff), db: Session = Depends(get_db)):
    return daftar_pasien(db, IbuHamil, Kunjungan.ibu_hamil_id, q, limit, False)


@app.get("/pasien/kunjungan")
def list_kunjungan(tanggal: Optional[date] = None, jenis: Optional[str] = None,
                   limit: int = Query(200, le=500), _=Depends(require_staff),
                   db: Session = Depends(get_db)):
    q = db.query(Kunjungan).filter(Kunjungan.tanggal == (tanggal or hari_ini()))
    if jenis:
        q = q.filter(Kunjungan.jenis == jenis)
    return [kunjungan_out(k) for k in q.order_by(Kunjungan.id).limit(limit).all()]


# ---------- admin ----------
@app.get("/pasien/statistik")
def statistik(_=Depends(require_admin), db: Session = Depends(get_db)):
    today = hari_ini()
    kelompok = {"0-11 bulan": 0, "12-23 bulan": 0, "24-59 bulan": 0, "60 bulan ke atas": 0}
    for (lahir,) in db.query(Balita.tanggal_lahir).all():
        m = umur_bulan(lahir, today)
        key = "0-11 bulan" if m < 12 else "12-23 bulan" if m < 24 else "24-59 bulan" if m < 60 else "60 bulan ke atas"
        kelompok[key] += 1

    bulan, y, m = [], today.year, today.month
    for _i in range(6):
        bulan.append(f"{y}-{m:02d}")
        m -= 1
        if m == 0:
            m, y = 12, y - 1
    bulan.reverse()
    per = {b: {"bulan": b, "balita": 0, "ibu_hamil": 0, "umum": 0} for b in bulan}
    awal = date(int(bulan[0][:4]), int(bulan[0][5:]), 1)
    for tgl, jenis in db.query(Kunjungan.tanggal, Kunjungan.jenis).filter(Kunjungan.tanggal >= awal):
        per[tgl.strftime("%Y-%m")][jenis] += 1

    return {
        "total_balita": db.query(Balita).count(),
        "total_ibu_hamil": db.query(IbuHamil).count(),
        "total_kunjungan": db.query(Kunjungan).count(),
        "kunjungan_hari_ini": db.query(Kunjungan).filter(Kunjungan.tanggal == today).count(),
        "balita_per_umur": [{"kelompok": k, "jumlah": v} for k, v in kelompok.items()],
        "kunjungan_per_bulan": list(per.values()),
    }
