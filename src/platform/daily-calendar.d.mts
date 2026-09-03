export const CURRENT_DAILY_EPOCH: "2026-09-01";
export function dailyDateKey(value?: Date | string | number): string;
export function dailyCatalogOffset(value: Date | string | number, epoch?: string): number;
export function dailyCatalogIndex(value: Date | string | number, count: number, epoch?: string): number;
export function catalogDateKey(index: number, epoch?: string): string;
