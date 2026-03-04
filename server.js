const express = require("express");
const multer = require("multer");
const path = require("path");
const os = require("os");
const fs = require("fs/promises");
const { spawn } = require("child_process");

const app = express();
const PORT = process.env.PORT || 8080;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

app.use(express.static(__dirname));

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
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
  // Keep default requests fast: 1-3 passes max.
  const quickHigh = { pdfSettings: "ebook", resolution: 150, monoResolution: 240 };
  const quickMid = { pdfSettings: "screen", resolution: 120, monoResolution: 180 };
  const quickLow = { pdfSettings: "screen", resolution: 96, monoResolution: 144 };
  const deepLow = { pdfSettings: "screen", resolution: 72, monoResolution: 120 };

  if (ultraMode) {
    return [
      quickMid,
      quickLow,
      deepLow,
      { pdfSettings: "screen", resolution: 60, monoResolution: 100 },
      { pdfSettings: "screen", resolution: 48, monoResolution: 72 },
    ];
  }

  if (compressionRatio >= 0.85) {
    return [quickHigh];
  }
  if (compressionRatio >= 0.7) {
    return [quickHigh, quickMid];
  }
  if (compressionRatio >= 0.55) {
    return [quickMid, quickLow];
  }
  return [quickLow, deepLow];
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

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "doc2pdf-"));
  const outDir = path.join(tempRoot, "out");

  try {
    await fs.mkdir(outDir, { recursive: true });

    const originalName = sanitizeFilename(req.file.originalname || "input.bin");
    const inputPath = path.join(tempRoot, originalName);
    await fs.writeFile(inputPath, req.file.buffer);

    await convertToPdfWithLibreOffice(inputPath, outDir);

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
    return res.send(data);
  } catch (error) {
    return res.status(500).json({ error: error.message || "Conversion failed." });
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => {});
  }
});

app.post("/api/compress-pdf", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded." });
  }

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
  const hardRasterMode = String(req.body.hardRasterMode || "0") === "1";

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pdf-compress-"));
  const inputPath = path.join(tempRoot, originalName);

  try {
    await fs.writeFile(inputPath, req.file.buffer);
    const originalSize = req.file.buffer.byteLength;
    if (originalSize <= targetBytes) {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=\"${path.parse(originalName).name}.pdf\"`
      );
      return res.send(req.file.buffer);
    }

    const compressionRatio = targetBytes / Math.max(1, originalSize);
    const aggressiveTarget = compressionRatio <= 0.2;
    // Keep default mode clarity-first: rasterization is only allowed when user enables Heavy Compression.
    const effectiveHardRasterMode = hardRasterMode;
    const shouldPreferRasterFirst = effectiveHardRasterMode && aggressiveTarget;
    const profiles = shouldPreferRasterFirst
      ? []
      : effectiveHardRasterMode
      ? [getFastCompressionProfiles(compressionRatio, ultraMode)[0]]
      : getFastCompressionProfiles(compressionRatio, ultraMode);

    let bestPath = null;
    let bestSize = Number.POSITIVE_INFINITY;
    let firstUnderTargetPath = null;
    let lastStepError = null;

    // Ultra-fast path: direct raster based on ratio, before any multi-pass loops.
    if (shouldPreferRasterFirst) {
      const fastDpis = pickAggressiveRasterDpis(compressionRatio);
      for (let i = 0; i < fastDpis.length; i += 1) {
        const outPath = path.join(tempRoot, `fast-raster-${i}.pdf`);
        try {
          await rasterizePdfDirectToPdf(
            inputPath,
            outPath,
            fastDpis[i],
            Math.max(8, Math.min(32, Math.floor(50 * compressionRatio))),
            "color",
            140000
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

    for (let i = 0; i < profiles.length; i += 1) {
      const outPath = path.join(tempRoot, `compressed-${i}.pdf`);
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
    const data = await fs.readFile(finalPath);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=\"${outputName}\"`);
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
    return res.send(req.file.buffer);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => {});
  }
});

app.listen(PORT, () => {
  console.log(`DocFlex server running at http://localhost:${PORT}`);
});
