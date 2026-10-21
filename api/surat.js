/*
==========================================================
/api/surat
POST (ADMIN, Authorization: Bearer) { nis }
     -> { url, waUrl|null, hasWa, nama, tingkat }
     Membuat tautan surat bertanda tangan (berlaku 14 hari) dan, bila kolom WA_Ortu
     di Data_Siswa terisi, tautan wa.me berisi pesan siap kirim. Nomor WA tidak pernah
     dikirim ke browser sebagai data mentah.
GET  ?t=<token> (PUBLIK, tanpa login; token tidak bisa ditebak dan kedaluwarsa)
     -> halaman surat (HTML) untuk dibuka / dicetak / disimpan PDF oleh orang tua.
==========================================================
*/
const K = require("./_lib/kesiswaan");
const S = require("./_lib/surat");
const sheets = require("./_lib/sheets");
const { verifyAdmin, signingSecret, upstash } = require("./admin-auth");

const DAILY_LIMIT = () => Math.max(1, Number(process.env.WA_DAILY_LIMIT) || 20);
const clipTxt = (v, n) => String(v || "").replace(/[\r\n]+/g, " ").trim().slice(0, n);
const safeCell = (v) => (/^[=+\-@]/.test(v) ? "'" + v : v);

const page = (code, title, msg) => `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="font:16px Arial,sans-serif;max-width:480px;margin:15vh auto;padding:0 20px;text-align:center"><h1 style="font-size:20px">${title}</h1><p>${msg}</p></body></html>`;

function readBody(req) {
    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    return body && typeof body === "object" ? body : {};
}

module.exports = async (req, res) => {

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.setHeader("Referrer-Policy", "no-referrer");

    try {

        if (req.method === "GET") {

            const claim = S.verifyLink(req.query && req.query.t, signingSecret());
            res.setHeader("Content-Type", "text/html; charset=utf-8");

            if (!claim) return res.status(410).send(page(410, "Tautan tidak berlaku", "Tautan surat ini sudah kedaluwarsa atau tidak valid. Silakan hubungi SMAN 1 Sooko."));

            const [siswa, violations] = await Promise.all([K.loadSiswa(), K.loadPelanggaran()]);
            const s = siswa.find((x) => x.nis === claim.n);
            const issued = new Date(claim.iat * 1000).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
            const start = K.academicYearStart(issued);
            const from = `${start}-07-01`, to = `${start + 1}-06-30`;
            const rows = violations.filter((v) => v.nis === claim.n && v.tanggal >= from && v.tanggal <= to).sort((a, b) => a.tanggal.localeCompare(b.tanggal));

            if (!s || !rows.length) return res.status(404).send(page(404, "Surat tidak ditemukan", "Data untuk surat ini tidak ditemukan. Silakan hubungi SMAN 1 Sooko."));

            const poin = rows.reduce((t, x) => t + x.poin, 0);
            return res.status(200).send(S.letterHTML({ nis: s.nis, nama: s.nama, kelas: s.kelas, rows, poin, t: K.tingkatFor(poin), today: issued, ayLabel: K.academicYearLabel(start), jadwal: claim.j ? { d: claim.j.d, w: claim.j.w, r: claim.j.r } : null, nomor: claim.no || "" }));   // jadwal ikut tertandatangani di token
        }

        if (req.method === "POST") {

            const auth = verifyAdmin(req, ["komisi", "kesiswaan"]);
            if (!auth.ok) return res.status(auth.forbidden ? 403 : 401).json({ success: false, message: auth.forbidden ? "Akun ini tidak memiliki izin untuk fitur ini." : "Sesi Komisi Disiplin tidak valid. Silakan masuk lagi." });

            const body = readBody(req);
            const nis = K.cleanNIS(body.nis);
            const kirim = body.kirim === true;     // true = guru akan mengirim lewat WhatsApp -> dicatat & dibatasi per hari
            const [siswa, violations] = await Promise.all([K.loadSiswa(), K.loadPelanggaran()]);
            const s = siswa.find((x) => x.nis === nis);
            if (!s) return res.status(404).json({ success: false, message: "Siswa dengan NIS itu tidak ditemukan." });

            const today = K.todayWIB();
            const start = K.academicYearStart(today);
            const poin = violations.filter((v) => v.nis === nis && v.tanggal >= `${start}-07-01` && v.tanggal <= `${start + 1}-06-30`).reduce((t, x) => t + x.poin, 0);
            const t = K.tingkatFor(poin);
            if (K.tatib.tingkat.indexOf(t) < 1) return res.status(400).json({ success: false, message: `Poin ${s.nama} baru ${poin}; surat tersedia mulai tingkat ${K.tatib.tingkat[1].label}.` });

            const jd = S.cekJadwal(body.jadwal, today);
            if (jd.error) return res.status(400).json({ success: false, message: jd.error });

            const penangani = safeCell(clipTxt(auth.nama || auth.username || "admin", 80));

            // Pengiriman dibuat bertahap: dicatat di tab Pembinaan (status "Surat dikirim") dan dibatasi per guru per hari
            // agar nomor WhatsApp tidak dianggap spam. Kirim ulang ke siswa & tingkat yang sama di hari yang sama tidak dihitung.
            if (kirim && sheets.canWrite()) {
                const log = await K.loadPembinaan();
                const sentToday = log.filter((x) => x.tanggal === today && x.status === "Surat dikirim");
                const again = sentToday.some((x) => x.nis === nis && x.tingkat === t.label);
                const advanced = log.some((x) => x.nis === nis && x.tingkat === t.label && x.tanggal >= `${start}-07-01` && (x.status === "Dipanggil" || x.status === "Selesai"));
                if (!again && !advanced) {
                    const mine = sentToday.filter((x) => x.penangani === penangani).length;
                    if (mine >= DAILY_LIMIT()) return res.status(429).json({ success: false, message: `Batas ${DAILY_LIMIT()} surat WhatsApp per guru per hari sudah tercapai (agar nomor tidak diblokir WhatsApp). Lanjutkan besok.` });
                    const jam = new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Jakarta" });
                    await sheets.appendRow("Pembinaan", [`${today} ${jam}`, s.nis, safeCell(s.nama), s.kelas, t.label, "Surat dikirim", `Via WhatsApp · hadir ${jd.d} ${jd.w} · ${jd.r}`, penangani, ""]);
                }
            }

            const iat = Math.floor(Date.now() / 1000);
            const no = await S.nomorSurat(upstash, nis, t.label, jd.d).catch(() => null);   // urut per tahun; sama untuk surat yang sama
            const token = S.signLink({ k: "surat", n: nis, iat, exp: iat + S.TTL_DAYS * 86400, j: { d: jd.d, w: jd.w, r: jd.r }, no: no || "" }, signingSecret());
            const host = String(req.headers["x-forwarded-host"] || req.headers.host || "kedisiplinan.sman1sooko.sch.id").split(",")[0];
            const proto = String(req.headers["x-forwarded-proto"] || (/^(localhost|127\.)/.test(host) ? "http" : "https")).split(",")[0];
            const url = `${proto}://${host}/api/surat?t=${token}`;

            const isSP = /^Surat Peringatan/.test(t.label);
            const pesan = `Assalamualaikum Bapak/Ibu, kami dari SMAN 1 Sooko (Komisi Disiplin Sekolah) menyampaikan ${isSP ? t.label : "panggilan orang tua/wali"} untuk putra/putri Bapak/Ibu, ${s.nama} (kelas ${s.kelas}). Suratnya dapat dibuka dan dicetak melalui tautan berikut (berlaku ${S.TTL_DAYS} hari):\n${url}\n\nMohon kehadiran Bapak/Ibu pada ${S.hariTanggal(jd.d)}, pukul ${jd.w} WIB, di ${jd.r} SMAN 1 Sooko. Terima kasih.\n— ${auth.nama || auth.username || "Komisi Disiplin"}, SMAN 1 Sooko`;

            return res.status(200).json({
                success: true,
                data: { url, hasWa: !!s.wa, waUrl: s.wa ? `https://wa.me/${s.wa}?text=${encodeURIComponent(pesan)}` : null, nama: s.nama, tingkat: t.label }
            });
        }

        res.setHeader("Allow", "GET, POST");
        return res.status(405).json({ success: false, message: "Metode tidak diizinkan." });

    } catch (err) {
        if (req.method === "GET") { res.setHeader("Content-Type", "text/html; charset=utf-8"); return res.status(500).send(page(500, "Terjadi kesalahan", "Surat belum dapat ditampilkan. Coba lagi beberapa saat.")); }
        return res.status(500).json({ success: false, message: err.message || "Terjadi kesalahan pada server." });
    }
};
