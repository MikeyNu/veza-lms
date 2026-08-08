export function ProgressRing({ value, label = "Course progress" }: { value: number; label?: string }) {
  const bounded = Math.min(100, Math.max(0, value));
  const circumference = 2 * Math.PI * 20;

  return (
    <div
      className="ring"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={bounded}
    >
      <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <circle className="ring-track" cx="24" cy="24" r="20" />
        <circle
          className="ring-value"
          cx="24"
          cy="24"
          r="20"
          style={{
            strokeDasharray: circumference,
            strokeDashoffset: circumference * (1 - bounded / 100),
          }}
        />
      </svg>
      <strong>{bounded}%</strong>
    </div>
  );
}
