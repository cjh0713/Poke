/* 纯计算：不读取浏览器存储，也不操作页面。倍率表来自公开数据。 */
window.PokeRules = (() => {
  const TEAM_BUDGET = 3000;
  const statKeys = ['hp', 'attack', 'defense', 'special-attack', 'special-defense', 'speed'];
  function teamBudget(members) {
    const used = members.reduce((sum, member) => sum + member.total, 0);
    return { limit: TEAM_BUDGET, used, remaining: TEAM_BUDGET - used,
      over: Math.max(0, used - TEAM_BUDGET), valid: used <= TEAM_BUDGET };
  }
  function multiplier(attack, defenses, types) {
    const source = types.find(type => type.id === attack);
    if (!source || !Array.isArray(defenses) || defenses.length < 1 || defenses.length > 2
      || new Set(defenses).size !== defenses.length) throw new Error('请选择有效且不重复的属性。');
    return defenses.reduce((value, defense) => {
      if (!Object.hasOwn(source.damage, defense)) throw new Error('找不到防御属性。');
      return value * source.damage[defense];
    }, 1);
  }
  function typeExperiment(attack, defenses, types) {
    const value = multiplier(attack, defenses, types);
    const factors = defenses.map(defense => multiplier(attack, [defense], types));
    const outcome = value === 0 ? 'immune' : value < 1 ? 'resist' : value === 1 ? 'neutral' : 'weak';
    return { attack, defenses: [...defenses], factors, value, outcome };
  }
  function defenseProfile(pokemon, types) {
    return types.map(type => ({ id: type.id, name: type.name, value: multiplier(type.id, pokemon.types, types) }));
  }
  function analyzeTeam(members, types) {
    const distribution = types.map(type => ({ id: type.id, name: type.name,
      count: members.filter(member => member.types.includes(type.id)).length })).filter(row => row.count);
    const defense = types.map(type => {
      const values = members.map(member => multiplier(type.id, member.types, types));
      return { id: type.id, name: type.name, weak: values.filter(value => value > 1).length,
        resist: values.filter(value => value < 1).length, immune: values.filter(value => value === 0).length };
    });
    const averages = Object.fromEntries(statKeys.map(key => [key, members.length
      ? Math.round(members.reduce((sum, member) => sum + member.stats[key], 0) / members.length) : 0]));
    return { distribution, defense, averages, budget: teamBudget(members) };
  }
  function starterChallenge(members, types) {
    const targetMembers = 6, maxElectricWeak = 2, memberCount = members.length;
    const budget = teamBudget(members);
    const electricWeakMembers = members.map(member => ({ id: member.id, name: member.name,
      value: multiplier('electric', member.types, types) })).filter(member => member.value > 1);
    const checks = {
      members: memberCount === targetMembers && new Set(members.map(member => member.id)).size === targetMembers,
      budget: memberCount > 0 && budget.valid,
      electric: memberCount > 0 && electricWeakMembers.length <= maxElectricWeak
    };
    return { targetMembers, maxElectricWeak, memberCount, budget, electricWeakMembers, checks,
      complete: Object.values(checks).every(Boolean) };
  }
  return { TEAM_BUDGET, statKeys, teamBudget, multiplier, typeExperiment, defenseProfile, analyzeTeam, starterChallenge };
})();
