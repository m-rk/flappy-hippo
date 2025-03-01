// Global variables
let birdImg, bgImg, pipeTopImg, pipeBottomImg, groundImg;
let bird;
let pipes = [];
let ground1, ground2;
let score = 0;
let gameOver = false;
let groundHeight = 50;
let speed = 2;

// Load all images before the game starts
function preload() {
  birdImg = loadImage('hippo.png');        // Hippo sprite (PNG with transparent background)
  bgImg = loadImage('sky.jpg');            // Background sky image
  pipeTopImg = loadImage('pipe_top.png');  // Top pipe image
  pipeBottomImg = loadImage('pipe_bottom.png'); // Bottom pipe image
  groundImg = loadImage('ground.png');     // Ground image (tileable horizontally)
}

// Initialize the game
function setup() {
  createCanvas(400, 600);
  imageMode(CORNER); // Set image mode to CORNER for consistent positioning
  reset();           // Start with a fresh game state
}

// Reset the game state
function reset() {
  bird = new Bird();
  pipes = [];
  score = 0;
  gameOver = false;
  pipes.push(new Pipe()); // Add an initial pipe
  ground1 = { x: 0 };
  ground2 = { x: width };
}

// Main game loop
function draw() {
  // Draw the background
  image(bgImg, 0, 0, width, height);

  if (!gameOver) {
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
    ground1.x -= speed;
    ground2.x -= speed;
    if (ground1.x <= -width) ground1.x = width;
    if (ground2.x <= -width) ground2.x = width;

    // Draw the bird
    bird.draw();

    // Display the score
    textSize(32);
    fill(255);
    textAlign(CENTER);
    text(score, width / 2, 50);
  } else {
    // Display game over screen
    textSize(48);
    fill(255, 0, 0);
    textAlign(CENTER);
    text("Game Over", width / 2, height / 2 - 50);
    textSize(32);
    fill(255);
    text("Score: " + score, width / 2, height / 2);
    text("Click to restart", width / 2, height / 2 + 50);
  }
}

// Handle mouse click for flapping or restarting
function mousePressed() {
  if (gameOver) {
    reset();
  } else {
    bird.flap();
  }
}

// Handle space key for flapping or restarting
function keyPressed() {
  if (key === ' ') {
    if (gameOver) {
      reset();
    } else {
      bird.flap();
    }
  }
}

// Bird class to manage the hippo sprite
class Bird {
  constructor() {
    this.x = 100;              // Fixed x-position
    this.y = height / 2;       // Start in the middle
    this.width = 50;           // Width of the bird image
    this.height = 50;          // Height of the bird image
    this.velocity = 0;         // Vertical velocity
    this.gravity = 0.5;        // Gravity pulling the bird down
    this.jumpStrength = -10;   // Velocity boost when flapping
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
    this.width = 50;                            // Width of the pipe
    this.gapSize = 100;                         // Size of the gap
    this.topHeight = random(50, height - groundHeight - this.gapSize - 50); // Random top pipe height
    this.passed = false;                        // Track if bird has passed this pipe
  }

  update() {
    this.x -= speed; // Move pipe left
  }

  draw() {
    // Draw top pipe
    image(pipeTopImg, this.x, 0, this.width, this.topHeight);
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