// Decisions per day over the last half year, as a calendar grid (columns are weeks, rows Monday to Sunday).
// It counts the records in the log and nothing else: no history is invented, so a young log shows a mostly empty grid.
import type { LogEntry } from "@/types";
import { cn } from "@/lib/utils";

export interface ActivityDay {
  date: string;
  count: number;
  future: boolean;
}

const DAY = 86_400_000;
const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Weeks oldest first, each with seven days Monday to Sunday, in UTC like the rest of the log. */
export function activityWeeks(
  log: Pick<LogEntry, "timestamp">[],
  now: Date,
  weeks = 26,
): ActivityDay[][] {
  const counts = new Map<string, number>();
  for (const e of log) {
    const d = e.timestamp.slice(0, 10);
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const mondayIndex = (new Date(today).getUTCDay() + 6) % 7;
  const first = today - mondayIndex * DAY - (weeks - 1) * 7 * DAY;
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const t = first + (w * 7 + d) * DAY;
      const date = isoDay(t);
      return { date, count: counts.get(date) ?? 0, future: t > today };
    }),
  );
}

export const activityLevel = (n: number): 0 | 1 | 2 | 3 | 4 =>
  n === 0 ? 0 : n === 1 ? 1 : n <= 3 ? 2 : n <= 6 ? 3 : 4;

const SHADE = [
  "bg-surface-2",
  "bg-foreground/25",
  "bg-foreground/45",
  "bg-foreground/70",
  "bg-foreground",
] as const;

export function ActivityGrid({ log, now = new Date() }: { log: LogEntry[]; now?: Date }) {
  const weeks = activityWeeks(log, now);
  const total = weeks.flat().reduce((s, d) => s + d.count, 0);
  const month = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
  return (
    <section aria-label="Decision activity" className="space-y-2">
      <p className="text-sm font-medium">
        <span className="tnum">{total}</span> {total === 1 ? "decision" : "decisions"} recorded in the last 6 months
      </p>
      <div className="overflow-x-auto">
        <div className="inline-block">
          <div className="mb-1 flex gap-[3px] text-[10px] leading-3 text-muted-foreground" aria-hidden>
            {weeks.map((w, i) => (
              <span key={i} className="w-2.5 overflow-visible whitespace-nowrap">
                {Number(w[0].date.slice(8, 10)) <= 7 ? month(w[0].date) : ""}
              </span>
            ))}
          </div>
          <div className="flex gap-[3px]" role="img" aria-label={`${total} decisions recorded in the last 6 months, by day`}>
            {weeks.map((w, i) => (
              <div key={i} className="flex flex-col gap-[3px]">
                {w.map((d) => (
                  <span
                    key={d.date}
                    title={d.future ? "" : `${d.count} ${d.count === 1 ? "decision" : "decisions"} on ${d.date}`}
                    className={cn("size-2.5 rounded-[2px]", d.future ? "opacity-0" : SHADE[activityLevel(d.count)])}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground" aria-hidden>
        Less
        {SHADE.map((c) => (
          <span key={c} className={cn("size-2.5 rounded-[2px]", c)} />
        ))}
        More
      </div>
    </section>
  );
}
