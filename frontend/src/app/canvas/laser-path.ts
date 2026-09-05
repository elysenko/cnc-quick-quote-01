import { Poly } from '../core/geometry';

export interface PathSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Cumulative length in mm at the END of this segment. */
  end: number;
}

export interface LaserPath {
  segments: PathSegment[];
  totalLength: number;
}

/** Concatenates polylines into one walkable path with cumulative lengths. */
export function buildLaserPath(polylines: Poly[]): LaserPath {
  const segments: PathSegment[] = [];
  let acc = 0;
  for (const poly of polylines) {
    for (let i = 1; i < poly.length; i++) {
      const [x1, y1] = poly[i - 1];
      const [x2, y2] = poly[i];
      const len = Math.hypot(x2 - x1, y2 - y1);
      if (len < 1e-6) continue;
      acc += len;
      segments.push({ x1, y1, x2, y2, end: acc });
    }
  }
  return { segments, totalLength: acc };
}

export interface HeadPosition {
  x: number;
  y: number;
  segmentIndex: number;
}

/** Position of the laser head after travelling `distance` mm along the path. */
export function headAt(path: LaserPath, distance: number): HeadPosition | null {
  if (!path.segments.length) return null;
  const d = Math.min(Math.max(distance, 0), path.totalLength);
  let lo = 0;
  let hi = path.segments.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (path.segments[mid].end < d) lo = mid + 1;
    else hi = mid;
  }
  const seg = path.segments[lo];
  const segLen = Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1);
  const start = seg.end - segLen;
  const f = segLen > 0 ? (d - start) / segLen : 0;
  return { x: seg.x1 + (seg.x2 - seg.x1) * f, y: seg.y1 + (seg.y2 - seg.y1) * f, segmentIndex: lo };
}
