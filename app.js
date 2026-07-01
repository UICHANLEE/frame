const guides = [
  { id: "thirds", icon: "III", name: "삼분할 구도", tip: "피사체를 교차점에 두면 시선이 자연스럽게 이동합니다." },
  { id: "center", icon: "O", name: "중앙 집중", tip: "대칭 건물, 음식, 제품 사진은 중앙에 놓으면 안정감이 생깁니다." },
  { id: "horizon", icon: "H", name: "수평선", tip: "하늘이 예쁘면 수평선을 아래로, 바닥 질감이 좋으면 위로 올리세요." },
  { id: "diagonal", icon: "/", name: "대각선 흐름", tip: "길, 계단, 그림자를 대각선으로 잡으면 사진에 움직임이 생깁니다." },
  { id: "portrait", icon: "P", name: "인물 여백", tip: "얼굴 위쪽 여백은 줄이고 시선 방향에는 공간을 남기세요." },
];

const filters = [
  { id: "clear", icon: "C", name: "맑은 필름", tip: "일상과 카페 사진에 맞는 밝고 투명한 색감입니다.", css: "brightness(1.06) contrast(0.96) saturate(1.08)", overlay: "rgba(255, 245, 225, 0.08)" },
  { id: "fairy", icon: "F", name: "동화", tip: "초록과 피부톤을 부드럽게 살리는 따뜻한 필터입니다.", css: "brightness(1.08) contrast(0.9) saturate(1.18) sepia(0.08)", overlay: "rgba(255, 221, 184, 0.16)" },
  { id: "cinema", icon: "M", name: "시네마", tip: "명암을 깊게 만들어 영화 장면 같은 분위기를 만듭니다.", css: "brightness(0.96) contrast(1.15) saturate(0.92)", overlay: "rgba(18, 38, 45, 0.16)" },
  { id: "sunset", icon: "S", name: "노을", tip: "해 질 무렵의 주황빛을 강조합니다.", css: "brightness(1.02) contrast(1.04) saturate(1.22) sepia(0.16)", overlay: "rgba(238, 125, 66, 0.16)" },
  { id: "mono", icon: "B", name: "모노", tip: "색을 줄이고 선과 표정에 집중합니다.", css: "grayscale(1) contrast(1.08) brightness(1.02)", overlay: "rgba(255, 255, 255, 0.02)" },
];

const lessons = [
  { icon: "1", name: "시선이 가는 곳 정하기", tip: "촬영 전 주인공을 하나만 정하세요. 배경은 주인공을 설명하는 요소로만 남깁니다." },
  { icon: "2", name: "전경으로 깊이 만들기", tip: "창문, 잎, 난간 같은 가까운 물체를 가장자리에 두면 공간감이 생깁니다." },
  { icon: "3", name: "빛 방향 확인하기", tip: "역광은 윤곽을 만들고, 측면광은 질감을 살립니다. 얼굴 사진은 부드러운 창가빛이 안정적입니다." },
  { icon: "4", name: "필터는 약하게", tip: "좋은 색감은 강한 보정보다 일관된 톤에서 나옵니다. 채도와 대비를 과하게 올리지 마세요." },
];

const state = {
  stream: null,
  uploadedImage: null,
  captures: [],
  guide: guides[0],
  filter: filters[0],
  grain: 12,
  vignette: 28,
  lastFrameReady: false,
};

const els = {
  video: document.querySelector("#camera"),
  sourceCanvas: document.querySelector("#sourceCanvas"),
  renderCanvas: document.querySelector("#renderCanvas"),
  fallback: document.querySelector("#cameraFallback"),
  startButton: document.querySelector("#startButton"),
  captureButton: document.querySelector("#captureButton"),
  sampleButton: document.querySelector("#sampleButton"),
  saveButton: document.querySelector("#saveButton"),
  uploadInput: document.querySelector("#uploadInput"),
  filmstrip: document.querySelector("#filmstrip"),
  guideLabel: document.querySelector("#guideLabel"),
  shootingTip: document.querySelector("#shootingTip"),
  guideList: document.querySelector("#guideList"),
  filterList: document.querySelector("#filterList"),
  lessonList: document.querySelector("#lessonList"),
  modeTabs: document.querySelector(".mode-tabs"),
  panels: document.querySelectorAll("[data-panel]"),
  grainRange: document.querySelector("#grainRange"),
  vignetteRange: document.querySelector("#vignetteRange"),
};

const sourceCtx = els.sourceCanvas.getContext("2d");
const renderCtx = els.renderCanvas.getContext("2d");

bindEvents();
renderCards();
loadSampleScene();
requestAnimationFrame(drawLoop);

function bindEvents() {
  els.startButton.addEventListener("click", startCamera);
  els.captureButton.addEventListener("click", capture);
  els.sampleButton.addEventListener("click", loadSampleScene);
  els.saveButton.addEventListener("click", saveCurrentFrame);
  els.uploadInput.addEventListener("change", loadUploadedPhoto);
  els.modeTabs.addEventListener("click", switchPanel);
  els.grainRange.addEventListener("input", (event) => {
    state.grain = Number(event.target.value);
  });
  els.vignetteRange.addEventListener("input", (event) => {
    state.vignette = Number(event.target.value);
  });
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    setFallback("브라우저가 카메라를 지원하지 않습니다.", "사진 불러오기 또는 샘플 장면을 사용하세요.");
    return;
  }

  state.stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 960 } },
    audio: false,
  });
  state.uploadedImage = null;
  els.video.srcObject = state.stream;
  els.fallback.hidden = true;
  els.captureButton.disabled = false;
  els.startButton.textContent = "카메라 사용 중";
}

function switchPanel(event) {
  const button = event.target.closest("[data-mode]");
  if (!button) return;
  const mode = button.dataset.mode;
  els.modeTabs.querySelectorAll("button").forEach((item) => {
    item.classList.toggle("is-active", item === button);
  });
  els.panels.forEach((panel) => {
    panel.classList.toggle("is-hidden", panel.dataset.panel !== mode);
  });
}

function renderCards() {
  els.guideList.append(...guides.map((guide) => makeCard(guide, "guide")));
  els.filterList.append(...filters.map((filter) => makeCard(filter, "filter")));
  els.lessonList.append(...lessons.map((lesson) => makeCard(lesson, "lesson")));
  syncActiveCards();
}

function makeCard(item, type) {
  const button = document.createElement("button");
  button.className = "card-button";
  button.type = "button";
  button.innerHTML = `
    <span class="card-icon">${item.icon}</span>
    <span class="card-copy">
      <strong>${item.name}</strong>
      <span>${item.tip}</span>
    </span>
  `;
  button.addEventListener("click", () => {
    if (type === "guide") state.guide = item;
    if (type === "filter") state.filter = item;
    if (type === "lesson") {
      els.shootingTip.textContent = item.tip;
      return;
    }
    updateGuideCopy();
    syncActiveCards();
  });
  return button;
}

function syncActiveCards() {
  els.guideList.querySelectorAll(".card-button").forEach((button, index) => {
    button.classList.toggle("is-active", guides[index] === state.guide);
  });
  els.filterList.querySelectorAll(".card-button").forEach((button, index) => {
    button.classList.toggle("is-active", filters[index] === state.filter);
  });
}

function updateGuideCopy() {
  els.guideLabel.textContent = state.guide.name;
  els.shootingTip.textContent = state.guide.tip;
}

function drawLoop() {
  drawFrame();
  requestAnimationFrame(drawLoop);
}

function drawFrame() {
  const canvas = els.renderCanvas;
  const ctx = renderCtx;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const hasVideo = state.stream && els.video.readyState >= 2;
  if (hasVideo) {
    drawVideoFrame();
  } else if (state.uploadedImage) {
    sourceCtx.clearRect(0, 0, els.sourceCanvas.width, els.sourceCanvas.height);
    drawCoverImage(sourceCtx, state.uploadedImage, sourceCanvasRect());
  } else {
    drawSampleSource();
  }

  ctx.save();
  ctx.filter = state.filter.css;
  ctx.drawImage(els.sourceCanvas, 0, 0, canvas.width, canvas.height);
  ctx.restore();
  applyOverlay();
  drawGuide();
  state.lastFrameReady = true;
  els.saveButton.disabled = false;
}

function drawVideoFrame() {
  sourceCtx.save();
  sourceCtx.clearRect(0, 0, els.sourceCanvas.width, els.sourceCanvas.height);
  sourceCtx.translate(els.sourceCanvas.width, 0);
  sourceCtx.scale(-1, 1);
  drawCoverImage(sourceCtx, els.video, sourceCanvasRect());
  sourceCtx.restore();
}

function drawSampleSource() {
  const ctx = sourceCtx;
  const { width, height } = els.sourceCanvas;
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#f8dfc4");
  gradient.addColorStop(0.45, "#cfdccf");
  gradient.addColorStop(1, "#5f7568");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "rgba(255,255,255,0.78)";
  roundRect(ctx, 135, 160, 430, 560, 42);
  ctx.fill();
  ctx.fillStyle = "rgba(49, 63, 55, 0.82)";
  roundRect(ctx, 670, 250, 380, 500, 200);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.86)";
  ctx.beginPath();
  ctx.arc(850, 320, 74, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(31,29,25,0.62)";
  ctx.font = "900 68px Inter, sans-serif";
  ctx.fillText("GUIDE", 170, 260);
}

function loadSampleScene() {
  state.uploadedImage = null;
  els.fallback.hidden = true;
  els.captureButton.disabled = false;
  updateGuideCopy();
}

function loadUploadedPhoto(event) {
  const [file] = event.target.files;
  if (!file) return;
  const image = new Image();
  image.onload = () => {
    state.uploadedImage = image;
    els.fallback.hidden = true;
    els.captureButton.disabled = false;
    URL.revokeObjectURL(image.src);
  };
  image.src = URL.createObjectURL(file);
}

function capture() {
  if (!state.lastFrameReady) return;
  const dataUrl = els.renderCanvas.toDataURL("image/png");
  state.captures.unshift(dataUrl);
  state.captures = state.captures.slice(0, 8);
  renderFilmstrip();
}

function saveCurrentFrame() {
  const link = document.createElement("a");
  link.download = `young-ppotto-${Date.now()}.png`;
  link.href = els.renderCanvas.toDataURL("image/png");
  link.click();
}

function renderFilmstrip() {
  els.filmstrip.innerHTML = "";
  for (const captureUrl of state.captures) {
    const item = document.createElement("button");
    item.className = "thumb";
    item.type = "button";
    const image = document.createElement("img");
    image.src = captureUrl;
    image.alt = "촬영 결과";
    item.append(image);
    item.addEventListener("click", () => {
      const preview = new Image();
      preview.onload = () => {
        state.uploadedImage = preview;
      };
      preview.src = captureUrl;
    });
    els.filmstrip.append(item);
  }
}

function applyOverlay() {
  const ctx = renderCtx;
  const { width, height } = els.renderCanvas;
  ctx.fillStyle = state.filter.overlay;
  ctx.fillRect(0, 0, width, height);

  if (state.grain > 0) drawGrain(ctx, width, height, state.grain);
  if (state.vignette > 0) drawVignette(ctx, width, height, state.vignette / 100);
}

function drawGuide() {
  const ctx = renderCtx;
  const { width, height } = els.renderCanvas;
  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
  ctx.lineWidth = 3;
  ctx.setLineDash([18, 14]);

  if (state.guide.id === "thirds") {
    drawLine(width / 3, 0, width / 3, height);
    drawLine((width * 2) / 3, 0, (width * 2) / 3, height);
    drawLine(0, height / 3, width, height / 3);
    drawLine(0, (height * 2) / 3, width, (height * 2) / 3);
    drawFocusDot(width / 3, height / 3);
    drawFocusDot((width * 2) / 3, height / 3);
    drawFocusDot(width / 3, (height * 2) / 3);
    drawFocusDot((width * 2) / 3, (height * 2) / 3);
  }

  if (state.guide.id === "center") {
    ctx.setLineDash([]);
    drawLine(width / 2, 0, width / 2, height);
    drawLine(0, height / 2, width, height / 2);
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, 170, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (state.guide.id === "horizon") {
    drawLine(0, height * 0.42, width, height * 0.42);
    drawLine(0, height * 0.58, width, height * 0.58);
  }

  if (state.guide.id === "diagonal") {
    drawLine(0, height, width, 0);
    drawLine(0, height * 0.68, width * 0.68, 0);
    drawLine(width * 0.32, height, width, height * 0.32);
  }

  if (state.guide.id === "portrait") {
    ctx.setLineDash([]);
    roundRect(ctx, width * 0.28, height * 0.14, width * 0.44, height * 0.68, 220);
    ctx.stroke();
    drawLine(width * 0.18, height * 0.22, width * 0.82, height * 0.22);
    drawLine(width * 0.18, height * 0.82, width * 0.82, height * 0.82);
  }

  ctx.restore();

  function drawLine(x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  function drawFocusDot(x, y) {
    ctx.save();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawGrain(ctx, width, height, amount) {
  const density = Math.floor((width * height * amount) / 3800);
  ctx.save();
  ctx.globalAlpha = 0.08;
  for (let i = 0; i < density; i += 1) {
    const value = Math.random() > 0.5 ? 255 : 0;
    ctx.fillStyle = `rgb(${value},${value},${value})`;
    ctx.fillRect(Math.random() * width, Math.random() * height, 1.5, 1.5);
  }
  ctx.restore();
}

function drawVignette(ctx, width, height, strength) {
  const gradient = ctx.createRadialGradient(width / 2, height / 2, width * 0.16, width / 2, height / 2, width * 0.72);
  gradient.addColorStop(0, "rgba(0,0,0,0)");
  gradient.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function drawCoverImage(ctx, image, rect) {
  const sourceWidth = image.videoWidth || image.naturalWidth || image.width;
  const sourceHeight = image.videoHeight || image.naturalHeight || image.height;
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = rect.width / rect.height;
  let sx = 0;
  let sy = 0;
  let sw = sourceWidth;
  let sh = sourceHeight;

  if (sourceRatio > targetRatio) {
    sw = sourceHeight * targetRatio;
    sx = (sourceWidth - sw) / 2;
  } else {
    sh = sourceWidth / targetRatio;
    sy = (sourceHeight - sh) / 2;
  }

  ctx.drawImage(image, sx, sy, sw, sh, rect.x, rect.y, rect.width, rect.height);
}

function sourceCanvasRect() {
  return { x: 0, y: 0, width: els.sourceCanvas.width, height: els.sourceCanvas.height };
}

function setFallback(title, subtitle) {
  els.fallback.hidden = false;
  els.fallback.innerHTML = `<strong>${title}</strong><span>${subtitle}</span>`;
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}
