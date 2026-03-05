const express = require("express");
const multer = require("multer");
const path = require("path");
const os = require("os");
const fs = require("fs/promises");
const crypto = require("crypto");
const { spawn } = require("child_process");
const pdfParse = require("pdf-parse");

const app = express();
const PORT = process.env.PORT || 8080;
const PROGRESS_TTL_MS = 2 * 60 * 1000;
const CHAT_DOC_TTL_MS = 20 * 60 * 1000;
const MAX_CHAT_FILE_BYTES = 50 * 1024 * 1024;
const CHAT_MAX_CHUNKS = 220;
const progressStore = new Map();
const chatDocs = new Map();
const chatDocTimers = new Map();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

app.use(express.static(__dirname));
app.use(express.json({ limit: "1mb" }));

app.get("/split", (req, res) => {
  res.sendFile(path.join(__dirname, "split.html"));
});

app.get("/pdf-chat", (req, res) => {
  res.sendFile(path.join(__dirname, "pdf-chat.html"));
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

function ensureOpenAiApiKey() {
  const key = String(process.env.OPENAI_API_KEY || "").trim();
  if (!key) {
    throw new Error("OPENAI_API_KEY is missing on the server.");
  }
  return key;
}

function clearChatDocTimer(docId) {
  const existing = chatDocTimers.get(docId);
  if (existing) {
    clearTimeout(existing);
    chatDocTimers.delete(docId);
  }
}

function deleteChatDoc(docId) {
  clearChatDocTimer(docId);
  chatDocs.delete(docId);
}

function scheduleChatDocExpiry(docId, delayMs = CHAT_DOC_TTL_MS) {
  clearChatDocTimer(docId);
  const timer = setTimeout(() => {
    deleteChatDoc(docId);
  }, delayMs);
  chatDocTimers.set(docId, timer);
}

function touchChatDoc(doc) {
  if (!doc) return null;
  doc.updatedAt = Date.now();
  scheduleChatDocExpiry(doc.id);
  return doc;
}

setInterval(() => {
  const now = Date.now();
  for (const [docId, doc] of chatDocs.entries()) {
    if (now - (doc.updatedAt || doc.createdAt || now) > CHAT_DOC_TTL_MS) {
      deleteChatDoc(docId);
    }
  }
}, 45000).unref();

function cosineSimilarity(vecA, vecB) {
  if (!Array.isArray(vecA) || !Array.isArray(vecB) || vecA.length !== vecB.length) {
    return 0;
  }
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < vecA.length; i += 1) {
    const a = Number(vecA[i]) || 0;
    const b = Number(vecB[i]) || 0;
    dot += a * b;
    magA += a * a;
    magB += b * b;
  }
  if (magA === 0 || magB === 0) {
    return 0;
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function normalizeSpaces(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function tokenize(value) {
  return normalizeSpaces(value)
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length >= 3);
}

function keywordOverlapScore(question, content) {
  const qTokens = tokenize(question);
  if (!qTokens.length) return 0;
  const contentTokens = new Set(tokenize(content));
  let hits = 0;
  for (const token of qTokens) {
    if (contentTokens.has(token)) {
      hits += 1;
    }
  }
  return hits / qTokens.length;
}

function chunkPageText(text, pageNumber, maxChars = 1100, overlap = 180) {
  const clean = normalizeSpaces(text);
  if (!clean) return [];

  if (clean.length <= maxChars) {
    return [{ page: pageNumber, text: clean }];
  }

  const chunks = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(clean.length, start + maxChars);
    if (end < clean.length) {
      const sentenceBreak = clean.lastIndexOf(". ", end);
      const wordBreak = clean.lastIndexOf(" ", end);
      const preferred = sentenceBreak > start + maxChars * 0.58 ? sentenceBreak + 1 : wordBreak;
      if (preferred > start + maxChars * 0.45) {
        end = preferred;
      }
    }

    const chunkText = clean.slice(start, end).trim();
    if (chunkText) {
      chunks.push({ page: pageNumber, text: chunkText });
    }

    if (end >= clean.length) break;
    start = Math.max(end - overlap, start + 1);
  }

  return chunks;
}

function makeOpenAiHeaders() {
  return {
    Authorization: `Bearer ${ensureOpenAiApiKey()}`,
    "Content-Type": "application/json",
  };
}

async function openAiEmbeddings(texts) {
  const safeTexts = texts.map((value) => normalizeSpaces(value).slice(0, 3500));
  const vectors = [];

  const batchSize = 32;
  for (let i = 0; i < safeTexts.length; i += batchSize) {
    const batch = safeTexts.slice(i, i + batchSize);
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: makeOpenAiHeaders(),
      body: JSON.stringify({
        model: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
        input: batch,
      }),
    });

    if (!response.ok) {
      let detail = "";
      try {
        detail = (await response.text()).slice(0, 240);
      } catch {
        detail = "";
      }
      throw new Error(`Embedding request failed (${response.status}). ${detail}`);
    }

    const json = await response.json();
    const data = Array.isArray(json.data) ? json.data : [];
    data.forEach((entry) => {
      vectors.push(entry.embedding || []);
    });
  }
  return vectors;
}

async function openAiAnswer({ question, contextChunks, history = [] }) {
  const context = contextChunks
    .map(
      (chunk, index) =>
        `[Source ${index + 1} | Page ${chunk.page}]\n${chunk.text}`
    )
    .join("\n\n");

  const systemPrompt = [
    "You are Nova PDF Chat.",
    "Answer ONLY from the provided PDF context.",
    "If the context does not contain the answer, say exactly: I couldn't find that in this PDF.",
    "Keep responses clear and concise.",
    "End every answer with a short 'Sources: p.X, p.Y' line based on context pages.",
  ].join(" ");

  const normalizedHistory = Array.isArray(history)
    ? history
        .filter((item) => item && (item.role === "user" || item.role === "assistant"))
        .slice(-8)
        .map((item) => ({
          role: item.role,
          content: String(item.content || "").slice(0, 1200),
        }))
    : [];

  const messages = [
    { role: "system", content: systemPrompt },
    ...normalizedHistory,
    {
      role: "user",
      content: [
        `Question: ${question}`,
        "",
        "PDF Context:",
        context,
      ].join("\n"),
    },
  ];

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: makeOpenAiHeaders(),
    body: JSON.stringify({
      model: process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini",
      temperature: 0.2,
      messages,
    }),
  });

  if (!response.ok) {
    let detail = "";
    try {
      detail = (await response.text()).slice(0, 320);
    } catch {
      detail = "";
    }
    throw new Error(`AI response failed (${response.status}). ${detail}`);
  }

  const json = await response.json();
  const answer = String(
    json?.choices?.[0]?.message?.content || "I couldn't find that in this PDF."
  ).trim();

  return answer;
}

function pickTopChunks(doc, question, questionEmbedding, topK = 6) {
  const scored = doc.chunks.map((chunk) => {
    const lexical = keywordOverlapScore(question, chunk.text);
    const semantic =
      questionEmbedding && Array.isArray(chunk.embedding)
        ? cosineSimilarity(questionEmbedding, chunk.embedding)
        : 0;
    const score = questionEmbedding ? semantic * 0.84 + lexical * 0.16 : lexical;
    return { ...chunk, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, topK);
  if (top.every((entry) => entry.score <= 0)) {
    return doc.chunks.slice(0, Math.min(topK, doc.chunks.length));
  }
  return top;
}

async function extractPdfPages(buffer) {
  const pages = [];
  let pageIndex = 0;
  const parseOptions = {
    pagerender: async (pageData) => {
      pageIndex += 1;
      const textContent = await pageData.getTextContent({
        normalizeWhitespace: true,
        disableCombineTextItems: false,
      });
      const pageText = textContent.items
        .map((item) => item.str || "")
        .join(" ");
      const normalized = normalizeSpaces(pageText);
      pages.push({ page: pageIndex, text: normalized });
      return normalized;
    },
  };

  const parsed = await pdfParse(buffer, parseOptions);
  return {
    pageCount: Number(parsed?.numpages || pages.length || 0),
    pages,
  };
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

app.post("/api/pdf-chat/upload", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No PDF uploaded." });
  }

  const progressId = String(req.get("x-progress-id") || "").trim();
  const originalName = sanitizeFilename(req.file.originalname || "document.pdf");
  const extension = path.extname(originalName).toLowerCase();
  const mimeType = String(req.file.mimetype || "").toLowerCase();

  if (req.file.size > MAX_CHAT_FILE_BYTES) {
    return res
      .status(400)
      .json({ error: "File is too large. Max allowed size for AI PDF Chat is 50MB." });
  }
  if (extension !== ".pdf" && mimeType !== "application/pdf") {
    return res.status(400).json({ error: "Only PDF files are supported." });
  }

  try {
    setProgress(progressId, 6, "Reading PDF");
    const parsed = await extractPdfPages(req.file.buffer);
    if (!parsed.pageCount) {
      throw new Error("Could not detect pages in this PDF.");
    }

    setProgress(progressId, 34, "Extracting text");
    let chunks = [];
    parsed.pages.forEach((pageEntry) => {
      chunks.push(...chunkPageText(pageEntry.text, pageEntry.page));
    });
    chunks = chunks.filter((entry) => normalizeSpaces(entry.text).length > 0);
    if (!chunks.length) {
      throw new Error("No readable text found in this PDF.");
    }

    if (chunks.length > CHAT_MAX_CHUNKS) {
      const groupSize = Math.ceil(chunks.length / CHAT_MAX_CHUNKS);
      const compactChunks = [];
      for (let i = 0; i < chunks.length; i += groupSize) {
        const group = chunks.slice(i, i + groupSize);
        const mergedText = normalizeSpaces(group.map((item) => item.text).join(" "));
        compactChunks.push({
          page: group[0].page,
          pageEnd: group[group.length - 1].page,
          text: mergedText,
        });
      }
      chunks = compactChunks;
    }

    let embeddingWarning = null;
    if (process.env.OPENAI_API_KEY) {
      try {
        setProgress(progressId, 62, "Building semantic index");
        const vectors = await openAiEmbeddings(chunks.map((item) => item.text));
        chunks = chunks.map((item, index) => ({
          ...item,
          embedding: vectors[index] || null,
        }));
      } catch (error) {
        embeddingWarning = `Semantic index fallback: ${error.message}`;
      }
    } else {
      embeddingWarning = "OPENAI_API_KEY missing; semantic retrieval will use keyword fallback.";
    }

    const docId = crypto.randomUUID();
    const now = Date.now();
    const doc = {
      id: docId,
      fileName: originalName,
      fileSize: req.file.size,
      pageCount: parsed.pageCount,
      chunks,
      createdAt: now,
      updatedAt: now,
      lastSummary: "",
    };

    chatDocs.set(docId, doc);
    scheduleChatDocExpiry(docId);

    setProgress(progressId, 100, "Ready", "done");
    clearProgressLater(progressId);

    return res.json({
      docId,
      fileName: originalName,
      pageCount: parsed.pageCount,
      chunkCount: chunks.length,
      expiresInSeconds: Math.floor(CHAT_DOC_TTL_MS / 1000),
      warning: embeddingWarning,
    });
  } catch (error) {
    setProgress(progressId, 100, "Upload failed", "error");
    clearProgressLater(progressId);
    return res.status(500).json({ error: error.message || "Failed to process PDF." });
  }
});

app.post("/api/pdf-chat/ask", async (req, res) => {
  try {
    ensureOpenAiApiKey();
    const docId = String(req.body?.docId || "").trim();
    const question = normalizeSpaces(req.body?.question || "");
    const history = Array.isArray(req.body?.history) ? req.body.history : [];

    if (!docId) {
      return res.status(400).json({ error: "docId is required." });
    }
    if (!question) {
      return res.status(400).json({ error: "Question is required." });
    }
    if (question.length > 2000) {
      return res.status(400).json({ error: "Question is too long." });
    }

    const doc = touchChatDoc(chatDocs.get(docId));
    if (!doc) {
      return res
        .status(404)
        .json({ error: "Document not found or expired. Please upload again." });
    }

    const hasSemanticVectors = doc.chunks.some((chunk) => Array.isArray(chunk.embedding));
    let queryEmbedding = null;
    if (hasSemanticVectors) {
      try {
        queryEmbedding = (await openAiEmbeddings([question]))[0] || null;
      } catch {
        queryEmbedding = null;
      }
    }

    const topChunks = pickTopChunks(doc, question, queryEmbedding, 6);
    const answer = await openAiAnswer({
      question,
      contextChunks: topChunks,
      history,
    });

    const sources = topChunks.slice(0, 4).map((chunk, index) => ({
      id: `${doc.id}-src-${index + 1}`,
      page: chunk.page,
      pageEnd: chunk.pageEnd || chunk.page,
      quote: chunk.text.slice(0, 280),
    }));

    return res.json({
      answer,
      sources,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to answer question." });
  }
});

app.post("/api/pdf-chat/summary", async (req, res) => {
  try {
    ensureOpenAiApiKey();
    const docId = String(req.body?.docId || "").trim();
    if (!docId) {
      return res.status(400).json({ error: "docId is required." });
    }

    const doc = touchChatDoc(chatDocs.get(docId));
    if (!doc) {
      return res
        .status(404)
        .json({ error: "Document not found or expired. Please upload again." });
    }

    const topChunks = doc.chunks.slice(0, Math.min(12, doc.chunks.length));
    const summary = await openAiAnswer({
      question:
        "Summarize this PDF clearly with key points and important dates. Use concise bullets.",
      contextChunks: topChunks,
      history: [],
    });

    doc.lastSummary = summary;
    touchChatDoc(doc);

    return res.json({
      summary,
      fileName: doc.fileName,
      pageCount: doc.pageCount,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to generate summary." });
  }
});

app.delete("/api/pdf-chat/:docId", (req, res) => {
  const docId = String(req.params.docId || "").trim();
  if (!docId) {
    return res.status(400).json({ error: "docId is required." });
  }
  deleteChatDoc(docId);
  return res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`DocFlex server running at http://localhost:${PORT}`);
});
