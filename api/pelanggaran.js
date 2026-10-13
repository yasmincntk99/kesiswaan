/*
==========================================================
/api/pelanggaran  (KHUSUS ADMIN -- header Authorization: Bearer)
GET  -> { violations, siswa, tatib, tingkat, mode, canWrite, sheetUrl }
POST -> catat pelanggaran baru ke tab PELANGGARAN
        body: { nis, kode, tanggal?, catatan?, sanksi? }
Nama, kelas, jenis, kategori, dan poin diambil SERVER dari data
siswa & tata tertib -- nilai dari browser tidak dipercaya.
==========================================================
*/
const K = require("./_lib/kesiswaan");
const sheets = require("./_lib/sheets");
const { verifyAdmin } = require("./admin-auth");

function readBody(req) {
    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    return body && typeof body === "object" ? body : {};
}

const clip = (v, n) => String(v || "").replace(/[\r\n]+/g, " ").trim().slice(0, n);

// Cegah formula injection saat sel dibuka di Google Sheets/Excel.
const safeCell = (v) => (/^[=+\-@]/.test(v) ? "'" + v : v);

module.exports = async (req, res) => {

    res.setHeader("Cache-Control", "no-store");

    const auth = verifyAdmin(req);

    if (!auth.ok) {
        return res.status(401).json({ success: false, message: "Sesi admin tidak valid. Silakan masuk lagi." });
    }

    try {

        if (req.method === "GET") {
            const [violations, siswa, tatib] = await Promise.all([K.loadPelanggaran(), K.loadSiswa(), K.loadTatib()]);

            return res.status(200).json({
                success: true,
                mode: sheets.mode(),
                canWrite: sheets.canWrite(),
                sheetUrl: sheets.sheetUrl(),
                data: { violations, siswa, tatib, tingkat: K.tatib.tingkat, hariIni: K.todayWIB() }
            });
        }

        if (req.method === "POST") {

            if (!sheets.canWrite()) {
                return res.status(503).json({
                    success: false,
                    code: "READ_ONLY",
                    message: sheets.mode() === "demo"
                        ? "Mode demo: GOOGLE_SHEET_ID belum diatur, data tidak dapat disimpan."
                        : "Service account belum diatur, portal hanya bisa membaca. Isi baris langsung di Google Sheet atau atur GOOGLE_SERVICE_ACCOUNT_*.",
                    sheetUrl: sheets.sheetUrl()
                });
            }

            const body = readBody(req);
            const nis = K.cleanNIS(body.nis);
            const kode = clip(body.kode, 20);
            const tanggal = K.normDate(body.tanggal) || K.todayWIB();

            if (tanggal > K.todayWIB()) {
                return res.status(400).json({ success: false, message: "Tanggal tidak boleh di masa depan." });
            }

            const [siswa, tatib, violations] = await Promise.all([K.loadSiswa(), K.loadTatib(), K.loadPelanggaran()]);
            const s = siswa.find((x) => x.nis === nis || x.nisn === nis);
            const t = tatib.find((x) => x.kode === kode);

            if (!s) return res.status(400).json({ success: false, message: "Siswa dengan NIS/NISN itu tidak ditemukan." });
            if (!t) return res.status(400).json({ success: false, message: "Jenis pelanggaran tidak dikenal." });

            // ID berurutan: V0001, V0002, ...
            const maxId = violations.reduce((m, v) => {
                const n = Number(String(v.id).replace(/\D/g, ""));
                return n > m ? n : m;
            }, 0);
            const id = "V" + String(maxId + 1).padStart(4, "0");

            const sanksi = clip(body.sanksi, 200);
            const catatan = clip(body.catatan, 500);

            await sheets.appendRow("PELANGGARAN", [
                id, tanggal, s.nis, safeCell(s.nama), s.kelas, t.kode, safeCell(t.jenis), t.kategori, t.poin,
                safeCell(sanksi), auth.username || "admin", safeCell(catatan)
            ]);

            return res.status(201).json({ success: true, data: { id, nama: s.nama, kelas: s.kelas, jenis: t.jenis, poin: t.poin, tanggal } });
        }

        res.setHeader("Allow", "GET, POST");
        return res.status(405).json({ success: false, message: "Metode tidak diizinkan." });

    } catch (err) {
        return res.status(500).json({ success: false, message: err.message || "Terjadi kesalahan pada server." });
    }
};
