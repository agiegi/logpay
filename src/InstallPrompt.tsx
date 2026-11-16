import { useEffect, useMemo, useState } from 'react';
import { detectEnv, isDismissed, isStandalone, markDismissed } from './lib/install';

// Chrome 系がインストールできるときに投げてくるイベント
type InstallEvent = Event & { prompt: () => Promise<void> };

type Props = {
  hasRecords: boolean;
};

export default function InstallPrompt({ hasRecords }: Props) {
  const env = useMemo(() => detectEnv(), []);
  const [hidden, setHidden] = useState(() => isStandalone() || isDismissed());
  const [deferred, setDeferred] = useState<InstallEvent | null>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      // 既定のミニバーを止めて, 自分のボタンから出す
      e.preventDefault();
      setDeferred(e as InstallEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (hidden || !hasRecords) return null;
  if (deferred === null && env === 'none') return null;

  const handleInstall = () => {
    if (deferred === null) return;
    void deferred.prompt();
    setHidden(true);
  };

  const handleClose = () => {
    markDismissed();
    setHidden(true);
  };

  return (
    <section className="install" aria-label="ホーム画面への追加">
      <div className="install-body">
        {deferred !== null ? (
          <>
            <p>ホーム画面に追加すると, アプリとして開けてオフラインでも使えます。</p>
            <button type="button" className="primary-btn" onClick={handleInstall}>
              ホーム画面に追加
            </button>
          </>
        ) : env === 'ios-safari' ? (
          <>
            <p>しばらく開かないと, iPhone が記録を消すことがあります。ホーム画面に追加しておくと消えません。</p>
            <p className="install-how">下の共有ボタン → 「ホーム画面に追加」</p>
          </>
        ) : (
          <p>このブラウザではホーム画面に追加できません。Safari で開くと追加できて, 記録が消えにくくなります。</p>
        )}
      </div>
      <button type="button" className="install-close" onClick={handleClose} aria-label="閉じる">
        ×
      </button>
    </section>
  );
}
