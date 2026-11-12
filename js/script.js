/* =========================================================
   4057 — shared behaviour (every page)
   ========================================================= */
(() => {
  // Nav colour: switch to the black logo / dark links when they sit over a white (.light) section
  const nav = document.querySelector(".nav");
  if (nav && document.querySelector(".light")) {
    const onLight = (el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const hits = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return hits.some((h) => !nav.contains(h) && h.closest(".light"));
    };
    const check = () => {
      nav.classList.toggle("logo-on-light", onLight(nav.querySelector(".logo")));
      nav.classList.toggle("links-on-light", onLight(nav.querySelector(".nav-links a")));
    };
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    check();
  }
})();

(() => {
  // Sound toggle: plays audio/ambient.mp3 if it exists, and remembers the choice.
  const btn = document.querySelector(".sound-btn");
  const audio = document.getElementById("ambient");
  if (!btn || !audio) return;

  let on = false;
  try { on = localStorage.getItem("4057-sound") === "on"; } catch (e) {}

  function apply() {
    btn.setAttribute("aria-pressed", String(on));
    btn.setAttribute("aria-label", on ? "Turn sound off" : "Turn sound on");
    if (on) audio.play().catch(() => {}); else audio.pause();
  }

  btn.addEventListener("click", () => {
    on = !on;
    try { localStorage.setItem("4057-sound", on ? "on" : "off"); } catch (e) {}
    apply();
  });

  // Browsers block sound until the visitor interacts, so resume on first click.
  if (on) {
    btn.setAttribute("aria-pressed", "true");
    window.addEventListener("pointerdown", () => audio.play().catch(() => {}), { once: true });
  }
})();

(() => {
  // Phone menu: full-screen overlay opened by the menu icon
  const btn = document.querySelector(".menu-btn");
  if (!btn) return;
  const root = document.body.dataset.root || "";
  const here = location.pathname.split("/").pop() || "index.html";
  const pages = [["Home", "index.html"], ["Explore", "html/explore.html"], ["Map", "html/map.html"], ["About", "html/about.html"]];
  const menu = document.createElement("div");
  menu.className = "menu-overlay";
  menu.id = "menu";
  menu.setAttribute("role", "dialog");
  menu.setAttribute("aria-modal", "true");
  menu.setAttribute("aria-label", "Menu");
  menu.innerHTML = `
    <button class="menu-close" type="button" aria-label="Close menu">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4l16 16M20 4L4 20"/></svg>
    </button>
    <h2 class="menu-title display-font">Menu</h2>
    <nav class="menu-list" aria-label="Main">
      ${pages.map(([label, href]) => `<a href="${root}${href}"${href.endsWith(here) ? ' aria-current="page"' : ""}>${label}</a>`).join("")}
      <details>
        <summary>Settings</summary>
        <button class="menu-setting" type="button" data-setting="sound">Sound <span class="state"></span></button>
      </details>
    </nav>`;
  document.body.appendChild(menu);

  const soundBtn = document.querySelector(".sound-btn");
  const soundSetting = menu.querySelector('[data-setting="sound"]');
  const showSound = () => {
    soundSetting.querySelector(".state").textContent = soundBtn && soundBtn.getAttribute("aria-pressed") === "true" ? "On" : "Off";
  };
  soundSetting.addEventListener("click", () => { if (soundBtn) soundBtn.click(); showSound(); });

  const open = () => { showSound(); menu.classList.add("is-open"); btn.setAttribute("aria-expanded", "true"); document.body.style.overflow = "hidden"; menu.querySelector(".menu-close").focus(); };
  const close = () => { menu.classList.remove("is-open"); btn.setAttribute("aria-expanded", "false"); document.body.style.overflow = ""; btn.focus(); };
  btn.addEventListener("click", open);
  menu.querySelector(".menu-close").addEventListener("click", close);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && menu.classList.contains("is-open")) close(); });
})();

(() => {
  // Darken the nav once the page has scrolled (not on Explore, which has its own shading)
  const nav = document.querySelector(".nav");
  if (!nav || document.getElementById("experience")) return;
  const update = () => nav.classList.toggle("is-scrolled", window.scrollY > 8);
  window.addEventListener("scroll", update, { passive: true });
  update();
})();
