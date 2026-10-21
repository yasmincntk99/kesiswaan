/* Cek poin siswa: GET /api/cek-poin?nis=... */
(function () {

    const { esc, fmt, fmtDate, countUp, getJSON } = KD;

    const form = document.getElementById("cpForm");
    const input = document.getElementById("keyword");
    const btn = document.getElementById("cpBtn");
    const out = document.getElementById("cpResult");
    let tingkat = null;

    function nextTier(points, list) {
        return list.find((t) => t.min > points) || null;
    }

    async function ensureTiers() {
        if (tingkat) return tingkat;
        try { tingkat = (await getJSON(CONFIG.API.TATA_TERTIB)).data.tingkat; } catch (e) { tingkat = []; }
        return tingkat;
    }

    function render(d, tiers) {

        const nxt = nextTier(d.totalPoin, tiers);
        const cap = nxt ? nxt.min : Math.max(d.totalPoin, 1);
        const pct = Math.min(100, Math.round((d.totalPoin / cap) * 100));

        const rows = d.riwayat.length ? `
            <div class="kd-table-wrap"><table class="kd-table">
                <thead><tr><th>Tanggal</th><th>Pelanggaran</th><th>Kategori</th><th class="num">Poin</th></tr></thead>
                <tbody>${d.riwayat.map((v) => `
                    <tr><td>${esc(fmtDate(v.tanggal))}</td><td>${esc(v.jenis)}${v.sanksi ? `<br><small style="opacity:.75">Tindak lanjut: ${esc(v.sanksi)}</small>` : ""}</td>
                    <td><span class="kd-badge-cat" data-cat="${esc(v.kategori)}">${esc(v.kategori)}</span></td><td class="num">+${fmt(v.poin)}</td></tr>`).join("")}
                </tbody></table></div>`
            : `<p class="kd-empty">🎉 Belum ada pelanggaran tercatat pada tahun ajaran ini. Pertahankan!</p>`;

        out.innerHTML = `
        <article class="kd-card">
            <div class="kd-score">
                <div class="kd-score-num" id="cpNum">0</div>
                <div class="kd-score-meta">
                    <h2>${esc(d.nama)}</h2>
                    <p>Kelas ${esc(d.kelas)} · NIS ${esc(d.nis)} · ${esc(d.periode)}</p>
                    <span class="kd-tier" data-w="${esc(d.tingkat.warna)}">${esc(d.tingkat.label)}</span>
                </div>
            </div>
            <div class="kd-progress" role="img" aria-label="${d.totalPoin} poin${nxt ? ` dari ${nxt.min} menuju ${esc(nxt.label)}` : ""}">
                <span style="width:0" data-w="${pct}"></span>
            </div>
            <div class="kd-progress-cap"><span>0</span><span>${nxt ? `${fmt(nxt.min - d.totalPoin)} poin lagi menuju ${esc(nxt.label)}` : "Tingkat tertinggi"}</span></div>
            <div class="kd-note-box"><strong>Tindak lanjut:</strong> ${esc(d.tingkat.tindakan)}</div>
        </article>
        <article class="kd-card">
            <h2 class="kd-card-title">Riwayat Pelanggaran</h2>
            <p class="kd-card-sub">${fmt(d.riwayat.length)} catatan pada ${esc(d.periode)}</p>
            ${rows}
        </article>`;

        countUp(document.getElementById("cpNum"), d.totalPoin);
        requestAnimationFrame(() => requestAnimationFrame(() => {
            const bar = out.querySelector(".kd-progress span");
            if (bar) bar.style.width = bar.dataset.w + "%";
        }));
        out.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    }

    async function cari(query) {
        btn.disabled = true;
        btn.textContent = "Mencari…";
        out.innerHTML = `<div class="kd-card"><div class="kd-skel" style="height:120px"></div></div>`;
        try {
            const [payload, tiers] = await Promise.all([getJSON(`${CONFIG.API.CEK_POIN}?${query}`), ensureTiers()]);
            render(payload.data, tiers);
        } catch (e) {
            out.innerHTML = `<div class="kd-card kd-error" role="alert"><h2 class="kd-card-title">${e.status === 404 ? "Data tidak ditemukan" : "Terjadi kendala"}</h2><p class="kd-card-sub">${esc(e.message)}</p></div>`;
        } finally {
            btn.disabled = false;
            btn.textContent = "Cari →";
        }
    }

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        const key = input.value.trim();
        if (key.length < 4) {
            out.innerHTML = `<div class="kd-card kd-error" role="alert"><p>Masukkan NIS minimal 4 digit.</p></div>`;
            input.focus();
            return;
        }
        cari("nis=" + encodeURIComponent(key));
    });

    /* ---------- Pindai QR kartu (diproses di perangkat; hanya teks QR yang dikirim) ---------- */
    const $ = (id) => document.getElementById(id);
    const pesan = (t) => { $("cpScanMsg").textContent = t || ""; };
    let stream = null, timer = 0, det = null, lastText = "", busy = false;
    const loaded = {};
    const loadScript = (src) => loaded[src] || (loaded[src] = new Promise((ok, no) => { const el = document.createElement("script"); el.src = src; el.onload = ok; el.onerror = () => no(new Error("gagal memuat")); document.head.appendChild(el); }));

    async function siapDetektor() {
        if (det) return det;
        if ("BarcodeDetector" in window) {
            try { if ((await window.BarcodeDetector.getSupportedFormats()).includes("qr_code")) return (det = { n: true, d: new window.BarcodeDetector({ formats: ["qr_code"] }) }); } catch (e) { /* cadangan */ }
        }
        await loadScript("../js/vendor/jsqr.js");
        return (det = { n: false });
    }
    async function baca(video) {
        const d = await siapDetektor();
        if (d.n) { const r = await d.d.detect(video); return r && r[0] ? r[0].rawValue : ""; }
        const w = video.videoWidth, h = video.videoHeight; if (!w) return "";
        const sk = Math.min(1, 640 / w), cw = Math.round(w * sk), ch = Math.round(h * sk), c = $("cpCanvas");
        c.width = cw; c.height = ch; const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(video, 0, 0, cw, ch);
        const q = window.jsQR(x.getImageData(0, 0, cw, ch).data, cw, ch, { inversionAttempts: "dontInvert" });
        return q ? q.data : "";
    }
    function pakaiKode(t) {
        const m = /^(SSK1\.[A-Za-z0-9\-_]{1,24})\.([0-9A-Fa-f]{10})$/.exec(String(t || "").trim());
        if (!m) { pesan("QR ini bukan kartu siswa SMAN 1 Sooko."); return false; }
        pesan(""); cari("kode=" + encodeURIComponent(m[1] + "." + m[2].toUpperCase())); return true;
    }
    function loop() {
        timer = setTimeout(async () => {
            if (!stream) return;
            const v = $("cpVideo");
            if (!busy && v.readyState >= 2) {
                try { const t = await baca(v); if (t && t !== lastText) { lastText = t; busy = true; if (pakaiKode(t)) { setTimeout(() => { busy = false; }, 2500); } else busy = false; } } catch (e) { /* coba lagi */ }
            }
            loop();
        }, 200);
    }
    async function start() {
        pesan("");
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return pesan("Peramban ini tidak mendukung kamera. Gunakan tombol ambil/unggah foto QR atau ketik NIS.");
        try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }, audio: false }); }
        catch (e) { return pesan(e && e.name === "NotAllowedError" ? "Izin kamera ditolak. Izinkan kamera pada pengaturan situs, atau ketik NIS." : "Kamera tidak dapat dibuka."); }
        const v = $("cpVideo"); v.srcObject = stream; await v.play().catch(() => {});
        $("cpCam").dataset.on = "1"; $("cpScanStart").hidden = true; $("cpScanStop").hidden = false; lastText = ""; siapDetektor().catch(() => {}); loop();
    }
    function stop() {
        clearTimeout(timer); if (stream) stream.getTracks().forEach((t) => t.stop());
        stream = null; $("cpVideo").srcObject = null; $("cpCam").dataset.on = "0"; $("cpScanStart").hidden = false; $("cpScanStop").hidden = true;
    }
    $("cpScanStart").addEventListener("click", start);
    $("cpScanStop").addEventListener("click", stop);
    document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); });
    $("cpFile").addEventListener("change", async (e) => {
        const f = e.target.files && e.target.files[0]; e.target.value = ""; if (!f) return;
        try {
            await loadScript("../js/vendor/jsqr.js");
            const bmp = await createImageBitmap(f), sk = Math.min(1, 1200 / Math.max(bmp.width, bmp.height)), w = Math.round(bmp.width * sk), h = Math.round(bmp.height * sk);
            const c = $("cpCanvas"); c.width = w; c.height = h; const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(bmp, 0, 0, w, h);
            const q = window.jsQR(x.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "attemptBoth" });
            if (!q) return pesan("QR tidak terbaca pada foto. Dekatkan kamera dan pastikan QR tidak terpotong.");
            pakaiKode(q.data);
        } catch (err) { pesan("Foto tidak dapat dibaca."); }
    });

    // Dari dashboard: /pages/cek-poin.html?nis=XXXX langsung mencari.
    const qs = new URLSearchParams(location.search);
    if (qs.get("scan") === "1") start();
    const awal = qs.get("nis");
    if (awal) { input.value = awal.replace(/[^0-9A-Za-z-]/g, "").slice(0, 24); form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event("submit", { cancelable: true })); }

})();
