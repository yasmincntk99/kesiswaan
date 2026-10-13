/*
==========================================================
SMANSASOO Kesiswaan Portal
Shared Library: model data + agregasi kedisiplinan
==========================================================
Tab spreadsheet yang dibaca:
  SISWA        NIS | NISN | Nama | Kelas
  PELANGGARAN  ID | Tanggal | NIS | Nama | Kelas | Kode | Jenis |
               Kategori | Poin | Sanksi | Pencatat | Catatan
  TATA_TERTIB  Kode | Jenis | Kategori | Poin
Tanpa GOOGLE_SHEET_ID -> data fiktif dari /data/sample-*.json.
==========================================================
*/

const sheets = require("./sheets");
const tatibFile = require("../../data/tata-tertib.json");

const TZ = "Asia/Jakarta";

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

function todayWIB() {
    return new Date().toLocaleDateString("en-CA", { timeZone: TZ }); // YYYY-MM-DD
}

/** Terima "2026-10-13", "13/10/2026", "13-10-2026" -> "2026-10-13" ("" jika tidak valid). */
function normDate(value) {
    const v = String(value || "").trim();
    let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    m = v.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/);
    if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return "";
}

const num = (v) => {
    const n = Number(String(v || "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
};

const cleanNIS = (v) => String(v || "").trim().replace(/\.0+$/, "");

/** Tahun ajaran dimulai 1 Juli. */
function academicYearStart(dateStr) {
    const [y, m] = dateStr.split("-").map(Number);
    return m >= 7 ? y : y - 1;
}

function academicYearLabel(startYear) {
    return `${startYear}/${startYear + 1}`;
}

async function loadTatib() {
    if (sheets.mode() === "demo") return tatibFile.pelanggaran;
    try {
        const list = sheets.rowsToObjects(await sheets.readTab("TATA_TERTIB"))
            .map((r) => ({ kode: r.kode, jenis: r.jenis, kategori: r.kategori, poin: num(r.poin) }))
            .filter((r) => r.kode && r.jenis);
        return list.length ? list : tatibFile.pelanggaran;
    } catch (e) {
        return tatibFile.pelanggaran;
    }
}

async function loadSiswa() {
    if (sheets.mode() === "demo") return require("../../data/sample-siswa.json");
    return sheets.rowsToObjects(await sheets.readTab("SISWA"))
        .map((r) => ({ nis: cleanNIS(r.nis), nisn: cleanNIS(r.nisn), nama: r.nama, kelas: r.kelas }))
        .filter((r) => r.nis || r.nisn);
}

async function loadPelanggaran() {
    let rows;
    if (sheets.mode() === "demo") {
        rows = require("../../data/sample-pelanggaran.json");
    } else {
        rows = sheets.rowsToObjects(await sheets.readTab("PELANGGARAN")).map((r) => ({
            id: r.id, tanggal: r.tanggal, nis: r.nis, nama: r.nama, kelas: r.kelas,
            kode: r.kode, jenis: r.jenis, kategori: r.kategori, poin: r.poin,
            sanksi: r.sanksi, pencatat: r.pencatat, catatan: r.catatan
        }));
    }
    return rows
        .map((r) => ({
            id: String(r.id || ""),
            tanggal: normDate(r.tanggal),
            nis: cleanNIS(r.nis),
            nama: String(r.nama || ""),
            kelas: String(r.kelas || ""),
            kode: String(r.kode || ""),
            jenis: String(r.jenis || ""),
            kategori: String(r.kategori || "") || "Ringan",
            poin: num(r.poin),
            sanksi: String(r.sanksi || ""),
            pencatat: String(r.pencatat || ""),
            catatan: String(r.catatan || "")
        }))
        .filter((r) => r.tanggal);
}

function tingkatFor(points) {
    const list = tatibFile.tingkat;
    return list.find((t) => points >= t.min && (t.max === null || points <= t.max)) || list[0];
}

/** Rentang periode -> { from, to, label } (tanggal inklusif, string YYYY-MM-DD). */
function periodRange(periode, today) {
    const [y, m] = today.split("-").map(Number);
    const ay = academicYearStart(today);
    switch (periode) {
        case "bulan": {
            const mm = String(m).padStart(2, "0");
            return { from: `${y}-${mm}-01`, to: `${y}-${mm}-31`, label: `${BULAN[m - 1]} ${y}` };
        }
        case "semester": {
            const ganjil = m >= 7;
            return ganjil
                ? { from: `${ay}-07-01`, to: `${ay}-12-31`, label: `Semester Ganjil ${academicYearLabel(ay)}` }
                : { from: `${ay + 1}-01-01`, to: `${ay + 1}-06-30`, label: `Semester Genap ${academicYearLabel(ay)}` };
        }
        case "semua":
            return { from: "0000-01-01", to: "9999-12-31", label: "Semua data" };
        default:
            return { from: `${ay}-07-01`, to: `${ay + 1}-06-30`, label: `Tahun Ajaran ${academicYearLabel(ay)}` };
    }
}

const tingkatOf = (kelas) => {
    const m = String(kelas).trim().toUpperCase().match(/^(XII|XI|X)\b/);
    return m ? m[1] : "Lainnya";
};

/** Agregat PUBLIK -- tidak memuat nama siswa. */
function aggregate(violations, siswa, periode) {
    const today = todayWIB();
    const range = periodRange(periode, today);
    const inRange = violations.filter((v) => v.tanggal >= range.from && v.tanggal <= range.to);

    // poin kumulatif per siswa dihitung dalam tahun ajaran berjalan
    const ayRange = periodRange("tahun", today);
    const perSiswa = new Map();
    violations
        .filter((v) => v.tanggal >= ayRange.from && v.tanggal <= ayRange.to)
        .forEach((v) => perSiswa.set(v.nis, (perSiswa.get(v.nis) || 0) + v.poin));

    const threshold = tatibFile.tingkat[1].min;
    const perluPembinaan = [...perSiswa.values()].filter((p) => p >= threshold).length;

    const countBy = (arr, keyFn) => {
        const map = new Map();
        arr.forEach((v) => { const k = keyFn(v); map.set(k, (map.get(k) || 0) + 1); });
        return map;
    };

    // tren: 12 bulan terakhir yang memuat data (maks. 12 titik) dalam tahun ajaran / semua
    const monthly = countBy(inRange, (v) => v.tanggal.slice(0, 7));
    const months = [...monthly.keys()].sort();
    const perBulan = months.map((k) => {
        const [yy, mm] = k.split("-").map(Number);
        return { key: k, label: `${BULAN[mm - 1]} ${String(yy).slice(2)}`, jumlah: monthly.get(k) };
    });

    const kategoriMap = countBy(inRange, (v) => v.kategori);
    const perKategori = ["Ringan", "Sedang", "Berat"].map((k) => ({ kategori: k, jumlah: kategoriMap.get(k) || 0 }));

    const topJenis = [...countBy(inRange, (v) => v.jenis).entries()]
        .map(([jenis, jumlah]) => {
            const sample = inRange.find((v) => v.jenis === jenis);
            return { jenis, jumlah, kategori: sample ? sample.kategori : "" };
        })
        .sort((a, b) => b.jumlah - a.jumlah).slice(0, 6);

    const perKelas = [...countBy(inRange, (v) => v.kelas).entries()]
        .map(([kelas, jumlah]) => ({ kelas, jumlah }))
        .sort((a, b) => b.jumlah - a.jumlah).slice(0, 8);

    const tingkatMap = countBy(inRange, (v) => tingkatOf(v.kelas));
    const perTingkat = ["X", "XI", "XII"].map((t) => ({ tingkat: t, jumlah: tingkatMap.get(t) || 0 }));

    const thisMonth = periodRange("bulan", today);
    const prevMonthDate = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 2, 1));
    const pm = `${prevMonthDate.getUTCFullYear()}-${String(prevMonthDate.getUTCMonth() + 1).padStart(2, "0")}`;
    const bulanIni = violations.filter((v) => v.tanggal >= thisMonth.from && v.tanggal <= thisMonth.to).length;
    const bulanLalu = violations.filter((v) => v.tanggal.slice(0, 7) === pm).length;

    const recent = [...violations]
        .sort((a, b) => (a.tanggal < b.tanggal ? 1 : a.tanggal > b.tanggal ? -1 : (a.id < b.id ? 1 : -1)))
        .slice(0, 8)
        .map((v) => ({ tanggal: v.tanggal, kelas: v.kelas, jenis: v.jenis, kategori: v.kategori, poin: v.poin }));

    const tingkatDist = tatibFile.tingkat.map((t) => ({
        label: t.label,
        warna: t.warna,
        jumlah: [...perSiswa.values()].filter((p) => p >= t.min && (t.max === null || p <= t.max)).length
    }));

    return {
        periode: { key: periode, label: range.label, from: range.from, to: range.to },
        diperbarui: today,
        kpi: {
            total: inRange.length,
            siswaTerlibat: new Set(inRange.map((v) => v.nis)).size,
            totalSiswa: siswa.length,
            totalPoin: inRange.reduce((s, v) => s + v.poin, 0),
            perluPembinaan,
            bulanIni,
            bulanLalu,
            beratPeriode: inRange.filter((v) => v.kategori === "Berat").length
        },
        perBulan, perKategori, topJenis, perKelas, perTingkat, tingkatDist, recent
    };
}

module.exports = {
    todayWIB, normDate, cleanNIS, num,
    loadTatib, loadSiswa, loadPelanggaran,
    tingkatFor, aggregate, tatib: tatibFile,
    academicYearStart, academicYearLabel, periodRange
};
