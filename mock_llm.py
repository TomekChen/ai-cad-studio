#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Mock OpenAI-compatible SSE chat server that emits reasoning_content deltas
then content deltas, to verify the ai-cad-studio reasoning-streaming pipeline."""
import json
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = 11999


def sse(obj):
    return ("data: " + json.dumps(obj, ensure_ascii=False) + "\n\n").encode("utf-8")


class H(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0) or 0)
        self.rfile.read(length)  # discard request body
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.end_headers()

        base = {"id": "mock", "object": "chat.completion.chunk",
                "created": int(time.time()), "model": "mock-reason"}

        def emit(delta, finish=None):
            chunk = dict(base)
            chunk["choices"] = [{"index": 0, "delta": delta}]
            if finish:
                chunk["choices"][0]["finish_reason"] = finish
            self.wfile.write(sse(chunk))
            self.wfile.flush()

        # 1) role
        emit({"role": "assistant", "content": ""})
        # 2) reasoning_content deltas (the "thinking" stream)
        reasoning = ("我先分析需求：用户想要一个边长 20 的立方体。使用 build123d 的 "
                     "Box 即可，注意 gen_step() 必须 return 实体，不要自己导出文件。")
        for i in range(0, len(reasoning), 8):
            emit({"reasoning_content": reasoning[i:i + 8]})
            time.sleep(0.12)
        # 3) content deltas (the python code block)
        code = ("```python\nfrom build123d import *\n\n\ndef gen_step():\n"
                "    return Box(20, 20, 20)\n```\n")
        for i in range(0, len(code), 12):
            emit({"content": code[i:i + 12]})
            time.sleep(0.04)
        # 4) finish + DONE
        emit({}, finish="stop")
        self.wfile.write(b"data: [DONE]\n\n")
        self.wfile.flush()

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    print("mock llm on", PORT)
    ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
