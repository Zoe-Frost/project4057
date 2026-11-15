/* =========================================================
   4057 — shared behaviour (every page)
   ========================================================= */
/* ---------- Page changes without reloading ----------
   Browsers stop a website's sound whenever a new page loads, and iPhones
   won't start it again until you tap. So links between the 4057 pages swap
   the page content in place instead of loading a whole new page, and the
   music keeps playing straight through. (If anything goes wrong it falls
   back to a normal page load.) */
let pageAbort = new AbortController();
// Listeners a page adds to window/document belong to that page, and are
// removed when you move to another page.
(() => {
  const add = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type, fn, opts) {
    if ((this === window || this === document) && window.__pageSignal && !(opts && typeof opts === "object" && opts.signal)) {
      opts = (opts && typeof opts === "object") ? Object.assign({}, opts, { signal: window.__pageSignal })
                                                : { capture: !!opts, signal: window.__pageSignal };
    }
    return add.call(this, type, fn, opts);
  };
})();

function initPage() {
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
}

(() => {
  /* Sound: the soundtrack loops with no gap and carries on from the same
     point when you change page. The track's last ~2 seconds are its reverb
     tail, so each new pass starts as the music ends (at LOOP_END) and the
     tail rings out underneath it instead of leaving a quiet gap. */
  const el = document.getElementById("ambient");
  if (!el) return;
  const SRC = el.src;                       // full address, so it works from any page
  const btns = () => document.querySelectorAll(".sound-btn");
  const btn = { classList: { add: (k) => btns().forEach((b) => b.classList.add(k)), remove: (k) => btns().forEach((b) => b.classList.remove(k)) },
                setAttribute: (a, v) => btns().forEach((b) => b.setAttribute(a, v)) };
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

  // iPhones: let the music play even when the phone is on silent mode
  try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (e) {}

  function ensureCtx() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { useElement = true; return false; }
    ctx = new AC();
    gain = ctx.createGain(); gain.gain.value = 0; gain.connect(ctx.destination);
    // If the browser pauses the sound part-way (another app, a call, switching
    // tabs, iPhone audio interruptions), start it again straight away.
    ctx.onstatechange = () => { if (on && ctx.state !== "running" && ctx.state !== "closed") revive(); };
    return true;
  }
  // Must run straight inside a tap/click: iPhones only unlock audio there.
  function unlockNow() {
    if (!ensureCtx() || ctx.state === "running") return;
    try {
      ctx.resume();
      const s = ctx.createBufferSource();
      s.buffer = ctx.createBuffer(1, 1, 22050);
      s.connect(ctx.destination); s.start(0);
    } catch (e) {}
  }

  function revive() {
    if (!on || !ctx) return;
    ctx.resume().then(() => { if (timer) schedule(); ready(); }, blocked);
    setTimeout(() => { if (on && ctx.state !== "running") blocked(); }, 600);
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden && on) { if (timer) revive(); else play(); } });
  window.addEventListener("pageshow", (e) => { if (e.persisted && on) revive(); });   // coming back with the Back button

  function load() {
    if (loading) return loading;
    if (!ensureCtx()) return (loading = Promise.resolve());
    loading = fetch(SRC)
      .then((r) => r.arrayBuffer())
      .then((data) => new Promise((res, rej) => ctx.decodeAudioData(data, res, rej)))
      .then((b) => { buffer = b; })
      .catch(() => { useElement = true; });
    return loading;
  }

  function schedule() {
    while (nextAt < ctx.currentTime + 6) {     // passes are queued 6s ahead, so a busy page can't cause a gap
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
    timer = setInterval(schedule, 250);
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
  const unlock = () => { if (on) { unlockNow(); play(); } };
  ["pointerdown", "pointerup", "touchend", "keydown", "click"].forEach((ev) =>
    window.addEventListener(ev, unlock, { passive: true }));

  function apply() {
    btn.setAttribute("aria-pressed", String(on));
    btn.setAttribute("aria-label", on ? "Turn sound off" : "Turn sound on");
    if (on) play(); else stop();
  }

  document.addEventListener("click", (e) => {
    if (!e.target.closest || !e.target.closest(".sound-btn")) return;
    on = !on;
    try { localStorage.setItem("4057-sound", on ? "on" : "off"); } catch (e2) {}
    if (on) unlockNow();
    apply();
  });

  window.addEventListener("pagehide", savePos);
  window.__soundRefresh = () => {           // after a page change: show the right icon, keep playing
    btn.setAttribute("aria-pressed", String(on));
    btn.setAttribute("aria-label", on ? "Turn sound off" : "Turn sound on");
    if (on && (!ctx || ctx.state !== "running")) btn.classList.add("is-waiting");
  };
  apply();   // on page load: try to carry on (works if the browser allows it)
})();

function initPage2() {
(() => {
  // Phone menu: full-screen overlay opened by the menu icon
  const btn = document.querySelector(".menu-btn");
  if (!btn) return;
  const root = document.body.dataset.root || "";
  const here = (location.pathname.split("/").pop() || "index").replace(/\.html$/, "");
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
      ${pages.map(([label, href]) => `<a href="${root}${href}"${href.replace(/\.html$/, "").endsWith(here) ? ' aria-current="page"' : ""}>${label}</a>`).join("")}
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

  const open = () => { showSound(); menu.classList.add("is-open"); btn.setAttribute("aria-expanded", "true"); document.body.style.overflow = "hidden"; menu.querySelector(".menu-close").focus({ focusVisible: false }); };
  // Only put the keyboard focus back on the menu icon when closed with the keyboard,
  // so tapping/clicking doesn't leave an outline box around it.
  const close = (byKeyboard) => { menu.classList.remove("is-open"); btn.setAttribute("aria-expanded", "false"); document.body.style.overflow = ""; if (byKeyboard === true) btn.focus(); else btn.blur(); };
  btn.addEventListener("click", open);
  menu.querySelector(".menu-close").addEventListener("click", () => close(false));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && menu.classList.contains("is-open")) close(true); });
})();

(() => {
  // Darken the nav once the page has scrolled (not on Explore, which has its own shading)
  const nav = document.querySelector(".nav");
  if (!nav || document.getElementById("experience")) return;
  const update = () => nav.classList.toggle("is-scrolled", window.scrollY > 8);
  window.addEventListener("scroll", update, { passive: true });
  update();
})();

(() => {
  // Phones: make the big 4057 logo exactly as wide as "Uncover the hidden"
  const mark = document.querySelector(".hero-mark");
  const title = document.querySelector(".home-copy .title");
  if (!mark || !title) return;
  const phone = window.matchMedia("(max-width: 760px)");
  const body = document.querySelector(".home-copy .body");
  const fit = () => {
    const range = document.createRange();
    range.selectNodeContents(title);            // the text itself, not the full-width heading box
    const w = Math.round(range.getBoundingClientRect().width);
    // The intro text never runs wider than "Uncover the hidden"
    if (body) body.style.maxWidth = `${w}px`;
    mark.style.width = phone.matches ? `${w}px` : "";
  };
  fit();
  window.addEventListener("resize", fit);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
})();

// Behind the scenes: each heading, paragraph and image fades and slides up
// the first time it scrolls into view (items in the same section follow one after another).
(() => {
  const page = document.querySelector(".about-page");
  if (!page || !("IntersectionObserver" in window)) return;
  const items = page.querySelectorAll(
    ".about-hero h1, .about-hero p, .title, .about-text p, .about-img, .values-intro, .values-list li, .contact-info p, .contact-form, .faq-list details"
  );
  const seen = new Map();
  items.forEach((el) => {
    const sec = el.closest("section");
    const i = seen.get(sec) || 0; seen.set(sec, i + 1);
    el.style.setProperty("--delay", `${Math.min(i, 6) * 0.15}s`);
    el.classList.add("reveal");
  });
  // Images start fully covered (so the browser can't "see" them yet); they are
  // watched through a stand-in box in the same spot instead.
  const watch = new Map();
  items.forEach((el) => {
    let target = el;
    if (el.classList.contains("about-img")) {
      target = document.createElement("span");
      target.style.cssText = "position:absolute;inset:0;pointer-events:none;";
      const holder = document.createElement("div");
      holder.style.cssText = "position:relative;grid-area:img;";
      el.parentNode.insertBefore(holder, el); holder.appendChild(el); holder.appendChild(target);
    }
    watch.set(target, el);
  });
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { watch.get(e.target).classList.add("is-in"); io.unobserve(e.target); } });
  }, { threshold: 0.2, rootMargin: "0px 0px -12% 0px" });
  watch.forEach((_, t) => io.observe(t));
})();
}

window.__pageSignal = pageAbort.signal;   // from here on, listeners belong to this page
initPage(); initPage2();

(() => {
  if (!window.fetch || !window.DOMParser || !history.pushState) return;
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  const audio = document.getElementById("ambient");
  const isPage = (u) => /(^\/$|\/index(\.html)?$|\/html\/(explore|map|about)(\.html)?$)/.test(u.pathname);
  let shownPath = location.pathname;
  let busy = false;

  function runScript(old, base) {
    return new Promise((done) => {
      const src = old.getAttribute("src");
      const put = (code, name) => {
        const s = document.createElement("script");
        // wrapped in { } so a page's script can run again on a later visit
        s.textContent = "{\n" + code + "\n}" + (name ? "\n//# sourceURL=" + name : "");
        document.body.appendChild(s); done();
      };
      if (!src) return put(old.textContent);
      const url = new URL(src, base).href;
      fetch(url).then((r) => r.text()).then((code) => put(code, url), done);
    });
  }

  async function go(href, push, restoreY) {
    if (busy) return; busy = true;
    try {
      const res = await fetch(href, { credentials: "same-origin" });
      if (!res.ok) throw new Error(res.status);
      let html = await res.text();
      html = html.replace(/<head([^>]*)>/i, `<head$1><base href="${new URL(href, location.href).href}">`);
      const doc = new DOMParser().parseFromString(html, "text/html");
      if (!doc.querySelector(".nav")) throw new Error("not a 4057 page");

      try { history.replaceState({ y: window.scrollY }, ""); } catch (e) {}
      if (push) history.pushState({ y: 0 }, "", href);
      shownPath = location.pathname;

      // the old page's listeners stop here
      pageAbort.abort(); pageAbort = new AbortController(); window.__pageSignal = pageAbort.signal;

      document.title = doc.title;
      const d1 = document.querySelector('meta[name="description"]'), d2 = doc.querySelector('meta[name="description"]');
      if (d1 && d2) d1.setAttribute("content", d2.getAttribute("content"));
      [...document.body.attributes].forEach((a) => document.body.removeAttribute(a.name));
      [...doc.body.attributes].forEach((a) => document.body.setAttribute(a.name, a.value));

      const scripts = [...doc.body.querySelectorAll("script")];
      scripts.forEach((s) => s.remove());
      doc.body.querySelectorAll("#ambient").forEach((a) => a.remove());
      window.__pageSignal = null;               // (nothing below belongs to the old page)
      document.body.replaceChildren(...[...doc.body.childNodes].map((n) => document.adoptNode(n)));
      if (audio) document.body.appendChild(audio);   // the same music player carries on
      window.__pageSignal = pageAbort.signal;

      const hash = new URL(href, location.href).hash;
      const target = hash && document.getElementById(hash.slice(1));
      window.scrollTo(0, restoreY || 0);
      if (target) target.scrollIntoView();

      initPage(); initPage2();
      if (window.__soundRefresh) window.__soundRefresh();
      for (const s of scripts) {
        const src = s.getAttribute("src");
        if (src && /\/js\/script\.js$/.test(new URL(src, href).pathname)) continue;   // already running
        await runScript(s, href);
      }
    } catch (err) {
      location.href = href;                     // fall back to a normal page load
    } finally { busy = false; }
  }

  window.__pageSignal = null;
  document.addEventListener("click", (e) => {
    const a = e.target.closest && e.target.closest("a[href]");
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (a.target || a.hasAttribute("download")) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || !isPage(url)) return;
    if (url.pathname === location.pathname) {
      if (url.hash) return;                     // a link to another spot on this page
      e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); return;
    }
    e.preventDefault();
    go(url.href, true);
  });
  window.addEventListener("popstate", (e) => {
    if (location.pathname === shownPath) return;   // only the #part changed
    go(location.href, false, e.state && e.state.y);
  });
  window.__pageSignal = pageAbort.signal;
})();
