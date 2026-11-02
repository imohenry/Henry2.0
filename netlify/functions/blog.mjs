const JSON_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function configuredScriptUrl() {
  const value = String(process.env.HENRY_BLOG_APPS_SCRIPT_URL || "").trim();
  return /^https:\/\/script\.google\.com\/.+\/exec$/.test(value) ? value : "";
}

async function parseBody(request) {
  const raw = await request.text();
  if (raw.length > 20_000) throw new Error("PAYLOAD_TOO_LARGE");
  return raw ? JSON.parse(raw) : {};
}

async function upstreamJSON(url, init) {
  const response = await fetch(url, {
    ...init,
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  const raw = await response.text();
  try {
    return { response, data: JSON.parse(raw) };
  } catch {
    throw new Error("UNREADABLE_UPSTREAM");
  }
}

export default async function handler(request) {
  const scriptUrl = configuredScriptUrl();
  if (!scriptUrl) {
    return json(
      {
        error:
          "The blog database is not connected yet. Add HENRY_BLOG_APPS_SCRIPT_URL in Netlify.",
      },
      503,
    );
  }

  let upstream;
  try {
    if (request.method === "GET") {
      const incoming = new URL(request.url);
      const action = incoming.searchParams.get("action") || "list";
      if (action !== "list" && action !== "post") {
        return json({ error: "Unknown action." }, 400);
      }
      const target = new URL(scriptUrl);
      target.searchParams.set("action", action);
      if (action === "post") {
        const slug = incoming.searchParams.get("slug") || "";
        target.searchParams.set("slug", slug);
      }
      upstream = await upstreamJSON(target.toString(), { method: "GET" });
    } else if (request.method === "POST") {
      let body;
      try {
        body = await parseBody(request);
      } catch (error) {
        const message =
          error instanceof Error && error.message === "PAYLOAD_TOO_LARGE"
            ? "That request is too large."
            : "The request body is not valid JSON.";
        return json({ error: message }, 400);
      }
      if (body.action !== "toggleLike" && body.action !== "comment") {
        return json({ error: "Unknown action." }, 400);
      }
      upstream = await upstreamJSON(scriptUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain; charset=utf-8" },
        body: JSON.stringify(body),
      });
    } else {
      return json({ error: "Method not allowed." }, 405);
    }

    const result = upstream.data;
    const status =
      typeof result.status === "number" && result.status >= 400 && result.status <= 599
        ? result.status
        : upstream.response.ok
          ? 200
          : 502;
    const body = { ...result };
    delete body.status;
    return json(body, status);
  } catch (error) {
    console.error(
      "Blog database request failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return json(
      { error: "The blog database is temporarily unreachable. Please try again." },
      502,
    );
  }
}
