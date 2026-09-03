// src/lib/curves.ts — smooth interpolation for the emotional map
// Catmull–Rom → cubic Bézier. Points are ordered by sourcePosition.

export interface CurvePoint {
  x: number;
  y: number;
  trackId: string;
  sourcePosition: number;
  value: number | null;
}

/** Built a smooth SVG path through points (Catmull-Rom to Bézier). */
export function catmullRomPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

/**
 * Monotone cubic (Fritsch–Carlson) interpolation — a no-overshoot alternative.
 * Returns a smoothed SVG path that preserves local monotonicity.
 */
export function monotoneCubicPath(points: { x: number; y: number }[]): string {
  if (points.length < 3) return catmullRomPath(points);
  const n = points.length;
  const dx: number[] = [];
  const m: number[] = [];
  const dys: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const h = points[i + 1].x - points[i].x;
    const s = h !== 0 ? (points[i + 1].y - points[i].y) / h : 0;
    dx.push(h);
    dys.push(s);
  }
  m.push(dys[0]);
  for (let i = 1; i < n - 1; i++) {
    if (dys[i - 1] * dys[i] <= 0) m.push(0);
    else m.push((dys[i - 1] + dys[i]) / 2);
  }
  m.push(dys[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (dys[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
    } else {
      const a = m[i] / dys[i];
      const b = m[i + 1] / dys[i];
      const s = a * a + b * b;
      if (s > 9) {
        const t = 3 / Math.sqrt(s);
        m[i] = t * a * dys[i];
        m[i + 1] = t * b * dys[i];
      }
    }
  }
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i];
    const c1x = points[i].x + h / 3;
    const c1y = points[i].y + (m[i] * h) / 3;
    const c2x = points[i + 1].x - h / 3;
    const c2y = points[i + 1].y - (m[i + 1] * h) / 3;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${points[i + 1].x} ${points[i + 1].y}`;
  }
  return d;
}

/** Maps a 0..100 score to a Y coordinate (0 = top/bright). */
export function scoreToY(score: number | null, top: number, height: number, fallbackY?: number): number {
  if (score === null || score === undefined || isNaN(score)) {
    return fallbackY ?? top + height / 2;
  }
  const clamped = Math.max(0, Math.min(100, score));
  return top + height - (clamped / 100) * height;
}

export function moodLabel(score: number | null): string {
  if (score === null || score === undefined) return "Not rated";
  if (score < 20) return "Dark / introspective";
  if (score < 40) return "Melancholic";
  if (score < 60) return "Balanced";
  if (score < 80) return "Bright";
  return "Euphoric";
}

export function softnessLabel(score: number | null): string {
  if (score === null || score === undefined) return "Not rated";
  if (score < 20) return "Very soft";
  if (score < 40) return "Soft";
  if (score < 60) return "In the middle";
  if (score < 80) return "Intense";
  return "Harsh";
}
