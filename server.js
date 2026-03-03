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
      reject(new Error(stderr || `Conversion command failed with code ${code}`));
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

async function compressPdfWithGhostscript(inputPath, outputPath, profile) {
  const args = [
    "-sDEVICE=pdfwrite",
    "-dCompatibilityLevel=1.4",
    "-dNOPAUSE",
    "-dQUIET",
    "-dBATCH",
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
    await runCommand("gs", args, 120000);
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(
        "Ghostscript is not installed. Install Ghostscript on the server to enable PDF compression."
      );
    }
    throw error;
  }
}

async function rasterizePdfToJpegs(inputPath, outputPattern, dpi, quality) {
  const args = [
    "-sDEVICE=jpeg",
    "-dNOPAUSE",
    "-dQUIET",
    "-dBATCH",
    `-r${dpi}`,
    `-dJPEGQ=${quality}`,
    `-sOutputFile=${outputPattern}`,
    inputPath,
  ];
  await runCommand("gs", args, 180000);
}

async function buildPdfFromImages(imagePaths, outputPath) {
  const args = [
    "-sDEVICE=pdfwrite",
    "-dNOPAUSE",
    "-dQUIET",
    "-dBATCH",
    `-sOutputFile=${outputPath}`,
    ...imagePaths,
  ];
  await runCommand("gs", args, 120000);
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
    const profiles = [
      { pdfSettings: "printer", resolution: 180, monoResolution: 300 },
      { pdfSettings: "ebook", resolution: 150, monoResolution: 240 },
      { pdfSettings: "screen", resolution: 120, monoResolution: 180 },
    ];
    if (compressionRatio < 0.75 || ultraMode) {
      profiles.push(
        { pdfSettings: "screen", resolution: 96, monoResolution: 144 },
        { pdfSettings: "screen", resolution: 72, monoResolution: 120 }
      );
    }
    if (ultraMode) {
      profiles.push(
        { pdfSettings: "screen", resolution: 60, monoResolution: 100 },
        { pdfSettings: "screen", resolution: 48, monoResolution: 72 },
        { pdfSettings: "screen", resolution: 36, monoResolution: 60 }
      );
    }

    let bestPath = null;
    let bestSize = Number.POSITIVE_INFINITY;
    let firstUnderTargetPath = null;

    for (let i = 0; i < profiles.length; i += 1) {
      const outPath = path.join(tempRoot, `compressed-${i}.pdf`);
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
    }

    if (!firstUnderTargetPath && hardRasterMode) {
      const rasterProfiles = [
        { dpi: 72, quality: 32 },
        { dpi: 60, quality: 28 },
        { dpi: 48, quality: 24 },
      ];

      for (let i = 0; i < rasterProfiles.length; i += 1) {
        const rasterDir = path.join(tempRoot, `raster-${i}`);
        await fs.mkdir(rasterDir, { recursive: true });

        const pattern = path.join(rasterDir, "page-%04d.jpg");
        await rasterizePdfToJpegs(
          inputPath,
          pattern,
          rasterProfiles[i].dpi,
          rasterProfiles[i].quality
        );

        const images = (await fs.readdir(rasterDir))
          .filter((f) => f.toLowerCase().endsWith(".jpg"))
          .sort()
          .map((f) => path.join(rasterDir, f));
        if (!images.length) {
          continue;
        }

        const outPath = path.join(tempRoot, `raster-compressed-${i}.pdf`);
        await buildPdfFromImages(images, outPath);
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
      }
    }

    const finalPath = firstUnderTargetPath || bestPath;
    if (!finalPath) {
      throw new Error("Compression failed to generate output.");
    }

    const outputName = `${path.parse(originalName).name}-compressed.pdf`;
    const data = await fs.readFile(finalPath);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=\"${outputName}\"`);
    return res.send(data);
  } catch (error) {
    return res.status(500).json({ error: error.message || "PDF compression failed." });
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => {});
  }
});

app.listen(PORT, () => {
  console.log(`DocFlex server running at http://localhost:${PORT}`);
});
