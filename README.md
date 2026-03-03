# DocFlex - Document to PDF Converter

A lightweight website that converts documents to PDF.
It supports browser-side conversion for text/images and server-side conversion for Office files using LibreOffice.

## Features

- Drag and drop file upload
- Multi-photo selection: combine many images into one PDF
- Direct camera capture option (take photo and convert)
- Optional target PDF size input
- Size unit selector: `KB` or `MB`
- Convert to PDF for:
  - Text/code files (`.txt`, `.md`, `.csv`, `.json`, `.js`, `.py`, etc.)
  - Office files (`.doc/.docx/.ppt/.pptx/.xls/.xlsx/.odt/.odp/.ods`)
  - Images (`.png`, `.jpg`, `.jpeg`, `.webp`)
- Download generated PDF instantly

## Run

### 1) Install dependencies

```bash
cd doc-to-pdf-converter
npm install
```

### 2) Install LibreOffice (required for Office/PPT/Word/Excel conversion)

Make sure `soffice` is available in your terminal PATH.

### 3) Start server

```bash
npm start
```

Then open `http://localhost:8080`.

## Public Deployment (Render)

This project includes:
- `Dockerfile` (Node + LibreOffice)
- `render.yaml`

Steps:
1. Push this folder to a GitHub repository.
2. In Render, create a new **Blueprint** service from that GitHub repo.
3. Render reads `render.yaml` and deploys automatically.
4. Use the Render URL as your public site.

## Note

`pptx/word/excel` conversion is handled by LibreOffice in the backend API (`/api/convert`).
Unsupported or niche formats may still fail depending on LibreOffice support.

Target-size matching is best-effort:
- Image inputs: tries multiple compression levels to get close to the requested KB.
- Text inputs: converts normally and reports actual output size.
- Office files via server: converts and reports actual output size.
