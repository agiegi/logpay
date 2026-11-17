import { useState } from 'react';
import {
  MAX_WORKPLACES,
  NAME_MAX,
  clampDay,
  newWorkplace,
  type ShiftRecord,
  type Workplace,
} from './lib/storage';

type Props = {
  workplaces: Workplace[];
  records: ShiftRecord[];
  onChange: (workplaces: Workplace[]) => void;
};

const isDayValid = (text: string) => {
  const n = Number(text);
  return text !== '' && Number.isInteger(n) && n >= 1 && n <= 31;
};

const isWageValid = (text: string) => {
  const n = Number(text);
  return text !== '' && Number.isInteger(n) && n >= 1;
};

export default function WorkplaceSettings({ workplaces, records, onChange }: Props) {
  // 入力途中の文字列。妥当な値になったときだけ本体に反映する
  const [draft, setDraft] = useState<Record<string, string>>({});

  const keyOf = (id: string, field: string) => `${id}:${field}`;
  const textOf = (id: string, field: string, committed: string) =>
    draft[keyOf(id, field)] ?? committed;

  const setText = (id: string, field: string, text: string) =>
    setDraft((d) => ({ ...d, [keyOf(id, field)]: text }));

  const clearText = (id: string, field: string) =>
    setDraft((d) => {
      const next = { ...d };
      delete next[keyOf(id, field)];
      return next;
    });

  const patch = (id: string, change: Partial<Workplace>) =>
    onChange(workplaces.map((w) => (w.id === id ? { ...w, ...change } : w)));

  const used = (id: string) => records.some((r) => r.workplaceId === id);
  const many = workplaces.length > 1;

  return (
    <div className="workplaces">
      <h3>勤務先</h3>

      {workplaces.map((w, i) => (
        <div className="workplace" key={w.id}>
          {many && (
            <div className="workplace-head">
              <span className="workplace-no">{i + 1}</span>
              {used(w.id) ? (
                <span className="note">記録があるので消せません</span>
              ) : (
                <button
                  type="button"
                  className="danger-btn"
                  onClick={() => onChange(workplaces.filter((x) => x.id !== w.id))}
                >
                  消す
                </button>
              )}
            </div>
          )}

          {many && (
            <label>
              名前
              <input
                type="text"
                maxLength={NAME_MAX}
                placeholder={`勤務先${i + 1}`}
                value={w.name}
                onChange={(e) => patch(w.id, { name: e.target.value.slice(0, NAME_MAX) })}
              />
            </label>
          )}

          <div className="row">
            <label>
              給料日（日）
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={31}
                value={textOf(w.id, 'payday', String(w.payday))}
                onChange={(e) => {
                  setText(w.id, 'payday', e.target.value);
                  if (isDayValid(e.target.value)) patch(w.id, { payday: Number(e.target.value) });
                }}
                onBlur={() => clearText(w.id, 'payday')}
              />
            </label>
            <label>
              基本時給（円）
              <input
                type="number"
                inputMode="numeric"
                min={1}
                step={10}
                value={textOf(w.id, 'wage', String(w.defaultWage))}
                onChange={(e) => {
                  setText(w.id, 'wage', e.target.value);
                  if (isWageValid(e.target.value)) {
                    patch(w.id, { defaultWage: Number(e.target.value) });
                  }
                }}
                onBlur={() => clearText(w.id, 'wage')}
              />
            </label>
          </div>

          <label className="check">
            <input
              type="checkbox"
              checked={w.closingDay !== null}
              onChange={(e) =>
                patch(w.id, {
                  closingDay: e.target.checked ? clampDay(w.closingDay, 31) : null,
                })
              }
            />
            締め日がある
          </label>

          {w.closingDay !== null && (
            <div className="row">
              <label>
                締め日（日）
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={31}
                  value={textOf(w.id, 'closing', String(w.closingDay))}
                  onChange={(e) => {
                    setText(w.id, 'closing', e.target.value);
                    if (isDayValid(e.target.value)) {
                      patch(w.id, { closingDay: Number(e.target.value) });
                    }
                  }}
                  onBlur={() => clearText(w.id, 'closing')}
                />
              </label>
              <p className="note">
                31 は末日として扱います。締め日を外すと, 前回の給料日の翌日から次の給料日までが対象になります。
              </p>
            </div>
          )}
        </div>
      ))}

      {workplaces.length < MAX_WORKPLACES && (
        <button
          type="button"
          className="link-btn"
          onClick={() => onChange([...workplaces, newWorkplace()])}
        >
          勤務先を追加
        </button>
      )}
    </div>
  );
}
