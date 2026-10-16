/*
==========================================================
SMANSASOO Kesiswaan Portal
Panel admin (pages/admin.html) -- dijaga js/admin-auth.js
API: GET/POST /api/pelanggaran (token otomatis ditambahkan)
==========================================================
*/
(function () {

    const { esc, fmt, fmtDate, getJSON } = KD;
    const $ = (id) => document.getElementById(id);

    const state = { v: [], siswa: [], tatib: [], tingkat: [], canWrite: false, sheetUrl: "", hariIni: "", picked: null, mode: "one", batch: new Set() };
    const PAGE = 25;
    let page = 1;

    /* ---------- util ---------- */

    function tierOf(points) {
        return state.tingkat.find((t) => points >= t.min && (t.max === null || points <= t.max)) || state.tingkat[0];
    }

    function ayRange() {
        const [y, m] = state.hariIni.split("-").map(Number);
        const s = m >= 7 ? y : y - 1;
        return { from: `${s}-07-01`, to: `${s + 1}-06-30`, label: `${s}/${s + 1}` };
    }

    function pointsOf(nis) {
        const r = ayRange();
        return state.v.filter((x) => x.nis === nis && x.tanggal >= r.from && x.tanggal <= r.to).reduce((s, x) => s + x.poin, 0);
    }

    function csvCell(v) {
        let s = String(v === null || v === undefined ? "" : v);
        if (/^[=+\-@]/.test(s)) s = "'" + s;          // cegah formula injection
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }

    function downloadCSV(name, header, rows) {
        const body = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
        const blob = new Blob(["﻿" + body], { type: "text/csv;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }

    /* ---------- bagian halaman (dipilih lewat sidebar) ---------- */
    // Tidak ada tombol tab di halaman: menu "Catat Pelanggaran / Data Pelanggaran /
    // Perlu Pembinaan" ada di sidebar (js/shell.js) dan memakai hash URL.

    const TABS = ["input", "data", "pembinaan"];
    const TAB_LABEL = { input: "Catat Pelanggaran", data: "Data Pelanggaran", pembinaan: "Perlu Pembinaan" };

    function showTab(name, scroll) {
        if (!TABS.includes(name)) name = "input";
        TABS.forEach((t) => $("panel-" + t).classList.toggle("kd-hidden", t !== name));
        $("adminSection").textContent = TAB_LABEL[name];
        document.dispatchEvent(new CustomEvent("kd:tab", { detail: { tab: name } }));   // sidebar menyorot menu aktif
        if (name === "data") renderData();
        if (name === "pembinaan") renderPembinaan();
        if (scroll) document.querySelector("main").scrollIntoView({ block: "start", behavior: "smooth" });
    }

    window.addEventListener("hashchange", () => showTab(location.hash.slice(1), true));

    /* ---------- INPUT: kelas -> siswa -> profil -> form ---------- */

    const natural = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
    const QKEY = "kd-pelanggaran-queue";
    const CKEY = "kd-admin-cache";

    function fillJenis() {
        const groups = ["Ringan", "Sedang", "Berat"].map((c) => {
            const items = state.tatib.filter((t) => t.kategori === c);
            return items.length ? `<optgroup label="${c}">${items.map((t) => `<option value="${esc(t.kode)}">[${esc(t.kode)}] ${esc(t.jenis)} (+${t.poin} poin)</option>`).join("")}</optgroup>` : "";
        }).join("");
        $("fKode").innerHTML = `<option value="">— pilih jenis pelanggaran —</option>${groups}`;
    }

    function fillKelas() {
        const cur = $("selKelas").value;
        const kelas = [...new Set(state.siswa.map((s) => s.kelas))].filter(Boolean).sort(natural);
        $("selKelas").innerHTML = `<option value="">— pilih kelas —</option>` + kelas.map((k) => `<option>${esc(k)}</option>`).join("");
        if (cur && kelas.includes(cur)) $("selKelas").value = cur;
    }

    function siswaDiKelas(k) { return state.siswa.filter((s) => s.kelas === k).sort((a, b) => a.nama.localeCompare(b.nama)); }

    function onKelas() {
        const k = $("selKelas").value;
        $("selSiswa").disabled = !k;
        $("selSiswa").innerHTML = k
            ? `<option value="">— pilih nama siswa —</option>` + siswaDiKelas(k).map((s) => `<option value="${esc(s.nis)}">${esc(s.nama)} (NIS ${esc(s.nis)})</option>`).join("")
            : `<option value="">— pilih kelas dulu —</option>`;
        $("rekapBtn").classList.toggle("kd-hidden", !k);
        if (state.mode === "many") renderRoster();
        hideSiswa();
    }

    function hideSiswa() {
        state.picked = null;
        $("sectionProfil").classList.add("kd-hidden");
        if (state.mode === "many") return renderBatch();   // form mengikuti pilihan centang
        $("sectionForm").classList.add("kd-hidden");
    }

    function riwayatOf(nis) {
        const r = ayRange();
        return state.v.filter((x) => x.nis === nis && x.tanggal >= r.from && x.tanggal <= r.to)
            .sort((a, z) => (a.tanggal < z.tanggal ? 1 : a.tanggal > z.tanggal ? -1 : (a.id < z.id ? 1 : -1)));
    }

    function safeImg(url) { return /^https:\/\//i.test(url || "") ? url : ""; }

    function renderProfil() {
        const s = state.picked;
        if (!s) return;
        const rw = riwayatOf(s.nis), total = rw.reduce((a, x) => a + x.poin, 0), tier = tierOf(total);
        $("pNama").textContent = s.nama;
        $("pKelas").textContent = s.kelas;
        $("pNis").textContent = s.nis;
        $("pPoin").textContent = fmt(total);
        $("pTier").textContent = tier ? tier.label : "";
        const img = $("pFoto");
        img.onerror = () => { img.onerror = null; img.removeAttribute("src"); img.style.visibility = "hidden"; };
        img.style.visibility = "";
        if (safeImg(s.foto)) img.src = s.foto; else { img.removeAttribute("src"); img.style.visibility = "hidden"; }
        $("pRiwayat").innerHTML = rw.length ? rw.map((x) => `
            <tr><td>${esc(fmtDate(x.tanggal))}</td><td><strong>${esc(x.jenis)}</strong>${x.catatan && x.catatan !== "-" ? `<br><small style="opacity:.75">Ket: ${esc(x.catatan)}</small>` : ""}</td><td class="num"><strong>+${fmt(x.poin)}</strong></td></tr>`).join("")
            : `<tr><td colspan="3" class="kd-empty">Belum ada catatan pelanggaran.</td></tr>`;
    }

    function pick(nis, scroll) {
        const s = state.siswa.find((x) => x.nis === nis);
        if (!s) return hideSiswa();
        hideBanner();
        $("selKelas").value = s.kelas;
        if ($("selSiswa").value !== nis) { onKelas(); $("selSiswa").value = nis; }
        state.picked = s;
        renderProfil();
        $("sectionProfil").classList.remove("kd-hidden");
        $("sectionForm").classList.remove("kd-hidden");
        updatePreview();
        // Di layar kecil, profil + form ada di bawah: langsung bawa ke profil siswa.
        if (scroll) $("sectionProfil").scrollIntoView({ behavior: "smooth", block: "start" });
    }

    /* ---- pencarian cepat (nama / NIS, semua kelas) ---- */

    function renderSuggest() {
        const ul = $("qSiswaList"), q = $("qSiswa").value.trim().toLowerCase();
        if (q.length < 2) { ul.classList.add("kd-hidden"); ul.innerHTML = ""; return; }
        const words = q.split(/\s+/);
        const hits = state.siswa.filter((s) => { const h = (s.nama + " " + s.nis).toLowerCase(); return words.every((w) => h.includes(w)); });
        ul.innerHTML = hits.length
            ? hits.slice(0, 8).map((s) => `<li><button type="button" data-nis="${esc(s.nis)}"><strong>${esc(s.nama)}</strong><small>${esc(s.kelas)} · NIS ${esc(s.nis)}</small></button></li>`).join("")
              + (hits.length > 8 ? `<li class="kd-empty">${fmt(hits.length)} siswa cocok. Ketik lebih lengkap untuk mempersempit.</li>` : "")
            : `<li class="kd-empty">Tidak ada siswa yang cocok.</li>`;
        ul.classList.remove("kd-hidden");
    }
    function closeSuggest() { $("qSiswaList").classList.add("kd-hidden"); }
    function pickFromSearch(nis) {
        $("qSiswa").value = ""; closeSuggest();
        if (state.mode === "many") { addToBatch(nis); $("qSiswa").focus({ preventScroll: true }); return; }
        pick(nis, true);
    }

    $("qSiswa").addEventListener("input", renderSuggest);
    $("qSiswa").addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeSuggest();
        if (e.key === "Enter") { e.preventDefault(); const b = $("qSiswaList").querySelector("button[data-nis]"); if (b) pickFromSearch(b.dataset.nis); }
    });
    $("qSiswaList").addEventListener("click", (e) => { const b = e.target.closest("button[data-nis]"); if (b) pickFromSearch(b.dataset.nis); });
    document.addEventListener("click", (e) => { if (!e.target.closest(".kd-find-wrap")) closeSuggest(); });

    /* ---- konfirmasi setelah simpan ---- */

    function hideBanner() { $("saveBanner").classList.add("kd-hidden"); }
    function showSaved(text, nis) {
        $("saveBannerText").textContent = text;
        $("saveBanner").dataset.nis = nis || "";
        $("againBtn").classList.toggle("kd-hidden", !nis);
        $("saveBanner").classList.remove("kd-hidden");
        // Siap untuk siswa berikutnya: kelas tetap, pilihan siswa dikosongkan, kursor ke kolom cari.
        $("selSiswa").value = "";
        hideSiswa();
        $("saveBanner").scrollIntoView({ behavior: "smooth", block: "start" });
        $("qSiswa").focus({ preventScroll: true });
    }
    $("againBtn").addEventListener("click", () => { const n = $("saveBanner").dataset.nis; if (n) pick(n, true); });
    $("closeBannerBtn").addEventListener("click", hideBanner);

    function currentTatib() { return state.tatib.find((t) => t.kode === $("fKode").value) || null; }

    function updatePreview() {
        if (state.mode === "many") return renderBatchPreview();
        const box = $("preview");
        const t = currentTatib();
        $("previewPoin").textContent = `+${t ? t.poin : 0} poin`;
        if (!state.picked || !t) { box.classList.add("kd-hidden"); return; }
        const before = pointsOf(state.picked.nis), after = before + t.poin;
        const tb = tierOf(before), ta = tierOf(after);
        box.classList.remove("kd-hidden");
        box.innerHTML = `Poin <strong>${fmt(before)}</strong> → <strong>${fmt(after)}</strong> (+${fmt(t.poin)}) · Tingkat: <strong>${esc(ta.label)}</strong>`
            + (ta.label !== tb.label ? `<br>⚠️ Naik dari <em>${esc(tb.label)}</em>. Tindak lanjut: ${esc(ta.tindakan)}` : "");
        if (!$("fSanksi").value || $("fSanksi").dataset.auto === "1") {
            $("fSanksi").value = ta.label !== "Pembinaan Ringan" ? ta.label : "";
            $("fSanksi").dataset.auto = "1";
        }
    }

    function rowForSheet(s) {
        const t = currentTatib();
        return [`${$("fTanggal").value} ${new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Jakarta" })}`, s.nis, s.nama, s.kelas, t.jenis, t.poin, $("fCatatan").value || "-", t.kode, $("fSanksi").value, AdminAuth.displayName() || "admin", ""];
    }

    function setMsg(el, text) { el.textContent = text || ""; el.hidden = !text; }

    /* ---- rekap kelas (modal) ---- */

    function closeRekap() { $("rekapModal").classList.add("kd-hidden"); $("rekapBtn").focus(); }
    $("rekapBtn").addEventListener("click", () => {
        const k = $("selKelas").value;
        if (!k) return;
        $("rekapTitle").textContent = `Rekap kelas ${k}`;
        const list = siswaDiKelas(k);
        $("rekapBody").innerHTML = list.length ? list.map((s, i) => {
            const p = pointsOf(s.nis);
            return `<tr><td>${i + 1}</td><td><small>${esc(s.nis)}</small></td><td>${esc(s.nama)}</td><td class="num"><span class="kd-badge-cat" data-cat="${p > 0 ? "Berat" : "Ringan"}">${fmt(p)}</span></td><td><button type="button" class="kd-btn kd-btn--sm" data-nis="${esc(s.nis)}">Pilih</button></td></tr>`;
        }).join("") : `<tr><td colspan="5" class="kd-empty">Tidak ada siswa di kelas ini.</td></tr>`;
        $("rekapModal").classList.remove("kd-hidden");
        $("rekapClose").focus();
    });
    $("rekapClose").addEventListener("click", closeRekap);
    $("rekapModal").addEventListener("click", (e) => { if (e.target === $("rekapModal")) closeRekap(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("rekapModal").classList.contains("kd-hidden")) closeRekap(); });
    $("rekapBody").addEventListener("click", (e) => { const b = e.target.closest("button[data-nis]"); if (b) { closeRekap(); pick(b.dataset.nis, true); } });

    $("selKelas").addEventListener("change", onKelas);
    $("selSiswa").addEventListener("change", () => pick($("selSiswa").value, true));
    $("gantiBtn").addEventListener("click", () => { $("selSiswa").value = ""; hideSiswa(); $("selSiswa").focus(); });
    $("fKode").addEventListener("change", updatePreview);
    $("fSanksi").addEventListener("input", () => { $("fSanksi").dataset.auto = "0"; });

    $("resetBtn").addEventListener("click", () => {
        setTimeout(() => { $("fTanggal").value = state.hariIni; $("fSanksi").dataset.auto = ""; updatePreview(); setMsg($("formError")); setMsg($("formOk")); }, 0);
    });

    $("copyBtn").addEventListener("click", async () => {
        const many = state.mode === "many";
        if (!currentTatib() || (many ? !state.batch.size : !state.picked)) return setMsg($("formError"), "Pilih siswa dan jenis pelanggaran dulu.");
        const targets = many ? [...state.batch].map(siswaByNis).filter(Boolean) : [state.picked];
        const text = targets.map((s) => rowForSheet(s).map((c) => String(c).replace(/[\t\r\n]+/g, " ")).join("\t")).join("\n");
        try { await navigator.clipboard.writeText(text); setMsg($("formOk"), `${targets.length > 1 ? targets.length + " baris disalin" : "Baris disalin"}. Tempel di baris kosong tab Input_Pelanggaran pada Google Sheet.`); }
        catch (e) { setMsg($("formError"), "Tidak bisa menyalin otomatis. Salin manual: " + text); }
    });

    /* ---- mode "Beberapa siswa": satu jenis pelanggaran untuk banyak siswa ---- */

    const MAX_BATCH = 60;
    const siswaByNis = (nis) => state.siswa.find((x) => x.nis === nis);

    function setMode(mode) {
        state.mode = mode;
        const many = mode === "many";
        $("modeOne").classList.toggle("is-active", !many);
        $("modeMany").classList.toggle("is-active", many);
        $("modeOne").setAttribute("aria-pressed", String(!many));
        $("modeMany").setAttribute("aria-pressed", String(many));
        $("fieldSiswa").classList.toggle("kd-hidden", many);
        $("batchBox").classList.toggle("kd-hidden", !many);
        $("formTitle").textContent = many ? "Langkah 2: Catat Pelanggaran untuk Siswa Terpilih" : "Langkah 2: Tambah Pelanggaran Baru";
        $("fSanksi").placeholder = many ? "Kosongkan = otomatis sesuai tingkat tiap siswa" : "mis. Teguran lisan, Panggilan BK";
        $("fSanksi").value = ""; $("fSanksi").dataset.auto = "";
        setMsg($("formError")); setMsg($("formOk"));
        hideBanner();
        state.picked = null;
        $("sectionProfil").classList.add("kd-hidden");
        if (many) { renderRoster(); renderBatch(); }
        else { state.batch.clear(); $("sectionForm").classList.add("kd-hidden"); onKelas(); }
    }

    function renderRoster() {
        const k = $("selKelas").value, box = $("roster");
        if (!k) { box.innerHTML = `<p class="kd-empty" style="padding:.75rem">Pilih kelas untuk menampilkan daftar siswa.</p>`; return; }
        box.innerHTML = siswaDiKelas(k).map((s) => `
            <label class="kd-rrow"><input type="checkbox" value="${esc(s.nis)}"${state.batch.has(s.nis) ? " checked" : ""}>
                <span class="kd-rname">${esc(s.nama)}</span><small>NIS ${esc(s.nis)} · ${fmt(pointsOf(s.nis))} poin</small></label>`).join("")
            || `<p class="kd-empty" style="padding:.75rem">Tidak ada siswa di kelas ini.</p>`;
    }

    function addToBatch(nis) {
        if (!siswaByNis(nis)) return;
        if (!state.batch.has(nis) && state.batch.size >= MAX_BATCH) return setMsg($("formError"), `Maksimal ${MAX_BATCH} siswa sekali catat.`);
        setMsg($("formError"));
        state.batch.add(nis);
        renderRoster(); renderBatch();
    }

    function removeFromBatch(nis) { state.batch.delete(nis); renderRoster(); renderBatch(); }

    function renderBatch() {
        const n = state.batch.size;
        $("batchChosen").innerHTML = n
            ? `<div class="kd-chosen-head"><strong>${fmt(n)} siswa terpilih</strong></div>` + [...state.batch].map((nis) => {
                const s = siswaByNis(nis);
                return s ? `<span class="kd-pick"><span>${esc(s.nama)} <small>${esc(s.kelas)}</small></span><button type="button" data-nis="${esc(nis)}" aria-label="Hapus ${esc(s.nama)} dari pilihan">×</button></span>` : "";
            }).join("")
            : `<p class="kd-card-sub" style="margin:.5rem 0 0">Belum ada siswa terpilih.</p>`;
        $("sectionForm").classList.toggle("kd-hidden", state.mode === "many" && n === 0);
        if (state.mode === "many") updatePreview();
    }

    // Ringkasan sebelum simpan: poin sebelum → sesudah, tingkat naik ditandai.
    function batchPlan() {
        const t = currentTatib();
        return [...state.batch].map(siswaByNis).filter(Boolean).map((s) => {
            const before = pointsOf(s.nis), after = before + (t ? t.poin : 0);
            const tb = tierOf(before), ta = tierOf(after);
            return { s, before, after, tb, ta, naik: !!t && ta.label !== tb.label };
        });
    }

    function renderBatchPreview() {
        const box = $("preview"), t = currentTatib();
        $("previewPoin").textContent = `+${t ? t.poin : 0} poin per siswa`;
        if (!t || !state.batch.size) { box.classList.add("kd-hidden"); return; }
        const plan = batchPlan().sort((a, z) => (z.naik - a.naik) || a.s.nama.localeCompare(z.s.nama));
        const naik = plan.filter((p) => p.naik).length;
        box.classList.remove("kd-hidden");
        box.innerHTML = `<strong>${fmt(plan.length)} siswa</strong> × +${fmt(t.poin)} poin${naik ? ` · <strong>⚠️ ${fmt(naik)} siswa naik tingkat</strong>` : ""}`
            + `<ul class="kd-plan">${plan.map((p) => `<li${p.naik ? ' class="up"' : ""}><span>${esc(p.s.nama)} <small>${esc(p.s.kelas)}</small></span><span>${fmt(p.before)} → <strong>${fmt(p.after)}</strong>${p.naik ? ` · ${esc(p.ta.label)}` : ""}</span></li>`).join("")}</ul>`;
    }

    $("modeOne").addEventListener("click", () => state.mode !== "one" && setMode("one"));
    $("modeMany").addEventListener("click", () => state.mode !== "many" && setMode("many"));
    $("roster").addEventListener("change", (e) => {
        const c = e.target.closest("input[type=checkbox]");
        if (!c) return;
        if (c.checked) { addToBatch(c.value); if (!state.batch.has(c.value)) c.checked = false; } else removeFromBatch(c.value);
    });
    $("batchChosen").addEventListener("click", (e) => { const b = e.target.closest("button[data-nis]"); if (b) removeFromBatch(b.dataset.nis); });
    $("rosterAll").addEventListener("click", () => {
        const k = $("selKelas").value;
        if (!k) return setMsg($("formError"), "Pilih kelas dulu.");
        siswaDiKelas(k).forEach((s) => { if (state.batch.size < MAX_BATCH) state.batch.add(s.nis); });
        if (siswaDiKelas(k).some((s) => !state.batch.has(s.nis))) setMsg($("formError"), `Maksimal ${MAX_BATCH} siswa sekali catat; sebagian tidak ikut terpilih.`); else setMsg($("formError"));
        renderRoster(); renderBatch();
    });
    $("rosterNone").addEventListener("click", () => { state.batch.clear(); setMsg($("formError")); renderRoster(); renderBatch(); });

    /* ---- antrean offline (hanya NIS + kode + isian; tanpa nama siswa) ---- */

    function getQueue() { try { return JSON.parse(localStorage.getItem(QKEY) || "[]"); } catch (e) { return []; } }
    function setQueue(q) { try { localStorage.setItem(QKEY, JSON.stringify(q)); } catch (e) { /* penyimpanan tidak tersedia */ } renderQueue(); }
    function renderQueue() {
        const n = getQueue().reduce((a, q) => a + (Array.isArray(q.items) ? q.items.length : 1), 0);   // jumlah baris, bukan jumlah paket
        $("queueBanner").classList.toggle("kd-hidden", n === 0);
        document.dispatchEvent(new CustomEvent("kd:queue"));   // lencana antrean di sidebar
        $("queueCountText").textContent = `Ada ${n} data antrean offline belum terkirim.`;
    }
    const newId = () => "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

    async function postItem(item) {
        const r = await fetch(CONFIG.API.PELANGGARAN, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item) });
        const body = await r.json().catch(() => ({}));
        return { r, body };
    }

    let syncing = false;
    async function syncQueue() {
        if (syncing || !navigator.onLine) return;
        syncing = true;
        try {
            let q = getQueue();
            while (q.length) {
                let res;
                try { res = await postItem(q[0]); } catch (e) { break; }          // jaringan putus -> coba lagi nanti
                if (res.r.status === 401) { AdminAuth.logout(); location.reload(); return; }
                if (res.r.status >= 500 || res.body.code === "READ_ONLY") break;  // server belum siap -> tetap antre
                q = q.slice(1);                                                   // sukses / duplikat / ditolak permanen (4xx)
                setQueue(q);
            }
            await load(true);
        } finally { syncing = false; }
    }
    $("syncBtn").addEventListener("click", syncQueue);
    window.addEventListener("online", syncQueue);

    $("inputForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        setMsg($("formError")); setMsg($("formOk"));
        const t = currentTatib();
        const many = state.mode === "many";
        if (many && !state.batch.size) return setMsg($("formError"), "Centang minimal satu siswa.");
        if (many && state.batch.size > MAX_BATCH) return setMsg($("formError"), `Maksimal ${MAX_BATCH} siswa sekali catat.`);
        if (!many && !state.picked) return setMsg($("formError"), "Pilih siswa terlebih dahulu.");
        if (!t) return setMsg($("formError"), "Pilih jenis pelanggaran.");
        if (!$("fTanggal").value) return setMsg($("formError"), "Tanggal kejadian wajib diisi.");
        if ($("fTanggal").value > state.hariIni) return setMsg($("formError"), "Tanggal tidak boleh di masa depan.");

        const plan = many ? batchPlan() : [];
        const manualSanksi = $("fSanksi").value.trim();
        const item = many
            ? {
                // Sanksi kosong = otomatis: tingkat baru tiap siswa (kecuali Pembinaan Ringan). clientId per siswa mencegah baris ganda saat kirim ulang.
                items: plan.map((p) => ({ nis: p.s.nis, sanksi: manualSanksi || (p.ta.label !== "Pembinaan Ringan" ? p.ta.label : ""), clientId: newId() })),
                kode: t.kode, tanggal: $("fTanggal").value, catatan: $("fCatatan").value
            }
            : { nis: state.picked.nis, kode: t.kode, tanggal: $("fTanggal").value, sanksi: $("fSanksi").value, catatan: $("fCatatan").value, clientId: newId() };
        const afterSave = () => {
            $("inputForm").reset(); $("fTanggal").value = state.hariIni; $("fSanksi").dataset.auto = "";
            if (many) { state.batch.clear(); renderRoster(); renderBatch(); } else updatePreview();
        };

        $("saveBtn").disabled = true;
        $("saveBtn").textContent = "Menyimpan…";
        try {
            if (!navigator.onLine) throw Object.assign(new Error("offline"), { offline: true });
            const { r, body } = await postItem(item);

            if (r.status === 401) { AdminAuth.logout(); location.reload(); return; }
            if (!r.ok || !body.success) {
                if (r.status >= 500 && body.code !== "READ_ONLY") throw Object.assign(new Error("server"), { offline: true });
                setMsg($("formError"), body.message || `Gagal menyimpan (HTTP ${r.status}).`);
                if (body.code === "READ_ONLY") $("copyBtn").classList.remove("kd-hidden");
                return;
            }
            $("copyBtn").classList.add("kd-hidden");
            await load(true);
            if (many) {
                const d = body.data, naik = plan.filter((p) => p.naik);
                afterSave();
                showSaved(`✔ ${fmt(d.count)} siswa tercatat: ${d.jenis} +${fmt(d.poin)} poin tiap siswa.`
                    + (d.duplicates ? ` (${fmt(d.duplicates)} sudah tercatat sebelumnya, dilewati.)` : "")
                    + (naik.length ? ` Perlu tindak lanjut: ${naik.slice(0, 6).map((p) => `${p.s.nama} (${p.ta.label})`).join(", ")}${naik.length > 6 ? ` dan ${naik.length - 6} lainnya` : ""}.` : ""), "");
                return;
            }
            const total = pointsOf(item.nis), tier = tierOf(total);
            afterSave();
            showSaved(`✔ Tersimpan: ${body.data.nama} (${body.data.kelas}) · ${body.data.jenis} +${body.data.poin} poin. Total kini ${fmt(total)} poin${tier ? " · " + tier.label : ""}.`, item.nis);
        } catch (err) {
            // Jaringan/server bermasalah: simpan di antrean, kirim otomatis nanti (clientId mencegah dobel).
            setQueue([...getQueue(), item]);
            afterSave();
            showSaved("Koneksi bermasalah. Data disimpan di perangkat ini dan dikirim otomatis saat tersambung.", "");
        } finally {
            $("saveBtn").disabled = false;
            $("saveBtn").textContent = "Simpan Pelanggaran";
        }
    });

    /* ---------- DATA ---------- */

    function filtered() {
        const q = $("qText").value.trim().toLowerCase(), k = $("qKelas").value, c = $("qKat").value, b = $("qBulan").value;
        return state.v.filter((x) =>
            (!q || x.nama.toLowerCase().includes(q) || x.nis.includes(q) || x.jenis.toLowerCase().includes(q)) &&
            (!k || x.kelas === k) && (!c || x.kategori === c) && (!b || x.tanggal.slice(0, 7) === b))
            .sort((a, z) => (a.tanggal < z.tanggal ? 1 : a.tanggal > z.tanggal ? -1 : (a.id < z.id ? 1 : -1)));
    }

    function renderData() {
        const rows = filtered();
        const pages = Math.max(1, Math.ceil(rows.length / PAGE));
        page = Math.min(page, pages);
        const slice = rows.slice((page - 1) * PAGE, page * PAGE);
        $("dataBody").innerHTML = slice.length ? slice.map((x) => `
            <tr><td>${esc(fmtDate(x.tanggal))}</td><td>${esc(x.nama)}<br><small style="opacity:.7">${esc(x.nis)}</small></td><td>${esc(x.kelas)}</td>
            <td>${esc(x.jenis)}${x.catatan && x.catatan !== "-" ? `<br><small style="opacity:.7">${esc(x.catatan)}</small>` : ""}${x.pencatat ? `<br><small style="opacity:.55">oleh ${esc(x.pencatat)}</small>` : ""}</td>
            <td><span class="kd-badge-cat" data-cat="${esc(x.kategori)}">${esc(x.kategori)}</span></td><td class="num">${fmt(x.poin)}</td></tr>`).join("")
            : `<tr><td colspan="6" class="kd-empty">Tidak ada data yang cocok.</td></tr>`;
        $("dataCount").textContent = `${fmt(rows.length)} catatan`;
        $("pageInfo").textContent = `Halaman ${page} dari ${pages}`;
        $("prevPage").disabled = page <= 1;
        $("nextPage").disabled = page >= pages;
    }

    ["qText", "qKelas", "qKat", "qBulan"].forEach((id) => $(id).addEventListener("input", () => { page = 1; renderData(); }));
    $("prevPage").addEventListener("click", () => { page--; renderData(); });
    $("nextPage").addEventListener("click", () => { page++; renderData(); });
    $("csvData").addEventListener("click", () => downloadCSV(`pelanggaran-${state.hariIni}.csv`,
        ["ID", "Tanggal", "NIS", "Nama", "Kelas", "Kode", "Jenis", "Kategori", "Poin", "Sanksi", "Pencatat", "Catatan"],
        filtered().map((x) => [x.id, x.tanggal, x.nis, x.nama, x.kelas, x.kode, x.jenis, x.kategori, x.poin, x.sanksi, x.pencatat, x.catatan])));

    function fillFilters() {
        const kelas = [...new Set(state.v.map((x) => x.kelas).concat(state.siswa.map((s) => s.kelas)))].filter(Boolean).sort();
        $("qKelas").innerHTML = `<option value="">Semua</option>` + kelas.map((k) => `<option>${esc(k)}</option>`).join("");
        const bulan = [...new Set(state.v.map((x) => x.tanggal.slice(0, 7)))].sort().reverse();
        $("qBulan").innerHTML = `<option value="">Semua</option>` + bulan.map((b) => { const [y, m] = b.split("-"); return `<option value="${b}">${KD.MONTHS[Number(m) - 1]} ${y}</option>`; }).join("");
        $("minTier").innerHTML = state.tingkat.map((t, i) => `<option value="${i}"${i === 1 ? " selected" : ""}>${esc(t.label)} (≥ ${t.min})</option>`).join("");
    }

    /* ---------- PEMBINAAN ---------- */

    function pembinaanRows() {
        const r = ayRange();
        const map = new Map();
        state.v.filter((x) => x.tanggal >= r.from && x.tanggal <= r.to).forEach((x) => {
            const e = map.get(x.nis) || { nis: x.nis, nama: x.nama, kelas: x.kelas, poin: 0, kasus: 0 };
            e.poin += x.poin; e.kasus++; map.set(x.nis, e);
        });
        const min = state.tingkat[Number($("minTier").value) || 0].min;
        return [...map.values()].filter((e) => e.poin >= min).sort((a, b) => b.poin - a.poin);
    }

    function renderPembinaan() {
        const rows = pembinaanRows();
        $("pembinaanSub").textContent = `Poin kumulatif tahun ajaran ${ayRange().label} · ${fmt(rows.length)} siswa`;
        $("pembinaanBody").innerHTML = rows.length ? rows.map((e) => { const t = tierOf(e.poin); return `
            <tr><td>${esc(e.nama)}<br><small style="opacity:.7">${esc(e.nis)}</small></td><td>${esc(e.kelas)}</td><td class="num"><strong>${fmt(e.poin)}</strong></td><td class="num">${fmt(e.kasus)}</td>
            <td><span class="kd-tier" data-w="${esc(t.warna)}" style="margin:0 0 .3rem">${esc(t.label)}</span><br><small>${esc(t.tindakan)}</small></td></tr>`; }).join("")
            : `<tr><td colspan="5" class="kd-empty">Tidak ada siswa pada tingkat ini.</td></tr>`;
    }

    $("minTier").addEventListener("change", renderPembinaan);
    $("csvPembinaan").addEventListener("click", () => downloadCSV(`perlu-pembinaan-${state.hariIni}.csv`,
        ["NIS", "Nama", "Kelas", "Poin", "Kasus", "Tingkat", "Tindak lanjut"],
        pembinaanRows().map((e) => { const t = tierOf(e.poin); return [e.nis, e.nama, e.kelas, e.poin, e.kasus, t.label, t.tindakan]; })));

    /* ---------- load ---------- */

    async function load(silent) {
        try {
            const res = await getJSON(CONFIG.API.PELANGGARAN);
            try { localStorage.setItem(CKEY, JSON.stringify(res)); } catch (e) { /* abaikan */ }
            applyData(res, silent);
        } catch (e) {
            if (e.status === 401) { AdminAuth.logout(); location.reload(); return; }
            let cached = null;
            try { cached = JSON.parse(localStorage.getItem(CKEY) || "null"); } catch (x) { /* abaikan */ }
            if (cached && cached.data && !navigator.onLine) {
                applyData(cached, silent);
                $("adminMode").textContent = "Offline · data tersimpan di perangkat";
                $("adminAlert").innerHTML = `<div class="kd-card" role="status"><strong>Offline.</strong> Menampilkan data tersimpan di perangkat.</div>`;
                return;
            }
            $("adminAlert").innerHTML = `<div class="kd-card kd-error" role="alert"><strong>Data tidak dapat dimuat.</strong> <span>${esc(e.message)}</span>${e.detail ? `<br><small>Alasan Google: <code>${esc([e.detail.status, e.detail.reason].filter(Boolean).join(" · "))}</code> ${esc(e.detail.message || "")}<br>Sheet yang dibaca server: <code>${esc(e.detail.sheet || "-")}</code> · Akun: <code>${esc(e.detail.account || "-")}</code></small>` : ""} <button type="button" class="kd-btn kd-btn--sm" id="retry" style="margin-left:.5rem">Coba lagi</button></div>`;
            const r = $("retry"); if (r) r.addEventListener("click", () => load());
        }
    }

    function applyData(res, silent) {
        {
            const d = res.data;
            Object.assign(state, { v: d.violations, siswa: d.siswa, tatib: d.tatib, tingkat: d.tingkat, hariIni: d.hariIni, canWrite: res.canWrite, sheetUrl: res.sheetUrl });

            $("adminMode").textContent = res.mode === "demo" ? "Mode demo (data contoh)" : res.canWrite ? "Terhubung · bisa menyimpan" : "Terhubung · hanya baca";
            $("adminMode").className = "kd-chip " + (res.mode === "demo" ? "kd-chip--demo" : "kd-chip--live");
            if (res.sheetUrl) { $("sheetLink").href = res.sheetUrl; $("sheetLink").classList.remove("kd-hidden"); }
            document.dispatchEvent(new CustomEvent("kd:sheet", { detail: { url: res.sheetUrl || "" } }));

            if (!silent) {
                fillJenis(); fillFilters(); fillKelas();
                $("fTanggal").value = state.hariIni; $("fTanggal").max = state.hariIni;
                if (!res.canWrite) {
                    $("adminAlert").innerHTML = `<div class="kd-card" role="status"><strong>${res.mode === "demo" ? "Mode demo." : "Mode hanya baca."}</strong>
                        <span class="kd-card-sub" style="display:block;margin:.25rem 0 0">${res.mode === "demo"
                            ? "Atur GOOGLE_SHEET_ID di Vercel untuk memakai data sungguhan."
                            : "Service account belum diatur, jadi pelanggaran baru diisi langsung di Google Sheet."} Tombol “Salin baris” tetap tersedia setelah mengisi form.</span></div>`;
                    $("copyBtn").classList.remove("kd-hidden");
                }
                if (AdminAuth.insecure()) {
                    $("adminAlert").insertAdjacentHTML("beforeend", `<div class="kd-card" role="alert" style="margin-top:1rem;border-color:rgba(255,201,60,.6)">⚠️ Server masih memakai kredensial & kunci sesi bawaan dari kode publik. Atur <code>ADMIN_PASSWORD</code> dan <code>ADMIN_SESSION_SECRET</code> di Vercel.</div>`);
                }
            } else {
                fillFilters(); fillKelas();
            }
            renderData(); renderPembinaan();
        }
    }

    // Hapus cache data siswa dari perangkat saat admin keluar.
    const _logout = AdminAuth.logout;
    AdminAuth.logout = function () { try { localStorage.removeItem(CKEY); } catch (e) { /* abaikan */ } return _logout.apply(this, arguments); };

    renderQueue();
    showTab(location.hash.slice(1));
    // Tanpa sesi admin, halaman tertutup overlay login (js/admin-auth.js) dan login memuat ulang halaman.
    if (AdminAuth.isLoggedIn()) load().then(syncQueue);

})();
