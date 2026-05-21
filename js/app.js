// ============================================
// NMTI 4-axis app
// ============================================

let currentQuestion = 0;
let answers = {};
let lastResult = null;
let appBooted = false;
let typesDrawerExpanded = false;

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
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
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
  currentQuestion = 0;
  answers = {};
  lastResult = null;
  navigateTo('test');
}

function renderQuestion() {
  const q = QUESTIONS[currentQuestion];
  if (!q) return;
  const total = QUESTIONS.length;
  document.getElementById('progress-fill').style.width = `${(currentQuestion / total) * 100}%`;
  document.getElementById('progress-text').textContent = `第 ${currentQuestion + 1} 题 / 共 ${total} 题`;
  const letters = ['A', 'B', 'C', 'D'];
  const sel = answers[q.id];
  const isLast = currentQuestion === total - 1;

  const html = `<div class="question-card">
    <div class="question-num">第 ${currentQuestion + 1} 题 / 共 ${total} 题</div>
    <div class="question-text">${q.text}</div>
    <div class="options">
      ${q.options.map((o, i) => `
        <button class="option-btn ${sel === i ? 'selected' : ''}" onclick="selectOption(${q.id},${i})" aria-label="选项${letters[i]}">
          <span class="option-letter">${letters[i]}</span><span class="option-text">${o.text}</span>
        </button>`).join('')}
    </div>
  </div>
  <div class="nav-buttons">
    ${currentQuestion > 0 ? '<button class="nav-btn prev" onclick="prevQuestion()">← 上一题</button>' : '<div></div>'}
    <button class="nav-btn next" onclick="nextQuestion()" ${sel === undefined ? 'disabled' : ''}>${isLast ? '查看结果 🎉' : '下一题 →'}</button>
  </div>
  <div class="swipe-hint" id="swipe-hint">← 左右滑动翻页 →</div>`;

  document.getElementById('test-content').innerHTML = html;
  const hint = document.getElementById('swipe-hint');
  if (hint && !('ontouchstart' in window)) hint.style.display = 'none';
  else if (hint) setTimeout(() => hint.style.opacity = '0', 3000);
}

function selectOption(qid, oid) {
  answers[qid] = oid;
  renderQuestion();
}

function prevQuestion() {
  if (currentQuestion > 0) {
    currentQuestion--;
    renderQuestion();
  }
}

function nextQuestion() {
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

function normalizeScore(score) {
  const max = 6; // 3 positive picks at +2
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
    axisPercents[axisKey] = normalizeScore(axisScores[axisKey]);
  });

  const comboKey = vectorKey(axisSides);
  const primary = RESULT_TYPES[comboKey] || RESULT_TYPES.default;
  const rankings = getRankings(comboKey);

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

function getRankings(comboKey) {
  const currentCodes = comboKey.split('');
  return Object.entries(RESULT_TYPES)
    .filter(([key]) => key !== 'default')
    .map(([key, profile]) => {
      const codes = key.split('');
      let distance = 0;
      for (let i = 0; i < codes.length; i++) {
        if (codes[i] !== currentCodes[i]) distance++;
      }
      return { ...profile, key, distance };
    })
    .sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name))
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
      <div class="confidence-badge">组合命中 · ${primary.summary}</div>
      <div class="result-actions">
        <button class="share-btn primary" onclick="shareResult()">复制分享</button>
        <button class="share-btn" onclick="startTest()">重新测试</button>
        <button class="share-btn" onclick="goHome()">回到主页</button>
      </div>
    </div>
  `;

  document.getElementById('result-desc').innerHTML = `
    <div class="result-desc">${primary.desc}</div>
    <div class="trait-tags">${primary.traits.map(t => `<span class="trait-tag">${t}</span>`).join('')}</div>
    <div class="mbti-ref">💡 ${primary.advice}</div>
  `;

  document.getElementById('result-advice').innerHTML = `
    <div class="advice-box">💡 职场画像：${primary.profile}</div>
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

  renderAxisBars(axisSides, axisScores, axisPercents);
  renderRadarChart(axisPercents, primary.color);

  document.getElementById('combo-type').innerHTML = rankings.map((t, i) => `
    <div class="rank-item rank-${i + 1}">
      <span class="rank-badge" style="background:${t.color}">${i + 1}</span>
      <img class="rank-image" src="${t.image}" alt="${t.name}" loading="lazy">
      <div class="rank-info">
        <span class="rank-name" style="color:${t.color}">${t.name}</span>
        <span class="rank-slogan">${t.slogan}</span>
      </div>
      <span class="rank-pct">${Math.max(0, 100 - t.distance * 22)}%</span>
    </div>
  `).join('');

  window._shareText = `我在 NMTI 测出「${primary.name}」：${primary.slogan}\n四轴组合：${comboKey}\n${primary.summary}`;
}

function renderAxisBars(axisSides, axisScores, axisPercents) {
  const levelColor = { negative: '#f59e0b', positive: '#3b82f6' };
  const html = AXIS_ORDER.map(axisKey => {
    const axis = AXES[axisKey];
    const side = axisSides[axisKey];
    const pct = axisPercents[axisKey];
    return `<div class="dim-group">
      <div class="dim-group-title">${axis.icon} ${axis.name}</div>
      <div class="dim-bar">
        <span class="dim-label">${side.short}型</span>
        <div class="dim-track"><div class="dim-fill" style="width:${pct}%;background:${levelColor[side === axis.positive ? 'positive' : 'negative']}"></div></div>
        <span class="dim-value">${pct}%</span>
      </div>
      <div class="axis-note">${axis.negative.label} / ${axis.positive.label}</div>
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
  const cx = sz / 2, cy = sz / 2, R = sz * 0.34;
  const n = AXIS_ORDER.length, step = Math.PI * 2 / n;
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  const gc = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const ac = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)';
  const lc = isDark ? '#94a3b8' : '#64748b';

  ctx.clearRect(0, 0, sz, sz);
  for (let lv = 1; lv <= 5; lv++) {
    const r = (R / 5) * lv;
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

  ctx.font = `${Math.max(10, sz * 0.03)}px -apple-system, "PingFang SC", sans-serif`;
  ctx.fillStyle = lc;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  AXIS_ORDER.forEach((axisKey, i) => {
    const axis = AXES[axisKey];
    const a = i * step - Math.PI / 2;
    const lr = R + sz * 0.06;
    ctx.fillText(axis.name, cx + lr * Math.cos(a), cy + lr * Math.sin(a));
  });

  ctx.beginPath();
  AXIS_ORDER.forEach((axisKey, i) => {
    const a = i * step - Math.PI / 2;
    const v = (scores[axisKey] || 0) / 100;
    const px = cx + R * v * Math.cos(a);
    const py = cy + R * v * Math.sin(a);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.closePath();
  ctx.fillStyle = color + '33';
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
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

function calcCombinationCount() {
  return 16;
}

document.addEventListener('keydown', e => {
  if (!document.getElementById('page-test')?.classList.contains('active')) return;
  if (e.key === 'Enter') {
    const b = document.querySelector('.nav-btn.next:not(:disabled)');
    if (b) b.click();
  }
  if (e.key === 'ArrowRight' || e.key === 'd') nextQuestion();
  if (e.key === 'ArrowLeft' || e.key === 'a') prevQuestion();
  if (['1', '2', '3', '4'].includes(e.key)) {
    const b = document.querySelectorAll('.option-btn');
    if (b[+e.key - 1]) b[+e.key - 1].click();
  }
});

let rt;
window.addEventListener('resize', () => {
  clearTimeout(rt);
  rt = setTimeout(() => {
    if (!document.getElementById('page-result')?.classList.contains('active')) return;
    if (lastResult) renderRadarChart(lastResult.axisPercents, lastResult.primary?.color || '#f59e0b');
  }, 200);
});
