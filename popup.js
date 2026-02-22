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

async function loadConfig() {
  const response = await chrome.runtime.sendMessage({ type: "LC_COACH_GET_CONFIG" });
  if (!response?.ok || !response.config) {
    return;
  }

  providerEl.value = response.config.provider || "ollama";
  endpointEl.value = response.config.endpoint || "http://127.0.0.1:11434";
  modelEl.value = response.config.model || "qwen2.5-coder:7b";
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

document.querySelectorAll("button[data-msg]").forEach((button) => {
  button.addEventListener("click", () => {
    const message = button.getAttribute("data-msg") || "Give me the first hint.";
    sendToCoach(message).catch((error) => setOutput(String(error)));
  });
});

loadConfig().catch(() => {});
loadPrivacy().catch(() => {});
