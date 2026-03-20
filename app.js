// ============================================================
//  Better Me — Daily Practice App
//  Pure ES6+, no frameworks, localStorage persistence.
// ============================================================

// ---- Constants ------------------------------------------------
const STORAGE = {
  PROFILE:   'bm_profile',
  LAST_DATE: 'bm_lastDate',
  TASK:      'bm_currentTask',
  TASK_TYPE: 'bm_currentTaskType',
  USED:      'bm_usedTasks',
  COMPLETED: 'bm_completed',
  STREAK:    'bm_streak',
  STREAK_DATE: 'bm_streakDate',
};

const TYPES = ['explorer', 'zen_master', 'achiever', 'creator', 'altruist'];

const TYPE_META = {
  explorer:  { name: 'Исследователь', emoji: '🧭', desc: 'Вы тянетесь к новому, непознанному и необычному. Ваша сила — curiosity и жажда открытий.' },
  zen_master:{ name: 'Созерцатель',   emoji: '🌿', desc: 'Вы цените покой и момент «сейчас». Ваша сила — осознанность и внутреннее равновесие.' },
  achiever:  { name: 'Стратег',       emoji: '🎯', desc: 'Вы действуете системно и целеустремлённо. Ваша сила — дисциплина и эффективность.' },
  creator:   { name: 'Творец',        emoji: '🎨', desc: 'Вы видите мир как холст. Ваша сила — воображение и способность создавать красоту.' },
  altruist:  { name: 'Эмпат',         emoji: '💛', desc: 'Вы ощущаете людей глубоко. Ваша сила — сочувствие, забота и тепло.' },
  universal: { name: 'Универсал',     emoji: '✨', desc: 'Вы гармонично сочетаете все стороны личности. Вы одинаково открыты к любым практикам.' },
};

// Prettier date string in Russian locale
function todayStr() {
  return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
}

function formatDisplayDate() {
  return new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
}

// ---- Load JSON data -------------------------------------------
let questions = [];
let tasks = {};

async function loadData() {
  const [q, t] = await Promise.all([
    fetch('questions.json').then(r => r.json()),
    fetch('tasks.json').then(r => r.json()),
  ]);
  questions = q;
  tasks = t.daily_practices;
}

// ---- localStorage helpers -------------------------------------
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
}

function load(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw !== null ? JSON.parse(raw) : fallback;
  } catch (_) { return fallback; }
}

// ---- Personality scoring --------------------------------------
function calcProfile(answers) {
  // answers: array of type strings in order
  const counts = {};
  TYPES.forEach(t => (counts[t] = 0));
  answers.forEach(t => { counts[t] = (counts[t] || 0) + 1; });

  const total = answers.length;
  const profile = {};
  TYPES.forEach(t => (profile[t] = counts[t] / total));
  return profile;
}

function dominantType(profile) {
  const max = Math.max(...TYPES.map(t => profile[t]));
  const leaders = TYPES.filter(t => profile[t] === max);
  // If more than one type shares the max, it's a tie → universal
  if (leaders.length > 1) return 'universal';
  return leaders[0];
}

// ---- Task selection algorithm (50/50) -------------------------
function selectTask(profile) {
  const usedTasks = load(STORAGE.USED, []);

  function pickFrom(type) {
    const pool = tasks[type] || [];
    const available = pool.filter(t => !usedTasks.includes(t));
    if (!available.length) return null;
    return available[Math.floor(Math.random() * available.length)];
  }

  function weightedRandomType(profile) {
    // Build cumulative thresholds
    const sorted = TYPES.map(t => ({ type: t, weight: profile[t] }))
                        .filter(x => x.weight > 0);
    const r = Math.random();
    let cum = 0;
    for (const { type, weight } of sorted) {
      cum += weight;
      if (r <= cum) return type;
    }
    return sorted[sorted.length - 1].type;
  }

  const roll = Math.random();
  let chosen = null;
  let chosenType = null;

  if (roll <= 0.5) {
    // 50% — strongest type (сильные стороны)
    const strongest = TYPES.reduce((a, b) => profile[a] >= profile[b] ? a : b);
    chosen = pickFrom(strongest);
    chosenType = strongest;
  }

  if (!chosen) {
    // 50% weighted random (or fallback if strongest had no available tasks)
    for (let attempt = 0; attempt < TYPES.length * 2; attempt++) {
      const t = weightedRandomType(profile);
      const task = pickFrom(t);
      if (task) { chosen = task; chosenType = t; break; }
    }
  }

  // Last resort: pick absolutely anything not used
  if (!chosen) {
    for (const t of TYPES) {
      const task = pickFrom(t);
      if (task) { chosen = task; chosenType = t; break; }
    }
  }

  // If everything is exhausted, reset usedTasks and try again
  if (!chosen) {
    save(STORAGE.USED, []);
    return selectTask(profile);
  }

  return { task: chosen, type: chosenType };
}

// ---- Streak helpers -------------------------------------------
function updateStreak(completed) {
  if (!completed) return load(STORAGE.STREAK, 0);
  const today = todayStr();
  const lastDate = load(STORAGE.STREAK_DATE, null);
  let streak = load(STORAGE.STREAK, 0);

  if (!lastDate) {
    streak = 1;
  } else {
    const diff = (new Date(today) - new Date(lastDate)) / 86400000;
    if (diff === 1) streak += 1;
    else if (diff > 1) streak = 1;
    // same day → no change
  }

  save(STORAGE.STREAK, streak);
  save(STORAGE.STREAK_DATE, today);
  return streak;
}

// ============================================================
//  UI LOGIC
// ============================================================

// ---- Screen transitions ---------------------------------------
function showScreen(id) {
  document.querySelectorAll('.screen.active').forEach(s => {
    s.classList.add('exit');
    s.classList.remove('active');
    setTimeout(() => s.classList.remove('exit'), 400);
  });
  const next = document.getElementById(id);
  setTimeout(() => {
    next.classList.add('active');
  }, 50);
}

// ---- Profile Chart builder ------------------------------------
function buildChart(profile, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  TYPES.forEach(type => {
    const pct = Math.round((profile[type] || 0) * 100);
    const meta = TYPE_META[type];
    const row = document.createElement('div');
    row.className = 'chart-row';
    row.innerHTML = `
      <span class="chart-label" data-type="${type}">${meta.emoji} ${meta.name}</span>
      <div class="chart-bar-wrap">
        <div class="chart-bar-fill bar-${type}" style="width:0%"></div>
      </div>
      <span class="chart-pct">${pct}%</span>
    `;
    container.appendChild(row);
    // Animate after a tiny delay
    requestAnimationFrame(() => {
      setTimeout(() => {
        row.querySelector('.chart-bar-fill').style.width = pct + '%';
      }, 80);
    });
  });
}

// ---- Results screen -------------------------------------------
function showResults(profile) {
  const dominant = dominantType(profile);
  const meta = TYPE_META[dominant];

  document.getElementById('result-emoji').textContent = meta.emoji;
  document.getElementById('result-name').textContent = meta.name;
  document.getElementById('result-desc').textContent = meta.desc;

  buildChart(profile, 'profile-chart');

  showScreen('screen-results');

  document.getElementById('btn-go-task').onclick = () => showTaskScreen(profile);
}

// ---- Task screen ----------------------------------------------
function showTaskScreen(profile) {
  const today = todayStr();
  const lastDate = load(STORAGE.LAST_DATE, null);
  const isCompleted = load(STORAGE.COMPLETED, false);

  let taskText, taskType;

  if (lastDate === today && load(STORAGE.TASK, null)) {
    // Already have today's task
    taskText = load(STORAGE.TASK);
    taskType = load(STORAGE.TASK_TYPE, 'explorer');
  } else {
    // New day or fresh start — pick a new task
    const result = selectTask(profile);
    taskText = result.task;
    taskType = result.type;

    save(STORAGE.TASK, taskText);
    save(STORAGE.TASK_TYPE, taskType);
    save(STORAGE.LAST_DATE, today);
    save(STORAGE.COMPLETED, false);
  }

  const typeMeta = TYPE_META[taskType] || TYPE_META['explorer'];
  const badge = document.getElementById('task-type-badge');
  badge.textContent = `${typeMeta.emoji} ${typeMeta.name}`;
  badge.setAttribute('data-type', taskType);

  document.getElementById('task-text').textContent = taskText;
  document.getElementById('task-date').textContent = formatDisplayDate();

  // Show completed overlay if already done today
  const overlay = document.getElementById('task-done-overlay');
  const completeBtn = document.getElementById('btn-complete');

  const alreadyDone = load(STORAGE.COMPLETED, false);
  if (alreadyDone) {
    overlay.classList.add('visible');
    completeBtn.disabled = true;
  } else {
    overlay.classList.remove('visible');
    completeBtn.disabled = false;
  }

  // Streak
  const streak = load(STORAGE.STREAK, 0);
  document.getElementById('streak-count').textContent = streak;

  showScreen('screen-task');
}

// ---- Complete task button -------------------------------------
function setupCompleteButton() {
  document.getElementById('btn-complete').addEventListener('click', () => {
    // Add to usedTasks
    const taskText = load(STORAGE.TASK, '');
    const used = load(STORAGE.USED, []);
    if (taskText && !used.includes(taskText)) {
      used.push(taskText);
      save(STORAGE.USED, used);
    }

    save(STORAGE.COMPLETED, true);

    const newStreak = updateStreak(true);
    document.getElementById('streak-count').textContent = newStreak;

    const overlay = document.getElementById('task-done-overlay');
    overlay.classList.add('visible');
    document.getElementById('btn-complete').disabled = true;
  });
}

// ---- Profile panel --------------------------------------------
function setupProfilePanel() {
  const panel = document.getElementById('profile-panel');
  document.getElementById('btn-profile').addEventListener('click', () => {
    const profile = load(STORAGE.PROFILE, null);
    if (profile) buildChart(profile, 'profile-chart-mini');
    panel.classList.remove('hidden');
  });
  document.getElementById('btn-close-profile').addEventListener('click', () => {
    panel.classList.add('hidden');
  });
  panel.addEventListener('click', e => {
    if (e.target === panel) panel.classList.add('hidden');
  });
}

// ---- Reset (retake test) --------------------------------------
function setupReset() {
  document.getElementById('btn-reset').addEventListener('click', () => {
    Object.values(STORAGE).forEach(k => localStorage.removeItem(k));
    document.getElementById('profile-panel').classList.add('hidden');
    currentAnswers = [];
    currentQuestion = 0;
    showScreen('screen-welcome');
  });
}

// ---- Test flow ------------------------------------------------
let currentQuestion = 0;
let currentAnswers = [];

function renderQuestion(index) {
  const q = questions[index];
  const total = questions.length;

  document.getElementById('test-counter').textContent = `${index + 1} / ${total}`;
  document.getElementById('progress-bar').style.width = `${(index / total) * 100}%`;
  document.getElementById('question-text').textContent = q.question;

  const list = document.getElementById('answers-list');
  list.innerHTML = '';

  q.answers.forEach(ans => {
    const btn = document.createElement('button');
    btn.className = 'answer-btn';
    btn.textContent = ans.text;
    btn.addEventListener('click', () => handleAnswer(ans.type));
    list.appendChild(btn);
  });
}

function handleAnswer(type) {
  currentAnswers.push(type);
  currentQuestion++;

  if (currentQuestion >= questions.length) {
    finishTest();
  } else {
    // Brief slide effect: fade card
    const card = document.getElementById('question-card');
    card.style.opacity = '0';
    card.style.transform = 'translateX(20px)';
    setTimeout(() => {
      renderQuestion(currentQuestion);
      card.style.transition = 'none';
      card.style.opacity = '0';
      card.style.transform = 'translateX(-20px)';
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          card.style.transition = '';
          card.style.opacity = '1';
          card.style.transform = 'translateX(0)';
        });
      });
    }, 220);
  }
}

function finishTest() {
  // Animate progress to 100%
  document.getElementById('progress-bar').style.width = '100%';

  const profile = calcProfile(currentAnswers);
  save(STORAGE.PROFILE, profile);

  setTimeout(() => showResults(profile), 300);
}

// ---- Entry point ----------------------------------------------
async function init() {
  await loadData();

  // Check for returning user
  const profile = load(STORAGE.PROFILE, null);
  if (profile) {
    // Returning user — go straight to task
    showTaskScreen(profile);
  }

  // Welcome screen: start test
  document.getElementById('btn-start-test').addEventListener('click', () => {
    currentAnswers = [];
    currentQuestion = 0;
    renderQuestion(0);
    showScreen('screen-test');
  });

  setupCompleteButton();
  setupProfilePanel();
  setupReset();
}

init();
