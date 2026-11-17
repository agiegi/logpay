// localStorage の読み書きと旧データの移行

export type Workplace = {
  id: string;
  name: string;
  payday: number;
  closingDay: number | null;
  defaultWage: number;
};

export type ShiftRecord = {
  id: string;
  workplaceId: string;
  date: string;
  hours: number;
  wage: number;
  dailyPay: number;
  createdAt: string;
};

export type Store = {
  schemaVersion: 3;
  workplaces: Workplace[];
  records: ShiftRecord[];
  lastWorkplaceId: string;
};

const KEY = 'logpay_v3';
const KEY_V2 = 'logpay_v2';
const LEGACY_PAYDAY = 'logpay_payday';
const LEGACY_WAGE = 'logpay_default_wage';
const LEGACY_RECORDS = 'logpay_records';

// 選択が1行に収まる数。読み込みでは超えていても受け入れる
export const MAX_WORKPLACES = 3;
export const NAME_MAX = 12;

const DEFAULT_PAYDAY = 10;
const DEFAULT_WAGE = 1100;

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

export function newWorkplace(name = ''): Workplace {
  return {
    id: newId(),
    name: name.slice(0, NAME_MAX),
    payday: DEFAULT_PAYDAY,
    closingDay: null,
    defaultWage: DEFAULT_WAGE,
  };
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

function cleanName(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, NAME_MAX) : '';
}

// v2 の settings も同じ形なので, そのまま勤務先として読める
function parseWorkplace(value: unknown): Workplace | null {
  if (typeof value !== 'object' || value === null) return null;
  const w = value as Record<string, unknown>;
  return {
    id: typeof w.id === 'string' && w.id !== '' ? w.id : newId(),
    name: cleanName(w.name),
    payday: clampDay(w.payday, DEFAULT_PAYDAY),
    closingDay:
      w.closingDay === null || w.closingDay === undefined ? null : clampDay(w.closingDay, 31),
    defaultWage: clampWage(w.defaultWage, DEFAULT_WAGE),
  };
}

// 壊れた要素は捨て, 足りない項目は補う
function parseRecord(value: unknown, ids: Set<string>, fallback: string): ShiftRecord | null {
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
    // 知らない勤務先を指していたら最初の勤務先に寄せる
    workplaceId:
      typeof r.workplaceId === 'string' && ids.has(r.workplaceId) ? r.workplaceId : fallback,
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

function parseRecords(value: unknown, ids: Set<string>, fallback: string): ShiftRecord[] {
  if (!Array.isArray(value)) return [];
  const parsed: ShiftRecord[] = [];
  for (const item of value) {
    const record = parseRecord(item, ids, fallback);
    if (record !== null) parsed.push(record);
  }
  return sortRecords(parsed);
}

function readWorkplaces(s: Record<string, unknown>): Workplace[] {
  const out: Workplace[] = [];
  const seen = new Set<string>();

  const push = (w: Workplace | null) => {
    if (w === null) return;
    const safe = seen.has(w.id) ? { ...w, id: newId() } : w;
    seen.add(safe.id);
    out.push(safe);
  };

  if (Array.isArray(s.workplaces)) {
    for (const w of s.workplaces) push(parseWorkplace(w));
  }
  // v2 は settings に1件分が入っている
  if (out.length === 0) push(parseWorkplace(s.settings));
  if (out.length === 0) push(newWorkplace());

  return out;
}

// v3 でも v2 でも読める。勤務先は必ず1つ以上になる
export function parseStore(value: unknown): Store | null {
  if (typeof value !== 'object' || value === null) return null;
  const s = value as Record<string, unknown>;

  const workplaces = readWorkplaces(s);
  const ids = new Set(workplaces.map((w) => w.id));
  const fallback = workplaces[0].id;
  const records = parseRecords(s.records, ids, fallback);

  const last =
    typeof s.lastWorkplaceId === 'string' && ids.has(s.lastWorkplaceId)
      ? s.lastWorkplaceId
      : fallback;

  return { schemaVersion: 3, workplaces, records, lastWorkplaceId: last };
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

function emptyStore(): Store {
  const wp = newWorkplace();
  return { schemaVersion: 3, workplaces: [wp], records: [], lastWorkplaceId: wp.id };
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

  const raw = readJson(LEGACY_RECORDS);
  const wp: Workplace = {
    id: newId(),
    name: '',
    payday: clampDay(payday, DEFAULT_PAYDAY),
    closingDay: null,
    defaultWage: clampWage(wage, DEFAULT_WAGE),
  };
  const records = parseRecords(raw, new Set([wp.id]), wp.id);
  if (payday === null && wage === null && records.length === 0) return null;

  return { schemaVersion: 3, workplaces: [wp], records, lastWorkplaceId: wp.id };
}

// 旧キーは消さずに残す（戻せるように）
export function loadStore(): Store {
  const fromV3 = parseStore(readJson(KEY));
  if (fromV3 !== null) return fromV3;

  const fromV2 = parseStore(readJson(KEY_V2));
  if (fromV2 !== null) {
    saveStore(fromV2);
    return fromV2;
  }

  const legacy = loadLegacy();
  if (legacy !== null) {
    saveStore(legacy);
    return legacy;
  }

  return emptyStore();
}

export function saveStore(store: Store): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // 容量超過やプライベートモードでは保存できない
  }
}

// 名前が空のときの出し方。勤務先が2つ以上のときしか使わない
export function displayName(workplace: Workplace, index: number): string {
  return workplace.name !== '' ? workplace.name : `勤務先${index + 1}`;
}
