/** Календарный день YYYY-MM-DD в локальном часовом поясе среды выполнения. */
export function localCalendarDateString(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Нормализовать дату из API (ISO) к YYYY-MM-DD. */
export function toCalendarDayString(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    return value.length >= 10 ? value.slice(0, 10) : null;
  }
  return localCalendarDateString(value);
}

/** true, если сегодня (локальный календарь) раньше выбранного дня старта — цель «ещё рано». */
export function isBeforeStartCalendarDay(startsOn: string | Date | null | undefined): boolean {
  const day = typeof startsOn === "string" ? startsOn.slice(0, 10) : startsOn ? localCalendarDateString(startsOn) : null;
  if (!day || day.length < 10) return false;
  return localCalendarDateString() < day;
}
