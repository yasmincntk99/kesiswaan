/*
KPI portal eksekutif. Semua angka AGREGAT (tanpa nama siswa) dan dihitung server dari Sheet.
Target KPI dibaca dari tab "Target_KPI" (Kode | Nama | Target | Arah) bila ada; jika tidak, memakai nilai contoh di bawah
(ditandai contoh pada keluaran) sehingga sekolah dapat mengubah target tanpa mengubah kode.
Arah: "min" = nilai harus >= target, "maks" = nilai harus <= target.
*/
const K = require("./kesiswaan");
const sheets = require("./sheets");

const DAY = 86400000;
const dayNum = (iso) => Math.floor(Date.parse(iso + "T00:00:00Z") / DAY);
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
const r1 = (n) => Math.round(n * 10) / 10;

const DEFAULT_TARGET = {
    siswa_melanggar_pct: { nama: "Siswa yang pernah melanggar", satuan: "%", target: 30, arah: "maks" },
    tren_pct: { nama: "Perubahan pelanggaran vs bulan lalu", satuan: "%", target: -10, arah: "maks" },
    tindak_lanjut_pct: { nama: "Kasus SP1+ yang sudah ditindaklanjuti", satuan: "%", target: 90, arah: "min" },
    hari_tindak_lanjut: { nama: "Rata-rata hari sampai ditindaklanjuti", satuan: "hari", target: 7, arah: "maks" },
    terlambat: { nama: "Kasus terlambat ditangani (>3 hari)", satuan: "siswa", target: 0, arah: "maks" },
    wa_lengkap_pct: { nama: "Siswa dengan nomor WA orang tua", satuan: "%", target: 90, arah: "min" },
    data_lengkap_pct: { nama: "Siswa dengan foto & nomor WA lengkap", satuan: "%", target: 90, arah: "min" }
};

async function loadTargets() {
    const out = {}; let custom = false;
    Object.entries(DEFAULT_TARGET).forEach(([k, v]) => { out[k] = { ...v, contoh: true }; });
    if (sheets.mode() === "demo") return out;
    try {
        const rows = await sheets.readTab("Target_KPI");
        rows.slice(1).forEach((r) => {
            const kode = String(r[0] || "").trim(), t = Number(String(r[2] || "").replace(",", "."));
            if (!out[kode] || !Number.isFinite(t) || String(r[2] || "").trim() === "") return;
            const arah = /^(min|maks)$/i.test(String(r[3] || "").trim()) ? String(r[3]).trim().toLowerCase() : out[kode].arah;
            out[kode] = { ...out[kode], nama: String(r[1] || "").trim() || out[kode].nama, target: t, arah, contoh: false };
            custom = true;
        });
    } catch (e) { /* tab belum ada: pakai contoh */ }
    return out;
}

function status(v, t) {
    if (v === null || v === undefined || Number.isNaN(v)) return "info";
    if (t.arah === "min") return v >= t.target ? "ok" : v >= t.target * 0.8 ? "warn" : "bad";
    return v <= t.target ? "ok" : v <= t.target + Math.max(1, Math.abs(t.target) * 0.25) ? "warn" : "bad";
}

async function hitung() {
    const [siswa, violations, log, targets] = await Promise.all([K.loadSiswa(), K.loadPelanggaran(), K.loadPembinaan(), loadTargets()]);
    const today = K.todayWIB();
    const start = K.academicYearStart(today);
    const from = `${start}-07-01`, to = `${start + 1}-06-30`;
    const t0 = dayNum(today);
    const tingkat = K.tatib.tingkat;

    const ta = violations.filter((v) => v.tanggal >= from && v.tanggal <= to).sort((a, b) => a.tanggal.localeCompare(b.tanggal));
    const jumlahSiswa = siswa.length;

    // ---- per siswa ----
    const perSiswa = new Map();
    ta.forEach((v) => { if (!perSiswa.has(v.nis)) perSiswa.set(v.nis, []); perSiswa.get(v.nis).push(v); });
    const melanggar = perSiswa.size;

    // ---- distribusi tingkat + tindak lanjut ----
    const distTingkat = tingkat.map((t) => ({ label: t.label, warna: t.warna, jumlah: 0 }));
    const status4 = { Belum: 0, "Surat dikirim": 0, Dipanggil: 0, Selesai: 0 };
    let perlu = 0, ditangani = 0, terlambat = 0; const hariList = [];
    perSiswa.forEach((rows, nis) => {
        const poin = rows.reduce((s, x) => s + x.poin, 0);
        const t = K.tingkatFor(poin), ti = tingkat.indexOf(t);
        distTingkat[ti].jumlah++;
        if (ti < 1) return;
        perlu++;
        let cum = 0, since = rows[0].tanggal;
        for (const x of rows) { cum += x.poin; if (cum >= t.min) { since = x.tanggal; break; } }
        const logs = log.filter((l) => l.nis === nis && l.tingkat === t.label && l.tanggal >= from && l.tanggal <= to);
        const handled = logs.find((l) => l.status === "Dipanggil" || l.status === "Selesai");
        const last = logs[logs.length - 1];
        const st = last ? last.status : "Belum";
        if (status4[st] !== undefined) status4[st]++; else status4.Belum++;
        if (handled) { ditangani++; hariList.push(Math.max(0, dayNum(handled.tanggal) - dayNum(since))); }
        else if (t0 - dayNum(since) > 3) terlambat++;
    });
    const tanpaPelanggaran = Math.max(0, jumlahSiswa - melanggar);

    // ---- tren bulanan (Jul..Jun) ----
    const bulan = [];
    for (let i = 0; i < 12; i++) { const m = ((6 + i) % 12) + 1, y = m >= 7 ? start : start + 1; bulan.push({ key: `${y}-${String(m).padStart(2, "0")}`, label: ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"][m - 1], jumlah: 0, poin: 0 }); }
    ta.forEach((v) => { const b = bulan.find((x) => x.key === v.tanggal.slice(0, 7)); if (b) { b.jumlah++; b.poin += v.poin; } });
    const bulanIniKey = today.slice(0, 7);
    const hariKe = Number(today.slice(8, 10));
    const prev = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 2, 1));
    const prevKey = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}`;
    const cnt = (key, maxDay) => violations.filter((v) => v.tanggal.slice(0, 7) === key && Number(v.tanggal.slice(8, 10)) <= maxDay).length;
    const iniSd = cnt(bulanIniKey, hariKe), laluSd = cnt(prevKey, hariKe);
    const trenPct = laluSd ? r1(((iniSd - laluSd) / laluSd) * 100) : null;

    // ---- kelas & jenis teratas ----
    const siswaPerKelas = new Map();
    siswa.forEach((s) => siswaPerKelas.set(s.kelas, (siswaPerKelas.get(s.kelas) || 0) + 1));
    const kelasMap = new Map();
    ta.forEach((v) => kelasMap.set(v.kelas, (kelasMap.get(v.kelas) || 0) + 1));
    const kelasTeratas = [...kelasMap.entries()].filter(([k]) => k).map(([kelas, jumlah]) => ({ kelas, jumlah, per100: pct(jumlah, siswaPerKelas.get(kelas) || 0) * 1 }))
        .sort((a, b) => b.per100 - a.per100 || b.jumlah - a.jumlah).slice(0, 5);
    const jenisMap = new Map();
    ta.forEach((v) => jenisMap.set(v.jenis, (jenisMap.get(v.jenis) || 0) + 1));
    const jenisTeratas = [...jenisMap.entries()].map(([jenis, jumlah]) => ({ jenis, jumlah })).sort((a, b) => b.jumlah - a.jumlah).slice(0, 5);
    const kategori = ["Ringan", "Sedang", "Berat"].map((k) => ({ kategori: k, jumlah: ta.filter((v) => v.kategori === k).length }));

    // ---- komunikasi & kualitas data ----
    const waAda = siswa.filter((s) => s.wa).length;
    const lengkap = siswa.filter((s) => s.wa && s.foto).length;
    const suratTerkirim = log.filter((l) => l.status === "Surat dikirim" && l.tanggal >= from && l.tanggal <= to).length;

    // ---- KPI + status terhadap target ----
    const nilai = {
        siswa_melanggar_pct: pct(melanggar, jumlahSiswa),
        tren_pct: trenPct,
        tindak_lanjut_pct: perlu ? pct(ditangani, perlu) : null,
        hari_tindak_lanjut: hariList.length ? r1(hariList.reduce((a, b) => a + b, 0) / hariList.length) : null,
        terlambat,
        wa_lengkap_pct: pct(waAda, jumlahSiswa),
        data_lengkap_pct: pct(lengkap, jumlahSiswa)
    };
    const kpi = Object.keys(DEFAULT_TARGET).map((kode) => {
        const t = targets[kode], v = nilai[kode];
        return { kode, nama: t.nama, nilai: v, satuan: t.satuan, target: t.target, arah: t.arah, contoh: t.contoh, status: status(v, t) };
    });

    return {
        ta: K.academicYearLabel(start), hariIni: today, jumlahSiswa,
        ringkas: { totalPelanggaran: ta.length, totalPoin: ta.reduce((s, v) => s + v.poin, 0), siswaMelanggar: melanggar, bulanIni: iniSd, bulanLaluSdTgl: laluSd, suratTerkirim, perluTindakLanjut: perlu, ditangani },
        kpi, tren: bulan, distTingkat, tanpaPelanggaran, statusPembinaan: status4,
        kelasTeratas, jenisTeratas, kategori,
        targetContoh: kpi.some((k) => k.contoh)
    };
}

module.exports = { hitung, status, DEFAULT_TARGET };
