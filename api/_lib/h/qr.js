/*
==========================================================
/api/qr  (peran: komisi, kesiswaan, walikelas)
GET  ?kelas=X-1        -> daftar siswa kelas + kode QR untuk dicetak (kelas=semua: hanya Komisi/Kesiswaan)
POST { kode: "SSK1.<NIS>.<tanda>" } -> identitas siswa (nama, kelas, foto) untuk verifikasi visual

Isi QR hanya NIS + tanda tangan (HMAC). Nama TIDAK ada di dalam QR: siapa pun yang memindai tanpa
akun yang berwenang hanya melihat deretan kode. Nama baru tampil setelah server memverifikasi kode dan sesi.
Wali kelas hanya dapat mencetak/memindai siswa kelas yang tercantum di kolom "Kelas" tab Pengguna.
Tanda tangan memakai kunci sesi server; mengganti ADMIN_SESSION_SECRET otomatis mencabut semua QR lama.
==========================================================
*/
const crypto = require("crypto");
const K = require("../kesiswaan");
const R = require("../rekomendasi");
const { verifyAdmin, signingSecret } = require("../../admin-auth");

const PREFIX = "SSK1";

function tanda(nis) {
    return crypto.createHmac("sha256", String(signingSecret()) + "|qr1").update("qr1|" + nis).digest("hex").slice(0, 10).toUpperCase();
}
function kodeUntuk(nis) { return `${PREFIX}.${nis}.${tanda(nis)}`; }
function sama(a, b) {
    const x = Buffer.from(String(a)), y = Buffer.from(String(b));
    return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function urai(kode) {
    const m = /^SSK1\.([A-Za-z0-9\-_]{1,24})\.([0-9A-F]{10})$/.exec(String(kode || "").trim());
    if (!m) return null;
    return sama(tanda(m[1]), m[2]) ? m[1] : null;
}

module.exports = async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const auth = verifyAdmin(req, ["komisi", "kesiswaan", "walikelas"]);
    if (!auth.ok) return res.status(auth.forbidden ? 403 : 401).json({ success: false, message: auth.forbidden ? "Akun ini tidak memiliki izin untuk fitur ini." : "Sesi tidak valid. Silakan masuk lagi." });
    if (req.method !== "GET" && req.method !== "POST") { res.setHeader("Allow", "GET, POST"); return res.status(405).json({ success: false, message: "Metode tidak diizinkan." }); }

    try {
        const luas = auth.roles.includes("komisi") || auth.roles.includes("kesiswaan");
        const siswa = (await K.loadSiswa()).filter((s) => !/^TANPA-NIS/.test(s.nis));
        const semua = [...new Set(siswa.map((s) => R.up(s.kelas)))].filter(Boolean).sort((a, b) => a.localeCompare(b, "id", { numeric: true }));
        const boleh = luas ? semua : (auth.kelas || []).map(R.up).filter((k) => semua.includes(k));

        if (req.method === "GET") {
            if (!boleh.length) return res.status(403).json({ success: false, message: "Akun ini belum diberi kelas. Isi kolom Kelas (mis. X-1) di tab Pengguna, lalu masuk lagi." });
            const minta = R.up((req.query && req.query.kelas) || "");
            let kelasDipilih;
            if (minta === "SEMUA") { if (!luas) return res.status(403).json({ success: false, message: "Anda tidak memiliki akses ke semua kelas." }); kelasDipilih = boleh; }
            else if (minta) { if (!boleh.includes(minta)) return res.status(403).json({ success: false, message: "Anda tidak memiliki akses ke kelas tersebut." }); kelasDipilih = [minta]; }
            else kelasDipilih = [boleh[0]];
            const data = siswa.filter((s) => kelasDipilih.includes(R.up(s.kelas)))
                .sort((a, b) => R.up(a.kelas).localeCompare(R.up(b.kelas), "id", { numeric: true }) || a.nama.localeCompare(b.nama, "id"))
                .map((s) => ({ nis: s.nis, nama: s.nama, kelas: s.kelas, foto: s.foto || "", kode: kodeUntuk(s.nis) }));
            return res.status(200).json({ success: true, kelasTersedia: boleh, luas, data });
        }

        let body = req.body;
        if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
        const nis = urai(body && body.kode);
        if (!nis) return res.status(422).json({ success: false, message: "QR tidak dikenali atau bukan kartu siswa SMAN 1 Sooko." });
        const s = siswa.find((x) => x.nis === nis);
        if (!s) return res.status(404).json({ success: false, message: "Siswa tidak ditemukan di Data Siswa (mungkin sudah tidak aktif)." });
        if (!boleh.includes(R.up(s.kelas))) return res.status(403).json({ success: false, message: "Siswa ini bukan dari kelas yang menjadi tanggung jawab akun Anda." });
        return res.status(200).json({ success: true, siswa: { nis: s.nis, nama: s.nama, kelas: s.kelas, foto: s.foto || "" } });
    } catch (e) {
        console.error("qr:", e && e.message);
        return res.status(500).json({ success: false, message: "Data siswa belum dapat dimuat. Coba lagi." });
    }
};
module.exports.kodeUntuk = kodeUntuk;
module.exports.urai = urai;
