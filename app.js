/* LumiVid paper page — curtain + compare-picker logic adapted from
   compare-ORIGINAL.html (same frame-lock, lazy-load, hold-last-frame rules). */

"use strict";

/* ============ curtain geometry ============
   Both sides are letterboxed into the same box, so the wipe is mapped across
   the picture rather than the box. */
function imageRect(box) {
  const ar = parseFloat(box.dataset.ar);
  const w = box.clientWidth, h = box.clientHeight;
  const iw = Math.min(w, h * ar), ih = Math.min(h, w / ar);
  return { left: (w - iw) / 2, width: iw, height: ih };
}

function setSplit(box, fraction) {
  const r = imageRect(box);
  const f = Math.max(0, Math.min(1, fraction));
  const x = r.left + r.width * f;
  box.querySelector(".over").style.clipPath =
    `inset(0 ${(1 - x / box.clientWidth) * 100}% 0 0)`;
  box.querySelector(".handle").style.left = `${x}px`;
  box.dataset.split = f;
  box.setAttribute("aria-valuenow", String(Math.round(f * 100)));
  const range = box.closest("figure")?.querySelector('input[type="range"]');
  if (range && document.activeElement !== range) range.value = String(Math.round(f * 100));
}

function bindCurtain(box) {
  setSplit(box, 0.5);
  let dragging = false;
  const to = (clientX) => {
    const r = imageRect(box), rect = box.getBoundingClientRect();
    setSplit(box, (clientX - rect.left - r.left) / r.width);
  };
  box.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    dragging = true;
    box.setPointerCapture(e.pointerId);
    to(e.clientX);
  });
  box.addEventListener("pointermove", (e) => { if (dragging) to(e.clientX); });
  box.addEventListener("pointerup", () => { dragging = false; });
  box.addEventListener("pointercancel", () => { dragging = false; });
  /* Keyboard: arrows move the seam, Home/End jump. */
  box.addEventListener("keydown", (e) => {
    const f = parseFloat(box.dataset.split || "0.5");
    const step = e.shiftKey ? 0.1 : 0.05;
    if (e.key === "ArrowLeft") { e.preventDefault(); setSplit(box, f - step); }
    else if (e.key === "ArrowRight") { e.preventDefault(); setSplit(box, f + step); }
    else if (e.key === "Home") { e.preventDefault(); setSplit(box, 0); }
    else if (e.key === "End") { e.preventDefault(); setSplit(box, 1); }
  });
}

addEventListener("resize", () => {
  document.querySelectorAll(".curtain").forEach((b) => {
    const f = parseFloat(b.dataset.split);
    setSplit(b, Number.isFinite(f) ? f : 0.5);
  });
});

/* ============ frame lock (two videos, one seam) ============
   Same deadband logic as the original: currentTime is quantised to frame
   boundaries, so the soft deadband must exceed one frame or the trim flaps. */
const SOFT_DRIFT = 0.09;
const HARD_DRIFT = 0.30;
const TRIM_GAIN = 1.0;
const MAX_TRIM = 0.08;

function wrappedDrift(followTime, leadTime, duration) {
  const drift = followTime - leadTime;
  if (!duration) return drift;
  if (drift > duration / 2) return drift - duration;
  if (drift < -duration / 2) return drift + duration;
  return drift;
}

function correction(drift) {
  if (Math.abs(drift) > HARD_DRIFT) return { seek: true, rate: 1 };
  if (Math.abs(drift) <= SOFT_DRIFT) return { seek: false, rate: 1 };
  const rate = 1 - drift * TRIM_GAIN;
  return { seek: false, rate: Math.min(1 + MAX_TRIM, Math.max(1 - MAX_TRIM, rate)) };
}

function lockCurtain(box) {
  const lead = box.querySelector(":scope > video");
  const follow = box.querySelector(":scope > .over video");
  if (!lead || !follow) return null; /* a stills curtain, nothing to keep in step */
  const both = [lead, follow];
  let scheduled = false;

  const step = () => {
    scheduled = false;
    if (lead.paused || !lead.duration || !follow.duration) return;
    const drift = wrappedDrift(follow.currentTime, lead.currentTime, lead.duration);
    const { seek, rate } = correction(drift);
    if (seek && !follow.seeking) follow.currentTime = lead.currentTime;
    if (follow.playbackRate !== rate) follow.playbackRate = rate;
    schedule();
  };

  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    if (lead.requestVideoFrameCallback) lead.requestVideoFrameCallback(step);
    else requestAnimationFrame(step);
  };

  const play = () => Promise.all(both.map((v) => v.play())).then(schedule).catch(() => {});

  let started = false;
  const start = () => {
    if (started || both.some((v) => v.readyState < 3)) return;
    started = true;
    follow.playbackRate = 1;
    play();
  };

  both.forEach((v) => v.addEventListener("canplay", start));
  lead.addEventListener("play", schedule);

  return {
    enter() {
      for (const v of both) {
        if (!v.src && v.dataset.src) {
          v.preload = "auto";
          v.src = v.dataset.src;
          v.load();
        }
      }
      if (started) play();
      else start();
    },
    leave() {
      for (const v of both) if (v.src) v.pause();
    },
  };
}

/* ============ curated data ============ */
function evTag(ev) { return `ev${ev >= 0 ? "p" : "m"}${Math.abs(ev)}`; }
function evLabel(ev) {
  if (ev === 0) return "EV 0 · normal";
  return `EV ${ev > 0 ? "+" : "−"}${Math.abs(ev)} · ${ev < 0 ? "highlights" : "shadows"}`;
}
function titleCase(s) {
  return s.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1));
}

/* hi/sh = the two re-exposed stops under each hero (match downloaded files). */
const CURATED_VIDS = [
  { stem: "vid_astronaut", title: "astronaut", spec: "1920×1080 · 24 fps · 161 frames", ar: 1.777778, hi: -3, sh: 3 },
  { stem: "vid_butterfly_wildflower_meadow", title: "butterfly wildflower meadow", spec: "1280×704 · 24 fps · 97 frames", ar: 1.818182, hi: -3, sh: 3 },
  { stem: "vid_city_walker_night", title: "city walker night", spec: "1280×720 · 24 fps · 137 frames", ar: 1.777778, hi: -3, sh: 3 },
  { stem: "vid_earth_satellite_view", title: "earth satellite view", spec: "1280×720 · 30 fps · 177 frames", ar: 1.777778, hi: -3, sh: 3 },
  { stem: "vid_forest_sunrise_aerial", title: "forest sunrise aerial", spec: "1280×704 · 24 fps · 193 frames", ar: 1.818182, hi: -3, sh: 1 },
  { stem: "vid_gameplay", title: "gameplay", spec: "720×1280 · 30 fps · 145 frames", ar: 0.5625, hi: -3, sh: 3 },
  { stem: "vid_lavender_flowers_closeup", title: "lavender flowers closeup", spec: "1280×704 · 24 fps · 193 frames", ar: 1.818182, hi: -3, sh: 3 },
  { stem: "vid_red_sports_car_mountain_road", title: "red sports car mountain road", spec: "1948×1060 · 24 fps · 241 frames", ar: 1.837736, hi: -3, sh: 1 },
  { stem: "vid_sunset", title: "sunset", spec: "1920×1080 · 25 fps · 161 frames", ar: 1.777778, hi: -3, sh: 1 },
  { stem: "vid_woman_rooftop_sunset", title: "woman rooftop sunset", spec: "1280×720 · 24 fps · 185 frames", ar: 1.777778, hi: -3, sh: -1 },
];
const CURATED_IMGS = [
  { stem: "img_business", title: "business", spec: "1920×1047 · 2.0 MP", ar: 1.833811, hi: -3, sh: -1 },
  { stem: "img_room", title: "room", spec: "1072×1920 · 2.1 MP", ar: 0.558333, hi: -3, sh: -1 },
  { stem: "img_toscana", title: "toscana", spec: "1920×1072 · 2.1 MP", ar: 1.791045, hi: -3, sh: -1 },
  { stem: "img_view", title: "view", spec: "1080×1920 · 2.1 MP", ar: 0.5625, hi: -3, sh: 3 },
];

function curtainMarkup(ar, rightSrc, leftSrc, leftTag, rightTag, kind, alt) {
  const base = kind === "video"
    ? `<video data-src="${rightSrc}" muted loop playsinline preload="none"></video>
       <div class="over"><video data-src="${leftSrc}" muted loop playsinline preload="none"></video></div>`
    : `<img data-src="${rightSrc}" alt="${alt}" draggable="false" decoding="async">
       <div class="over"><img data-src="${leftSrc}" alt="${alt}" draggable="false" decoding="async"></div>`;
  return `<div class="box curtain" data-ar="${ar}" tabindex="0" role="slider"
      aria-label="${alt}: drag or use arrow keys to compare" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50">
    ${base}
    <div class="handle" aria-hidden="true"><span></span></div>
    <span class="tag left">${leftTag}</span>
    <span class="tag right">${rightTag}</span>
  </div>`;
}

function curatedFile(stem, kind, ev, isVideo) {
  return `curated/media/${stem}/${kind}_${evTag(ev)}_0.${isVideo ? "mp4" : "avif"}`;
}

function renderCard(asset, isVideo) {
  const ar = asset.ar.toFixed(6);
  const maxh = asset.ar < 1 ? 900 : 660;
  const section = document.createElement("section");
  section.className = "asset reveal";
  section.dataset.stem = asset.stem;
  section.innerHTML = `
    <header>
      <h3>${titleCase(asset.title)}</h3>
      <span class="spec">${asset.spec}</span>
      ${isVideo ? `<div class="controls">
        <button type="button" data-play>Play</button><button type="button" data-pause>Pause</button>
      </div>` : ""}
    </header>
    <div class="grid">
      <figure class="panel hero" style="--ar:${ar};--maxh:${maxh}px">
        <figcaption>SDR → HDR · HLG</figcaption>
        ${curtainMarkup(ar, curatedFile(asset.stem, "hdr", 0, isVideo), curatedFile(asset.stem, "sdr", 0, isVideo), "SDR", "HDR", isVideo ? "video" : "img", `${titleCase(asset.title)} at normal exposure`)}
      </figure>
      <div class="stops">
        <figure class="panel stop" style="--ar:${ar}">
          <figcaption>${evLabel(asset.hi)}</figcaption>
          ${curtainMarkup(ar, curatedFile(asset.stem, "hdr", asset.hi, isVideo), curatedFile(asset.stem, "sdr", asset.hi, isVideo), "SDR", "HDR", isVideo ? "video" : "img", `${titleCase(asset.title)} at ${evLabel(asset.hi)}`)}
        </figure>
        <figure class="panel stop" style="--ar:${ar}">
          <figcaption>${evLabel(asset.sh)}</figcaption>
          ${curtainMarkup(ar, curatedFile(asset.stem, "hdr", asset.sh, isVideo), curatedFile(asset.stem, "sdr", asset.sh, isVideo), "SDR", "HDR", isVideo ? "video" : "img", `${titleCase(asset.title)} at ${evLabel(asset.sh)}`)}
        </figure>
      </div>
    </div>`;
  return section;
}

/* ============ lazy loading + play/pause ============ */
const locks = new Map();

const io = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    const pairs = locks.get(entry.target) || [];
    if (entry.isIntersecting) {
      for (const img of entry.target.querySelectorAll("img[data-src]")) {
        if (!img.src && img.dataset.src) img.src = img.dataset.src;
      }
      pairs.forEach((p) => p.enter());
    } else {
      pairs.forEach((p) => p.leave());
    }
  }
}, { rootMargin: "400px 0px" });

function observeAsset(section) {
  locks.set(section, [...section.querySelectorAll(".curtain")].map(lockCurtain).filter(Boolean));
  io.observe(section);
  const play = section.querySelector("[data-play]");
  const pause = section.querySelector("[data-pause]");
  if (play && pause) {
    section.dataset.wanted = "1";
    play.addEventListener("click", () => {
      section.dataset.wanted = "1";
      (locks.get(section) || []).forEach((p) => p.enter());
    });
    pause.addEventListener("click", () => {
      section.dataset.wanted = "0";
      (locks.get(section) || []).forEach((p) => p.leave());
    });
    /* Respect the user's pause when scrolling back into view. */
    locks.set(section, (locks.get(section) || []).map((p) => ({
      enter() { if (section.dataset.wanted !== "0") p.enter(); },
      leave() { p.leave(); },
    })));
  }
}

/* ============ compact grids + modal (justdubit-style) ============
   Grid tiles are lightweight thumbs (no curtain, no autoplay). Clicking a
   tile opens a <dialog> modal with the FULL curtain card via renderCard —
   same files, same bindCurtain/lockCurtain as the large version. */
function evBadge(asset) {
  const fmt = (ev) => (ev > 0 ? `+${ev}` : `${ev}`);
  return `EV ${fmt(asset.hi)}/${fmt(asset.sh)}`;
}

function renderVideoThumb(asset) {
  const ar = asset.ar.toFixed(6);
  const card = document.createElement("article");
  card.className = "thumb-card reveal in";
  card.dataset.stem = asset.stem;
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", `${titleCase(asset.title)}: click to open full SDR versus HDR comparison`);
  card.innerHTML = `
    <div class="thumb-media" style="--ar:${ar}">
      <video preload="metadata" muted playsinline src="${curatedFile(asset.stem, "hdr", 0, true)}#t=0.5"></video>
      <span class="thumb-tag">HDR · EV 0</span>
      <button class="expand-btn" type="button" aria-label="Expand ${titleCase(asset.title)}">⤢</button>
    </div>
    <div class="thumb-meta">
      <h3>${titleCase(asset.title)}</h3>
      <span class="spec">${asset.spec}</span>
      <span class="badge">${evBadge(asset)}</span>
    </div>`;
  card.addEventListener("click", () => openModal(asset, true));
  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openModal(asset, true); }
  });
  return card;
}

function renderStillThumb(asset) {
  const ar = asset.ar.toFixed(6);
  const card = document.createElement("article");
  card.className = "thumb-card reveal in";
  card.dataset.stem = asset.stem;
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", `${titleCase(asset.title)}: click to open full SDR versus HDR comparison`);
  card.innerHTML = `
    <div class="thumb-media" style="--ar:${ar}">
      <img src="${curatedFile(asset.stem, "hdr", 0, false)}" alt="${titleCase(asset.title)} HDR still" loading="lazy" draggable="false">
      <span class="thumb-tag">HDR · EV 0</span>
      <button class="expand-btn" type="button" aria-label="Expand ${titleCase(asset.title)}">⤢</button>
    </div>
    <div class="thumb-meta">
      <h3>${titleCase(asset.title)}</h3>
      <span class="spec">${asset.spec}</span>
      <span class="badge">${evBadge(asset)}</span>
    </div>`;
  card.addEventListener("click", () => openModal(asset, false));
  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openModal(asset, false); }
  });
  return card;
}

function mountCurated(rootId, assets, isVideo) {
  const root = document.getElementById(rootId);
  if (!root) return;
  for (const asset of assets) {
    root.appendChild(isVideo ? renderVideoThumb(asset) : renderStillThumb(asset));
  }
}

/* ============ curtain modal ============ */
function pauseGridVideos() {
  document.querySelectorAll(".grid-vids video").forEach((v) => { if (!v.paused) v.pause(); });
}

function openModal(asset, isVideo) {
  const dialog = document.getElementById("curtain-modal");
  const content = document.getElementById("modal-content");
  const title = document.getElementById("modal-title");
  const closeBtn = document.getElementById("modal-close");
  if (!dialog || !content) return;
  /* Only 1 modal player at a time: pause grid thumbs first. */
  pauseGridVideos();
  /* Clear any previous card (pauses its videos via removal). */
  content.innerHTML = "";
  title.textContent = `${titleCase(asset.title)} — SDR → HDR · HLG`;
  const section = renderCard(asset, isVideo);
  section.classList.add("in");
  content.appendChild(section);
  section.querySelectorAll(".curtain").forEach(bindCurtain);
  observeAsset(section);
  /* Modal content is already in view: force-load immediately. */
  for (const img of section.querySelectorAll("img[data-src]")) {
    if (!img.src && img.dataset.src) img.src = img.dataset.src;
  }
  (locks.get(section) || []).forEach((p) => p.enter());
  document.body.style.overflow = "hidden";
  if (!dialog.open) dialog.showModal();
  closeBtn?.focus();
}

function closeModal() {
  const dialog = document.getElementById("curtain-modal");
  const content = document.getElementById("modal-content");
  if (dialog?.open) dialog.close();
  /* Pausing via removal: dropping the card stops all its videos. */
  if (content) content.innerHTML = "";
  document.body.style.overflow = "";
}

document.getElementById("modal-close")?.addEventListener("click", closeModal);
document.getElementById("curtain-modal")?.addEventListener("click", (e) => {
  /* Backdrop click (dialog element itself) closes; inner clicks do not. */
  if (e.target.tagName === "DIALOG") closeModal();
});
document.getElementById("curtain-modal")?.addEventListener("close", () => {
  document.body.style.overflow = "";
});

/* AVIF fallback: if the browser cannot decode AVIF, say so on the panel. */
document.addEventListener("error", (e) => {
  const img = e.target;
  if (img.tagName === "IMG" && img.dataset.src?.endsWith(".avif") && !img.dataset.avifWarned) {
    img.dataset.avifWarned = "1";
    const box = img.closest(".box");
    const note = document.createElement("span");
    note.className = "tag bad";
    note.style.cssText = "left:9px;right:auto;top:9px;bottom:auto;";
    note.textContent = "AVIF not supported in this browser";
    box?.appendChild(note);
  }
}, true);

/* ============ compare methods ============ */
const METHODS = [
  { key: "sdr", label: "SDR" },
  { key: "ours", label: "LumiVid" },
  { key: "sdr2hdr", label: "Tedla et al. (17 frames)" },
  { key: "hdrtvnet", label: "HDRTVNet++" },
  { key: "diffhdr", label: "DiffHDR" },
];
const EVS = [-4, -3, 0, 3, 4];
const SDR2HDR_FRAMES = 17;
const CLIP_FPS = {
  vid_earth_satellite_view: 30,
  vid_gameplay: 30,
  vid_sunset: 25,
  vid_burning_ember: 30,
  vid_rocket_launch: 48,
};
const COMPARE = [
  { stem: "vid_astronaut", title: "astronaut", spec: "1920×1080 · 121 frames", w: 1920, h: 1080 },
  { stem: "vid_butterfly_wildflower_meadow", title: "butterfly wildflower meadow", spec: "1280×704 · 97 frames", w: 1280, h: 704 },
  { stem: "vid_city_walker_night", title: "city walker night", spec: "1280×720 · 121 frames", w: 1280, h: 720 },
  { stem: "vid_earth_satellite_view", title: "earth satellite view", spec: "1280×720 · 121 frames", w: 1280, h: 720 },
  { stem: "vid_forest_sunrise_aerial", title: "forest sunrise aerial", spec: "1280×704 · 121 frames", w: 1280, h: 704 },
  { stem: "vid_gameplay", title: "gameplay", spec: "720×1280 · 121 frames", w: 720, h: 1280 },
  { stem: "vid_lavender_flowers_closeup", title: "lavender flowers closeup", spec: "1280×704 · 121 frames", w: 1280, h: 704 },
  { stem: "vid_red_sports_car_mountain_road", title: "red sports car mountain road", spec: "1948×1060 · 121 frames", w: 1948, h: 1060 },
  { stem: "vid_sunset", title: "sunset", spec: "1920×1080 · 121 frames", w: 1920, h: 1080 },
  { stem: "vid_woman_rooftop_sunset", title: "woman rooftop sunset", spec: "1280×720 · 121 frames", w: 1280, h: 720 },
  { stem: "vid_burning_ember", title: "burning ember", spec: "1280×720 · 121 frames", w: 1280, h: 720 },
  { stem: "vid_girl_candle_haunted_house", title: "girl candle haunted house", spec: "1920×1080 · 73 frames", w: 1920, h: 1080 },
  { stem: "vid_rocket_launch", title: "rocket launch", spec: "1280×720 · 121 frames", w: 1280, h: 720 },
  { stem: "vid_vr_headset_bedroom", title: "vr headset bedroom", spec: "1920×1080 · 121 frames", w: 1920, h: 1080 },
  { stem: "movie_ghostbusters_2016", title: "Ghostbusters (2016)", spec: "1280×704 · 17 frames", w: 1280, h: 704 },
  { stem: "movie_spiderman_2002", title: "Spider-Man (2002)", spec: "1280×704 · 17 frames", w: 1280, h: 704 },
  { stem: "movie_charge", title: "Charge", spec: "1280×704 · 17 frames", w: 1280, h: 704 },
  { stem: "movie_big_buck_bunny", title: "Big Buck Bunny", spec: "1280×704 · 17 frames", w: 1280, h: 704 },
  { stem: "movie_karate_kid_2010", title: "The Karate Kid (2010)", spec: "1280×704 · 17 frames", w: 1280, h: 704 },
  { stem: "movie_jumanji_next_level", title: "Jumanji: The Next Level", spec: "1280×704 · 17 frames", w: 1280, h: 704 },
  { stem: "movie_men_in_black", title: "Men in Black (1997)", spec: "1280×704 · 17 frames", w: 1280, h: 704 },
  { stem: "movie_sintel", title: "Sintel", spec: "1280×704 · 17 frames", w: 1280, h: 704 },
  { stem: "vid_child_sprinkler", title: "child sprinkler", spec: "1280×704 · 17 frames", w: 1280, h: 704 },
  { stem: "vid_garden_night", title: "garden at night", spec: "1280×704 · 17 frames", w: 1280, h: 704 },
  { stem: "vid_campfire_sunny", title: "campfire sunny day", spec: "1280×704 · 17 frames", w: 1280, h: 704 },
  { stem: "vid_diffhdr_wooden_house", title: "wooden house", spec: "1280×720 · 33 frames", w: 1280, h: 720 },
  { stem: "vid_diffhdr_long_video", title: "long video", spec: "1280×720 · 97 frames", w: 1280, h: 720 },
];

function compareFile(stem, method, ev) {
  return `compare/hlg/${stem}/${method}_${evTag(ev)}.mp4`;
}

function playableEnd(el) {
  const d = el.duration || 0;
  const hold = Number(el.dataset.holdFrames || 0);
  if (hold > 0) {
    const fps = Number(el.dataset.fps || 24);
    return Math.min(d, Math.max(0, hold / fps));
  }
  return d;
}

/* Tedla et al. only ships 17 frames: it holds its last frame while the other
   method keeps playing, then both restart together. */
function lockPair(a, b) {
  if (!a || !b) return { enter() {}, leave() {}, resetStart() {} };
  const pair = [a, b];
  let scheduled = false, started = false, wanted = false, restarting = false;
  const leadFollow = () => {
    const ea = playableEnd(a), eb = playableEnd(b);
    return ea >= eb
      ? { lead: a, follow: b, leadEnd: ea, followEnd: eb }
      : { lead: b, follow: a, leadEnd: eb, followEnd: ea };
  };
  const holdAt = (el, tEnd) => {
    const last = Math.max(0, tEnd - 0.04);
    if (!el.paused) el.pause();
    if (!el.seeking && Math.abs(el.currentTime - last) > 0.03) el.currentTime = last;
  };
  const restart = () => {
    if (!wanted || restarting) return;
    restarting = true;
    pair.forEach((v) => { v.currentTime = 0; });
    Promise.all(pair.map((v) => v.play())).catch(() => {}).finally(() => {
      restarting = false;
      schedule();
    });
  };
  const step = () => {
    scheduled = false;
    if (!wanted || restarting) return;
    if (!a.duration || !b.duration) { schedule(); return; }
    const { lead, follow, leadEnd, followEnd } = leadFollow();
    if (lead.ended || (leadEnd > 0 && !lead.seeking && lead.currentTime >= leadEnd - 0.02)) {
      restart();
      return;
    }
    const t = lead.currentTime;
    if (followEnd > 0 && t >= followEnd - 0.02) holdAt(follow, followEnd);
    else {
      if (follow.paused) follow.play().catch(() => {});
      if (Math.abs(follow.currentTime - t) > 0.08 && !follow.seeking) follow.currentTime = t;
      if (follow.playbackRate !== 1) follow.playbackRate = 1;
    }
    schedule();
  };
  const schedule = () => {
    if (scheduled || !wanted || restarting) return;
    scheduled = true;
    const { lead } = leadFollow();
    if (lead.requestVideoFrameCallback) lead.requestVideoFrameCallback(step);
    else requestAnimationFrame(step);
  };
  const play = () => {
    wanted = true;
    return Promise.all(pair.map((v) => v.play())).then(schedule).catch(() => {});
  };
  const start = () => {
    if (started || pair.some((v) => v.readyState < 3)) return;
    started = true;
    play();
  };
  pair.forEach((v) => {
    v.addEventListener("canplay", start);
    v.addEventListener("ended", () => { if (wanted) restart(); });
  });
  return {
    enter() { if (started) play(); else start(); },
    leave() {
      wanted = false;
      pair.forEach((v) => { if (v.src) v.pause(); });
    },
    resetStart() { started = false; wanted = false; restarting = false; },
  };
}

const ABLATION_METHODS = [
  { key: "vae", label: "VAE decoder" },
  { key: "ours", label: "LumiVid" },
];
const ABLATION_EVS = [-3, 0, 3];
const ABLATIONS = [
  { stem: "sdr_HDR-before-002", title: "field survey", spec: "1280×720 · 49 frames", w: 1280, h: 720, fps: 30 },
  { stem: "sdr_step_000000_5", title: "sunlit room", spec: "1280×720 · 49 frames", w: 1280, h: 720, fps: 25 },
  { stem: "sdr_vid_d", title: "colonnade", spec: "1280×720 · 33 frames", w: 1280, h: 720, fps: 24 },
  { stem: "vid_forest_sunrise_aerial", title: "forest sunrise aerial", spec: "1280×704 · 24 fps · 193 frames", w: 1280, h: 704, fps: 24, evs: [-3, 0, 1], defaultEv: "0" },
  { stem: "vid_red_sports_car_mountain_road", title: "red sports car mountain road", spec: "1948×1060 · 24 fps · 241 frames", w: 1948, h: 1060, fps: 24, evs: [-3, 0, 1], defaultEv: "0" },
];

function mountCompare() {
  mountPicker({
    playerId: "compare-player",
    chipsId: "compare-chips",
    cardId: "compare-card",
    clips: COMPARE,
    methods: METHODS,
    evs: EVS,
    defaultEv: "0",
    defaultLeft: "sdr2hdr",
    defaultRight: "ours",
    note: "Tedla et al. is the official 17-frame window, then holds while the other method keeps playing.",
    file: compareFile,
    thumb: (stem) => `compare/hlg/${stem}/thumb.jpg`,
    holdFrames: (method) => (method === "sdr2hdr" ? String(SDR2HDR_FRAMES) : ""),
    aria: "Method comparison: drag or use arrow keys to compare",
  });
}

function mountAblations() {
  mountPicker({
    playerId: "ablation-player",
    chipsId: "ablation-chips",
    cardId: "ablation-card",
    clips: ABLATIONS,
    methods: ABLATION_METHODS,
    evs: ABLATION_EVS,
    defaultEv: "-3",
    defaultLeft: "vae",
    defaultRight: "ours",
    note: "",
    file: (stem, method, ev) => `ablations/hlg/${stem}/${method}_${evTag(ev)}.mp4`,
    thumb: (stem) => `ablations/hlg/${stem}/thumb.jpg`,
    holdFrames: () => "",
    aria: "Ablation comparison: drag or use arrow keys to compare",
  });
}

const AUG_METHODS = [
  { key: "no_aug", label: "No augmentation" },
  { key: "blur_only", label: "Blur only" },
  { key: "full", label: "Full model" },
];
const AUG_CLIPS = [
  { stem: "dandelion_girl_sunset", title: "dandelion sunset", spec: "1280×720 · 60 fps · 49 frames", w: 1280, h: 720, fps: 60 },
  { stem: "big_ben_tower", title: "Big Ben", spec: "1280×720 · 25 fps · 49 frames", w: 1280, h: 720, fps: 25 },
  { stem: "carousel_night_glow", title: "carousel night", spec: "1280×720 · 24 fps · 49 frames", w: 1280, h: 720, fps: 24 },
  { stem: "horse_pasture_silhouette", title: "horse pasture", spec: "1280×720 · 60 fps · 49 frames", w: 1280, h: 720, fps: 60 },
];

function mountAugAblations() {
  mountPicker({
    playerId: "aug-player",
    chipsId: "aug-chips",
    cardId: "aug-card",
    clips: AUG_CLIPS,
    methods: AUG_METHODS,
    evs: ABLATION_EVS,
    defaultEv: "-3",
    defaultLeft: "no_aug",
    defaultRight: "full",
    note: "BT.2020 HLG from ACEScg EXR.",
    file: (stem, method, ev) => `ablations/hlg/${stem}/${method}_${evTag(ev)}.mp4`,
    thumb: (stem) => `ablations/hlg/${stem}/thumb.jpg`,
    holdFrames: () => "",
    aria: "Augmentation comparison: drag or use arrow keys to compare",
  });
}

function mountPicker(cfg) {
  const root = document.getElementById(cfg.playerId);
  const chips = document.getElementById(cfg.chipsId);
  if (!root || !chips) return;
  const label = (key) => (cfg.methods.find((m) => m.key === key) || { label: key }).label;

  const section = document.createElement("section");
  section.className = "asset compare-card reveal in";
  section.id = cfg.cardId;
  section.innerHTML = `
    <header>
      <h3 data-title></h3>
      <span class="spec" data-spec></span>
      <div class="controls">
        <button type="button" data-play>Play</button>
        <button type="button" data-pause>Pause</button>
        <button type="button" data-reset>Restart</button>
      </div>
    </header>
    <div class="picks">
        <label for="${cfg.cardId}-ev">Exposure</label><select id="${cfg.cardId}-ev" data-ev></select>
      <label for="${cfg.cardId}-left">Left</label><select id="${cfg.cardId}-left" data-side="left"></select>
      <label for="${cfg.cardId}-right">Right</label><select id="${cfg.cardId}-right" data-side="right"></select>
      <span class="method-note">${cfg.note}</span>
    </div>
    <figure class="panel hero compare-hero" data-figure style="--maxh:660px">
      <figcaption data-cap></figcaption>
      <div class="box curtain" data-ar="" tabindex="0" role="slider"
          aria-label="${cfg.aria}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50">
        <video data-layer="right" muted playsinline preload="auto"></video>
        <div class="over"><video data-layer="left" muted playsinline preload="auto"></video></div>
        <div class="handle" aria-hidden="true"><span></span></div>
        <span class="tag left" data-tag="left">Tedla et al.</span>
        <span class="tag right" data-tag="right">LumiVid</span>
      </div>
      <input class="seam" type="range" min="0" max="100" value="50" aria-label="Comparison seam position">
    </figure>`;

  const evSel = section.querySelector("[data-ev]");
  const leftSel = section.querySelector('select[data-side="left"]');
  const rightSel = section.querySelector('select[data-side="right"]');
  evSel.innerHTML = cfg.evs.map((ev) => `<option value="${ev}">${evLabel(ev)}</option>`).join("");
  const opts = cfg.methods.map((m) => `<option value="${m.key}">${m.label}</option>`).join("");
  leftSel.innerHTML = opts;
  rightSel.innerHTML = opts;
  evSel.value = cfg.defaultEv;
  leftSel.value = cfg.defaultLeft;
  rightSel.value = cfg.defaultRight;
  root.appendChild(section);

  const box = section.querySelector(".curtain");
  const range = section.querySelector('input[type="range"]');
  const figure = section.querySelector("[data-figure]");
  bindCurtain(box);
  range.addEventListener("input", () => setSplit(box, Number(range.value) / 100));

  const layer = (side) => section.querySelector(`[data-layer="${side}"]`);
  const lock = lockPair(layer("right"), layer("left"));
  let asset = cfg.clips[0];

  const setAspect = () => {
    const ar = (asset.w / asset.h).toFixed(6);
    figure.style.setProperty("--ar", ar);
    box.dataset.ar = ar;
    setSplit(box, parseFloat(box.dataset.split || "0.5"));
  };
  const assign = (side) => {
    const method = side === "left" ? leftSel.value : rightSel.value;
    const ev = Number(evSel.value);
    const el = layer(side);
    const src = cfg.file(asset.stem, method, ev);
    const tagEl = section.querySelector(`[data-tag="${side}"]`);
    tagEl.textContent = label(method);
    tagEl.classList.remove("bad");
    const t = el.currentTime || 0;
    el.pause();
    el.dataset.fps = String(asset.fps || CLIP_FPS[asset.stem] || 24);
    el.dataset.holdFrames = cfg.holdFrames(method);
    el.loop = false;
    el.src = src;
    el.load();
    el.addEventListener("loadedmetadata", () => {
      const end = playableEnd(el);
      if (t > 0 && end) el.currentTime = Math.min(t, Math.max(0, end - 0.04));
    }, { once: true });
    el.addEventListener("error", () => {
      tagEl.textContent = `${label(method)} — missing`;
      tagEl.classList.add("bad");
    }, { once: true });
  };
  const caption = () => {
    section.querySelector("[data-title]").textContent = asset.title;
    section.querySelector("[data-spec]").textContent = asset.spec;
    section.querySelector("[data-cap]").textContent =
      `${label(leftSel.value)}  →  ${label(rightSel.value)}  ·  ${evLabel(Number(evSel.value))}  ·  HLG`;
  };
  const updateOursRing = () => {
    /* Black ring on the player when LumiVid holds the right side. */
    box.classList.toggle("ours-right", rightSel.value === "ours");
  };
  const refresh = () => {
    setAspect();
    assign("left");
    assign("right");
    caption();
    updateOursRing();
    lock.resetStart();
  };
  const fillEvs = () => {
    const evs = asset.evs || cfg.evs;
    const prev = evSel.value;
    evSel.innerHTML = evs.map((ev) => `<option value="${ev}">${evLabel(ev)}</option>`).join("");
    const allowed = evs.map(String);
    if (asset.defaultEv && allowed.includes(String(asset.defaultEv))) {
      evSel.value = String(asset.defaultEv);
    } else if (allowed.includes(prev)) {
      evSel.value = prev;
    } else {
      evSel.value = cfg.defaultEv;
    }
  };
  const setClip = (next) => {
    asset = next;
    chips.querySelectorAll("button").forEach((b) => {
      b.classList.toggle("on", b.dataset.stem === asset.stem);
    });
    lock.leave();
    [layer("left"), layer("right")].forEach((el) => { el.currentTime = 0; });
    fillEvs();
    refresh();
  };

  leftSel.addEventListener("change", refresh);
  rightSel.addEventListener("change", refresh);
  evSel.addEventListener("change", refresh);
  section.querySelector("[data-play]").addEventListener("click", () => lock.enter());
  section.querySelector("[data-pause]").addEventListener("click", () => lock.leave());
  section.querySelector("[data-reset]").addEventListener("click", () => {
    lock.leave();
    [layer("left"), layer("right")].forEach((el) => { el.currentTime = 0; });
  });

  const makeChip = (item) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "thumb";
    b.title = item.title;
    b.dataset.stem = item.stem;
    b.setAttribute("aria-label", `Compare clip: ${item.title}`);
    const thumb = document.createElement("img");
    thumb.src = cfg.thumb(item.stem);
    thumb.alt = item.title;
    thumb.loading = "lazy";
    b.appendChild(thumb);
    b.addEventListener("click", () => setClip(item));
    return b;
  };

  for (const item of cfg.clips) chips.appendChild(makeChip(item));

  const ioCmp = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        if (!layer("left").getAttribute("src")) refresh();
        lock.enter();
      } else lock.leave();
    }
  }, { rootMargin: "400px 0px" });
  ioCmp.observe(section);
  setClip(cfg.clips[0]);
}

/* ============ boot ============ */
mountCurated("results-videos", CURATED_VIDS, true);
mountCurated("results-stills", CURATED_IMGS, false);
mountCompare();
mountAblations();
mountAugAblations();

/* Hero curtains are hand-written in HTML: bind + lazy-load them. */
document.querySelectorAll(".hero-curtains .curtain").forEach(bindCurtain);
document.querySelectorAll(".hero-curtains").forEach(observeAsset);

/* Quiet scroll reveals. */
const revealIO = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (e.isIntersecting) { e.target.classList.add("in"); revealIO.unobserve(e.target); }
  }
}, { rootMargin: "0px 0px -8% 0px" });
document.querySelectorAll(".reveal").forEach((el) => revealIO.observe(el));
