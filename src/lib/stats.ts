/** Linear-interpolated percentile (p in 0..1) of a non-empty list. */
export const percentile = (a: number[], p: number) => {
  const s = [...a].sort((x, y) => x - y);
  const i = (s.length - 1) * p;
  const f = Math.floor(i);
  return s[f] + (s[Math.min(f + 1, s.length - 1)] - s[f]) * (i - f);
};

export const median = (a: number[]) => percentile(a, 0.5);
