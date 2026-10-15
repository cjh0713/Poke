/* 唯一的数据访问层。UI 使用 Promise 接口，替换后端时保留方法与返回结构。 */
window.PokeStore = (() => {
  const KEY = 'poke-discovery-v1';
  const catalog = window.POKE_CATALOG;
  const clone = value => JSON.parse(JSON.stringify(value));
  const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const blankProfile = () => ({ favorites: [], teams: [], practices: [] });
  const publicUser = user => user ? { id: user.id, username: user.username, name: user.name } : null;
  const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  function save(data) {
    try { localStorage.setItem(KEY, JSON.stringify(data)); }
    catch { throw new Error('保存失败，请检查浏览器存储权限或空间，并导出需要保留的记录。'); }
  }
  function read() {
    let raw;
    try { raw = localStorage.getItem(KEY); }
    catch { throw new Error('浏览器未允许本地存储，请在普通窗口中试用。'); }
    if (!raw) {
      const data = { version: 1, session: null, users: [
        { id: 'leaf', username: 'leaf', name: '小叶', password: 'poke123' },
        { id: 'blue', username: 'blue', name: '小澈', password: 'poke123' }
      ], profiles: { leaf: blankProfile(), blue: blankProfile() } };
      save(data);
      return data;
    }
    let data;
    try { data = JSON.parse(raw); }
    catch { throw new Error('本地记录格式损坏。请先备份数据，再处理浏览器存储。'); }
    if (data.version !== 1 || !Array.isArray(data.users) || !data.profiles) throw new Error('本地记录版本不兼容。');
    return data;
  }
  function current(data) {
    const user = data.users.find(item => item.id === data.session);
    if (!user) throw new Error('登录后就能保存你的收藏、队伍和练习记录。');
    return user;
  }
  function profile(data) { return data.profiles[current(data).id]; }
  function text(value, label, max, required = true) {
    if (typeof value !== 'string') throw new Error(`请填写有效的${label}。`);
    const result = value.trim();
    if ((required && !result) || result.length > max) throw new Error(`${label}${required ? '不能为空，且' : ''}最多 ${max} 字。`);
    return result;
  }
  function validId(id) {
    if (!Number.isInteger(id) || !catalog.pokemon.some(item => item.id === id)) throw new Error('找不到这个图鉴编号。');
    return id;
  }
  function memberIds(ids, allowEmpty = false) {
    if (!Array.isArray(ids) || ids.length > 6 || (!allowEmpty && ids.length < 1)
      || new Set(ids).size !== ids.length) throw new Error('队伍需要 1—6 个不重复的成员。');
    return Array.from(ids, validId);
  }
  function budgetMemberIds(ids) {
    const result = memberIds(ids);
    const members = result.map(id => catalog.pokemon.find(item => item.id === id));
    const budget = window.PokeRules.teamBudget(members);
    if (!budget.valid) throw new Error(`队伍能力总和 ${budget.used} 点，超过 ${budget.limit} 点预算 ${budget.over} 点，请调整成员。`);
    return result;
  }
  function date(value) {
    if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new Error('备份中的时间无效。');
    return new Date(value).toISOString();
  }
  return {
    async getCatalog() {
      if (!catalog?.pokemon?.length) throw new Error('公开资料未加载，请检查 catalog.js 文件。');
      return clone(catalog);
    },
    async getChallenges() {
      if (!Array.isArray(window.POKE_CHALLENGES)) throw new Error('参考队伍未加载，请检查 challenges.js 文件。');
      return clone(window.POKE_CHALLENGES);
    },
    async getSession() { const data = read(); return publicUser(data.users.find(user => user.id === data.session)); },
    async getProfile() { return clone(profile(read())); },
    async login(username, password) {
      const data = read();
      const user = data.users.find(item => item.username === String(username).trim().toLowerCase() && item.password === password);
      if (!user) throw new Error('账号或密码不正确。演示账号 leaf / blue，密码 poke123。');
      data.session = user.id;
      save(data);
      return publicUser(user);
    },
    async register(values) {
      const username = text(values.username, '账号', 20).toLowerCase();
      if (!/^[a-z][a-z0-9_-]{2,19}$/.test(username)) throw new Error('账号以字母开头，使用 3—20 位字母、数字、下划线或短横线。');
      const name = text(values.name, '昵称', 16);
      const password = text(values.password, '演示密码', 40);
      if (password.length < 6) throw new Error('演示密码至少 6 位。请勿使用真实常用密码。');
      const data = read();
      if (data.users.some(user => user.username === username)) throw new Error('这个账号已经存在。');
      if (data.users.length >= 30) throw new Error('本地演示最多保存 30 个账号。');
      const user = { id: uid(), username, name, password };
      data.users.push(user);
      data.profiles[user.id] = blankProfile();
      data.session = user.id;
      save(data);
      return publicUser(user);
    },
    async logout() { const data = read(); data.session = null; save(data); },
    async toggleFavorite(id) {
      validId(id);
      const data = read(), record = profile(data);
      if (record.favorites.includes(id)) record.favorites = record.favorites.filter(value => value !== id);
      else record.favorites.push(id);
      save(data);
      return clone(record);
    },
    async saveTeam(values) {
      if (!isObject(values)) throw new Error('请填写有效的队伍资料。');
      const ids = budgetMemberIds(values.members);
      const name = text(values.name, '队伍名称', 30);
      const note = text(values.note || '', '队伍备注', 200, false);
      const data = read(), record = profile(data);
      const now = new Date().toISOString();
      let team;
      if (values.id) {
        team = record.teams.find(item => item.id === values.id);
        if (!team) throw new Error('找不到当前账号的这支队伍。');
        Object.assign(team, { name, note, members: ids, updatedAt: now });
      } else {
        if (record.teams.length >= 8) throw new Error('最多保存 8 支队伍，请先整理已有队伍。');
        team = { id: uid(), name, note, members: ids, createdAt: now, updatedAt: now };
        record.teams.unshift(team);
      }
      save(data);
      return clone(team);
    },
    async deleteTeam(id) {
      const data = read(), record = profile(data);
      if (!record.teams.some(team => team.id === id)) throw new Error('找不到当前账号的这支队伍。');
      record.teams = record.teams.filter(team => team.id !== id);
      save(data);
    },
    async savePractice(score, total) {
      if (total !== 5 || !Number.isInteger(score) || score < 0 || score > total) throw new Error('练习成绩无效。');
      const data = read(), record = profile(data);
      record.practices.unshift({ score, total, time: new Date().toISOString() });
      record.practices = record.practices.slice(0, 20);
      save(data);
    },
    async exportProfile() {
      const data = read(), user = current(data);
      return clone({ app: 'poke-discovery', version: 1, exportedAt: new Date().toISOString(),
        owner: publicUser(user), profile: profile(data) });
    },
    async importProfile(value) {
      const data = read(); current(data);
      if (!isObject(value) || value.app !== 'poke-discovery' || value.version !== 1 || !isObject(value.profile)) throw new Error('请选择宝可梦发现室的 v1 JSON 备份。');
      const input = value.profile;
      if (!Array.isArray(input.favorites) || input.favorites.length > 151 || new Set(input.favorites).size !== input.favorites.length
        || !Array.isArray(input.teams) || input.teams.length > 8 || !Array.isArray(input.practices) || input.practices.length > 20) throw new Error('备份记录数量或结构不正确。');
      const imported = { favorites: Array.from(input.favorites, validId), teams: Array.from(input.teams, team => {
        if (!isObject(team)) throw new Error('备份中的队伍结构不正确。');
        return { id: uid(), name: text(team.name, '队伍名称', 30), note: text(team.note || '', '队伍备注', 200, false),
          members: budgetMemberIds(team.members), createdAt: date(team.createdAt), updatedAt: date(team.updatedAt) };
      }), practices: Array.from(input.practices, item => {
        if (!isObject(item) || item.total !== 5 || !Number.isInteger(item.score) || item.score < 0 || item.score > 5) throw new Error('备份练习成绩无效。');
        return { score: item.score, total: 5, time: date(item.time) };
      }) };
      data.profiles[data.session] = imported;
      save(data);
      return clone(imported);
    }
  };
})();
