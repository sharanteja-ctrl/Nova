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
const loadingLabel = document.getElementById("loadingLabel");
const loadingPercent = document.getElementById("loadingPercent");
const successBurst = document.getElementById("successBurst");
const openCameraBtn = document.getElementById("openCameraBtn");
const closeCameraBtn = document.getElementById("closeCameraBtn");
const captureBtn = document.getElementById("captureBtn");
const cameraPanel = document.getElementById("cameraPanel");
const cameraPreview = document.getElementById("cameraPreview");
const card = document.querySelector(".card");

let selectedFiles = [];
let activeCameraStream = null;
let cameraCapturedFiles = [];
let loadingTimer = null;
let loadingProgress = 0;
let downloadTimer = null;
let outputUrl = null;

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
  downloadLink.textContent = "Download PDF";
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
  linkEl.textContent = `Download in ${count}s`;
  const timer = setInterval(() => {
    count -= 1;
    if (count <= 0) {
      clearInterval(timer);
      linkEl.classList.remove("pending");
      linkEl.textContent = finalText;
      return;
    }
    linkEl.textContent = `Download in ${count}s`;
  }, 1000);
}

function renderLoadingProgress() {
  const value = Math.max(0, Math.min(100, Math.round(loadingProgress)));
  loadingBar.style.width = `${value}%`;
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
  loadingProgress = 6;
  renderLoadingProgress();

  if (loadingTimer) {
    clearInterval(loadingTimer);
  }
  loadingTimer = setInterval(() => {
    // Fast at start, slower near completion.
    const remaining = 92 - loadingProgress;
    if (remaining <= 0) {
      return;
    }
    loadingProgress += Math.max(1.2, remaining * 0.08);
    renderLoadingProgress();
  }, 260);
}

function setLoadingLabel(text) {
  loadingLabel.textContent = text;
}

function stopLoading(success) {
  if (loadingTimer) {
    clearInterval(loadingTimer);
    loadingTimer = null;
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

function stopCamera() {
  if (activeCameraStream) {
    activeCameraStream.getTracks().forEach((track) => track.stop());
    activeCameraStream = null;
  }
  cameraPreview.srcObject = null;
  cameraPanel.classList.add("hidden");
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

async function openCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error("Camera is not supported in this browser.");
  }

  if (activeCameraStream) {
    return;
  }
  cameraCapturedFiles = [];

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "environment" },
    audio: false,
  });
  activeCameraStream = stream;
  cameraPreview.srcObject = stream;
  cameraPanel.classList.remove("hidden");
}

async function captureFromCamera() {
  if (!activeCameraStream) {
    throw new Error("Camera is not open.");
  }

  const videoWidth = cameraPreview.videoWidth;
  const videoHeight = cameraPreview.videoHeight;
  if (!videoWidth || !videoHeight) {
    throw new Error("Camera not ready yet. Try again.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = videoWidth;
  canvas.height = videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas is not supported in this browser.");
  }

  ctx.drawImage(cameraPreview, 0, 0, videoWidth, videoHeight);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
  if (!blob) {
    throw new Error("Could not capture photo.");
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = new File([blob], `camera-${stamp}.jpg`, { type: "image/jpeg" });
  cameraCapturedFiles.push(file);
  fileInfo.textContent = `Captured from camera: ${cameraCapturedFiles.length} photo(s)`;
  setStatus(
    `Captured ${cameraCapturedFiles.length} photo(s). Capture more or close camera to use them.`
  );
}

function closeCameraSession() {
  if (cameraCapturedFiles.length > 0) {
    setSelectedFiles([...cameraCapturedFiles]);
    setStatus(
      `Ready to convert ${cameraCapturedFiles.length} captured photo(s) to one PDF.`
    );
  }
  cameraCapturedFiles = [];
  stopCamera();
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

  const response = await fetch("/api/convert", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    let message = "Server conversion failed.";
    try {
      const data = await response.json();
      message = data.error || message;
    } catch {
      // Ignore parse errors and use fallback message.
    }
    throw new Error(message);
  }

  return response.blob();
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

  const response = await fetch("/api/compress-pdf", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    let message = "PDF compression failed.";
    try {
      const data = await response.json();
      message = data.error || message;
    } catch {
      // Ignore parse errors and use fallback message.
    }
    throw new Error(message);
  }

  return response.blob();
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

openCameraBtn.addEventListener("click", async () => {
  try {
    await openCamera();
    setStatus(
      "Camera is open. Capture multiple photos, then close camera to convert them."
    );
  } catch (error) {
    setStatus(`Failed: ${error.message}`);
  }
});

closeCameraBtn.addEventListener("click", () => {
  closeCameraSession();
});

captureBtn.addEventListener("click", async () => {
  try {
    await captureFromCamera();
  } catch (error) {
    setStatus(`Failed: ${error.message}`);
  }
});

window.addEventListener("beforeunload", stopCamera);
