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
     hold   : roughly where in the frames the text belongs (0–1, default 0.5)
     text   : optional [from, to] share of the scene the text stays up for (overrides hold)
     pauseBefore : scrolling (in scene lengths) spent on the first frame before the camera moves
     speed  : optional, plays this scene faster (e.g. 1.35) or slower (e.g. 0.8) than the others
     fastStart : optional [frames, times faster]: hurries through the first few frames (e.g. a slow camera start)
     fastEnd   : the same for the last few frames
     Every scene plays at the same steady speed: its length is set from its
     number of frames (FRAMES_PER_UNIT below), so more frames = longer scene.
   ========================================================= */
const SCENES = [
  { id: "intro",     length: 0.4, fogOut: false },   // short: "Welcome" comes up soon after you start scrolling
  // Camera tilts down from Mauao into the dark water (1–95), then black (95–110)
  { id: "welcome",   length: 3,   fogIn: false, fogOut: false, hold: 0.18, pauseBefore: 0.6, text: [0.0, 0.8],   // "Welcome" comes up before the camera starts moving
    seq: { dir: "../frames/welcome/", prefix: "frame_", start: 1, end: 165, pad: 4, ext: "webp" } },
  // Room render v2 (701 frames): black 0–50, drawer 60–200, dive into the wires 220–290,
  // pan across to the table 300–460, the pie 480–620, then fades to dark 640–700
  { id: "drawer",    length: 5,   fogIn: false, fogOut: false, hold: 0.43,
    seq: { dir: "../frames/room/", prefix: "frame_", start: 0,   end: 300, pad: 4, ext: "webp" } },
  { id: "pie",       length: 6,   fogIn: false, fogOut: "black", hold: 0.67, fastEnd: [50, 3],   // the fade to dark at the end goes by quicker
    seq: { dir: "../frames/room/", prefix: "frame_", start: 301, end: 700, pad: 4, ext: "webp" } },
  // Boardwalk (300 frames) flows straight into the final render (its frame 1 = boardwalk frame 300)
  { id: "boardwalk", length: 3.5, fogIn: "black", fogOut: false, speed: 1.35, fastStart: [45, 3], fastEnd: [50, 3],   // walks a bit quicker; the slow start and the tilt at the end go by quicker
    seq: { dir: "../frames/boardwalk/", prefix: "frame_", start: 1, end: 290, pad: 4, ext: "webp" } },   // the last few frames barely move, so it hands over to Pilot Bay at 290
  // Final render, 1100 frames: e-waste fields (text ~frame 290), up Mauao (text ~frame 585),
  // over the top, dive into the ocean (~915-975) and rise to the final view of the Mount (~1087, then a short hold)
  { id: "pilotbay",  length: 4.5, fogIn: false, fogOut: false, hold: 0.7,
    seq: { dir: "../frames/mtpilot/", prefix: "frame_", start: 1,   end: 414, pad: 4, ext: "webp" } },
  { id: "mauao",     length: 10, fogIn: false, fogOut: false, hold: 0.25, text: [0.06, 0.62],   // text gone before the dive
    seq: { dir: "../frames/mtpilot/", prefix: "frame_", start: 415, end: 1100, pad: 4, ext: "webp" } },
  // End screen holds on the last frame, darkened behind the text
  { id: "end",       length: 2.6, fogIn: false, holdPrevious: true },
];

const FOG_EDGE = 0.12;   // share of a scene spent fading through fog at each edge
const BLEND = false;     // true = cross-fade between frames (smoother on slow moves, but smears fast ones)

// Playback pace: every scene plays at one steady speed, however fast someone
// scrolls. Scrolling only says where to go; the scenes travel there at PACE
// (scene lengths per second). With 60 frames per scene length and PACE 0.4,
// the renders play at 24 frames a second, the speed they were rendered at.
const FRAMES_PER_UNIT = 60;
const PACE = 0.4;          // raise = faster everywhere
const TEXT_PACE = PACE;    // same speed while text is up (steady throughout)
const TEXT_SPAN = [0.35, 0.6]; // text stays up from 35% of the scene before its hold point to 60% after (most of the scene)

(() => {
  const wrap = document.getElementById("experience");
  const canvas = document.getElementById("frames");
  const ctx = canvas.getContext("2d");
  const fog = document.getElementById("fog");
  const copies = {};
  document.querySelectorAll(".copy[data-scene]").forEach((el) => (copies[el.dataset.scene] = el));

  // End screen timing. Laptops hold the last Mauao frame clear for a while first;
  // phones bring "Uncover the hidden" up within about one swipe of the last frame.
  const SMALL_SCREEN = window.matchMedia("(pointer: coarse)").matches && Math.min(screen.width, screen.height) < 600;
  const END = SMALL_SCREEN
    ? { length: 0.8, blur: [0.08, 0.3],  text: [0.22, 0.42], slow: 0.2 }
    : { length: 1.6, blur: [0.12, 0.38], text: [0.28, 0.48], slow: 0.3 };
  SCENES.find((s) => s.id === "end").length = END.length;
  // Steady speed: each scene's scroll length comes from its number of frames.
  const playFrames = (s) => {               // frames, counting any hurried frames as fewer
    let n = s.seq.end - s.seq.start + 1;
    for (const f of [s.fastStart, s.fastEnd]) if (f) n += f[0] / f[1] - f[0];
    return n;
  };
  SCENES.forEach((s) => { if (s.seq) s.length = playFrames(s) / FRAMES_PER_UNIT / (s.speed || 1) + (s.pauseBefore || 0); });

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
      const first = lastW === 0;
      lastW = w;
      // Phones scroll much further per swipe, so each scene takes more swiping there.
      vh = Math.max(window.innerHeight, document.documentElement.clientHeight) * (PHONE ? PHONE_SLOW : COMPUTER_SCROLL);
      // enough room to scroll through every scene, plus one screen for the last view to sit in
      wrap.style.height = `${Math.round(total * vh + Math.max(window.innerHeight, document.documentElement.clientHeight))}px`;
      // Turning the phone changes the page size; keep the experience exactly
      // where it was instead of letting it skip to a different part.
      if (!first && current !== null) {
        const keep = current, at = performance.now();
        ignoreScrollUntil = at + 700;      // the browser's own scroll jumps while turning don't count
        const put = () => { if (lastUserScroll < at) setScroll(keep); };
        put(); requestAnimationFrame(put); setTimeout(put, 250); setTimeout(put, 600);
      }
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.round(stage.clientWidth * dpr), ch = Math.round(stage.clientHeight * dpr);
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
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
  const KEEP = PHONE ? 75 : Infinity;       // phones only hold the frames around where you are
  const COMPUTER_SCROLL = 0.4;               // computers: each scene takes 40% less scrolling
  const PHONE_SLOW = 3;                     // phones: scenes take 3x more scrolling (raise to slow down more)
  const MAX_ACTIVE = PHONE ? 10 : 10;   // download several frames at once so phones keep up
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
  // The frames just ahead come first, and that run carries on into the next
  // scene so scene changes are ready before you reach them.
  const AHEAD = PHONE ? 60 : 240, BEHIND = PHONE ? 15 : 20;   // computers load about 10 seconds ahead
  function plan(idx, frame) {
    const key = idx + ":" + Math.round(frame / 4);
    if (key === lastPlan) return;
    lastPlan = key;
    const list = [], seen = new Set();
    const add = (seq, n) => { const u = frameUrl(seq, n); if (!seen.has(u)) { seen.add(u); list.push(u); } };
    let f = Math.round(frame);
    if (!SCENES[idx].seq && SCENES[idx].holdPrevious && SCENES[idx - 1] && SCENES[idx - 1].seq) {
      idx = idx - 1; f = SCENES[idx].seq.end;     // end screen: keep the last frame of the final render loaded
    }
    let ahead = 0;
    for (let i = idx; i < SCENES.length && ahead < AHEAD; i++) {     // just ahead of you, into the next scenes
      const s = SCENES[i].seq; if (!s) continue;
      for (let n = i === idx ? Math.max(f, s.start) : s.start; n <= s.end && ahead < AHEAD; n++) { add(s, n); ahead++; }
    }
    const sc = SCENES[idx];
    if (sc && sc.seq) for (let n = f - 1; n >= Math.max(sc.seq.start, f - BEHIND); n--) add(sc.seq, n); // a little behind
    if (KEEP === Infinity) {                                         // computers: then everything else
      for (let i = idx; i < SCENES.length; i++) { const s = SCENES[i].seq; if (s) for (let n = s.start; n <= s.end; n++) add(s, n); }
      for (let i = idx - 1; i >= 0; i--) { const s = SCENES[i].seq; if (s) for (let n = s.end; n >= s.start; n--) add(s, n); }
    } else {                                                         // phones: let go of frames far from where you are
      const keepSet = new Set(list);
      for (const [u, e] of cache) if (e.done && !keepSet.has(u)) cache.delete(u);
    }
    wanted = list.filter((u) => !entryFor(u).started);
    pump();
  }

  /* ---------- timing helpers ---------- */
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const ramp = (t, a, b) => clamp((t - a) / (b - a));
  // Frames are spread evenly through each scene, so the camera moves at a steady speed.
  // (pauseBefore keeps the first frame on screen for a moment first.)
  function holdEase(t, s) {
    const p = s && s.pauseBefore ? s.pauseBefore / s.length : 0;
    const u = t <= p ? 0 : (t - p) / (1 - p);
    if (!s || !s.seq || (!s.fastStart && !s.fastEnd)) return u;
    // fastStart / fastEnd: the first / last frames go by quicker, normal speed in between
    const N = s.seq.end - s.seq.start;
    const [F1, x1] = s.fastStart || [0, 1], [F2, x2] = s.fastEnd || [0, 1];
    const a = F1 / x1, mid = N - F1 - F2, b = F2 / x2;
    let time = u * (a + mid + b);
    if (time < a) return (time * x1) / N;
    time -= a;
    if (time < mid) return (F1 + time) / N;
    return (F1 + mid + (time - mid) * x2) / N;
  }
  // The part of a scene (0–1) its text is on screen for.
  function textRange(s) {
    if (s.text) return s.text;
    const h = s.hold == null ? 0.5 : s.hold;
    let a = Math.max(0.06, h - TEXT_SPAN[0]), b = Math.min(0.94, h + TEXT_SPAN[1]);
    if (s.fogIn) a = Math.max(a, FOG_EDGE + 0.02);
    if (s.fogOut) b = Math.min(b, 1 - FOG_EDGE - 0.02);
    return [a, b];
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

  // Which frame belongs at scroll position y, and is it ready to show?
  function frameReady(y) {
    let start = 0;
    for (let i = 0; i < SCENES.length; i++) {
      const s = SCENES[i];
      if (y < start + s.length || i === SCENES.length - 1) {
        const t = clamp((y - start) / s.length);
        let seq = null, n = 0;
        if (s.seq) { seq = s.seq; n = Math.round(seq.start + holdEase(t, s) * (seq.end - seq.start)); }
        else if (s.id === "intro" && SCENES[1].seq) { seq = SCENES[1].seq; n = seq.start; }
        else if (s.holdPrevious && SCENES[i - 1] && SCENES[i - 1].seq) { seq = SCENES[i - 1].seq; n = seq.end; }
        if (!seq) return true;
        const e = cache.get(frameUrl(seq, n));
        return !!(e && e.ok);
      }
      start += s.length;
    }
    return true;
  }
  let stallSince = 0;
  const TRAIL = PHONE ? 0.35 : 0.3;    // how far the scene glides on after you stop scrolling (in scene lengths); phones glide for longer
  const EASE = PHONE ? 0.3 : 0.28;     // how gradually it slows down at the end of a glide
  const PHONE_PACE = 1.45;      // phones play a little quicker
  const COMPUTER_PACE = 2.4;    // computers play faster too, so a scroll moves you further
  let trailing = false;
  const MAX_LAG = PHONE ? 0.45 : 0.4;   // (must be more than TRAIL so there's something left to glide)          // how far the page may run ahead of the scene (in scene-lengths)
  let lastUserScroll = 0, setY = -1, ignoreScrollUntil = 0;
  function setScroll(y) {
    if (!canvas.isConnected) return;
    setY = Math.round(y * vh);
    window.scrollTo(0, setY);
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
        if (s.id === "end") return t > END.slow;
        return t > 0.16 && t < 0.78;
      }
      start += len;
    }
    return false;
  }

  function render(now = performance.now()) {
    queued = false;
    if (!canvas.isConnected) return;            // you've moved to another page
    let target = window.scrollY / vh;
    const dt = Math.min(0.1, (now - (lastT || now)) / 1000);
    lastT = now;
    const idle = now - lastUserScroll > 160;      // the person has stopped scrolling
    if (!idle) trailing = false;
    if (current === null) current = target;   // (the steady pace applies with Reduce Motion on too; it keeps playback smooth)
    else if (idle && !trailing && Math.abs(target - current) > TRAIL) {
      // Stopped scrolling: the scene glides on a little and eases to a stop
      // (no auto-playing to catch up), and the page is lined up with that spot.
      target = current + Math.sign(target - current) * TRAIL;
      setScroll(target);
      trailing = true;
      stallSince = 0;
    }
    if (current !== null && current !== target) {
      const pace = (textOnScreenAt(current) ? TEXT_PACE : PACE) * (PHONE ? PHONE_PACE : COMPUTER_PACE);
      const gap = target - current;
      let step = Math.sign(gap) * pace * dt;
      // ease in to a gentle stop over the last little bit
      if (Math.abs(gap) < EASE) step *= Math.max(0.2, Math.abs(gap) / EASE);
      let next = Math.abs(step) >= Math.abs(gap) ? target : current + step;
      // If the next frame hasn't downloaded yet, pause briefly and wait for it
      // rather than jumping ahead to whatever frame is ready.
      if (!frameReady(next)) {
        if (!stallSince) stallSince = now;
        if (now - stallSince < 700) next = current;   // wait a moment at most, then carry on
      } else stallSince = 0;
      current = next;
      // Speed limit: scrolling faster than the scene moves doesn't build up
      // a backlog; the page is held just ahead of the scene.
      if (Math.abs(target - current) > MAX_LAG) setScroll(current + Math.sign(target - current) * MAX_LAG);
    }
    if (current !== target) requestRender();   // keep gliding until we arrive
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
    plan(idx, scene.seq ? scene.seq.start + holdEase(t, scene) * (scene.seq.end - scene.seq.start) : 0);

    // background
    let endBlur = 0;
    let drew = false;
    if (scene.still) {
      const e = load(scene.still);
      if (e.ok) { drawCover(e.img, 1 + 0.08 * t); drew = true; }
    } else if (scene.seq) {
      drew = drawBlended(scene.seq, scene.seq.start + holdEase(t, scene) * (scene.seq.end - scene.seq.start));
    } else if (scene.id === "intro" && SCENES[1].seq) {
      drew = drawBlended(SCENES[1].seq, SCENES[1].seq.start);   // show the first welcome frame behind "Scroll to start"
    } else if (scene.holdPrevious && SCENES[idx - 1] && SCENES[idx - 1].seq) {
      const prev = SCENES[idx - 1].seq;
      // End screen: the last frame, blurred and darkened behind the text.
      // The blur is a CSS filter on the canvas so it also works on iPhones.
      const k = ramp(t, END.blur[0], END.blur[1]);   // holds the last Mauao frame clear first, then blurs
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
        else if (id === "end") o = ramp(t, END.text[0], END.text[1]);
        else { const [a, b] = textRange(scene); o = ramp(t, a, a + 0.04) * (1 - ramp(t, b - 0.04, b)); }
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

  window.addEventListener("scroll", () => {
    const t = performance.now();
    if (t > ignoreScrollUntil && Math.abs(window.scrollY - setY) > 2) lastUserScroll = t;   // ignore our own scrollTo
    requestRender();
  }, { passive: true });
  window.addEventListener("resize", resize);
  resize();
})();
