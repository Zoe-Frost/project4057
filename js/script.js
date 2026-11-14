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
  /* Sound: the soundtrack loops with no gap and carries on from the same
     point when you change page. The track's last ~2 seconds are its reverb
     tail, so each new pass starts as the music ends (at LOOP_END) and the
     tail rings out underneath it instead of leaving a quiet gap. */
  const btn = document.querySelector(".sound-btn");
  const el = document.getElementById("ambient");
  if (!btn || !el) return;
  const SRC = el.getAttribute("src");
  const LOOP_START = 0.02, LOOP_END = 15.33, PERIOD = LOOP_END - LOOP_START;
  const POS_KEY = "4057-sound-pos";

  let on = false;
  try { on = localStorage.getItem("4057-sound") === "on"; } catch (e) {}

  let ctx = null, gain = null, buffer = null, loading = null;
  let origin = 0, nextAt = 0, timer = null, sources = [];
  let useElement = false;   // fallback when the file can't be decoded (e.g. opened from your computer)

  function savedPos() {
    let p = 0;
    try { p = parseFloat(sessionStorage.getItem(POS_KEY)) || 0; } catch (e) {}
    return ((p % PERIOD) + PERIOD) % PERIOD;
  }
  function savePos() {
    let p = null;
    if (ctx && buffer && timer) p = (ctx.currentTime - origin) % PERIOD;
    else if (useElement && !el.paused) p = el.currentTime - LOOP_START;
    if (p !== null) try { sessionStorage.setItem(POS_KEY, String(p)); } catch (e) {}
  }

  function load() {
    if (loading) return loading;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { useElement = true; return (loading = Promise.resolve()); }
    ctx = new AC();
    gain = ctx.createGain(); gain.gain.value = 0; gain.connect(ctx.destination);
    loading = fetch(SRC)
      .then((r) => r.arrayBuffer())
      .then((data) => new Promise((res, rej) => ctx.decodeAudioData(data, res, rej)))
      .then((b) => { buffer = b; })
      .catch(() => { useElement = true; });
    return loading;
  }

  function schedule() {
    while (nextAt < ctx.currentTime + 1.5) {
      const s = ctx.createBufferSource();
      s.buffer = buffer;
      s.connect(gain);
      const offset = LOOP_START + Math.max(0, ctx.currentTime - nextAt);
      s.start(Math.max(nextAt, ctx.currentTime), Math.min(offset, buffer.duration - 0.05));
      s.onended = () => { sources = sources.filter((x) => x !== s); };
      sources.push(s);
      nextAt += PERIOD;
    }
  }

  function startWebAudio() {
    const pos = savedPos();
    origin = ctx.currentTime - pos;
    // first pass starts part-way through, at the saved position
    const s = ctx.createBufferSource();
    s.buffer = buffer; s.connect(gain);
    s.start(ctx.currentTime, LOOP_START + pos);
    sources.push(s);
    nextAt = origin + PERIOD;
    schedule();
    timer = setInterval(schedule, 500);
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setTargetAtTime(1, ctx.currentTime, 0.15);   // gentle fade in
  }

  function stopWebAudio() {
    if (!ctx) return;
    savePos();
    clearInterval(timer); timer = null;
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
    const old = sources; sources = [];
    setTimeout(() => old.forEach((s) => { try { s.stop(); } catch (e) {} }), 400);
  }

  // Fallback player: an <audio> element that jumps back before the quiet tail
  el.addEventListener("timeupdate", () => { if (useElement && el.currentTime >= LOOP_END) el.currentTime = LOOP_START; });

  function play() {
    load().then(() => {
      if (!on) return;
      if (useElement) {
        if (el.paused) { el.currentTime = LOOP_START + savedPos(); el.play().then(ready, blocked); }
        return;
      }
      ctx.resume().then(() => {
        if (!on) return;
        if (ctx.state !== "running") return blocked();
        if (!timer) startWebAudio();
        ready();
      }, blocked);
    });
  }
  function stop() {
    if (useElement) { savePos(); el.pause(); } else stopWebAudio();
    btn.classList.remove("is-waiting");
  }

  // Browsers only allow sound after a click, tap or key press on each page.
  // Until then the sound icon gently pulses as a hint.
  function blocked() { if (on) btn.classList.add("is-waiting"); }
  function ready() { btn.classList.remove("is-waiting"); }
  const unlock = () => { if (on) play(); };
  ["pointerdown", "pointerup", "touchend", "keydown", "click"].forEach((ev) =>
    window.addEventListener(ev, unlock, { passive: true }));

  function apply() {
    btn.setAttribute("aria-pressed", String(on));
    btn.setAttribute("aria-label", on ? "Turn sound off" : "Turn sound on");
    if (on) play(); else stop();
  }

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    on = !on;
    try { localStorage.setItem("4057-sound", on ? "on" : "off"); } catch (e2) {}
    apply();
  });

  window.addEventListener("pagehide", savePos);
  apply();   // on page load: try to carry on (works if the browser allows it)
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
