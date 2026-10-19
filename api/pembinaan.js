/*
==========================================================
/api/pembinaan  (KHUSUS ADMIN -- header Authorization: Bearer)
GET  -> { pembinaan: [{ tanggal, waktu, nis, nama, kelas, tingkat, status, catatan, penangani }], canWrite }
POST -> catat tindak lanjut pembinaan ke tab "Pembinaan"
        { nis, status: "Dipanggil" | "Selesai", catatan?, clientId? }
Tingkat diambil SERVER dari poin kumulatif tahun ajaran berjalan (bukan dari browser) dan
hanya siswa pada tingkat SP1 ke atas yang dapat dicatat. Penangani = nama guru dari sesi login.
Status per siswa = baris terbaru untuk tingkat yang sedang berlaku; naik tingkat = kembali "belum".
==========================================================
*/
const K = require("./_lib/kesiswaan");
const sheets = require("./_lib/sheets");
const { verifyAdmin } = require("./admin-auth");

const STATUS = ["Dipanggil", "Selesai"];

const clip = (v, n) => String(v || "").replace(/[\r\n]+/g, " ").trim().slice(0, n);
const safeCell = (v) => (/^[=+\-@]/.test(v) ? "'" + v : v);

function readBody(req) {
    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    return body && typeof body === "object" ? body : {};
}

module.exports = async (req, res) => {

    res.setHeader("Cache-Control", "no-store");

    const auth = verifyAdmin(req, ["komisi", "kesiswaan"]);
    if (!auth.ok) return res.status(auth.forbidden ? 403 : 401).json({ success: false, message: auth.forbidden ? "Akun ini tidak memiliki izin untuk fitur ini." : "Sesi Komisi Disiplin tidak valid. Silakan masuk lagi." });

    try {

        if (req.method === "GET") {
            return res.status(200).json({ success: true, canWrite: sheets.canWrite(), pembinaan: await K.loadPembinaan() });
        }

        if (req.method === "POST") {

            if (!sheets.canWrite()) {
                return res.status(503).json({ success: false, code: "READ_ONLY", message: "Portal hanya bisa membaca (mode demo atau service account belum diatur)." });
            }

            const body = readBody(req);
            const nis = K.cleanNIS(body.nis);
            const status = STATUS.find((s) => s.toLowerCase() === String(body.status || "").trim().toLowerCase());
            if (!status) return res.status(400).json({ success: false, message: "Status harus Dipanggil atau Selesai." });

            const [siswa, violations, existing] = await Promise.all([K.loadSiswa(), K.loadPelanggaran(), K.loadPembinaan()]);
            const s = siswa.find((x) => x.nis === nis);
            if (!s) return res.status(400).json({ success: false, message: "Siswa dengan NIS itu tidak ditemukan." });

            const clientId = clip(body.clientId, 64).replace(/[^A-Za-z0-9_-]/g, "");
            if (clientId && existing.some((e) => e.clientId === clientId)) {
                return res.status(200).json({ success: true, duplicate: true, data: { nis, status } });
            }

            const today = K.todayWIB();
            const start = K.academicYearStart(today);
            const from = `${start}-07-01`, to = `${start + 1}-06-30`;
            const poin = violations.filter((v) => v.nis === nis && v.tanggal >= from && v.tanggal <= to).reduce((sum, v) => sum + v.poin, 0);
            const tingkat = K.tingkatFor(poin);

            if (K.tatib.tingkat.indexOf(tingkat) < 1) {
                return res.status(400).json({ success: false, message: `Poin ${s.nama} baru ${poin}; pembinaan tercatat mulai tingkat ${K.tatib.tingkat[1].label}.` });
            }

            const jam = new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Jakarta" });
            const catatan = clip(body.catatan, 500);
            await sheets.appendRow("Pembinaan", [
                `${today} ${jam}`, s.nis, safeCell(s.nama), s.kelas, tingkat.label, status,
                catatan ? safeCell(catatan) : "-", safeCell(clip(auth.nama || auth.username || "admin", 80)), clientId
            ]);

            return res.status(201).json({ success: true, data: { nis: s.nis, nama: s.nama, tingkat: tingkat.label, status, tanggal: today } });
        }

        res.setHeader("Allow", "GET, POST");
        return res.status(405).json({ success: false, message: "Metode tidak diizinkan." });

    } catch (err) {
        return res.status(500).json({ success: false, message: err.message || "Terjadi kesalahan pada server.", detail: err.detail ? { ...err.detail, ...sheets.diagnostics() } : undefined });
    }
};
