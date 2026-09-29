const taipeiDateTimeFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

const taipeiDateTimeInputFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const taipeiDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function dateParts(formatter: Intl.DateTimeFormat, date: Date) {
  return Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
}

export function formatTaipeiDateTime(value: string | Date | null | undefined): string {
  if (value == null || value === "") return "尚無時間資料";
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "時間資料無效";

  const parts = dateParts(taipeiDateTimeFormatter, date);
  return `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

export function formatTaipeiDate(value: string | Date | null | undefined): string {
  if (value == null || value === "") return "尚無時間資料";
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "時間資料無效";
  const parts = dateParts(taipeiDateFormatter, date);
  return `${parts.year}/${parts.month}/${parts.day}`;
}

/** Convert an absolute timestamp to a datetime-local value in Taiwan time. */
export function formatTaipeiDateTimeInput(value: string | Date | null | undefined): string {
  if (value == null || value === "") return "";
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = dateParts(taipeiDateTimeInputFormatter, date);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** Interpret a datetime-local value as Asia/Taipei wall-clock time, then store UTC. */
export function parseTaipeiDateTimeInput(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const [year, month, day, hour, minute] = [yearText, monthText, dayText, hourText, minuteText].map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  const wallClock = new Date(Date.UTC(year, month - 1, day, hour, minute));
  if (wallClock.getUTCFullYear() !== year || wallClock.getUTCMonth() !== month - 1 || wallClock.getUTCDate() !== day) return null;
  // Taiwan uses UTC+08:00 year-round; datetime-local itself carries no timezone.
  return new Date(wallClock.getTime() - 8 * 60 * 60 * 1000).toISOString();
}
