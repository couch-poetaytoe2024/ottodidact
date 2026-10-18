import type { ArrowAnnotation } from '@shared/types';

export function Arrow({ annotation }: { annotation: ArrowAnnotation }) {
  const { from, to } = annotation;
  return (
    <g className="annotation-arrow">
      <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="currentColor" strokeWidth={3} />
      <circle cx={to.x} cy={to.y} r={5} fill="currentColor" />
    </g>
  );
}
