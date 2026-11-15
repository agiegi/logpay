// 記録をファイルに書き出す / 読み込む。サーバーは使わない

import { formatDate, today } from './period';
import { parseStore, type Store } from './storage';

export function exportStore(store: Store): void {
  const blob = new Blob([JSON.stringify(store, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `logpay-${formatDate(today())}.json`;
  a.click();
  // すぐ revoke するとダウンロードが始まらない端末がある
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function importStore(file: File): Promise<Store> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('このファイルは読み込めませんでした。');
  }

  // 中身が違うファイルを黙って受け取らない
  const shape = parsed as Record<string, unknown> | null;
  if (typeof shape !== 'object' || shape === null || !Array.isArray(shape.records)) {
    throw new Error('LogPay の書き出したファイルではないようです。');
  }

  const store = parseStore(parsed);
  if (store === null) throw new Error('LogPay の書き出したファイルではないようです。');
  return store;
}
