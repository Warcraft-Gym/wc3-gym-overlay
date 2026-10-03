/** The MMR line in the profile header: an SVG polyline scaled to its own
 *  min/max, the peak marked. Purely decorative for screen readers; the
 *  numbers are in the label. */

const WIDTH = 160;
const HEIGHT = 40;
const PAD = 3;

export function sparklinePoints(values: number[], width = WIDTH, height = HEIGHT): string {
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = (width - PAD * 2) / (values.length - 1);
  return values
    .map((v, i) => `${(PAD + i * step).toFixed(1)},${(PAD + (1 - (v - min) / span) * (height - PAD * 2)).toFixed(1)}`)
    .join(" ");
}

export function Sparkline({ values, label }: { values: number[]; label: string }) {
  const points = sparklinePoints(values);
  if (!points) return null;
  const last = points.split(" ").at(-1)?.split(",") ?? ["0", "0"];
  return (
    <svg role="img" aria-label={label} width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="overflow-visible">
      <polyline points={points} fill="none" stroke="var(--color-gold, #c9a227)" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r={2.75} fill="var(--color-gold, #c9a227)" />
    </svg>
  );
}
