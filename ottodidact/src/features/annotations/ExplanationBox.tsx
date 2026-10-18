import type { ExplanationAnnotation } from '@shared/types';

interface ExplanationBoxProps {
  annotation: ExplanationAnnotation;
  onClick?: () => void;
}

export function ExplanationBox({ annotation, onClick }: ExplanationBoxProps) {
  const { anchor, text } = annotation;
  const width = 220;
  const height = 64;

  return (
    <g className="annotation-explanation" onClick={onClick} style={{ cursor: onClick ? 'pointer' : undefined }}>
      <rect
        x={anchor.x}
        y={anchor.y}
        width={width}
        height={height}
        rx={8}
        fill="var(--surface)"
        stroke="currentColor"
      />
      <text x={anchor.x + 10} y={anchor.y + 24} fontSize={13}>
        {text.slice(0, 80)}
      </text>
    </g>
  );
}
