export function isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y,m,d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y,m-1,d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m-1 && dt.getUTCDate() === d;
}

export function subtractDays(iso, days) {
  if (!isIsoDate(iso)) throw new Error('invalid ISO date');
  if (!Number.isInteger(days)) throw new Error('days must be an integer');
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0,10);
}
