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
  // Soft green glow that follows the mouse (desktop only)
  if (!window.matchMedia("(hover: hover)").matches) return;
  const glow = document.createElement("div");
  glow.className = "cursor-glow";
  document.body.appendChild(glow);
  let x = 0, y = 0, queued = false;
  window.addEventListener("pointermove", (e) => {
    x = e.clientX; y = e.clientY;
    glow.classList.add("is-on");
    glow.classList.toggle("is-hover", !!e.target.closest("a, button, summary, .marker"));
    if (!queued) { queued = true; requestAnimationFrame(() => { glow.style.transform = `translate(${x}px, ${y}px)`; queued = false; }); }
  }, { passive: true });
  document.addEventListener("pointerleave", () => glow.classList.remove("is-on"));
})();
