import type { CommandDefinition } from "./types";

type CreateParams = {
  title: string;
  startISO: string;
  endISO: string;
};

const command: CommandDefinition<CreateParams, string> = {
  id: "create-event",
  description: "간단 문장으로 일정 추가",
  examples: ["내일 3시 회의 추가", "오늘 14:30 치과 추가"],
  tags: ["calendar", "create"],
  match(text) {
    const m = text.match(
      /^(오늘|내일)\s+(\d{1,2})(?::(\d{2}))?\s*(시)?\s*(.+?)\s*(추가|등록)$/
    );
    if (!m) return null;

    const day = m[1];
    const hh = Number(m[2]);
    const mm = m[3] ? Number(m[3]) : 0;
    const title = m[5].trim();

    const start = kstISO(day === "오늘" ? 0 : 1, hh, mm);
    const end = addMinutesISO(start, 60);

    return { title, startISO: start, endISO: end };
  },
  async handler(ctx, params) {
    const created = await ctx.calendar.createEvent(
      ctx.env,
      ctx.token,
      params.title,
      params.startISO,
      params.endISO
    );

    return `추가 완료: ${created.summary} (${prettyKST(params.startISO)})`;
  }
};

function kstISO(dayOffset: number, hh: number, mm: number) {
  const base = new Date(startOfDayKST());
  base.setUTCHours(base.getUTCHours() + hh);
  base.setUTCMinutes(base.getUTCMinutes() + mm);
  return new Date(base.getTime() + dayOffset * 86400000).toISOString();
}

function startOfDayKST() {
  const now = new Date(Date.now() + 9 * 3600 * 1000);
  now.setUTCHours(0, 0, 0, 0);
  return now.toISOString();
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

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export default command;
