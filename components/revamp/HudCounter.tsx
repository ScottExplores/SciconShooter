import React from 'react';

interface Props {
  value: number;
  children: React.ReactNode;
  compactAbove?: number;
  prefix?: string;
}

/** REVAMP(P): A value change owns one short CSS tick, with no animation clock or extra React updates. */
export default function HudCounter({ value, children, compactAbove = Infinity, prefix = '' }: Props) {
  const divisor = value >= 1_000_000_000 ? 1_000_000_000 : value >= 1_000_000 ? 1_000_000 : 1_000;
  const suffix = divisor === 1_000_000_000 ? 'B' : divisor === 1_000_000 ? 'M' : 'K';
  const compact = value >= compactAbove;
  const amount = Math.floor(value / divisor * 10) / 10;
  return <span key={value} className="revamp-hud-counter" title={compact ? String(value) : undefined}>
    {compact ? `${prefix}${amount >= 100 ? Math.floor(amount) : amount}${suffix}` : children}
  </span>;
}
