#!/usr/bin/env bash
# Menjalankan tes tiap service secara terpisah (tiap service punya modul main.py sendiri).
set -e
for s in auth-service antrian-service pasien-service gateway; do
  echo "=== $s"
  (cd "backend/$s" && python -m pytest -q)
done
