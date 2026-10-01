import test from 'node:test';
import assert from 'node:assert/strict';
import { subtractDays } from '../src/deadline.mjs';

test('passport renewal window subtracts 90 days', () => {
  assert.equal(subtractDays('2027-06-12', 90), '2027-03-14');
});

test('deadline calculator handles year boundary', () => {
  assert.equal(subtractDays('2027-01-15', 90), '2026-10-17');
});

test('invalid date is rejected', () => {
  assert.throws(() => subtractDays('not-a-date',90), /invalid ISO date/);
});
