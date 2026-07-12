/* =====================================================================
   HOCKEY TRACKER — SCRIPT.JS
   Всё приложение хранит один объект `state` в LocalStorage.
   Структура ниже — единственный источник правды для всего UI.
   ===================================================================== */

const STORAGE_KEY = 'hockeyTrackerState_v1';

/* ---------------------------------------------------------------------
   1) НАЧАЛЬНОЕ СОСТОЯНИЕ (используется только при первом запуске)
   --------------------------------------------------------------------- */
function createDefaultState() {
  const today = todayStr();
  return {
    createdAt: today,

    profile: {
      name: 'Sasha',
      sport: 'Ice Hockey',
      position: 'Forward',
      team: '',
      goals: ''
    },

    xp: 0,
    streak: 0,
    lastCompletedDate: null,   // дата последней завершённой тренировки (для стрика)
    totalWorkouts: 0,

    // Чеклист сбрасывается каждый новый день
    checklist: { date: today, workout: false, stretching: false, water: false, sleep: false },

    // Прогресс "сегодняшней" тренировки — тоже сбрасывается каждый день
    todayCompletion: { date: today, trainingId: 'strength', doneExerciseIds: [] },

    // Список тренировок пользователя. Упражнения — шаблон (без daily-состояния).
    trainings: [
      {
        id: 'strength', name: 'Strength',
        exercises: [
          ex('Squats', '3 x 12'),
          ex('Lunges', '3 x 10'),
          ex('Deadlift', '4 x 8'),
          ex('Plank', '3 x 60 sec')
        ]
      },
      {
        id: 'speed', name: 'Speed',
        exercises: [
          ex('Sprint 30m', '6 reps'),
          ex('High knees', '3 x 30 sec'),
          ex('Box jumps', '4 x 8')
        ]
      },
      {
        id: 'stickhandling', name: 'Stickhandling',
        exercises: [
          ex('Toe drags', '5 x 20'),
          ex('Figure 8 drill', '10 min'),
          ex('Quick hands drill', '4 x 30 sec')
        ]
      },
      {
        id: 'mobility', name: 'Mobility',
        exercises: [
          ex('Hip openers', '3 x 10'),
          ex('Ankle circles', '2 x 15'),
          ex('Dynamic stretching', '10 min')
        ]
      },
      {
        id: 'recovery', name: 'Recovery',
        exercises: [
          ex('Foam rolling', '10 min'),
          ex('Light stretching', '10 min'),
          ex('Breathing exercise', '5 min')
        ]
      }
    ],

    // Каждая завершённая тренировка сохраняется сюда целиком — это единственный
    // источник правды и для календаря, и для ленты активности.
    // Форма записи: { date, type, completed, exercises: [{name, completed}], xp }
    workouts: [],

    // Измерения прогресса
    measurements: [
      // { date, weight, height, strength, speed, jump, stickhandling }
    ],

    // Достижения
    achievements: {
      first_workout: { name: 'First workout', icon: '🏆', unlocked: false, date: null },
      streak_7: { name: '7 day streak', icon: '🔥', unlocked: false, date: null },
      workouts_50: { name: '50 workouts', icon: '💪', unlocked: false, date: null }
    }
  };
}

// Небольшой хелпер для создания упражнения с уникальным id
function ex(name, sets) {
  return { id: uid(), name, sets, weight: '', comment: '' };
}

/* ---------------------------------------------------------------------
   2) УТИЛИТЫ
   --------------------------------------------------------------------- */
function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function formatDateHuman(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove('show'), 2200);
}

/* ---------------------------------------------------------------------
   3) ЗАГРУЗКА / СОХРАНЕНИЕ STATE
   --------------------------------------------------------------------- */
let state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultState();
    const parsed = JSON.parse(raw);
    return migrateDailyFields(parsed);
  } catch (e) {
    console.error('Failed to load state, using defaults', e);
    return createDefaultState();
  }
}

// Сбрасывает поля, которые должны обновляться при смене дня (чеклист, прогресс дня)
function migrateDailyFields(s) {
  const today = todayStr();
  if (s.checklist.date !== today) {
    s.checklist = { date: today, workout: false, stretching: false, water: false, sleep: false };
  }
  if (s.todayCompletion.date !== today) {
    s.todayCompletion = { date: today, trainingId: s.todayCompletion.trainingId || 'strength', doneExerciseIds: [] };
  }

  // Миграция со старой структуры (history + calendarStatus) на единый массив workouts.
  // Так старые сохранённые данные пользователя не теряются при обновлении приложения.
  if (!Array.isArray(s.workouts)) {
    const oldHistory = Array.isArray(s.history) ? s.history : [];
    const oldStatus = s.calendarStatus || {};
    s.workouts = oldHistory.map(h => ({
      date: h.date,
      type: h.trainingName || h.type || 'Training',
      completed: oldStatus[h.date] === 'completed',
      exercises: [],
      xp: h.xp || 50
    }));
    delete s.history;
    delete s.calendarStatus;
  }

  return s;
}

/* ---------------------------------------------------------------------
   3b) ХЕЛПЕРЫ: поиск тренировки по дате и её статуса (для Calendar)
   --------------------------------------------------------------------- */
function getWorkoutForDate(dateStr) {
  return state.workouts.find(w => w.date === dateStr);
}

// Возвращает 'completed' | 'partial' | 'missed' | null (null = будущее / вне периода)
function getDateStatus(dateStr) {
  const workout = getWorkoutForDate(dateStr);
  if (workout) return workout.completed ? 'completed' : 'partial';
  if (dateStr < todayStr() && dateStr >= state.createdAt) return 'missed';
  return null;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/* ---------------------------------------------------------------------
   4) XP / LEVEL SYSTEM
   --------------------------------------------------------------------- */
const XP_PER_LEVEL = 500;

function getLevel() {
  return Math.floor(state.xp / XP_PER_LEVEL) + 1;
}

function getXpIntoLevel() {
  return state.xp % XP_PER_LEVEL;
}

function addXp(amount, reason) {
  const levelBefore = getLevel();
  state.xp += amount;
  showToast(`+${amount} XP · ${reason}`);
  if (getLevel() > levelBefore) {
    setTimeout(() => showToast(`🎉 Level up! Now level ${getLevel()}`), 500);
  }
}

/* ---------------------------------------------------------------------
   5) ДОСТИЖЕНИЯ
   --------------------------------------------------------------------- */
function checkAchievements() {
  const a = state.achievements;

  if (!a.first_workout.unlocked && state.totalWorkouts >= 1) {
    a.first_workout.unlocked = true;
    a.first_workout.date = todayStr();
    setTimeout(() => showToast('🏆 Achievement unlocked: First workout'), 900);
  }

  if (!a.streak_7.unlocked && state.streak >= 7) {
    a.streak_7.unlocked = true;
    a.streak_7.date = todayStr();
    addXp(200, '7 day streak bonus');
    setTimeout(() => showToast('🔥 Achievement unlocked: 7 day streak'), 900);
  }

  if (!a.workouts_50.unlocked && state.totalWorkouts >= 50) {
    a.workouts_50.unlocked = true;
    a.workouts_50.date = todayStr();
    setTimeout(() => showToast('💪 Achievement unlocked: 50 workouts'), 900);
  }
}

/* ---------------------------------------------------------------------
   6) ЗАВЕРШЕНИЕ ТРЕНИРОВКИ (используется и на Dashboard, и на Training)
   --------------------------------------------------------------------- */
function completeTodayTraining() {
  const today = todayStr();

  // Тренировка уже завершена сегодня — не даём начислить повторно
  if (getDateStatus(today) === 'completed') {
    showToast('Already completed today ✅');
    return;
  }

  const training = state.trainings.find(t => t.id === state.todayCompletion.trainingId) || state.trainings[0];
  const totalExercises = training.exercises.length;
  const doneIds = state.todayCompletion.doneExerciseIds;
  const doneCount = doneIds.length;
  const isFullyCompleted = totalExercises > 0 && doneCount === totalExercises;

  // Обновляем streak: если вчера тоже была тренировка — продолжаем, иначе начинаем заново
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (state.lastCompletedDate === yesterday) {
    state.streak += 1;
  } else if (state.lastCompletedDate !== today) {
    state.streak = 1;
  }
  state.lastCompletedDate = today;
  state.totalWorkouts += 1;

  // Снимок упражнений на момент завершения — сохраняется НАВСЕГДА в этой записи,
  // независимо от того, что дальше произойдёт с шаблоном тренировки.
  const exercisesSnapshot = training.exercises.map(e => ({
    name: e.name,
    completed: doneIds.includes(e.id)
  }));

  // Если сегодня уже была запись по этой тренировке (на случай повторного вызова) — заменяем её,
  // иначе добавляем новую запись в конец истории тренировок.
  const existingIdx = state.workouts.findIndex(w => w.date === today);
  const workoutEntry = {
    date: today,
    type: training.name,
    completed: isFullyCompleted,
    exercises: exercisesSnapshot,
    xp: 50
  };
  if (existingIdx === -1) state.workouts.push(workoutEntry);
  else state.workouts[existingIdx] = workoutEntry;

  addXp(50, 'Completed workout');
  checkAchievements();
  saveState();
  renderAll();
}

/* ---------------------------------------------------------------------
   7) ИЗМЕРЕНИЯ / PERSONAL RECORDS
   --------------------------------------------------------------------- */
const HIGHER_IS_BETTER = ['strength', 'speed', 'jump']; // рост значения = прогресс
const LOWER_IS_BETTER = ['stickhandling'];               // меньше секунд = прогресс

function checkPersonalRecord(metric, value) {
  const past = state.measurements
    .map(m => m[metric])
    .filter(v => v !== undefined && v !== null && v !== '');

  if (past.length === 0) return false;

  if (HIGHER_IS_BETTER.includes(metric)) {
    return value > Math.max(...past.map(Number));
  }
  if (LOWER_IS_BETTER.includes(metric)) {
    return value < Math.min(...past.map(Number));
  }
  return false;
}

/* ---------------------------------------------------------------------
   8) НАВИГАЦИЯ МЕЖДУ ЭКРАНАМИ
   --------------------------------------------------------------------- */
const SCREEN_TITLES = {
  dashboard: 'Dashboard',
  training: 'Training',
  progress: 'Progress',
  calendar: 'Calendar',
  profile: 'Profile'
};

function switchScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(`screen-${name}`).classList.add('active');

  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.screen === name));
  document.getElementById('screen-title').textContent = SCREEN_TITLES[name];

  if (name === 'progress') renderChart();
}

document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => switchScreen(btn.dataset.screen));
});

/* ---------------------------------------------------------------------
   9) RENDER: DASHBOARD
   --------------------------------------------------------------------- */
function renderDashboard() {
  document.getElementById('greeting-text').textContent = `Good morning, ${state.profile.name}`;

  // XP / level
  document.getElementById('xp-level-text').textContent = `Level ${getLevel()}`;
  document.getElementById('xp-count-text').textContent = `${getXpIntoLevel()} / ${XP_PER_LEVEL} XP`;
  document.getElementById('xp-progress-fill').style.width = `${(getXpIntoLevel() / XP_PER_LEVEL) * 100}%`;
  document.getElementById('header-level-badge').textContent = `Lvl ${getLevel()}`;

  // Today's training
  const training = state.trainings.find(t => t.id === state.todayCompletion.trainingId) || state.trainings[0];
  const total = training.exercises.length;
  const done = state.todayCompletion.doneExerciseIds.length;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);

  document.getElementById('today-training-name').textContent = `${training.name} workout`;
  document.getElementById('today-progress-fill').style.width = `${percent}%`;
  document.getElementById('today-progress-percent').textContent = `${percent}%`;

  const completeBtn = document.getElementById('btn-complete-training');
  const alreadyDoneToday = getDateStatus(todayStr()) === 'completed';
  completeBtn.disabled = alreadyDoneToday;
  completeBtn.textContent = alreadyDoneToday ? 'Completed today ✓' : 'Complete training';

  // Stats
  document.getElementById('stat-streak').textContent = `🔥 ${state.streak} days`;
  document.getElementById('stat-total-workouts').textContent = state.totalWorkouts;
  document.getElementById('stat-weight').textContent = getLatestWeightLabel();

  // Checklist
  document.querySelectorAll('#daily-checklist li').forEach(li => {
    const key = li.dataset.key;
    li.querySelector('input').checked = !!state.checklist[key];
  });
}

document.querySelectorAll('#daily-checklist input').forEach(input => {
  input.addEventListener('change', (e) => {
    const key = e.target.closest('li').dataset.key;
    state.checklist[key] = e.target.checked;
    saveState();
  });
});

document.getElementById('btn-complete-training').addEventListener('click', completeTodayTraining);

/* ---------------------------------------------------------------------
   10) RENDER: TRAINING
   --------------------------------------------------------------------- */
let selectedTrainingId = state.todayCompletion.trainingId;

function renderTrainingList() {
  const list = document.getElementById('training-list');
  list.innerHTML = '';
  state.trainings.forEach(t => {
    const pill = document.createElement('button');
    pill.className = 'training-pill' + (t.id === selectedTrainingId ? ' active' : '');
    pill.textContent = t.name;
    pill.addEventListener('click', () => {
      selectedTrainingId = t.id;
      // Открытие тренировки делает её "тренировкой на сегодня"
      if (state.todayCompletion.trainingId !== t.id) {
        state.todayCompletion.trainingId = t.id;
        state.todayCompletion.doneExerciseIds = [];
        saveState();
      }
      renderTrainingScreen();
    });
    list.appendChild(pill);
  });
}

function renderTrainingScreen() {
  renderTrainingList();
  const training = state.trainings.find(t => t.id === selectedTrainingId);
  const detail = document.getElementById('training-detail');
  if (!training) { detail.style.display = 'none'; return; }
  detail.style.display = 'block';
  document.getElementById('training-detail-name').textContent = training.name;

  const isToday = state.todayCompletion.trainingId === training.id;
  const doneIds = isToday ? state.todayCompletion.doneExerciseIds : [];

  const list = document.getElementById('exercise-list');
  list.innerHTML = '';
  training.exercises.forEach(exItem => {
    const isDone = doneIds.includes(exItem.id);
    const row = document.createElement('div');
    row.className = 'exercise-item' + (isDone ? ' done' : '');
    row.innerHTML = `
      <div class="exercise-top">
        <div>
          <div class="exercise-name ${isDone ? 'done-text' : ''}">${escapeHtml(exItem.name)}</div>
          <div class="exercise-sets">${escapeHtml(exItem.sets || '')}</div>
        </div>
        <button class="exercise-check ${isDone ? 'checked' : ''}" data-ex="${exItem.id}">${isDone ? '✓' : ''}</button>
      </div>
      <div class="exercise-inputs">
        <input type="text" placeholder="Weight (kg)" value="${escapeHtml(exItem.weight || '')}" data-field="weight" data-ex="${exItem.id}">
        <input type="text" placeholder="Reps done" value="${escapeHtml(exItem.repsActual || '')}" data-field="repsActual" data-ex="${exItem.id}">
        <textarea class="comment-field" placeholder="Comment" rows="1" data-field="comment" data-ex="${exItem.id}">${escapeHtml(exItem.comment || '')}</textarea>
      </div>
    `;
    list.appendChild(row);
  });

  // Toggle done
  list.querySelectorAll('.exercise-check').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!isToday) {
        showToast("Open today's training to check off exercises");
        return;
      }
      const exId = btn.dataset.ex;
      const idx = state.todayCompletion.doneExerciseIds.indexOf(exId);
      if (idx === -1) state.todayCompletion.doneExerciseIds.push(exId);
      else state.todayCompletion.doneExerciseIds.splice(idx, 1);
      saveState();
      renderTrainingScreen();
      renderDashboard();
    });
  });

  // Save weight / reps / comment as the user types
  list.querySelectorAll('[data-field]').forEach(inputEl => {
    inputEl.addEventListener('input', () => {
      const exId = inputEl.dataset.ex;
      const field = inputEl.dataset.field;
      const exercise = training.exercises.find(x => x.id === exId);
      if (exercise) exercise[field] = inputEl.value;
      saveState();
    });
  });

  const finishBtn = document.getElementById('btn-finish-training');
  const alreadyDoneToday = getDateStatus(todayStr()) === 'completed';
  finishBtn.disabled = alreadyDoneToday;
  finishBtn.textContent = alreadyDoneToday ? 'Completed today ✓' : 'Finish this training';
  finishBtn.onclick = completeTodayTraining;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

document.getElementById('btn-add-exercise').addEventListener('click', () => {
  openModal('Add exercise', `
    <label class="field"><span>Exercise name</span><input type="text" id="new-ex-name" placeholder="e.g. Box jumps"></label>
    <label class="field"><span>Sets / reps</span><input type="text" id="new-ex-sets" placeholder="e.g. 3 x 12"></label>
    <button class="btn-primary" id="new-ex-save">Add exercise</button>
  `);
  document.getElementById('new-ex-save').addEventListener('click', () => {
    const name = document.getElementById('new-ex-name').value.trim();
    const sets = document.getElementById('new-ex-sets').value.trim();
    if (!name) { showToast('Please enter an exercise name'); return; }
    const training = state.trainings.find(t => t.id === selectedTrainingId);
    training.exercises.push(ex(name, sets));
    saveState();
    closeModal();
    renderTrainingScreen();
  });
});

document.getElementById('btn-add-training').addEventListener('click', () => {
  openModal('Add training', `
    <label class="field"><span>Training name</span><input type="text" id="new-training-name" placeholder="e.g. Agility"></label>
    <button class="btn-primary" id="new-training-save">Create training</button>
  `);
  document.getElementById('new-training-save').addEventListener('click', () => {
    const name = document.getElementById('new-training-name').value.trim();
    if (!name) { showToast('Please enter a training name'); return; }
    const id = uid();
    state.trainings.push({ id, name, exercises: [] });
    saveState();
    selectedTrainingId = id;
    closeModal();
    renderTrainingScreen();
  });
});

/* ---------------------------------------------------------------------
   11) RENDER: PROGRESS (Chart.js) — единая точка входа для данных о весе.
   Dashboard, Weight Progress chart, History и Weight Summary — ВСЕ читают
   именно через getSortedWeightMeasurements(). Никаких отдельных массивов
   или переменных с копией данных — только один проход по state.measurements.
   --------------------------------------------------------------------- */
let chartInstance = null;
const METRIC = 'weight';
const METRIC_LABEL = 'Weight (kg)';

// Возвращает записи веса из measurements[], отсортированные от СТАРЫХ к НОВЫМ.
// .slice() перед .sort() — чтобы не мутировать исходный state.measurements при сортировке.
function getSortedWeightMeasurements() {
  return state.measurements
    .filter(m => m[METRIC] !== undefined && m[METRIC] !== null && m[METRIC] !== '')
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Текст для карточки "Current weight" на Dashboard — всегда самая свежая ПО ДАТЕ запись,
// а не последняя добавленная (это и было реальной причиной несостыковок: раньше бралась
// просто последняя запись массива, что ломалось при вводе задним числом).
function getLatestWeightLabel() {
  const points = getSortedWeightMeasurements();
  if (points.length === 0) return '— kg';
  return `${points[points.length - 1][METRIC]} kg`;
}

function renderChart() {
  const canvas = document.getElementById('progress-chart');
  const emptyState = document.getElementById('chart-empty-state');

  // Диагностика по чек-листу из запроса: не молчим, если чего-то не хватает.
  if (!canvas) {
    console.error('[Hockey Tracker] #progress-chart canvas not found in the DOM.');
    return;
  }
  if (typeof Chart === 'undefined') {
    console.error('[Hockey Tracker] Chart.js failed to load (the "Chart" global is undefined). ' +
      'Check your network connection / ad-blocker — the CDN script tag in <head> may have been blocked.');
    canvas.style.display = 'none';
    emptyState.textContent = 'Chart library failed to load';
    emptyState.style.display = 'flex';
    return;
  }

  const points = getSortedWeightMeasurements();

  // Нет данных — красиво показываем сообщение вместо пустого канваса,
  // и не пытаемся строить график на пустом наборе точек.
  if (points.length === 0) {
    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
    canvas.style.display = 'none';
    emptyState.textContent = 'No weight data yet';
    emptyState.style.display = 'flex';
    return;
  }

  canvas.style.display = 'block';
  emptyState.style.display = 'none';

  const labels = points.map(p => formatDateHuman(p.date));
  const values = points.map(p => Number(p[METRIC]));

  if (chartInstance) chartInstance.destroy();

  try {
    chartInstance = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: METRIC_LABEL,
          data: values,
          borderColor: '#8B5CF6',
          backgroundColor: 'rgba(139, 92, 246, 0.15)',
          pointBackgroundColor: '#A78BFA',
          pointBorderColor: '#A78BFA',
          tension: 0.35,
          fill: true,
          borderWidth: 3,
          pointRadius: 4,
          pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false, // высота задаётся через CSS у .chart-wrap, а не аспектным соотношением
        animation: { duration: 300 },
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#A1A1AA' }, grid: { color: 'rgba(255,255,255,0.05)' } },
          y: { ticks: { color: '#A1A1AA' }, grid: { color: 'rgba(255,255,255,0.05)' } }
        }
      }
    });
  } catch (err) {
    // Не проглатываем ошибку молча — это именно то место, где раньше график
    // мог "тихо" не появиться без единого следа в консоли.
    console.error('[Hockey Tracker] Failed to create the weight chart:', err);
    canvas.style.display = 'none';
    emptyState.textContent = 'Could not render chart';
    emptyState.style.display = 'flex';
  }
}

document.getElementById('btn-add-measurement').addEventListener('click', () => {
  openModal('Add measurement', `
    <label class="field"><span>Date</span><input type="date" id="new-m-date" value="${todayStr()}"></label>
    <label class="field"><span>Weight (kg)</span><input type="number" step="0.1" id="new-m-weight" placeholder="e.g. 67.5"></label>
    <label class="field"><span>Height (cm)</span><input type="number" step="0.1" id="new-m-height" placeholder="e.g. 178"></label>
    <label class="field"><span>Strength (kg)</span><input type="number" step="0.1" id="new-m-strength" placeholder="e.g. 80"></label>
    <label class="field"><span>Speed (sec / 30m)</span><input type="number" step="0.01" id="new-m-speed" placeholder="e.g. 4.5"></label>
    <label class="field"><span>Jump (cm)</span><input type="number" step="0.1" id="new-m-jump" placeholder="e.g. 55"></label>
    <label class="field"><span>Stickhandling time (sec)</span><input type="number" step="0.01" id="new-m-stickhandling" placeholder="e.g. 12.3"></label>
    <button class="btn-primary" id="new-m-save">Save measurement</button>
  `);

  document.getElementById('new-m-save').addEventListener('click', () => {
    const date = document.getElementById('new-m-date').value || todayStr();
    const entry = { date };
    const fields = ['weight', 'height', 'strength', 'speed', 'jump', 'stickhandling'];
    let prCount = 0;

    fields.forEach(f => {
      const raw = document.getElementById(`new-m-${f}`).value;
      if (raw !== '') {
        const value = Number(raw);
        if (checkPersonalRecord(f, value)) prCount++;
        entry[f] = value;
      }
    });

    state.measurements.push(entry);
    saveState();
    closeModal();
    renderProgressScreen();
    renderChart(); // экран Progress точно виден в этот момент — можно безопасно строить график
    if (prCount > 0) {
      addXp(100, 'New personal record');
      saveState();
    }
  });
});

// ВАЖНО: эта функция может вызываться, когда экран Progress ещё СКРЫТ
// (например, из renderAll() при первой загрузке страницы, пока активен Dashboard).
// Chart.js должен создаваться только когда canvas реально виден на экране —
// иначе он получает нулевую высоту и остаётся пустым навсегда (это и было
// настоящей причиной "полностью пустого" графика). Поэтому здесь считаем
// только текстовую сводку; сам renderChart() вызывается отдельно —
// из switchScreen('progress') и сразу после сохранения нового измерения,
// то есть только в моменты, когда экран точно виден.
function renderProgressScreen() {
  renderWeightSummary();
}

// Сводка по весу всегда считается по ПОЛНОЙ истории измерений (не только последней записи)
function renderWeightSummary() {
  const weightPoints = getSortedWeightMeasurements();

  const startEl = document.getElementById('weight-start');
  const currentEl = document.getElementById('weight-current');
  const changeEl = document.getElementById('weight-change');

  if (weightPoints.length === 0) {
    startEl.textContent = '—';
    currentEl.textContent = '—';
    changeEl.textContent = '—';
    return;
  }

  const start = Number(weightPoints[0].weight);
  const current = Number(weightPoints[weightPoints.length - 1].weight);
  const change = Math.round((current - start) * 100) / 100;

  startEl.textContent = `${start} kg`;
  currentEl.textContent = `${current} kg`;
  changeEl.textContent = `${change > 0 ? '+' : ''}${change} kg`;
}

/* ---------------------------------------------------------------------
   12) RENDER: CALENDAR — полноценная месячная сетка
   --------------------------------------------------------------------- */
let calendarViewDate = new Date(); // какой месяц сейчас показан

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function renderCalendar() {
  renderCalendarMonth();
  renderActivityList();
}

function renderCalendarMonth() {
  const grid = document.getElementById('calendar-grid');
  grid.innerHTML = '';

  const year = calendarViewDate.getFullYear();
  const month = calendarViewDate.getMonth(); // 0-11
  document.getElementById('calendar-month-label').textContent = `${MONTH_NAMES[month]} ${year}`;

  const firstOfMonth = new Date(year, month, 1);
  // Понедельник = 0 ... Воскресенье = 6 (неделя начинается с понедельника)
  const firstWeekday = (firstOfMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayDate = todayStr();

  // Пустые ячейки перед 1-м числом, чтобы дни встали под правильный день недели
  for (let i = 0; i < firstWeekday; i++) {
    const filler = document.createElement('div');
    filler.className = 'calendar-day empty-cell';
    grid.appendChild(filler);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const status = getDateStatus(dateStr); // 'completed' | 'partial' | 'missed' | null

    const cell = document.createElement('div');
    cell.className = 'calendar-day';
    if (status === 'completed') cell.classList.add('completed');
    else if (status === 'partial') cell.classList.add('partial');
    if (dateStr === todayDate) cell.classList.add('is-today');

    cell.textContent = day;
    cell.title = `${formatDateHuman(dateStr)}${status ? ' — ' + status : ''}`;
    cell.addEventListener('click', () => openDayDetail(dateStr));
    grid.appendChild(cell);
  }
}

document.getElementById('btn-cal-prev').addEventListener('click', () => {
  calendarViewDate = new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth() - 1, 1);
  renderCalendarMonth();
});
document.getElementById('btn-cal-next').addEventListener('click', () => {
  calendarViewDate = new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth() + 1, 1);
  renderCalendarMonth();
});

// Лента активности — читается напрямую из workouts (единый источник правды), новые записи сверху
function renderActivityList() {
  const activityList = document.getElementById('activity-list');
  const sortedWorkouts = [...state.workouts].sort((a, b) => b.date.localeCompare(a.date));

  if (sortedWorkouts.length === 0) {
    activityList.innerHTML = `<div class="stat-label">No workouts logged yet.</div>`;
    return;
  }

  activityList.innerHTML = sortedWorkouts.slice(0, 20).map(w => `
    <div class="activity-row activity-row-clickable" data-date="${w.date}">
      <div>
        <div class="a-name">${escapeHtml(w.type)} Workout</div>
        <div class="a-date">${formatDateHuman(w.date)} · ${w.completed ? 'Completed' : 'Partial'}</div>
      </div>
      <div class="a-xp">+${w.xp} XP</div>
    </div>
  `).join('');

  activityList.querySelectorAll('.activity-row-clickable').forEach(row => {
    row.addEventListener('click', () => openDayDetail(row.dataset.date));
  });
}

// Показывает модалку с деталями тренировки за конкретный день (клик по календарю или ленте)
function openDayDetail(dateStr) {
  const workout = getWorkoutForDate(dateStr);

  if (!workout) {
    openModal(formatDateHuman(dateStr), `
      <p style="color:var(--text-secondary); font-size:14px;">No training logged for this day.</p>
    `);
    return;
  }

  const exercisesHtml = workout.exercises.length === 0
    ? `<p style="color:var(--text-secondary); font-size:13px;">No exercise breakdown saved for this workout.</p>`
    : workout.exercises.map(e => `
        <div class="measurement-row">
          <span class="m-date">${escapeHtml(e.name)}</span>
          <span class="m-value">${e.completed ? '✓ done' : '— skipped'}</span>
        </div>
      `).join('');

  openModal(formatDateHuman(dateStr), `
    <div class="field"><span>Workout</span><div style="font-size:16px; font-weight:700;">${escapeHtml(workout.type)}</div></div>
    <div class="field"><span>Status</span><div style="font-size:16px; font-weight:700; color:${workout.completed ? 'var(--green)' : 'var(--yellow)'};">${workout.completed ? 'Completed' : 'Partial'}</div></div>
    <div class="field"><span>Exercises</span></div>
    <div class="measurement-history">${exercisesHtml}</div>
  `);
}

/* ---------------------------------------------------------------------
   13) RENDER: PROFILE
   --------------------------------------------------------------------- */
function renderProfile() {
  const p = state.profile;
  document.getElementById('profile-name-display').textContent = p.name;
  document.getElementById('profile-sub-display').textContent = `${p.sport} · ${p.position}`;

  document.getElementById('profile-name').value = p.name;
  document.getElementById('profile-sport').value = p.sport;
  document.getElementById('profile-position').value = p.position;
  document.getElementById('profile-team').value = p.team;
  document.getElementById('profile-goals').value = p.goals;

  const grid = document.getElementById('achievements-grid');
  grid.innerHTML = Object.values(state.achievements).map(a => `
    <div class="achievement ${a.unlocked ? 'unlocked' : ''}">
      <div class="a-icon">${a.icon}</div>
      <div class="a-name">${escapeHtml(a.name)}</div>
    </div>
  `).join('');
}

document.getElementById('btn-save-profile').addEventListener('click', () => {
  state.profile.name = document.getElementById('profile-name').value.trim() || 'Sasha';
  state.profile.sport = document.getElementById('profile-sport').value.trim();
  state.profile.position = document.getElementById('profile-position').value.trim();
  state.profile.team = document.getElementById('profile-team').value.trim();
  state.profile.goals = document.getElementById('profile-goals').value.trim();
  saveState();
  renderProfile();
  renderDashboard();
  showToast('Profile saved');
});

/* ---------------------------------------------------------------------
   14) DATA: EXPORT / IMPORT / RESET
   --------------------------------------------------------------------- */
document.getElementById('btn-export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `hockey-tracker-backup-${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Data exported');
});

document.getElementById('btn-import').addEventListener('click', () => {
  document.getElementById('import-file-input').click();
});

document.getElementById('import-file-input').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      state = migrateDailyFields(parsed);
      saveState();
      selectedTrainingId = state.todayCompletion.trainingId;
      renderAll();
      showToast('Data imported successfully');
    } catch (err) {
      showToast('Invalid file — import failed');
      console.error(err);
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

document.getElementById('btn-reset').addEventListener('click', () => {
  openModal('Reset all data?', `
    <p style="color:var(--text-secondary); font-size:14px; line-height:1.5;">
      This will permanently delete all your trainings, measurements, streak and achievements.
      This action cannot be undone.
    </p>
    <button class="btn-danger" id="confirm-reset" style="margin-bottom:10px;">Yes, reset everything</button>
    <button class="btn-secondary" id="cancel-reset">Cancel</button>
  `);
  document.getElementById('confirm-reset').addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEY);
    state = createDefaultState();
    selectedTrainingId = state.todayCompletion.trainingId;
    closeModal();
    renderAll();
    showToast('All data has been reset');
  });
  document.getElementById('cancel-reset').addEventListener('click', closeModal);
});

/* ---------------------------------------------------------------------
   15) MODAL HELPERS
   --------------------------------------------------------------------- */
function openModal(title, bodyHtml) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  document.getElementById('modal-overlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
}

document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('modal-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'modal-overlay') closeModal();
});

/* ---------------------------------------------------------------------
   16) INIT
   --------------------------------------------------------------------- */
function renderAll() {
  renderDashboard();
  renderTrainingScreen();
  renderProgressScreen();
  renderCalendar();
  renderProfile();
}

renderAll();

/* ---------------------------------------------------------------------
   PWA-READY NOTE:
   Чтобы превратить приложение в PWA, потребуется:
   1) Создать manifest.json (name, icons, start_url, display: 'standalone')
   2) Подключить его в index.html: <link rel="manifest" href="manifest.json">
   3) Зарегистрировать service worker для офлайн-кеша:
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.register('service-worker.js');
        }
   Текущая структура (отдельные html/css/js, без сборщиков) уже это поддерживает.
   --------------------------------------------------------------------- */
