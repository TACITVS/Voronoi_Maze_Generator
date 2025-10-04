const canvas = document.getElementById('mazeCanvas');
const ctx = canvas.getContext('2d');
const controls = document.getElementById('controls');
const overlay = document.getElementById('overlay');
const generateBtn = document.getElementById('generateBtn');
const solveBtn = document.getElementById('solveBtn');
const clearBtn = document.getElementById('clearBtn');

const structuralParams = ['cellCount', 'canvasSize', 'relaxation'];
const visualParams = ['passageWidth', 'cellStroke', 'markerSize', 'pathThickness'];
const colorParams = ['cellFill', 'cellOutline', 'startColor', 'endColor', 'solutionColor', 'bgColor'];
const animationParams = ['animationSpeed'];

const EDGE_PRECISION = 3;

let delaunay = null;
let voronoi = null;
let sites = [];
let cells = [];
let passages = new Set();
let solutionPath = [];
let animationFrameId = null;
let lastFrameTime = 0;
let isSolving = false;
let startCell = null;
let endCell = null;
let rng = Math.random;

class Cell {
    constructor(id, site, polygon) {
        this.id = id;
        this.site = site;
        this.polygon = polygon;
        this.neighbors = new Map();
    }
}

function debounce(func, delay) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), delay);
    };
}

function showOverlay(message) {
    overlay.textContent = message;
    overlay.classList.add('visible');
}

function hideOverlay() {
    overlay.classList.remove('visible');
}

function quantizePoint(point) {
    return `${point[0].toFixed(EDGE_PRECISION)},${point[1].toFixed(EDGE_PRECISION)}`;
}

function setCanvasSize(size) {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function reseedRandom() {
    const seedInput = document.getElementById('seed').value.trim();
    if (!seedInput) {
        rng = Math.random;
        return;
    }

    let seed = 0;
    for (let i = 0; i < seedInput.length; i += 1) {
        seed = (seed * 31 + seedInput.charCodeAt(i)) >>> 0;
    }

    if (seed === 0) {
        seed = Date.now() >>> 0;
    }

    rng = (() => {
        let state = seed >>> 0;
        return () => {
            state = (1664525 * state + 1013904223) >>> 0;
            return state / 4294967296;
        };
    })();
}

function randomFloat(max) {
    return rng() * max;
}

function generateVoronoiTessellation() {
    const size = parseInt(document.getElementById('canvasSize').value, 10);
    const cellCount = parseInt(document.getElementById('cellCount').value, 10);
    const relaxIterations = parseInt(document.getElementById('relaxation').value, 10);

    setCanvasSize(size);

    sites = Array.from({ length: cellCount }, () => [randomFloat(size), randomFloat(size)]);

    for (let iter = 0; iter < relaxIterations; iter += 1) {
        const tempDelaunay = d3.Delaunay.from(sites);
        const tempVoronoi = tempDelaunay.voronoi([0, 0, size, size]);
        sites = sites.map((site, i) => {
            const polygon = tempVoronoi.cellPolygon(i);
            return polygon ? d3.polygonCentroid(polygon) : site;
        });
    }

    delaunay = d3.Delaunay.from(sites);
    voronoi = delaunay.voronoi([0, 0, size, size]);

    cells = sites
        .map((site, i) => {
            const polygon = voronoi.cellPolygon(i);
            return polygon ? new Cell(i, site, polygon) : null;
        })
        .filter(Boolean);

    buildNeighborGraph();
}

function buildNeighborGraph() {
    const cellMap = new Map(cells.map((c) => [c.id, c]));

    for (const cell of cells) {
        const neighborIds = delaunay.neighbors(cell.id);
        for (const neighborId of neighborIds) {
            const neighborCell = cellMap.get(neighborId);
            if (!neighborCell || cell.neighbors.has(neighborId)) continue;
            const edge = getSharedEdge(cell, neighborCell);
            if (edge) {
                cell.neighbors.set(neighborId, edge);
                neighborCell.neighbors.set(cell.id, edge);
            }
        }
    }
}

function getSharedEdge(cell1, cell2) {
    const points2Map = new Map();
    for (const point of cell2.polygon) {
        points2Map.set(quantizePoint(point), point);
    }

    const shared = [];
    for (const point of cell1.polygon) {
        const key = quantizePoint(point);
        if (points2Map.has(key)) {
            shared.push([point[0], point[1]]);
        }
    }

    if (shared.length < 2) return null;

    // sort to ensure consistent ordering for downstream calculations
    shared.sort((a, b) => (a[0] - b[0] || a[1] - b[1]));
    return [shared[0], shared[shared.length - 1]];
}

function generateMazeKruskal() {
    passages.clear();

    const edges = [];
    for (const cell of cells) {
        for (const neighborId of cell.neighbors.keys()) {
            if (cell.id < neighborId) {
                edges.push({ cell1: cell.id, cell2: neighborId, weight: rng() });
            }
        }
    }

    edges.sort((a, b) => a.weight - b.weight);

    const parent = new Map(cells.map((cell) => [cell.id, cell.id]));

    const find = (i) => {
        if (parent.get(i) === i) return i;
        const root = find(parent.get(i));
        parent.set(i, root);
        return root;
    };

    const union = (i, j) => {
        const rootI = find(i);
        const rootJ = find(j);
        if (rootI === rootJ) return false;
        parent.set(rootI, rootJ);
        return true;
    };

    for (const edge of edges) {
        if (union(edge.cell1, edge.cell2)) {
            passages.add(`${Math.min(edge.cell1, edge.cell2)}-${Math.max(edge.cell1, edge.cell2)}`);
        }
    }

    determineStartEndCells();
}

function determineStartEndCells() {
    let maxDistance = -Infinity;
    let pair = [cells[0], cells[0]];

    for (let i = 0; i < cells.length; i += 1) {
        for (let j = i + 1; j < cells.length; j += 1) {
            const dx = cells[i].site[0] - cells[j].site[0];
            const dy = cells[i].site[1] - cells[j].site[1];
            const distance = dx * dx + dy * dy;
            if (distance > maxDistance) {
                maxDistance = distance;
                pair = [cells[i], cells[j]];
            }
        }
    }

    [startCell, endCell] = pair;
}

function getDrawSettings() {
    return {
        bgColor: document.getElementById('bgColor').value,
        cellFill: document.getElementById('cellFill').value,
        cellOutline: document.getElementById('cellOutline').value,
        startColor: document.getElementById('startColor').value,
        endColor: document.getElementById('endColor').value,
        solutionColor: document.getElementById('solutionColor').value,
        cellStroke: parseFloat(document.getElementById('cellStroke').value),
        markerSize: parseFloat(document.getElementById('markerSize').value),
        passageWidthRatio: parseFloat(document.getElementById('passageWidth').value) / 100,
        pathThickness: parseFloat(document.getElementById('pathThickness').value)
    };
}

function drawMaze(pathProgress = -1) {
    const settings = getDrawSettings();
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = settings.bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    for (const cell of cells) {
        ctx.fillStyle = settings.cellFill;
        ctx.strokeStyle = settings.cellOutline;
        ctx.lineWidth = settings.cellStroke;

        ctx.beginPath();
        const [firstX, firstY] = cell.polygon[0];
        ctx.moveTo(firstX, firstY);
        for (let i = 1; i < cell.polygon.length; i += 1) {
            ctx.lineTo(cell.polygon[i][0], cell.polygon[i][1]);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }

    ctx.strokeStyle = settings.cellFill;
    ctx.lineWidth = Math.max(settings.cellStroke + 1, settings.cellStroke / settings.passageWidthRatio);

    for (const passageKey of passages) {
        const [id1, id2] = passageKey.split('-').map(Number);
        const cell1 = cells.find((c) => c.id === id1);
        const edge = cell1?.neighbors.get(id2);
        if (!edge) continue;

        const [p1, p2] = edge;
        const dx = p2[0] - p1[0];
        const dy = p2[1] - p1[1];
        const gap = (1 - settings.passageWidthRatio) / 2;

        ctx.beginPath();
        ctx.moveTo(p1[0] + dx * gap, p1[1] + dy * gap);
        ctx.lineTo(p2[0] - dx * gap, p2[1] - dy * gap);
        ctx.stroke();
    }

    if (pathProgress >= 0 && solutionPath.length > 1) {
        drawSolutionPath(pathProgress, settings);
    }

    drawMarkers(settings);
    ctx.restore();
}

function buildSolutionSplinePoints() {
    const points = [solutionPath[0].site];
    for (let i = 1; i < solutionPath.length; i += 1) {
        const prev = solutionPath[i - 1];
        const curr = solutionPath[i];
        const edge = prev.neighbors.get(curr.id);
        if (edge) {
            const [p1, p2] = edge;
            points.push([(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2]);
        }
        points.push(curr.site);
    }
    return points;
}

function drawSolutionPath(pathProgress, settings) {
    const pathPoints = buildSolutionSplinePoints();
    const maxIndex = pathPoints.length - 1;
    const currentIndex = Math.min(Math.floor(pathProgress) * 2, maxIndex);

    ctx.save();
    ctx.strokeStyle = settings.solutionColor;
    ctx.lineWidth = settings.pathThickness;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(pathPoints[0][0], pathPoints[0][1]);
    for (let i = 0; i < currentIndex; i += 1) {
        const p1 = pathPoints[i];
        const p2 = pathPoints[Math.min(i + 1, maxIndex)];
        const midX = (p1[0] + p2[0]) / 2;
        const midY = (p1[1] + p2[1]) / 2;
        ctx.quadraticCurveTo(p1[0], p1[1], midX, midY);
    }
    ctx.lineTo(pathPoints[currentIndex][0], pathPoints[currentIndex][1]);
    ctx.stroke();

    const [lastX, lastY] = pathPoints[currentIndex];
    ctx.fillStyle = settings.solutionColor;
    ctx.beginPath();
    ctx.arc(lastX, lastY, settings.pathThickness * 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function drawMarkers(settings) {
    if (!startCell || !endCell) return;

    ctx.save();
    ctx.fillStyle = settings.startColor;
    ctx.beginPath();
    ctx.arc(startCell.site[0], startCell.site[1], settings.markerSize, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = settings.endColor;
    ctx.beginPath();
    ctx.arc(endCell.site[0], endCell.site[1], settings.markerSize, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px Inter';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 6;
    ctx.fillText('START', startCell.site[0], startCell.site[1] - settings.markerSize - 8);
    ctx.fillText('END', endCell.site[0], endCell.site[1] + settings.markerSize + 18);
    ctx.restore();
}

function findPath() {
    if (!startCell || !endCell) return [];

    const queue = [[startCell]];
    const visited = new Set([startCell.id]);
    const cellMap = new Map(cells.map((c) => [c.id, c]));

    while (queue.length > 0) {
        const path = queue.shift();
        const current = path[path.length - 1];

        if (current.id === endCell.id) return path;

        for (const neighborId of current.neighbors.keys()) {
            const passageKey = `${Math.min(current.id, neighborId)}-${Math.max(current.id, neighborId)}`;
            if (!passages.has(passageKey) || visited.has(neighborId)) continue;
            visited.add(neighborId);
            queue.push([...path, cellMap.get(neighborId)]);
        }
    }

    return [];
}

function animateSolution() {
    let currentIdx = 0;

    const step = (timestamp) => {
        const speed = parseInt(document.getElementById('animationSpeed').value, 10);
        if (!lastFrameTime) lastFrameTime = timestamp;
        const elapsed = timestamp - lastFrameTime;

        if (elapsed > speed) {
            lastFrameTime = timestamp;
            if (currentIdx <= solutionPath.length) {
                drawMaze(currentIdx);
                currentIdx += 1;
            } else {
                finishSolving();
                return;
            }
        }

        animationFrameId = requestAnimationFrame(step);
    };

    animationFrameId = requestAnimationFrame(step);
}

function finishSolving() {
    isSolving = false;
    controls.disabled = false;
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
    lastFrameTime = 0;
    drawMaze(solutionPath.length);
}

function solveMaze() {
    if (isSolving) return;

    clearSolution(true);
    isSolving = true;
    controls.disabled = true;

    solutionPath = findPath();

    if (solutionPath.length === 0) {
        showOverlay('No solution found!');
        setTimeout(hideOverlay, 2000);
        isSolving = false;
        controls.disabled = false;
        return;
    }

    animateSolution();
}

function clearSolution(solving = false) {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    lastFrameTime = 0;
    solutionPath = [];
    isSolving = false;
    controls.disabled = false;
    if (!solving) {
        drawMaze();
    }
}

function generateMaze() {
    if (isSolving) {
        clearSolution(true);
    }

    showOverlay('Generating...');
    reseedRandom();
    clearSolution(true);

    setTimeout(() => {
        generateVoronoiTessellation();
        generateMazeKruskal();
        drawMaze();
        hideOverlay();
    }, 10);
}

function setupControls() {
    const debouncedGenerate = debounce(generateMaze, 300);

    const sliderParams = [...structuralParams, ...visualParams, ...animationParams];
    sliderParams.forEach((param) => {
        const input = document.getElementById(param);
        const valueDisplay = document.getElementById(`${param}Value`);
        if (valueDisplay) {
            input.addEventListener('input', () => {
                valueDisplay.textContent = input.value;
                if (visualParams.includes(param)) {
                    drawMaze(isSolving ? solutionPath.length : -1);
                }
            });
        }

        if (structuralParams.includes(param)) {
            input.addEventListener('change', debouncedGenerate);
        }
    });

    colorParams.forEach((id) => {
        const input = document.getElementById(id);
        input.addEventListener('input', () => {
            drawMaze(isSolving ? solutionPath.length : -1);
        });
    });

    document.getElementById('seed').addEventListener('change', generateMaze);

    generateBtn.addEventListener('click', generateMaze);
    solveBtn.addEventListener('click', solveMaze);
    clearBtn.addEventListener('click', () => clearSolution());
}

window.addEventListener(
    'resize',
    debounce(() => {
        if (!cells.length) return;
        drawMaze(isSolving ? solutionPath.length : -1);
    }, 200)
);

setupControls();
generateMaze();
