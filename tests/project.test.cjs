const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');

function environment(memory = new Map()) {
  const context = vm.createContext({ window: {}, console, localStorage: {
    getItem: key => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value)
  } });
  for (const file of ['js/data/catalog.js', 'js/domain/rules.js', 'js/data/challenges.js', 'js/data/store.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  }
  return { store: context.window.PokeStore, rules: context.window.PokeRules,
    catalog: context.window.POKE_CATALOG, challenges: context.window.POKE_CHALLENGES, memory };
}
const plain = value => JSON.parse(JSON.stringify(value));
const team = (members = [1, 4, 7]) => ({ name: '第一支队伍', note: '真实测试记录', members });
const exactBudgetMembers = [3, 9, 26, 28, 31, 34]; // 本地图鉴合计 3000。
const onePointOverMembers = [3, 6, 9, 18, 24, 26]; // 本地图鉴合计 3001。

test('公开资料恰好覆盖 #001–151，六项能力与单位完整', () => {
  const { catalog } = environment();
  assert.equal(catalog.pokemon.length, 151);
  assert.deepEqual(plain(catalog.pokemon.map(item => item.id)), Array.from({ length: 151 }, (_, index) => index + 1));
  assert.equal(catalog.types.length, 18);
  for (const item of catalog.pokemon) {
    assert.ok(item.name && item.slug && item.genus);
    assert.equal(Object.keys(item.stats).length, 6);
    assert.equal(item.total, Object.values(item.stats).reduce((sum, value) => sum + value, 0));
    assert.ok(item.height > 0 && item.weight > 0);
    assert.ok(item.types.length >= 1 && item.types.length <= 2);
    item.types.forEach(id => assert.ok(catalog.types.some(type => type.id === id)));
  }
  const pikachu = catalog.pokemon.find(item => item.id === 25);
  assert.equal(pikachu.height, 0.4);
  assert.equal(pikachu.weight, 6);
});
test('151 张本地插画的 PNG 格式与来源摘要一致', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets/data/source-manifest.json')));
  assert.equal(manifest.images.length, 151);
  for (const image of manifest.images) {
    const bytes = fs.readFileSync(path.join(root, image.file));
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), image.sha256);
  }
});
test('属性关系表完整，包含常规倍率与属性无效', () => {
  const { catalog } = environment();
  for (const type of catalog.types) {
    assert.equal(Object.keys(type.damage).length, 18);
    Object.values(type.damage).forEach(value => assert.ok([0, 0.5, 1, 2].includes(value)));
  }
});
test('单属性、双属性与零倍率按来源表正确相乘', () => {
  const { rules, catalog } = environment(), types = catalog.types;
  assert.equal(rules.multiplier('fire', ['grass'], types), 2);
  assert.equal(rules.multiplier('electric', ['ground'], types), 0);
  assert.equal(rules.multiplier('ice', ['grass', 'flying'], types), 4);
  assert.equal(rules.multiplier('fire', ['water', 'rock'], types), 0.25);
  assert.equal(rules.multiplier('electric', ['water', 'ground'], types), 0);
});
test('未知或重复属性不能被当成有效倍率', () => {
  const { rules, catalog } = environment();
  assert.throws(() => rules.multiplier('unknown', ['grass'], catalog.types));
  assert.throws(() => rules.multiplier('fire', ['grass', 'grass'], catalog.types));
  assert.throws(() => rules.multiplier('fire', [], catalog.types));
});
test('属性实验返回各项因子与最终结果，覆盖六种倍率及四种反馈', () => {
  const { rules, catalog } = environment();
  const cases = [
    { attack: 'electric', defenses: ['water', 'ground'], factors: [2, 0], value: 0, outcome: 'immune' },
    { attack: 'fire', defenses: ['water', 'rock'], factors: [0.5, 0.5], value: 0.25, outcome: 'resist' },
    { attack: 'fire', defenses: ['water'], factors: [0.5], value: 0.5, outcome: 'resist' },
    { attack: 'fire', defenses: ['normal'], factors: [1], value: 1, outcome: 'neutral' },
    { attack: 'fire', defenses: ['grass'], factors: [2], value: 2, outcome: 'weak' },
    { attack: 'ice', defenses: ['grass', 'flying'], factors: [2, 2], value: 4, outcome: 'weak' }
  ];
  const originalTypes = plain(catalog.types);
  for (const expected of cases) {
    const defenses = [...expected.defenses], originalDefenses = [...defenses];
    const result = rules.typeExperiment(expected.attack, defenses, catalog.types);
    assert.deepEqual(plain(result), expected);
    assert.deepEqual(defenses, originalDefenses);
    assert.notEqual(result.defenses, defenses);
    result.defenses.push('dragon');
    assert.deepEqual(defenses, originalDefenses);
  }
  assert.deepEqual(plain(catalog.types), originalTypes);
});
test('属性实验复用倍率输入校验，拒绝未知、重复及错误数量的防御属性', () => {
  const { rules, catalog } = environment();
  assert.throws(() => rules.typeExperiment('unknown', ['grass'], catalog.types));
  for (const defenses of [null, 'grass', [], ['unknown'], ['grass', 'grass'], ['grass', 'flying', 'water']]) {
    assert.throws(() => rules.typeExperiment('fire', defenses, catalog.types));
  }
});
test('空队伍可分析，双属性按两种分类计数，抵抗包含免疫', () => {
  const { rules, catalog } = environment();
  assert.equal(rules.analyzeTeam([], catalog.types).distribution.length, 0);
  const charizard = catalog.pokemon.find(item => item.id === 6);
  const result = rules.analyzeTeam([charizard], catalog.types);
  assert.equal(result.distribution.length, 2);
  assert.equal(result.defense.find(row => row.id === 'rock').weak, 1);
  assert.equal(result.defense.find(row => row.id === 'ground').immune, 1);
  assert.equal(result.defense.find(row => row.id === 'ground').resist, 1);
});

test('配队预算使用来源总和，空队、恰好 3000 与超出 1 点边界明确', () => {
  const { rules, catalog } = environment();
  const members = ids => ids.map(id => catalog.pokemon.find(item => item.id === id));
  assert.equal(rules.TEAM_BUDGET, 3000);
  assert.deepEqual(plain(rules.teamBudget([])), { limit: 3000, used: 0, remaining: 3000, over: 0, valid: true });
  const exact = members(exactBudgetMembers), original = plain(exact);
  assert.deepEqual(plain(rules.teamBudget(exact)), { limit: 3000, used: 3000, remaining: 0, over: 0, valid: true });
  assert.deepEqual(plain(rules.analyzeTeam(exact, catalog.types).budget), plain(rules.teamBudget(exact)));
  assert.deepEqual(plain(rules.teamBudget(members(onePointOverMembers))), {
    limit: 3000, used: 3001, remaining: -1, over: 1, valid: false
  });
  assert.deepEqual(plain(exact), original);
});

test('新手任务空队不能通过条件，五位成员只完成预算与电弱点条件', () => {
  const { rules, catalog } = environment();
  const empty = rules.starterChallenge([], catalog.types);
  assert.equal(empty.targetMembers, 6); assert.equal(empty.maxElectricWeak, 2);
  assert.equal(empty.memberCount, 0); assert.equal(empty.complete, false);
  assert.deepEqual(plain(empty.checks), { members: false, budget: false, electric: false });
  assert.deepEqual(plain(empty.electricWeakMembers), []);
  assert.deepEqual(plain(empty.budget), plain(rules.teamBudget([])));
  const five = [1, 4, 7, 25, 133].map(id => catalog.pokemon.find(item => item.id === id));
  const result = rules.starterChallenge(five, catalog.types);
  assert.equal(result.memberCount, 5); assert.equal(result.complete, false);
  assert.deepEqual(plain(result.checks), { members: false, budget: true, electric: true });
});
test('新手任务六位成员在预算内且至多两位电弱点才能完成', () => {
  const { rules, catalog } = environment();
  const run = ids => rules.starterChallenge(ids.map(id => catalog.pokemon.find(item => item.id === id)), catalog.types);
  const valid = run([1, 4, 7, 25, 133, 147]);
  assert.equal(valid.complete, true);
  assert.deepEqual(plain(valid.checks), { members: true, budget: true, electric: true });
  assert.deepEqual(plain(valid.electricWeakMembers), [{ id: 7, name: '杰尼龟', value: 2 }]);
  const exactlyTwo = run([1, 4, 7, 16, 25, 133]);
  assert.equal(exactlyTwo.electricWeakMembers.length, 2); assert.equal(exactlyTwo.complete, true);
  const three = run([1, 4, 7, 16, 21, 25]);
  assert.deepEqual(plain(three.electricWeakMembers.map(item => item.id)), [7, 16, 21]);
  assert.equal(three.checks.members, true); assert.equal(three.checks.budget, true);
  assert.equal(three.checks.electric, false); assert.equal(three.complete, false);
  const over = run(onePointOverMembers);
  assert.equal(over.budget.used, 3001); assert.equal(over.checks.budget, false); assert.equal(over.complete, false);
  const duplicate = run([1, 4, 7, 25, 133, 133]);
  assert.equal(duplicate.memberCount, 6); assert.equal(duplicate.checks.members, false);
  assert.equal(duplicate.checks.budget, true); assert.equal(duplicate.checks.electric, true);
  assert.equal(duplicate.complete, false);
});
test('新手任务按双属性相乘识别弱点，地面免疫不会被电弱点计数', () => {
  const { rules, catalog } = environment();
  const find = id => catalog.pokemon.find(item => item.id === id);
  // 第一世代没有水／地面成员，组合属性样例仅用于检验倍率规则。
  const waterGround = { ...find(7), types: ['water', 'ground'] };
  const members = [waterGround, find(27), find(74), find(130), find(149)];
  const original = plain(members);
  const result = rules.starterChallenge(members, catalog.types);
  assert.deepEqual(plain(result.electricWeakMembers), [{ id: 130, name: '暴鲤龙', value: 4 }]);
  assert.equal(result.checks.electric, true);
  assert.deepEqual(plain(members), original);
});

test('访客可读取作者预设，四支队伍均为预算内六名独立成员且返回副本', async () => {
  const { store, rules, catalog, challenges } = environment();
  const presets = await store.getChallenges();
  assert.equal(presets.length, 4);
  assert.equal(new Set(presets.map(preset => preset.id)).size, presets.length);
  assert.ok(Object.isFrozen(challenges));
  for (const preset of presets) {
    assert.ok(preset.name && preset.tagline && preset.note);
    assert.equal(preset.members.length, 6);
    assert.equal(new Set(preset.members).size, 6);
    const members = preset.members.map(id => catalog.pokemon.find(item => item.id === id));
    assert.ok(members.every(Boolean));
    assert.ok(rules.teamBudget(members).valid);
    const source = challenges.find(item => item.id === preset.id);
    assert.ok(Object.isFrozen(source) && Object.isFrozen(source.members));
  }
  const original = plain(presets);
  presets[0].name = '改写副本'; presets[0].members[0] = 150; presets.pop();
  assert.deepEqual(plain(await store.getChallenges()), original);
  assert.equal(await store.getSession(), null);
});
test('访客能读取公开图鉴，但不能读取或写入个人记录', async () => {
  const { store } = environment();
  assert.equal((await store.getCatalog()).pokemon.length, 151);
  assert.equal(await store.getSession(), null);
  await assert.rejects(store.getProfile(), /登录/);
  await assert.rejects(store.toggleFavorite(25), /登录/);
  await assert.rejects(store.saveTeam(team()), /登录/);
});
test('登录错误不创建会话，公开用户对象不包含密码', async () => {
  const { store } = environment();
  await assert.rejects(store.login('leaf', 'wrong'), /不正确/);
  assert.equal(await store.getSession(), null);
  const user = await store.login(' LEAF ', 'poke123');
  assert.equal(user.username, 'leaf');
  assert.equal(Object.hasOwn(user, 'password'), false);
});
test('初始演示账号没有虚构收藏、队伍或练习成绩', async () => {
  const { store } = environment();
  await store.login('leaf', 'poke123');
  assert.deepEqual(plain(await store.getProfile()), { favorites: [], teams: [], practices: [] });
});
test('不同账号的收藏、队伍、练习成绩互相隔离', async () => {
  const { store } = environment();
  await store.login('leaf', 'poke123');
  await store.toggleFavorite(25); await store.saveTeam(team()); await store.savePractice(4, 5);
  await store.logout(); await store.login('blue', 'poke123');
  assert.deepEqual(plain(await store.getProfile()), { favorites: [], teams: [], practices: [] });
  await store.toggleFavorite(133); await store.login('leaf', 'poke123');
  const profile = await store.getProfile();
  assert.deepEqual(plain(profile.favorites), [25]);
  assert.equal(profile.teams.length, 1); assert.equal(profile.practices[0].score, 4);
});
test('本地注册校验格式、重复账号和密码长度', async () => {
  const { store } = environment();
  await assert.rejects(store.register({ username: '1bad', name: '名字', password: '123456' }), /字母/);
  await assert.rejects(store.register({ username: 'leaf', name: '名字', password: '123456' }), /存在/);
  await assert.rejects(store.register({ username: 'newuser', name: '名字', password: '123' }), /至少/);
  const user = await store.register({ username: 'newuser', name: '新发现者', password: 'test123' });
  assert.equal(user.name, '新发现者'); assert.equal((await store.getSession()).id, user.id);
});
test('收藏切换、非法编号与读取副本保护', async () => {
  const { store } = environment();
  await store.login('leaf', 'poke123');
  const result = await store.toggleFavorite(25); result.favorites.push(1);
  assert.deepEqual(plain((await store.getProfile()).favorites), [25]);
  await store.toggleFavorite(25);
  assert.equal((await store.getProfile()).favorites.length, 0);
  await assert.rejects(store.toggleFavorite('25'), /编号/);
  await assert.rejects(store.toggleFavorite(999), /编号/);
});
test('队伍拒绝空队、重复成员、未知编号和超过六人', async () => {
  const { store } = environment(); await store.login('leaf', 'poke123');
  for (const members of [[], [1, 1], [999], [1, 2, 3, 4, 5, 6, 7]]) await assert.rejects(store.saveTeam(team(members)));
  await assert.rejects(store.saveTeam({ ...team(), name: ' ' }));
  assert.equal((await store.getProfile()).teams.length, 0);
});

test('预算边界队伍允许保存，超额新增和修改均不写入数据', async () => {
  const { store, memory } = environment(); await store.login('leaf', 'poke123');
  const saved = await store.saveTeam(team(exactBudgetMembers));
  const originalProfile = plain(await store.getProfile());
  const originalStorage = memory.get('poke-discovery-v1');
  for (const values of [team(onePointOverMembers), { ...team(onePointOverMembers), id: saved.id }]) {
    await assert.rejects(store.saveTeam(values), /3001.*3000.*1/);
    assert.deepEqual(plain(await store.getProfile()), originalProfile);
    assert.equal(memory.get('poke-discovery-v1'), originalStorage);
  }
});

test('旧版超额队伍可原样读取，调整到预算内后可正常保存', async () => {
  const { store, memory } = environment(); await store.login('leaf', 'poke123');
  const saved = await store.saveTeam(team());
  const legacy = JSON.parse(memory.get('poke-discovery-v1'));
  legacy.profiles.leaf.teams[0].members = onePointOverMembers;
  const legacyRaw = JSON.stringify(legacy);
  memory.set('poke-discovery-v1', legacyRaw);
  const reload = environment(memory).store;
  const record = (await reload.getProfile()).teams[0];
  assert.deepEqual(plain(record.members), onePointOverMembers);
  assert.equal(memory.get('poke-discovery-v1'), legacyRaw);
  await assert.rejects(reload.saveTeam({ ...record, note: '超额队伍不能继续保存' }), /预算/);
  assert.equal(memory.get('poke-discovery-v1'), legacyRaw);
  const fixed = await reload.saveTeam({ ...record, members: exactBudgetMembers });
  assert.equal(fixed.id, saved.id); assert.equal(fixed.createdAt, saved.createdAt);
  assert.deepEqual(plain((await reload.getProfile()).teams[0].members), exactBudgetMembers);
});
test('保存、修改、删除队伍，账号不能修改其他账号的队伍', async () => {
  const { store } = environment(); await store.login('leaf', 'poke123');
  const saved = await store.saveTeam(team());
  const updated = await store.saveTeam({ ...team([25, 133]), id: saved.id, name: '新名字' });
  assert.equal(updated.createdAt, saved.createdAt); assert.equal(updated.name, '新名字');
  await store.login('blue', 'poke123');
  await assert.rejects(store.saveTeam({ ...team(), id: saved.id }), /当前账号/);
  await assert.rejects(store.deleteTeam(saved.id), /当前账号/);
  await store.login('leaf', 'poke123'); await store.deleteTeam(saved.id);
  assert.equal((await store.getProfile()).teams.length, 0);
});
test('队伍数量上限不会破坏已有记录', async () => {
  const { store } = environment(); await store.login('leaf', 'poke123');
  for (let i = 0; i < 8; i++) await store.saveTeam(team([i + 1]));
  await assert.rejects(store.saveTeam(team()), /8/);
  assert.equal((await store.getProfile()).teams.length, 8);
});
test('会话与个人记录能跨数据层重载保存', async () => {
  const { store, memory } = environment();
  await store.login('leaf', 'poke123'); await store.toggleFavorite(25); await store.saveTeam(team());
  const reload = environment(memory).store;
  assert.equal((await reload.getSession()).username, 'leaf');
  assert.deepEqual(plain((await reload.getProfile()).favorites), [25]);
  assert.equal((await reload.getProfile()).teams.length, 1);
});
test('导出不含密码，导入只替换当前账号的记录', async () => {
  const { store } = environment(); await store.login('leaf', 'poke123');
  await store.toggleFavorite(25); await store.saveTeam(team()); await store.savePractice(5, 5);
  const backup = await store.exportProfile(); assert.ok(!JSON.stringify(backup).includes('poke123'));
  await store.login('blue', 'poke123'); await store.importProfile(backup);
  assert.deepEqual(plain((await store.getProfile()).favorites), [25]);
  await store.toggleFavorite(133); await store.login('leaf', 'poke123');
  assert.deepEqual(plain((await store.getProfile()).favorites), [25]);
});
test('导入校验全部完成后才保存，失败不会覆盖已有数据', async () => {
  const { store } = environment(); await store.login('leaf', 'poke123'); await store.toggleFavorite(25);
  const original = plain(await store.getProfile());
  const valid = await store.exportProfile();
  const invalids = [null, { ...valid, version: 2 }, { ...valid, profile: { ...valid.profile, favorites: [25, 25] } },
    { ...valid, profile: { ...valid.profile, favorites: ['25'] } },
    { ...valid, profile: { ...valid.profile, teams: [{ ...team(), createdAt: 'bad', updatedAt: 'bad' }] } },
    { ...valid, profile: { ...valid.profile, practices: [{ score: 6, total: 5, time: new Date().toISOString() }] } }];
  for (const invalid of invalids) { await assert.rejects(store.importProfile(invalid)); assert.deepEqual(plain(await store.getProfile()), original); }
});

test('导入含超额队伍或损坏结构时原子回滚，预算边界备份可导入', async () => {
  const { store, memory } = environment(); await store.login('leaf', 'poke123');
  await store.toggleFavorite(25); await store.saveTeam(team());
  const backup = await store.exportProfile();
  const original = plain(await store.getProfile()), originalStorage = memory.get('poke-discovery-v1');
  const validTeam = { ...plain(backup.profile.teams[0]), members: exactBudgetMembers };
  const badTeams = [
    { ...validTeam, members: onePointOverMembers }, null, [], {},
    { ...validTeam, members: null }, { ...validTeam, members: '1,4,7' },
    { ...validTeam, members: [1, 1] }, { ...validTeam, members: [999] },
    { ...validTeam, members: Array(1) }
  ];
  for (const badTeam of badTeams) {
    const input = { ...backup, profile: { ...backup.profile, favorites: [133], teams: [validTeam, badTeam] } };
    await assert.rejects(store.importProfile(input));
    assert.deepEqual(plain(await store.getProfile()), original);
    assert.equal(memory.get('poke-discovery-v1'), originalStorage);
  }
  for (const malformed of [[], { ...backup, profile: [] }, { ...backup, profile: { ...backup.profile, teams: Array(1) } },
    { ...backup, profile: { ...backup.profile, practices: [null] } }]) {
    await assert.rejects(store.importProfile(malformed));
    assert.equal(memory.get('poke-discovery-v1'), originalStorage);
  }
  await store.importProfile({ ...backup, profile: { ...backup.profile, teams: [validTeam] } });
  assert.deepEqual(plain((await store.getProfile()).teams[0].members), exactBudgetMembers);
});
test('练习成绩只接受五题有效结果，最多保留二十次', async () => {
  const { store } = environment(); await store.login('leaf', 'poke123');
  await assert.rejects(store.savePractice(6, 5)); await assert.rejects(store.savePractice(1, 10));
  for (let i = 0; i < 23; i++) await store.savePractice(i % 6, 5);
  assert.equal((await store.getProfile()).practices.length, 20);
});
test('界面不直接读写 localStorage，课程立项入口存在', () => {
  assert.ok(!fs.readFileSync(path.join(root, 'js/ui/app.js'), 'utf8').includes('localStorage'));
  assert.ok(fs.existsSync(path.join(root, 'docs/立项.md')));
});
