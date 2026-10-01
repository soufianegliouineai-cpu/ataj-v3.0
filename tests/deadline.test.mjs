import test from 'node:test';
import assert from 'node:assert/strict';
import { isIsoDate, subtractDays, severityFor } from '../src/deadline.mjs';

test('passport protection subtracts 90 days', () => {
  assert.equal(subtractDays('2027-06-12', 90), '2027-03-14');
});

test('generic protection supports a 60-day lead time', () => {
  assert.equal(subtractDays('2027-08-20', 60), '2027-06-21');
});

test('deadline calculator handles year boundary', () => {
  assert.equal(subtractDays('2027-01-15', 90), '2026-10-17');
});

test('real calendar dates are validated', () => {
  assert.equal(isIsoDate('2027-02-28'), true);
  assert.equal(isIsoDate('2027-02-30'), false);
  assert.throws(() => subtractDays('2027-02-30', 90), /invalid ISO date/);
});

test('malformed dates are rejected', () => {
  assert.throws(() => subtractDays('not-a-date', 90), /invalid ISO date/);
});

test('severity boundaries are deterministic', () => {
  assert.equal(severityFor(-1), 'overdue');
  assert.equal(severityFor(0), 'critical');
  assert.equal(severityFor(7), 'critical');
  assert.equal(severityFor(8), 'urgent');
  assert.equal(severityFor(30), 'urgent');
  assert.equal(severityFor(31), 'important');
  assert.equal(severityFor(90), 'important');
  assert.equal(severityFor(91), 'normal');
});
