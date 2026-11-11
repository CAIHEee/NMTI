// ============================================
// NMTI 4-axis app
// ============================================

let currentQuestion = 0;
let answers = {};
let lastResult = null;
let appBooted = false;
let typesDrawerExpanded = false;
let advanceTimer = null;
let renderedQuestionId = null;
const BASE_TITLE = 'NMTI 牛马人格测试';
const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
  window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  const tb = document.getElementById('theme-toggle');
  if (tb) tb.style.display = name === 'test' ? 'none' : '';
  if (name !== 'type') document.title = BASE_TITLE;
  if (name === 'landing') requestAnimationFrame(measureDrawerHeight);
}

function getRoute() {
  const route = location.hash.replace(/^#\/?/, '').replace(/\/$/, '');
  if (route === 'test' || route === 'result') return route;
  if (/^type\/[A-Za-z]{4}$/.test(route)) return 'type';
  return 'landing';
}

function getRouteTypeCode() {
  const match = location.hash.replace(/\/$/, '').match(/#\/?type\/([A-Za-z]{4})$/);
  return match ? match[1].toUpperCase() : '';
}

function isKnownType(code) {
  return /^[A-Z]{4}$/.test(code) && Object.prototype.hasOwnProperty.call(RESULT_TYPES, code) && code !== 'default';
}

function navigateTo(route) {
  const target = route === 'landing' ? '#/' : `#/${route}`;
  if (location.hash === target) handleRoute();
  else location.hash = target;
}

// 非法路由用 replace，避免把错误地址压进历史导致后退来回跳
function replaceRoute(target) {
  try {
    history.replaceState(null, '', `${location.pathname}${location.search}${target}`);
    handleRoute();
  } catch (_) {
    location.hash = target;
  }
}

function openType(code) {
  if (!isKnownType(code)) return;
  const target = `#/type/${code}`;
  if (location.hash === target) handleRoute();
  else location.hash = target;
}

function handleRoute() {
  clearAdvance();
  const route = getRoute();

  if (route === 'type') {
    const code = getRouteTypeCode();
    if (!isKnownType(code)) {
      replaceRoute('#/');
      return;
    }
    showPage('type');
    renderTypePage(code);
    return;
  }

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
      replaceRoute('#/');
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
  setTimeout(() => document.getElementById('types-grid')?.scrollIntoView({
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    block: 'start',
  }), 50);
}

function startTest() {
  clearAdvance();
  currentQuestion = 0;
  answers = {};
  lastResult = null;
  renderedQuestionId = null;
  try { sessionStorage.removeItem('nmti-last-result'); } catch (_) {}
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

  // 只有真正换题才播放入场动画，选中答案时的重绘不重播
  const isNewQuestion = renderedQuestionId !== q.id;
  renderedQuestionId = q.id;

  const html = `<div class="question-card${isNewQuestion ? ' is-new' : ''}">
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

// 理论极值归一化后，真实作答几乎不会全选同一极：
// 实测 3 万次随机作答，各轴百分比集中在 25%~75%（p5=28, p95=72）。
// 直接展示会让雷达图都接近正圆、数值像没测出东西，因此对偏差做增益放大。
const SCORE_GAIN = 1.7;

function normalizeScore(score, axisKey) {
  const max = axisKey ? getAxisMax(axisKey) : 6;
  const raw = ((score + max) / (max * 2)) * 100;
  const gained = 50 + (raw - 50) * SCORE_GAIN;
  return Math.max(2, Math.min(98, Math.round(gained)));
}

function vectorKey(sides) {
  return AXIS_ORDER.map(axisKey => sides[axisKey].code).join('');
}

function calculateResult() {
  const loading = document.getElementById('loading');
  loading.classList.remove('hidden', 'is-hiding');

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
    loading.classList.add('is-hiding');
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
    setTimeout(() => loading.classList.add('hidden'), 280);
  }, 720);
}

function getRankings(comboKey, axisPercents) {
  const currentCodes = comboKey.split('');
  // 理论中心取增益后的极值；MAX 与增益后的实际最远距离一致，保证 |pct-中心| 单调
  const CENTER = { negative: 2, positive: 98 };
  const MAX_AXIS_DIST = 96;

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

// ============================================
// 可复用区块：结果页与人格详情页共用
// ============================================
function profileCardHtml(type) {
  return `<h3>📝 人格画像</h3>
    <div class="result-desc">${type.desc}</div>
    <div class="trait-tags">${(type.traits || []).map(t => `<span class="trait-tag">${t}</span>`).join('')}</div>
    <div class="profile-block">
      <div class="profile-lead">${type.profile}</div>
      <div class="profile-advice">${type.advice}</div>
    </div>`;
}

function workplaceCardHtml(type) {
  const wp = type.workplace;
  if (!wp) return '';
  return `<h3>🏢 职场行为模式</h3>` +
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

function prosConsCardHtml(type) {
  if (!type.strengths && !type.weaknesses) return '';
  const strengths = (type.strengths || []).map(s => `<li>${s}</li>`).join('');
  const weaknesses = (type.weaknesses || []).map(w => `<li>${w}</li>`).join('');
  return `<h3>⚖️ 优势与短板</h3>` +
    `<div class="pros-cons-grid">` +
    `<div class="pros-section"><h4>✅ 优势</h4><ul class="pros-list">${strengths || '<li>暂无数据</li>'}</ul></div>` +
    `<div class="cons-section"><h4>⚠️ 短板</h4><ul class="cons-list">${weaknesses || '<li>暂无数据</li>'}</ul></div>` +
    `</div>`;
}

function growthCardHtml(type) {
  if (!type.growthTips) return '';
  return `<h3>🌱 成长建议</h3>` +
    `<ul class="growth-list">` + type.growthTips.map(t => `<li>${t}</li>`).join('') + `</ul>`;
}

// 人格色深浅不一，按底色亮度自动选黑/白文字，保证徽章可读
function relativeLuminance(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return 0;
  const int = parseInt(m[1], 16);
  const chans = [(int >> 16) & 255, (int >> 8) & 255, int & 255]
    .map(v => v / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * chans[0] + 0.7152 * chans[1] + 0.0722 * chans[2];
}

function contrastRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function readableOn(hex) {
  const lum = relativeLuminance(hex);
  const contrastWhite = 1.05 / (lum + 0.05);
  const contrastDark = (lum + 0.05) / (0.0116 + 0.05);
  return contrastDark >= contrastWhite ? '#111827' : '#ffffff';
}

function mixHex(hex, towardWhite, ratio) {
  const int = parseInt((hex || '#888888').slice(1), 16);
  const target = towardWhite ? 255 : 0;
  return '#' + [(int >> 16) & 255, (int >> 8) & 255, int & 255]
    .map(v => Math.round(v + (target - v) * ratio).toString(16).padStart(2, '0'))
    .join('');
}

// 品牌色直接当文字色在浅底上会不达标（如 #f59e0b 在白底仅 2.1:1），
// 这里按底色深浅把颜色往黑/白方向推到满足对比度为止，用作文字专用的 ink 色
function inkFor(hex, bg, min = 4.5) {
  if (contrastRatio(hex, bg) >= min) return hex;
  const towardWhite = relativeLuminance(bg) < 0.3;
  for (let r = 0.1; r <= 1.0001; r += 0.02) {
    const mixed = mixHex(hex, towardWhite, r);
    if (contrastRatio(mixed, bg) >= min) return mixed;
  }
  return towardWhite ? '#ffffff' : '#000000';
}

// 主题无关地提供两套文字色，由 CSS 按当前主题挑选
// 亮色下的最差底色是 result-hero 的浅灰渐变（约 #eef1f5），按它算才在卡片与 hero 上都达标
function typeInkVars(color) {
  return `--ink-dark:${inkFor(color, '#181c22')};--ink-light:${inkFor(color, '#eef1f5')}`;
}

function compatCardHtml(type) {
  const comp = type.compatibility;
  if (!comp) return '';
  const badge = (code, kind) => {
    const t = RESULT_TYPES[code];
    const name = t ? t.name : code;
    const color = t ? t.color : (kind === 'best' ? '#22c55e' : '#ef4444');
    return `<button type="button" class="compat-badge compat-${kind}" style="background:${color};color:${readableOn(color)}" onclick="openType('${code}')">${name}</button>`;
  };
  const best = (comp.best || []).map(c => badge(c, 'best')).join('');
  const challenging = (comp.challenging || []).map(c => badge(c, 'challenging')).join('');
  return `<h3>🤝 职场兼容性</h3>` +
    `<div class="compat-section">` +
    `<div class="compat-group"><h4>💚 最佳搭档</h4><div class="compat-badges">${best || '<span class="compat-placeholder">暂无数据</span>'}</div></div>` +
    `<div class="compat-group"><h4>🔴 需要磨合</h4><div class="compat-badges">${challenging || '<span class="compat-placeholder">暂无数据</span>'}</div></div>` +
    `</div>`;
}

function renderStoredResult() {
  if (!lastResult) return;
  const { primary, rankings, axisSides, axisPercents, comboKey } = lastResult;

  document.getElementById('result-hero').innerHTML = `
    <div class="result-figure">
      <img class="result-figure-img" src="${primary.image}" alt="${primary.name}" loading="eager">
      <div class="result-type-badge">${comboKey}</div>
    </div>
    <div class="result-hero-copy">
      <div class="result-type-name" style="${typeInkVars(primary.color)}">${primary.name}</div>
      <div class="result-type-slogan">${primary.slogan}</div>
      <div class="confidence-badge">${primary.summary}</div>
      <div class="result-actions">
        <button class="share-btn primary" onclick="shareResult()">分享结果</button>
        <button class="share-btn" onclick="startTest()">重新测试</button>
        <button class="share-btn" onclick="goHome()">回到主页</button>
      </div>
    </div>
  `;

  document.getElementById('result-desc').innerHTML = profileCardHtml(primary);
  document.getElementById('result-workplace').innerHTML = workplaceCardHtml(primary);
  document.getElementById('result-pros-cons').innerHTML = prosConsCardHtml(primary);
  document.getElementById('result-growth').innerHTML = growthCardHtml(primary);
  document.getElementById('result-compat').innerHTML = compatCardHtml(primary);

  renderAxisBars(axisSides, axisPercents);
  renderRadarChart(axisPercents, primary.color);

  document.getElementById('combo-type').innerHTML = rankings.map((t, i) => {
    const diffAxes = AXIS_ORDER
      .map((axisKey, idx) => ({ key: axisKey, same: t.key[idx] === comboKey[idx] }))
      .filter(item => !item.same)
      .map(item => AXES[item.key].name.replace('轴', ''));
    const diffText = diffAxes.length === 1 ? `只差${diffAxes[0]}` : `差 ${diffAxes.length} 轴`;
    return `
    <button type="button" class="rank-item rank-${i + 1}" onclick="openType('${t.key}')">
      <span class="rank-badge" style="background:${t.color};color:${readableOn(t.color)}" aria-hidden="true">${i + 1}</span>
      <img class="rank-image" src="${t.image}" alt="" loading="lazy">
      <span class="rank-info">
        <span class="rank-name" style="${typeInkVars(t.color)}">${t.name}</span>
        <span class="rank-slogan">${t.slogan}</span>
      </span>
      <span class="rank-pct">${diffText}</span>
    </button>
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
  // 画布内容读屏不可见，用文字替代描述四轴取值
  canvas.setAttribute('aria-label',
    '四轴雷达图：' + AXIS_ORDER.map(k => `${AXES[k].name} ${scores[k] || 0}%`).join('，'));
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
      <button type="button" class="type-card type-card-image" style="border-top:3px solid ${t.color};${typeInkVars(t.color)}" onclick="openType('${t.key}')">
        <span class="type-card-figure">
          <img src="${t.image}" alt="" loading="lazy">
        </span>
        <span class="name" style="${typeInkVars(t.color)}">${t.name}</span>
        <span class="slogan">${t.slogan}</span>
      </button>
    `).join('');
  updateTypesDrawer();
  measureDrawerHeight();
}

// 人格详情页（#/type/CODE）：与结果页共用同一套区块
function renderTypePage(code) {
  const type = RESULT_TYPES[code];
  const el = document.getElementById('type-detail');
  if (!type || !el) return;
  document.title = `${type.name} · NMTI 牛马人格测试`;

  const cards = [
    profileCardHtml(type),
    workplaceCardHtml(type),
    prosConsCardHtml(type),
  ].filter(Boolean).map(html => `<div class="result-card">${html}</div>`).join('');

  const sideCards = [growthCardHtml(type), compatCardHtml(type)].filter(Boolean);

  el.innerHTML = `
    <div class="result-hero">
      <div class="result-figure">
        <img class="result-figure-img" src="${type.image}" alt="${type.name}">
        <div class="result-type-badge">${code}</div>
      </div>
      <div class="result-hero-copy">
        <div class="result-type-name" style="${typeInkVars(type.color)}">${type.name}</div>
        <div class="result-type-slogan">${type.slogan}</div>
        <div class="confidence-badge">${type.summary}</div>
        <div class="result-actions">
          <button class="share-btn primary" onclick="startTest()">测测我是哪种</button>
          <button class="share-btn" onclick="goHome()">回到主页</button>
        </div>
      </div>
    </div>
    ${cards}
    ${sideCards.length ? `<div class="result-row"${sideCards.length === 1 ? ' style="grid-template-columns:1fr"' : ''}>${
      sideCards.map(html => `<div class="result-card">${html}</div>`).join('')
    }</div>` : ''}
  `;
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
  syncDrawerFocusability();
}

// 折叠状态下，被裁掉的卡片不能进入 Tab 序（否则焦点会跑到看不见的位置）
function syncDrawerFocusability() {
  const drawer = document.getElementById('types-drawer');
  const grid = document.getElementById('types-grid');
  if (!drawer || !grid || !drawer.getBoundingClientRect().height) return;
  const limit = drawer.getBoundingClientRect().bottom;
  Array.from(grid.children).forEach(card => {
    const hidden = card.getBoundingClientRect().bottom > limit + 2;
    if (hidden) card.setAttribute('inert', '');
    else card.removeAttribute('inert');
  });
}

function clearDrawerInert() {
  document.querySelectorAll('#types-grid > *').forEach(card => card.removeAttribute('inert'));
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
  if (typesDrawerExpanded) clearDrawerInert();
  else setTimeout(syncDrawerFocusability, 400); // 等 max-height 过渡结束再判定可见性
}

// ============================================
// 分享海报（1080×1440）
// ============================================
const POSTER_W = 1080;
const POSTER_H = 1440;
const FONT_STACK = '-apple-system, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';

function withAlpha(hex, alpha) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return `rgba(245,158,11,${alpha})`;
  const int = parseInt(m[1], 16);
  return `rgba(${(int >> 16) & 255},${(int >> 8) & 255},${int & 255},${alpha})`;
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => reject(new Error('image timeout')), 4000);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); reject(new Error('image error')); };
    img.src = src;
  });
}

async function buildPoster(result) {
  const { primary, axisPercents, comboKey } = result;
  const color = primary.color || '#f59e0b';
  const W = POSTER_W, H = POSTER_H;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // 背景：深色底 + 人格色光晕
  ctx.fillStyle = '#0d0f12';
  ctx.fillRect(0, 0, W, H);
  let g = ctx.createRadialGradient(W * 0.18, H * 0.1, 0, W * 0.18, H * 0.1, W * 0.95);
  g.addColorStop(0, withAlpha(color, 0.34));
  g.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  g = ctx.createRadialGradient(W * 0.92, 0, 0, W * 0.92, 0, W * 0.75);
  g.addColorStop(0, 'rgba(14,165,233,0.22)');
  g.addColorStop(1, 'rgba(14,165,233,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // 顶部标识
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = withAlpha(color, 0.95);
  ctx.font = `800 26px ${FONT_STACK}`;
  ctx.fillText('NMTI · 牛马人格测试', 80, 96);

  // 人格立绘
  const artW = 400, artH = 533, artX = (W - artW) / 2, artY = 148;
  try {
    const img = await loadImage(primary.image);
    ctx.save();
    roundRectPath(ctx, artX, artY, artW, artH, 30);
    ctx.clip();
    ctx.drawImage(img, artX, artY, artW, artH);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 2;
    roundRectPath(ctx, artX, artY, artW, artH, 30);
    ctx.stroke();
  } catch (_) { /* 图片缺失时留空，不影响其余排版 */ }

  // 类型编码
  ctx.font = `800 24px ${FONT_STACK}`;
  const codeW = ctx.measureText(comboKey).width + 44;
  ctx.fillStyle = 'rgba(13,15,18,0.82)';
  roundRectPath(ctx, artX + 24, artY + artH - 72, codeW, 48, 24);
  ctx.fill();
  ctx.fillStyle = withAlpha(color, 1);
  ctx.textAlign = 'center';
  ctx.fillText(comboKey, artX + 24 + codeW / 2, artY + artH - 39);

  // 类型名与口号
  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  ctx.font = `900 88px ${FONT_STACK}`;
  ctx.fillText(primary.name, W / 2, 786);
  ctx.fillStyle = '#9aa5b1';
  ctx.font = `400 30px ${FONT_STACK}`;
  ctx.fillText(primary.slogan, W / 2, 840);

  // 四轴刻度
  const barY = 944, rowH = 82, barX = 280, barW = 470;
  AXIS_ORDER.forEach((axisKey, i) => {
    const axis = AXES[axisKey];
    const pct = axisPercents[axisKey] || 0;
    const y = barY + i * rowH;
    const side = pct >= 50 ? axis.positive : axis.negative;

    ctx.textAlign = 'left';
    ctx.fillStyle = '#9aa5b1';
    ctx.font = `700 24px ${FONT_STACK}`;
    ctx.fillText(axis.name.replace('轴', ''), 96, y + 9);

    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    roundRectPath(ctx, barX, y - 4, barW, 8, 4);
    ctx.fill();

    const mx = barX + (barW - 26) * (pct / 100) + 13;
    ctx.fillStyle = withAlpha(color, 1);
    ctx.beginPath();
    ctx.arc(mx, y, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0d0f12';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.textAlign = 'right';
    ctx.fillStyle = '#e2e8f0';
    ctx.font = `800 24px ${FONT_STACK}`;
    ctx.fillText(`${side.label} ${pct}%`, W - 96, y + 9);
  });

  // 页脚
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.34)';
  ctx.font = `600 24px ${FONT_STACK}`;
  ctx.fillText('4 轴 · 16 型 · 30 题', W / 2, 1316);
  ctx.fillStyle = withAlpha(color, 0.9);
  ctx.font = `800 26px ${FONT_STACK}`;
  ctx.fillText('caiheee.github.io/NMTI', W / 2, 1362);

  return canvas;
}

function canvasToBlob(canvas) {
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

async function shareResult() {
  if (!lastResult) return;
  showToast('正在生成分享图…');
  let canvas;
  try {
    canvas = await buildPoster(lastResult);
  } catch (_) {
    canvas = null;
  }

  const text = window._shareText || 'NMTI 牛马人格测试';

  if (!canvas) {
    if (navigator.clipboard) navigator.clipboard.writeText(`${text}\n${location.href}`).then(() => showToast('已复制'));
    else showToast('生成图片失败');
    return;
  }

  const blob = await canvasToBlob(canvas);
  if (!blob) {
    showToast('生成图片失败');
    return;
  }
  const filename = `NMTI-${lastResult.comboKey}-${lastResult.primary.name}.png`;
  const file = new File([blob], filename, { type: 'image/png' });
  // 触屏设备走系统分享面板；桌面端直接下载，避免唤起意料之外的分享窗
  const preferShareSheet = window.matchMedia('(pointer: coarse)').matches;

  if (preferShareSheet && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'NMTI 牛马人格测试', text });
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return;
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  showToast('分享图已保存');
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
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => t.classList.remove('show'), 2400);
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
