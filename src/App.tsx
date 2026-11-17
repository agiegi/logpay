import React, { useState, useEffect, useMemo, useRef } from 'react';
import './App.css';
import About from './About';
import Chart from './Chart';
import EditDialog from './EditDialog';
import InstallPrompt from './InstallPrompt';
import WorkplacePicker from './WorkplacePicker';
import WorkplaceSettings from './WorkplaceSettings';
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
  clampWage,
  displayName,
  loadStore,
  newId,
  saveStore,
  sortRecords,
  type ShiftRecord,
  type Workplace,
} from './lib/storage';

type Group = {
  key: string;
  workplaceId: string;
  payday: string;
  periodStart: string;
  periodEnd: string;
  total: number;
  records: ShiftRecord[];
};

type Upcoming = {
  id: string;
  name: string;
  payday: string;
  periodStart: string;
  periodEnd: string;
  closingDay: number | null;
  total: number;
  daysLeft: number;
};

const initial = loadStore();
const UNDO_MS = 5000;

const yen = (value: number) => `¥${value.toLocaleString('ja-JP')}`;
const slash = (date: string) => date.replace(/-/g, '/');
const shortDate = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
const countdownOf = (days: number) =>
  days === 0 ? '今日' : days === 1 ? '明日' : `あと${days}日`;

export default function App() {
  const [workplaces, setWorkplaces] = useState<Workplace[]>(initial.workplaces);
  const [records, setRecords] = useState<ShiftRecord[]>(initial.records);
  const [pickedRaw, setPicked] = useState(initial.lastWorkplaceId);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [editing, setEditing] = useState<ShiftRecord | null>(null);
  const [span, setSpan] = useState<'month' | 'week'>('month');

  const [workDate, setWorkDate] = useState(() => formatDate(new Date()));
  const [hours, setHours] = useState('4');
  const [wage, setWage] = useState(String(initial.workplaces[0].defaultWage));
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [undoItem, setUndoItem] = useState<ShiftRecord | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoButton = useRef<HTMLButtonElement | null>(null);
  const filePicker = useRef<HTMLInputElement | null>(null);
  const persistAsked = useRef(false);

  // 消された勤務先を指したままにならないようにする
  const picked = workplaces.some((w) => w.id === pickedRaw) ? pickedRaw : workplaces[0].id;
  const many = workplaces.length > 1;

  useEffect(() => {
    saveStore({ schemaVersion: 3, workplaces, records, lastWorkplaceId: picked });
  }, [workplaces, records, picked]);

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
  const wpById = useMemo(() => new Map(workplaces.map((w) => [w.id, w])), [workplaces]);

  const nameOf = (id: string) => {
    const i = workplaces.findIndex((w) => w.id === id);
    return i < 0 ? '' : displayName(workplaces[i], i);
  };

  // 勤務先と支給日の組でまとめる。同じ日に2つの支給日が重なることがある
  const groups = useMemo<Group[]>(() => {
    const byKey = new Map<string, Group>();

    for (const record of records) {
      const wp = wpById.get(record.workplaceId) ?? workplaces[0];
      const payday = paydayFor(record.date, wp.payday, wp.closingDay);
      const key = `${wp.id}:${payday}`;
      const found = byKey.get(key);

      if (found === undefined) {
        const p = periodOfPayday(payday, wp.payday, wp.closingDay);
        byKey.set(key, {
          key,
          workplaceId: wp.id,
          payday,
          periodStart: p.periodStart,
          periodEnd: p.periodEnd,
          total: record.dailyPay,
          records: [record],
        });
      } else {
        found.total += record.dailyPay;
        found.records.push(record);
      }
    }

    return [...byKey.values()].sort(
      (a, b) => b.payday.localeCompare(a.payday) || a.workplaceId.localeCompare(b.workplaceId)
    );
  }, [records, workplaces, wpById]);

  // 勤務先ごとの次回支給日
  const upcoming = useMemo<Upcoming[]>(() => {
    const base = today();
    return workplaces
      .map((w, i) => {
        const p = currentPeriod(base, w.payday, w.closingDay);
        const group = groups.find((g) => g.workplaceId === w.id && g.payday === p.payday);
        return {
          id: w.id,
          name: displayName(w, i),
          payday: p.payday,
          periodStart: p.periodStart,
          periodEnd: p.periodEnd,
          closingDay: w.closingDay,
          total: group?.total ?? 0,
          daysLeft: daysBetween(base, parseDate(p.payday)),
        };
      })
      .sort((a, b) => a.payday.localeCompare(b.payday));
  }, [workplaces, groups]);

  const comingTotal = upcoming.reduce((sum, u) => sum + u.total, 0);
  const paidTotal = groups
    .filter((g) => g.payday < todayStr)
    .reduce((sum, g) => sum + g.total, 0);

  // 各勤務先の次回支給日より後の分
  const laterTotal = useMemo(() => {
    const next = new Map(upcoming.map((u) => [u.id, u.payday]));
    return groups
      .filter((g) => g.payday > (next.get(g.workplaceId) ?? todayStr))
      .reduce((sum, g) => sum + g.total, 0);
  }, [groups, upcoming, todayStr]);

  const buckets = useMemo(
    () =>
      span === 'month' ? monthlyTotals(records, today()) : weeklyTotals(records, today()),
    [records, span]
  );

  const pickedPlace = wpById.get(picked) ?? workplaces[0];
  const formPayday =
    workDate === ''
      ? null
      : paydayFor(workDate, pickedPlace.payday, pickedPlace.closingDay);

  const handlePick = (id: string) => {
    setPicked(id);
    const wp = wpById.get(id);
    if (wp !== undefined) setWage(String(wp.defaultWage));
  };

  const handleWorkplacesChange = (next: Workplace[]) => {
    // 選んでいる勤務先の基本時給が変わったら, 入力欄も合わせる
    const before = workplaces.find((w) => w.id === picked);
    const after = next.find((w) => w.id === picked);
    if (before !== undefined && after !== undefined && before.defaultWage !== after.defaultWage) {
      setWage(String(after.defaultWage));
    }
    setWorkplaces(next);
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
      workplaceId: picked,
      date: workDate,
      hours: h,
      wage: w,
      dailyPay: Math.floor(h * w),
      createdAt: new Date().toISOString(),
    };

    setError('');
    setRecords((prev) => sortRecords([record, ...prev]));
    setWage(String(pickedPlace.defaultWage));
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
    exportStore({ schemaVersion: 3, workplaces, records, lastWorkplaceId: picked });
    setNotice(`${records.length}件を書き出しました。`);
  };

  const handleImport = async (file: File) => {
    try {
      const store = await importStore(file);
      const ok = window.confirm(
        `${store.records.length}件の記録を読み込みます。今の${records.length}件は置き換わります。`
      );
      if (!ok) return;
      setWorkplaces(store.workplaces);
      setRecords(store.records);
      setPicked(store.lastWorkplaceId);
      setWage(String(store.workplaces[0].defaultWage));
      setNotice(`${store.records.length}件を読み込みました。`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : '読み込めませんでした。');
    }
  };

  const single = upcoming[0];
  const rows = upcoming.filter((u) => u.total > 0);

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

          <WorkplaceSettings
            workplaces={workplaces}
            records={records}
            onChange={handleWorkplacesChange}
          />

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
            {notice !== '' && <p className="note" role="status">{notice}</p>}
          </div>
        </section>
      )}

      <section className="summary" aria-labelledby="summary-heading">
        {many ? (
          <>
            <h2 id="summary-heading" className="summary-label">これから入る分</h2>
            <p className="amount" aria-live="polite">{yen(comingTotal)}</p>
            {rows.length === 0 ? (
              <p className="period">まだ記録がありません。</p>
            ) : (
              <ul className="upcoming">
                {rows.map((u) => (
                  <li key={u.id}>
                    <span className="up-date">{shortDate(u.payday)}</span>
                    <span className="up-name">{u.name}</span>
                    <span className="up-amount">{yen(u.total)}</span>
                    <span className="up-days">{countdownOf(u.daysLeft)}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <>
            <h2 id="summary-heading" className="summary-label">
              次回支給予定（{slash(single.payday)}・{countdownOf(single.daysLeft)}）
            </h2>
            <p className="amount" aria-live="polite">{yen(comingTotal)}</p>
            <p className="period">
              対象 {slash(single.periodStart)} – {slash(single.periodEnd)}
              {single.closingDay === null ? '（締め日なし）' : ''}
            </p>
          </>
        )}

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

        <WorkplacePicker workplaces={workplaces} value={picked} onChange={handlePick} />

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
          <p className="note form-note">この分は {slash(formPayday)} に支給される分です。</p>
        )}
        <button type="submit" className="primary-btn">記録を追加</button>
        {error !== '' && <p className="error" role="alert">{error}</p>}
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
              <article className="group" key={group.key}>
                <header className="group-head">
                  <h3>
                    {many && <span className="group-name">{nameOf(group.workplaceId)}</span>}
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
                        <td className="detail">
                          {r.hours}h × {r.wage.toLocaleString('ja-JP')}円
                        </td>
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
          workplaces={workplaces}
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
