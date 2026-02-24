# LeetCode Coach Extension

LeetCode Coach is a Chrome extension that reads the current problem + your code and gives progressive Python-first coaching, live typing tips, and coherent visual diagrams.

## Features
- Progressive hinting: concept refresh -> intuition -> data structure -> algorithm sketch -> edge cases
- Python-first responses (no C/C++ unless explicitly requested)
- Reads current editor code from LeetCode and uses it in feedback
- Live on-screen tips while typing
- In-page widget and popup coaching modes
- Deterministic visual diagrams (SVG) via `Visual` / `Generate Visual`
- Per-problem state tracking (`hintsUsed`, `unlockCode`)
- Local privacy controls (retention + clear all data)

## Requirements
- Chrome (unpacked extension mode)
- Ollama running locally (recommended), or OpenAI-compatible local endpoint
- LeetCode problem pages: `https://leetcode.com/problems/*`

## Install (Chrome)
1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select this folder: `/Users/sakethv7/projects/new project/leetcode-coach-extension`

## Configure Model
Open extension popup and set:

### Ollama (recommended)
- `Provider`: `ollama`
- `Endpoint`: `http://127.0.0.1:11434`
- `Model`: `kimi-k2:1t-cloud` (fast default)

Optional deep-reasoning switch:
- `kimi-k2-thinking:cloud`

### OpenAI-compatible local endpoint
- `Provider`: `openai_compat`
- `Endpoint`: e.g. `http://localhost:1234`
- `Model`: exact model name exposed by that server

## Recommended Ollama Models
- Fast default: `kimi-k2:1t-cloud`
- Deep reasoning: `kimi-k2-thinking:cloud`
- Local fallback: `qwen2.5-coder:7b`

## How To Use
1. Open a LeetCode problem page.
2. Use either:
- In-page widget (top-right)
- Extension popup
3. Ask for hints or share your approach.
4. Use `Visual` (widget) or `Generate Visual` (popup) for a clean diagram.
5. Keep `I explicitly want full code now` unchecked to stay in learning mode.

## Visual Diagrams (New)
- Visuals are generated as structured specs, then rendered as SVG.
- This avoids hallucinated image layouts and keeps diagrams consistent.
- Current visual type focuses on array + pointers (`low`, `mid`, `high`) and a short note.

## Live Tips
- While typing in the LeetCode editor, short coaching tips appear on-screen.
- Live tip panel has `Pause/Resume`.

## Privacy & Data
- Stored in `chrome.storage.local`
- Auto-expiry supported (default: 7 days)
- `Clear All Coach Data` removes saved coaching state

## Troubleshooting
- `Extension context invalidated`:
1. Reload extension in `chrome://extensions`
2. Hard refresh LeetCode tab (`Cmd+Shift+R`)

- No popup or stale UI:
1. Close popup
2. Reload extension
3. Reopen popup

- Ollama request errors:
1. Confirm Ollama is running on `http://127.0.0.1:11434`
2. Confirm model exists in `ollama list`
3. Save config again in popup

## Dev Notes
- Background worker: `background.js`
- LeetCode page integration + widget: `content.js`
- Popup UI: `popup.html`, `popup.js`, `popup.css`
- Page bridge for Monaco extraction: `pageBridge.js`
