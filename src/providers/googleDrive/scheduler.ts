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
    id: `schedule-${now.getTime()}`,
    frequencyMinutes,
    lastRunAt: undefined,
    nextRunAt: new Date(now.getTime() + frequencyMinutes * 60 * 1000).toISOString(),
    active: true,
  };
}

export function advanceSyncSchedule(schedule: SyncSchedule): SyncSchedule {
  const now = new Date();
  return {
    ...schedule,
    lastRunAt: now.toISOString(),
    nextRunAt: new Date(now.getTime() + schedule.frequencyMinutes * 60 * 1000).toISOString(),
  };
}

export function isSyncScheduleDue(schedule: SyncSchedule): boolean {
  if (!schedule.active) return false;
  return new Date() >= new Date(schedule.nextRunAt);
}