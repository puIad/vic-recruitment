// The onboarding tour's pure logic (frontend/src/lib/vic/tour.ts, docs/onboarding-tour.md): which steps each role gets,
// and when the tour starts by itself. Node strips the TypeScript types, so the UI's own module is tested as it ships.
const assert = require('assert');
const T = require('../frontend/src/lib/vic/tour.ts');

let n = 0;
const t = (name, fn) => { fn(); n++; };

t('a member gets the 8-step tour, opening with a centered welcome on their binome', () => {
  const steps = T.buildTour('member', false);
  assert.strictEqual(steps.length, 8);
  assert.strictEqual(steps[0].target, undefined);
  assert.ok(steps.every((s) => (s.path ?? '/') === '/'), 'the member tour stays on My binome');
});

t('an admin gets 11 steps walking every page, ending on Help', () => {
  const steps = T.buildTour('admin', false);
  assert.strictEqual(steps.length, 11);
  assert.deepStrictEqual(
    [...new Set(steps.map((s) => s.path).filter(Boolean))],
    ['/', '/alerts', '/binomes', '/interviewees', '/team', '/settings/general', '/maintenance', '/help']
  );
  assert.strictEqual(steps[10].path, '/help');
});

t('an admin in a binome gets their own binome as a last chapter: an intro and member steps 2 to 6, on /my-binome', () => {
  const steps = T.buildTour('admin', true);
  assert.strictEqual(steps.length, 17);
  const chapter = steps.slice(11);
  assert.strictEqual(chapter[0].target, undefined);
  assert.deepStrictEqual(chapter.slice(1).map((s) => s.target), ['binome-partner', 'binome-progress', 'binome-needs-you', 'binome-candidates', 'binome-interview-action']);
  assert.ok(chapter.every((s) => s.path === '/my-binome'));
  assert.strictEqual(new Set(steps.map((s) => s.id)).size, steps.length, 'step ids stay unique');
});

const store = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };

t('the tour is due on a first visit and not after it was finished or skipped', () => {
  const s = store();
  assert.strictEqual(T.tourDue(s, 'member', 'a@g.enp.edu.dz'), true);
  T.markSeen(s, 'member', 'a@g.enp.edu.dz');
  assert.strictEqual(T.tourDue(s, 'member', 'a@g.enp.edu.dz'), false);
});

t('seen is per role and per email: a second person on the same browser still gets it', () => {
  const s = store();
  T.markSeen(s, 'admin', 'a@g.enp.edu.dz');
  assert.strictEqual(T.tourDue(s, 'admin', 'b@g.enp.edu.dz'), true);
  assert.strictEqual(T.tourDue(s, 'member', 'a@g.enp.edu.dz'), true);
  assert.notStrictEqual(T.tourKey('admin', 'a@g.enp.edu.dz'), T.tourKey('member', 'a@g.enp.edu.dz'));
});

t('a tour seen at an older version is due once more; a newer or same version is not', () => {
  const s = store(), key = T.tourKey('admin', 'a@g.enp.edu.dz'), v = T.TOUR_VERSION.admin;
  s.setItem(key, JSON.stringify({ v: v - 1, at: 1 }));
  assert.strictEqual(T.tourDue(s, 'admin', 'a@g.enp.edu.dz'), true);
  s.setItem(key, JSON.stringify({ v: v + 1, at: 1 }));
  assert.strictEqual(T.tourDue(s, 'admin', 'a@g.enp.edu.dz'), false);
  s.setItem(key, 'not json');
  assert.strictEqual(T.tourDue(s, 'admin', 'a@g.enp.edu.dz'), true, 'a broken flag counts as not seen');
});

t('blocked storage counts as seen, so the tour never loops, and marking seen does not throw', () => {
  const blocked = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('QuotaExceededError'); } };
  assert.strictEqual(T.tourDue(blocked, 'member', 'a@g.enp.edu.dz'), false);
  assert.doesNotThrow(() => T.markSeen(blocked, 'member', 'a@g.enp.edu.dz'));
});

console.log(`tour: ${n} passed`);
