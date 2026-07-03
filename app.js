const guides = [
  {
    id: "thirds",
    name: "삼분할",
    short: "인물/카페/일상",
    tip: "주인공을 교차점에 올리고 비워둘 방향을 정하세요.",
  },
  {
    id: "center",
    name: "중앙",
    short: "음식/제품/대칭",
    tip: "배경이 정돈되어 있을 때 중앙 배치가 가장 강합니다.",
  },
  {
    id: "horizon",
    name: "수평선",
    short: "풍경/하늘/바다",
    tip: "하늘이 예쁘면 수평선을 아래로, 바닥 질감이 좋으면 위로 올리세요.",
  },
  {
    id: "diagonal",
    name: "대각선",
    short: "길/계단/그림자",
    tip: "선이 화면을 가로지르게 두면 사진에 움직임이 생깁니다.",
  },
  {
    id: "portrait",
    name: "인물 여백",
    short: "상반신/전신",
    tip: "머리 위 여백은 줄이고 시선 방향에는 숨 쉴 공간을 남기세요.",
  },
  {
    id: "golden",
    name: "황금나선",
    short: "감성 스냅",
    tip: "큰 곡선의 끝에 시선을 둘 피사체를 배치하세요.",
  },
];

const filters = [
  {
    id: "ppotto",
    name: "영뽀또",
    short: "따뜻하고 투명한 기본 톤",
    css: "brightness(1.06) contrast(0.96) saturate(1.1) sepia(0.04)",
    overlay: [244, 211, 173],
    blend: "soft-light",
  },
  {
    id: "fairy",
    name: "동화",
    short: "초록과 피부톤을 부드럽게",
    css: "brightness(1.09) contrast(0.9) saturate(1.2) sepia(0.08)",
    overlay: [255, 224, 190],
    blend: "screen",
  },
  {
    id: "daily",
    name: "데일리",
    short: "실내와 카페에 맞는 맑은 톤",
    css: "brightness(1.04) contrast(0.98) saturate(1.04)",
    overlay: [230, 218, 195],
    blend: "soft-light",
  },
  {
    id: "cinema",
    name: "시네마",
    short: "깊은 그림자와 차분한 색",
    css: "brightness(0.95) contrast(1.16) saturate(0.92)",
    overlay: [32, 48, 54],
    blend: "multiply",
  },
  {
    id: "sunset",
    name: "노을",
    short: "해 질 무렵의 주황빛",
    css: "brightness(1.03) contrast(1.03) saturate(1.24) sepia(0.14)",
    overlay: [238, 124, 65],
    blend: "soft-light",
  },
  {
    id: "mono",
    name: "모노",
    short: "표정과 선에 집중",
    css: "grayscale(1) contrast(1.09) brightness(1.02)",
    overlay: [255, 255, 255],
    blend: "soft-light",
  },
];

const lessons = [
  ["시선 먼저 정하기", "사진을 찍기 전에 보는 사람이 가장 먼저 봐야 할 지점을 하나만 정하세요."],
  ["비우는 쪽 정하기", "피사체가 바라보는 방향이나 걸어가는 방향에 여백을 주면 답답함이 줄어듭니다."],
  ["전경으로 감성 만들기", "창문, 잎, 커튼, 난간을 화면 앞쪽에 살짝 걸치면 깊이가 생깁니다."],
  ["빛은 옆에서 받기", "측면광은 얼굴과 사물의 질감을 살립니다. 정오 직광은 피하는 편이 안정적입니다."],
  ["필터는 분위기만", "색감은 사진을 덮는 게 아니라 방향을 잡는 정도가 좋습니다."],
];

const state = {
  stream: null,
  facingMode: "environment",
  uploadedImage: null,
  lastShot: null,
  guide: guides[0],
  filter: filters[0],
  filterStrength: 0.78,
  grain: 10,
  vignette: 0.24,
  ready: false,
  toastTimer: null,
};

const els = {
  video: document.querySelector("#cameraVideo"),
  sourceCanvas: document.querySelector("#sourceCanvas"),
  outputCanvas: document.querySelector("#outputCanvas"),
  permissionCard: document.querySelector("#permissionCard"),
  startCameraButton: document.querySelector("#startCameraButton"),
  sampleSceneButton: document.querySelector("#sampleSceneButton"),
  switchCameraButton: document.querySelector("#switchCameraButton"),
  openPhotoButton: document.querySelector("#openPhotoButton"),
  photoInput: document.querySelector("#photoInput"),
  captureButton: document.querySelector("#captureButton"),
  saveButton: document.querySelector("#saveButton"),
  lastShotButton: document.querySelector("#lastShotButton"),
  guideName: document.querySelector("#guideName"),
  guideTip: document.querySelector("#guideTip"),
  activeSummary: document.querySelector("#activeSummary"),
  guidePicker: document.querySelector("#guidePicker"),
  filterPicker: document.querySelector("#filterPicker"),
  lessonStack: document.querySelector("#lessonStack"),
  tabBar: document.querySelector(".tool-tabs"),
  panels: document.querySelectorAll("[data-panel]"),
  filterStrength: document.querySelector("#filterStrength"),
  grainStrength: document.querySelector("#grainStrength"),
  vignetteStrength: document.querySelector("#vignetteStrength"),
  toast: document.querySelector("#toast"),
};

const sourceCtx = els.sourceCanvas.getContext("2d", { willReadFrequently: false });
const outputCtx = els.outputCanvas.getContext("2d", { willReadFrequently: false });

boot();

function boot() {
  renderPickers();
  bindEvents();
  updateCopy();
  drawSampleScene();
  requestAnimationFrame(draw);
}

function bindEvents() {
  els.startCameraButton.addEventListener("click", startCamera);
  els.sampleSceneButton.addEventListener("click", () => {
    stopCamera();
    state.uploadedImage = null;
    els.permissionCard.hidden = true;
    showToast("샘플 장면으로 구도와 필터를 확인합니다.");
  });
  els.switchCameraButton.addEventListener("click", switchCamera);
  els.openPhotoButton.addEventListener("click", () => els.photoInput.click());
  els.photoInput.addEventListener("change", loadPhoto);
  els.captureButton.addEventListener("click", capture);
  els.saveButton.addEventListener("click", save);
  els.lastShotButton.addEventListener("click", restoreLastShot);
  els.tabBar.addEventListener("click", switchTab);
  els.filterStrength.addEventListener("input", (event) => {
    state.filterStrength = Number(event.target.value) / 100;
  });
  els.grainStrength.addEventListener("input", (event) => {
    state.grain = Number(event.target.value);
  });
  els.vignetteStrength.addEventListener("input", (event) => {
    state.vignette = Number(event.target.value) / 100;
  });
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    showToast("이 브라우저는 카메라 API를 지원하지 않습니다.");
    return;
  }

  try {
    stopCamera();
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: state.facingMode },
        width: { ideal: 1440 },
        height: { ideal: 1920 },
      },
      audio: false,
    });
    els.video.srcObject = state.stream;
    await els.video.play();
    state.uploadedImage = null;
    els.permissionCard.hidden = true;
    showToast("실시간 구도 가이드를 켰습니다.");
  } catch (error) {
    showToast("카메라 권한 또는 HTTPS 환경을 확인하세요.");
  }
}

async function switchCamera() {
  state.facingMode = state.facingMode === "environment" ? "user" : "environment";
  if (state.stream) await startCamera();
  else showToast(state.facingMode === "environment" ? "후면 카메라 우선" : "전면 카메라 우선");
}

function stopCamera() {
  if (!state.stream) return;
  state.stream.getTracks().forEach((track) => track.stop());
  state.stream = null;
  els.video.srcObject = null;
}

function loadPhoto(event) {
  const [file] = event.target.files;
  if (!file) return;
  const image = new Image();
  const url = URL.createObjectURL(file);
  image.onload = () => {
    stopCamera();
    state.uploadedImage = image;
    els.permissionCard.hidden = true;
    URL.revokeObjectURL(url);
    showToast("사진에 구도와 필터를 적용합니다.");
  };
  image.src = url;
  event.target.value = "";
}

function switchTab(event) {
  const button = event.target.closest("[data-tab]");
  if (!button) return;
  const tab = button.dataset.tab;
  els.tabBar.querySelectorAll("button").forEach((item) => {
    item.classList.toggle("is-active", item === button);
  });
  els.panels.forEach((panel) => {
    panel.classList.toggle("is-hidden", panel.dataset.panel !== tab);
  });
}

function renderPickers() {
  els.guidePicker.append(...guides.map((guide) => makePickerCard(guide, "guide")));
  els.filterPicker.append(...filters.map((filter) => makePickerCard(filter, "filter")));
  els.lessonStack.append(...lessons.map(makeLessonCard));
  syncPickerState();
}

function makePickerCard(item, type) {
  const button = document.createElement("button");
  button.className = "picker-card";
  button.type = "button";
  button.innerHTML = `<strong>${item.name}</strong><span>${item.short}</span>`;
  button.addEventListener("click", () => {
    state[type] = item;
    syncPickerState();
    updateCopy();
  });
  return button;
}

function makeLessonCard([title, body]) {
  const card = document.createElement("article");
  card.className = "lesson-card";
  card.innerHTML = `<strong>${title}</strong><p>${body}</p>`;
  card.addEventListener("click", () => {
    els.guideTip.textContent = body;
    showToast(title);
  });
  return card;
}

function syncPickerState() {
  els.guidePicker.querySelectorAll(".picker-card").forEach((button, index) => {
    button.classList.toggle("is-active", guides[index] === state.guide);
  });
  els.filterPicker.querySelectorAll(".picker-card").forEach((button, index) => {
    button.classList.toggle("is-active", filters[index] === state.filter);
  });
}

function updateCopy() {
  els.guideName.textContent = `${state.guide.name} 가이드`;
  els.guideTip.textContent = state.guide.tip;
  els.activeSummary.textContent = `${state.filter.name} · ${state.guide.name}`;
}

function draw() {
  drawSource();
  drawOutput();
  requestAnimationFrame(draw);
}

function drawSource() {
  const rect = canvasRect(els.sourceCanvas);
  sourceCtx.clearRect(0, 0, rect.width, rect.height);

  if (state.stream && els.video.readyState >= 2) {
    sourceCtx.save();
    if (state.facingMode === "user") {
      sourceCtx.translate(rect.width, 0);
      sourceCtx.scale(-1, 1);
    }
    drawCover(sourceCtx, els.video, rect);
    sourceCtx.restore();
    return;
  }

  if (state.uploadedImage) {
    drawCover(sourceCtx, state.uploadedImage, rect);
    return;
  }

  drawSampleScene();
}

function drawSampleScene() {
  const { width, height } = canvasRect(els.sourceCanvas);
  const gradient = sourceCtx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#f4d6b5");
  gradient.addColorStop(0.42, "#c8d0bd");
  gradient.addColorStop(1, "#415849");
  sourceCtx.fillStyle = gradient;
  sourceCtx.fillRect(0, 0, width, height);

  sourceCtx.fillStyle = "rgba(255, 250, 241, 0.82)";
  roundRect(sourceCtx, width * 0.11, height * 0.14, width * 0.46, height * 0.44, 46);
  sourceCtx.fill();
  sourceCtx.fillStyle = "rgba(34, 44, 36, 0.8)";
  roundRect(sourceCtx, width * 0.53, height * 0.26, width * 0.31, height * 0.38, 210);
  sourceCtx.fill();
  sourceCtx.fillStyle = "rgba(255, 250, 241, 0.9)";
  sourceCtx.beginPath();
  sourceCtx.arc(width * 0.685, height * 0.31, width * 0.055, 0, Math.PI * 2);
  sourceCtx.fill();
  sourceCtx.fillStyle = "rgba(13, 12, 10, 0.52)";
  sourceCtx.font = "900 72px Inter, sans-serif";
  sourceCtx.fillText("MOOD", width * 0.15, height * 0.23);
}

function drawOutput() {
  const { width, height } = canvasRect(els.outputCanvas);
  outputCtx.clearRect(0, 0, width, height);
  outputCtx.save();
  outputCtx.filter = state.filter.css;
  outputCtx.drawImage(els.sourceCanvas, 0, 0, width, height);
  outputCtx.restore();
  applyFilterOverlay(width, height);
  drawGuide(width, height);
  state.ready = true;
  els.saveButton.disabled = false;
}

function applyFilterOverlay(width, height) {
  const [r, g, b] = state.filter.overlay;
  outputCtx.save();
  outputCtx.globalAlpha = state.filterStrength * 0.34;
  outputCtx.globalCompositeOperation = state.filter.blend;
  outputCtx.fillStyle = `rgb(${r}, ${g}, ${b})`;
  outputCtx.fillRect(0, 0, width, height);
  outputCtx.restore();

  drawVignette(width, height);
  drawGrain(width, height);
}

function drawGuide(width, height) {
  outputCtx.save();
  outputCtx.strokeStyle = "rgba(255,250,241,0.74)";
  outputCtx.fillStyle = "rgba(255,250,241,0.88)";
  outputCtx.lineWidth = 3;
  outputCtx.setLineDash([18, 16]);

  if (state.guide.id === "thirds") {
    line(width / 3, 0, width / 3, height);
    line((width * 2) / 3, 0, (width * 2) / 3, height);
    line(0, height / 3, width, height / 3);
    line(0, (height * 2) / 3, width, (height * 2) / 3);
    [width / 3, (width * 2) / 3].forEach((x) => {
      [height / 3, (height * 2) / 3].forEach((y) => dot(x, y));
    });
  }

  if (state.guide.id === "center") {
    outputCtx.setLineDash([]);
    line(width / 2, 0, width / 2, height);
    line(0, height / 2, width, height / 2);
    outputCtx.beginPath();
    outputCtx.arc(width / 2, height / 2, width * 0.18, 0, Math.PI * 2);
    outputCtx.stroke();
  }

  if (state.guide.id === "horizon") {
    line(0, height * 0.38, width, height * 0.38);
    line(0, height * 0.52, width, height * 0.52);
    line(0, height * 0.66, width, height * 0.66);
  }

  if (state.guide.id === "diagonal") {
    line(0, height, width, 0);
    line(0, height * 0.64, width * 0.64, 0);
    line(width * 0.36, height, width, height * 0.36);
  }

  if (state.guide.id === "portrait") {
    outputCtx.setLineDash([]);
    roundRect(outputCtx, width * 0.25, height * 0.15, width * 0.5, height * 0.64, width * 0.23);
    outputCtx.stroke();
    line(width * 0.18, height * 0.24, width * 0.82, height * 0.24);
    line(width * 0.18, height * 0.8, width * 0.82, height * 0.8);
  }

  if (state.guide.id === "golden") {
    outputCtx.setLineDash([]);
    outputCtx.beginPath();
    for (let angle = 0; angle < Math.PI * 2.25; angle += 0.04) {
      const radius = Math.exp(0.23 * angle) * 24;
      const x = width * 0.62 - Math.cos(angle) * radius;
      const y = height * 0.42 + Math.sin(angle) * radius;
      if (angle === 0) outputCtx.moveTo(x, y);
      else outputCtx.lineTo(x, y);
    }
    outputCtx.stroke();
    dot(width * 0.62, height * 0.42);
  }

  outputCtx.restore();

  function line(x1, y1, x2, y2) {
    outputCtx.beginPath();
    outputCtx.moveTo(x1, y1);
    outputCtx.lineTo(x2, y2);
    outputCtx.stroke();
  }

  function dot(x, y) {
    outputCtx.save();
    outputCtx.setLineDash([]);
    outputCtx.beginPath();
    outputCtx.arc(x, y, 9, 0, Math.PI * 2);
    outputCtx.fill();
    outputCtx.restore();
  }
}

function drawVignette(width, height) {
  const gradient = outputCtx.createRadialGradient(width / 2, height / 2, width * 0.08, width / 2, height / 2, width * 0.76);
  gradient.addColorStop(0, "rgba(0,0,0,0)");
  gradient.addColorStop(1, `rgba(0,0,0,${state.vignette})`);
  outputCtx.fillStyle = gradient;
  outputCtx.fillRect(0, 0, width, height);
}

function drawGrain(width, height) {
  if (state.grain <= 0) return;
  const dots = Math.floor((width * height * state.grain) / 5600);
  outputCtx.save();
  outputCtx.globalAlpha = 0.075;
  for (let i = 0; i < dots; i += 1) {
    const value = Math.random() > 0.5 ? 255 : 24;
    outputCtx.fillStyle = `rgb(${value},${value},${value})`;
    outputCtx.fillRect(Math.random() * width, Math.random() * height, 1.2, 1.2);
  }
  outputCtx.restore();
}

function capture() {
  if (!state.ready) return;
  state.lastShot = els.outputCanvas.toDataURL("image/png");
  updateLastShot();
  showToast("촬영했습니다. 저장을 누르면 PNG로 내려받습니다.");
}

function save() {
  const href = state.lastShot || els.outputCanvas.toDataURL("image/png");
  const link = document.createElement("a");
  link.download = `young-ppotto-${Date.now()}.png`;
  link.href = href;
  link.click();
  showToast("사진 저장을 시작했습니다.");
}

function restoreLastShot() {
  if (!state.lastShot) {
    els.photoInput.click();
    return;
  }
  const image = new Image();
  image.onload = () => {
    stopCamera();
    state.uploadedImage = image;
    showToast("최근 촬영 컷을 다시 불러왔습니다.");
  };
  image.src = state.lastShot;
}

function updateLastShot() {
  els.lastShotButton.innerHTML = "";
  if (!state.lastShot) return;
  const image = document.createElement("img");
  image.src = state.lastShot;
  image.alt = "최근 촬영 사진";
  els.lastShotButton.append(image);
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("is-visible");
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => {
    els.toast.classList.remove("is-visible");
  }, 1800);
}

function drawCover(ctx, source, rect) {
  const sourceWidth = source.videoWidth || source.naturalWidth || source.width;
  const sourceHeight = source.videoHeight || source.naturalHeight || source.height;
  if (!sourceWidth || !sourceHeight) return;
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

  ctx.drawImage(source, sx, sy, sw, sh, rect.x, rect.y, rect.width, rect.height);
}

function canvasRect(canvas) {
  return { x: 0, y: 0, width: canvas.width, height: canvas.height };
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
