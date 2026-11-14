// PICO backend (Cloudflare Worker)
// Secrets/variables to set in Cloudflare (Settings > Variables and Secrets):
//   ANTHROPIC_API_KEY  (Secret)  your key from console.anthropic.com
//   ALLOWED_ORIGIN     (Text)    your site, e.g. https://yourname.github.io
//   MODEL              (Text, optional)  default is claude-sonnet-5-5; claude-haiku-5-5 is cheaper

const SYSTEM =
  "You are PICO, a friendly, clear and concise AI assistant. " +
  "Use short paragraphs, and use markdown for lists and code.";

const json = (obj, status, headers) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { ...headers, "content-type": "application/json" },
  });

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    const allowed = env.ALLOWED_ORIGIN || "*";
    const cors = {
      "Access-Control-Allow-Origin": allowed === "*" ? "*" : allowed,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type",
      Vary: "Origin",
    };

    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (req.method !== "POST") return json({ error: { message: "Not found" } }, 404, cors);
    if (allowed !== "*" && origin !== allowed)
      return json({ error: { message: "This site is not allowed to use PICO." } }, 403, cors);

    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: { message: "Invalid request." } }, 400, cors);
    }

    // Keep requests small so nobody can run up your bill with huge inputs.
    const messages = (Array.isArray(body.messages) ? body.messages : [])
      .slice(-30)
      .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .map((m) => ({ role: m.role, content: m.content.slice(0, 8000) }));

    if (!messages.length || messages[messages.length - 1].role !== "user")
      return json({ error: { message: "Send a message first." } }, 400, cors);

    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: env.MODEL || "claude-sonnet-5-5",
        max_tokens: 1500,
        stream: true,
        system: SYSTEM,
        messages,
      }),
    });

    return new Response(upstream.body, {
      status: upstream.status,
      headers: { ...cors, "content-type": upstream.headers.get("content-type") || "text/event-stream" },
    });
  },
};
