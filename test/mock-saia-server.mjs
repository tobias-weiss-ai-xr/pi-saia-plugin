#!/usr/bin/env node
/**
 * Minimal OpenAI-compatible mock of the SAIA endpoint, used by the hermetic
 * wire-protocol test.
 *
 * Why this exists: several of the fragile behaviours in this plugin are only
 * observable *on the wire* — the alias is rewritten to a real model id, the
 * system prompt must be sent as `system` (SAIA rejects `developer`), and
 * `reasoning_effort` must be one of the values a model accepts. Verifying
 * those against the real API makes the test suite depend on a shared HPC
 * service that intermittently returns 500s. This mock records every request and
 * replays a canned completion, so those assertions are deterministic and need
 * no API key at all.
 *
 * Usage: node test/mock-saia-server.mjs [port] [record-file]
 *   Prints "READY <port>" on stdout once listening.
 *   Writes one JSON object per line to <record-file> (default ./requests.jsonl).
 *   Exits on SIGTERM/SIGINT.
 */

import { createServer } from "node:http";
import { appendFileSync, rmSync, writeFileSync } from "node:fs";

const port = Number(process.argv[2] ?? 0);
const recordFile = process.argv[3] ?? "requests.jsonl";

// Start from a clean record file so a stale run cannot satisfy an assertion.
writeFileSync(recordFile, "");

/** Canned non-streaming completion, shaped like the OpenAI response. */
function completion(model) {
  return {
    id: "chatcmpl-mock",
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: "MOCK_OK" },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  };
}

/** Canned streaming completion (SSE), for `--stream` invocations. */
function streamBody(model) {
  const chunk = (delta, finish = null) =>
    `data: ${JSON.stringify({
      id: "chatcmpl-mock",
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [{ index: 0, delta, finish_reason: finish }],
    })}\n\n`;
  return (
    chunk({ role: "assistant", content: "" }) +
    chunk({ content: "MOCK_OK" }) +
    chunk({}, "stop") +
    "data: [DONE]\n\n"
  );
}

const server = createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });
  req.on("end", () => {
    const url = req.url ?? "/";

    // GET /v1/models — so the plugin's own refresh/check path can also be
    // exercised. Mirrors the shape of the real SAIA response.
    if (req.method === "GET" && url.includes("/models")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          object: "list",
          data: [{ id: "mock-model", object: "model", created: 0, owned_by: "saia" }],
        }),
      );
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = { __unparsed: body };
    }

    appendFileSync(
      recordFile,
      JSON.stringify({
        method: req.method,
        url,
        headers: req.headers,
        body: parsed,
      }) + "\n",
    );

    const model = parsed?.model ?? "unknown";

    if (parsed?.stream === true) {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.end(streamBody(model));
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(completion(model)));
  });
});

server.listen(port, "127.0.0.1", () => {
  const actual = server.address().port;
  process.stdout.write(`READY ${actual}\n`);
});

const shutdown = () => {
  server.close(() => {
    rmSync(recordFile, { force: true });
    process.exit(0);
  });
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
