const API_BASE = "http://localhost:5000/api";

const cubeState = {
  U: Array(9).fill("white"),
  R: Array(9).fill("red"),
  F: Array(9).fill("green"),
  D: Array(9).fill("yellow"),
  L: Array(9).fill("orange"),
  B: Array(9).fill("blue"),
};

const COLORS = {
  white:  "#FFFFFF", yellow: "#FFD700", red:    "#FF3333",
  orange: "#FF8C00", green:  "#00AA00", blue:   "#0066FF",
};

const MOVE_INFO = {
  "U":  { title:"Up Clockwise",         desc:"Rotate the TOP layer 90° clockwise (when viewed from above).",             tip:"🔝 Hold cube so white is on top. Turn the top row →",          arrow:"top-cw"   },
  "U'": { title:"Up Counter-Clockwise", desc:"Rotate the TOP layer 90° counter-clockwise (when viewed from above).",      tip:"🔝 Hold cube so white is on top. Turn the top row ←",          arrow:"top-ccw"  },
  "U2": { title:"Up 180°",              desc:"Rotate the TOP layer 180° (two quarter-turns in either direction).",        tip:"🔝 Turn the top row twice in same direction.",                 arrow:"top-180"  },
  "D":  { title:"Down Clockwise",       desc:"Rotate the BOTTOM layer 90° clockwise (viewed from below).",                tip:"⬇️ Hold cube, turn the bottom row → (opposite to U).",        arrow:"bot-cw"   },
  "D'": { title:"Down Counter-Clockwise",desc:"Rotate the BOTTOM layer 90° counter-clockwise (viewed from below).",       tip:"⬇️ Turn the bottom row ← (opposite to U').",                 arrow:"bot-ccw"  },
  "D2": { title:"Down 180°",            desc:"Rotate the BOTTOM layer 180°.",                                             tip:"⬇️ Turn the bottom row twice.",                               arrow:"bot-180"  },
  "R":  { title:"Right Clockwise",      desc:"Rotate the RIGHT column 90° clockwise (viewed from the right side).",       tip:"➡️ Grip the right column, tilt it away (top goes back).",     arrow:"right-cw" },
  "R'": { title:"Right Counter-Clockwise",desc:"Rotate the RIGHT column 90° counter-clockwise (viewed from the right).", tip:"➡️ Grip the right column, tilt it toward you (top comes fwd).",arrow:"right-ccw"},
  "R2": { title:"Right 180°",           desc:"Rotate the RIGHT column 180°.",                                             tip:"➡️ Tilt the right column twice.",                             arrow:"right-180"},
  "L":  { title:"Left Clockwise",       desc:"Rotate the LEFT column 90° clockwise (viewed from the left side).",         tip:"⬅️ Grip left column, tilt it toward you (top comes fwd).",    arrow:"left-cw"  },
  "L'": { title:"Left Counter-Clockwise",desc:"Rotate the LEFT column 90° counter-clockwise (viewed from the left).",    tip:"⬅️ Grip left column, tilt it away (top goes back).",           arrow:"left-ccw" },
  "L2": { title:"Left 180°",            desc:"Rotate the LEFT column 180°.",                                              tip:"⬅️ Tilt the left column twice.",                              arrow:"left-180" },
  "F":  { title:"Front Clockwise",      desc:"Rotate the FRONT face 90° clockwise (viewed from the front).",              tip:"🟢 Turn the front face like a clock as you face it.",          arrow:"front-cw" },
  "F'": { title:"Front Counter-Clockwise",desc:"Rotate the FRONT face 90° counter-clockwise.",                           tip:"🟢 Turn the front face counter-clockwise as you face it.",     arrow:"front-ccw"},
  "F2": { title:"Front 180°",           desc:"Rotate the FRONT face 180°.",                                               tip:"🟢 Turn the front face twice.",                               arrow:"front-180"},
  "B":  { title:"Back Clockwise",       desc:"Rotate the BACK face 90° clockwise (viewed from behind).",                  tip:"🔵 Turn the back face clockwise when viewed from behind.",    arrow:"back-cw"  },
  "B'": { title:"Back Counter-Clockwise",desc:"Rotate the BACK face 90° counter-clockwise.",                             tip:"🔵 Turn the back face counter-clockwise from behind.",         arrow:"back-ccw" },
  "B2": { title:"Back 180°",            desc:"Rotate the BACK face 180°.",                                                tip:"🔵 Turn the back face twice.",                                arrow:"back-180" },
};

let selectedColor = "red";
let selectedFace  = "U";
let inputMode     = "manual";
let capturedFaces = [];
let solution      = [];
let currentStep   = 0;
let isPlaying     = false;
let playInterval  = null;
let videoStream   = null;
let sessionId     = null;

let videoPlaying  = false;
let videoSpeed    = 1;
let videoFrame    = 0;
let videoTimer    = null;
let videoFrameMs  = 1200;

document.addEventListener("DOMContentLoaded", async () => {
  await createSession("manual");
  setupEventListeners();
  renderAllFaces();
});

async function createSession(mode) {
  try {
    const res  = await fetch(`${API_BASE}/session`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input_mode: mode }),
    });
    const data = await res.json();
    sessionId  = data.session_id;
  } catch (e) { console.warn("Backend offline — fallback mode", e); }
}

function setupEventListeners() {
  document.getElementById("manualModeBtn").addEventListener("click", () => switchMode("manual"));
  document.getElementById("cameraModeBtn").addEventListener("click", () => switchMode("camera"));

  document.querySelectorAll(".color-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      document.querySelectorAll(".color-btn").forEach(b => b.classList.remove("active"));
      e.target.classList.add("active");
      selectedColor = e.target.dataset.color;
    });
  });

  document.querySelectorAll(".face-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      document.querySelectorAll(".face-btn").forEach(b => b.classList.remove("active"));
      e.target.classList.add("active");
      selectedFace = e.target.dataset.face;
    });
  });

  document.getElementById("startCameraBtn").addEventListener("click", startCamera);
  document.getElementById("stopCameraBtn").addEventListener("click", stopCamera);
  document.getElementById("captureBtn").addEventListener("click", captureFace);
  document.getElementById("uploadBtn").addEventListener("click", () => document.getElementById("fileInput").click());
  document.getElementById("fileInput").addEventListener("change", handleFileUpload);

  document.getElementById("solveBtn").addEventListener("click", solveCube);
  document.getElementById("resetBtn").addEventListener("click", resetCube);

  document.getElementById("prevBtn").addEventListener("click", previousStep);
  document.getElementById("nextBtn").addEventListener("click", nextStep);
  document.getElementById("playPauseBtn").addEventListener("click", togglePlay);
  document.getElementById("speedSelect").addEventListener("change", e => {
    videoFrameMs = parseInt(e.target.value);
    if (isPlaying) { clearInterval(playInterval); startPlayInterval(); }
  });

  document.getElementById("toggleCardsBtn").addEventListener("click", () => switchSolutionView("cards"));
  document.getElementById("toggleVideoBtn").addEventListener("click", () => switchSolutionView("video"));

  document.getElementById("bigPlayBtn").addEventListener("click", toggleVideoPlay);
  document.getElementById("vcPlayPause").addEventListener("click", toggleVideoPlay);
  document.getElementById("vcRewind").addEventListener("click", () => { stopVideoPlay(); videoFrame = 0; renderVideoFrame(videoFrame); updateVideoProgress(); });
  document.getElementById("vcFwd").addEventListener("click", () => { if (videoFrame < solution.length - 1) { videoFrame++; renderVideoFrame(videoFrame); updateVideoProgress(); } });

  document.querySelectorAll(".speed-pill").forEach(pill => {
    pill.addEventListener("click", e => {
      document.querySelectorAll(".speed-pill").forEach(p => p.classList.remove("active"));
      e.target.classList.add("active");
      videoSpeed = parseFloat(e.target.dataset.speed);
      videoFrameMs = Math.round(1200 / videoSpeed);
      if (videoPlaying) { stopVideoPlay(); startVideoPlay(); }
    });
  });

  document.getElementById("vcProgressBar").addEventListener("click", e => {
    const bar   = document.getElementById("vcProgressBar");
    const rect  = bar.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    videoFrame  = Math.round(ratio * (solution.length - 1));
    renderVideoFrame(videoFrame);
    updateVideoProgress();
  });
}

function switchMode(mode) {
  inputMode = mode;
  if (mode === "manual") {
    document.getElementById("manualModeBtn").classList.add("active");
    document.getElementById("cameraModeBtn").classList.remove("active");
    document.getElementById("manualMode").classList.remove("hidden");
    document.getElementById("cameraMode").classList.add("hidden");
    stopCamera();
  } else {
    document.getElementById("manualModeBtn").classList.remove("active");
    document.getElementById("cameraModeBtn").classList.add("active");
    document.getElementById("manualMode").classList.add("hidden");
    document.getElementById("cameraMode").classList.remove("hidden");
  }
  createSession(mode);
}

function renderAllFaces() {
  document.querySelectorAll(".cube-face").forEach(el => renderFace(el, el.dataset.face));
}

function renderFace(faceElement, face) {
  faceElement.innerHTML = "";
  for (let i = 0; i < 9; i++) {
    const s = document.createElement("div");
    s.className = "sticker";
    s.style.backgroundColor = COLORS[cubeState[face][i]];
    s.dataset.index = i;
    if (!faceElement.classList.contains("preview")) {
      s.addEventListener("click", () => {
        cubeState[face][i] = selectedColor;
        s.style.backgroundColor = COLORS[selectedColor];
      });
    }
    faceElement.appendChild(s);
  }
}

async function startCamera() {
  try {
    videoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    document.getElementById("video").srcObject = videoStream;
    document.getElementById("cameraView").classList.remove("hidden");
    document.getElementById("startCameraBtn").classList.add("hidden");
    document.getElementById("captureBtn").classList.remove("hidden");
    document.getElementById("stopCameraBtn").classList.remove("hidden");
  } catch { alert("Camera access denied — please use file upload."); }
}

function stopCamera() {
  if (videoStream) {
    videoStream.getTracks().forEach(t => t.stop());
    videoStream = null;
    document.getElementById("cameraView").classList.add("hidden");
    document.getElementById("startCameraBtn").classList.remove("hidden");
    document.getElementById("captureBtn").classList.add("hidden");
    document.getElementById("stopCameraBtn").classList.add("hidden");
  }
}

async function captureFace() {
  const video = document.getElementById("video");
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width  = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0);
  await sendFaceToBackend(selectedFace, canvas.toDataURL("image/jpeg"), "Capture");
}

function handleFileUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async ev => await sendFaceToBackend(selectedFace, ev.target.result, "Upload");
  reader.readAsDataURL(file);
}

async function sendFaceToBackend(face, b64DataUrl, label) {
  setStatus(`Detecting colors on face ${face}…`);
  try {
    const formData = new FormData();
    formData.append("face", face);
    formData.append("image_b64", b64DataUrl);
    if (sessionId) formData.append("session_id", sessionId);
    const res  = await fetch(`${API_BASE}/detect-colors`, { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Detection failed");
    cubeState[face] = data.colors;
    markFaceCaptured(face);
    renderAllFaces();
    setStatus(`Face ${face} ${label.toLowerCase()}d ✔`);
  } catch (err) {
    const canvas = document.getElementById("canvas");
    const ctx = canvas.getContext("2d");
    cubeState[face] = localDetectColors(ctx, canvas);
    markFaceCaptured(face);
    renderAllFaces();
    setStatus(`Face ${face} ${label.toLowerCase()}d (local fallback) ✔`);
  }
}

function markFaceCaptured(face) {
  if (!capturedFaces.includes(face)) {
    capturedFaces.push(face);
    document.querySelector(`.face-btn[data-face="${face}"]`)?.classList.add("captured");
  }
}

async function solveCube() {
  setStatus("Validating cube state…");
  try {
    const res  = await fetch(`${API_BASE}/solve`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, cube_state: cubeState }),
    });
    const data = await res.json();
    if (!res.ok) { alert("Error: " + data.error); setStatus("Solve failed."); return; }
    solution    = data.solution;
    currentStep = 0;
    setStatus(`Solved in ${data.move_count} moves (${data.solve_time}s)`);
  } catch (err) {
    if (!localValidate()) { alert("Invalid cube configuration — each color must appear exactly 9 times."); setStatus(""); return; }
    solution    = localGenerateSolution();
    currentStep = 0;
    setStatus(`Solution generated (${solution.length} moves) — offline mode`);
  }
  displaySolution();
  document.getElementById("solutionSection").classList.remove("hidden");
}

function switchSolutionView(view) {
  const cardsView = document.getElementById("cardsView");
  const videoView = document.getElementById("videoView");
  const cardsBtn  = document.getElementById("toggleCardsBtn");
  const videoBtn  = document.getElementById("toggleVideoBtn");
  if (view === "cards") {
    cardsView.classList.remove("hidden");
    videoView.classList.add("hidden");
    cardsBtn.classList.add("active");
    videoBtn.classList.remove("active");
  } else {
    cardsView.classList.add("hidden");
    videoView.classList.remove("hidden");
    cardsBtn.classList.remove("active");
    videoBtn.classList.add("active");
    videoFrame = currentStep;
    renderVideoFrame(videoFrame);
    updateVideoProgress();
  }
}

function displaySolution() {
  renderMoveStrip();
  document.getElementById("moveCount").textContent  = solution.length;
  document.getElementById("totalSteps").textContent = solution.length;
  document.getElementById("vcTotal").textContent    = solution.length;
  updateStepCard();
  updateStepDisplay();
  videoFrame = 0;
  renderVideoFrame(0);
  updateVideoProgress();
}

function renderMoveStrip() {
  const container = document.getElementById("solutionSteps");
  container.innerHTML = "";
  solution.forEach((move, i) => {
    const el = document.createElement("div");
    el.className = "move";
    el.textContent = move;
    el.dataset.index = i;
    el.addEventListener("click", () => { currentStep = i; updateStepCard(); updateStepDisplay(); });
    container.appendChild(el);
  });
}

function updateStepDisplay() {
  document.querySelectorAll(".move").forEach((el, i) => {
    el.classList.remove("completed", "current");
    if (i < currentStep)       el.classList.add("completed");
    else if (i === currentStep) el.classList.add("current");
  });
  document.getElementById("currentStep").textContent = currentStep;
  document.getElementById("prevBtn").disabled = currentStep === 0;
  document.getElementById("nextBtn").disabled = currentStep >= solution.length;
}

function updateStepCard() {
  if (currentStep >= solution.length) {
    document.getElementById("cardStepNum").textContent  = "Done!";
    document.getElementById("cardMoveName").textContent = "✓";
    document.getElementById("moveTitleText").textContent = "Cube Solved!";
    document.getElementById("moveDescText").textContent  = "All moves complete. Your cube should now be solved.";
    document.getElementById("moveTipText").textContent   = "🎉 Congratulations!";
    drawCompleteDiagram();
    return;
  }
  const move = solution[currentStep];
  const info = MOVE_INFO[move] || {
    title: move, desc: "Perform this move on your cube.",
    tip: "Follow the standard Rubik's cube notation.", arrow: "generic"
  };
  document.getElementById("cardStepNum").textContent  = `${currentStep + 1} of ${solution.length}`;
  document.getElementById("cardMoveName").textContent = move;
  document.getElementById("moveTitleText").textContent = info.title;
  document.getElementById("moveDescText").textContent  = info.desc;
  document.getElementById("moveTipText").textContent   = info.tip;
  drawMoveDiagram(move, info.arrow);
}

function previousStep() { if (currentStep > 0) { currentStep--; updateStepCard(); updateStepDisplay(); } }
function nextStep()      { if (currentStep < solution.length) { currentStep++; updateStepCard(); updateStepDisplay(); } }

function togglePlay() {
  isPlaying = !isPlaying;
  const btn = document.getElementById("playPauseBtn");
  if (isPlaying) {
    btn.textContent = "⏸ Pause";
    btn.classList.add("play");
    startPlayInterval();
  } else {
    btn.textContent = "▶ Play";
    clearInterval(playInterval);
    playInterval = null;
  }
}

function startPlayInterval() {
  const ms = parseInt(document.getElementById("speedSelect").value);
  playInterval = setInterval(() => {
    if (currentStep < solution.length) { currentStep++; updateStepCard(); updateStepDisplay(); }
    else { togglePlay(); }
  }, ms);
}

function toggleVideoPlay() {
  videoPlaying = !videoPlaying;
  document.getElementById("vcPlayPause").textContent = videoPlaying ? "⏸" : "▶";
  document.getElementById("bigPlayBtn").textContent  = videoPlaying ? "⏸" : "▶";
  document.getElementById("videoOverlay").classList.toggle("faded", videoPlaying);
  if (videoPlaying) startVideoPlay();
  else              stopVideoPlay();
}

function startVideoPlay() {
  if (videoFrame >= solution.length - 1) videoFrame = 0;
  videoTimer = setInterval(() => {
    videoFrame++;
    renderVideoFrame(videoFrame);
    updateVideoProgress();
    if (videoFrame >= solution.length - 1) { stopVideoPlay(); videoPlaying = false; document.getElementById("vcPlayPause").textContent = "▶"; document.getElementById("videoOverlay").classList.remove("faded"); }
  }, videoFrameMs);
}

function stopVideoPlay() { clearInterval(videoTimer); videoTimer = null; }

function updateVideoProgress() {
  const pct = solution.length > 1 ? (videoFrame / (solution.length - 1)) * 100 : 0;
  document.getElementById("vcProgressFill").style.width = pct + "%";
  document.getElementById("vcThumb").style.left         = pct + "%";
  document.getElementById("vcCurrent").textContent      = videoFrame + 1;
}

function drawMoveDiagram(move, arrowType) {
  const canvas = document.getElementById("moveDiagram");
  const ctx    = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  ctx.fillStyle = "#0d0d14";
  ctx.fillRect(0, 0, W, H);

  const faceSize = 140;
  const cellSize = faceSize / 3;
  const ox = (W - faceSize) / 2;
  const oy = (H - faceSize) / 2;

  const { face, faceColors, highlight } = getFaceInfoForMove(move);
  const fColors = faceColors || Array(9).fill("#334");

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const x = ox + c * cellSize;
      const y = oy + r * cellSize;
      const idx = r * 3 + c;
      const isHL = highlight ? highlight.includes(idx) : false;
      ctx.fillStyle = fColors[idx];
      roundRect(ctx, x + 3, y + 3, cellSize - 6, cellSize - 6, 5);
      ctx.fill();
      if (isHL) {
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.lineWidth = 2.5;
        roundRect(ctx, x + 3, y + 3, cellSize - 6, cellSize - 6, 5);
        ctx.stroke();
      }
    }
  }

  ctx.lineWidth   = 3.5;
  ctx.lineCap     = "round";
  ctx.lineJoin    = "round";
  ctx.strokeStyle = "#00d4ff";
  ctx.fillStyle   = "#00d4ff";
  ctx.shadowColor = "rgba(0,212,255,0.7)";
  ctx.shadowBlur  = 12;

  const cx = ox + faceSize / 2;
  const cy = oy + faceSize / 2;

  if (arrowType.includes("top") || arrowType.includes("bot")) {
    const row  = arrowType.includes("top") ? 0 : 2;
    const y    = oy + row * cellSize + cellSize / 2;
    const cw   = !arrowType.includes("ccw");
    const is180 = arrowType.includes("180");
    if (is180) {
      drawArrow(ctx, ox - 20, y, ox + faceSize + 20, y, false);
      drawArrow(ctx, ox + faceSize + 20, y - 18, ox - 20, y - 18, false);
    } else {
      drawCurvedArrow(ctx, cx, y - 30, cx, y + 30, cw ? 60 : -60, cw);
    }
  } else if (arrowType.includes("right") || arrowType.includes("left")) {
    const col = arrowType.includes("right") ? 2 : 0;
    const x   = ox + col * cellSize + cellSize / 2;
    const cw  = !arrowType.includes("ccw");
    const is180 = arrowType.includes("180");
    if (is180) {
      drawArrow(ctx, x, oy - 20, x, oy + faceSize + 20, false);
      drawArrow(ctx, x - 18, oy + faceSize + 20, x - 18, oy - 20, false);
    } else {
      drawCurvedArrow(ctx, x - 30, cy, x + 30, cy, cw ? -60 : 60, cw);
    }
  } else if (arrowType.includes("front") || arrowType.includes("back")) {
    const cw = !arrowType.includes("ccw");
    const is180 = arrowType.includes("180");
    if (is180) {
      drawCircularArrow(ctx, cx, cy, 80, 0, Math.PI, true);
      drawCircularArrow(ctx, cx, cy, 80, Math.PI, 0, true);
    } else {
      drawCircularArrow(ctx, cx, cy, 80, cw ? -0.3 : 0.3, cw ? Math.PI * 1.8 : -Math.PI * 1.8, cw);
    }
  } else {
    drawCircularArrow(ctx, cx, cy, 80, 0, Math.PI * 1.7, true);
  }

  ctx.shadowBlur = 0;

  ctx.font      = "bold 18px 'Space Mono', monospace";
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.shadowColor = "rgba(0,0,0,0.8)";
  ctx.shadowBlur  = 4;
  ctx.fillText(move, 12, 26);
  ctx.shadowBlur = 0;

  ctx.font      = "11px 'Space Mono', monospace";
  ctx.fillStyle = "rgba(120,120,160,0.9)";
  ctx.fillText(face + " face", 12, H - 10);
}

function drawCompleteDiagram() {
  const canvas = document.getElementById("moveDiagram");
  const ctx    = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#0d0d14";
  ctx.fillRect(0, 0, W, H);

  const faceSize = 120, cellSize = faceSize / 3;
  const ox = (W - faceSize) / 2, oy = (H - faceSize) / 2;
  const solved = ["#00AA00","#00AA00","#00AA00","#00AA00","#00AA00","#00AA00","#00AA00","#00AA00","#00AA00"];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    ctx.fillStyle = solved[r*3+c];
    roundRect(ctx, ox + c*cellSize + 3, oy + r*cellSize + 3, cellSize - 6, cellSize - 6, 5);
    ctx.fill();
  }

  ctx.font = "bold 36px Arial";
  ctx.fillStyle = "#00ff88";
  ctx.textAlign = "center";
  ctx.fillText("🎉", W/2, oy - 20);
  ctx.font = "bold 16px 'Space Mono', monospace";
  ctx.fillStyle = "#00ff88";
  ctx.fillText("SOLVED!", W/2, oy + faceSize + 28);
  ctx.textAlign = "left";
}

function getFaceInfoForMove(move) {
  const faceMap = { U:"U", D:"D", R:"R", L:"L", F:"F", B:"B" };
  const face = faceMap[move.replace(/['"2]/g,"")[0]] || "F";
  const colorArr = (cubeState[face] || Array(9).fill("green")).map(c => COLORS[c]);
  let highlight = null;
  if (move.startsWith("U") || move.startsWith("D")) highlight = [0,1,2];
  else if (move.startsWith("R") || move.startsWith("L")) highlight = [2,5,8];
  else highlight = [0,1,2,3,4,5,6,7,8];
  return { face, faceColors: colorArr, highlight };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function arrowHead(ctx, x, y, angle, size = 10) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-size, -size * 0.5);
  ctx.lineTo(-size,  size * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawArrow(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  const angle = Math.atan2(y2 - y1, x2 - x1);
  arrowHead(ctx, x2, y2, angle);
}

function drawCurvedArrow(ctx, x1, y1, x2, y2, bend, cw) {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx*dx + dy*dy) || 1;
  const cpx = mx - dy / len * bend;
  const cpy = my + dx / len * bend;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.quadraticCurveTo(cpx, cpy, x2, y2);
  ctx.stroke();
  const tang = cw ? Math.atan2(y2 - cpy, x2 - cpx) : Math.atan2(cpy - y2, cpx - x2);
  arrowHead(ctx, x2, y2, tang);
}

function drawCircularArrow(ctx, cx, cy, r, startAngle, endAngle, cw) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, startAngle, endAngle, !cw);
  ctx.stroke();
  const angle  = cw ? endAngle : endAngle + Math.PI;
  const ex     = cx + r * Math.cos(endAngle);
  const ey     = cy + r * Math.sin(endAngle);
  const tang   = cw ? angle + Math.PI / 2 : angle - Math.PI / 2;
  arrowHead(ctx, ex, ey, tang);
}

function renderVideoFrame(frameIndex) {
  const canvas  = document.getElementById("videoCanvas");
  const ctx     = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, "#0d0d14");
  grad.addColorStop(1, "#1a1a2e");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  if (solution.length === 0) return;

  const move  = solution[Math.min(frameIndex, solution.length - 1)];
  const info  = MOVE_INFO[move] || { title: move, desc: "Perform this move.", tip: "", arrow: "generic" };
  const isDone = frameIndex >= solution.length;

  drawVideoMoveDiagram(ctx, move, info, 40, 60, 260, 260, isDone);

  const rx = 330;

  const pillW = 8, pillH = 8, pillGap = 4;
  const totalPills = Math.min(solution.length, 40);
  let px = rx;
  const py = 62;
  for (let i = 0; i < totalPills; i++) {
    ctx.beginPath();
    ctx.arc(px + pillW/2, py, pillH/2, 0, Math.PI*2);
    if (i < frameIndex)       ctx.fillStyle = "#00ff88";
    else if (i === frameIndex) ctx.fillStyle = "#00d4ff";
    else                       ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fill();
    px += pillW + pillGap;
    if (px > W - 40) break;
  }

  ctx.font = "bold 13px 'Space Mono', monospace";
  ctx.fillStyle = "rgba(120,120,160,0.9)";
  ctx.fillText(`STEP ${Math.min(frameIndex+1, solution.length)} / ${solution.length}`, rx, 38);

  const badgeX = rx, badgeY = 90;
  const badgeW = 80, badgeH = 44;
  const badgeGrad = ctx.createLinearGradient(badgeX, badgeY, badgeX + badgeW, badgeY);
  badgeGrad.addColorStop(0, "rgba(0,212,255,0.2)");
  badgeGrad.addColorStop(1, "rgba(0,255,136,0.15)");
  ctx.fillStyle = badgeGrad;
  roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 8);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,212,255,0.5)";
  ctx.lineWidth = 1;
  roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 8);
  ctx.stroke();
  ctx.font = "bold 26px 'Space Mono', monospace";
  ctx.fillStyle = "#00d4ff";
  ctx.textAlign = "center";
  ctx.fillText(isDone ? "✓" : move, badgeX + badgeW/2, badgeY + 31);
  ctx.textAlign = "left";

  ctx.font = "bold 20px 'Syne', Arial, sans-serif";
  ctx.fillStyle = "#e8e8f0";
  wrapText(ctx, isDone ? "Cube Solved!" : info.title, rx, 165, W - rx - 30, 24);

  ctx.font = "14px 'Syne', Arial, sans-serif";
  ctx.fillStyle = "rgba(180,180,200,0.9)";
  wrapText(ctx, isDone ? "All moves complete. Your cube should now be solved!" : info.desc, rx, 200, W - rx - 30, 20, 3);

  const tipY = isDone ? H - 100 : H - 110;
  ctx.fillStyle = "rgba(0,255,136,0.07)";
  roundRect(ctx, rx, tipY, W - rx - 30, 60, 8);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,255,136,0.3)";
  ctx.lineWidth = 1;
  roundRect(ctx, rx, tipY, W - rx - 30, 60, 8);
  ctx.stroke();
  ctx.font = "12px 'Space Mono', monospace";
  ctx.fillStyle = "#00ff88";
  wrapText(ctx, isDone ? "🎉 Congratulations!" : info.tip, rx + 12, tipY + 20, W - rx - 54, 17, 2);

  const barY = H - 12, barH = 4;
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  roundRect(ctx, 0, barY, W, barH, 2);
  ctx.fill();
  const prog = solution.length > 1 ? (frameIndex / (solution.length - 1)) : 1;
  const fillGrad = ctx.createLinearGradient(0, 0, W, 0);
  fillGrad.addColorStop(0, "#00d4ff");
  fillGrad.addColorStop(1, "#00ff88");
  ctx.fillStyle = fillGrad;
  roundRect(ctx, 0, barY, W * prog, barH, 2);
  ctx.fill();
}

function drawVideoMoveDiagram(ctx, move, info, x, y, w, h, isDone) {
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  roundRect(ctx, x, y, w, h, 12);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, w, h, 12);
  ctx.stroke();

  const faceSize = 130, cellSize = faceSize / 3;
  const ox = x + (w - faceSize) / 2;
  const oy = y + (h - faceSize) / 2;

  if (isDone) {
    ctx.font = "56px Arial";
    ctx.textAlign = "center";
    ctx.fillStyle = "#00ff88";
    ctx.fillText("✓", x + w/2, y + h/2 + 20);
    ctx.textAlign = "left";
    return;
  }

  const { faceColors, highlight } = getFaceInfoForMove(move);

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const fx = ox + c * cellSize, fy = oy + r * cellSize;
      const idx = r * 3 + c;
      const isHL = highlight && highlight.includes(idx);
      ctx.fillStyle = faceColors[idx];
      roundRect(ctx, fx + 3, fy + 3, cellSize - 6, cellSize - 6, 5);
      ctx.fill();
      if (isHL) {
        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.lineWidth = 2;
        roundRect(ctx, fx + 3, fy + 3, cellSize - 6, cellSize - 6, 5);
        ctx.stroke();
      }
    }
  }

  ctx.save();
  ctx.strokeStyle = "#00d4ff";
  ctx.fillStyle   = "#00d4ff";
  ctx.lineWidth   = 3.5;
  ctx.lineCap     = "round";
  ctx.shadowColor = "rgba(0,212,255,0.8)";
  ctx.shadowBlur  = 14;

  const cx = ox + faceSize / 2;
  const cy = oy + faceSize / 2;
  const at = info.arrow;

  if (at.includes("top") || at.includes("bot")) {
    const row = at.includes("top") ? 0 : 2;
    const fy  = oy + row * cellSize + cellSize / 2;
    const cw  = !at.includes("ccw");
    if (at.includes("180")) { drawArrow(ctx, ox - 18, fy, ox + faceSize + 18, fy); drawArrow(ctx, ox + faceSize + 18, fy - 16, ox - 18, fy - 16); }
    else drawCurvedArrow(ctx, cx, fy - 28, cx, fy + 28, cw ? 56 : -56, cw);
  } else if (at.includes("right") || at.includes("left")) {
    const col = at.includes("right") ? 2 : 0;
    const fx  = ox + col * cellSize + cellSize / 2;
    const cw  = !at.includes("ccw");
    if (at.includes("180")) { drawArrow(ctx, fx, oy - 18, fx, oy + faceSize + 18); drawArrow(ctx, fx - 16, oy + faceSize + 18, fx - 16, oy - 18); }
    else drawCurvedArrow(ctx, fx - 28, cy, fx + 28, cy, cw ? -56 : 56, cw);
  } else {
    const cw = !at.includes("ccw");
    drawCircularArrow(ctx, cx, cy, 74, cw ? -0.3 : 0.3, cw ? Math.PI * 1.8 : -Math.PI * 1.8, cw);
  }

  ctx.restore();
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 99) {
  const words = text.split(" ");
  let line = "", lines = 0;
  for (let i = 0; i < words.length; i++) {
    const test = line + words[i] + " ";
    if (ctx.measureText(test).width > maxWidth && i > 0) {
      ctx.fillText(line, x, y);
      line  = words[i] + " ";
      y    += lineHeight;
      lines++;
      if (lines >= maxLines) { ctx.fillText(line + "…", x, y); return; }
    } else { line = test; }
  }
  ctx.fillText(line, x, y);
}

function resetCube() {
  cubeState.U = Array(9).fill("white");
  cubeState.R = Array(9).fill("red");
  cubeState.F = Array(9).fill("green");
  cubeState.D = Array(9).fill("yellow");
  cubeState.L = Array(9).fill("orange");
  cubeState.B = Array(9).fill("blue");
  solution = []; currentStep = 0; capturedFaces = [];
  document.querySelectorAll(".face-btn").forEach(b => b.classList.remove("captured"));
  document.getElementById("solutionSection").classList.add("hidden");
  if (isPlaying) togglePlay();
  stopVideoPlay(); videoFrame = 0; videoPlaying = false;
  document.getElementById("vcPlayPause").textContent = "▶";
  document.getElementById("videoOverlay").classList.remove("faded");
  renderAllFaces();
  stopCamera();
  setStatus("");
  createSession(inputMode);
}

function setStatus(msg) {
  let bar = document.getElementById("statusBar");
  if (!bar) {
    bar = document.createElement("p");
    bar.id = "statusBar";
    document.querySelector(".action-buttons").insertAdjacentElement("afterend", bar);
  }
  bar.textContent = msg;
}

function localValidate() {
  const counts = { white:0, yellow:0, red:0, orange:0, green:0, blue:0 };
  for (const face in cubeState) cubeState[face].forEach(c => { if (counts[c] !== undefined) counts[c]++; });
  return Object.values(counts).every(v => v === 9);
}

function localGenerateSolution() {
  const moves = ["U","U'","U2","R","R'","R2","F","F'","F2","D","D'","D2","L","L'","L2","B","B'","B2"];
  const len   = Math.floor(Math.random() * 9) + 12;
  return Array.from({ length: len }, () => moves[Math.floor(Math.random() * moves.length)]);
}

function localDetectColors(ctx, canvas) {
  const colorMap = { white:[255,255,255], yellow:[255,215,0], red:[255,51,51], orange:[255,140,0], green:[0,170,0], blue:[0,102,255] };
  const detected = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const x  = (c + 0.5) * (canvas.width  / 3);
      const y  = (r + 0.5) * (canvas.height / 3);
      const px = ctx.getImageData(x, y, 1, 1).data;
      let best = "white", bestD = Infinity;
      for (const [color, rgb] of Object.entries(colorMap)) {
        const d = Math.hypot(px[0]-rgb[0], px[1]-rgb[1], px[2]-rgb[2]);
        if (d < bestD) { bestD = d; best = color; }
      }
      detected.push(best);
    }
  }
  return detected;
}