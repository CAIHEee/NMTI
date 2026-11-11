// ============================================
// NMTI 4-axis app
// ============================================

let currentQuestion = 0;
let answers = {};
let lastResult = null;
let appBooted = false;
let typesDrawerExpanded = false;
let advanceTimer = null;

function clearAdvance() {
  if (advanceTimer) {
    clearTimeout(advanceTimer);
    advanceTimer = null;
  }
}

function boot() {
  if (appBooted) return;
  appBooted = true;
  renderTypesGallery();
  initTheme();
  initSwipe();
  window.addEventListener('hashchange', handleRoute);
  handleRoute();
}

boot();

function initTheme() {
  const saved = localStorage.getItem('nmti-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  setTheme(saved || (prefersDark ? 'dark' : 'light'));
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('nmti-theme', theme);
  // 雷达图的网格/标签颜色在绘制时烘焙，切换主题后需要重绘
  if (lastResult && document.getElementById('page-result')?.classList.contains('active')) {
    renderRadarChart(lastResult.axisPercents, lastResult.primary?.color || '#f59e0b');
  }
}

function toggleTheme() {
  setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
}

function initSwipe() {
  let sx = 0;
  const page = document.getElementById('page-test');
  page?.addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, { passive: true });
  page?.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - sx;
    if (Math.abs(dx) > 60) {
      dx < 0 ? nextQuestion() : prevQuestion();
    }
  }, { passive: true });
}

function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(`page-${name}`)?.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  const tb = document.getElementById('theme-toggle');
  if (tb) tb.style.display = name === 'test' ? 'none' : '';
  if (name === 'landing') requestAnimationFrame(measureDrawerHeight);
}

function getRoute() {
  const route = location.hash.replace(/^#\/?/, '');
  if (route === 'test' || route === 'result') return route;
  return 'landing';
}

function navigateTo(route) {
  const target = route === 'landing' ? '#/' : `#/${route}`;
  if (location.hash === target) handleRoute();
  else location.hash = target;
}

function handleRoute() {
  clearAdvance();
  const route = getRoute();
  if (route === 'test') {
    showPage('test');
    renderQuestion();
    return;
  }

  if (route === 'result') {
    if (!lastResult) {
      try {
        const saved = sessionStorage.getItem('nmti-last-result');
        if (saved) lastResult = JSON.parse(saved);
      } catch (_) {}
    }
    if (!lastResult) {
      navigateTo('landing');
      return;
    }
    showPage('result');
    renderStoredResult();
    return;
  }

  showPage('landing');
}

function goHome() {
  navigateTo('landing');
}

function scrollToTypes() {
  navigateTo('landing');
  setTimeout(() => document.getElementById('types-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
}

function startTest() {
  clearAdvance();
  currentQuestion = 0;
  answers = {};
  lastResult = null;
  navigateTo('test');
}

function renderQuestion() {
  const q = QUESTIONS[currentQuestion];
  if (!q) return;
  const total = QUESTIONS.length;
  const letters = ['A', 'B', 'C', 'D'];
  const sel = answers[q.id];
  const isLast = currentQuestion === total - 1;
  const answered = sel === undefined ? 0 : 1;
  document.getElementById('progress-fill').style.width = `${((currentQuestion + answered) / total) * 100}%`;
  const counter = document.getElementById('progress-count');
  if (counter) counter.textContent = `${currentQuestion + 1} / ${total}`;

  const navHtml = isLast
    ? `<div class="nav-buttons">
        ${currentQuestion > 0 ? '<button class="nav-btn prev" onclick="prevQuestion()">← 上一题</button>' : ''}
        <button class="nav-btn next" onclick="calculateResult()" ${sel === undefined ? 'disabled' : ''}>查看结果 🎉</button>
      </div>`
    : (currentQuestion > 0
      ? `<div class="nav-inline"><button class="nav-back" onclick="prevQuestion()">← 上一题</button></div>`
      : '');

  const html = `<div class="question-card">
    <div class="question-text">${q.text}</div>
    <div class="options">
      ${q.options.map((o, i) => `
        <button class="option-btn ${sel === i ? 'selected' : ''}" onclick="selectOption(${q.id},${i})" aria-label="选项${letters[i]}">
          <span class="option-letter">${letters[i]}</span><span class="option-text">${o.text}</span>
        </button>`).join('')}
    </div>
  </div>
  ${navHtml}
  <div class="swipe-hint" id="swipe-hint">← 左右滑动翻页 →</div>`;

  document.getElementById('test-content').innerHTML = html;
  const hint = document.getElementById('swipe-hint');
  if (hint && !('ontouchstart' in window)) hint.style.display = 'none';
  else if (hint) setTimeout(() => hint.style.opacity = '0', 3000);
}

function selectOption(qid, oid) {
  clearAdvance();
  answers[qid] = oid;
  renderQuestion();
  // Auto-advance after selection (except last question)
  const total = QUESTIONS.length;
  const isLast = currentQuestion === total - 1;
  if (!isLast) {
    advanceTimer = setTimeout(() => {
      advanceTimer = null;
      currentQuestion++;
      renderQuestion();
    }, 280);
  }
}

function prevQuestion() {
  clearAdvance();
  if (currentQuestion > 0) {
    currentQuestion--;
    renderQuestion();
  }
}

function nextQuestion() {
  clearAdvance();
  if (answers[QUESTIONS[currentQuestion].id] === undefined) return;
  if (currentQuestion < QUESTIONS.length - 1) {
    currentQuestion++;
    renderQuestion();
  } else {
    calculateResult();
  }
}

function scoreToSide(axis, score) {
  return score >= 0 ? axis.positive : axis.negative;
}

function getAxisMax(axisKey) {
  let max = 0;
  QUESTIONS.forEach(q => {
    if (q.axis === axisKey) {
      q.options.forEach(o => { if (Math.abs(o.score) > max) max = Math.abs(o.score); });
    }
  });
  const count = QUESTIONS.filter(q => q.axis === axisKey).length;
  return count * max;
}

function normalizeScore(score, axisKey) {
  const max = axisKey ? getAxisMax(axisKey) : 6;
  return Math.max(0, Math.min(100, Math.round(((score + max) / (max * 2)) * 100)));
}

function vectorKey(sides) {
  return AXIS_ORDER.map(axisKey => sides[axisKey].code).join('');
}

function calculateResult() {
  const loading = document.getElementById('loading');
  loading.classList.remove('hidden');

  const axisScores = {};
  AXIS_ORDER.forEach(axis => axisScores[axis] = 0);

  Object.entries(answers).forEach(([qid, oid]) => {
    const q = QUESTIONS.find(item => item.id === Number(qid));
    if (!q) return;
    axisScores[q.axis] += q.options[oid].score;
  });

  const axisSides = {};
  const axisPercents = {};
  AXIS_ORDER.forEach(axisKey => {
    const axis = AXES[axisKey];
    axisSides[axisKey] = scoreToSide(axis, axisScores[axisKey]);
    axisPercents[axisKey] = normalizeScore(axisScores[axisKey], axisKey);
  });

  const comboKey = vectorKey(axisSides);
  const primary = RESULT_TYPES[comboKey] || RESULT_TYPES.default;
  const rankings = getRankings(comboKey, axisPercents);

  setTimeout(() => {
    loading.classList.add('hidden');
    lastResult = {
      primary,
      rankings,
      axisSides,
      axisScores,
      axisPercents,
      comboKey,
    };
    try {
      sessionStorage.setItem('nmti-last-result', JSON.stringify(lastResult));
    } catch (_) {}
    navigateTo('result');
  }, 800);
}

function getRankings(comboKey, axisPercents) {
  const currentCodes = comboKey.split('');
  // 每个极性的理论中心：负极15%，正极85%
  const CENTER = { negative: 15, positive: 85 };
  const MAX_AXIS_DIST = 70; // 单个轴离理论中心的最远距离

  return Object.entries(RESULT_TYPES)
    .filter(([key]) => key !== 'default' && key !== comboKey)
    .map(([key, profile]) => {
      const codes = key.split('');
      let distSum = 0;
      let hamming = 0;
      for (let i = 0; i < codes.length; i++) {
        const axisKey = AXIS_ORDER[i];
        const axis = AXES[axisKey];
        const isPositive = codes[i] === axis.positive.code;
        const typeCenter = isPositive ? CENTER.positive : CENTER.negative;
        distSum += Math.abs(axisPercents[axisKey] - typeCenter);
        if (codes[i] !== currentCodes[i]) hamming++;
      }
      // 平均轴距离 → 连续相似度，避免多个人格被四舍五入到同一档
      const similarity = Math.max(1, Math.min(99, Math.round((1 - distSum / codes.length / MAX_AXIS_DIST) * 100)));
      return { ...profile, key, similarity, hamming };
    })
    .sort((a, b) => a.hamming - b.hamming || b.similarity - a.similarity)
    .slice(0, 3);
}

function renderStoredResult() {
  if (!lastResult) return;
  const { primary, rankings, axisSides, axisScores, axisPercents, comboKey } = lastResult;

  document.getElementById('result-hero').innerHTML = `
    <div class="result-figure">
      <img class="result-figure-img" src="${primary.image}" alt="${primary.name}" loading="eager">
      <div class="result-type-badge">${comboKey}</div>
    </div>
    <div class="result-hero-copy">
      <div class="result-type-name">${primary.name}</div>
      <div class="result-type-slogan">${primary.slogan}</div>
      <div class="confidence-badge">${primary.summary}</div>
      <div class="result-actions">
        <button class="share-btn primary" onclick="shareResult()">分享结果</button>
        <button class="share-btn" onclick="startTest()">重新测试</button>
        <button class="share-btn" onclick="goHome()">回到主页</button>
      </div>
    </div>
  `;

  document.getElementById('result-desc').innerHTML = `
    <h3>📝 人格画像</h3>
    <div class="result-desc">${primary.desc}</div>
    <div class="trait-tags">${primary.traits.map(t => `<span class="trait-tag">${t}</span>`).join('')}</div>
    <div class="profile-block">
      <div class="profile-lead">${primary.profile}</div>
      <div class="profile-advice">${primary.advice}</div>
    </div>
  `;
  // --- Workplace scenarios ---
  const wpEl = document.getElementById('result-workplace');
  if (wpEl && primary.workplace) {
    const wp = primary.workplace;
    wpEl.innerHTML = `<h3>🏢 职场行为模式</h3>` +
      (wp.title ? `<div class="workplace-title">${wp.title}</div>` : '') +
      `<ul class="workplace-list">` +
      (wp.scenarios || []).map(s =>
        `<li class="workplace-item">
          <span class="workplace-situation">${s.situation}</span>
          <span class="workplace-behavior">${s.behavior}</span>
        </li>`
      ).join('') +
      `</ul>`;
  }

  // --- Strengths & Weaknesses ---
  const pcEl = document.getElementById('result-pros-cons');
  if (pcEl && (primary.strengths || primary.weaknesses)) {
    const strengths = (primary.strengths || []).map(s => `<li>${s}</li>`).join('');
    const weaknesses = (primary.weaknesses || []).map(w => `<li>${w}</li>`).join('');
    pcEl.innerHTML = `<h3>⚖️ 优势与短板</h3>` +
      `<div class="pros-cons-grid">` +
      `<div class="pros-section"><h4>✅ 优势</h4><ul class="pros-list">${strengths || '<li>暂无数据</li>'}</ul></div>` +
      `<div class="cons-section"><h4>⚠️ 短板</h4><ul class="cons-list">${weaknesses || '<li>暂无数据</li>'}</ul></div>` +
      `</div>`;
  }

  // --- Growth tips ---
  const gEl = document.getElementById('result-growth');
  if (gEl && primary.growthTips) {
    gEl.innerHTML = `<h3>🌱 成长建议</h3>` +
      `<ul class="growth-list">` +
      primary.growthTips.map(t => `<li>${t}</li>`).join('') +
      `</ul>`;
  }

  // --- Compatibility ---
  const cEl = document.getElementById('result-compat');
  if (cEl && primary.compatibility) {
    const comp = primary.compatibility;
    const best = (comp.best || []).map(code => {
      const t = RESULT_TYPES[code];
      const name = t ? t.name : code;
      return `<span class="compat-badge compat-best" style="background:${t ? t.color : '#22c55e'}">${name}</span>`;
    }).join('');
    const challenging = (comp.challenging || []).map(code => {
      const t = RESULT_TYPES[code];
      const name = t ? t.name : code;
      return `<span class="compat-badge compat-challenging" style="background:${t ? t.color : '#ef4444'}">${name}</span>`;
    }).join('');
    cEl.innerHTML = `<h3>🤝 职场兼容性</h3>` +
      `<div class="compat-section">` +
      `<div class="compat-group"><h4>💚 最佳搭档</h4><div class="compat-badges">${best || '<span class="compat-placeholder">暂无数据</span>'}</div></div>` +
      `<div class="compat-group"><h4>🔴 需要磨合</h4><div class="compat-badges">${challenging || '<span class="compat-placeholder">暂无数据</span>'}</div></div>` +
      `</div>`;
  }

  renderAxisBars(axisSides, axisPercents);
  renderRadarChart(axisPercents, primary.color);

  document.getElementById('combo-type').innerHTML = rankings.map((t, i) => {
    const diffAxes = AXIS_ORDER
      .map((axisKey, idx) => ({ key: axisKey, same: t.key[idx] === comboKey[idx] }))
      .filter(item => !item.same)
      .map(item => AXES[item.key].name.replace('轴', ''));
    const diffText = diffAxes.length === 1 ? `只差${diffAxes[0]}` : `差 ${diffAxes.length} 轴`;
    return `
    <div class="rank-item rank-${i + 1}">
      <span class="rank-badge" style="background:${t.color}">${i + 1}</span>
      <img class="rank-image" src="${t.image}" alt="${t.name}" loading="lazy">
      <div class="rank-info">
        <span class="rank-name" style="color:${t.color}">${t.name}</span>
        <span class="rank-slogan">${t.slogan}</span>
      </div>
      <span class="rank-pct">${diffText}</span>
    </div>
  `;
  }).join('');

  window._shareText = `我在 NMTI 测出「${primary.name}」：${primary.slogan}\n四轴组合：${comboKey}\n${primary.summary}`;
}

function renderAxisBars(axisSides, axisPercents) {
  const html = AXIS_ORDER.map(axisKey => {
    const axis = AXES[axisKey];
    const side = axisSides[axisKey];
    const pct = axisPercents[axisKey];
    const isPositive = side === axis.positive;
    return `<div class="dim-group">
      <div class="dim-head">
        <span class="dim-group-title">${axis.icon} ${axis.name}</span>
        <span class="dim-value">${pct}%</span>
      </div>
      <div class="dim-scale">
        <span class="dim-end ${isPositive ? '' : 'is-active'}">${axis.negative.label}</span>
        <div class="dim-track">
          <div class="dim-marker ${isPositive ? 'is-positive' : 'is-negative'}" style="left:clamp(7px, ${pct}%, calc(100% - 7px))"></div>
        </div>
        <span class="dim-end ${isPositive ? 'is-active' : ''}">${axis.positive.label}</span>
      </div>
    </div>`;
  }).join('');

  document.getElementById('dimension-bars').innerHTML = html;
}

function renderRadarChart(scores, color) {
  const canvas = document.getElementById('radarChart');
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const sz = Math.min(360, canvas.parentElement.clientWidth - 20);
  canvas.style.width = sz + 'px';
  canvas.style.height = sz + 'px';
  canvas.width = sz * dpr;
  canvas.height = sz * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const cx = sz / 2, cy = sz / 2, R = sz * 0.36;
  const n = AXIS_ORDER.length, step = Math.PI * 2 / n;
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  const gc = isDark ? 'rgba(255,255,255,0.09)' : 'rgba(15,23,42,0.09)';
  const ac = isDark ? 'rgba(255,255,255,0.13)' : 'rgba(15,23,42,0.13)';
  const lc = isDark ? '#a7b2bf' : '#5b6675';

  ctx.clearRect(0, 0, sz, sz);
  for (let lv = 1; lv <= 4; lv++) {
    const r = (R / 4) * lv;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = i * step - Math.PI / 2;
      ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
    }
    ctx.closePath();
    ctx.strokeStyle = gc;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  AXIS_ORDER.forEach((axisKey, i) => {
    const a = i * step - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + R * Math.cos(a), cy + R * Math.sin(a));
    ctx.strokeStyle = ac;
    ctx.stroke();
  });

  ctx.font = `700 ${Math.max(11, Math.round(sz * 0.036))}px -apple-system, "PingFang SC", sans-serif`;
  ctx.fillStyle = lc;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  AXIS_ORDER.forEach((axisKey, i) => {
    const axis = AXES[axisKey];
    const a = i * step - Math.PI / 2;
    const lr = R + sz * 0.072;
    const lx = cx + lr * Math.cos(a);
    const ly = cy + lr * Math.sin(a);
    const cos = Math.cos(a);
    // 左右两侧的标签向内对齐，避免被画布边缘裁掉
    ctx.textAlign = cos > 0.3 ? 'left' : (cos < -0.3 ? 'right' : 'center');
    ctx.fillText(`${axis.icon} ${axis.name.replace('轴', '')}`, lx, ly);
  });
  ctx.textAlign = 'center';

  const pts = AXIS_ORDER.map((axisKey, i) => {
    const a = i * step - Math.PI / 2;
    const v = (scores[axisKey] || 0) / 100;
    return [cx + R * v * Math.cos(a), cy + R * v * Math.sin(a)];
  });

  ctx.beginPath();
  pts.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
  ctx.closePath();
  const grad = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
  grad.addColorStop(0, color + '55');
  grad.addColorStop(1, color + '22');
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.stroke();

  pts.forEach(([px, py]) => {
    ctx.beginPath();
    ctx.arc(px, py, 3.4, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = isDark ? 'rgba(13,15,18,0.9)' : '#fff';
    ctx.lineWidth = 1.6;
    ctx.stroke();
  });
}

function renderTypesGallery() {
  const g = document.getElementById('types-grid');
  if (!g) return;
  g.innerHTML = Object.values(RESULT_TYPES)
    .filter(item => item.key !== 'default')
    .map(t => `
      <div class="type-card type-card-image" style="border-top:3px solid ${t.color}">
        <div class="type-card-figure">
          <img src="${t.image}" alt="${t.name}" loading="lazy">
        </div>
        <div class="name" style="color:${t.color}">${t.name}</div>
        <div class="slogan">${t.slogan}</div>
      </div>
    `).join('');
  updateTypesDrawer();
  measureDrawerHeight();
}

// 折叠高度取「前两行卡片的真实底部边界」，逐卡测量避免行高不均导致第二行被裁
function measureDrawerHeight() {
  const drawer = document.getElementById('types-drawer');
  const grid = document.getElementById('types-grid');
  if (!drawer || !grid) return;
  const cards = Array.from(grid.children);
  if (!cards.length) return;
  const rects = cards.map(card => card.getBoundingClientRect());
  if (!rects[0].height) return; // 页面不可见时测不到，保留上一次的值
  const tops = [...new Set(rects.map(r => Math.round(r.top)))].sort((a, b) => a - b);
  if (tops.length < 2) {
    drawer.style.removeProperty('--collapsed-h');
    return;
  }
  const secondRowTop = tops[1];
  const rowBottom = Math.max(...rects.filter(r => Math.round(r.top) === secondRowTop).map(r => r.bottom));
  const h = rowBottom - rects[0].top + 2;
  drawer.style.setProperty('--collapsed-h', `${Math.round(h)}px`);
}

function updateTypesDrawer() {
  const drawer = document.getElementById('types-drawer');
  const btn = document.getElementById('types-toggle');
  if (!drawer || !btn) return;
  drawer.classList.toggle('is-expanded', typesDrawerExpanded);
  drawer.classList.toggle('is-collapsed', !typesDrawerExpanded);
  btn.setAttribute('aria-expanded', String(typesDrawerExpanded));
  btn.textContent = typesDrawerExpanded ? '收起 ▴' : '展开 ▾';
}

function toggleTypesDrawer() {
  typesDrawerExpanded = !typesDrawerExpanded;
  updateTypesDrawer();
}

function shareResult() {
  const text = window._shareText || 'NMTI 测评';
  if (navigator.share) navigator.share({ title: 'NMTI 4轴组合版', text, url: location.href });
  else if (navigator.clipboard) navigator.clipboard.writeText(text + '\n' + location.href).then(() => showToast('已复制'));
  else showToast('复制失败，请手动分享');
}

function showToast(msg) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2400);
}

document.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
  if (!document.getElementById('page-test')?.classList.contains('active')) return;
  if (e.key === 'ArrowLeft') prevQuestion();
  if (e.key === 'ArrowRight') nextQuestion();
  if (['1', '2', '3', '4'].includes(e.key)) {
    const b = document.querySelectorAll('.option-btn');
    if (b[+e.key - 1]) b[+e.key - 1].click();
  }
});

let rt;
window.addEventListener('resize', () => {
  clearTimeout(rt);
  rt = setTimeout(() => {
    measureDrawerHeight();
    if (!document.getElementById('page-result')?.classList.contains('active')) return;
    if (lastResult) renderRadarChart(lastResult.axisPercents, lastResult.primary?.color || '#f59e0b');
  }, 200);
});
