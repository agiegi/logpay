import { useEffect, useRef } from 'react';
// ライセンス文は本体と一緒に古くならないよう, パッケージのものをそのまま読む
import reactLicense from '../node_modules/react/LICENSE?raw';
import monUrl from './assets/oh-gy-mon.png';

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function About({ open, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement | null>(null);

  // showModal はフォーカスの閉じ込めと Esc を自分で持っている
  useEffect(() => {
    const el = dialog.current;
    if (el === null) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      className="about"
      ref={dialog}
      aria-labelledby="about-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) onClose();
      }}
    >
      <div className="about-top">
        <button type="button" className="about-close" onClick={onClose} aria-label="閉じる">
          ×
        </button>
      </div>

      <div className="about-head">
        <img className="about-mon" src={monUrl} alt="OH-GY" width={60} height={60} />
        <div>
          <h2 id="about-title">LogPay</h2>
          <p>バイトの勤務を記録して, 次の給料日にもらう額を出します。</p>
        </div>
      </div>

      <h3>記録は外に出ません</h3>
      <p>
        入れた記録はこの端末のブラウザの中だけに残ります。どのサーバーにも送られないかわりに,
        端末を変えると引き継がれません。
      </p>

      <h3>給料日と締め日</h3>
      <p>
        設定の給料日から, 次の支給日とその対象になる期間が決まります。
        締め日があるバイト先では設定で足すと, 支給日の直前の締め日で区切ります。
        締め日が無ければ, 前回の給料日の翌日から次の給料日までが対象です。
      </p>

      <h3>オフラインでも使えます</h3>
      <p>
        一度開いておけば, 通信が無くても記録できます。
        ホーム画面やデスクトップに追加すると, アプリとして開けます。
      </p>

      <h3>使っているもの</h3>
      <p>画面の組み立てに React を使っています。</p>
      <details className="license">
        <summary>React (MIT License)</summary>
        <pre>{reactLicense}</pre>
      </details>

      <p className="about-foot">LogPay {__APP_VERSION__} — OH-GY</p>
    </dialog>
  );
}
