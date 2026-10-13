/*
==========================================================
SMANSASOO Kesiswaan Portal
Dashboard pelanggaran siswa (index.html)
Sumber data: GET /api/dashboard?periode=...
Semua grafik digambar sendiri (SVG/CSS) -- tanpa library.
==========================================================
*/
(function () {

    const { esc, fmt, fmtDate, countUp, getJSON } = KD;

    const root = document.getElementById("dash");
    const periodBtns = Array.from(document.querySelectorAll("#periodSeg button"));
    let periode = "tahun";
    let reqId = 0;

    const CAT_COLOR = { Ringan: "var(--kd-ringan)", Sedang: "var(--kd-sedang)", Berat: "var(--kd-berat)" };

    /* ---------- skeleton / error ---------- */

    function skeleton() {
        const card = (h) => `<div class="kd-card"><div class="kd-skel" style="height:${h}px"></div></div>`;
        root.innerHTML = `
        <div class="kd-grid kd-grid--kpi">${[1, 2, 3, 4].map(() => card(84)).join("")}</div>
        <div class="kd-grid kd-grid--2-1">${card(240)}${card(240)}</div>
        <div class="kd-grid kd-grid--1-1">${card(220)}${card(220)}</div>`;
        root.setAttribute("aria-busy", "true");
    }

    function showError(message) {
        root.setAttribute("aria-busy", "false");
        root.innerHTML = `
        <div class="kd-card kd-error" role="alert">
            <h2 class="kd-card-title">Data belum bisa dimuat</h2>
            <p class="kd-card-sub" style="margin-bottom:1rem">${esc(message)}</p>
            <button type="button" class="kd-btn" id="retryBtn">Coba lagi</button>
        </div>`;
        document.getElementById("retryBtn").addEventListener("click", load);
    }

    /* ---------- komponen ---------- */

    function kpi(label, value, icon, foot, cls) {
        return `
        <article class="kd-card kd-kpi ${cls || ""}">
            <span class="kd-kpi-ico" aria-hidden="true">${icon}</span>
            <span class="kd-kpi-label">${esc(label)}</span>
            <span class="kd-kpi-value" data-count="${Number(value) || 0}">0</span>
            <span class="kd-kpi-foot">${foot}</span>
        </article>`;
    }

    // Bulan berjalan belum penuh, jadi tidak dihitung persentase (menyesatkan).
    function monthNote(now, prev) {
        return `<span>Bulan ini <b>${fmt(now)}</b> · bulan lalu <b>${fmt(prev)}</b></span>`;
    }

    function lineChart(points) {
        if (!points.length) return `<p class="kd-empty">Belum ada data pada periode ini.</p>`;
        const W = 640, H = 240, padL = 34, padR = 16, padT = 26, padB = 34;
        const max = Math.max(...points.map((p) => p.jumlah), 1);
        const top = Math.ceil(max / 5) * 5 || 5;
        const x = (i) => points.length === 1 ? (W + padL - padR) / 2 : padL + (i * (W - padL - padR)) / (points.length - 1);
        const y = (v) => padT + (1 - v / top) * (H - padT - padB);

        const grid = [0, .25, .5, .75, 1].map((f) => {
            const v = Math.round(top * f), yy = y(v);
            return `<line class="grid" x1="${padL}" x2="${W - padR}" y1="${yy}" y2="${yy}"/><text class="axis" x="${padL - 8}" y="${yy + 4}" text-anchor="end">${v}</text>`;
        }).join("");

        const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.jumlah).toFixed(1)}`).join(" ");
        const area = `${line} L${x(points.length - 1).toFixed(1)},${H - padB} L${x(0).toFixed(1)},${H - padB} Z`;

        const dots = points.map((p, i) => `
            <g>
              <circle class="hit" cx="${x(i)}" cy="${y(p.jumlah)}" r="18" tabindex="0"><title>${esc(p.label)}: ${fmt(p.jumlah)} pelanggaran</title></circle>
              <circle class="dot" cx="${x(i)}" cy="${y(p.jumlah)}" r="5" pointer-events="none"/>
              <text class="val" x="${x(i)}" y="${y(p.jumlah) - 12}">${fmt(p.jumlah)}</text>
              <text class="axis" x="${x(i)}" y="${H - 10}" text-anchor="middle">${esc(p.label)}</text>
            </g>`).join("");

        const summary = points.map((p) => `${p.label}: ${p.jumlah}`).join(", ");

        return `
        <svg class="kd-line" viewBox="0 0 ${W} ${H}" role="img" aria-label="Grafik tren pelanggaran per bulan. ${esc(summary)}">
            <defs><linearGradient id="kdArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="#FFDD7A" stop-opacity=".45"/><stop offset="1" stop-color="#FFDD7A" stop-opacity="0"/>
            </linearGradient></defs>
            ${grid}
            ${points.length > 1 ? `<path class="area" d="${area}"/>` : ""}
            <path class="stroke" d="${line}"/>
            ${dots}
        </svg>`;
    }

    function donut(items) {
        const total = items.reduce((s, i) => s + i.jumlah, 0);
        if (!total) return `<p class="kd-empty">Belum ada data pada periode ini.</p>`;
        let acc = 0;
        const stops = items.map((i) => {
            const from = (acc / total) * 100;
            acc += i.jumlah;
            return `${CAT_COLOR[i.kategori]} ${from.toFixed(2)}% ${((acc / total) * 100).toFixed(2)}%`;
        }).join(",");
        const legend = items.map((i) => `
            <li><span class="kd-swatch" style="background:${CAT_COLOR[i.kategori]}"></span>${esc(i.kategori)}
            <b>${fmt(i.jumlah)} <small style="font-weight:500;opacity:.75">(${Math.round((i.jumlah / total) * 100)}%)</small></b></li>`).join("");
        const label = items.map((i) => `${i.kategori} ${i.jumlah}`).join(", ");
        return `
        <div class="kd-donut-wrap">
            <div class="kd-donut" style="background:conic-gradient(${stops})" role="img" aria-label="Komposisi pelanggaran: ${esc(label)}">
                <div class="kd-donut-center"><strong>${fmt(total)}</strong><small>pelanggaran</small></div>
            </div>
            <ul class="kd-legend">${legend}</ul>
        </div>`;
    }

    function bars(items, labelKey, catKey) {
        if (!items.length) return `<p class="kd-empty">Belum ada data pada periode ini.</p>`;
        const max = Math.max(...items.map((i) => i.jumlah), 1);
        return `<ul class="kd-bars">${items.map((i) => `
            <li>
                <div class="kd-bar-top"><span title="${esc(i[labelKey])}">${esc(i[labelKey])}</span><b>${fmt(i.jumlah)}</b></div>
                <div class="kd-bar-track"><div class="kd-bar-fill" data-w="${Math.max(3, Math.round((i.jumlah / max) * 100))}" ${catKey ? `data-cat="${esc(i[catKey])}"` : ""}></div></div>
            </li>`).join("")}</ul>`;
    }

    function tierStack(dist) {
        const total = dist.reduce((s, d) => s + d.jumlah, 0);
        if (!total) return `<p class="kd-empty">Belum ada poin tercatat pada tahun ajaran ini.</p>`;
        const segs = dist.filter((d) => d.jumlah > 0).map((d) =>
            `<span class="kd-tier-${esc(d.warna)}" style="flex:${d.jumlah} 1 0" title="${esc(d.label)}: ${d.jumlah} siswa"></span>`).join("");
        const pills = dist.map((d) =>
            `<span class="kd-pill"><span class="kd-swatch kd-tier-${esc(d.warna)}" style="display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:.35rem"></span>${esc(d.label)}: <b>${fmt(d.jumlah)}</b></span>`).join("");
        return `<div class="kd-stack" role="img" aria-label="Sebaran siswa per tingkat pembinaan">${segs}</div><div class="kd-pills">${pills}</div>`;
    }

    function feed(list) {
        if (!list.length) return `<p class="kd-empty">Belum ada aktivitas.</p>`;
        return `<ul class="kd-feed">${list.map((v) => `
            <li>
                <span class="when">${esc(fmtDate(v.tanggal).replace(/ \d{4}$/, ""))}</span>
                <span class="what">${esc(v.jenis)}<small>Kelas ${esc(v.kelas)} · +${fmt(v.poin)} poin</small></span>
                <span class="kd-badge-cat" data-cat="${esc(v.kategori)}">${esc(v.kategori)}</span>
            </li>`).join("")}</ul>`;
    }

    /* ---------- render ---------- */

    function render(payload) {

        const d = payload.data;
        const k = d.kpi;
        const pct = k.totalSiswa ? Math.round((k.siswaTerlibat / k.totalSiswa) * 100) : 0;

        document.getElementById("modeChip").className = "kd-chip " + (payload.mode === "demo" ? "kd-chip--demo" : "kd-chip--live");
        document.getElementById("modeChip").textContent = payload.mode === "demo" ? "Data contoh (demo)" : "Terhubung ke Google Sheet";
        document.getElementById("periodLabel").textContent = d.periode.label;

        root.setAttribute("aria-busy", "false");
        root.innerHTML = `
        <section class="kd-grid kd-grid--kpi" aria-label="Ringkasan">
            ${kpi("Total Pelanggaran", k.total, "📋", monthNote(k.bulanIni, k.bulanLalu))}
            ${kpi("Siswa Terlibat", k.siswaTerlibat, "🧑‍🎓", `<span>${pct}% dari ${fmt(k.totalSiswa)} siswa</span>`)}
            ${kpi("Total Poin", k.totalPoin, "⚖️", `<span>${fmt(k.beratPeriode)} pelanggaran berat</span>`)}
            ${kpi("Perlu Pembinaan", k.perluPembinaan, "🛡️", `<span>poin ≥ 25 (tahun ajaran ini)</span>`, k.perluPembinaan ? "kd-kpi--alert" : "")}
        </section>

        <section class="kd-grid kd-grid--2-1">
            <article class="kd-card">
                <h2 class="kd-card-title">Tren Pelanggaran per Bulan</h2>
                <p class="kd-card-sub">Jumlah kejadian tercatat, ${esc(d.periode.label)}</p>
                ${lineChart(d.perBulan)}
            </article>
            <article class="kd-card">
                <h2 class="kd-card-title">Komposisi Kategori</h2>
                <p class="kd-card-sub">Ringan · Sedang · Berat</p>
                ${donut(d.perKategori)}
            </article>
        </section>

        <section class="kd-grid kd-grid--1-1">
            <article class="kd-card">
                <h2 class="kd-card-title">Jenis Pelanggaran Terbanyak</h2>
                <p class="kd-card-sub">6 teratas pada periode ini</p>
                ${bars(d.topJenis, "jenis", "kategori")}
            </article>
            <article class="kd-card">
                <h2 class="kd-card-title">Pelanggaran per Kelas</h2>
                <p class="kd-card-sub">8 kelas dengan kasus terbanyak
                  · ${d.perTingkat.map((t) => `Kelas ${esc(t.tingkat)}: <b>${fmt(t.jumlah)}</b>`).join(" · ")}</p>
                ${bars(d.perKelas, "kelas")}
            </article>
        </section>

        <section class="kd-grid kd-grid--1-1">
            <article class="kd-card">
                <h2 class="kd-card-title">Status Pembinaan Siswa</h2>
                <p class="kd-card-sub">Sebaran siswa menurut poin kumulatif tahun ajaran berjalan</p>
                ${tierStack(d.tingkatDist)}
            </article>
            <article class="kd-card">
                <h2 class="kd-card-title">Aktivitas Terbaru</h2>
                <p class="kd-card-sub">Tanpa nama siswa, demi privasi</p>
                ${feed(d.recent)}
            </article>
        </section>`;

        root.querySelectorAll("[data-count]").forEach((n) => countUp(n, n.dataset.count));
        requestAnimationFrame(() => requestAnimationFrame(() => {
            root.querySelectorAll(".kd-bar-fill").forEach((b) => { b.style.width = b.dataset.w + "%"; });
        }));
    }

    /* ---------- load ---------- */

    async function load() {
        const my = ++reqId;
        skeleton();
        try {
            const payload = await getJSON(`${CONFIG.API.DASHBOARD}?periode=${encodeURIComponent(periode)}`);
            if (my !== reqId) return;
            render(payload);
        } catch (e) {
            if (my !== reqId) return;
            showError(e.message);
        }
    }

    periodBtns.forEach((btn) => btn.addEventListener("click", () => {
        if (btn.dataset.p === periode) return;
        periode = btn.dataset.p;
        periodBtns.forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
        load();
    }));

    load();

})();
