/*
==========================================================
/api/ringkasan  (KHUSUS ADMIN -- header Authorization: Bearer)
GET -> ringkasan harian Komisi Disiplin + pemeriksaan data (dihitung saat dibuka, tanpa penjadwal):
  { hariIni, hitung, baru[], terlambat[], cek: { ... }, pesan }
  baru      = siswa yang naik ke tingkat SP1+ dalam 2 hari terakhir
  terlambat = status "Belum" > 3 hari sejak naik tingkat, atau "Surat dikirim" > 7 hari tanpa dipanggil
  cek       = NIS ganda, baris tanpa kelas/NIS, nomor WA salah format, pelanggaran dengan NIS tak dikenal,
              siswa perlu tindak lanjut yang nomor WA-nya kosong
  pesan     = teks ringkasan siap kirim lewat WhatsApp (tanpa nomor orang tua; hanya untuk pengurus)
==========================================================
*/
const K = require("../kesiswaan");
const sheets = require("../sheets");
const { verifyAdmin } = require("../../admin-auth");

const DAY = 86400000;
const dayNum = (iso) => Math.floor(Date.parse(iso + "T00:00:00Z") / DAY);
const LIMIT = 50;

module.exports = async (req, res) => {

    res.setHeader("Cache-Control", "no-store");

    const auth = verifyAdmin(req);
    if (!auth.ok) return res.status(auth.forbidden ? 403 : 401).json({ success: false, message: auth.forbidden ? "Akun ini tidak memiliki izin untuk fitur ini." : "Sesi Komisi Disiplin tidak valid. Silakan masuk lagi." });
    if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).json({ success: false, message: "Metode tidak diizinkan." }); }

    try {

        const [siswa, violations, log] = await Promise.all([K.loadSiswa(), K.loadPelanggaran(), K.loadPembinaan()]);
        const today = K.todayWIB();
        const start = K.academicYearStart(today);
        const from = `${start}-07-01`, to = `${start + 1}-06-30`;
        const tingkat = K.tatib.tingkat;
        const t0 = dayNum(today);

        const byNis = new Map(siswa.map((s) => [s.nis, s]));
        const perSiswa = new Map();
        violations.filter((v) => v.tanggal >= from && v.tanggal <= to).sort((a, b) => a.tanggal.localeCompare(b.tanggal)).forEach((v) => {
            if (!perSiswa.has(v.nis)) perSiswa.set(v.nis, []);
            perSiswa.get(v.nis).push(v);
        });

        const perlu = [];
        perSiswa.forEach((rows, nis) => {
            const poin = rows.reduce((t, x) => t + x.poin, 0);
            const t = K.tingkatFor(poin);
            if (tingkat.indexOf(t) < 1) return;
            let cum = 0, since = rows[0].tanggal;
            for (const x of rows) { cum += x.poin; if (cum >= t.min) { since = x.tanggal; break; } }
            const logs = log.filter((l) => l.nis === nis && l.tingkat === t.label && l.tanggal >= from && l.tanggal <= to);
            const last = logs[logs.length - 1];
            const s = byNis.get(nis);
            perlu.push({
                nis, nama: (s && s.nama) || rows[rows.length - 1].nama, kelas: (s && s.kelas) || rows[rows.length - 1].kelas,
                tingkat: t.label, poin, status: last ? last.status : "Belum", sejak: since, hari: t0 - dayNum(since),
                hariStatus: last ? t0 - dayNum(last.tanggal) : null, wa: !!(s && s.wa)
            });
        });

        const terbuka = perlu.filter((p) => p.status !== "Selesai");
        const baru = terbuka.filter((p) => p.hari <= 2).sort((a, b) => a.hari - b.hari);
        const terlambat = terbuka.filter((p) => (p.status === "Belum" && p.hari > 3) || (p.status === "Surat dikirim" && p.hariStatus > 7))
            .sort((a, b) => (b.status === "Belum" ? b.hari : b.hariStatus) - (a.status === "Belum" ? a.hari : a.hariStatus));

        const hitung = {
            hariIni: violations.filter((v) => v.tanggal === today).length,
            tujuhHari: violations.filter((v) => dayNum(v.tanggal) > t0 - 7 && v.tanggal <= today).length,
            perluTindakLanjut: terbuka.length,
            belum: terbuka.filter((p) => p.status === "Belum").length,
            suratDikirim: terbuka.filter((p) => p.status === "Surat dikirim").length,
            dipanggil: terbuka.filter((p) => p.status === "Dipanggil").length,
            selesai: perlu.length - terbuka.length,
            terlambat: terlambat.length
        };

        // Pemeriksaan data (tab mentah hanya tersedia di mode Sheets; demo memakai data yang sudah dimuat).
        const cek = { nisGanda: [], tanpaKelasAtauNis: 0, waSalah: [], pelanggaranNisTakDikenal: [], perluTanpaWa: [] };
        if (sheets.mode() !== "demo") {
            const raw = await sheets.readTab("Data_Siswa").catch(() => []);
            const seen = new Map();
            raw.slice(1).forEach((c, i) => {
                const [nis, nama, kelas, , , wa] = [0, 1, 2, 3, 4, 5].map((k) => String(c[k] === undefined || c[k] === null ? "" : c[k]).trim());
                if (!nis && !nama) return;
                if (!nis || !kelas) cek.tanpaKelasAtauNis++;
                const key = K.cleanNIS(nis);
                if (key) { if (!seen.has(key)) seen.set(key, []); seen.get(key).push(i + 2); }
                if (wa && !K.cleanWA(wa)) cek.waSalah.push({ nis: key, nama, baris: i + 2 });
            });
            seen.forEach((rows, nis) => { if (rows.length > 1) cek.nisGanda.push({ nis, baris: rows }); });
        }
        const unknown = new Map();
        violations.forEach((v) => { if (v.nis && !byNis.has(v.nis) && !unknown.has(v.nis)) unknown.set(v.nis, v.nama); });
        unknown.forEach((nama, nis) => cek.pelanggaranNisTakDikenal.push({ nis, nama }));
        cek.perluTanpaWa = terbuka.filter((p) => !p.wa).map((p) => ({ nis: p.nis, nama: p.nama, kelas: p.kelas }));
        ["nisGanda", "waSalah", "pelanggaranNisTakDikenal", "perluTanpaWa"].forEach((k) => { cek[k] = cek[k].slice(0, LIMIT); });

        const baris = (p) => `• ${p.nama} (${p.kelas}) — ${p.tingkat}, ${p.poin} poin${p.status !== "Belum" ? `, ${p.status.toLowerCase()}` : ""}`;
        const pesan = [
            `*Ringkasan Komisi Disiplin — SMAN 1 Sooko*`,
            `${today}`,
            ``,
            `Pelanggaran hari ini: ${hitung.hariIni} · 7 hari terakhir: ${hitung.tujuhHari}`,
            `Perlu tindak lanjut: ${hitung.perluTindakLanjut} siswa (belum ${hitung.belum}, surat dikirim ${hitung.suratDikirim}, dipanggil ${hitung.dipanggil})`,
            baru.length ? `\n*Baru naik tingkat (${baru.length}):*\n${baru.slice(0, 10).map(baris).join("\n")}` : "",
            terlambat.length ? `\n*Perlu segera ditindaklanjuti (${terlambat.length}):*\n${terlambat.slice(0, 10).map(baris).join("\n")}` : "",
            `\n— ${auth.nama || auth.username || "Komisi Disiplin"}`
        ].filter((x) => x !== "").join("\n");

        return res.status(200).json({ success: true, data: { hariIni: today, hitung, baru: baru.slice(0, LIMIT), terlambat: terlambat.slice(0, LIMIT), cek, pesan } });

    } catch (err) {
        return res.status(500).json({ success: false, message: err.message || "Terjadi kesalahan pada server.", detail: err.detail ? { ...err.detail, ...sheets.diagnostics() } : undefined });
    }
};
