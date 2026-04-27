const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const ENV = loadEnvFile(path.join(ROOT, ".env.local"));
const PORT = Number(process.env.PORT || ENV.PORT || 3000);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};

const AI_SYSTEM_PROMPT = [
  "You are an AI note-writing assistant for a Notion-like editor.",
  "Return strict JSON only. Do not wrap JSON in markdown fences.",
  "The JSON shape must be:",
  '{"reply":"short assistant reply in Chinese","blocks":[...]}',
  "The reply should be brief and describe what was generated.",
  "The blocks array should contain the actual note content that will be inserted into the document.",
  "Use the most suitable block types from this list when appropriate: paragraph, h1, h2, h3, bullet, numbered, todo, quote, callout, code, table, divider.",
  "Rules:",
  "- paragraph/h1/h2/h3/bullet/numbered/todo/quote/code/callout use a plain-text field named text.",
  "- todo may include checked:boolean.",
  "- callout may include emoji:string.",
  "- table must use rows:string[][] and should include a header row when suitable.",
  "- divider has no extra fields.",
  "- Use separate blocks for list items instead of embedding markdown lists inside one paragraph.",
  "- Prefer table when the content is naturally tabular.",
  "- Prefer quote when the user requests a citation, excerpt, or quoted viewpoint.",
  "- The note content itself belongs in blocks, not in reply."
].join("\n");

const server = http.createServer(async (req, res) => {
  try {
    if (!req.url) {
      sendJson(res, 400, { error: "Bad request" });
      return;
    }

    const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (requestUrl.pathname === "/api/ai/compose") {
      if (req.method === "OPTIONS") {
        sendNoContent(res);
        return;
      }
      if (req.method !== "POST") {
        sendJson(res, 405, { error: "Method not allowed" });
        return;
      }
      await handleAICompose(req, res);
      return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    serveStatic(requestUrl.pathname, res, req.method === "HEAD");
  } catch (error) {
    sendJson(res, 500, { error: error instanceof Error ? error.message : "Server error" });
  }
});

server.listen(PORT, () => {
  console.log(`Notion Lite AI server running at http://localhost:${PORT}`);
});

async function handleAICompose(req, res) {
  if (typeof fetch !== "function") {
    sendJson(res, 500, { error: "Current Node runtime does not support fetch. Please use Node 18+." });
    return;
  }

  const config = getAIConfig();
  if (!config.apiKey || !config.baseUrl || !config.model) {
    sendJson(res, 500, { error: "Missing AI configuration in .env.local." });
    return;
  }

  const body = await readJsonBody(req);
  const messages = buildModelMessages(body);
  const upstreamResponse = await fetch(joinUrl(config.baseUrl, "chat/completions"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.35,
      messages
    })
  });

  const upstreamText = await upstreamResponse.text();
  const upstreamData = safeJsonParse(upstreamText);

  if (!upstreamResponse.ok) {
    const errorMessage = upstreamData?.error?.message || upstreamData?.message || upstreamText || "AI request failed";
    sendJson(res, upstreamResponse.status, { error: errorMessage });
    return;
  }

  const content = extractAssistantContent(upstreamData);
  if (!content) {
    sendJson(res, 502, { error: "AI response did not contain usable content." });
    return;
  }

  const parsed = parseStructuredAIResult(content);
  if (!parsed) {
    sendJson(res, 502, { error: "AI response was not valid JSON." });
    return;
  }

  sendJson(res, 200, {
    reply: typeof parsed.reply === "string" ? parsed.reply.trim() : "",
    blocks: Array.isArray(parsed.blocks) ? parsed.blocks : []
  });
}

function serveStatic(urlPathname, res, headOnly = false) {
  const relativePath = decodeURIComponent(urlPathname === "/" ? "/index.html" : urlPathname);
  const safePath = path.normalize(relativePath).replace(/^(\.\.[/\\])+/, "");
  const absolutePath = path.join(ROOT, safePath);

  if (!absolutePath.startsWith(ROOT)) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }

  const baseName = path.basename(absolutePath);
  if (baseName.startsWith(".env") || baseName.startsWith(".git")) {
    sendJson(res, 404, { error: "Not found" });
    return;
  }

  fs.stat(absolutePath, (error, stats) => {
    if (error || !stats.isFile()) {
      sendJson(res, 404, { error: "Not found" });
      return;
    }

    const ext = path.extname(absolutePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": "no-store"
    });

    if (headOnly) {
      res.end();
      return;
    }

    fs.createReadStream(absolutePath).pipe(res);
  });
}

function getAIConfig() {
  return {
    apiKey: (process.env.DOUBAO_API_KEY || ENV.DOUBAO_API_KEY || "").trim(),
    baseUrl: (process.env.DOUBAO_BASE_URL || ENV.DOUBAO_BASE_URL || "").trim(),
    model: (process.env.DOUBAO_MODEL || ENV.DOUBAO_MODEL || "").trim()
  };
}

function buildModelMessages(body) {
  const payload = body && typeof body === "object" ? body : {};
  const pageTitle = typeof payload.pageTitle === "string" ? payload.pageTitle : "";
  const contextBlocks = Array.isArray(payload.contextBlocks) ? payload.contextBlocks : [];
  const history = Array.isArray(payload.messages) ? payload.messages : [];

  const contextText = contextBlocks
    .slice(-10)
    .map((block, index) => describeContextBlock(block, index + 1))
    .join("\n");

  const messages = [
    { role: "system", content: AI_SYSTEM_PROMPT },
    {
      role: "system",
      content: [
        `Current page title: ${pageTitle || "(untitled)"}`,
        "Existing page context near the insertion point:",
        contextText || "(empty)"
      ].join("\n")
    }
  ];

  history.forEach(message => {
    if (!message || (message.role !== "user" && message.role !== "assistant")) return;
    const content = typeof message.content === "string" ? message.content.trim() : "";
    if (!content) return;
    messages.push({ role: message.role, content });
  });

  return messages;
}

function describeContextBlock(block, index) {
  if (!block || typeof block !== "object") return `${index}. unknown`;
  if (block.type === "table") {
    const rows = Array.isArray(block.rows) ? block.rows : [];
    return `${index}. table: ${JSON.stringify(rows)}`;
  }
  const text = typeof block.text === "string" ? block.text : "";
  return `${index}. ${block.type || "paragraph"}: ${text}`;
}

function extractAssistantContent(response) {
  const content = response?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map(item => typeof item?.text === "string" ? item.text : "")
      .join("")
      .trim();
  }
  return "";
}

function parseStructuredAIResult(content) {
  const cleaned = content
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const direct = safeJsonParse(cleaned);
  if (direct && typeof direct === "object") return direct;

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return safeJsonParse(cleaned.slice(start, end + 1));
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", chunk => {
      raw += chunk;
      if (raw.length > 2_000_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function joinUrl(baseUrl, pathname) {
  return `${baseUrl.replace(/\/+$/, "")}/${pathname.replace(/^\/+/, "")}`;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const result = {};
  const content = fs.readFileSync(filePath, "utf8");
  content.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const index = trimmed.indexOf("=");
    if (index < 0) return;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    result[key] = value;
  });
  return result;
}

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(body));
}

function sendNoContent(res) {
  res.writeHead(204, {
    "Cache-Control": "no-store"
  });
  res.end();
}
