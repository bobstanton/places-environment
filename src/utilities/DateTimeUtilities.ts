// Returns 0-23; Intl formats midnight as "24".
export function getHourInTimezone(date: Date, timezone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    hour12: false,
    timeZone: timezone
  });
  const hour = parseInt(formatter.format(date), 10);
  return hour === 24 ? 0 : hour;
}

export function getMinuteInTimezone(date: Date, timezone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    minute: 'numeric',
    timeZone: timezone
  });
  return parseInt(formatter.format(date), 10);
}

export function parseWallClockTime(timestamp: string): { hours: number; minutes: number } | null {
  const match = timestamp.match(/^\d{4}-\d{2}-\d{2}[T ](\d{2}):(\d{2})/);
  if (!match) return null;
  return { hours: Number(match[1]), minutes: Number(match[2]) };
}

// en-CA formats as YYYY-MM-DD.
export function getDateStringInTimezone(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: timezone
  }).format(date);
}

export function formatTimeForDisplay(date: Date, timezone: string): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: timezone
  });
}

export function formatDateForDisplay(date: Date, timezone: string): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: timezone
  });
}

export function formatWeekday(date: Date, timezone: string): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    timeZone: timezone
  });
}

export function formatMonthDay(date: Date, timezone: string): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: timezone
  });
}
