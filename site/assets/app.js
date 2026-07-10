// ============================================================
//  lib-filetransfer — landing page behaviour
//  The demo drives the REAL library, bundled next to this file
//  as ./lib-filetransfer.js at build time.
// ============================================================

/* ---------- Theme toggle ---------- */
(() => {
  const root = document.documentElement;
  const stored = localStorage.getItem("lft-theme");
  if (stored) root.setAttribute("data-theme", stored);
  const btn = document.getElementById("theme-toggle");
  btn?.addEventListener("click", () => {
    const current =
      root.getAttribute("data-theme") ||
      (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    const next = current === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    localStorage.setItem("lft-theme", next);
  });
})();

/* ---------- Copy buttons ---------- */
(() => {
  const flash = (btn) => {
    btn.classList.add("copied");
    const label = btn.querySelector(".copy-label");
    const prev = label?.textContent;
    if (label) label.textContent = "Copied!";
    setTimeout(() => {
      btn.classList.remove("copied");
      if (label && prev) label.textContent = prev;
    }, 1400);
  };
  document.querySelectorAll("[data-copy], [data-copy-target]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const text = btn.dataset.copy
        ? btn.dataset.copy
        : document.getElementById(btn.dataset.copyTarget)?.textContent ?? "";
      try {
        await navigator.clipboard.writeText(text.trim());
        flash(btn);
      } catch {
        /* clipboard blocked — ignore */
      }
    });
  });
})();

/* ---------- Code tabs ---------- */
(() => {
  const tabs = document.querySelectorAll("#code-tabs .tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const name = tab.dataset.tab;
      tabs.forEach((t) => t.classList.toggle("active", t === tab));
      document.querySelectorAll("#code-tabs .tab-panel").forEach((p) => {
        p.classList.toggle("active", p.dataset.panel === name);
      });
    });
  });
})();

/* ---------- Minimal TypeScript syntax highlighter ----------
   One ordered pass over the source, so token placeholders can never
   collide with a later matching pass (which broke strings before). */
(() => {
  const esc = (t) =>
    t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const RE = new RegExp(
    [
      "(\\/\\/[^\\n]*)", // 1 comment
      "(\"(?:[^\"\\\\]|\\\\.)*\"|'(?:[^'\\\\]|\\\\.)*'|`[^`]*`)", // 2 string
      "(\\b\\d[\\d_]*\\b)", // 3 number
      "(\\b(?:import|from|const|let|await|async|new|function|return|type|interface|export|window)\\b)", // 4 keyword
      "(\\b(?:TransferFilePool|TransferFileMetadata|Blob|File|URL|ArrayBuffer)\\b)", // 5 type
      "(\\.\\w+)", // 6 member access
    ].join("|"),
    "g"
  );
  const highlight = (raw) => {
    let out = "";
    let last = 0;
    let m;
    while ((m = RE.exec(raw)) !== null) {
      out += esc(raw.slice(last, m.index));
      if (m[1]) out += `<span class="tok-com">${esc(m[1])}</span>`;
      else if (m[2]) out += `<span class="tok-str">${esc(m[2])}</span>`;
      else if (m[3]) out += `<span class="tok-num">${esc(m[3])}</span>`;
      else if (m[4]) out += `<span class="tok-key">${esc(m[4])}</span>`;
      else if (m[5]) out += `<span class="tok-type">${esc(m[5])}</span>`;
      else if (m[6]) out += `.<span class="tok-fn">${esc(m[6].slice(1))}</span>`;
      last = RE.lastIndex;
    }
    out += esc(raw.slice(last));
    return out;
  };
  document.querySelectorAll("pre.code code").forEach((el) => {
    el.innerHTML = highlight(el.textContent);
  });
})();

/* ---------- Live demo ---------- */
(async () => {
  const app = document.getElementById("demo-app");
  if (!app) return;

  const note = document.getElementById("demo-note");
  const setNote = (msg, isErr = false) => {
    note.textContent = msg || "";
    note.classList.toggle("err", isErr);
  };

  // Load the real library, bundled beside this file during the docs build.
  let lib;
  try {
    lib = await import("./lib-filetransfer.js");
  } catch {
    setNote(
      "Demo bundle not found. Run `npm run docs` to build it, then serve the docs/ folder.",
      true
    );
    return;
  }
  const { TransferFilePool, arrayBufferToString, stringToArrayBuffer } = lib;

  // ----- Elements -----
  const el = (id) => document.getElementById(id);
  const ctlChunk = el("ctl-chunk");
  const ctlParallel = el("ctl-parallel");
  const ctlLoss = el("ctl-loss");
  const ctlLatency = el("ctl-latency");
  const outChunk = el("out-chunk");
  const outParallel = el("out-parallel");
  const outLoss = el("out-loss");
  const outLatency = el("out-latency");
  const btnStart = el("btn-start");
  const btnReset = el("btn-reset");
  const btnSample = el("btn-sample");
  const inputFile = el("ctl-file");
  const fileName = el("file-name");
  const senderCard = el("sender-card");
  const channel = el("channel");
  const channelCaption = el("channel-caption");
  const grid = el("chunk-grid");
  const progressBar = el("progress-bar");
  const result = el("result");
  const stat = {
    chunks: el("stat-chunks"),
    requests: el("stat-requests"),
    dropped: el("stat-dropped"),
    retries: el("stat-retries"),
    elapsed: el("stat-elapsed"),
    status: el("stat-status"),
  };

  const MAX_CHUNKS = 600;
  let currentBlob = null;
  let currentName = "";
  let running = false;
  let receiverPool = null;
  let activeFileId = null;

  // ----- Helpers -----
  const fmtBytes = (n) => {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(2)} MB`;
  };
  const isImage = (blob) => blob && blob.type.startsWith("image/");

  const syncOutputs = () => {
    outChunk.textContent = `${ctlChunk.value} B`;
    outParallel.textContent = ctlParallel.value;
    outLoss.textContent = `${ctlLoss.value}%`;
    outLatency.textContent = `${ctlLatency.value} ms`;
  };
  [ctlChunk, ctlParallel, ctlLoss, ctlLatency].forEach((c) =>
    c.addEventListener("input", syncOutputs)
  );
  syncOutputs();

  // ----- File selection -----
  const setFile = (blob, name) => {
    currentBlob = blob;
    currentName = name;
    fileName.textContent = `${name} · ${fmtBytes(blob.size)}`;
    btnStart.disabled = false;
    renderSenderCard();
    resetStage();
    setNote("Ready. Press “Start transfer”.");
  };

  const renderSenderCard = () => {
    const preview = document.createElement("div");
    preview.className = "file-preview";
    let media;
    if (isImage(currentBlob)) {
      media = document.createElement("img");
      media.className = "thumb";
      media.alt = "Selected file preview";
      media.src = URL.createObjectURL(currentBlob);
    } else {
      media = document.createElement("div");
      media.className = "fp-icon";
      media.textContent = "📄";
    }
    preview.appendChild(media);
    preview.insertAdjacentHTML(
      "beforeend",
      `<div class="meta-name">${currentName}</div>
       <div class="meta-row"><b>${fmtBytes(currentBlob.size)}</b> · ${
        currentBlob.type || "application/octet-stream"
      }</div>`
    );
    senderCard.replaceChildren(preview);
  };

  inputFile.addEventListener("change", () => {
    const f = inputFile.files?.[0];
    if (f) setFile(f, f.name);
  });

  // Generate a colourful square sample image on a canvas — no external assets.
  btnSample.addEventListener("click", () => {
    const S = 560; // square, easy to read as a thumbnail
    const c = document.createElement("canvas");
    c.width = S;
    c.height = S;
    const ctx = c.getContext("2d");
    const g = ctx.createLinearGradient(0, 0, S, S);
    g.addColorStop(0, "#0ea5e9");
    g.addColorStop(0.5, "#6366f1");
    g.addColorStop(1, "#a855f7");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    const palette = ["#38bdf8", "#818cf8", "#c084fc", "#ffffff", "#0a0e17", "#f472b6"];
    for (let i = 0; i < 80; i++) {
      ctx.beginPath();
      ctx.globalAlpha = 0.05 + Math.random() * 0.16;
      ctx.fillStyle = palette[(Math.random() * palette.length) | 0];
      ctx.arc(Math.random() * S, Math.random() * S, 8 + Math.random() * 70, 0, 7);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.97)";
    ctx.font = "700 48px -apple-system, Segoe UI, sans-serif";
    ctx.fillText("lib-", S / 2, S / 2 - 18);
    ctx.fillText("filetransfer", S / 2, S / 2 + 40);
    ctx.font = "400 22px -apple-system, Segoe UI, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText("chunked · retried · parallel", S / 2, S / 2 + 92);
    // JPEG keeps the sample modest (~50 chunks) so the transfer stays watchable.
    c.toBlob((blob) => setFile(blob, "sample-image.jpg"), "image/jpeg", 0.9);
  });

  // ----- Stage rendering -----
  const resetStage = () => {
    grid.replaceChildren();
    progressBar.style.width = "0";
    result.hidden = true;
    result.replaceChildren();
    channel.querySelectorAll(".pkt, .lane-guide").forEach((p) => p.remove());
    channelCaption.textContent = "idle";
    stat.chunks.textContent = "0 / 0";
    stat.requests.textContent = "0";
    stat.dropped.textContent = "0";
    stat.retries.textContent = "0";
    stat.elapsed.textContent = "0 ms";
    stat.status.textContent = "Ready";
  };

  // Lay out horizontal lanes so parallel requests are visually distinct.
  const laneTop = (lane, laneCount) =>
    lane < 0 ? 50 : ((lane + 1) / (laneCount + 1)) * 100;

  const renderLanes = (laneCount) => {
    channel.querySelectorAll(".lane-guide, .pkt").forEach((n) => n.remove());
    for (let i = 0; i < laneCount; i++) {
      const g = document.createElement("div");
      g.className = "lane-guide";
      g.style.top = `${laneTop(i, laneCount)}%`;
      channel.appendChild(g);
    }
  };

  // One packet = one request travelling sender (left) -> receiver (right).
  // attempt > 1 means it's a retry of a chunk that was lost earlier.
  const spawnPacket = ({ idx, willDrop, latency, lane, laneCount, attempt }) => {
    const p = document.createElement("div");
    p.className = "pkt" + (attempt > 1 ? " retry" : "");
    p.style.top = `${laneTop(lane, laneCount)}%`;
    p.style.left = "4%";
    p.style.transitionDuration = `${latency}ms`;
    const n = document.createElement("span");
    n.className = "pkt-n";
    n.textContent = idx;
    p.appendChild(n);
    channel.appendChild(p);
    requestAnimationFrame(() => {
      if (willDrop) {
        p.style.transitionDuration = `${latency * 0.5}ms`;
        p.style.left = "48%";
        setTimeout(() => p.classList.add("dropped"), latency * 0.5);
      } else {
        p.style.left = "calc(96% - 20px)";
      }
    });
    setTimeout(() => p.remove(), latency + 500);
  };

  // ----- The transfer -----
  const start = async () => {
    if (running || !currentBlob) return;

    const chunkSize = +ctlChunk.value;
    const parallel = +ctlParallel.value;
    const loss = +ctlLoss.value;
    const latency = +ctlLatency.value;

    resetStage();
    setNote("");

    // Two independent pools — exactly like two peers.
    // Adapt the retry timeout to the simulated latency so healthy packets
    // aren't re-requested, while dropped ones are re-asked reasonably fast.
    const sender = new TransferFilePool({ maxBufferSize: chunkSize });
    receiverPool = new TransferFilePool({
      maxBufferSize: chunkSize,
      timeout: (latency + 250) / 1000,
      retries: 80,
    });

    // 1. Sender adds the file, gets metadata.
    const meta = await sender.addFile(currentBlob, currentName);
    // 2. Metadata crosses the wire; receiver stores it.
    const fileId = receiverPool.storeFileMetadata(meta);
    activeFileId = fileId;

    const partsCount = Math.max(1, Math.ceil(meta.bufferLength / chunkSize));
    if (partsCount > MAX_CHUNKS) {
      setNote(
        `That's ${partsCount.toLocaleString()} chunks — too many to visualise smoothly. ` +
          `Increase the chunk size or pick a smaller file.`,
        true
      );
      return;
    }

    // Build the chunk grid.
    const cells = [];
    const frag = document.createDocumentFragment();
    for (let i = 0; i < partsCount; i++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      frag.appendChild(cell);
      cells.push(cell);
    }
    grid.replaceChildren(frag);

    let requests = 0;
    let dropped = 0;
    const received = new Set();
    const attempts = new Map(); // chunk index -> how many times it's been asked
    running = true;
    btnStart.disabled = true;
    stat.status.textContent = "Transferring…";
    stat.chunks.textContent = `0 / ${partsCount}`;
    channelCaption.textContent = `${parallel} parallel lane${parallel > 1 ? "s" : ""} · ${loss}% loss · ${latency}ms`;

    // One lane per parallel slot; allocate a free lane per in-flight request.
    renderLanes(parallel);
    const laneBusy = new Array(parallel).fill(false);
    const acquireLane = () => {
      for (let i = 0; i < parallel; i++)
        if (!laneBusy[i]) {
          laneBusy[i] = true;
          return i;
        }
      return -1; // fallback: centre lane, not tracked
    };
    const releaseLane = (i) => {
      if (i >= 0) laneBusy[i] = false;
    };

    const startedAt = performance.now();
    const timer = setInterval(() => {
      stat.elapsed.textContent = `${Math.round(performance.now() - startedAt)} ms`;
    }, 100);

    // The channel: receiver asks -> sender reads -> (lossy) delivery back.
    const askFilePart = (id, offset, limit) => {
      const idx = Math.floor(offset / chunkSize);
      const attempt = (attempts.get(idx) || 0) + 1;
      attempts.set(idx, attempt);
      requests++;
      stat.requests.textContent = String(requests);
      // retries = extra asks beyond the first for each distinct chunk (never negative)
      stat.retries.textContent = String(requests - attempts.size);
      if (!received.has(idx) && cells[idx]) cells[idx].className = "cell req";

      // Sender reads the requested slice and serialises it for a text channel.
      const part = sender.readFilePart(id, offset, limit);
      const wire = arrayBufferToString(part);

      const willDrop = Math.random() * 100 < loss;
      const lane = acquireLane();
      spawnPacket({ idx, willDrop, latency, lane, laneCount: parallel, attempt });

      setTimeout(() => {
        releaseLane(lane);
        if (!running) return;
        if (willDrop) {
          dropped++;
          stat.dropped.textContent = String(dropped);
          // mark the chunk as lost until the library re-asks for it
          if (cells[idx] && !received.has(idx)) cells[idx].className = "cell miss";
          return; // library will time out and re-ask -> retry visualised
        }
        receiverPool.receiveFilePart(id, offset, limit, stringToArrayBuffer(wire));
        if (!received.has(idx)) {
          received.add(idx);
          if (cells[idx]) cells[idx].className = "cell recv";
          const pct = (received.size / partsCount) * 100;
          progressBar.style.width = `${pct}%`;
          stat.chunks.textContent = `${received.size} / ${partsCount}`;
        }
      }, latency);
    };

    try {
      // 3. Trigger the download — the library orchestrates ordering & retries.
      await receiverPool.downloadFile(fileId, askFilePart, parallel);

      // 4. Reassembled file, ready to use.
      const file = receiverPool.getFile(fileId);
      const retries = Math.max(0, requests - partsCount);
      stat.retries.textContent = String(retries);
      stat.status.textContent = "Complete ✓";
      stat.elapsed.textContent = `${Math.round(performance.now() - startedAt)} ms`;

      const url = URL.createObjectURL(file.data);
      const sizeOk = file.size === currentBlob.size;
      result.replaceChildren();
      if (isImage(file.data)) {
        const img = document.createElement("img");
        img.src = url;
        img.alt = "Reassembled file";
        result.appendChild(img);
      }
      result.insertAdjacentHTML(
        "beforeend",
        `<span class="ok-line">✓ Reassembled ${partsCount} chunk${
          partsCount > 1 ? "s" : ""
        } — size ${sizeOk ? "matches" : "MISMATCH"} (${fmtBytes(file.size)})</span>`
      );
      const dl = document.createElement("a");
      dl.href = url;
      dl.download = currentName;
      dl.className = "btn btn-small";
      dl.textContent = "⬇ Download reassembled file";
      result.appendChild(dl);
      result.hidden = false;

      setNote(
        `Recovered every byte over a ${loss}% lossy link using ${retries} retried request${
          retries === 1 ? "" : "s"
        }.`
      );
    } catch (err) {
      stat.status.textContent = running ? "Failed" : "Aborted";
      setNote(running ? `Transfer failed: ${err.message}` : "Transfer reset.", running);
    } finally {
      clearInterval(timer);
      running = false;
      btnStart.disabled = false;
    }
  };

  btnStart.addEventListener("click", start);
  btnReset.addEventListener("click", () => {
    if (running && receiverPool && activeFileId) {
      running = false;
      try {
        receiverPool.abortFileDownload(activeFileId);
      } catch {
        /* ignore */
      }
    }
    resetStage();
    if (currentBlob) {
      renderSenderCard();
      setNote("Ready. Press “Start transfer”.");
    }
  });
})();
