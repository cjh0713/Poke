const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sourceCode = fs.readFileSync(path.join(__dirname, '../js/ui/lab-effects.js'), 'utf8');

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function environment(reducedMotion = false) {
  const timers = new Map();
  let nextTimer = 0;
  const context = vm.createContext({
    window: { matchMedia: () => ({ matches: reducedMotion }) },
    setTimeout(callback) { const id = ++nextTimer; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); }
  });
  vm.runInContext(sourceCode, context);
  return { effects: context.window.PokeLabEffects, timers };
}

function arenaFixture(imageReady = Promise.resolve()) {
  const buddyImage = { decode: () => imageReady };
  const buddy = {
    matches: () => false,
    querySelectorAll: () => [buddyImage],
    getBoundingClientRect: () => ({ left: 120, top: 100, width: 40, height: 40 })
  };
  const target = {
    matches: selector => selector === 'img',
    decode: () => Promise.resolve(),
    getBoundingClientRect: () => ({ left: 420, top: 80, width: 80, height: 120 })
  };
  const projectile = {};
  const children = new Map([
    ['.lab-buddy', buddy], ['.lab-target-art', target], ['.lab-projectile', projectile]
  ]);
  const classes = new Set();
  const properties = new Map();
  const arena = {
    isConnected: true,
    offsetWidth: 500,
    querySelector: selector => children.get(selector),
    contains: element => Array.from(children.values()).includes(element),
    getBoundingClientRect: () => ({ left: 100, top: 50, width: 500, height: 240 }),
    classList: { add: name => classes.add(name), remove: name => classes.delete(name) },
    style: { setProperty: (name, value) => properties.set(name, value) }
  };
  return { arena, classes, properties };
}

test('stop cancels a play still waiting for an image', async () => {
  const { effects, timers } = environment();
  const image = deferred();
  const { arena, classes, properties } = arenaFixture(image.promise);
  const pendingPlay = effects.play(arena);
  effects.stop();
  image.resolve();
  await pendingPlay;
  assert.equal(classes.has('is-firing'), false);
  assert.equal(properties.size, 0);
  assert.equal(timers.size, 0);
});

test('a newer play prevents an earlier image callback from starting', async () => {
  const { effects } = environment();
  const image = deferred();
  const first = arenaFixture(image.promise);
  const second = arenaFixture();
  const pendingPlay = effects.play(first.arena);
  await effects.play(second.arena);
  image.resolve();
  await pendingPlay;
  assert.equal(first.classes.has('is-firing'), false);
  assert.equal(second.classes.has('is-firing'), true);
  effects.stop();
});

test('an arena disconnected during image preparation never starts', async () => {
  const { effects, timers } = environment();
  const image = deferred();
  const { arena, classes } = arenaFixture(image.promise);
  const pendingPlay = effects.play(arena);
  arena.isConnected = false;
  image.resolve();
  await pendingPlay;
  assert.equal(classes.has('is-firing'), false);
  assert.equal(timers.size, 0);
  await effects.play(arena);
  assert.equal(classes.has('is-firing'), false);
});

test('reduced motion keeps the result static', async () => {
  const { effects, timers } = environment(true);
  const { arena, classes, properties } = arenaFixture();
  await effects.play(arena);
  assert.equal(classes.has('is-firing'), false);
  assert.equal(properties.size, 0);
  assert.equal(timers.size, 0);
});

test('normal playback travels between element centers and can be stopped', async () => {
  const { effects, timers } = environment();
  const { arena, classes, properties } = arenaFixture();
  await effects.play(arena);
  assert.equal(properties.get('--launch-x'), '40px');
  assert.equal(properties.get('--launch-y'), '70px');
  assert.equal(properties.get('--travel-x'), '320px');
  assert.equal(properties.get('--travel-y'), '20px');
  assert.equal(classes.has('is-firing'), true);
  assert.equal(timers.size, 1);
  effects.stop();
  assert.equal(classes.has('is-firing'), false);
  assert.equal(timers.size, 0);
});
