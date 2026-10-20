/*
==========================================================
SMANSASOO Kesiswaan Portal
Admin Auth (klien)
==========================================================
- AdminAuth.login(u, p)  -> Promise<{ ok, message, insecure }>
- AdminAuth.isLoggedIn() / username() / expiresAt() / logout()
- AdminAuth.openLogin({ dismissible, gate }) -> overlay login
- Halaman khusus admin: <script src="/js/admin-auth.js" data-require-admin>
  di <head>; tanpa sesi valid halaman tertutup overlay login.

Username/password TIDAK ada di file ini: diperiksa server
(/api/admin-auth). Browser hanya menyimpan token bertanda tangan
di sessionStorage (hilang saat tab ditutup, kedaluwarsa 8 jam).
Fetch ke /api/pelanggaran otomatis membawa token itu.
==========================================================
*/
(function () {

    if (window.AdminAuth) return;

    const SESSION_KEY = "kesiswaan-admin-session";
    const AUTH_URL = "/api/admin-auth";
    const PROTECTED_API = /^\/api\/(pelanggaran|pembinaan|surat|ringkasan|ai-catat|perapian|eksekutif|tanya|walikelas|qr)/;

    const thisScript = document.currentScript;
    const requireRole = thisScript ? (thisScript.getAttribute("data-require-role") || (thisScript.hasAttribute("data-require-admin") ? "komisi,kesiswaan" : "")) : "";
    const requirePage = !!requireRole;
    const EKSEKUTIF_URL = "/pages/eksekutif.html", KOMISI_URL = "/pages/admin.html", WALI_URL = "/pages/walikelas.html";

    let overlayEl = null;

    /* ---------- sesi ---------- */

    function readSession() {
        try {
            const raw = sessionStorage.getItem(SESSION_KEY);
            if (!raw) return null;
            const s = JSON.parse(raw);
            if (!s || !s.token || !s.exp || Date.now() >= s.exp * 1000) {
                sessionStorage.removeItem(SESSION_KEY);
                return null;
            }
            return s;
        } catch (e) { return null; }
    }

    function saveSession(data) {
        try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(data)); } catch (e) { /* sesi hanya di halaman ini */ }
    }

    function logout() {
        try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* abaikan */ }
        document.dispatchEvent(new CustomEvent("adminauth:change"));
    }

    const roles = () => { const r = (readSession() || {}).roles; return Array.isArray(r) && r.length ? r : ["komisi"]; };
    const hasRole = (r) => roles().includes(r);
    const hasAny = (list) => String(list).split(",").some((r) => hasRole(r.trim()));
    /* Kesiswaan = akses terbatas (tanpa Komisi): hanya data & pembinaan. */
    const limited = () => hasRole("kesiswaan") && !hasRole("komisi");
    /* Akun dengan peran eksekutif diarahkan ke portal eksekutif; selain itu ke panel Komisi. */
    const homeUrl = () => (hasRole("eksekutif") ? EKSEKUTIF_URL : (hasRole("walikelas") && !hasRole("komisi") && !hasRole("kesiswaan") ? WALI_URL : KOMISI_URL));
    const isLoggedIn = () => !!readSession();
    const getToken = () => (readSession() || {}).token || "";
    const username = () => (readSession() || {}).username || "";
    const displayName = () => { const s = readSession() || {}; return s.nama || s.username || ""; };
    const expiresAt = () => (readSession() || {}).exp || 0;
    const insecure = () => !!(readSession() || {}).insecure;

    // true = valid, false = ditolak server, null = tidak bisa dicek
    async function verify() {
        const token = getToken();
        if (!token) return false;
        try {
            const r = await fetch(AUTH_URL, { headers: { Authorization: "Bearer " + token }, cache: "no-store" });
            if (r.ok) return true;
            if (r.status === 401) return false;
            return null;
        } catch (e) { return null; }
    }

    async function login(user, pass) {
        try {
            const r = await fetch(AUTH_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: user, password: pass }),
                cache: "no-store"
            });
            let result = {};
            try { result = await r.json(); } catch (e) { /* bukan JSON */ }

            if (r.ok && result.success && result.token) {
                saveSession({ token: result.token, exp: result.expiresAt, username: result.username, nama: result.nama || result.username, peran: result.peran || "komisi", roles: Array.isArray(result.roles) ? result.roles : ["komisi"], insecure: !!result.insecureDefaults });
                document.dispatchEvent(new CustomEvent("adminauth:change"));
                return { ok: true, insecure: !!result.insecureDefaults };
            }
            if (r.status === 404) return { ok: false, message: "Endpoint /api/admin-auth tidak ditemukan. Pastikan sudah ter-deploy di Vercel." };
            return { ok: false, message: result.message || "Login gagal (HTTP " + r.status + ")." };
        } catch (e) {
            return { ok: false, message: "Tidak bisa terhubung ke server. Periksa koneksi internet." };
        }
    }

    function installFetchAuth() {
        if (window.__adminFetchPatched) return;
        window.__adminFetchPatched = true;
        const original = window.fetch.bind(window);
        window.fetch = function (input, init) {
            try {
                const raw = typeof input === "string" ? input : (input && input.url) || "";
                const url = new URL(raw, window.location.href);
                if (url.origin === window.location.origin && PROTECTED_API.test(url.pathname)) {
                    const s = readSession();
                    if (s) {
                        const headers = new Headers((init && init.headers) || (typeof input !== "string" && input && input.headers) || {});
                        if (!headers.has("Authorization")) headers.set("Authorization", "Bearer " + s.token);
                        init = Object.assign({}, init, { headers });
                    }
                }
            } catch (e) { /* teruskan apa adanya */ }
            return original(input, init);
        };
    }

    installFetchAuth();

    /* ---------- form login (dipakai overlay & badge) ---------- */

    function el(tag, className, text) {
        const n = document.createElement(tag);
        if (className) n.className = className;
        if (text !== undefined) n.textContent = text;
        return n;
    }

    function buildLoginForm(onSuccess) {

        const form = el("form", "kd-login");
        form.noValidate = true;

        const fUser = el("label", "kd-field");
        fUser.appendChild(el("span", "kd-field-label", "Username"));
        const iUser = el("input", "kd-input");
        iUser.type = "text"; iUser.name = "username"; iUser.autocomplete = "username";
        iUser.autocapitalize = "none"; iUser.spellcheck = false;
        fUser.appendChild(iUser);

        const fPass = el("label", "kd-field");
        fPass.appendChild(el("span", "kd-field-label", "Password"));
        const row = el("div", "kd-input-row");
        const iPass = el("input", "kd-input");
        iPass.type = "password"; iPass.name = "password"; iPass.autocomplete = "current-password";
        const eye = el("button", "kd-btn kd-btn--ghost kd-btn--sm", "Lihat");
        eye.type = "button";
        eye.setAttribute("aria-pressed", "false");
        eye.addEventListener("click", () => {
            const show = iPass.type === "password";
            iPass.type = show ? "text" : "password";
            eye.textContent = show ? "Sembunyi" : "Lihat";
            eye.setAttribute("aria-pressed", String(show));
        });
        row.appendChild(iPass); row.appendChild(eye);
        fPass.appendChild(row);

        const error = el("p", "kd-form-error");
        error.setAttribute("role", "alert");
        error.hidden = true;

        const submit = el("button", "kd-btn kd-btn--primary", "Masuk");
        submit.type = "submit";

        form.append(fUser, fPass, error, submit);

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const u = iUser.value.trim();
            const p = iPass.value;
            error.hidden = true;

            if (!u || !p) {
                error.textContent = "Username dan password wajib diisi.";
                error.hidden = false;
                (u ? iPass : iUser).focus();
                return;
            }

            submit.disabled = true;
            submit.textContent = "Memeriksa...";
            const result = await login(u, p);
            submit.disabled = false;
            submit.textContent = "Masuk";

            if (result.ok) {
                iPass.value = "";
                // peran eksekutif: setelah login selalu ke portal eksekutif (kecuali sudah di sana)
                if (hasRole("eksekutif") && !/\/eksekutif(\.html)?$/.test(location.pathname)) { window.location.assign(EKSEKUTIF_URL); return; }
                if (homeUrl() === WALI_URL && !/\/walikelas(\.html)?$/.test(location.pathname)) { window.location.assign(WALI_URL); return; }
                onSuccess(result);
                return;
            }
            error.textContent = result.message;
            error.hidden = false;
            iPass.value = "";
            iPass.focus();
        });

        return { form, focus: () => iUser.focus() };
    }

    /* ---------- overlay login ---------- */

    function closeOverlay() {
        if (!overlayEl) return;
        overlayEl.remove();
        overlayEl = null;
        document.body.classList.remove("kd-lock");
    }

    function openLogin(options) {

        const opts = Object.assign({ dismissible: true, gate: false }, options);

        if (overlayEl) return Promise.resolve(false);

        return new Promise((resolve) => {

            const previousFocus = document.activeElement;
            const overlay = el("div", "kd-overlay" + (opts.gate ? " kd-overlay--gate" : ""));
            const card = el("div", "kd-modal");
            card.setAttribute("role", "dialog");
            card.setAttribute("aria-modal", "true");
            card.setAttribute("aria-labelledby", "kdLoginTitle");

            const title = el("h2", "kd-modal-title", "Masuk Komisi Disiplin Sekolah");
            title.id = "kdLoginTitle";
            card.appendChild(title);
            card.appendChild(el("p", "kd-modal-sub", "Halaman ini khusus Komisi Disiplin Sekolah. Masukkan username dan password."));

            function finish(ok) {
                document.removeEventListener("keydown", onKey, true);
                closeOverlay();
                if (previousFocus && previousFocus.focus && !opts.gate) { try { previousFocus.focus(); } catch (e) { /* abaikan */ } }
                resolve(ok);
            }

            const built = buildLoginForm(() => finish(true));
            card.appendChild(built.form);

            if (opts.dismissible) {
                const cancel = el("button", "kd-btn kd-btn--ghost", "Batal");
                cancel.type = "button";
                cancel.addEventListener("click", () => finish(false));
                built.form.appendChild(cancel);
            }

            if (opts.gate) {
                const back = el("a", "kd-link-center", "Kembali ke dashboard");
                back.href = "/index.html";
                card.appendChild(back);
            }

            function onKey(event) {
                if (event.key === "Escape" && opts.dismissible) { event.preventDefault(); finish(false); return; }
                if (event.key !== "Tab") return;
                const items = Array.from(card.querySelectorAll("input, button, a[href]")).filter((n) => !n.disabled);
                if (!items.length) return;
                const first = items[0], last = items[items.length - 1];
                if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
                else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
            }

            document.addEventListener("keydown", onKey, true);

            if (opts.dismissible) {
                overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) finish(false); });
            }

            overlay.appendChild(card);
            document.body.appendChild(overlay);
            document.body.classList.add("kd-lock");
            overlayEl = overlay;
            built.focus();
        });
    }

    /* ---------- penjaga halaman ---------- */

    function startPageGuard() {

        const hide = document.createElement("style");
        hide.id = "adminGuardHide";
        hide.textContent = "html{visibility:hidden !important}";
        document.head.appendChild(hide);

        const reveal = () => { const n = document.getElementById("adminGuardHide"); if (n) n.remove(); };

        async function gate() {
            reveal();
            const ok = await openLogin({ dismissible: false, gate: true });
            if (ok) window.location.reload();
        }

        async function run() {
            if (!isLoggedIn()) { gate(); return; }
            const result = await verify();
            if (result === false) { logout(); gate(); return; }
            // sesi valid tetapi peran tidak cocok dengan halaman ini: arahkan ke portal yang sesuai
            if (!hasAny(requireRole)) {
                const dest = homeUrl();
                if (dest !== location.pathname && dest.replace(".html", "") !== location.pathname) { window.location.replace(dest); return; }
            }
            reveal();
        }

        if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
        else run();
    }

    window.AdminAuth = { login, openLogin, buildLoginForm, isLoggedIn, getToken, username, displayName, expiresAt, insecure, logout, verify, roles, hasRole, hasAny, limited, homeUrl };

    if (requirePage) startPageGuard();

})();
