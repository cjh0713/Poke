/* 页面层：资料与个人记录通过 PokeStore 访问；属性计算通过 PokeRules 完成。 */
(() => {
  const store = window.PokeStore, rules = window.PokeRules;
  const $ = selector => document.querySelector(selector);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const labels = { hp: 'HP', attack: '攻击', defense: '防御', 'special-attack': '特攻', 'special-defense': '特防', speed: '速度' };
  const colors = { normal: '#929ba5', fire: '#e58055', water: '#5c92d5', electric: '#dfb43c', grass: '#70a879', ice: '#70b5b9', fighting: '#bd7266', poison: '#a87bbb', ground: '#bf9765', flying: '#909dcc', psychic: '#d889a5', bug: '#8ea25a', rock: '#b2a079', ghost: '#8a80b0', dragon: '#737cb6', dark: '#807773', steel: '#859aab', fairy: '#d89ebb' };
  const emptyProfile = () => ({ favorites: [], teams: [], practices: [] });
  let catalog, challenges = [], user = null, profile = emptyProfile(), view = 'dex';
  let opponentChoice = null;
  let query = '', filterType = '', sort = 'number', compareIds = [], draft = [], teamMeta = { id: null, name: '', note: '' };
  let attack = 'fire', labTargetId = 1, labLaunched = false, toastTimer, quiz = null;
  const byId = id => catalog.pokemon.find(item => item.id === Number(id));
  const typeName = id => catalog.types.find(type => type.id === id)?.name || id;
  const number = id => `#${String(id).padStart(3, '0')}`;
  const typePill = id => `<span class="type-pill" style="--type-color:${colors[id]}">${escape(typeName(id))}</span>`;
  const artwork = (item, css = '', decorative = false) => `<img class="${css}" src="${escape(item.image)}" alt="${decorative ? '' : escape(item.name)}" width="475" height="475" loading="${css === 'hero-pikachu' ? 'eager' : 'lazy'}">`;
  const heroTitle = (eyebrow, title, text) => `<div class="page-title"><span class="eyebrow">${eyebrow}</span><h1>${title}</h1><p>${text}</p></div>`;
  const empty = (title, text, action = '') => `<div class="empty-state"><span class="empty-orbit" aria-hidden="true">✧</span><h3>${title}</h3><p>${text}</p>${action}</div>`;
  function toast(text) {
    clearTimeout(toastTimer); $('#toast').textContent = text; $('#toast').hidden = false;
    toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 3600);
  }
  async function action(button, task) {
    if (button?.disabled) return;
    if (button) button.disabled = true;
    try { await task(); } catch (error) { toast(error.message); }
    finally { if (button?.isConnected) button.disabled = false; }
  }
  async function refreshUser() {
    const previous = user;
    user = await store.getSession();
    if (previous && previous.id !== user?.id) { draft = []; teamMeta = { id: null, name: '', note: '' }; opponentChoice = null; }
    profile = user ? await store.getProfile() : emptyProfile();
  }
  function header() {
    document.querySelectorAll('.main-nav [data-view]').forEach(button => {
      const active = button.dataset.view === view;
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
    });
    $('#favorite-count').textContent = profile.favorites.length;
    $('#draft-count').textContent = draft.length;
    $('#account-button').innerHTML = user ? `<span class="account-dot">${escape(user.name.slice(0, 1))}</span>${escape(user.name)}` : '登录 / 注册 <span aria-hidden="true">↗</span>';
  }
  function card(item) {
    const favorite = profile.favorites.includes(item.id), compared = compareIds.includes(item.id), added = draft.includes(item.id);
    return `<article class="pokemon-card" style="--type-color:${colors[item.types[0]]}">
      <div class="card-top"><span class="number">${number(item.id)}</span><button class="favorite-button ${favorite ? 'selected' : ''}" data-action="favorite" data-id="${item.id}" aria-label="${favorite ? '取消收藏' : '收藏'}${escape(item.name)}" aria-pressed="${favorite}">${favorite ? '♥' : '♡'}</button></div>
      <button class="card-detail" data-action="detail" data-id="${item.id}" aria-label="查看${escape(item.name)}详情"><div class="art-circle">${artwork(item, 'card-art', true)}</div><h3>${escape(item.name)}</h3><p class="english-name">${escape(item.slug)}</p></button>
      <div class="card-types">${item.types.map(typePill).join('')}</div>
      <div class="card-meta"><span>配队成本</span><strong>${item.total} 点</strong><span class="micro-bar"><i style="width:${item.total / 750 * 100}%"></i></span></div>
      <div class="card-actions"><button data-action="compare" data-id="${item.id}" class="compare-button ${compared ? 'selected' : ''}" aria-pressed="${compared}">${compared ? '✓ 已选对比' : '⇄ 对比'}</button><button class="add-button ${added ? 'selected' : ''}" data-action="add" data-id="${item.id}" ${added ? 'disabled' : ''}>${added ? '✓ 在队伍中' : '＋ 加入队伍'}</button></div>
    </article>`;
  }
  function filtered(items) {
    const term = query.trim().toLowerCase().replace(/^#/, '');
    const result = items.filter(item => (!term || item.name.includes(term) || item.slug.includes(term)
      || String(item.id) === term || String(item.id).padStart(3, '0') === term) && (!filterType || item.types.includes(filterType)));
    return result.sort((a, b) => sort === 'total' ? b.total - a.total || a.id - b.id : sort === 'height' ? b.height - a.height || a.id - b.id : sort === 'weight' ? b.weight - a.weight || a.id - b.id : a.id - b.id);
  }
  function catalogSection(favorites = false) {
    return `<section class="catalog-section"><div class="section-heading"><div><span class="eyebrow">${favorites ? 'YOUR LITTLE COLLECTION' : 'MEET YOUR NEXT PARTNER'}</span><h2>${favorites ? '喜欢的，都放在这里。' : '从这里，认识你的伙伴。'}</h2></div><span id="result-count" class="result-count"></span></div>
      <div class="filter-row"><label class="search-field"><span aria-hidden="true">⌕</span><input id="search" type="search" value="${escape(query)}" placeholder="搜索名字 / 英文名 / 编号" aria-label="搜索宝可梦"></label><label class="select-field"><span>属性</span><select id="type-filter" aria-label="筛选属性"><option value="">全部属性</option>${catalog.types.map(type => `<option value="${type.id}" ${filterType === type.id ? 'selected' : ''}>${escape(type.name)}</option>`).join('')}</select></label><label class="select-field"><span>排序</span><select id="sort" aria-label="排序方式">${[['number', '图鉴编号'], ['total', '能力总和 ↓'], ['height', '身高 ↓'], ['weight', '体重 ↓']].map(([key, name]) => `<option value="${key}" ${sort === key ? 'selected' : ''}>${name}</option>`).join('')}</select></label></div>
      <div class="type-shortcuts" aria-label="快速属性筛选">${[['', '全部'], ...['grass', 'fire', 'water', 'electric', 'psychic', 'ghost', 'dragon'].map(key => [key, typeName(key)])].map(([key, label]) => `<button data-action="filter" data-type="${key}" class="filter-chip ${filterType === key ? 'active' : ''}" aria-pressed="${filterType === key}">${escape(label)}</button>`).join('')}<button data-action="reset-filters" class="text-button reset-filters">重置筛选</button></div>
      <div class="pokemon-grid" id="pokemon-grid"></div></section>`;
  }
  function updateGrid() {
    if (!$('#pokemon-grid')) return;
    const base = view === 'favorites' ? catalog.pokemon.filter(item => profile.favorites.includes(item.id)) : catalog.pokemon;
    const items = filtered(base);
    $('#result-count').textContent = `${items.length} / ${base.length} 只伙伴`;
    $('#pokemon-grid').innerHTML = items.length ? items.map(card).join('') : empty('还没有发现。', '试试其他名字或属性，或者重置筛选。');
    document.querySelectorAll('.filter-chip').forEach(button => {
      const active = button.dataset.type === filterType;
      button.classList.toggle('active', active); button.setAttribute('aria-pressed', active);
    });
  }
  function beginnerGuideHtml() {
    const terms = [
      ['HP · 体力', '影响能够承受多少伤害。'],
      ['攻击', '影响物理招式的伤害。'],
      ['防御', '影响承受物理招式伤害的能力。'],
      ['特攻', '影响特殊招式的伤害。'],
      ['特防', '影响承受特殊招式伤害的能力。'],
      ['速度', '影响通常情况下的出手顺序。']
    ];
    return `<details class="beginner-guide"><summary><span>第一次来？看懂这些再配队</span><small>新手说明 · 术语与步骤</small></summary><div class="beginner-content">
      <h3>从喜欢的角色开始，一次只观察一件事。</h3>
      <ol class="beginner-steps"><li><strong>认识伙伴</strong><span>在图鉴点开角色，看看属性与六项基础能力。</span></li><li><strong>试一试属性</strong><span>在属性实验室选择攻击属性与接招伙伴，发射后观察反应。</span></li><li><strong>完成首次配队</strong><span>在“我的队伍”选择六位伙伴，留意预算和共同弱点，尝试新手任务。</span></li></ol>
      <h3>六项能力，各自表示什么？</h3><dl class="stat-glossary">${terms.map(([term, description]) => `<div><dt>${term}</dt><dd>${description}</dd></div>`).join('')}</dl>
      <p><strong>基础值：</strong>这里展示角色设定中的基础能力，用来观察不同方向；具体能力还受等级等条件影响，能力总和不能直接代表胜负。</p>
      <p><strong>弱点、抵抗与无效：</strong>面对某种属性攻击，倍率大于 1 是弱点，小于 1 是抵抗，等于 0 表示无效。本页的抵抗人数包含无效成员；双属性的两个倍率相乘，例如冰对草／飞行是 2 × 2 = 4。</p>
      <p><strong>配队预算：</strong>每位伙伴的成本等于六项基础能力之和。${rules.TEAM_BUDGET} 点是发现室自定的挑战上限，让搭配有取舍。</p>
      <button class="text-button" data-view="team">去我的队伍试一试 ↗</button>
    </div></details>`;
  }
  function dex() {
    const pikachu = byId(25), bulbasaur = byId(1), eevee = byId(133);
    return `<section class="hero"><div class="hero-copy"><span class="eyebrow"><span class="live-dot"></span>151 个伙伴 · 无数种搭配</span><h1>从一眼喜欢，<br>到一支<span class="orange-text">默契的队伍。</span></h1><p>认识角色，读懂属性，试着搭配。<br>你的第一场发现，从这里开始。</p><div class="hero-buttons"><button class="button orange" data-action="explore">探索图鉴 <span>↓</span></button><button class="button outline" data-view="lab">试试属性实验 ↗</button></div><div class="hero-foot"><span class="tiny-pictures">${[1, 4, 7].map(id => artwork(byId(id), '', true)).join('')}</span><p><strong>001—151，熟悉的初代伙伴</strong><br>中文图鉴 / 公开资料 / 你的个人队伍</p></div></div>
      <div class="hero-art"><div class="art-orbit orbit-one"></div><div class="art-orbit orbit-two"></div><span class="hero-spark spark-one">✧</span><span class="hero-spark spark-two">✳</span><span class="hero-stamp">HELLO,<br>NEW FRIEND!</span><button class="hero-character" data-action="detail" data-id="25" aria-label="认识皮卡丘">${artwork(pikachu, 'hero-pikachu', true)}</button><button class="floating-card float-grass" data-action="detail" data-id="1">${artwork(bulbasaur, '', true)}<span><small>${number(1)} · 草 / 毒</small><strong>${escape(bulbasaur.name)}</strong></span><span class="float-arrow">↗</span></button><button class="floating-card float-eevee" data-action="detail" data-id="133">${artwork(eevee, '', true)}<span><small>${number(133)} · 一般</small><strong>${escape(eevee.name)}</strong></span><span class="float-arrow">↗</span></button><span class="hero-art-caption">每一种不同，都有自己的闪光点。</span></div></section>
      <div class="discovery-steps"><div><span class="step-icon green">⌕</span><p><strong>发现你的伙伴</strong><span>按名字与属性，找到一眼喜欢的角色</span></p><b>01</b></div><div><span class="step-icon blue">⇄</span><p><strong>读懂它们的不同</strong><span>比较基础能力，试验属性关系</span></p><b>02</b></div><div><span class="step-icon peach">✧</span><p><strong>组成自己的队伍</strong><span>六个位置，搭配属于你的可能</span></p><b>03</b></div></div>${beginnerGuideHtml()}${catalogSection()}`;
  }
  function favorites() {
    if (!user) return heroTitle('YOUR FAVORITES', '把喜欢，留在发现室。', '登录后保存自己的收藏。图鉴与属性实验可以直接体验。') + empty('为你的收藏取个名字。', '试用 leaf / poke123，或者创建一个本地账号。', '<button class="button orange" data-action="account">登录 / 注册 ↗</button>');
    return heroTitle('YOUR FAVORITES', `${escape(user.name)}的收藏夹`, `已收藏 ${profile.favorites.length} 只伙伴。收藏与队伍仅保存在当前浏览器。`) + (profile.favorites.length ? catalogSection(true) : empty('第一位伙伴，正在等你。', '点击图鉴卡片上的爱心，它就会来到这里。', '<button class="button orange" data-view="dex">去发现伙伴 ↗</button>'));
  }
  function statBars(item) {
    return rules.statKeys.map(key => `<div class="stat-row"><span>${labels[key]}</span><span class="stat-track"><i style="width:${item.stats[key] / 255 * 100}%;--type-color:${colors[item.types[0]]}"></i></span><strong>${item.stats[key]}</strong></div>`).join('');
  }
  function multiplierClass(value) { return value > 1 ? 'weak' : value < 1 ? 'resist' : 'neutral'; }
  function openDetail(id) {
    const item = byId(id); if (!item) return;
    $('#detail-content').dataset.id = item.id;
    const evolution = catalog.pokemon.filter(other => other.id === item.evolvesFrom || other.evolvesFrom === item.id);
    const special = rules.defenseProfile(item, catalog.types).filter(row => row.value !== 1);
    $('#detail-content').innerHTML = `<button class="close-button" data-close="detail-dialog" aria-label="关闭详情">×</button><div class="detail-layout"><div class="detail-visual" style="--type-color:${colors[item.types[0]]}"><span class="number">${number(item.id)}</span>${artwork(item, 'detail-art')}<span class="detail-genus">${escape(item.genus)}</span></div><div class="detail-info"><span class="eyebrow">NICE TO MEET YOU</span><h2>${escape(item.name)}</h2><p class="english-name">${escape(item.slug)}</p><div class="card-types">${item.types.map(typePill).join('')}</div><div class="physical-stats"><div><small>身高</small><strong>${item.height} <span>m</span></strong></div><div><small>体重</small><strong>${item.weight} <span>kg</span></strong></div><div><small>能力总和</small><strong>${item.total}</strong></div></div><h3>六项基础能力</h3>${statBars(item)}<p class="helper">基础值用于比较角色设定，不是具体等级的实战能力。</p><div class="detail-actions"><button class="button orange" data-action="add" data-id="${item.id}" ${draft.includes(item.id) ? 'disabled' : ''}>${draft.includes(item.id) ? '已在队伍中' : '＋ 加入队伍'}</button><button class="button outline" data-action="favorite" data-id="${item.id}">${profile.favorites.includes(item.id) ? '♥ 已收藏' : '♡ 收藏'}</button><button class="button outline" data-action="compare" data-id="${item.id}">${compareIds.includes(item.id) ? '✓ 已选对比' : '⇄ 对比'}</button></div></div></div><div class="detail-bottom"><h3>受到这些属性攻击时</h3><p class="helper">双属性倍率相乘，0 表示属性无效，未列出的属性为 ×1。</p><div class="matchup-list">${special.map(row => `<span class="matchup ${multiplierClass(row.value)}">${typePill(row.id)}<strong>×${row.value}</strong></span>`).join('')}</div>${evolution.length ? `<h3 class="evolution-title">相邻的进化伙伴</h3><div class="evolution-links">${evolution.map(other => `<button data-action="detail" data-id="${other.id}">${artwork(other, '', true)}<span>${number(other.id)} ${escape(other.name)}</span> ↗</button>`).join('')}</div>` : ''}<a class="source-link" href="https://pokeapi.co/api/v2/pokemon/${item.id}/" target="_blank" rel="noopener noreferrer">查看公开资料来源 ↗</a></div>`;
    if (!$('#detail-dialog').open) $('#detail-dialog').showModal();
  }
  function compareTray() {
    const tray = $('#compare-tray'); tray.hidden = !compareIds.length;
    tray.innerHTML = `<span class="tray-title">能力对比 <small>${compareIds.length}/3</small></span><div class="tray-members">${compareIds.map(id => `<button data-action="compare" data-id="${id}" aria-label="移除${escape(byId(id).name)}的对比">${artwork(byId(id), '', true)}<span>${escape(byId(id).name)}</span><b>×</b></button>`).join('')}</div><button class="button dark small" data-action="open-compare" ${compareIds.length < 2 ? 'disabled' : ''}>开始对比 ↗</button><button class="text-button" data-action="clear-compare">清空</button>`;
    document.body.classList.toggle('has-compare', compareIds.length > 0);
  }
  function openCompare() {
    if (compareIds.length < 2) return toast('至少选择两只伙伴进行对比。');
    const members = compareIds.map(byId);
    $('#compare-content').innerHTML = `<button class="close-button" data-close="compare-dialog" aria-label="关闭对比">×</button><div class="dialog-heading"><span class="eyebrow">SAME WORLD, DIFFERENT STRENGTHS</span><h2>看看它们，各自擅长什么。</h2><p>基础能力横向比较；条形长度使用同一标尺。</p></div><div class="comparison-grid" style="--columns:${members.length}">${members.map(item => `<section class="comparison-column"><div class="comparison-art" style="--type-color:${colors[item.types[0]]}">${artwork(item, '', true)}</div><span class="number">${number(item.id)}</span><h3>${escape(item.name)}</h3><div class="card-types">${item.types.map(typePill).join('')}</div><p class="compare-physical">${item.height} m · ${item.weight} kg</p>${statBars(item)}<div class="compare-total">能力总和 <strong>${item.total}</strong></div></section>`).join('')}</div><p class="helper comparison-note">不同能力各有作用，能力总和不能直接代表战斗胜率。</p>`;
    if (!$('#compare-dialog').open) $('#compare-dialog').showModal();
  }
  function analysisHtml() {
    const members = draft.map(byId), analysis = rules.analyzeTeam(members, catalog.types);
    const threats = [...analysis.defense].filter(row => row.weak).sort((a, b) => b.weak - a.weak);
    return `<div class="analysis-grid"><section class="panel"><span class="eyebrow">TYPE MIX</span><h3>成员属性分布</h3><p class="helper">双属性成员在两种属性中分别计数。</p><div class="type-distribution">${analysis.distribution.map(row => `<div>${typePill(row.id)}<span class="distribution-bar"><i style="width:${row.count / 6 * 100}%;background:${colors[row.id]}"></i></span><strong>${row.count}</strong></div>`).join('') || '<p class="helper">加入伙伴后展示属性分布。</p>'}</div></section><section class="panel"><span class="eyebrow">DEFENSE CHECK</span><h3>一起看看，共同弱点。</h3><p class="helper">“弱点”表示受到该属性攻击时倍率大于 1。</p><div class="threat-list">${threats.slice(0, 6).map(row => `<div>${typePill(row.id)}<span><strong>${row.weak}</strong> 位较弱</span><small>${row.resist} 位抵抗${row.immune ? ` · ${row.immune} 位无效` : ''}</small></div>`).join('') || '<p class="helper">加入伙伴后，检查哪些属性会影响多人。</p>'}</div><p class="helper analysis-note">只分析属性与基础值；未计入招式、特性、等级或战斗策略。</p></section></div>`;
  }
  function budgetHtml(members) {
    const budget = rules.teamBudget(members);
    return `<div class="team-budget ${budget.valid ? '' : 'over-budget'}" aria-label="配队预算">
      <div class="budget-heading"><div><span class="eyebrow">A LITTLE LIMIT, MORE POSSIBILITIES</span><h3>配队预算 <strong>${budget.used}<small> / ${budget.limit} 点</small></strong></h3></div>
      <span class="budget-balance">${budget.valid ? `剩余 <strong>${budget.remaining}</strong> 点` : `超出 <strong>${budget.over}</strong> 点`}</span></div>
      <div class="budget-track" role="progressbar" aria-label="已使用配队预算" aria-valuemin="0" aria-valuemax="${budget.limit}" aria-valuenow="${Math.min(budget.used, budget.limit)}" aria-valuetext="已用 ${budget.used} 点，上限 ${budget.limit} 点"><i style="width:${Math.min(budget.used / budget.limit * 100, 100)}%"></i></div>
      <p class="helper">每位伙伴的成本 = 六项基础能力之和。3000 点是本项目自定的搭配规则。</p>
      ${!budget.valid ? '<p class="budget-warning" role="alert">这支旧队伍超过新预算，记录仍然保留。移除或替换成员后即可保存修改。</p>' : ''}
    </div>`;
  }
  function rosterHtml(ids) {
    return `<div class="saved-members">${ids.map(id => `<span title="${escape(byId(id).name)} · ${byId(id).total} 点">${artwork(byId(id), '', false)}</span>`).join('')}</div>`;
  }
  function savedTeamsHtml() {
    const heading = `<div class="section-heading"><div><span class="eyebrow">YOUR TEAM NOTEBOOK</span><h2>我保存的队伍</h2></div><span class="result-count">${profile.teams.length} / 8 支</span></div>`;
    if (!user) return `<section class="saved-teams">${heading}${empty('给你的队伍一个家。', '登录后，保存搭配与笔记。', '<button class="button orange" data-action="account">登录 / 注册 ↗</button>')}</section>`;
    if (!profile.teams.length) return `<section class="saved-teams">${heading}${empty('第一支队伍，从这里出发。', '先从图鉴加入伙伴，再给队伍起一个名字。')}</section>`;
    return `<section class="saved-teams">${heading}<div class="saved-team-grid">${profile.teams.map(saved => {
      const budget = rules.teamBudget(saved.members.map(byId));
      return `<article class="saved-team-card"><div><h3>${escape(saved.name)}</h3><span class="helper">${new Date(saved.updatedAt).toLocaleDateString('zh-CN')}</span></div>
        <div class="roster-meta"><span>我的记录 · ${saved.members.length}/6 位</span><strong class="${budget.valid ? '' : 'danger-text'}">${budget.used} / ${budget.limit} 点${budget.valid ? '' : ' · 超预算'}</strong></div>
        ${rosterHtml(saved.members)}<p>${escape(saved.note || '还没有搭配笔记。')}</p><div class="roster-actions"><button class="text-button" data-action="load-team" data-id="${escape(saved.id)}">继续编辑 ↗</button><button class="text-button" data-action="compare-team" data-kind="saved" data-id="${escape(saved.id)}" ${draft.length ? '' : 'disabled'}>与当前搭配对比 ⇄</button><button class="text-button danger-text" data-action="delete-team" data-id="${escape(saved.id)}">删除</button></div></article>`;
    }).join('')}</div></section>`;
  }
  function challengesHtml() {
    return `<section class="challenge-section"><div class="section-heading"><div><span class="eyebrow">AUTHOR-CREATED CHALLENGES</span><h2>预设挑战队伍</h2></div><span class="reference-badge">作者设计 · 静态参考</span></div>
      <p class="section-intro">${draft.length ? '挑一支队伍，与正在编辑的搭配比较；也可以用它作为起点，尝试自己的调整。' : '先从图鉴加入伙伴，再与参考队伍对比；也可以用下方组合开始搭配。'}这些组合由作者依据公开角色资料设计。</p>
      <div class="saved-team-grid">${challenges.map(preset => {
        const budget = rules.teamBudget(preset.members.map(byId));
        return `<article class="saved-team-card challenge-card"><div><h3>${escape(preset.name)}</h3><span class="reference-badge">作者预设</span></div><div class="roster-meta"><span>${escape(preset.tagline)}</span><strong>${budget.used} / ${budget.limit} 点</strong></div>
          ${rosterHtml(preset.members)}<p>${escape(preset.note)}</p><div class="roster-actions"><button class="button outline small" data-action="compare-team" data-kind="preset" data-id="${escape(preset.id)}" ${draft.length ? '' : 'disabled'}>与当前搭配对比 ⇄</button><button class="text-button" data-action="use-challenge" data-id="${escape(preset.id)}">用这支队伍开始 ↗</button></div></article>`;
      }).join('')}</div></section>`;
  }
  function comparisonTeamHtml(name, source, members, analysis, side) {
    return `<article class="duel-team ${side}"><div class="duel-team-heading"><span class="eyebrow">${source}</span><h3>${escape(name)}</h3></div>
      <div class="duel-numbers"><div><small>成员</small><strong>${members.length}<span> / 6 位</span></strong></div><div><small>配队成本</small><strong>${analysis.budget.used}<span> 点</span></strong></div><div><small>${analysis.budget.valid ? '剩余预算' : '超出预算'}</small><strong>${analysis.budget.valid ? analysis.budget.remaining : analysis.budget.over}<span> 点</span></strong></div></div>
      ${rosterHtml(members.map(item => item.id))}<h4>平均基础能力</h4>
      ${rules.statKeys.map(key => `<div class="stat-row"><span>${labels[key]}</span><span class="stat-track"><i style="width:${analysis.averages[key] / 255 * 100}%;--type-color:${side === 'current' ? colors.water : colors.fire}"></i></span><strong>${analysis.averages[key]}</strong></div>`).join('')}
      <h4>成员属性分布</h4><div class="duel-type-tags">${analysis.distribution.map(row => `<span>${typePill(row.id)}<b>×${row.count}</b></span>`).join('')}</div></article>`;
  }
  function teamComparisonHtml() {
    const target = opponentChoice && (opponentChoice.kind === 'preset' ? challenges : profile.teams).find(item => item.id === opponentChoice.id);
    const options = (items, kind) => items.map(item => `<option value="${kind}:${escape(item.id)}" ${target && opponentChoice.kind === kind && target.id === item.id ? 'selected' : ''}>${escape(item.name)}</option>`).join('');
    const heading = `<div class="section-heading"><div><span class="eyebrow">COMPARE IDEAS, FIND YOUR BALANCE</span><h2>队伍对比</h2></div><label class="opponent-select">参考队伍<select id="team-opponent" aria-label="选择对比队伍"><option value="">选择一支参考队伍</option><optgroup label="作者预设">${options(challenges, 'preset')}</optgroup>${profile.teams.length ? `<optgroup label="我保存的队伍">${options(profile.teams, 'saved')}</optgroup>` : ''}</select></label></div>`;
    if (!target || !draft.length) return `<section id="team-comparison" class="team-comparison" tabindex="-1">${heading}${empty(draft.length ? '看看另一种搭配思路。' : '先让一位伙伴加入队伍。', draft.length ? '从预设挑战队伍或你的保存记录中，选择一支来比较。' : '添加成员后，就能对比预算、平均能力和属性关系。')}</section>`;
    const members = draft.map(byId), opponents = target.members.map(byId);
    const left = rules.analyzeTeam(members, catalog.types), right = rules.analyzeTeam(opponents, catalog.types);
    return `<section id="team-comparison" class="team-comparison" tabindex="-1">${heading}
      <p class="comparison-explainer">对比对象是${opponentChoice.kind === 'preset' ? '作者设计的静态参考组合' : '当前账号保存的队伍'}。${members.length !== opponents.length ? '双方成员数量不同，请结合人数和平均值阅读。' : ''}成本与基础值帮助理解取舍，属性分析未计入招式、特性或等级。</p>
      <div class="team-duel-grid">${comparisonTeamHtml(teamMeta.name || '当前搭配', 'YOUR CURRENT TEAM · 正在编辑', members, left, 'current')}${comparisonTeamHtml(target.name, opponentChoice.kind === 'preset' ? 'AUTHOR PRESET · 作者预设' : 'YOUR SAVED TEAM · 我的记录', opponents, right, 'reference')}</div>
      <details class="defense-comparison"><summary>查看 18 类属性的弱点与抵抗人数 <span>展开对照 ↓</span></summary><p class="helper">弱点：受到该属性攻击时倍率大于 1；抵抗：倍率小于 1，包含属性无效。每格为“弱点人数 / 抵抗人数”。</p><div class="table-wrap"><table><thead><tr><th>受到的攻击属性</th><th>当前搭配 · ${members.length} 位</th><th>${escape(target.name)} · ${opponents.length} 位</th></tr></thead><tbody>${left.defense.map((row, index) => `<tr><td>${typePill(row.id)}</td><td><strong class="weak-count">${row.weak}</strong> / <span class="resist-count">${row.resist}</span></td><td><strong class="weak-count">${right.defense[index].weak}</strong> / <span class="resist-count">${right.defense[index].resist}</span></td></tr>`).join('')}</tbody></table></div></details></section>`;
  }
  function starterChallengeHtml(members) {
    const result = rules.starterChallenge(members, catalog.types);
    const completed = Object.values(result.checks).filter(Boolean).length;
    const criteria = [
      ['members', '六个位置都有伙伴', `${result.memberCount} / ${result.targetMembers} 位`],
      ['budget', '成本在预算以内', `${result.budget.used} / ${result.budget.limit} 点`],
      ['electric', '电系弱点不集中', `${result.electricWeakMembers.length} 位 · 上限 ${result.maxElectricWeak} 位`]
    ];
    const weakNames = result.electricWeakMembers.map(member => `${escape(member.name)} ×${member.value}`).join('、');
    return `<section class="starter-challenge ${result.complete ? 'is-complete' : ''}" aria-labelledby="starter-title">
      <div class="starter-heading"><div><span class="eyebrow">YOUR FIRST TEAM CHALLENGE</span><h2 id="starter-title">初次配队 · 留意电系弱点</h2></div><span class="challenge-status">${result.complete ? '✓ 任务达成' : members.length ? `达成 ${completed} / 3 项` : '等待开始'}</span></div>
      <p class="starter-intro">选 ${result.targetMembers} 位伙伴，总成本不超过 ${result.budget.limit} 点，让电系弱点成员不多于 ${result.maxElectricWeak} 位。</p>
      <ul class="starter-checks">${criteria.map(([key, title, value]) => `<li class="${result.checks[key] ? 'is-met' : ''}"><span class="check-icon" aria-hidden="true">${result.checks[key] ? '✓' : '○'}</span><div><strong>${title}</strong><span>${value}</span><small>${members.length ? result.checks[key] ? '已满足' : '待调整' : '等待添加伙伴'}</small></div></li>`).join('')}</ul>
      <div class="starter-feedback">${members.length ? `<p><strong>${result.complete ? '做到了！' : '观察一下：'}</strong>${result.complete ? '你已经兼顾了人数、成本与电系弱点。想一想，是哪些成员的属性帮助了你？' : !result.checks.members ? `再找 ${Math.max(0, result.targetMembers - result.memberCount)} 位伙伴，继续观察预算和弱点人数。` : !result.checks.budget ? '当前成本超过预算，先移除或替换一位伙伴。' : '电系弱点集中，试着检查一位成员的属性，再考虑替换。'}</p><p>当前电系弱点成员：${weakNames || '无'}。倍率大于 1 才计为弱点，属性无效不计入。</p>` : '<p>从喜欢的伙伴开始，也可以载入下方的预设队伍，再尝试自己的调整。</p>'}</div>
      <div class="starter-actions"><button class="text-button" data-view="dex">去图鉴挑选伙伴 ↗</button><button class="text-button" data-view="lab">去属性实验室验证 ↗</button><span class="helper">按当前搭配实时检查，完成后可登录保存队伍。</span></div>
    </section>`;
  }
  function team() {
    const members = draft.map(byId), budget = rules.teamBudget(members);
    return heroTitle('A BUDGET, A TEAM, YOUR OWN CHOICES', '3000 点，搭出你的选择。', '在有限预算里安排六个位置，再和参考队伍比较，发现不同组合的取舍。') + beginnerGuideHtml() + starterChallengeHtml(members) + `<section class="team-builder"><div class="section-heading"><h2>正在搭配 <span class="muted">${draft.length}/6</span></h2><button class="text-button" data-action="new-team">新建 / 清空编辑</button></div>${budgetHtml(members)}<div class="team-slots">${Array.from({ length: 6 }, (_, index) => {
      const item = byId(draft[index]);
      return item ? `<div class="team-slot filled" style="--type-color:${colors[item.types[0]]}"><button class="slot-remove" data-action="remove-member" data-id="${item.id}" aria-label="移除${escape(item.name)}">×</button><button class="slot-detail" data-action="detail" data-id="${item.id}">${artwork(item, '', true)}<strong>${escape(item.name)}</strong><span>${item.types.map(typePill).join('')}</span><small class="slot-cost">${item.total} 点</small></button></div>` : `<button class="team-slot empty-slot" data-view="dex"><small>0${index + 1}</small><span>＋</span><strong>发现下一位伙伴</strong></button>`;
    }).join('')}</div><form id="team-form" class="team-form"><label>队伍名称<input name="name" value="${escape(teamMeta.name)}" maxlength="30" placeholder="例如：我的第一支队伍" required></label><label class="team-note">搭配笔记<input name="note" value="${escape(teamMeta.note)}" maxlength="200" placeholder="为什么选择这几位伙伴？（选填）"></label><button class="button orange" type="submit" ${members.length && budget.valid ? '' : 'disabled'}>${teamMeta.id ? '保存修改' : '保存队伍'} ↗</button></form>${user ? '<p class="helper">最多保存 8 支队伍；每支 1—6 位成员，总成本不超过 3000 点。</p>' : '<p class="helper">预算搭配与对比可以直接体验，登录后可保存队伍。未保存的搭配在刷新后清空。</p>'}</section>${analysisHtml()}${savedTeamsHtml()}${challengesHtml()}${teamComparisonHtml()}`;
  }
  function typeOptions(selected, optional = false) { return `${optional ? '<option value="">无第二属性</option>' : ''}${catalog.types.map(type => `<option value="${type.id}" ${selected === type.id ? 'selected' : ''}>${escape(type.name)}</option>`).join('')}`; }
  function labResult() {
    if (!labLaunched) return '<div class="lab-ready"><strong>准备好，碰一下！</strong><p>选好属性与伙伴，就可以发射了。</p></div>';
    const target = byId(labTargetId), result = rules.typeExperiment(attack, target.types, catalog.types);
    const reactions = { weak: ['发现弱点！', result.value === 4 ? '哇，两种属性都怕这个！' : '哎呀，被发现弱点了！'], resist: ['轻松接住～', '这个我还挺擅长！'], neutral: ['稳稳接下这一次。', '打个招呼，刚刚好。'], immune: ['咦，刚才发生了什么？', '嘿嘿，这个对我无效～'] };
    const [title, speech] = reactions[result.outcome];
    return `<div class="lab-outcome ${result.outcome}"><strong>×${result.value}</strong><div><h3>${title}</h3><p>${escape(target.name)}：${speech}</p></div></div>`;
  }
  function labArenaHtml() {
    const target = byId(labTargetId), result = rules.typeExperiment(attack, target.types, catalog.types);
    return `<div class="lab-arena" id="lab-arena" data-attack="${attack}" data-outcome="${labLaunched ? result.outcome : 'ready'}" style="--element-color:${colors[attack]};--target-color:${colors[target.types[0]]}">
      <span class="lab-arena-label">小小碰撞 · 自由实验</span><div class="lab-stage">
      <div class="lab-source"><div class="lab-buddy" aria-hidden="true"><i class="buddy-eye left"></i><i class="buddy-eye right"></i><i class="buddy-mouth"></i><i class="buddy-cheek left"></i><i class="buddy-cheek right"></i></div><strong>${escape(typeName(attack))}属性小精灵</strong></div>
      <div class="lab-projectile" aria-hidden="true"></div><div class="lab-target"><span class="lab-speech" aria-hidden="true">${result.outcome === 'immune' ? '没事没事～' : result.outcome === 'resist' ? '接住啦！' : result.outcome === 'weak' ? '哎呀！' : '你好呀～'}</span><span class="lab-target-shadow" aria-hidden="true"></span><img class="lab-target-art" src="${escape(target.image)}" alt="${escape(target.name)}" width="475" height="475" decoding="async"><div class="lab-shield" aria-hidden="true"></div><div class="lab-sparks" aria-hidden="true">${Array.from({ length: 6 }, (_, index) => `<i style="--spark-angle:${index * 60}deg"></i>`).join('')}</div><strong>${escape(target.name)}</strong><div class="lab-target-types">${target.types.map(typePill).join('')}</div></div></div></div>`;
  }
  function labCalculationHtml() {
    if (!labLaunched) return '';
    const target = byId(labTargetId), result = rules.typeExperiment(attack, target.types, catalog.types);
    return `<details class="lab-calculation"><summary>看看这次的计算</summary><p>${result.defenses.map((type, index) => `${escape(typeName(attack))} → ${escape(typeName(type))}：×${result.factors[index]}`).join('；')}</p><p><strong>${result.factors.join(' × ')} = ${result.value}</strong></p><p>每次使用一种攻击属性，目标的单／双属性由图鉴资料自动读取。这里只展示属性倍率，不计算伤害点数。</p></details>`;
  }
  function updateLab() {
    if (!$('#lab-arena-mount')) return;
    window.PokeLabEffects.stop();
    $('#attack-type').value = attack; $('#lab-target').value = labTargetId;
    $('#lab-arena-mount').innerHTML = labArenaHtml();
    $('#lab-result').innerHTML = labResult();
    $('#lab-calculation').innerHTML = labCalculationHtml();
    $('#lab-fire').textContent = labLaunched ? '再发射一次 ✦' : '发射一次 ✦';
  }
  async function launchLab() {
    labLaunched = true; updateLab();
    await window.PokeLabEffects.play($('#lab-arena'));
  }
  function quizHtml() {
    if (!quiz) return `<div class="practice-start"><span class="practice-icon">✧</span><h3>五道题，试试你的属性直觉。</h3><p>每题选一个倍率，答完立即解释。${user ? '完成后保存到你的账号。' : '访客也能练习；登录后可保存成绩。'}</p><button class="button dark" data-action="start-quiz">开始属性练习 ↗</button></div>`;
    if (quiz.index === 5) return `<div class="practice-start"><span class="practice-icon">✧</span><h3>发现完成：${quiz.score} / 5</h3><p>${quiz.saved ? '本次成绩已保存到当前账号。' : '访客成绩不会保存。'}</p><button class="button dark" data-action="start-quiz">再来五道题 ↗</button></div>`;
    const question = quiz.questions[quiz.index];
    return `<div class="quiz-heading"><span class="eyebrow">QUESTION 0${quiz.index + 1} / 05</span><span>${quiz.score} 题正确</span></div><h3 class="quiz-question">${typePill(question.attack)}攻击 ${typePill(question.defense)}，属性倍率是多少？</h3><div class="quiz-answers">${[0, 0.5, 1, 2].map(value => `<button data-action="quiz-answer" data-value="${value}" ${quiz.answered ? 'disabled' : ''} class="${quiz.answered && value === question.answer ? 'correct' : quiz.answered && value === quiz.choice ? 'incorrect' : ''}">×${value}</button>`).join('')}</div>${quiz.answered ? `<div class="quiz-feedback">${quiz.choice === question.answer ? '✓ 判断正确！' : `这次正确倍率是 ×${question.answer}。`} ${escape(typeName(question.attack))}攻击${escape(typeName(question.defense))}的倍率来自属性关系表。<button class="button dark small" data-action="quiz-next">${quiz.index === 4 ? '查看结果' : '下一题'} →</button></div>` : '<p class="helper">选一个倍率，答完会显示结果。</p>'}`;
  }
  function lab() {
    return heroTitle('A LITTLE COLLISION, A NEW DISCOVERY', '小精灵，来碰一下！', '发射一种属性，让伙伴给你一点不一样的回应。') + `<div class="lab-grid collision-lab"><section class="panel lab-controls"><span class="eyebrow">PICK YOUR LITTLE ENCOUNTER</span><h2>安排这次碰面</h2><label>发射的属性<select id="attack-type">${typeOptions(attack)}</select></label><label>接招的伙伴<select id="lab-target">${catalog.pokemon.map(item => `<option value="${item.id}" ${item.id === labTargetId ? 'selected' : ''}>${number(item.id)} ${escape(item.name)}</option>`).join('')}</select></label><div class="lab-inspirations"><span class="helper">或者，一键试试这些组合</span><div class="example-buttons"><button data-action="example" data-example="fire">小火花 → 妙蛙种子</button><button data-action="example" data-example="water">小水泡 → 杰尼龟</button><button data-action="example" data-example="electric">电火花 → 穿山鼠</button><button data-action="example" data-example="ice">小冰晶 → 快龙</button></div></div></section><section class="panel lab-playground" aria-label="属性碰撞实验"><div id="lab-arena-mount">${labArenaHtml()}</div><div class="lab-launch-row"><button id="lab-fire" class="button orange" data-action="lab-fire">${labLaunched ? '再发射一次 ✦' : '发射一次 ✦'}</button></div><div class="collision-result" id="lab-result" role="status" aria-live="polite" aria-atomic="true">${labResult()}</div><div id="lab-calculation">${labCalculationHtml()}</div></section></div><section class="panel practice-panel"><div id="quiz-content">${quizHtml()}</div></section>${user && profile.practices.length ? `<section class="practice-history"><h3>我的最近练习</h3><div>${profile.practices.slice(0, 5).map(item => `<span>${new Date(item.time).toLocaleString('zh-CN')} <strong>${item.score}/5</strong></span>`).join('')}</div></section>` : ''}`;
  }
  function about() {
    return heroTitle('OPEN DATA, HONEST DISCOVERY', '每一个发现，都有来处。', '这是一个公开资料驱动的前端课程项目。你可以查阅来源，也可以备份自己的探索记录。') + `<div class="about-grid"><section class="panel"><h2>这份图鉴的范围</h2><p>收录全国图鉴 001—151 的默认形态，包含中文名称、图片、身高体重、六项基础能力和常规属性关系。个人收藏、队伍和练习成绩都由你的实际操作产生。</p><div class="source-facts"><span><strong>151</strong>只宝可梦</span><span><strong>18</strong>种常规属性</span><span><strong>6</strong>项基础能力</span></div><p>“初代”表示收录范围。属性与数值采用数据快照中的现行规则，例如妖精属性也会出现在部分初代角色中。</p><p>资料整理日期：${new Date(catalog.meta.retrievedAt).toLocaleDateString('zh-CN')}。完整来源与校验记录保存在 source-manifest.json。</p><a class="source-link" href="assets/data/source-manifest.json" target="_blank" rel="noopener noreferrer">查看本地来源清单 ↗</a></section><section class="panel"><h2>理解这些数值</h2><p>身高从分米换算成米，体重从百克换算成千克。能力条显示基础值，同一标尺便于比较。</p><p>双属性防御倍率 = 攻击属性对第一属性的倍率 × 对第二属性的倍率。零倍率仍然是零。</p><p>队伍分析展示防御弱点与抵抗人数，抵抗统计包括属性无效的成员。它没有计入等级、招式、特性和其他战斗条件。</p><div class="source-links"><a href="https://pokeapi.co/docs/v2" target="_blank" rel="noopener noreferrer">PokéAPI 字段说明 ↗</a><a href="https://github.com/PokeAPI/pokeapi/tree/master/data/v2/csv" target="_blank" rel="noopener noreferrer">结构化资料仓库 ↗</a><a href="https://github.com/PokeAPI/sprites" target="_blank" rel="noopener noreferrer">图片资料仓库 ↗</a></div></section><section class="panel backup-panel"><h2>把你的发现，带在身边。</h2><p>个人记录保存在当前浏览器和地址下。JSON 备份包含收藏、队伍与练习记录，不包含账号密码。</p><div class="backup-actions"><button class="button dark" data-action="export">导出个人备份 ↓</button><label class="button outline file-button">导入个人备份 ↑<input id="import-file" type="file" accept=".json,application/json" aria-label="导入个人备份"></label></div><p class="helper">导入前会确认，导入内容将替换当前账号的个人记录。</p></section><section class="panel"><h2>关于这个发现室</h2><p>使用 HTML、CSS 和原生 JavaScript。图鉴可以直接浏览；登录后，不同本地账号拥有各自的个人记录。演示账号为 leaf / blue，密码 poke123。</p><p>这是课程学习作品，与 Pokémon 官方无关联。图片、角色及相关权利归各自权利人，公开资料来自 PokéAPI 社区。</p><p>AI 辅助生成初版；学习是否完成，需要通过本人阅读、独立修改和解释代码来体现。</p></section></div>`;
  }
  function render() {
    window.PokeLabEffects.stop();
    header();
    $('#main').innerHTML = view === 'dex' ? dex() : view === 'favorites' ? favorites() : view === 'team' ? team() : view === 'lab' ? lab() : about();
    updateGrid(); compareTray();
  }
  function openAccount(mode = 'login') {
    const isRegister = mode === 'register';
    $('#account-content').innerHTML = `<button class="close-button" data-close="account-dialog" aria-label="关闭账号窗口">×</button><div class="account-heading"><span class="brand-symbol" aria-hidden="true"><i></i></span><span class="eyebrow">YOUR OWN DISCOVERY ROOM</span><h2>${user ? `你好，${escape(user.name)}。` : isRegister ? '创建你的发现室。' : '欢迎，新的发现者。'}</h2><p>${user ? '收藏、队伍和练习记录保存在这个本地账号中。' : '登录后，把喜欢的伙伴和队伍留在这里。'}</p></div>${user ? `<div class="account-summary"><span>${profile.favorites.length} 个收藏</span><span>${profile.teams.length} 支队伍</span><span>${profile.practices.length} 次练习</span></div><button class="button dark full" data-action="logout">退出登录 / 切换账号</button>` : `<div class="account-tabs"><button data-action="account-mode" data-mode="login" class="${isRegister ? '' : 'active'}">登录</button><button data-action="account-mode" data-mode="register" class="${isRegister ? 'active' : ''}">本地注册</button></div><form id="account-form" data-mode="${mode}">${isRegister ? '<label>昵称<input name="name" maxlength="16" required placeholder="怎么称呼你？" autocomplete="nickname"></label>' : ''}<label>账号<input name="username" maxlength="20" required autocomplete="username" ${isRegister ? 'placeholder="3—20 位，字母开头"' : 'value="leaf"'}></label><label>演示密码<input name="password" type="password" minlength="6" maxlength="40" required autocomplete="${isRegister ? 'new-password' : 'current-password'}" ${isRegister ? 'placeholder="请勿使用真实常用密码"' : 'value="poke123"'}></label><p id="account-error" class="form-error" role="alert"></p><button class="button orange full" type="submit">${isRegister ? '创建并进入' : '进入发现室'} ↗</button></form><p class="helper account-hint">演示账号 leaf / blue，密码 poke123。<br>账号只存在于当前浏览器，用于课程演示。</p>`}`;
    if (!$('#account-dialog').open) $('#account-dialog').showModal();
  }
  function needLogin() { if (user) return false; openAccount(); return true; }
  function updateDetail() { if ($('#detail-dialog').open) openDetail(Number($('#detail-content').dataset.id)); }
  function go(next) {
    view = next; query = ''; filterType = ''; sort = 'number';
    render(); window.scrollTo({ top: 0, behavior: 'instant' }); $('#main').focus({ preventScroll: true });
  }
  document.addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button) return;
    if (button.dataset.close) { $(`#${button.dataset.close}`).close(); return; }
    if (button.dataset.view) { go(button.dataset.view); return; }
    const id = Number(button.dataset.id), operation = button.dataset.action;
    action(button, async () => {
      if (operation === 'account') return openAccount();
      if (operation === 'account-mode') return openAccount(button.dataset.mode);
      if (operation === 'logout') { await store.logout(); await refreshUser(); quiz = null; $('#account-dialog').close(); render(); return toast('已退出。可以切换账号继续探索。'); }
      if (operation === 'detail') return openDetail(id);
      if (operation === 'explore') return $('.catalog-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (operation === 'filter') { filterType = button.dataset.type; $('#type-filter').value = filterType; return updateGrid(); }
      if (operation === 'reset-filters') { query = ''; filterType = ''; sort = 'number'; $('#search').value = ''; $('#type-filter').value = ''; $('#sort').value = 'number'; return updateGrid(); }
      if (operation === 'favorite') { if (needLogin()) return; profile = await store.toggleFavorite(id); render(); updateDetail(); return; }
      if (operation === 'compare') {
        if (compareIds.includes(id)) compareIds = compareIds.filter(value => value !== id);
        else { if (compareIds.length === 3) return toast('最多比较三只伙伴，请先移除一只。'); compareIds.push(id); }
        updateGrid(); compareTray(); updateDetail(); if ($('#compare-dialog').open && compareIds.length >= 2) openCompare(); return;
      }
      if (operation === 'clear-compare') { compareIds = []; updateGrid(); compareTray(); return; }
      if (operation === 'open-compare') return openCompare();
      if (operation === 'add') {
        if (draft.includes(id)) return toast('这位伙伴已经在队伍里了。');
        if (draft.length === 6) return toast('六个位置已经满了，去队伍页调整一下。');
        const budget = rules.teamBudget([...draft.map(byId), byId(id)]);
        if (!budget.valid) return toast(`加入${byId(id).name}需要 ${byId(id).total} 点，将超出预算 ${budget.over} 点。去队伍页调整成员吧。`);
        draft.push(id); render(); updateDetail(); return toast(`${byId(id).name}加入队伍 · ${draft.length}/6`);
      }
      if (operation === 'remove-member') { draft = draft.filter(value => value !== id); return render(); }
      if (operation === 'new-team') { draft = []; teamMeta = { id: null, name: '', note: '' }; return render(); }
      if (operation === 'load-team') {
        const saved = profile.teams.find(item => item.id === button.dataset.id);
        if (!saved) return;
        draft = [...saved.members]; teamMeta = { id: saved.id, name: saved.name, note: saved.note }; render(); $('.team-builder').scrollIntoView({ behavior: 'smooth' }); return;
      }
      if (operation === 'compare-team') {
        if (!draft.length) return toast('先从图鉴加入伙伴，再选择参考队伍。');
        opponentChoice = { kind: button.dataset.kind, id: button.dataset.id };
        render(); $('#team-comparison').scrollIntoView({ behavior: 'smooth', block: 'start' }); $('#team-comparison').focus({ preventScroll: true }); return;
      }
      if (operation === 'use-challenge') {
        const preset = challenges.find(item => item.id === button.dataset.id);
        if (!preset) return;
        if ((draft.length || teamMeta.name) && !window.confirm('用参考队伍替换当前未保存的搭配？已经保存的队伍会保留。')) return;
        draft = [...preset.members]; teamMeta = { id: null, name: `${preset.name} · 我的调整`, note: `以作者预设“${preset.name}”为起点，尝试自己的调整。` };
        render(); $('.team-builder').scrollIntoView({ behavior: 'smooth', block: 'start' }); return toast('已载入参考组合，移除或替换成员，试试自己的方案。');
      }
      if (operation === 'delete-team') {
        const saved = profile.teams.find(item => item.id === button.dataset.id);
        if (!saved || !window.confirm(`删除“${saved.name}”？`)) return;
        await store.deleteTeam(saved.id);
        if (opponentChoice?.kind === 'saved' && opponentChoice.id === saved.id) opponentChoice = null;
        if (teamMeta.id === saved.id) teamMeta = { id: null, name: teamMeta.name, note: teamMeta.note };
        profile = await store.getProfile(); render(); return toast('这支保存的队伍已删除。');
      }
      if (operation === 'example') {
        const examples = { fire: ['fire', 1], water: ['water', 7], electric: ['electric', 27], ice: ['ice', 149] };
        [attack, labTargetId] = examples[button.dataset.example];
        return launchLab();
      }
      if (operation === 'lab-fire') return launchLab();
      if (operation === 'start-quiz') {
        const questions = Array.from({ length: 5 }, () => {
          const a = catalog.types[Math.floor(Math.random() * catalog.types.length)].id;
          const d = catalog.types[Math.floor(Math.random() * catalog.types.length)].id;
          return { attack: a, defense: d, answer: rules.multiplier(a, [d], catalog.types) };
        });
        quiz = { questions, index: 0, score: 0, answered: false, saved: false }; $('#quiz-content').innerHTML = quizHtml(); return;
      }
      if (operation === 'quiz-answer' && quiz && !quiz.answered) {
        quiz.choice = Number(button.dataset.value); quiz.answered = true;
        if (quiz.choice === quiz.questions[quiz.index].answer) quiz.score++;
        $('#quiz-content').innerHTML = quizHtml(); return;
      }
      if (operation === 'quiz-next' && quiz?.answered) {
        quiz.index++; quiz.answered = false;
        if (quiz.index === 5 && user) { await store.savePractice(quiz.score, 5); profile = await store.getProfile(); quiz.saved = true; }
        return render();
      }
      if (operation === 'export') {
        if (needLogin()) return;
        const backup = await store.exportProfile();
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob), anchor = document.createElement('a');
        anchor.href = url; anchor.download = `poke-discovery-${user.username}-${new Date().toISOString().slice(0, 10)}.json`; anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000); toast('个人备份已导出。');
      }
    });
  });
  document.addEventListener('input', event => {
    if (event.target.id === 'search') { query = event.target.value; updateGrid(); }
    if (event.target.form?.id === 'team-form') teamMeta[event.target.name] = event.target.value;
  });
  document.addEventListener('change', event => {
    const input = event.target;
    if (input.id === 'type-filter') { filterType = input.value; updateGrid(); }
    if (input.id === 'sort') { sort = input.value; updateGrid(); }
    if (input.id === 'team-opponent') {
      const [kind, id] = input.value.split(':');
      opponentChoice = id ? { kind, id } : null;
      const scrollPosition = window.scrollY;
      render(); window.scrollTo({ top: scrollPosition, behavior: 'instant' });
      $('#team-opponent').focus({ preventScroll: true });
    }
    if (['attack-type', 'lab-target'].includes(input.id)) {
      attack = $('#attack-type').value; labTargetId = Number($('#lab-target').value);
      labLaunched = false; updateLab();
    }
    if (input.id === 'import-file') action(null, async () => {
      const file = input.files[0]; input.value = ''; if (!file) return;
      if (needLogin()) return;
      if (file.size > 500000) throw new Error('备份文件不能超过 500 KB。');
      let backup; try { backup = JSON.parse(await file.text()); } catch { throw new Error('请选择格式正确的 JSON 文件。'); }
      if (!window.confirm(`导入将替换“${user.name}”的收藏、队伍与练习记录。建议先导出当前记录。继续吗？`)) return;
      profile = await store.importProfile(backup); draft = []; teamMeta = { id: null, name: '', note: '' }; opponentChoice = null; quiz = null; render(); toast('备份已导入当前账号。');
    });
  });
  document.addEventListener('submit', event => {
    if (!['account-form', 'team-form'].includes(event.target.id)) return;
    event.preventDefault(); const form = event.target, values = Object.fromEntries(new FormData(form));
    action(event.submitter, async () => {
      if (form.id === 'account-form') {
        try {
          if (form.dataset.mode === 'register') await store.register(values); else await store.login(values.username, values.password);
          await refreshUser(); quiz = null; $('#account-dialog').close(); render(); toast(`你好，${user.name}。开始发现吧！`);
        } catch (error) { $('#account-error').textContent = error.message; }
      } else {
        if (needLogin()) return;
        const saved = await store.saveTeam({ ...values, id: teamMeta.id, members: [...draft] });
        teamMeta = { id: saved.id, name: saved.name, note: saved.note }; profile = await store.getProfile(); render(); toast('队伍和笔记已保存。');
      }
    });
  });
  document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  }));
  async function boot() {
    try { [catalog, challenges] = await Promise.all([store.getCatalog(), store.getChallenges()]); await refreshUser(); render(); }
    catch (error) { $('#main').innerHTML = `<div class="empty-state"><h1>暂时无法打开发现室</h1><p>${escape(error.message)}</p><p>请确认资料文件完整，并允许浏览器使用本地存储。</p></div>`; }
  }
  boot();
})();
