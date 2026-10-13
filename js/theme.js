/*
==========================================================
SMANSASOO Kesiswaan Portal
Theme Module (Dark / Light)
Version : 1.0.0
==========================================================
Modul kecil untuk mengatur mode tampilan gelap/terang, gaya
"iOS 26" (segmented toggle, auto-follow sistem, tanpa flash
saat reload).

CARA PAKAI:
1. Taruh script INLINE di <head>, SEBELUM CSS di-load, supaya
   tidak ada "flash" warna salah sebelum tema diterapkan:

     <script>
       (function(){
         var saved = localStorage.getItem('kesiswaan-theme');
         var theme = saved || (window.matchMedia &&
           window.matchMedia('(prefers-color-scheme: dark)').matches
             ? 'dark' : 'light');
         document.documentElement.setAttribute('data-theme', theme);
       })();
     </script>

2. Load css/theme.css SETELAH variables.css.

3. Load js/theme.js sebelum </body>, lalu panggil:
     Theme.initToggle('themeToggleBtn');

Tema disimpan di localStorage key "kesiswaan-theme" ("dark"
atau "light"). Kalau user belum pernah memilih manual, tema
otomatis ikut preferensi sistem (prefers-color-scheme) dan
akan ikut berubah live kalau sistem berganti tema.
==========================================================
*/

window.Theme = (() => {

    const STORAGE_KEY = "kesiswaan-theme";

    function getStored() {

        try {
            return localStorage.getItem(STORAGE_KEY);
        } catch (e) {
            return null;
        }

    }

    function setStored(value) {

        try {
            localStorage.setItem(STORAGE_KEY, value);
        } catch (e) {
            // localStorage tidak tersedia (mode privat, dsb) -- abaikan.
        }

    }

    function systemPrefersDark() {

        return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);

    }

    function current() {

        return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";

    }

    function apply(theme) {

        document.documentElement.setAttribute("data-theme", theme === "dark" ? "dark" : "light");

        updateToggleButtons();

        updateMetaThemeColor();

    }

    function set(theme, remember) {

        apply(theme);

        if (remember) setStored(theme);

    }

    function toggle() {

        const next = current() === "dark" ? "light" : "dark";

        set(next, true);

    }

    function updateMetaThemeColor() {

        const meta = document.querySelector('meta[name="theme-color"]');

        if (!meta) return;

        meta.setAttribute("content", current() === "dark" ? "#0B0B0F" : "#0F4C81");

    }

    function updateToggleButtons() {

        document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {

            btn.setAttribute("aria-pressed", current() === "dark" ? "true" : "false");

            btn.classList.toggle("is-dark", current() === "dark");

        });

    }

    /**
     * Daftarkan satu atau lebih tombol toggle (bisa dipanggil
     * dengan id, atau tanpa argumen untuk auto-bind semua
     * elemen [data-theme-toggle] di halaman).
     */

    function initToggle(buttonId) {

        // Sinkronkan ikon/state tombol begitu halaman siap.

        updateToggleButtons();

        updateMetaThemeColor();

        const elements = buttonId
            ? [document.getElementById(buttonId)]
            : Array.from(document.querySelectorAll("[data-theme-toggle]"));

        elements.forEach((el) => {

            if (!el) return;

            el.setAttribute("data-theme-toggle", "");

            el.addEventListener("click", toggle);

        });

        // Kalau user belum pernah pilih manual, ikuti perubahan
        // sistem secara live (misal jam malam otomatis di iOS/macOS).

        if (!getStored() && window.matchMedia) {

            const mq = window.matchMedia("(prefers-color-scheme: dark)");

            const handler = (e) => apply(e.matches ? "dark" : "light");

            if (mq.addEventListener) {
                mq.addEventListener("change", handler);
            } else if (mq.addListener) {
                mq.addListener(handler);
            }

        }

    }

    return {

        current,

        set,

        toggle,

        initToggle,

        systemPrefersDark

    };

})();
