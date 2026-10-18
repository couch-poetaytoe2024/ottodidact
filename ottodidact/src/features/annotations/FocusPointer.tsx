import type { FocusAnnotation } from '@shared/types';

export function FocusPointer({ annotation }: { annotation: FocusAnnotation }) {
  const { target } = annotation;
  return (
    <rect
      className="annotation-focus"
      x={target.x}
      y={target.y}
      width={target.width}
      height={target.height}
      fill="rgba(99, 102, 241, 0.15)"
      stroke="var(--accent)"
      strokeWidth={2}
      strokeDasharray="6 4"
    />
  );
}
