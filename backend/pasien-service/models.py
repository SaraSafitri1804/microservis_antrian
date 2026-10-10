from datetime import datetime, timezone
from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, String
from db import Base


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Balita(Base):
    __tablename__ = "balita"
    id = Column(Integer, primary_key=True)
    nik = Column(String(16), index=True)
    nama = Column(String(100), nullable=False)
    tanggal_lahir = Column(Date, nullable=False)
    created_at = Column(DateTime, default=utcnow)


class IbuHamil(Base):
    __tablename__ = "ibu_hamil"
    id = Column(Integer, primary_key=True)
    nik = Column(String(16), index=True)
    nama = Column(String(100), nullable=False)
    tanggal_lahir = Column(Date)
    created_at = Column(DateTime, default=utcnow)


class Kunjungan(Base):
    __tablename__ = "kunjungan"
    id = Column(Integer, primary_key=True)
    antrian_id = Column(Integer, unique=True, nullable=False)  # kunci idempotensi
    tanggal = Column(Date, nullable=False, index=True)
    jenis = Column(String(15), nullable=False)                 # balita | ibu_hamil | umum
    balita_id = Column(Integer, ForeignKey("balita.id"))
    ibu_hamil_id = Column(Integer, ForeignKey("ibu_hamil.id"))
    nama_pasien = Column(String(100), nullable=False)
    created_at = Column(DateTime, default=utcnow)
