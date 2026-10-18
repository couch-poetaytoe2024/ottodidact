import type { CircleAnnotation } from '@shared/types';

export function Circle({ annotation }: { annotation: CircleAnnotation }) {
  const { center, radius } = annotation;
  return (
    <circle
      className="annotation-circle"
      cx={center.x}
      cy={center.y}
      r={radius}
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
    />
  );
}
