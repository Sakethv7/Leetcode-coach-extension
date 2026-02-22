function cleanText(value) {
  return (value || "").replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
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

function getProblemContext() {
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

  return {
    url: window.location.href,
    slug,
    title,
    description,
    examples,
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
    </style>
    <button id="fab" class="fab hidden">LeetCode Coach</button>
    <div id="panel" class="wrap">
      <div class="head">
        <div class="title">LeetCode Coach</div>
        <div class="controls">
          <button id="min" class="icon-btn" title="Minimize">-</button>
        </div>
      </div>
      <div class="body">
        <div id="meta" class="meta muted">Capturing question...</div>
        <div class="quick">
          <button data-msg="Give me a small nudge.">Nudge</button>
          <button data-msg="Give me the next hint.">Next hint</button>
          <button data-msg="Check my approach:">Debug idea</button>
        </div>
        <textarea id="input" placeholder="Ask for help or paste your approach..."></textarea>
        <button id="send" class="send">Send</button>
        <div id="output" class="output muted">Ask for a hint to start.</div>
      </div>
    </div>
  `;

  const panel = shadow.getElementById("panel");
  const fab = shadow.getElementById("fab");
  const metaEl = shadow.getElementById("meta");
  const inputEl = shadow.getElementById("input");
  const outputEl = shadow.getElementById("output");
  const sendBtn = shadow.getElementById("send");
  const minBtn = shadow.getElementById("min");

  function setMetaText() {
    const ctx = getProblemContext();
    metaEl.textContent = `${ctx.title} (${ctx.slug})`;
  }

  async function sendMessage(message) {
    const userMessage = (message || "").trim() || "Give me the first hint.";
    outputEl.classList.add("muted");
    outputEl.textContent = "Thinking...";

    try {
      const payload = {
        context: getProblemContext(),
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

  sendBtn.addEventListener("click", () => {
    sendMessage(inputEl.value);
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

  setMetaText();
}

if (/^\/problems\/[^/]+/.test(window.location.pathname)) {
  createCoachWidget();
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "LC_GET_CONTEXT") {
    try {
      sendResponse({ ok: true, context: getProblemContext() });
    } catch (error) {
      sendResponse({ ok: false, error: String(error) });
    }
    return true;
  }

  return false;
});
