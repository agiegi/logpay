import { useEffect, useRef, useState } from 'react';
import { paydayFor } from './lib/period';
import { clampWage, type Settings, type ShiftRecord } from './lib/storage';

type Props = {
  record: ShiftRecord;
  settings: Settings;
  onSave: (record: ShiftRecord) => void;
  onDelete: (record: ShiftRecord) => void;
  onClose: () => void;
};

// 呼ぶ側が record ごとに key を変えるので, 初期値はここで入れるだけでよい
export default function EditDialog({ record, settings, onSave, onDelete, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement | null>(null);
  const [date, setDate] = useState(record.date);
  const [hours, setHours] = useState(String(record.hours));
  const [wage, setWage] = useState(String(record.wage));
  const [error, setError] = useState('');

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const handleSave = () => {
    const h = Number(hours);
    const w = clampWage(wage, 0);
    if (date === '' || !Number.isFinite(h) || h <= 0 || w <= 0) {
      setError('日付, 時間, 時給をもう一度確かめてください。');
      return;
    }
    onSave({ ...record, date, hours: h, wage: w, dailyPay: Math.floor(h * w) });
  };

  const pay = date === '' ? null : paydayFor(date, settings.payday, settings.closingDay);

  return (
    <dialog className="edit" ref={dialog} aria-labelledby="edit-title" onClose={onClose}>
      <h2 id="edit-title">記録を直す</h2>

      <label>
        日付
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>

      <div className="row">
        <label>
          時間（h）
          <input
            type="number"
            step="0.25"
            min="0.25"
            max="24"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
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
          />
        </label>
      </div>

      {pay !== null && <p className="note">この分は {pay.replace(/-/g, '/')} に支給されます。</p>}
      {error !== '' && <p className="error" role="alert">{error}</p>}

      <div className="edit-actions">
        <button type="button" className="primary-btn" onClick={handleSave}>
          保存する
        </button>
        <button type="button" className="link-btn" onClick={onClose}>
          やめる
        </button>
        <button type="button" className="danger-btn" onClick={() => onDelete(record)}>
          削除
        </button>
      </div>
    </dialog>
  );
}
