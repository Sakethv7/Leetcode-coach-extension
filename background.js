const DEFAULT_CONFIG = {
  provider: "ollama",
  endpoint: "http://127.0.0.1:11434",
  traceEndpoint: "http://127.0.0.1:8765",
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
  const traceEndpointRaw = normalizeText(candidate.traceEndpoint, 500);
  let endpoint = DEFAULT_CONFIG.endpoint;
  let traceEndpoint = DEFAULT_CONFIG.traceEndpoint;

  try {
    const parsed = new URL(endpointRaw);
    const isLocalHost = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    const isHttp = parsed.protocol === "http:" || parsed.protocol === "https:";
    if (isLocalHost && isHttp) {
      endpoint = parsed.origin;
    }
  } catch (_error) {}

  try {
    const parsed = new URL(traceEndpointRaw);
    const isLocalHost = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    const isHttp = parsed.protocol === "http:" || parsed.protocol === "https:";
    if (isLocalHost && isHttp) {
      traceEndpoint = parsed.origin;
    }
  } catch (_error) {}

  return {
    provider,
    endpoint,
    traceEndpoint,
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
    "You are Wandering_bot, a Socratic coding tutor with calm, strategic depth.",
    "Never spoon-feed full solutions by default.",
    "Default coding language is Python.",
    "Tone guidance:",
    "1) Think like a composed strategist: precise, understated, and stepwise.",
    "2) Surface hidden assumptions and tradeoffs before jumping to conclusions.",
    "3) Teach layered reasoning: invariant -> choice -> consequence.",
    "Rules:",
    "1) Start by asking one short diagnostic question unless user explicitly asks for the next hint.",
    "2) Use progression labels: Concept refresh -> Hint 1 (intuition) -> Hint 2 (data structure) -> Hint 3 (algorithm sketch) -> Hint 4 (edge cases/complexity).",
    "3) Keep each hint concrete. Avoid jargon unless you define it in one short sentence.",
    "4) If user seems confused/stuck, first give a 2-3 line prerequisite refresher before the next hint.",
    "5) Prefer tiny examples over abstract explanations.",
    "6) Do not provide full code unless unlockCode is true.",
    "7) If unlockCode is false and user asks code/answer, refuse politely and provide a next-step hint.",
    "8) If you provide any code, pseudocode, or syntax examples, use Python only.",
    "9) Do not output C or C++ unless the user explicitly requests C or C++.",
    "10) End with one easy next action the learner can try now.",
    "11) Keep response concise: max 240 words.",
    "12) If user shares attempt, prioritize debugging their approach instead of replacing it."
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

function buildVisualSystemPrompt() {
  return [
    "You are Wandering_bot visual planner.",
    "Return ONLY valid JSON with no markdown.",
    'Schema: {"type":"array_pointers","title":"string","array":[number,...],"low":number|null,"high":number|null,"mid":number|null,"note":"string"}',
    "Rules:",
    "1) type must always be array_pointers.",
    "2) array length must be 3..12.",
    "3) low/high/mid are zero-based indices inside array bounds, or null if unknown.",
    "4) Keep note under 140 characters.",
    "5) Prefer integers for array values."
  ].join("\n");
}

function buildVisualTimelineSystemPrompt() {
  return [
    "You are Wandering_bot algorithm replay planner.",
    "Return ONLY valid JSON with no markdown.",
    'Schema: {"type":"one_of(array_pointers|linked_list|stack_queue|graph_bfs|dp_table)","title":"string","summary":"string","steps":[{"note":"string","...type_specific_fields"}]}',
    "Rules:",
    "1) type must be exactly one of array_pointers, linked_list, stack_queue, graph_bfs, dp_table, binary_tree.",
    "2) steps length must be 3..12 and each step should represent one meaningful algorithm moment.",
    "3) Keep each step note under 120 chars and summary under 180 chars.",
    "4) For array_pointers step fields: array, low, high, mid.",
    "5) For linked_list step fields: nodes, head, current, fast, slow.",
    "6) For stack_queue step fields: mode(stack|queue), items, active.",
    "7) For graph_bfs step fields: nodes, edges, queue, visited, current.",
    "8) For dp_table step fields: table, row, col.",
    "9) For binary_tree step fields: nodes (BFS-order array, null for absent slots), current (index), visited ([index,...]), highlight ([index,...])."
  ].join("\n");
}

function extractJsonObject(text) {
  const raw = String(text || "").trim();
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (_error) {}

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch (_error) {}
  }
  return null;
}

function normalizeVisualSpec(specLike) {
  const fallbackArray = [1, 3, 5, 7, 9];
  const arrRaw = Array.isArray(specLike?.array) ? specLike.array : fallbackArray;
  const array = arrRaw
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n))
    .slice(0, 12);
  const safeArray = array.length >= 3 ? array : fallbackArray;

  function normalizeIndex(value) {
    if (value === null || value === undefined || value === "") {
      return null;
    }
    const idx = Math.round(Number(value));
    if (!Number.isFinite(idx)) {
      return null;
    }
    return idx >= 0 && idx < safeArray.length ? idx : null;
  }

  return {
    type: "array_pointers",
    title: normalizeText(specLike?.title || "Array pointer walkthrough", 80),
    array: safeArray,
    low: normalizeIndex(specLike?.low),
    high: normalizeIndex(specLike?.high),
    mid: normalizeIndex(specLike?.mid),
    note: normalizeText(specLike?.note || "Track low/high boundaries and midpoint each step.", 160)
  };
}

function normalizeLabel(value, fallback = "") {
  const text = normalizeText(value, 24).trim();
  return text || fallback;
}

function normalizeIndex(value, maxLen) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const idx = Math.round(Number(value));
  if (!Number.isFinite(idx)) {
    return null;
  }
  return idx >= 0 && idx < maxLen ? idx : null;
}

function normalizeArray(valuesLike, minLen = 3, maxLen = 12, fallback = [1, 3, 5, 7, 9]) {
  const arr = (Array.isArray(valuesLike) ? valuesLike : fallback)
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n))
    .slice(0, maxLen);
  return arr.length >= minLen ? arr : fallback.slice(0, maxLen);
}

function normalizeTimelineType(typeLike) {
  const type = normalizeText(typeLike, 40).trim();
  if (["array_pointers", "linked_list", "stack_queue", "graph_bfs", "dp_table", "binary_tree"].includes(type)) {
    return type;
  }
  return "array_pointers";
}

function fallbackTimelineByType(type, title) {
  if (type === "linked_list") {
    return {
      type,
      title,
      summary: "Follow cursor movement through linked nodes.",
      steps: [
        { nodes: [4, 2, 7, 9], head: 0, current: 0, slow: 0, fast: 0, note: "Initialize head, slow, and fast." },
        { nodes: [4, 2, 7, 9], head: 0, current: 1, slow: 1, fast: 2, note: "Move slow by 1 and fast by 2." },
        { nodes: [4, 2, 7, 9], head: 0, current: 2, slow: 2, fast: null, note: "Fast reaches tail boundary." }
      ]
    };
  }
  if (type === "stack_queue") {
    return {
      type,
      title,
      summary: "Observe push/pop or enqueue/dequeue state changes.",
      steps: [
        { mode: "stack", items: [2], active: 0, note: "Push first value." },
        { mode: "stack", items: [2, 5], active: 1, note: "Push next candidate." },
        { mode: "stack", items: [2], active: 0, note: "Pop when constraint is met." }
      ]
    };
  }
  if (type === "graph_bfs") {
    return {
      type,
      title,
      summary: "Queue expands frontier level by level.",
      steps: [
        {
          nodes: ["A", "B", "C", "D"],
          edges: [["A", "B"], ["A", "C"], ["B", "D"], ["C", "D"]],
          queue: ["A"],
          visited: ["A"],
          current: "A",
          note: "Start BFS from source."
        },
        {
          nodes: ["A", "B", "C", "D"],
          edges: [["A", "B"], ["A", "C"], ["B", "D"], ["C", "D"]],
          queue: ["B", "C"],
          visited: ["A", "B", "C"],
          current: "B",
          note: "Dequeue A and enqueue neighbors."
        },
        {
          nodes: ["A", "B", "C", "D"],
          edges: [["A", "B"], ["A", "C"], ["B", "D"], ["C", "D"]],
          queue: ["C", "D"],
          visited: ["A", "B", "C", "D"],
          current: "D",
          note: "Reach next frontier node."
        }
      ]
    };
  }
  if (type === "dp_table") {
    return {
      type,
      title,
      summary: "Each cell builds on prior subproblems.",
      steps: [
        { table: [[1, 0, 0], [0, 0, 0], [0, 0, 0]], row: 0, col: 0, note: "Seed base case." },
        { table: [[1, 1, 1], [0, 1, 1], [0, 0, 0]], row: 1, col: 1, note: "Fill next row from top/left." },
        { table: [[1, 1, 1], [0, 1, 1], [0, 1, 2]], row: 2, col: 2, note: "Finish with target state." }
      ]
    };
  }
  if (type === "binary_tree") {
    return {
      type,
      title,
      summary: "Traverse the tree node by node.",
      steps: [
        { nodes: [4, 2, 6, 1, 3, 5, 7], current: 0, visited: [], highlight: [1, 2], note: "Root: compare children." },
        { nodes: [4, 2, 6, 1, 3, 5, 7], current: 1, visited: [0], highlight: [3, 4], note: "Left subtree: explore." },
        { nodes: [4, 2, 6, 1, 3, 5, 7], current: 3, visited: [0, 1], highlight: [], note: "Leaf reached." }
      ]
    };
  }
  const spec = normalizeVisualSpec({});
  const highEnd = spec.array.length - 1;
  return {
    type: "array_pointers",
    title,
    summary: "Replay tracks how boundaries move before convergence.",
    steps: [
      { array: spec.array, low: 0, high: highEnd, mid: Math.floor(highEnd / 2), note: "Start with full range." },
      {
        array: spec.array,
        low: 0,
        high: highEnd,
        mid: Math.floor(highEnd / 2),
        note: "Evaluate midpoint and shrink search window."
      },
      { array: spec.array, low: 2, high: 3, mid: 2, note: "Converge toward the answer." }
    ]
  };
}

function normalizeTimelineStepByType(stepLike, type, idx, baseStep) {
  const note = normalizeText(stepLike?.note || `Step ${idx + 1}`, 120);

  if (type === "linked_list") {
    const nodes = normalizeArray(stepLike?.nodes ?? baseStep?.nodes, 2, 12, [1, 2, 3, 4]);
    return {
      nodes,
      head: normalizeIndex(stepLike?.head ?? baseStep?.head ?? 0, nodes.length),
      current: normalizeIndex(stepLike?.current ?? baseStep?.current ?? 0, nodes.length),
      slow: normalizeIndex(stepLike?.slow ?? baseStep?.slow ?? null, nodes.length),
      fast: normalizeIndex(stepLike?.fast ?? baseStep?.fast ?? null, nodes.length),
      note
    };
  }

  if (type === "stack_queue") {
    const items = normalizeArray(stepLike?.items ?? baseStep?.items, 1, 12, [1]);
    const mode = stepLike?.mode === "queue" ? "queue" : "stack";
    return {
      mode,
      items,
      active: normalizeIndex(stepLike?.active ?? baseStep?.active ?? items.length - 1, items.length),
      note
    };
  }

  if (type === "graph_bfs") {
    const nodesRaw = Array.isArray(stepLike?.nodes) ? stepLike.nodes : baseStep?.nodes;
    const nodes = (Array.isArray(nodesRaw) ? nodesRaw : ["A", "B", "C", "D"])
      .map((v, i) => normalizeLabel(v, String.fromCharCode(65 + i)))
      .slice(0, 8);
    const labelSet = new Set(nodes);
    const sanitizeList = (valuesLike) =>
      (Array.isArray(valuesLike) ? valuesLike : [])
        .map((v) => normalizeLabel(v))
        .filter((v) => labelSet.has(v))
        .slice(0, 8);
    const edgesRaw = Array.isArray(stepLike?.edges) ? stepLike.edges : baseStep?.edges;
    const edges = (Array.isArray(edgesRaw) ? edgesRaw : [])
      .map((edge) => (Array.isArray(edge) ? edge : []))
      .filter((edge) => edge.length >= 2)
      .map((edge) => [normalizeLabel(edge[0]), normalizeLabel(edge[1])])
      .filter(([a, b]) => labelSet.has(a) && labelSet.has(b))
      .slice(0, 16);
    const queue = sanitizeList(stepLike?.queue ?? baseStep?.queue);
    const visited = sanitizeList(stepLike?.visited ?? baseStep?.visited);
    const current = labelSet.has(normalizeLabel(stepLike?.current ?? baseStep?.current)) ? normalizeLabel(stepLike?.current ?? baseStep?.current) : null;
    return { nodes, edges, queue, visited, current, note };
  }

  if (type === "dp_table") {
    const tableRaw = Array.isArray(stepLike?.table) ? stepLike.table : baseStep?.table;
    const rows = (Array.isArray(tableRaw) ? tableRaw : [[0, 0], [0, 0]])
      .slice(0, 8)
      .map((row) =>
        (Array.isArray(row) ? row : [])
          .slice(0, 10)
          .map((cell) => normalizeText(cell, 12))
      )
      .filter((row) => row.length > 0);
    const safeRows = rows.length ? rows : [["0", "0"], ["0", "0"]];
    const width = safeRows[0].length;
    return {
      table: safeRows,
      row: normalizeIndex(stepLike?.row ?? baseStep?.row ?? 0, safeRows.length),
      col: normalizeIndex(stepLike?.col ?? baseStep?.col ?? 0, width),
      note
    };
  }

  if (type === "binary_tree") {
    const nodesRaw = Array.isArray(stepLike?.nodes) ? stepLike.nodes : baseStep?.nodes;
    const nodes = (Array.isArray(nodesRaw) ? nodesRaw : [1, 2, 3])
      .slice(0, 15)
      .map((v) => (v === null || v === undefined ? null : normalizeText(v, 12)));
    const safeNodes = nodes.length >= 1 ? nodes : [1, 2, 3];
    const len = safeNodes.length;
    const safeIdx = (v) => normalizeIndex(v, len);
    const sanitizeIdxList = (arr) =>
      (Array.isArray(arr) ? arr : []).map(safeIdx).filter((v) => v !== null);
    return {
      nodes: safeNodes,
      current: safeIdx(stepLike?.current ?? baseStep?.current ?? null),
      visited: sanitizeIdxList(stepLike?.visited ?? baseStep?.visited),
      highlight: sanitizeIdxList(stepLike?.highlight ?? baseStep?.highlight),
      note
    };
  }

  const arr = normalizeArray(stepLike?.array ?? baseStep?.array, 3, 12, [1, 3, 5, 7, 9]);
  return {
    array: arr,
    low: normalizeIndex(stepLike?.low ?? baseStep?.low ?? 0, arr.length),
    high: normalizeIndex(stepLike?.high ?? baseStep?.high ?? arr.length - 1, arr.length),
    mid: normalizeIndex(stepLike?.mid ?? baseStep?.mid ?? Math.floor((arr.length - 1) / 2), arr.length),
    note
  };
}

function normalizeVisualTimelineSpec(specLike) {
  const type = normalizeTimelineType(specLike?.type);
  const title = normalizeText(specLike?.title || "Algorithm replay", 80);
  const fallback = fallbackTimelineByType(type, title);
  const parsedSteps = Array.isArray(specLike?.steps) ? specLike.steps : [];
  const sourceSteps = parsedSteps.length ? parsedSteps.slice(0, 12) : fallback.steps;
  const baseStep = sourceSteps[0] || fallback.steps[0];
  const steps = sourceSteps.map((step, idx) => normalizeTimelineStepByType(step, type, idx, baseStep));
  const safeSteps = steps.length >= 3 ? steps : fallback.steps.map((step, idx) => normalizeTimelineStepByType(step, type, idx, fallback.steps[0]));
  return {
    type,
    title,
    summary: normalizeText(
      specLike?.summary || fallback.summary || "Replay each state transition to understand algorithm behavior.",
      180
    ),
    steps: safeSteps
  };
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

async function runVisual(payload) {
  const stored = await getStore(["lc_coach_config"]);
  const config = sanitizeConfig(stored.lc_coach_config);
  const context = sanitizeContext(payload?.context || {});
  const userMessage = normalizeText(payload?.userMessage, MAX_USER_MESSAGE_LEN);

  const messages = [
    { role: "system", content: buildVisualSystemPrompt() },
    {
      role: "user",
      content: [
        `Problem: ${context?.title || "Unknown"} (${context?.slug || "n/a"})`,
        `Statement: ${context?.description || "No description captured."}`,
        `Examples: ${context?.examples || "No examples captured."}`,
        `Code: ${context?.code || "No code captured."}`,
        `Request: ${userMessage || "Generate a useful array-pointer diagram for this problem."}`
      ].join("\n\n")
    }
  ];

  const modelOutput =
    config.provider === "ollama"
      ? await callOllama(config, messages)
      : await callOpenAICompat(config, messages);
  const parsed = extractJsonObject(modelOutput);
  const spec = normalizeVisualSpec(parsed || {});

  return { spec, raw: modelOutput, config };
}

async function callPythonTraceService(config, context, userMessage) {
  const base = config.traceEndpoint.replace(/\/$/, "");
  const response = await fetch(`${base}/trace`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code: context?.code || "",
      language: context?.language || "",
      slug: context?.slug || "",
      title: context?.title || "",
      description: context?.description || "",
      examples: context?.examples || "",
      userMessage: userMessage || ""
    })
  });

  if (!response.ok) {
    throw new Error(`Trace server error ${response.status}`);
  }

  const data = await response.json();
  if (!data?.ok || !data?.timeline) {
    throw new Error(data?.error || "Trace server returned no timeline.");
  }
  return normalizeVisualTimelineSpec(data.timeline);
}

async function runVisualTimeline(payload) {
  const stored = await getStore(["lc_coach_config"]);
  const config = sanitizeConfig(stored.lc_coach_config);
  const context = sanitizeContext(payload?.context || {});
  const userMessage = normalizeText(payload?.userMessage, MAX_USER_MESSAGE_LEN);

  const likelyPython = /python/i.test(context?.language || "") || /class\s+Solution|def\s+\w+\(/.test(context?.code || "");
  if (likelyPython && context?.code?.trim()) {
    try {
      const tracedTimeline = await callPythonTraceService(config, context, userMessage);
      return {
        timeline: tracedTimeline,
        raw: "trace_server",
        source: "trace_server",
        config
      };
    } catch (_error) {
      // Fall through to model-based timeline planner.
    }
  }

  const messages = [
    { role: "system", content: buildVisualTimelineSystemPrompt() },
    {
      role: "user",
      content: [
        `Problem: ${context?.title || "Unknown"} (${context?.slug || "n/a"})`,
        `Statement: ${context?.description || "No description captured."}`,
        `Examples: ${context?.examples || "No examples captured."}`,
        `Code: ${context?.code || "No code captured."}`,
        `Request: ${userMessage || "Generate a step-by-step algorithm replay timeline."}`
      ].join("\n\n")
    }
  ];

  const modelOutput =
    config.provider === "ollama"
      ? await callOllama(config, messages)
      : await callOpenAICompat(config, messages);
  const parsed = extractJsonObject(modelOutput);
  const timeline = normalizeVisualTimelineSpec(parsed || {});

  return { timeline, raw: modelOutput, source: "model", config };
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

  if (message?.type === "LC_COACH_VISUAL") {
    if (!isTrustedChatSender(sender)) {
      sendResponse({ ok: false, error: "Blocked untrusted message sender." });
      return false;
    }

    runVisual(message.payload)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message?.type === "LC_COACH_VISUAL_TIMELINE") {
    if (!isTrustedChatSender(sender)) {
      sendResponse({ ok: false, error: "Blocked untrusted message sender." });
      return false;
    }

    runVisualTimeline(message.payload)
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
