export function subtractDays(iso, days) {
  const d = new Date(iso + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) throw new Error('invalid ISO date');
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0,10);
}
