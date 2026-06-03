export interface SyncSchedule {
  id: string;
  frequencyMinutes: number;
  lastRunAt?: string;
  nextRunAt: string;
  active: boolean;
}

export function createSyncSchedule(frequencyMinutes: number): SyncSchedule {
  if (frequencyMinutes <= 0) {
    throw new Error("Sync schedule frequency must be greater than zero.");
  }

  const now = new Date();
  return {
    id: `schedule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    frequencyMinutes,
    lastRunAt: now.toISOString(),
    nextRunAt: new Date(now.getTime() + frequencyMinutes * 60 * 1000).toISOString(),
    active: true,
  };
}
