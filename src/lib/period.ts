// 支給日と締め日から対象期間を出す

export type Period = {
  periodStart: string;
  periodEnd: string;
  payday: string;
};

// ローカル時刻で YYYY-MM-DD を作る（toISOString は UTC なので朝にずれる）
export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// YYYY-MM-DD をローカルの Date にする
export function parseDate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// 時刻を落とした今日
export function today(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

// b - a の日数
export function daysBetween(a: Date, b: Date): number {
  const ms =
    Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) -
    Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  return Math.round(ms / 86400000);
}

// その月に無い日は末日に丸める（31日指定の2月は28日）
function dayInMonth(year: number, month: number, day: number): Date {
  const last = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, last));
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

// 基準日以降で最初に来る指定日
function onOrAfter(base: Date, day: number): Date {
  const inThisMonth = dayInMonth(base.getFullYear(), base.getMonth(), day);
  if (inThisMonth.getTime() >= base.getTime()) return inThisMonth;
  return dayInMonth(base.getFullYear(), base.getMonth() + 1, day);
}

// 基準日以前で最後に来た指定日
function onOrBefore(base: Date, day: number): Date {
  const inThisMonth = dayInMonth(base.getFullYear(), base.getMonth(), day);
  if (inThisMonth.getTime() <= base.getTime()) return inThisMonth;
  return dayInMonth(base.getFullYear(), base.getMonth() - 1, day);
}

// closingDay が null なら締め日なし（前回支給日の翌日からその支給日まで）
export function currentPeriod(base: Date, payday: number, closingDay: number | null): Period {
  const pay = onOrAfter(base, payday);

  if (closingDay === null) {
    const prevPay = dayInMonth(pay.getFullYear(), pay.getMonth() - 1, payday);
    return {
      periodStart: formatDate(addDays(prevPay, 1)),
      periodEnd: formatDate(pay),
      payday: formatDate(pay),
    };
  }

  // 支給日の直前の締め日で締める（当月払いでも翌月払いでもこれで決まる）
  const end = onOrBefore(pay, closingDay);
  const prevEnd = dayInMonth(end.getFullYear(), end.getMonth() - 1, closingDay);
  return {
    periodStart: formatDate(addDays(prevEnd, 1)),
    periodEnd: formatDate(end),
    payday: formatDate(pay),
  };
}

// その日に働いた分が支給される日
export function paydayFor(date: string, payday: number, closingDay: number | null): string {
  const worked = parseDate(date);
  if (closingDay === null) return formatDate(onOrAfter(worked, payday));
  return formatDate(onOrAfter(onOrAfter(worked, closingDay), payday));
}

// 支給日から, その回の対象期間を出す
export function periodOfPayday(
  payday: string,
  paydayDay: number,
  closingDay: number | null
): Period {
  return currentPeriod(parseDate(payday), paydayDay, closingDay);
}
