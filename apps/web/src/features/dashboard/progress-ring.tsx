export function ProgressRing({ value }: { value: number }) {
  const circumference = 2 * Math.PI * 20;
  return <div className="ring" aria-label={`${value}% complete`}>
    <svg viewBox="0 0 48 48"><circle className="ring-track" cx="24" cy="24" r="20"/><circle className="ring-value" cx="24" cy="24" r="20" style={{ strokeDasharray: circumference, strokeDashoffset: circumference * (1 - value / 100) }}/></svg>
    <strong>{value}%</strong>
  </div>;
}
