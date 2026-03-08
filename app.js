const { jsPDF } = window.jspdf;

const fileInput = document.getElementById("fileInput");
const convertBtn = document.getElementById("convertBtn");
const statusEl = document.getElementById("status");
const fileInfo = document.getElementById("fileInfo");
const downloadLink = document.getElementById("downloadLink");
const previewControls = document.getElementById("previewControls");
const previewBtn = document.getElementById("previewBtn");
const previewWrap = document.getElementById("previewWrap");
const previewFrame = document.getElementById("previewFrame");
const previewCloseBtn = document.getElementById("previewCloseBtn");
const dropzone = document.getElementById("dropzone");
const targetSizeInput = document.getElementById("targetSizeInput");
const targetUnitSelect = document.getElementById("targetUnitSelect");
const maxCompressionInput = document.getElementById("maxCompressionInput");
const loadingWrap = document.getElementById("loadingWrap");
const loadingBar = document.getElementById("loadingBar");
const loadingHead = document.getElementById("loadingHead");
const loadingLabel = document.getElementById("loadingLabel");
const loadingPercent = document.getElementById("loadingPercent");
const successBurst = document.getElementById("successBurst");
const openCameraBtn = document.getElementById("openCameraBtn");
const closeCameraBtn = document.getElementById("closeCameraBtn");
const captureBtn = document.getElementById("captureBtn");
const cameraPanel = document.getElementById("cameraPanel");
const cameraPreview = document.getElementById("cameraPreview");
const cameraOverlay = document.getElementById("cameraOverlay");
const flashToggleBtn = document.getElementById("flashToggleBtn");
const flashToggleText = document.getElementById("flashToggleText");
const autoCaptureToggleBtn = document.getElementById("autoCaptureToggleBtn");
const autoCaptureToggleText = document.getElementById("autoCaptureToggleText");
const retakeBtn = document.getElementById("retakeBtn");
const startEditQueueBtn = document.getElementById("startEditQueueBtn");
const nextToPreviewBtn = document.getElementById("nextToPreviewBtn");
const nextToPreviewBtnText = document.getElementById("nextToPreviewBtnText");
const backToEditBtn = document.getElementById("backToEditBtn");
const saveScanBtn = document.getElementById("saveScanBtn");
const scanLiveStage = document.getElementById("scanLiveStage");
const scanEditStage = document.getElementById("scanEditStage");
const scanPreviewStage = document.getElementById("scanPreviewStage");
const scanStageBadge = document.getElementById("scanStageBadge");
const scanCountBadge = document.getElementById("scanCountBadge");
const scanSourceWrap = document.getElementById("scanSourceWrap");
const scanSourceCanvas = document.getElementById("scanSourceCanvas");
const scanEditOverlay = document.getElementById("scanEditOverlay");
const scanHandles = document.getElementById("scanHandles");
const scanRotateInput = document.getElementById("scanRotateInput");
const rotateLeftBtn = document.getElementById("rotateLeftBtn");
const rotateRightBtn = document.getElementById("rotateRightBtn");
const rotate180Btn = document.getElementById("rotate180Btn");
const scanBrightnessInput = document.getElementById("scanBrightnessInput");
const scanContrastInput = document.getElementById("scanContrastInput");
const scanSharpnessInput = document.getElementById("scanSharpnessInput");
const applyAllToggle = document.getElementById("applyAllToggle");
const scanModeHint = document.getElementById("scanModeHint");
const scanPreviewCanvas = document.getElementById("scanPreviewCanvas");
const scanPreviewWrap = document.getElementById("scanPreviewWrap");
const scanZoomInput = document.getElementById("scanZoomInput");
const scanZoomLabel = document.getElementById("scanZoomLabel");
const saveScanBtnText = document.getElementById("saveScanBtnText");
const retakeBtnText = document.getElementById("retakeBtnText");
const downloadLinkText = document.getElementById("downloadLinkText");
const scanQueueMeta = document.getElementById("scanQueueMeta");
const scanQueueList = document.getElementById("scanQueueList");
const scanEditProgress = document.getElementById("scanEditProgress");
const scanProcessing = document.getElementById("scanProcessing");
const scanProcessingText = document.getElementById("scanProcessingText");
const card = document.querySelector(".card");

if (window.lucide?.createIcons) {
  window.lucide.createIcons();
}

let selectedFiles = [];
let activeCameraStream = null;
let cameraCapturedFiles = [];
let processingTimer = null;
let loadingProgress = 0;
let downloadTimer = null;
let outputUrl = null;

const scanState = {
  stage: "live",
  torchSupported: false,
  torchOn: false,
  liveDetectTimer: null,
  liveDetectCanvas: null,
  liveDetectCtx: null,
  liveCorners: null,
  liveDetectedCorners: null,
  jscanifyEngine: null,
  lowLightWarnedAt: 0,
  aiAssistCanvas: null,
  aiAssistCtx: null,
  aiAssistCornersNormalized: null,
  aiAssistCornersAt: 0,
  aiAssistUnavailableUntil: 0,
  aiAssistInFlight: false,
  aiAssistLastAt: 0,
  aiAssistLastAdviceAt: 0,
  autoCaptureEnabled: false,
  autoCaptureStableSince: 0,
  autoCaptureLastCorners: null,
  autoCaptureLastSeenAt: 0,
  autoCaptureCooldownUntil: 0,
  autoCaptureLastStatusAt: 0,
  autoCaptureNeedsMotionReset: false,
  autoCaptureLastMotionScore: 0,
  autoCaptureLastAreaRatio: 0,
  motionFrameRef: null,
  captureInProgress: false,
  suggestedFileName: "scan",
  orientationDetectInFlight: false,
  orientationSuggestionDeg: 0,
  retakeInsertIndex: null,
  pendingRawCaptures: [],
  currentRawCapture: null,
  sourceCanvas: null,
  sourceCtx: null,
  corners: null,
  cropDirty: true,
  cachedCroppedCanvas: null,
  cachedOutputCanvas: null,
  editMode: "all",
  filter: "original",
  draggingCornerIndex: -1,
  controls: {
    rotate: 0,
    brightness: 100,
    contrast: 100,
    sharpness: 15,
  },
};

const LOW_LIGHT_THRESHOLD = 52;
const LOW_LIGHT_WARN_COOLDOWN_MS = 4500;
const AI_DOC_CHECK_MIN_INTERVAL_MS = 2600;
const AI_ADVICE_COOLDOWN_MS = 5000;
const AI_CORNER_TTL_MS = 3400;
const AUTO_CAPTURE_STABLE_MS = 1400;
const AUTO_CAPTURE_COOLDOWN_MS = 1800;
const AUTO_CAPTURE_MAX_JITTER_PX = 9;
const AUTO_CAPTURE_MIN_DOC_AREA_RATIO = 0.16;
const AUTO_CAPTURE_MAX_MOTION_SCORE = 15;
const AUTO_CAPTURE_RESET_MOTION_SCORE = 17;
const AUTO_CAPTURE_STATUS_COOLDOWN_MS = 700;
let opencvReady = false;

function initOpenCvRuntimeHook() {
  const cvRef = window.cv;
  if (!cvRef) {
    return false;
  }
  if (cvRef.Mat && cvRef.findContours) {
    opencvReady = true;
    return true;
  }
  const previousHandler = cvRef.onRuntimeInitialized;
  cvRef.onRuntimeInitialized = () => {
    opencvReady = true;
    if (typeof previousHandler === "function") {
      previousHandler();
    }
  };
  return true;
}

const openCvInitTimer = setInterval(() => {
  if (opencvReady) {
    clearInterval(openCvInitTimer);
    return;
  }
  initOpenCvRuntimeHook();
}, 650);

const textExtensions = new Set([
  "txt",
  "md",
  "csv",
  "json",
  "xml",
  "html",
  "css",
  "js",
  "ts",
  "py",
  "java",
  "c",
  "cpp",
  "log",
]);

const officeExtensions = new Set([
  "doc",
  "docx",
  "ppt",
  "pptx",
  "xls",
  "xlsx",
  "odt",
  "odp",
  "ods",
  "rtf",
  "pages",
  "key",
  "numbers",
]);

function setStatus(message) {
  statusEl.textContent = message;
}

function setControlText(control, label, labelNode) {
  if (labelNode) {
    labelNode.textContent = label;
    return;
  }
  if (control) {
    control.textContent = label;
  }
}

function getExt(filename) {
  const idx = filename.lastIndexOf(".");
  return idx === -1 ? "" : filename.slice(idx + 1).toLowerCase();
}

function resetDownloadLink() {
  if (outputUrl) {
    URL.revokeObjectURL(outputUrl);
    outputUrl = null;
  }
  downloadLink.classList.add("hidden");
  downloadLink.removeAttribute("href");
  downloadLink.classList.remove("pending");
  setControlText(downloadLink, "Download PDF", downloadLinkText);
  previewControls.classList.add("hidden");
  previewWrap.classList.add("hidden");
  previewFrame.removeAttribute("src");
  if (downloadTimer) {
    clearInterval(downloadTimer);
    downloadTimer = null;
  }
}

function startDownloadCountdown(linkEl, finalText) {
  let count = 3;
  linkEl.classList.add("pending");
  setControlText(linkEl, `Download in ${count}s`, downloadLinkText);
  const timer = setInterval(() => {
    count -= 1;
    if (count <= 0) {
      clearInterval(timer);
      linkEl.classList.remove("pending");
      setControlText(linkEl, finalText, downloadLinkText);
      return;
    }
    setControlText(linkEl, `Download in ${count}s`, downloadLinkText);
  }, 1000);
}

function renderLoadingProgress() {
  const value = Math.max(0, Math.min(100, Math.round(loadingProgress)));
  loadingBar.style.width = `${value}%`;
  if (loadingHead) {
    loadingHead.style.left = `${value}%`;
  }
  loadingPercent.textContent = `${value}%`;
}

function triggerSuccessAnimation() {
  if (!card) return;
  card.classList.remove("success-pop");
  void card.offsetWidth;
  card.classList.add("success-pop");
}

function startLoading(labelText = "Converting...") {
  loadingLabel.textContent = labelText;
  loadingProgress = 2;
  renderLoadingProgress();
  if (processingTimer) {
    clearInterval(processingTimer);
    processingTimer = null;
  }
}

function setLoadingLabel(text) {
  loadingLabel.textContent = text;
}

function stopLoading(success) {
  if (processingTimer) {
    clearInterval(processingTimer);
    processingTimer = null;
  }
  loadingProgress = success ? 100 : Math.min(loadingProgress, 96);
  renderLoadingProgress();

  const delay = success ? 500 : 260;
  setTimeout(() => {
    loadingProgress = 0;
    renderLoadingProgress();
    loadingLabel.textContent = "Ready";
    loadingPercent.textContent = "0%";
  }, delay);
}

function startProcessingPulse(min = 52, max = 86) {
  if (processingTimer) {
    clearInterval(processingTimer);
  }
  processingTimer = setInterval(() => {
    if (loadingProgress < min) {
      loadingProgress = min;
    } else {
      loadingProgress = Math.min(max, loadingProgress + 0.7);
    }
    renderLoadingProgress();
  }, 320);
}

function stopProcessingPulse() {
  if (processingTimer) {
    clearInterval(processingTimer);
    processingTimer = null;
  }
}

function createProgressId() {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function postFormDataWithProgress(
  url,
  formData,
  {
    uploadLabel = "Uploading file...",
    processLabel = "Processing on server...",
    downloadLabel = "Receiving output...",
    fallbackError = "Request failed.",
  } = {}
) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const progressId = createProgressId();
    let progressPollTimer = null;

    const stopProgressPolling = () => {
      if (progressPollTimer) {
        clearInterval(progressPollTimer);
        progressPollTimer = null;
      }
    };

    const pollServerProgress = async () => {
      if (xhr.readyState >= XMLHttpRequest.DONE) {
        stopProgressPolling();
        return;
      }
      try {
        const response = await fetch(`/api/progress/${encodeURIComponent(progressId)}?t=${Date.now()}`, {
          cache: "no-store",
        });
        if (!response.ok) {
          return;
        }
        const data = await response.json();
        if (typeof data.progress === "number") {
          const mappedProgress = 35 + (Math.max(0, Math.min(100, data.progress)) / 100) * 55;
          if (mappedProgress > loadingProgress && xhr.readyState < XMLHttpRequest.LOADING) {
            loadingProgress = mappedProgress;
            renderLoadingProgress();
          }
        }
        if (data.phase && xhr.readyState < XMLHttpRequest.LOADING) {
          setLoadingLabel(data.phase);
        }
      } catch {
        // Silent: polling is best-effort only.
      }
    };

    xhr.open("POST", url, true);
    xhr.setRequestHeader("x-progress-id", progressId);
    xhr.responseType = "blob";

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) {
        return;
      }
      stopProcessingPulse();
      const ratio = event.total > 0 ? event.loaded / event.total : 0;
      loadingProgress = Math.max(6, Math.min(48, 6 + ratio * 42));
      renderLoadingProgress();
      setLoadingLabel(uploadLabel);
    };

    xhr.onreadystatechange = () => {
      if (xhr.readyState === XMLHttpRequest.HEADERS_RECEIVED) {
        loadingProgress = Math.max(52, loadingProgress);
        renderLoadingProgress();
        setLoadingLabel(processLabel);
        startProcessingPulse(52, 86);
      }
    };

    xhr.onprogress = (event) => {
      if (!event.lengthComputable || xhr.readyState < XMLHttpRequest.HEADERS_RECEIVED) {
        return;
      }
      stopProgressPolling();
      stopProcessingPulse();
      const ratio = event.total > 0 ? event.loaded / event.total : 0;
      loadingProgress = Math.max(87, Math.min(99, 87 + ratio * 12));
      renderLoadingProgress();
      setLoadingLabel(downloadLabel);
    };

    xhr.onerror = () => {
      stopProgressPolling();
      stopProcessingPulse();
      reject(new Error("Network error while converting."));
    };

    xhr.onabort = () => {
      stopProgressPolling();
      stopProcessingPulse();
      reject(new Error("Request aborted."));
    };

    xhr.onload = async () => {
      stopProgressPolling();
      stopProcessingPulse();
      if (xhr.status >= 200 && xhr.status < 300) {
        loadingProgress = Math.max(99, loadingProgress);
        renderLoadingProgress();
        resolve(xhr.response);
        return;
      }

      let message = fallbackError;
      try {
        const text = await xhr.response.text();
        const parsed = JSON.parse(text);
        message = parsed.error || message;
      } catch {
        // keep fallback message
      }
      reject(new Error(message));
    };

    progressPollTimer = setInterval(pollServerProgress, 420);
    pollServerProgress();
    xhr.send(formData);
  });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function pointDistance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function cloneCorners(corners) {
  return corners.map((point) => ({ x: point.x, y: point.y }));
}

function createDefaultCorners(width, height, marginRatio = 0.08) {
  const margin = Math.round(Math.min(width, height) * marginRatio);
  return [
    { x: margin, y: margin },
    { x: width - margin, y: margin },
    { x: width - margin, y: height - margin },
    { x: margin, y: height - margin },
  ];
}

function setScanProcessing(isBusy, text = "Processing scan...") {
  if (!scanProcessing) {
    return;
  }
  scanProcessing.classList.toggle("hidden", !isBusy);
  if (scanProcessingText) {
    scanProcessingText.textContent = text;
  }
}

function revokeCaptureThumb(capture) {
  if (capture?.thumbUrl) {
    URL.revokeObjectURL(capture.thumbUrl);
  }
}

function getQueuedCaptureCount() {
  return scanState.pendingRawCaptures.length;
}

function clearQueuedRawCaptures() {
  scanState.pendingRawCaptures.forEach(revokeCaptureThumb);
  scanState.pendingRawCaptures = [];
  scanState.currentRawCapture = null;
  scanState.retakeInsertIndex = null;
}

function renderScanQueue() {
  if (!scanQueueList) {
    return;
  }
  scanQueueList.innerHTML = "";
  const rows = scanState.pendingRawCaptures;

  if (!rows.length) {
    const empty = document.createElement("div");
    empty.className = "scan-queue-empty";
    empty.textContent = "No photos captured yet.";
    scanQueueList.appendChild(empty);
    return;
  }

  rows.forEach((capture, index) => {
    const pill = document.createElement("button");
    pill.type = "button";
    const isEditing = scanState.currentRawCapture?.id === capture.id;
    pill.className = `scan-queue-item ${isEditing ? "is-editing" : ""}`;
    pill.setAttribute("aria-label", `Edit captured photo ${index + 1}`);
    pill.title = `Edit photo ${index + 1}`;
    const thumb = document.createElement("img");
    thumb.src = capture.thumbUrl;
    thumb.alt = `Captured page ${index + 1}`;
    thumb.loading = "lazy";
    const label = document.createElement("span");
    label.textContent = isEditing ? `Editing` : `Page ${index + 1}`;
    pill.appendChild(thumb);
    pill.appendChild(label);
    pill.addEventListener("click", async () => {
      try {
        await editCaptureById(capture.id);
      } catch (error) {
        setStatus(`Failed: ${error.message}`);
      }
    });
    scanQueueList.appendChild(pill);
  });
}

function updateEditProgress() {
  if (!scanEditProgress) {
    return;
  }
  const queued = getQueuedCaptureCount();
  if (!queued || !scanState.currentRawCapture) {
    scanEditProgress.textContent = "No capture selected for editing.";
    return;
  }
  if (scanState.editMode === "each") {
    const currentIndex = Math.max(
      1,
      scanState.pendingRawCaptures.findIndex(
        (capture) => capture.id === scanState.currentRawCapture?.id
      ) + 1
    );
    scanEditProgress.textContent = `Editing photo ${currentIndex} of ${queued}`;
    return;
  }
  scanEditProgress.textContent = `Apply this edit style to all ${queued} photos`;
}

function updateScanBadges() {
  const queued = getQueuedCaptureCount();
  const saved = cameraCapturedFiles.length;

  if (scanCountBadge) {
    scanCountBadge.textContent = `Queue: ${queued} • Saved: ${saved}`;
  }
  if (scanQueueMeta) {
    scanQueueMeta.textContent = `${queued} queued • ${saved} saved`;
  }
  if (startEditQueueBtn) {
    startEditQueueBtn.disabled = queued === 0;
    startEditQueueBtn.classList.toggle("hidden", scanState.stage !== "live");
  }
  if (retakeBtn) {
    const canRetakeLive = scanState.stage === "live" && queued > 0;
    const canRetakeEdit = scanState.stage !== "live" && Boolean(scanState.currentRawCapture);
    const showRetake = canRetakeLive || canRetakeEdit;
    retakeBtn.classList.toggle("hidden", !showRetake);
    if (showRetake) {
      setControlText(
        retakeBtn,
        canRetakeLive ? "Retake Last" : "Retake This",
        retakeBtnText
      );
    }
  }
  renderScanQueue();
  updateEditProgress();
}

function updateFilterButtonsUi() {
  document.querySelectorAll(".scan-filter-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.filter === scanState.filter);
  });
}

function updateEditModeUi() {
  if (applyAllToggle) {
    applyAllToggle.checked = scanState.editMode === "all";
  }
  if (nextToPreviewBtnText) {
    nextToPreviewBtnText.textContent =
      scanState.editMode === "all" ? "Preview" : "Done & Next";
  }
  if (saveScanBtnText) {
    saveScanBtnText.textContent =
      scanState.editMode === "all" ? "Finish" : "Done & Next";
  }
  if (scanModeHint) {
    scanModeHint.textContent =
      scanState.editMode === "all"
        ? "Checked: one edit style for all photos. Uncheck to edit one-by-one."
        : "Unchecked: each photo is edited and saved one by one.";
  }
}

function setScanEditMode(mode) {
  scanState.editMode = mode === "each" ? "each" : "all";
  if (scanState.editMode === "each" && scanState.stage === "preview") {
    setScanStage("edit");
  }
  updateEditModeUi();
  updateEditProgress();
}

function resetScanControls() {
  scanState.filter = "original";
  scanState.controls = {
    rotate: 0,
    brightness: 100,
    contrast: 100,
    sharpness: 15,
  };
  if (scanRotateInput) {
    scanRotateInput.value = "0";
  }
  if (scanBrightnessInput) {
    scanBrightnessInput.value = "100";
  }
  if (scanContrastInput) {
    scanContrastInput.value = "100";
  }
  if (scanSharpnessInput) {
    scanSharpnessInput.value = "15";
  }
  if (scanZoomInput) {
    scanZoomInput.value = "100";
  }
  if (scanZoomLabel) {
    scanZoomLabel.textContent = "100%";
  }
  updateFilterButtonsUi();
}

function syncScanControlsFromInputs() {
  scanState.controls.rotate = Number(scanRotateInput?.value || 0);
  scanState.controls.brightness = Number(scanBrightnessInput?.value || 100);
  scanState.controls.contrast = Number(scanContrastInput?.value || 100);
  scanState.controls.sharpness = Number(scanSharpnessInput?.value || 0);
  scanState.cachedOutputCanvas = null;
  refreshPreviewCanvasIfVisible();
}

function normalizeRotationDeg(value) {
  let deg = Number(value) || 0;
  while (deg > 180) {
    deg -= 360;
  }
  while (deg < -180) {
    deg += 360;
  }
  return Math.round(deg);
}

function triggerRotationAnimation() {
  if (!scanSourceWrap) {
    return;
  }
  scanSourceWrap.classList.remove("rotation-anim");
  void scanSourceWrap.offsetWidth;
  scanSourceWrap.classList.add("rotation-anim");
}

function setRotationDegrees(degrees) {
  const normalized = normalizeRotationDeg(degrees);
  scanState.controls.rotate = normalized;
  if (scanRotateInput) {
    scanRotateInput.value = String(normalized);
  }
  scanState.cachedOutputCanvas = null;
  triggerRotationAnimation();
  refreshPreviewCanvasIfVisible();
}

function rotateCurrentEditorPageBy(deltaDeg) {
  if (!scanState.sourceCanvas) {
    return false;
  }
  const rotatedCanvas = rotateCanvas(scanState.sourceCanvas, deltaDeg);
  const rotatedCtx = rotatedCanvas.getContext("2d", { willReadFrequently: true });
  if (!rotatedCtx) {
    return false;
  }
  scanState.sourceCanvas = rotatedCanvas;
  scanState.sourceCtx = rotatedCtx;
  scanState.corners = createDefaultCorners(rotatedCanvas.width, rotatedCanvas.height, 0.03);
  scanState.controls.rotate = 0;
  if (scanRotateInput) {
    scanRotateInput.value = "0";
  }
  scanState.cropDirty = true;
  scanState.cachedCroppedCanvas = null;
  scanState.cachedOutputCanvas = null;
  triggerRotationAnimation();
  renderScanSource();
  refreshPreviewCanvasIfVisible();
  return true;
}

function rotateBy(deltaDeg) {
  if (scanState.stage === "edit" && scanState.sourceCanvas) {
    rotateCurrentEditorPageBy(deltaDeg);
    return;
  }
  setRotationDegrees((scanState.controls.rotate || 0) + deltaDeg);
}

async function applyAutoRotateSuggestion() {
  if (!scanState.sourceCanvas || !scanState.corners) {
    throw new Error("Capture and open a page first.");
  }
  setScanProcessing(true, "Analyzing page orientation...");
  try {
    await suggestAutoRotationForCurrentPage();
    const suggested = normalizeRotationDeg(scanState.orientationSuggestionDeg || 0);
    if (Math.abs(suggested) < 45) {
      setStatus("Orientation already looks correct.");
      return;
    }
    setRotationDegrees((scanState.controls.rotate || 0) + suggested);
    setStatus(`Auto rotated by ${suggested}°.`);
  } finally {
    setScanProcessing(false);
  }
}

function applyFilterPreset(filterName) {
  scanState.filter = filterName;
  if (filterName === "bw") {
    scanState.controls.brightness = 114;
    scanState.controls.contrast = 152;
    scanState.controls.sharpness = 35;
  } else if (filterName === "highcontrast") {
    scanState.controls.brightness = 106;
    scanState.controls.contrast = 172;
    scanState.controls.sharpness = 30;
  } else if (filterName === "grayscale") {
    scanState.controls.brightness = 100;
    scanState.controls.contrast = 118;
    scanState.controls.sharpness = 18;
  } else if (filterName === "color") {
    scanState.controls.brightness = 108;
    scanState.controls.contrast = 122;
    scanState.controls.sharpness = 20;
  } else if (filterName === "scan") {
    scanState.controls.brightness = 128;
    scanState.controls.contrast = 184;
    scanState.controls.sharpness = 44;
  } else {
    scanState.controls.brightness = 100;
    scanState.controls.contrast = 100;
    scanState.controls.sharpness = 15;
  }
  if (scanBrightnessInput) {
    scanBrightnessInput.value = String(scanState.controls.brightness);
  }
  if (scanContrastInput) {
    scanContrastInput.value = String(scanState.controls.contrast);
  }
  if (scanSharpnessInput) {
    scanSharpnessInput.value = String(scanState.controls.sharpness);
  }
  updateFilterButtonsUi();
  scanState.cachedOutputCanvas = null;
}

function syncVideoOverlaySize() {
  if (!cameraOverlay || !cameraPreview) {
    return;
  }
  const width = cameraPreview.videoWidth || cameraPreview.clientWidth || 0;
  const height = cameraPreview.videoHeight || cameraPreview.clientHeight || 0;
  if (!width || !height) {
    return;
  }
  if (cameraOverlay.width !== width || cameraOverlay.height !== height) {
    cameraOverlay.width = width;
    cameraOverlay.height = height;
  }
}

function drawPolygon(ctx, points, stroke = "rgba(255,255,255,0.95)") {
  if (!ctx || !points || points.length !== 4) {
    return;
  }
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = stroke;
  ctx.shadowColor = "rgba(255,255,255,0.5)";
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.closePath();
  ctx.stroke();
  for (const point of points) {
    ctx.beginPath();
    ctx.fillStyle = "#ffffff";
    ctx.arc(point.x, point.y, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function orderCornersClockwise(points) {
  if (!Array.isArray(points) || points.length !== 4) {
    return null;
  }
  const normalized = points.map((point) => ({ x: Number(point.x), y: Number(point.y) }));
  if (normalized.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
    return null;
  }
  const sums = normalized.map((point) => point.x + point.y);
  const diffs = normalized.map((point) => point.x - point.y);
  const tl = normalized[sums.indexOf(Math.min(...sums))];
  const br = normalized[sums.indexOf(Math.max(...sums))];
  const tr = normalized[diffs.indexOf(Math.max(...diffs))];
  const bl = normalized[diffs.indexOf(Math.min(...diffs))];
  return [tl, tr, br, bl];
}

function normalizeCornerCandidate(rawCorners) {
  if (!rawCorners) {
    return null;
  }
  if (Array.isArray(rawCorners) && rawCorners.length === 4) {
    const direct = rawCorners.map((entry) => {
      if (Array.isArray(entry) && entry.length >= 2) {
        return { x: Number(entry[0]), y: Number(entry[1]) };
      }
      if (entry && typeof entry === "object") {
        return { x: Number(entry.x), y: Number(entry.y) };
      }
      return { x: NaN, y: NaN };
    });
    return orderCornersClockwise(direct);
  }
  const objectShape =
    rawCorners.topLeft &&
    rawCorners.topRight &&
    rawCorners.bottomRight &&
    rawCorners.bottomLeft;
  if (objectShape) {
    return orderCornersClockwise([
      rawCorners.topLeft,
      rawCorners.topRight,
      rawCorners.bottomRight,
      rawCorners.bottomLeft,
    ]);
  }
  return null;
}

function detectDocumentCornersWithOpenCv(imageData, width, height) {
  if (!opencvReady || !window.cv || !window.cv.Mat || !window.cv.findContours) {
    return null;
  }
  const cv = window.cv;
  let src = null;
  let gray = null;
  let blur = null;
  let edges = null;
  let contours = null;
  let hierarchy = null;
  let best = null;
  let bestArea = 0;
  try {
    src = cv.matFromImageData(imageData);
    gray = new cv.Mat();
    blur = new cv.Mat();
    edges = new cv.Mat();
    contours = new cv.MatVector();
    hierarchy = new cv.Mat();

    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
    cv.Canny(blur, edges, 70, 180);

    const kernel = cv.Mat.ones(3, 3, cv.CV_8U);
    cv.dilate(edges, edges, kernel);
    cv.morphologyEx(edges, edges, cv.MORPH_CLOSE, kernel);
    kernel.delete();

    cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    for (let i = 0; i < contours.size(); i += 1) {
      const contour = contours.get(i);
      const peri = cv.arcLength(contour, true);
      const approx = new cv.Mat();
      cv.approxPolyDP(contour, approx, 0.02 * peri, true);
      const area = Math.abs(cv.contourArea(approx));
      const minArea = width * height * 0.14;
      const isQuad = approx.rows === 4;
      const isConvex = isQuad ? cv.isContourConvex(approx) : false;

      if (isQuad && isConvex && area > minArea && area > bestArea) {
        const points = [];
        for (let p = 0; p < 4; p += 1) {
          const ptr = approx.intPtr(p, 0);
          points.push({ x: ptr[0], y: ptr[1] });
        }
        const ordered = orderCornersClockwise(points);
        if (ordered) {
          best = ordered;
          bestArea = area;
        }
      }
      approx.delete();
      contour.delete();
    }
  } catch {
    best = null;
  } finally {
    src?.delete();
    gray?.delete();
    blur?.delete();
    edges?.delete();
    contours?.delete();
    hierarchy?.delete();
  }
  return best;
}

function detectDocumentCornersWithJscanify(imageData, width, height) {
  if (!window.jscanify) {
    return null;
  }
  try {
    if (!scanState.jscanifyEngine) {
      scanState.jscanifyEngine = new window.jscanify();
    }
    if (!scanState.jscanifyEngine || typeof scanState.jscanifyEngine.findPaperContour !== "function") {
      return null;
    }
    const tmpCanvas = document.createElement("canvas");
    tmpCanvas.width = width;
    tmpCanvas.height = height;
    const tmpCtx = tmpCanvas.getContext("2d");
    if (!tmpCtx) {
      return null;
    }
    tmpCtx.putImageData(imageData, 0, 0);
    const contour = scanState.jscanifyEngine.findPaperContour(tmpCanvas);
    return normalizeCornerCandidate(contour);
  } catch {
    return null;
  }
}

function detectDocumentCornersFromImageData(imageData, width, height) {
  const cvCorners = detectDocumentCornersWithOpenCv(imageData, width, height);
  if (cvCorners) {
    return cvCorners;
  }
  const jscanifyCorners = detectDocumentCornersWithJscanify(imageData, width, height);
  if (jscanifyCorners) {
    return jscanifyCorners;
  }

  const pixels = imageData.data;
  const gray = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const r = pixels[idx];
      const g = pixels[idx + 1];
      const b = pixels[idx + 2];
      gray[y * width + x] = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
    }
  }

  const colScore = new Uint16Array(width);
  const rowScore = new Uint16Array(height);
  let edgePixels = 0;
  const edgeThreshold = 52;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const idx = y * width + x;
      const gx = gray[idx + 1] - gray[idx - 1];
      const gy = gray[idx + width] - gray[idx - width];
      const mag = Math.abs(gx) + Math.abs(gy);
      if (mag > edgeThreshold) {
        colScore[x] += 1;
        rowScore[y] += 1;
        edgePixels += 1;
      }
    }
  }

  if (edgePixels < width * height * 0.006) {
    return null;
  }

  const minColHits = Math.max(3, Math.floor(height * 0.06));
  const minRowHits = Math.max(3, Math.floor(width * 0.06));
  const leftStart = Math.floor(width * 0.04);
  const leftEnd = Math.floor(width * 0.48);
  const rightStart = Math.floor(width * 0.96);
  const rightEnd = Math.floor(width * 0.52);
  const topStart = Math.floor(height * 0.04);
  const topEnd = Math.floor(height * 0.48);
  const bottomStart = Math.floor(height * 0.96);
  const bottomEnd = Math.floor(height * 0.52);

  let left = leftStart;
  while (left < leftEnd && colScore[left] < minColHits) {
    left += 1;
  }
  let right = rightStart;
  while (right > rightEnd && colScore[right] < minColHits) {
    right -= 1;
  }
  let top = topStart;
  while (top < topEnd && rowScore[top] < minRowHits) {
    top += 1;
  }
  let bottom = bottomStart;
  while (bottom > bottomEnd && rowScore[bottom] < minRowHits) {
    bottom -= 1;
  }

  if (right - left < width * 0.35 || bottom - top < height * 0.35) {
    return null;
  }

  const insetX = Math.round((right - left) * 0.02);
  const insetY = Math.round((bottom - top) * 0.02);
  return [
    { x: left + insetX, y: top + insetY },
    { x: right - insetX, y: top + insetY },
    { x: right - insetX, y: bottom - insetY },
    { x: left + insetX, y: bottom - insetY },
  ];
}

function ensureAiAssistCanvas(width, height) {
  if (!scanState.aiAssistCanvas) {
    scanState.aiAssistCanvas = document.createElement("canvas");
    scanState.aiAssistCtx = scanState.aiAssistCanvas.getContext("2d", {
      willReadFrequently: true,
    });
  }
  if (!scanState.aiAssistCanvas || !scanState.aiAssistCtx) {
    return null;
  }
  if (scanState.aiAssistCanvas.width !== width || scanState.aiAssistCanvas.height !== height) {
    scanState.aiAssistCanvas.width = width;
    scanState.aiAssistCanvas.height = height;
  }
  return scanState.aiAssistCanvas;
}

function buildAiAssistImageDataUrl(imageData, width, height) {
  const canvas = ensureAiAssistCanvas(width, height);
  const ctx = scanState.aiAssistCtx;
  if (!canvas || !ctx) {
    return null;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.72);
}

function normalizeAiCorners(rawCorners) {
  if (!Array.isArray(rawCorners) || rawCorners.length !== 4) {
    return null;
  }
  const parsed = rawCorners.map((entry) => ({
    x: Number(entry?.x),
    y: Number(entry?.y),
  }));
  if (
    parsed.some(
      (point) =>
        !Number.isFinite(point.x) ||
        !Number.isFinite(point.y) ||
        point.x < 0 ||
        point.x > 1 ||
        point.y < 0 ||
        point.y > 1
    )
  ) {
    return null;
  }
  return orderCornersClockwise(parsed);
}

function scaleNormalizedCorners(corners, width, height) {
  if (!Array.isArray(corners) || corners.length !== 4) {
    return null;
  }
  return corners.map((point) => ({
    x: clamp(point.x * width, 0, width),
    y: clamp(point.y * height, 0, height),
  }));
}

function reportAiAssistStatus(message) {
  const now = Date.now();
  if (now - scanState.aiAssistLastAdviceAt < AI_ADVICE_COOLDOWN_MS) {
    return;
  }
  scanState.aiAssistLastAdviceAt = now;
  setStatus(message);
}

async function requestGeminiAssist(frame, width, height) {
  const now = Date.now();
  if (
    !window.location.protocol.startsWith("http") ||
    scanState.stage !== "live" ||
    scanState.aiAssistInFlight ||
    now - scanState.aiAssistLastAt < AI_DOC_CHECK_MIN_INTERVAL_MS ||
    now < scanState.aiAssistUnavailableUntil
  ) {
    return;
  }

  const imageDataUrl = buildAiAssistImageDataUrl(frame, width, height);
  if (!imageDataUrl) {
    return;
  }

  scanState.aiAssistInFlight = true;
  scanState.aiAssistLastAt = now;
  try {
    const response = await fetch("/api/gemini-doc-detect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageDataUrl }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 503 || response.status === 401 || response.status === 403) {
        scanState.aiAssistUnavailableUntil = Date.now() + 120000;
        reportAiAssistStatus("Gemini key missing/invalid on server. Using OpenCV + jscanify.");
      } else if (response.status === 429) {
        reportAiAssistStatus("Gemini rate-limited. Local edge detection is still active.");
      }
      return;
    }

    const normalizedCorners = normalizeAiCorners(payload?.corners);
    if (payload?.documentDetected && normalizedCorners) {
      scanState.aiAssistCornersNormalized = normalizedCorners;
      scanState.aiAssistCornersAt = Date.now();
      if (typeof payload.advice === "string" && payload.advice.trim()) {
        reportAiAssistStatus(`AI assist: ${payload.advice.trim()}`);
      }
      return;
    }
    scanState.aiAssistCornersNormalized = null;
    scanState.aiAssistCornersAt = 0;
  } catch {
    // Ignore transient network errors and keep local detection active.
  } finally {
    scanState.aiAssistInFlight = false;
  }
}

async function requestGeminiOrientation(imageDataUrl) {
  if (!window.location.protocol.startsWith("http")) {
    return null;
  }
  const response = await fetch("/api/gemini-orientation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageDataUrl }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || "Auto rotate analysis failed.");
  }
  const suggested = Number(payload?.rotation || 0);
  const normalized = normalizeRotationDeg(suggested);
  return {
    rotation: normalized,
    confidence: Number(payload?.confidence || 0),
    reason: String(payload?.reason || ""),
  };
}

async function suggestAutoRotationForCurrentPage() {
  if (scanState.orientationDetectInFlight) {
    return;
  }
  const cropCanvas = getCropCanvasFromCorners();
  if (!cropCanvas) {
    return;
  }
  scanState.orientationDetectInFlight = true;
  try {
    const analysisCanvas = scaleCanvasToMax(cropCanvas, 1100);
    const dataUrl = analysisCanvas.toDataURL("image/jpeg", 0.76);
    const suggestion = await requestGeminiOrientation(dataUrl);
    if (!suggestion) {
      return;
    }
    scanState.orientationSuggestionDeg = suggestion.rotation;
    if (Math.abs(suggestion.rotation) >= 45) {
      setStatus(`Orientation suggestion detected: ${suggestion.rotation}°.`);
    }
  } catch {
    scanState.orientationSuggestionDeg = 0;
  } finally {
    scanState.orientationDetectInFlight = false;
  }
}

function clearLiveOverlay() {
  const ctx = cameraOverlay?.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, cameraOverlay.width, cameraOverlay.height);
  }
}

function estimateFrameBrightness(imageData) {
  const data = imageData.data;
  if (!data || data.length < 4) {
    return 0;
  }
  const sampleStep = Math.max(4, Math.floor(data.length / 3000));
  let total = 0;
  let count = 0;
  for (let i = 0; i < data.length; i += sampleStep * 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    total += 0.2126 * r + 0.7152 * g + 0.0722 * b;
    count += 1;
  }
  if (!count) {
    return 0;
  }
  return total / count;
}

function polygonArea(points) {
  if (!Array.isArray(points) || points.length < 3) {
    return 0;
  }
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    sum += p1.x * p2.y - p2.x * p1.y;
  }
  return Math.abs(sum) * 0.5;
}

function estimateDocumentAreaRatio(corners, width, height) {
  if (!corners || !width || !height) {
    return 0;
  }
  return polygonArea(corners) / (width * height);
}

function estimateCornerJitter(currentCorners, previousCorners) {
  if (!currentCorners || !previousCorners || currentCorners.length !== 4 || previousCorners.length !== 4) {
    return Number.POSITIVE_INFINITY;
  }
  let total = 0;
  for (let i = 0; i < 4; i += 1) {
    total += pointDistance(currentCorners[i], previousCorners[i]);
  }
  return total / 4;
}

function estimateFrameMotion(imageData, width, height) {
  const step = 6;
  const sampleCols = Math.max(1, Math.floor(width / step));
  const sampleRows = Math.max(1, Math.floor(height / step));
  const sampleLen = sampleCols * sampleRows;
  const current = new Uint8Array(sampleLen);
  const src = imageData.data;
  let s = 0;

  for (let y = 0; y < sampleRows; y += 1) {
    const py = Math.min(height - 1, y * step);
    for (let x = 0; x < sampleCols; x += 1) {
      const px = Math.min(width - 1, x * step);
      const idx = (py * width + px) * 4;
      const r = src[idx];
      const g = src[idx + 1];
      const b = src[idx + 2];
      current[s] = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
      s += 1;
    }
  }

  const prev = scanState.motionFrameRef;
  scanState.motionFrameRef = { width, height, sampleCols, sampleRows, data: current };

  if (!prev || prev.width !== width || prev.height !== height || prev.data.length !== current.length) {
    return Number.POSITIVE_INFINITY;
  }

  let diffTotal = 0;
  for (let i = 0; i < current.length; i += 1) {
    diffTotal += Math.abs(current[i] - prev.data[i]);
  }
  return diffTotal / current.length;
}

function normalizeCornersFromPixels(corners, width, height) {
  if (!Array.isArray(corners) || corners.length !== 4 || !width || !height) {
    return null;
  }
  return corners.map((point) => ({
    x: clamp(point.x / width, 0, 1),
    y: clamp(point.y / height, 0, 1),
  }));
}

function getOverlayColorFromAutoState(autoState, hasTrustedCorners) {
  if (!hasTrustedCorners) {
    return "rgba(255,255,255,0.82)";
  }
  if (autoState.isCandidate && autoState.stabilityRatio >= 0.99) {
    return "rgba(80,255,150,0.95)";
  }
  if (autoState.isCandidate) {
    return "rgba(100,190,255,0.92)";
  }
  return "rgba(255,255,255,0.88)";
}

async function triggerAutoCapture() {
  if (scanState.captureInProgress || scanState.stage !== "live") {
    return;
  }
  try {
    scanState.autoCaptureNeedsMotionReset = true;
    await captureFromCamera(true);
  } catch {
    // Keep manual mode working even if auto capture fails for one frame.
  }
}

function updateAutoCaptureState(corners, frame, width, height, now) {
  const motionScore = estimateFrameMotion(frame, width, height);
  scanState.autoCaptureLastMotionScore = Number.isFinite(motionScore) ? motionScore : 0;
  const areaRatio = estimateDocumentAreaRatio(corners, width, height);
  scanState.autoCaptureLastAreaRatio = areaRatio;

  const hasCorners = Boolean(corners);
  if (!hasCorners || now < scanState.autoCaptureCooldownUntil) {
    scanState.autoCaptureStableSince = 0;
    scanState.autoCaptureLastCorners = hasCorners ? cloneCorners(corners) : null;
    if (hasCorners) {
      scanState.autoCaptureLastSeenAt = now;
    }
    return { isCandidate: false, stabilityRatio: 0 };
  }

  if (scanState.autoCaptureNeedsMotionReset) {
    if (Number.isFinite(motionScore) && motionScore >= AUTO_CAPTURE_RESET_MOTION_SCORE) {
      scanState.autoCaptureNeedsMotionReset = false;
    } else {
      return { isCandidate: false, stabilityRatio: 0 };
    }
  }

  const areaOk = areaRatio >= AUTO_CAPTURE_MIN_DOC_AREA_RATIO;
  const motionOk = Number.isFinite(motionScore) && motionScore <= AUTO_CAPTURE_MAX_MOTION_SCORE;
  if (!areaOk || !motionOk) {
    scanState.autoCaptureStableSince = 0;
    scanState.autoCaptureLastCorners = cloneCorners(corners);
    scanState.autoCaptureLastSeenAt = now;
    return { isCandidate: false, stabilityRatio: 0 };
  }

  const jitter = estimateCornerJitter(corners, scanState.autoCaptureLastCorners);
  const seenGap = now - scanState.autoCaptureLastSeenAt;
  scanState.autoCaptureLastCorners = cloneCorners(corners);
  scanState.autoCaptureLastSeenAt = now;

  if (!Number.isFinite(jitter) || jitter > AUTO_CAPTURE_MAX_JITTER_PX || seenGap > 520) {
    scanState.autoCaptureStableSince = now;
  } else if (!scanState.autoCaptureStableSince) {
    scanState.autoCaptureStableSince = now;
  }

  const stableMs = Math.max(0, now - scanState.autoCaptureStableSince);
  const stabilityRatio = clamp(stableMs / AUTO_CAPTURE_STABLE_MS, 0, 1);
  const isCandidate = true;

  if (
    scanState.autoCaptureEnabled &&
    stabilityRatio >= 1 &&
    !scanState.captureInProgress &&
    now >= scanState.autoCaptureCooldownUntil
  ) {
    scanState.autoCaptureCooldownUntil = now + AUTO_CAPTURE_COOLDOWN_MS;
    scanState.autoCaptureStableSince = 0;
    triggerAutoCapture();
  } else if (
    scanState.autoCaptureEnabled &&
    stabilityRatio < 1 &&
    now - scanState.autoCaptureLastStatusAt > AUTO_CAPTURE_STATUS_COOLDOWN_MS
  ) {
    const sec = ((AUTO_CAPTURE_STABLE_MS - stableMs) / 1000).toFixed(1);
    setStatus(`Document stable. Auto capture in ${Math.max(0, sec)}s...`);
    scanState.autoCaptureLastStatusAt = now;
  }

  return { isCandidate, stabilityRatio };
}

function drawLiveDetectionBoundary() {
  if (!cameraPreview || !cameraOverlay || scanState.stage !== "live") {
    return;
  }
  const videoWidth = cameraPreview.videoWidth;
  const videoHeight = cameraPreview.videoHeight;
  if (!videoWidth || !videoHeight) {
    return;
  }
  syncVideoOverlaySize();
  if (!scanState.liveDetectCanvas) {
    scanState.liveDetectCanvas = document.createElement("canvas");
    scanState.liveDetectCtx = scanState.liveDetectCanvas.getContext("2d", {
      willReadFrequently: true,
    });
  }
  const detectCanvas = scanState.liveDetectCanvas;
  const detectCtx = scanState.liveDetectCtx;
  if (!detectCanvas || !detectCtx) {
    return;
  }
  const detectWidth = 280;
  const detectHeight = Math.max(120, Math.floor((videoHeight / videoWidth) * detectWidth));
  detectCanvas.width = detectWidth;
  detectCanvas.height = detectHeight;
  detectCtx.drawImage(cameraPreview, 0, 0, detectWidth, detectHeight);
  const frame = detectCtx.getImageData(0, 0, detectWidth, detectHeight);
  const brightness = estimateFrameBrightness(frame);
  const now = Date.now();
  if (brightness < LOW_LIGHT_THRESHOLD && now - scanState.lowLightWarnedAt > LOW_LIGHT_WARN_COOLDOWN_MS) {
    scanState.lowLightWarnedAt = now;
    setStatus("Low light detected. Enable flash or increase lighting for better edge detection.");
  }
  const detectedRaw = detectDocumentCornersFromImageData(frame, detectWidth, detectHeight);
  // AI-first auto detection (throttled): Gemini updates corners in the background.
  requestGeminiAssist(frame, detectWidth, detectHeight);

  const hasFreshAiCorners =
    Array.isArray(scanState.aiAssistCornersNormalized) &&
    now - scanState.aiAssistCornersAt <= AI_CORNER_TTL_MS;
  const aiDetectedRaw = hasFreshAiCorners
    ? scaleNormalizedCorners(
        scanState.aiAssistCornersNormalized,
        detectWidth,
        detectHeight
      )
    : null;
  const detected = aiDetectedRaw || detectedRaw || createDefaultCorners(detectWidth, detectHeight, 0.12);
  const trustedCorners = aiDetectedRaw || detectedRaw;
  const autoState = updateAutoCaptureState(
    trustedCorners,
    frame,
    detectWidth,
    detectHeight,
    now
  );
  const sx = cameraOverlay.width / detectWidth;
  const sy = cameraOverlay.height / detectHeight;
  const scaledCorners = detected.map((point) => ({
    x: point.x * sx,
    y: point.y * sy,
  }));
  scanState.liveCorners = scaledCorners;
  scanState.liveDetectedCorners = trustedCorners
    ? trustedCorners.map((point) => ({
        x: point.x * sx,
        y: point.y * sy,
      }))
    : null;
  const overlayCtx = cameraOverlay.getContext("2d");
  const overlayColor = getOverlayColorFromAutoState(autoState, Boolean(trustedCorners));
  drawPolygon(overlayCtx, scaledCorners, overlayColor);
}

function startLiveDetection() {
  if (scanState.liveDetectTimer || !activeCameraStream) {
    return;
  }
  drawLiveDetectionBoundary();
  scanState.liveDetectTimer = setInterval(drawLiveDetectionBoundary, 260);
}

function stopLiveDetection() {
  if (scanState.liveDetectTimer) {
    clearInterval(scanState.liveDetectTimer);
    scanState.liveDetectTimer = null;
  }
  scanState.liveCorners = null;
  scanState.liveDetectedCorners = null;
  scanState.aiAssistCornersNormalized = null;
  scanState.aiAssistCornersAt = 0;
  scanState.autoCaptureStableSince = 0;
  scanState.autoCaptureLastCorners = null;
  scanState.autoCaptureLastSeenAt = 0;
  scanState.autoCaptureCooldownUntil = 0;
  scanState.autoCaptureNeedsMotionReset = false;
  scanState.motionFrameRef = null;
  clearLiveOverlay();
}

function resetScanEditState() {
  scanState.sourceCanvas = null;
  scanState.sourceCtx = null;
  scanState.corners = null;
  scanState.cachedCroppedCanvas = null;
  scanState.cachedOutputCanvas = null;
  scanState.cropDirty = true;
  scanState.draggingCornerIndex = -1;
  if (scanSourceCanvas) {
    const ctx = scanSourceCanvas.getContext("2d");
    ctx?.clearRect(0, 0, scanSourceCanvas.width, scanSourceCanvas.height);
  }
  if (scanEditOverlay) {
    const ctx = scanEditOverlay.getContext("2d");
    ctx?.clearRect(0, 0, scanEditOverlay.width, scanEditOverlay.height);
  }
  if (scanPreviewCanvas) {
    const ctx = scanPreviewCanvas.getContext("2d");
    ctx?.clearRect(0, 0, scanPreviewCanvas.width, scanPreviewCanvas.height);
  }
  if (scanHandles) {
    scanHandles.innerHTML = "";
  }
}

function setScanStage(stage) {
  scanState.stage = stage;
  scanLiveStage?.classList.toggle("hidden", stage !== "live");
  scanEditStage?.classList.toggle("hidden", stage !== "edit");
  scanPreviewStage?.classList.toggle("hidden", stage !== "preview");

  if (scanStageBadge) {
    if (stage === "live") {
      scanStageBadge.textContent = "Live Camera";
    } else if (stage === "edit") {
      scanStageBadge.textContent = "Crop & Edit";
    } else {
      scanStageBadge.textContent = "Preview";
    }
  }

  captureBtn?.classList.toggle("hidden", stage !== "live");
  startEditQueueBtn?.classList.toggle("hidden", stage !== "live");
  nextToPreviewBtn?.classList.toggle("hidden", stage !== "edit");
  backToEditBtn?.classList.toggle("hidden", stage !== "preview");
  saveScanBtn?.classList.toggle("hidden", stage !== "preview");

  if (stage === "live") {
    startLiveDetection();
  } else {
    stopLiveDetection();
  }
  updateScanBadges();
}

function updateFlashButtonState() {
  if (!flashToggleBtn) {
    return;
  }
  if (!scanState.torchSupported) {
    setControlText(flashToggleBtn, "Flash N/A", flashToggleText);
    flashToggleBtn.disabled = true;
    return;
  }
  flashToggleBtn.disabled = false;
  setControlText(
    flashToggleBtn,
    scanState.torchOn ? "Flash On" : "Flash Off",
    flashToggleText
  );
}

function updateAutoCaptureButtonState() {
  if (!autoCaptureToggleBtn) {
    return;
  }
  const enabled = Boolean(scanState.autoCaptureEnabled);
  autoCaptureToggleBtn.classList.toggle("active", enabled);
  setControlText(
    autoCaptureToggleBtn,
    enabled ? "Auto Capture On" : "Auto Capture Off",
    autoCaptureToggleText
  );
}

function setAutoCaptureEnabled(enabled, announce = true) {
  scanState.autoCaptureEnabled = Boolean(enabled);
  scanState.autoCaptureStableSince = 0;
  scanState.autoCaptureLastCorners = null;
  scanState.autoCaptureLastSeenAt = 0;
  scanState.autoCaptureLastStatusAt = 0;
  scanState.motionFrameRef = null;
  updateAutoCaptureButtonState();
  if (!announce) {
    return;
  }
  if (scanState.autoCaptureEnabled) {
    setStatus("Auto capture enabled. Hold document steady to capture automatically.");
  } else {
    setStatus("Auto capture disabled. Use Capture Photo manually.");
  }
}

async function setTorchEnabled(enabled) {
  if (!activeCameraStream) {
    throw new Error("Camera is not open.");
  }
  const track = activeCameraStream.getVideoTracks()[0];
  const capabilities = track?.getCapabilities?.() || {};
  if (!capabilities.torch) {
    scanState.torchSupported = false;
    updateFlashButtonState();
    throw new Error("Flash/torch is not supported on this device.");
  }
  await track.applyConstraints({ advanced: [{ torch: enabled }] });
  scanState.torchOn = enabled;
  scanState.torchSupported = true;
  updateFlashButtonState();
}

function ensureCornerHandles() {
  if (!scanHandles || scanHandles.children.length === 4) {
    return;
  }
  scanHandles.innerHTML = "";
  for (let i = 0; i < 4; i += 1) {
    const handle = document.createElement("button");
    handle.type = "button";
    handle.className = "scan-corner";
    handle.dataset.index = String(i);
    handle.ariaLabel = `Adjust corner ${i + 1}`;
    handle.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      scanState.draggingCornerIndex = Number(handle.dataset.index);
      handle.setPointerCapture(event.pointerId);
    });
    scanHandles.appendChild(handle);
  }
}

function drawEditOverlay() {
  if (!scanEditOverlay || !scanState.corners || !scanState.sourceCanvas) {
    return;
  }
  const ctx = scanEditOverlay.getContext("2d");
  if (!ctx) {
    return;
  }
  drawPolygon(ctx, scanState.corners, "rgba(255,255,255,0.92)");
}

function renderCornerHandles() {
  if (!scanHandles || !scanState.corners || !scanState.sourceCanvas) {
    return;
  }
  ensureCornerHandles();
  const width = scanState.sourceCanvas.width;
  const height = scanState.sourceCanvas.height;
  Array.from(scanHandles.children).forEach((child, index) => {
    const corner = scanState.corners[index];
    if (!corner) {
      return;
    }
    child.style.left = `${(corner.x / width) * 100}%`;
    child.style.top = `${(corner.y / height) * 100}%`;
  });
}

function renderScanSource() {
  if (!scanState.sourceCanvas || !scanSourceCanvas || !scanEditOverlay) {
    return;
  }
  scanSourceCanvas.width = scanState.sourceCanvas.width;
  scanSourceCanvas.height = scanState.sourceCanvas.height;
  scanEditOverlay.width = scanState.sourceCanvas.width;
  scanEditOverlay.height = scanState.sourceCanvas.height;
  const targetCtx = scanSourceCanvas.getContext("2d");
  if (!targetCtx) {
    return;
  }
  targetCtx.clearRect(0, 0, scanSourceCanvas.width, scanSourceCanvas.height);
  targetCtx.drawImage(scanState.sourceCanvas, 0, 0);
  drawEditOverlay();
  renderCornerHandles();
}

function handleCornerPointerMove(event) {
  if (scanState.draggingCornerIndex < 0 || !scanState.corners || !scanSourceCanvas) {
    return;
  }
  const rect = scanSourceCanvas.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return;
  }
  const x =
    ((event.clientX - rect.left) / rect.width) * scanSourceCanvas.width;
  const y =
    ((event.clientY - rect.top) / rect.height) * scanSourceCanvas.height;
  const safeInset = 6;
  scanState.corners[scanState.draggingCornerIndex] = {
    x: clamp(x, safeInset, scanSourceCanvas.width - safeInset),
    y: clamp(y, safeInset, scanSourceCanvas.height - safeInset),
  };
  scanState.cropDirty = true;
  scanState.cachedOutputCanvas = null;
  drawEditOverlay();
  renderCornerHandles();
}

function handleCornerPointerUp() {
  scanState.draggingCornerIndex = -1;
}

window.addEventListener("pointermove", handleCornerPointerMove);
window.addEventListener("pointerup", handleCornerPointerUp);
window.addEventListener("pointercancel", handleCornerPointerUp);

function scaleCanvasToMax(canvas, maxDimension = 1800) {
  const width = canvas.width;
  const height = canvas.height;
  const max = Math.max(width, height);
  if (max <= maxDimension) {
    return canvas;
  }
  const scale = maxDimension / max;
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(width * scale));
  out.height = Math.max(1, Math.round(height * scale));
  const outCtx = out.getContext("2d");
  outCtx?.drawImage(canvas, 0, 0, out.width, out.height);
  return out;
}

function getCropCanvasFromCorners() {
  if (!scanState.sourceCanvas || !scanState.sourceCtx || !scanState.corners) {
    return null;
  }
  if (!scanState.cropDirty && scanState.cachedCroppedCanvas) {
    return scanState.cachedCroppedCanvas;
  }

  const [tl, tr, br, bl] = scanState.corners;
  const top = pointDistance(tl, tr);
  const right = pointDistance(tr, br);
  const bottom = pointDistance(bl, br);
  const left = pointDistance(tl, bl);

  let outputWidth = Math.max(120, Math.round((top + bottom) * 0.5));
  let outputHeight = Math.max(120, Math.round((left + right) * 0.5));
  const longest = Math.max(outputWidth, outputHeight);
  if (longest > 1500) {
    const scale = 1500 / longest;
    outputWidth = Math.max(120, Math.round(outputWidth * scale));
    outputHeight = Math.max(120, Math.round(outputHeight * scale));
  }

  const sourceWidth = scanState.sourceCanvas.width;
  const sourceHeight = scanState.sourceCanvas.height;
  const sourceData = scanState.sourceCtx.getImageData(
    0,
    0,
    sourceWidth,
    sourceHeight
  ).data;
  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = outputWidth;
  outputCanvas.height = outputHeight;
  const outputCtx = outputCanvas.getContext("2d");
  if (!outputCtx) {
    return null;
  }
  const outImage = outputCtx.createImageData(outputWidth, outputHeight);
  const outData = outImage.data;

  const sampleBilinear = (sx, sy) => {
    const x0 = clamp(Math.floor(sx), 0, sourceWidth - 1);
    const y0 = clamp(Math.floor(sy), 0, sourceHeight - 1);
    const x1 = clamp(x0 + 1, 0, sourceWidth - 1);
    const y1 = clamp(y0 + 1, 0, sourceHeight - 1);
    const dx = sx - x0;
    const dy = sy - y0;

    const i00 = (y0 * sourceWidth + x0) * 4;
    const i10 = (y0 * sourceWidth + x1) * 4;
    const i01 = (y1 * sourceWidth + x0) * 4;
    const i11 = (y1 * sourceWidth + x1) * 4;
    const rgba = [0, 0, 0, 0];
    for (let c = 0; c < 4; c += 1) {
      const topMix = sourceData[i00 + c] * (1 - dx) + sourceData[i10 + c] * dx;
      const bottomMix =
        sourceData[i01 + c] * (1 - dx) + sourceData[i11 + c] * dx;
      rgba[c] = topMix * (1 - dy) + bottomMix * dy;
    }
    return rgba;
  };

  for (let y = 0; y < outputHeight; y += 1) {
    const v = outputHeight > 1 ? y / (outputHeight - 1) : 0;
    for (let x = 0; x < outputWidth; x += 1) {
      const u = outputWidth > 1 ? x / (outputWidth - 1) : 0;
      const sx =
        tl.x * (1 - u) * (1 - v) +
        tr.x * u * (1 - v) +
        br.x * u * v +
        bl.x * (1 - u) * v;
      const sy =
        tl.y * (1 - u) * (1 - v) +
        tr.y * u * (1 - v) +
        br.y * u * v +
        bl.y * (1 - u) * v;
      const outIdx = (y * outputWidth + x) * 4;
      const sampled = sampleBilinear(sx, sy);
      outData[outIdx] = sampled[0];
      outData[outIdx + 1] = sampled[1];
      outData[outIdx + 2] = sampled[2];
      outData[outIdx + 3] = sampled[3];
    }
  }
  outputCtx.putImageData(outImage, 0, 0);
  scanState.cachedCroppedCanvas = outputCanvas;
  scanState.cropDirty = false;
  return outputCanvas;
}

function applyScanModeThreshold(canvas) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return;
  }
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    const hard = gray > 174 ? 255 : gray < 98 ? 0 : gray * 1.08;
    data[i] = hard;
    data[i + 1] = hard;
    data[i + 2] = hard;
    data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
}

function applySharpen(canvas, amount) {
  if (amount <= 0) {
    return;
  }
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return;
  }
  const width = canvas.width;
  const height = canvas.height;
  const src = ctx.getImageData(0, 0, width, height);
  const out = ctx.createImageData(width, height);
  const s = src.data;
  const o = out.data;
  const strength = 4.8 + (amount / 100) * 2.8;
  const centerWeight = strength;
  const sideWeight = -(strength - 1) / 4;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const idx = (y * width + x) * 4;
      const top = ((y - 1) * width + x) * 4;
      const right = (y * width + (x + 1)) * 4;
      const bottom = ((y + 1) * width + x) * 4;
      const left = (y * width + (x - 1)) * 4;
      for (let c = 0; c < 3; c += 1) {
        const value =
          s[idx + c] * centerWeight +
          s[top + c] * sideWeight +
          s[right + c] * sideWeight +
          s[bottom + c] * sideWeight +
          s[left + c] * sideWeight;
        o[idx + c] = clamp(Math.round(value), 0, 255);
      }
      o[idx + 3] = 255;
    }
  }

  for (let x = 0; x < width; x += 1) {
    const top = x * 4;
    const bottom = ((height - 1) * width + x) * 4;
    o[top] = s[top];
    o[top + 1] = s[top + 1];
    o[top + 2] = s[top + 2];
    o[top + 3] = 255;
    o[bottom] = s[bottom];
    o[bottom + 1] = s[bottom + 1];
    o[bottom + 2] = s[bottom + 2];
    o[bottom + 3] = 255;
  }
  for (let y = 0; y < height; y += 1) {
    const left = (y * width) * 4;
    const right = (y * width + (width - 1)) * 4;
    o[left] = s[left];
    o[left + 1] = s[left + 1];
    o[left + 2] = s[left + 2];
    o[left + 3] = 255;
    o[right] = s[right];
    o[right + 1] = s[right + 1];
    o[right + 2] = s[right + 2];
    o[right + 3] = 255;
  }

  ctx.putImageData(out, 0, 0);
}

function rotateCanvas(sourceCanvas, degrees) {
  const normalized = ((degrees % 360) + 360) % 360;
  if (Math.abs(normalized) < 0.2 || Math.abs(normalized - 360) < 0.2) {
    const copy = document.createElement("canvas");
    copy.width = sourceCanvas.width;
    copy.height = sourceCanvas.height;
    copy.getContext("2d")?.drawImage(sourceCanvas, 0, 0);
    return copy;
  }
  const radians = (degrees * Math.PI) / 180;
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  const outW = Math.ceil(width * cos + height * sin);
  const outH = Math.ceil(width * sin + height * cos);
  const outCanvas = document.createElement("canvas");
  outCanvas.width = outW;
  outCanvas.height = outH;
  const ctx = outCanvas.getContext("2d");
  if (!ctx) {
    return sourceCanvas;
  }
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, outW, outH);
  ctx.translate(outW / 2, outH / 2);
  ctx.rotate(radians);
  ctx.drawImage(sourceCanvas, -width / 2, -height / 2);
  return outCanvas;
}

function buildProcessedOutputCanvas() {
  if (scanState.cachedOutputCanvas) {
    return scanState.cachedOutputCanvas;
  }
  const cropped = getCropCanvasFromCorners();
  if (!cropped) {
    return null;
  }
  const filtered = document.createElement("canvas");
  filtered.width = cropped.width;
  filtered.height = cropped.height;
  const filteredCtx = filtered.getContext("2d");
  if (!filteredCtx) {
    return null;
  }

  let filterGrayscale = 0;
  let filterSaturation = 100;
  let brightnessBoost = 1;
  let contrastBoost = 1;

  if (scanState.filter === "bw") {
    filterGrayscale = 100;
    filterSaturation = 0;
    contrastBoost = 1.08;
  } else if (scanState.filter === "highcontrast") {
    filterSaturation = 120;
    contrastBoost = 1.22;
  } else if (scanState.filter === "grayscale") {
    filterGrayscale = 100;
    filterSaturation = 0;
  } else if (scanState.filter === "color") {
    filterSaturation = 144;
    contrastBoost = 1.07;
    brightnessBoost = 1.04;
  } else if (scanState.filter === "scan") {
    filterGrayscale = 100;
    filterSaturation = 0;
    brightnessBoost = 1.14;
    contrastBoost = 1.34;
  }

  const brightness = clamp(
    Math.round(scanState.controls.brightness * brightnessBoost),
    40,
    240
  );
  const contrast = clamp(
    Math.round(scanState.controls.contrast * contrastBoost),
    40,
    260
  );
  filteredCtx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${filterSaturation}%) grayscale(${filterGrayscale}%)`;
  filteredCtx.fillStyle = "#ffffff";
  filteredCtx.fillRect(0, 0, filtered.width, filtered.height);
  filteredCtx.drawImage(cropped, 0, 0);

  if (scanState.filter === "scan") {
    applyScanModeThreshold(filtered);
  }
  applySharpen(filtered, scanState.controls.sharpness);
  const rotated = rotateCanvas(filtered, scanState.controls.rotate);
  scanState.cachedOutputCanvas = rotated;
  return rotated;
}

function applyPreviewZoom() {
  if (!scanPreviewCanvas || !scanZoomInput || !scanZoomLabel) {
    return;
  }
  const zoom = Number(scanZoomInput.value || 100);
  scanPreviewCanvas.style.transform = "none";
  scanPreviewCanvas.style.width = `${zoom}%`;
  scanPreviewCanvas.style.maxWidth = "none";
  scanZoomLabel.textContent = `${zoom}%`;
}

function renderPreviewCanvasWithCurrentOutput() {
  if (!scanPreviewCanvas) {
    return false;
  }
  const result = buildProcessedOutputCanvas();
  if (!result) {
    return false;
  }
  scanPreviewCanvas.width = result.width;
  scanPreviewCanvas.height = result.height;
  const previewCtx = scanPreviewCanvas.getContext("2d");
  previewCtx?.clearRect(0, 0, result.width, result.height);
  previewCtx?.drawImage(result, 0, 0);
  applyPreviewZoom();
  return true;
}

function refreshPreviewCanvasIfVisible() {
  if (scanState.stage !== "preview") {
    return;
  }
  renderPreviewCanvasWithCurrentOutput();
}

async function canvasToBlob(canvas, type = "image/jpeg", quality = 0.95) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Could not create output image."));
        return;
      }
      resolve(blob);
    }, type, quality);
  });
}

async function blobToImage(blob) {
  const url = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load captured image."));
    };
    image.src = url;
  });
}

async function loadCurrentCaptureIntoEditor() {
  if (!scanState.currentRawCapture) {
    throw new Error("No captured photo available to edit.");
  }
  setScanProcessing(true, "Preparing editor...");
  try {
    const image = await blobToImage(scanState.currentRawCapture.blob);
    const rawCanvas = document.createElement("canvas");
    rawCanvas.width = image.width;
    rawCanvas.height = image.height;
    const rawCtx = rawCanvas.getContext("2d");
    if (!rawCtx) {
      throw new Error("Canvas is not supported in this browser.");
    }
    rawCtx.drawImage(image, 0, 0);
    const workCanvas = scaleCanvasToMax(rawCanvas, 1800);
    const workCtx = workCanvas.getContext("2d", { willReadFrequently: true });
    if (!workCtx) {
      throw new Error("Canvas is not supported in this browser.");
    }
    const frame = workCtx.getImageData(0, 0, workCanvas.width, workCanvas.height);
    const aiSuggestedCorners = scaleNormalizedCorners(
      scanState.currentRawCapture?.suggestedCornersNormalized,
      workCanvas.width,
      workCanvas.height
    );
    const detectedCorners =
      aiSuggestedCorners ||
      detectDocumentCornersFromImageData(frame, workCanvas.width, workCanvas.height) ||
      createDefaultCorners(workCanvas.width, workCanvas.height);

    resetScanEditState();
    resetScanControls();
    scanState.sourceCanvas = workCanvas;
    scanState.sourceCtx = workCtx;
    scanState.corners = cloneCorners(detectedCorners);
    scanState.cropDirty = true;
    scanState.cachedCroppedCanvas = null;
    scanState.cachedOutputCanvas = null;
    renderScanSource();
    setScanStage("edit");
    updateEditProgress();
  } finally {
    setScanProcessing(false);
  }
}

async function startQueuedEditing() {
  if (scanState.pendingRawCaptures.length <= 0) {
    throw new Error("Capture at least one photo before editing.");
  }
  const stillExists =
    scanState.currentRawCapture &&
    scanState.pendingRawCaptures.some(
      (capture) => capture.id === scanState.currentRawCapture.id
    );
  if (!stillExists) {
    scanState.currentRawCapture = scanState.pendingRawCaptures[0];
  }
  if (scanState.currentRawCapture && scanState.sourceCanvas) {
    setScanStage("edit");
    return;
  }
  await loadCurrentCaptureIntoEditor();
}

async function editCaptureById(captureId) {
  if (!captureId) {
    return;
  }
  const busy = scanProcessing && !scanProcessing.classList.contains("hidden");
  if (busy) {
    return;
  }
  const target = scanState.pendingRawCaptures.find((capture) => capture.id === captureId);
  if (!target) {
    throw new Error("Selected photo is no longer available.");
  }
  scanState.currentRawCapture = target;
  await loadCurrentCaptureIntoEditor();
  const index = scanState.pendingRawCaptures.findIndex((capture) => capture.id === captureId) + 1;
  setStatus(`Editing photo ${index}. You can switch by clicking any thumbnail.`);
  updateScanBadges();
}

function prepareCurrentCaptureRetake() {
  if (!scanState.currentRawCapture) {
    return false;
  }
  const idx = scanState.pendingRawCaptures.findIndex(
    (capture) => capture.id === scanState.currentRawCapture.id
  );
  if (idx < 0) {
    return false;
  }
  const [removed] = scanState.pendingRawCaptures.splice(idx, 1);
  revokeCaptureThumb(removed);
  scanState.retakeInsertIndex = idx;
  scanState.currentRawCapture = null;
  resetScanEditState();
  resetScanControls();
  setScanStage("live");
  updateScanBadges();
  return true;
}

function retakeLastCapturedPhoto() {
  if (scanState.pendingRawCaptures.length <= 0) {
    return false;
  }
  const removed = scanState.pendingRawCaptures.pop();
  revokeCaptureThumb(removed);
  if (scanState.currentRawCapture?.id === removed?.id) {
    scanState.currentRawCapture = null;
  }
  updateScanBadges();
  return true;
}

async function openCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error("Camera is not supported in this browser.");
  }

  if (!activeCameraStream) {
    cameraCapturedFiles = [];
    clearQueuedRawCaptures();
    resetScanEditState();
    resetScanControls();
    setScanEditMode("all");
    scanState.liveDetectedCorners = null;
    scanState.lowLightWarnedAt = 0;
    scanState.aiAssistInFlight = false;
    scanState.aiAssistLastAt = 0;
    scanState.aiAssistLastAdviceAt = 0;
    scanState.aiAssistUnavailableUntil = 0;
    scanState.aiAssistCornersNormalized = null;
    scanState.aiAssistCornersAt = 0;
    scanState.autoCaptureStableSince = 0;
    scanState.autoCaptureLastCorners = null;
    scanState.autoCaptureLastSeenAt = 0;
    scanState.autoCaptureCooldownUntil = 0;
    scanState.autoCaptureLastStatusAt = 0;
    scanState.autoCaptureNeedsMotionReset = false;
    scanState.autoCaptureLastMotionScore = 0;
    scanState.autoCaptureLastAreaRatio = 0;
    scanState.motionFrameRef = null;
    scanState.autoCaptureEnabled = false;
    scanState.captureInProgress = false;
    scanState.suggestedFileName = "scan";
    scanState.orientationDetectInFlight = false;
    scanState.orientationSuggestionDeg = 0;
    updateAutoCaptureButtonState();
    updateScanBadges();

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    });
    activeCameraStream = stream;
    cameraPreview.srcObject = stream;
    await cameraPreview.play().catch(() => {});

    const track = stream.getVideoTracks()[0];
    const capabilities = track?.getCapabilities?.() || {};
    scanState.torchSupported = Boolean(capabilities.torch);
    scanState.torchOn = false;
    updateFlashButtonState();
  }

  cameraPanel.classList.remove("hidden");
  setScanStage("live");
  updateScanBadges();
}

function stopCamera() {
  stopLiveDetection();
  if (scanState.torchOn) {
    setTorchEnabled(false).catch(() => {});
  }
  if (activeCameraStream) {
    activeCameraStream.getTracks().forEach((track) => track.stop());
    activeCameraStream = null;
  }
  if (cameraPreview) {
    cameraPreview.srcObject = null;
  }
  scanState.torchOn = false;
  scanState.torchSupported = false;
  scanState.autoCaptureEnabled = false;
  scanState.captureInProgress = false;
  scanState.motionFrameRef = null;
  scanState.autoCaptureNeedsMotionReset = false;
  updateFlashButtonState();
  updateAutoCaptureButtonState();
  clearQueuedRawCaptures();
  resetScanEditState();
  resetScanControls();
  setScanEditMode("all");
  setScanProcessing(false);
  cameraPanel.classList.add("hidden");
  updateScanBadges();
}

async function captureFromCamera(autoTriggered = false) {
  if (scanState.captureInProgress) {
    if (!autoTriggered) {
      setStatus("Capture already in progress...");
    }
    return;
  }
  if (!activeCameraStream) {
    throw new Error("Camera is not open.");
  }
  const videoWidth = cameraPreview.videoWidth;
  const videoHeight = cameraPreview.videoHeight;
  if (!videoWidth || !videoHeight) {
    throw new Error("Camera not ready yet. Try again.");
  }

  scanState.captureInProgress = true;
  setScanProcessing(true, autoTriggered ? "Auto-capturing document..." : "Capturing document...");
  try {
    const rawCanvas = document.createElement("canvas");
    rawCanvas.width = videoWidth;
    rawCanvas.height = videoHeight;
    const rawCtx = rawCanvas.getContext("2d");
    if (!rawCtx) {
      throw new Error("Canvas is not supported in this browser.");
    }
    rawCtx.drawImage(cameraPreview, 0, 0, videoWidth, videoHeight);
    const workCanvas = scaleCanvasToMax(rawCanvas, 1800);
    const blob = await canvasToBlob(workCanvas, "image/jpeg", 0.96);
    const thumbUrl = URL.createObjectURL(blob);
    const suggestedCornersNormalized = normalizeCornersFromPixels(
      scanState.liveDetectedCorners,
      videoWidth,
      videoHeight
    );
    const capture = {
      id: `raw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      blob,
      thumbUrl,
      suggestedCornersNormalized: suggestedCornersNormalized
        ? cloneCorners(suggestedCornersNormalized)
        : null,
    };

    if (Number.isInteger(scanState.retakeInsertIndex) && scanState.retakeInsertIndex >= 0) {
      const insertIndex = Math.min(scanState.retakeInsertIndex, scanState.pendingRawCaptures.length);
      scanState.pendingRawCaptures.splice(insertIndex, 0, capture);
      scanState.currentRawCapture = capture;
      scanState.retakeInsertIndex = null;
      updateScanBadges();
      setStatus(
        `${autoTriggered ? "Auto-captured" : "Retake captured"} for photo ${insertIndex + 1}. Opening editor...`
      );
      await loadCurrentCaptureIntoEditor();
      setStatus(`Retake updated at photo ${insertIndex + 1}. Continue editing.`);
      return;
    }

    scanState.pendingRawCaptures.push(capture);
    updateScanBadges();
    setStatus(
      `${autoTriggered ? "Auto-captured" : "Captured"} ${scanState.pendingRawCaptures.length} photo(s). Capture more, then tap Next: Edit All.`
    );
  } finally {
    setScanProcessing(false);
    scanState.captureInProgress = false;
  }
}

async function showScanPreview() {
  if (!scanState.sourceCanvas || !scanState.corners) {
    throw new Error("Capture a document first.");
  }
  syncScanControlsFromInputs();
  setScanProcessing(true, "Rendering preview...");
  await new Promise((resolve) => requestAnimationFrame(resolve));
  const hasPreview = renderPreviewCanvasWithCurrentOutput();
  if (!hasPreview) {
    setScanProcessing(false);
    throw new Error("Could not generate preview.");
  }
  scanPreviewWrap?.scrollTo({ top: 0, left: 0, behavior: "auto" });
  setScanStage("preview");
  setScanProcessing(false);
  setStatus("Preview ready. Tap Finish to apply this style to all captured pages.");
}

async function buildProcessedCanvasFromRawBlob(
  rawBlob,
  controls,
  filter,
  suggestedCornersNormalized = null
) {
  const image = await blobToImage(rawBlob);
  const rawCanvas = document.createElement("canvas");
  rawCanvas.width = image.width;
  rawCanvas.height = image.height;
  const rawCtx = rawCanvas.getContext("2d");
  if (!rawCtx) {
    throw new Error("Canvas is not supported in this browser.");
  }
  rawCtx.drawImage(image, 0, 0);
  const workCanvas = scaleCanvasToMax(rawCanvas, 1800);
  const workCtx = workCanvas.getContext("2d", { willReadFrequently: true });
  if (!workCtx) {
    throw new Error("Canvas is not supported in this browser.");
  }
  const frame = workCtx.getImageData(0, 0, workCanvas.width, workCanvas.height);
  const aiSuggestedCorners = scaleNormalizedCorners(
    suggestedCornersNormalized,
    workCanvas.width,
    workCanvas.height
  );
  const detectedCorners =
    aiSuggestedCorners ||
    detectDocumentCornersFromImageData(frame, workCanvas.width, workCanvas.height) ||
    createDefaultCorners(workCanvas.width, workCanvas.height);

  scanState.filter = filter;
  scanState.controls = { ...controls };
  scanState.sourceCanvas = workCanvas;
  scanState.sourceCtx = workCtx;
  scanState.corners = cloneCorners(detectedCorners);
  scanState.cropDirty = true;
  scanState.cachedCroppedCanvas = null;
  scanState.cachedOutputCanvas = null;

  const output = buildProcessedOutputCanvas();
  if (!output) {
    throw new Error("Failed to process captured page.");
  }
  return output;
}

async function saveCurrentScan() {
  if (scanState.pendingRawCaptures.length <= 0) {
    throw new Error("No captured photos in queue.");
  }

  syncScanControlsFromInputs();
  const finalizeAndUseCapturedFiles = (savedCount) => {
    const captured = [...cameraCapturedFiles];
    if (captured.length > 0) {
      setSelectedFiles(captured);
      setStatus(`Ready to convert ${savedCount} scanned photo(s) to one PDF.`);
    } else {
      setStatus("No scanned photos were saved.");
    }
    cameraCapturedFiles = [];
    stopCamera();
  };

  if (scanState.editMode === "each") {
    if (!scanState.currentRawCapture) {
      throw new Error("No current photo loaded for editing.");
    }
    const outputCanvas = buildProcessedOutputCanvas();
    if (!outputCanvas) {
      throw new Error("Could not process current photo.");
    }

    setScanProcessing(true, "Saving current edited photo...");
    try {
      const blob = await canvasToBlob(outputCanvas, "image/jpeg", 0.96);
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      cameraCapturedFiles.push(
        new File([blob], `scan-${stamp}-${cameraCapturedFiles.length + 1}.jpg`, {
          type: "image/jpeg",
        })
      );

      const currentId = scanState.currentRawCapture.id;
      const idx = scanState.pendingRawCaptures.findIndex((item) => item.id === currentId);
      if (idx >= 0) {
        revokeCaptureThumb(scanState.pendingRawCaptures[idx]);
        scanState.pendingRawCaptures.splice(idx, 1);
      }

      if (scanState.pendingRawCaptures.length > 0) {
        const nextIndex = idx >= 0 ? Math.min(idx, scanState.pendingRawCaptures.length - 1) : 0;
        scanState.currentRawCapture = scanState.pendingRawCaptures[nextIndex];
        await loadCurrentCaptureIntoEditor();
        setStatus(
          `Saved ${cameraCapturedFiles.length}. Continue editing, or click any thumbnail to jump to another photo.`
        );
      } else {
        scanState.currentRawCapture = null;
        finalizeAndUseCapturedFiles(cameraCapturedFiles.length);
      }
      updateScanBadges();
    } finally {
      setScanProcessing(false);
    }
    return;
  }

  const controlsSnapshot = { ...scanState.controls };
  const filterSnapshot = scanState.filter;
  const queuedCaptures = [...scanState.pendingRawCaptures];
  const total = queuedCaptures.length;

  setScanProcessing(true, `Applying edits to all ${total} photo(s)...`);
  try {
    for (let i = 0; i < queuedCaptures.length; i += 1) {
      const capture = queuedCaptures[i];
      setScanProcessing(true, `Applying edits to page ${i + 1}/${total}...`);
      const outputCanvas = await buildProcessedCanvasFromRawBlob(
        capture.blob,
        controlsSnapshot,
        filterSnapshot,
        capture.suggestedCornersNormalized
      );
      const blob = await canvasToBlob(outputCanvas, "image/jpeg", 0.96);
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const file = new File(
        [blob],
        `scan-${stamp}-${cameraCapturedFiles.length + 1}.jpg`,
        { type: "image/jpeg" }
      );
      cameraCapturedFiles.push(file);
      revokeCaptureThumb(capture);
    }

    scanState.pendingRawCaptures = [];
    scanState.currentRawCapture = null;
    finalizeAndUseCapturedFiles(cameraCapturedFiles.length);
  } finally {
    setScanProcessing(false);
  }
}

function closeCameraSession() {
  const hasSaved = cameraCapturedFiles.length > 0;
  const hasPending = scanState.pendingRawCaptures.length > 0;

  if (hasSaved) {
    setSelectedFiles([...cameraCapturedFiles]);
    setStatus(
      `Ready to convert ${cameraCapturedFiles.length} scanned photo(s) to one PDF.`
    );
  } else if (hasPending) {
    setStatus("Camera closed. Unsaved captured photos were discarded.");
  } else {
    setStatus("Camera closed.");
  }

  cameraCapturedFiles = [];
  updateScanBadges();
  stopCamera();
}

function setSelectedFiles(files) {
  selectedFiles = files;
  resetDownloadLink();
  if (card) {
    card.classList.remove("file-selected");
  }
  if (!files.length) {
    fileInfo.textContent =
      "Accepted: all common forms (.doc/.docx/.ppt/.pptx/.xls/.xlsx, text, images). You can select many photos.";
    convertBtn.disabled = true;
    setStatus("Choose a document to start.");
    return;
  }

  if (files.length === 1) {
    fileInfo.textContent = `Selected: ${files[0].name}`;
  } else {
    fileInfo.textContent = `Selected ${files.length} files`;
  }
  convertBtn.disabled = false;
  if (card) {
    // Restart selection animation each time a new file is chosen.
    void card.offsetWidth;
    card.classList.add("file-selected");
  }
  const forms = new Set(
    files.map((file) => getInputForm(getExt(file.name), file.type))
  );
  const formLabel =
    forms.size === 1 ? Array.from(forms)[0] : `Mixed (${Array.from(forms).join("/")})`;
  setStatus(`Ready to convert. Detected form: ${formLabel}.`);
}

function setSelectedFile(file) {
  setSelectedFiles(file ? [file] : []);
}

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function fileToText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

function getTargetBytes() {
  const value = Number(targetSizeInput.value);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  const unit = targetUnitSelect.value;
  const multiplier = unit === "MB" ? 1024 * 1024 : 1024;
  return Math.floor(value * multiplier);
}

function bytesToKb(bytes) {
  return (bytes / 1024).toFixed(1);
}

function formatTargetSize(targetBytes) {
  if (!targetBytes) {
    return "";
  }

  if (targetBytes >= 1024 * 1024) {
    return `${(targetBytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  return `${bytesToKb(targetBytes)} KB`;
}

function getOutputPdfName(inputName) {
  const base = inputName.replace(/\.[^/.]+$/, "") || "converted";
  return `${base}.pdf`;
}

function saveOutputBlob(blob, downloadName, finalLabel) {
  if (outputUrl) {
    URL.revokeObjectURL(outputUrl);
  }
  const url = URL.createObjectURL(blob);
  outputUrl = url;
  downloadLink.href = url;
  downloadLink.download = downloadName;
  downloadLink.classList.remove("hidden");
  if (downloadTimer) {
    clearInterval(downloadTimer);
    downloadTimer = null;
  }
startDownloadCountdown(downloadLink, finalLabel);

  const isPdfOutput =
    (blob.type && blob.type.includes("pdf")) || /\.pdf$/i.test(downloadName);
  if (isPdfOutput) {
    previewControls.classList.remove("hidden");
    previewWrap.classList.add("hidden");
    previewFrame.removeAttribute("src");
  } else {
    previewControls.classList.add("hidden");
    previewWrap.classList.add("hidden");
    previewFrame.removeAttribute("src");
  }
  return blob.size;
}

function savePdf(blob, inputName) {
  return saveOutputBlob(blob, getOutputPdfName(inputName), "Download PDF");
}

async function makePdfExactTargetSize(blob, targetBytes) {
  if (!targetBytes) {
    return { blob, exactMatched: false, aboveTarget: false };
  }

  if (blob.size > targetBytes) {
    return { blob, exactMatched: false, aboveTarget: true };
  }

  if (blob.size === targetBytes) {
    return { blob, exactMatched: true, aboveTarget: false };
  }

  const padBytes = targetBytes - blob.size;
  if (padBytes <= 0) {
    return { blob, exactMatched: false, aboveTarget: false };
  }

  const source = new Uint8Array(await blob.arrayBuffer());
  const padding = new Uint8Array(padBytes);
  padding.fill(32);

  const merged = new Uint8Array(source.length + padBytes);
  merged.set(source, 0);
  merged.set(padding, source.length);

  const exactBlob = new Blob([merged], { type: "application/pdf" });
  return { blob: exactBlob, exactMatched: true, aboveTarget: false };
}

function writeTextToPdf(doc, text) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const lineHeight = 6;
  const maxWidth = pageWidth - margin * 2;

  doc.setFont("courier", "normal");
  doc.setFontSize(11);

  const lines = doc.splitTextToSize(text, maxWidth);
  let y = margin;

  lines.forEach((line) => {
    if (y > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
    doc.text(line, margin, y);
    y += lineHeight;
  });
}

async function addImagePage(doc, dataUrl, pageIndex) {
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = dataUrl;
  });

  if (pageIndex > 0) {
    doc.addPage();
  }

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const scale = Math.min(pageWidth / img.width, pageHeight / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  const x = (pageWidth - w) / 2;
  const y = (pageHeight - h) / 2;

  doc.addImage(dataUrl, "JPEG", x, y, w, h);
}

async function buildImagesPdf(dataUrls) {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  for (let i = 0; i < dataUrls.length; i += 1) {
    await addImagePage(doc, dataUrls[i], i);
  }
  return doc;
}

async function downscaleImageDataUrl(dataUrl, maxWidth, quality) {
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = dataUrl;
  });

  const ratio = Math.min(1, maxWidth / img.width);
  const width = Math.max(1, Math.floor(img.width * ratio));
  const height = Math.max(1, Math.floor(img.height * ratio));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas is not supported in this browser.");
  }

  // Fill white background before drawing to avoid black backgrounds on transparent images.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  return canvas.toDataURL("image/jpeg", quality);
}

async function convertImagesToPdf(files, targetBytes) {
  const originalDataUrls = await Promise.all(files.map((file) => fileToDataUrl(file)));

  if (!targetBytes) {
    const doc = await buildImagesPdf(originalDataUrls);
    return { doc, metTarget: true };
  }

  const qualitySteps = [0.9, 0.82, 0.74, 0.66, 0.56, 0.46, 0.36, 0.28];
  const widthSteps = [2200, 1800, 1400, 1100, 900, 700];
  let bestDoc = null;
  let bestSize = Number.POSITIVE_INFINITY;

  for (const maxWidth of widthSteps) {
    for (const quality of qualitySteps) {
      const compressedDataUrls = await Promise.all(
        originalDataUrls.map((dataUrl) =>
          downscaleImageDataUrl(dataUrl, maxWidth, quality)
        )
      );
      const doc = await buildImagesPdf(compressedDataUrls);
      const size = doc.output("arraybuffer").byteLength;

      if (size < bestSize) {
        bestSize = size;
        bestDoc = doc;
      }

      if (size <= targetBytes) {
        return { doc, metTarget: true };
      }
    }
  }

  return { doc: bestDoc, metTarget: false };
}

async function convertTextLikeToPdf(file, ext) {
  const content = await fileToText(file);
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });

  if (ext === "md") {
    const html = marked.parse(content);
    const textOnly = new DOMParser().parseFromString(html, "text/html").body
      .textContent;
    writeTextToPdf(doc, textOnly || "");
  } else {
    writeTextToPdf(doc, content);
  }

  return doc;
}

function isOfficeLike(fileExt) {
  return officeExtensions.has(fileExt);
}

function getInputForm(ext, mimeType) {
  if (ext === "pdf") {
    return "PDF";
  }
  if (mimeType.startsWith("image/")) {
    return "Image";
  }
  if (isOfficeLike(ext)) {
    return "Office";
  }
  if (textExtensions.has(ext)) {
    return "Text";
  }
  return "Other";
}

async function convertWithServer(file) {
  if (!window.location.protocol.startsWith("http")) {
    throw new Error(
      "For Office/all-form conversion, run this project with the Node server (npm start)."
    );
  }

  const formData = new FormData();
  formData.append("file", file);

  return postFormDataWithProgress("/api/convert", formData, {
    uploadLabel: "Uploading file...",
    processLabel: "Converting on server...",
    downloadLabel: "Receiving converted PDF...",
    fallbackError: "Server conversion failed.",
  });
}

async function compressPdfWithServer(file, targetBytes, ultraMode, hardRasterMode) {
  if (!window.location.protocol.startsWith("http")) {
    throw new Error(
      "For PDF compression, run this project with the Node server (npm start)."
    );
  }

  if (!targetBytes) {
    throw new Error("Enter target size in KB/MB to compress a PDF.");
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("targetBytes", String(targetBytes));
  formData.append("ultraMode", ultraMode ? "1" : "0");
  formData.append("hardRasterMode", hardRasterMode ? "1" : "0");

  return postFormDataWithProgress("/api/compress-pdf", formData, {
    uploadLabel: "Uploading PDF...",
    processLabel: "Compressing PDF...",
    downloadLabel: "Receiving compressed PDF...",
    fallbackError: "PDF compression failed.",
  });
}

async function convertSingleFileToPdfBlob(file, targetBytes, ultraMode, hardRasterMode) {
  const ext = getExt(file.name);
  const isImage = file.type.startsWith("image/");
  const isOffice = isOfficeLike(ext);
  const isPdf = ext === "pdf";

  if (isPdf) {
    return compressPdfWithServer(file, targetBytes, ultraMode, hardRasterMode);
  }
  if (isOffice) {
    return convertWithServer(file);
  }
  if (isImage) {
    const result = await convertImagesToPdf([file], targetBytes);
    return result.doc.output("blob");
  }
  if (textExtensions.has(ext)) {
    const doc = await convertTextLikeToPdf(file, ext);
    return doc.output("blob");
  }
  return convertWithServer(file);
}

async function convertBatchFilesToZip(files, targetBytes, ultraMode, hardRasterMode) {
  if (!window.JSZip) {
    throw new Error("ZIP support missing. Reload the page and try again.");
  }

  const zip = new window.JSZip();
  const total = files.length;
  for (let i = 0; i < total; i += 1) {
    const file = files[i];
    setStatus(`Converting ${i + 1}/${total}: ${file.name}`);
    setLoadingLabel(`Converting files (${i + 1}/${total})...`);

    const pdfBlob = await convertSingleFileToPdfBlob(
      file,
      targetBytes,
      ultraMode,
      hardRasterMode
    );
    zip.file(getOutputPdfName(file.name), pdfBlob);

    loadingProgress = 8 + ((i + 1) / total) * 76;
    renderLoadingProgress();
  }

  setLoadingLabel("Packing converted files...");
  stopProcessingPulse();
  const zipBlob = await zip.generateAsync(
    {
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    },
    (meta) => {
      loadingProgress = 84 + meta.percent * 0.16;
      renderLoadingProgress();
    }
  );
  return zipBlob;
}

async function handleConvert() {
  if (!selectedFiles.length) {
    setStatus("Please select a file first.");
    return;
  }

  convertBtn.disabled = true;
  setStatus("Converting...");
  startLoading("Preparing conversion...");

  let success = false;
  try {
    const primaryFile = selectedFiles[0];
    const ext = getExt(primaryFile.name);
    const isSingle = selectedFiles.length === 1;
    const allImages = selectedFiles.every((file) => file.type.startsWith("image/"));
    const isImage = isSingle && primaryFile.type.startsWith("image/");
    const isOffice = isSingle && isOfficeLike(ext);
    const isPdf = isSingle && ext === "pdf";
    const targetBytes = getTargetBytes();
    const maxCompression = Boolean(maxCompressionInput?.checked);
    const ultraMode = maxCompression;
    // Keep Heavy Compression clarity-safe: do not enable raster mode from UI.
    const hardRasterMode = false;
    if (isPdf && maxCompression) {
      setStatus("Heavy Compression enabled (clarity-safe, no raster blur).");
      setLoadingLabel("Heavy compression in progress...");
    } else if (!isSingle && allImages) {
      setLoadingLabel("Merging multiple images...");
    }

    let doc = null;
    let serverBlob = null;
    let metTarget = true;

    if (!isSingle && allImages) {
      const result = await convertImagesToPdf(selectedFiles, targetBytes);
      doc = result.doc;
      metTarget = result.metTarget;
    } else if (!isSingle) {
      const zipBlob = await convertBatchFilesToZip(
        selectedFiles,
        targetBytes,
        ultraMode,
        hardRasterMode
      );
      const actualBytes = saveOutputBlob(
        zipBlob,
        "converted-pdfs.zip",
        "Download ZIP"
      );
      const targetText = targetBytes
        ? ` Target: ~${formatTargetSize(targetBytes)} per file where applicable.`
        : "";
      setStatus(
        `Done: Converted ${selectedFiles.length} files. ZIP size ${bytesToKb(actualBytes)} KB.${targetText}`
      );
      success = true;
      triggerSuccessAnimation();
      return;
    } else if (isPdf) {
      serverBlob = await compressPdfWithServer(
        primaryFile,
        targetBytes,
        ultraMode,
        hardRasterMode
      );
    } else if (isOffice) {
      serverBlob = await convertWithServer(primaryFile);
    } else if (isImage) {
      const result = await convertImagesToPdf([primaryFile], targetBytes);
      doc = result.doc;
      metTarget = result.metTarget;
    } else if (textExtensions.has(ext)) {
      doc = await convertTextLikeToPdf(primaryFile, ext);
    } else {
      // Try server conversion for any unknown extension so users can use more forms.
      serverBlob = await convertWithServer(primaryFile);
    }

    let blob = serverBlob || doc.output("blob");
    const exactSizing = await makePdfExactTargetSize(blob, targetBytes);
    blob = exactSizing.blob;

    const downloadName = selectedFiles.length > 1 ? "images-batch.pdf" : primaryFile.name;
    const actualBytes = savePdf(blob, downloadName);
    const targetText = targetBytes
      ? ` Target: ~${formatTargetSize(targetBytes)}.`
      : "";

    if (targetBytes && exactSizing.exactMatched) {
      setStatus(
        `Done: ${bytesToKb(actualBytes)} KB.${targetText} Exact target size achieved.`
      );
    } else if (targetBytes && exactSizing.aboveTarget) {
      setStatus(
        `Done: ${bytesToKb(actualBytes)} KB.${targetText} Could not reach target${hardRasterMode ? " even in hard raster mode" : ultraMode ? " even in ultra mode" : ""}.`
      );
    } else if (isPdf && serverBlob && targetBytes) {
      setStatus(
        `Compressed PDF: ${bytesToKb(actualBytes)} KB.${targetText} Click \"Download PDF\".`
      );
    } else if (serverBlob && targetBytes) {
      setStatus(
        `Converted: ${bytesToKb(actualBytes)} KB.${targetText} Server conversion used for this file form.`
      );
    } else if (targetBytes && (isImage || allImages) && !metTarget) {
      setStatus(
        `Converted: ${bytesToKb(actualBytes)} KB.${targetText} Could not hit target exactly; used strongest compression.`
      );
    } else if (targetBytes && !(isImage || allImages)) {
      setStatus(
        `Converted: ${bytesToKb(actualBytes)} KB.${targetText} Exact targeting works best for image files.`
      );
    } else {
      setStatus(
        `Converted: ${bytesToKb(actualBytes)} KB.${targetText} Click \"Download PDF\".`
      );
    }
    success = true;
    triggerSuccessAnimation();
  } catch (error) {
    setStatus(`Failed: ${error.message}`);
  } finally {
    stopLoading(success);
    convertBtn.disabled = false;
  }
}

fileInput.addEventListener("change", (event) => {
  const files = Array.from(event.target.files || []);
  setSelectedFiles(files);
});

convertBtn.addEventListener("click", handleConvert);

previewBtn?.addEventListener("click", () => {
  if (!outputUrl) {
    return;
  }
  previewFrame.src = `${outputUrl}#zoom=page-width`;
  previewWrap.classList.remove("hidden");
  setStatus("Preview ready. Check quality before downloading.");
});

previewCloseBtn?.addEventListener("click", () => {
  previewWrap.classList.add("hidden");
  previewFrame.removeAttribute("src");
});

["dragenter", "dragover"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.add("dragover");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.remove("dragover");
  });
});

dropzone.addEventListener("drop", (event) => {
  const files = Array.from(event.dataTransfer?.files || []);
  fileInput.files = event.dataTransfer.files;
  setSelectedFiles(files);
});

openCameraBtn?.addEventListener("click", async () => {
  try {
    await openCamera();
  } catch (error) {
    setStatus(`Failed: ${error.message}`);
  }
});

closeCameraBtn?.addEventListener("click", async () => {
  try {
    await closeCameraSession();
  } catch (error) {
    setStatus(`Failed: ${error.message}`);
  }
});

captureBtn?.addEventListener("click", async () => {
  try {
    await captureFromCamera();
  } catch (error) {
    setStatus(`Failed: ${error.message}`);
  }
});

startEditQueueBtn?.addEventListener("click", async () => {
  try {
    await startQueuedEditing();
    setStatus("Edit screen opened. Click any thumbnail to edit that photo.");
  } catch (error) {
    setStatus(`Failed: ${error.message}`);
  }
});

flashToggleBtn?.addEventListener("click", async () => {
  try {
    await setTorchEnabled(!scanState.torchOn);
    setStatus(scanState.torchOn ? "Flash enabled." : "Flash disabled.");
  } catch (error) {
    setStatus(`Flash: ${error.message}`);
  }
});

autoCaptureToggleBtn?.addEventListener("click", () => {
  setAutoCaptureEnabled(!scanState.autoCaptureEnabled, true);
});

retakeBtn?.addEventListener("click", () => {
  if (scanState.stage === "live") {
    if (retakeLastCapturedPhoto()) {
      setStatus("Last captured photo removed. Capture again.");
      return;
    }
    setStatus("No captured photo to retake yet.");
    return;
  }
  if (prepareCurrentCaptureRetake()) {
    setStatus("Retake mode: capture now to replace this exact photo.");
    return;
  }
  resetScanEditState();
  resetScanControls();
  setScanStage("live");
  setStatus("Retake mode enabled. Capture a new document.");
});

nextToPreviewBtn?.addEventListener("click", async () => {
  try {
    if (scanState.editMode === "each") {
      await saveCurrentScan();
      return;
    }
    await showScanPreview();
  } catch (error) {
    setScanProcessing(false);
    setStatus(`Failed: ${error.message}`);
  }
});

backToEditBtn?.addEventListener("click", () => {
  setScanStage("edit");
  setStatus("Back to edit. Adjust once, preview, then apply to all pages.");
});

saveScanBtn?.addEventListener("click", async () => {
  try {
    await saveCurrentScan();
  } catch (error) {
    setScanProcessing(false);
    setStatus(`Failed: ${error.message}`);
  }
});

rotateLeftBtn?.addEventListener("click", () => {
  rotateBy(-90);
  setStatus("Rotated left 90°.");
});

rotateRightBtn?.addEventListener("click", () => {
  rotateBy(90);
  setStatus("Rotated right 90°.");
});

rotate180Btn?.addEventListener("click", () => {
  rotateBy(180);
  setStatus("Rotated 180°.");
});

[scanRotateInput, scanBrightnessInput, scanContrastInput, scanSharpnessInput].forEach(
  (input) => {
    input?.addEventListener("input", () => {
      syncScanControlsFromInputs();
    });
  }
);

scanZoomInput?.addEventListener("input", applyPreviewZoom);

document.querySelectorAll(".scan-filter-btn").forEach((button) => {
  button.addEventListener("click", () => {
    applyFilterPreset(button.dataset.filter || "original");
    setStatus(`Filter set to ${button.textContent}.`);
  });
});

applyAllToggle?.addEventListener("change", () => {
  setScanEditMode(applyAllToggle.checked ? "all" : "each");
  setStatus(
    applyAllToggle.checked
      ? "Apply-all enabled: edit once, then Finish to apply to every captured photo."
      : "Apply-all disabled: press Done & Next to save current photo and move to the next one."
  );
});

updateAutoCaptureButtonState();

window.addEventListener("resize", () => {
  syncVideoOverlaySize();
  drawLiveDetectionBoundary();
  renderScanSource();
  applyPreviewZoom();
});

window.addEventListener("beforeunload", stopCamera);
