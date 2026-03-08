# 🚀 Nova Converter

<p align="center">
  <img src="assets/logos/nova-logo.png" alt="Nova Converter Logo" width="220" />
</p>

<p align="center"><strong>⚡ Fast document conversion, 📉 PDF compression, ✂️ split & merge, and 📷 camera scan workflow in one web app.</strong></p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-Express-111827?style=for-the-badge&logo=node.js&logoColor=7ee787" alt="Node Express" />
  <img src="https://img.shields.io/badge/PWA-Installable-111827?style=for-the-badge&logo=pwa&logoColor=9be9a8" alt="PWA" />
  <img src="https://img.shields.io/badge/Deploy-Render-111827?style=for-the-badge&logo=render&logoColor=46e3b7" alt="Render" />
</p>

## 🌐 Live App
- [nova-converter.onrender.com](https://nova-converter.onrender.com/)

## ✨ What It Does
- ✅ Convert files to PDF (images, text/code files, Office docs)
- ✅ Compress PDF with target size (`KB` / `MB`)
- ✅ Merge multiple PDFs into one
- ✅ Split a PDF by page, range, or selected pages
- ✅ Camera capture + scan editing flow
- ✅ Preview before download
- ✅ Mobile-ready responsive UI

## 🧰 Feature Snapshot
| Tool | Description |
|---|---|
| 📉 Compress PDF | Reduce file size with target `KB/MB` input and heavy mode option |
| 🔁 Convert to PDF | Convert docs/images/text to PDF quickly |
| 🧩 Merge PDF | Combine multiple PDFs in custom order |
| ✂️ Split PDF | Split every page, by ranges, or selected pages |
| 📷 Camera Scan | Capture multiple pages and edit before export |

## 📂 Supported Inputs
- **PDF**: compression, split, merge
- **Office**: `.doc`, `.docx`, `.ppt`, `.pptx`, `.xls`, `.xlsx`, `.odt`, `.ods`, `.odp`
- **Images**: `.png`, `.jpg`, `.jpeg`, `.webp`
- **Text/Code**: `.txt`, `.md`, `.csv`, `.json`, `.js`, `.ts`, `.py`, and more

## 🛠️ Local Setup

### 1) Install dependencies 📦
```bash
cd doc-to-pdf-converter
npm install
```

### 2) Install system tools (required for Office conversion + PDF compression) ⚙️
```bash
# macOS (Homebrew)
brew install ghostscript libreoffice

# Debian/Ubuntu
sudo apt-get install -y ghostscript libreoffice libreoffice-writer libreoffice-calc libreoffice-impress
```

### 3) Start server ▶️
```bash
npm start
```

Open: `http://localhost:8080`

### Optional: Gemini-assisted camera detection 🤖
```bash
export GEMINI_API_KEY=your_key_here
# optional
export GEMINI_MODEL=gemini-1.5-flash
```

## 📲 PWA Install
- **Mac (Safari)**: Share -> `Add to Dock`
- **Chrome/Edge (Desktop)**: Install icon in address bar
- **Android (Chrome)**: Menu -> `Install app`
- **iPhone (Safari)**: Share -> `Add to Home Screen`

## 🚀 Deploy on Render
This repo already includes:
- `Dockerfile`
- `render.yaml`

Steps:
1. Push this repo to GitHub.
2. In Render, create a new **Blueprint** service.
3. Select this repo.
4. Render reads `render.yaml` and deploys.

## 🗂️ Project Structure
```text
doc-to-pdf-converter/
├── assets/
│   ├── logos/
│   └── tools/
├── index.html
├── split.html
├── merge.html
├── app.js
├── split.js
├── merge.js
├── styles.css
├── server.js
├── service-worker.js
└── render.yaml
```

## 🔌 API Endpoints
- `POST /api/convert` - convert file to PDF
- `POST /api/compress-pdf` - compress PDF to target size
- `GET /api/progress/:id` - conversion progress
- `POST /api/gemini-doc-detect` - optional AI doc edge assist
- `POST /api/gemini-orientation` - optional AI orientation assist

## 📝 Notes
- Office conversion uses **LibreOffice** (`soffice`) server-side.
- Compression uses **Ghostscript** (`gs`) server-side.
- Target size matching is best-effort for difficult files.

## 📄 License
Personal project by **Sharan Teja** for Nova Converter.
