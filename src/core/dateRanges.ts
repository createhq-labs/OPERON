// Pure date-range resolution for the Employee Profile's attendance filter.
// Kept separate from operon.ts since it has no permission/data-layer concerns.

export type DateRangePreset =
  | "custom"
  | "this_week"
  | "this_month"
  | "last_month"
  | "quarter"
  | "year"
  | "from_joining";

export interface DateRange {
  from: string; // ISO date
  to:   string; // ISO date
}

// Local getters only — never .toISOString() here. Converting a locally-
// constructed date to UTC shifts the calendar day in positive-UTC-offset
// timezones (e.g. midnight IST becomes the previous day in UTC).
function toIsoDate(d: Date): string {
  const y   = d.getFullYear();
  const m   = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Resolves a filter preset to a concrete { from, to } range. `joinDate` is
 * the employee's dateJoined — the "from_joining" default and the floor for
 * every other preset (attendance never counts before an employee joined).
 */
export function resolveDateRange(
  preset: DateRangePreset,
  joinDate: string | undefined,
  today: string,
  custom?: DateRange,
): DateRange {
  const todayDate = new Date(`${today}T00:00:00`);
  const floor = joinDate ?? today;
  const clampFrom = (from: string) => (from < floor ? floor : from);

  switch (preset) {
    case "custom":
      return custom
        ? { from: clampFrom(custom.from), to: custom.to }
        : { from: floor, to: today };

    case "this_week": {
      const start = new Date(todayDate);
      start.setDate(start.getDate() - start.getDay());
      return { from: clampFrom(toIsoDate(start)), to: today };
    }

    case "this_month": {
      const start = new Date(todayDate.getFullYear(), todayDate.getMonth(), 1);
      return { from: clampFrom(toIsoDate(start)), to: today };
    }

    case "last_month": {
      const start = new Date(todayDate.getFullYear(), todayDate.getMonth() - 1, 1);
      const end   = new Date(todayDate.getFullYear(), todayDate.getMonth(), 0);
      return { from: clampFrom(toIsoDate(start)), to: toIsoDate(end) };
    }

    case "quarter": {
      const quarterStartMonth = Math.floor(todayDate.getMonth() / 3) * 3;
      const start = new Date(todayDate.getFullYear(), quarterStartMonth, 1);
      return { from: clampFrom(toIsoDate(start)), to: today };
    }

    case "year": {
      const start = new Date(todayDate.getFullYear(), 0, 1);
      return { from: clampFrom(toIsoDate(start)), to: today };
    }

    case "from_joining":
    default:
      return { from: floor, to: today };
  }
}

export const DATE_RANGE_PRESET_LABELS: Record<DateRangePreset, string> = {
  custom:       "Custom Range",
  this_week:    "This Week",
  this_month:   "This Month",
  last_month:   "Last Month",
  quarter:      "Quarter",
  year:         "Year",
  from_joining: "From Joining Date",
};
