/*
Rekomendasi mingguan untuk WALI KELAS. Aturan sederhana & transparan (tanpa AI, tanpa prediksi):
data kelas sendiri minggu ini vs minggu lalu, siswa mendekati ambang sanksi, tindak lanjut yang belum ada,
pola pelanggaran berulang, dan siswa yang layak diapresiasi. Hanya anjuran; tidak ada yang dikirim / diubah otomatis.
*/
const K = require("./kesiswaan");

const DAY = 86400000;
const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const SISA_MENDEKATI = 10;     // poin menuju tingkat berikutnya
const ULANG_MIN = 3;           // kasus jenis yang sama dalam 30 hari
const LONJAKAN_POIN = 15;      // poin dalam satu minggu

const up = (k) => String(k || "").toUpperCase().trim().replace(/\s+/g, "-");
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const addDays = (d, n) => iso(Date.parse(d + "T00:00:00Z") + n * DAY);
const fmt = (d) => { const [y, m, dd] = d.split("-").map(Number); return `${dd} ${BULAN[m - 1]} ${y}`; };

async function daftarKelas() {
    const siswa = await K.loadSiswa();
    return [...new Set(siswa.map((s) => up(s.kelas)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "id", { numeric: true }));
}

async function hitung(kelas) {
    const target = up(kelas);
    const [siswaAll, violations, log] = await Promise.all([K.loadSiswa(), K.loadPelanggaran(), K.loadPembinaan()]);
    const today = K.todayWIB();
    const start = K.academicYearStart(today);
    const from = `${start}-07-01`, to = `${start + 1}-06-30`;
    const tingkat = K.tatib.tingkat;

    // 7 hari terakhir (termasuk hari ini) dibanding 7 hari sebelumnya, agar berarti di hari apa pun dibuka
    const senin = addDays(today, -6);
    const seninLalu = addDays(today, -13), sdLalu = addDays(today, -7);
    const tiga0 = addDays(today, -30);

    const siswa = siswaAll.filter((s) => up(s.kelas) === target);
    const nisSet = new Set(siswa.map((s) => s.nis));
    const ta = violations.filter((v) => nisSet.has(v.nis) && v.tanggal >= from && v.tanggal <= to);
    const minggu = ta.filter((v) => v.tanggal >= senin && v.tanggal <= today);
    const laluSd = ta.filter((v) => v.tanggal >= seninLalu && v.tanggal <= sdLalu);

    const kartu = [];
    const apresiasi = [];
    siswa.forEach((s) => {
        const rows = ta.filter((v) => v.nis === s.nis);
        if (!rows.length) { apresiasi.push(s.nama); return; }
        const poin = rows.reduce((a, v) => a + v.poin, 0);
        const t = K.tingkatFor(poin), ti = tingkat.indexOf(t);
        const poinMg = rows.filter((v) => v.tanggal >= senin).reduce((a, v) => a + v.poin, 0);
        const alasan = [], saran = [];
        let level = 3;

        if (ti >= 1) {
            const logs = log.filter((l) => l.nis === s.nis && l.tingkat === t.label && l.tanggal >= from && l.tanggal <= to);
            const st = logs.length ? logs[logs.length - 1].status : "Belum";
            if (st === "Belum" || !st) {
                level = 1; alasan.push(`Sudah mencapai ${t.label} (${poin} poin) dan belum ada tindak lanjut.`);
                saran.push(`${t.tindakan} Koordinasikan dengan Guru BK / Komisi Disiplin.`);
            } else if (st !== "Selesai") {
                level = Math.min(level, 2); alasan.push(`${t.label} (${poin} poin), tindak lanjut: ${st}.`);
                saran.push("Pantau perkembangan minggu depan dan ajak bicara secara berkala.");
            }
        }
        const next = tingkat[ti + 1];
        if (next) {
            const sisa = next.min - poin;
            if (sisa <= SISA_MENDEKATI && sisa > 0) {
                level = Math.min(level, 2); alasan.push(`Tinggal ${sisa} poin lagi menuju ${next.label}.`);
                saran.push("Ajak bicara dan beri pembinaan ringan sebelum poinnya bertambah.");
            }
        }
        const kodeCnt = new Map();
        rows.filter((v) => v.tanggal >= tiga0).forEach((v) => { const e = kodeCnt.get(v.jenis) || 0; kodeCnt.set(v.jenis, e + 1); });
        kodeCnt.forEach((n, jenis) => {
            if (n >= ULANG_MIN) {
                level = Math.min(level, 2); alasan.push(`${n} kali “${jenis}” dalam 30 hari terakhir.`);
                saran.push(`Cari tahu penyebab “${jenis}” yang berulang (kondisi di rumah, teman, kesehatan) dan buat kesepakatan dengan siswa.`);
            }
        });
        if (poinMg >= LONJAKAN_POIN) {
            level = Math.min(level, 2); alasan.push(`Menambah ${poinMg} poin hanya dalam 7 hari terakhir.`);
            saran.push("Lonjakan poin cepat: tanyakan apakah ada masalah baru.");
        }
        if (alasan.length) kartu.push({ nis: s.nis, nama: s.nama, poin, tingkat: t.label, poinMinggu: poinMg, level, alasan, saran: [...new Set(saran)] });
    });
    kartu.sort((a, b) => a.level - b.level || b.poin - a.poin || a.nama.localeCompare(b.nama, "id"));

    const jenisMg = new Map();
    minggu.forEach((v) => jenisMg.set(v.jenis, (jenisMg.get(v.jenis) || 0) + 1));
    const jenisTeratas = [...jenisMg.entries()].map(([jenis, jumlah]) => ({ jenis, jumlah })).sort((a, b) => b.jumlah - a.jumlah).slice(0, 3);
    const hariCnt = new Map();
    ta.forEach((v) => { const h = HARI[new Date(v.tanggal + "T00:00:00Z").getUTCDay()]; hariCnt.set(h, (hariCnt.get(h) || 0) + 1); });
    const hariTerbanyak = [...hariCnt.entries()].sort((a, b) => b[1] - a[1])[0];

    const kini = minggu.length, lalu = laluSd.length;
    const arah = kini > lalu ? "naik" : kini < lalu ? "turun" : "tetap";
    let ringkasan = kini === 0
        ? `Dalam 7 hari terakhir belum ada pelanggaran tercatat di kelas ${target}.`
        : `Dalam 7 hari terakhir ${kini} pelanggaran tercatat di kelas ${target}` + (lalu ? ` (${arah === "tetap" ? "sama dengan" : arah === "naik" ? "naik dari" : "turun dari"} ${lalu} pada 7 hari sebelumnya).` : " (7 hari sebelumnya belum ada).");
    if (jenisTeratas.length && kini) ringkasan += ` Yang tersering: ${jenisTeratas[0].jenis} (${jenisTeratas[0].jumlah}).`;

    return {
        kelas: target, hariIni: today, minggu: { dari: senin, sampai: today, label: `${fmt(senin)} s.d. ${fmt(today)}` },
        jumlahSiswa: siswa.length, ta: K.academicYearLabel(start),
        ringkas: { kasusMinggu: kini, kasusMingguLalu: lalu, arah, poinMinggu: minggu.reduce((a, v) => a + v.poin, 0), siswaTerlibatMinggu: new Set(minggu.map((v) => v.nis)).size, kasusTahunAjaran: ta.length },
        ringkasan, jenisTeratas, hariTerbanyak: hariTerbanyak ? { hari: hariTerbanyak[0], jumlah: hariTerbanyak[1] } : null,
        perhatian: kartu, apresiasi: { jumlah: apresiasi.length, nama: apresiasi.sort((a, b) => a.localeCompare(b, "id")).slice(0, 12) },
        aturan: { sisaMendekati: SISA_MENDEKATI, ulangMin: ULANG_MIN, lonjakanPoin: LONJAKAN_POIN }
    };
}

module.exports = { hitung, daftarKelas, up };
