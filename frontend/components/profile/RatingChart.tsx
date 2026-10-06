"use client";

import { useId } from "react";

/** A compact rating curve. One point per rated game, oldest first. */
export function RatingChart({
  points,
  className,
}: {
  points: Array<{ matchId: string; rating: number }>;
  className?: string;
}) {
  const gradientId = useId();
  if (points.length < 2) return null;

  const width = 600;
  const height = 120;
  const padding = 8;
  const ratings = points.map((point) => point.rating);
  const min = Math.min(...ratings);
  const max = Math.max(...ratings);
  const span = Math.max(max - min, 40);
  const mid = (min + max) / 2;
  const low = mid - span / 2;

  const x = (index: number) =>
    padding + (index / (points.length - 1)) * (width - padding * 2);
  const y = (rating: number) =>
    height - padding - ((rating - low) / span) * (height - padding * 2);

  const line = points.map((point, index) => `${x(index)},${y(point.rating)}`).join(" ");
  const area = `${padding},${height} ${line} ${width - padding},${height}`;
  const last = points[points.length - 1];
  const rising = last.rating >= points[0].rating;
  const stroke = rising ? "#ECE8DF" : "#FF4F1A";

  return (
    <figure className={className}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="h-28 w-full"
        role="img"
        aria-label={`Rating over the last ${points.length} rated games, from ${points[0].rating} to ${last.rating}.`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={area} fill={`url(#${gradientId})`} />
        <polyline
          points={line}
          fill="none"
          stroke={stroke}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        <circle cx={x(points.length - 1)} cy={y(last.rating)} r={3.5} fill={stroke} />
      </svg>
      <figcaption className="mt-1 flex justify-between font-mono text-[11px] text-muted-foreground">
        <span>{min}</span>
        <span>last {points.length} rated games</span>
        <span>{max}</span>
      </figcaption>
    </figure>
  );
}
