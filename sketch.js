// Global variables
let hippoHangImg, hippoBounceImg, hippoBounceBlinkImg, hippoJumpImg, hippoJumpBlinkImg, hippoFallImg; 
let bgImg, pipeBodyImg, pipeLipImg, pipeLipBottomImg, groundImg;
let hippo;
let pipes = [];
let ground1, ground2;
let groundWidth = 731;
let score = 0;
let gameOver = false;
let groundHeight = 50;
let scrollSpeed = 2;
let gameStarted = false;
let scale = 1;
let audioInitialized = false;
let backgroundMusic;
let interactionAllowed = true;
let isBlinking = false;

// Load all images before the game starts
function preload() {
  hippoHangImg = loadImage('moodeng-hang.png');
  hippoBounceImg = loadImage('moodeng-bounce.png');
  hippoBounceBlinkImg = loadImage('moodeng-bounce-blink.png');
  hippoJumpImg = loadImage('moodeng-jump.png');
  hippoJumpBlinkImg = loadImage('moodeng-jump-blink.png');
  hippoFallImg = loadImage('moodeng-fall.png');
  bgImg = loadImage('sky.png');            // Background sky image
  pipeBodyImg = loadImage('pipe_body.png');
  pipeLipTopImg = loadImage('pipe_lip_top.png');
  pipeLipBottomImg = loadImage('pipe_lip_bottom.png');
  groundImg = loadImage('ground.png');     // Ground image (tileable horizontally)
  backgroundMusic = loadSound('mario-fart.mp3');
}

// Initialize the game
function setup() {
  createCanvas(windowWidth, windowHeight);
  // get max of window width and height
  scale = min(width, height) / 200;
  imageMode(CORNER); // Set image mode to CORNER for consistent positioning

  if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
    // iOS 13+ devices
    document.body.addEventListener('touchstart', initAudio);
    document.body.addEventListener('mousedown', initAudio);
  } else {
    // Non iOS 13+ devices
    initAudio();
  }
}

function initAudio() {
  if (!audioInitialized) {
    userStartAudio().then(() => {
      audioInitialized = true;
      if (backgroundMusic) {
        backgroundMusic.setVolume(0.5);
      }
    });
  }
}

// Reset the game state
function resetGame() {
  hippo = new Bird();
  pipes = [];
  score = 0;
  gameOver = false;
  scrollSpeed = 10 * scale / 6;
  ground1 = { x: 0 };
  ground2 = { x: groundWidth };
  interactionAllowed = true;
  if (backgroundMusic && !backgroundMusic.isPlaying()) {
    backgroundMusic.loop();
  }
}

// Main game loop
function draw() {
  // Draw the background
  background(128, 198, 212); // sky blue

  let imgRatio = bgImg.width / bgImg.height;
  let canvasRatio = width / height;
  
  let bgWidth, bgHeight, bgX, bgY;
  
  if (canvasRatio > imgRatio) {
    // Canvas is wider than image ratio - scale to width
    bgWidth = width;
    bgHeight = width / imgRatio;
    bgX = 0;
    bgY = (height - bgHeight) / 2; // Center vertically
  } else {
    // Canvas is taller than image ratio - scale to height
    bgHeight = height;
    bgWidth = height * imgRatio;
    bgX = (width - bgWidth) / 2; // Center horizontally
    bgY = 0;
  }
  
  // Draw the background image with proper proportions
  image(bgImg, bgX, bgY, bgWidth, bgHeight);

  if (!gameStarted) {
    textSize(20 * scale);
    fill(255);
    textAlign(CENTER);
    text("Tap to Start", width / 2, height / 2);
  } else {
    // Update and draw game elements when the game is active
    hippo.update();

    // Draw and update scrolling ground
    image(groundImg, ground1.x, height - groundHeight, groundWidth, groundHeight);
    image(groundImg, ground2.x, height - groundHeight, groundWidth, groundHeight);
    ground1.x -= scrollSpeed;
    ground2.x -= scrollSpeed;
    if (ground1.x <= -groundWidth) ground1.x = groundWidth;
    if (ground2.x <= -groundWidth) ground2.x = groundWidth;

    // Manage pipes
    for (let i = pipes.length - 1; i >= 0; i--) {
      pipes[i].update();
      pipes[i].draw();

      // Increment score when hippo passes a pipe
      if (pipes[i].x + pipes[i].width < hippo.x && !pipes[i].passed) {
        score++;
        pipes[i].passed = true;
      }

      // Check for collisions with pipes
      if (
        rectOverlap(
          hippo.x - hippo.width / 2,
          hippo.y - hippo.height / 2,
          hippo.width,
          hippo.height,
          pipes[i].x,
          0,
          pipes[i].width,
          pipes[i].topHeight
        ) ||
        rectOverlap(
          hippo.x - hippo.width / 2,
          hippo.y - hippo.height / 2,
          hippo.width * 0.8,
          hippo.height * 0.9,
          pipes[i].x,
          pipes[i].topHeight + pipes[i].gapSize,
          pipes[i].width,
          height - pipes[i].topHeight - pipes[i].gapSize
        )
      ) {
        gameOver = true;
        scrollSpeed = 0;
      }

      // Remove pipes that are off-screen
      if (pipes[i].offscreen()) {
        pipes.splice(i, 1);
      }
    }

    // Generate new pipes every 100 frames
    if (frameCount % 100 === 0) {
      pipes.push(new Pipe());
    }

    // Draw the hippo
    hippo.draw();

    if (!gameOver) {
      // Display the score
      textSize(20 * scale);
      fill(255);
      textAlign(CENTER);
      text(score, width / 2, (50 * scale));
    } else {
      // Game over
      interactionAllowed = false;
      setTimeout(() => { interactionAllowed = true; }, 1000);
      textSize(25 * scale);
      fill(255, 0, 0);
      textAlign(CENTER);
      text("Game Over", width / 2, height / 3);
      textSize(20 * scale);
      fill(255);
      text("Score: " + score, width / 2, height / 2);
      text("Tap to restart", width / 2, height / 1.5);
      if (backgroundMusic && backgroundMusic.isPlaying()) {
        backgroundMusic.stop();
      }
    }
  }
}

function click() {
  if (!interactionAllowed) return;

  if (!audioInitialized) {
    initAudio();
  }

  if (!gameStarted) {
    gameStarted = true;
    resetGame(); // Start the game on first tap
  } else if (gameOver) {
    resetGame();
  } else {
    // in-game click
    if (random(1) < 0.3) {
      isBlinking = true;
    }
    hippo.flap();
  }
}

// screen touch
function touchStarted() {
  getAudioContext().resume();
  if (backgroundMusic && !backgroundMusic.isPlaying()) {
    backgroundMusic.play(); // This will play the sound in a loop
    backgroundMusic.setVolume(0.5); // Set volume to 50%
  }
  click();
  return false;
}

// mouse click
function mousePressed() {
  click();
  return false;
}

// space key press
function keyPressed() {
  if (key === ' ') {
    click();
  }
}

// Bird class to manage the hippo sprite
class Bird {
  constructor() {
    this.x = width / 3;        // Fixed x-position
    this.y = height / 2;       // Start in the middle
    this.width = 50 * scale;   // Width of the hippo image
    this.height = 34 * scale;  // Height of the hippo image
    this.velocity = 0;         // Vertical velocity
    this.gravity = 0.4 * (scale / 3);        // Gravity pulling the hippo down
    this.jumpStrength = -6 * (scale / 2);    // Velocity boost when flapping
  }

  update() {
    if (!gameOver) {
      this.y += this.velocity;       // Update position
    }
    this.velocity += this.gravity; // Apply gravity

    // Check collision with ground
    if (this.y + this.height / 2 >= height - groundHeight) {
      this.y = height - groundHeight - this.height / 2;
      gameOver = true;
    }

    // Check collision with top of the screen
    if (this.y - this.height / 2 <= 0) {
      this.y = this.height / 2;
      gameOver = true;
    }
  }

  draw() {
    // Rotate the hippo based on velocity for a polished effect
    let angle = map(this.velocity, -10, 10, -45, 45); // Map velocity to angle
    let angleRad = radians(angle);                    // Convert to radians
    let hippoImg = hippoHangImg;
    if (angle < -10) {
      hippoImg = (isBlinking) ? hippoBounceBlinkImg : hippoBounceImg;
    } else if (angle < 0) {
      hippoImg = (isBlinking) ? hippoJumpBlinkImg : hippoJumpImg;
    } else {
      // falling
      isBlinking = false;
      if (angle > 10) {
        hippoImg = hippoFallImg;
      }
    }
    push();
    translate(this.x, this.y);                        // Move to hippo's position
    rotate(angleRad);                                 // Rotate based on velocity
    image(hippoImg, -this.width / 2, -this.height / 2, this.width, this.height); // Draw centered
    pop();
  }

  flap() {
    this.velocity = this.jumpStrength; // Boost upwards
  }
}

// Pipe class to manage obstacles
class Pipe {
  constructor() {
    this.x = width;                             // Start at the right edge
    this.width = 50 * scale;                    // Width of the pipe
    this.gapSize = 120 * (scale);           // Size of the gap
    this.topHeight = random(50 * (scale / 2), height - groundHeight - this.gapSize - (50 * (scale / 2))); // Random top pipe height
    this.passed = false;                        // Track if hippo has passed this pipe
  }

  update() {
    this.x -= scrollSpeed; // Move pipe left
  }

  draw() {
    // Draw top pipe
    image(pipeBodyImg, this.x, 0, this.width, this.topHeight);
    image(pipeLipTopImg, this.x, this.topHeight - (pipeLipTopImg.height * scale / 2), this.width, pipeLipTopImg.height * scale / 2);
    
    // Draw bottom pipe
    let bottomY = this.topHeight + this.gapSize;
    let bottomHeight = height - bottomY;
    image(pipeBodyImg, this.x, bottomY, this.width, bottomHeight);
    image(pipeLipBottomImg, this.x, bottomY, this.width, pipeLipBottomImg.height * scale / 2);
  }

  offscreen() {
    return this.x < -this.width; // Check if pipe is off-screen
  }
}

// Collision detection helper function
function rectOverlap(x1, y1, w1, h1, x2, y2, w2, h2) {
  return x1 < x2 + w2 && x1 + w1 > x2 && y1 < y2 + h2 && y1 + h1 > y2;
}