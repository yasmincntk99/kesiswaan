/*
==========================================================
SMANSASOO Kesiswaan Portal
Shared Library: model data + agregasi kedisiplinan
==========================================================
Tab spreadsheet (sama dengan skema Apps Script lama; dibaca per POSISI
kolom, baris 1 = header):
  Data_Siswa         NIS | Nama | Kelas | Foto (URL/Drive)
  Master_Pelanggaran Kode | Nama | Poin | Kategori (opsional)
  Input_Pelanggaran  Timestamp | NIS | Nama | Kelas | Jenis | Poin | Keterangan
                     | Kode | Sanksi | Pencatat | ClientID   (kolom 8-11 opsional,
                     ditambahkan portal; Apps Script lama tetap kompatibel)
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
    if (m) {
        // Default dd/mm/yyyy (locale Indonesia); jika bagian kedua > 12 berarti mm/dd/yyyy.
        const [a, b] = [Number(m[1]), Number(m[2])];
        const [d, mo] = b > 12 && a <= 12 ? [b, a] : [a, b];
        return `${m[3]}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
    return "";
}

const num = (v) => {
    const n = Number(String(v || "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
};

/** "0812-3456-789" / "+62 812…" / "812…" -> "62812…" (format wa.me); "" bila tidak masuk akal. */
function cleanWA(v) {
    let d = String(v || "").replace(/\D/g, "");
    if (d.startsWith("00")) d = d.slice(2);
    if (d.startsWith("0")) d = "62" + d.slice(1);
    else if (d.startsWith("8")) d = "62" + d;
    return /^62\d{8,13}$/.test(d) ? d : "";
}

const cleanNIS = (v) => String(v || "").trim().replace(/\.0+$/, "");

/** Tahun ajaran dimulai 1 Juli. */
function academicYearStart(dateStr) {
    const [y, m] = dateStr.split("-").map(Number);
    return m >= 7 ? y : y - 1;
}

function academicYearLabel(startYear) {
    return `${startYear}/${startYear + 1}`;
}

/** Kategori dari poin bila kolom Kategori tidak ada (selaras tata-tertib.json). */
const kategoriByPoin = (p) => (p >= 40 ? "Berat" : p >= 10 ? "Sedang" : "Ringan");

const VALID_KAT = ["Ringan", "Sedang", "Berat"];

/** Baris data sebuah tab (tanpa header, tanpa baris kosong) -> [{ cells, row }]. */
function bodyRows(rows) {
    return rows.map((cells, i) => ({ cells, row: i + 1 })).slice(1)
        .filter((r) => r.cells.some((c) => String(c || "").trim() !== ""));
}
const cell = (cells, i) => String(cells[i] === undefined || cells[i] === null ? "" : cells[i]).trim();

/** Link Google Drive -> URL gambar langsung; hanya https yang diterima. */
function fotoUrl(v) {
    const raw = String(v || "").trim();
    const m = raw.match(/(?:\/d\/|[?&]id=)([A-Za-z0-9_-]{10,})/);
    if (m && /drive\.google\.com|docs\.google\.com|googleusercontent\.com/.test(raw)) return `https://lh3.googleusercontent.com/d/${m[1]}`;
    return /^https:\/\//i.test(raw) ? raw : "";
}

async function loadTatib() {
    if (sheets.mode() === "demo") return tatibFile.pelanggaran;
    try {
        const list = bodyRows(await sheets.readTab("Master_Pelanggaran")).map(({ cells }) => {
            const kode = cell(cells, 0), poin = num(cell(cells, 2));
            const kat = VALID_KAT.find((k) => k.toLowerCase() === cell(cells, 3).toLowerCase());
            const ref = tatibFile.pelanggaran.find((t) => t.kode === kode);
            return { kode, jenis: cell(cells, 1), poin, kategori: kat || (ref && ref.kategori) || kategoriByPoin(poin) };
        }).filter((r) => r.kode && r.jenis);
        return list.length ? list : tatibFile.pelanggaran;
    } catch (e) {
        return tatibFile.pelanggaran;
    }
}

/** Nomor WA orang tua dari tab Data_Foto_Siswa (hasil formulir): NIS di kolom B, "Nomer WA Orang Tua (ayah)" di kolom G.
 *  Isian terbaru per NIS yang nomornya valid yang dipakai. */
async function loadWAForm() {
    const map = new Map();
    try {
        for (const { cells } of bodyRows(await sheets.readTab("Data_Foto_Siswa"))) {
            const nis = cleanNIS(cell(cells, 1)), wa = cleanWA(cell(cells, 6));
            if (nis && wa) map.set(nis, wa);
        }
    } catch (e) { /* tab belum ada / tidak terbaca: abaikan, pakai kolom WA_Ortu */ }
    return map;
}

async function loadSiswa() {
    if (sheets.mode() === "demo") return require("../../data/sample-siswa.json").map((s) => ({ foto: "", ...s }));
    const [raw, waForm] = await Promise.all([sheets.readTab("Data_Siswa"), loadWAForm()]);
    return bodyRows(raw)
        .map(({ cells, row }) => {
            const nis = cleanNIS(cell(cells, 0)) || `TANPA-NIS-${row}`;
            return {
                nis,
                nama: cell(cells, 1) || "(Belum ada nama)",
                kelas: cell(cells, 2),
                foto: fotoUrl(cell(cells, 3)),
                wa: waForm.get(nis) || cleanWA(cell(cells, 5))   // prioritas: formulir Data_Foto_Siswa, cadangan kolom F "WA_Ortu"
            };
        })
        .filter((r) => r.kelas);
}

async function loadPelanggaran() {
    let rows;
    if (sheets.mode() === "demo") {
        rows = require("../../data/sample-pelanggaran.json");
    } else {
        const [raw, tatib] = await Promise.all([sheets.readTab("Input_Pelanggaran"), loadTatib()]);
        rows = bodyRows(raw).map(({ cells, row }) => {
            const poin = num(cell(cells, 5)), jenis = cell(cells, 4);
            const kode = cell(cells, 7);
            const ref = tatib.find((t) => (kode && t.kode === kode) || t.jenis === jenis);
            return {
                id: "V" + String(row - 1).padStart(4, "0"), tanggal: cell(cells, 0), nis: cell(cells, 1), nama: cell(cells, 2),
                kelas: cell(cells, 3), kode: kode || (ref ? ref.kode : ""), jenis, kategori: ref ? ref.kategori : kategoriByPoin(poin),
                poin, sanksi: cell(cells, 8), pencatat: cell(cells, 9), catatan: cell(cells, 6), clientId: cell(cells, 10)
            };
        });
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
            catatan: String(r.catatan || ""),
            clientId: String(r.clientId || "")
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
    todayWIB, normDate, cleanNIS, cleanWA, num,
    loadTatib, loadSiswa, loadPelanggaran,
    tingkatFor, aggregate, tatib: tatibFile,
    academicYearStart, academicYearLabel, periodRange
};

/**
 * Catatan tindak lanjut pembinaan (tab "Pembinaan"):
 * Timestamp | NIS | Nama | Kelas | Tingkat | Status | Catatan | Penangani | ClientID
 * Tab belum dibuat / kosong -> daftar kosong (fitur tetap berjalan tanpa catatan).
 */
async function loadPembinaan() {
    if (sheets.mode() === "demo") return [];
    let raw;
    try { raw = await sheets.readTab("Pembinaan"); } catch (e) { console.warn("Tab Pembinaan tidak terbaca:", e.message); return []; }
    return bodyRows(raw)
        .map(({ cells }) => ({
            tanggal: normDate(cell(cells, 0)),
            waktu: cell(cells, 0),
            nis: cleanNIS(cell(cells, 1)),
            nama: cell(cells, 2),
            kelas: cell(cells, 3),
            tingkat: cell(cells, 4),
            status: cell(cells, 5),
            catatan: cell(cells, 6),
            penangani: cell(cells, 7),
            clientId: cell(cells, 8)
        }))
        .filter((r) => r.tanggal && r.nis);
}
module.exports.loadPembinaan = loadPembinaan;
