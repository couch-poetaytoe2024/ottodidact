interface CaptureIndicatorProps {
  onCapture: () => void | Promise<void>;
}

export function CaptureIndicator({ onCapture }: CaptureIndicatorProps) {
  return (
    <button type="button" className="capture-indicator" onClick={() => void onCapture()}>
      Capture
    </button>
  );
}
