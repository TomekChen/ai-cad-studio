#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Streaming client: POST a chat request to ai-cad-studio (port 8800) with an
llm override pointing at the local mock reasoning server, and print each NDJSON
event with a relative timestamp to prove reasoning/token events arrive live
(no 100s blank)."""
import json
import time
import urllib.request

URL = "http://127.0.0.1:8800/_generate/chat"
BODY = {
    "action": "chat",
    "messages": [{"role": "user", "content": "画一个边长 20 的立方体"}],
    "skill": "cad",
    "llm": {"base_url": "http://127.0.0.1:11999/v1", "api_key": "x",
            "model": "mock-reason"},
}

data = json.dumps(BODY).encode("utf-8")
req = urllib.request.Request(URL, data=data,
                             headers={"Content-Type": "application/json"})
t0 = time.time()
first_reason = None
first_token = None
n_reason = 0
n_token = 0
with urllib.request.urlopen(req, timeout=180) as resp:
    for raw in resp:
        line = raw.decode("utf-8").strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except Exception:
            continue
        ev = obj.get("event")
        dt = time.time() - t0
        if ev == "reasoning":
            n_reason += 1
            if first_reason is None:
                first_reason = dt
        if ev == "token":
            n_token += 1
            if first_token is None:
                first_token = dt
        preview = (obj.get("text") or "")[:36]
        print(f"[{dt:6.2f}s] event={ev:<9} {preview!r}", flush=True)
        if ev == "done":
            res = obj.get("result", {})
            ok = res.get("ok")
            print("DONE ok=", ok, "files=", res.get("files"),
                  "err=", (res.get("error") or "")[:120])
            break

print("---- SUMMARY ----")
print("FIRST_REASONING_AT =", round(first_reason, 2) if first_reason is not None else "NONE",
      "(should be <1s, not a 100s blank)")
print("FIRST_TOKEN_AT     =", round(first_token, 2) if first_token is not None else "NONE")
print("reasoning_events   =", n_reason)
print("token_events       =", n_token)
