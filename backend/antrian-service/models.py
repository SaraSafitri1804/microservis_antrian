from datetime import datetime, timezone
from sqlalchemy import (Boolean, Column, Date, DateTime, ForeignKey, Integer,
                        String, UniqueConstraint)
from db import Base


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Layanan(Base):
    __tablename__ = "layanan"

    id = Column(Integer, primary_key=True)
    nama = Column(String(100), unique=True, nullable=False)
    kode = Column(String(3), unique=True, nullable=False)   # prefix nomor: A, B, C
    tipe = Column(String(20), nullable=False, default="umum")  # balita | ibu_hamil | umum
    aktif = Column(Boolean, default=True, nullable=False)


class Antrian(Base):
    __tablename__ = "antrian"
    # Nomor unik per layanan per hari: mencegah nomor dobel kalau dua pasien daftar bersamaan
    __table_args__ = (UniqueConstraint("layanan_id", "tanggal", "nomor", name="uq_nomor_harian"),)

    id = Column(Integer, primary_key=True)
    layanan_id = Column(Integer, ForeignKey("layanan.id"), nullable=False)
    tanggal = Column(Date, nullable=False, index=True)
    nomor = Column(Integer, nullable=False)
    no_antrian = Column(String(10), nullable=False)          # contoh: A-003
    nama_pasien = Column(String(100), nullable=False)
    nik = Column(String(16))
    tanggal_lahir = Column(Date)
    status = Column(String(15), nullable=False, default="menunggu", index=True)
    jumlah_panggil = Column(Integer, nullable=False, default=0)
    pasien_sinkron = Column(Boolean, nullable=False, default=False, index=True)
    ditangani_oleh = Column(Integer)                         # id user dari header gateway
    created_at = Column(DateTime, default=utcnow)
    dipanggil_at = Column(DateTime)
    selesai_at = Column(DateTime)
