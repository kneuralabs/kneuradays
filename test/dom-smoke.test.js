'use strict';

// DOM smoke test: loads the real index.html in jsdom, executes its inline app
// script against a real DOM, and asserts the *rendered* weekly-pace UI. This is
// the end-to-end counterpart to calendar-core.test.js — it proves the fix is
// wired all the way through to the labels a user actually sees, not just the
// pure calculation.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');

function buildDom() {
  let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const core = fs.readFileSync(path.join(ROOT, 'calendar-core.js'), 'utf8');

  // Freeze "now" to Juneteenth 2026 (Fri Jun 19) and seed a fully-logged Mon–Thu,
  // so the current week is complete except for the locked holiday on Friday.
  const boot = `
    (function () {
      var R = Date;
      var FIXED = new R(2026, 5, 19, 12, 0, 0).getTime(); // local Fri Jun 19 2026
      function D() {
        if (arguments.length === 0) return new R(FIXED);
        return new (R.bind.apply(R, [null].concat(Array.prototype.slice.call(arguments))))();
      }
      D.prototype = R.prototype; D.now = function () { return FIXED; };
      D.UTC = R.UTC; D.parse = R.parse;
      Date = D;
      try {
        localStorage.setItem('workcal_marks_v6_blank_default', JSON.stringify([
          ['2026-06-15', 'FW'], ['2026-06-16', 'FW'], ['2026-06-17', 'FW'], ['2026-06-18', 'FW']
        ]));
      } catch (e) {}
    })();
  `;

  // Inline the local core module + bootstrap before the app script runs.
  // (jsdom's default resource loader never fetches external <script src>, so the
  // html2pdf CDN tag is ignored without us touching it.)
  html = html.replace(
    '<script src="calendar-core.js"></script>',
    `<script>${boot}</script>\n<script>${core}</script>`
  );

  const virtualConsole = new VirtualConsole();
  const errors = [];
  virtualConsole.on('jsdomError', (e) => errors.push(e));

  // ?kn-auth=e2e makes the SSO guard store a session instead of redirecting.
  const dom = new JSDOM(html, {
    url: 'https://kneuradays.test/index.html?kn-auth=e2e',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
  });
  return { dom, errors };
}

function ready(dom) {
  return new Promise((resolve) => {
    if (dom.window.document.readyState === 'complete') return resolve();
    dom.window.addEventListener('load', () => resolve());
  });
}

test('Quickdraw stats render a 32h target and "on track" for a holiday week', async () => {
  const { dom, errors } = buildDom();
  await ready(dom);
  assert.deepEqual(errors.map(String), [], 'no runtime errors during init');

  const stats = dom.window.document.getElementById('statsStrip').textContent;
  assert.match(stats, /\/\s*32h/, 'weekly target reflects the holiday (32h)');
  assert.match(stats, /on track/, 'fully-logged holiday week is on track');
  assert.doesNotMatch(stats, /\/\s*40h/, 'must not show the pre-fix 40h target');
  dom.window.close();
});

test('Pulse view shows a dynamic "/ 32h" target and an "ok" week total', async () => {
  const { dom, errors } = buildDom();
  await ready(dom);

  const doc = dom.window.document;
  doc.querySelector('.tab-btn[data-view="pulse"]').click();

  assert.equal(doc.getElementById('weekTarget').textContent.trim(), '/ 32h');
  const total = doc.getElementById('weekTotal');
  assert.equal(total.textContent.trim(), '32.0h');
  assert.match(total.className, /\bok\b/, 'week total flagged ok, not warn');
  assert.deepEqual(errors.map(String), [], 'no runtime errors after view switch');
  dom.window.close();
});
