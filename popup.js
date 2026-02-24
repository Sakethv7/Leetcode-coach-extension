const providerEl = document.getElementById("provider");
const endpointEl = document.getElementById("endpoint");
const modelEl = document.getElementById("model");
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

let cachedContext = null;

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
      <text x="12" y="20" font-size="13" fill="#dce6ff" font-weight="700">${escapeXml(spec?.title || "Array pointer walkthrough")}</text>
      ${cells}
      ${pointerGroup("low", spec?.low, "#6ee7b7", 36)}
      ${pointerGroup("mid", spec?.mid, "#fbbf24", 54)}
      ${pointerGroup("high", spec?.high, "#f87171", 72)}
    </svg>
  `;
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

  const response = await chrome.runtime.sendMessage({
    type: "LC_COACH_CHAT",
    payload
  });

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
  diagramMetaEl.textContent = "Generating visual...";
  diagramSvgEl.textContent = "";

  const response = await chrome.runtime.sendMessage({
    type: "LC_COACH_VISUAL",
    payload: {
      context: cachedContext,
      userMessage: userInputEl.value.trim() || "Explain this problem visually."
    }
  });

  if (!response?.ok) {
    throw new Error(response?.error || "Visual generation failed.");
  }

  const spec = response.result?.spec || {};
  diagramSvgEl.innerHTML = renderArrayPointerSvg(spec);
  diagramMetaEl.textContent = spec.note || "Visual guide ready.";
}

async function loadConfig() {
  const response = await chrome.runtime.sendMessage({ type: "LC_COACH_GET_CONFIG" });
  if (!response?.ok || !response.config) {
    return;
  }

  providerEl.value = response.config.provider || "ollama";
  endpointEl.value = response.config.endpoint || "http://127.0.0.1:11434";
  modelEl.value = response.config.model || "kimi-k2:1t-cloud";
}

function updateRetentionEnabled() {
  retentionDaysEl.disabled = !autoExpiryEnabledEl.checked;
}

async function saveConfig() {
  const payload = {
    provider: providerEl.value,
    endpoint: endpointEl.value.trim(),
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
  setOutput("Coach data cleared.");
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

document.querySelectorAll("button[data-msg]").forEach((button) => {
  button.addEventListener("click", () => {
    const message = button.getAttribute("data-msg") || "Give me the first hint.";
    sendToCoach(message).catch((error) => setOutput(String(error)));
  });
});

loadConfig().catch(() => {});
loadPrivacy().catch(() => {});
