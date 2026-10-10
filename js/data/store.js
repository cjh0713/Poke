/*
 * 唯一的数据访问层。UI 只调用异步方法，不直接接触 localStorage。
 * 后续接 REST 接口时保留这些方法的 Promise 与返回值约定。
 * 本地账号仅用于演示角色差异；正式认证应由服务端完成。
 */
window.XinghuoStore = (() => {
  const KEY = 'xinghuo-repair-demo-v1';
  const statuses = ['pending', 'active', 'parts', 'done'];
  const labels = { pending: '待接单', active: '维修中', parts: '待配件', done: '已修好' };
  const clone = value => JSON.parse(JSON.stringify(value));
  function save(data) {
    try { localStorage.setItem(KEY, JSON.stringify(data)); }
    catch { throw new Error('本地保存失败，请检查浏览器存储权限或剩余空间。'); }
  }
  function read() {
    let raw;
    try { raw = localStorage.getItem(KEY); }
    catch { throw new Error('浏览器未允许本地存储，请用普通浏览窗口打开。'); }
    if (!raw) { const data = window.createXinghuoSeed(); save(data); return data; }
    let data;
    try { data = JSON.parse(raw); }
    catch { throw new Error('本地数据格式损坏，请先备份浏览器中的数据再处理。'); }
    if (data.version !== 1 || !Array.isArray(data.orders) || !Array.isArray(data.users) || !Array.isArray(data.parts) || !Array.isArray(data.movements)) throw new Error('本地数据版本不兼容。');
    return data;
  }
  function userOf(data, captainOnly = false) {
    const user = data.users.find(item => item.id === data.session);
    if (!user) throw new Error('请先登录。');
    if (captainOnly && user.role !== 'captain') throw new Error('这个操作需要队长权限。');
    return user;
  }
  function orderOf(data, id) {
    const order = data.orders.find(item => item.id === id);
    if (!order) throw new Error('找不到这张工单。');
    return order;
  }
  function canEdit(user, order) {
    if (user.role !== 'captain' && order.ownerId !== user.id) throw new Error('只能更新自己负责的工单。');
  }
  function record(order, user, text, type) {
    const time = new Date().toISOString();
    order.updatedAt = time;
    order.history.push({ time, actor: user.name, text, type });
  }
  function textField(value, label, max) {
    const text = String(value || '').trim();
    if (!text || text.length > max) throw new Error(`请填写${label}，长度不超过 ${max} 字。`);
    return text;
  }
  function quantityOf(value) {
    const quantity = Number(value);
    if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new Error('数量必须是大于 0 的整数。');
    return quantity;
  }
  function dayKey(date) {
    return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  }
  return {
    async getSnapshot() {
      const data = read();
      return clone({ ...data, currentUser: data.users.find(user => user.id === data.session) || null });
    },
    async login(id, password) {
      const data = read();
      if (!data.users.some(user => user.id === id) || password !== 'xinghuo123') throw new Error('账号或密码不正确。演示密码为 xinghuo123。');
      data.session = id;
      save(data);
    },
    async logout() { const data = read(); data.session = null; save(data); },
    async createOrder(values) {
      const data = read();
      const user = userOf(data);
      const item = textField(values.item, '物品名称', 40);
      const customer = textField(values.customer, '送修人', 30);
      const contact = textField(values.contact, '联系方式', 60);
      const description = textField(values.description, '故障描述', 500);
      if (!['电工组', '焊工组', '综合组'].includes(values.group)) throw new Error('请选择有效的维修组。');
      const received = new Date(values.receivedAt);
      if (!Number.isFinite(received.getTime())) throw new Error('请填写有效的送修时间。');
      const now = new Date();
      if (received.getTime() > now.getTime() + 60000) throw new Error('送修时间不能晚于现在。');
      const prefix = `WX-${dayKey(now)}-`;
      const next = Math.max(0, ...data.orders.filter(order => order.id.startsWith(prefix)).map(order => Number(order.id.slice(prefix.length)) || 0)) + 1;
      const id = `${prefix}${String(next).padStart(2, '0')}`;
      const order = { id, item, customer, contact, description, group: values.group, status: 'pending', ownerId: null, kind: /灯/.test(item) ? 'lamp' : /风扇/.test(item) ? 'fan' : /插/.test(item) ? 'plug' : /壶/.test(item) ? 'kettle' : 'tool', createdAt: now.toISOString(), receivedAt: received.toISOString(), updatedAt: now.toISOString(), history: [] };
      record(order, user, '登记送修物品', 'created');
      data.orders.unshift(order);
      save(data);
      return id;
    },
    async claimOrder(id) {
      const data = read();
      const user = userOf(data);
      const order = orderOf(data, id);
      if (order.status !== 'pending' || order.ownerId) throw new Error('这张工单已被接走，请刷新看板。');
      order.ownerId = user.id;
      order.status = 'active';
      record(order, user, '接单并开始维修', 'claimed');
      save(data);
    },
    async assignOrder(id, ownerId) {
      const data = read();
      const user = userOf(data, true);
      const order = orderOf(data, id);
      const owner = data.users.find(item => item.id === ownerId);
      if (!owner) throw new Error('请选择一名队员。');
      if (order.status === 'done') throw new Error('已修好的工单无需派单。');
      if (order.ownerId === ownerId) throw new Error('这张工单已经由该队员负责。');
      order.ownerId = ownerId;
      order.group = owner.group;
      if (order.status === 'pending') order.status = 'active';
      record(order, user, `派单给 ${owner.name}（${owner.group}）`, 'assigned');
      save(data);
    },
    async updateStatus(id, status, note) {
      const data = read();
      const user = userOf(data);
      const order = orderOf(data, id);
      canEdit(user, order);
      if (!statuses.includes(status) || status === 'pending') throw new Error('请选择维修中、待配件或已修好。');
      if (!order.ownerId) throw new Error('请先接单或派单。');
      if (status === order.status) throw new Error('工单已经处于这个状态。');
      const remark = String(note || '').trim();
      if (remark.length > 200) throw new Error('备注不能超过 200 字。');
      order.status = status;
      record(order, user, `更新为${labels[status]}${remark ? `：${remark}` : ''}`, 'status');
      save(data);
    },
    async movePart({ partId, orderId, quantity: value, type }) {
      const data = read();
      const user = userOf(data, type === 'in');
      const quantity = quantityOf(value);
      const part = data.parts.find(item => item.id === partId);
      if (!part || !['in', 'out', 'return'].includes(type)) throw new Error('请选择有效配件和操作。');
      let order = null;
      if (type !== 'in') {
        order = orderOf(data, orderId);
        canEdit(user, order);
        if (!order.ownerId) throw new Error('请先给工单确定负责人。');
        if (type === 'out' && order.status === 'done') throw new Error('已修好的工单不能继续领料。');
      }
      if (type === 'out' && quantity > part.stock) throw new Error(`库存不足，目前只有 ${part.stock} ${part.unit}。`);
      if (type === 'return') {
        const used = data.movements.filter(row => row.partId === partId && row.orderId === orderId).reduce((sum, row) => sum + (row.type === 'out' ? row.quantity : row.type === 'return' ? -row.quantity : 0), 0);
        if (quantity > used) throw new Error(`这张工单最多可归还 ${used} ${part.unit}。`);
      }
      const nextStock = part.stock + (type === 'out' ? -quantity : quantity);
      if (!Number.isSafeInteger(nextStock)) throw new Error('数量过大，请核对。');
      part.stock = nextStock;
      const action = { in: '入库', out: '领用', return: '归还' }[type];
      const time = new Date().toISOString();
      data.movements.unshift({ id: `${Date.now()}-${data.movements.length}`, partId, orderId: order ? order.id : null, quantity, type, actorId: user.id, time });
      if (order) record(order, user, `${action}${part.name}（${part.spec}）${quantity} ${part.unit}`, 'material');
      save(data);
    }
  };
})();
