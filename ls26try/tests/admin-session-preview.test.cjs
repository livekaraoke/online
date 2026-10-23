const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '../admin-new');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function buildPreview({ event = null, active = false } = {}) {
  const source = read('js/admin-events-integration.js');
  const start = source.indexOf('  function renderPreparedSessionDetails(');
  const end = source.indexOf('  window.LKAdminRenderSessionPreview =', start);
  assert.ok(start >= 0 && end > start, 'preview implementation should exist');
  const ids = ['sessionNameLiveLabel','sessionStatusLiveLabel','sessionDateLiveLabel',
    'sessionScheduledLiveLabel','sessionStartedLiveLabel','sessionElapsedLiveLabel',
    'sessionPlayLiveLabel','sessionBreaksLiveLabel','sessionAvgBpmLiveLabel',
    'sessionStartVarianceLabel'];
  const elements = Object.fromEntries(ids.map(id => [id, {
    textContent: 'OLD', classList: { add() {}, remove() {}, toggle() {} }
  }]));
  const context = {
    window: { LK: {state: {currentSessionData: null}} },
    activeSessionControl: active ? {active:true} : null,
    selectedSessionEvent: () => event,
    upcomingExcludingActive: () => event ? [event] : [],
    $: id => elements[id] || null,
  };
  const render = vm.runInNewContext('('+source.slice(start,end).trim()+')',context);
  return {render, elements, context};
}

test('selected gig fills title, scheduled status, time and exact event date before session start', () => {
  const {render,elements} = buildPreview({ event: {
    id:'event1',name:'Solo @ Whyte Harte 23/10',date:'2026-10-23',
    startTime:'21:00',status:'Confirmed'
  }});
  render();
  assert.equal(elements.sessionNameLiveLabel.textContent,'Solo @ Whyte Harte 23/10');
  assert.equal(elements.sessionStatusLiveLabel.textContent,'Scheduled · Not Started');
  assert.equal(elements.sessionDateLiveLabel.textContent,'23/10/2026');
  assert.equal(elements.sessionScheduledLiveLabel.textContent,'21:00');
  assert.equal(elements.sessionStartedLiveLabel.textContent,'-');
  assert.match(read('css/dashboard-polish.css'),/#sessionStatusLiveLabel\.is-pre-session/);
});

test('tentative events and empty schedules have accurate labels', () => {
  const event={id:'t',name:'Tentative Gig',date:'2026-11-01',startTime:'20:30',status:'Tentative'};
  const t=buildPreview({event});t.render();
  assert.equal(t.elements.sessionStatusLiveLabel.textContent,'Tentative · Not Started');
  const empty=buildPreview();empty.render();
  assert.equal(empty.elements.sessionStatusLiveLabel.textContent,'No Session');
  assert.equal(empty.elements.sessionDateLiveLabel.textContent,'-');
});

test('preview cannot overwrite actual live-session labels or metrics', () => {
  const t=buildPreview({active:true,event:{name:'Incorrect upcoming event',date:'2026-10-23'}});
  t.render();
  assert.equal(t.elements.sessionNameLiveLabel.textContent,'OLD');
  t.context.activeSessionControl=null;
  t.context.window.LK.state.currentSessionData={status:'active'};
  t.render();
  assert.equal(t.elements.sessionStatusLiveLabel.textContent,'OLD');
});

test('duplicate visual dropdown is removed without breaking existing selection state', () => {
  const html=read('admin.html');
  assert.match(html,/<select id="sessionEventSelect" hidden aria-hidden="true" tabindex="-1">/);
  assert.doesNotMatch(html,/<label for="sessionEventSelect">/);
  const events=read('js/admin-events-integration.js');
  assert.match(events,/function selectSessionEvent\(/);
  assert.match(events,/sessionEventIdInput/);
  assert.match(events,/renderPreparedSessionDetails\(event\)/);
  const sessions=read('js/sessions.js');
  assert.match(sessions,/activeSessionLabels"\)\.classList\.remove\("hidden"\)/);
  assert.match(sessions,/window\.LKAdminRenderSessionPreview\(\)/);
});
