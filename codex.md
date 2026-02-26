# Codex Change History

## 2026-02-25: Rebrand + Replay + Tracing

### 1) Rebrand to Wandering_bot
- Updated extension branding:
  - `manifest.json` (`name`, `default_title`, description)
  - `popup.html` title/header/button labels
  - in-page widget labels in `content.js`
  - docs in `README.md`
- Folder renamed on disk:
  - from `leetcode-coach-extension`
  - to `Wandering_bot`

### 2) Teaching style update
- Updated tutor system prompt in `background.js`:
  - more strategic, layered explanations
  - still hint-first and no full solution by default

### 3) Replay visualization (NeetBot-style stepping)
- Added timeline replay flow (instead of only single static visual):
  - backend message route: `LC_COACH_VISUAL_TIMELINE`
  - step controls in popup and widget: `Prev`, `Next`, `Play/Pause`
- Added schema-based timeline support for:
  - `array_pointers`
  - `linked_list`
  - `stack_queue`
  - `graph_bfs`
  - `dp_table`

### 4) True Python tracing pipeline
- Added local trace server:
  - `scripts/python_trace_server.py`
- Background integration:
  - new config field: `traceEndpoint` (default `http://127.0.0.1:8765`)
  - replay generation now does:
    1. try trace server (`POST /trace`) for real runtime steps
    2. if trace fails, fallback to model-generated timeline
- Popup config UI updated with `Python Trace Endpoint` field.

## Why tracing was added
- This was added because the user explicitly requested:
  - "Add true code tracing for Python (instrumented execution) to generate steps from actual user code."
- Goal: make replay reflect actual execution state transitions instead of only model guesses.

## Complexity note
- Tracing is optional.
- If trace server is not running, extension still works using model replay fallback.

## If you want it simpler
- We can remove tracing and keep only model-based replay.
- That would mean deleting:
  - `scripts/python_trace_server.py`
  - `traceEndpoint` config/UI
  - trace-first logic in `background.js`
