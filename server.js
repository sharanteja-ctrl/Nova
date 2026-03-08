const express = require("express");
const multer = require("multer");
const path = require("path");
const os = require("os");
const fs = require("fs/promises");
const crypto = require("crypto");
const { spawn } = require("child_process");

const app = express();
const PORT = process.env.PORT || 8080;
const PROGRESS_TTL_MS = 2 * 60 * 1000;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";
const GEMINI_TIMEOUT_MS = 9000;
const GEMINI_MAX_IMAGE_BASE64_BYTES = 3 * 1024 * 1024;
const progressStore = new Map();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

app.use(express.static(__dirname));
app.use(express.json({ limit: "5mb" }));

app.get("/split", (req, res) => {
  res.sendFile(path.join(__dirname, "split.html"));
});

function setProgress(progressId, progress, phase, status = "processing") {
  if (!progressId) {
    return;
  }
  progressStore.set(progressId, {
    progress: Math.max(0, Math.min(100, Math.round(progress))),
    phase,
    status,
    updatedAt: Date.now(),
  });
}

function clearProgressLater(progressId, delayMs = PROGRESS_TTL_MS) {
  if (!progressId) {
    return;
  }
  setTimeout(() => {
    progressStore.delete(progressId);
  }, delayMs);
}

setInterval(() => {
  const now = Date.now();
  for (const [id, state] of progressStore.entries()) {
    if (now - state.updatedAt > PROGRESS_TTL_MS) {
      progressStore.delete(id);
    }
  }
}, 30000).unref();

app.get("/api/progress/:id", (req, res) => {
  const state = progressStore.get(req.params.id);
  res.setHeader("Cache-Control", "no-store");
  if (!state) {
    return res.json({ progress: 0, phase: "Waiting...", status: "unknown" });
  }
  return res.json(state);
});

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function parseImageDataUrl(imageDataUrl) {
  if (typeof imageDataUrl !== "string") {
    return null;
  }
  const trimmed = imageDataUrl.trim();
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([a-zA-Z0-9+/=]+)$/.exec(trimmed);
  if (!match) {
    return null;
  }
  return { mimeType: match[1], data: match[2] };
}

function clamp01(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function orderCornersClockwise(corners) {
  if (!Array.isArray(corners) || corners.length !== 4) {
    return null;
  }
  const parsed = corners.map((entry) => ({
    x: Number(entry?.x),
    y: Number(entry?.y),
  }));
  if (parsed.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
    return null;
  }
  const sums = parsed.map((point) => point.x + point.y);
  const diffs = parsed.map((point) => point.x - point.y);
  const tl = parsed[sums.indexOf(Math.min(...sums))];
  const br = parsed[sums.indexOf(Math.max(...sums))];
  const tr = parsed[diffs.indexOf(Math.max(...diffs))];
  const bl = parsed[diffs.indexOf(Math.min(...diffs))];
  return [tl, tr, br, bl];
}

function normalizeGeminiCorners(rawCorners) {
  if (!rawCorners) {
    return null;
  }
  let corners = null;
  if (Array.isArray(rawCorners)) {
    corners = rawCorners.map((entry) => {
      if (Array.isArray(entry) && entry.length >= 2) {
        return { x: Number(entry[0]), y: Number(entry[1]) };
      }
      return { x: Number(entry?.x), y: Number(entry?.y) };
    });
  } else if (
    rawCorners.topLeft &&
    rawCorners.topRight &&
    rawCorners.bottomRight &&
    rawCorners.bottomLeft
  ) {
    corners = [
      rawCorners.topLeft,
      rawCorners.topRight,
      rawCorners.bottomRight,
      rawCorners.bottomLeft,
    ].map((entry) => ({ x: Number(entry?.x), y: Number(entry?.y) }));
  }
  const ordered = orderCornersClockwise(corners);
  if (!ordered) {
    return null;
  }
  return ordered.map((point) => ({
    x: clamp01(point.x),
    y: clamp01(point.y),
  }));
}

function extractGeminiText(payload) {
  if (!payload || !Array.isArray(payload.candidates)) {
    return "";
  }
  const parts = payload.candidates[0]?.content?.parts;
  if (!Array.isArray(parts)) {
    return "";
  }
  return parts
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("\n")
    .trim();
}

function extractJsonObject(text) {
  if (!text || typeof text !== "string") {
    return null;
  }
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = (fencedMatch ? fencedMatch[1] : text).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return null;
  }
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

function normalizeGeminiDetection(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const corners = normalizeGeminiCorners(raw.corners || raw.boundingCorners || raw.points);
  const detectedValue = raw.documentDetected ?? raw.detected ?? raw.hasDocument ?? false;
  const confidenceValue = Number(raw.confidence ?? raw.score ?? 0);
  return {
    documentDetected: Boolean(detectedValue) && Boolean(corners),
    confidence: clamp01(confidenceValue),
    corners,
    advice:
      typeof raw.advice === "string"
        ? raw.advice.trim().replace(/\s+/g, " ").slice(0, 220)
        : "",
  };
}

function normalizeGeminiRotation(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const candidates = [0, 90, -90, 180, -180];
  const requested = Number(raw.rotation ?? raw.rotate ?? 0);
  const nearest = candidates.reduce((best, value) =>
    Math.abs(value - requested) < Math.abs(best - requested) ? value : best
  , 0);
  const confidenceValue = Number(raw.confidence ?? raw.score ?? 0.5);
  const reasonText =
    typeof raw.reason === "string"
      ? raw.reason.trim().replace(/\s+/g, " ").slice(0, 180)
      : "";
  return {
    rotation: nearest === -180 ? 180 : nearest,
    confidence: clamp01(confidenceValue),
    reason: reasonText,
  };
}

async function callGeminiDocDetection(imagePart) {
  const apiKey = String(process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) {
    const missingError = new Error("GEMINI_API_KEY is not set on the server.");
    missingError.status = 503;
    throw missingError;
  }

  const prompt = [
    "Detect a single paper document in this image.",
    "Return ONLY valid JSON with this exact schema:",
    '{"documentDetected": boolean, "confidence": number, "corners":[{"x":number,"y":number},{"x":number,"y":number},{"x":number,"y":number},{"x":number,"y":number}], "advice": string}',
    "Requirements:",
    "- x,y must be normalized between 0 and 1.",
    "- corners must be ordered: top-left, top-right, bottom-right, bottom-left.",
    "- If document is not found, set documentDetected false and corners to null.",
    "- Keep advice short (max 16 words).",
  ].join("\n");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    GEMINI_MODEL
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const payload = {
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt },
          {
            inline_data: {
              mime_type: imagePart.mimeType,
              data: imagePart.data,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      topP: 0.8,
      maxOutputTokens: 320,
    },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const msg =
      body?.error?.message ||
      `Gemini request failed with HTTP ${response.status}.`;
    const error = new Error(msg);
    error.status = response.status;
    throw error;
  }

  const rawText = extractGeminiText(body);
  const parsed = extractJsonObject(rawText);
  const normalized = normalizeGeminiDetection(parsed);
  if (!normalized) {
    throw new Error("Gemini response was not in the expected JSON format.");
  }
  return normalized;
}

async function callGeminiOrientation(imagePart) {
  const apiKey = String(process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) {
    const missingError = new Error("GEMINI_API_KEY is not set on the server.");
    missingError.status = 503;
    throw missingError;
  }

  const prompt = [
    "Analyze the text orientation in this scanned document image.",
    "Return ONLY valid JSON with this exact schema:",
    '{"rotation": number, "confidence": number, "reason": string}',
    "Rules:",
    "- rotation must be one of: 0, 90, -90, 180.",
    "- rotation is the correction angle needed to make text upright.",
    "- confidence must be 0..1.",
    "- Keep reason short (max 14 words).",
  ].join("\n");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    GEMINI_MODEL
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const payload = {
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt },
          {
            inline_data: {
              mime_type: imagePart.mimeType,
              data: imagePart.data,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      topP: 0.8,
      maxOutputTokens: 180,
    },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const msg = body?.error?.message || `Gemini request failed with HTTP ${response.status}.`;
    const error = new Error(msg);
    error.status = response.status;
    throw error;
  }

  const rawText = extractGeminiText(body);
  const parsed = extractJsonObject(rawText);
  const normalized = normalizeGeminiRotation(parsed);
  if (!normalized) {
    throw new Error("Gemini response was not in the expected JSON format.");
  }
  return normalized;
}

async function runCommand(command, args, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let timedOut = false;

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`Command timed out after ${Math.round(timeoutMs / 1000)}s`));
        return;
      }
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          stderr ||
            `${command} failed with code ${code}. Try a different compression mode or target size.`
        )
      );
    });
  });
}

async function convertToPdfWithLibreOffice(inputPath, outDir) {
  const args = ["--headless", "--convert-to", "pdf", "--outdir", outDir, inputPath];
  const binaries = ["soffice", "libreoffice"];

  for (const bin of binaries) {
    try {
      await runCommand(bin, args, 180000);
      return;
    } catch (error) {
      if (error.code === "ENOENT") {
        continue;
      }
      throw error;
    }
  }

  throw new Error(
    "LibreOffice is not installed or not found. Install LibreOffice and ensure 'soffice' is available in PATH."
  );
}

async function compressPdfWithGhostscript(
  inputPath,
  outputPath,
  profile,
  timeoutMs = 150000
) {
  const args = [
    "-sDEVICE=pdfwrite",
    "-dCompatibilityLevel=1.4",
    "-dNOPAUSE",
    "-dQUIET",
    "-dBATCH",
    "-dNumRenderingThreads=4",
    `-dPDFSETTINGS=/${profile.pdfSettings}`,
    "-dDownsampleColorImages=true",
    "-dDownsampleGrayImages=true",
    "-dDownsampleMonoImages=true",
    `-dColorImageResolution=${profile.resolution}`,
    `-dGrayImageResolution=${profile.resolution}`,
    `-dMonoImageResolution=${profile.monoResolution}`,
    `-sOutputFile=${outputPath}`,
    inputPath,
  ];

  try {
    await runCommand("gs", args, timeoutMs);
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(
        "Ghostscript is not installed. Install Ghostscript on the server to enable PDF compression."
      );
    }
    throw error;
  }
}

async function rasterizePdfToJpegs(
  inputPath,
  outputPattern,
  dpi,
  quality,
  timeoutMs = 120000
) {
  const args = [
    "-sDEVICE=jpeg",
    "-dNOPAUSE",
    "-dQUIET",
    "-dBATCH",
    "-dNumRenderingThreads=4",
    `-r${dpi}`,
    `-dJPEGQ=${quality}`,
    `-sOutputFile=${outputPattern}`,
    inputPath,
  ];
  await runCommand("gs", args, timeoutMs);
}

async function rasterizePdfToMonoTiffs(inputPath, outputPattern, dpi, timeoutMs = 180000) {
  const args = [
    "-sDEVICE=tiffg4",
    "-dNOPAUSE",
    "-dQUIET",
    "-dBATCH",
    "-dNumRenderingThreads=4",
    `-r${dpi}`,
    `-sOutputFile=${outputPattern}`,
    inputPath,
  ];
  await runCommand("gs", args, timeoutMs);
}

async function rasterizePdfDirectToPdf(
  inputPath,
  outputPath,
  dpi,
  quality,
  mode = "color",
  timeoutMs = 180000
) {
  const device = mode === "mono" ? "pdfimage8" : "pdfimage24";
  const args = [
    `-sDEVICE=${device}`,
    "-dNOPAUSE",
    "-dQUIET",
    "-dBATCH",
    `-r${dpi}`,
    `-sOutputFile=${outputPath}`,
    inputPath,
  ];
  if (mode !== "mono") {
    args.splice(5, 0, `-dJPEGQ=${quality}`);
  }
  await runCommand("gs", args, timeoutMs);
}

async function buildPdfFromImages(imagePaths, outputPath, timeoutMs = 90000) {
  const args = [
    "-sDEVICE=pdfwrite",
    "-dNOPAUSE",
    "-dQUIET",
    "-dBATCH",
    "-dNumRenderingThreads=4",
    `-sOutputFile=${outputPath}`,
    ...imagePaths,
  ];
  await runCommand("gs", args, timeoutMs);
}

function getFastCompressionProfiles(compressionRatio, ultraMode) {
  // Speed-first, clarity-safe: max 2 passes.
  const quickHigh = { pdfSettings: "ebook", resolution: 150, monoResolution: 230 };
  const quickMid = { pdfSettings: "screen", resolution: 124, monoResolution: 190 };
  const quickLow = { pdfSettings: "screen", resolution: 108, monoResolution: 160 };
  const ultraLow = { pdfSettings: "screen", resolution: 100, monoResolution: 150 };

  if (ultraMode) {
    if (compressionRatio < 0.35) {
      return [quickLow, ultraLow];
    }
    if (compressionRatio < 0.55) {
      return [quickMid, quickLow];
    }
    return [quickHigh, quickMid];
  }

  if (compressionRatio >= 0.8) {
    return [quickHigh];
  }
  if (compressionRatio >= 0.6) {
    return [quickMid];
  }
  return [quickLow];
}

function getFastHardRasterProfiles(ultraMode, compressionRatio) {
  // Progressively harder raster profiles for extreme size targets.
  const profiles = ultraMode
    ? [
        { dpi: 50, quality: 26 },
        { dpi: 40, quality: 22 },
        { dpi: 34, quality: 18 },
      ]
    : [
        { dpi: 50, quality: 26 },
        { dpi: 40, quality: 22 },
      ];

  if (compressionRatio <= 0.2) {
    profiles.push({ dpi: 30, quality: 14 });
  }
  if (compressionRatio <= 0.14) {
    profiles.push({ dpi: 24, quality: 10 });
  }
  if (compressionRatio <= 0.1) {
    profiles.push({ dpi: 18, quality: 8 });
    profiles.push({ dpi: 14, quality: 6 });
    profiles.push({ dpi: 10, quality: 4 });
  }

  return profiles;
}

function pickAggressiveRasterDpis(compressionRatio) {
  // Derive a DPI close to the target ratio; bias lower for speed.
  const base = Math.max(10, Math.floor(120 * Math.sqrt(Math.max(0.02, compressionRatio))));
  const dpIs = [base, Math.max(10, Math.floor(base * 0.75)), Math.max(10, Math.floor(base * 0.6))];
  // Ensure uniqueness and descending order.
  const unique = Array.from(new Set(dpIs)).sort((a, b) => b - a);
  return unique;
}

app.post("/api/convert", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded." });
  }
  const progressId = String(req.get("x-progress-id") || "").trim();

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "doc2pdf-"));
  const outDir = path.join(tempRoot, "out");

  try {
    setProgress(progressId, 8, "Received file");
    await fs.mkdir(outDir, { recursive: true });

    const originalName = sanitizeFilename(req.file.originalname || "input.bin");
    const inputPath = path.join(tempRoot, originalName);
    await fs.writeFile(inputPath, req.file.buffer);
    setProgress(progressId, 20, "Starting LibreOffice conversion");

    await convertToPdfWithLibreOffice(inputPath, outDir);
    setProgress(progressId, 78, "Preparing converted PDF");

    const inputBase = path.parse(originalName).name;
    const expectedOutput = path.join(outDir, `${inputBase}.pdf`);

    let outputPath = expectedOutput;
    try {
      await fs.access(expectedOutput);
    } catch {
      const files = await fs.readdir(outDir);
      const pdf = files.find((f) => f.toLowerCase().endsWith(".pdf"));
      if (!pdf) {
        throw new Error("Conversion finished but no PDF output was found.");
      }
      outputPath = path.join(outDir, pdf);
    }

    const outputName = `${inputBase}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=\"${outputName}\"`);

    const data = await fs.readFile(outputPath);
    setProgress(progressId, 100, "Done", "done");
    clearProgressLater(progressId);
    return res.send(data);
  } catch (error) {
    setProgress(progressId, 100, "Conversion failed", "error");
    clearProgressLater(progressId);
    return res.status(500).json({ error: error.message || "Conversion failed." });
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => {});
  }
});

app.post("/api/compress-pdf", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded." });
  }
  const progressId = String(req.get("x-progress-id") || "").trim();

  const originalName = sanitizeFilename(req.file.originalname || "input.pdf");
  const ext = path.extname(originalName).toLowerCase();
  if (ext !== ".pdf") {
    return res.status(400).json({ error: "Only PDF files are supported here." });
  }

  const targetBytes = Number(req.body.targetBytes);
  if (!Number.isFinite(targetBytes) || targetBytes <= 0) {
    return res.status(400).json({ error: "Valid targetBytes is required." });
  }
  const ultraMode = String(req.body.ultraMode || "0") === "1";

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pdf-compress-"));
  const inputPath = path.join(tempRoot, originalName);

  try {
    setProgress(progressId, 8, "Reading PDF");
    await fs.writeFile(inputPath, req.file.buffer);
    const originalSize = req.file.buffer.byteLength;
    if (originalSize <= targetBytes) {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=\"${path.parse(originalName).name}.pdf\"`
      );
      setProgress(progressId, 100, "Done", "done");
      clearProgressLater(progressId);
      return res.send(req.file.buffer);
    }

    const compressionRatio = targetBytes / Math.max(1, originalSize);
    // Raster pipeline is disabled for clarity + speed in current product behavior.
    const effectiveHardRasterMode = false;
    const profiles = getFastCompressionProfiles(compressionRatio, ultraMode);

    let bestPath = null;
    let bestSize = Number.POSITIVE_INFINITY;
    let firstUnderTargetPath = null;
    let lastStepError = null;

    for (let i = 0; i < profiles.length; i += 1) {
      const outPath = path.join(tempRoot, `compressed-${i}.pdf`);
      setProgress(
        progressId,
        18 + (i / Math.max(1, profiles.length)) * 60,
        `Compressing pass ${i + 1}/${profiles.length}`
      );
      try {
        await compressPdfWithGhostscript(inputPath, outPath, profiles[i]);
        const stat = await fs.stat(outPath);
        const currentSize = stat.size;

        if (currentSize < bestSize) {
          bestSize = currentSize;
          bestPath = outPath;
        }

        if (currentSize <= targetBytes) {
          firstUnderTargetPath = outPath;
          break;
        }
      } catch (error) {
        lastStepError = error;
      }
    }

    if (!firstUnderTargetPath && effectiveHardRasterMode) {
      const rasterProfiles = getFastHardRasterProfiles(ultraMode, compressionRatio);

      for (let i = 0; i < rasterProfiles.length; i += 1) {
        try {
          const outPath = path.join(tempRoot, `raster-compressed-${i}.pdf`);
          await rasterizePdfDirectToPdf(
            inputPath,
            outPath,
            rasterProfiles[i].dpi,
            rasterProfiles[i].quality,
            "color",
            shouldPreferRasterFirst ? 220000 : 160000
          );
          const stat = await fs.stat(outPath);
          const currentSize = stat.size;

          if (currentSize < bestSize) {
            bestSize = currentSize;
            bestPath = outPath;
          }

          if (currentSize <= targetBytes) {
            firstUnderTargetPath = outPath;
            break;
          }
        } catch (error) {
          lastStepError = error;
          continue;
        }
      }
    }

    // Final squeeze pass is only for Heavy Compression mode because very low resolutions can blur content.
    if (!firstUnderTargetPath && bestPath && effectiveHardRasterMode) {
      const squeezeProfiles = [
        { pdfSettings: "screen", resolution: 36, monoResolution: 60 },
        { pdfSettings: "screen", resolution: 24, monoResolution: 40 },
      ];
      for (let i = 0; i < squeezeProfiles.length; i += 1) {
        const squeezedPath = path.join(tempRoot, `squeezed-${i}.pdf`);
        try {
          await compressPdfWithGhostscript(
            bestPath,
            squeezedPath,
            squeezeProfiles[i],
            180000
          );
          const stat = await fs.stat(squeezedPath);
          const currentSize = stat.size;
          if (currentSize < bestSize) {
            bestSize = currentSize;
            bestPath = squeezedPath;
          }
          if (currentSize <= targetBytes) {
            firstUnderTargetPath = squeezedPath;
            break;
          }
        } catch (error) {
          lastStepError = error;
        }
      }
    }

    // Absolute last-pass clamp for hard/ultra requests: keep reducing until under target.
    if (!firstUnderTargetPath && bestPath && effectiveHardRasterMode) {
      const clampProfiles = [
        { dpi: 12, quality: 5 },
        { dpi: 9, quality: 4 },
        { dpi: 7, quality: 3 },
      ];
      for (let i = 0; i < clampProfiles.length; i += 1) {
        try {
          const outPath = path.join(tempRoot, `clamp-compressed-${i}.pdf`);
          await rasterizePdfDirectToPdf(
            bestPath,
            outPath,
            clampProfiles[i].dpi,
            clampProfiles[i].quality,
            "color",
            180000
          );
          const stat = await fs.stat(outPath);
          const currentSize = stat.size;
          if (currentSize < bestSize) {
            bestSize = currentSize;
            bestPath = outPath;
          }
          if (currentSize <= targetBytes) {
            firstUnderTargetPath = outPath;
            break;
          }
        } catch (error) {
          lastStepError = error;
        }
      }
    }

    // Monochrome final fallback for scanned/text-heavy files.
    if (!firstUnderTargetPath && bestPath && effectiveHardRasterMode) {
      const monoDpis = [100, 80, 64, 50];
      for (let i = 0; i < monoDpis.length; i += 1) {
        try {
          const outPath = path.join(tempRoot, `mono-compressed-${i}.pdf`);
          await rasterizePdfDirectToPdf(
            bestPath,
            outPath,
            monoDpis[i],
            0,
            "mono",
            180000
          );
          const stat = await fs.stat(outPath);
          const currentSize = stat.size;
          if (currentSize < bestSize) {
            bestSize = currentSize;
            bestPath = outPath;
          }
          if (currentSize <= targetBytes) {
            firstUnderTargetPath = outPath;
            break;
          }
        } catch (error) {
          lastStepError = error;
        }
      }
    }

    const finalPath = firstUnderTargetPath || bestPath;
    if (!finalPath) {
      throw (
        lastStepError ||
        new Error("Compression failed to generate output. Try enabling Ultra mode.")
      );
    }

    const outputName = `${path.parse(originalName).name}-compressed.pdf`;
    setProgress(progressId, 92, "Preparing output");
    const data = await fs.readFile(finalPath);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=\"${outputName}\"`);
    setProgress(progressId, 100, "Done", "done");
    clearProgressLater(progressId);
    return res.send(data);
  } catch (error) {
    const fallbackName = `${path.parse(originalName).name}-original.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("X-Compression-Fallback", "1");
    res.setHeader(
      "X-Compression-Reason",
      String(error.message || "compression-failed").replace(/[\r\n]/g, " ").slice(0, 180)
    );
    res.setHeader("Content-Disposition", `attachment; filename=\"${fallbackName}\"`);
    setProgress(progressId, 100, "Returned original file", "fallback");
    clearProgressLater(progressId);
    return res.send(req.file.buffer);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => {});
  }
});

app.post("/api/gemini-doc-detect", async (req, res) => {
  const apiKey = String(process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) {
    return res.status(503).json({
      error:
        "Gemini is not configured on this server. Set GEMINI_API_KEY in environment variables.",
    });
  }

  const imageDataUrl = req.body?.imageDataUrl;
  const imagePart = parseImageDataUrl(imageDataUrl);
  if (!imagePart) {
    return res.status(400).json({
      error:
        "Invalid imageDataUrl. Send a base64 data URL (data:image/jpeg;base64,...)",
    });
  }
  if (imagePart.data.length > GEMINI_MAX_IMAGE_BASE64_BYTES) {
    return res.status(413).json({ error: "Image is too large for Gemini assist." });
  }

  try {
    const detection = await callGeminiDocDetection(imagePart);
    return res.json({
      source: "gemini",
      model: GEMINI_MODEL,
      ...detection,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      return res.status(504).json({ error: "Gemini request timed out." });
    }
    if (error?.status === 401 || error?.status === 403) {
      return res.status(502).json({
        error: "Gemini authentication failed. Verify GEMINI_API_KEY in the server settings.",
      });
    }
    if (error?.status === 429) {
      return res.status(429).json({
        error: "Gemini quota/rate limit reached. Try again or check billing/quota.",
      });
    }
    return res.status(502).json({
      error: error?.message || "Gemini document detection failed.",
    });
  }
});

app.post("/api/gemini-orientation", async (req, res) => {
  const apiKey = String(process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) {
    return res.status(503).json({
      error:
        "Gemini is not configured on this server. Set GEMINI_API_KEY in environment variables.",
    });
  }

  const imageDataUrl = req.body?.imageDataUrl;
  const imagePart = parseImageDataUrl(imageDataUrl);
  if (!imagePart) {
    return res.status(400).json({
      error:
        "Invalid imageDataUrl. Send a base64 data URL (data:image/jpeg;base64,...)",
    });
  }
  if (imagePart.data.length > GEMINI_MAX_IMAGE_BASE64_BYTES) {
    return res.status(413).json({ error: "Image is too large for orientation analysis." });
  }

  try {
    const result = await callGeminiOrientation(imagePart);
    return res.json({
      source: "gemini",
      model: GEMINI_MODEL,
      ...result,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      return res.status(504).json({ error: "Gemini request timed out." });
    }
    if (error?.status === 401 || error?.status === 403) {
      return res.status(502).json({
        error: "Gemini authentication failed. Verify GEMINI_API_KEY in the server settings.",
      });
    }
    if (error?.status === 429) {
      return res.status(429).json({
        error: "Gemini quota/rate limit reached. Try again or check billing/quota.",
      });
    }
    return res.status(502).json({
      error: error?.message || "Gemini orientation analysis failed.",
    });
  }
});

app.listen(PORT, () => {
  console.log(`DocFlex server running at http://localhost:${PORT}`);
});
