/*
Kartu & Pindai QR siswa.
- Pindai: kamera diproses di perangkat (BarcodeDetector bila ada, jsQR sebagai cadangan); hanya teks QR yang dikirim ke /api/qr.
- Cetak: QR dibuat di browser (qrcode-generator), isinya NIS + tanda tangan HMAC dari server, bukan nama.
*/
(function () {
    "use strict";
    const $ = (id) => document.getElementById(id);
    const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const loaded = {};
    function loadScript(src) {
        if (!loaded[src]) loaded[src] = new Promise((ok, no) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => no(new Error("gagal memuat " + src)); document.head.appendChild(s); });
        return loaded[src];
    }
    function roles() { try { const s = JSON.parse(sessionStorage.getItem("kesiswaan-admin-session") || "null"); return s && s.roles && s.roles.length ? s.roles : ["komisi"]; } catch (e) { return ["komisi"]; } }
    const bisaCatat = roles().includes("komisi");

    /* ---------- tab ---------- */
    function tab(n) {
        $("paneScan").hidden = n !== "scan"; $("paneCetak").hidden = n !== "cetak";
        $("tabScan").setAttribute("aria-selected", n === "scan"); $("tabCetak").setAttribute("aria-selected", n === "cetak");
        if (n !== "scan") stopCam();
        if (n === "cetak" && !cetakInit) initCetak();
    }
    document.querySelectorAll(".qr-tab").forEach((b) => b.addEventListener("click", () => tab(b.dataset.tab)));

    function alertMsg(t) { $("qrAlert").innerHTML = t ? `<div class="kd-card kd-error" role="alert">${esc(t)}</div>` : ""; }

    /* ---------- PINDAI ---------- */
    let stream = null, rafId = 0, detector = null, lastText = "", lastAt = 0, busy = false;
    const riwayat = [];

    async function resolve(teks) {
        const m = /^(SSK1\.[A-Za-z0-9\-_]{1,24})\.([0-9A-Fa-f]{10})$/.exec(String(teks || "").trim());
        if (!m) return tampilGagal("QR ini bukan kartu siswa SMAN 1 Sooko.");
        const asli = m[1] + "." + m[2].toUpperCase();
        busy = true;
        try {
            const r = await fetch(CONFIG.API.QR, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kode: asli }), cache: "no-store" });
            if (r.status === 401) { if (window.AdminAuth) { AdminAuth.logout(); } location.reload(); return; }
            const d = await r.json().catch(() => ({}));
            if (!r.ok || !d.success) return tampilGagal(d.message || "Kode tidak dapat diperiksa.");
            tampilSiswa(d.siswa);
        } catch (e) { tampilGagal("Tidak dapat menghubungi server. Periksa koneksi."); }
        finally { busy = false; }
    }

    function fotoHTML(s) {
        return s.foto ? `<img class="qr-foto" src="${esc(s.foto)}" alt="Foto ${esc(s.nama)}" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'qr-foto qr-foto--kosong',textContent:'Foto belum ada'}))">`
            : `<div class="qr-foto qr-foto--kosong">Foto belum ada</div>`;
    }
    function tampilSiswa(s) {
        try { navigator.vibrate && navigator.vibrate(80); } catch (e) { /* abaikan */ }
        $("qrHasil").innerHTML = `<h2 class="kd-card-title">Hasil pindai</h2>
            <div class="qr-res" data-s="ok">${fotoHTML(s)}
                <div class="qr-res-info">
                    <span class="kd-chip kd-chip--live">✔ Kartu sah</span>
                    <strong class="qr-res-nama">${esc(s.nama)}</strong>
                    <span>Kelas ${esc(s.kelas)} · NIS ${esc(s.nis)}</span>
                    <small class="kd-card-sub">Cocokkan wajah pada foto dengan siswa di depan Anda.</small>
                </div>
            </div>
            <div class="kd-eks-actions" style="margin:.75rem 0 0;justify-content:flex-start">
                ${bisaCatat ? `<a class="kd-btn kd-btn--primary" href="/pages/admin.html?nis=${encodeURIComponent(s.nis)}#input">Catat pelanggaran</a>` : ""}
                <button type="button" class="kd-btn" id="qrLagi">Pindai berikutnya</button>
            </div>`;
        $("qrLagi").addEventListener("click", () => { lastText = ""; $("qrHasil").scrollIntoView({ block: "nearest" }); });
        riwayat.unshift({ nis: s.nis, nama: s.nama, kelas: s.kelas, t: new Date() });
        riwayat.length = Math.min(riwayat.length, 8);
        $("qrRiwayatBox").hidden = false;
        $("qrRiwayat").innerHTML = riwayat.map((x) => `<li><strong>${esc(x.nama)}</strong> <small>${esc(x.kelas)} · ${x.t.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</small></li>`).join("");
    }
    function tampilGagal(msg) {
        $("qrHasil").innerHTML = `<h2 class="kd-card-title">Hasil pindai</h2><div class="qr-res" data-s="bad"><div class="qr-res-info"><span class="kd-chip kd-chip--demo">✖ Tidak dapat diverifikasi</span><span>${esc(msg)}</span></div></div>`;
    }

    async function siapDetektor() {
        if (detector) return detector;
        if ("BarcodeDetector" in window) {
            try {
                const fm = await window.BarcodeDetector.getSupportedFormats();
                if (fm.includes("qr_code")) { detector = { pakai: "native", d: new window.BarcodeDetector({ formats: ["qr_code"] }) }; return detector; }
            } catch (e) { /* lanjut ke jsQR */ }
        }
        await loadScript("../js/vendor/jsqr.js");
        detector = { pakai: "jsqr" };
        return detector;
    }
    async function bacaFrame(video) {
        const det = await siapDetektor();
        if (det.pakai === "native") { const r = await det.d.detect(video); return r && r[0] ? r[0].rawValue : ""; }
        const w = video.videoWidth, h = video.videoHeight; if (!w) return "";
        const sk = Math.min(1, 640 / w), cw = Math.round(w * sk), ch = Math.round(h * sk);
        const c = $("qrCanvas"); c.width = cw; c.height = ch;
        const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(video, 0, 0, cw, ch);
        const im = x.getImageData(0, 0, cw, ch);
        const q = window.jsQR(im.data, cw, ch, { inversionAttempts: "dontInvert" });
        return q ? q.data : "";
    }
    function loop() {
        rafId = setTimeout(async () => {
            if (!stream) return;
            const v = $("qrVideo");
            if (!busy && v.readyState >= 2) {
                try {
                    const t = await bacaFrame(v);
                    const now = Date.now();
                    if (t && (t !== lastText || now - lastAt > 4000)) { lastText = t; lastAt = now; await resolve(t); }
                } catch (e) { /* frame gagal: coba lagi */ }
            }
            loop();
        }, 150);
    }
    async function startCam() {
        alertMsg("");
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { alertMsg("Peramban ini tidak mendukung kamera (atau halaman tidak lewat HTTPS). Gunakan tombol unggah foto atau ketik kode."); return; }
        try {
            stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }, audio: false });
        } catch (e) {
            alertMsg(e && e.name === "NotAllowedError" ? "Izin kamera ditolak. Izinkan kamera pada pengaturan situs, atau gunakan unggah foto/ketik kode." : "Kamera tidak dapat dibuka: " + (e && e.message || e));
            return;
        }
        const v = $("qrVideo"); v.srcObject = stream; await v.play().catch(() => {});
        $("qrCam").dataset.on = "1"; $("qrStart").hidden = true; $("qrStop").hidden = false;
        siapDetektor().catch(() => {}); loop();
    }
    function stopCam() {
        clearTimeout(rafId);
        if (stream) stream.getTracks().forEach((t) => t.stop());
        stream = null; $("qrVideo").srcObject = null; $("qrCam").dataset.on = "0"; $("qrStart").hidden = false; $("qrStop").hidden = true;
    }
    $("qrStart").addEventListener("click", startCam);
    $("qrStop").addEventListener("click", stopCam);
    document.addEventListener("visibilitychange", () => { if (document.hidden) stopCam(); });

    $("qrFile").addEventListener("change", async (e) => {
        const f = e.target.files && e.target.files[0]; e.target.value = ""; if (!f) return;
        try {
            await loadScript("../js/vendor/jsqr.js");
            const bmp = await createImageBitmap(f);
            const sk = Math.min(1, 1200 / Math.max(bmp.width, bmp.height)), w = Math.round(bmp.width * sk), h = Math.round(bmp.height * sk);
            const c = $("qrCanvas"); c.width = w; c.height = h; const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(bmp, 0, 0, w, h);
            const q = window.jsQR(x.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "attemptBoth" });
            if (!q) return tampilGagal("QR tidak terbaca pada foto. Dekatkan kamera dan pastikan QR tidak terpotong.");
            resolve(q.data);
        } catch (err) { tampilGagal("Foto tidak dapat dibaca."); }
    });
    $("qrManualGo").addEventListener("click", () => { const v = $("qrManual").value.trim(); if (v) resolve(v); });
    $("qrManual").addEventListener("keydown", (e) => { if (e.key === "Enter") $("qrManualGo").click(); });

    /* ---------- CETAK ---------- */
    let cetakInit = false;
    async function muatKelas(k) {
        const r = await fetch(CONFIG.API.QR + (k ? "?kelas=" + encodeURIComponent(k) : ""), { cache: "no-store" });
        if (r.status === 401) { if (window.AdminAuth) AdminAuth.logout(); location.reload(); return null; }
        const d = await r.json().catch(() => ({}));
        if (!r.ok || !d.success) { alertMsg(d.message || "Data kartu belum dapat dimuat."); return null; }
        return d;
    }
    function svgQR(kode) { const q = window.qrcode(0, "M"); q.addData(kode); q.make(); return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true }); }
    function kartuHTML(s) {
        const foto = s.foto ? `<img src="${esc(s.foto)}" alt="" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'qr-id-nofoto',textContent:'FOTO'}))">` : `<span class="qr-id-nofoto">FOTO</span>`;
        return `<article class="qr-card">
            <header class="qr-id-kop"><img src="../assets/logo/jatim-transparan.png" alt="">
                <div><small>PEMERINTAH PROVINSI JAWA TIMUR · DINAS PENDIDIKAN</small><strong>SMA NEGERI 1 SOOKO MOJOKERTO</strong>
                <small>Jl. R.A. Basuni No. 361 Sooko, Kab. Mojokerto 61361</small></div>
                <img src="../assets/logo/logo.png" alt=""></header>
            <div class="qr-id-body">
                <div class="qr-id-foto">${foto}</div>
                <div class="qr-id-data"><span class="qr-id-label">KARTU PELAJAR</span>
                    <strong class="qr-id-nama">${esc(s.nama)}</strong>
                    <dl><dt>Kelas</dt><dd>${esc(s.kelas)}</dd><dt>NIS</dt><dd>${esc(s.nis)}</dd></dl></div>
                <div class="qr-card-kode">${svgQR(s.kode)}</div>
            </div>
            <div class="qr-id-foot"></div></article>`;
    }
    function stikerHTML(s) { return `<article class="qr-stiker"><div class="qr-card-kode">${svgQR(s.kode)}</div><span>${esc(s.nis)}</span></article>`; }

    async function render(k) {
        alertMsg("");
        $("cJumlah").textContent = "Memuat…"; $("cGrid").innerHTML = "";
        const d = await muatKelas(k); if (!d) { $("cJumlah").textContent = ""; return; }
        await loadScript("../js/vendor/qrcode-generator.js");
        const bentuk = $("cBentuk").value; $("cGrid").dataset.bentuk = bentuk;
        $("cGrid").innerHTML = d.data.map(bentuk === "kartu" ? kartuHTML : stikerHTML).join("");
        $("cJumlah").textContent = d.data.length.toLocaleString("id-ID") + " siswa";
        $("cCari").value = "";
        return d;
    }
    async function initCetak() {
        cetakInit = true;
        const d = await muatKelas(""); if (!d) return;
        const opsi = d.kelasTersedia.map((k) => `<option value="${esc(k)}">${esc(k)}</option>`);
        if (d.luas) opsi.push(`<option value="semua">Semua kelas</option>`);
        $("cKelas").innerHTML = opsi.join("");
        $("cKelas").addEventListener("change", () => render($("cKelas").value));
        $("cBentuk").addEventListener("change", () => render($("cKelas").value));
        $("cPrint").addEventListener("click", () => window.print());
        $("cCari").addEventListener("input", () => {
            const q = $("cCari").value.trim().toLowerCase(); let n = 0;
            $("cGrid").querySelectorAll(".qr-card,.qr-stiker").forEach((el) => { const ok = !q || el.textContent.toLowerCase().includes(q); el.hidden = !ok; if (ok) n++; });
            $("cJumlah").textContent = n.toLocaleString("id-ID") + " siswa";
        });
        $("cGrid").addEventListener("click", (e) => {
            const c = e.target.closest(".qr-card,.qr-stiker"); if (!c) return;
            const box = $("qrZoomBox"); box.innerHTML = ""; const k = c.cloneNode(true); k.hidden = false; box.appendChild(k);
            $("qrZoom").hidden = false;
            const w = c.getBoundingClientRect().width || 323;
            k.style.zoom = String(Math.min(3, (innerWidth * 0.92) / w, (innerHeight * 0.7) / (w * 54 / 85.6)));
        });
        const tutup = () => { $("qrZoom").hidden = true; $("qrZoomBox").innerHTML = ""; };
        $("qrZoomX").addEventListener("click", tutup);
        $("qrZoom").addEventListener("click", (e) => { if (e.target === $("qrZoom")) tutup(); });
        document.addEventListener("keydown", (e) => { if (e.key === "Escape") tutup(); });
        render($("cKelas").value);
    }

    // Akun tanpa kelas (wali tanpa kolom Kelas) dan akun lain: pesan dari server tampil di #qrAlert saat memuat.
    if (location.hash === "#cetak") tab("cetak");
})();
