# Wandering_bot Extension

Wandering_bot is a Chrome extension for LeetCode that gives strategic hint-first coaching and replayable algorithm visuals.

## Highlights
- Rebranded project and folder name to `Wandering_bot`
- Kiyotaka-style depth: calm, layered reasoning (`invariant -> choice -> consequence`)
- True Python tracing support (line-level state capture) via local trace server
- Multi-schema visual replay with `Prev` / `Next` / `Play` controls

## Supported Replay Schemas
- `array_pointers`
- `linked_list`
- `stack_queue`
- `graph_bfs`
- `dp_table`

## Install (Chrome)
1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select folder: `/Users/sakethv7/projects/new project/Wandering_bot`

## Model + Trace Config
Set in popup:
- `Provider`: `ollama` or `openai_compat`
- `Endpoint`: model endpoint (example: `http://127.0.0.1:11434`)
- `Model`: model name (example: `kimi-k2:1t-cloud`)
- `Python Trace Endpoint`: `http://127.0.0.1:8765`

## Run True Python Tracing
1. Start local trace server:
```bash
python3 scripts/python_trace_server.py
```
2. Keep it running while using replay.
3. Click `Generate Replay` (popup) or `Replay` (widget).

If tracing fails or code is not Python, Wandering_bot falls back to model-based replay planning.

## Usage
1. Open `https://leetcode.com/problems/*`
2. Capture problem context
3. Ask hints or share your approach
4. Generate replay and step through transitions
