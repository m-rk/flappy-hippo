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

const PLAYER_VELOCITY_MULT = 1.5;
const GROWTH_BASE = 0.12;
const GROWTH_FALLOFF = 0.6;
const PIPE_GAP_MULT = 1.5;
const BASE_SPEED = 2.08;
const PIPE_W = 62;
const PIPE_LIP_H = 30;
const READY_PLAYER_Y = 318;
const MUSIC_SRC = "assets/audio/mario-fart.mp3";
const MUSIC_VOLUME = 0.32;
const SOUND_EFFECTS = {
  jump: { src: "assets/audio/candidates/jump-select-003.wav", volume: 0.64 },
  collect: { src: "assets/audio/candidates/collect-select-006.wav", volume: 0.58 },
  crash: { src: "assets/audio/candidates/crash-lose-trumpet.ogg", volume: 0.8 },
  start: { src: "assets/audio/candidates/ui-start-toggle-001.wav", volume: 0.56 }
};

let fitScale = 1;
let fitX = 0;
let fitY = 0;
let hippoFrames = [];
let faceImg;
let faceOutlineImg;
let musicTrack = null;
let musicStarted = false;
let sfxTracks = {};
let clouds = [];
let obstacles = [];
let particles = [];
let collectionEffects = [];
let deathEffect = null;
let deathPieces = [];
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

function preload() {
  for (let i = 1; i <= FRAME_COUNT; i += 1) {
    const id = String(i).padStart(3, "0");
    hippoFrames.push(loadImage(`assets/hippo/player/hippo-${id}.png`));
  }
  faceImg = loadImage("assets/hippo/face.png");
}

function setup() {
  const canvas = createCanvas(windowWidth, windowHeight);
  canvas.parent("game-root");
  pixelDensity(Math.min(2, window.devicePixelRatio || 1));
  noSmooth();
  textFont('"Courier New", monospace');
  updateFit();
  bestScore = Number(localStorage.getItem("flappy-hippo-best") || 0);
  faceOutlineImg = buildFaceOutlineImage(4);
  setupAudio();
  clouds = makeClouds();
  resetRun();
  state = "ready";

  window.__FLAPPY_HIPPO_GAME__ = {
    flap: handleAction,
    snapshot: () => ({
      state,
      score,
      bestScore,
      obstacles: obstacles.length,
      obstacleState: obstacles.map((obstacle) => ({
        x: Math.round(obstacle.x),
        top: Math.round(obstacle.top),
        gap: Math.round(obstacle.gap),
        collected: obstacle.collected
      })),
      player: {
        x: Math.round(player.x),
        y: Math.round(player.y),
        scale: Number(player.scale.toFixed(3)),
        targetScale: Number(player.targetScale.toFixed(3))
      },
      death: deathEffect
        ? {
            life: Math.round(deathEffect.life),
            maxLife: deathEffect.maxLife,
            pieces: deathPieces.length,
            faces: deathPieces.filter((piece) => piece.face).length
          }
        : null,
      audio: {
        musicReady: Boolean(musicTrack),
        musicStarted,
        sfxReady: Object.keys(sfxTracks)
      },
      frames: hippoFrames.length
    })
  };
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  updateFit();
}

function updateFit() {
  fitScale = Math.min(width / WORLD_W, height / WORLD_H);
  fitX = (width - WORLD_W * fitScale) / 2;
  fitY = (height - WORLD_H * fitScale) / 2;
}

function viewBounds() {
  return {
    left: -fitX / fitScale,
    right: (width - fitX) / fitScale,
    top: -fitY / fitScale,
    bottom: (height - fitY) / fitScale
  };
}

function setupAudio() {
  if (typeof Audio === "undefined") return;
  musicTrack = new Audio(MUSIC_SRC);
  musicTrack.loop = true;
  musicTrack.preload = "auto";
  musicTrack.volume = MUSIC_VOLUME;

  sfxTracks = {};
  for (const [name, config] of Object.entries(SOUND_EFFECTS)) {
    const track = new Audio(config.src);
    track.preload = "auto";
    track.volume = config.volume;
    sfxTracks[name] = track;
  }
}

function startMusic() {
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
  const baseTrack = sfxTracks[name];
  if (!baseTrack) return;

  const track = baseTrack.cloneNode();
  track.volume = baseTrack.volume;
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
  score = 0;
  spawnTimer = 46;
  groundOffset = 0;
  lowerCloudOffset = 0;
  crashCooldown = 0;
  crashUiFrame = 0;
}

function draw() {
  drawingContext.imageSmoothingEnabled = false;
  background(123, 197, 205);

  push();
  translate(fitX, fitY);
  scale(fitScale);
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
  pop();
}

function updateReady() {
  player.y = READY_PLAYER_Y + sin(frameCount * 0.08) * 9;
  player.vy = sin(frameCount * 0.08) * 0.85;
  player.rot = sin(frameCount * 0.07) * 0.05;
  player.scale = lerp(player.scale, player.targetScale, 0.12);
  groundOffset = (groundOffset + 0.45) % 48;
}

function updatePlaying() {
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
    if (!obstacle.collected && faceHalfCovered(obstacle)) {
      collectFace(obstacle);
    }
  }
  obstacles = obstacles.filter((obstacle) => obstacle.x > -120);

  if (hitsAnyObstacle() || player.y + PLAYER_GROUND_RADIUS * player.scale >= GROUND_Y || player.y < 18) {
    crash();
  }
}

function updateCrash() {
  crashCooldown = max(0, crashCooldown - 1);
  crashUiFrame += 1;
}

function updateDying() {
  if (!deathEffect) {
    state = "crashed";
    return;
  }

  deathEffect.life -= 1;
  const age = deathEffect.maxLife - deathEffect.life;
  if (!deathEffect.burstDone && age >= 12) {
    deathEffect.burstDone = true;
    makeDeathPieces(deathEffect.x, deathEffect.y, deathEffect.scale, deathEffect.score);
    burst(
      deathEffect.x,
      deathEffect.y,
      color(255, 239, 87),
      Math.round(20 * deathEffect.scale),
      1.2 + deathEffect.scale * 0.35,
      0.9 + deathEffect.scale * 0.45
    );
    burst(
      deathEffect.x + 8 * deathEffect.scale,
      deathEffect.y - 5 * deathEffect.scale,
      color(236, 248, 213),
      Math.round(14 * deathEffect.scale),
      1.1 + deathEffect.scale * 0.25,
      0.8 + deathEffect.scale * 0.35
    );
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

  if (state === "ready") {
    playSfx("start");
    resetRun();
    state = "playing";
    flap({ silent: true });
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

function flap(options = {}) {
  if (!options.silent) playSfx("jump");
  player.vy = (-7.35 * PLAYER_VELOCITY_MULT) / max(1, player.scale);
  player.rot = -0.36;
  burst(player.x - 22, player.y + 18, color(236, 248, 213), 5);
}

function crash() {
  if (state !== "playing") return;
  playSfx("crash");
  const popScale = player.scale;
  const popX = player.x;
  const popY = constrain(player.y, 30, GROUND_Y - PLAYER_GROUND_RADIUS * popScale);
  const frameIdx = Math.floor(frameCount / 3) % hippoFrames.length;

  player.y = popY;
  player.vy = 0;
  state = "dying";
  crashCooldown = 0;
  deathEffect = {
    x: popX,
    y: popY,
    scale: popScale,
    rot: player.rot,
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
  handleAction();
  return false;
}

function touchStarted() {
  handleAction();
  return false;
}

function spawnObstacle() {
  const gap = random(162, 176) * PIPE_GAP_MULT;
  const marginTop = 82;
  const marginBottom = 116;
  const firstTop = 292 - gap * 0.5;
  const top = score === 0 && obstacles.length === 0 ? firstTop : random(marginTop, GROUND_Y - marginBottom - gap);
  obstacles.push({
    x: WORLD_W + 34,
    w: PIPE_W,
    top,
    gap,
    collected: false
  });
}

function collectFace(obstacle) {
  obstacle.collected = true;
  playSfx("collect");
  score += 1;
  bestScore = max(bestScore, score);
  localStorage.setItem("flappy-hippo-best", String(bestScore));

  const growth = GROWTH_BASE / pow(score, GROWTH_FALLOFF);
  player.growth += growth;
  player.targetScale = 1 + player.growth;

  const faceX = obstacle.x + obstacle.w * 0.5;
  const faceY = obstacle.top + obstacle.gap * 0.5;
  collectionEffects.push({
    x: faceX,
    y: faceY,
    life: 34,
    maxLife: 34
  });
  burst(faceX, faceY, color(236, 248, 213), 12);
}

function faceHalfCovered(obstacle) {
  const faceX = obstacle.x + obstacle.w * 0.5;
  const playerFront = player.x + (PLAYER_BASE_W - PLAYER_ANCHOR_X) * player.scale - FACE_W * 0.5;
  return faceX < playerFront;
}

function hitsAnyObstacle() {
  const h = hitbox();
  for (const obstacle of obstacles) {
    const bottomY = obstacle.top + obstacle.gap;
    const topRects = [
      { x: obstacle.x, y: -40, w: obstacle.w, h: obstacle.top - PIPE_LIP_H + 40 },
      { x: obstacle.x - 8, y: obstacle.top - PIPE_LIP_H, w: obstacle.w + 16, h: PIPE_LIP_H }
    ];
    const bottomRects = [
      { x: obstacle.x - 8, y: bottomY, w: obstacle.w + 16, h: PIPE_LIP_H },
      { x: obstacle.x, y: bottomY + PIPE_LIP_H, w: obstacle.w, h: GROUND_Y - bottomY - PIPE_LIP_H }
    ];
    for (const rect of topRects.concat(bottomRects)) {
      if (overlaps(h, rect)) return true;
    }
  }
  return false;
}

function hitbox() {
  return {
    x: player.x - PLAYER_HIT_W * player.scale * 0.55,
    y: player.y - PLAYER_HIT_H * player.scale * 0.52,
    w: PLAYER_HIT_W * player.scale,
    h: PLAYER_HIT_H * player.scale
  };
}

function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function drawBackdrop() {
  const view = viewBounds();
  noStroke();
  fill(123, 197, 205);
  rect(view.left, view.top, view.right - view.left, view.bottom - view.top);

  cloudOffset += state === "playing" ? 0.27 : 0.1;
  lowerCloudOffset += lowerCloudAdvance();
  for (const cloud of clouds) {
    const x = wrap(cloud.x - cloudOffset * cloud.speed, view.left - 110, view.right + 110);
    drawPixelCloud(x, cloud.y, cloud.s);
  }

  drawLowerCloudLayer(view, GROUND_Y - 76, 0.78, 0.23, 126, 0, 206);
  drawLowerCloudLayer(view, GROUND_Y - 52, 1, 0.46, 98, 35, 244);
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
  push();
  translate(x, y);
  scale(s);
  drawCloudPuffs(0, 0, 1, 245);
  pop();
}

function drawLowerCloudLayer(view, y, s, speed, spacing, phase, alpha) {
  const left = view.left - 150;
  const right = view.right + 150;
  const offset = wrap(lowerCloudOffset * speed + phase, 0, spacing);

  for (let x = left - offset; x < right; x += spacing) {
    drawBottomCloud(x, y, s, alpha);
  }
}

function drawBottomCloud(x, y, s, alpha) {
  push();
  translate(x, y);
  scale(s);
  drawCloudPuffs(0, 0, 1.25, alpha);
  pop();
}

function drawCloudPuffs(x, y, s, alpha) {
  push();
  translate(x, y);
  scale(s);
  noStroke();
  fill(218, 246, 207, alpha * 0.82);
  ellipse(-42, 20, 58, 34);
  ellipse(26, 22, 88, 38);
  ellipse(70, 26, 48, 24);
  fill(232, 250, 219, alpha);
  ellipse(-22, 14, 62, 40);
  ellipse(20, 1, 76, 54);
  ellipse(62, 17, 58, 36);
  rect(-54, 19, 130, 26);
  fill(244, 254, 232, alpha * 0.62);
  ellipse(4, -4, 44, 30);
  ellipse(45, 14, 38, 22);
  pop();
}

function drawObstacles() {
  for (const obstacle of obstacles) {
    drawObstacle(obstacle);
  }
}

function drawObstacle(obstacle) {
  const bottomY = obstacle.top + obstacle.gap;
  drawPipe(obstacle.x, -40, obstacle.w, obstacle.top + 40, true);
  drawPipe(obstacle.x, bottomY, obstacle.w, GROUND_Y - bottomY, false);
  if (!obstacle.collected) {
    drawCollectibleFace(obstacle.x + obstacle.w * 0.5, obstacle.top + obstacle.gap * 0.5);
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

function drawCollectibleFace(x, y) {
  imageMode(CENTER);
  image(faceImg, x, y, FACE_W, FACE_H);
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
  const idx = Math.floor(frameCount / frameStep) % hippoFrames.length;
  const img = hippoFrames[idx];
  const w = PLAYER_BASE_W * player.scale;
  const h = PLAYER_BASE_H * player.scale;
  const anchorX = PLAYER_ANCHOR_X * player.scale;
  const anchorY = PLAYER_ANCHOR_Y * player.scale;

  push();
  translate(player.x, player.y);
  rotate(player.rot);
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
  const view = viewBounds();
  const left = view.left - 80;
  const right = view.right + 80;
  const widthToFill = right - left;

  noStroke();
  fill(0);
  rect(left, GROUND_Y - 1, widthToFill, 5);
  fill(140, 231, 83);
  rect(left, GROUND_Y + 4, widthToFill, view.bottom - GROUND_Y);
  fill(74, 180, 61);
  rect(left, GROUND_Y + 4, widthToFill, 7);

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
    drawCanvasButton(WORLD_W / 2, 430, "START");
    return;
  }

  drawGameOverScore();
  drawBitmapText(`BEST ${bestScore}`, WORLD_W / 2, 316, 3, color(255));
  drawCanvasButton(WORLD_W / 2, 430, "AGAIN");
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

function burst(x, y, c, count, power = 1, sizeScale = 1) {
  for (let i = 0; i < count; i += 1) {
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
    color(236, 248, 213),
    color(255, 239, 87),
    color(64, 196, 70),
    color(91, 92, 95),
    color(255),
    color(0)
  ];
  const faceCount = max(0, floor(faceScore || 0));
  const count = Math.round(24 + 18 * popScale) + faceCount;

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
  for (const piece of deathPieces) {
    piece.x += piece.vx;
    piece.y += piece.vy;
    piece.vy += 0.15;
    piece.rot += piece.vr;
    piece.life -= 1;

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
      fill(red(piece.c), green(piece.c), blue(piece.c), alpha);
      rect(0, 0, piece.size, piece.size);
      rectMode(CORNER);
    }
    pop();
  }
  deathPieces = deathPieces.filter((piece) => piece.life > 0);
}

function updateParticles() {
  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.16;
    p.life -= 1;
    const alpha = map(p.life, 0, p.maxLife, 0, 255);
    fill(red(p.c), green(p.c), blue(p.c), alpha);
    noStroke();
    rect(p.x, p.y, p.size, p.size);
  }
  particles = particles.filter((p) => p.life > 0);
}

function drawCollectionEffects() {
  for (const effect of collectionEffects) {
    drawPickupHeart(effect);
    effect.life -= 1;
  }
  collectionEffects = collectionEffects.filter((effect) => effect.life > 0);
}

function drawPickupHeart(effect) {
  const t = 1 - effect.life / effect.maxLife;
  const eased = easeOutCubic(t);
  const alpha = map(effect.life, 0, effect.maxLife, 0, 255);
  const lift = 8 + eased * 32;
  const wobble = sin((1 - effect.life / 5) * PI) * 4;
  const unit = lerp(3.2, 4.6, sin(t * PI));
  const heartColor = pickupColor(t, alpha);
  const plusColor = color(255, 246, 122, alpha);

  push();
  translate(effect.x + wobble, effect.y - lift);
  scale(lerp(0.72, 1.18, sin(t * PI)));
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
