# Nova Converter

A lightweight website that converts documents to PDF.
It supports browser-side conversion for text/images and server-side conversion for Office files using LibreOffice.

## Live Website

- https://nova-converter.onrender.com/

## Features

- Drag and drop file upload
- Multi-photo selection: combine many images into one PDF
- Direct camera capture option (take photo and convert)
- Optional target PDF size input with `KB`/`MB` unit selector
- Convert to PDF for:
  - Text/code files (`.txt`, `.md`, `.csv`, `.json`, `.js`, `.py`, etc.)
  - Office files (`.doc/.docx/.ppt/.pptx/.xls/.xlsx/.odt/.odp/.ods`)
  - Images (`.png`, `.jpg`, `.jpeg`, `.webp`)
- Compress uploaded PDFs to a target size (`KB`/`MB`) using clarity-safe Heavy Compression (no raster blur)
- Cinematic progress bar with live server progress polling and preview-before-download option
- PWA ready: installable across desktop and mobile
- Download generated PDF instantly
- Interactive Knowledge Map + AI Chat for PDFs (`/pdf-chat.html`)

## Run

### 1) Install dependencies

```bash
cd doc-to-pdf-converter
npm install
```

### 2) Install Ghostscript + LibreOffice (required for compression and Office/PPT/Word/Excel conversion)

```bash
brew install ghostscript libreoffice      # macOS (Homebrew)
sudo apt-get install -y ghostscript libreoffice libreoffice-writer libreoffice-calc libreoffice-impress   # Debian/Ubuntu
```

Make sure `gs` and `soffice` are available in your terminal PATH.

### 3) Start server

```bash
export OPENAI_API_KEY=your_openai_api_key
npm start
```

Then open `http://localhost:8080`.

## Install as App (Mac, iPhone, Android, Windows)

Nova Converter is now configured as a PWA, so users can install it like an app.

- Mac (Safari): open site -> Share -> `Add to Dock`.
- Mac/Windows (Chrome/Edge): open site -> Install icon in address bar -> `Install`.
- Android (Chrome): open site -> menu -> `Install app` / `Add to Home screen`.
- iPhone (Safari): open site -> Share -> `Add to Home Screen`.

## Public Deployment (Render)

This project includes:
- `Dockerfile` (Node + LibreOffice)
- `render.yaml`

Steps:
1. Push this folder to a GitHub repository.
2. In Render, create a new **Blueprint** service from that GitHub repo.
3. Render reads `render.yaml` and deploys automatically.
4. Use the Render URL as your public site.
5. In Render service environment, set `OPENAI_API_KEY` (required for AI chat answers and AI knowledge-map generation), then redeploy.

## Note

`pptx/word/excel` conversion is handled by LibreOffice in the backend API (`/api/convert`).
Unsupported or niche formats may still fail depending on LibreOffice support.
PDF compression is handled by Ghostscript in `/api/compress-pdf`.

Target-size matching is best-effort:
- Image inputs: tries multiple compression levels to get close to the requested KB.
- Text inputs: converts normally and reports actual output size.
- Office files via server: converts and reports actual output size.
