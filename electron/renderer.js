let settings = {};
let sourceMode = "youtube"; // "youtube" | "local"

// Per-template font defaults so the customizer reflects the picked style.
const TEMPLATE_FONT_DEFAULTS = {
  capcut:  { font: "Arial",  size: 56, base: "#ffffff", hl: "#00ff00", outline: "#000000" },
  hormozi: { font: "Arial",  size: 66, base: "#ffffff", hl: "#ffff00", outline: "#000000" },
  classic: { font: "Arial",  size: 48, base: "#ffffff", hl: "#ffff00", outline: "#000000" },
  neon:    { font: "Impact", size: 54, base: "#ffffff", hl: "#ff00ff", outline: "#00ffff" },
  minimal: { font: "Arial",  size: 48, base: "#ffffff", hl: "#00ff00", outline: "#000000" },
};

function toggleAdvanced() {
  const panel = document.getElementById("advancedPanel");
  const arrow = document.getElementById("advArrow");
  const open = panel.style.display !== "none";
  panel.style.display = open ? "none" : "block";
  arrow.innerHTML = open ? "&#9658;" : "&#9660;";
}

// Preview & Range state
let videoDuration = 0;
let rangeStart = 0;
let rangeEnd = 0;
let isDragging = null; // 'start' | 'end' | null

// ── Source mode ───────────────────────────────────────────────────────────────
function setSource(mode) {
  sourceMode = mode;
  document.getElementById("src-youtube").style.display = mode === "youtube" ? "" : "none";
  document.getElementById("src-local").style.display = mode === "local" ? "" : "none";
  document.getElementById("btn-youtube").classList.toggle("active", mode === "youtube");
  document.getElementById("btn-local").classList.toggle("active", mode === "local");
  
  const previewBox = document.getElementById("previewBox");
  const workspaceEmpty = document.getElementById("workspaceEmpty");
  if (mode === "local") {
    document.getElementById("step-download").textContent = "Prepare";
    if (previewBox) previewBox.classList.add("active");
    if (workspaceEmpty) workspaceEmpty.style.display = "none";
    const lp = document.getElementById("localPath").value;
    if (lp) loadPreview(lp);
  } else {
    document.getElementById("step-download").textContent = "Download";
    if (previewBox) previewBox.classList.add("active");
    if (workspaceEmpty) workspaceEmpty.style.display = "none";
    resetPreview();
  }
}

async function pickLocalFile() {
  const file = await window.api.pickFile();
  if (file) {
    document.getElementById("localPath").value = file;
    if (sourceMode === "local") {
      loadPreview(file);
    }
  }
}

// ── Preview & Slider Logic ────────────────────────────────────────────────────
async function loadPreview(filePath) {
  const video = document.getElementById("previewVideo");
  const empty = document.getElementById("previewEmpty");
  const portrait = document.getElementById("portraitVideo");
  const facecamVideo = document.getElementById("portraitFacecamVideo");
  const previewBox = document.getElementById("previewBox");
  const workspaceEmpty = document.getElementById("workspaceEmpty");

  const src = `file://${filePath.replace(/\\/g, "/")}`;
  video.src = src;
  if (portrait) {
    portrait.src = src;
    portrait.currentTime = 0;
  }
  if (facecamVideo) {
    facecamVideo.src = src;
    facecamVideo.currentTime = 0;
  }
  empty.style.display = "none";
  if (previewBox) previewBox.classList.add("active");
  if (workspaceEmpty) workspaceEmpty.style.display = "none";

  videoDuration = await window.api.getVideoDuration(filePath);
  if (videoDuration <= 0) {
    video.onloadedmetadata = () => {
      videoDuration = video.duration;
      resetRange();
      updateTimelineRuler();
    };
  } else {
    resetRange();
    updateTimelineRuler();
  }

  video.ontimeupdate = updatePlayhead;
}

function resetPreview() {
  const video = document.getElementById("previewVideo");
  const portrait = document.getElementById("portraitVideo");
  const facecamVideo = document.getElementById("portraitFacecamVideo");
  video.src = "";
  if (portrait) portrait.src = "";
  if (facecamVideo) facecamVideo.src = "";
  document.getElementById("previewEmpty").style.display = "flex";
  videoDuration = 0;
  resetRange();
  updateTimelineRuler();
  updatePlayhead();
}

function resetRange() {
  rangeStart = 0;
  rangeEnd = videoDuration;
  updateSliderUI();
}

function formatTime(sec) {
  if (!sec || isNaN(sec)) return "00:00";
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function updateSliderUI() {
  if (videoDuration <= 0) return;
  
  const startPct = (rangeStart / videoDuration) * 100;
  const endPct = (rangeEnd / videoDuration) * 100;
  
  document.getElementById("handleStart").style.left = `${startPct}%`;
  document.getElementById("handleEnd").style.left = `${endPct}%`;
  
  const fill = document.getElementById("rangeFill");
  fill.style.left = `${startPct}%`;
  fill.style.width = `${endPct - startPct}%`;
  
  const clip = document.getElementById("timelineClip");
  if (clip) {
    clip.style.left = `${startPct}%`;
    clip.style.width = `${endPct - startPct}%`;
  }
  
  document.getElementById("rangeTime").textContent = `${formatTime(rangeStart)} → ${formatTime(rangeEnd)}`;
}

function initSlider() {
  const slider = document.getElementById("rangeSlider");
  const track = document.getElementById("timelineTrack");
  const ruler = document.getElementById("timelineRuler");

  slider.addEventListener("mousedown", (e) => {
    if (videoDuration <= 0) return;
    const rect = slider.getBoundingClientRect();
    const clickPct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const clickTime = clickPct * videoDuration;
    
    const distStart = Math.abs(clickTime - rangeStart);
    const distEnd = Math.abs(clickTime - rangeEnd);
    
    if (distStart < distEnd) {
      isDragging = "start";
      rangeStart = clickTime;
    } else {
      isDragging = "end";
      rangeEnd = clickTime;
    }
    updateSliderUI();
    seekTo(isDragging);
  });

  if (track) {
    track.addEventListener("mousedown", (e) => {
      if (videoDuration <= 0) return;
      const rect = track.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const video = document.getElementById("previewVideo");
      if (video && video.src) {
        video.currentTime = pct * videoDuration;
        updatePlayhead();
      }
    });
  }

  if (ruler) {
    ruler.addEventListener("mousedown", (e) => {
      if (videoDuration <= 0) return;
      const rect = ruler.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const video = document.getElementById("previewVideo");
      if (video && video.src) {
        video.currentTime = pct * videoDuration;
        updatePlayhead();
      }
    });
  }
  
  window.addEventListener("mousemove", (e) => {
    if (!isDragging || videoDuration <= 0) return;
    const rect = slider.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const time = pct * videoDuration;
    
    if (isDragging === "start") {
      rangeStart = Math.min(time, rangeEnd - 1);
      seekTo("start");
    } else {
      rangeEnd = Math.max(time, rangeStart + 1);
      seekTo("end");
    }
    updateSliderUI();
  });
  
  window.addEventListener("mouseup", () => {
    isDragging = null;
  });
}

function updateTimelineRuler() {
  const ruler = document.getElementById("timelineRuler");
  if (!ruler) return;
  ruler.innerHTML = "";
  if (videoDuration <= 0) return;

  const rect = ruler.getBoundingClientRect();
  const width = rect.width || 600;
  const maxTicks = 12;
  let step = 1;
  while (videoDuration / step > maxTicks) {
    if (step === 1) step = 5;
    else if (step === 5) step = 10;
    else step *= 2;
  }

  for (let t = 0; t <= videoDuration; t += step) {
    const pct = (t / videoDuration) * 100;
    const tick = document.createElement("div");
    tick.className = "timeline-ruler-tick major";
    tick.style.left = `${pct}%`;
    const label = document.createElement("span");
    label.className = "timeline-ruler-label";
    label.textContent = formatTime(t);
    tick.appendChild(label);
    ruler.appendChild(tick);
  }
}

function updatePlayhead() {
  const video = document.getElementById("previewVideo");
  const playhead = document.getElementById("timelinePlayhead");
  if (!video || !playhead || videoDuration <= 0 || !video.src) return;
  const pct = (video.currentTime / videoDuration) * 100;
  playhead.style.display = "block";
  playhead.style.left = `${pct}%`;
}

function seekToTime(pct) {
  const video = document.getElementById("previewVideo");
  if (!video || !video.src || videoDuration <= 0) return;
  video.currentTime = pct * videoDuration;
  updatePlayhead();
}

function seekTo(pos) {
  const video = document.getElementById("previewVideo");
  if (!video.src) return;
  video.currentTime = pos === "start" ? rangeStart : rangeEnd;
}

function togglePlay() {
  const video = document.getElementById("previewVideo");
  const btn = document.getElementById("playPauseBtn");
  if (!video.src) return;
  
  if (video.paused) {
    video.play();
    btn.textContent = "⏸ Pause";
  } else {
    video.pause();
    btn.textContent = "▶ Play";
  }
}

let fcHandle = null;

// Update play button state when video ends or pauses
document.addEventListener("DOMContentLoaded", () => {
  initSlider();
  initFacecamOverlay();
  
  // Initialize font preview with capcut defaults.
  updateFontPreview();
  
  // Update preview live when user changes font controls.
  ["captionFont", "captionSize", "captionBaseColor", "captionHlColor", "captionOutlineColor"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", updateFontPreview);
  });

  // Initial portrait preview sync
  updatePortraitPreview();
  initPortraitCanvas();

  // Initial facecam overlay sync
  const layout = document.getElementById('clipLayout').value;
  if (layout === 'gaming') {
    document.getElementById('facecamOverlay').style.display = 'block';
    syncOverlayToCustom();
  }

  const video = document.getElementById("previewVideo");
  const portrait = document.getElementById("portraitVideo");
  const facecamVideo = document.getElementById("portraitFacecamVideo");
  video.addEventListener("pause", () => {
    document.getElementById("playPauseBtn").textContent = "▶ Play";
    if (portrait) portrait.pause();
    if (facecamVideo) facecamVideo.pause();
  });
  video.addEventListener("play", () => {
    document.getElementById("playPauseBtn").textContent = "⏸ Pause";
    if (portrait) {
      portrait.currentTime = video.currentTime;
      portrait.play();
    }
    if (facecamVideo) {
      facecamVideo.currentTime = video.currentTime;
      facecamVideo.play();
    }
  });
  video.addEventListener("seeked", () => {
    if (portrait) portrait.currentTime = video.currentTime;
    if (facecamVideo) facecamVideo.currentTime = video.currentTime;
  });
  video.addEventListener("timeupdate", () => {
    // Loop within range
    if (video.currentTime >= rangeEnd && !video.paused) {
      video.currentTime = rangeStart;
    }
  });
});

const STT_PROVIDERS = [
  { id: "groq", name: "Groq", desc: "Free & fast" },
  { id: "openai", name: "OpenAI", desc: "whisper-1 model" },
  { id: "assemblyai", name: "AssemblyAI", desc: "Best accuracy, 5GB limit" },
  { id: "custom", name: "Custom", desc: "Any OpenAI-compatible" },
];

const LLM_PROVIDERS = [
  { id: "groq", name: "Groq", desc: "Free & fast" },
  { id: "openai", name: "OpenAI", desc: "GPT-4o" },
  { id: "openrouter", name: "OpenRouter", desc: "Many models" },
  { id: "ollama", name: "Ollama", desc: "Local models" },
  { id: "custom", name: "Custom", desc: "Any OpenAI-compatible" },
];

const PRESETS = {
  stt: {
    groq:       { baseUrl: "https://api.groq.com/openai/v1", model: "whisper-large-v3" },
    openai:     { baseUrl: "https://api.openai.com/v1",       model: "whisper-1" },
    assemblyai: { baseUrl: "https://api.assemblyai.com",      model: "best" },
    custom:     { baseUrl: "", model: "" },
  },
  llm: {
    groq:      { baseUrl: "https://api.groq.com/openai/v1",  model: "llama-3.3-70b-versatile" },
    openai:    { baseUrl: "https://api.openai.com/v1",        model: "gpt-4o" },
    openrouter:{ baseUrl: "https://openrouter.ai/api/v1",    model: "anthropic/claude-sonnet-4" },
    ollama:    { baseUrl: "http://localhost:11434/v1",        model: "llama3" },
    custom:    { baseUrl: "", model: "" },
  },
};

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  settings = await window.api.getSettings();

  buildProviderCards("sttProviders", STT_PROVIDERS, "stt");
  buildProviderCards("llmProviders", LLM_PROVIDERS, "llm");

  loadSettingsToUI();
  window.api.onProgress(handleProgress);
}

// ── Provider cards ────────────────────────────────────────────────────────────
function buildProviderCards(containerId, providers, type) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";
  providers.forEach((p) => {
    const card = document.createElement("div");
    card.className = "provider-card";
    card.dataset.id = p.id;
    card.dataset.type = type;
    card.innerHTML = `<div class="p-name">${p.name}</div><div class="p-desc">${p.desc}</div>`;
    card.onclick = () => selectProvider(type, p.id);
    container.appendChild(card);
  });
}

function selectProvider(type, id) {
  // Update card selection
  document.querySelectorAll(`[data-type="${type}"]`).forEach((c) => c.classList.remove("selected"));
  document.querySelector(`[data-type="${type}"][data-id="${id}"]`).classList.add("selected");

  // Apply preset
  const p = PRESETS[type][id];
  if (p) {
    document.getElementById(`${type}BaseUrl`).value = p.baseUrl;
    document.getElementById(`${type}Model`).value = p.model;
  }
}

// ── Load / Save ───────────────────────────────────────────────────────────────
function loadSettingsToUI() {
  const s = settings.stt || {};
  const l = settings.llm || {};

  selectProvider("stt", s.preset || "groq");
  document.getElementById("sttBaseUrl").value = s.baseUrl || PRESETS.stt.groq.baseUrl;
  document.getElementById("sttApiKey").value = s.apiKey || "";
  document.getElementById("sttModel").value = s.model || PRESETS.stt.groq.model;

  selectProvider("llm", l.preset || "groq");
  document.getElementById("llmBaseUrl").value = l.baseUrl || PRESETS.llm.groq.baseUrl;
  document.getElementById("llmApiKey").value = l.apiKey || "";
  document.getElementById("llmModel").value = l.model || PRESETS.llm.groq.model;

  document.getElementById("outputDir").value = settings.outputDir || "";
}

async function saveSettings() {
  settings = {
    stt: {
      preset: document.querySelector("[data-type='stt'].selected")?.dataset.id || "groq",
      baseUrl: document.getElementById("sttBaseUrl").value,
      apiKey: document.getElementById("sttApiKey").value,
      model: document.getElementById("sttModel").value,
    },
    llm: {
      preset: document.querySelector("[data-type='llm'].selected")?.dataset.id || "groq",
      baseUrl: document.getElementById("llmBaseUrl").value,
      apiKey: document.getElementById("llmApiKey").value,
      model: document.getElementById("llmModel").value,
    },
    outputDir: document.getElementById("outputDir").value,
  };
  await window.api.saveSettings(settings);
  // Brief flash feedback
  const btn = document.querySelector("#panel-settings .btn-primary");
  btn.textContent = "✓ Saved";
  setTimeout(() => (btn.textContent = "💾 Save Settings"), 1500);
}

// ── Caption template & Layout cards ───────────────────────────────────────
function selectTemplate(val) {
  const grid = document.getElementById('captionTemplateGrid');
  const current = grid.querySelector('.template-card.selected');
  if (current && current.dataset.val === val) {
    current.classList.remove('selected');
    document.getElementById('captionTemplate').value = '';
    return;
  }
  grid.querySelectorAll('.template-card').forEach(c => c.classList.remove('selected'));
  grid.querySelector(`[data-val="${val}"]`).classList.add('selected');
  document.getElementById('captionTemplate').value = val;

  // Sync font controls to the template's defaults.
  const d = TEMPLATE_FONT_DEFAULTS[val];
  if (d) {
    document.getElementById('captionFont').value = d.font;
    document.getElementById('captionSize').value = d.size;
    document.getElementById('captionBaseColor').value = d.base;
    document.getElementById('captionHlColor').value = d.hl;
    document.getElementById('captionOutlineColor').value = d.outline;
    updateFontPreview();
  }
}

function updateFontPreview() {
  const font = document.getElementById('captionFont').value;
  const size = parseInt(document.getElementById('captionSize').value) || 56;
  const base = document.getElementById('captionBaseColor').value;
  const hl = document.getElementById('captionHlColor').value;
  const outline = document.getElementById('captionOutlineColor').value;
  const preview = document.getElementById('fontPreview');
  if (!preview) return;
  preview.style.fontFamily = `"${font}", sans-serif`;
  // Scale the 22px preview proportionally to the chosen render size (56 = baseline).
  preview.style.fontSize = Math.round(22 * (size / 56)) + 'px';
  preview.querySelectorAll('.fp-dim').forEach(el => {
    el.style.color = base;
    el.style.textShadow = `0 0 2px ${outline}, 1px 1px 0 ${outline}`;
  });
  const pop = preview.querySelector('.fp-pop');
  if (pop) {
    pop.style.color = hl;
    pop.style.textShadow = `0 0 8px ${hl}, 1px 1px 0 ${outline}`;
  }
  updatePortraitPreview();
}

function selectLayout(val) {
  const grid = document.getElementById('clipLayoutGrid');
  const current = grid.querySelector('.layout-card.selected');
  if (current && current.dataset.val === val) {
    current.classList.remove('selected');
    document.getElementById('clipLayout').value = '';
    document.getElementById('facecamOverlay').style.display = 'none';
    updatePortraitPreview();
    return;
  }
  grid.querySelectorAll('.layout-card').forEach(c => c.classList.remove('selected'));
  grid.querySelector(`[data-val="${val}"]`).classList.add('selected');
  document.getElementById('clipLayout').value = val;

  // Show facecam overlay on source preview when gaming layout is selected
  const overlay = document.getElementById('facecamOverlay');
  if (val === 'gaming') {
    overlay.style.display = 'block';
    syncOverlayToCustom();
  } else {
    overlay.style.display = 'none';
  }
  updatePortraitPreview();
}

function updatePortraitPreview() {
  const layout = document.getElementById('clipLayout').value;
  const facecamCustom = document.getElementById('facecamCustom').value;
  const facecam = document.getElementById('portraitFacecam');
  const caption = document.getElementById('portraitCaption');
  if (!facecam || !caption) return;

  // Always apply screen layout (the main video layer)
  applyPortraitScreenLayout();

  // Show facecam only if layout is gaming
  facecam.style.display = layout === 'gaming' ? 'block' : 'none';

  // Position facecam using portraitFcLayout
  if (layout === 'gaming') {
    const parts = facecamCustom.split(',');
    if (parts.length === 4) {
      const [x, y, w, h] = parts.map(Number);
      applyPortraitFcLayout();

      // Update facecam video crop to match the source crop box
      const fcVideo = document.getElementById('portraitFacecamVideo');
      if (fcVideo) {
        fcVideo.style.width = `${(1 / w) * 100}%`;
        fcVideo.style.height = `${(1 / h) * 100}%`;
        fcVideo.style.left = `${(-x / w) * 100}%`;
        fcVideo.style.top = `${(-y / h) * 100}%`;
      }
    }
  }

  // Sync caption style from the customizer
  const font = document.getElementById('captionFont').value;
  const size = document.getElementById('captionSize').value;
  const base = document.getElementById('captionBaseColor').value;
  const hl = document.getElementById('captionHlColor').value;
  const outline = document.getElementById('captionOutlineColor').value;

  caption.style.fontFamily = `"${font}", sans-serif`;
  caption.style.fontSize = Math.round(10 * (size / 56)) + 'px';
  caption.style.color = base;
  caption.style.textShadow = `1px 1px 0 ${outline}, -1px -1px 0 ${outline}, 1px -1px 0 ${outline}, -1px 1px 0 ${outline}`;
}

function applyPortraitScreenLayout() {
  const screen = document.getElementById('portraitScreen');
  const frame = document.getElementById('portraitFrame');
  if (!screen || !frame) return;
  const raw = document.getElementById('portraitScreenLayout').value;
  const parts = raw.split(',').map(Number);
  if (parts.length < 4) return;
  const [px, py, pw, ph] = parts;
  screen.style.left = `${px * 100}%`;
  screen.style.top = `${py * 100}%`;
  screen.style.width = `${pw * 100}%`;
  screen.style.height = `${ph * 100}%`;
  screen.style.right = 'auto';
  screen.style.bottom = 'auto';
  screen.style.transform = 'none';
}

function savePortraitScreenLayout() {
  const screen = document.getElementById('portraitScreen');
  const frame = document.getElementById('portraitFrame');
  if (!screen || !frame) return;
  const fr = frame.getBoundingClientRect();
  const sc = screen.getBoundingClientRect();
  const px = (sc.left - fr.left) / fr.width;
  const py = (sc.top - fr.top) / fr.height;
  const pw = sc.width / fr.width;
  const ph = sc.height / fr.height;
  document.getElementById('portraitScreenLayout').value =
    `${px.toFixed(4)},${py.toFixed(4)},${pw.toFixed(4)},${ph.toFixed(4)}`;
}

function applyPortraitFcLayout() {
  const facecam = document.getElementById('portraitFacecam');
  const frame = document.getElementById('portraitFrame');
  if (!facecam || !frame) return;
  const raw = document.getElementById('portraitFcLayout').value;
  const parts = raw.split(',').map(Number);
  if (parts.length < 3) return;
  const [px, py, pw] = parts;

  // Container aspect ratio is ALWAYS derived from the current facecam crop
  // (source 16:9 × crop fractions). User-controlled values are position (px,py)
  // and width (pw); height is derived so the container never distorts the video.
  const facecamCustom = document.getElementById('facecamCustom').value.split(',').map(Number);
  const [, , w, h] = facecamCustom;
  const cropW = w > 0 ? w : 0.28;
  const cropH = h > 0 ? h : 0.28;

  facecam.style.left = `${px * 100}%`;
  facecam.style.top = `${py * 100}%`;
  facecam.style.width = `${pw * 100}%`;
  facecam.style.height = 'auto';
  facecam.style.aspectRatio = `${16 * cropW} / ${9 * cropH}`;
  facecam.style.right = 'auto';
  facecam.style.bottom = 'auto';
  facecam.style.transform = 'none';
}

function savePortraitFcLayout() {
  const facecam = document.getElementById('portraitFacecam');
  const frame = document.getElementById('portraitFrame');
  if (!facecam || !frame) return;
  const fr = frame.getBoundingClientRect();
  const fc = facecam.getBoundingClientRect();
  const px = (fc.left - fr.left) / fr.width;
  const py = (fc.top - fr.top) / fr.height;
  const pw = fc.width / fr.width;
  const ph = fc.height / fr.height;
  document.getElementById('portraitFcLayout').value =
    `${px.toFixed(4)},${py.toFixed(4)},${pw.toFixed(4)},${ph.toFixed(4)}`;
}

// ── Portrait canvas drag/resize ───────────────────────────────────────────────
let ptAction = null; // { layer: 'screen'|'fc', action: 'move'|'tl'|'tr'|'bl'|'br' }
let ptStart = { x: 0, y: 0 };
let ptRect = { x: 0, y: 0, w: 0, h: 0, fw: 0, fh: 0 };
const MIN_PT_PCT = 0.05;

function initPortraitCanvas() {
  const facecam = document.getElementById('portraitFacecam');
  const screen = document.getElementById('portraitScreen');
  const frame = document.getElementById('portraitFrame');
  if (!frame) return;

  // Unified handler for both layers
  const onMouseDown = (e, element, layer) => {
    const target = e.target;
    const ptAttr = target.dataset.pt;
    if (!ptAttr) return;
    e.preventDefault();
    e.stopPropagation();

    // ptAttr format: "layer-action" e.g. "fc-tl", "screen-move"
    const parts = ptAttr.split('-');
    if (parts.length < 2) return;
    const action = parts[1]; // 'tl', 'tr', 'bl', 'br', 'move'

    const fr = frame.getBoundingClientRect();
    const elRect = element.getBoundingClientRect();
    ptRect = {
      x: elRect.left - fr.left,
      y: elRect.top - fr.top,
      w: elRect.width,
      h: elRect.height,
      fw: fr.width,
      fh: fr.height,
      aspect: elRect.width / (elRect.height || 1),
    };
    ptStart = { x: e.clientX, y: e.clientY };
    ptAction = { layer, action };
  };

  if (facecam) facecam.addEventListener('mousedown', (e) => onMouseDown(e, facecam, 'fc'));
  if (screen) screen.addEventListener('mousedown', (e) => onMouseDown(e, screen, 'screen'));

  window.addEventListener('mousemove', (e) => {
    if (!ptAction) return;
    const fr = frame.getBoundingClientRect();
    const dx = e.clientX - ptStart.x;
    const dy = e.clientY - ptStart.y;
    let { x, y, w, h, fw, fh } = ptRect;
    const minPx = MIN_PT_PCT * Math.min(fw, fh);
    const { layer, action } = ptAction;
    const element = layer === 'fc' ? facecam : screen;

    if (action === 'move') {
      x += dx; y += dy;
      x = Math.max(-w * 0.5, Math.min(x, fw - w * 0.5));
      y = Math.max(-h * 0.5, Math.min(y, fh - h * 0.5));
    } else {
      // Aspect-ratio-locked resize: use dx to drive width, derive height
      let newW = w;
      if (action === 'br' || action === 'tr') {
        newW = w + dx;
      } else {
        newW = w - dx;
      }
      if (newW < minPx) newW = minPx;
      let newH = newW / ptRect.aspect;
      if (newH < minPx) { newH = minPx; newW = newH * ptRect.aspect; }

      if (action === 'tr') {
        y += (h - newH);
      } else if (action === 'bl') {
        x += (w - newW);
      } else if (action === 'tl') {
        x += (w - newW);
        y += (h - newH);
      }
      w = newW;
      h = newH;
    }

    if (w < minPx) w = minPx;
    if (h < minPx) h = minPx;
    w = Math.min(w, fw * 2);
    h = Math.min(h, fh * 2);

    element.style.left = `${(x / fw) * 100}%`;
    element.style.top = `${(y / fh) * 100}%`;
    element.style.width = `${(w / fw) * 100}%`;
    element.style.height = `${(h / fh) * 100}%`;
    element.style.aspectRatio = 'auto';

    if (layer === 'fc') {
      savePortraitFcLayout();
    } else {
      savePortraitScreenLayout();
    }
  });

  window.addEventListener('mouseup', () => { ptAction = null; });
}

function selectFacecam(val) {
  const grid = document.getElementById('facecamGrid');
  grid.querySelectorAll('.facecam-card').forEach(c => c.classList.remove('selected'));
  grid.querySelector(`[data-val="${val}"]`).classList.add('selected');
  document.getElementById('facecamPos').value = val;

  const overlay = document.getElementById('facecamOverlay');
  const layout = document.getElementById('clipLayout').value;
  
  // Show overlay only if layout is gaming
  if (layout === 'gaming') {
    overlay.style.display = 'block';
    if (val === 'custom') {
      syncOverlayToCustom();
    } else {
      presetFacecamToCustom(val);
      syncOverlayToCustom();
    }
  } else {
    overlay.style.display = 'none';
  }
  updatePortraitPreview();
}

// ── Facecam drag/resize overlay ───────────────────────────────────────────────
let fcAction = null; // 'move' | 'resize' | null
let fcStart = { x: 0, y: 0 };
let fcRect = { x: 0, y: 0, w: 0, h: 0 };
const MIN_FC_PCT = 0.05;

function getWrapRect() {
  return document.getElementById('previewWrap').getBoundingClientRect();
}

function presetFacecamToCustom(val) {
  const presets = {
    'top-left': '0.02,0.02,0.25,0.25',
    'top-center': '0.375,0.02,0.25,0.25',
    'top-right': '0.73,0.02,0.25,0.25',
    'bottom-left': '0.02,0.73,0.25,0.25',
    'bottom-right': '0.73,0.73,0.25,0.25',
  };
  document.getElementById('facecamCustom').value = presets[val] || presets['top-right'];
  if (document.getElementById('facecamPos').value === 'custom') {
    syncOverlayToCustom();
  }
}

function syncOverlayToCustom() {
  const [x, y, w, h] = document.getElementById('facecamCustom').value.split(',').map(Number);
  const wrap = getWrapRect();
  const overlay = document.getElementById('facecamOverlay');
  overlay.style.left = `${x * wrap.width}px`;
  overlay.style.top = `${y * wrap.height}px`;
  overlay.style.width = `${w * wrap.width}px`;
  overlay.style.height = `${h * wrap.height}px`;
}

function updateCustomFromOverlay() {
  const wrap = getWrapRect();
  const overlay = document.getElementById('facecamOverlay');
  const x = parseFloat(overlay.style.left) / wrap.width;
  const y = parseFloat(overlay.style.top) / wrap.height;
  const w = parseFloat(overlay.style.width) / wrap.width;
  const h = parseFloat(overlay.style.height) / wrap.height;
  document.getElementById('facecamCustom').value = `${x.toFixed(4)},${y.toFixed(4)},${w.toFixed(4)},${h.toFixed(4)}`;
  updatePortraitPreview();
}

function initFacecamOverlay() {
  const overlay = document.getElementById('facecamOverlay');

  overlay.addEventListener('mousedown', (e) => {
    const target = e.target;
    if (!target.classList.contains('fc-handle')) {
      fcAction = 'move';
    } else if (target.classList.contains('fc-move')) {
      fcAction = 'move';
    } else {
      fcAction = 'resize';
      fcHandle = target;
    }

    // Switch to custom so portrait preview follows drag in real-time
    if (document.getElementById('facecamPos').value !== 'custom') {
      document.getElementById('facecamPos').value = 'custom';
      const grid = document.getElementById('facecamGrid');
      grid.querySelectorAll('.facecam-card').forEach(c => c.classList.remove('selected'));
      grid.querySelector(`[data-val="custom"]`).classList.add('selected');
    }

    fcStart = { x: e.clientX, y: e.clientY };
    const wrap = getWrapRect();
    const r = overlay.getBoundingClientRect();
    fcRect = {
      x: r.left - wrap.left,
      y: r.top - wrap.top,
      w: r.width,
      h: r.height,
    };
    e.preventDefault();
    e.stopPropagation();
  });

  window.addEventListener('mousemove', (e) => {
    if (!fcAction) return;
    const wrap = getWrapRect();
    const dx = e.clientX - fcStart.x;
    const dy = e.clientY - fcStart.y;
    let { x, y, w, h } = fcRect;

    if (fcAction === 'move') {
      x += dx;
      y += dy;
      // Clamp to wrap
      x = Math.max(0, Math.min(x, wrap.width - w));
      y = Math.max(0, Math.min(y, wrap.height - h));
    } else {
      const handle = fcHandle;
      if (handle.classList.contains('fc-br')) {
        w += dx; h += dy;
      } else if (handle.classList.contains('fc-tr')) {
        w += dx; h -= dy; y += dy;
      } else if (handle.classList.contains('fc-bl')) {
        w -= dx; h += dy; x += dx;
      } else if (handle.classList.contains('fc-tl')) {
        w -= dx; h -= dy; x += dx; y += dy;
      }
      // Min size
      const minPx = MIN_FC_PCT * Math.min(wrap.width, wrap.height);
      if (w < minPx) { w = minPx; }
      if (h < minPx) { h = minPx; }
      // Clamp
      x = Math.max(0, Math.min(x, wrap.width - w));
      y = Math.max(0, Math.min(y, wrap.height - h));
      w = Math.min(w, wrap.width - x);
      h = Math.min(h, wrap.height - y);
    }

    overlay.style.left = `${x}px`;
    overlay.style.top = `${y}px`;
    overlay.style.width = `${w}px`;
    overlay.style.height = `${h}px`;
    updateCustomFromOverlay();
  });

  window.addEventListener('mouseup', () => {
    fcAction = null;
    fcHandle = null;
  });

  window.addEventListener('resize', () => {
    if (document.getElementById('facecamPos').value === 'custom') {
      syncOverlayToCustom();
    }
  });
}

// ── Panel navigation ─────────────────────────────────────────────────────────
function switchPanel(name) {
  document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach((n) => n.classList.remove("active"));
  document.getElementById(`panel-${name}`).classList.add("active");
  document.querySelector(`.nav-item:nth-child(${name === "create" ? 1 : name === "settings" ? 2 : 3})`).classList.add("active");
}

// ── Browse ───────────────────────────────────────────────────────────────────
async function browseFolder() {
  const folder = await window.api.pickFolder();
  if (folder) document.getElementById("outputDir").value = folder;
}

// ── Run clipper ───────────────────────────────────────────────────────────────
async function runClipper() {
  const url = document.getElementById("url").value.trim();
  const localPath = document.getElementById("localPath").value.trim();
  const numClips = parseInt(document.getElementById("numClips").value);
  const outputDir = document.getElementById("outputDir").value.trim();
  const template = document.getElementById("captionTemplate").value;
  const layout = document.getElementById("clipLayout").value;
  const facecamPos = document.getElementById("facecamPos").value;
  const facecamCustom = document.getElementById("facecamCustom").value;
  const portraitScreenLayout = document.getElementById("portraitScreenLayout").value;
  const portraitFcLayout = document.getElementById("portraitFcLayout").value;
  const portraitBgPan = document.getElementById("portraitBgPan").value;
  const captionFont = document.getElementById("captionFont").value;
  const captionSize = document.getElementById("captionSize").value;
  const captionBaseColor = document.getElementById("captionBaseColor").value;
  const captionHlColor = document.getElementById("captionHlColor").value;
  const captionOutlineColor = document.getElementById("captionOutlineColor").value;
  const clipFps = document.getElementById("clipFps").value;
  const clipBitrate = document.getElementById("clipBitrate").value;
  const maxClipDuration = document.getElementById("maxClipDuration").value;

  const stt = {
    baseUrl: document.getElementById("sttBaseUrl").value.trim(),
    apiKey: document.getElementById("sttApiKey").value.trim(),
    model: document.getElementById("sttModel").value.trim(),
  };
  const llm = {
    baseUrl: document.getElementById("llmBaseUrl").value.trim(),
    apiKey: document.getElementById("llmApiKey").value.trim(),
    model: document.getElementById("llmModel").value.trim(),
  };

  const local = sourceMode === "local";
  if (local && !localPath) { alert("Pick a local file"); return; }
  if (!local && !url) { alert("Enter a YouTube URL"); return; }
  if (!stt.apiKey) { alert("Set your STT API key in Settings"); return; }
  if (!llm.apiKey) { alert("Set your LLM API key in Settings"); return; }

  // Reset progress UI
  document.getElementById("progressContainer").style.display = "block";
  document.getElementById("logList").innerHTML = "";
  document.getElementById("outputGrid").innerHTML = "";
  document.getElementById("progressBar").style.width = "0%";
  setStep("download");

  document.getElementById("runBtn").disabled = true;
  document.getElementById("stopBtn").style.display = "";

  try {
    await window.api.runClipper({
      url, localPath, local, numClips, outputDir, stt, llm,
      startTime: rangeStart,
      endTime: rangeEnd,
      template,
      layout,
      facecamPos,
      facecamCustom,
      portraitScreenLayout,
      portraitFcLayout,
      portraitBgPan,
      captionFont,
      captionSize,
      captionBaseColor,
      captionHlColor,
      captionOutlineColor,
      clipFps,
      clipBitrate,
      maxClipDuration,
    });
  } catch (e) {
    log("Error: " + e.message, "err");
  } finally {
    document.getElementById("runBtn").disabled = false;
    document.getElementById("stopBtn").style.display = "none";
  }
}

async function stopClipper() {
  await window.api.stopClipper();
  log("Stopped by user", "err");
  document.getElementById("stopBtn").style.display = "none";
  document.getElementById("runBtn").disabled = false;
}

// ── Progress ─────────────────────────────────────────────────────────────────
function setStep(name) {
  const steps = ["download", "transcribe", "analyze", "render"];
  const idx = steps.indexOf(name);
  steps.forEach((s, i) => {
    const el = document.getElementById(`step-${s}`);
    el.classList.remove("active", "done");
    if (i < idx) el.classList.add("done");
    if (i === idx) el.classList.add("active");
  });
  const pct = ((idx + 1) / steps.length) * 100;
  document.getElementById("progressBar").style.width = pct + "%";
}

function log(msg, cls = "") {
  const div = document.createElement("div");
  div.className = `log-line ${cls}`;
  div.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  const list = document.getElementById("logList");
  list.appendChild(div);
  list.scrollTop = list.scrollHeight;
}

function handleProgress(data) {
  if (data.stage === "error") {
    log(data.msg, "err");
    setStep("");
  } else if (data.stage === "done") {
    log("✓ All clips ready!", "ok");
    setStep("render");
    document.getElementById("progressBar").style.width = "100%";
    if (data.outputs) {
      renderClips(data.outputs);
    }
    // Load video preview for YouTube after download completes
    if (data.video_path && sourceMode === "youtube") {
      loadPreview(data.video_path);
    }
  } else {
    log(data.msg, data.stage === "done" ? "ok" : "");
    if (data.stage === "transcribe") setStep("transcribe");
    if (data.stage === "analyze") setStep("analyze");
    if (data.stage === "render") setStep("render");
    if (data.progress) {
      document.getElementById("progressBar").style.width = data.progress + "%";
    }
    // Load preview when download finishes (YouTube gets video_path here)
    if (data.video_path && sourceMode === "youtube") {
      loadPreview(data.video_path);
      const previewBox = document.getElementById("previewBox");
      const workspaceEmpty = document.getElementById("workspaceEmpty");
      if (previewBox) previewBox.classList.add("active");
      if (workspaceEmpty) workspaceEmpty.style.display = "none";
    }
  }
}

function renderClips(outputs) {
  const grid = document.getElementById("outputGrid");
  grid.innerHTML = "";
  outputs.forEach((out) => {
    const name = out.split(/[/\\]/).pop();
    const card = document.createElement("div");
    card.className = "clip-card";
    card.innerHTML = `
      <div class="clip-thumb">🎬</div>
      <div class="clip-info">
        <div class="clip-title">${name}</div>
        <div class="clip-meta">${name.split("_").slice(1).join(" ").replace(".mp4", "")}</div>
      </div>`;
    card.onclick = () => window.api.openFolder(out.replace(/[/\\][^/\\]+$/, ""));
    grid.appendChild(card);
  });
}

init();
