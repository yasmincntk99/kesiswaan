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

    const state = { v: [], siswa: [], tatib: [], tingkat: [], canWrite: false, sheetUrl: "", hariIni: "", pb: [], picked: null, mode: "one", batch: new Set() };
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

    const TABS = ["input", "data", "pembinaan", "ringkasan", "perapian"];
    const TAB_LABEL = { input: "Catat Pelanggaran", data: "Data Pelanggaran", pembinaan: "Perlu Pembinaan", ringkasan: "Ringkasan Harian", perapian: "Rapikan Data" };

    // Akun Kesiswaan (tanpa Komisi) hanya boleh Data & Perlu Pembinaan; server tetap memeriksa di setiap panggilan.
    const LIMITED = !!(AdminAuth.limited && AdminAuth.limited());
    const ALLOWED = LIMITED ? ["data", "pembinaan"] : TABS;

    function showTab(name, scroll) {
        if (!ALLOWED.includes(name)) name = LIMITED ? "pembinaan" : "input";
        TABS.forEach((t) => $("panel-" + t).classList.toggle("kd-hidden", t !== name));
        $("adminSection").textContent = TAB_LABEL[name];
        document.dispatchEvent(new CustomEvent("kd:tab", { detail: { tab: name } }));   // sidebar menyorot menu aktif
        if (name === "data") renderData();
        if (name === "pembinaan") renderPembinaan();
        if (name === "ringkasan") loadRingkasan();
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

    /* ---------- Asisten AI: kalimat -> usulan (guru yang memeriksa & menyimpan) ---------- */
    const aiPick = {};      // kode siswa (S1..) -> NIS terpilih
    let aiData = null;

    function aiMsg(t) { const m = $("aiMsg"); m.textContent = t || ""; m.classList.toggle("kd-hidden", !t); }

    function renderAi() {
        const d = aiData, box = $("aiOut");
        if (!d) { box.innerHTML = ""; return; }
        if (!d.mentions.length) { box.innerHTML = `<p class="kd-empty">${esc(d.pesan || "Tidak ada nama siswa yang cocok.")}</p>`; return; }
        const nameOf = (m) => {
            const nis = aiPick[m.id];
            const c = m.kandidat.find((x) => x.nis === nis);
            return c ? `${esc(c.nama)} (${esc(c.kelas)})` : null;
        };
        const names = d.mentions.map((m) => {
            if (m.status === "ok") return `<li>✔ “${esc(m.teks)}” → <strong>${nameOf(m)}</strong></li>`;
            if (m.status === "ambigu") return `<li>❓ “${esc(m.teks)}” cocok dengan beberapa siswa — pilih:
                <select class="kd-select" data-mid="${m.id}" style="max-width:100%"><option value="">— pilih siswa —</option>${m.kandidat.map((c) => `<option value="${esc(c.nis)}"${aiPick[m.id] === c.nis ? " selected" : ""}>${esc(c.nama)} (${esc(c.kelas)})</option>`).join("")}</select></li>`;
            return `<li>⚠ “${esc(m.teks)}” terlalu umum. Tambahkan kelas atau nama lengkap.</li>`;
        }).join("");
        const groups = d.kelompok.map((g, i) => {
            const who = g.siswa.map((id) => { const m = d.mentions.find((x) => x.id === id); return m && (nameOf(m) || `<em>${esc(m.teks)} (belum dipilih)</em>`); }).filter(Boolean).join(", ");
            const jenis = g.kode
                ? `<strong>${esc(g.jenis)}</strong> <small>(+${fmt(g.poin)} poin)</small><input type="hidden" data-g="${i}" data-f="kode" value="${esc(g.kode)}">`
                : `<select class="kd-select" data-g="${i}" data-f="kode"><option value="">— AI belum yakin, pilih jenis —</option>${state.tatib.map((t) => `<option value="${esc(t.kode)}">[${esc(t.kode)}] ${esc(t.jenis)} (+${t.poin})</option>`).join("")}</select>`;
            return `<div class="kd-card" style="margin-top:.6rem;padding:.8rem">
                <div>${jenis}</div>
                <div style="margin:.35rem 0;font-size:var(--font-sm)">Siswa: ${who}</div>
                <div class="kd-form-grid">
                    <div class="kd-field"><label class="kd-field-label">Tanggal</label><input class="kd-input" type="date" data-g="${i}" data-f="tanggal" max="${new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" })}" value="${esc(g.tanggal)}"></div>
                    <div class="kd-field"><label class="kd-field-label">Keterangan</label><input class="kd-input" type="text" maxlength="120" data-g="${i}" data-f="catatan" value="${esc(g.catatan)}"></div>
                </div>
                <div class="kd-actions" style="margin-top:.5rem"><button type="button" class="kd-btn kd-btn--sm kd-btn--primary" data-apply="${i}">Isi form dengan ini</button></div>
            </div>`;
        }).join("");
        const sisa = d.tanpaJenis.length ? `<p class="kd-card-sub">Belum ada jenis pelanggaran untuk: ${d.tanpaJenis.map((id) => esc((d.mentions.find((m) => m.id === id) || {}).teks)).join(", ")}. Catat manual atau tulis ulang kalimatnya.</p>` : "";
        const lain = d.belumTercocok.length ? `<p class="kd-card-sub">Nama tidak dikenali: ${d.belumTercocok.map(esc).join(", ")}.</p>` : "";
        box.innerHTML = `<ul style="list-style:none;padding:0;margin:.8rem 0 0;display:grid;gap:.4rem;font-size:var(--font-sm)">${names}</ul>${groups || `<p class="kd-empty">AI tidak menemukan jenis pelanggaran pada kalimat itu.</p>`}${sisa}${lain}`;
    }

    $("aiRun").addEventListener("click", async () => {
        const teks = $("aiTeks").value.trim();
        if (teks.length < 5) return aiMsg("Tulis kalimatnya dulu.");
        const btn = $("aiRun");
        btn.disabled = true; btn.textContent = "Memproses…"; aiMsg("");
        try {
            const r = await fetch(CONFIG.API.AI_CATAT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ teks }) });
            const body = await r.json().catch(() => ({}));
            if (r.status === 401) { AdminAuth.logout(); location.reload(); return; }
            if (!r.ok || body.success === false) throw new Error(body.message || (r.status === 504 || r.status === 502 ? "Server AI terlalu lama menjawab. Coba lagi." : `Gagal (HTTP ${r.status}).`));
            aiData = body.data;
            Object.keys(aiPick).forEach((k) => delete aiPick[k]);
            aiData.mentions.forEach((m) => { if (m.status === "ok") aiPick[m.id] = m.kandidat[0].nis; });
            renderAi();
        } catch (e) { aiMsg(e.message); }
        finally { btn.disabled = false; btn.textContent = "Terjemahkan"; }
    });

    $("aiOut").addEventListener("change", (e) => {
        const sel = e.target.closest("select[data-mid]");
        if (sel) { aiPick[sel.dataset.mid] = sel.value; renderAi(); }
    });

    $("aiOut").addEventListener("click", (e) => {
        const b = e.target.closest("button[data-apply]");
        if (!b || !aiData) return;
        const i = Number(b.dataset.apply), g = aiData.kelompok[i];
        const f = (name) => $("aiOut").querySelector(`[data-g="${i}"][data-f="${name}"]`).value;
        const kode = f("kode");
        if (!kode) return aiMsg("Pilih jenis pelanggaran untuk kelompok ini.");
        const nisList = g.siswa.map((id) => aiPick[id]).filter(Boolean);
        if (nisList.length < g.siswa.length) return aiMsg("Pilih dulu siswa yang masih bertanda ❓.");
        aiMsg("");
        setMode("many");
        state.batch.clear();
        nisList.forEach(addToBatch);
        $("fKode").value = kode;
        $("fTanggal").value = f("tanggal") || $("fTanggal").value;
        $("fCatatan").value = f("catatan") || "";
        $("fKode").dispatchEvent(new Event("change"));
        renderRoster(); renderBatch();
        $("sectionForm").classList.remove("kd-hidden");
        setMsg($("formOk"), "Form terisi dari kalimat Anda. Periksa siswa, jenis, dan tanggal, lalu tekan Simpan.");
        $("sectionForm").scrollIntoView({ behavior: "smooth", block: "start" });
    });

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
            <tr><td data-label="Tanggal">${esc(fmtDate(x.tanggal))}</td><td data-label="Siswa">${esc(x.nama)}<br><small style="opacity:.7">${esc(x.nis)}</small></td><td data-label="Kelas">${esc(x.kelas)}</td>
            <td data-label="Pelanggaran">${esc(x.jenis)}${x.catatan && x.catatan !== "-" ? `<br><small style="opacity:.7">${esc(x.catatan)}</small>` : ""}${x.pencatat ? `<br><small style="opacity:.55">oleh ${esc(x.pencatat)}</small>` : ""}</td>
            <td data-label="Kategori"><span class="kd-badge-cat" data-cat="${esc(x.kategori)}">${esc(x.kategori)}</span></td><td class="num" data-label="Poin">${fmt(x.poin)}</td></tr>`).join("")
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
        const want = $("pbStatus").value;
        return [...map.values()].filter((e) => e.poin >= min).map((e) => {
            // Status = catatan terbaru untuk tingkat yang sedang berlaku (naik tingkat = kembali "Belum").
            const t = tierOf(e.poin);
            const logs = state.pb.filter((x) => x.nis === e.nis && x.tingkat === t.label && x.tanggal >= r.from && x.tanggal <= r.to);
            const last = logs[logs.length - 1];
            return Object.assign(e, { t, needs: state.tingkat.indexOf(t) >= 1, status: last ? last.status : "Belum", last });
        }).filter((e) => want === "all" || (want === "open" ? e.status !== "Selesai" : e.status === want))
          .sort((a, b) => b.poin - a.poin);
    }

    function pbCell(e) {
        if (!e.needs) return `<span class="kd-card-sub">Tidak perlu</span>`;
        const who = e.last ? `<br><small style="opacity:.75">${esc(fmtDate(e.last.tanggal))} · ${esc(e.last.penangani || "-")}${e.last.catatan && e.last.catatan !== "-" ? " · " + esc(e.last.catatan) : ""}</small>` : "";
        const btn = (st, label) => `<button type="button" class="kd-btn kd-btn--sm" data-pb="${esc(e.nis)}" data-st="${st}"${state.canWrite ? "" : " disabled"}>${label}</button>`;
        const hasWa = (state.siswa.find((x) => x.nis === e.nis) || {}).hasWa;
        const print = `<button type="button" class="kd-btn kd-btn--sm" data-print="${esc(e.nis)}" title="Buka surat untuk dicetak / disimpan PDF">🖨️ Cetak surat</button> `
            + (hasWa ? `<button type="button" class="kd-btn kd-btn--sm" data-wa="${esc(e.nis)}" title="Buka WhatsApp dengan pesan + tautan surat">💬 Kirim WA</button>`
                     : `<button type="button" class="kd-btn kd-btn--sm" disabled title="Nomor WA orang tua belum ada di Data_Foto_Siswa">💬 No. WA kosong</button>`);
        if (e.status === "Selesai") return `<strong>✔ Selesai</strong> ${print}${who}`;
        if (e.status === "Dipanggil") return `<strong>Dipanggil</strong> ${btn("Selesai", "Tandai selesai")} ${print}${who}`;
        const label = e.status === "Surat dikirim" ? `<strong>✉ Surat dikirim</strong>` : `<span style="opacity:.8">Belum</span>`;
        return `${label} ${btn("Dipanggil", "Tandai dipanggil")} ${btn("Selesai", "Selesai")} ${print}${who}`;
    }

    function renderPembinaan() {
        if (!state.tingkat.length) return;   // data belum dimuat
        const rows = pembinaanRows();
        $("pembinaanSub").textContent = `Poin kumulatif tahun ajaran ${ayRange().label} · ${fmt(rows.length)} siswa`;
        $("pembinaanBody").innerHTML = rows.length ? rows.map((e) => { const t = e.t; return `
            <tr><td data-label="Siswa">${esc(e.nama)}<br><small style="opacity:.7">${esc(e.nis)}</small></td><td data-label="Kelas">${esc(e.kelas)}</td><td class="num" data-label="Poin"><strong>${fmt(e.poin)}</strong></td><td class="num" data-label="Kasus">${fmt(e.kasus)}</td>
            <td data-label="Tingkat &amp; tindak lanjut"><span class="kd-tier" data-w="${esc(t.warna)}" style="margin:0 0 .3rem">${esc(t.label)}</span><br><small>${esc(t.tindakan)}</small></td>
            <td data-label="Status" class="kd-act">${pbCell(e)}</td></tr>`; }).join("")
            : `<tr><td colspan="6" class="kd-empty">Tidak ada siswa pada filter ini.</td></tr>`;
    }

    $("minTier").addEventListener("change", renderPembinaan);
    $("pbStatus").addEventListener("change", renderPembinaan);
    $("csvPembinaan").addEventListener("click", () => downloadCSV(`perlu-pembinaan-${state.hariIni}.csv`,
        ["NIS", "Nama", "Kelas", "Poin", "Kasus", "Tingkat", "Tindak lanjut", "Status", "Penangani", "Catatan"],
        pembinaanRows().map((e) => [e.nis, e.nama, e.kelas, e.poin, e.kasus, e.t.label, e.t.tindakan, e.needs ? e.status : "-", e.last ? e.last.penangani : "", e.last ? e.last.catatan : ""])));

    /* ---------- Dialog jadwal kehadiran orang tua (tanggal, jam 08.00–13.00, ruang) ---------- */
    const WAKTU = ["08.00", "08.30", "09.00", "09.30", "10.00", "10.30", "11.00", "11.30", "12.00", "12.30", "13.00"];
    const RUANG = ["Ruang BK", "Ruang Pertemuan"];

    const todayWIB = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });

    function askJadwal(judul) {
        return new Promise((resolve) => {
            const today = todayWIB();
            const maxD = new Date(Date.parse(today + "T00:00:00Z") + 90 * 86400000).toISOString().slice(0, 10);
            const ov = document.createElement("div");
            ov.className = "kd-overlay";
            ov.innerHTML = `
              <form class="kd-modal" role="dialog" aria-modal="true" aria-labelledby="jdTitle" novalidate>
                <h2 class="kd-modal-title" id="jdTitle">${esc(judul)}</h2>
                <p class="kd-modal-sub">Tentukan jadwal kehadiran orang tua/wali. Isian ini tercetak pada surat.</p>
                <div class="kd-field"><label class="kd-field-label" for="jdTgl">Hari / tanggal</label>
                  <input class="kd-input" id="jdTgl" type="date" min="${today}" max="${maxD}" required></div>
                <div class="kd-field"><label class="kd-field-label" for="jdJam">Waktu (WIB)</label>
                  <select class="kd-select" id="jdJam">${WAKTU.map((x) => `<option value="${x}">Pukul ${x}</option>`).join("")}</select></div>
                <div class="kd-field"><label class="kd-field-label" for="jdRuang">Ruangan</label>
                  <select class="kd-select" id="jdRuang">${RUANG.map((x) => `<option>${x}</option>`).join("")}</select></div>
                <p class="kd-error-inline" id="jdErr" role="alert" style="color:#ffb4b4;font-size:var(--font-sm);min-height:1.2em;margin:.5rem 0 0"></p>
                <div style="display:flex;gap:.6rem;justify-content:flex-end;margin-top:var(--space-md);flex-wrap:wrap">
                  <button type="button" class="kd-btn kd-btn--ghost" id="jdBatal">Batal</button>
                  <button type="submit" class="kd-btn kd-btn--primary" id="jdOk">Lanjut</button>
                </div>
              </form>`;
            document.body.appendChild(ov);
            document.body.classList.add("kd-lock");
            const $o = (id) => ov.querySelector("#" + id);
            const done = (v) => { document.body.classList.remove("kd-lock"); ov.remove(); document.removeEventListener("keydown", onKey); resolve(v); };
            const onKey = (e) => { if (e.key === "Escape") done(null); };
            document.addEventListener("keydown", onKey);
            $o("jdBatal").addEventListener("click", () => done(null));
            ov.addEventListener("mousedown", (e) => { if (e.target === ov) done(null); });
            ov.querySelector("form").addEventListener("submit", (e) => {
                e.preventDefault();
                const tanggal = $o("jdTgl").value;
                const err = (m) => { $o("jdErr").textContent = m; };
                if (!tanggal) return err("Pilih tanggal kehadiran terlebih dahulu.");
                if (tanggal < today) return err("Tanggal tidak boleh sebelum hari ini.");
                if (tanggal > maxD) return err("Tanggal maksimal 90 hari ke depan.");
                if (new Date(tanggal + "T00:00:00Z").getUTCDay() === 0) return err("Hari Minggu tidak dapat dipilih.");
                done({ tanggal, waktu: $o("jdJam").value, ruang: $o("jdRuang").value });
            });
            $o("jdTgl").focus();
        });
    }

    $("pembinaanBody").addEventListener("click", async (ev) => {
        const b = ev.target.closest("button[data-pb]");
        if (!b || b.disabled) return;
        const catatan = window.prompt(b.dataset.st === "Selesai" ? "Catatan hasil pembinaan (boleh kosong):" : "Catatan pemanggilan (boleh kosong):", "");
        if (catatan === null) return;      // dibatalkan
        b.disabled = true;
        try {
            const r = await fetch(CONFIG.API.PEMBINAAN, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nis: b.dataset.pb, status: b.dataset.st, catatan, clientId: newId() }) });
            const body = await r.json().catch(() => ({}));
            if (r.status === 401) { AdminAuth.logout(); location.reload(); return; }
            if (!r.ok || body.success === false) throw new Error(body.message || `Gagal menyimpan (HTTP ${r.status}).`);
            await loadPembinaan();
        } catch (e) {
            b.disabled = false;
            $("adminAlert").innerHTML = `<div class="kd-card kd-error" role="alert"><strong>Tindak lanjut belum tersimpan.</strong> ${esc(e.message)}</div>`;
            window.scrollTo({ top: 0, behavior: "smooth" });
        }
    });


    /* ---------- SURAT PANGGILAN / PERINGATAN (cetak & WhatsApp) ---------- */
    // Surat dibuat server (tautan bertanda tangan, berlaku 14 hari). WhatsApp dikirim guru sendiri
    // lewat tautan wa.me -- sengaja manual satu per satu supaya nomor sekolah/guru tidak diblokir.

    $("pembinaanBody").addEventListener("click", async (ev) => {
        const b = ev.target.closest("button[data-print], button[data-wa]");
        if (!b || b.disabled) return;
        const wa = b.hasAttribute("data-wa");
        const nis = b.dataset.print || b.dataset.wa;
        const jadwal = await askJadwal(wa ? "Kirim surat lewat WhatsApp" : "Cetak surat");   // pilih tanggal, jam, ruang
        if (!jadwal) return;
        const w = window.open("", "_blank");   // dibuka segera setelah klik "Lanjut" agar tidak diblokir pop-up, diarahkan setelah tautan siap
        const label = b.textContent;
        b.disabled = true; b.textContent = "Menyiapkan…";
        try {
            const r = await fetch(CONFIG.API.SURAT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nis, kirim: wa, jadwal }) });
            const body = await r.json().catch(() => ({}));
            if (r.status === 401) { if (w) w.close(); AdminAuth.logout(); location.reload(); return; }
            if (!r.ok || body.success === false) throw new Error(body.message || `Gagal membuat surat (HTTP ${r.status}).`);
            const d = body.data;
            if (wa && !d.waUrl) throw new Error("Nomor WhatsApp orang tua belum diisi (isi lewat formulir siswa / tab Data_Foto_Siswa).");
            if (!w) throw new Error("Pop-up diblokir browser. Izinkan pop-up untuk situs ini lalu coba lagi.");
            w.location.href = wa ? d.waUrl : d.url;
            if (wa) loadPembinaan();      // status "Surat dikirim" tercatat di server
        } catch (e) {
            if (w) w.close();
            $("adminAlert").innerHTML = `<div class="kd-card kd-error" role="alert"><strong>${wa ? "WhatsApp belum dapat dibuka." : "Surat belum dapat dibuat."}</strong> ${esc(e.message)}</div>`;
            window.scrollTo({ top: 0, behavior: "smooth" });
        } finally {
            b.disabled = false; b.textContent = label;
        }
    });

    /* ---------- RINGKASAN HARIAN & CEK DATA ---------- */

    let rk = null;

    function rkList(rows, empty) {
        return rows.length ? `<ul class="kd-list">${rows.map((p) => `<li><strong>${esc(p.nama)}</strong> (${esc(p.kelas)}) · ${esc(p.tingkat)} · ${fmt(p.poin)} poin · <em>${esc(p.status.toLowerCase())}</em>${p.hari !== undefined ? ` · ${fmt(p.hari)} hari sejak naik tingkat` : ""}</li>`).join("")}</ul>` : `<p class="kd-card-sub">${empty}</p>`;
    }

    function renderRingkasan() {
        if (!rk) return;
        const h = rk.hitung, c = rk.cek;
        const stat = (n, label) => `<div class="kd-card" style="margin:0;text-align:center"><strong style="font-size:1.6rem">${fmt(n)}</strong><br><small>${label}</small></div>`;
        const issue = (n, label, detail) => `<li><strong>${fmt(n)}</strong> ${label}${n && detail ? `<br><small style="opacity:.8">${detail}</small>` : ""}</li>`;
        const names = (a, f) => a.slice(0, 8).map(f).join(", ") + (a.length > 8 ? " …" : "");
        $("ringkasanSub").textContent = `Data per ${fmtDate(rk.hariIni)} · dihitung saat halaman dibuka`;
        $("ringkasanBody").innerHTML = `
            <div class="kd-filters" style="grid-template-columns:repeat(auto-fit,minmax(130px,1fr))">
                ${stat(h.hariIni, "pelanggaran hari ini")}${stat(h.tujuhHari, "7 hari terakhir")}${stat(h.perluTindakLanjut, "perlu tindak lanjut")}${stat(h.terlambat, "terlambat ditangani")}
            </div>
            <h3 class="kd-card-title" style="font-size:1rem">Perlu segera ditindaklanjuti</h3>
            ${rkList(rk.terlambat, "Tidak ada. Belum ditangani &gt; 3 hari atau surat dikirim &gt; 7 hari tanpa pemanggilan akan tampil di sini.")}
            <h3 class="kd-card-title" style="font-size:1rem">Baru naik tingkat (2 hari terakhir)</h3>
            ${rkList(rk.baru, "Tidak ada siswa baru naik tingkat.")}
            <h3 class="kd-card-title" style="font-size:1rem">Cek data</h3>
            <ul class="kd-list">
                ${issue(c.nisGanda.length, "NIS ganda di Data_Siswa", names(c.nisGanda, (x) => `${esc(x.nis)} (baris ${x.baris.join(", ")})`))}
                ${issue(c.tanpaKelasAtauNis, "baris siswa tanpa NIS atau kelas", "Periksa tab Data_Siswa.")}
                ${issue(c.waSalah.length, "nomor WA orang tua salah format", names(c.waSalah, (x) => `${esc(x.nama)} (baris ${x.baris})`))}
                ${issue(c.pelanggaranNisTakDikenal.length, "NIS di pelanggaran tidak ada di Data_Siswa", names(c.pelanggaranNisTakDikenal, (x) => `${esc(x.nama)} (${esc(x.nis)})`))}
                ${issue(c.perluTanpaWa.length, "siswa perlu tindak lanjut belum punya nomor WA", names(c.perluTanpaWa, (x) => `${esc(x.nama)} (${esc(x.kelas)})`))}
            </ul>
            <p class="kd-card-sub">Tidak ada isu jika semua angka di atas 0. Perbaikan dilakukan di Google Sheet; muat ulang halaman ini untuk memeriksa lagi.</p>`;
    }

    async function loadRingkasan() {
        if (!AdminAuth.isLoggedIn()) return;   // belum login: overlay login tampil, jangan memanggil API (mencegah loop 401 → reload)
        $("ringkasanBody").innerHTML = `<p class="kd-empty">Memuat…</p>`;
        try {
            const res = await getJSON(CONFIG.API.RINGKASAN);
            rk = res.data;
            renderRingkasan();
        } catch (e) {
            if (e.status === 401) { AdminAuth.logout(); location.reload(); return; }
            rk = null;
            $("ringkasanBody").innerHTML = `<div class="kd-card kd-error" role="alert"><strong>Ringkasan belum dapat dimuat.</strong> ${esc(e.message)}</div>`;
        }
    }

    /* ---------- Rapikan Data: usulan perbaikan, guru mencentang lalu menerapkan ---------- */
    let pf = null;
    const pfShow = (el, t) => { el.textContent = t || ""; el.classList.toggle("kd-hidden", !t); };
    const pfPicked = () => [...$("pfBody").querySelectorAll("input[data-fix]:checked")].map((c) => c.dataset.fix);
    const pfCount = () => { const n = pfPicked().length; $("pfApply").textContent = `Terapkan ${fmt(n)} perbaikan`; $("pfApply").disabled = !n || !(pf && pf.canWrite); };

    function renderPerapian() {
        const box = $("pfBody");
        if (!pf) { box.innerHTML = `<p class="kd-empty">Tekan “Periksa data” untuk mulai.</p>`; $("pfApply").classList.add("kd-hidden"); return; }
        const groups = {};
        pf.perbaikan.forEach((p) => { (groups[p.jenis] = groups[p.jenis] || []).push(p); });
        const urutan = ["Format", "Lengkapi"];
        const judul = { Format: "Rapikan format", Lengkapi: "Lengkapi dari formulir siswa" };
        const fixHtml = urutan.filter((j) => groups[j]).map((j) => `
            <h3 class="kd-card-title" style="font-size:var(--font-md);margin:1rem 0 .4rem">${judul[j]} <small style="opacity:.7">(${fmt(groups[j].length)})</small></h3>
            <div style="display:grid;gap:.4rem">${groups[j].map((p) => `
              <label class="kd-rrow" style="align-items:flex-start;gap:.6rem">
                <input type="checkbox" data-fix="${esc(p.id)}" checked>
                <span style="min-width:0"><strong>${esc(p.nama || "(tanpa nama)")}</strong> <small style="opacity:.7">NIS ${esc(p.nis || "-")} · ${esc(p.kolom)}</small><br>
                  <span style="font-size:var(--font-sm);word-break:break-word"><s style="opacity:.65">${esc(p.dari || "(kosong)")}</s> → <b>${esc(p.ke)}</b></span><br>
                  <small style="opacity:.75">${esc(p.saran)}</small></span>
              </label>`).join("")}</div>`).join("");
        const lap = pf.laporan.length ? `
            <h3 class="kd-card-title" style="font-size:var(--font-md);margin:1.4rem 0 .4rem">Perlu dicek manual di Sheet <small style="opacity:.7">(${fmt(pf.laporan.length)})</small></h3>
            <ul style="margin:0;padding-left:1.1rem;display:grid;gap:.3rem;font-size:var(--font-sm)">${pf.laporan.slice(0, 200).map((l) => `<li><strong>${esc(l.jenis)}</strong>: ${esc(l.teks)}</li>`).join("")}</ul>` : "";
        const kosong = !pf.perbaikan.length && !pf.laporan.length ? `<p class="kd-empty">Data sudah rapi. Tidak ada usulan perbaikan. ✔</p>` : "";
        const note = pf.demo ? `<p class="kd-empty">Mode demo: tidak ada data Sheet untuk diperiksa.</p>` : (pf.canWrite ? "" : `<p class="kd-card-sub">Mode baca saja (service account belum diatur): usulan hanya bisa dilihat.</p>`);
        box.innerHTML = `<p class="kd-card-sub">${fmt(pf.jumlahSiswa || 0)} siswa diperiksa.</p>${note}${kosong}${fixHtml}${lap}`;
        $("pfApply").classList.toggle("kd-hidden", !pf.perbaikan.length);
        pfCount();
    }

    async function loadPerapian() {
        if (!AdminAuth.isLoggedIn()) return;
        const btn = $("pfRun");
        btn.disabled = true; btn.textContent = "Memeriksa…"; pfShow($("pfMsg"), ""); pfShow($("pfOk"), "");
        try {
            const res = await getJSON(CONFIG.API.PERAPIAN);
            pf = res.data; renderPerapian();
        } catch (e) {
            if (e.status === 401) { AdminAuth.logout(); location.reload(); return; }
            pfShow($("pfMsg"), e.message || "Pemeriksaan gagal.");
        } finally { btn.disabled = false; btn.textContent = "Periksa data"; }
    }

    $("pfRun").addEventListener("click", loadPerapian);
    $("pfBody").addEventListener("change", (e) => { if (e.target.matches("input[data-fix]")) pfCount(); });
    $("pfApply").addEventListener("click", async () => {
        const ids = pfPicked();
        if (!ids.length) return;
        if (!window.confirm(`Terapkan ${ids.length} perbaikan ke Google Sheet? Perubahan dicatat di tab Log_Perapian.`)) return;
        const btn = $("pfApply"), label = btn.textContent;
        btn.disabled = true; btn.textContent = "Menerapkan…"; pfShow($("pfMsg"), ""); pfShow($("pfOk"), "");
        try {
            const r = await fetch(CONFIG.API.PERAPIAN, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) });
            const body = await r.json().catch(() => ({}));
            if (r.status === 401) { AdminAuth.logout(); location.reload(); return; }
            if (!r.ok || body.success === false) throw new Error(body.message || `Gagal (HTTP ${r.status}).`);
            const d = body.data;
            pfShow($("pfOk"), `✔ ${fmt(d.diterapkan)} perbaikan diterapkan${d.dilewati ? `, ${fmt(d.dilewati)} dilewati (data sudah berubah)` : ""}.${d.logOk ? "" : " Catatan log gagal ditulis: pastikan tab Log_Perapian ada."}`);
            await loadPerapian();
            pfShow($("pfOk"), $("pfOk").textContent || `✔ ${fmt(d.diterapkan)} perbaikan diterapkan.`);
            load(true).catch(() => {});     // muat ulang data siswa agar mengikuti perubahan
        } catch (e) { pfShow($("pfMsg"), e.message); btn.textContent = label; btn.disabled = false; }
    });

    $("rkRefresh").addEventListener("click", loadRingkasan);
    // WhatsApp dibuka di perangkat guru yang sedang login; guru memilih grup/nomor tujuan lalu menekan Kirim sendiri.
    $("rkWa").addEventListener("click", () => { if (rk) window.open("https://wa.me/?text=" + encodeURIComponent(rk.pesan), "_blank"); });
    $("rkCopy").addEventListener("click", async () => {
        if (!rk) return;
        try { await navigator.clipboard.writeText(rk.pesan); $("rkCopy").textContent = "Tersalin ✔"; setTimeout(() => { $("rkCopy").textContent = "Salin teks"; }, 1800); } catch (e) { /* abaikan */ }
    });

    async function loadPembinaan() {
        try { const res = await getJSON(CONFIG.API.PEMBINAAN); state.pb = res.pembinaan || []; } catch (e) { /* tab belum ada / offline: tanpa status */ }
        renderPembinaan();
    }

    /* ---------- load ---------- */

    async function load(silent) {
        try {
            const res = await getJSON(CONFIG.API.PELANGGARAN);
            try { localStorage.setItem(CKEY, JSON.stringify(res)); } catch (e) { /* abaikan */ }
            applyData(res, silent);
            loadPembinaan();
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
            // Dari pemindai QR: /pages/admin.html?nis=XXXX#input langsung memilih siswa tersebut (sekali).
            if (!silent && !state._nisDone) {
                state._nisDone = true;
                const q = new URLSearchParams(location.search).get("nis");
                if (q && state.siswa.some((x) => x.nis === q)) { showTab("input"); pick(q, true); }
            }
        }
    }

    // Hapus cache data siswa dari perangkat saat admin keluar.
    const _logout = AdminAuth.logout;
    AdminAuth.logout = function () { try { localStorage.removeItem(CKEY); } catch (e) { /* abaikan */ } return _logout.apply(this, arguments); };

    renderQueue();
    showTab(location.hash.slice(1));
    // Tanpa sesi admin, halaman tertutup overlay login (js/admin-auth.js) dan login memuat ulang halaman.
    if (AdminAuth.isLoggedIn()) load().then(LIMITED ? null : syncQueue);

})();
