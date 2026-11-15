export function sparklinePoints(values: readonly number[], width = 120, height = 32, padding = 2): string {
  if (values.length === 0) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = values.length > 1 ? (width - padding * 2) / (values.length - 1) : 0;
  return values
    .map((value, index) => {
      const x = padding + index * step;
      const y = height - padding - ((value - min) / range) * (height - padding * 2);
      return `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`;
    })
    .join(' ');
}
