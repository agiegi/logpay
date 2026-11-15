// localStorage の読み書きと旧データの移行

export type ShiftRecord = {
  id: string;
  date: string;
  hours: number;
  wage: number;
  dailyPay: number;
  createdAt: string;
};

export type Settings = {
  payday: number;
  closingDay: number | null;
  defaultWage: number;
};

export type Store = {
  schemaVersion: 2;
  settings: Settings;
  records: ShiftRecord[];
};

const KEY = 'logpay_v2';
const LEGACY_PAYDAY = 'logpay_payday';
const LEGACY_WAGE = 'logpay_default_wage';
const LEGACY_RECORDS = 'logpay_records';

export const DEFAULT_SETTINGS: Settings = {
  payday: 10,
  closingDay: null,
  defaultWage: 1100,
};

// 1-31 に収める。空や数値でなければ既定値
export function clampDay(value: unknown, fallback: number): number {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(31, Math.max(1, n));
}

// 1円以上に収める。空や数値でなければ既定値
export function clampWage(value: unknown, fallback: number): number {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return fallback;
  return n;
}

// crypto.randomUUID は https か localhost でしか使えない
export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// 日付降順, 同じ日は登録が新しい順
export function sortRecords(records: ShiftRecord[]): ShiftRecord[] {
  return [...records].sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)
  );
}

function isDateString(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

// 壊れた要素は捨て, 足りない項目は補う
function parseRecord(value: unknown): ShiftRecord | null {
  if (typeof value !== 'object' || value === null) return null;
  const r = value as Record<string, unknown>;
  if (!isDateString(r.date)) return null;

  const hours = Number(r.hours);
  const wage = Math.floor(Number(r.wage));
  if (!Number.isFinite(hours) || hours <= 0) return null;
  if (!Number.isFinite(wage) || wage <= 0) return null;

  const stored = Math.floor(Number(r.dailyPay));
  const dailyPay = Number.isFinite(stored) && stored >= 0 ? stored : Math.floor(hours * wage);

  return {
    id: typeof r.id === 'string' && r.id !== '' ? r.id : newId(),
    date: r.date,
    hours,
    wage,
    dailyPay,
    createdAt:
      typeof r.createdAt === 'string' && r.createdAt !== ''
        ? r.createdAt
        : `${r.date}T00:00:00.000Z`,
  };
}

function parseRecords(value: unknown): ShiftRecord[] {
  if (!Array.isArray(value)) return [];
  const parsed: ShiftRecord[] = [];
  for (const item of value) {
    const record = parseRecord(item);
    if (record !== null) parsed.push(record);
  }
  return sortRecords(parsed);
}

function parseSettings(value: unknown): Settings {
  if (typeof value !== 'object' || value === null) return { ...DEFAULT_SETTINGS };
  const s = value as Record<string, unknown>;
  return {
    payday: clampDay(s.payday, DEFAULT_SETTINGS.payday),
    closingDay:
      s.closingDay === null || s.closingDay === undefined ? null : clampDay(s.closingDay, 31),
    defaultWage: clampWage(s.defaultWage, DEFAULT_SETTINGS.defaultWage),
  };
}

// 壊れた JSON でも起動できるように囲む
function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return undefined;
    return JSON.parse(raw);
  } catch {
    // 読めないデータは無かったものとして扱う
    return undefined;
  }
}

function loadLegacy(): Store | null {
  let payday: string | null = null;
  let wage: string | null = null;
  try {
    payday = localStorage.getItem(LEGACY_PAYDAY);
    wage = localStorage.getItem(LEGACY_WAGE);
  } catch {
    return null;
  }

  const records = parseRecords(readJson(LEGACY_RECORDS));
  if (payday === null && wage === null && records.length === 0) return null;

  return {
    schemaVersion: 2,
    settings: {
      payday: clampDay(payday, DEFAULT_SETTINGS.payday),
      closingDay: null,
      defaultWage: clampWage(wage, DEFAULT_SETTINGS.defaultWage),
    },
    records,
  };
}

// 読み込んだものを形の揃った Store にする。違えば null
export function parseStore(value: unknown): Store | null {
  if (typeof value !== 'object' || value === null) return null;
  const s = value as Record<string, unknown>;
  return {
    schemaVersion: 2,
    settings: parseSettings(s.settings),
    records: parseRecords(s.records),
  };
}

// 旧キーは消さずに残す（戻せるように）
export function loadStore(): Store {
  const stored = parseStore(readJson(KEY));
  if (stored !== null) return stored;

  const legacy = loadLegacy();
  if (legacy !== null) {
    saveStore(legacy);
    return legacy;
  }

  return { schemaVersion: 2, settings: { ...DEFAULT_SETTINGS }, records: [] };
}

export function saveStore(store: Store): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // 容量超過やプライベートモードでは保存できない
  }
}
