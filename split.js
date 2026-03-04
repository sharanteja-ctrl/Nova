(() => {
  const MAX_FILE_BYTES = 100 * 1024 * 1024;
  const AUTO_DELETE_MS = 10 * 60 * 1000;

  const dropzone = document.getElementById("splitDropzone");
  const fileInput = document.getElementById("splitFileInput");
  const fileInfo = document.getElementById("splitFileInfo");
  const fileNameEl = document.getElementById("splitFileName");
  const pageCountEl = document.getElementById("splitPageCount");
  const splitBtn = document.getElementById("splitBtn");
  const splitStatus = document.getElementById("splitStatus");
  const splitThumbGrid = document.getElementById("splitThumbGrid");
  const splitRangeWrap = document.getElementById("splitRangeWrap");
  const splitRanges = document.getElementById("splitRanges");
  const selectAllPagesBtn = document.getElementById("selectAllPagesBtn");
  const clearPagesBtn = document.getElementById("clearPagesBtn");
  const splitProcessingWrap = document.getElementById("splitProcessingWrap");
  const splitProgressBar = document.getElementById("splitProgressBar");
  const splitProgressLabel = document.getElementById("splitProgressLabel");
  const splitProgressPercent = document.getElementById("splitProgressPercent");
  const splitResultWrap = document.getElementById("splitResultWrap");
  const splitSuccessMsg = document.getElementById("splitSuccessMsg");
  const splitOutputList = document.getElementById("splitOutputList");
  const splitZipDownloadLink = document.getElementById("splitZipDownloadLink");

  if (
    !dropzone ||
    !fileInput ||
    !fileInfo ||
    !fileNameEl ||
    !pageCountEl ||
    !splitBtn ||
    !splitStatus ||
    !splitThumbGrid ||
    !splitRangeWrap ||
    !splitRanges ||
    !selectAllPagesBtn ||
    !clearPagesBtn ||
    !splitProcessingWrap ||
    !splitProgressBar ||
    !splitProgressLabel ||
    !splitProgressPercent ||
    !splitResultWrap ||
    !splitSuccessMsg ||
    !splitOutputList ||
    !splitZipDownloadLink
  ) {
    return;
  }

  if (!window.PDFLib || !window.JSZip || !window.pdfjsLib) {
    splitStatus.textContent = "Required PDF libraries are missing. Refresh the page and try again.";
    return;
  }

  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";

  let sourcePdfDoc = null;
  let sourcePdfBuffer = null;
  let sourcePdfName = "";
  let sourcePageCount = 0;
  let selectedPages = new Set();
  let outputObjectUrls = [];
  let autoDeleteTimer = null;

  function getMode() {
    const checked = document.querySelector('input[name="splitMode"]:checked');
    return checked ? checked.value : "each";
  }

  function bytesToMb(size) {
    return (size / (1024 * 1024)).toFixed(2);
  }

  function sanitizeName(value) {
    return String(value || "split")
      .replace(/[^\w.\- ]+/g, "_")
      .replace(/\s+/g, "-");
  }

  function setStatus(message) {
    splitStatus.textContent = message;
  }

  function revokeOutputUrls() {
    outputObjectUrls.forEach((url) => {
      URL.revokeObjectURL(url);
    });
    outputObjectUrls = [];
  }

  function hideResults() {
    revokeOutputUrls();
    splitOutputList.innerHTML = "";
    splitSuccessMsg.textContent = "";
    splitResultWrap.classList.add("hidden");
    splitZipDownloadLink.classList.add("hidden");
    splitZipDownloadLink.removeAttribute("href");
    splitZipDownloadLink.removeAttribute("download");
  }

  function clearAutoDeleteTimer() {
    if (autoDeleteTimer) {
      clearTimeout(autoDeleteTimer);
      autoDeleteTimer = null;
    }
  }

  function scheduleAutoDelete() {
    clearAutoDeleteTimer();
    autoDeleteTimer = setTimeout(() => {
      resetSource();
      hideResults();
      setStatus("Temporary files were auto-cleared from browser memory.");
    }, AUTO_DELETE_MS);
  }

  function setProgress(percent, label) {
    const bounded = Math.max(0, Math.min(100, Math.round(percent)));
    splitProgressBar.style.width = `${bounded}%`;
    splitProgressPercent.textContent = `${bounded}%`;
    if (label) {
      splitProgressLabel.textContent = label;
    }
  }

  function showProcessing(show) {
    splitProcessingWrap.classList.toggle("hidden", !show);
    if (show) {
      setProgress(0, "Preparing...");
    }
  }

  function updateControls() {
    const mode = getMode();
    splitRangeWrap.classList.toggle("hidden", mode !== "ranges");

    const hasPdf = !!sourcePdfDoc && sourcePageCount > 0;
    let canSplit = hasPdf;
    if (mode === "ranges") {
      canSplit = canSplit && !!splitRanges.value.trim();
    }
    if (mode === "extract") {
      canSplit = canSplit && selectedPages.size > 0;
    }
    splitBtn.disabled = !canSplit;
  }

  function resetSource() {
    sourcePdfDoc = null;
    sourcePdfBuffer = null;
    sourcePdfName = "";
    sourcePageCount = 0;
    selectedPages = new Set();

    fileInfo.textContent = "Drag & drop PDF here or click to upload";
    fileNameEl.textContent = "-";
    pageCountEl.textContent = "-";
    splitThumbGrid.innerHTML = "";
    splitRanges.value = "";
    updateControls();
  }

  function parseRangeGroups(rawInput, totalPages) {
    const tokens = rawInput
      .split(",")
      .map((token) => token.trim())
      .filter(Boolean);
    if (!tokens.length) {
      throw new Error("Enter at least one page range.");
    }

    const groups = [];
    for (const token of tokens) {
      if (token.includes("-")) {
        const parts = token.split("-");
        if (parts.length !== 2) {
          throw new Error(`Invalid range: ${token}`);
        }
        const start = Number(parts[0].trim());
        const end = Number(parts[1].trim());
        if (!Number.isInteger(start) || !Number.isInteger(end)) {
          throw new Error(`Invalid range: ${token}`);
        }
        if (start < 1 || end < 1 || start > end || end > totalPages) {
          throw new Error(`Range out of bounds: ${token}`);
        }
        const pages = [];
        for (let page = start; page <= end; page += 1) {
          pages.push(page - 1);
        }
        groups.push({ label: `${start}-${end}`, pages });
      } else {
        const pageNumber = Number(token);
        if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > totalPages) {
          throw new Error(`Page out of bounds: ${token}`);
        }
        groups.push({ label: `${pageNumber}`, pages: [pageNumber - 1] });
      }
    }
    return groups;
  }

  function buildSplitGroups() {
    const mode = getMode();
    if (mode === "ranges") {
      return parseRangeGroups(splitRanges.value.trim(), sourcePageCount);
    }
    if (mode === "extract") {
      if (!selectedPages.size) {
        throw new Error("Select at least one page to extract.");
      }
      const pages = Array.from(selectedPages)
        .sort((a, b) => a - b)
        .map((n) => n - 1);
      return [{ label: "selected-pages", pages }];
    }

    const groups = [];
    for (let i = 0; i < sourcePageCount; i += 1) {
      groups.push({ label: `${i + 1}`, pages: [i] });
    }
    return groups;
  }

  function attachThumbCheckboxEvents() {
    const checkboxes = splitThumbGrid.querySelectorAll('input[type="checkbox"][data-page]');
    checkboxes.forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        const page = Number(checkbox.getAttribute("data-page"));
        if (!Number.isInteger(page)) return;
        if (checkbox.checked) {
          selectedPages.add(page);
        } else {
          selectedPages.delete(page);
        }
        updateControls();
      });
    });
  }

  async function renderThumbGrid(pdfJsDoc) {
    splitThumbGrid.innerHTML = "";
    selectedPages = new Set();

    for (let pageNumber = 1; pageNumber <= sourcePageCount; pageNumber += 1) {
      const page = await pdfJsDoc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 0.22 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) continue;

      await page.render({
        canvasContext: context,
        viewport,
      }).promise;

      const item = document.createElement("label");
      item.className = "split-thumb-item";
      item.innerHTML = `
        <input type="checkbox" data-page="${pageNumber}" />
        <div class="split-thumb-canvas-wrap"></div>
        <span class="split-thumb-page">Page ${pageNumber}</span>
      `;
      const holder = item.querySelector(".split-thumb-canvas-wrap");
      if (holder) {
        holder.appendChild(canvas);
      }
      splitThumbGrid.appendChild(item);
    }

    attachThumbCheckboxEvents();
  }

  async function loadPdfFile(file) {
    if (file.size > MAX_FILE_BYTES) {
      throw new Error(`File is ${bytesToMb(file.size)}MB. Max allowed size is 100MB.`);
    }
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
      throw new Error("Please upload a PDF file.");
    }

    hideResults();
    clearAutoDeleteTimer();

    fileInfo.textContent = `Loading ${file.name}...`;
    fileNameEl.textContent = file.name;
    pageCountEl.textContent = "-";
    setStatus("Reading PDF...");

    const buffer = await file.arrayBuffer();
    const pdfLibDoc = await PDFLib.PDFDocument.load(buffer);
    const pdfJsDoc = await window.pdfjsLib.getDocument({ data: buffer.slice(0) }).promise;

    sourcePdfDoc = pdfLibDoc;
    sourcePdfBuffer = buffer;
    sourcePdfName = file.name;
    sourcePageCount = pdfLibDoc.getPageCount();
    pageCountEl.textContent = String(sourcePageCount);
    fileInfo.textContent = `${file.name} (${bytesToMb(file.size)}MB)`;
    setStatus("Generating page thumbnails...");

    await renderThumbGrid(pdfJsDoc);
    setStatus("Ready. Choose split option and click Split PDF.");
    updateControls();
  }

  function handleDropzoneVisual(event, isDragOver) {
    event.preventDefault();
    event.stopPropagation();
    dropzone.classList.toggle("dragover", !!isDragOver);
  }

  async function processInputFile(file) {
    try {
      await loadPdfFile(file);
    } catch (error) {
      resetSource();
      setStatus(`Load failed: ${error.message || "Unknown error"}`);
    }
  }

  function setAllPageChecks(checked) {
    const checkboxes = splitThumbGrid.querySelectorAll('input[type="checkbox"][data-page]');
    selectedPages = new Set();
    checkboxes.forEach((checkbox) => {
      checkbox.checked = checked;
      const page = Number(checkbox.getAttribute("data-page"));
      if (checked && Number.isInteger(page)) {
        selectedPages.add(page);
      }
    });
    updateControls();
  }

  function buildOutputItem(name, blob) {
    const url = URL.createObjectURL(blob);
    outputObjectUrls.push(url);

    const row = document.createElement("div");
    row.className = "split-output-row";

    const nameEl = document.createElement("span");
    nameEl.className = "split-output-name";
    nameEl.textContent = name;

    const download = document.createElement("a");
    download.className = "download split-output-download";
    download.href = url;
    download.download = name;
    download.textContent = "Download";

    row.appendChild(nameEl);
    row.appendChild(download);
    splitOutputList.appendChild(row);

    return { name, blob };
  }

  async function splitPdf() {
    if (!sourcePdfDoc) {
      setStatus("Upload a PDF first.");
      return;
    }

    let groups;
    try {
      groups = buildSplitGroups();
    } catch (error) {
      setStatus(error.message || "Invalid split options.");
      return;
    }

    hideResults();
    splitBtn.disabled = true;
    showProcessing(true);
    setStatus("Splitting PDF...");

    const baseName = sanitizeName(sourcePdfName.replace(/\.pdf$/i, "") || "split");
    const outputs = [];
    const zip = new JSZip();

    try {
      for (let i = 0; i < groups.length; i += 1) {
        const group = groups[i];
        const outDoc = await PDFLib.PDFDocument.create();
        const copied = await outDoc.copyPages(sourcePdfDoc, group.pages);
        copied.forEach((page) => outDoc.addPage(page));

        const bytes = await outDoc.save();
        const blob = new Blob([bytes], { type: "application/pdf" });
        const fileName =
          getMode() === "extract"
            ? `${baseName}-selected-pages.pdf`
            : `${baseName}-part-${i + 1}-${sanitizeName(group.label)}.pdf`;

        outputs.push(buildOutputItem(fileName, blob));
        zip.file(fileName, blob);

        const splitPercent = Math.round(((i + 1) / groups.length) * 82);
        setProgress(splitPercent, `Splitting part ${i + 1} / ${groups.length}`);
      }

      setProgress(90, "Packing ZIP...");
      const zipBlob = await zip.generateAsync(
        {
          type: "blob",
          compression: "DEFLATE",
          compressionOptions: { level: 6 },
        },
        (meta) => {
          const pct = Math.round(90 + meta.percent * 0.1);
          setProgress(pct, "Packing ZIP...");
        }
      );

      const zipUrl = URL.createObjectURL(zipBlob);
      outputObjectUrls.push(zipUrl);
      splitZipDownloadLink.href = zipUrl;
      splitZipDownloadLink.download = `${baseName}-split.zip`;
      splitZipDownloadLink.classList.remove("hidden");

      splitResultWrap.classList.remove("hidden");
      splitSuccessMsg.textContent = `Success: ${outputs.length} PDF file(s) created. Files auto-clear from memory in 10 minutes.`;
      setProgress(100, "Completed");
      setStatus("Done. Download files below.");
      scheduleAutoDelete();
    } catch (error) {
      hideResults();
      setStatus(`Split failed: ${error.message || "Unknown error"}`);
    } finally {
      showProcessing(false);
      updateControls();
    }
  }

  dropzone.addEventListener("dragenter", (event) => handleDropzoneVisual(event, true));
  dropzone.addEventListener("dragover", (event) => handleDropzoneVisual(event, true));
  dropzone.addEventListener("dragleave", (event) => handleDropzoneVisual(event, false));
  dropzone.addEventListener("drop", (event) => {
    handleDropzoneVisual(event, false);
    const files = event.dataTransfer ? event.dataTransfer.files : null;
    const file = files && files.length ? files[0] : null;
    if (!file) return;
    processInputFile(file);
  });

  fileInput.addEventListener("change", () => {
    const [file] = fileInput.files || [];
    fileInput.value = "";
    if (!file) return;
    processInputFile(file);
  });

  splitRanges.addEventListener("input", updateControls);
  splitBtn.addEventListener("click", splitPdf);
  selectAllPagesBtn.addEventListener("click", () => setAllPageChecks(true));
  clearPagesBtn.addEventListener("click", () => setAllPageChecks(false));

  document.querySelectorAll('input[name="splitMode"]').forEach((radio) => {
    radio.addEventListener("change", updateControls);
  });

  window.addEventListener("beforeunload", () => {
    clearAutoDeleteTimer();
    revokeOutputUrls();
  });

  resetSource();
  hideResults();
  showProcessing(false);
})();
