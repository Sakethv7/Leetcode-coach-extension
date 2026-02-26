function cleanText(value) {
  return (value || "").replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function normalizeCode(value) {
  return (value || "").replace(/\u00a0/g, " ").replace(/\s+\n/g, "\n").trim();
}

function firstText(selectors) {
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el && el.textContent?.trim()) {
      return cleanText(el.textContent);
    }
  }
  return "";
}

function collectExamples() {
  const chunks = [];
  const candidates = document.querySelectorAll("pre, .example-block, [class*='example']");
  for (const el of candidates) {
    const text = cleanText(el.textContent || "");
    if (text && /input|output|example/i.test(text)) {
      chunks.push(text);
    }
  }
  return chunks.slice(0, 6).join("\n\n");
}

function injectPageBridge() {
  if (document.getElementById("lc-coach-page-bridge")) {
    return;
  }

  const script = document.createElement("script");
  script.id = "lc-coach-page-bridge";
  script.src = chrome.runtime.getURL("pageBridge.js");
  document.documentElement.appendChild(script);
}

function requestEditorSnapshot() {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      window.removeEventListener("message", onMessage);
      resolve({ code: "", language: "" });
    }, 600);

    function onMessage(event) {
      if (event.source !== window) return;
      if (event.data?.type !== "LC_COACH_CODE") return;
      clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      resolve({
        code: normalizeCode(event.data?.code || ""),
        language: String(event.data?.language || "")
      });
    }

    window.addEventListener("message", onMessage);
    window.postMessage({ type: "LC_COACH_REQUEST_CODE" }, "*");
  });
}

function getEditorSnapshotFromDom() {
  const viewLines = document.querySelector(".monaco-editor .view-lines");
  if (viewLines) {
    const lines = Array.from(viewLines.querySelectorAll(".view-line")).map((el) =>
      normalizeCode(el.textContent || "")
    );
    return { code: normalizeCode(lines.join("\n")), language: "" };
  }

  const cm = document.querySelector(".CodeMirror textarea");
  if (cm && cm.value) {
    return { code: normalizeCode(cm.value), language: "" };
  }

  return { code: "", language: "" };
}

function getDisplayedLanguage() {
  const label =
    firstText(["button[data-cy='lang-select']", "button[id*='lang']", "div[class*='lang']", "button[class*='lang']"]) ||
    "";
  return label.trim();
}

function escapeXml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function renderArrayPointerSvg(spec) {
  const array = Array.isArray(spec?.array) ? spec.array : [];
  const count = Math.max(3, Math.min(12, array.length || 5));
  const values = (array.length ? array : [1, 3, 5, 7, 9]).slice(0, count);
  const width = Math.max(340, count * 60 + 24);
  const height = 220;
  const top = 88;
  const startX = 12;
  const boxW = 48;

  function cellCenter(i) {
    return startX + i * 60 + boxW / 2;
  }

  function pointerGroup(label, idx, color, yTop) {
    if (idx === null || idx === undefined || idx < 0 || idx >= values.length) {
      return "";
    }
    const x = cellCenter(idx);
    return [
      `<line x1="${x}" y1="${yTop}" x2="${x}" y2="${top - 12}" stroke="${color}" stroke-width="2"/>`,
      `<text x="${x}" y="${yTop - 6}" text-anchor="middle" font-size="12" fill="${color}" font-weight="700">${escapeXml(label)}=${idx}</text>`
    ].join("");
  }

  const cells = values
    .map((value, i) => {
      const x = startX + i * 60;
      const center = x + boxW / 2;
      return [
        `<rect x="${x}" y="${top}" width="${boxW}" height="42" rx="6" fill="#0f1c35" stroke="#304c7b"/>`,
        `<text x="${center}" y="${top + 26}" text-anchor="middle" font-size="14" fill="#ecf1ff">${escapeXml(value)}</text>`,
        `<text x="${center}" y="${top + 58}" text-anchor="middle" font-size="11" fill="#9eb0dc">${i}</text>`
      ].join("");
    })
    .join("");

  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Array pointer diagram">
      <rect x="0" y="0" width="${width}" height="${height}" fill="#0b1220" rx="8"/>
      <text x="12" y="20" font-size="13" fill="#dce6ff" font-weight="700">${escapeXml(spec?.title || "Array pointer walkthrough")}</text>
      ${cells}
      ${pointerGroup("low", spec?.low, "#6ee7b7", 36)}
      ${pointerGroup("mid", spec?.mid, "#fbbf24", 54)}
      ${pointerGroup("high", spec?.high, "#f87171", 72)}
    </svg>
  `;
}

function renderLinkedListSvg(spec) {
  const nodes = Array.isArray(spec?.nodes) ? spec.nodes.slice(0, 10) : [1, 2, 3, 4];
  const width = Math.max(340, nodes.length * 72 + 20);
  const height = 190;
  const y = 84;
  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Linked list diagram">
      <rect x="0" y="0" width="${width}" height="${height}" fill="#0b1220" rx="8"/>
      <text x="12" y="20" font-size="13" fill="#dce6ff" font-weight="700">${escapeXml(spec?.title || "Linked list replay")}</text>
      ${nodes
        .map((value, i) => {
          const x = 12 + i * 72;
          const markers = [spec?.head === i ? "H" : "", spec?.current === i ? "C" : "", spec?.slow === i ? "S" : "", spec?.fast === i ? "F" : ""]
            .filter(Boolean)
            .join("/");
          return [
            `<rect x="${x}" y="${y}" width="46" height="30" rx="6" fill="#0f1c35" stroke="#3c5c94"/>`,
            `<text x="${x + 23}" y="${y + 20}" text-anchor="middle" font-size="12" fill="#ecf1ff">${escapeXml(value)}</text>`,
            i < nodes.length - 1
              ? `<line x1="${x + 46}" y1="${y + 15}" x2="${x + 64}" y2="${y + 15}" stroke="#6a86bf" stroke-width="2"/><polygon points="${x + 64},${y + 15} ${x + 59},${y + 12} ${x + 59},${y + 18}" fill="#6a86bf"/>`
              : "",
            markers ? `<text x="${x + 23}" y="${y - 8}" text-anchor="middle" font-size="10" fill="#fbbf24">${markers}</text>` : ""
          ].join("");
        })
        .join("")}
    </svg>
  `;
}

function renderStackQueueSvg(spec) {
  const items = Array.isArray(spec?.items) ? spec.items.slice(0, 12) : [1, 2, 3];
  const mode = spec?.mode === "queue" ? "queue" : "stack";
  return `
    <svg viewBox="0 0 360 210" role="img" aria-label="Stack or queue diagram">
      <rect x="0" y="0" width="360" height="210" fill="#0b1220" rx="8"/>
      <text x="12" y="20" font-size="13" fill="#dce6ff" font-weight="700">${escapeXml(spec?.title || "Stack/Queue replay")} (${mode})</text>
      ${items
        .map((value, i) => {
          const x = 14 + i * 28;
          const active = spec?.active === i;
          return [
            `<rect x="${x}" y="82" width="24" height="80" rx="5" fill="${active ? "#2a4e89" : "#10203b"}" stroke="#3f629d"/>`,
            `<text x="${x + 12}" y="128" text-anchor="middle" font-size="11" fill="#ecf1ff">${escapeXml(value)}</text>`
          ].join("");
        })
        .join("")}
      <text x="14" y="66" font-size="10" fill="#9eb0dc">${mode === "stack" ? "Top on right" : "Front on left"}</text>
    </svg>
  `;
}

function renderGraphBfsSvg(spec) {
  const nodes = Array.isArray(spec?.nodes) ? spec.nodes.slice(0, 8) : ["A", "B", "C", "D"];
  const cx = 120;
  const cy = 112;
  const radius = 60;
  const pos = new Map(
    nodes.map((node, i) => {
      const a = (Math.PI * 2 * i) / Math.max(1, nodes.length);
      return [String(node), { x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) }];
    })
  );
  const visited = new Set(Array.isArray(spec?.visited) ? spec.visited.map(String) : []);
  const edges = Array.isArray(spec?.edges) ? spec.edges : [];
  const queueText = Array.isArray(spec?.queue) ? spec.queue.join(" -> ") : "";

  return `
    <svg viewBox="0 0 360 230" role="img" aria-label="Graph BFS diagram">
      <rect x="0" y="0" width="360" height="230" fill="#0b1220" rx="8"/>
      <text x="12" y="20" font-size="13" fill="#dce6ff" font-weight="700">${escapeXml(spec?.title || "Graph BFS replay")}</text>
      ${edges
        .map((edge) => {
          if (!Array.isArray(edge) || edge.length < 2) return "";
          const a = pos.get(String(edge[0]));
          const b = pos.get(String(edge[1]));
          if (!a || !b) return "";
          return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#3e5f98" stroke-width="2"/>`;
        })
        .join("")}
      ${nodes
        .map((node) => {
          const p = pos.get(String(node));
          if (!p) return "";
          const isCurrent = String(spec?.current || "") === String(node);
          const isVisited = visited.has(String(node));
          return [
            `<circle cx="${p.x}" cy="${p.y}" r="14" fill="${isCurrent ? "#d97706" : isVisited ? "#1f7a55" : "#112443"}" stroke="#6f93cf"/>`,
            `<text x="${p.x}" y="${p.y + 4}" text-anchor="middle" font-size="11" fill="#f4f8ff">${escapeXml(node)}</text>`
          ].join("");
        })
        .join("")}
      <text x="220" y="78" font-size="10" fill="#9eb0dc">Queue</text>
      <rect x="220" y="86" width="128" height="26" rx="6" fill="#112443" stroke="#3d629f"/>
      <text x="226" y="103" font-size="10" fill="#dce6ff">${escapeXml(queueText || "(empty)")}</text>
    </svg>
  `;
}

function renderDpTableSvg(spec) {
  const table = Array.isArray(spec?.table) ? spec.table : [["0", "0"], ["0", "0"]];
  const rows = table.slice(0, 8).map((row) => (Array.isArray(row) ? row.slice(0, 10) : []));
  const safeRows = rows.length ? rows : [["0", "0"], ["0", "0"]];
  const cols = safeRows[0].length || 2;
  const cellW = 30;
  const cellH = 24;
  const width = Math.max(340, cols * cellW + 42);
  const height = Math.max(210, safeRows.length * cellH + 74);
  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="DP table diagram">
      <rect x="0" y="0" width="${width}" height="${height}" fill="#0b1220" rx="8"/>
      <text x="12" y="20" font-size="13" fill="#dce6ff" font-weight="700">${escapeXml(spec?.title || "DP table replay")}</text>
      ${safeRows
        .map((row, r) =>
          row
            .map((cell, c) => {
              const x = 12 + c * cellW;
              const y = 40 + r * cellH;
              const active = spec?.row === r && spec?.col === c;
              return [
                `<rect x="${x}" y="${y}" width="${cellW - 2}" height="${cellH - 2}" rx="4" fill="${active ? "#2a4e89" : "#112443"}" stroke="#4b6ea8"/>`,
                `<text x="${x + (cellW - 2) / 2}" y="${y + 16}" text-anchor="middle" font-size="10" fill="#ecf1ff">${escapeXml(cell)}</text>`
              ].join("");
            })
            .join("")
        )
        .join("")}
    </svg>
  `;
}

function renderTimelineSvg(step, title, type) {
  const spec = { ...(step || {}), title };
  if (type === "linked_list") return renderLinkedListSvg(spec);
  if (type === "stack_queue") return renderStackQueueSvg(spec);
  if (type === "graph_bfs") return renderGraphBfsSvg(spec);
  if (type === "dp_table") return renderDpTableSvg(spec);
  return renderArrayPointerSvg(spec);
}

async function getProblemContext() {
  const slugMatch = window.location.pathname.match(/\/problems\/([^/]+)/);
  const slug = slugMatch ? slugMatch[1] : "unknown-problem";

  const title =
    firstText([
      "div.text-title-large a",
      "h1",
      "[data-cy='question-title']",
      "div[class*='title']"
    ]) || slug.replace(/-/g, " ");

  const description = firstText([
    "div[data-track-load='description_content']",
    "div.elfjS",
    "div[class*='question-content']",
    "div[class*='description']"
  ]);

  const examples = collectExamples();
  let editorSnapshot = await requestEditorSnapshot();
  if (!editorSnapshot.code) {
    editorSnapshot = getEditorSnapshotFromDom();
  }

  return {
    url: window.location.href,
    slug,
    title,
    description,
    examples,
    code: editorSnapshot.code,
    language: editorSnapshot.language || getDisplayedLanguage(),
    capturedAt: new Date().toISOString()
  };
}

function createCoachWidget() {
  if (document.getElementById("lc-coach-root")) {
    return;
  }

  const host = document.createElement("div");
  host.id = "lc-coach-root";
  host.style.position = "fixed";
  host.style.top = "84px";
  host.style.right = "16px";
  host.style.zIndex = "2147483647";
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      .wrap {
        width: 360px;
        max-height: calc(100vh - 120px);
        display: flex;
        flex-direction: column;
        background: #0b1220;
        border: 1px solid #2b3b5e;
        border-radius: 12px;
        color: #ecf1ff;
        font-family: ui-sans-serif, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
        box-shadow: 0 14px 36px rgba(0, 0, 0, 0.35);
      }
      .head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 12px;
        border-bottom: 1px solid #233253;
      }
      .title {
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.2px;
      }
      .controls {
        display: flex;
        gap: 6px;
      }
      button {
        cursor: pointer;
      }
      .icon-btn {
        border: 1px solid #35518d;
        background: #15223b;
        color: #ecf1ff;
        border-radius: 6px;
        font-size: 12px;
        line-height: 1;
        padding: 5px 8px;
      }
      .body {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 10px 12px;
      }
      .meta {
        font-size: 11px;
        color: #b6c5e8;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .quick {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
      }
      .quick button {
        border: 1px solid #2a4681;
        background: #132241;
        color: #dce6ff;
        border-radius: 999px;
        font-size: 11px;
        padding: 5px 9px;
      }
      .quick .visual {
        background: #203a68;
      }
      textarea {
        width: 100%;
        min-height: 70px;
        max-height: 130px;
        resize: vertical;
        border-radius: 8px;
        border: 1px solid #2f4a86;
        background: #0f1c35;
        color: #f2f6ff;
        padding: 8px;
        font-size: 12px;
        box-sizing: border-box;
      }
      .send {
        border: 1px solid #2d56a9;
        background: #1f3f82;
        color: #f6f9ff;
        border-radius: 8px;
        font-size: 12px;
        padding: 7px 10px;
        align-self: flex-end;
      }
      .output {
        white-space: pre-wrap;
        font-size: 12px;
        line-height: 1.4;
        color: #e7eeff;
        background: #0d192f;
        border: 1px solid #253a69;
        border-radius: 8px;
        padding: 9px;
        max-height: 240px;
        overflow: auto;
      }
      .diagram-wrap {
        background: #0d192f;
        border: 1px solid #253a69;
        border-radius: 8px;
        padding: 8px;
      }
      .diagram-wrap svg {
        width: 100%;
        height: auto;
        display: block;
      }
      .diagram-note {
        margin-top: 6px;
        font-size: 11px;
        color: #9eb0dc;
      }
      .muted {
        color: #9eb0dc;
      }
      .collapsed .body {
        display: none;
      }
      .fab {
        border: 1px solid #2d56a9;
        background: #1f3f82;
        color: #f7faff;
        border-radius: 999px;
        padding: 10px 14px;
        font-size: 12px;
        font-weight: 700;
        box-shadow: 0 8px 20px rgba(0, 0, 0, 0.35);
      }
      .hidden {
        display: none;
      }
      .live {
        position: fixed;
        right: 18px;
        bottom: 22px;
        max-width: 320px;
        background: #111b31;
        border: 1px solid #2a3f6c;
        color: #e6efff;
        border-radius: 10px;
        padding: 10px 12px;
        font-size: 12px;
        line-height: 1.4;
        box-shadow: 0 10px 26px rgba(0, 0, 0, 0.35);
      }
      .live-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.6px;
        color: #9fb1df;
        margin-bottom: 6px;
      }
      .live-btn {
        border: 1px solid #34518e;
        background: #1a2d52;
        color: #dce6ff;
        border-radius: 6px;
        font-size: 10px;
        padding: 3px 6px;
      }
      .tutorial-overlay {
        position: absolute;
        inset: 0;
        background: rgba(10, 16, 30, 0.78);
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 12px;
        z-index: 20;
      }
      .tutorial-overlay.hidden {
        display: none;
      }
      .tutorial-card {
        width: 300px;
        background: #0f1c35;
        border: 1px solid #365793;
        border-radius: 10px;
        padding: 10px;
        color: #e9f1ff;
      }
      .tutorial-step {
        font-size: 11px;
        color: #9eb0dc;
        margin: 0;
      }
      .tutorial-title {
        margin: 6px 0 0;
        font-size: 14px;
      }
      .tutorial-body {
        margin: 8px 0 0;
        font-size: 12px;
        line-height: 1.4;
      }
      .tutorial-actions {
        margin-top: 10px;
        display: flex;
        gap: 6px;
      }
      .tutorial-actions .icon-btn {
        flex: 1;
      }
    </style>
    <button id="fab" class="fab hidden">Wandering_bot</button>
    <div id="panel" class="wrap">
      <div class="head">
        <div class="title">Wandering_bot</div>
        <div class="controls">
          <button id="tutorialBtn" class="icon-btn" title="Tutorial">?</button>
          <button id="min" class="icon-btn" title="Minimize">-</button>
        </div>
      </div>
      <div class="body">
        <div id="meta" class="meta muted">Capturing question...</div>
        <div class="quick">
          <button data-msg="Give me a small nudge.">Nudge</button>
          <button data-msg="Give me the next hint.">Next hint</button>
          <button data-msg="Check my approach:">Debug idea</button>
          <button id="visualBtn" class="visual">Replay</button>
        </div>
        <textarea id="input" placeholder="Ask for help or paste your approach..."></textarea>
        <button id="send" class="send">Send</button>
        <div id="output" class="output muted">Ask for a hint to start.</div>
        <div id="diagramWrap" class="diagram-wrap hidden">
          <div class="quick">
            <button id="diagramPrev">Prev</button>
            <button id="diagramPlay">Play</button>
            <button id="diagramNext">Next</button>
          </div>
          <div id="diagramSvg"></div>
          <div id="diagramNote" class="diagram-note"></div>
        </div>
      </div>
    </div>
    <div id="tutorialOverlay" class="tutorial-overlay hidden">
      <div class="tutorial-card">
        <p id="tutorialStepMeta" class="tutorial-step">Step 1/1</p>
        <p id="tutorialTitle" class="tutorial-title">Welcome</p>
        <p id="tutorialBody" class="tutorial-body"></p>
        <div class="tutorial-actions">
          <button id="tutorialBack" class="icon-btn">Back</button>
          <button id="tutorialNext" class="icon-btn">Next</button>
          <button id="tutorialClose" class="icon-btn">Close</button>
        </div>
      </div>
    </div>
    <div id="liveTip" class="live hidden">
      <div class="live-head">
        <span>Live tip</span>
        <button id="liveToggle" class="live-btn">Pause</button>
      </div>
      <div id="liveText">Start typing to get tips.</div>
    </div>
  `;

  const panel = shadow.getElementById("panel");
  const fab = shadow.getElementById("fab");
  const metaEl = shadow.getElementById("meta");
  const inputEl = shadow.getElementById("input");
  const outputEl = shadow.getElementById("output");
  const sendBtn = shadow.getElementById("send");
  const minBtn = shadow.getElementById("min");
  const tutorialBtn = shadow.getElementById("tutorialBtn");
  const visualBtn = shadow.getElementById("visualBtn");
  const diagramWrapEl = shadow.getElementById("diagramWrap");
  const diagramSvgEl = shadow.getElementById("diagramSvg");
  const diagramNoteEl = shadow.getElementById("diagramNote");
  const diagramPrevEl = shadow.getElementById("diagramPrev");
  const diagramPlayEl = shadow.getElementById("diagramPlay");
  const diagramNextEl = shadow.getElementById("diagramNext");
  const liveTipEl = shadow.getElementById("liveTip");
  const liveTextEl = shadow.getElementById("liveText");
  const liveToggleEl = shadow.getElementById("liveToggle");
  const tutorialOverlayEl = shadow.getElementById("tutorialOverlay");
  const tutorialStepMetaEl = shadow.getElementById("tutorialStepMeta");
  const tutorialTitleEl = shadow.getElementById("tutorialTitle");
  const tutorialBodyEl = shadow.getElementById("tutorialBody");
  const tutorialBackEl = shadow.getElementById("tutorialBack");
  const tutorialNextEl = shadow.getElementById("tutorialNext");
  const tutorialCloseEl = shadow.getElementById("tutorialClose");

  let currentTimeline = null;
  let currentStepIndex = 0;
  let playTimer = null;

  const tutorialSteps = [
    {
      title: "Welcome",
      body: "This walkthrough shows setup, hint flow, and replay controls inside this page widget."
    },
    {
      title: "Capture Context",
      body: "Wandering_bot auto-reads current problem details and your editor code before giving guidance."
    },
    {
      title: "Hint Controls",
      body: "Use Nudge, Next hint, or Debug idea for progressive guidance without full spoon-feeding."
    },
    {
      title: "Replay",
      body: "Click Replay, then step through with Prev/Next/Play to inspect state transitions."
    },
    {
      title: "Live Tips",
      body: "Live tip monitors code edits and gives short tactical nudges. Use Pause/Resume anytime."
    }
  ];
  let tutorialIndex = 0;

  function renderTutorialStep() {
    const step = tutorialSteps[tutorialIndex];
    tutorialStepMetaEl.textContent = "Step " + String(tutorialIndex + 1) + "/" + String(tutorialSteps.length);
    tutorialTitleEl.textContent = step.title;
    tutorialBodyEl.textContent = step.body;
    tutorialBackEl.disabled = tutorialIndex === 0;
    tutorialNextEl.textContent = tutorialIndex >= tutorialSteps.length - 1 ? "Finish" : "Next";
  }

  function openTutorial() {
    tutorialIndex = 0;
    renderTutorialStep();
    tutorialOverlayEl.classList.remove("hidden");
  }

  function closeTutorial() {
    tutorialOverlayEl.classList.add("hidden");
  }

  function nextTutorialStep() {
    if (tutorialIndex >= tutorialSteps.length - 1) {
      closeTutorial();
      return;
    }
    tutorialIndex += 1;
    renderTutorialStep();
  }

  function prevTutorialStep() {
    if (tutorialIndex <= 0) {
      return;
    }
    tutorialIndex -= 1;
    renderTutorialStep();
  }

  async function setMetaText() {
    const ctx = await getProblemContext();
    metaEl.textContent = `${ctx.title} (${ctx.slug})`;
  }

  async function sendMessage(message) {
    const userMessage = (message || "").trim() || "Give me the first hint.";
    outputEl.classList.add("muted");
    outputEl.textContent = "Thinking...";

    try {
      const payload = {
        context: await getProblemContext(),
        userMessage,
        unlockCode: false
      };

      const response = await chrome.runtime.sendMessage({
        type: "LC_COACH_CHAT",
        payload
      });

      if (!response?.ok) {
        throw new Error(response?.error || "Coach request failed.");
      }

      outputEl.classList.remove("muted");
      outputEl.textContent = response.result?.text || "No response.";
    } catch (error) {
      outputEl.classList.add("muted");
      outputEl.textContent = `Error: ${String(error)}`;
    }
  }

  function stopReplay() {
    if (playTimer) {
      clearInterval(playTimer);
      playTimer = null;
    }
    diagramPlayEl.textContent = "Play";
  }

  function renderTimelineStep() {
    const steps = currentTimeline?.steps || [];
    const step = steps[currentStepIndex];
    if (!step) {
      return;
    }
    const type = currentTimeline?.type || "array_pointers";
    const title = `${currentTimeline.title || "Algorithm replay"} | Step ${currentStepIndex + 1}/${steps.length}`;
    diagramSvgEl.innerHTML = renderTimelineSvg(step, title, type);
    const sourceText =
      currentTimeline?.source === "trace_server" ? "Source: traced Python execution" : "Source: model replay planner";
    diagramNoteEl.textContent = `${step.note || ""}${currentTimeline.summary ? ` | ${currentTimeline.summary}` : ""} | ${sourceText}`;
  }

  function setStepIndex(nextIndex) {
    const steps = currentTimeline?.steps || [];
    if (!steps.length) {
      return;
    }
    const clamped = Math.max(0, Math.min(steps.length - 1, nextIndex));
    currentStepIndex = clamped;
    renderTimelineStep();
  }

  async function sendVisual(message) {
    diagramWrapEl.classList.remove("hidden");
    diagramNoteEl.textContent = "Generating replay...";
    diagramSvgEl.textContent = "";
    stopReplay();

    try {
      const response = await chrome.runtime.sendMessage({
        type: "LC_COACH_VISUAL_TIMELINE",
        payload: {
          context: await getProblemContext(),
          userMessage: (message || "").trim() || "Generate a step-by-step replay for this problem."
        }
      });

      if (!response?.ok) {
        throw new Error(response?.error || "Visual request failed.");
      }

      currentTimeline = {
        ...(response.result?.timeline || {}),
        source: response.result?.source || "model"
      };
      currentStepIndex = 0;
      renderTimelineStep();
    } catch (error) {
      diagramNoteEl.textContent = `Visual error: ${String(error)}`;
    }
  }

  let liveEnabled = true;
  let liveTimer = null;
  let lastLiveSignature = "";
  let lastLiveAt = 0;

  async function sendLiveTip() {
    if (!liveEnabled) {
      return;
    }

    const now = Date.now();
    if (now - lastLiveAt < 12000) {
      return;
    }

    const context = await getProblemContext();
    const code = context.code || "";
    if (code.length < 20) {
      liveTipEl.classList.add("hidden");
      return;
    }

    const signature = `${code.length}:${code.slice(0, 200)}:${code.slice(-200)}`;
    if (signature === lastLiveSignature) {
      return;
    }

    lastLiveSignature = signature;
    lastLiveAt = now;
    liveTipEl.classList.remove("hidden");
    liveTextEl.textContent = "Reviewing your code...";

    try {
      const payload = {
        context,
        userMessage: "Give 1-2 brief tips based on my current code. Keep under 45 words.",
        unlockCode: false
      };

      const response = await chrome.runtime.sendMessage({
        type: "LC_COACH_CHAT",
        payload
      });

      if (!response?.ok) {
        throw new Error(response?.error || "Coach request failed.");
      }

      liveTextEl.textContent = response.result?.text || "No response.";
    } catch (error) {
      liveTextEl.textContent = `Live tip error: ${String(error)}`;
    }
  }

  function scheduleLiveTip() {
    if (!liveEnabled) {
      return;
    }
    if (liveTimer) {
      clearTimeout(liveTimer);
    }
    liveTimer = setTimeout(() => {
      sendLiveTip();
    }, 1400);
  }

  sendBtn.addEventListener("click", () => {
    sendMessage(inputEl.value);
  });

  visualBtn.addEventListener("click", () => {
    sendVisual(inputEl.value);
  });

  diagramPrevEl.addEventListener("click", () => {
    stopReplay();
    setStepIndex(currentStepIndex - 1);
  });

  diagramNextEl.addEventListener("click", () => {
    stopReplay();
    setStepIndex(currentStepIndex + 1);
  });

  diagramPlayEl.addEventListener("click", () => {
    const steps = currentTimeline?.steps || [];
    if (steps.length < 2) {
      return;
    }

    if (playTimer) {
      stopReplay();
      return;
    }

    diagramPlayEl.textContent = "Pause";
    playTimer = setInterval(() => {
      if (!currentTimeline?.steps?.length) {
        stopReplay();
        return;
      }
      if (currentStepIndex >= currentTimeline.steps.length - 1) {
        stopReplay();
        return;
      }
      setStepIndex(currentStepIndex + 1);
    }, 1200);
  });

  inputEl.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      sendMessage(inputEl.value);
    }
  });

  shadow.querySelectorAll("button[data-msg]").forEach((button) => {
    button.addEventListener("click", () => {
      const prefix = button.getAttribute("data-msg") || "";
      const suffix = inputEl.value.trim();
      const finalMessage = suffix && /:$/.test(prefix) ? `${prefix} ${suffix}` : prefix || suffix;
      sendMessage(finalMessage);
    });
  });

  minBtn.addEventListener("click", () => {
    panel.classList.add("hidden");
    fab.classList.remove("hidden");
  });

  fab.addEventListener("click", () => {
    fab.classList.add("hidden");
    panel.classList.remove("hidden");
  });

  liveToggleEl.addEventListener("click", () => {
    liveEnabled = !liveEnabled;
    liveToggleEl.textContent = liveEnabled ? "Pause" : "Resume";
    if (!liveEnabled) {
      liveTipEl.classList.add("hidden");
    }
  });


  tutorialBtn.addEventListener("click", () => {
    openTutorial();
  });

  tutorialBackEl.addEventListener("click", () => {
    prevTutorialStep();
  });

  tutorialNextEl.addEventListener("click", () => {
    nextTutorialStep();
  });

  tutorialCloseEl.addEventListener("click", () => {
    closeTutorial();
  });

  tutorialOverlayEl.addEventListener("click", (event) => {
    if (event.target === tutorialOverlayEl) {
      closeTutorial();
    }
  });
  setMetaText();
  liveTipEl.classList.remove("hidden");

  const editorObserver = new MutationObserver(() => {
    const inputArea =
      document.querySelector(".monaco-editor textarea.inputarea") ||
      document.querySelector(".CodeMirror textarea") ||
      document.querySelector("textarea");
    if (inputArea && !inputArea.__lcCoachBound) {
      inputArea.__lcCoachBound = true;
      inputArea.addEventListener("input", scheduleLiveTip);
      inputArea.addEventListener("keydown", scheduleLiveTip);
      scheduleLiveTip();
    }
  });

  editorObserver.observe(document.body, { childList: true, subtree: true });
}

if (/^\/problems\/[^/]+/.test(window.location.pathname)) {
  injectPageBridge();
  createCoachWidget();
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "LC_GET_CONTEXT") {
    (async () => {
      try {
        sendResponse({ ok: true, context: await getProblemContext() });
      } catch (error) {
        sendResponse({ ok: false, error: String(error) });
      }
    })();
    return true;
  }

  return false;
});
