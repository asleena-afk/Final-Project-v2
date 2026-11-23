export default function Logo({ size = 34 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#818cf8" /><stop offset="1" stopColor="#22d3ee" /></linearGradient></defs>
      <rect width="64" height="64" rx="16" fill="url(#lg)" />
      <path d="M18 33l9 9 19-21" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
