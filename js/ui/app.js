/* 页面展示与事件处理。所有数据读写通过 XinghuoStore 完成。 */
(() => {
  const store = window.XinghuoStore;
  const $ = selector => document.querySelector(selector);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const paths = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    board: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16m6-16v16M5.5 8h1M11.5 8h1M17.5 8h1"/>',
    box: '<path d="m12 3 9 5v9l-9 5-9-5V8l9-5Zm-9 5 9 5 9-5M12 13v9M7.5 5.5l9 5"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
    chart: '<path d="M4 3v17h17M8 16v-5m5 5V7m5 9V4"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-14 4h2m4 0h2"/>',
    logout: '<path d="M10 4H4v16h6m4-12 4 4-4 4m-6-4h10"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    tool: '<path d="m14 5 5 5M6 20l-2-2 8-8a6 6 0 0 1 8-7l-4 4 2 2 4-4a6 6 0 0 1-7 8L6 20Z"/>',
    lamp: '<path d="m8 3 8 0 4 9H4l4-9ZM12 12v7m-5 2h10m-9-2h8"/>',
    fan: '<circle cx="12" cy="10" r="8"/><circle cx="12" cy="10" r="1.5"/><path d="M12 8c-5-8 6-6 2 1M13 11c8-2 3 7-1 1M10.5 10.5c-2 7-7 1 0-1M12 18v3m-5 0h10"/>',
    plug: '<rect x="4" y="6" width="16" height="12" rx="3"/><path d="M8 10v3m4-3v3m4-3v3M12 18v4M12 2v4"/>',
    kettle: '<path d="M7 7h9l2 12H5L7 7Zm2-4h5m-3 0v4m5 3h3a3 3 0 0 1 0 6h-2M5 10H2l3 5"/>',
    speaker: '<rect x="5" y="2" width="14" height="20" rx="2"/><circle cx="12" cy="15" r="4"/><circle cx="12" cy="6" r="1.5"/>',
    download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>'
  };
  const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.tool}</svg>`;
  const statusNames = { pending: '待接单', active: '维修中', parts: '待配件', done: '已修好' };
  const views = { dashboard: '工作概览', orders: '工单看板', inventory: '配件台账', mine: '我的工单', captain: '队长后台' };
  let snapshot, view = 'dashboard', query = '', groupFilter = '', toastTimer;
  const owner = order => snapshot.users.find(user => user.id === order.ownerId);
  const me = () => snapshot.currentUser;
  const isCaptain = () => me()?.role === 'captain';
  const editable = order => isCaptain() || order.ownerId === me()?.id;
  const mine = () => snapshot.orders.filter(order => order.ownerId === me().id);
  const time = (value, full = false) => new Date(value).toLocaleString('zh-CN', full ? { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false } : { hour: '2-digit', minute: '2-digit', hour12: false });
  const weekStart = () => { const date = new Date(); date.setDate(date.getDate() - (date.getDay() + 6) % 7); date.setHours(0, 0, 0, 0); return date; };
  const thisWeek = rows => rows.filter(row => new Date(row.receivedAt || row.time) >= weekStart() && new Date(row.receivedAt || row.time) <= new Date());
  const pill = order => `<span class="status-pill ${order.status}">${statusNames[order.status]}</span>`;
  const groupTag = group => `<span class="tag ${group === '电工组' ? 'electric' : group === '焊工组' ? 'welding' : 'general'}">${escape(group)}</span>`;
  const itemIcon = kind => `<span class="item-icon">${icon(kind)}</span>`;
  function toast(message) { clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').hidden = false; toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 3500); }
  async function action(button, task) {
    if (button?.disabled) return;
    if (button) button.disabled = true;
    try { await task(); } catch (error) { toast(error.message); }
    finally { if (button) button.disabled = false; }
  }
  function heading(title, subtitle, actions = '') {
    return `<div class="page-heading"><div><span class="eyebrow">SPARK / ${new Date().toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', weekday: 'long' })}</span><h1>${escape(title)}</h1><p>${escape(subtitle)}</p></div><div class="heading-actions">${actions}</div></div>`;
  }
  const newButton = () => `<button class="button primary" data-action="new">${icon('plus')}登记工单</button>`;
  function stats() {
    const weekly = thisWeek(snapshot.orders), done = weekly.filter(order => order.status === 'done').length;
    const cards = [
      ['本周送修工单', weekly.length, '单', '每一件送修物品，都有记录', 'board', true],
      ['待接工单', snapshot.orders.filter(order => order.status === 'pending').length, '单', '还有小物件等你伸出援手', 'clock'],
      ['本周已修好', done, '单', `本周工单完成率 ${weekly.length ? Math.round(done / weekly.length * 100) : 0}%`, 'check'],
      ['维修队成员', snapshot.users.length, '人', '电工 / 焊工 / 综合，三个小组', 'user']
    ];
    return `<div class="stats-grid">${cards.map(([label, value, unit, note, name, accent]) => `<div class="stat-card ${accent ? 'accent' : ''}">${icon(name)}<p class="stat-label">${label}</p><p class="stat-number">${value}<span>${unit}</span></p><p class="stat-note">${note}</p></div>`).join('')}</div>`;
  }
  function card(order) {
    const person = owner(order);
    return `<button class="order-card" data-order="${escape(order.id)}" aria-label="查看${escape(order.item)}工单 ${escape(order.id)}"><span class="card-top"><span class="order-code">${escape(order.id)}</span>${groupTag(order.group)}</span><span class="card-title">${itemIcon(order.kind)}${escape(order.item)}</span><p class="card-description">${escape(order.description)}</p><span class="card-footer"><span class="card-owner ${person ? '' : 'unassigned'}">${person ? `<span class="avatar">${escape(person.name.slice(-1))}</span>${escape(person.name)}` : '○ 等待接单'}</span><span>${time(order.updatedAt)} 更新</span></span></button>`;
  }
  function filteredOrders() { const term = query.trim().toLowerCase(); return snapshot.orders.filter(order => (!term || `${order.id} ${order.item} ${order.description} ${owner(order)?.name || ''}`.toLowerCase().includes(term)) && (!groupFilter || order.group === groupFilter)); }
  function board() {
    const orders = filteredOrders();
    return Object.keys(statusNames).map(status => {
      const items = orders.filter(order => order.status === status);
      return `<section class="board-column" data-status="${status}"><h3 class="column-heading"><span class="column-dot"></span>${statusNames[status]}<span class="column-count">${items.length}</span>${icon(status === 'done' ? 'check' : 'board')}</h3>${items.map(card).join('') || '<p class="empty-column">这里暂时没有工单</p>'}${status === 'pending' ? '<button class="add-card" data-action="new">＋ 登记一件送修物品</button>' : ''}</section>`;
    }).join('');
  }
  function boardSection() {
    return `<section aria-label="工单看板"><div class="section-head"><div class="section-title"><h2>工单看板</h2><span class="section-meta" id="board-meta">${filteredOrders().length} 单 · 点击卡片查看详情</span></div><div class="filters"><label class="search-box" for="search-orders">${icon('search')}<input id="search-orders" type="search" aria-label="搜索工单、物品或负责人" placeholder="搜索工单、物品、负责人" value="${escape(query)}"></label><select id="filter-group" aria-label="按维修组筛选"><option value="">全部小组</option>${['电工组', '焊工组', '综合组'].map(group => `<option ${groupFilter === group ? 'selected' : ''}>${group}</option>`).join('')}</select></div></div><div class="board" id="board-columns">${board()}</div></section>`;
  }
  function orderTable(orders, showOwner = false) {
    if (!orders.length) return '<p class="empty-state">暂时没有工单。去看板接一单，让旧物继续发光。</p>';
    return `<div class="table-wrap"><table><thead><tr><th>送修物品 / 工单号</th>${showOwner ? '<th>负责人</th>' : ''}<th>当前状态</th><th>更新时间</th><th></th></tr></thead><tbody>${orders.map(order => `<tr><td><div class="table-item">${itemIcon(order.kind)}<div>${escape(order.item)}<br><span class="order-code">${escape(order.id)}</span></div></div></td>${showOwner ? `<td>${escape(owner(order)?.name || '待接单')}</td>` : ''}<td>${pill(order)}</td><td class="muted">${time(order.updatedAt, true)}</td><td><button class="text-button" data-order="${escape(order.id)}">查看 →</button></td></tr>`).join('')}</tbody></table></div>`;
  }
  function stockRow(part) { return `<div class="stock-row">${itemIcon('box')}<div><span class="stock-name">${escape(part.name)}</span><span class="stock-spec">${escape(part.spec)}</span></div><span class="stock-number">${part.stock}<small>${escape(part.unit)}</small></span></div>`; }
  function dashboard() {
    return heading('维修工作台', `你好，${me().name}。让每一件送修物品，都有着落。`, newButton()) + stats() + boardSection() + `<div class="lower-grid"><section class="panel"><div class="section-head"><div class="section-title"><h2>我的工单</h2><span class="section-meta">${mine().length} 单由我负责</span></div><button class="text-button" data-view="mine">查看全部 →</button></div>${orderTable(mine().slice(0, 3))}</section><section class="panel"><div class="section-head"><h2>配件余量</h2><button class="text-button" data-view="inventory">进入台账 →</button></div>${snapshot.parts.map(stockRow).join('')}</section></div>`;
  }
  function movementTable() {
    if (!snapshot.movements.length) return '<p class="empty-state">还没有配件流转记录。入库、领用或归还后，会自动记在这里。</p>';
    return `<div class="table-wrap"><table><thead><tr><th>时间</th><th>配件 / 规格</th><th>操作</th><th>数量</th><th>关联工单</th><th>经办人</th></tr></thead><tbody>${snapshot.movements.map(row => { const part = snapshot.parts.find(item => item.id === row.partId); return `<tr><td>${time(row.time, true)}</td><td>${escape(part.name)} <span class="muted">${escape(part.spec)}</span></td><td>${{ in: '入库', out: '领用', return: '归还' }[row.type]}</td><td>${row.quantity} ${escape(part.unit)}</td><td class="order-code">${escape(row.orderId || '—')}</td><td>${escape(snapshot.users.find(user => user.id === row.actorId)?.name || '—')}</td></tr>`; }).join('')}</tbody></table></div>`;
  }
  function inventory() {
    return heading('配件台账', '按名称与规格选配件。每一次领用、归还，都留下一笔记录。') + `<div class="inventory-grid">${snapshot.parts.map(part => `<section class="inventory-card">${stockRow(part)}<p class="muted" style="font-size:11px">期初 ${part.initial} ${escape(part.unit)} · 当前可用 ${part.stock} ${escape(part.unit)}</p><div class="heading-actions">${isCaptain() ? `<button class="button secondary small" data-stock="${part.id}" data-type="in">＋ 入库</button>` : ''}<button class="button secondary small" data-stock="${part.id}" data-type="out">领用 / 归还</button></div></section>`).join('')}</div><section class="panel"><div class="section-head"><h2>配件流转记录</h2><span class="section-meta">${snapshot.movements.length} 笔记录</span></div>${movementTable()}</section>`;
  }
  function captain() {
    const weekly = thisWeek(snapshot.orders), assigned = weekly.filter(order => order.ownerId);
    const groups = ['电工组', '焊工组', '综合组'];
    return heading('队长后台', '把工单安排妥当，把每个人的付出记下来。', `<button class="button secondary" data-export="orders">${icon('download')}本周工单</button><button class="button secondary" data-export="parts">${icon('download')}本周耗材</button>`) + stats() + `<div class="lower-grid"><section class="panel"><div class="section-head"><h2>各组本周工作量</h2><span class="section-meta">按送修时间统计已接工单</span></div>${groups.map(group => { const count = assigned.filter(order => order.group === group).length; return `<div class="workload-row"><span>${group}</span><div class="bar-track"><div class="bar-fill" style="width:${assigned.length ? count / assigned.length * 100 : 0}%"></div></div><span>${count} 单</span></div>`; }).join('')}<p class="form-note" style="margin-top:12px">${weekly.filter(order => order.status === 'pending').length} 单还未接单，可在工单详情中指定负责人。</p></section><section class="panel"><div class="section-head"><h2>配件盘点</h2><button class="text-button" data-view="inventory">登记入库 →</button></div>${snapshot.parts.map(stockRow).join('')}</section></div><section class="panel" style="margin-top:20px"><div class="section-head"><h2>队员本周接单情况</h2><span class="section-meta">12 名演示队员，无排名</span></div><div class="table-wrap"><table><thead><tr><th>队员</th><th>小组</th><th>已接工单</th><th>已修好</th><th>维修中 / 待配件</th></tr></thead><tbody>${snapshot.users.map(user => { const orders = weekly.filter(order => order.ownerId === user.id); return `<tr><td>${escape(user.name)}${user.role === 'captain' ? ' · 队长' : ''}</td><td>${groupTag(user.group)}</td><td>${orders.length}</td><td>${orders.filter(order => order.status === 'done').length}</td><td>${orders.filter(order => ['active', 'parts'].includes(order.status)).length}</td></tr>`; }).join('')}</tbody></table></div></section>`;
  }
  async function render() {
    snapshot = await store.getSnapshot();
    const loggedIn = !!snapshot.currentUser;
    $('#login-screen').hidden = loggedIn;
    $('#app-shell').hidden = !loggedIn;
    if (!loggedIn) {
      $('#login-user').innerHTML = snapshot.users.map(user => `<option value="${user.id}">${escape(user.name)} · ${user.role === 'captain' ? '队长' : user.group}</option>`).join('');
      return;
    }
    if (view === 'captain' && !isCaptain()) view = 'dashboard';
    $('#captain-nav').hidden = !isCaptain();
    $('#account-avatar').textContent = me().name.slice(-1);
    $('#account-name').textContent = `${me().name} · ${isCaptain() ? '队长' : '队员'}`;
    $('#nav-pending').textContent = snapshot.orders.filter(order => order.status === 'pending').length;
    $('#breadcrumb-current').textContent = views[view];
    document.querySelectorAll('.nav-item').forEach(button => { button.classList.toggle('active', button.dataset.view === view); if (button.dataset.view === view) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current'); });
    const pages = { dashboard, orders: () => heading('工单看板', '从待接单到已修好，每一步都有人负责。', newButton()) + boardSection(), inventory, mine: () => heading('我的工单', `${me().name} · ${me().group}，这里是你负责的 ${mine().length} 张工单。`, `<button class="button secondary" data-view="orders">去看板接单 →</button>`) + `<section class="panel">${orderTable(mine())}</section>`, captain };
    $('#main-content').innerHTML = pages[view]();
  }
  function openOrderForm() {
    $('#order-form').reset(); $('#order-error').textContent = '';
    const date = new Date(); date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    $('#received-at').value = date.toISOString().slice(0, 16);
    $('#order-dialog').showModal();
  }
  function openDetail(id) {
    const order = snapshot.orders.find(item => item.id === id);
    if (!order) return;
    const person = owner(order);
    $('#detail-content').innerHTML = `<div class="dialog-heading"><div><span class="eyebrow">${escape(order.id)}</span><h2>${escape(order.item)} ${pill(order)}</h2></div><button class="icon-button" data-close="detail-dialog" aria-label="关闭工单详情">×</button></div><dl class="detail-meta"><div><dt>送修人</dt><dd>${escape(order.customer)}</dd></div><div><dt>联系方式</dt><dd>${escape(order.contact)}</dd></div><div><dt>负责人 / 维修组</dt><dd>${escape(person?.name || '暂未接单')} · ${escape(order.group)}</dd></div><div><dt>送修时间</dt><dd>${time(order.receivedAt, true)}</dd></div></dl><p class="detail-description">${escape(order.description)}</p><div class="detail-action-row">${order.status === 'pending' ? `<button class="button primary small" data-claim="${escape(id)}">由我接单 →</button>` : ''}${editable(order) && order.ownerId ? `<button class="button secondary small" data-material-order="${escape(id)}">${icon('box')}登记领料 / 归还</button>` : ''}</div>${isCaptain() && order.status !== 'done' ? `<section class="detail-section"><h3>指定负责人</h3><form id="assign-form" class="inline-form" data-id="${escape(id)}"><select name="ownerId" aria-label="选择负责人">${snapshot.users.map(user => `<option value="${user.id}" ${order.ownerId === user.id ? 'selected' : ''}>${escape(user.name)} · ${escape(user.group)}</option>`).join('')}</select><button type="submit" class="button secondary">派单</button></form></section>` : ''}${editable(order) && order.ownerId ? `<section class="detail-section"><h3>更新维修进度</h3><form id="status-form" class="inline-form" data-id="${escape(id)}"><select name="status" aria-label="维修状态">${['active', 'parts', 'done'].map(status => `<option value="${status}" ${order.status === status ? 'selected' : ''}>${statusNames[status]}</option>`).join('')}</select><button type="submit" class="button primary">更新进度</button><input name="note" placeholder="本次维修备注（选填，最多 200 字）" maxlength="200" aria-label="维修备注"></form></section>` : ''}<section class="detail-section"><h3>进度时间线</h3><ol class="timeline">${[...order.history].reverse().map(row => `<li><p>${escape(row.text)}</p><small>${time(row.time, true)} · ${escape(row.actor)}</small></li>`).join('')}</ol></section>`;
    if (!$('#detail-dialog').open) $('#detail-dialog').showModal();
  }
  function stockOrders(type) { return snapshot.orders.filter(order => order.ownerId && editable(order) && (type === 'return' || order.status !== 'done')); }
  function refreshStockOrders(preferred) {
    const form = $('#stock-form'), type = form.elements.type.value;
    const select = form.elements.orderId;
    select.innerHTML = stockOrders(type).map(order => `<option value="${escape(order.id)}" ${order.id === preferred ? 'selected' : ''}>${escape(order.item)} · ${escape(order.id)}</option>`).join('') || '<option value="">暂无可操作的工单</option>';
    $('#stock-order-field').hidden = type === 'in';
    select.required = type !== 'in';
    select.disabled = type === 'in';
  }
  function openStock(partId, type = 'out', orderId = '') {
    $('#stock-content').innerHTML = `<div class="dialog-heading"><div><span class="eyebrow">PARTS LEDGER</span><h2 id="stock-title">登记配件流转</h2></div><button class="icon-button" data-close="stock-dialog" aria-label="关闭配件窗口">×</button></div><form id="stock-form"><label for="stock-part">配件 / 规格</label><select id="stock-part" name="partId">${snapshot.parts.map(part => `<option value="${part.id}" ${part.id === partId ? 'selected' : ''}>${escape(part.name)} · ${escape(part.spec)}（余 ${part.stock} ${escape(part.unit)}）</option>`).join('')}</select><label for="stock-type">操作</label><select id="stock-type" name="type">${isCaptain() ? `<option value="in" ${type === 'in' ? 'selected' : ''}>入库</option>` : ''}<option value="out" ${type === 'out' ? 'selected' : ''}>领用</option><option value="return" ${type === 'return' ? 'selected' : ''}>归还</option></select><div id="stock-order-field"><label for="stock-order">关联工单</label><select id="stock-order" name="orderId"></select></div><label for="stock-quantity">数量（按配件单位计）</label><input id="stock-quantity" name="quantity" type="number" min="1" step="1" value="1" required><p class="form-note">领用自动扣减库存；归还不能超过该工单尚未归还的领用量。</p><p class="form-error" id="stock-error" role="alert"></p><div class="dialog-actions"><button class="button secondary" type="button" data-close="stock-dialog">取消</button><button class="button primary" type="submit">保存记录</button></div></form>`;
    refreshStockOrders(orderId);
    $('#stock-dialog').showModal();
  }
  function downloadCSV(kind) {
    if (!isCaptain()) throw new Error('导出需要队长权限。');
    let rows;
    if (kind === 'orders') {
      rows = [['工单号', '物品', '故障描述', '送修人', '联系方式', '维修组', '负责人', '状态', '送修时间', '更新时间'], ...thisWeek(snapshot.orders).map(order => [order.id, order.item, order.description, order.customer, order.contact, order.group, owner(order)?.name || '', statusNames[order.status], new Date(order.receivedAt).toLocaleString('zh-CN'), new Date(order.updatedAt).toLocaleString('zh-CN')])];
    } else {
      rows = [['配件', '规格', '单位', '本周领用', '本周归还', '本周净消耗', '本周入库', '当前余量'], ...snapshot.parts.map(part => { const movements = thisWeek(snapshot.movements).filter(row => row.partId === part.id); const total = type => movements.filter(row => row.type === type).reduce((sum, row) => sum + row.quantity, 0); return [part.name, part.spec, part.unit, total('out'), total('return'), total('out') - total('return'), total('in'), part.stock]; })];
    }
    const csvCell = value => { const text = String(value ?? ''); const safe = /^[\s]*[=+@-]/.test(text) ? `'${text}` : text; return `"${safe.replace(/"/g, '""')}"`; };
    const csv = '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `星火-${kind === 'orders' ? '本周工单' : '本周配件消耗'}-${new Date().toLocaleDateString('sv-SE')}.csv`;
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('已导出 CSV，可用 Excel 打开。');
  }
  document.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.close) { $(`#${button.dataset.close}`).close(); return; }
    if (button.dataset.view) { view = button.dataset.view; action(button, async () => { await render(); window.scrollTo(0, 0); $('#main-content').focus({ preventScroll: true }); }); return; }
    if (button.dataset.action === 'new') openOrderForm();
    if (button.dataset.order) openDetail(button.dataset.order);
    if (button.dataset.claim) action(button, async () => { await store.claimOrder(button.dataset.claim); await render(); openDetail(button.dataset.claim); toast('接单成功，这张工单由你负责了。'); });
    if (button.dataset.stock) openStock(button.dataset.stock, button.dataset.type);
    if (button.dataset.materialOrder) openStock(snapshot.parts[0].id, 'out', button.dataset.materialOrder);
    if (button.dataset.export) action(button, async () => downloadCSV(button.dataset.export));
  });
  $('#account-button').addEventListener('click', event => action(event.currentTarget, async () => { await store.logout(); document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close()); view = 'dashboard'; query = ''; groupFilter = ''; await render(); }));
  $('#login-form').addEventListener('submit', event => {
    event.preventDefault(); $('#login-error').textContent = '';
    action(event.submitter, async () => { try { await store.login($('#login-user').value, $('#login-password').value); await render(); } catch (error) { $('#login-error').textContent = error.message; } });
  });
  $('#order-form').addEventListener('submit', event => {
    event.preventDefault(); $('#order-error').textContent = '';
    action(event.submitter, async () => { try { const id = await store.createOrder(Object.fromEntries(new FormData(event.target))); $('#order-dialog').close(); await render(); toast(`登记成功 · ${id}`); openDetail(id); } catch (error) { $('#order-error').textContent = error.message; } });
  });
  document.addEventListener('submit', event => {
    const form = event.target;
    if (!['status-form', 'assign-form', 'stock-form'].includes(form.id)) return;
    event.preventDefault();
    action(event.submitter, async () => {
      const values = Object.fromEntries(new FormData(form));
      if (form.id === 'stock-form') {
        try { await store.movePart(values); $('#stock-dialog').close(); await render(); const detailId = $('#status-form')?.dataset.id || $('#assign-form')?.dataset.id; if ($('#detail-dialog').open && detailId) openDetail(detailId); toast('配件台账已更新。'); } catch (error) { $('#stock-error').textContent = error.message; }
      } else {
        if (form.id === 'status-form') await store.updateStatus(form.dataset.id, values.status, values.note);
        else await store.assignOrder(form.dataset.id, values.ownerId);
        await render(); openDetail(form.dataset.id); toast(form.id === 'status-form' ? '维修进度已更新。' : '派单成功。');
      }
    });
  });
  document.addEventListener('input', event => { if (event.target.id === 'search-orders') { query = event.target.value; $('#board-columns').innerHTML = board(); $('#board-meta').textContent = `${filteredOrders().length} 单 · 点击卡片查看详情`; } });
  document.addEventListener('change', event => {
    if (event.target.id === 'filter-group') { groupFilter = event.target.value; $('#board-columns').innerHTML = board(); $('#board-meta').textContent = `${filteredOrders().length} 单 · 点击卡片查看详情`; }
    if (event.target.id === 'stock-type') refreshStockOrders($('#stock-order').value);
  });
  document.querySelectorAll('[data-icon]').forEach(element => { element.innerHTML = icon(element.dataset.icon); });
  render().catch(error => { document.body.innerHTML = `<main class="fatal-error"><h1>暂时无法打开工作台</h1><p>${escape(error.message)}</p><p>请保留已有数据，检查浏览器设置后再刷新。</p></main>`; });
})();
