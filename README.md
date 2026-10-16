# Portal Gerakan Disiplin Sekolah (Kesiswaan & Kedisiplinan)

Portal Gerakan Disiplin Sekolah (GDS) — kesiswaan & kedisiplinan siswa SMAN 1 Sooko Mojokerto, dikelola oleh Komisi Disiplin Sekolah. Memakai shell, tema kaca (glass), dan komponen floating yang sama dengan *SMANSASOO Academic Portal*, dengan fokus pada pencatatan dan pemantauan pelanggaran siswa.

## Fitur
- **Dashboard pelanggaran** (beranda): KPI, tren bulanan, komposisi kategori, jenis pelanggaran teratas, kelas terbanyak, status pembinaan, aktivitas terbaru (tanpa nama siswa).
- **Cek Poin Siswa**: lihat poin & riwayat dengan NIS.
- **Tata Tertib & Sanksi**: daftar pelanggaran, poin, tingkat pembinaan.
- **Floating badge "Komisi Disiplin"** di semua halaman → panel masuk Komisi Disiplin Sekolah, menu kerja, dan toggle mode gelap/terang.
- **Panel Komisi Disiplin** (`/pages/admin`): alur Kelas → Siswa → profil (foto, poin, riwayat) → input pelanggaran, rekap per kelas, **catat massal** (satu pelanggaran untuk beberapa siswa sekaligus, maks 60, satu kali tulis tanpa data setengah masuk), antrean offline (kirim otomatis saat online, tanpa data ganda), data pelanggaran (filter + CSV), siswa perlu pembinaan dengan **status tindak lanjut** (Belum → Dipanggil → Selesai, lengkap dengan catatan dan nama guru). Status berlaku per tingkat: siswa yang naik tingkat muncul lagi sebagai "Belum". Daftar bawaan menyembunyikan yang sudah Selesai. Tombol **Cetak surat** membuat surat peringatan/panggilan orang tua (kop sekolah, rincian pelanggaran tahun ajaran berjalan, kolom nomor surat, jadwal menghadap, tanda tangan, dan tanda terima) siap diprint atau disimpan sebagai PDF.

## Menjalankan lokal
```bash
npm run dev      # http://localhost:3000
npm run sample   # regenerasi data contoh (fiktif)
```

## Struktur Google Sheet
Sama dengan skema Apps Script sebelumnya (dibaca per posisi kolom, baris 1 = header):

| Tab | Kolom |
|-----|-------|
| `Data_Siswa` | NIS \| Nama \| Kelas \| Foto (https / link Drive) |
| `Master_Pelanggaran` | Kode \| Nama \| Poin \| Kategori (opsional) |
| `Pengguna` | Username \| Nama \| Password \| Aktif \| Peran (akun per guru; opsional) |
| `Pembinaan` | Timestamp \| NIS \| Nama \| Kelas \| Tingkat \| Status \| Catatan \| Penangani \| ClientID (tindak lanjut pembinaan; opsional) |
| `Input_Pelanggaran` | Timestamp \| NIS \| Nama \| Kelas \| Jenis \| Poin \| Keterangan \| Kode \| Sanksi \| Pencatat \| ClientID |

Kolom A–G `Input_Pelanggaran` kompatibel dengan Apps Script lama; H–K ditambahkan portal. Atur *Locale* spreadsheet ke Indonesia (dd/mm/yyyy).

## Mode data
| Mode | Syarat | Kemampuan |
|------|--------|-----------|
| Demo | tanpa env | data fiktif `data/sample-*.json` |
| Publik | `GOOGLE_SHEET_ID` | baca saja (sheet harus "Anyone with link") |
| Service account | `GOOGLE_SHEET_ID` + `GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_SERVICE_ACCOUNT_KEY` | baca & tulis (disarankan; sheet di-share ke email service account) |

## Login Komisi Disiplin
Username `adminkesiswaan`. Password diperiksa **di server** (`/api/admin-auth`) dan tidak ditulis di source code (hanya hash SHA-256). Karena repo bisa dibaca publik, untuk produksi **wajib** set Environment Variable di Vercel:

- `ADMIN_PASSWORD` — password Komisi Disiplin
- `ADMIN_SESSION_SECRET` — string acak panjang untuk menandatangani token
- `ADMIN_USERNAME` — (opsional)
- `ADMIN_NAME` — (opsional) nama tampilan akun env pada kolom Pencatat

### Akun per guru (tab `Pengguna`)
Hanya dibaca pada mode service account. Satu baris per guru: `Username | Nama | Password | Aktif | Peran`. Kolom **Pencatat** di `Input_Pelanggaran` berisi *Nama* guru yang login. Password boleh teks biasa atau `sha256:<hex>`; format kolom Password sebagai teks biasa dan jaga sheet tetap *Restricted*. Aktif berisi `tidak`/`nonaktif`/`0` untuk menonaktifkan (login baru ditolak; sesi berjalan berakhir paling lama 8 jam). Kolom Peran belum dipakai untuk membatasi akses. Akun dari env tetap berlaku sebagai cadangan.

Data siswa bersifat sensitif: jangan membuka Google Sheet secara publik; gunakan mode service account.

## Deploy
Vercel (lihat `vercel.json`). Node 24.x.
