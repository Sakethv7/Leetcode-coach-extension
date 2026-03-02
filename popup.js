const providerEl = document.getElementById("provider");
const endpointEl = document.getElementById("endpoint");
const modelEl = document.getElementById("model");
const traceEndpointEl = document.getElementById("traceEndpoint");
const saveConfigEl = document.getElementById("saveConfig");
const autoExpiryEnabledEl = document.getElementById("autoExpiryEnabled");
const retentionDaysEl = document.getElementById("retentionDays");
const savePrivacyEl = document.getElementById("savePrivacy");
const clearDataEl = document.getElementById("clearData");
const captureEl = document.getElementById("capture");
const sendEl = document.getElementById("send");
const outputEl = document.getElementById("output");
const userInputEl = document.getElementById("userInput");
const unlockCodeEl = document.getElementById("unlockCode");
const problemMetaEl = document.getElementById("problemMeta");
const stateMetaEl = document.getElementById("stateMeta");
const visualizeEl = document.getElementById("visualize");
const diagramWrapEl = document.getElementById("diagramWrap");
const diagramMetaEl = document.getElementById("diagramMeta");
const diagramSvgEl = document.getElementById("diagramSvg");
const diagramPrevEl = document.getElementById("diagramPrev");
const diagramPlayEl = document.getElementById("diagramPlay");
const diagramNextEl = document.getElementById("diagramNext");
const diagramProgressEl = document.getElementById("diagramProgress");
const openTutorialEl = document.getElementById("openTutorial");
const tutorialOverlayEl = document.getElementById("tutorialOverlay");
const tutorialStepMetaEl = document.getElementById("tutorialStepMeta");
const tutorialTitleEl = document.getElementById("tutorialTitle");
const tutorialBodyEl = document.getElementById("tutorialBody");
const tutorialBackEl = document.getElementById("tutorialBack");
const tutorialNextEl = document.getElementById("tutorialNext");
const tutorialCloseEl = document.getElementById("tutorialClose");

let cachedContext = null;
let currentTimeline = null;
let currentStepIndex = 0;
let playTimer = null;

const tutorialSteps = [
  {
    title: "Welcome",
    body: "This tutorial shows the core flow: configure model, capture problem, ask hints, and replay algorithm states."
  },
  {
    title: "Save Config",
    body: "Set Provider, Endpoint, Model, and optionally Python Trace Endpoint. Then click Save Config."
  },
  {
    title: "Capture Problem",
    body: "Open a LeetCode problem tab, then click Capture Problem so Wandering_bot can read title, statement, examples, and code."
  },
  {
    title: "Ask For Help",
    body: "Use Nudge, Next Hint, or type your own question in the textbox and click Send for strategic guidance."
  },
  {
    title: "Generate Replay",
    body: "Click Generate Replay. Use Prev, Next, and Play to inspect each algorithm state transition."
  },
  {
    title: "Done",
    body: "You can reopen this tutorial anytime from the Tutorial button near the title."
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

function setOutput(text) {
  outputEl.textContent = text;
}

function setStateMeta(state) {
  if (!state) {
    stateMetaEl.textContent = "";
    return;
  }
  stateMetaEl.textContent = `Hints used: ${state.hintsGiven || 0} | Code unlocked: ${Boolean(state.unlockCode)}`;
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
  const width = Math.max(360, count * 64 + 24);
  const height = 220;
  const top = 88;
  const startX = 12;
  const boxW = 52;

  function cellCenter(i) {
    return startX + i * 64 + boxW / 2;
  }

  function pointerGroup(label, idx, color, yTop) {
    if (idx === null || idx === undefined || idx < 0 || idx >= values.length) {
      return "";
    }
    const x = cellCenter(idx);
    return [
      `<line x1="${x}" y1="${yTop}" x2="${x}" y2="${top - 12}" stroke="${color}" stroke-width="2"/>`,
      `<polygon points="${x - 5},${top - 12} ${x + 5},${top - 12} ${x},${top - 2}" fill="${color}"/>`,
      `<text x="${x}" y="${yTop - 6}" text-anchor="middle" font-size="12" fill="${color}" font-weight="700">${escapeXml(label)}=${idx}</text>`
    ].join("");
  }

  const cells = values
    .map((value, i) => {
      const x = startX + i * 64;
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
      <text x="12" y="20" font-size="13" fill="#dce6ff" font-weight="700">${escapeXml(spec?.title || "Array pointer replay")}</text>
      ${cells}
      ${pointerGroup("low", spec?.low, "#6ee7b7", 36)}
      ${pointerGroup("mid", spec?.mid, "#fbbf24", 54)}
      ${pointerGroup("high", spec?.high, "#f87171", 72)}
    </svg>
  `;
}

function renderLinkedListSvg(spec) {
  const nodes = Array.isArray(spec?.nodes) ? spec.nodes.slice(0, 10) : [1, 2, 3, 4];
  const width = Math.max(360, nodes.length * 78 + 20);
  const height = 200;
  const y = 90;
  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Linked list diagram">
      <rect x="0" y="0" width="${width}" height="${height}" fill="#0b1220" rx="8"/>
      <text x="12" y="20" font-size="13" fill="#dce6ff" font-weight="700">${escapeXml(spec?.title || "Linked list replay")}</text>
      ${nodes
        .map((value, i) => {
          const x = 12 + i * 78;
          const markers = [spec?.head === i ? "H" : "", spec?.current === i ? "C" : "", spec?.slow === i ? "S" : "", spec?.fast === i ? "F" : ""]
            .filter(Boolean)
            .join("/");
          return [
            `<rect x="${x}" y="${y}" width="52" height="34" rx="6" fill="#0f1c35" stroke="#3c5c94"/>`,
            `<text x="${x + 26}" y="${y + 22}" text-anchor="middle" font-size="13" fill="#ecf1ff">${escapeXml(value)}</text>`,
            i < nodes.length - 1
              ? `<line x1="${x + 52}" y1="${y + 17}" x2="${x + 72}" y2="${y + 17}" stroke="#6a86bf" stroke-width="2"/><polygon points="${x + 72},${y + 17} ${x + 66},${y + 13} ${x + 66},${y + 21}" fill="#6a86bf"/>`
              : "",
            `<text x="${x + 26}" y="${y + 52}" text-anchor="middle" font-size="10" fill="#9eb0dc">${i}</text>`,
            markers ? `<text x="${x + 26}" y="${y - 8}" text-anchor="middle" font-size="10" fill="#fbbf24">${markers}</text>` : ""
          ].join("");
        })
        .join("")}
    </svg>
  `;
}

function renderStackQueueSvg(spec) {
  const items = Array.isArray(spec?.items) ? spec.items.slice(0, 8) : [1, 2, 3];
  const mode = spec?.mode === "queue" ? "queue" : "stack";
  const title = escapeXml(spec?.title || "Stack/Queue replay");

  if (mode === "stack") {
    const count = items.length;
    const itemH = 28;
    const gap = 3;
    const itemW = 180;
    const startX = 30;
    const topY = 36;
    const bottomY = topY + count * (itemH + gap);
    const svgW = 300;
    const svgH = bottomY + 28;

    const cellsSvg = items
      .map((value, i) => {
        const isTop = i === count - 1;
        const isActive = spec?.active === i;
        const y = topY + (count - 1 - i) * (itemH + gap);
        return [
          `<rect x="${startX}" y="${y}" width="${itemW}" height="${itemH}" rx="5"`,
          ` fill="${isActive ? "#2a4e89" : "#0f1c35"}"`,
          ` stroke="${isTop ? "#6ee7b7" : "#304c7b"}" stroke-width="${isTop ? 2 : 1}"/>`,
          `<text x="${startX + itemW / 2}" y="${y + 18}" text-anchor="middle" font-size="13" fill="#ecf1ff">${escapeXml(value)}</text>`,
          isTop ? `<text x="${startX + itemW + 10}" y="${y + 18}" font-size="11" fill="#6ee7b7">← TOP</text>` : ""
        ].join("");
      })
      .join("");

    return `
      <svg viewBox="0 0 ${svgW} ${svgH}" role="img" aria-label="Stack diagram">
        <rect x="0" y="0" width="${svgW}" height="${svgH}" fill="#0b1220" rx="8"/>
        <text x="12" y="18" font-size="13" fill="#dce6ff" font-weight="700">${title} (stack)</text>
        <line x1="${startX}" y1="${topY}" x2="${startX}" y2="${bottomY}" stroke="#4b6ea8" stroke-width="2"/>
        <line x1="${startX + itemW}" y1="${topY}" x2="${startX + itemW}" y2="${bottomY}" stroke="#4b6ea8" stroke-width="2"/>
        ${cellsSvg}
        <text x="${startX + itemW / 2}" y="${bottomY + 16}" text-anchor="middle" font-size="10" fill="#9eb0dc">BOTTOM</text>
      </svg>
    `;
  }

  // Queue: horizontal, items[0]=FRONT (dequeue side), items[last]=BACK (enqueue side)
  const count = items.length;
  const boxW = Math.max(38, Math.min(52, Math.floor(300 / Math.max(1, count))));
  const boxGap = 3;
  const boxH = 36;
  const queueY = 55;
  const startX = 36;
  const totalBoxW = count * (boxW + boxGap) - boxGap;
  const svgW = Math.max(360, startX + totalBoxW + 50);
  const svgH = queueY + boxH + 36;
  const midY = queueY + boxH / 2;

  const cellsSvg = items
    .map((value, i) => {
      const x = startX + i * (boxW + boxGap);
      const isFront = i === 0;
      const isBack = i === count - 1;
      const isActive = spec?.active === i;
      return [
        `<rect x="${x}" y="${queueY}" width="${boxW}" height="${boxH}" rx="5"`,
        ` fill="${isActive ? "#2a4e89" : "#0f1c35"}"`,
        ` stroke="${isFront ? "#6ee7b7" : isBack ? "#fbbf24" : "#304c7b"}"`,
        ` stroke-width="${isFront || isBack ? 2 : 1}"/>`,
        `<text x="${x + boxW / 2}" y="${queueY + 22}" text-anchor="middle" font-size="12" fill="#ecf1ff">${escapeXml(value)}</text>`
      ].join("");
    })
    .join("");

  return `
    <svg viewBox="0 0 ${svgW} ${svgH}" role="img" aria-label="Queue diagram">
      <rect x="0" y="0" width="${svgW}" height="${svgH}" fill="#0b1220" rx="8"/>
      <text x="12" y="18" font-size="13" fill="#dce6ff" font-weight="700">${title} (queue)</text>
      <polygon points="${startX - 14},${midY} ${startX - 4},${midY - 5} ${startX - 4},${midY + 5}" fill="#6ee7b7"/>
      ${cellsSvg}
      <polygon points="${startX + totalBoxW + 14},${midY} ${startX + totalBoxW + 4},${midY - 5} ${startX + totalBoxW + 4},${midY + 5}" fill="#fbbf24"/>
      <text x="${startX + boxW / 2}" y="${queueY + boxH + 16}" text-anchor="middle" font-size="10" fill="#6ee7b7">FRONT</text>
      <text x="${startX + totalBoxW - boxW / 2}" y="${queueY + boxH + 16}" text-anchor="middle" font-size="10" fill="#fbbf24">BACK</text>
    </svg>
  `;
}

function renderGraphBfsSvg(spec) {
  const nodes = Array.isArray(spec?.nodes) ? spec.nodes.slice(0, 8) : ["A", "B", "C", "D"];
  const cx = 150;
  const cy = 130;
  const radius = 72;
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
    <svg viewBox="0 0 440 250" role="img" aria-label="Graph BFS diagram">
      <rect x="0" y="0" width="440" height="250" fill="#0b1220" rx="8"/>
      <text x="12" y="20" font-size="13" fill="#dce6ff" font-weight="700">${escapeXml(spec?.title || "Graph BFS replay")}</text>
      ${edges
        .map((edge) => {
          if (!Array.isArray(edge) || edge.length < 2) return "";
          const a = pos.get(String(edge[0]));
          const b = pos.get(String(edge[1]));
          if (!a || !b) return "";
          return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#7aa3d4" stroke-width="2"/>`;
        })
        .join("")}
      ${nodes
        .map((node) => {
          const p = pos.get(String(node));
          if (!p) return "";
          const isCurrent = String(spec?.current || "") === String(node);
          const isVisited = visited.has(String(node));
          return [
            `<circle cx="${p.x}" cy="${p.y}" r="16" fill="${isCurrent ? "#d97706" : isVisited ? "#1f7a55" : "#112443"}" stroke="#6f93cf"/>`,
            `<text x="${p.x}" y="${p.y + 4}" text-anchor="middle" font-size="12" fill="#f4f8ff">${escapeXml(node)}</text>`
          ].join("");
        })
        .join("")}
      <text x="260" y="92" font-size="11" fill="#9eb0dc">Queue</text>
      <rect x="260" y="102" width="160" height="28" rx="6" fill="#112443" stroke="#3d629f"/>
      <text x="268" y="121" font-size="11" fill="#dce6ff">${escapeXml(queueText || "(empty)")}</text>
    </svg>
  `;
}

function renderDpTableSvg(spec) {
  const table = Array.isArray(spec?.table) ? spec.table : [["0", "0"], ["0", "0"]];
  const rows = table.slice(0, 8).map((row) => (Array.isArray(row) ? row.slice(0, 10) : []));
  const safeRows = rows.length ? rows : [["0", "0"], ["0", "0"]];
  const cols = safeRows[0].length || 2;
  const cellW = 32;
  const cellH = 26;
  const labelW = 24;
  const headerH = 18;
  const startX = 16 + labelW;
  const startY = 44 + headerH;
  const width = Math.max(360, cols * cellW + 50 + labelW);
  const height = Math.max(220, safeRows.length * cellH + 80 + headerH);

  const colLabels = Array.from({ length: cols }, (_, c) =>
    `<text x="${startX + c * cellW + (cellW - 2) / 2}" y="${startY - 4}" text-anchor="middle" font-size="10" fill="#9eb0dc">${c}</text>`
  ).join("");

  const rowLabels = safeRows
    .map((_, r) =>
      `<text x="${startX - 4}" y="${startY + r * cellH + (cellH - 2) / 2 + 4}" text-anchor="end" font-size="10" fill="#9eb0dc">${r}</text>`
    )
    .join("");

  const cells = safeRows
    .map((row, r) =>
      row
        .map((cell, c) => {
          const x = startX + c * cellW;
          const y = startY + r * cellH;
          const active = spec?.row === r && spec?.col === c;
          return [
            `<rect x="${x}" y="${y}" width="${cellW - 2}" height="${cellH - 2}" rx="4" fill="${active ? "#2a4e89" : "#112443"}" stroke="${active ? "#6a9fd8" : "#4b6ea8"}"/>`,
            `<text x="${x + (cellW - 2) / 2}" y="${y + 17}" text-anchor="middle" font-size="11" fill="#ecf1ff">${escapeXml(cell)}</text>`
          ].join("");
        })
        .join("")
    )
    .join("");

  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="DP table diagram">
      <rect x="0" y="0" width="${width}" height="${height}" fill="#0b1220" rx="8"/>
      <text x="12" y="20" font-size="13" fill="#dce6ff" font-weight="700">${escapeXml(spec?.title || "DP table replay")}</text>
      ${colLabels}
      ${rowLabels}
      ${cells}
    </svg>
  `;
}

function renderBinaryTreeSvg(spec) {
  const nodesRaw = Array.isArray(spec?.nodes) ? spec.nodes.slice(0, 15) : [1, 2, 3, 4, 5];
  const nodes = nodesRaw.map((v) => (v === null || v === undefined ? null : v));
  const visited = new Set(Array.isArray(spec?.visited) ? spec.visited : []);
  const highlight = new Set(Array.isArray(spec?.highlight) ? spec.highlight : []);
  const current = spec?.current ?? null;

  const levels = Math.max(1, Math.ceil(Math.log2(nodes.length + 1)));
  const leafCount = Math.pow(2, levels - 1);
  const slotW = Math.max(36, Math.floor(360 / leafCount));
  const totalWidth = Math.max(360, leafCount * slotW + 20);
  const totalHeight = levels * 60 + 50;
  const nodeRadius = Math.min(16, Math.floor(slotW * 0.35));

  function nodePos(i) {
    const level = Math.floor(Math.log2(i + 1));
    const posInLevel = i - (Math.pow(2, level) - 1);
    const slotsPerNode = leafCount / Math.pow(2, level);
    return {
      x: Math.round((posInLevel * slotsPerNode + slotsPerNode / 2) * slotW + 10),
      y: 40 + level * 60
    };
  }

  const edges = nodes
    .map((_, i) => {
      if (nodes[i] === null) return "";
      const p = nodePos(i);
      return [2 * i + 1, 2 * i + 2]
        .filter((c) => c < nodes.length && nodes[c] !== null)
        .map((c) => {
          const cp = nodePos(c);
          return `<line x1="${p.x}" y1="${p.y}" x2="${cp.x}" y2="${cp.y}" stroke="#6a86bf" stroke-width="2"/>`;
        })
        .join("");
    })
    .join("");

  const nodeSvg = nodes
    .map((value, i) => {
      if (value === null) return "";
      const { x, y } = nodePos(i);
      const fill = current === i ? "#d97706" : highlight.has(i) ? "#7c3aed" : visited.has(i) ? "#1f7a55" : "#112443";
      const stroke = current === i ? "#fbbf24" : highlight.has(i) ? "#a78bfa" : "#6f93cf";
      return [
        `<circle cx="${x}" cy="${y}" r="${nodeRadius}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`,
        `<text x="${x}" y="${y + 5}" text-anchor="middle" font-size="${Math.max(9, nodeRadius - 2)}" fill="#f4f8ff" font-weight="600">${escapeXml(value)}</text>`
      ].join("");
    })
    .join("");

  return `
    <svg viewBox="0 0 ${totalWidth} ${totalHeight}" role="img" aria-label="Binary tree diagram">
      <rect x="0" y="0" width="${totalWidth}" height="${totalHeight}" fill="#0b1220" rx="8"/>
      <text x="12" y="18" font-size="13" fill="#dce6ff" font-weight="700">${escapeXml(spec?.title || "Binary tree replay")}</text>
      ${edges}
      ${nodeSvg}
    </svg>
  `;
}

function renderTimelineSvg(step, title, type) {
  const spec = { ...(step || {}), title };
  if (type === "linked_list") return renderLinkedListSvg(spec);
  if (type === "stack_queue") return renderStackQueueSvg(spec);
  if (type === "graph_bfs") return renderGraphBfsSvg(spec);
  if (type === "dp_table") return renderDpTableSvg(spec);
  if (type === "binary_tree") return renderBinaryTreeSvg(spec);
  return renderArrayPointerSvg(spec);
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
  const sourceText = currentTimeline?.source === "trace_server" ? "Source: traced Python execution" : "Source: model replay planner";
  diagramMetaEl.textContent = `${step.note || ""}${currentTimeline.summary ? ` | ${currentTimeline.summary}` : ""} | ${sourceText}`;
  diagramProgressEl.innerHTML = steps.map((_, i) => `<span class="dot${i === currentStepIndex ? " active" : ""}"></span>`).join("");
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

async function getActiveLeetCodeTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab?.id || !tab.url?.includes("leetcode.com/problems/")) {
    throw new Error("Open a LeetCode problem tab first.");
  }
  return tab;
}

async function captureContext() {
  const tab = await getActiveLeetCodeTab();
  const response = await chrome.tabs.sendMessage(tab.id, { type: "LC_GET_CONTEXT" });

  if (!response?.ok || !response.context) {
    throw new Error(response?.error || "Unable to capture problem context.");
  }

  cachedContext = response.context;
  problemMetaEl.textContent = `${cachedContext.title} (${cachedContext.slug})`;
  setOutput(`Captured: ${cachedContext.title}\n\nNow ask for a hint or paste your approach.`);
}

async function sendToCoach(userMessage) {
  if (!cachedContext) {
    await captureContext();
  }

  const payload = {
    context: cachedContext,
    userMessage,
    unlockCode: unlockCodeEl.checked
  };

  const response = await chrome.runtime.sendMessage({ type: "LC_COACH_CHAT", payload });

  if (!response?.ok) {
    throw new Error(response?.error || "Coach request failed.");
  }

  setOutput(response.result.text || "No response.");
  setStateMeta(response.result.state);
}

async function sendVisualRequest() {
  if (!cachedContext) {
    await captureContext();
  }

  diagramWrapEl.classList.remove("hidden");
  diagramMetaEl.textContent = "Generating replay...";
  diagramSvgEl.textContent = "";
  stopReplay();

  const response = await chrome.runtime.sendMessage({
    type: "LC_COACH_VISUAL_TIMELINE",
    payload: {
      context: cachedContext,
      userMessage: userInputEl.value.trim() || "Generate a step-by-step replay for this problem."
    }
  });

  if (!response?.ok) {
    throw new Error(response?.error || "Visual generation failed.");
  }

  currentTimeline = {
    ...(response.result?.timeline || {}),
    source: response.result?.source || "model"
  };
  currentStepIndex = 0;
  renderTimelineStep();
}

async function loadConfig() {
  const response = await chrome.runtime.sendMessage({ type: "LC_COACH_GET_CONFIG" });
  if (!response?.ok || !response.config) {
    return;
  }

  providerEl.value = response.config.provider || "ollama";
  endpointEl.value = response.config.endpoint || "http://127.0.0.1:11434";
  traceEndpointEl.value = response.config.traceEndpoint || "http://127.0.0.1:8765";
  modelEl.value = response.config.model || "kimi-k2:1t-cloud";
}

function updateRetentionEnabled() {
  retentionDaysEl.disabled = !autoExpiryEnabledEl.checked;
}

async function saveConfig() {
  const payload = {
    provider: providerEl.value,
    endpoint: endpointEl.value.trim(),
    traceEndpoint: traceEndpointEl.value.trim(),
    model: modelEl.value.trim()
  };

  const response = await chrome.runtime.sendMessage({ type: "LC_COACH_SAVE_CONFIG", payload });
  if (!response?.ok) {
    throw new Error(response?.error || "Failed to save config.");
  }

  setOutput("Config saved.");
}

async function loadPrivacy() {
  const response = await chrome.runtime.sendMessage({ type: "LC_COACH_GET_PRIVACY" });
  if (!response?.ok || !response.privacy) {
    return;
  }

  autoExpiryEnabledEl.checked = Boolean(response.privacy.autoExpiryEnabled);
  retentionDaysEl.value = String(response.privacy.retentionDays || 7);
  updateRetentionEnabled();
}

async function savePrivacy() {
  const retentionRaw = Number(retentionDaysEl.value);
  const payload = {
    autoExpiryEnabled: autoExpiryEnabledEl.checked,
    retentionDays: Number.isFinite(retentionRaw) ? retentionRaw : 7
  };

  const response = await chrome.runtime.sendMessage({ type: "LC_COACH_SAVE_PRIVACY", payload });
  if (!response?.ok) {
    throw new Error(response?.error || "Failed to save privacy settings.");
  }

  setOutput("Privacy settings saved.");
}

async function clearData() {
  const response = await chrome.runtime.sendMessage({ type: "LC_COACH_CLEAR_DATA" });
  if (!response?.ok) {
    throw new Error(response?.error || "Failed to clear data.");
  }

  setStateMeta(null);
  setOutput("Wandering_bot data cleared.");
}

saveConfigEl.addEventListener("click", () => {
  saveConfig().catch((error) => setOutput(String(error)));
});

savePrivacyEl.addEventListener("click", () => {
  savePrivacy().catch((error) => setOutput(String(error)));
});

clearDataEl.addEventListener("click", () => {
  clearData().catch((error) => setOutput(String(error)));
});

autoExpiryEnabledEl.addEventListener("change", updateRetentionEnabled);

captureEl.addEventListener("click", () => {
  captureContext().catch((error) => setOutput(String(error)));
});

sendEl.addEventListener("click", () => {
  const message = userInputEl.value.trim() || "Give me the first hint.";
  sendToCoach(message).catch((error) => setOutput(String(error)));
});

visualizeEl.addEventListener("click", () => {
  sendVisualRequest().catch((error) => setOutput(String(error)));
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
  }, 800);
});

document.querySelectorAll("button[data-msg]").forEach((button) => {
  button.addEventListener("click", () => {
    const message = button.getAttribute("data-msg") || "Give me the first hint.";
    sendToCoach(message).catch((error) => setOutput(String(error)));
  });
});


openTutorialEl.addEventListener("click", () => {
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
loadConfig().catch(() => {});
loadPrivacy().catch(() => {});
