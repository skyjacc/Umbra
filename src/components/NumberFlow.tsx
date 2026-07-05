// Odometer-style rolling number (the github-stars-counter technique) as a React
// component. Integer dB readout — no decimal point. Pure CSS transitions, CSP-safe.
const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

function Reel({ digit, collapsed = false }: { digit: number; collapsed?: boolean }) {
  return (
    <span
      className="inline-block h-[1em] overflow-hidden transition-[width] duration-300 ease-out"
      style={{ width: collapsed ? 0 : '1ch' }}
    >
      <span
        className="block transition-transform duration-500 [transition-timing-function:cubic-bezier(.22,1,.36,1)]"
        style={{ transform: `translateY(-${digit}em)` }}
      >
        {DIGITS.map((d) => (
          <span key={d} className="block h-[1em] text-center leading-none">
            {d}
          </span>
        ))}
      </span>
    </span>
  );
}

export function NumberFlow({
  value,
  unit = 'dB',
  className = ''
}: {
  value: number;
  unit?: string;
  className?: string;
}) {
  const a = Math.round(Math.abs(value));
  const tens = Math.floor(a / 10) % 10;
  const ones = a % 10;
  const sign = value >= 0.5 ? '+' : value <= -0.5 ? '-' : '';
  const showTens = a >= 10;
  return (
    <div className={'flex items-start font-mono text-5xl font-semibold leading-none ' + className}>
      <span className="w-[.6ch] text-center text-accent">{sign}</span>
      <Reel digit={tens} collapsed={!showTens} />
      <Reel digit={ones} />
      {unit && <span className="ml-1.5 mb-1.5 self-end text-base text-muted-foreground">{unit}</span>}
    </div>
  );
}
