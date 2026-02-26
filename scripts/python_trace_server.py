#!/usr/bin/env python3
"""Local trace server for Wandering_bot.

Runs user Python code, traces line-level state transitions, and returns a normalized
visual timeline for the extension replay UI.
"""

from __future__ import annotations

import ast
import inspect
import json
import re
import signal
import sys
from collections import deque
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any

TRACE_FILENAME = "<user_code>"
MAX_TRACE_EVENTS = 220
MAX_STEPS = 12
TRACE_TIMEOUT_SEC = 3


@dataclass
class TraceFrame:
    lineno: int
    locals: dict[str, Any]


def _safe_int(value: Any, default: int) -> int:
    try:
        return int(value)
    except Exception:
        return default


def _looks_like_node(obj: Any) -> bool:
    return hasattr(obj, "next") and hasattr(obj, "val")


def _traverse_node(head: Any, limit: int = 12) -> tuple[list[Any], dict[int, int]]:
    values: list[Any] = []
    index_by_id: dict[int, int] = {}
    cur = head
    while cur is not None and len(values) < limit:
        values.append(getattr(cur, "val", None))
        index_by_id[id(cur)] = len(values) - 1
        cur = getattr(cur, "next", None)
    return values, index_by_id


def _parse_solution_method_name(code: str) -> str | None:
    try:
        tree = ast.parse(code)
    except SyntaxError:
        return None

    for node in tree.body:
        if isinstance(node, ast.ClassDef) and node.name == "Solution":
            for item in node.body:
                if isinstance(item, ast.FunctionDef):
                    return item.name
    return None


def _guess_args(sig: inspect.Signature) -> list[Any]:
    guessed: list[Any] = []
    for param in sig.parameters.values():
        name = param.name.lower()
        if name in {"self", "cls"}:
            continue
        if param.default is not inspect._empty:
            guessed.append(param.default)
            continue

        ann = str(param.annotation).lower()
        if "list" in ann or any(token in name for token in ["nums", "arr", "list", "heights", "values"]):
            guessed.append([1, 3, 5, 7, 9])
        elif "str" in ann or name in {"s", "word", "text"}:
            guessed.append("abc")
        elif name in {"k", "target", "n", "m", "x", "y"}:
            guessed.append(3)
        elif "graph" in name:
            guessed.append({"A": ["B", "C"], "B": ["D"], "C": ["D"], "D": []})
        else:
            guessed.append(2)
    return guessed


def _as_list(value: Any) -> list[Any]:
    if isinstance(value, deque):
        return list(value)
    if isinstance(value, list):
        return value
    return []


def _extract_array_steps(frames: list[TraceFrame]) -> list[dict[str, Any]]:
    steps: list[dict[str, Any]] = []
    seen: set[tuple[Any, ...]] = set()
    for frame in frames:
        loc = frame.locals
        arr_name = next((k for k, v in loc.items() if isinstance(v, list) and len(v) >= 3), None)
        if not arr_name:
            continue
        arr = [v for v in loc[arr_name][:12] if isinstance(v, (int, float))]
        if len(arr) < 3:
            continue
        low = loc.get("low", loc.get("l", loc.get("left")))
        high = loc.get("high", loc.get("r", loc.get("right")))
        mid = loc.get("mid", loc.get("m"))
        low = _safe_int(low, 0) if isinstance(low, int) else None
        high = _safe_int(high, len(arr) - 1) if isinstance(high, int) else None
        mid = _safe_int(mid, (len(arr) - 1) // 2) if isinstance(mid, int) else None
        key = (tuple(arr), low, mid, high)
        if key in seen:
            continue
        seen.add(key)
        steps.append({"array": arr, "low": low, "mid": mid, "high": high, "note": f"Line {frame.lineno}"})
    return steps


def _extract_linked_list_steps(frames: list[TraceFrame]) -> list[dict[str, Any]]:
    steps: list[dict[str, Any]] = []
    for frame in frames:
        loc = frame.locals
        head_name = next((k for k, v in loc.items() if _looks_like_node(v) and k in {"head", "node", "cur", "current"}), None)
        if not head_name:
            head_name = next((k for k, v in loc.items() if _looks_like_node(v)), None)
        if not head_name:
            continue
        head = loc[head_name]
        values, idx_map = _traverse_node(head)
        if len(values) < 2:
            continue

        def idx(name: str) -> int | None:
            ref = loc.get(name)
            return idx_map.get(id(ref)) if ref is not None else None

        steps.append(
            {
                "nodes": values,
                "head": idx_map.get(id(head), 0),
                "current": idx("current") if idx("current") is not None else idx("cur"),
                "slow": idx("slow"),
                "fast": idx("fast"),
                "note": f"Line {frame.lineno}"
            }
        )
    return steps


def _extract_stack_queue_steps(frames: list[TraceFrame]) -> list[dict[str, Any]]:
    steps: list[dict[str, Any]] = []
    for frame in frames:
        loc = frame.locals
        name = next((k for k in ["stack", "st", "queue", "q", "dq", "deq"] if k in loc), None)
        if not name:
            continue
        items = _as_list(loc.get(name))
        if not items:
            continue
        mode = "queue" if any(tok in name for tok in ["queue", "q", "dq", "deq"]) else "stack"
        active = 0 if mode == "queue" else len(items) - 1
        steps.append({"mode": mode, "items": items[:12], "active": active, "note": f"Line {frame.lineno}"})
    return steps


def _extract_graph_steps(frames: list[TraceFrame]) -> list[dict[str, Any]]:
    steps: list[dict[str, Any]] = []
    for frame in frames:
        loc = frame.locals
        graph = loc.get("graph") or loc.get("adj")
        if not isinstance(graph, dict) or not graph:
            continue
        nodes = [str(k) for k in list(graph.keys())[:8]]
        node_set = set(nodes)
        edges: list[list[str]] = []
        for src, dsts in graph.items():
            s = str(src)
            if s not in node_set:
                continue
            if isinstance(dsts, (list, tuple, set)):
                for d in list(dsts)[:8]:
                    dd = str(d)
                    if dd in node_set:
                        edges.append([s, dd])
        queue_val = loc.get("queue") or loc.get("q") or loc.get("dq")
        visited_val = loc.get("visited")
        current = loc.get("node") or loc.get("cur") or loc.get("current")
        queue = [str(v) for v in _as_list(queue_val) if str(v) in node_set][:8]
        if isinstance(visited_val, set):
            visited = [str(v) for v in visited_val if str(v) in node_set][:8]
        elif isinstance(visited_val, dict):
            visited = [str(v) for v in visited_val.keys() if str(v) in node_set][:8]
        else:
            visited = [str(v) for v in _as_list(visited_val) if str(v) in node_set][:8]
        current_label = str(current) if current is not None and str(current) in node_set else None
        steps.append(
            {
                "nodes": nodes,
                "edges": edges[:16],
                "queue": queue,
                "visited": visited,
                "current": current_label,
                "note": f"Line {frame.lineno}"
            }
        )
    return steps


def _extract_dp_steps(frames: list[TraceFrame]) -> list[dict[str, Any]]:
    steps: list[dict[str, Any]] = []
    for frame in frames:
        loc = frame.locals
        dp = loc.get("dp")
        if not isinstance(dp, list) or not dp or not isinstance(dp[0], list):
            continue
        table = [[str(cell)[:12] for cell in row[:10]] for row in dp[:8] if isinstance(row, list)]
        if not table:
            continue
        row = loc.get("i", loc.get("r", loc.get("row")))
        col = loc.get("j", loc.get("c", loc.get("col")))
        row = _safe_int(row, 0) if isinstance(row, int) else None
        col = _safe_int(col, 0) if isinstance(col, int) else None
        steps.append({"table": table, "row": row, "col": col, "note": f"Line {frame.lineno}"})
    return steps


def _dedupe_steps(steps: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    deduped: list[dict[str, Any]] = []
    for step in steps:
        key = json.dumps(step, sort_keys=True)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(step)
    return deduped


def _sample_steps(steps: list[dict[str, Any]], max_steps: int = MAX_STEPS) -> list[dict[str, Any]]:
    if len(steps) <= max_steps:
        return steps
    idxs = [round(i * (len(steps) - 1) / (max_steps - 1)) for i in range(max_steps)]
    return [steps[i] for i in idxs]


def _normalize_timeline(timeline: dict[str, Any]) -> dict[str, Any]:
    steps = timeline.get("steps") or []
    if len(steps) < 3:
        steps = (steps * 3)[:3] if steps else [{"note": "No trace steps captured."}] * 3
    return {
        "type": timeline.get("type", "array_pointers"),
        "title": str(timeline.get("title", "Python execution replay"))[:80],
        "summary": str(timeline.get("summary", "Generated from traced code execution."))[:180],
        "steps": _sample_steps(steps, MAX_STEPS)
    }


def _build_timeline(frames: list[TraceFrame], title: str) -> dict[str, Any]:
    candidates: list[tuple[str, list[dict[str, Any]], str]] = [
        ("dp_table", _extract_dp_steps(frames), "DP table filled from traced state transitions."),
        ("graph_bfs", _extract_graph_steps(frames), "BFS frontier and visited set over time."),
        ("linked_list", _extract_linked_list_steps(frames), "Pointer movement across linked nodes."),
        ("stack_queue", _extract_stack_queue_steps(frames), "Push/pop or enqueue/dequeue transitions."),
        ("array_pointers", _extract_array_steps(frames), "Pointer boundaries and midpoint updates per step.")
    ]

    for timeline_type, raw_steps, summary in candidates:
        deduped = _dedupe_steps(raw_steps)
        if len(deduped) >= 3:
            return _normalize_timeline({"type": timeline_type, "title": title, "summary": summary, "steps": deduped})

    return _normalize_timeline(
        {
            "type": "array_pointers",
            "title": title,
            "summary": "Trace produced limited structure; showing fallback replay.",
            "steps": [
                {"array": [1, 3, 5, 7, 9], "low": 0, "mid": 2, "high": 4, "note": "Trace start."},
                {"array": [1, 3, 5, 7, 9], "low": 0, "mid": 1, "high": 2, "note": "Range tightened."},
                {"array": [1, 3, 5, 7, 9], "low": 2, "mid": 2, "high": 2, "note": "Converged."}
            ]
        }
    )


def _execute_and_trace(code: str, title: str = "Python execution replay") -> dict[str, Any]:
    method_name = _parse_solution_method_name(code)
    if not method_name:
        return {"ok": False, "error": "No Solution method found. Expected class Solution with a method."}

    namespace: dict[str, Any] = {}
    try:
        compiled = compile(code, TRACE_FILENAME, "exec")
        exec(compiled, namespace, namespace)
    except Exception as exc:
        return {"ok": False, "error": f"Code compile/exec failed: {exc}"}

    solution_cls = namespace.get("Solution")
    if solution_cls is None:
        return {"ok": False, "error": "Solution class not found after execution."}

    try:
        instance = solution_cls()
        method = getattr(instance, method_name)
    except Exception as exc:
        return {"ok": False, "error": f"Failed to build Solution.{method_name}: {exc}"}

    try:
        sig = inspect.signature(method)
        args = _guess_args(sig)
    except Exception:
        args = []

    frames: list[TraceFrame] = []

    def tracer(frame, event, arg):
        if event == "line" and frame.f_code.co_filename == TRACE_FILENAME:
            frames.append(TraceFrame(lineno=frame.f_lineno, locals=dict(frame.f_locals)))
            if len(frames) >= MAX_TRACE_EVENTS:
                raise RuntimeError("Trace event limit reached")
        return tracer

    def timeout_handler(_signum, _frame):
        raise TimeoutError("Trace timed out")

    old_handler = signal.signal(signal.SIGALRM, timeout_handler)
    signal.alarm(TRACE_TIMEOUT_SEC)
    try:
        sys.settrace(tracer)
        _ = method(*args)
    except Exception:
        # We still keep whatever trace was collected up to the failure.
        pass
    finally:
        sys.settrace(None)
        signal.alarm(0)
        signal.signal(signal.SIGALRM, old_handler)

    if not frames:
        return {"ok": False, "error": "No trace frames captured. Check if the method executed."}

    timeline = _build_timeline(frames, title=title)
    return {"ok": True, "timeline": timeline}


class TraceHandler(BaseHTTPRequestHandler):
    server_version = "WanderingBotTrace/1.0"

    def _send_json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):  # noqa: N802
        self._send_json(200, {"ok": True})

    def do_POST(self):  # noqa: N802
        if self.path != "/trace":
            self._send_json(404, {"ok": False, "error": "Not found"})
            return

        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length)
        try:
            payload = json.loads(raw.decode("utf-8"))
        except Exception:
            self._send_json(400, {"ok": False, "error": "Invalid JSON payload"})
            return

        code = str(payload.get("code") or "")
        title = str(payload.get("title") or "Python execution replay")
        if not code.strip():
            self._send_json(400, {"ok": False, "error": "Missing code"})
            return

        result = _execute_and_trace(code, title=title)
        if result.get("ok"):
            self._send_json(200, result)
        else:
            self._send_json(422, result)


def main() -> None:
    host = "127.0.0.1"
    port = 8765
    print(f"Starting Wandering_bot trace server at http://{host}:{port}")
    server = HTTPServer((host, port), TraceHandler)
    server.serve_forever()


if __name__ == "__main__":
    main()
