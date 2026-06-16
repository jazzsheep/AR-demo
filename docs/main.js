import {
  HandLandmarker,
  FilesetResolver,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";

// ---------------------------------------------------------------------------
// Tunables — tweak these to change the feel of the demo.
// ---------------------------------------------------------------------------
const CONFIG = {
  numHands: 2,

  // Landmark indices (MediaPipe Hands).
  THUMB_TIP: 4,
  INDEX_TIP: 8,
  COLLISION_TIPS: [4, 8, 12, 16, 20], // all 5 fingertips collide with the bubble

  // All 5 fingertips glow, each with its own colour (thumb -> pinky).
  GLOW_TIPS: [
    { i: 4, c: "255, 120, 200" }, // thumb  - pink
    { i: 8, c: "120, 200, 255" }, // index  - blue
    { i: 12, c: "140, 255, 210" }, // middle - teal
    { i: 16, c: "180, 150, 255" }, // ring   - purple
    { i: 20, c: "255, 190, 120" }, // pinky  - amber
  ],

  fingerRadius: 34, // collision radius around each fingertip (px)
  glowRadius: 30, // glow radius for each fingertip (px)
  blurPx: 18, // blur strength of the video seen through the bubble

  bubble: {
    nodes: 30, // number of perimeter nodes
    radius: 130, // rest radius (px)
    pressure: 4.5, // how strongly it stays inflated
    stiffness: 0.88, // perimeter spring correction (0..1)
    damping: 0.985, // velocity damping per frame
    iterations: 6, // constraint solver iterations per frame
    drift: 0.7, // floating drift speed (px/frame)
  },
};

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const overlay = document.getElementById("overlay");
const startBtn = document.getElementById("startBtn");
const statusEl = document.getElementById("status");

const setStatus = (msg) => {
  statusEl.textContent = msg;
};

// ---------------------------------------------------------------------------
// Soft body (pressurised Verlet blob) — the bubble.
// ---------------------------------------------------------------------------
class SoftBody {
  constructor(cx, cy, r, n) {
    this.n = n;
    this.r0 = r;
    this.points = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      this.points.push({ x, y, px: x, py: y });
    }
    this.restLen = (2 * Math.PI * r) / n; // spacing between adjacent nodes
    this.targetArea = Math.PI * r * r; // area to keep inflated to
    // gentle floating velocity of the whole body
    this.vx = (Math.random() - 0.5) * CONFIG.bubble.drift * 2 || CONFIG.bubble.drift;
    this.vy = (Math.random() - 0.5) * CONFIG.bubble.drift * 2 || -CONFIG.bubble.drift;
    this.t = 0;
  }

  centroid() {
    let cx = 0;
    let cy = 0;
    for (const p of this.points) {
      cx += p.x;
      cy += p.y;
    }
    return { x: cx / this.n, y: cy / this.n };
  }

  area() {
    let a = 0;
    const p = this.points;
    for (let i = 0; i < this.n; i++) {
      const j = (i + 1) % this.n;
      a += p[i].x * p[j].y - p[j].x * p[i].y;
    }
    return Math.abs(a) / 2;
  }

  update(fingers, W, H) {
    const p = this.points;
    const s = CONFIG.bubble;
    this.t += 1 / 60;

    // --- Verlet integration (with a subtle buoyant wobble) ---
    const bob = Math.sin(this.t * 1.7) * 0.25;
    for (const pt of p) {
      const vx = (pt.x - pt.px) * s.damping;
      const vy = (pt.y - pt.py) * s.damping;
      pt.px = pt.x;
      pt.py = pt.y;
      pt.x += vx;
      pt.y += vy + bob;
    }

    // --- Whole-body floating drift + wall bounce on the centroid ---
    let c = this.centroid();
    const margin = this.r0 * 0.6;
    if (c.x < margin || c.x > W - margin) this.vx *= -1;
    if (c.y < margin || c.y > H - margin) this.vy *= -1;
    for (const pt of p) {
      pt.x += this.vx;
      pt.y += this.vy;
    }

    // --- Constraint solver ---
    for (let it = 0; it < s.iterations; it++) {
      // Perimeter springs (keep neighbours at rest distance).
      for (let i = 0; i < this.n; i++) {
        const a = p[i];
        const b = p[(i + 1) % this.n];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.0001;
        const diff = ((d - this.restLen) / d) * 0.5 * s.stiffness;
        dx *= diff;
        dy *= diff;
        a.x += dx;
        a.y += dy;
        b.x -= dx;
        b.y -= dy;
      }

      // Pressure: push every node radially outward from the centroid so the
      // blob stays inflated and springs back after being squished.
      c = this.centroid();
      const areaErr = (this.targetArea - this.area()) / this.targetArea;
      const push = areaErr * s.pressure;
      for (const pt of p) {
        const dx = pt.x - c.x;
        const dy = pt.y - c.y;
        const d = Math.hypot(dx, dy) || 0.0001;
        pt.x += (dx / d) * push;
        pt.y += (dy / d) * push;
      }

      // Finger collision: any node inside a fingertip gets pushed to the rim.
      for (const f of fingers) {
        for (const pt of p) {
          const dx = pt.x - f.x;
          const dy = pt.y - f.y;
          const d = Math.hypot(dx, dy);
          if (d < f.r && d > 0.0001) {
            const k = (f.r - d) / d;
            pt.x += dx * k;
            pt.y += dy * k;
          }
        }
      }

      // Keep nodes on screen.
      for (const pt of p) {
        pt.x = Math.max(4, Math.min(W - 4, pt.x));
        pt.y = Math.max(4, Math.min(H - 4, pt.y));
      }
    }
  }

  // Build a smooth closed path through the nodes (midpoint quadratics).
  tracePath(c) {
    const p = this.points;
    const n = this.n;
    c.beginPath();
    const mid0x = (p[n - 1].x + p[0].x) / 2;
    const mid0y = (p[n - 1].y + p[0].y) / 2;
    c.moveTo(mid0x, mid0y);
    for (let i = 0; i < n; i++) {
      const cur = p[i];
      const next = p[(i + 1) % n];
      const mx = (cur.x + next.x) / 2;
      const my = (cur.y + next.y) / 2;
      c.quadraticCurveTo(cur.x, cur.y, mx, my);
    }
    c.closePath();
  }
}

// ---------------------------------------------------------------------------
// Camera + hand tracking
// ---------------------------------------------------------------------------
let handLandmarker = null;
let bubble = null;
let running = false;
let lastVideoTime = -1;
let latestHands = [];

async function initHandLandmarker() {
  setStatus("モデルを読み込み中…");
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
  );
  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numHands: CONFIG.numHands,
  });
}

async function startCamera() {
  setStatus("カメラへのアクセスを要求中…");
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
  await new Promise((resolve) => {
    if (video.videoWidth) return resolve();
    video.onloadedmetadata = () => resolve();
  });
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  bubble = new SoftBody(canvas.width / 2, canvas.height / 2, CONFIG.bubble.radius, CONFIG.bubble.nodes);
}

// Mirror a normalised landmark (front camera => mirrored view).
function toCanvas(lm) {
  return { x: (1 - lm.x) * canvas.width, y: lm.y * canvas.height };
}

function drawVideoMirrored(filter) {
  ctx.save();
  if (filter) ctx.filter = filter;
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  ctx.restore();
}

function drawGlow(x, y, rgb) {
  // soft halo
  const g = ctx.createRadialGradient(x, y, 0, x, y, CONFIG.glowRadius);
  g.addColorStop(0, `rgba(${rgb}, 0.9)`);
  g.addColorStop(0.4, `rgba(${rgb}, 0.4)`);
  g.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, CONFIG.glowRadius, 0, Math.PI * 2);
  ctx.fill();
  // bright core
  ctx.shadowBlur = 24;
  ctx.shadowColor = `rgba(${rgb}, 1)`;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(x, y, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBubble() {
  // 1) Blurred video, clipped to the bubble shape ("見える映像がぼやける").
  ctx.save();
  bubble.tracePath(ctx);
  ctx.clip();
  drawVideoMirrored(`blur(${CONFIG.blurPx}px)`);
  ctx.restore();

  const c = bubble.centroid();

  // 2) Translucent jelly body.
  ctx.save();
  bubble.tracePath(ctx);
  const body = ctx.createRadialGradient(
    c.x - bubble.r0 * 0.3,
    c.y - bubble.r0 * 0.3,
    bubble.r0 * 0.1,
    c.x,
    c.y,
    bubble.r0 * 1.3
  );
  body.addColorStop(0, "rgba(180, 255, 240, 0.32)");
  body.addColorStop(0.6, "rgba(120, 200, 255, 0.22)");
  body.addColorStop(1, "rgba(150, 120, 255, 0.30)");
  ctx.fillStyle = body;
  ctx.fill();

  // rim light
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(220, 255, 255, 0.55)";
  ctx.stroke();
  ctx.restore();

  // 3) Specular highlight blob.
  ctx.save();
  bubble.tracePath(ctx);
  ctx.clip();
  const hx = c.x - bubble.r0 * 0.35;
  const hy = c.y - bubble.r0 * 0.4;
  const hl = ctx.createRadialGradient(hx, hy, 0, hx, hy, bubble.r0 * 0.5);
  hl.addColorStop(0, "rgba(255,255,255,0.55)");
  hl.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = hl;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

function render() {
  if (!running) return;

  // Run hand detection on fresh frames only.
  if (handLandmarker && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const res = handLandmarker.detectForVideo(video, performance.now());
    latestHands = res.landmarks || [];
  }

  // Collect collision points (all 5 fingertips) per hand.
  const fingers = [];
  for (const hand of latestHands) {
    for (const idx of CONFIG.COLLISION_TIPS) {
      const pt = toCanvas(hand[idx]);
      pt.r = CONFIG.fingerRadius;
      fingers.push(pt);
    }
  }

  // Background video.
  drawVideoMirrored(null);

  // Physics + bubble.
  if (bubble) {
    bubble.update(fingers, canvas.width, canvas.height);
    drawBubble();
  }

  // Glow every fingertip (one colour per finger).
  for (const hand of latestHands) {
    for (const g of CONFIG.GLOW_TIPS) {
      const pt = toCanvas(hand[g.i]);
      drawGlow(pt.x, pt.y, g.c);
    }
  }

  requestAnimationFrame(render);
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
startBtn.addEventListener("click", async () => {
  startBtn.disabled = true;
  try {
    if (!handLandmarker) await initHandLandmarker();
    await startCamera();
    overlay.classList.add("hidden");
    running = true;
    setStatus("");
    requestAnimationFrame(render);
  } catch (err) {
    console.error(err);
    setStatus("エラー: " + (err && err.message ? err.message : err));
    startBtn.disabled = false;
  }
});
