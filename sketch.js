
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 500;

let cellSize = 8;
let cols;
let rows;
let grid = [];

let ants = [];
let nextAntId = 0;

let paused = false;
let antSpeed = 3;
let flockStrength = 0.7;

let trailLayer;
let gridLayer;

const STARTING_ANTS = 15;
const MAX_ANTS = 100;

const BOID_RADIUS = 12;
const SEPARATION_DISTANCE = 4;

const SEPARATION_WEIGHT = 2.0;
const ALIGNMENT_WEIGHT = 1.0;
const COHESION_WEIGHT = 1.0;

const antRules = [
    { emptyTurn: 1, filledTurn: -1 },
    { emptyTurn: -1, filledTurn: 1 },
    { emptyTurn: 1, filledTurn: 0 }
];

const BACKGROUND = "#080810";
const GRID_COLOR = "#25223b";

// --------------------------------------------------
// SETUP
// --------------------------------------------------

function setup() {
    const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
    canvas.parent("canvas-container");

    pixelDensity(1);
    frameRate(60);

    initializeGrid();
    createGraphicsLayers();
    createStartingAnts();
    setupControls();
    updateInterface();
}

// --------------------------------------------------
// GRID AND GRAPHICS LAYERS
// --------------------------------------------------

function initializeGrid() {
    cols = floor(width / cellSize);
    rows = floor(height / cellSize);

    grid = new Array(cols);

    for (let x = 0; x < cols; x++) {
        grid[x] = new Array(rows).fill(null);
    }
}

function createGraphicsLayers() {
    // Trail layer: only redraw when cells change.
    trailLayer = createGraphics(width, height);
    trailLayer.pixelDensity(1);
    trailLayer.clear();

    // Grid layer: draw once and reuse every frame.
    gridLayer = createGraphics(width, height);
    gridLayer.pixelDensity(1);
    gridLayer.clear();

    gridLayer.stroke(GRID_COLOR);
    gridLayer.strokeWeight(0.5);

    for (let x = 0; x <= cols; x++) {
        gridLayer.line(
            x * cellSize,
            0,
            x * cellSize,
            height
        );
    }

    for (let y = 0; y <= rows; y++) {
        gridLayer.line(
            0,
            y * cellSize,
            width,
            y * cellSize
        );
    }
}

function clearGrid() {
    for (let x = 0; x < cols; x++) {
        grid[x].fill(null);
    }

    trailLayer.clear();
}

function countFilledCells() {
    let total = 0;

    for (let x = 0; x < cols; x++) {
        for (let y = 0; y < rows; y++) {
            if (grid[x][y] !== null) {
                total++;
            }
        }
    }

    return total;
}

// --------------------------------------------------
// ANT COLORS
// --------------------------------------------------

function getAntColor(id) {
    const startingColors = [
        "#ff35c8",
        "#32e6ff",
        "#a66cff"
    ];

    if (id < startingColors.length) {
        return startingColors[id];
    }

    // Golden-angle hue distribution for distinct colors.
    const hue = (id * 137.508) % 360;

    return hslToHex(hue, 100, 65);
}

function hslToHex(h, s, l) {
    s /= 100;
    l /= 100;

    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);

    const f = n => {
        const color = l - a * Math.max(
            -1,
            Math.min(k(n) - 3, Math.min(9 - k(n), 1))
        );

        return Math.round(255 * color)
            .toString(16)
            .padStart(2, "0");
    };

    return `#${f(0)}${f(8)}${f(4)}`;
}

// --------------------------------------------------
// CREATE ANTS
// --------------------------------------------------

function createAnt(x, y) {
    if (ants.length >= MAX_ANTS) {
        return;
    }

    const id = nextAntId++;

    const ant = {
        id: id,
        x: x,
        y: y,
        direction: floor(random(4)),
        rule: antRules[id % antRules.length],
        color: getAntColor(id)
    };

    ants.push(ant);
}

function createStartingAnts() {
    ants = [];
    nextAntId = 0;

    const centerX = floor(cols / 2);
    const centerY = floor(rows / 2);

    // Start as a cluster to showcase flocking.
    for (let i = 0; i < STARTING_ANTS; i++) {
        const angle = random(TWO_PI);
        const distance = random(2, 9);

        const x = Math.round(
            centerX + Math.cos(angle) * distance
        );

        const y = Math.round(
            centerY + Math.sin(angle) * distance
        );

        createAnt(
            (x + cols) % cols,
            (y + rows) % rows
        );
    }
}

function addAnt() {
    if (ants.length >= MAX_ANTS) {
        return;
    }

    // Spawn near an existing ant to encourage interaction.
    const source = random(ants);

    const x = source
        ? (source.x + floor(random(-5, 6)) + cols) % cols
        : floor(random(cols));

    const y = source
        ? (source.y + floor(random(-5, 6)) + rows) % rows
        : floor(random(rows));

    createAnt(x, y);
    updateInterface();
}

function removeAnt() {
    if (ants.length <= 1) {
        return;
    }

    ants.pop();
    updateInterface();
}

// --------------------------------------------------
// DIRECTION HELPERS
// --------------------------------------------------

function getDirectionVector(direction) {
    const directions = [
        { x: 0, y: -1 },
        { x: 1, y: 0 },
        { x: 0, y: 1 },
        { x: -1, y: 0 }
    ];

    return directions[direction];
}

function shortestWrappedDistance(a, b, size) {
    let difference = a - b;

    if (difference > size / 2) {
        difference -= size;
    }

    if (difference < -size / 2) {
        difference += size;
    }

    return difference;
}

function normalizeVector(x, y) {
    const magnitude = Math.sqrt(x * x + y * y);

    if (magnitude < 0.0001) {
        return { x: 0, y: 0 };
    }

    return {
        x: x / magnitude,
        y: y / magnitude
    };
}

// --------------------------------------------------
// ALGORITHM 1: LANGTON'S ANT
// --------------------------------------------------

function applyLangtonRule(ant) {
    const filled = grid[ant.x][ant.y] !== null;

    if (filled) {
        ant.direction = (
            ant.direction + ant.rule.filledTurn + 4
        ) % 4;

        // Erase the previous trail cell.
        grid[ant.x][ant.y] = null;

        trailLayer.erase();

        trailLayer.rect(
            ant.x * cellSize,
            ant.y * cellSize,
            cellSize,
            cellSize
        );

        trailLayer.noErase();
    } else {
        ant.direction = (
            ant.direction + ant.rule.emptyTurn + 4
        ) % 4;

        // Paint the cell with this ant's color.
        grid[ant.x][ant.y] = ant.color;

        trailLayer.noStroke();
        trailLayer.fill(ant.color);

        trailLayer.rect(
            ant.x * cellSize,
            ant.y * cellSize,
            cellSize,
            cellSize
        );
    }
}

// --------------------------------------------------
// ALGORITHM 2: BOIDS SPATIAL HASH
// --------------------------------------------------

function buildSpatialHash() {
    const bucketSize = BOID_RADIUS;

    const bucketCols = Math.ceil(cols / bucketSize);
    const bucketRows = Math.ceil(rows / bucketSize);

    const buckets = new Map();

    for (const ant of ants) {
        const bx = floor(ant.x / bucketSize);
        const by = floor(ant.y / bucketSize);

        const key = `${bx},${by}`;

        if (!buckets.has(key)) {
            buckets.set(key, []);
        }

        buckets.get(key).push(ant);
    }

    return {
        buckets,
        bucketSize,
        bucketCols,
        bucketRows
    };
}

function calculateFlocking(ant, spatialHash) {
    const {
        buckets,
        bucketSize,
        bucketCols,
        bucketRows
    } = spatialHash;

    let separationX = 0;
    let separationY = 0;

    let alignmentX = 0;
    let alignmentY = 0;

    let cohesionX = 0;
    let cohesionY = 0;

    let neighborCount = 0;
    let separationCount = 0;

    const ownBucketX = floor(ant.x / bucketSize);
    const ownBucketY = floor(ant.y / bucketSize);

    // Only inspect the surrounding 3x3 buckets.
    for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
            const bx = (
                ownBucketX + ox + bucketCols
            ) % bucketCols;

            const by = (
                ownBucketY + oy + bucketRows
            ) % bucketRows;

            const neighbors = buckets.get(`${bx},${by}`);

            if (!neighbors) {
                continue;
            }

            for (const other of neighbors) {
                if (other.id === ant.id) {
                    continue;
                }

                const dx = shortestWrappedDistance(
                    other.x,
                    ant.x,
                    cols
                );

                const dy = shortestWrappedDistance(
                    other.y,
                    ant.y,
                    rows
                );

                const distanceSquared = dx * dx + dy * dy;

                if (
                    distanceSquared === 0 ||
                    distanceSquared > BOID_RADIUS * BOID_RADIUS
                ) {
                    continue;
                }

                const distance = Math.sqrt(distanceSquared);

                // SEPARATION
                if (distance < SEPARATION_DISTANCE) {
                    separationX -= dx / distance;
                    separationY -= dy / distance;
                    separationCount++;
                }

                // ALIGNMENT
                const direction = getDirectionVector(other.direction);

                alignmentX += direction.x;
                alignmentY += direction.y;

                // COHESION
                cohesionX += dx;
                cohesionY += dy;

                neighborCount++;
            }
        }
    }

    if (neighborCount === 0) {
        return { x: 0, y: 0 };
    }

    let forceX = 0;
    let forceY = 0;

    // Separation
    if (separationCount > 0) {
        const separation = normalizeVector(
            separationX,
            separationY
        );

        forceX += separation.x * SEPARATION_WEIGHT;
        forceY += separation.y * SEPARATION_WEIGHT;
    }

    // Alignment
    const alignment = normalizeVector(
        alignmentX,
        alignmentY
    );

    forceX += alignment.x * ALIGNMENT_WEIGHT;
    forceY += alignment.y * ALIGNMENT_WEIGHT;

    // Cohesion
    const cohesion = normalizeVector(
        cohesionX,
        cohesionY
    );

    forceX += cohesion.x * COHESION_WEIGHT;
    forceY += cohesion.y * COHESION_WEIGHT;

    return normalizeVector(forceX, forceY);
}

// --------------------------------------------------
// COMBINE LANGTON + BOIDS
// --------------------------------------------------

function applyFlockingMovement(ant, flockForce) {
    const langton = getDirectionVector(ant.direction);

    if (
        flockForce.x === 0 &&
        flockForce.y === 0
    ) {
        moveAnt(ant);
        return;
    }

    const blendedX =
        langton.x * (1 - flockStrength) +
        flockForce.x * flockStrength;

    const blendedY =
        langton.y * (1 - flockStrength) +
        flockForce.y * flockStrength;

    // Quantize the blended direction back to the grid.
    if (Math.abs(blendedX) > Math.abs(blendedY)) {
        ant.direction = blendedX >= 0 ? 1 : 3;
    } else {
        ant.direction = blendedY >= 0 ? 2 : 0;
    }

    moveAnt(ant);
}

function moveAnt(ant) {
    const direction = getDirectionVector(ant.direction);

    ant.x = (ant.x + direction.x + cols) % cols;
    ant.y = (ant.y + direction.y + rows) % rows;
}

// --------------------------------------------------
// UPDATE SIMULATION
// --------------------------------------------------

function updateAnts() {
    // Build spatial buckets once per simulation update.
    const spatialHash = buildSpatialHash();

    // Calculate every ant's flocking force before moving.
    const forces = ants.map(ant =>
        calculateFlocking(ant, spatialHash)
    );

    // Apply each ant's rules and movement.
    for (let i = 0; i < ants.length; i++) {
        const ant = ants[i];

        applyLangtonRule(ant);
        applyFlockingMovement(ant, forces[i]);
    }
}

// --------------------------------------------------
// DRAW SIMULATION
// --------------------------------------------------

function draw() {
    background(BACKGROUND);

    if (!paused) {
        for (let i = 0; i < antSpeed; i++) {
            updateAnts();
        }
    }

    // Reuse cached trail and grid layers.
    image(trailLayer, 0, 0);
    image(gridLayer, 0, 0);

    drawAnts();

    if (frameCount % 15 === 0) {
        updateInterface();
    }
}

// --------------------------------------------------
// DRAW ANTS
// --------------------------------------------------

function drawAnts() {
    noStroke();

    for (const ant of ants) {
        const centerX = ant.x * cellSize + cellSize / 2;
        const centerY = ant.y * cellSize + cellSize / 2;

        const direction = getDirectionVector(ant.direction);

        const endX = centerX + direction.x * cellSize * 0.7;
        const endY = centerY + direction.y * cellSize * 0.7;

        fill(ant.color);

        rect(
            centerX - cellSize * 0.4,
            centerY - cellSize * 0.4,
            cellSize * 0.8,
            cellSize * 0.8
        );

        // Direction indicator.
        stroke("#ffffff");
        strokeWeight(1.5);

        line(centerX, centerY, endX, endY);

        noStroke();
    }
}

// --------------------------------------------------
// MOUSE INTERACTION
// --------------------------------------------------

function mousePressed() {
    if (
        mouseX < 0 ||
        mouseX >= width ||
        mouseY < 0 ||
        mouseY >= height
    ) {
        return;
    }

    const x = floor(mouseX / cellSize);
    const y = floor(mouseY / cellSize);

    if (x < 0 || x >= cols || y < 0 || y >= rows) {
        return;
    }

    if (grid[x][y] === null) {
        grid[x][y] = "#ffffff";

        trailLayer.noStroke();
        trailLayer.fill("#ffffff");

        trailLayer.rect(
            x * cellSize,
            y * cellSize,
            cellSize,
            cellSize
        );
    } else {
        grid[x][y] = null;

        trailLayer.erase();

        trailLayer.rect(
            x * cellSize,
            y * cellSize,
            cellSize,
            cellSize
        );

        trailLayer.noErase();
    }

    updateInterface();
}

// --------------------------------------------------
// RESET
// --------------------------------------------------

function resetSimulation() {
    clearGrid();
    createStartingAnts();

    paused = false;

    updateInterface();
}

// --------------------------------------------------
// RANDOMIZE
// --------------------------------------------------

function randomizeSimulation() {
    clearGrid();

    const filledCount = floor(cols * rows * 0.06);

    for (let i = 0; i < filledCount; i++) {
        const x = floor(random(cols));
        const y = floor(random(rows));

        const colorIndex = floor(random(ants.length));
        const cellColor = ants[colorIndex].color;

        grid[x][y] = cellColor;

        trailLayer.noStroke();
        trailLayer.fill(cellColor);

        trailLayer.rect(
            x * cellSize,
            y * cellSize,
            cellSize,
            cellSize
        );
    }

    for (const ant of ants) {
        ant.x = floor(random(cols));
        ant.y = floor(random(rows));
        ant.direction = floor(random(4));
    }

    paused = false;

    updateInterface();
}

// --------------------------------------------------
// INTERFACE
// --------------------------------------------------

function updateInterface() {
    const antCounter = document.getElementById("ant-counter");
    const cellCounter = document.getElementById("cell-counter");
    const playStatus = document.getElementById("play-status");
    const playButton = document.getElementById("play-button");
    const flockCounter = document.getElementById("flock-counter");

    if (antCounter) {
        antCounter.textContent = ants.length;
    }

    if (cellCounter) {
        cellCounter.textContent = countFilledCells();
    }

    if (playStatus) {
        playStatus.textContent = paused ? "PAUSED" : "RUNNING";
    }

    if (playButton) {
        playButton.textContent = paused ? "RESUME" : "PAUSE";
    }

    if (flockCounter) {
        flockCounter.textContent = `${Math.round(flockStrength * 100)}%`;
    }
}

// --------------------------------------------------
// CONTROLS
// --------------------------------------------------

function setupControls() {
    const playButton = document.getElementById("play-button");
    const stepButton = document.getElementById("step-button");
    const resetButton = document.getElementById("reset-button");
    const randomButton = document.getElementById("random-button");

    const addAntButton = document.getElementById("add-ant-button");
    const removeAntButton = document.getElementById("remove-ant-button");

    const speedSlider = document.getElementById("speed-slider");
    const gridSlider = document.getElementById("grid-slider");
    const flockSlider = document.getElementById("flock-strength");

    // Speed
    speedSlider.max = 10;
    speedSlider.value = antSpeed;

    speedSlider.addEventListener("input", () => {
        antSpeed = Number(speedSlider.value);

        document.getElementById("speed-value").textContent = antSpeed;
    });

    // Pixel size
    gridSlider.addEventListener("input", () => {
        cellSize = Number(gridSlider.value);

        document.getElementById("grid-value").textContent = cellSize;

        // Rebuild grid and cached graphics layers.
        initializeGrid();
        createGraphicsLayers();

        // Keep the ants, but reposition them safely.
        for (const ant of ants) {
            ant.x = floor(random(cols));
            ant.y = floor(random(rows));
        }

        updateInterface();
    });

    // Flocking influence
    flockSlider.addEventListener("input", () => {
        flockStrength = Number(flockSlider.value) / 100;

        document.getElementById("flock-strength-value").textContent =
            flockSlider.value;

        updateInterface();
    });

    // Pause / resume
    playButton.addEventListener("click", () => {
        paused = !paused;
        updateInterface();
    });

    // Single simulation step
    stepButton.addEventListener("click", () => {
        if (paused) {
            updateAnts();
            updateInterface();
        }
    });

    // Reset
    resetButton.addEventListener("click", resetSimulation);

    // Randomize
    randomButton.addEventListener("click", randomizeSimulation);

    // Ant management
    addAntButton.addEventListener("click", addAnt);
    removeAntButton.addEventListener("click", removeAnt);
}
