/* 全部为虚构的课程演示数据，不代表真实队员、送修人或维修记录。 */
window.createXinghuoSeed = function () {
  const groups = ['电工组', '焊工组', '综合组'];
  const names = ['林一', '陈晨', '周宁', '许安', '沈禾', '江帆', '宋雨', '陆川', '温言', '顾青', '方可', '苏晓'];
  const users = names.map((name, index) => ({
    id: `member-${index + 1}`, name, group: groups[Math.floor(index / 4)],
    role: index === 0 ? 'captain' : 'member'
  }));
  const day = new Date();
  day.setDate(day.getDate() - (day.getDay() - 3 + 7) % 7);
  day.setHours(14, 0, 0, 0);
  const dateKey = `${day.getFullYear()}${String(day.getMonth() + 1).padStart(2, '0')}${String(day.getDate()).padStart(2, '0')}`;
  const samples = [
    ['台灯', '开关接触不良，偶尔闪烁', '李老师', '电工组', 'pending', null, 'lamp'],
    ['落地风扇', '通电后扇叶不转，伴有嗡嗡声', '王同学', '电工组', 'pending', null, 'fan'],
    ['插线板', '其中一个插孔无法供电', '赵同学', '综合组', 'pending', null, 'plug'],
    ['电热水壶', '底座接触不良，指示灯不亮', '刘同学', '电工组', 'active', 'member-1', 'kettle'],
    ['小音箱', '充电接口松动，需要重新焊接', '吴同学', '焊工组', 'active', 'member-5', 'speaker'],
    ['台灯', '灯罩连接处松动，支架不稳', '郑老师', '综合组', 'active', 'member-9', 'lamp'],
    ['桌面风扇', '启动电容损坏，等待更换', '钱同学', '电工组', 'parts', 'member-2', 'fan'],
    ['插线板', '插头外壳破裂，等待合适规格', '孙同学', '综合组', 'parts', 'member-10', 'plug'],
    ['小音箱', '内部接线脱落，已焊接并测试', '冯同学', '焊工组', 'done', 'member-6', 'speaker'],
    ['台灯', '更换开关后点亮正常，待取件', '徐同学', '电工组', 'done', 'member-1', 'lamp']
  ];
  const orders = samples.map((sample, index) => {
    const [item, description, customer, group, status, ownerId, kind] = sample;
    const time = new Date(day.getTime() + index * 6 * 60000).toISOString();
    const history = [{ time, actor: '登记台', text: '登记送修物品', type: 'created' }];
    if (ownerId) history.push({ time: new Date(new Date(time).getTime() + 10 * 60000).toISOString(), actor: users.find(user => user.id === ownerId).name, text: '接单并开始维修', type: 'claimed' });
    if (['parts', 'done'].includes(status)) history.push({ time: new Date(new Date(time).getTime() + 30 * 60000).toISOString(), actor: users.find(user => user.id === ownerId).name, text: status === 'parts' ? '更新为待配件' : '维修完成，等待取件', type: 'status' });
    return { id: `WX-${dateKey}-${String(index + 1).padStart(2, '0')}`, item, description, customer, contact: '演示联系方式', group, status, ownerId, kind, createdAt: time, receivedAt: time, updatedAt: history[history.length - 1].time, history };
  });
  const parts = [
    { id: 'resistor', name: '电阻', spec: '1 kΩ · 1/4 W', unit: '只', initial: 80, stock: 80 },
    { id: 'capacitor', name: '电容', spec: '2.5 μF · 450 V', unit: '只', initial: 12, stock: 12 },
    { id: 'screw', name: '螺丝', spec: 'M3 × 8 mm', unit: '颗', initial: 64, stock: 64 },
    { id: 'solder', name: '焊锡', spec: '0.8 mm · 100 g / 卷', unit: '卷', initial: 6, stock: 6 },
    { id: 'plug', name: '插头', spec: '两脚 · 10 A', unit: '个', initial: 18, stock: 18 }
  ];
  return { version: 1, session: null, users, orders, parts, movements: [] };
};
