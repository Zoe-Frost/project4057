/* =========================================================
   4057 — scroll experience
   Scrolling scrubs through each scene's rendered frames on a
   full-screen canvas. Text fades in while the camera slows,
   and fog covers the cut between scenes.

   To add or change a scene, edit SCENES below.
     length : how much scrolling the scene takes (in screen heights)
     still  : a single image (slow zoom) instead of frames
     seq    : an image sequence, e.g. frames/boardwalk/frame_0001.png
     fogIn / fogOut : false = no fog at that edge (for continuous shots), "black" = fade through black
     hold   : where in the frames the camera slows for the text (0–1, default 0.42)
   ========================================================= */
const SCENES = [
  { id: "intro",     length: 1.2, fogOut: false },
  // Camera tilts down from Mauao into the dark water (1–95), then black (95–110)
  { id: "welcome",   length: 3,   fogIn: false, fogOut: false, hold: 0.18,
    seq: { dir: "../frames/welcome/", prefix: "frame_", start: 1, end: 110, pad: 4, ext: "webp" } },
  // Room render v2 (701 frames): black 0–50, drawer 60–200, dive into the wires 220–290,
  // pan across to the table 300–460, the pie 480–620, then fades to dark 640–700
  { id: "drawer",    length: 5,   fogIn: false, fogOut: false, hold: 0.43,
    seq: { dir: "../frames/room/", prefix: "frame_", start: 0,   end: 300, pad: 4, ext: "webp" } },
  { id: "pie",       length: 6,   fogIn: false, fogOut: "black", hold: 0.67,
    seq: { dir: "../frames/room/", prefix: "frame_", start: 301, end: 700, pad: 4, ext: "webp" } },
  // Boardwalk flows straight into the final render (its frame 1 = boardwalk frame 120)
  { id: "boardwalk", length: 3.5, fogIn: "black", fogOut: false,
    seq: { dir: "../frames/boardwalk/", prefix: "frame_", start: 1, end: 120, pad: 4, ext: "webp" } },
  // Final render, 450 frames: e-waste fields (text ~frame 120), up Mauao (text ~frame 240),
  // over the top, dive into the ocean (~400) and rise to the final view of the Mount (450)
  { id: "pilotbay",  length: 4.5, fogIn: false, fogOut: false, hold: 0.7,
    seq: { dir: "../frames/mtpilot/", prefix: "frame_", start: 1,   end: 170, pad: 4, ext: "webp" } },
  { id: "mauao",     length: 7.5, fogIn: false, fogOut: false, hold: 0.25,
    seq: { dir: "../frames/mtpilot/", prefix: "frame_", start: 171, end: 450, pad: 4, ext: "webp" } },
  // End screen holds on the last frame, darkened behind the text
  { id: "end",       length: 1.5, fogIn: false, holdPrevious: true },
];

const FOG_EDGE = 0.12;   // share of a scene spent fading through fog at each edge
const BLEND = false;     // true = cross-fade between frames (smoother on slow moves, but smears fast ones)

// Playback pace: the scenes play at a steady speed however fast someone scrolls.
// Scrolling only says where to go; the scenes travel there at these speeds
// (in scene lengths per second), and much slower while text is on screen.
const PACE = 0.6;        // normal speed (raise = faster)
const TEXT_PACE = 0.18;  // speed while text is showing (lower = lingers longer)

(() => {
  const wrap = document.getElementById("experience");
  const canvas = document.getElementById("frames");
  const ctx = canvas.getContext("2d");
  const fog = document.getElementById("fog");
  const copies = {};
  document.querySelectorAll(".copy[data-scene]").forEach((el) => (copies[el.dataset.scene] = el));

  const total = SCENES.reduce((s, sc) => s + sc.length, 0);
  let vh = window.innerHeight;
  let queued = false;

  /* ---------- sizing ---------- */
  // Phones show and hide their address bar while scrolling, which changes the
  // window height. Re-measuring on those small changes made the page jump, so the
  // scroll length is only recalculated when the width changes (e.g. rotating).
  const stage = canvas.parentElement;
  let lastW = 0;
  function resize() {
    const w = window.innerWidth;
    if (w !== lastW) {
      lastW = w;
      // Phones scroll much further per swipe, so each scene takes more swiping there.
      vh = Math.max(window.innerHeight, document.documentElement.clientHeight) * (PHONE ? PHONE_SLOW : 1);
      wrap.style.height = `${Math.round((total + 1) * vh)}px`;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(stage.clientWidth * dpr);
    canvas.height = Math.round(stage.clientHeight * dpr);
    requestRender();
  }

  /* ---------- image loading ----------
     Frames load a few at a time, nearest-first: the frames just ahead of
     where you are, then the next scenes, then everything else in the
     background. Each frame is decoded before it's used, so drawing never
     stalls the scroll. */
  // Phones get lighter frames (frames-m/, 1152px wide) and only keep the frames
  // around where you are in memory; holding hundreds of full-size frames made
  // phones stutter while they kept re-preparing them.
  const PHONE = window.matchMedia("(pointer: coarse)").matches && Math.min(screen.width, screen.height) < 600;
  const KEEP = PHONE ? 110 : Infinity;      // frames held in memory at once
  const PHONE_SLOW = 3;                     // phones: scenes take 3x more scrolling (raise to slow down more)
  const MAX_ACTIVE = PHONE ? 4 : 6;
  const cache = new Map(); // url -> { img, ok, done, started }
  let active = 0, wanted = [], lastPlan = "";
  function entryFor(url) {
    if (!cache.has(url)) cache.set(url, { img: null, ok: false, done: false, started: false });
    return cache.get(url);
  }
  function start(url, e) {
    e.started = true; active++;
    const img = new Image();
    img.decoding = "async";
    let finished = false;
    const finish = (ok) => {
      if (finished) return; finished = true;
      if (ok) { e.img = img; e.ok = true; }
      else setTimeout(() => { if (cache.get(url) === e) cache.delete(url); }, 1500);  // failed: allow a retry
      e.done = true; active--; pump(); requestRender();
    };
    // iPhones sometimes reject decode() under memory pressure even though the
    // image loaded fine, so a normal "loaded" also counts as ready.
    img.onload = () => {
      if (img.decode) img.decode().then(() => finish(true), () => finish(img.naturalWidth > 0));
      else finish(true);
    };
    img.onerror = () => finish(false);
    img.src = url;
  }
  function pump() {
    while (active < MAX_ACTIVE && wanted.length) {
      const url = wanted.shift(), e = entryFor(url);
      if (!e.started) start(url, e);
    }
  }
  function load(url) { const e = entryFor(url); if (!e.started) start(url, e); return e; }
  function frameUrl(seq, n) {
    const dir = PHONE ? seq.dir.replace("/frames/", "/frames-m/") : seq.dir;
    return `${dir}${seq.prefix}${String(n).padStart(seq.pad, "0")}.${seq.ext}`;
  }
  // Re-order the download queue around the current scene and frame.
  function plan(idx, frame) {
    const key = idx + ":" + Math.round(frame / 4);
    if (key === lastPlan) return;
    lastPlan = key;
    const list = [], seen = new Set();
    const add = (seq, n) => { const u = frameUrl(seq, n); if (!seen.has(u)) { seen.add(u); list.push(u); } };
    const sc = SCENES[idx];
    if (sc && sc.seq) {
      const f = Math.round(frame);
      for (let n = f; n <= Math.min(sc.seq.end, f + 90); n++) add(sc.seq, n);   // just ahead of you first
      for (let n = f - 1; n >= Math.max(sc.seq.start, f - 20); n--) add(sc.seq, n); // a little behind
      for (let n = f; n <= sc.seq.end; n++) add(sc.seq, n);                     // rest of this scene
      for (let n = f - 1; n >= sc.seq.start; n--) add(sc.seq, n);
    }
    for (let i = idx + 1; i < SCENES.length; i++) {                  // upcoming scenes
      const s = SCENES[i].seq; if (s) for (let n = s.start; n <= s.end; n++) add(s, n);
    }
    for (let i = idx - 1; i >= 0; i--) {                              // earlier scenes, nearest end first
      const s = SCENES[i].seq; if (s) for (let n = s.end; n >= s.start; n--) add(s, n);
    }
    let keep = list;
    if (KEEP !== Infinity) {
      keep = list.slice(0, KEEP);
      const keepSet = new Set(keep);
      for (const [u, e] of cache) {                 // let go of frames far from where you are
        if (e.done && !keepSet.has(u)) cache.delete(u);
      }
    }
    wanted = keep.filter((u) => !entryFor(u).started);
    pump();
  }

  /* ---------- timing helpers ---------- */
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const ramp = (t, a, b) => clamp((t - a) / (b - a));
  // Camera slows down while the text is on screen so people can read it.
  function holdEase(t, h = 0.425) {
    const a = h - 0.1, b = h + 0.1;              // frame window shown while text is up (wider = gentler slow-down)
    if (t < 0.25) return (t / 0.25) * a;
    if (t < 0.65) return a + ((t - 0.25) / 0.4) * (b - a);
    return b + ((t - 0.65) / 0.35) * (1 - b);
  }

  /* ---------- drawing ---------- */
  function drawCover(img, zoom = 1) {
    const cw = canvas.width, ch = canvas.height;
    const s = Math.max(cw / img.naturalWidth, ch / img.naturalHeight) * zoom;
    const w = img.naturalWidth * s, h = img.naturalHeight * s;
    ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
  }
  function nearestLoaded(seq, target) {
    for (let d = 0; d <= seq.end - seq.start; d++) {
      for (const n of [target - d, target + d]) {
        if (n < seq.start || n > seq.end) continue;
        const e = cache.get(frameUrl(seq, n));
        if (e && e.ok) return e.img;
      }
    }
    return null;
  }

  // Draw the frame at a fractional position, cross-fading into the next frame
  // so the steps between rendered frames are hidden while scrolling.
  function drawBlended(seq, pos) {
    const f0 = BLEND ? Math.floor(pos) : Math.round(pos), frac = pos - f0;
    const a = cache.get(frameUrl(seq, f0));
    const b = f0 + 1 <= seq.end ? cache.get(frameUrl(seq, f0 + 1)) : null;
    if (a && a.ok) {
      drawCover(a.img);
      if (BLEND && b && b.ok && frac > 0.02) {
        ctx.globalAlpha = frac; drawCover(b.img); ctx.globalAlpha = 1;
      }
      return true;
    }
    const img = nearestLoaded(seq, Math.round(pos));
    if (img) { drawCover(img); return true; }
    return false;
  }

  let everDrew = false;
  let current = null;   // smoothed scroll position, in screen heights
  let lastT = 0;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // True while a scene's text is on screen at scroll position y
  function textOnScreenAt(y) {
    let start = 0;
    for (let i = 0; i < SCENES.length; i++) {
      const s = SCENES[i], len = s.length;
      if (y < start + len || i === SCENES.length - 1) {
        if (!copies[s.id]) return false;
        const t = (y - start) / len;
        if (s.id === "intro") return false;   // "Scroll to start" doesn't need to linger
        if (s.id === "end") return t > 0.15;
        return t > 0.16 && t < 0.78;
      }
      start += len;
    }
    return false;
  }

  function render(now = performance.now()) {
    queued = false;
    const target = window.scrollY / vh;
    const dt = Math.min(0.1, (now - (lastT || now)) / 1000);
    lastT = now;
    if (current === null || reduceMotion) current = target;
    else if (current !== target) {
      const pace = textOnScreenAt(current) ? TEXT_PACE : PACE;
      const gap = target - current;
      let step = Math.sign(gap) * pace * dt;
      // ease in to a gentle stop over the last little bit
      if (Math.abs(gap) < 0.15) step *= Math.max(0.25, Math.abs(gap) / 0.15);
      current = Math.abs(step) >= Math.abs(gap) ? target : current + step;
    }
    if (current !== target) requestRender();      // keep gliding until we arrive
    else lastT = 0;
    const y = current;                             // scroll position in screen heights
    let start = 0, idx = SCENES.length - 1, t = 1;
    for (let i = 0; i < SCENES.length; i++) {
      if (y < start + SCENES[i].length || i === SCENES.length - 1) {
        idx = i; t = clamp((y - start) / SCENES[i].length); break;
      }
      start += SCENES[i].length;
    }
    const scene = SCENES[idx];
    plan(idx, scene.seq ? scene.seq.start + holdEase(t, scene.hold) * (scene.seq.end - scene.seq.start) : 0);

    // background
    let endBlur = 0;
    let drew = false;
    if (scene.still) {
      const e = load(scene.still);
      if (e.ok) { drawCover(e.img, 1 + 0.08 * t); drew = true; }
    } else if (scene.seq) {
      drew = drawBlended(scene.seq, scene.seq.start + holdEase(t, scene.hold) * (scene.seq.end - scene.seq.start));
    } else if (scene.id === "intro" && SCENES[1].seq) {
      drew = drawBlended(SCENES[1].seq, SCENES[1].seq.start);   // show the first welcome frame behind "Scroll to start"
    } else if (scene.holdPrevious && SCENES[idx - 1] && SCENES[idx - 1].seq) {
      const prev = SCENES[idx - 1].seq;
      // End screen: the last frame, blurred and darkened behind the text.
      // The blur is a CSS filter on the canvas so it also works on iPhones.
      const k = ramp(t, 0, 0.3);
      endBlur = k;
      drew = drawBlended(prev, prev.end);
      if (drew) {
        ctx.fillStyle = `rgba(17,22,17,${(0.45 * k).toFixed(3)})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }
    // If the frame for this spot hasn't arrived yet, keep showing the last
    // frame instead of flashing a blank screen.
    if (drew) everDrew = true;
    else if (!everDrew) { ctx.fillStyle = "#111"; ctx.fillRect(0, 0, canvas.width, canvas.height); }

    const blurPx = Math.round(endBlur * 22);
    const f2 = blurPx ? `blur(${blurPx}px)` : "";
    if (canvas.style.filter !== f2) {
      canvas.style.filter = f2;
      canvas.style.transform = blurPx ? `scale(${(1 + 0.06 * endBlur).toFixed(3)})` : "";
    }

    // fog between scenes
    let f = 0, black = false;
    if (idx > 0 && scene.fogIn !== false && t < FOG_EDGE) { f = 1 - t / FOG_EDGE; black = scene.fogIn === "black"; }
    if (idx < SCENES.length - 1 && scene.fogOut !== false && t > 1 - FOG_EDGE) { f = (t - (1 - FOG_EDGE)) / FOG_EDGE; black = scene.fogOut === "black"; }
    fog.style.opacity = clamp(f).toFixed(3);
    fog.classList.toggle("is-black", black);

    // text
    for (const [id, el] of Object.entries(copies)) {
      let o = 0;
      if (id === scene.id) {
        if (id === "intro") o = 1 - ramp(t, 0.55, 0.85);
        else if (id === "end") o = ramp(t, 0.2, 0.4);
        else o = ramp(t, 0.18, 0.3) * (1 - ramp(t, 0.62, 0.76));
      }
      el.style.opacity = o.toFixed(3);
      el.classList.toggle("is-on", o > 0.5);
    }

  }

  // Shown while a scene's frames haven't been added yet.
  function placeholder(id) {
    const g = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, 0, canvas.width / 2, canvas.height / 2, canvas.width * 0.7);
    g.addColorStop(0, "#1f2b1c"); g.addColorStop(1, "#111");
    ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(255,255,255,.18)";
    ctx.font = `${Math.round(12 * (window.devicePixelRatio || 1))}px Inter, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(`[ ${id} frames coming soon ]`, canvas.width / 2, canvas.height - 40 * (window.devicePixelRatio || 1));
  }

  function requestRender() {
    if (!queued) { queued = true; requestAnimationFrame(render); }
  }

  window.addEventListener("scroll", requestRender, { passive: true });
  window.addEventListener("resize", resize);
  resize();
})();
