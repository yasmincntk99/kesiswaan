/*
Portal Eksekutif: KPI, grafik, mode tayang, cetak A4. Data dari /api/eksekutif (agregat, tanpa nama siswa).
*/
(function () {
    "use strict";
    const $ = (id) => document.getElementById(id);
    const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const nf = (n) => Number(n || 0).toLocaleString("id-ID");
    const STAT = { ok: "Tercapai", warn: "Mendekati", bad: "Perlu perhatian", info: "—" };
    const ICON = { siswa_melanggar_pct: "👥", tren_pct: "📉", tindak_lanjut_pct: "🛡️", hari_tindak_lanjut: "⏱️", terlambat: "⏰", wa_lengkap_pct: "📱", data_lengkap_pct: "🗂️" };
    let D = null, slides = [], idx = 0, timer = null;

    function fmtVal(k) {
        if (k.nilai === null || k.nilai === undefined) return "–";
        const sign = k.kode === "tren_pct" && k.nilai > 0 ? "+" : "";
        return sign + nf(k.nilai);
    }
    const unit = (k) => (k.nilai === null || k.nilai === undefined ? "" : k.satuan);
    function fmtTarget(k) {
        const op = k.arah === "min" ? "≥" : "≤";
        return `Target ${op} ${nf(k.target)}${k.satuan === "%" ? "%" : " " + k.satuan}`;
    }
    // Seberapa dekat nilai dengan target (0..1) untuk batang kemajuan.
    function ratio(k) {
        const v = k.nilai, t = k.target;
        if (v === null || v === undefined) return 0;
        if (k.arah === "min") return t > 0 ? Math.max(0, Math.min(1, v / t)) : 1;
        if (v <= t) return 1;
        if (t > 0) return Math.max(0.06, Math.min(1, t / v));
        return 0.06;
    }

    function kpiCard(k) {
        return `<article class="kd-card kd-ekpi" data-s="${esc(k.status)}">
            <div class="kd-ekpi-top"><span class="kd-ekpi-ico" aria-hidden="true">${ICON[k.kode] || "📊"}</span><span class="kd-ekpi-name">${esc(k.nama)}</span></div>
            <div class="kd-ekpi-val">${esc(fmtVal(k))}<small>${esc(unit(k))}</small></div>
            <div class="kd-ekpi-meter" role="img" aria-label="Capaian terhadap target"><i style="width:${Math.round(ratio(k) * 100)}%"></i></div>
            <div class="kd-ekpi-foot"><span class="kd-ekpi-badge">${STAT[k.status] || ""}</span><span class="kd-ekpi-target">${esc(fmtTarget(k))}${k.contoh ? " · contoh" : ""}</span></div>
        </article>`;
    }

    function summary(d) {
        const r = d.ringkas;
        const items = [["Pelanggaran tahun ajaran", r.totalPelanggaran], ["Total poin", r.totalPoin], ["Siswa pernah melanggar", `${r.siswaMelanggar} / ${d.jumlahSiswa}`], ["Bulan ini (vs bulan lalu s.d. tgl sama)", `${r.bulanIni} (${r.bulanLaluSdTgl})`], ["Surat dikirim", r.suratTerkirim], ["Perlu tindak lanjut", `${r.perluTindakLanjut} (ditangani ${r.ditangani})`]];
        return `<div class="kd-esum">${items.map(([l, v]) => `<div class="kd-esum-i"><span>${esc(l)}</span><strong>${esc(typeof v === "number" ? nf(v) : v)}</strong></div>`).join("")}</div>`;
    }

    function trenChart(d) {
        const max = Math.max(1, ...d.tren.map((t) => t.jumlah));
        const now = d.hariIni.slice(0, 7);
        return `<div class="kd-etren" role="img" aria-label="Pelanggaran per bulan">${d.tren.map((t) => `
            <div class="kd-etren-c${t.key === now ? " is-now" : ""}"><span class="kd-etren-n">${t.jumlah || ""}</span><div class="kd-etren-bar" style="height:${Math.round((t.jumlah / max) * 100)}%"></div><span class="kd-etren-l">${t.label}</span></div>`).join("")}</div>`;
    }

    function barList(rows, labelKey, valKey, fmt, color) {
        const max = Math.max(1, ...rows.map((r) => r[valKey]));
        if (!rows.length) return '<p class="kd-card-sub">Belum ada data.</p>';
        return `<div class="kd-bars">${rows.map((r) => `<div class="kd-bar"><div class="kd-bar-top"><span>${esc(r[labelKey])}</span><strong>${esc(fmt(r))}</strong></div><div class="kd-bar-track"><div class="kd-bar-fill" style="width:${Math.max(3, Math.round((r[valKey] / max) * 100))}%;${color ? "background:" + color : ""}"></div></div></div>`).join("")}</div>`;
    }

    function tierChart(d) {
        const rows = [{ label: "Tanpa pelanggaran", jumlah: d.tanpaPelanggaran }].concat(d.distTingkat);
        const total = Math.max(1, rows.reduce((s, r) => s + r.jumlah, 0));
        const PAL = ["#32D74B", "#5AC8FA", "#FFD60A", "#FF9F0A", "#FF6B3D", "#FF453A"];
        const col = (l) => PAL[rows.findIndex((r) => r.label === l)] || "#8E8E93";
        return `<div class="kd-estack" role="img" aria-label="Sebaran siswa menurut tingkat">${rows.map((r) => r.jumlah ? `<span style="flex:${r.jumlah};background:${col(r.label)}" title="${esc(r.label)}: ${r.jumlah}"></span>` : "").join("")}</div>
            <ul class="kd-elegend">${rows.map((r) => `<li><i style="background:${col(r.label)}"></i>${esc(r.label)} <strong>${nf(r.jumlah)}</strong> <small>(${Math.round(r.jumlah / total * 1000) / 10}%)</small></li>`).join("")}</ul>`;
    }

    function statusPembinaan(d) {
        const s = d.statusPembinaan || {};
        return barList(Object.keys(s).map((k) => ({ n: k, v: s[k] })), "n", "v", (r) => nf(r.v));
    }

    const card = (title, sub, inner, cls) => `<section class="kd-card ${cls || ""}"><h2 class="kd-card-title">${esc(title)}</h2>${sub ? `<p class="kd-card-sub">${esc(sub)}</p>` : ""}${inner}</section>`;

    function build(d) {
        const kp = d.kpi.map(kpiCard).join("");
        const sections = {
            kpi: `<div class="kd-ekpi-grid">${kp}</div>${d.targetContoh ? '<p class="kd-card-sub kd-enote">Sebagian target masih nilai contoh. Sekolah dapat menetapkan target di tab Target_KPI pada Google Sheet.</p>' : ""}`,
            ringkas: card("Ringkasan tahun ajaran " + d.ta, "", summary(d)),
            tren: card("Tren pelanggaran per bulan", "Juli – Juni, tahun ajaran berjalan.", trenChart(d)),
            tingkat: card("Sebaran siswa menurut tingkat", "Berdasarkan poin kumulatif.", tierChart(d)),
            kelas: card("Kelas dengan pelanggaran tertinggi", "Per 100 siswa, 5 teratas.", barList(d.kelasTeratas, "kelas", "per100", (r) => `${r.per100}/100 · ${r.jumlah} kasus`)),
            jenis: card("Jenis pelanggaran tersering", "5 teratas tahun ajaran ini.", barList(d.jenisTeratas, "jenis", "jumlah", (r) => nf(r.jumlah))),
            pembinaan: card("Status tindak lanjut", "Kasus yang sudah mencapai SP1 atau lebih.", statusPembinaan(d))
        };
        return sections;
    }

    function render(d) {
        D = d;
        $("eksTa").textContent = "Tahun ajaran " + d.ta;
        $("eksTgl").textContent = new Date(d.hariIni + "T00:00:00").toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
        const s = build(d);
        $("eksBody").innerHTML = `${s.kpi}${s.ringkas}<div class="kd-grid kd-grid--1-1">${s.tren}${s.tingkat}</div><div class="kd-grid kd-grid--1-1">${s.kelas}${s.jenis}</div>${s.pembinaan}
            <p class="kd-card-sub kd-eprint-foot">Sumber: Database Kesiswaan SMAN 1 Sooko · dicetak ${esc($("eksTgl").textContent)} · angka agregat tanpa data pribadi siswa.</p>`;
        slides = [
            ["Ringkasan KPI", s.kpi + (s.kpi ? "" : "")],
            ["Ringkasan tahun ajaran " + d.ta, s.ringkas],
            ["Tren & sebaran", `<div class="kd-grid kd-grid--1-1">${s.tren}${s.tingkat}</div>`],
            ["Kelas & jenis pelanggaran", `<div class="kd-grid kd-grid--1-1">${s.kelas}${s.jenis}</div>`],
            ["Tindak lanjut", s.pembinaan]
        ];
    }

    async function load() {
        $("eksAlert").innerHTML = "";
        try {
            const r = await fetch(CONFIG.API.EKSEKUTIF, { cache: "no-store" });
            const j = await r.json().catch(() => ({}));
            if (r.status === 401 || r.status === 403) return; // penjaga halaman mengalihkan
            if (!r.ok || !j.success) throw new Error(j.error || "Gagal memuat data.");
            render(j.data);
        } catch (e) {
            $("eksBody").innerHTML = "";
            $("eksAlert").innerHTML = `<div class="kd-card kd-error" role="alert">${esc(e.message || "Gagal memuat data.")}</div>`;
        }
    }

    /* ---- mode tayang ---- */
    function show(i) {
        idx = (i + slides.length) % slides.length;
        $("eksSlide").innerHTML = `<div class="kd-tayang-fit" id="eksFit"><h2 class="kd-tayang-h">${esc(slides[idx][0])}</h2>${slides[idx][1]}</div>`;
        fit();
        $("eksDots").innerHTML = slides.map((_, n) => `<i class="${n === idx ? "on" : ""}"></i>`).join("");
        $("eksCount").textContent = (idx + 1) + " / " + slides.length;
        const bar = $("eksProg"); bar.style.transition = "none"; bar.style.width = "0%";
        void bar.offsetWidth; bar.style.transition = "width 12s linear"; bar.style.width = "100%";
    }
    // Skala isi slide agar muat satu layar tanpa gulir (proyektor/layar kecil).
    function fit() {
        const box = $("eksSlide"), el = $("eksFit");
        if (!el || $("eksStage").classList.contains("kd-hidden")) return;
        el.style.zoom = "";
        if (window.innerWidth < 700) return; // HP: biarkan digulir
        const cs = getComputedStyle(box);
        const avail = box.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
        const need = el.scrollHeight;
        if (need > avail && avail > 0) el.style.zoom = String(Math.max(0.45, (avail / need) * 0.97));
    }
    window.addEventListener("resize", fit);

    function auto() { clearInterval(timer); timer = setInterval(() => show(idx + 1), 12000); }
    function openStage() {
        if (!D) return;
        $("eksStage").classList.remove("kd-hidden");
        document.body.classList.add("kd-tayang-on");
        $("eksStageTa").textContent = D ? "Tahun ajaran " + D.ta : "";
        show(0); auto();
        const el = $("eksStage");
        if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    }
    function closeStage() {
        clearInterval(timer);
        $("eksStage").classList.add("kd-hidden");
        document.body.classList.remove("kd-tayang-on");
        if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    }

    $("eksReload").addEventListener("click", load);
    $("eksPrint").addEventListener("click", () => { if (D) window.print(); });
    $("eksTayang").addEventListener("click", openStage);
    $("eksStageX").addEventListener("click", closeStage);
    $("eksPrev").addEventListener("click", () => { show(idx - 1); auto(); });
    $("eksNext").addEventListener("click", () => { show(idx + 1); auto(); });
    document.addEventListener("keydown", (e) => {
        if ($("eksStage").classList.contains("kd-hidden")) return;
        if (e.key === "Escape") closeStage();
        else if (e.key === "ArrowRight") { show(idx + 1); auto(); }
        else if (e.key === "ArrowLeft") { show(idx - 1); auto(); }
    });
    document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && !$("eksStage").classList.contains("kd-hidden")) closeStage(); });
    document.addEventListener("adminauth:change", () => {});

    load();
})();
