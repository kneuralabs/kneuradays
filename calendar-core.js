/* ──────────────────────────────────────────────────────────────────────────
   Kneuradays calendar core — pure, DOM-free logic.

   This is the single source of truth for date math, US public-holiday dates,
   and the weekly-hours calculation. index.html loads it in the browser
   (exposed as window.KCore); test/calendar-core.test.js requires it in Node.
   Keeping this logic out of the DOM blob is what makes it unit-testable, so
   the holiday-target rules below can't silently regress again.
   ────────────────────────────────────────────────────────────────────────── */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; // Node / tests
  root.KCore = api;                                                       // Browser
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function fmtKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function parseKey(k) { const [y,m,d]=k.split('-').map(Number); return new Date(y,m-1,d); }
  function addDays(d, n) { const x=new Date(d); x.setDate(x.getDate()+n); return x; }
  function getMonday(d) {
    const dt=new Date(d); const day=dt.getDay();
    dt.setDate(dt.getDate()+(day===0?-6:1-day)); dt.setHours(0,0,0,0); return dt;
  }
  function weekNumber(d) {
    const dt=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));
    dt.setUTCDate(dt.getUTCDate()+4-(dt.getUTCDay()||7));
    const ys=new Date(Date.UTC(dt.getUTCFullYear(),0,1));
    return Math.ceil((((dt-ys)/86400000)+1)/7);
  }
  function monthName(m) { return new Date(2000,m,1).toLocaleString('default',{month:'long'}); }

  function nthWeekday(year, dow, month, nth) {
    let d = new Date(year, month-1, 1), count = 0;
    while (d.getMonth() === month-1) {
      if (d.getDay() === dow) { count++; if (count === nth) return fmtKey(d); }
      d.setDate(d.getDate()+1);
    }
    return null;
  }
  function lastMonday(year, month) {
    let d = new Date(year, month, 0);
    while (d.getDay() !== 1) d.setDate(d.getDate()-1);
    return fmtKey(d);
  }
  function computeHolidays(year) {
    const h = [];
    const add = (ds, name) => h.push({ dateStr: ds, name });
    add(`${year}-01-01`, "New Year's Day");
    const mlk = nthWeekday(year,1,1,3); if (mlk) add(mlk,"MLK Day");
    const pres = nthWeekday(year,1,2,3); if (pres) add(pres,"Presidents' Day");
    const mem = lastMonday(year,5); if (mem) add(mem,"Memorial Day");
    add(`${year}-06-19`,"Juneteenth");
    add(`${year}-07-04`,"Independence Day");
    const labor = nthWeekday(year,1,9,1); if (labor) add(labor,"Labor Day");
    const col = nthWeekday(year,1,10,2); if (col) add(col,"Columbus Day");
    add(`${year}-11-11`,"Veterans Day");
    const thanks = nthWeekday(year,4,11,4);
    if (thanks) {
      add(thanks,"Thanksgiving");
      const d = new Date(thanks); d.setDate(d.getDate()+1);
      add(fmtKey(d),"Day after Thanksgiving");
    }
    add(`${year}-12-25`,"Christmas Day");
    const diwMap = {2024:'2024-10-31',2025:'2025-10-20',2026:'2026-11-08',2027:'2027-10-28',2028:'2028-10-17',2029:'2029-11-05',2030:'2030-10-26'};
    if (diwMap[year]) add(diwMap[year],"Diwali");
    const seen = new Set(), u = [];
    for (const x of h) { if (!seen.has(x.dateStr)) { seen.add(x.dateStr); u.push(x); } }
    return u.slice(0,13);
  }

  /* Weekly Mon–Fri hours. Public holidays are locked at 0h and cannot be
     edited, so they are excluded from the workday count — `expected` is the
     achievable target (non-holiday weekdays × 8), never a flat 40.
       holidays    – anything with .has(dateKey) (Set or Map)
       marks       – Map<dateKey, statusCode>
       statusHours – { statusCode: hoursNumber } */
  function getWeekHours(monday, holidays, marks, statusHours) {
    let total = 0, workdays = 0;
    for (let i = 0; i < 5; i++) {
      const k = fmtKey(addDays(monday, i));
      if (holidays.has(k)) continue;
      total += statusHours[marks.get(k)] ?? 0;
      workdays++;
    }
    return { total, workdays, expected: workdays * 8 };
  }

  return { fmtKey, parseKey, addDays, getMonday, weekNumber, monthName,
           nthWeekday, lastMonday, computeHolidays, getWeekHours };
});
