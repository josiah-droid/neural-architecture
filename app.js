/* ========================================
   Neural Architecture PWA — App Logic
   ======================================== */

// ---- Storage Helpers ----
const today = () => new Date().toISOString().split('T')[0];

function getData(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}
function setData(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
}

function getDayData(date) {
  return getData(`day-${date}`, {});
}
function setDayData(date, data) {
  setData(`day-${date}`, data);
}

// ---- Navigation ----
function navigateTo(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`view-${view}`).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const navBtn = document.querySelector(`.nav-btn[data-view="${view}"]`);
  if (navBtn) navBtn.classList.add('active');

  window.scrollTo(0, 0);

  if (view === 'today') refreshTodayView();
  if (view === 'checkin') setupCheckinView();
  if (view === 'supplements') loadSupplements();
  if (view === 'progress') refreshProgress();
  if (view === 'review') setupReview();
}

// ---- Toast ----
function showToast(msg) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}

// ---- Date Formatting ----
function formatDate(date) {
  const d = new Date(date + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function getPhase() {
  const now = new Date();
  const phase1End = new Date('2026-06-01');
  const phase2End = new Date('2026-09-01');
  if (now < phase1End) return { name: 'Phase 1 — San Diego Reset', num: 1 };
  if (now < phase2End) return { name: 'Phase 2 — Costa Rica Deep Work', num: 2 };
  return { name: 'Phase 3 — California Long-Term', num: 3 };
}

// ---- Today View ----
function refreshTodayView() {
  const d = today();
  const data = getDayData(d);
  const phase = getPhase();

  document.getElementById('date-line').textContent = formatDate(d);
  document.getElementById('phase-badge').textContent = phase.name;

  // Streak
  const streak = calculateStreak();
  document.getElementById('streak-number').textContent = streak;

  // Status cards
  updateStatusCard('sleep', data);
  updateStatusCard('mood', data);
  updateStatusCard('supps', data);
  updateStatusCard('move', data);

  // Check-in button state
  const hour = new Date().getHours();
  const morningDone = data.morningDone;
  const eveningDone = data.eveningDone;

  if (!morningDone) {
    document.getElementById('checkin-action-icon').textContent = '☀️';
    document.getElementById('checkin-action-title').textContent = 'Morning Check-In';
    document.getElementById('checkin-action-sub').textContent = 'Start your day with intention';
  } else if (!eveningDone) {
    document.getElementById('checkin-action-icon').textContent = '🌙';
    document.getElementById('checkin-action-title').textContent = 'Evening Check-In';
    document.getElementById('checkin-action-sub').textContent = 'Reflect and close out the day';
  } else {
    document.getElementById('checkin-action-icon').textContent = '✓';
    document.getElementById('checkin-action-title').textContent = 'Day Complete';
    document.getElementById('checkin-action-sub').textContent = 'Both check-ins done';
  }

  // Supplements sub
  const supps = data.supplements || {};
  const total = 7;
  const done = Object.values(supps).filter(v => v).length;
  document.getElementById('supps-action-sub').textContent = `${done}/${total} taken`;

  // Priorities
  const priorities = data.priorities || [];
  const priSection = document.getElementById('priorities-section');
  const priList = document.getElementById('priorities-list');
  if (priorities.length > 0) {
    priSection.style.display = 'block';
    priList.innerHTML = priorities.map((p, i) =>
      `<div class="priority-item"><span class="priority-num">${i + 1}</span>${escHtml(p)}</div>`
    ).join('');
  } else {
    priSection.style.display = 'none';
  }

  // Non-negotiables
  renderNonNegotiables(data);

  // Weekly review prompt (Sundays)
  const dayOfWeek = new Date().getDay();
  const weeklyDone = getData(`weekly-${getWeekKey()}`, null);
  document.getElementById('weekly-review-prompt').style.display =
    (dayOfWeek === 0 && !weeklyDone) ? 'block' : 'none';
}

function updateStatusCard(type, data) {
  const el = document.getElementById(`${type}-status-val`);
  const card = document.getElementById(`${type}-status`);
  card.className = 'status-card';

  switch (type) {
    case 'sleep': {
      if (data.sleepQuality) {
        el.textContent = `${data.sleepQuality}/5`;
        card.classList.add(data.sleepQuality >= 4 ? 'good' : data.sleepQuality >= 3 ? '' : 'bad');
      } else if (data.bedTime) {
        el.textContent = data.bedTime;
      } else {
        el.textContent = '—';
      }
      break;
    }
    case 'mood': {
      const mood = data.eveningMood || data.morningMood;
      if (mood) {
        el.textContent = `${mood}/5`;
        card.classList.add(mood >= 4 ? 'good' : mood >= 3 ? '' : 'bad');
      } else {
        el.textContent = '—';
      }
      break;
    }
    case 'supps': {
      const supps = data.supplements || {};
      const done = Object.values(supps).filter(v => v).length;
      el.textContent = `${done}/7`;
      card.classList.add(done >= 6 ? 'good' : done >= 4 ? '' : done > 0 ? 'warn' : '');
      break;
    }
    case 'move': {
      const m = data.movement;
      if (m && m !== 'none') {
        el.textContent = Array.isArray(m) ? m[0] : m;
        card.classList.add('good');
      } else if (m === 'none') {
        el.textContent = 'Rest';
        card.classList.add('warn');
      } else {
        el.textContent = '—';
      }
      break;
    }
  }
}

function renderNonNegotiables(data) {
  const nonNegs = [
    { key: 'nn-sleep', label: 'Same bedtime, same wake time (10:30 PM / 6:00 AM)' },
    { key: 'nn-phone', label: 'Phone in another room by 10 PM' },
    { key: 'nn-work', label: 'No work after 9:30 PM' },
    { key: 'nn-sunlight', label: 'Morning sunlight within 15 minutes' },
    { key: 'nn-movement', label: 'Daily movement' },
  ];

  const container = document.getElementById('non-neg-list');
  const saved = data.nonNegs || {};

  // Auto-fill from check-in data
  if (data.sunlight === 'yes') saved['nn-sunlight'] = true;
  if (data.phoneOut === 'yes') saved['nn-phone'] = true;
  if (data.workStop === 'yes') saved['nn-work'] = true;
  if (data.movement && data.movement !== 'none') saved['nn-movement'] = true;

  container.innerHTML = nonNegs.map(nn => {
    const done = saved[nn.key] ? 'done' : '';
    return `<div class="non-neg-item ${done}" onclick="toggleNonNeg('${nn.key}')">
      <div class="non-neg-check">${saved[nn.key] ? '✓' : ''}</div>
      <span class="non-neg-text">${nn.label}</span>
    </div>`;
  }).join('');
}

function toggleNonNeg(key) {
  const d = today();
  const data = getDayData(d);
  if (!data.nonNegs) data.nonNegs = {};
  data.nonNegs[key] = !data.nonNegs[key];
  setDayData(d, data);
  renderNonNegotiables(data);
}

// ---- Check-In View ----
function setupCheckinView() {
  const d = today();
  const data = getDayData(d);

  if (data.morningDone && !data.eveningDone) {
    document.getElementById('morning-checkin').style.display = 'none';
    document.getElementById('evening-checkin').style.display = 'block';
    document.getElementById('checkin-title').textContent = 'Evening Check-In';
  } else if (data.morningDone && data.eveningDone) {
    document.getElementById('morning-checkin').style.display = 'none';
    document.getElementById('evening-checkin').style.display = 'block';
    document.getElementById('checkin-title').textContent = 'Evening Check-In (Done)';
    // Load saved data
    loadEveningData(data);
  } else {
    document.getElementById('morning-checkin').style.display = 'block';
    document.getElementById('evening-checkin').style.display = 'none';
    document.getElementById('checkin-title').textContent = 'Morning Check-In';
    // Load saved data if any
    if (data.wakeTime) document.getElementById('wake-time').value = data.wakeTime;
    if (data.priorities) {
      data.priorities.forEach((p, i) => {
        const el = document.getElementById(`priority-${i + 1}`);
        if (el) el.value = p;
      });
    }
  }

  // Restore toggle states
  restoreToggles(data);
}

function loadEveningData(data) {
  if (data.bedTime) document.getElementById('bed-time').value = data.bedTime;
  if (data.eveningReflection) document.getElementById('evening-reflection').value = data.eveningReflection;
}

function restoreToggles(data) {
  const fieldMap = {
    sunlight: data.sunlight,
    adderall: data.adderall,
    'phone-out': data.phoneOut,
    'work-stop': data.workStop,
    caffeine: data.caffeine,
    alcohol: data.alcohol,
    'stim-chase': data.stimChase,
    creative: data.creative,
  };

  Object.entries(fieldMap).forEach(([field, val]) => {
    if (val) {
      const btns = document.querySelectorAll(`.toggle-btn[data-field="${field}"]`);
      btns.forEach(b => {
        b.classList.toggle('selected', b.dataset.value === val);
      });
    }
  });

  // Mood buttons
  if (data.morningMood) {
    document.querySelectorAll('.mood-btn:not([data-field])').forEach(b => {
      b.classList.toggle('selected', b.dataset.value === String(data.morningMood));
    });
  }
  ['sleep-quality', 'evening-mood'].forEach(field => {
    const val = field === 'sleep-quality' ? data.sleepQuality : data.eveningMood;
    if (val) {
      document.querySelectorAll(`.mood-btn[data-field="${field}"]`).forEach(b => {
        b.classList.toggle('selected', b.dataset.value === String(val));
      });
    }
  });

  // Movement (multi-select)
  if (data.movement) {
    const moves = Array.isArray(data.movement) ? data.movement : [data.movement];
    document.querySelectorAll('.toggle-btn[data-field="movement"]').forEach(b => {
      b.classList.toggle('selected', moves.includes(b.dataset.value));
    });
  }
}

function saveMorningCheckin() {
  const d = today();
  const data = getDayData(d);

  data.wakeTime = document.getElementById('wake-time').value;
  data.sunlight = getToggleValue('sunlight');
  data.morningMood = getMoodValue(document.querySelectorAll('#morning-checkin .mood-btn:not([data-field])'));
  data.adderall = getToggleValue('adderall');

  const priorities = [];
  for (let i = 1; i <= 3; i++) {
    const val = document.getElementById(`priority-${i}`).value.trim();
    if (val) priorities.push(val);
  }
  data.priorities = priorities;
  data.morningDone = true;

  // Auto-set non-negs
  if (!data.nonNegs) data.nonNegs = {};
  if (data.sunlight === 'yes') data.nonNegs['nn-sunlight'] = true;

  setDayData(d, data);
  showToast('Morning locked in');
  navigateTo('today');
}

function saveEveningCheckin() {
  const d = today();
  const data = getDayData(d);

  data.bedTime = document.getElementById('bed-time').value;
  data.sleepQuality = getMoodValue(document.querySelectorAll('.mood-btn[data-field="sleep-quality"]'));
  data.phoneOut = getToggleValue('phone-out');
  data.workStop = getToggleValue('work-stop');
  data.caffeine = getToggleValue('caffeine');
  data.alcohol = getToggleValue('alcohol');
  data.movement = getMovementValues();
  data.stimChase = getToggleValue('stim-chase');
  data.creative = getToggleValue('creative');
  data.eveningMood = getMoodValue(document.querySelectorAll('.mood-btn[data-field="evening-mood"]'));
  data.eveningReflection = document.getElementById('evening-reflection').value.trim();
  data.eveningDone = true;

  // Auto-set non-negs
  if (!data.nonNegs) data.nonNegs = {};
  if (data.phoneOut === 'yes') data.nonNegs['nn-phone'] = true;
  if (data.workStop === 'yes') data.nonNegs['nn-work'] = true;
  if (data.movement && data.movement !== 'none' && !(Array.isArray(data.movement) && data.movement.includes('none'))) {
    data.nonNegs['nn-movement'] = true;
  }

  setDayData(d, data);
  showToast('Day complete');
  navigateTo('today');
}

// ---- Supplements ----
function loadSupplements() {
  const d = today();
  const data = getDayData(d);
  const supps = data.supplements || {};

  document.querySelectorAll('[data-supp]').forEach(cb => {
    cb.checked = !!supps[cb.dataset.supp];
  });
}

function saveSupplements() {
  const d = today();
  const data = getDayData(d);
  const supps = {};
  document.querySelectorAll('[data-supp]').forEach(cb => {
    supps[cb.dataset.supp] = cb.checked;
  });
  data.supplements = supps;
  setDayData(d, data);
}

// ---- Weekly Review ----
function getWeekKey() {
  const d = new Date();
  const start = new Date(d.getFullYear(), 0, 1);
  const weekNum = Math.ceil(((d - start) / 86400000 + start.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${weekNum}`;
}

function setupReview() {
  const weekKey = getWeekKey();
  const saved = getData(`weekly-${weekKey}`, null);
  if (saved) {
    // Restore saved values
    Object.entries(saved).forEach(([field, val]) => {
      if (field.startsWith('r-') && field !== 'r-insight' && field !== 'r-debt-payment') {
        document.querySelectorAll(`.toggle-btn[data-field="${field}"]`).forEach(b => {
          b.classList.toggle('selected', b.dataset.value === val);
        });
      }
    });
    if (saved['r-insight']) document.getElementById('r-insight').value = saved['r-insight'];
    if (saved['r-debt-payment']) document.getElementById('r-debt-payment').value = saved['r-debt-payment'];
    updateFlagCounter(saved);
  }
}

function saveWeeklyReview() {
  const weekKey = getWeekKey();
  const review = {};

  ['r-sleep', 'r-projects', 'r-social', 'r-spending', 'r-irritability', 'r-stimulation'].forEach(field => {
    review[field] = getToggleValue(field);
  });

  review['r-insight'] = document.getElementById('r-insight').value.trim();
  review['r-debt-payment'] = document.getElementById('r-debt-payment').value;

  // Track debt payments
  if (review['r-debt-payment']) {
    const payments = getData('debt-payments', []);
    payments.push({ week: weekKey, amount: parseFloat(review['r-debt-payment']) || 0 });
    setData('debt-payments', payments);
  }

  setData(`weekly-${weekKey}`, review);
  showToast('Weekly review saved');
  navigateTo('today');
}

function updateFlagCounter(review) {
  let flags = 0;
  if (review['r-sleep'] === 'no') flags++;
  if (review['r-projects'] === 'yes') flags++;
  if (review['r-social'] === 'elevated') flags++;
  if (review['r-spending'] === 'yes') flags++;
  if (review['r-irritability'] === 'yes') flags++;
  if (review['r-stimulation'] === 'yes') flags++;

  const counter = document.getElementById('flag-counter');
  const countEl = document.getElementById('flag-count');
  const msgEl = document.getElementById('flag-message');

  countEl.textContent = flags;
  counter.className = 'flag-counter';

  if (flags >= 3) {
    counter.classList.add('danger');
    msgEl.textContent = 'Multiple flags. Pay attention. Consider what needs to change.';
  } else if (flags >= 1) {
    counter.classList.add('warning');
    msgEl.textContent = 'Some flags. Worth noting but not alarming.';
  } else {
    msgEl.textContent = 'All clear. Keep going.';
  }
}

// ---- Progress ----
function refreshProgress() {
  // Streaks
  document.getElementById('streak-sleep').textContent = calculateStreakFor('sleep');
  document.getElementById('streak-alcohol').textContent = calculateStreakFor('alcohol');
  document.getElementById('streak-movement').textContent = calculateStreakFor('movement');
  document.getElementById('streak-checkin').textContent = calculateStreak();

  // Charts
  renderMoodChart();
  renderSleepChart();
  renderCompliance();
  renderDebtTracker();
}

function calculateStreak() {
  let streak = 0;
  const d = new Date();
  while (true) {
    const key = d.toISOString().split('T')[0];
    const data = getDayData(key);
    if (data.morningDone || data.eveningDone) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

function calculateStreakFor(type) {
  let streak = 0;
  const d = new Date();
  while (true) {
    const key = d.toISOString().split('T')[0];
    const data = getDayData(key);
    let good = false;

    switch (type) {
      case 'sleep':
        good = data.bedTime && data.bedTime <= '23:00';
        break;
      case 'alcohol':
        good = data.alcohol === '0' || (!data.alcohol && data.eveningDone);
        break;
      case 'movement':
        good = data.movement && data.movement !== 'none' &&
               !(Array.isArray(data.movement) && data.movement.length === 1 && data.movement[0] === 'none');
        break;
    }

    if (good) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else if (data.morningDone || data.eveningDone) {
      break; // Had a check-in but didn't meet criteria
    } else {
      break; // No data
    }
  }
  return streak;
}

function renderMoodChart() {
  const container = document.getElementById('mood-chart');
  container.innerHTML = '';
  const days = getLast7Days();

  days.forEach(({ date, label }) => {
    const data = getDayData(date);
    const mood = data.eveningMood || data.morningMood || 0;
    const height = mood ? `${(mood / 5) * 80}%` : '4px';
    const bar = document.createElement('div');
    bar.className = 'chart-bar mood';
    bar.style.height = height;
    bar.innerHTML = `
      ${mood ? `<span class="chart-bar-value">${mood}</span>` : ''}
      <span class="chart-bar-label">${label}</span>
    `;
    container.appendChild(bar);
  });
}

function renderSleepChart() {
  const container = document.getElementById('sleep-chart');
  container.innerHTML = '';
  const days = getLast7Days();

  days.forEach(({ date, label }) => {
    const data = getDayData(date);
    const quality = data.sleepQuality || 0;
    const height = quality ? `${(quality / 5) * 80}%` : '4px';
    const bar = document.createElement('div');
    bar.className = 'chart-bar sleep';
    bar.style.height = height;
    bar.innerHTML = `
      ${quality ? `<span class="chart-bar-value">${quality}</span>` : ''}
      <span class="chart-bar-label">${label}</span>
    `;
    container.appendChild(bar);
  });
}

function renderCompliance() {
  const container = document.getElementById('compliance-bars');
  const days = getLast7Days();
  const areas = [
    { label: 'Sleep', check: d => d.bedTime && d.bedTime <= '23:00' },
    { label: 'Sunlight', check: d => d.sunlight === 'yes' },
    { label: 'Supps', check: d => { const s = d.supplements || {}; return Object.values(s).filter(v=>v).length >= 5; } },
    { label: 'Movement', check: d => d.movement && d.movement !== 'none' },
    { label: 'No alcohol', check: d => d.alcohol === '0' },
    { label: 'Phone out', check: d => d.phoneOut === 'yes' },
    { label: 'Work stop', check: d => d.workStop === 'yes' },
  ];

  container.innerHTML = areas.map(area => {
    let compliant = 0;
    let total = 0;
    days.forEach(({ date }) => {
      const data = getDayData(date);
      if (data.morningDone || data.eveningDone) {
        total++;
        if (area.check(data)) compliant++;
      }
    });
    const pct = total > 0 ? Math.round((compliant / total) * 100) : 0;
    return `<div class="compliance-row">
      <span class="compliance-label">${area.label}</span>
      <div class="compliance-track"><div class="compliance-fill" style="width:${pct}%"></div></div>
      <span class="compliance-pct">${pct}%</span>
    </div>`;
  }).join('');
}

function renderDebtTracker() {
  const startDebt = 3500;
  const payments = getData('debt-payments', []);
  const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const remaining = Math.max(0, startDebt - totalPaid);
  const pct = Math.min(100, (totalPaid / startDebt) * 100);

  document.getElementById('debt-bar').style.width = `${pct}%`;
  document.getElementById('debt-remaining').textContent = `$${remaining.toLocaleString()}`;
}

function getLast7Days() {
  const days = [];
  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push({
      date: d.toISOString().split('T')[0],
      label: dayLabels[d.getDay()]
    });
  }
  return days;
}

// ---- Helpers ----
function getToggleValue(field) {
  const selected = document.querySelector(`.toggle-btn[data-field="${field}"].selected`);
  return selected ? selected.dataset.value : null;
}

function getMoodValue(btns) {
  const selected = Array.from(btns).find(b => b.classList.contains('selected'));
  return selected ? parseInt(selected.dataset.value) : null;
}

function getMovementValues() {
  const selected = document.querySelectorAll('.toggle-btn[data-field="movement"].selected');
  const values = Array.from(selected).map(b => b.dataset.value);
  return values.length > 0 ? values : null;
}

function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---- Event Listeners ----
document.addEventListener('click', e => {
  // Toggle buttons (single select)
  if (e.target.classList.contains('toggle-btn') && !e.target.classList.contains('multi')) {
    const field = e.target.dataset.field;
    document.querySelectorAll(`.toggle-btn[data-field="${field}"]`).forEach(b => b.classList.remove('selected'));
    e.target.classList.add('selected');

    // Update flag counter in review
    if (field && field.startsWith('r-')) {
      const review = {};
      ['r-sleep', 'r-projects', 'r-social', 'r-spending', 'r-irritability', 'r-stimulation'].forEach(f => {
        review[f] = getToggleValue(f);
      });
      updateFlagCounter(review);
    }
    return;
  }

  // Toggle buttons (multi select - movement)
  if (e.target.classList.contains('toggle-btn') && e.target.classList.contains('multi')) {
    const val = e.target.dataset.value;
    if (val === 'none') {
      // Deselect others
      document.querySelectorAll('.toggle-btn[data-field="movement"]').forEach(b => b.classList.remove('selected'));
      e.target.classList.add('selected');
    } else {
      // Deselect "none"
      document.querySelector('.toggle-btn[data-field="movement"][data-value="none"]')?.classList.remove('selected');
      e.target.classList.toggle('selected');
    }
    return;
  }

  // Mood buttons
  if (e.target.classList.contains('mood-btn')) {
    const field = e.target.dataset.field;
    const selector = field
      ? `.mood-btn[data-field="${field}"]`
      : '#morning-checkin .mood-btn:not([data-field])';
    document.querySelectorAll(selector).forEach(b => b.classList.remove('selected'));
    e.target.classList.add('selected');
    return;
  }
});

// Supplement checkboxes
document.addEventListener('change', e => {
  if (e.target.dataset.supp) {
    saveSupplements();
  }
});

// ---- Service Worker ----
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ---- Init ----
refreshTodayView();
