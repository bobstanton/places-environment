import { TidePoint } from '../types';

export function groupTidesByDay(tides: TidePoint[]): Record<string, TidePoint[]> {
  const grouped: Record<string, TidePoint[]> = {};

  for (const tide of tides) {
    const [datePart] = tide.timestamp_local.split(' ');
    const dateStr = datePart;

    if (!grouped[dateStr]) {
      grouped[dateStr] = [];
    }

    grouped[dateStr].push(tide);
  }

  return grouped;
}
