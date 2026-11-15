import { useState } from 'react';
import { axisLabel, niceCeiling, type Bucket } from './lib/stats';

type Props = {
  buckets: Bucket[];
  unitName: string;
};

const W = 440;
const H = 170;
const PAD_L = 46;
const PAD_R = 6;
const PAD_T = 18;
const PAD_B = 22;
const BAR_MAX = 24;
const GAP = 2;
const RADIUS = 4;

const yen = (value: number) => `¥${value.toLocaleString('ja-JP')}`;

// 上だけ角を丸め, 下は軸に接する
function barPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(RADIUS, w / 2, h);
  return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`;
}

export default function Chart({ buckets, unitName }: Props) {
  const [active, setActive] = useState<number | null>(null);

  if (buckets.length === 0) {
    return <p className="empty">記録が入るとここにグラフが出ます。</p>;
  }

  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const top = niceCeiling(Math.max(...buckets.map((b) => b.total)));
  const slot = plotW / buckets.length;
  const barW = Math.min(BAR_MAX, slot - GAP);
  const ticks = [0, top / 2, top];

  const peak = buckets.reduce((best, b, i) => (b.total > buckets[best].total ? i : best), 0);
  const shown = active ?? peak;
  const total = buckets.reduce((sum, b) => sum + b.total, 0);

  const xOf = (i: number) => PAD_L + slot * i + (slot - barW) / 2;
  const yOf = (v: number) => PAD_T + plotH - (v / top) * plotH;

  return (
    <div className="chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="chart-svg"
        role="img"
        aria-label={`${unitName}ごとに稼いだ額の棒グラフ。${buckets.length}${unitName}分, 合計 ${yen(total)}。値は下の表にもあります。`}
        onMouseLeave={() => setActive(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              className="chart-grid"
              x1={PAD_L}
              x2={W - PAD_R}
              y1={yOf(t)}
              y2={yOf(t)}
            />
            <text className="chart-tick" x={PAD_L - 6} y={yOf(t) + 3.5} textAnchor="end">
              {axisLabel(t, top)}
            </text>
          </g>
        ))}

        {buckets.map((b, i) => {
          const h = (b.total / top) * plotH;
          return (
            <g key={b.key}>
              {b.total > 0 && (
                <path className="chart-bar" d={barPath(xOf(i), yOf(b.total), barW, h)} />
              )}
              <text className="chart-label" x={xOf(i) + barW / 2} y={H - 7} textAnchor="middle">
                {b.label}
              </text>
              {/* 当たり判定は棒より広く取る */}
              <rect
                x={PAD_L + slot * i}
                y={PAD_T}
                width={slot}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setActive(i)}
              />
            </g>
          );
        })}

        {buckets[shown].total > 0 && (
          <text
            className="chart-value"
            x={Math.min(Math.max(xOf(shown) + barW / 2, PAD_L + 16), W - PAD_R - 16)}
            y={Math.max(yOf(buckets[shown].total) - 6, PAD_T - 4)}
            textAnchor="middle"
          >
            {yen(buckets[shown].total)}
          </text>
        )}
      </svg>

      <details className="chart-table">
        <summary>表で見る</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">{unitName}</th>
              <th scope="col" className="num">稼いだ額</th>
            </tr>
          </thead>
          <tbody>
            {buckets.map((b) => (
              <tr key={b.key}>
                <th scope="row">{b.key.replace(/-/g, '/')}</th>
                <td className="num">{yen(b.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
