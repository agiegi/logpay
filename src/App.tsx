import React, { useState, useEffect, useMemo, useRef } from 'react';
import './App.css';
import About from './About';
import Chart from './Chart';
import EditDialog from './EditDialog';
import InstallPrompt from './InstallPrompt';
import { exportStore, importStore } from './lib/backup';
import { askPersist } from './lib/install';
import {
  currentPeriod,
  daysBetween,
  formatDate,
  parseDate,
  paydayFor,
  periodOfPayday,
  today,
} from './lib/period';
import { monthlyTotals, weeklyTotals } from './lib/stats';
import {
  clampDay,
  clampWage,
  loadStore,
  newId,
  saveStore,
  sortRecords,
  type Settings,
  type ShiftRecord,
} from './lib/storage';

type Group = {
  payday: string;
  periodStart: string;
  periodEnd: string;
  total: number;
  records: ShiftRecord[];
};

const initial = loadStore();
const UNDO_MS = 5000;

const yen = (value: number) => `¥${value.toLocaleString('ja-JP')}`;
const slash = (date: string) => date.replace(/-/g, '/');

export default function App() {
  const [settings, setSettings] = useState<Settings>(initial.settings);
  const [records, setRecords] = useState<ShiftRecord[]>(initial.records);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [editing, setEditing] = useState<ShiftRecord | null>(null);
  const [span, setSpan] = useState<'month' | 'week'>('month');

  // 設定欄は入力途中の文字列を持ち, 妥当な値のときだけ設定に反映する
  const [paydayText, setPaydayText] = useState(String(initial.settings.payday));
  const [closingText, setClosingText] = useState(
    initial.settings.closingDay === null ? '' : String(initial.settings.closingDay)
  );
  const [wageText, setWageText] = useState(String(initial.settings.defaultWage));

  const [workDate, setWorkDate] = useState(() => formatDate(new Date()));
  const [hours, setHours] = useState('4');
  const [wage, setWage] = useState(String(initial.settings.defaultWage));
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [undoItem, setUndoItem] = useState<ShiftRecord | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoButton = useRef<HTMLButtonElement | null>(null);
  const filePicker = useRef<HTMLInputElement | null>(null);
  const persistAsked = useRef(false);

  useEffect(() => {
    saveStore({ schemaVersion: 2, settings, records });
  }, [settings, records]);

  useEffect(
    () => () => {
      if (undoTimer.current !== null) clearTimeout(undoTimer.current);
    },
    []
  );

  // 削除した行のボタンは消えるので, 取り消しボタンに移す
  useEffect(() => {
    if (undoItem !== null) undoButton.current?.focus();
  }, [undoItem]);

  // 記録ができたら, 容量不足での退避から外してもらう
  useEffect(() => {
    if (records.length > 0 && !persistAsked.current) {
      persistAsked.current = true;
      void askPersist();
    }
  }, [records.length]);

  const todayStr = formatDate(today());

  const period = useMemo(
    () => currentPeriod(today(), settings.payday, settings.closingDay),
    [settings.payday, settings.closingDay]
  );

  const daysLeft = daysBetween(today(), parseDate(period.payday));

  // 支給日ごとにまとめる
  const groups = useMemo<Group[]>(() => {
    const byPayday = new Map<string, ShiftRecord[]>();
    for (const record of records) {
      const key = paydayFor(record.date, settings.payday, settings.closingDay);
      const list = byPayday.get(key);
      if (list === undefined) byPayday.set(key, [record]);
      else list.push(record);
    }

    return [...byPayday.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([payday, list]) => {
        const p = periodOfPayday(payday, settings.payday, settings.closingDay);
        return {
          payday,
          periodStart: p.periodStart,
          periodEnd: p.periodEnd,
          total: list.reduce((sum, r) => sum + r.dailyPay, 0),
          records: list,
        };
      });
  }, [records, settings.payday, settings.closingDay]);

  const buckets = useMemo(
    () =>
      span === 'month'
        ? monthlyTotals(records, today())
        : weeklyTotals(records, today()),
    [records, span]
  );

  // 支給日を過ぎた分だけを累計にする
  const paidTotal = groups
    .filter((g) => g.payday < todayStr)
    .reduce((sum, g) => sum + g.total, 0);
  const nextTotal = groups.find((g) => g.payday === period.payday)?.total ?? 0;
  const laterTotal = groups
    .filter((g) => g.payday > period.payday)
    .reduce((sum, g) => sum + g.total, 0);

  const formPayday =
    workDate === '' ? null : paydayFor(workDate, settings.payday, settings.closingDay);

  const isDayValid = (text: string) => {
    const n = Number(text);
    return text !== '' && Number.isInteger(n) && n >= 1 && n <= 31;
  };

  const handlePaydayChange = (text: string) => {
    setPaydayText(text);
    if (isDayValid(text)) setSettings((s) => ({ ...s, payday: Number(text) }));
  };

  const handleClosingChange = (text: string) => {
    setClosingText(text);
    if (isDayValid(text)) setSettings((s) => ({ ...s, closingDay: Number(text) }));
  };

  const handleClosingToggle = (on: boolean) => {
    if (!on) {
      setClosingText('');
      setSettings((s) => ({ ...s, closingDay: null }));
      return;
    }
    const day = clampDay(closingText, 31);
    setClosingText(String(day));
    setSettings((s) => ({ ...s, closingDay: day }));
  };

  const handleWageChange = (text: string) => {
    setWageText(text);
    const n = Number(text);
    if (text !== '' && Number.isInteger(n) && n >= 1) {
      setSettings((s) => ({ ...s, defaultWage: n }));
      setWage(text);
    }
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const h = Number(hours);
    const w = clampWage(wage, 0);
    if (!workDate || !Number.isFinite(h) || h <= 0 || w <= 0) {
      setError('日付, 時間, 時給をもう一度確かめてください。');
      return;
    }

    const record: ShiftRecord = {
      id: newId(),
      date: workDate,
      hours: h,
      wage: w,
      dailyPay: Math.floor(h * w),
      createdAt: new Date().toISOString(),
    };

    setError('');
    setRecords((prev) => sortRecords([record, ...prev]));
    setWage(String(settings.defaultWage));
  };

  const handleSaveEdit = (next: ShiftRecord) => {
    setRecords((prev) => sortRecords(prev.map((r) => (r.id === next.id ? next : r))));
    setEditing(null);
  };

  const handleDelete = (record: ShiftRecord) => {
    if (undoTimer.current !== null) clearTimeout(undoTimer.current);
    setEditing(null);
    setRecords((prev) => prev.filter((r) => r.id !== record.id));
    setUndoItem(record);
    undoTimer.current = setTimeout(() => setUndoItem(null), UNDO_MS);
  };

  const handleUndo = () => {
    if (undoItem === null) return;
    if (undoTimer.current !== null) clearTimeout(undoTimer.current);
    setRecords((prev) => sortRecords([undoItem, ...prev]));
    setUndoItem(null);
  };

  const handleExport = () => {
    exportStore({ schemaVersion: 2, settings, records });
    setNotice(`${records.length}件を書き出しました。`);
  };

  const handleImport = async (file: File) => {
    try {
      const store = await importStore(file);
      const ok = window.confirm(
        `${store.records.length}件の記録を読み込みます。今の${records.length}件は置き換わります。`
      );
      if (!ok) return;
      setSettings(store.settings);
      setRecords(store.records);
      setPaydayText(String(store.settings.payday));
      setClosingText(
        store.settings.closingDay === null ? '' : String(store.settings.closingDay)
      );
      setWageText(String(store.settings.defaultWage));
      setNotice(`${store.records.length}件を読み込みました。`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : '読み込めませんでした。');
    }
  };

  const countdown =
    daysLeft === 0 ? '今日' : daysLeft === 1 ? '明日' : `あと${daysLeft}日`;

  return (
    <main>
      <div className="app-head">
        <h1>LogPay</h1>
        <div className="head-actions">
          <button
            type="button"
            className="link-btn"
            aria-expanded={isSettingsOpen}
            aria-controls="settings"
            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
          >
            {isSettingsOpen ? '設定を閉じる' : '設定'}
          </button>
          <button type="button" className="link-btn" onClick={() => setIsAboutOpen(true)}>
            このアプリについて
          </button>
        </div>
      </div>

      {isSettingsOpen && (
        <section id="settings" className="settings" aria-labelledby="settings-heading">
          <h2 id="settings-heading" className="sr-only">設定</h2>

          <div className="row">
            <label>
              給料日（日）
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={31}
                value={paydayText}
                onChange={(e) => handlePaydayChange(e.target.value)}
                onBlur={() => setPaydayText(String(settings.payday))}
              />
            </label>
            <label>
              基本時給（円）
              <input
                type="number"
                inputMode="numeric"
                min={1}
                step={10}
                value={wageText}
                onChange={(e) => handleWageChange(e.target.value)}
                onBlur={() => setWageText(String(settings.defaultWage))}
              />
            </label>
          </div>

          <label className="check">
            <input
              type="checkbox"
              checked={settings.closingDay !== null}
              onChange={(e) => handleClosingToggle(e.target.checked)}
            />
            締め日がある
          </label>

          {settings.closingDay !== null && (
            <div className="row">
              <label>
                締め日（日）
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={31}
                  aria-describedby="closing-note"
                  value={closingText}
                  onChange={(e) => handleClosingChange(e.target.value)}
                  onBlur={() => setClosingText(String(settings.closingDay ?? 31))}
                />
              </label>
              <p id="closing-note" className="note">
                31 は末日として扱います。締め日を外すと, 前回の給料日の翌日から次の給料日までが対象になります。
              </p>
            </div>
          )}

          <div className="backup">
            <h3>記録の持ち出し</h3>
            <p className="note">
              記録はこの端末の中だけにあります。ブラウザのデータを消すと無くなるので, ときどき書き出しておくと安全です。
            </p>
            <div className="backup-actions">
              <button type="button" className="link-btn" onClick={handleExport}>
                ファイルに書き出す
              </button>
              <button
                type="button"
                className="link-btn"
                onClick={() => filePicker.current?.click()}
              >
                ファイルから読み込む
              </button>
            </div>
            <input
              ref={filePicker}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file !== undefined) void handleImport(file);
                e.target.value = '';
              }}
            />
            {notice !== '' && (
              <p className="note" role="status">{notice}</p>
            )}
          </div>
        </section>
      )}

      <section className="summary" aria-labelledby="summary-heading">
        <h2 id="summary-heading" className="summary-label">
          次回支給予定（{slash(period.payday)}・{countdown}）
        </h2>
        <p className="amount" aria-live="polite">{yen(nextTotal)}</p>
        <p className="period">
          対象 {slash(period.periodStart)} – {slash(period.periodEnd)}
          {settings.closingDay === null ? '（締め日なし）' : ''}
        </p>
        <dl className="stats">
          <div>
            <dt>支給済みの累計</dt>
            <dd>{yen(paidTotal)}</dd>
          </div>
          {laterTotal > 0 && (
            <div>
              <dt>それ以降の見込み</dt>
              <dd>{yen(laterTotal)}</dd>
            </div>
          )}
        </dl>
      </section>

      <form onSubmit={handleAdd} aria-labelledby="form-heading">
        <h2 id="form-heading" className="sr-only">勤務を記録する</h2>
        <div className="row">
          <label className="date-field">
            日付
            <input
              type="date"
              value={workDate}
              onChange={(e) => setWorkDate(e.target.value)}
              required
            />
          </label>
          <label>
            時間（h）
            <input
              type="number"
              step="0.25"
              min="0.25"
              max="24"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              required
            />
          </label>
          <label>
            時給（円）
            <input
              type="number"
              step="1"
              min="1"
              value={wage}
              onChange={(e) => setWage(e.target.value)}
              required
            />
          </label>
        </div>
        {formPayday !== null && (
          <p className="note form-note">
            この分は {slash(formPayday)} に支給される分です。
          </p>
        )}
        <button type="submit" className="primary-btn">記録を追加</button>
        {error !== '' && (
          <p className="error" role="alert">{error}</p>
        )}
      </form>

      <InstallPrompt hasRecords={records.length > 0} />

      <section className="chart-section" aria-labelledby="chart-heading">
        <div className="section-head">
          <h2 id="chart-heading">稼いだ額</h2>
          <div className="toggle" role="group" aria-label="グラフの単位">
            <button
              type="button"
              aria-pressed={span === 'month'}
              onClick={() => setSpan('month')}
            >
              月ごと
            </button>
            <button
              type="button"
              aria-pressed={span === 'week'}
              onClick={() => setSpan('week')}
            >
              週ごと
            </button>
          </div>
        </div>
        <Chart buckets={buckets} unitName={span === 'month' ? '月' : '週'} />
      </section>

      <section className="history" aria-labelledby="history-heading">
        <h2 id="history-heading">履歴（{records.length}件）</h2>

        {groups.length === 0 ? (
          <p className="empty">記録はまだありません。上のフォームから追加できます。</p>
        ) : (
          groups.map((group) => {
            const isPaid = group.payday < todayStr;
            return (
              <article className="group" key={group.payday}>
                <header className="group-head">
                  <h3>
                    {slash(group.payday)} 支給
                    <span className={isPaid ? 'badge paid' : 'badge due'}>
                      {isPaid ? '支給済み' : group.payday === todayStr ? '本日' : '予定'}
                    </span>
                  </h3>
                  <p className="group-sum">{yen(group.total)}</p>
                  <p className="group-period">
                    対象 {slash(group.periodStart)} – {slash(group.periodEnd)}・{group.records.length}件
                  </p>
                </header>

                <table>
                  <caption className="sr-only">
                    {slash(group.payday)}に支給される勤務の一覧
                  </caption>
                  <tbody>
                    {group.records.map((r) => (
                      <tr key={r.id}>
                        <th scope="row">{slash(r.date)}</th>
                        <td className="detail">{r.hours}h × {r.wage.toLocaleString('ja-JP')}円</td>
                        <td className="num">{yen(r.dailyPay)}</td>
                        <td className="action">
                          <button
                            type="button"
                            className="edit-btn"
                            onClick={() => setEditing(r)}
                            aria-label={`${slash(r.date)} ${r.hours}時間の記録を直す`}
                          >
                            直す
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </article>
            );
          })
        )}
      </section>

      <footer>記録はこの端末のブラウザの中だけに残ります。</footer>

      <About open={isAboutOpen} onClose={() => setIsAboutOpen(false)} />
      {editing !== null && (
        <EditDialog
          key={editing.id}
          record={editing}
          settings={settings}
          onSave={handleSaveEdit}
          onDelete={handleDelete}
          onClose={() => setEditing(null)}
        />
      )}

      {undoItem !== null && (
        <div className="undo" role="status">
          <span>
            {slash(undoItem.date)}の{yen(undoItem.dailyPay)}を削除しました
          </span>
          <button type="button" ref={undoButton} onClick={handleUndo}>
            元に戻す
          </button>
        </div>
      )}
    </main>
  );
}
