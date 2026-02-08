import type { CommandDefinition } from "./types";

type ListParams = {
  label: "오늘" | "내일" | "다음";
  start: string;
  end: string;
  maxResults: number;
};

const command: CommandDefinition<ListParams, string> = {
  id: "list-events",
  description: "오늘/내일/다음 일정 조회",
  examples: ["오늘 일정 알려줘", "내일 일정", "다음 일정 보여줘"],
  tags: ["calendar", "list"],
  match(text) {
    if (text.includes("오늘") && text.includes("일정")) {
      const { start, end } = todayRange();
      return { label: "오늘", start, end, maxResults: 20 };
    }
    if (text.includes("내일") && text.includes("일정")) {
      const { start, end } = tomorrowRange();
      return { label: "내일", start, end, maxResults: 20 };
    }
    if (text.includes("다음") && text.includes("일정")) {
      const now = new Date();
      return {
        label: "다음",
        start: now.toISOString(),
        end: addDays(now, 7),
        maxResults: 1
      };
    }
    return null;
  },
  async handler(ctx, params) {
    const events = await ctx.calendar.listEvents(
      ctx.env,
      ctx.token,
      params.start,
      params.end,
      params.maxResults
    );

    if (params.label === "다음") {
      return events.length === 0
        ? "앞으로 7일 내 일정이 없습니다."
        : `다음 일정: ${formatOne(events[0])}`;
    }

    return formatList(params.label, events);
  }
};

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

function addDays(d: Date | string, days: number) {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Date(date.getTime() + days * 86400000).toISOString();
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

function prettyKST(iso: string) {
  const d = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(
    d.getUTCDate()
  )} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export default command;
