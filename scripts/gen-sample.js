/*
 Membuat data contoh (FIKTIF) untuk mode demo: data/sample-siswa.json
 dan data/sample-pelanggaran.json. Deterministik (seed tetap).
 Jalankan: node scripts/gen-sample.js
*/
const fs = require("fs");
const path = require("path");
const tt = require("../data/tata-tertib.json");

let seed = 515;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];

const depan = ["Ahmad","Aisyah","Bagas","Citra","Dimas","Eka","Fajar","Gita","Hana","Iqbal","Jihan","Kevin","Laila","Maulana","Nadia","Oki","Putri","Raka","Salsa","Tegar","Umar","Vina","Wahyu","Yoga","Zahra","Alif","Bella","Cahya","Dina","Farel"];
const belakang = ["Pratama","Ramadhan","Lestari","Saputra","Wijaya","Hidayat","Kusuma","Nugroho","Santoso","Permata","Firmansyah","Anggraini","Setiawan","Utami","Maharani","Syahputra"];
const kelasList = ["X-1","X-2","X-3","X-4","XI-1","XI-2","XI-3","XI-4","XII-1","XII-2","XII-3","XII-4"];

const siswa = [];
let n = 0;
kelasList.forEach((kelas) => {
  for (let i = 0; i < 6; i++) {
    n++;
    const nis = String(26000 + n * 7);
    siswa.push({
      nis,
      nisn: "00" + String(51000000 + n * 131),
      nama: pick(depan) + " " + pick(belakang),
      kelas
    });
  }
});

// bobot: ringan jauh lebih sering
const bobot = tt.pelanggaran.flatMap((p) => Array(p.kategori === "Ringan" ? 8 : p.kategori === "Sedang" ? 3 : (p.poin >= 75 ? 0 : 1)).fill(p));
const sanksiFor = (p) => p.kategori === "Ringan" ? "Teguran lisan" : p.kategori === "Sedang" ? "Panggilan BK" : "Panggilan orang tua";
const pencatat = ["Guru Piket", "Wali Kelas", "Guru BK", "Waka Kesiswaan"];

const rows = [];
const start = new Date(Date.UTC(2026, 6, 20)); // 20 Jul 2026
const end = new Date(Date.UTC(2026, 9, 12));   // 12 Okt 2026
let id = 0;
for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
  const dow = d.getUTCDay();
  if (dow === 0 || dow === 6) continue;
  const count = Math.floor(rnd() * 6); // 0-5 per hari
  for (let c = 0; c < count; c++) {
    // beberapa siswa sengaja lebih sering melanggar
    const s = rnd() < 0.35 ? siswa[(Math.floor(rnd() * 10) * 7) % siswa.length] : pick(siswa);
    const p = pick(bobot);
    id++;
    rows.push({
      id: "V" + String(id).padStart(4, "0"),
      tanggal: d.toISOString().slice(0, 10),
      nis: s.nis, nama: s.nama, kelas: s.kelas,
      kode: p.kode, jenis: p.jenis, kategori: p.kategori, poin: p.poin,
      sanksi: sanksiFor(p), pencatat: pick(pencatat), catatan: ""
    });
  }
}

fs.writeFileSync(path.join(__dirname, "../data/sample-siswa.json"), JSON.stringify(siswa, null, 1));
fs.writeFileSync(path.join(__dirname, "../data/sample-pelanggaran.json"), JSON.stringify(rows, null, 1));
console.log("siswa:", siswa.length, "pelanggaran:", rows.length);
