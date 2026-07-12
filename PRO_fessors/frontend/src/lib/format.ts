export const LOVELACE_PER_ADA = 1_000_000;

export function lovelaceToAda(value: number | string | null | undefined): number {
  if (value == null) return 0;
  return Number(value) / LOVELACE_PER_ADA;
}

export function formatAda(value: number, digits = 1): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: value > 0 && value < 1 ? 2 : 0,
  }).format(value);
}

export function formatCompact(value: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function formatPercent(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function timeUntil(value: string): string {
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);
  const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (Math.abs(seconds) < 60) return relative.format(seconds, "second");
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return relative.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 48) return relative.format(hours, "hour");
  return relative.format(Math.round(hours / 24), "day");
}

export function shortHash(value: string, head = 7, tail = 5): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export function categoryColor(category: string): string {
  const colors: Record<string, string> = {
    Crypto: "#B9F66B",
    Sports: "#5AE6C5",
    Technology: "#8EA8FF",
    Economics: "#FFB45A",
    Entertainment: "#DD8CFF",
    Science: "#5EC8FF",
  };
  return colors[category] ?? "#B9F66B";
}
