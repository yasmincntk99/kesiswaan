/*
==========================================================
SMANSASOO Kesiswaan Portal
Stats Tracker
Version : 1.1.0
==========================================================
Mengirim SATU "hit" ke /api/stats setiap kali halaman
dimuat, memakai data-page dari <body> (sudah ada di semua
halaman, lihat js/shell.js).

SENGAJA fire-and-forget:
- Tidak menunggu response.
- Kalau gagal (mis. statistik belum diaktifkan di server,
  atau user sedang offline), diam-diam diabaikan -- tidak
  pernah menampilkan error ke pengguna maupun menghambat
  render halaman.

CHANGELOG (v1.1.0):
- Maksimal SATU hit per halaman per sesi tab. Refresh atau
  pindah-pindah halaman lalu kembali di tab yang sama tidak
  menambah hitungan lagi. Penanda disimpan di sessionStorage
  (hilang otomatis saat tab ditutup, jadi tab/sesi baru
  dihitung lagi).
- Kalau sessionStorage tidak tersedia (mode privat tertentu,
  dll), hit tetap dikirim seperti sebelumnya.
==========================================================
*/

(function () {

    if (!document.body) return;

    const page = document.body.dataset.page;

    if (!page) return;

    const STORAGE_KEY = "kesiswaan-stats-hit:" + page;

    // Sudah pernah dihitung di sesi tab ini? -> lewati.
    try {

        if (sessionStorage.getItem(STORAGE_KEY) === "1") return;

        // Tandai SEBELUM kirim supaya tidak dobel kalau script
        // kebetulan berjalan dua kali.
        sessionStorage.setItem(STORAGE_KEY, "1");

    } catch (e) {

        // sessionStorage tidak tersedia -- lanjut kirim hit.

    }

    try {

        fetch(`/api/stats?page=${encodeURIComponent(page)}`, {
            method: "POST",
            cache: "no-store",
            keepalive: true
        }).catch(() => {});

    } catch (e) {

        // diam-diam diabaikan, lihat catatan di atas.

    }

})();
