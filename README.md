# SMANSASOO Kesiswaan Portal

Portal kesiswaan & kedisiplinan siswa SMAN 1 Sooko Mojokerto. Memakai shell, tema kaca (glass), dan komponen floating yang sama dengan *SMANSASOO Academic Portal*, dengan fokus pada pencatatan dan pemantauan pelanggaran siswa.

## Fitur
- **Dashboard pelanggaran** (beranda): KPI, tren bulanan, komposisi kategori, jenis pelanggaran teratas, kelas terbanyak, status pembinaan, aktivitas terbaru (tanpa nama siswa).
- **Cek Poin Siswa**: lihat poin & riwayat dengan NIS/NISN.
- **Tata Tertib & Sanksi**: daftar pelanggaran, poin, tingkat pembinaan.
- **Floating badge "Admin"** di semua halaman → panel login admin, menu admin, dan toggle mode gelap/terang.
- **Panel Admin** (`/pages/admin`): catat pelanggaran, data pelanggaran (filter + CSV), siswa perlu pembinaan.

## Menjalankan lokal
```bash
npm run dev      # http://localhost:3000
npm run sample   # regenerasi data contoh (fiktif)
```

## Mode data
| Mode | Syarat | Kemampuan |
|------|--------|-----------|
| Demo | tanpa env | data fiktif `data/sample-*.json` |
| Publik | `GOOGLE_SHEET_ID` | baca saja (sheet harus "Anyone with link") |
| Service account | `GOOGLE_SHEET_ID` + `GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_SERVICE_ACCOUNT_KEY` | baca & tulis (disarankan; sheet di-share ke email service account) |

## Login admin
Username `adminkesiswaan`. Password diperiksa **di server** (`/api/admin-auth`) dan tidak ditulis di source code (hanya hash SHA-256). Karena repo bisa dibaca publik, untuk produksi **wajib** set Environment Variable di Vercel:

- `ADMIN_PASSWORD` — password admin
- `ADMIN_SESSION_SECRET` — string acak panjang untuk menandatangani token
- `ADMIN_USERNAME` — (opsional)

Data siswa bersifat sensitif: jangan membuka Google Sheet secara publik; gunakan mode service account.

## Deploy
Vercel (lihat `vercel.json`). Node 24.x.
