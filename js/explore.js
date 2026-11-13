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
  // Room render: black 0–20, drawer 24–60, dive into the wires 60–84, pan to the table, pie at 112–120
  { id: "drawer",    length: 3.5, fogIn: false, fogOut: false, hold: 0.5,
    seq: { dir: "../frames/room/", prefix: "frame_", start: 0,  end: 80,  pad: 4, ext: "webp" } },
  { id: "pie",       length: 2.5, fogIn: false, fogOut: "black", hold: 0.88,
    seq: { dir: "../frames/room/", prefix: "frame_", start: 81, end: 120, pad: 4, ext: "webp" } },
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
const BLEND = false;
// Scroll smoothing: the scene glides toward where the visitor has scrolled to,
// never faster than MAX_SPEED (screen heights per second), however fast they scroll.
const MAX_SPEED = 1.2;
const EASE = 3;          // higher = catches up quicker     // true = cross-fade between frames (smoother on slow moves, but smears fast ones)

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
      vh = Math.max(window.innerHeight, document.documentElement.clientHeight);
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
  const MAX_ACTIVE = 6;
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
    img.src = url;
    img.decode()
      .then(() => { e.img = img; e.ok = true; })
      .catch(() => {})
      .finally(() => { e.done = true; active--; pump(); requestRender(); });
  }
  function pump() {
    while (active < MAX_ACTIVE && wanted.length) {
      const url = wanted.shift(), e = entryFor(url);
      if (!e.started) start(url, e);
    }
  }
  function load(url) { const e = entryFor(url); if (!e.started) start(url, e); return e; }
  function frameUrl(seq, n) {
    return `${seq.dir}${seq.prefix}${String(n).padStart(seq.pad, "0")}.${seq.ext}`;
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
      for (let n = f; n <= sc.seq.end; n++) add(sc.seq, n);          // ahead of you first
      for (let n = f - 1; n >= sc.seq.start; n--) add(sc.seq, n);    // then behind
    }
    for (let i = idx + 1; i < SCENES.length; i++) {                  // upcoming scenes
      const s = SCENES[i].seq; if (s) for (let n = s.start; n <= s.end; n++) add(s, n);
    }
    for (let i = idx - 1; i >= 0; i--) {                              // earlier scenes, nearest end first
      const s = SCENES[i].seq; if (s) for (let n = s.end; n >= s.start; n--) add(s, n);
    }
    wanted = list.filter((u) => !entryFor(u).started);
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

  let current = null;   // smoothed scroll position, in screen heights
  let lastT = 0;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function render(now = performance.now()) {
    queued = false;
    const target = window.scrollY / vh;
    const dt = Math.min(0.1, (now - (lastT || now)) / 1000);
    lastT = now;
    if (current === null || reduceMotion) current = target;
    else {
      let step = (target - current) * (1 - Math.exp(-EASE * dt));
      const cap = MAX_SPEED * dt;
      current += Math.max(-cap, Math.min(cap, step));
      if (Math.abs(target - current) < 0.0005) current = target;
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
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
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
      // End screen: the last frame, blurred and darkened behind the text
      const k = ramp(t, 0, 0.3);
      ctx.save();
      ctx.filter = `blur(${Math.round(40 * k * (canvas.width / 1920))}px)`;
      const pad = 1 + 0.08 * k;                    // scale up slightly so blurred edges stay filled
      ctx.translate(canvas.width / 2, canvas.height / 2); ctx.scale(pad, pad); ctx.translate(-canvas.width / 2, -canvas.height / 2);
      drew = drawBlended(prev, prev.end);
      ctx.restore();
      ctx.fillStyle = `rgba(17,22,17,${(0.45 * k).toFixed(3)})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    if (!drew && (scene.seq || scene.still)) placeholder(scene.id);

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
