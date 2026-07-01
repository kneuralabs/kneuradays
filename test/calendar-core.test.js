'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../calendar-core.js');

// Status → hours map, mirrored from index.html's STATUS table.
const HOURS = { FW: 8, FL: 0, HL: 4, SL: 0 };
const holidaySet = (year) => new Set(C.computeHolidays(year).map((h) => h.dateStr));

test('Juneteenth 2026 is recognised on Friday June 19', () => {
  assert.equal(C.fmtKey(new Date(2026, 5, 19)), '2026-06-19');
  assert.equal(new Date(2026, 5, 19).getDay(), 5); // Friday
  assert.ok(holidaySet(2026).has('2026-06-19'));
});

// The regression this guards: a holiday day is locked at 0h and must NOT be
// counted toward the weekly target. A perfectly-logged holiday week is "on track".
test('a week with one holiday targets 32h, not 40h (Juneteenth week)', () => {
  const holidays = holidaySet(2026);
  const monday = new Date(2026, 5, 15); // Mon Jun 15; Fri Jun 19 is Juneteenth
  const marks = new Map([
    ['2026-06-15', 'FW'],
    ['2026-06-16', 'FW'],
    ['2026-06-17', 'FW'],
    ['2026-06-18', 'FW'],
    // Friday is a holiday — locked, no mark possible
  ]);
  const wh = C.getWeekHours(monday, holidays, marks, HOURS);
  assert.equal(wh.workdays, 4);
  assert.equal(wh.expected, 32);
  assert.equal(wh.total, 32);
  assert.ok(wh.total >= wh.expected - 0.01, 'fully-logged holiday week is on track');
});

test('a week with two holidays targets 24h (Thanksgiving week)', () => {
  const holidays = holidaySet(2026);
  // Thanksgiving 2026 = Thu Nov 26, "Day after" = Fri Nov 27.
  const monday = C.getMonday(new Date(2026, 10, 26));
  assert.equal(C.fmtKey(monday), '2026-11-23');
  assert.ok(holidays.has('2026-11-26'));
  assert.ok(holidays.has('2026-11-27'));
  const marks = new Map([
    ['2026-11-23', 'FW'],
    ['2026-11-24', 'FW'],
    ['2026-11-25', 'FW'],
  ]);
  const wh = C.getWeekHours(monday, holidays, marks, HOURS);
  assert.equal(wh.workdays, 3);
  assert.equal(wh.expected, 24);
  assert.equal(wh.total, 24);
});

test('an ordinary holiday-free week targets the full 40h', () => {
  const holidays = holidaySet(2026);
  const monday = C.getMonday(new Date(2026, 8, 14)); // Mon Sep 14 2026, no holiday
  const wh = C.getWeekHours(monday, holidays, new Map(), HOURS);
  assert.equal(wh.workdays, 5);
  assert.equal(wh.expected, 40);
  assert.equal(wh.total, 0); // nothing logged yet → behind, as expected
});

test('half days contribute 4h to the total', () => {
  const holidays = holidaySet(2026);
  const monday = C.getMonday(new Date(2026, 8, 14));
  const marks = new Map([
    ['2026-09-14', 'HL'], // 4h
    ['2026-09-15', 'FW'], // 8h
  ]);
  const wh = C.getWeekHours(monday, holidays, new Map(marks), HOURS);
  assert.equal(wh.total, 12);
});

test('computeHolidays dedupes by date and caps the list', () => {
  const list = C.computeHolidays(2026);
  const keys = list.map((h) => h.dateStr);
  assert.ok(list.length <= 13);
  assert.equal(new Set(keys).size, keys.length, 'no duplicate holiday dates');
});

test('US fixed/floating holidays land on the right weekday for 2026', () => {
  // Memorial Day = last Monday of May; Labor Day = 1st Monday of Sep.
  assert.equal(C.lastMonday(2026, 5), '2026-05-25');
  assert.equal(C.nthWeekday(2026, 1, 9, 1), '2026-09-07');
});

// Leave accounting: full-leave (FL) draws 1 day, half-leave (HL) 0.5; work (FW)
// and sick (SL) never touch the allowance. These were untested DOM-blob helpers
// until they moved into the core — the annual cap is a real business rule.
test('leaveSummary tallies full/half leave and computes the annual balance', () => {
  const marks = new Map([
    ['2026-01-05', 'FL'], // full
    ['2026-02-10', 'FL'], // full
    ['2026-03-03', 'HL'], // half
    ['2026-04-01', 'FW'], // work — ignored
    ['2026-05-01', 'SL'], // sick — ignored
    ['2025-01-05', 'FL'], // different year — ignored
  ]);
  const s = C.leaveSummary(marks, 2026);
  assert.equal(s.full, 2);
  assert.equal(s.half, 1);
  assert.equal(s.used, 2.5);
  assert.equal(s.cap, C.LEAVE_CAP);
  assert.equal(s.remaining, C.LEAVE_CAP - 2.5);
});

test('canAddLeave enforces the annual cap and ignores non-leave statuses', () => {
  const marks = new Map();
  for (let i = 0; i < C.LEAVE_CAP; i++) {
    marks.set(C.fmtKey(new Date(2026, 0, 1 + i)), 'FL'); // fill the year to the cap
  }
  assert.equal(C.leaveSummary(marks, 2026).used, C.LEAVE_CAP);
  assert.equal(C.canAddLeave(marks, 2026, 'FL'), false, 'cannot exceed the cap');
  assert.equal(C.canAddLeave(marks, 2026, 'HL'), false, 'half day also blocked at the cap');
  assert.equal(C.canAddLeave(marks, 2026, 'FW'), true, 'work never draws leave');
  assert.equal(C.canAddLeave(marks, 2026, 'SL'), true, 'sick never draws leave');
});

test('canAddLeave allows a half day when exactly 0.5 of headroom remains', () => {
  const marks = new Map();
  for (let i = 0; i < C.LEAVE_CAP - 1; i++) {
    marks.set(C.fmtKey(new Date(2026, 0, 1 + i)), 'FL'); // 29 full days
  }
  marks.set(C.fmtKey(new Date(2026, 5, 1)), 'HL'); // + half → used = 29.5
  assert.equal(C.leaveSummary(marks, 2026).used, C.LEAVE_CAP - 0.5);
  assert.equal(C.canAddLeave(marks, 2026, 'HL'), true, 'half day fits the last 0.5');
  assert.equal(C.canAddLeave(marks, 2026, 'FL'), false, 'full day does not');
});
