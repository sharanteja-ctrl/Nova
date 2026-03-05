(() => {
  const pdfjsLib = window["pdfjs-dist/build/pdf"];
  if (!pdfjsLib) {
    return;
  }

  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";

  const d3 = window.d3 || null;

  const dropzone = document.getElementById("chatDropzone");
  const fileInput = document.getElementById("chatFileInput");
  const uploadInfo = document.getElementById("chatUploadInfo");
  const uploadProgressWrap = document.getElementById("chatUploadProgressWrap");
  const progressLabel = document.getElementById("chatProgressLabel");
  const progressPercent = document.getElementById("chatProgressPercent");
  const progressBar = document.getElementById("chatProgressBar");
  const fileNameEl = document.getElementById("chatFileName");
  const pageCountEl = document.getElementById("chatPageCount");
  const previewControls = document.getElementById("chatPreviewControls");
  const prevPageBtn = document.getElementById("chatPrevPageBtn");
  const nextPageBtn = document.getElementById("chatNextPageBtn");
  const pageIndicator = document.getElementById("chatPageIndicator");
  const previewWrap = document.getElementById("chatPreviewWrap");
  const pdfCanvas = document.getElementById("chatPdfCanvas");
  const mapRefreshBtn = document.getElementById("mapRefreshBtn");
  const mapStatus = document.getElementById("mapStatus");
  const mapCanvasWrap = document.getElementById("knowledgeMapCanvas");
  const nodeInfoWrap = document.getElementById("knowledgeNodeInfo");
  const chatMessages = document.getElementById("chatMessages");
  const chatTyping = document.getElementById("chatTyping");
  const chatForm = document.getElementById("chatForm");
  const chatInput = document.getElementById("chatInput");
  const chatSendBtn = document.getElementById("chatSendBtn");
  const summaryBtn = document.getElementById("chatSummaryBtn");
  const clearBtn = document.getElementById("chatClearBtn");
  const statusEl = document.getElementById("chatStatus");
  const quickPromptButtons = Array.from(document.querySelectorAll(".chat-quick-chip"));

  if (!dropzone || !fileInput || !chatMessages || !chatForm) {
    return;
  }

  const initialMessage =
    'Upload a PDF to begin. You can ask: "Summarize this document", "Explain chapter 2", or "Extract important dates."';

  let currentDocId = "";
  let currentFile = null;
  let currentPdfUrl = "";
  let pdfDoc = null;
  let totalPages = 0;
  let currentPage = 1;
  let renderToken = 0;
  let chatHistory = [];
  let askInFlight = false;

  let currentMapData = null;
  let selectedNodeId = "";
  const expandedNodeIds = new Set();
  let mapResizeObserver = null;

  function setStatus(message, isError = false) {
    statusEl.textContent = message;
    statusEl.style.color = isError ? "#ff9c9c" : "";
  }

  function setMapStatus(message, isError = false) {
    mapStatus.textContent = message;
    mapStatus.style.color = isError ? "#ff9c9c" : "";
  }

  function setUploadProgress(percent, label) {
    const clamped = Math.max(0, Math.min(100, Math.round(percent)));
    progressBar.style.width = `${clamped}%`;
    progressPercent.textContent = `${clamped}%`;
    if (label) {
      progressLabel.textContent = label;
    }
  }

  function showUploadProgress(show) {
    uploadProgressWrap.classList.toggle("hidden", !show);
  }

  function resetMapArea() {
    currentMapData = null;
    selectedNodeId = "";
    expandedNodeIds.clear();
    mapCanvasWrap.innerHTML = "";
    nodeInfoWrap.innerHTML =
      '<p class="node-empty">Click a node to view explanation, jump to source page, and expand related subtopics.</p>';
  }

  function resetChatMessages() {
    chatMessages.innerHTML = "";
    appendChatBubble("ai", initialMessage, []);
    chatHistory = [];
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatPages(source) {
    if (!source) return "";
    if (source.pageEnd && source.pageEnd !== source.page) {
      return `p.${source.page}-${source.pageEnd}`;
    }
    return `p.${source.page || 1}`;
  }

  function appendChatBubble(role, content, sources) {
    const bubble = document.createElement("div");
    bubble.className = `chat-bubble ${role === "user" ? "chat-bubble-user" : "chat-bubble-ai"}`;

    const text = document.createElement("div");
    text.className = "chat-bubble-text";
    text.innerHTML = escapeHtml(content).replace(/\n/g, "<br>");
    bubble.appendChild(text);

    if (Array.isArray(sources) && sources.length) {
      const sourceWrap = document.createElement("div");
      sourceWrap.className = "chat-source-list";
      sources.forEach((source) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "chat-source-chip";
        button.dataset.page = String(source.page || 1);
        button.title = source.quote || "";
        button.textContent = formatPages(source);
        sourceWrap.appendChild(button);
      });
      bubble.appendChild(sourceWrap);
    }

    chatMessages.appendChild(bubble);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function setTyping(typing) {
    chatTyping.classList.toggle("hidden", !typing);
  }

  function setAskInFlight(active) {
    askInFlight = Boolean(active);
    refreshControlState();
    quickPromptButtons.forEach((button) => {
      button.disabled = askInFlight;
    });
  }

  function refreshControlState() {
    const ready = Boolean(currentDocId);
    if (chatSendBtn) {
      chatSendBtn.disabled = askInFlight || !ready;
    }
    if (summaryBtn) {
      summaryBtn.disabled = !ready;
    }
    if (mapRefreshBtn) {
      mapRefreshBtn.disabled = !ready;
    }
  }

  function randomProgressId() {
    const rand = Math.random().toString(36).slice(2, 10);
    return `pdfchat-${Date.now()}-${rand}`;
  }

  function readJsonResponse(xhr) {
    if (xhr.response && typeof xhr.response === "object") {
      return xhr.response;
    }
    try {
      return JSON.parse(xhr.responseText || "{}");
    } catch {
      return {};
    }
  }

  function startProgressPolling(progressId, onProgress) {
    let stopped = false;
    const poll = async () => {
      if (stopped) return;
      try {
        const response = await fetch(`/api/progress/${encodeURIComponent(progressId)}`, {
          cache: "no-store",
        });
        const json = await response.json();
        onProgress(json);
      } catch {
        // ignore transient poll issues
      }
      if (!stopped) {
        setTimeout(poll, 420);
      }
    };
    poll();
    return () => {
      stopped = true;
    };
  }

  function uploadPdfWithProgress(file) {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append("file", file);
      const progressId = randomProgressId();

      setUploadProgress(1, "Uploading PDF...");
      showUploadProgress(true);

      const stopPolling = startProgressPolling(progressId, (progressState) => {
        const progressValue = Number(progressState?.progress || 0);
        if (progressValue > 0) {
          setUploadProgress(progressValue, progressState?.phase || "Processing PDF...");
        }
      });

      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/pdf-chat/upload");
      xhr.setRequestHeader("x-progress-id", progressId);
      xhr.responseType = "json";

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        const uploadPercent = Math.max(1, Math.min(55, Math.round((event.loaded / event.total) * 55)));
        setUploadProgress(uploadPercent, "Uploading PDF...");
      };

      xhr.onerror = () => {
        stopPolling();
        reject(new Error("Upload failed. Check your network and try again."));
      };

      xhr.onload = () => {
        stopPolling();
        const data = readJsonResponse(xhr);
        if (xhr.status >= 200 && xhr.status < 300) {
          setUploadProgress(100, "Ready");
          resolve(data);
          return;
        }
        reject(new Error(data.error || "Failed to process PDF."));
      };

      xhr.send(formData);
    });
  }

  async function deleteCurrentDoc() {
    if (!currentDocId) return;
    const docId = currentDocId;
    currentDocId = "";
    refreshControlState();
    try {
      await fetch(`/api/pdf-chat/${encodeURIComponent(docId)}`, {
        method: "DELETE",
        keepalive: true,
      });
    } catch {
      // ignore cleanup issues
    }
  }

  async function apiJson(url, options = {}) {
    const response = await fetch(url, options);
    let data = {};
    try {
      data = await response.json();
    } catch {
      data = {};
    }
    if (!response.ok) {
      throw new Error(data.error || `Request failed (${response.status}).`);
    }
    return data;
  }

  function updatePageIndicator() {
    pageIndicator.textContent = `Page ${currentPage} / ${Math.max(1, totalPages)}`;
    prevPageBtn.disabled = currentPage <= 1;
    nextPageBtn.disabled = currentPage >= totalPages;
  }

  async function renderPdfPage(pageNumber) {
    if (!pdfDoc) return;
    const page = Math.max(1, Math.min(totalPages, pageNumber));
    currentPage = page;
    updatePageIndicator();

    const token = ++renderToken;
    const pdfPage = await pdfDoc.getPage(page);
    const baseViewport = pdfPage.getViewport({ scale: 1 });
    const availableWidth = Math.max(280, previewWrap.clientWidth - 24);
    const scale = availableWidth / baseViewport.width;
    const viewport = pdfPage.getViewport({ scale });

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const context = pdfCanvas.getContext("2d", { alpha: false });
    pdfCanvas.width = Math.floor(viewport.width * dpr);
    pdfCanvas.height = Math.floor(viewport.height * dpr);
    pdfCanvas.style.width = `${Math.floor(viewport.width)}px`;
    pdfCanvas.style.height = `${Math.floor(viewport.height)}px`;

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.fillStyle = "#fff";
    context.fillRect(0, 0, viewport.width, viewport.height);

    await pdfPage.render({
      canvasContext: context,
      viewport,
    }).promise;

    if (token !== renderToken) {
      return;
    }
    updatePageIndicator();
  }

  async function loadPdfPreview(file) {
    if (currentPdfUrl) {
      URL.revokeObjectURL(currentPdfUrl);
      currentPdfUrl = "";
    }
    currentPdfUrl = URL.createObjectURL(file);
    const loadingTask = pdfjsLib.getDocument({ url: currentPdfUrl });
    pdfDoc = await loadingTask.promise;
    totalPages = Number(pdfDoc.numPages || 0);
    currentPage = 1;
    previewControls.classList.toggle("hidden", totalPages <= 1);
    await renderPdfPage(1);
  }

  function getNodeTypeWeight(type) {
    if (type === "document") return 0;
    if (type === "main" || type === "topic") return 1;
    if (type === "subtopic") return 2;
    return 3;
  }

  function hasChildNodes(nodeId) {
    if (!currentMapData || !Array.isArray(currentMapData.nodes)) return false;
    return currentMapData.nodes.some((node) => node.parentId === nodeId);
  }

  function getVisibleGraph() {
    if (!currentMapData) return { nodes: [], edges: [] };
    const allNodes = Array.isArray(currentMapData.nodes) ? currentMapData.nodes : [];
    const allEdges = Array.isArray(currentMapData.edges) ? currentMapData.edges : [];

    const visibleIds = new Set();
    allNodes.forEach((node) => {
      if (getNodeTypeWeight(node.type) <= 1) {
        visibleIds.add(node.id);
      }
    });

    expandedNodeIds.forEach((expandedId) => {
      allNodes.forEach((node) => {
        if (node.parentId === expandedId) {
          visibleIds.add(node.id);
        }
      });
    });

    if (selectedNodeId) {
      visibleIds.add(selectedNodeId);
      allNodes.forEach((node) => {
        if (node.parentId === selectedNodeId || node.id === selectedNodeId) {
          visibleIds.add(node.id);
        }
      });
    }

    if (!visibleIds.size && allNodes.length) {
      visibleIds.add(allNodes[0].id);
    }

    const nodes = allNodes.filter((node) => visibleIds.has(node.id));
    const nodeSet = new Set(nodes.map((node) => node.id));
    const edges = allEdges.filter((edge) => nodeSet.has(edge.source) && nodeSet.has(edge.target));

    return { nodes, edges };
  }

  function typeColor(type) {
    if (type === "document") return "#ffd66f";
    if (type === "main" || type === "topic") return "#56b3ff";
    if (type === "subtopic") return "#79f2c7";
    return "#d9b8ff";
  }

  function nodeRadius(type) {
    if (type === "document") return 20;
    if (type === "main" || type === "topic") return 14;
    if (type === "subtopic") return 11;
    return 9;
  }

  function renderNodeInfo(node) {
    const summary = escapeHtml(node.summary || "No explanation available for this node yet.");
    const pages = Array.isArray(node.pages) && node.pages.length ? node.pages : [1];
    const hasChildren = hasChildNodes(node.id);
    const expanded = expandedNodeIds.has(node.id);

    nodeInfoWrap.innerHTML = `
      <div class="node-info-head">
        <h4>${escapeHtml(node.label)}</h4>
        <span class="node-type-chip">${escapeHtml(node.type || "concept")}</span>
      </div>
      <p>${summary}</p>
      <div class="node-pages">
        ${pages
          .map(
            (page) =>
              `<button class="node-page-chip" type="button" data-map-action="page" data-page="${Number(page)}">p.${Number(page)}</button>`
          )
          .join("")}
      </div>
      <div class="node-actions">
        <button class="download split-small-btn" type="button" data-map-action="jump" data-page="${Number(
          pages[0] || 1
        )}">Jump to Page</button>
        ${
          hasChildren
            ? `<button class="download split-small-btn" type="button" data-map-action="expand" data-node-id="${escapeHtml(
                node.id
              )}">${expanded ? "Collapse" : "Expand"} Related</button>`
            : ""
        }
      </div>
    `;
  }

  function renderKnowledgeMap() {
    if (!d3) {
      setMapStatus("D3.js not loaded. Knowledge map unavailable.", true);
      return;
    }
    if (!currentMapData) {
      return;
    }

    const { nodes, edges } = getVisibleGraph();
    mapCanvasWrap.innerHTML = "";
    if (!nodes.length) {
      setMapStatus("No map nodes found.", true);
      return;
    }

    const width = Math.max(300, mapCanvasWrap.clientWidth || 300);
    const height = Math.max(280, mapCanvasWrap.clientHeight || 280);
    const svg = d3
      .select(mapCanvasWrap)
      .append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet");

    const zoomGroup = svg.append("g");
    svg.call(
      d3
        .zoom()
        .scaleExtent([0.35, 2.8])
        .on("zoom", (event) => {
          zoomGroup.attr("transform", event.transform);
        })
    );

    const link = zoomGroup
      .append("g")
      .attr("class", "map-links")
      .selectAll("line")
      .data(edges)
      .join("line")
      .attr("stroke", "rgba(164, 208, 255, 0.45)")
      .attr("stroke-width", 1.4);

    const node = zoomGroup
      .append("g")
      .attr("class", "map-nodes")
      .selectAll("g")
      .data(nodes, (entry) => entry.id)
      .join("g")
      .attr("class", "map-node")
      .style("cursor", "pointer");

    node
      .append("circle")
      .attr("r", (entry) => nodeRadius(entry.type))
      .attr("fill", (entry) => typeColor(entry.type))
      .attr("stroke", "rgba(255,255,255,0.86)")
      .attr("stroke-width", (entry) => (entry.id === selectedNodeId ? 2.8 : 1.4));

    node
      .append("text")
      .text((entry) => entry.label)
      .attr("x", (entry) => nodeRadius(entry.type) + 7)
      .attr("y", 4)
      .attr("fill", "rgba(245, 251, 255, 0.95)")
      .attr("font-size", "11px")
      .attr("font-weight", 600);

    const simulation = d3
      .forceSimulation(nodes)
      .force(
        "link",
        d3
          .forceLink(edges)
          .id((entry) => entry.id)
          .distance((entry) => (entry.relationship === "contains" ? 92 : 76))
          .strength(0.85)
      )
      .force("charge", d3.forceManyBody().strength(-260))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius((entry) => nodeRadius(entry.type) + 16));

    node.call(
      d3
        .drag()
        .on("start", (event, entry) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          entry.fx = entry.x;
          entry.fy = entry.y;
        })
        .on("drag", (event, entry) => {
          entry.fx = event.x;
          entry.fy = event.y;
        })
        .on("end", (event, entry) => {
          if (!event.active) simulation.alphaTarget(0);
          entry.fx = null;
          entry.fy = null;
        })
    );

    node.on("click", (event, entry) => {
      event.stopPropagation();
      selectedNodeId = entry.id;
      if (hasChildNodes(entry.id)) {
        if (expandedNodeIds.has(entry.id)) {
          expandedNodeIds.delete(entry.id);
        } else {
          expandedNodeIds.add(entry.id);
        }
      }
      renderNodeInfo(entry);
      renderKnowledgeMap();
    });

    svg.on("click", () => {
      selectedNodeId = "";
      renderKnowledgeMap();
    });

    simulation.on("tick", () => {
      link
        .attr("x1", (entry) => entry.source.x)
        .attr("y1", (entry) => entry.source.y)
        .attr("x2", (entry) => entry.target.x)
        .attr("y2", (entry) => entry.target.y);

      node.attr("transform", (entry) => `translate(${entry.x},${entry.y})`);
    });
  }

  async function loadKnowledgeMap(forceRegenerate) {
    if (!currentDocId) return;

    setMapStatus("Generating knowledge map...");
    if (mapRefreshBtn) mapRefreshBtn.disabled = true;
    try {
      const data = await apiJson("/api/pdf-chat/map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          docId: currentDocId,
          forceRegenerate: Boolean(forceRegenerate),
        }),
      });
      currentMapData = data.map || null;
      selectedNodeId = "";
      expandedNodeIds.clear();
      renderKnowledgeMap();
      const modeText = data.mode === "ai" ? "AI map ready." : "Fallback map ready.";
      setMapStatus(data.warning ? `${modeText} ${data.warning}` : modeText, Boolean(data.warning));
    } catch (error) {
      setMapStatus(error.message || "Failed to build knowledge map.", true);
      resetMapArea();
    } finally {
      refreshControlState();
    }
  }

  async function handleFile(file) {
    if (!file) return;
    const isPdf =
      file.type === "application/pdf" || String(file.name || "").toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      setStatus("Please upload a PDF file.", true);
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setStatus("File is too large. Max allowed size is 50MB.", true);
      return;
    }

    await deleteCurrentDoc();

    currentFile = file;
    uploadInfo.textContent = `Selected: ${file.name}`;
    fileNameEl.textContent = file.name;
    pageCountEl.textContent = "-";
    setStatus("Uploading and analyzing PDF...");
    setMapStatus("Preparing map...");
    resetChatMessages();
    resetMapArea();

    try {
      const uploadResult = await uploadPdfWithProgress(file);
      currentDocId = uploadResult.docId || "";
      if (!currentDocId) {
        throw new Error("Upload completed but no document id was returned.");
      }
      refreshControlState();

      fileNameEl.textContent = uploadResult.fileName || file.name;
      pageCountEl.textContent = String(uploadResult.pageCount || "-");
      setStatus(
        uploadResult.warning
          ? `Ready with warning: ${uploadResult.warning}`
          : "PDF analyzed. Ask questions or explore the knowledge map."
      );

      await loadPdfPreview(file);
      await loadKnowledgeMap(false);
    } catch (error) {
      setStatus(error.message || "Failed to process PDF.", true);
      setMapStatus("Map generation failed.", true);
      refreshControlState();
    } finally {
      setTimeout(() => showUploadProgress(false), 1000);
    }
  }

  async function submitQuestion() {
    if (askInFlight) return;
    if (!currentDocId) {
      setStatus("Upload a PDF first.", true);
      return;
    }
    const question = (chatInput.value || "").trim();
    if (!question) return;

    chatInput.value = "";
    appendChatBubble("user", question, []);
    chatHistory.push({ role: "user", content: question });
    setAskInFlight(true);
    setTyping(true);
    setStatus("AI is analyzing your question...");

    try {
      const data = await apiJson("/api/pdf-chat/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          docId: currentDocId,
          question,
          history: chatHistory.slice(-8),
        }),
      });

      const answer = String(data.answer || "I couldn't find that in this PDF.").trim();
      appendChatBubble("ai", answer, Array.isArray(data.sources) ? data.sources : []);
      chatHistory.push({ role: "assistant", content: answer });
      setStatus("Answer ready.");
    } catch (error) {
      appendChatBubble("ai", error.message || "Could not get answer.", []);
      setStatus(error.message || "Failed to ask AI.", true);
    } finally {
      setTyping(false);
      setAskInFlight(false);
    }
  }

  async function downloadSummary() {
    if (!currentDocId) {
      setStatus("Upload a PDF first.", true);
      return;
    }
    summaryBtn.disabled = true;
    setStatus("Generating summary...");
    try {
      const data = await apiJson("/api/pdf-chat/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docId: currentDocId }),
      });
      const summary = String(data.summary || "").trim();
      if (!summary) {
        throw new Error("No summary generated.");
      }

      const textBlob = new Blob([summary], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(textBlob);
      const fileBase = String((data.fileName || currentFile?.name || "document").replace(/\.[^.]+$/, ""));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${fileBase}-summary.txt`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);

      appendChatBubble("ai", "Summary generated and downloaded.", []);
      setStatus("Summary downloaded.");
    } catch (error) {
      setStatus(error.message || "Failed to generate summary.", true);
    } finally {
      refreshControlState();
    }
  }

  function setupMapResizeObserver() {
    if (!window.ResizeObserver) return;
    mapResizeObserver = new ResizeObserver(() => {
      if (currentMapData) {
        renderKnowledgeMap();
      }
      if (pdfDoc) {
        renderPdfPage(currentPage).catch(() => {});
      }
    });
    mapResizeObserver.observe(mapCanvasWrap);
    mapResizeObserver.observe(previewWrap);
  }

  dropzone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropzone.classList.add("dragover");
  });

  dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("dragover");
  });

  dropzone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropzone.classList.remove("dragover");
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      fileInput.files = event.dataTransfer.files;
      handleFile(file);
    }
  });

  fileInput.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  });

  prevPageBtn.addEventListener("click", () => {
    if (!pdfDoc) return;
    renderPdfPage(currentPage - 1).catch(() => {});
  });

  nextPageBtn.addEventListener("click", () => {
    if (!pdfDoc) return;
    renderPdfPage(currentPage + 1).catch(() => {});
  });

  chatForm.addEventListener("submit", (event) => {
    event.preventDefault();
    submitQuestion();
  });

  chatInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submitQuestion();
    }
  });

  quickPromptButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const prompt = String(button.dataset.prompt || "").trim();
      if (!prompt) return;
      chatInput.value = prompt;
      if (!currentDocId) {
        setStatus("Prompt added. Upload a PDF, then ask AI.");
        chatInput.focus();
        return;
      }
      submitQuestion();
    });
  });

  summaryBtn.addEventListener("click", () => {
    downloadSummary();
  });

  clearBtn.addEventListener("click", () => {
    resetChatMessages();
    setStatus("Chat cleared.");
  });

  mapRefreshBtn.addEventListener("click", () => {
    if (!currentDocId) return;
    loadKnowledgeMap(true);
  });

  nodeInfoWrap.addEventListener("click", (event) => {
    const target = event.target.closest("button[data-map-action]");
    if (!target) return;

    const action = target.dataset.mapAction;
    const page = Number(target.dataset.page || 1);
    if (action === "page" || action === "jump") {
      if (pdfDoc) {
        renderPdfPage(page).catch(() => {});
      }
      return;
    }
    if (action === "expand") {
      const nodeId = String(target.dataset.nodeId || "");
      if (!nodeId) return;
      if (expandedNodeIds.has(nodeId)) {
        expandedNodeIds.delete(nodeId);
      } else {
        expandedNodeIds.add(nodeId);
      }
      renderKnowledgeMap();
    }
  });

  chatMessages.addEventListener("click", (event) => {
    const sourceButton = event.target.closest(".chat-source-chip");
    if (!sourceButton) return;
    const page = Number(sourceButton.dataset.page || 1);
    if (pdfDoc) {
      renderPdfPage(page).catch(() => {});
    }
  });

  window.addEventListener("beforeunload", () => {
    if (mapResizeObserver) {
      mapResizeObserver.disconnect();
    }
    if (currentPdfUrl) {
      URL.revokeObjectURL(currentPdfUrl);
    }
    deleteCurrentDoc();
  });

  resetChatMessages();
  setAskInFlight(false);
  refreshControlState();
  setUploadProgress(0, "Processing PDF...");
  showUploadProgress(false);
  setupMapResizeObserver();
})();
