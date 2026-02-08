import { commandHelpText, resolveCommand } from "./commands/registry";
import type { CommandContext, Env } from "./commands/types";

const TZ = "Asia/Seoul";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);

      if (url.pathname === "/health") {
        return json({ ok: true });
      }

      if (url.pathname !== "/command") {
        return new Response("Not Found", { status: 404 });
      }

      if (request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405 });
      }

      // --- API KEY 체크 ---
      const apiKey = request.headers.get("X-API-Key") || "";
      if (!env.API_KEY || apiKey !== env.API_KEY) {
        return new Response("Unauthorized", { status: 401 });
      }

      const body = await request.json().catch(() => ({}));
      const text = String(body.text ?? "").trim();

      if (!text) {
        return json({ reply: "명령이 비어 있습니다." });
      }

      const token = await getAccessToken(env);
      const resolved = resolveCommand(text);
      if (!resolved) {
        return json({ reply: commandHelpText() });
      }

      const ctx: CommandContext = {
        env,
        text,
        token,
        now: new Date(),
        correlationId: crypto.randomUUID(),
        calendar: { listEvents, createEvent }
      };

      const reply = await resolved.command.handler(ctx, resolved.params);
      return json({ reply });
    } catch (e: any) {
      return json({ reply: `오류: ${e?.message ?? e}` });
    }
  }
};

/* =========================
   Google Calendar API
========================= */

async function listEvents(
  env: Env,
  token: string,
  timeMin: string,
  timeMax: string,
  maxResults = 20
) {
  const params = new URLSearchParams({
    singleEvents: "true",
    orderBy: "startTime",
    timeMin,
    timeMax,
    maxResults: String(maxResults)
  });

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      env.GCAL_CALENDAR_ID
    )}/events?${params}`,
    {
      headers: { Authorization: `Bearer ${token}` }
    }
  );

  if (!res.ok) throw new Error(`listEvents ${res.status}`);
  const data = await res.json();
  return data.items ?? [];
}

async function createEvent(
  env: Env,
  token: string,
  title: string,
  startISO: string,
  endISO: string
) {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      env.GCAL_CALENDAR_ID
    )}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        summary: title,
        start: { dateTime: startISO, timeZone: TZ },
        end: { dateTime: endISO, timeZone: TZ }
      })
    }
  );

  if (!res.ok) throw new Error(`createEvent ${res.status}`);
  return await res.json();
}

/* =========================
   Service Account JWT
========================= */

async function getAccessToken(env: Env): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const jwt = await signJWT(
    {
      alg: "RS256",
      typ: "JWT"
    },
    {
      iss: env.GCAL_SA_EMAIL,
      scope: "https://www.googleapis.com/auth/calendar",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600
    },
    env.GCAL_SA_PRIVATE_KEY
  );

  const form = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: jwt
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString()
  });

  if (!res.ok) {
  const errText = await res.text().catch(() => "");
  throw new Error(`token error: ${res.status} ${errText}`);
  }
  const data = await res.json();
  return data.access_token;
}

async function signJWT(header: any, payload: any, pem: string) {
  const enc = new TextEncoder();
  const h = b64url(enc.encode(JSON.stringify(header)));
  const p = b64url(enc.encode(JSON.stringify(payload)));
  const data = `${h}.${p}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToBuf(pem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    enc.encode(data)
  );

  return `${data}.${b64url(new Uint8Array(sig))}`;
}

/* =========================
   Utils
========================= */

function json(obj: any) {
  return new Response(JSON.stringify(obj), {
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

function pemToBuf(pem: string) {
  const clean = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  return Uint8Array.from(atob(clean), (c) => c.charCodeAt(0));
}

function b64url(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
