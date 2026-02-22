# LeetCode Coach Extension (Local LLM)

Interactive LeetCode tutor extension that gives progressive hints and asks guiding questions instead of dumping full solutions.

## What it enforces
- Hint-first workflow (intuition -> structure -> sketch)
- Socratic style (always ends with a question)
- Refuses full code unless you explicitly check `I explicitly want full code now`
- Remembers hints used per problem slug

## Load in Chrome
1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select `/Users/sakethv7/projects/new project/leetcode-coach-extension`

## Model endpoints
- Ollama:
  - Provider: `ollama`
  - Endpoint: `http://localhost:11434`
  - Model example: `qwen2.5-coder:7b`
- LM Studio or Open WebUI (OpenAI-compatible):
  - Provider: `openai_compat`
  - Endpoint example: `http://localhost:1234` or your Open WebUI local base URL
  - Model: exact model name exposed by that server

## Usage
1. Open any `https://leetcode.com/problems/<slug>/...` page
2. Use the right-side in-page `LeetCode Coach` widget (auto-injected), or open extension popup
3. Ask for help like:
   - `Give me a nudge`
   - `I think two pointers might work, am I missing anything?`
   - `Give me the next hint`
4. In popup mode, click `Capture Problem` first.

## Good practice
Keep `unlock code` unchecked to stay in learning mode. Share your own approach often so it can debug your thinking instead of replacing it.

## Privacy controls
- `Data & Privacy` in popup lets you:
  - Clear all saved coach state (`Clear All Coach Data`)
  - Enable/disable automatic cleanup and set retention days (default: 7)
