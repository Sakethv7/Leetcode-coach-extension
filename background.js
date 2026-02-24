const DEFAULT_CONFIG = {
  provider: "ollama",
  endpoint: "http://127.0.0.1:11434",
  model: "kimi-k2:1t-cloud",
  temperature: 0.3,
  maxTokens: 700
};

const STATE_KEY = "lc_coach_state_v1";
const PRIVACY_KEY = "lc_coach_privacy_v1";
const MAX_USER_MESSAGE_LEN = 4000;
const MAX_FIELD_LEN = 16000;
const MAX_MODEL_LEN = 120;
const ALLOWED_PROVIDERS = new Set(["ollama", "openai_compat"]);
const DEFAULT_PRIVACY = {
  autoExpiryEnabled: true,
  retentionDays: 7
};

async function getStore(keys) {
  return chrome.storage.local.get(keys);
}

async function setStore(values) {
  return chrome.storage.local.set(values);
}

function isLeetCodeProblemUrl(url) {
  return /^https:\/\/leetcode\.com\/problems\/[^/]+/.test(url || "");
}

function isTrustedChatSender(sender) {
  const popupUrl = chrome.runtime.getURL("popup.html");
  return sender?.url === popupUrl || isLeetCodeProblemUrl(sender?.tab?.url);
}

function isTrustedConfigSender(sender) {
  return sender?.url === chrome.runtime.getURL("popup.html");
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, n));
}

function normalizeText(value, maxLen) {
  return String(value || "").slice(0, maxLen);
}

function sanitizeContext(context) {
  return {
    url: normalizeText(context?.url, 300),
    slug: normalizeText(context?.slug, 120),
    title: normalizeText(context?.title, 200),
    description: normalizeText(context?.description, MAX_FIELD_LEN),
    examples: normalizeText(context?.examples, MAX_FIELD_LEN),
    code: normalizeText(context?.code, MAX_FIELD_LEN),
    language: normalizeText(context?.language, 80),
    capturedAt: normalizeText(context?.capturedAt, 64)
  };
}

function sanitizeConfig(configLike) {
  const candidate = { ...DEFAULT_CONFIG, ...(configLike || {}) };
  const provider = ALLOWED_PROVIDERS.has(candidate.provider) ? candidate.provider : DEFAULT_CONFIG.provider;
  const endpointRaw = normalizeText(candidate.endpoint, 500);
  let endpoint = DEFAULT_CONFIG.endpoint;

  try {
    const parsed = new URL(endpointRaw);
    const isLocalHost = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    const isHttp = parsed.protocol === "http:" || parsed.protocol === "https:";
    if (isLocalHost && isHttp) {
      endpoint = parsed.origin;
    }
  } catch (_error) {}

  return {
    provider,
    endpoint,
    model: normalizeText(candidate.model, MAX_MODEL_LEN) || DEFAULT_CONFIG.model,
    temperature: clampNumber(candidate.temperature, 0, 1.5, DEFAULT_CONFIG.temperature),
    maxTokens: Math.round(clampNumber(candidate.maxTokens, 64, 2048, DEFAULT_CONFIG.maxTokens))
  };
}

function sanitizePrivacy(privacyLike) {
  const candidate = { ...DEFAULT_PRIVACY, ...(privacyLike || {}) };
  return {
    autoExpiryEnabled: Boolean(candidate.autoExpiryEnabled),
    retentionDays: Math.round(clampNumber(candidate.retentionDays, 1, 365, DEFAULT_PRIVACY.retentionDays))
  };
}

function pruneExpiredState(allState, privacy) {
  if (!privacy.autoExpiryEnabled) {
    return { nextState: allState, changed: false };
  }

  const cutoffMs = Date.now() - privacy.retentionDays * 24 * 60 * 60 * 1000;
  const nextState = {};
  let changed = false;

  for (const [slug, entry] of Object.entries(allState || {})) {
    const updatedAtMs = Date.parse(entry?.updatedAt || "");
    const keep = Number.isFinite(updatedAtMs) && updatedAtMs >= cutoffMs;
    if (keep) {
      nextState[slug] = entry;
    } else {
      changed = true;
    }
  }

  return { nextState, changed };
}

function buildSystemPrompt() {
  return [
    "You are LeetCode Coach, a Socratic coding tutor.",
    "Never spoon-feed full solutions by default.",
    "Rules:",
    "1) Start by asking one short diagnostic question unless user explicitly asks for the next hint.",
    "2) Give progressive hints: Hint 1 (intuition), Hint 2 (data structure), Hint 3 (algorithm sketch).",
    "3) Do not provide full code unless unlockCode is true.",
    "4) If unlockCode is false and user asks code/answer, refuse politely and provide a next-step hint.",
    "5) Keep response concise: max 180 words.",
    "6) Always end with one concrete question for the learner.",
    "7) If user shares attempt, prioritize debugging their approach instead of replacing it."
  ].join("\n");
}

function buildContextPrompt(context, state) {
  return [
    `Problem: ${context?.title || "Unknown"} (${context?.slug || "n/a"})`,
    `URL: ${context?.url || "n/a"}`,
    `Language: ${context?.language || "Unknown"}`,
    "Current Code:",
    context?.code || "No code captured yet.",
    "Statement:",
    context?.description || "No description captured.",
    "Examples:",
    context?.examples || "No examples captured.",
    `HintsGivenSoFar: ${state?.hintsGiven || 0}`,
    `CodeUnlocked: ${Boolean(state?.unlockCode)}`
  ].join("\n\n");
}

function inferHintIncrement(userMessage) {
  return /next hint|hint\s*\d|nudge|stuck|clue/i.test(userMessage || "");
}

async function callOllama(config, messages) {
  const response = await fetch(`${config.endpoint.replace(/\/$/, "")}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.model,
      messages,
      stream: false,
      options: {
        temperature: Number(config.temperature) || 0.3,
        num_predict: Number(config.maxTokens) || 700
      }
    })
  });

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error(
        "Ollama error 403: allow extension origins in OLLAMA_ORIGINS (for example chrome-extension://*), then restart Ollama."
      );
    }
    throw new Error(`Ollama error ${response.status}`);
  }

  const data = await response.json();
  return data?.message?.content || "No response from Ollama.";
}

async function callOpenAICompat(config, messages) {
  const base = config.endpoint.replace(/\/$/, "");
  const response = await fetch(`${base}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: Number(config.temperature) || 0.3,
      max_tokens: Number(config.maxTokens) || 700
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI-compatible error ${response.status}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content || "No response from endpoint.";
}

async function runCoach(payload) {
  const stored = await getStore(["lc_coach_config", STATE_KEY, PRIVACY_KEY]);
  const config = sanitizeConfig(stored.lc_coach_config);
  const privacy = sanitizePrivacy(stored[PRIVACY_KEY]);
  const context = sanitizeContext(payload?.context || {});
  const userMessage = normalizeText(payload?.userMessage, MAX_USER_MESSAGE_LEN);

  const pruned = pruneExpiredState(stored[STATE_KEY] || {}, privacy);
  const allState = pruned.nextState;
  const slug = context.slug || "global";
  const current = allState[slug] || { hintsGiven: 0, unlockCode: false };

  const unlockRequested = /unlock code/i.test(userMessage || "") || payload.unlockCode === true;
  const unlockCode = current.unlockCode || unlockRequested;

  const stateForPrompt = {
    hintsGiven: current.hintsGiven,
    unlockCode
  };

  const messages = [
    {
      role: "system",
      content: buildSystemPrompt()
    },
    {
      role: "user",
      content: buildContextPrompt(context, stateForPrompt)
    },
    {
      role: "user",
      content: userMessage || "Give me the first hint."
    }
  ];

  const assistantText =
    config.provider === "ollama"
      ? await callOllama(config, messages)
      : await callOpenAICompat(config, messages);

  const hintsGiven = current.hintsGiven + (inferHintIncrement(userMessage) ? 1 : 0);

  allState[slug] = {
    hintsGiven,
    unlockCode,
    updatedAt: new Date().toISOString()
  };

  await setStore({ [STATE_KEY]: allState, lc_coach_config: config, [PRIVACY_KEY]: privacy });

  return {
    text: assistantText,
    state: allState[slug],
    config
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const sender = _sender;

  if (message?.type === "LC_COACH_CHAT") {
    if (!isTrustedChatSender(sender)) {
      sendResponse({ ok: false, error: "Blocked untrusted message sender." });
      return false;
    }

    runCoach(message.payload)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message?.type === "LC_COACH_SAVE_CONFIG") {
    if (!isTrustedConfigSender(sender)) {
      sendResponse({ ok: false, error: "Blocked untrusted config sender." });
      return false;
    }

    setStore({ lc_coach_config: sanitizeConfig(message.payload) })
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message?.type === "LC_COACH_GET_CONFIG") {
    if (!isTrustedConfigSender(sender)) {
      sendResponse({ ok: false, error: "Blocked untrusted config sender." });
      return false;
    }

    getStore(["lc_coach_config"]).then((data) => {
      sendResponse({ ok: true, config: sanitizeConfig(data.lc_coach_config) });
    });
    return true;
  }

  if (message?.type === "LC_COACH_SAVE_PRIVACY") {
    if (!isTrustedConfigSender(sender)) {
      sendResponse({ ok: false, error: "Blocked untrusted privacy sender." });
      return false;
    }

    const privacy = sanitizePrivacy(message.payload);
    getStore([STATE_KEY])
      .then((data) => {
        const pruned = pruneExpiredState(data[STATE_KEY] || {}, privacy);
        return setStore({ [PRIVACY_KEY]: privacy, [STATE_KEY]: pruned.nextState });
      })
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message?.type === "LC_COACH_GET_PRIVACY") {
    if (!isTrustedConfigSender(sender)) {
      sendResponse({ ok: false, error: "Blocked untrusted privacy sender." });
      return false;
    }

    getStore([PRIVACY_KEY]).then((data) => {
      sendResponse({ ok: true, privacy: sanitizePrivacy(data[PRIVACY_KEY]) });
    });
    return true;
  }

  if (message?.type === "LC_COACH_CLEAR_DATA") {
    if (!isTrustedConfigSender(sender)) {
      sendResponse({ ok: false, error: "Blocked untrusted clear-data sender." });
      return false;
    }

    chrome.storage.local
      .remove([STATE_KEY])
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  return false;
});
