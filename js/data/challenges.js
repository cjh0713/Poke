/* 作者根据本地图鉴编排的参考队伍；不是玩家上传记录，也不代表实战排名。 */
window.POKE_CHALLENGES = Object.freeze([
  {
    id: 'balanced-starters', name: '均衡探索队',
    tagline: '三位初始伙伴，搭配不同能力方向。',
    note: '在接近预算上限时，试着观察水、火、草之外的属性分布，以及成员之间的共同弱点。',
    members: [3, 6, 9, 25, 65, 143]
  },
  {
    id: 'little-adventurers', name: '轻装出发队',
    tagline: '用更少预算，开始一次小小冒险。',
    note: '保留初始形态与熟悉的伙伴，预算留有余地。尝试逐个替换成员，看看能力均值与预算如何变化。',
    members: [1, 4, 7, 25, 133, 147]
  },
  {
    id: 'water-expedition', name: '碧海探险队',
    tagline: '六位水系伙伴，体验单属性挑战。',
    note: '这些伙伴都具有水属性，但第二属性与基础能力不同。比较它们面对电、草属性时的弱点人数。',
    members: [9, 62, 80, 99, 117, 131]
  },
  {
    id: 'speed-explorers', name: '疾风探索队',
    tagline: '把速度放在优先位置，也留意其他取舍。',
    note: '选择速度较突出的伙伴，观察平均速度与其他能力的差别。这里只比较公开参数，不预测对战胜负。',
    members: [26, 51, 65, 94, 101, 142]
  }
].map(team => Object.freeze({ ...team, members: Object.freeze(team.members) })));
