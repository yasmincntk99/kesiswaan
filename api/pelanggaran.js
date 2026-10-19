/*
==========================================================
/api/pelanggaran  (KHUSUS ADMIN -- header Authorization: Bearer)
GET  -> { violations, siswa, tatib, tingkat, mode, canWrite }
POST -> catat pelanggaran baru ke tab Input_Pelanggaran
        satu siswa : { nis, kode, tanggal?, catatan?, sanksi?, clientId? }
        banyak     : { items: [{ nis, sanksi?, clientId? }], kode, tanggal?, catatan? }  (maks. 60 siswa,
                     jenis/tanggal/catatan sama; ditulis dalam satu panggilan, tanpa penulisan sebagian)
        clientId (dari antrean offline) mencegah baris ganda saat sinkron ulang.
        Kolom Pencatat = nama guru dari sesi login (tab Pengguna), bukan dari body.
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

const MAX_BATCH = 60;

const clip = (v, n) => String(v || "").replace(/[\r\n]+/g, " ").trim().slice(0, n);

// Cegah formula injection saat sel dibuka di Google Sheets/Excel.
const safeCell = (v) => (/^[=+\-@]/.test(v) ? "'" + v : v);

module.exports = async (req, res) => {

    res.setHeader("Cache-Control", "no-store");

    const auth = verifyAdmin(req, req.method === "GET" ? ["komisi", "kesiswaan"] : "komisi");

    if (!auth.ok) {
        return res.status(auth.forbidden ? 403 : 401).json({ success: false, message: auth.forbidden ? "Akun ini tidak memiliki izin untuk fitur ini." : "Sesi Komisi Disiplin tidak valid. Silakan masuk lagi." });
    }

    try {

        if (req.method === "GET") {
            const [violations, siswa, tatib] = await Promise.all([K.loadPelanggaran(), K.loadSiswa(), K.loadTatib()]);

            return res.status(200).json({
                success: true,
                mode: sheets.mode(),
                canWrite: sheets.canWrite(),
                data: { violations, siswa: siswa.map(({ wa, ...rest }) => ({ ...rest, hasWa: !!wa })), tatib, tingkat: K.tatib.tingkat, hariIni: K.todayWIB() }
            });
        }

        if (req.method === "POST") {

            if (!sheets.canWrite()) {
                return res.status(503).json({
                    success: false,
                    code: "READ_ONLY",
                    message: sheets.mode() === "demo"
                        ? "Mode demo: GOOGLE_SHEET_ID belum diatur, data tidak dapat disimpan."
                        : "Service account belum diatur, portal hanya bisa membaca. Isi baris langsung di Google Sheet atau atur GOOGLE_SERVICE_ACCOUNT_*."
                });
            }

            const body = readBody(req);
            const batch = Array.isArray(body.items);
            const tanggal = K.normDate(body.tanggal) || K.todayWIB();

            if (tanggal > K.todayWIB()) {
                return res.status(400).json({ success: false, message: "Tanggal tidak boleh di masa depan." });
            }

            // Satu siswa (body.nis) atau banyak siswa (body.items: [{ nis, sanksi?, clientId? }]) untuk jenis & tanggal yang sama.
            const rawItems = batch ? body.items : [{ nis: body.nis, sanksi: body.sanksi, clientId: body.clientId }];

            if (!rawItems.length) return res.status(400).json({ success: false, message: "Pilih minimal satu siswa." });
            if (rawItems.length > MAX_BATCH) return res.status(400).json({ success: false, message: `Maksimal ${MAX_BATCH} siswa sekali catat.` });

            const kode = clip(body.kode, 20);
            const [siswa, tatib, violations] = await Promise.all([K.loadSiswa(), K.loadTatib(), K.loadPelanggaran()]);
            const t = tatib.find((x) => x.kode === kode);

            if (!t) return res.status(400).json({ success: false, message: "Jenis pelanggaran tidak dikenal." });

            const seen = new Set();
            const entries = [];
            const unknown = [];

            for (const it of rawItems) {
                const nis = K.cleanNIS(it && it.nis);
                if (!nis || seen.has(nis)) continue;   // NIS ganda dalam satu permintaan diabaikan
                seen.add(nis);
                const s = siswa.find((x) => x.nis === nis);
                if (!s) { unknown.push(nis); continue; }
                entries.push({ s, sanksi: clip(it.sanksi, 200), clientId: clip(it.clientId, 64).replace(/[^A-Za-z0-9_-]/g, "") });
            }

            // Tidak ada penulisan sebagian: satu NIS tak dikenal membatalkan seluruh permintaan.
            if (unknown.length) {
                return res.status(400).json({ success: false, message: batch
                    ? `NIS tidak ditemukan: ${unknown.slice(0, 5).join(", ")}${unknown.length > 5 ? " dan lainnya" : ""}. Tidak ada data yang disimpan.`
                    : "Siswa dengan NIS itu tidak ditemukan." });
            }

            const knownClientIds = new Map(violations.filter((v) => v.clientId).map((v) => [v.clientId, v]));
            const fresh = entries.filter((e) => !(e.clientId && knownClientIds.has(e.clientId)));
            const dupes = entries.filter((e) => e.clientId && knownClientIds.has(e.clientId));

            // Permintaan tunggal yang ternyata sudah tercatat (sinkron ulang antrean offline).
            if (!batch && dupes.length) {
                const dup = knownClientIds.get(dupes[0].clientId);
                return res.status(200).json({ success: true, duplicate: true, data: { id: dup.id, nama: dup.nama, kelas: dup.kelas, jenis: dup.jenis, poin: dup.poin, tanggal: dup.tanggal } });
            }

            const jam = new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Jakarta" }); // HH:mm:ss
            const catatan = clip(body.catatan, 500);
            const pencatat = safeCell(clip(auth.nama || auth.username || "admin", 80));

            // Urutan kolom = Input_Pelanggaran (7 kolom pertama sama dengan Apps Script lama).
            // Semua baris ditulis dalam SATU panggilan agar cepat dan tidak setengah jadi.
            const created = fresh.map((e, i) => ({
                id: "V" + String(violations.length + 1 + i).padStart(4, "0"),
                nis: e.s.nis, nama: e.s.nama, kelas: e.s.kelas, jenis: t.jenis, poin: t.poin, tanggal,
                row: [
                    `${tanggal} ${jam}`, e.s.nis, safeCell(e.s.nama), e.s.kelas, safeCell(t.jenis), t.poin, (catatan ? safeCell(catatan) : "-"),
                    t.kode, safeCell(e.sanksi), pencatat, e.clientId
                ]
            }));

            if (created.length) await sheets.appendRows("Input_Pelanggaran", created.map((c) => c.row));

            if (!batch) {
                const c = created[0];
                return res.status(201).json({ success: true, data: { id: c.id, nama: c.nama, kelas: c.kelas, jenis: c.jenis, poin: c.poin, tanggal } });
            }

            return res.status(201).json({
                success: true,
                data: {
                    count: created.length, duplicates: dupes.length, jenis: t.jenis, poin: t.poin, tanggal,
                    created: created.map((c) => ({ id: c.id, nis: c.nis, nama: c.nama, kelas: c.kelas }))
                }
            });
        }

        res.setHeader("Allow", "GET, POST");
        return res.status(405).json({ success: false, message: "Metode tidak diizinkan." });

    } catch (err) {
        // Rincian diagnosis hanya untuk admin (endpoint ini sudah lolos verifyAdmin).
        return res.status(500).json({ success: false, message: err.message || "Terjadi kesalahan pada server.", detail: err.detail ? { ...err.detail, ...sheets.diagnostics() } : undefined });
    }
};
