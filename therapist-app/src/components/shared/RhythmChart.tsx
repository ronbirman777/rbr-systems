import { useId } from 'react';
import { cn } from '@/utils/cn';

export interface RhythmPoint {
  date: string;
  /** Completion for that day, 0–100. `null` where nothing was scheduled. */
  value: number | null;
  /** Days inside the current recent window. */
  recent: boolean;
}

/**
 * The baseline visualisation.
 *
 * Deliberately not a chart with axes and gridlines — it is a quiet line that
 * shows the shape of a rhythm and where it changed. It carries no numbers of
 * its own, because the two figures that matter are stated above it in words.
 */
export function RhythmChart({
  points,
  baselineDays = 21,
  className,
  height = 96,
}: {
  points: RhythmPoint[];
  baselineDays?: number;
  className?: string;
  height?: number;
}) {
  const gradientId = useId();
  const width = 600;
  const pad = 10;

  const usable = points.filter((p) => p.value !== null) as { date: string; value: number; recent: boolean }[];
  if (usable.length < 2) return null;

  const x = (index: number) => pad + (index / (points.length - 1)) * (width - pad * 2);
  const y = (value: number) => height - pad - (value / 100) * (height - pad * 2);

  // Carry the last known value across days with nothing scheduled, so the line
  // stays continuous rather than implying a drop that did not happen.
  let carried = usable[0].value;
  const filled = points.map((point) => {
    if (point.value !== null) carried = point.value;
    return carried;
  });

  // A baseline is a tendency, not a daily reading. Light smoothing keeps a
  // single quiet day from looking like a change of direction, while leaving a
  // sustained shift plainly visible.
  const smoothed = filled.map((value, i) => {
    const prev = filled[i - 1] ?? value;
    const next = filled[i + 1] ?? value;
    return 0.25 * prev + 0.5 * value + 0.25 * next;
  });

  const coords = points.map((point, index) => ({
    x: x(index),
    y: y(smoothed[index]),
    recent: point.recent,
    date: point.date,
  }));

  const firstRecent = coords.findIndex((c) => c.recent);
  const splitAt = firstRecent > 0 ? firstRecent - 1 : 0;

  const line = (from: number, to: number) =>
    coords
      .slice(from, to + 1)
      .map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
      .join(' ');

  const baselinePath = line(0, splitAt);
  const recentPath = line(splitAt, coords.length - 1);
  const areaPath = `${baselinePath} L${coords[splitAt].x.toFixed(1)},${height - pad} L${coords[0].x.toFixed(1)},${
    height - pad
  } Z`;

  return (
    <figure className={cn('m-0', className)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Daily practice completion over the last ${baselineDays} days, ending with the most recent days below the usual level.`}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#92A99C" stopOpacity="0.14" />
            <stop offset="100%" stopColor="#92A99C" stopOpacity="0" />
          </linearGradient>
        </defs>

        <path d={areaPath} fill={`url(#${gradientId})`} />
        <path
          d={baselinePath}
          fill="none"
          stroke="#B6C6BC"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={recentPath}
          fill="none"
          stroke="#E6A15C"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {coords
          .filter((c) => c.recent)
          .map((c, i, all) => (
            <circle
              key={c.date}
              cx={c.x}
              cy={c.y}
              r={i === all.length - 1 ? 3.4 : 2.2}
              fill="#E6A15C"
            />
          ))}
      </svg>

      <figcaption className="mt-2.5 flex items-center justify-between text-2xs">
        <span className="text-ink-faint">{baselineDays} days ago</span>
        <span className="font-medium text-amber-deep">Recent</span>
      </figcaption>
    </figure>
  );
}
