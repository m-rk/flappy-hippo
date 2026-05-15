const SCRIPT_BASE_URL =
  typeof document !== "undefined" && document.currentScript
    ? new URL(".", document.currentScript.src)
    : null;

function assetUrl(path) {
  return SCRIPT_BASE_URL ? new URL(path, SCRIPT_BASE_URL).toString() : path;
}

const WORLD_W = 390;
const WORLD_H = 640;
const GROUND_H = 86;
const GROUND_Y = WORLD_H - GROUND_H;

const FRAME_COUNT = 29;
const SPRITE_SOURCE_W = 189;
const SPRITE_SOURCE_H = 139;
const SPRITE_ANCHOR_SOURCE_X = 71;
const SPRITE_ANCHOR_SOURCE_Y = 62;
const PLAYER_BASE_W = 92;
const PLAYER_BASE_H = PLAYER_BASE_W * (SPRITE_SOURCE_H / SPRITE_SOURCE_W);
const PLAYER_ANCHOR_X = PLAYER_BASE_W * (SPRITE_ANCHOR_SOURCE_X / SPRITE_SOURCE_W);
const PLAYER_ANCHOR_Y = PLAYER_BASE_H * (SPRITE_ANCHOR_SOURCE_Y / SPRITE_SOURCE_H);
const PLAYER_HIT_W = 62;
const PLAYER_HIT_H = 42;
const PLAYER_GROUND_RADIUS = 34;

const FACE_SOURCE_W = 108;
const FACE_SOURCE_H = 102;
const FACE_W = 52;
const FACE_H = FACE_W * (FACE_SOURCE_H / FACE_SOURCE_W);
const MYSTERY_BLOCK_SIZE = 44;
const MYSTERY_BLOCK_CHANCE = 0.16;
const MYSTERY_BLOCK_MIN_SCORE = 2;

const PLAYER_VELOCITY_MULT = 1.5;
const JUMP_SIZE_PENALTY = 0.45;
const GROWTH_BASE = 0.1;
const GROWTH_FALLOFF = 0.6;
const PIPE_GAP_MULT = 1.5;
const BASE_SPEED = 2.08;
const PIPE_W = 62;
const PIPE_LIP_H = 30;
const READY_PLAYER_Y = 318;
const MUSIC_SRC = assetUrl("assets/audio/mario-fart.mp3");
const MUSIC_VOLUME = 0.32;
const SOUND_EFFECTS = {
  jump: { src: assetUrl("assets/audio/candidates/jump-drop-001.wav"), volume: 0.68 },
  collect: { src: assetUrl("assets/audio/candidates/collect-select-006.wav"), volume: 0.58 },
  collectMilestone: { src: assetUrl("assets/audio/candidates/collect-confirmation-002.wav"), volume: 0.66 },
  crash: { src: assetUrl("assets/audio/candidates/crash-gameover-greyfrog.mp3"), volume: 0.8 },
  start: { src: assetUrl("assets/audio/candidates/ui-start-toggle-001.wav"), volume: 0.56 }
};
const SFX_POOL_SIZE = { jump: 3, collect: 2, collectMilestone: 2, crash: 2, start: 2 };
const SFX_LITE_INTERVALS = { jump: 140, collect: 90, collectMilestone: 0, crash: 0, start: 0 };
const SFX_START_WAIT_MS = 1600;
const MOBILE_FRAME_RATE = 30;
const DESKTOP_FRAME_RATE = 60;
const MOBILE_PARTICLE_CAP = 70;
const DESKTOP_PARTICLE_CAP = 160;
const CLOUD_SPRITE_W = 172;
const CLOUD_SPRITE_H = 82;
const CLOUD_ORIGIN_X = 74;
const CLOUD_ORIGIN_Y = 28;
const TROUBLESHOOT_STORAGE_KEY = "flappy-hippo-troubleshoot-session";
const OPTIONS_BUTTON = { x: WORLD_W - 52, y: 24, w: 36, h: 32 };
const OPTIONS_PANEL = { x: 20, y: 184, w: 350, h: 386 };
const OPTION_ROWS = [
  { key: "sixtyFps", label: "60 FPS" },
  { key: "sharpCanvas", label: "sharp canvas" },
  { key: "clouds", label: "clouds" },
  { key: "ground", label: "ground detail" },
  { key: "jumpSparkles", label: "jump sparkles" },
  { key: "collectionEffects", label: "collect popups" },
  { key: "mysteryBlocks", label: "??? blocks" },
  { key: "deathPieces", label: "death burst" },
  { key: "playerAnimation", label: "hippo animation" },
  { key: "music", label: "music" },
  { key: "soundEffects", label: "sound effects" },
  { key: "sfxLite", label: "SFX lite" }
];
const DEFAULT_TROUBLESHOOT_OPTIONS = {
  sixtyFps: true,
  sharpCanvas: true,
  clouds: true,
  ground: true,
  jumpSparkles: true,
  collectionEffects: true,
  mysteryBlocks: false,
  deathPieces: true,
  playerAnimation: true,
  music: true,
  soundEffects: true,
  sfxLite: false
};
const RGB = {
  mint: [236, 248, 213],
  yellow: [255, 239, 87],
  pink: [255, 119, 194],
  green: [64, 196, 70],
  gray: [91, 92, 95],
  white: [255, 255, 255],
  black: [0, 0, 0]
};

let fitScale = 1;
let fitX = 0;
let fitY = 0;
let viewLeft = 0;
let viewRight = WORLD_W;
let viewTop = 0;
let viewBottom = WORLD_H;
let hippoFrames = [];
let faceImg;
let faceOutlineImg;
let cloudSprite;
let musicTrack = null;
let musicStarted = false;
let audioContext = null;
let sfxMasterGain = null;
let sfxBuffers = {};
let sfxBufferPromises = {};
let sfxPreloadStarted = false;
let sfxBackend = "none";
let sfxTracks = {};
let sfxCursors = {};
let lastSfxTimes = {};
let clouds = [];
let obstacles = [];
let particles = [];
let collectionEffects = [];
let deathEffect = null;
let deathPieces = [];
let playerFlipMode = "none";
let player;
let state = "ready";
let score = 0;
let bestScore = 0;
let spawnTimer = 0;
let groundOffset = 0;
let cloudOffset = 0;
let lowerCloudOffset = 0;
let crashCooldown = 0;
let crashUiFrame = 0;
let lastActionFrame = -99;
let performanceMode = false;
let targetFrameRate = DESKTOP_FRAME_RATE;
let targetFrameMs = 1000 / DESKTOP_FRAME_RATE;
let frameLoad = 1;
let animationClock = 0;
let buildStamp = "";
let optionsPanelOpen = false;
let lastPointerFrame = -99;
let troubleshootOptions = { ...DEFAULT_TROUBLESHOOT_OPTIONS };
let pendingStartAfterSfx = false;
let pendingStartToken = 0;

function preload() {
  for (let i = 1; i <= FRAME_COUNT; i += 1) {
    const id = String(i).padStart(3, "0");
    hippoFrames.push(loadImage(assetUrl(`assets/hippo/player/hippo-${id}.png`)));
  }
  faceImg = loadImage(assetUrl("assets/hippo/face.png"));
}

function setup() {
  loadTroubleshootOptions();
  buildStamp = formatBuildStamp();
  const canvas = createCanvas(windowWidth, windowHeight);
  canvas.parent("game-root");
  configureCanvasPerformance();
  noSmooth();
  textFont('"Courier New", monospace');
  updateFit();
  bestScore = Number(localStorage.getItem("flappy-hippo-best") || 0);
  faceOutlineImg = buildFaceOutlineImage(4);
  cloudSprite = buildCloudSprite();
  setupAudio();
  clouds = makeClouds();
  resetRun();
  state = "ready";

  window.__FLAPPY_HIPPO_GAME__ = makeGameApi();
}

function makeGameApi() {
  const api = {
    flap: handleAction,
    snapshot: gameSnapshot
  };
  if (isPerfHarnessEnabled()) {
    api.perf = makePerfApi();
  }
  return api;
}

function isPerfHarnessEnabled() {
  return typeof location !== "undefined" && new URLSearchParams(location.search).has("perf");
}

function makePerfApi() {
  return {
    startRun: perfStartRun,
    stabilize: perfStabilize,
    collectFace: perfCollectFace,
    placeCollectionObstacle: perfPlaceCollectionObstacle,
    snapshot: perfSnapshot,
    forceDeath: perfForceDeath
  };
}

function formatBuildStamp() {
  if (typeof document === "undefined") return "";
  const raw = document.lastModified;
  const modified = new Date(raw);
  if (!Number.isFinite(modified.getTime())) return raw ? `modified ${raw}` : "";
  return `modified ${modified.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  })}`;
}

function loadTroubleshootOptions() {
  troubleshootOptions = { ...DEFAULT_TROUBLESHOOT_OPTIONS };
  if (typeof sessionStorage === "undefined") return;
  try {
    const saved = JSON.parse(sessionStorage.getItem(TROUBLESHOOT_STORAGE_KEY) || "{}");
    for (const key of Object.keys(DEFAULT_TROUBLESHOOT_OPTIONS)) {
      if (typeof saved[key] === "boolean") troubleshootOptions[key] = saved[key];
    }
  } catch (error) {
    troubleshootOptions = { ...DEFAULT_TROUBLESHOOT_OPTIONS };
  }
}

function saveTroubleshootOptions() {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(TROUBLESHOOT_STORAGE_KEY, JSON.stringify(troubleshootOptions));
  } catch (error) {
    // Session storage can be unavailable in private or restricted browser modes.
  }
}

function optionEnabled(key) {
  return troubleshootOptions[key] !== false;
}

function setTroubleshootOption(key, value) {
  if (!Object.prototype.hasOwnProperty.call(DEFAULT_TROUBLESHOOT_OPTIONS, key)) return;
  troubleshootOptions[key] = Boolean(value);
  saveTroubleshootOptions();
  applyTroubleshootSideEffects(key);
}

function toggleTroubleshootOption(key) {
  setTroubleshootOption(key, !optionEnabled(key));
}

function applyLowEffectsPreset() {
  troubleshootOptions = {
    sixtyFps: false,
    sharpCanvas: false,
    clouds: false,
    ground: false,
    jumpSparkles: false,
    collectionEffects: false,
    deathPieces: false,
    playerAnimation: false,
    music: true,
    soundEffects: false,
    sfxLite: true,
    mysteryBlocks: false
  };
  saveTroubleshootOptions();
  applyTroubleshootSideEffects("preset");
}

function resetTroubleshootOptions() {
  troubleshootOptions = { ...DEFAULT_TROUBLESHOOT_OPTIONS };
  saveTroubleshootOptions();
  applyTroubleshootSideEffects("reset");
}

function applyTroubleshootSideEffects(key) {
  if (key === "music" || key === "soundEffects" || key === "preset" || key === "reset") {
    applyAudioOptions();
  }
  if (key === "sharpCanvas" || key === "sixtyFps" || key === "preset" || key === "reset") {
    configureCanvasPerformance();
  }
  if (!optionEnabled("collectionEffects")) {
    collectionEffects = [];
  }
  if (!optionEnabled("mysteryBlocks")) {
    playerFlipMode = "none";
    for (const obstacle of obstacles) {
      if (obstacle.collectible === "mystery") {
        obstacle.collectible = "face";
        obstacle.flipMode = "none";
      }
    }
  }
  if (!optionEnabled("deathPieces")) {
    deathPieces = [];
  }
  if (!optionEnabled("jumpSparkles") || !optionEnabled("collectionEffects") || !optionEnabled("deathPieces")) {
    particles = [];
  }
}

function applyAudioOptions() {
  if (!optionEnabled("music")) {
    musicStarted = false;
    if (musicTrack) musicTrack.pause();
  }
  if (!optionEnabled("soundEffects")) {
    silenceSfx();
  } else if (sfxMasterGain) {
    sfxMasterGain.gain.value = 1;
  }
}

function silenceSfx() {
  if (sfxMasterGain) sfxMasterGain.gain.value = 0;
  for (const pool of Object.values(sfxTracks)) {
    for (const track of pool) track.pause();
  }
}

function gameSnapshot() {
  const includeMysteryState = troubleshootOptions.mysteryBlocks === true || playerFlipMode !== "none";
  const playerSnapshot = {
    x: Math.round(player.x),
    y: Math.round(player.y),
    scale: Number(player.scale.toFixed(3)),
    targetScale: Number(player.targetScale.toFixed(3))
  };
  if (includeMysteryState) playerSnapshot.flipMode = playerFlipMode;

  return {
    state,
    score,
    bestScore,
    obstacles: obstacles.length,
    obstacleState: obstacles.map((obstacle) => {
      const snapshot = {
        x: Math.round(obstacle.x),
        top: Math.round(obstacle.top),
        gap: Math.round(obstacle.gap),
        faceScale: Number(collectibleFaceScale().toFixed(3)),
        collected: obstacle.collected
      };
      if (includeMysteryState) {
        snapshot.collectible = obstacle.collectible === "mystery" ? "mystery" : "face";
        snapshot.flipMode = obstacle.flipMode || "none";
      }
      return snapshot;
    }),
    player: playerSnapshot,
    death: deathEffect
      ? {
          life: Math.round(deathEffect.life),
          maxLife: deathEffect.maxLife,
          pieces: deathPieces.length,
          faces: deathFaceCount()
        }
      : null,
    effects: {
      particles: particles.length,
      collection: collectionEffects.length,
      deathPieces: deathPieces.length,
      deathFaces: deathFaceCount()
    },
    audio: {
      musicReady: Boolean(musicTrack),
      musicStarted,
      sfxBackend,
      sfxReady: Object.keys(SOUND_EFFECTS).filter((name) => sfxBuffers[name] || sfxTracks[name])
    },
    performance: {
      mode: performanceMode ? "mobile" : "desktop",
      targetFrameMs: Number(targetFrameMs.toFixed(2)),
      targetFrameRate,
      frameLoad: Number(frameLoad.toFixed(2)),
      pixelDensity: pixelDensity(),
      troubleshootOptions: { ...troubleshootOptions }
    },
    frames: hippoFrames.length
  };
}

function deathFaceCount() {
  let count = 0;
  for (const piece of deathPieces) {
    if (piece.face) count += 1;
  }
  return count;
}

function perfSnapshot() {
  const snapshot = gameSnapshot();
  snapshot.player.vy = perfMetric(player.vy);
  snapshot.player.rot = perfMetric(player.rot);
  snapshot.clearance = perfClearanceSnapshot();
  return snapshot;
}

function perfClearanceSnapshot() {
  const hitbox = perfPlayerHitbox();
  const ground = GROUND_Y - PLAYER_GROUND_RADIUS * player.scale - player.y;
  let nearestPipe = null;

  for (const obstacle of obstacles) {
    const bottomY = obstacle.top + obstacle.gap;
    const horizontalGap =
      obstacle.x > hitbox.x + hitbox.w
        ? obstacle.x - (hitbox.x + hitbox.w)
        : hitbox.x > obstacle.x + obstacle.w
          ? hitbox.x - (obstacle.x + obstacle.w)
          : 0;
    const faceX = obstacle.x + obstacle.w * 0.5;
    const top = hitbox.y - obstacle.top;
    const bottom = bottomY - (hitbox.y + hitbox.h);
    const minPipe = Math.min(top, bottom);
    const candidate = {
      x: Math.round(obstacle.x),
      collected: obstacle.collected,
      horizontalGap: perfMetric(horizontalGap),
      faceDx: perfMetric(faceX - player.x),
      top: perfMetric(top),
      bottom: perfMetric(bottom),
      min: perfMetric(minPipe)
    };
    if (
      !nearestPipe ||
      Math.abs(candidate.horizontalGap) + Math.abs(candidate.faceDx) <
        Math.abs(nearestPipe.horizontalGap) + Math.abs(nearestPipe.faceDx)
    ) {
      nearestPipe = candidate;
    }
  }

  const pipeRisk =
    nearestPipe &&
    (nearestPipe.horizontalGap <= 8 || Math.abs(nearestPipe.faceDx) <= 70) &&
    nearestPipe.min <= 30;
  const groundRisk = ground <= 36;
  return {
    ground: perfMetric(ground),
    pipe: nearestPipe,
    risk: Boolean(groundRisk || pipeRisk)
  };
}

function perfPlayerHitbox() {
  return {
    x: player.x - PLAYER_HIT_W * player.scale * 0.55,
    y: player.y - PLAYER_HIT_H * player.scale * 0.52,
    w: PLAYER_HIT_W * player.scale,
    h: PLAYER_HIT_H * player.scale
  };
}

function perfMetric(value) {
  return Number.isFinite(value) ? Number(value.toFixed(2)) : 0;
}

function perfStartRun() {
  resetRun();
  state = "playing";
  flap({ silent: true });
  return perfSnapshot();
}

function perfStabilize() {
  if (state !== "playing") return perfSnapshot();
  obstacles = [];
  spawnTimer = 240;
  const safeGroundY = GROUND_Y - PLAYER_GROUND_RADIUS * player.scale - 48;
  player.y = constrain(player.y, 142, safeGroundY);
  player.vy = constrain(player.vy, -2, 2);
  player.rot = 0;
  return perfSnapshot();
}

function perfCollectFace() {
  if (state !== "playing") return perfSnapshot();
  perfStabilize();
  const gap = 170 * PIPE_GAP_MULT;
  const faceX = player.x + 38 + (score % 4) * 8;
  const faceY = constrain(player.y - 12 + sin(score * 0.7) * 18, 126, GROUND_Y - 120);
  collectFace({
    x: faceX - PIPE_W * 0.5,
    w: PIPE_W,
    top: faceY - gap * 0.5,
    gap,
    collected: false
  });
  return perfSnapshot();
}

function perfPlaceCollectionObstacle(options = {}) {
  if (state !== "playing") return perfSnapshot();

  const groundClearance = Number.isFinite(options.groundClearance) ? options.groundClearance : 30;
  const bottomClearance = Number.isFinite(options.bottomClearance) ? options.bottomClearance : 18;
  const faceLead = Number.isFinite(options.faceLead) ? options.faceLead : 8;
  const gap = Number.isFinite(options.gap) ? options.gap : 170 * PIPE_GAP_MULT;
  const targetY = GROUND_Y - PLAYER_GROUND_RADIUS * player.scale - groundClearance;

  player.y = constrain(targetY, 96, GROUND_Y - PLAYER_GROUND_RADIUS * player.scale - 6);
  player.vy = Number.isFinite(options.vy) ? options.vy : 1.35;
  player.rot = 0.08;

  const hitbox = perfPlayerHitbox();
  let bottomY = hitbox.y + hitbox.h + bottomClearance;
  bottomY = constrain(bottomY, gap + 56, GROUND_Y - 16);
  const top = bottomY - gap;
  const faceScale = collectibleFaceScale();
  const playerFront =
    player.x + (PLAYER_BASE_W - PLAYER_ANCHOR_X) * player.scale - FACE_W * faceScale * 0.5;
  const faceX = playerFront + faceLead;

  obstacles = [
    {
      x: faceX - PIPE_W * 0.5,
      w: PIPE_W,
      top,
      gap,
      collected: false
    }
  ];
  spawnTimer = Number.isFinite(options.spawnTimer) ? options.spawnTimer : 260;
  return perfSnapshot();
}

function perfForceDeath() {
  if (state !== "playing") return perfSnapshot();
  obstacles = [];
  const safeGroundY = GROUND_Y - PLAYER_GROUND_RADIUS * player.scale - 4;
  player.y = constrain(player.y, 50, safeGroundY);
  player.vy = 0;
  crash();
  return perfSnapshot();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  configureCanvasPerformance();
  updateFit();
}

function configureCanvasPerformance() {
  performanceMode = isMobilePerformanceTarget();
  targetFrameRate = performanceMode || !optionEnabled("sixtyFps") ? MOBILE_FRAME_RATE : DESKTOP_FRAME_RATE;
  targetFrameMs = 1000 / targetFrameRate;
  const highDensity = optionEnabled("sharpCanvas") ? Math.min(2, window.devicePixelRatio || 1) : 1;
  pixelDensity(performanceMode ? 1 : highDensity);
  frameRate(targetFrameRate);
}

function isMobilePerformanceTarget() {
  const coarsePointer = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  const narrowScreen = min(windowWidth, windowHeight) <= 700;
  return coarsePointer || narrowScreen;
}

function updateFit() {
  fitScale = Math.min(width / WORLD_W, height / WORLD_H);
  fitX = (width - WORLD_W * fitScale) / 2;
  fitY = (height - WORLD_H * fitScale) / 2;
  viewLeft = -fitX / fitScale;
  viewRight = (width - fitX) / fitScale;
  viewTop = -fitY / fitScale;
  viewBottom = (height - fitY) / fitScale;
}

function setupAudio() {
  setupMusicTrack();
  setupSfxAudio();
}

function setupMusicTrack() {
  if (typeof Audio === "undefined") return;
  musicTrack = new Audio();
  musicTrack.loop = true;
  musicTrack.preload = "none";
  musicTrack.volume = MUSIC_VOLUME;
  musicTrack.src = MUSIC_SRC;
}

function setupSfxAudio() {
  sfxBuffers = {};
  sfxBufferPromises = {};
  lastSfxTimes = {};
  sfxBackend = "none";
  const context = getAudioContext();
  if (context) {
    sfxBackend = "webaudio";
    sfxMasterGain = context.createGain();
    sfxMasterGain.gain.value = optionEnabled("soundEffects") ? 1 : 0;
    sfxMasterGain.connect(context.destination);
    preloadSfxBuffers();
    return;
  }
  setupFallbackSfxTracks();
}

function setupFallbackSfxTracks() {
  if (typeof Audio === "undefined") return;
  sfxBackend = "htmlaudio";
  sfxTracks = {};
  sfxCursors = {};
  for (const [name, config] of Object.entries(SOUND_EFFECTS)) {
    const pool = [];
    const poolSize = SFX_POOL_SIZE[name] || 2;
    for (let i = 0; i < poolSize; i += 1) {
      const track = new Audio(config.src);
      track.preload = "auto";
      track.volume = config.volume;
      pool.push(track);
    }
    sfxTracks[name] = pool;
    sfxCursors[name] = 0;
  }
}

function getAudioContext() {
  if (typeof window === "undefined") return null;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioContext) {
    try {
      audioContext = new AudioContextClass();
    } catch (error) {
      audioContext = null;
    }
  }
  return audioContext;
}

function preloadSfxBuffers() {
  if (sfxPreloadStarted || sfxBackend !== "webaudio" || typeof fetch !== "function") return;
  sfxPreloadStarted = true;
  const context = getAudioContext();
  if (!context) return;

  for (const [name, config] of Object.entries(SOUND_EFFECTS)) {
    sfxBufferPromises[name] = fetch(config.src)
      .then((response) => response.arrayBuffer())
      .then((data) => decodeAudioBuffer(context, data))
      .then((buffer) => {
        sfxBuffers[name] = buffer;
        return buffer;
      })
      .catch(() => null);
  }
}

function decodeAudioBuffer(context, data) {
  return new Promise((resolve, reject) => {
    const decodeResult = context.decodeAudioData(data, resolve, reject);
    if (decodeResult && typeof decodeResult.then === "function") {
      decodeResult.then(resolve).catch(reject);
    }
  });
}

function unlockSfxAudio() {
  if (!optionEnabled("soundEffects")) return;
  preloadSfxBuffers();
  const context = getAudioContext();
  if (context && context.state === "suspended") {
    context.resume().catch(() => {});
  }
  if (sfxMasterGain) sfxMasterGain.gain.value = 1;
}

function sfxReadyForPlay() {
  if (!optionEnabled("soundEffects") || sfxBackend !== "webaudio") return true;
  return Object.keys(SOUND_EFFECTS).every((name) => Boolean(sfxBuffers[name]));
}

function prepareSfxBeforeStart() {
  if (sfxReadyForPlay()) return false;
  pendingStartAfterSfx = true;
  pendingStartToken += 1;
  const token = pendingStartToken;
  unlockSfxAudio();
  const loads = Object.values(sfxBufferPromises);
  Promise.all(loads).finally(() => completePendingSfxStart(token));
  setTimeout(() => completePendingSfxStart(token), SFX_START_WAIT_MS);
  return true;
}

function completePendingSfxStart(token) {
  if (!pendingStartAfterSfx || token !== pendingStartToken || state !== "ready") return;
  startReadyRun();
}

function startMusic() {
  if (!optionEnabled("music")) return;
  if (!musicTrack || !musicTrack.paused) {
    musicStarted = Boolean(musicTrack);
    return;
  }

  const playAttempt = musicTrack.play();
  if (playAttempt && typeof playAttempt.then === "function") {
    playAttempt
      .then(() => {
        musicStarted = true;
      })
      .catch(() => {
        musicStarted = false;
      });
    return;
  }
  musicStarted = true;
}

function playSfx(name) {
  if (!optionEnabled("soundEffects") || shouldSkipSfx(name)) return;
  if (playWebAudioSfx(name)) return;
  if (sfxBackend === "webaudio") return;
  playFallbackSfx(name);
}

function shouldSkipSfx(name) {
  if (!optionEnabled("sfxLite")) return false;
  const interval = SFX_LITE_INTERVALS[name] || 0;
  if (interval <= 0) return false;
  const now = typeof millis === "function" ? millis() : performance.now();
  const last = lastSfxTimes[name] || -Infinity;
  if (now - last < interval) return true;
  lastSfxTimes[name] = now;
  return false;
}

function playWebAudioSfx(name) {
  const context = getAudioContext();
  const buffer = sfxBuffers[name];
  if (!context || !buffer || !sfxMasterGain) return false;

  const source = context.createBufferSource();
  const gain = context.createGain();
  source.buffer = buffer;
  gain.gain.value = SOUND_EFFECTS[name]?.volume ?? 1;
  source.connect(gain);
  gain.connect(sfxMasterGain);
  try {
    source.start();
    return true;
  } catch (error) {
    return false;
  }
}

function playFallbackSfx(name) {
  const pool = sfxTracks[name];
  if (!pool || pool.length === 0) return;

  const index = sfxCursors[name] % pool.length;
  sfxCursors[name] = index + 1;
  const track = pool[index];
  track.pause();
  try {
    track.currentTime = 0;
  } catch (error) {
    // Some mobile browsers reject seeks before metadata is ready; play from current position instead.
  }
  const playAttempt = track.play();
  if (playAttempt && typeof playAttempt.catch === "function") {
    playAttempt.catch(() => {});
  }
}

function resetRun() {
  player = {
    x: 104,
    y: WORLD_H * 0.45,
    vy: 0,
    rot: 0,
    growth: 0,
    scale: 1,
    targetScale: 1
  };
  obstacles = [];
  particles = [];
  collectionEffects = [];
  deathEffect = null;
  deathPieces = [];
  playerFlipMode = "none";
  score = 0;
  spawnTimer = 46;
  groundOffset = 0;
  lowerCloudOffset = 0;
  crashCooldown = 0;
  crashUiFrame = 0;
}

function draw() {
  drawingContext.imageSmoothingEnabled = false;
  updateFrameLoad();
  background(123, 197, 205);

  push();
  translate(fitX, fitY);
  scale(fitScale);
  drawingContext.save();
  drawingContext.beginPath();
  drawingContext.rect(0, viewTop, WORLD_W, viewBottom - viewTop);
  drawingContext.clip();
  drawBackdrop();

  if (state === "playing") {
    updatePlaying();
  } else if (state === "dying") {
    updateDying();
  } else if (state === "crashed") {
    updateCrash();
  } else {
    updateReady();
  }

  drawObstacles();
  drawCollectionEffects();
  updateParticles();
  if (state === "dying") {
    drawDeathPieces();
    drawDeathEffect();
  } else if (state === "ready" || state === "playing") {
    drawHippo();
  }
  drawGround();
  drawHud();
  drawingContext.restore();
  pop();
}

function updateFrameLoad() {
  const frameMs = deltaTime || targetFrameMs;
  frameLoad = lerp(frameLoad, frameMs / targetFrameMs, 0.08);
  animationClock += frameStepScale();
}

function frameStepScale() {
  return DESKTOP_FRAME_RATE / targetFrameRate;
}

function updateReady() {
  const t = animationClock;
  const step = frameStepScale();
  if (optionEnabled("playerAnimation")) {
    player.y = READY_PLAYER_Y + sin(t * 0.08) * 9;
    player.vy = sin(t * 0.08) * 0.85;
    player.rot = sin(t * 0.07) * 0.05;
  } else {
    player.y = READY_PLAYER_Y;
    player.vy = 0;
    player.rot = 0;
  }
  player.scale = lerp(player.scale, player.targetScale, 0.12);
  groundOffset = (groundOffset + 0.45 * step) % 48;
}

function updatePlaying() {
  const steps = Math.max(1, Math.round(frameStepScale()));
  for (let i = 0; i < steps && state === "playing"; i += 1) {
    updatePlayingStep();
  }
}

function updatePlayingStep() {
  const speed = currentSpeed();
  groundOffset = (groundOffset + speed) % 48;
  player.scale = lerp(player.scale, player.targetScale, 0.12);
  player.vy += 0.39 * PLAYER_VELOCITY_MULT;
  player.vy = constrain(player.vy, -8.4 * PLAYER_VELOCITY_MULT, 10.2 * PLAYER_VELOCITY_MULT);
  player.y += player.vy;
  player.rot = constrain(map(player.vy, -8 * PLAYER_VELOCITY_MULT, 10 * PLAYER_VELOCITY_MULT, -0.4, 0.55), -0.4, 0.55);

  spawnTimer -= 1;
  if (spawnTimer <= 0) {
    spawnObstacle();
    spawnTimer = 100;
  }

  for (const obstacle of obstacles) {
    obstacle.x -= speed;
    if (!obstacle.collected && collectibleHalfCovered(obstacle)) {
      collectFace(obstacle);
    }
  }
  compactObstacles();

  if (hitsAnyObstacle() || player.y + PLAYER_GROUND_RADIUS * player.scale >= GROUND_Y || player.y < 18) {
    crash();
  }
}

function compactObstacles() {
  let write = 0;
  for (let i = 0; i < obstacles.length; i += 1) {
    if (obstacles[i].x > -120) {
      obstacles[write] = obstacles[i];
      write += 1;
    }
  }
  obstacles.length = write;
}

function updateCrash() {
  const step = frameStepScale();
  crashCooldown = max(0, crashCooldown - step);
  crashUiFrame += step;
}

function updateDying() {
  if (!deathEffect) {
    state = "crashed";
    return;
  }

  deathEffect.life -= frameStepScale();
  const age = deathEffect.maxLife - deathEffect.life;
  if (!deathEffect.burstDone && age >= 12) {
    deathEffect.burstDone = true;
    if (optionEnabled("deathPieces")) {
      makeDeathPieces(deathEffect.x, deathEffect.y, deathEffect.scale, deathEffect.score);
      burst(
        deathEffect.x,
        deathEffect.y,
        RGB.yellow,
        Math.round(20 * deathEffect.scale),
        1.2 + deathEffect.scale * 0.35,
        0.9 + deathEffect.scale * 0.45
      );
      burst(
        deathEffect.x + 8 * deathEffect.scale,
        deathEffect.y - 5 * deathEffect.scale,
        RGB.mint,
        Math.round(14 * deathEffect.scale),
        1.1 + deathEffect.scale * 0.25,
        0.8 + deathEffect.scale * 0.35
      );
    }
  }
  if (deathEffect.life <= 0) {
    deathEffect = null;
    deathPieces = [];
    state = "crashed";
    crashCooldown = 0;
    crashUiFrame = 0;
  }
}

function currentSpeed() {
  return BASE_SPEED + min(0.55, score * 0.025);
}

function handleAction() {
  if (frameCount === lastActionFrame) return;
  lastActionFrame = frameCount;
  startMusic();
  unlockSfxAudio();

  if (state === "ready") {
    if (prepareSfxBeforeStart()) return;
    startReadyRun();
    return;
  }

  if (state === "playing") {
    flap();
    return;
  }

  if (state === "crashed" && crashCooldown === 0) {
    playSfx("start");
    resetRun();
    state = "playing";
    flap({ silent: true });
  }
}

function startReadyRun() {
  pendingStartAfterSfx = false;
  playSfx("start");
  resetRun();
  state = "playing";
  flap({ silent: true });
}

function flap(options = {}) {
  if (!options.silent) playSfx("jump");
  const sizePenalty = 1 + max(0, player.scale - 1) * JUMP_SIZE_PENALTY;
  player.vy = (-7.35 * PLAYER_VELOCITY_MULT) / sizePenalty;
  player.rot = -0.36;
  if (optionEnabled("jumpSparkles")) {
    burst(player.x - 22, player.y + 18, RGB.mint, 5);
  }
}

function crash() {
  if (state !== "playing") return;
  playSfx("crash");
  const popScale = player.scale;
  const popX = player.x;
  const popY = constrain(player.y, 30, GROUND_Y - PLAYER_GROUND_RADIUS * popScale);
  const frameIdx = Math.floor(animationClock / 3) % hippoFrames.length;

  player.y = popY;
  player.vy = 0;
  state = "dying";
  crashCooldown = 0;
  deathEffect = {
    x: popX,
    y: popY,
    scale: popScale,
    rot: player.rot,
    flipMode: playerFlipMode,
    img: hippoFrames[frameIdx],
    score,
    life: 52,
    maxLife: 52,
    burstDone: false
  };
}

function keyPressed() {
  if (key === " " || keyCode === UP_ARROW || keyCode === ENTER) {
    handleAction();
    return false;
  }
  return true;
}

function mousePressed() {
  handlePointerAction();
  return false;
}

function touchStarted() {
  handlePointerAction();
  return false;
}

function handlePointerAction() {
  if (frameCount === lastPointerFrame) return;
  lastPointerFrame = frameCount;
  if (handleOptionsPointer()) return;
  handleAction();
}

function handleOptionsPointer() {
  if (!optionsAvailable()) return false;

  const screenPoint = currentPointerScreenPoint();
  const point = screenToWorld(screenPoint.x, screenPoint.y);
  if (pointInRect(point, OPTIONS_BUTTON)) {
    optionsPanelOpen = !optionsPanelOpen;
    return true;
  }

  if (!optionsPanelOpen) return false;

  const action = optionPanelActionAt(point);
  if (action === "low") {
    applyLowEffectsPreset();
    return true;
  }
  if (action === "reset") {
    resetTroubleshootOptions();
    return true;
  }
  if (action) {
    toggleTroubleshootOption(action);
    return true;
  }
  if (pointInRect(point, OPTIONS_PANEL)) return true;

  optionsPanelOpen = false;
  return true;
}

function optionsAvailable() {
  return state === "ready" || state === "crashed";
}

function screenToWorld(x, y) {
  return {
    x: (x - fitX) / fitScale,
    y: (y - fitY) / fitScale
  };
}

function currentPointerScreenPoint() {
  if (typeof touches !== "undefined" && touches.length > 0) {
    return { x: touches[0].x, y: touches[0].y };
  }
  return { x: mouseX, y: mouseY };
}

function pointInRect(point, rect) {
  return point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h;
}

function optionPanelActionAt(point) {
  const lowButton = optionPanelLowButton();
  const resetButton = optionPanelResetButton();
  if (pointInRect(point, lowButton)) return "low";
  if (pointInRect(point, resetButton)) return "reset";

  for (let i = 0; i < OPTION_ROWS.length; i += 1) {
    const row = optionRowRect(i);
    if (pointInRect(point, row)) return OPTION_ROWS[i].key;
  }
  return null;
}

function optionPanelLowButton() {
  return { x: OPTIONS_PANEL.x + 16, y: OPTIONS_PANEL.y + 40, w: 148, h: 30 };
}

function optionPanelResetButton() {
  return { x: OPTIONS_PANEL.x + OPTIONS_PANEL.w - 164, y: OPTIONS_PANEL.y + 40, w: 148, h: 30 };
}

function optionRowRect(index) {
  return {
    x: OPTIONS_PANEL.x + 16,
    y: OPTIONS_PANEL.y + 80 + index * 23,
    w: OPTIONS_PANEL.w - 32,
    h: 21
  };
}

function spawnObstacle() {
  const gap = random(162, 176) * PIPE_GAP_MULT;
  const marginTop = 66;
  const marginBottom = 92;
  const firstTop = 292 - gap * 0.5;
  const top = score === 0 && obstacles.length === 0 ? firstTop : random(marginTop, GROUND_Y - marginBottom - gap);
  const collectible = chooseCollectibleKind();
  obstacles.push({
    x: WORLD_W + 34,
    w: PIPE_W,
    top,
    gap,
    collectible,
    flipMode: "none",
    collected: false
  });
}

function collectFace(obstacle) {
  obstacle.collected = true;
  score += 1;
  const mystery = troubleshootOptions.mysteryBlocks === true && obstacle.collectible === "mystery";
  if (mystery) {
    playerFlipMode = nextFlipMode(playerFlipMode);
    obstacle.flipMode = playerFlipMode;
  }
  const milestone = score % 10 === 0;
  playSfx(mystery || milestone ? "collectMilestone" : "collect");
  bestScore = max(bestScore, score);
  localStorage.setItem("flappy-hippo-best", String(bestScore));

  const growth = GROWTH_BASE / pow(score, GROWTH_FALLOFF);
  player.growth += growth;
  player.targetScale = 1 + player.growth;

  const faceX = obstacle.x + obstacle.w * 0.5;
  const faceY = obstacle.top + obstacle.gap * 0.5;
  if (optionEnabled("collectionEffects")) {
    collectionEffects.push({
      x: faceX,
      y: faceY,
      kind: mystery ? "mystery" : "face",
      flipMode: playerFlipMode,
      scale: milestone ? 1.75 : 1,
      life: milestone ? 52 : 34,
      maxLife: milestone ? 52 : 34
    });
    burst(
      faceX,
      faceY,
      mystery ? RGB.yellow : milestone ? RGB.pink : RGB.mint,
      mystery || milestone ? 26 : 12,
      mystery || milestone ? 1.45 : 1,
      mystery || milestone ? 1.35 : 1
    );
  }
}

function collectibleHalfCovered(obstacle) {
  const faceX = obstacle.x + obstacle.w * 0.5;
  const faceScale = collectibleFaceScale();
  const width =
    troubleshootOptions.mysteryBlocks === true && obstacle.collectible === "mystery"
      ? MYSTERY_BLOCK_SIZE * faceScale
      : FACE_W * faceScale;
  const playerFront = player.x + (PLAYER_BASE_W - PLAYER_ANCHOR_X) * player.scale - width * 0.5;
  return faceX < playerFront;
}

function collectibleFaceScale() {
  return player ? max(1, player.targetScale) : 1;
}

function chooseCollectibleKind() {
  if (troubleshootOptions.mysteryBlocks !== true || score < MYSTERY_BLOCK_MIN_SCORE) return "face";
  return random() < MYSTERY_BLOCK_CHANCE ? "mystery" : "face";
}

function nextFlipMode(currentMode) {
  const currentMask = flipModeMask(currentMode);
  const toggleMask = floor(random(3)) + 1;
  return flipModeFromMask(currentMask ^ toggleMask);
}

function flipModeMask(mode) {
  if (mode === "horizontal") return 1;
  if (mode === "vertical") return 2;
  if (mode === "both") return 3;
  return 0;
}

function flipModeFromMask(mask) {
  if (mask === 1) return "horizontal";
  if (mask === 2) return "vertical";
  if (mask === 3) return "both";
  return "none";
}

function hitsAnyObstacle() {
  const hx = player.x - PLAYER_HIT_W * player.scale * 0.55;
  const hy = player.y - PLAYER_HIT_H * player.scale * 0.52;
  const hw = PLAYER_HIT_W * player.scale;
  const hh = PLAYER_HIT_H * player.scale;
  for (const obstacle of obstacles) {
    const bottomY = obstacle.top + obstacle.gap;
    if (overlapsRect(hx, hy, hw, hh, obstacle.x, -40, obstacle.w, obstacle.top - PIPE_LIP_H + 40)) return true;
    if (overlapsRect(hx, hy, hw, hh, obstacle.x - 8, obstacle.top - PIPE_LIP_H, obstacle.w + 16, PIPE_LIP_H)) return true;
    if (overlapsRect(hx, hy, hw, hh, obstacle.x - 8, bottomY, obstacle.w + 16, PIPE_LIP_H)) return true;
    if (overlapsRect(hx, hy, hw, hh, obstacle.x, bottomY + PIPE_LIP_H, obstacle.w, GROUND_Y - bottomY - PIPE_LIP_H)) return true;
  }
  return false;
}

function overlapsRect(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function drawBackdrop() {
  const step = frameStepScale();
  noStroke();
  fill(123, 197, 205);
  rect(viewLeft, viewTop, viewRight - viewLeft, viewBottom - viewTop);

  if (!optionEnabled("clouds")) return;

  cloudOffset += (state === "playing" ? 0.27 : 0.1) * step;
  lowerCloudOffset += lowerCloudAdvance() * step;
  for (const cloud of clouds) {
    const x = wrap(cloud.x - cloudOffset * cloud.speed, viewLeft - 110, viewRight + 110);
    drawPixelCloud(x, cloud.y, cloud.s);
  }

  drawLowerCloudLayer(GROUND_Y - 76, 0.78, 0.23, 126, 0, 206);
  drawLowerCloudLayer(GROUND_Y - 52, 1, 0.46, 98, 35, 244);
}

function lowerCloudAdvance() {
  if (state === "playing") return currentSpeed();
  if (state === "ready") return 0.2;
  return 0;
}

function makeClouds() {
  return [
    { x: -40, y: 86, s: 0.95, speed: 0.52 },
    { x: 80, y: 178, s: 0.5, speed: 0.82 },
    { x: 238, y: 54, s: 0.82, speed: 0.42 },
    { x: 365, y: 138, s: 0.66, speed: 0.68 }
  ];
}

function drawPixelCloud(x, y, s) {
  drawCloudPuffs(x, y, s, 245);
}

function drawLowerCloudLayer(y, s, speed, spacing, phase, alpha) {
  const left = viewLeft - 150;
  const right = viewRight + 150;
  const offset = wrap(lowerCloudOffset * speed + phase, 0, spacing);

  for (let x = left - offset; x < right; x += spacing) {
    drawBottomCloud(x, y, s, alpha);
  }
}

function drawBottomCloud(x, y, s, alpha) {
  drawCloudPuffs(x, y, s * 1.25, alpha);
}

function drawCloudPuffs(x, y, s, alpha) {
  if (!cloudSprite) return;
  push();
  imageMode(CORNER);
  tint(255, alpha);
  image(
    cloudSprite,
    x - CLOUD_ORIGIN_X * s,
    y - CLOUD_ORIGIN_Y * s,
    CLOUD_SPRITE_W * s,
    CLOUD_SPRITE_H * s
  );
  noTint();
  pop();
}

function buildCloudSprite() {
  const sprite = createGraphics(CLOUD_SPRITE_W, CLOUD_SPRITE_H);
  sprite.pixelDensity(1);
  sprite.noSmooth();
  sprite.clear();
  sprite.push();
  sprite.translate(CLOUD_ORIGIN_X, CLOUD_ORIGIN_Y);
  sprite.noStroke();
  sprite.fill(218, 246, 207, 209);
  sprite.ellipse(-42, 20, 58, 34);
  sprite.ellipse(26, 22, 88, 38);
  sprite.ellipse(70, 26, 48, 24);
  sprite.fill(232, 250, 219, 255);
  sprite.ellipse(-22, 14, 62, 40);
  sprite.ellipse(20, 1, 76, 54);
  sprite.ellipse(62, 17, 58, 36);
  sprite.rect(-54, 19, 130, 26);
  sprite.fill(244, 254, 232, 158);
  sprite.ellipse(4, -4, 44, 30);
  sprite.ellipse(45, 14, 38, 22);
  sprite.pop();
  return sprite;
}

function drawObstacles() {
  const topPipeY = min(-160, viewTop - 120);
  for (const obstacle of obstacles) {
    drawObstacle(obstacle, topPipeY);
  }
}

function drawObstacle(obstacle, topPipeY) {
  const bottomY = obstacle.top + obstacle.gap;
  drawPipe(obstacle.x, topPipeY, obstacle.w, obstacle.top - topPipeY, true);
  drawPipe(obstacle.x, bottomY, obstacle.w, GROUND_Y - bottomY, false);
  if (!obstacle.collected) {
    const x = obstacle.x + obstacle.w * 0.5;
    const y = obstacle.top + obstacle.gap * 0.5;
    const scale = collectibleFaceScale();
    if (troubleshootOptions.mysteryBlocks === true && obstacle.collectible === "mystery") {
      drawMysteryBlock(x, y, scale);
    } else {
      drawCollectibleFace(x, y, scale);
    }
  }
}

function drawPipe(x, y, w, h, upsideDown) {
  const lipY = upsideDown ? y + h - PIPE_LIP_H : y;
  const bodyY = upsideDown ? y : y + PIPE_LIP_H;
  const bodyH = max(0, upsideDown ? h - PIPE_LIP_H : h - PIPE_LIP_H);

  drawPipeBody(x, bodyY, w, bodyH);
  drawPipeLip(x - 8, lipY, w + 16, PIPE_LIP_H);
}

function drawPipeBody(x, y, w, h) {
  if (h <= 0) return;
  noStroke();
  fill(0);
  rect(x - 4, y, w + 8, h);
  fill(61, 188, 67);
  rect(x, y, w, h);
  fill(95, 231, 80);
  rect(x + 8, y, 10, h);
  fill(37, 139, 50);
  rect(x + w - 9, y, 9, h);
}

function drawPipeLip(x, y, w, h) {
  noStroke();
  fill(0);
  rect(x - 4, y - 4, w + 8, h + 8);
  fill(62, 198, 75);
  rect(x, y, w, h);
  fill(91, 228, 77);
  rect(x + 10, y + 7, w - 20, h - 14);
  fill(34, 132, 47);
  rect(x, y + h - 7, w, 7);
}

function drawCollectibleFace(x, y, faceScale = 1) {
  imageMode(CENTER);
  image(faceImg, x, y, FACE_W * faceScale, FACE_H * faceScale);
}

function drawMysteryBlock(x, y, blockScale = 1, alpha = 255) {
  const size = MYSTERY_BLOCK_SIZE;
  push();
  translate(x, y);
  scale(blockScale);
  rectMode(CENTER);
  noStroke();
  fill(0, alpha);
  rect(3, 4, size, size);
  fill(189, 101, 30, alpha);
  rect(0, 0, size, size);
  fill(255, 183, 46, alpha);
  rect(-2, -4, size - 7, size - 7);
  fill(255, 226, 89, alpha);
  rect(-11, -14, 12, 5);
  fill(120, 67, 31, alpha);
  rect(-15, -15, 4, 4);
  rect(15, -15, 4, 4);
  rect(-15, 15, 4, 4);
  rect(15, 15, 4, 4);
  drawPixelGlyph(QUESTION_GLYPH, -7.5, -12, 3, color(0, alpha));
  drawPixelGlyph(QUESTION_GLYPH, -9.5, -14, 3, color(255, 246, 122, alpha));
  pop();
}

function buildFaceOutlineImage(radius) {
  faceImg.loadPixels();
  const sourceW = faceImg.width;
  const sourceH = faceImg.height;
  const outline = createImage(sourceW + radius * 2, sourceH + radius * 2);
  const outputW = outline.width;
  const outputH = outline.height;
  const threshold = 24;
  const radiusSq = radius * radius;

  const opaqueAt = (x, y) => {
    if (x < 0 || y < 0 || x >= sourceW || y >= sourceH) return false;
    return faceImg.pixels[(y * sourceW + x) * 4 + 3] > threshold;
  };

  outline.loadPixels();
  for (let y = 0; y < outputH; y += 1) {
    for (let x = 0; x < outputW; x += 1) {
      const sourceX = x - radius;
      const sourceY = y - radius;
      let edge = false;

      if (!opaqueAt(sourceX, sourceY)) {
        for (let dy = -radius; dy <= radius && !edge; dy += 1) {
          for (let dx = -radius; dx <= radius; dx += 1) {
            if (dx * dx + dy * dy <= radiusSq && opaqueAt(sourceX + dx, sourceY + dy)) {
              edge = true;
              break;
            }
          }
        }
      }

      const pixel = (y * outputW + x) * 4;
      outline.pixels[pixel] = 255;
      outline.pixels[pixel + 1] = 255;
      outline.pixels[pixel + 2] = 255;
      outline.pixels[pixel + 3] = edge ? 255 : 0;
    }
  }
  outline.updatePixels();
  return outline;
}

function drawHippo() {
  const frameStep = state === "ready" ? 4 : 3;
  const idx = optionEnabled("playerAnimation") ? Math.floor(animationClock / frameStep) % hippoFrames.length : 0;
  const img = hippoFrames[idx];
  const w = PLAYER_BASE_W * player.scale;
  const h = PLAYER_BASE_H * player.scale;
  const anchorX = PLAYER_ANCHOR_X * player.scale;
  const anchorY = PLAYER_ANCHOR_Y * player.scale;

  push();
  translate(player.x, player.y);
  rotate(player.rot);
  if (playerFlipMode !== "none") {
    const flipX = playerFlipMode === "horizontal" || playerFlipMode === "both";
    const flipY = playerFlipMode === "vertical" || playerFlipMode === "both";
    scale(flipX ? -1 : 1, flipY ? -1 : 1);
  }
  imageMode(CORNER);
  image(img, -anchorX, -anchorY, w, h);
  pop();
}

function drawDeathEffect() {
  if (!deathEffect) return;

  const t = 1 - deathEffect.life / deathEffect.maxLife;
  const popScale = deathEffect.scale;

  if (t < 0.28) {
    const p = easeOutCubic(t / 0.28);
    const sx = popScale * lerp(1, 1.62, p);
    const sy = popScale * lerp(1, 0.34, p);
    const w = PLAYER_BASE_W * sx;
    const h = PLAYER_BASE_H * sy;
    const anchorX = PLAYER_ANCHOR_X * sx;
    const anchorY = PLAYER_ANCHOR_Y * sy;

    push();
    translate(deathEffect.x, deathEffect.y + PLAYER_BASE_H * popScale * 0.17 * p);
    rotate(lerp(deathEffect.rot, -0.06, p));
    if (deathEffect.flipMode && deathEffect.flipMode !== "none") {
      const flipX = deathEffect.flipMode === "horizontal" || deathEffect.flipMode === "both";
      const flipY = deathEffect.flipMode === "vertical" || deathEffect.flipMode === "both";
      scale(flipX ? -1 : 1, flipY ? -1 : 1);
    }
    imageMode(CORNER);
    image(deathEffect.img, -anchorX, -anchorY, w, h);
    pop();
    return;
  }

  if (t < 0.76) {
    const p = easeOutCubic((t - 0.28) / 0.48);
    const alpha = 220 * (1 - p);
    const faceScale = lerp(0.95, 1.8, p) * popScale;
    drawFacePopOutline(deathEffect.x, deathEffect.y - 12 * p, faceScale, alpha, popScale);
  }
}

function drawFacePopOutline(x, y, faceScale, alpha, popScale) {
  const w = FACE_W * faceScale;
  const h = FACE_H * faceScale;
  const outlineW = w * (faceOutlineImg.width / faceImg.width);
  const outlineH = h * (faceOutlineImg.height / faceImg.height);

  imageMode(CENTER);
  tint(0, alpha * 0.78);
  image(faceOutlineImg, x + 3 * popScale, y + 4 * popScale, outlineW, outlineH);
  tint(255, 239, 87, alpha);
  image(faceOutlineImg, x, y, outlineW, outlineH);
  tint(255, alpha);
  image(faceImg, x, y, w, h);
  noTint();
}

function drawGround() {
  const left = viewLeft - 80;
  const right = viewRight + 80;
  const widthToFill = right - left;

  noStroke();
  fill(0);
  rect(left, GROUND_Y - 1, widthToFill, 5);
  fill(140, 231, 83);
  rect(left, GROUND_Y + 4, widthToFill, viewBottom - GROUND_Y);
  fill(74, 180, 61);
  rect(left, GROUND_Y + 4, widthToFill, 7);

  if (!optionEnabled("ground")) return;

  const tileOffset = groundOffset % 48;
  for (let x = left - 48 - tileOffset; x < right + 48; x += 48) {
    fill(172, 239, 83);
    rect(x, GROUND_Y + 22, 28, 11);
    rect(x + 16, GROUND_Y + 34, 32, 9);
    fill(72, 176, 59);
    rect(x + 6, GROUND_Y + 53, 16, 7);
    rect(x + 31, GROUND_Y + 66, 24, 7);
  }
}

function drawHud() {
  textAlign(CENTER, CENTER);
  textStyle(BOLD);

  if (state === "playing" || state === "dying") {
    drawScore(score, WORLD_W / 2, 58, 42);
    return;
  }

  if (state === "ready") {
    drawBitmapText("FLAPPY", WORLD_W / 2, 142, 7, color(255, 239, 87));
    drawBitmapText("HIPPO", WORLD_W / 2, 202, 7, color(255, 239, 87));
    drawCanvasButton(WORLD_W / 2, 430, pendingStartAfterSfx ? "SOUND" : "START");
    drawOptionsButton();
    drawBuildStamp();
    if (optionsPanelOpen) drawOptionsPanel();
    return;
  }

  drawGameOverScore();
  drawBitmapText(`BEST ${bestScore}`, WORLD_W / 2, 316, 3, color(255));
  drawCanvasButton(WORLD_W / 2, 430, "AGAIN");
  drawOptionsButton();
  if (optionsPanelOpen) drawOptionsPanel();
}

function drawScore(value, x, y, size) {
  drawBitmapText(String(value), x, y, max(4, Math.round(size / 7)), color(255));
}

function drawGameOverScore() {
  const p = min(1, crashUiFrame / 28);
  const zoom = lerp(0.18, 1.45, easeOutBack(p));
  push();
  translate(WORLD_W / 2, 226);
  scale(zoom);
  drawScore(score, 0, 0, 54);
  pop();
}

function drawCanvasButton(x, y, label) {
  rectMode(CENTER);
  noStroke();
  fill(0);
  rect(x + 4, y + 5, 142, 48);
  fill(255, 239, 87);
  rect(x, y, 142, 48);
  fill(64, 196, 70);
  rect(x - 56, y - 17, 30, 10);
  rect(x + 53, y + 15, 22, 8);
  rectMode(CORNER);
  drawBitmapText(label, x, y + 1, 3, color(0), false);
}

function drawOptionsButton() {
  const b = OPTIONS_BUTTON;
  push();
  rectMode(CORNER);
  noStroke();
  fill(0);
  rect(b.x + 3, b.y + 4, b.w, b.h);
  fill(optionsPanelOpen ? RGB.mint[0] : RGB.yellow[0], optionsPanelOpen ? RGB.mint[1] : RGB.yellow[1], optionsPanelOpen ? RGB.mint[2] : RGB.yellow[2]);
  rect(b.x, b.y, b.w, b.h);
  drawGamepadIcon(b.x + b.w / 2, b.y + b.h / 2 + 1);
  pop();
}

function drawGamepadIcon(x, y) {
  noStroke();
  fill(0);
  rectMode(CENTER);
  rect(x, y, 22, 11);
  rect(x - 10, y + 2, 10, 10);
  rect(x + 10, y + 2, 10, 10);
  fill(255, 239, 87);
  rect(x - 9, y + 2, 7, 2);
  rect(x - 9, y + 2, 2, 7);
  fill(64, 196, 70);
  rect(x + 8, y + 1, 3, 3);
  rect(x + 13, y + 4, 3, 3);
  rectMode(CORNER);
}

function drawBuildStamp() {
  if (!buildStamp) return;
  push();
  textFont('"Courier New", monospace');
  textStyle(NORMAL);
  textAlign(RIGHT, BOTTOM);
  textSize(8);
  noStroke();
  fill(0, 150);
  text(buildStamp, WORLD_W - 7, WORLD_H - 7);
  fill(255, 255, 255, 190);
  text(buildStamp, WORLD_W - 8, WORLD_H - 8);
  pop();
}

function drawOptionsPanel() {
  const p = OPTIONS_PANEL;
  push();
  rectMode(CORNER);
  noStroke();
  fill(0);
  rect(p.x + 4, p.y + 5, p.w, p.h);
  fill(236, 248, 213);
  rect(p.x, p.y, p.w, p.h);
  fill(0);
  rect(p.x, p.y, p.w, 4);
  rect(p.x, p.y + p.h - 4, p.w, 4);
  rect(p.x, p.y, 4, p.h);
  rect(p.x + p.w - 4, p.y, 4, p.h);

  textFont('"Courier New", monospace');
  textAlign(CENTER, CENTER);
  textStyle(BOLD);
  textSize(13);
  fill(0);
  text("TROUBLESHOOT", p.x + p.w / 2, p.y + 22);

  drawOptionPanelButton(optionPanelLowButton(), "LOW FX");
  drawOptionPanelButton(optionPanelResetButton(), "RESET");

  textStyle(NORMAL);
  textSize(10);
  fill(0, 130);
  text("session only", p.x + p.w / 2, p.y + p.h - 17);

  for (let i = 0; i < OPTION_ROWS.length; i += 1) {
    drawOptionRow(OPTION_ROWS[i], optionRowRect(i));
  }
  pop();
}

function drawOptionPanelButton(rectSpec, label) {
  fill(0);
  rect(rectSpec.x + 2, rectSpec.y + 3, rectSpec.w, rectSpec.h);
  fill(255, 239, 87);
  rect(rectSpec.x, rectSpec.y, rectSpec.w, rectSpec.h);
  textAlign(CENTER, CENTER);
  textStyle(BOLD);
  textSize(12);
  fill(0);
  text(label, rectSpec.x + rectSpec.w / 2, rectSpec.y + rectSpec.h / 2 + 1);
}

function drawOptionRow(row, rectSpec) {
  const enabled = optionEnabled(row.key);
  fill(0, 25);
  rect(rectSpec.x, rectSpec.y, rectSpec.w, rectSpec.h);
  fill(0);
  rect(rectSpec.x + 8, rectSpec.y + 5, 12, 12);
  fill(enabled ? RGB.green[0] : RGB.gray[0], enabled ? RGB.green[1] : RGB.gray[1], enabled ? RGB.green[2] : RGB.gray[2]);
  rect(rectSpec.x + 10, rectSpec.y + 7, 8, 8);
  textAlign(LEFT, CENTER);
  textStyle(BOLD);
  textSize(11);
  fill(0);
  text(row.label.toUpperCase(), rectSpec.x + 30, rectSpec.y + rectSpec.h / 2 + 1);
  textAlign(RIGHT, CENTER);
  textStyle(NORMAL);
  textSize(10);
  fill(enabled ? 37 : 91, enabled ? 139 : 92, enabled ? 50 : 95);
  text(enabled ? "on" : "off", rectSpec.x + rectSpec.w - 10, rectSpec.y + rectSpec.h / 2 + 1);
}

const BITMAP_FONT = {
  "0": ["11111", "10001", "10011", "10101", "11001", "10001", "11111"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["11110", "00001", "00001", "11110", "10000", "10000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["10010", "10010", "10010", "11111", "00010", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["01111", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "11110"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01111", "10000", "10000", "10011", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  " ": ["000", "000", "000", "000", "000", "000", "000"]
};

function drawBitmapText(label, x, y, unit, fillColor, outline = true) {
  const textValue = String(label).toUpperCase();
  const w = bitmapTextWidth(textValue, unit);
  const h = 7 * unit;
  const startX = x - w / 2;
  const startY = y - h / 2;

  if (outline) {
    drawBitmapTextLayer(textValue, startX - unit, startY, unit, color(0));
    drawBitmapTextLayer(textValue, startX + unit, startY, unit, color(0));
    drawBitmapTextLayer(textValue, startX, startY - unit, unit, color(0));
    drawBitmapTextLayer(textValue, startX, startY + unit, unit, color(0));
    drawBitmapTextLayer(textValue, startX + unit, startY + unit, unit, color(39, 117, 56));
  }
  drawBitmapTextLayer(textValue, startX, startY, unit, fillColor);
}

function bitmapTextWidth(label, unit) {
  let total = 0;
  for (const ch of label) {
    const glyph = BITMAP_FONT[ch] || BITMAP_FONT[" "];
    total += glyph[0].length * unit + unit;
  }
  return max(0, total - unit);
}

function drawBitmapTextLayer(label, x, y, unit, fillColor) {
  fill(fillColor);
  noStroke();
  rectMode(CORNER);
  let cursor = x;
  for (const ch of label) {
    const glyph = BITMAP_FONT[ch] || BITMAP_FONT[" "];
    for (let row = 0; row < glyph.length; row += 1) {
      for (let col = 0; col < glyph[row].length; col += 1) {
        if (glyph[row][col] === "1") {
          rect(cursor + col * unit, y + row * unit, unit, unit);
        }
      }
    }
    cursor += (glyph[0].length + 1) * unit;
  }
}

function particleCap() {
  return performanceMode ? MOBILE_PARTICLE_CAP : DESKTOP_PARTICLE_CAP;
}

function effectScale() {
  const base = performanceMode ? 0.68 : 1;
  if (frameLoad > 1.35) return base * 0.55;
  if (frameLoad > 1.15) return base * 0.75;
  return base;
}

function burst(x, y, c, count, power = 1, sizeScale = 1) {
  const cap = particleCap();
  if (particles.length >= cap) return;

  const actualCount = min(cap - particles.length, max(1, Math.round(count * effectScale())));
  for (let i = 0; i < actualCount; i += 1) {
    const life = random(18, 34) * constrain(sizeScale, 0.8, 1.8);
    particles.push({
      x,
      y,
      vx: random(-2.8, 2.8) * power,
      vy: random(-3.4, 1.4) * power,
      life,
      maxLife: life,
      size: random(3, 7) * sizeScale,
      c
    });
  }
}

function makeDeathPieces(x, y, popScale, faceScore) {
  const palette = [
    RGB.mint,
    RGB.yellow,
    RGB.green,
    RGB.gray,
    RGB.white,
    RGB.black
  ];
  const faceCount = max(0, floor(faceScore || 0));
  const extraPieces = Math.round((performanceMode ? 12 : 24) + (performanceMode ? 8 : 18) * popScale);
  const count = extraPieces + faceCount;

  deathPieces = [];
  for (let i = 0; i < count; i += 1) {
    const angle = random(TWO_PI);
    const speed = random(1.8, 5.6) * (0.8 + popScale * 0.32);
    const life = random(24, 40);
    deathPieces.push({
      x: x + random(-22, 24) * popScale,
      y: y + random(-20, 18) * popScale,
      vx: cos(angle) * speed + random(-0.45, 0.45),
      vy: sin(angle) * speed - random(0.7, 2.4),
      life,
      maxLife: life,
      size: random(4, 9) * (0.75 + popScale * 0.35),
      rot: random(TWO_PI),
      vr: random(-0.22, 0.22),
      face: i < faceCount,
      c: palette[i % palette.length]
    });
  }
}

function drawDeathPieces() {
  if (!optionEnabled("deathPieces")) {
    deathPieces = [];
    return;
  }
  const step = frameStepScale();
  let write = 0;
  for (const piece of deathPieces) {
    piece.x += piece.vx * step;
    piece.y += piece.vy * step;
    piece.vy += 0.15 * step;
    piece.rot += piece.vr * step;
    piece.life -= step;

    const alpha = map(piece.life, 0, piece.maxLife, 0, 255);
    push();
    translate(piece.x, piece.y);
    rotate(piece.rot);
    if (piece.face) {
      const faceScale = piece.size / 8;
      tint(255, alpha);
      imageMode(CENTER);
      image(faceImg, 0, 0, FACE_W * faceScale, FACE_H * faceScale);
      noTint();
    } else {
      rectMode(CENTER);
      noStroke();
      fill(piece.c[0], piece.c[1], piece.c[2], alpha);
      rect(0, 0, piece.size, piece.size);
      rectMode(CORNER);
    }
    pop();
    if (piece.life > 0) {
      deathPieces[write] = piece;
      write += 1;
    }
  }
  deathPieces.length = write;
}

function updateParticles() {
  const step = frameStepScale();
  let write = 0;
  for (const p of particles) {
    p.x += p.vx * step;
    p.y += p.vy * step;
    p.vy += 0.16 * step;
    p.life -= step;
    const alpha = map(p.life, 0, p.maxLife, 0, 255);
    fill(p.c[0], p.c[1], p.c[2], alpha);
    noStroke();
    rect(p.x, p.y, p.size, p.size);
    if (p.life > 0) {
      particles[write] = p;
      write += 1;
    }
  }
  particles.length = write;
}

function drawCollectionEffects() {
  if (!optionEnabled("collectionEffects")) {
    collectionEffects = [];
    return;
  }
  const step = frameStepScale();
  let write = 0;
  for (const effect of collectionEffects) {
    drawPickupEffect(effect);
    effect.life -= step;
    if (effect.life > 0) {
      collectionEffects[write] = effect;
      write += 1;
    }
  }
  collectionEffects.length = write;
}

function drawPickupEffect(effect) {
  if (effect.kind === "mystery") {
    drawMysteryPickup(effect);
    return;
  }
  drawPickupHeart(effect);
}

function drawMysteryPickup(effect) {
  const t = 1 - effect.life / effect.maxLife;
  const eased = easeOutCubic(t);
  const alpha = map(effect.life, 0, effect.maxLife, 0, 255);
  const lift = 10 + eased * 40;
  const wobble = sin((1 - effect.life / 5) * PI) * 4;
  const effectScale = min(1.3, effect.scale || 1);

  push();
  translate(effect.x + wobble, effect.y - lift);
  scale(effectScale * lerp(0.58, 0.9, sin(t * PI)));
  drawMysteryBlock(0, 0, 1, alpha);
  drawFlipMarker(effect.flipMode, alpha);
  pop();
}

function drawFlipMarker(mode, alpha) {
  const showVertical = mode === "vertical" || mode === "both";
  const showHorizontal = mode === "horizontal" || mode === "both";
  const showReset = mode === "none";
  noStroke();
  fill(0, alpha * 0.68);
  rectMode(CENTER);
  if (showVertical) {
    rect(0, -34, 4, 13);
    rect(0, 34, 4, 13);
    rect(-4, -29, 12, 4);
    rect(4, 29, 12, 4);
  }
  if (showHorizontal) {
    rect(-34, 0, 13, 4);
    rect(34, 0, 13, 4);
    rect(-29, -4, 4, 12);
    rect(29, 4, 4, 12);
  }
  if (showReset) {
    rect(0, -34, 28, 4);
    rect(0, 34, 28, 4);
    rect(-34, 0, 4, 28);
    rect(34, 0, 4, 28);
  }
  fill(255, 246, 122, alpha);
  if (showVertical) {
    rect(0, -36, 4, 13);
    rect(0, 32, 4, 13);
    rect(-4, -31, 12, 4);
    rect(4, 27, 12, 4);
  }
  if (showHorizontal) {
    rect(-36, 0, 13, 4);
    rect(32, 0, 13, 4);
    rect(-31, -4, 4, 12);
    rect(27, 4, 4, 12);
  }
  if (showReset) {
    rect(0, -36, 28, 4);
    rect(0, 32, 28, 4);
    rect(-36, 0, 4, 28);
    rect(32, 0, 4, 28);
  }
  rectMode(CORNER);
}

function drawPickupHeart(effect) {
  const t = 1 - effect.life / effect.maxLife;
  const eased = easeOutCubic(t);
  const effectScale = effect.scale || 1;
  const alpha = map(effect.life, 0, effect.maxLife, 0, 255);
  const lift = 8 + eased * (effectScale > 1 ? 42 : 32);
  const wobble = sin((1 - effect.life / 5) * PI) * 4 * min(1.35, effectScale);
  const unit = lerp(3.2, 4.6, sin(t * PI));
  const heartColor = pickupColor(t, alpha);
  const plusColor = color(255, 246, 122, alpha);

  push();
  translate(effect.x + wobble, effect.y - lift);
  scale(effectScale * lerp(0.72, 1.18, sin(t * PI)));
  drawPixelGlyph(PLUS_GLYPH, -15, -8, unit, color(0, alpha * 0.72));
  drawPixelGlyph(PLUS_GLYPH, -17, -10, unit, plusColor);
  drawPixelGlyph(HEART_GLYPH, 2, -10, unit, color(0, alpha * 0.72));
  drawPixelGlyph(HEART_GLYPH, 0, -12, unit, heartColor);
  pop();
}

function pickupColor(t, alpha) {
  const pink = color(255, 119, 194, alpha);
  const hotPink = color(255, 76, 174, alpha);
  const yellow = color(255, 239, 87, alpha);
  const mint = color(236, 248, 213, alpha);
  if (t < 0.42) return lerpColor(pink, hotPink, t / 0.42);
  if (t < 0.72) return lerpColor(hotPink, yellow, (t - 0.42) / 0.3);
  return lerpColor(yellow, mint, (t - 0.72) / 0.28);
}

const PLUS_GLYPH = ["00100", "00100", "11111", "00100", "00100"];
const HEART_GLYPH = ["0110110", "1111111", "1111111", "0111110", "0011100", "0001000"];
const QUESTION_GLYPH = ["11110", "00010", "00100", "01000", "01000", "00000", "01000"];

function drawPixelGlyph(glyph, x, y, unit, fillColor) {
  fill(fillColor);
  noStroke();
  rectMode(CORNER);
  for (let row = 0; row < glyph.length; row += 1) {
    for (let col = 0; col < glyph[row].length; col += 1) {
      if (glyph[row][col] === "1") {
        rect(x + col * unit, y + row * unit, unit, unit);
      }
    }
  }
}

function wrap(value, minValue, maxValue) {
  const range = maxValue - minValue;
  return ((((value - minValue) % range) + range) % range) + minValue;
}

function easeOutCubic(value) {
  return 1 - pow(1 - constrain(value, 0, 1), 3);
}

function easeOutBack(value) {
  const t = constrain(value, 0, 1) - 1;
  return 1 + 2.2 * t * t * t + 1.2 * t * t;
}
