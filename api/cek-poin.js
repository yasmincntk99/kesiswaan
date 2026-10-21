/*
==========================================================
GET /api/cek-poin?nis=<NIS>  atau  ?kode=<isi QR kartu siswa>
Siswa melihat poin & riwayat pelanggarannya sendiri.
Pencarian harus cocok persis dengan NIS.
==========================================================
*/
const K = require("./_lib/kesiswaan");
const sheets = require("./_lib/sheets");
const QR = require("./_lib/h/qr");

module.exports = async (req, res) => {

    res.setHeader("Cache-Control", "no-store");

    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return res.status(405).json({ success: false, message: "Metode tidak diizinkan." });
    }

    let key;
    if (req.query.kode) {                       // dari pindai QR kartu: tanda tangan diperiksa, lalu sama seperti NIS
        key = QR.urai(req.query.kode);
        if (!key) return res.status(422).json({ success: false, message: "QR tidak dikenali. Pastikan yang dipindai adalah QR pada kartu siswa SMAN 1 Sooko." });
    } else key = K.cleanNIS(req.query.nis);

    if (key.length < 4) {
        return res.status(400).json({ success: false, message: "Masukkan NIS minimal 4 digit." });
    }

    try {
        const [violations, siswa] = await Promise.all([K.loadPelanggaran(), K.loadSiswa()]);

        const found = siswa.find((s) => s.nis === key);

        if (!found) {
            return res.status(404).json({ success: false, message: "Data siswa tidak ditemukan." });
        }

        const ay = K.periodRange("tahun", K.todayWIB());
        const riwayat = violations
            .filter((v) => v.nis === found.nis && v.tanggal >= ay.from && v.tanggal <= ay.to)
            .sort((a, b) => (a.tanggal < b.tanggal ? 1 : -1));

        const total = riwayat.reduce((s, v) => s + v.poin, 0);

        return res.status(200).json({
            success: true,
            mode: sheets.mode(),
            data: {
                nama: found.nama,
                nis: found.nis,
                kelas: found.kelas,
                periode: ay.label,
                totalPoin: total,
                tingkat: K.tingkatFor(total),
                riwayat: riwayat.map((v) => ({
                    tanggal: v.tanggal, jenis: v.jenis, kategori: v.kategori, poin: v.poin, sanksi: v.sanksi
                }))
            }
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message || "Terjadi kesalahan pada server." });
    }
};
