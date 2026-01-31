type Env = {
  API_KEY: string;
  GCAL_SA_EMAIL: string;
  GCAL_SA_PRIVATE_KEY: string;
  GCAL_CALENDAR_ID: string;
};

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
      const intent = parseIntent(text);

      let reply: string;

      switch (intent.type) {
        case "LIST_TODAY": {
          const { start, end } = todayRange();
          const events = await listEvents(env, token, start, end);
          reply = formatList("오늘", events);
          break;
        }
        case "LIST_TOMORROW": {
          const { start, end } = tomorrowRange();
          const events = await listEvents(env, token, start, end);
          reply = formatList("내일", events);
          break;
        }
        case "NEXT_EVENT": {
          const now = new Date();
          const events = await listEvents(
            env,
            token,
            now.toISOString(),
            addDays(now, 7).toISOString(),
            1
          );
          reply =
            events.length === 0
              ? "앞으로 7일 내 일정이 없습니다."
              : `다음 일정: ${formatOne(events[0])}`;
          break;
        }
        case "CREATE_EVENT": {
          const created = await createEvent(
            env,
            token,
            intent.title,
            intent.startISO,
            intent.endISO
          );
          reply = `추가 완료: ${created.summary} (${prettyKST(
            intent.startISO
          )})`;
          break;
        }
        default:
          reply =
            "지원 명령: 오늘 일정, 내일 일정, 다음 일정, " +
            "내일 3시 회의 추가, 오늘 14:30 치과 추가";
      }

      return json({ reply });
    } catch (e: any) {
      return json({ reply: `오류: ${e?.message ?? e}` });
    }
  }
};

/* =========================
   Intent Parsing (MVP)
========================= */

type Intent =
  | { type: "LIST_TODAY" }
  | { type: "LIST_TOMORROW" }
  | { type: "NEXT_EVENT" }
  | {
      type: "CREATE_EVENT";
      title: string;
      startISO: string;
      endISO: string;
    }
  | { type: "UNKNOWN" };

function parseIntent(text: string): Intent {
  if (text.includes("오늘") && text.includes("일정")) return { type: "LIST_TODAY" };
  if (text.includes("내일") && text.includes("일정")) return { type: "LIST_TOMORROW" };
  if (text.includes("다음") && text.includes("일정")) return { type: "NEXT_EVENT" };

  // 예: "내일 3시 회의 추가", "오늘 14:30 치과 추가"
  const m = text.match(/^(오늘|내일)\s+(\d{1,2})(?::(\d{2}))?\s*(시)?\s*(.+?)\s*(추가|등록)$/);
  if (m) {
    const day = m[1];
    const hh = Number(m[2]);
    const mm = m[3] ? Number(m[3]) : 0;
    const title = m[5].trim();

    const start = kstISO(day === "오늘" ? 0 : 1, hh, mm);
    const end = addMinutesISO(start, 60);

    return { type: "CREATE_EVENT", title, startISO: start, endISO: end };
  }

  return { type: "UNKNOWN" };
}

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

  if (!res.ok) throw new Error("token error");
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
   Date Helpers (KST)
========================= */

function todayRange() {
  const start = startOfDayKST();
  return { start, end: addDays(start, 1) };
}

function tomorrowRange() {
  const start = addDays(startOfDayKST(), 1);
  return { start, end: addDays(start, 1) };
}

function startOfDayKST() {
  const now = new Date(Date.now() + 9 * 3600 * 1000);
  now.setUTCHours(0, 0, 0, 0);
  return now.toISOString();
}

function kstISO(dayOffset: number, hh: number, mm: number) {
  const base = new Date(startOfDayKST());
  base.setUTCHours(base.getUTCHours() + hh);
  base.setUTCMinutes(base.getUTCMinutes() + mm);
  return new Date(base.getTime() + dayOffset * 86400000).toISOString();
}

function addDays(d: Date | string, days: number) {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Date(date.getTime() + days * 86400000).toISOString();
}

function addMinutesISO(iso: string, min: number) {
  return new Date(new Date(iso).getTime() + min * 60000).toISOString();
}

function prettyKST(iso: string) {
  const d = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(
    d.getUTCDate()
  )} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/* =========================
   Utils
========================= */

function json(obj: any) {
  return new Response(JSON.stringify(obj), {
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

function pad(n: number) {
  return String(n).padStart(2, "0");
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

function formatList(label: string, events: any[]) {
  if (!events || events.length === 0) return `${label} 일정 없습니다.`;

  const lines = events.slice(0, 10).map((e: any) => `- ${formatOne(e)}`);
  return `${label} 일정 ${events.length}건:\n${lines.join("\n")}`;
}

function formatOne(e: any) {
  const title = e?.summary ?? "(제목없음)";

  // 종일 이벤트(date-only)
  if (e?.start?.date) return `${title} (종일)`;

  const start = e?.start?.dateTime ?? "";
  if (!start) return `${title}`;

  return `${title} (${prettyKST(start)})`;
}

