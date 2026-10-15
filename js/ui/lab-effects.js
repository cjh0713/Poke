/* 实验动效只处理位置与播放，属性计算仍由规则层负责。 */
window.PokeLabEffects = (() => {
  let playNumber = 0;
  let finishTimer = null;
  let activeArena = null;

  function stop() {
    // 每次取消都换序号，让尚未完成的图片准备自动失效。
    playNumber += 1;
    if (finishTimer !== null) clearTimeout(finishTimer);
    finishTimer = null;
    activeArena?.classList.remove('is-firing');
    activeArena = null;
  }

  function reducedMotion() {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  }

  async function prepareImages(element) {
    const images = element.matches('img') ? [element] : Array.from(element.querySelectorAll('img'));
    await Promise.all(images.map(async image => {
      if (typeof image.decode !== 'function') return;
      // 图片失败不阻塞页面，容器仍可展示已有的静态结果。
      try { await image.decode(); } catch { /* 继续使用元素本身的位置。 */ }
    }));
  }

  async function play(arena) {
    stop();
    const currentPlay = playNumber;
    if (!arena?.isConnected || reducedMotion()) return;

    const source = arena.querySelector('.lab-buddy');
    const target = arena.querySelector('.lab-target-art');
    const projectile = arena.querySelector('.lab-projectile');
    if (!source || !target || !projectile) return;

    activeArena = arena;
    await Promise.all([prepareImages(source), prepareImages(target)]);

    // 切换目标或离开页面后，旧调用不能再给页面加播放状态。
    if (currentPlay !== playNumber || !arena.isConnected
      || !arena.contains(source) || !arena.contains(target) || !arena.contains(projectile)
      || reducedMotion()) return;

    const arenaRect = arena.getBoundingClientRect();
    const sourceRect = source.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const sourceX = sourceRect.left + sourceRect.width / 2;
    const sourceY = sourceRect.top + sourceRect.height / 2;
    const targetX = targetRect.left + targetRect.width / 2;
    const targetY = targetRect.top + targetRect.height / 2;

    arena.style.setProperty('--launch-x', `${sourceX - arenaRect.left}px`);
    arena.style.setProperty('--launch-y', `${sourceY - arenaRect.top}px`);
    arena.style.setProperty('--travel-x', `${targetX - sourceX}px`);
    arena.style.setProperty('--travel-y', `${targetY - sourceY}px`);

    // 先提交已移除的状态，连续点击也能从头播放 CSS 动画。
    void arena.offsetWidth;
    arena.classList.add('is-firing');
    finishTimer = setTimeout(() => {
      if (currentPlay !== playNumber) return;
      arena.classList.remove('is-firing');
      finishTimer = null;
      activeArena = null;
    }, 2200);
  }

  return { play, stop };
})();
