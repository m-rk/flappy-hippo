// Global variables
let birdImg, bgImg, pipeTopImg, pipeBottomImg, groundImg;
let bird;
let pipes = [];
let ground1, ground2;
let score = 0;
let gameOver = false;
let groundHeight = 50;
let scrollSpeed = 2;
let gameStarted = false;
let scale = 1;

// Load all images before the game starts
function preload() {
  birdImg = loadImage('hippo.png');        // Hippo sprite (PNG with transparent background)
  bgImg = loadImage('sky.png');            // Background sky image
  pipeTopImg = loadImage('pipe_top.png');  // Top pipe image
  pipeBottomImg = loadImage('pipe_bottom.png'); // Bottom pipe image
  groundImg = loadImage('ground.png');     // Ground image (tileable horizontally)
}

// Initialize the game
function setup() {
  createCanvas(windowWidth, windowHeight);
  // get max of window width and height
  scale = min(width, height) / 200;
  scrollSpeed = 10 * scale / 6;
  imageMode(CORNER); // Set image mode to CORNER for consistent positioning
}

// Reset the game state
function resetGame() {
  bird = new Bird();
  pipes = [];
  score = 0;
  gameOver = false;
  // pipes.push(new Pipe()); // Add an initial pipe
  ground1 = { x: 0 };
  ground2 = { x: width };
}

// Main game loop
function draw() {
  // Draw the background
  image(bgImg, 0, 0, width, height);

  if (!gameStarted) {
    textSize(20 * scale);
    fill(255);
    textAlign(CENTER);
    text("Tap to Start", width / 2, height / 2);
  } else if (!gameOver) {
    // Update and draw game elements when the game is active
    bird.update();

    // Manage pipes
    for (let i = pipes.length - 1; i >= 0; i--) {
      pipes[i].update();
      pipes[i].draw();

      // Increment score when bird passes a pipe
      if (pipes[i].x + pipes[i].width < bird.x && !pipes[i].passed) {
        score++;
        pipes[i].passed = true;
      }

      // Check for collisions with pipes
      if (
        rectOverlap(
          bird.x - bird.width / 2,
          bird.y - bird.height / 2,
          bird.width,
          bird.height,
          pipes[i].x,
          0,
          pipes[i].width,
          pipes[i].topHeight
        ) ||
        rectOverlap(
          bird.x - bird.width / 2,
          bird.y - bird.height / 2,
          bird.width,
          bird.height,
          pipes[i].x,
          pipes[i].topHeight + pipes[i].gapSize,
          pipes[i].width,
          height - pipes[i].topHeight - pipes[i].gapSize
        )
      ) {
        gameOver = true;
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

    // Draw and update scrolling ground
    image(groundImg, ground1.x, height - groundHeight, width, groundHeight);
    image(groundImg, ground2.x, height - groundHeight, width, groundHeight);
    ground1.x -= scrollSpeed;
    ground2.x -= scrollSpeed;
    if (ground1.x <= -width) ground1.x = width;
    if (ground2.x <= -width) ground2.x = width;

    // Draw the bird
    bird.draw();

    // Display the score
    textSize(20 * scale);
    fill(255);
    textAlign(CENTER);
    text(score, width / 2, (50 * scale));
  } else {
    // Display game over screen
    textSize(25 * scale);
    fill(255, 0, 0);
    textAlign(CENTER);
    text("Game Over", width / 2, height / 3);
    textSize(20 * scale);
    fill(255);
    text("Score: " + score, width / 2, height / 2);
    text("Tap to start", width / 2, height / 1.5);
  }
}

function click () {
  if (!gameStarted) {
    gameStarted = true;
    resetGame(); // Start the game on first tap
  } else if (gameOver) {
    resetGame();
  } else {
    bird.flap();
  }
}

// screen touch
function touchStarted() {
  click();
  return false;
}

// mouse click
function mousePressed() {
  click();
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
    this.width = 50 * scale;   // Width of the bird image
    this.height = 34 * scale;  // Height of the bird image
    this.velocity = 0;         // Vertical velocity
    this.gravity = 0.4 * (scale / 3);        // Gravity pulling the bird down
    this.jumpStrength = -6 * (scale / 2);    // Velocity boost when flapping
  }

  update() {
    this.velocity += this.gravity; // Apply gravity
    this.y += this.velocity;       // Update position

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
    // Rotate the bird based on velocity for a polished effect
    let angle = map(this.velocity, -10, 10, -45, 45); // Map velocity to angle
    let angleRad = radians(angle);                    // Convert to radians
    push();
    translate(this.x, this.y);                        // Move to bird's position
    rotate(angleRad);                                 // Rotate based on velocity
    image(birdImg, -this.width / 2, -this.height / 2, this.width, this.height); // Draw centered
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
    this.passed = false;                        // Track if bird has passed this pipe
  }

  update() {
    this.x -= scrollSpeed; // Move pipe left
  }

  draw() {
    // Draw top pipe
    image(pipeBottomImg, this.x, 0, this.width, this.topHeight);
    // Draw bottom pipe
    let bottomY = this.topHeight + this.gapSize;
    let bottomHeight = height - bottomY;
    image(pipeBottomImg, this.x, bottomY, this.width, bottomHeight);
  }

  offscreen() {
    return this.x < -this.width; // Check if pipe is off-screen
  }
}

// Collision detection helper function
function rectOverlap(x1, y1, w1, h1, x2, y2, w2, h2) {
  return x1 < x2 + w2 && x1 + w1 > x2 && y1 < y2 + h2 && y1 + h1 > y2;
}