# Portal Gerakan Disiplin Sekolah (Kesiswaan & Kedisiplinan)

Portal Gerakan Disiplin Sekolah (GDS) — kesiswaan & kedisiplinan siswa SMAN 1 Sooko Mojokerto, dikelola oleh Komisi Disiplin Sekolah. Memakai shell, tema kaca (glass), dan komponen floating yang sama dengan *SMANSASOO Academic Portal*, dengan fokus pada pencatatan dan pemantauan pelanggaran siswa.

## Fitur
- **Dashboard pelanggaran** (beranda): KPI, tren bulanan, komposisi kategori, jenis pelanggaran teratas, kelas terbanyak, status pembinaan, aktivitas terbaru (tanpa nama siswa).
- **Cek Poin Siswa**: lihat poin & riwayat dengan NIS.
- **Tata Tertib & Sanksi**: daftar pelanggaran, poin, tingkat pembinaan.
- **Floating badge "Komisi Disiplin"** di semua halaman → panel masuk Komisi Disiplin Sekolah, menu kerja, dan toggle mode gelap/terang.
- **Panel Komisi Disiplin** (`/pages/admin`): alur Kelas → Siswa → profil (foto, poin, riwayat) → input pelanggaran, rekap per kelas, **catat massal** (satu pelanggaran untuk beberapa siswa sekaligus, maks 60, satu kali tulis tanpa data setengah masuk), antrean offline (kirim otomatis saat online, tanpa data ganda), data pelanggaran (filter + CSV), siswa perlu pembinaan dengan **status tindak lanjut** (Belum → Dipanggil → Selesai, lengkap dengan catatan dan nama guru). Status berlaku per tingkat: siswa yang naik tingkat muncul lagi sebagai "Belum". Daftar bawaan menyembunyikan yang sudah Selesai. Tombol **Cetak surat** membuat surat peringatan/panggilan orang tua (kop sekolah, rincian pelanggaran tahun ajaran berjalan, kolom nomor surat, **jadwal menghadap yang dipilih guru lewat dialog: tanggal kalender, jam 08.00–13.00, Ruang BK / Ruang Pertemuan**, tanda tangan QR, dan tanda terima) siap diprint atau disimpan sebagai PDF. Tombol **Kirim WA** membuka WhatsApp guru dengan nomor orang tua (diambil dari tab `Data_Foto_Siswa`, kolom G "Nomer WA Orang Tua (ayah)", isian terbaru per NIS; cadangan: kolom `WA_Ortu` di `Data_Siswa`) dan pesan berisi **tautan surat bertanda tangan (berlaku 14 hari, tanpa login)**; guru menekan Kirim sendiri, satu per satu (sengaja tidak massal agar nomor tidak diblokir). Pengiriman dicatat di tab `Pembinaan` dengan status *Surat dikirim* dan dibatasi 20 surat per guru per hari (atur dengan env `WA_DAILY_LIMIT`). **Ringkasan Harian** (menu sidebar): jumlah pelanggaran hari ini/7 hari, siswa yang baru naik tingkat, siswa yang terlambat ditangani (status *Belum* > 3 hari atau *Surat dikirim* > 7 hari), dan **cek data** (NIS ganda, baris tanpa kelas/NIS, nomor WA salah format, NIS pelanggaran yang tidak ada di Data_Siswa, siswa yang perlu tindak lanjut tetapi nomor WA kosong). Dihitung saat halaman dibuka (tanpa penjadwal/server tambahan, Rp0); tombol *Kirim ringkasan ke WhatsApp* membuka WhatsApp guru yang sedang login. **Rapikan Data** (menu sidebar, `/api/perapian`): memeriksa `Data_Siswa` dan `Data_Foto_Siswa` tanpa AI (aturan tetap, data tidak keluar dari server). Usulan perbaikan: format NIS (spasi / “.0”), spasi & huruf besar nama mengikuti data yang ada, penulisan kelas (X1 → X-1), format nomor WA (62…), dan melengkapi Foto / NISN / WA_Ortu yang masih kosong dari formulir siswa. Guru mencentang lalu menekan **Terapkan**; server menghitung ulang (nilai dari browser tidak dipercaya) dan mencatat setiap perubahan (Dari → Ke, pelaku) di tab `Log_Perapian` (header: Timestamp, Tab, Baris, Kolom, NIS, Nama, Dari, Ke, Penangani) sehingga bisa dikembalikan manual. Masalah yang tidak bisa diperbaiki otomatis (NIS ganda/kosong, kelas tak dikenal, nomor WA salah, nama beda dengan formulir, NIS formulir tak dikenal) hanya dilaporkan. **Catat lewat kalimat (AI)** (panel Catat Pelanggaran): guru menulis mis. “Rizky X-1 dan Dina XI-2 terlambat 15 menit”; server mencocokkan nama dengan Data_Siswa dan menggantinya kode (S1, S2) sebelum teks dikirim ke Gemini, sehingga Gemini tidak menerima nama/NIS/nomor siswa (hanya kalimat bersandi dan daftar tata tertib). Hasil divalidasi (kode pelanggaran harus ada di tata tertib, tanggal tidak boleh masa depan) lalu hanya **mengisi form** mode “Beberapa siswa”; tidak ada yang tertulis ke Sheet sampai guru menekan Simpan. Nama yang cocok dengan beberapa siswa dipilih guru. Barcode tanda tangan Kepala Sekolah: simpan sebagai `assets/ttd/ttd-kepsek.png`.

## Menjalankan lokal
```bash
npm run dev      # http://localhost:3000
npm run sample   # regenerasi data contoh (fiktif)
```

## Struktur Google Sheet
Sama dengan skema Apps Script sebelumnya (dibaca per posisi kolom, baris 1 = header):

| Tab | Kolom |
|-----|-------|
| `Log_Perapian` | Timestamp \| Tab \| Baris \| Kolom \| NIS \| Nama \| Dari \| Ke \| Penangani (diisi otomatis oleh Rapikan Data) |
| `Data_Siswa` | NIS \| Nama \| Kelas \| Foto (https / link Drive) \| NISN \| WA_Ortu (nomor WhatsApp orang tua/wali, opsional; 08xx / +62xx / 62xx) |
| `Master_Pelanggaran` | Kode \| Nama \| Poin \| Kategori (opsional) |
| `Target_KPI` | Kode \| Nama \| Target \| Arah (`min`/`maks`) \| Keterangan. Kolom Target kosong = memakai nilai *contoh* (ditandai di portal) |
| `Pengguna` | Username \| Nama \| Password \| Aktif \| Peran \| Kelas (akun per guru; opsional; Kelas hanya untuk wali kelas) |
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
- `GEMINI_API_KEY` — (opsional) kunci Gemini gratis dari Google AI Studio untuk fitur **Catat lewat kalimat (AI)**; pasang di Vercel lalu Redeploy. `GEMINI_MODEL` (opsional, bawaan `gemini-3.5-flash-lite`), `AI_HOURLY_LIMIT` (opsional, bawaan 30 permintaan per guru per jam)

### Akun per guru (tab `Pengguna`)
Hanya dibaca pada mode service account. Satu baris per guru: `Username | Nama | Password | Aktif | Peran`. Kolom **Pencatat** di `Input_Pelanggaran` berisi *Nama* guru yang login. Password boleh teks biasa atau `sha256:<hex>`; format kolom Password sebagai teks biasa dan jaga sheet tetap *Restricted*. Aktif berisi `tidak`/`nonaktif`/`0` untuk menonaktifkan (login baru ditolak; sesi berjalan berakhir paling lama 8 jam). Kolom **Peran** menentukan hak akses: kosong/`komisi` (atau nilai lama seperti `admin`/`guru`) = **Komisi Disiplin, akses penuh** (catat pelanggaran, data, pembinaan, surat/WA, ringkasan, Rapikan Data, catat lewat AI); `kesiswaan` (alias `bk`, `guru-bk`, `wakasek-kesiswaan`) = **terbatas**: hanya *Data Pelanggaran* dan *Perlu Pembinaan* (termasuk status tindak lanjut dan surat/WA), tanpa catat pelanggaran, ringkasan, dan Rapikan Data; `walikelas` (alias `wali-kelas`, `wk`) = **Rekomendasi Mingguan** untuk kelasnya sendiri (isi kolom **Kelas**, mis. `X-1` atau `X-1, X-2`; tanpa kelas akun ditolak); `eksekutif` (alias `kepsek`, `kepala-sekolah`, `pimpinan`) = Portal Eksekutif saja; kombinasi dipisah koma, mis. `komisi,eksekutif` (setelah login diarahkan ke Portal Eksekutif). Pembatasan diperiksa server di setiap API (403), bukan hanya disembunyikan di menu. Akun eksekutif ditolak (403) oleh semua API Komisi, dan akun komisi ditolak oleh `/api/eksekutif`. Akun dari env tetap berlaku sebagai cadangan.

Data siswa bersifat sensitif: jangan membuka Google Sheet secara publik; gunakan mode service account.

## Deploy
Vercel (lihat `vercel.json`). Node 24.x.


### Portal Eksekutif (`/pages/eksekutif.html`)
Khusus akun berperan `eksekutif`. Menampilkan 7 KPI bertarget (hijau/kuning/merah), ringkasan tahun ajaran, tren 12 bulan, sebaran tingkat, kelas dan jenis pelanggaran teratas, serta status tindak lanjut. Hanya angka agregat, tanpa nama siswa. Tombol **Mode tayang** (layar penuh, geser otomatis 12 detik, tombol panah/Esc) dan **Cetak A4**. Target diubah lewat tab `Target_KPI`.

### Tanya Data (AI)
Kotak "💬 Tanya Data" di Portal Eksekutif dan di bagian *Data Pelanggaran* Panel Komisi/Kesiswaan (`POST /api/tanya`, semua akun yang masuk). Contoh: "Kelas mana paling banyak melanggar bulan ini?", "Hari apa paling banyak siswa terlambat?". Alur: Gemini hanya **menerjemahkan** pertanyaan menjadi kueri terstruktur (metrik, pengelompokan, periode, filter dari daftar kelas dan kode tata tertib); **angka dihitung server** dari Sheet, jadi tidak ada angka karangan AI. Gemini tidak menerima data pelanggaran dan nama siswa disandikan; pertanyaan tentang individu ditolak. Hasil hanya agregat. Memakai `GEMINI_API_KEY` dan `AI_HOURLY_LIMIT` yang sama dengan fitur catat lewat kalimat.


### Kartu & Pindai QR (`/pages/qr.html`)
Untuk peran `komisi`, `kesiswaan`, dan `walikelas` (wali kelas hanya kelasnya). Dua tab: **Pindai** (kamera) dan **Cetak** (kartu pelajar landscape 85,6 x 54 mm berkop sekolah dengan foto, nama, kelas, NIS, dan QR; atau stiker kecil; per kelas, skala cetak 100%). Isi QR hanya `SSK1.<NIS>.<tanda tangan HMAC>`; **nama tidak ada di dalam QR**, jadi siapa pun yang memindai tanpa akun berwenang hanya melihat deretan kode. Nama, kelas, dan foto baru tampil setelah server memeriksa tanda tangan dan sesi (`/api/qr`), agar guru mencocokkan foto dengan siswa di depannya. Gambar kamera diproses di perangkat (BarcodeDetector bila ada, jsQR sebagai cadangan; keduanya tanpa unggah gambar). Ada cadangan unggah/ambil foto QR dan ketik kode. Dari hasil pindai, Komisi bisa langsung ke Catat Pelanggaran dengan siswa terpilih. Mengganti `ADMIN_SESSION_SECRET` mencabut semua QR lama. **Tidak ada pengenalan wajah**, sengaja, karena data biometrik anak sulit dijamin keamanannya.

**Cek poin publik lewat QR:** halaman `/pages/cek-poin.html` (tanpa login) juga bisa memindai QR pada kartu siswa (`?scan=1` langsung menyalakan kamera; tombol ada di dashboard). QR diverifikasi tandatangannya oleh `/api/cek-poin?kode=...`, lalu hasilnya sama persis dengan pencarian NIS (nama, kelas, poin, riwayat), tanpa foto. Tidak ada data baru yang terbuka dibanding pencarian NIS.

### Nomor surat panggilan
Dibuat otomatis saat tautan surat dibuat: `<urut 3 digit><tanggal panggil>/KDS/101.6.27.15/<tahun>`, mis. `00521/KDS/101.6.27.15/2026` (urut ke-5 pada tahun itu, hadir tanggal 21). Nomor urut berjalan per tahun (tahun dari tanggal panggil) dan disimpan di Upstash, sehingga **butuh `UPSTASH_REDIS_REST_URL/TOKEN` aktif**; tanpa itu nomor dikosongkan (`........./KDS/...`) supaya tidak ada nomor ganda. Surat yang sama (siswa, tingkat, tanggal panggil sama) memakai nomor yang sama walau tautan dibuat ulang.

### Rekomendasi Mingguan Wali Kelas (`/pages/walikelas.html`)
Untuk akun berperan `walikelas`. Berisi ringkasan kelas (7 hari terakhir vs 7 hari sebelumnya), daftar siswa yang perlu perhatian beserta saran, jenis pelanggaran tersering, dan siswa yang layak diapresiasi. Disusun dengan aturan sederhana yang tertulis di bagian bawah halaman (tindak lanjut SP1+ yang belum ada, sisa ≤ 10 poin menuju tingkat berikutnya, jenis sama ≥ 3 kali dalam 30 hari, lonjakan ≥ 15 poin dalam 7 hari); bukan prediksi dan tidak memakai AI, jadi tidak ada angka karangan. Hanya anjuran: tidak ada yang dikirim atau diubah otomatis. Wali kelas hanya bisa melihat kelas di kolom **Kelas** (dibawa di token bertanda tangan, dicek server; kelas lain 403). Perubahan kolom Kelas berlaku setelah wali kelas masuk lagi. Komisi dan Kesiswaan dapat melihat semua kelas lewat halaman yang sama.


### Batas fungsi Vercel (paket gratis)
Paket Hobby hanya mengizinkan **12 fungsi serverless** per deployment; lebih dari itu deployment GAGAL dan situs tetap memakai versi lama. Karena itu `ai-catat`, `eksekutif`, `perapian`, `qr`, `ringkasan`, `tanya`, dan `walikelas` digabung menjadi satu fungsi `api/layanan.js` (kode handler di `api/_lib/h/`), dan URL lamanya tetap berlaku lewat `rewrites` di `vercel.json`. Saat ini ada 9 fungsi; **jangan menambah file di `/api` tanpa menghitung dulu** (tambahkan endpoint baru sebagai handler di `api/_lib/h/` + satu baris di `api/layanan.js` dan `vercel.json`).
