// 稼いだ額を月ごと / 週ごとにまとめる

import { formatDate, parseDate } from './period';
import type { ShiftRecord } from './storage';

export type Bucket = {
  key: string;
  label: string;
  total: number;
};

// 月曜はじまりの週の頭
function startOfWeek(date: Date): Date {
  const shift = (date.getDay() + 6) % 7;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - shift);
}

function sumBy(records: ShiftRecord[], keyOf: (date: string) => string): Map<string, number> {
  const totals = new Map<string, number>();
  for (const r of records) {
    const key = keyOf(r.date);
    totals.set(key, (totals.get(key) ?? 0) + r.dailyPay);
  }
  return totals;
}

export function monthlyTotals(records: ShiftRecord[], base: Date, limit = 12): Bucket[] {
  if (records.length === 0) return [];
  const totals = sumBy(records, (d) => d.slice(0, 7));

  const keys = [...totals.keys()].sort();
  const first = parseDate(`${keys[0]}-01`);
  const lastRecord = parseDate(`${keys[keys.length - 1]}-01`);
  // 記録が無い月も並べて, 休んだ月が抜けて見えないようにする
  const end = lastRecord > base ? lastRecord : new Date(base.getFullYear(), base.getMonth(), 1);

  const out: Bucket[] = [];
  let cur = first;
  while (cur <= end) {
    const key = formatDate(cur).slice(0, 7);
    out.push({ key, label: `${cur.getMonth() + 1}月`, total: totals.get(key) ?? 0 });
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }
  return out.slice(-limit);
}

export function weeklyTotals(records: ShiftRecord[], base: Date, limit = 12): Bucket[] {
  if (records.length === 0) return [];
  const totals = sumBy(records, (d) => formatDate(startOfWeek(parseDate(d))));

  const keys = [...totals.keys()].sort();
  const first = parseDate(keys[0]);
  const lastRecord = parseDate(keys[keys.length - 1]);
  const thisWeek = startOfWeek(base);
  const end = lastRecord > thisWeek ? lastRecord : thisWeek;

  const out: Bucket[] = [];
  let cur = first;
  while (cur <= end) {
    const key = formatDate(cur);
    out.push({
      key,
      label: `${cur.getMonth() + 1}/${cur.getDate()}`,
      total: totals.get(key) ?? 0,
    });
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 7);
  }
  return out.slice(-limit);
}

// 軸の上端をきりのいい数にする
export function niceCeiling(value: number): number {
  if (value <= 0) return 1000;
  const digits = Math.floor(Math.log10(value));
  const unit = 10 ** digits;
  for (const step of [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10]) {
    if (value <= step * unit) return step * unit;
  }
  return 10 * unit;
}

// 1つの軸では表記を揃える。上端が10万を超えたら万でまとめる
export function axisLabel(value: number, top: number): string {
  if (value === 0) return '0';
  if (top < 100000) return value.toLocaleString('ja-JP');
  const man = value / 10000;
  return `${Number.isInteger(man) ? man : man.toFixed(1)}万`;
}
