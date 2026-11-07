(() => {
  'use strict';

  /* ------------------------------------------------------------------------
     Constants
     ------------------------------------------------------------------------ */

  const STORAGE_KEY = 'zhouji-weekly-planner-v1';
  const DATE_MIN = '2026-01-01';
  const DATE_MAX = '2029-12-31';
  const DEFAULT_ROW_HEIGHT = 70;
  const MIN_ROW_HEIGHT = 38;
  const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const COLOR_PALETTE = [
    '#3f705b',
    '#b9694d',
    '#c49a45',
    '#5f88a2',
    '#9a7397',
    '#6e756b',
    '#ad5a57',
    '#4f8b8a'
  ];
  const TODO_NOTE_COLORS = [
    '#f4e2ae',
    '#efd9c7',
    '#dbe7d3',
    '#d8e5ec',
    '#e8d6e4',
    '#ece1c0'
  ];
  const DEFAULT_SEGMENTS = [
    ['08:00', '09:30'],
    ['09:30', '11:00'],
    ['11:00', '12:30'],
    ['13:30', '15:30'],
    ['15:30', '17:30'],
    ['19:00', '21:00']
  ];
  const MEMO_TICKER_INTERVAL = 5600;

  /* ------------------------------------------------------------------------
     Small utilities
     ------------------------------------------------------------------------ */

  const pad2 = (value) => String(value).padStart(2, '0');

  function uid(prefix = 'id') {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return `${prefix}-${window.crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  }

  const ESCAPE_MAP = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ESCAPE_MAP[char]);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function parseISODate(iso) {
    if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
    const parts = iso.split('-').map(Number);
    const date = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0);
    if (Number.isNaN(date.getTime())) return null;
    if (date.getFullYear() !== parts[0] || date.getMonth() !== parts[1] - 1 || date.getDate() !== parts[2]) {
      return null;
    }
    return date;
  }

  function isISODate(value) {
    return Boolean(parseISODate(value));
  }

  function toISODate(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  function addDays(date, amount) {
    const next = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
    next.setDate(next.getDate() + amount);
    return next;
  }

  function mondayOf(date) {
    const day = date.getDay();
    const diff = (day + 6) % 7;
    return addDays(date, -diff);
  }

  function getTodayISO() {
    return toISODate(new Date());
  }

  function inRangeISO(iso) {
    return isISODate(iso) && iso >= DATE_MIN && iso <= DATE_MAX;
  }

  function getWeekDates(weekStartISO) {
    const start = parseISODate(weekStartISO);
    if (!start) return [];
    return Array.from({ length: 7 }, (_, index) => toISODate(addDays(start, index)));
  }

  function weekdayIndexOf(iso) {
    const date = parseISODate(iso);
    if (!date) return 0;
    return (date.getDay() + 6) % 7;
  }

  function isoWeekNumber(iso) {
    const date = parseISODate(iso);
    if (!date) return 1;
    const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
    const day = copy.getDay() || 7;
    copy.setDate(copy.getDate() + 4 - day);
    const yearStart = new Date(copy.getFullYear(), 0, 1, 12, 0, 0, 0);
    return Math.ceil((((copy - yearStart) / 86400000) + 1) / 7);
  }

  function formatRange(startISO) {
    const start = parseISODate(startISO);
    if (!start) return '';
    const end = addDays(start, 6);
    const startYear = start.getFullYear();
    const endYear = end.getFullYear();
    const startMonth = start.getMonth() + 1;
    const endMonth = end.getMonth() + 1;
    if (startYear !== endYear) {
      return `${startYear}年${startMonth}月${start.getDate()}日 — ${endYear}年${endMonth}月${end.getDate()}日`;
    }
    if (startMonth !== endMonth) {
      return `${startYear}年${startMonth}月${start.getDate()}日 — ${endMonth}月${end.getDate()}日`;
    }
    return `${startYear}年${startMonth}月${start.getDate()}日 — ${end.getDate()}日`;
  }

  function formatChineseDate(iso) {
    const date = parseISODate(iso);
    if (!date) return iso;
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 · ${WEEKDAYS[weekdayIndexOf(iso)]}`;
  }

  function normalizeTime(value) {
    const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(value || '').trim());
    if (!match) return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour > 23 || minute > 59) return null;
    return `${pad2(hour)}:${pad2(minute)}`;
  }

  function timeToMinutes(value) {
    const normalized = normalizeTime(value);
    if (!normalized) return null;
    const [hour, minute] = normalized.split(':').map(Number);
    return hour * 60 + minute;
  }

  function minutesToTime(totalMinutes) {
    const safe = clamp(Math.round(totalMinutes), 0, 1439);
    return `${pad2(Math.floor(safe / 60))}:${pad2(safe % 60)}`;
  }

  function durationLabel(start, end) {
    const startMin = timeToMinutes(start);
    const endMin = timeToMinutes(end);
    if (startMin == null || endMin == null || endMin <= startMin) return '—';
    return `${endMin - startMin} 分钟`;
  }

  function normalizeHex(value) {
    if (typeof value !== 'string') return null;
    const match = /^#?([0-9a-f]{6})$/i.exec(value.trim());
    if (!match) return null;
    return `#${match[1].toLowerCase()}`;
  }

  function hexToRgb(hex) {
    const normalized = normalizeHex(hex);
    if (!normalized) return { r: 63, g: 112, b: 91 };
    const value = normalized.slice(1);
    return {
      r: parseInt(value.slice(0, 2), 16),
      g: parseInt(value.slice(2, 4), 16),
      b: parseInt(value.slice(4, 6), 16)
    };
  }

  function blockColorVariables(block) {
    const color = normalizeHex(block && block.color) || COLOR_PALETTE[0];
    const { r, g, b } = hexToRgb(color);
    return [
      `--block-color:${color}`,
      `--block-bg:rgba(${r}, ${g}, ${b}, 0.13)`,
      `--block-border:rgba(${r}, ${g}, ${b}, 0.30)`,
      '--block-ink:#24382c',
      '--block-time:rgba(35, 55, 43, 0.58)'
    ].join(';');
  }

  function setStyleSafe(element, property, value) {
    if (element) element.style.setProperty(property, value);
  }

  /* ------------------------------------------------------------------------
     Constants derived from dates
     ------------------------------------------------------------------------ */

  const MIN_WEEK_START = toISODate(mondayOf(parseISODate(DATE_MIN)));
  const MAX_WEEK_START = toISODate(mondayOf(parseISODate(DATE_MAX)));

  /* ------------------------------------------------------------------------
     State creation, normalization, persistence
     ------------------------------------------------------------------------ */

  let state = null;
  let storageAvailable = true;
  let storageErrorNotified = false;
  let editingBlockId = null;
  let selectedColor = COLOR_PALETTE[0];
  let toastTimer = null;
  let menuOpen = false;
  let dragState = null;
  let resizeState = null;
  let calendarCursor = { year: 2026, month: 0 };
  let timelineDate = null;
  let timelineDraft = null;
  let confirmAction = null;
  let detailContext = null;
  let detailSaveTimer = null;
  let blockNoteEditingId = null;
  let memoTimer = null;
  let memoAnimationTimer = null;
  let memoTickerActiveLine = null;
  let currentMemoId = null;
  let memoEditingId = null;
  let snapTargets = [];
  let lateReminderTimer = null;
  let todoDate = null;
  let todayPanelOpen = false;

  function makeDefaultSegments() {
    return DEFAULT_SEGMENTS.map(([start, end]) => ({
      id: uid('seg'),
      start,
      end,
      height: DEFAULT_ROW_HEIGHT
    }));
  }

  function makeStarterBlocks() {
    return [
      ['晨间运动', '#b9694d'],
      ['深度工作', '#3f705b'],
      ['阅读时间', '#5f88a2'],
      ['弹性休息', '#9a7397']
    ].map(([title, color]) => ({
      id: uid('blk'),
      title,
      color,
      description: '',
      createdAt: Date.now()
    }));
  }

  function createInitialState() {
    const today = getTodayISO();
    const anchor = inRangeISO(today) ? today : DATE_MIN;
    return {
      version: 3,
      profile: {
        nickname: '',
        joinedAt: '',
        checkInDates: []
      },
      blocks: makeStarterBlocks(),
      days: {},
      todos: {},
      trash: [],
      memos: [],
      ui: {
        weekStart: toISODate(mondayOf(parseISODate(anchor))),
        selectedDate: anchor
      },
      updatedAt: Date.now()
    };
  }

  function makeAssignment(blockId, data = {}) {
    const createdAt = Number(data.createdAt);
    return {
      blockId,
      note: typeof data.note === 'string' ? data.note.slice(0, 2000) : '',
      completed: Boolean(data.completed),
      createdAt: Number.isFinite(createdAt) ? createdAt : Date.now()
    };
  }

  function normalizeProfile(rawProfile) {
    const raw = rawProfile && typeof rawProfile === 'object' ? rawProfile : {};
    const nickname = typeof raw.nickname === 'string' ? raw.nickname.trim().slice(0, 12) : '';
    const checkInDates = Array.isArray(raw.checkInDates)
      ? [...new Set(raw.checkInDates.filter(isISODate))].sort()
      : [];
    const joinedAt = isISODate(raw.joinedAt) ? raw.joinedAt : (checkInDates[0] || '');
    return { nickname, joinedAt, checkInDates };
  }

  function normalizeTrash(rawTrash) {
    if (!Array.isArray(rawTrash)) return [];
    const entries = [];

    for (const item of rawTrash) {
      if (!item || typeof item !== 'object') continue;
      if (item.type !== 'block' && item.type !== 'placement') continue;

      const title = String(item.title || '').trim().slice(0, 48);
      if (!title) continue;

      const blockId = typeof item.blockId === 'string' && item.blockId.trim()
        ? item.blockId.trim()
        : uid('blk');
      const color = normalizeHex(item.color) || COLOR_PALETTE[0];
      const deletedAt = Number(item.deletedAt);
      const placements = [];

      if (Array.isArray(item.placements)) {
        for (const placement of item.placements) {
          if (!placement || !inRangeISO(placement.date)) continue;
          const start = normalizeTime(placement.start);
          const end = normalizeTime(placement.end);
          const segmentId = typeof placement.segmentId === 'string' ? placement.segmentId : '';
          if (!segmentId && !start) continue;
          placements.push({
            date: placement.date,
            segmentId,
            start: start || '',
            end: end || '',
            note: typeof placement.note === 'string' ? placement.note.slice(0, 2000) : '',
            completed: Boolean(placement.completed)
          });
        }
      }

      if (item.type === 'placement' && !placements.length) continue;

      entries.push({
        id: typeof item.id === 'string' && item.id ? item.id : uid('trash'),
        type: item.type,
        title,
        color,
        description: typeof item.description === 'string' ? item.description.slice(0, 2000) : '',
        blockId,
        placements,
        deletedAt: Number.isFinite(deletedAt) ? deletedAt : Date.now()
      });

      if (entries.length >= 50) break;
    }

    return entries;
  }

  function normalizeTodos(rawTodos) {
    if (!rawTodos || typeof rawTodos !== 'object') return {};
    const todos = {};

    for (const [date, rawList] of Object.entries(rawTodos)) {
      if (!inRangeISO(date) || !Array.isArray(rawList)) continue;
      const list = [];
      const seenIds = new Set();

      for (const item of rawList) {
        if (!item || typeof item !== 'object') continue;
        const text = String(item.text || '').trim().slice(0, 80);
        if (!text) continue;

        let id = typeof item.id === 'string' && item.id ? item.id : uid('todo');
        if (seenIds.has(id)) id = uid('todo');
        seenIds.add(id);

        const createdAt = Number(item.createdAt);
        list.push({
          id,
          text,
          completed: Boolean(item.completed),
          color: normalizeHex(item.color) || TODO_NOTE_COLORS[list.length % TODO_NOTE_COLORS.length],
          createdAt: Number.isFinite(createdAt) ? createdAt : Date.now()
        });

        if (list.length >= 100) break;
      }

      if (list.length) todos[date] = list;
    }

    return todos;
  }

  function normalizeHttpUrl(value) {
    let text = String(value || '').trim();
    if (!text || /\s/.test(text)) return '';
    if (!/^[a-z][a-z0-9+.-]*:/i.test(text)) text = `https://${text}`;

    try {
      const url = new URL(text);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
      const host = url.hostname;
      const isLocalhost = host === 'localhost';
      const isIp = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host);
      if (!host || (!host.includes('.') && !isLocalhost && !isIp)) return '';
      return url.href;
    } catch (error) {
      return '';
    }
  }

  function normalizeMemos(rawMemos) {
    if (!Array.isArray(rawMemos)) return [];
    const memos = [];
    const seenIds = new Set();

    for (const item of rawMemos) {
      if (!item || typeof item !== 'object') continue;
      const title = String(item.title || '').trim().slice(0, 80);
      if (!title) continue;

      let id = typeof item.id === 'string' && item.id.trim() ? item.id.trim() : uid('memo');
      if (seenIds.has(id)) id = uid('memo');
      seenIds.add(id);

      const numericWeight = Number(item.weight);
      const weight = clamp(
        Number.isFinite(numericWeight) ? Math.round(numericWeight) : 5,
        1,
        10
      );
      const rawUrls = Array.isArray(item.urls) ? item.urls : (item.url ? [item.url] : []);
      const urls = [];
      for (const rawItem of rawUrls) {
        if (urls.length >= 10) break;
        const rawUrl = typeof rawItem === 'string'
          ? rawItem
          : (rawItem && typeof rawItem === 'object' ? rawItem.url : '');
        const url = normalizeHttpUrl(rawUrl);
        if (!url || urls.some((entry) => entry.url === url)) continue;
        const linkDescription = rawItem && typeof rawItem === 'object' && typeof rawItem.description === 'string'
          ? rawItem.description.trim().slice(0, 300)
          : '';
        urls.push({ url, description: linkDescription });
      }

      const linkMode = Boolean(item.linkMode) && urls.length > 0;
      const description = typeof item.description === 'string' ? item.description.slice(0, 2000) : '';
      const createdAt = Number(item.createdAt);
      const updatedAt = Number(item.updatedAt);

      memos.push({
        id,
        title,
        weight,
        linkMode,
        urls,
        description,
        createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
        updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now()
      });

      if (memos.length >= 100) break;
    }

    return memos;
  }

  function sanitizeSegments(rawSegments) {
    const source = Array.isArray(rawSegments) ? rawSegments : [];
    const seenIds = new Set();
    const candidates = [];

    for (const item of source) {
      if (!item || typeof item !== 'object') continue;
      const start = normalizeTime(item.start);
      const end = normalizeTime(item.end);
      if (!start || !end || timeToMinutes(start) >= timeToMinutes(end)) continue;

      let id = typeof item.id === 'string' && item.id.trim() ? item.id.trim() : uid('seg');
      if (seenIds.has(id)) id = uid('seg');
      seenIds.add(id);

      const numericHeight = Number(item.height);
      const height = Number.isFinite(numericHeight) && numericHeight > 0
        ? Math.max(MIN_ROW_HEIGHT, Math.round(numericHeight))
        : DEFAULT_ROW_HEIGHT;

      candidates.push({ id, start, end, height });
    }

    candidates.sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));

    const cleaned = [];
    for (const segment of candidates) {
      const previous = cleaned[cleaned.length - 1];
      if (previous && timeToMinutes(segment.start) < timeToMinutes(previous.end)) continue;
      cleaned.push(segment);
    }

    return cleaned.length ? cleaned : makeDefaultSegments();
  }

  function normalizeState(raw) {
    if (!raw || typeof raw !== 'object') throw new Error('Invalid state');
    if (!Array.isArray(raw.blocks) || !raw.days || typeof raw.days !== 'object') {
      throw new Error('Invalid state shape');
    }

    const blocks = [];
    const blockIds = new Set();

    for (const item of raw.blocks) {
      if (!item || typeof item !== 'object') continue;
      const title = String(item.title || '').trim().slice(0, 48);
      if (!title) continue;

      let id = typeof item.id === 'string' && item.id.trim() ? item.id.trim() : uid('blk');
      if (blockIds.has(id)) id = uid('blk');
      blockIds.add(id);

      const color = normalizeHex(item.color) || COLOR_PALETTE[blocks.length % COLOR_PALETTE.length];
      const createdAt = Number(item.createdAt);
      blocks.push({
        id,
        title,
        color,
        description: typeof item.description === 'string' ? item.description.slice(0, 2000) : '',
        createdAt: Number.isFinite(createdAt) ? createdAt : Date.now()
      });
    }

    const days = {};
    for (const [date, rawDay] of Object.entries(raw.days)) {
      if (!inRangeISO(date) || !rawDay || typeof rawDay !== 'object') continue;
      const segments = sanitizeSegments(rawDay.segments);
      const segmentIds = new Set(segments.map((segment) => segment.id));
      const assignments = {};

      if (rawDay.assignments && typeof rawDay.assignments === 'object') {
        for (const [segmentId, rawAssignment] of Object.entries(rawDay.assignments)) {
          if (!segmentIds.has(segmentId)) continue;

          let blockId = '';
          let data = {};
          if (typeof rawAssignment === 'string') {
            blockId = rawAssignment;
          } else if (rawAssignment && typeof rawAssignment === 'object') {
            blockId = typeof rawAssignment.blockId === 'string' ? rawAssignment.blockId : '';
            data = rawAssignment;
          }

          if (blockId && blockIds.has(blockId)) {
            assignments[segmentId] = makeAssignment(blockId, data);
          }
        }
      }

      days[date] = { segments, assignments };
    }

    let weekStart = raw.ui && isISODate(raw.ui.weekStart)
      ? raw.ui.weekStart
      : toISODate(mondayOf(parseISODate(inRangeISO(getTodayISO()) ? getTodayISO() : DATE_MIN)));
    weekStart = toISODate(mondayOf(parseISODate(weekStart)));
    if (weekStart < MIN_WEEK_START) weekStart = MIN_WEEK_START;
    if (weekStart > MAX_WEEK_START) weekStart = MAX_WEEK_START;

    let selectedDate = raw.ui && inRangeISO(raw.ui.selectedDate)
      ? raw.ui.selectedDate
      : getTodayISO();
    if (!inRangeISO(selectedDate)) {
      selectedDate = weekStart >= DATE_MIN && weekStart <= DATE_MAX ? weekStart : DATE_MIN;
    }

    const updatedAt = Number(raw.updatedAt);
    return {
      version: 3,
      profile: normalizeProfile(raw.profile),
      blocks,
      days,
      todos: normalizeTodos(raw.todos),
      trash: normalizeTrash(raw.trash),
      memos: normalizeMemos(raw.memos),
      ui: { weekStart, selectedDate },
      updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now()
    };
  }

  function loadState() {
    let raw = null;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      storageAvailable = false;
      return {
        value: createInitialState(),
        firstRun: true,
        warning: '浏览器限制了本地存储，这次编辑可能在刷新后丢失。建议使用“导出备份”。'
      };
    }

    if (!raw) {
      return { value: createInitialState(), firstRun: true, warning: null };
    }

    try {
      return { value: normalizeState(JSON.parse(raw)), firstRun: false, warning: null };
    } catch (error) {
      return {
        value: createInitialState(),
        firstRun: true,
        warning: '本地数据读取失败，已载入新的周计划。'
      };
    }
  }

  function updateSaveStatus(mode = 'saved') {
    if (!els.saveState) return;
    els.saveState.classList.toggle('is-error', mode === 'error');
    if (mode === 'error') {
      els.saveState.innerHTML = '<span class="status-dot" aria-hidden="true"></span>未能保存到本机';
      return;
    }
    const now = new Date();
    els.saveState.innerHTML = `<span class="status-dot" aria-hidden="true"></span>已保存 ${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  }

  function saveState(options = {}) {
    const { silent = false } = options;
    if (!state) return false;
    state.updatedAt = Date.now();

    if (!storageAvailable) {
      updateSaveStatus('error');
      if (!silent && !storageErrorNotified) {
        storageErrorNotified = true;
        showToast('本地存储不可用，请用菜单中的“导出备份”保存数据。', 'warning', 4200);
      }
      return false;
    }

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      updateSaveStatus('saved');
      return true;
    } catch (error) {
      storageAvailable = false;
      updateSaveStatus('error');
      if (!silent && !storageErrorNotified) {
        storageErrorNotified = true;
        showToast('本地保存失败，请导出备份以免丢失。', 'error', 4200);
      }
      return false;
    }
  }

  function ensureDay(date) {
    if (!state.days[date]) {
      state.days[date] = {
        segments: makeDefaultSegments(),
        assignments: {}
      };
    }
    return state.days[date];
  }

  function getBlock(blockId) {
    return state.blocks.find((block) => block.id === blockId) || null;
  }

  function getBlockPlacements(blockId) {
    const placements = [];
    for (const [date, day] of Object.entries(state.days)) {
      for (const segment of day.segments) {
        const assignment = day.assignments[segment.id];
        if (assignment && assignment.blockId === blockId) {
          placements.push({ date, segment, assignment });
        }
      }
    }
    return placements;
  }

  function blockHasLogDescription(blockId) {
    const block = getBlock(blockId);
    if (block && block.description && block.description.trim()) return true;
    return getBlockPlacements(blockId).some(({ assignment }) => assignment.note && assignment.note.trim());
  }

  function getAssignment(date, segmentId) {
    const day = state.days[date];
    if (!day) return null;
    const assignment = day.assignments[segmentId];
    if (!assignment || typeof assignment !== 'object') return null;
    return assignment;
  }

  function countAssignmentsForDate(date) {
    const day = state.days[date];
    if (!day) return 0;
    return Object.values(day.assignments || {}).filter((assignment) => assignment && getBlock(assignment.blockId)).length;
  }

  function countAssignmentsForWeek() {
    return getWeekDates(state.ui.weekStart)
      .filter(inRangeISO)
      .reduce((total, date) => total + countAssignmentsForDate(date), 0);
  }

  function countAllAssignments() {
    return Object.values(state.days).reduce((total, day) => {
      return total + Object.values(day.assignments || {}).filter((assignment) => assignment && getBlock(assignment.blockId)).length;
    }, 0);
  }

  function countCompletedAssignments() {
    return Object.values(state.days).reduce((total, day) => {
      return total + Object.values(day.assignments || {}).filter((assignment) => {
        return assignment && assignment.completed && getBlock(assignment.blockId);
      }).length;
    }, 0);
  }

  function getTodoList(date) {
    return Array.isArray(state.todos[date]) ? state.todos[date] : [];
  }

  function countAllCustomTodos() {
    return Object.values(state.todos || {}).reduce((total, list) => {
      return total + (Array.isArray(list) ? list.length : 0);
    }, 0);
  }

  function countCompletedCustomTodos() {
    return Object.values(state.todos || {}).reduce((total, list) => {
      if (!Array.isArray(list)) return total;
      return total + list.filter((task) => task && task.completed).length;
    }, 0);
  }

  function countBlockUsage(blockId) {
    let total = 0;
    for (const day of Object.values(state.days)) {
      total += Object.values(day.assignments || {}).filter((assignment) => assignment && assignment.blockId === blockId).length;
    }
    return total;
  }

  function calculateCheckInStreak(dates) {
    const checkIns = new Set(dates);
    let cursor = parseISODate(getTodayISO());
    if (!checkIns.has(toISODate(cursor))) cursor = addDays(cursor, -1);
    let streak = 0;
    while (checkIns.has(toISODate(cursor)) && streak < 5000) {
      streak += 1;
      cursor = addDays(cursor, -1);
    }
    return streak;
  }

  function recordCheckIn(options = {}) {
    const { silent = true } = options;
    if (!state.profile) state.profile = normalizeProfile(null);
    const today = getTodayISO();
    let changed = false;

    if (!state.profile.joinedAt) {
      state.profile.joinedAt = today;
      changed = true;
    }
    if (!state.profile.checkInDates.includes(today)) {
      state.profile.checkInDates.push(today);
      state.profile.checkInDates.sort();
      changed = true;
      if (!silent) showToast('今天已打卡，坚持记录下来吧。');
    }

    return changed;
  }

  function openNicknameDialog() {
    if (state.profile.nickname) return;
    els.nicknameInput.value = '';
    els.nicknameError.hidden = true;
    if (!els.nicknameDialog.open) els.nicknameDialog.showModal();
    window.setTimeout(() => els.nicknameInput.focus(), 80);
  }

  function handleNicknameSubmit(event) {
    event.preventDefault();
    const nickname = els.nicknameInput.value.trim().replace(/\s+/g, ' ').slice(0, 12);
    if (!nickname) {
      els.nicknameError.textContent = '先写一个昵称，哪怕只有一个字也可以。';
      els.nicknameError.hidden = false;
      els.nicknameInput.focus();
      return;
    }

    state.profile.nickname = nickname;
    if (!state.profile.joinedAt) state.profile.joinedAt = getTodayISO();
    recordCheckIn({ silent: true });
    saveState();
    els.nicknameError.hidden = true;
    if (els.nicknameDialog.open) els.nicknameDialog.close();
    renderAll();
    showToast(`欢迎，${nickname}！这一周慢慢来。`);
    window.setTimeout(() => maybeShowLateReminder(), 700);
  }

  function openProfileDialog() {
    closeTodayPanel();
    if (!state.profile.nickname) {
      openNicknameDialog();
      return;
    }
    renderProfile();
    els.profileNickname.value = state.profile.nickname;
    if (!els.profileDialog.open) els.profileDialog.showModal();
  }

  function handleProfileNicknameSubmit(event) {
    event.preventDefault();
    const nickname = els.profileNickname.value.trim().replace(/\s+/g, ' ').slice(0, 12);
    if (!nickname) {
      els.profileNickname.focus();
      showToast('昵称不能为空。', 'warning');
      return;
    }
    state.profile.nickname = nickname;
    saveState();
    renderAll();
    showToast(`昵称已改为「${nickname}」。`);
  }

  function handleProfileCheckin() {
    if (recordCheckIn({ silent: false })) {
      saveState();
      renderAll();
    } else {
      showToast('今天已经打过卡了。', 'warning');
    }
  }

  /* ------------------------------------------------------------------------
     Element references
     ------------------------------------------------------------------------ */

  const els = {};

  function cacheElements() {
    const ids = [
      'weekRange', 'weekMeta', 'weekPill', 'prevWeek', 'nextWeek', 'thisWeek', 'brandHome',
      'calendarOpen', 'menuButton', 'appMenu', 'saveState', 'dayGrid', 'boardScroll',
      'railWeek', 'studioWeekNumber',
      'paletteCount', 'paletteList', 'composer', 'blockForm', 'colorSwatches', 'blockColor',
      'customColorFace', 'blockTitle', 'blockSubmit', 'cancelEdit', 'libraryCount', 'libraryList',
      'dragGhost', 'dragTrash', 'resizeTip', 'alignGuide', 'alignGuideLabel', 'toast', 'importFile',
      'calendarDialog', 'calPrev', 'calNext', 'calYear', 'calMonth', 'calToday', 'calGrid',
      'timelineDialog', 'timelineTitle', 'timelineSub', 'timelineList', 'timelineError',
      'genStart', 'genEnd', 'genStep', 'generateTimeline', 'addSegment', 'saveTimeline',
      'applyTimelineWeek', 'confirmDialog', 'confirmTitle', 'confirmMessage', 'confirmSymbol',
      'confirmCancel', 'confirmOk',
      'profileButton', 'profileInitial', 'profileOrbDot', 'brandGreeting', 'profileMeta',
      'trashPanel', 'trashCount', 'trashList', 'clearTrash',
      'nicknameDialog', 'nicknameForm', 'nicknameInput', 'nicknameError',
      'profileDialog', 'profileAvatarLarge', 'profileNameHeading', 'profileSince',
      'checkinStatus', 'checkinTotal', 'checkinStreak', 'scheduledTotal', 'completedTotal',
      'checkinTodayText', 'profileCheckin', 'profileNicknameForm', 'profileNickname',
      'detailDialog', 'detailColorDot', 'detailTitle', 'detailWhen', 'detailNote',
      'detailStatus', 'detailCompleteBtn', 'detailToggleHint',
      'blockNoteDialog', 'blockNoteSub', 'blockNoteColorDot', 'blockNoteInput',
      'blockNoteHint', 'blockNoteSave',
      'reuseLastWeek',
      'lateReminderDialog', 'lateReminderSub', 'lateReminderList',
      'todayButton', 'todayButtonCount', 'todayPanel', 'todayClose',
      'todoPrevDate', 'todoDateInput', 'todoNextDate', 'todoToday',
      'todayDateLabel', 'todayProgressText', 'todayProgressBar',
      'todayScheduleCount', 'todayScheduleList', 'todayTodoCount', 'todayTodoList',
      'todoForm', 'todoInput',
      'memoTicker', 'memoTickerLineA', 'memoTickerLineB', 'memoTickerCount',
      'memoDialog', 'memoCount', 'memoList', 'memoNew', 'memoForm',
      'memoEditorTitle', 'memoEditorMode', 'memoName', 'memoLinkMode',
      'memoUrlField', 'memoAddUrl', 'memoUrlList', 'memoDescriptionField',
      'memoDescription', 'memoWeightRange', 'memoWeightNumber', 'memoError',
      'memoDelete', 'memoSave'
    ];
    for (const id of ids) {
      els[id] = document.getElementById(id);
    }
  }

  /* ------------------------------------------------------------------------
     Rendering: header, board, sidebar, composer
     ------------------------------------------------------------------------ */

  function renderHeader() {
    const weekStart = state.ui.weekStart;
    const weekDates = getWeekDates(weekStart);
    const weekCount = countAssignmentsForWeek();
    const today = getTodayISO();
    const thisWeekStart = toISODate(mondayOf(parseISODate(inRangeISO(today) ? today : DATE_MIN)));

    const weekNumber = String(isoWeekNumber(weekStart)).padStart(2, '0');
    els.weekRange.textContent = formatRange(weekStart);
    els.weekMeta.textContent = `第 ${isoWeekNumber(weekStart)} 周 · ${weekCount} 项安排`;
    els.weekPill.textContent = weekCount ? `${weekCount} 项安排 · 7 天` : '7 天独立时间轴';
    els.railWeek.textContent = weekNumber;
    els.studioWeekNumber.textContent = weekNumber;

    els.prevWeek.disabled = weekStart <= MIN_WEEK_START;
    els.nextWeek.disabled = weekStart >= MAX_WEEK_START;
    els.reuseLastWeek.disabled = weekStart <= MIN_WEEK_START;
    els.reuseLastWeek.title = weekStart <= MIN_WEEK_START
      ? '已经是最早的一周，没有可复用的上周'
      : '一键复用上周全部安排；已完成项重置，未完成项连同日志顺延';

    if (thisWeekStart === weekStart) {
      els.thisWeek.textContent = '本周';
    } else {
      els.thisWeek.textContent = '回到本周';
    }
    els.thisWeek.disabled = !inRangeISO(today);

    const inRangeDays = weekDates.filter(inRangeISO);
    if (inRangeDays.length !== 7) {
      els.weekMeta.textContent += ' · 部分日期超出范围';
    }
  }

  function renderDayCard(iso, index, maxBodyHeight) {
    const date = parseISODate(iso);
    const inRange = inRangeISO(iso);
    const isToday = iso === getTodayISO();
    const isSelected = iso === state.ui.selectedDate;
    const dayName = WEEKDAYS[index];
    const classes = ['day-card'];

    if (isToday) classes.push('is-today');
    if (isSelected) classes.push('is-selected');
    if (!inRange) classes.push('is-outside');

    const dayCount = inRange ? countAssignmentsForDate(iso) : 0;
    const header = `
      <header class="day-head">
        <button class="day-date-btn" type="button" data-select-date="${iso}" ${inRange ? '' : 'disabled'} aria-label="${esc(formatChineseDate(iso))}">
          <span class="day-weekday">${dayName}${isToday ? ' · 今天' : ''}</span>
          <span class="day-date"><strong>${date.getDate()}</strong><small>${date.getMonth() + 1}月</small></span>
        </button>
        <div class="day-head-side">
          ${dayCount ? `<span class="day-count" title="本日已安排 ${dayCount} 项">${dayCount}</span>` : ''}
          ${inRange ? `
            <button class="day-timeline-btn" type="button" data-open-timeline="${iso}" title="编辑${dayName}的时间轴" aria-label="编辑${dayName}的时间轴">
              <svg class="icon"><use href="#i-clock"></use></svg>
            </button>
          ` : ''}
        </div>
      </header>
    `;

    if (!inRange) {
      return `
        <article class="${classes.join(' ')}" data-date="${iso}">
          ${header}
          <div class="day-body" style="min-height:${maxBodyHeight}px">
            <div class="range-note">这一天不在<br>2026.01.01 — 2029.12.31<br>的可编排范围内</div>
          </div>
        </article>
      `;
    }

    const day = ensureDay(iso);
    const rows = day.segments.map((segment) => renderTimeRow(iso, index, day, segment)).join('');

    return `
      <article class="${classes.join(' ')}" data-date="${iso}">
        ${header}
        <div class="day-body" style="min-height:${maxBodyHeight}px">
          ${rows}
        </div>
      </article>
    `;
  }

  function renderTimeRow(iso, dayIndex, day, segment) {
    const assignment = day.assignments[segment.id];
    const block = assignment ? getBlock(assignment.blockId) : null;
    const hasBlock = Boolean(block);
    const ariaLabel = `${WEEKDAYS[dayIndex]} ${segment.start} 至 ${segment.end}，${hasBlock ? `已有安排：${block.title}${assignment.completed ? '，已完成' : ''}` : '空白时间格'}`;

    return `
      <div class="time-row" data-row-date="${iso}" data-row-segment="${segment.id}" style="height:${segment.height}px">
        <div class="time-label">
          <time>${segment.start}</time>
          <span class="time-end">${segment.end}</span>
        </div>
        <div class="slot ${hasBlock ? 'has-block' : ''}" data-slot="true" data-date="${iso}" data-segment-id="${segment.id}" aria-label="${esc(ariaLabel)}">
          ${hasBlock ? renderScheduledBlock(block, iso, segment, assignment) : ''}
        </div>
        <div class="row-resizer" data-resize-date="${iso}" data-resize-segment="${segment.id}" title="拖动调整这一行的高度；靠近其他日期的底边会自动对齐；双击恢复默认"></div>
      </div>
    `;
  }

  function renderScheduledBlock(block, iso, segment, assignment) {
    const hasNote = Boolean(assignment.note && assignment.note.trim());
    const classes = ['scheduled-block'];
    if (assignment.completed) classes.push('is-completed');
    if (hasNote) classes.push('has-note');
    return `
      <div class="${classes.join(' ')}" style="${blockColorVariables(block)}" data-scheduled-block="true" data-block-id="${esc(block.id)}" data-source-date="${iso}" data-source-segment="${esc(segment.id)}" title="${esc(block.title)} · ${segment.start}–${segment.end}（拖动可移动或交换，双击查看详情）">
        <span class="scheduled-title">${esc(block.title)}</span>
        <span class="scheduled-time">${segment.start}–${segment.end}</span>
        ${assignment.completed ? '<span class="completed-flag" aria-label="已完成">✓</span>' : ''}
        <button class="block-remove" type="button" data-remove-schedule="true" data-date="${iso}" data-segment-id="${esc(segment.id)}" title="从日程表移除，日程块模板保留" aria-label="从日程表移除${esc(block.title)}，日程块模板保留">
          <svg class="icon"><use href="#i-x"></use></svg>
        </button>
      </div>
    `;
  }

  function renderBoard() {
    const dates = getWeekDates(state.ui.weekStart);
    dates.filter(inRangeISO).forEach((date) => ensureDay(date));

    let maxBodyHeight = 240;
    for (const date of dates) {
      if (!inRangeISO(date) || !state.days[date]) continue;
      const total = state.days[date].segments.reduce((sum, segment) => sum + segment.height, 0);
      maxBodyHeight = Math.max(maxBodyHeight, total);
    }

    els.dayGrid.innerHTML = dates
      .map((iso, index) => renderDayCard(iso, index, maxBodyHeight))
      .join('');
  }

  function updateBoardHeights() {
    if (!els.dayGrid) return;
    const dates = getWeekDates(state.ui.weekStart);
    let maxBodyHeight = 240;
    for (const date of dates) {
      if (!inRangeISO(date) || !state.days[date]) continue;
      const total = state.days[date].segments.reduce((sum, segment) => sum + segment.height, 0);
      maxBodyHeight = Math.max(maxBodyHeight, total);
    }
    els.dayGrid.querySelectorAll('.day-body').forEach((body) => {
      body.style.minHeight = `${maxBodyHeight}px`;
    });
  }

  function renderPalette() {
    els.paletteCount.textContent = String(state.blocks.length);

    if (!state.blocks.length) {
      els.paletteList.innerHTML = `
        <div class="palette-empty">
          <svg class="icon"><use href="#i-plus"></use></svg>
          <strong>托盘还是空的</strong>
          <span>在左下角的工作台新建日程块，它会出现在这里。</span>
        </div>
      `;
      return;
    }

    els.paletteList.innerHTML = state.blocks.map((block) => {
      const usage = countBlockUsage(block.id);
      const hasDescription = blockHasLogDescription(block.id);
      return `
        <div class="palette-card" style="${blockColorVariables(block)}" data-palette-block="${esc(block.id)}" tabindex="0" role="button" aria-label="拖动${esc(block.title)}到空白时间格">
          <span class="palette-dot" aria-hidden="true"></span>
          <span class="palette-card-copy">
            <strong>${esc(block.title)}</strong>
            <span>${usage ? `已安排 ${usage} 次` : '拖入空白时间格'}${hasDescription ? ' · 已写日志' : ''}</span>
          </span>
          <button class="palette-note-btn ${hasDescription ? 'has-description' : ''}" type="button" data-edit-block-note="${esc(block.id)}" title="${hasDescription ? '编辑日志描述（已有内容）' : '编辑日志描述'}" aria-label="编辑${esc(block.title)}的日志描述">
            <svg class="icon"><use href="#i-pencil"></use></svg>
          </button>
          <span class="palette-grip" aria-hidden="true">
            <svg class="icon"><use href="#i-grip"></use></svg>
          </span>
        </div>
      `;
    }).join('');
  }

  function renderLibrary() {
    els.libraryCount.textContent = String(state.blocks.length);

    if (!state.blocks.length) {
      els.libraryList.innerHTML = '<span class="library-empty">还没有定义日程块，在上方输入一个吧。</span>';
      return;
    }

    els.libraryList.innerHTML = state.blocks.map((block) => `
      <span class="library-chip">
        <span class="chip-dot" style="--chip-color:${normalizeHex(block.color) || COLOR_PALETTE[0]}" aria-hidden="true"></span>
        <span class="chip-title">${esc(block.title)}</span>
        <button class="chip-action" type="button" data-edit-block="${esc(block.id)}" title="编辑${esc(block.title)}" aria-label="编辑${esc(block.title)}">
          <svg class="icon"><use href="#i-pencil"></use></svg>
        </button>
        <button class="chip-action is-delete" type="button" data-delete-block="${esc(block.id)}" title="删除${esc(block.title)}" aria-label="删除${esc(block.title)}">
          <svg class="icon"><use href="#i-x"></use></svg>
        </button>
      </span>
    `).join('');
  }

  function renderProfile() {
    const profile = state.profile || normalizeProfile(null);
    const nickname = profile.nickname || '朋友';
    const initial = Array.from(nickname)[0] || '你';
    const checkInDates = profile.checkInDates || [];
    const total = checkInDates.length;
    const streak = calculateCheckInStreak(checkInDates);
    const checkedToday = checkInDates.includes(getTodayISO());
    const scheduled = countAllAssignments() + countAllCustomTodos();
    const completed = countCompletedAssignments() + countCompletedCustomTodos();

    els.profileInitial.textContent = initial;
    els.profileOrbDot.classList.toggle('is-active', checkedToday);
    els.brandGreeting.innerHTML = `hi！<span class="greeting-name">${esc(nickname)}</span><span class="greeting-tail">，我们要计划什么。</span>`;
    els.profileMeta.textContent = total > 0 ? `连续打卡 ${streak} 天 · WEEKLY LOG` : 'WEEKLY LOG · 本地离线';
    els.profileButton.setAttribute('aria-label', `打开${nickname}的个人信息，累计打卡 ${total} 天`);

    els.profileAvatarLarge.textContent = initial;
    els.profileNameHeading.textContent = nickname;
    els.profileSince.textContent = profile.joinedAt
      ? `从 ${formatChineseDate(profile.joinedAt)} 开始记录`
      : '从今天开始记录';
    els.checkinTotal.textContent = String(total);
    els.checkinStreak.textContent = String(streak);
    els.scheduledTotal.textContent = String(scheduled);
    els.completedTotal.textContent = String(completed);

    els.checkinStatus.classList.toggle('is-pending', !checkedToday);
    els.checkinStatus.innerHTML = checkedToday
      ? '<svg class="icon"><use href="#i-check"></use></svg>今日已打卡'
      : '<svg class="icon"><use href="#i-clock"></use></svg>今日未打卡';
    els.checkinTodayText.textContent = checkedToday
      ? `已记录 ${formatChineseDate(getTodayISO())}`
      : '今天还没有打卡，点一下记录今天。';
    els.profileCheckin.disabled = checkedToday;
    els.profileCheckin.textContent = checkedToday ? '今日已打卡' : '今日打卡';

    if (document.activeElement !== els.profileNickname) {
      els.profileNickname.value = profile.nickname;
    }
  }

  function formatTrashMeta(entry) {
    const first = entry.placements && entry.placements[0];
    if (entry.type === 'block') {
      const count = entry.placements.length;
      return count ? `日程块 · 包含 ${count} 项安排` : '日程块 · 可随时还原';
    }
    if (!first) return '已放置的日程';
    const date = parseISODate(first.date);
    const dateLabel = date ? `${date.getMonth() + 1}月${date.getDate()}日` : first.date;
    return `${dateLabel}${first.start ? ` · ${first.start}–${first.end}` : ''}`;
  }

  function renderTrash() {
    const entries = Array.isArray(state.trash) ? state.trash : [];
    els.trashCount.textContent = String(entries.length);
    els.clearTrash.hidden = entries.length === 0;

    if (!entries.length) {
      els.trashList.innerHTML = `
        <div class="trash-empty">
          <svg class="icon"><use href="#i-trash"></use></svg>
          <span>回收站是空的。工作台或托盘中删除的日程块会放在这里。</span>
        </div>
      `;
      return;
    }

    els.trashList.innerHTML = entries.map((entry) => `
      <div class="trash-item" style="--trash-color:${normalizeHex(entry.color) || COLOR_PALETTE[0]}">
        <span class="palette-dot" style="--block-color:${normalizeHex(entry.color) || COLOR_PALETTE[0]}" aria-hidden="true"></span>
        <span class="trash-item-copy">
          <strong title="${esc(entry.title)}">${esc(entry.title)}</strong>
          <span>${esc(formatTrashMeta(entry))}</span>
        </span>
        <button class="trash-restore" type="button" data-restore-trash="${esc(entry.id)}" aria-label="还原${esc(entry.title)}">
          <svg class="icon"><use href="#i-undo"></use></svg>
          还原
        </button>
      </div>
    `).join('');
  }

  function ensureTodoDate() {
    if (!inRangeISO(todoDate)) {
      todoDate = inRangeISO(getTodayISO()) ? getTodayISO() : DATE_MIN;
    }
    return todoDate;
  }

  function getScheduleItemsForDate(date) {
    const day = state.days[date];
    if (!day) return [];
    const items = [];

    for (const segment of day.segments) {
      const assignment = day.assignments[segment.id];
      if (!assignment) continue;
      const block = getBlock(assignment.blockId);
      if (!block) continue;
      items.push({ date, segment, assignment, block });
    }

    return items.sort((a, b) => timeToMinutes(a.segment.start) - timeToMinutes(b.segment.start));
  }

  function getTodayPanelStats(date) {
    const scheduleItems = getScheduleItemsForDate(date);
    const todoItems = getTodoList(date);
    const scheduleCompleted = scheduleItems.filter((item) => item.assignment.completed).length;
    const todoCompleted = todoItems.filter((task) => task.completed).length;
    const total = scheduleItems.length + todoItems.length;
    const completed = scheduleCompleted + todoCompleted;
    return {
      scheduleItems,
      todoItems,
      scheduleCompleted,
      todoCompleted,
      total,
      completed,
      pending: total - completed
    };
  }

  function formatTodoDateLabel(date) {
    const parsed = parseISODate(date);
    if (!parsed) return '';
    const base = `${parsed.getMonth() + 1}月${parsed.getDate()}日 · ${WEEKDAYS[weekdayIndexOf(date)]}`;
    return date === getTodayISO() ? `今天 · ${base}` : `${parsed.getFullYear()}年${base}`;
  }

  function renderTodayTrigger() {
    if (!els.todayButtonCount) return;
    const date = ensureTodoDate();
    const stats = getTodayPanelStats(date);
    els.todayButtonCount.textContent = String(stats.pending);
    els.todayButtonCount.classList.toggle('is-clear', stats.pending === 0);
    els.todayButton.setAttribute(
      'aria-label',
      `打开${formatChineseDate(date)}的当日待办，${stats.pending} 项未完成`
    );
  }

  function renderTodayPanel() {
    if (!els.todayPanel) return;
    const date = ensureTodoDate();
    const today = getTodayISO();
    const stats = getTodayPanelStats(date);
    const progress = stats.total ? Math.round((stats.completed / stats.total) * 100) : 0;

    els.todoDateInput.value = date;
    els.todayDateLabel.textContent = formatTodoDateLabel(date);
    els.todayProgressText.textContent = `已完成 ${stats.completed} / ${stats.total}`;
    els.todayProgressBar.style.width = `${progress}%`;
    els.todayScheduleCount.textContent = `${stats.scheduleCompleted} / ${stats.scheduleItems.length}`;
    els.todayTodoCount.textContent = `${stats.todoCompleted} / ${stats.todoItems.length}`;
    els.todoPrevDate.disabled = date <= DATE_MIN;
    els.todoNextDate.disabled = date >= DATE_MAX;
    els.todoToday.disabled = date === today || !inRangeISO(today);

    if (!stats.scheduleItems.length) {
      els.todayScheduleList.innerHTML = `<div class="today-empty">${date === today ? '今天' : '这一天'}还没有时间轴日程。</div>`;
    } else {
      els.todayScheduleList.innerHTML = stats.scheduleItems.map((item) => {
        const assignment = item.assignment;
        const block = item.block;
        const segment = item.segment;
        const color = normalizeHex(block.color) || COLOR_PALETTE[0];
        return `
          <div class="today-schedule-item ${assignment.completed ? 'is-completed' : ''}">
            <button class="today-check ${assignment.completed ? 'is-checked' : ''}" type="button" data-toggle-day-schedule="true" data-date="${item.date}" data-segment-id="${esc(segment.id)}" aria-label="${assignment.completed ? '撤销完成' : '标记完成'}${esc(block.title)}" aria-pressed="${assignment.completed ? 'true' : 'false'}">
              <svg class="icon"><use href="#i-check"></use></svg>
            </button>
            <span class="today-schedule-dot" style="--item-color:${color}" aria-hidden="true"></span>
            <button class="today-schedule-main" type="button" data-open-day-schedule="true" data-date="${item.date}" data-segment-id="${esc(segment.id)}" title="打开日程详情">
              <strong>${esc(block.title)}</strong>
              <small>${segment.start}–${segment.end}${assignment.note ? ' · 有记录' : ''}</small>
            </button>
          </div>
        `;
      }).join('');
    }

    if (!stats.todoItems.length) {
      els.todayTodoList.innerHTML = `<div class="today-empty">还没有小事，写一条吧。</div>`;
    } else {
      els.todayTodoList.innerHTML = stats.todoItems.map((task) => `
        <div class="todo-note ${task.completed ? 'is-completed' : ''}" data-todo-id="${esc(task.id)}" style="--note-color:${normalizeHex(task.color) || TODO_NOTE_COLORS[0]}">
          <button class="today-check ${task.completed ? 'is-checked' : ''}" type="button" data-toggle-day-todo="true" data-date="${date}" data-todo-id="${esc(task.id)}" aria-label="${task.completed ? '撤销完成' : '标记完成'}${esc(task.text)}" aria-pressed="${task.completed ? 'true' : 'false'}">
            <svg class="icon"><use href="#i-check"></use></svg>
          </button>
          <p class="todo-note-text">${esc(task.text)}</p>
          <button class="todo-note-delete" type="button" data-delete-day-todo="true" data-date="${date}" data-todo-id="${esc(task.id)}" aria-label="删除小事${esc(task.text)}" title="删除这条小事">
            <svg class="icon"><use href="#i-x"></use></svg>
          </button>
        </div>
      `).join('');
    }

    renderTodayTrigger();
  }

  function openTodayPanel(date) {
    if (!state.profile.nickname) {
      openNicknameDialog();
      return;
    }
    if (date && inRangeISO(date)) todoDate = date;
    ensureTodoDate();
    setMenuOpen(false);
    renderTodayPanel();
    els.todayPanel.hidden = false;
    todayPanelOpen = true;
    els.todayButton.setAttribute('aria-expanded', 'true');
    els.todayPanel.scrollTop = 0;
  }

  function closeTodayPanel() {
    if (!todayPanelOpen) return;
    todayPanelOpen = false;
    els.todayPanel.hidden = true;
    els.todayButton.setAttribute('aria-expanded', 'false');
  }

  function setTodoDate(date) {
    if (!inRangeISO(date)) {
      if (els.todoDateInput) els.todoDateInput.value = ensureTodoDate();
      return;
    }
    if (todoDate !== date) {
      todoDate = date;
      if (els.todoInput) els.todoInput.value = '';
    }
    renderTodayPanel();
  }

  function shiftTodoDate(offset) {
    const current = parseISODate(ensureTodoDate());
    if (!current) return;
    const next = toISODate(addDays(current, offset));
    if (inRangeISO(next)) setTodoDate(next);
  }

  function handleTodoSubmit(event) {
    event.preventDefault();
    const text = els.todoInput.value.trim();
    if (!text) {
      els.todoInput.focus();
      return;
    }

    const date = ensureTodoDate();
    const list = Array.isArray(state.todos[date]) ? state.todos[date] : (state.todos[date] = []);
    list.push({
      id: uid('todo'),
      text: text.slice(0, 80),
      completed: false,
      color: TODO_NOTE_COLORS[list.length % TODO_NOTE_COLORS.length],
      createdAt: Date.now()
    });

    els.todoInput.value = '';
    saveState();
    renderTodayPanel();
    renderProfile();
    els.todoInput.focus();
  }

  function toggleCustomTodo(date, todoId) {
    const task = getTodoList(date).find((item) => item.id === todoId);
    if (!task) return;
    task.completed = !task.completed;
    saveState();
    renderTodayPanel();
    renderProfile();
  }

  function deleteCustomTodo(date, todoId) {
    if (!Array.isArray(state.todos[date])) return;
    state.todos[date] = state.todos[date].filter((task) => task.id !== todoId);
    if (!state.todos[date].length) delete state.todos[date];
    saveState();
    renderTodayPanel();
    renderProfile();
  }

  function toggleScheduleFromToday(date, segmentId) {
    const assignment = getAssignment(date, segmentId);
    if (!assignment) return;
    assignment.completed = !assignment.completed;
    saveState();
    renderBoard();
    renderProfile();
    renderTodayPanel();
  }

  function openScheduleFromToday(date, segmentId) {
    closeTodayPanel();
    window.setTimeout(() => openScheduleDetail(date, segmentId), 60);
  }

  function renderColorSwatches() {
    els.colorSwatches.innerHTML = COLOR_PALETTE.map((color) => `
      <button class="color-swatch" type="button" data-color="${color}" style="--swatch:${color}" aria-label="使用颜色 ${color}" aria-pressed="false"></button>
    `).join('');
    syncColorUI();
  }

  function syncColorUI() {
    const normalized = normalizeHex(selectedColor) || COLOR_PALETTE[0];
    selectedColor = normalized;
    const isPreset = COLOR_PALETTE.includes(normalized);

    els.colorSwatches.querySelectorAll('.color-swatch').forEach((button) => {
      const active = button.dataset.color === normalized;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    els.blockColor.value = normalized;
    setStyleSafe(els.customColorFace, '--custom-color', normalized);
    const customLabel = els.blockColor.closest('.custom-color');
    if (customLabel) customLabel.classList.toggle('is-active', !isPreset);
  }

  function renderAll() {
    renderHeader();
    renderProfile();
    renderBoard();
    renderPalette();
    renderLibrary();
    renderTrash();
    renderTodayTrigger();
    if (todayPanelOpen) renderTodayPanel();
    updateBoardHeights();
  }

  /* ------------------------------------------------------------------------
     Long-term memos
     ------------------------------------------------------------------------ */

  function getMemoById(memoId) {
    return state.memos.find((memo) => memo.id === memoId) || null;
  }

  function memoHost(url) {
    try {
      return new URL(url).hostname.replace(/^www\./i, '');
    } catch (error) {
      return '';
    }
  }

  function memoLineHtml(memo) {
    const kind = memo.linkMode
      ? (memo.urls.length > 1 ? `网址 ${memo.urls.length}` : '网址')
      : '备忘';
    let note = '';

    if (memo.description && memo.description.trim()) {
      note = memo.description.replace(/\s+/g, ' ').trim().slice(0, 56);
    } else if (memo.urls.find((entry) => entry.description)) {
      note = memo.urls.find((entry) => entry.description).description.replace(/\s+/g, ' ').trim().slice(0, 56);
    } else if (memo.linkMode && memo.urls.length) {
      const host = memoHost(memo.urls[0].url);
      note = memo.urls.length > 1 ? `${host} +${memo.urls.length - 1}` : host;
    }

    return `
      <span class="memo-ticker-kind">${kind}</span>
      <span class="memo-ticker-title">${esc(memo.title)}</span>
      ${note ? `<span class="memo-ticker-note">${esc(note)}</span>` : ''}
    `;
  }

  function paintMemoTickerLine(line, memo) {
    if (!line) return;
    if (!memo) {
      line.innerHTML = '<span class="memo-ticker-empty">还没有长期备忘，点击写下第一条学习网址或备赛任务。</span>';
      return;
    }
    line.innerHTML = memoLineHtml(memo);
  }

  function updateMemoTickerMeta(memo) {
    const count = state.memos.length;
    els.memoTickerCount.textContent = `${count} 条`;
    els.memoTicker.classList.toggle('is-empty', count === 0);
    els.memoTicker.setAttribute(
      'aria-label',
      memo
        ? `长期备忘：${memo.title}。点击打开长期备忘`
        : '长期备忘，暂无内容。点击添加长期备忘'
    );
  }

  function renderMemoTicker() {
    window.clearTimeout(memoAnimationTimer);
    memoAnimationTimer = null;

    const lineA = els.memoTickerLineA;
    const lineB = els.memoTickerLineB;
    lineA.className = 'memo-ticker-line';
    lineB.className = 'memo-ticker-line is-next';
    lineB.innerHTML = '';
    memoTickerActiveLine = lineA;

    if (!state.memos.length) {
      currentMemoId = null;
      paintMemoTickerLine(lineA, null);
      updateMemoTickerMeta(null);
      return;
    }

    if (!getMemoById(currentMemoId)) {
      const picked = pickWeightedMemo();
      currentMemoId = picked ? picked.id : null;
    }

    const memo = getMemoById(currentMemoId) || state.memos[0];
    currentMemoId = memo.id;
    paintMemoTickerLine(lineA, memo);
    updateMemoTickerMeta(memo);
  }

  function pickWeightedMemo() {
    if (!state.memos.length) return null;
    const total = state.memos.reduce((sum, memo) => sum + memo.weight, 0);
    if (total <= 0) return state.memos[Math.floor(Math.random() * state.memos.length)];

    let ticket = Math.random() * total;
    for (const memo of state.memos) {
      ticket -= memo.weight;
      if (ticket < 0) return memo;
    }
    return state.memos[state.memos.length - 1];
  }

  function animateMemoTicker(memo) {
    if (!memo) return;
    const current = memoTickerActiveLine || els.memoTickerLineA;
    const next = current === els.memoTickerLineA ? els.memoTickerLineB : els.memoTickerLineA;

    window.clearTimeout(memoAnimationTimer);
    paintMemoTickerLine(next, memo);
    next.className = 'memo-ticker-line is-next';
    void next.offsetWidth;
    current.classList.add('is-up');
    next.classList.remove('is-next');

    currentMemoId = memo.id;
    updateMemoTickerMeta(memo);

    memoAnimationTimer = window.setTimeout(() => {
      current.className = 'memo-ticker-line is-next';
      current.innerHTML = '';
      memoTickerActiveLine = next;
      memoAnimationTimer = null;
    }, 480);
  }

  function stopMemoTicker() {
    window.clearInterval(memoTimer);
    memoTimer = null;
  }

  function startMemoTicker() {
    stopMemoTicker();
    if (!state.memos.length) return;
    if (!memoTickerActiveLine) renderMemoTicker();
    if (state.memos.length < 2) return;
    if (els.memoDialog.open) return;

    memoTimer = window.setInterval(() => {
      if (document.hidden || els.memoDialog.open) return;
      const memo = pickWeightedMemo();
      if (memo) animateMemoTicker(memo);
    }, MEMO_TICKER_INTERVAL);
  }

  function renderMemoList() {
    els.memoCount.textContent = String(state.memos.length);

    if (!state.memos.length) {
      els.memoList.innerHTML = `
        <div class="memo-list-empty">
          还没有长期备忘。<br>新建一条学习网址、备赛任务或长期目标吧。
        </div>
      `;
      return;
    }

    const memos = [...state.memos].sort((a, b) => {
      if (b.weight !== a.weight) return b.weight - a.weight;
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });

    els.memoList.innerHTML = memos.map((memo) => {
      const weightClass = memo.weight >= 10 ? ' is-top' : memo.weight >= 8 ? ' is-hot' : '';
      const hasDescription = Boolean(
        (memo.description && memo.description.trim())
        || memo.urls.some((entry) => entry.description)
      );
      const meta = memo.linkMode
        ? `${memo.urls.length} 个网址${hasDescription ? ' · 有描述' : ''}`
        : ((memo.description || '').replace(/\s+/g, ' ').trim().slice(0, 48) || '纯文本备忘');
      return `
        <button class="memo-list-item ${memo.id === memoEditingId ? 'is-active' : ''}" type="button" data-memo-id="${esc(memo.id)}">
          <span class="memo-weight-badge${weightClass}" title="权重 ${memo.weight}">${memo.weight}</span>
          <span class="memo-list-copy">
            <strong>${esc(memo.title)}</strong>
            <small>${esc(meta)}</small>
          </span>
          <span class="memo-list-mode">${memo.linkMode ? '链接' : '文本'}</span>
        </button>
      `;
    }).join('');
  }

  function updateMemoUrlRowLink(row) {
    if (!row) return;
    const input = row.querySelector('.memo-url-input');
    const link = row.querySelector('.memo-open-link');
    if (!input || !link) return;

    const url = normalizeHttpUrl(input.value);
    if (url) {
      link.href = url;
      link.hidden = false;
    } else {
      link.hidden = true;
      link.href = '#';
    }
  }

  function updateMemoAddUrlState() {
    if (!els.memoAddUrl) return;
    const count = els.memoUrlList.querySelectorAll('[data-memo-url-row]').length;
    els.memoAddUrl.disabled = count >= 10;
    els.memoAddUrl.title = count >= 10 ? '最多添加 10 个直连网址' : '添加一个直连网址';
  }

  function addMemoUrlRow(link = {}) {
    const count = els.memoUrlList.querySelectorAll('[data-memo-url-row]').length;
    if (count >= 10) {
      showMemoError('最多添加 10 个直连网址。');
      return null;
    }

    const value = typeof link === 'string' ? link : (link.url || '');
    const descriptionValue = link && typeof link === 'object' ? (link.description || '') : '';

    const item = document.createElement('div');
    item.className = 'memo-url-item';
    item.dataset.memoUrlRow = 'true';
    item.innerHTML = `
      <div class="memo-url-row">
        <input type="text" class="memo-url-input" maxlength="2000" placeholder="https://example.com" inputmode="url" aria-label="直连网址">
        <a class="memo-open-link" href="#" target="_blank" rel="noopener noreferrer" hidden>打开</a>
        <button class="memo-url-remove" type="button" data-remove-memo-url aria-label="删除这个网址" title="删除这个网址">
          <svg class="icon"><use href="#i-x"></use></svg>
        </button>
      </div>
      <input type="text" class="memo-url-description" maxlength="300" placeholder="这个网址是做什么的…" aria-label="网址描述">
    `;
    item.querySelector('.memo-url-input').value = value;
    item.querySelector('.memo-url-description').value = descriptionValue;
    els.memoUrlList.appendChild(item);
    updateMemoUrlRowLink(item);
    updateMemoAddUrlState();
    return item;
  }

  function renderMemoUrlRows(urls = []) {
    els.memoUrlList.innerHTML = '';
    const values = urls.length ? urls : [{}];
    values.slice(0, 10).forEach((link) => addMemoUrlRow(link));
    updateMemoAddUrlState();
  }

  function collectMemoUrls() {
    const items = [...els.memoUrlList.querySelectorAll('[data-memo-url-row]')];
    const urls = [];
    let invalidInput = null;

    for (const item of items) {
      const input = item.querySelector('.memo-url-input');
      if (!input) continue;
      const text = input.value.trim();
      if (!text) continue;
      const url = normalizeHttpUrl(text);
      if (!url) {
        if (!invalidInput) invalidInput = input;
        continue;
      }
      const description = item.querySelector('.memo-url-description');
      const linkDescription = description ? description.value.trim().slice(0, 300) : '';
      const existing = urls.find((entry) => entry.url === url);
      if (existing) {
        if (!existing.description && linkDescription) existing.description = linkDescription;
        continue;
      }
      urls.push({ url, description: linkDescription });
      if (urls.length >= 10) break;
    }

    return { urls, invalidInput };
  }

  function updateMemoEditorMode() {
    const linkMode = els.memoLinkMode.checked;
    els.memoUrlField.hidden = !linkMode;
    els.memoDescriptionField.hidden = false;

    if (linkMode && !els.memoUrlList.querySelector('[data-memo-url-row]')) {
      addMemoUrlRow('');
    }

    els.memoEditorMode.textContent = linkMode ? '网址 + 文本' : '纯文本';
    els.memoUrlList.querySelectorAll('[data-memo-url-row]').forEach(updateMemoUrlRowLink);
    updateMemoAddUrlState();
  }

  function syncMemoWeight(value) {
    const numericValue = Number(value);
    const weight = clamp(Number.isFinite(numericValue) ? Math.round(numericValue) : 5, 1, 10);
    els.memoWeightRange.value = String(weight);
    els.memoWeightNumber.value = String(weight);
  }

  function showMemoError(message) {
    els.memoError.textContent = message;
    els.memoError.hidden = false;
  }

  function selectMemoForEditing(memoId) {
    const memo = getMemoById(memoId);
    if (!memo) {
      startNewMemo();
      return;
    }

    memoEditingId = memo.id;
    els.memoName.value = memo.title;
    els.memoLinkMode.checked = Boolean(memo.linkMode);
    renderMemoUrlRows(memo.urls || []);
    els.memoDescription.value = memo.description || '';
    els.memoWeightRange.value = String(memo.weight);
    els.memoWeightNumber.value = String(memo.weight);
    els.memoEditorTitle.textContent = '编辑长期备忘';
    els.memoDelete.hidden = false;
    els.memoError.hidden = true;
    updateMemoEditorMode();
    renderMemoList();
  }

  function startNewMemo() {
    memoEditingId = null;
    els.memoForm.reset();
    els.memoName.value = '';
    renderMemoUrlRows([]);
    els.memoDescription.value = '';
    els.memoLinkMode.checked = false;
    syncMemoWeight(5);
    els.memoEditorTitle.textContent = '新建长期备忘';
    els.memoDelete.hidden = true;
    els.memoError.hidden = true;
    updateMemoEditorMode();
    renderMemoList();
    if (els.memoDialog.open) {
      window.setTimeout(() => els.memoName.focus(), 30);
    }
  }

  function openMemoManager() {
    closeTodayPanel();
    stopMemoTicker();

    const preferred = getMemoById(currentMemoId) || state.memos[0] || null;
    if (preferred) {
      selectMemoForEditing(preferred.id);
    } else {
      startNewMemo();
    }

    if (!els.memoDialog.open) els.memoDialog.showModal();
    window.setTimeout(() => {
      if (els.memoDialog.open) els.memoName.focus();
    }, 50);
  }

  function handleMemoSubmit(event) {
    event.preventDefault();
    const title = els.memoName.value.trim();
    if (!title) {
      showMemoError('先给这条长期备忘起一个名称。');
      els.memoName.focus();
      return;
    }

    const linkMode = els.memoLinkMode.checked;
    const { urls, invalidInput } = collectMemoUrls();

    if (linkMode && invalidInput) {
      showMemoError('有网址格式不正确，请填写有效的 http/https 地址。');
      invalidInput.focus();
      return;
    }
    if (linkMode && !urls.length) {
      showMemoError('开启直连网址后，请至少填写一个有效网址。');
      const firstInput = els.memoUrlList.querySelector('.memo-url-input');
      if (firstInput) firstInput.focus();
      return;
    }

    const numericWeight = Number(els.memoWeightNumber.value || els.memoWeightRange.value);
    const weight = clamp(Number.isFinite(numericWeight) ? Math.round(numericWeight) : 5, 1, 10);
    const description = els.memoDescription.value.slice(0, 2000);
    const effectiveLinkMode = linkMode && urls.length > 0;
    const now = Date.now();
    let memo = memoEditingId ? getMemoById(memoEditingId) : null;

    if (memo) {
      memo.title = title.slice(0, 80);
      memo.weight = weight;
      memo.linkMode = effectiveLinkMode;
      memo.urls = urls;
      memo.description = description;
      memo.updatedAt = now;
    } else {
      if (state.memos.length >= 100) {
        showMemoError('长期备忘最多保存 100 条。');
        return;
      }
      memo = {
        id: uid('memo'),
        title: title.slice(0, 80),
        weight,
        linkMode: effectiveLinkMode,
        urls,
        description,
        createdAt: now,
        updatedAt: now
      };
      state.memos.push(memo);
      memoEditingId = memo.id;
    }

    saveState();
    selectMemoForEditing(memo.id);
    renderMemoTicker();
    startMemoTicker();
    showToast(`「${memo.title}」已保存。`);
  }

  function handleMemoDelete() {
    const memo = getMemoById(memoEditingId);
    if (!memo) return;

    askConfirm({
      title: `删除「${memo.title}」？`,
      message: '这条长期备忘会从滚动提示中永久移除，无法撤销。',
      confirmText: '删除备忘',
      onConfirm: () => {
        state.memos = state.memos.filter((item) => item.id !== memo.id);
        saveState();
        memoEditingId = null;
        if (state.memos.length) {
          selectMemoForEditing(state.memos[0].id);
        } else {
          startNewMemo();
        }
        renderMemoTicker();
        startMemoTicker();
        showToast(`「${memo.title}」已删除。`);
      }
    });
  }

  /* ------------------------------------------------------------------------
     Composer
     ------------------------------------------------------------------------ */

  function resetComposer(options = {}) {
    const { resetColor = false } = options;
    editingBlockId = null;
    els.blockTitle.value = '';
    els.blockSubmit.querySelector('span').textContent = '添加日程块';
    els.cancelEdit.hidden = true;
    if (resetColor) {
      selectedColor = COLOR_PALETTE[0];
      syncColorUI();
    }
  }

  function startEditingBlock(blockId) {
    const block = getBlock(blockId);
    if (!block) return;
    editingBlockId = block.id;
    selectedColor = normalizeHex(block.color) || COLOR_PALETTE[0];
    els.blockTitle.value = block.title;
    els.blockSubmit.querySelector('span').textContent = '保存修改';
    els.cancelEdit.hidden = false;
    syncColorUI();
    els.composer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    els.blockTitle.focus();
    const length = els.blockTitle.value.length;
    try {
      els.blockTitle.setSelectionRange(length, length);
    } catch (error) {
      /* no-op */
    }
  }

  function handleBlockSubmit(event) {
    event.preventDefault();
    const title = els.blockTitle.value.trim();

    if (!title) {
      showToast('先为日程块写一个内容。', 'warning');
      els.blockTitle.focus();
      return;
    }

    if (editingBlockId) {
      const block = getBlock(editingBlockId);
      if (!block) {
        resetComposer();
        showToast('这个日程块已经不存在了。', 'error');
        return;
      }
      block.title = title.slice(0, 48);
      block.color = selectedColor;
      saveState();
      resetComposer();
      renderAll();
      showToast(`已更新「${title}」`);
      return;
    }

    const newBlock = {
      id: uid('blk'),
      title: title.slice(0, 48),
      color: selectedColor,
      description: '',
      createdAt: Date.now()
    };
    state.blocks.push(newBlock);

    const usedColors = new Set(state.blocks.map((block) => normalizeHex(block.color)));
    const nextColor = COLOR_PALETTE.find((color) => !usedColors.has(color));
    selectedColor = nextColor || COLOR_PALETTE[state.blocks.length % COLOR_PALETTE.length];

    saveState();
    resetComposer();
    syncColorUI();
    renderPalette();
    renderLibrary();
    renderBoard();
    renderHeader();
    showToast(`已添加「${title}」，可以拖入时间格了。`);
  }

  function deleteBlockWithConfirm(blockId) {
    const block = getBlock(blockId);
    if (!block) return;
    const usage = countBlockUsage(blockId);

    askConfirm({
      title: `删除「${block.title}」？`,
      message: usage
        ? `这个日程块已经出现在 ${usage} 个时间格中。删除后会一并移入回收站，仍然可以还原。`
        : '删除后它会移入回收站，之后还可以还原。',
      confirmText: '移入回收站',
      onConfirm: () => trashBlockDefinition(blockId)
    });
  }

  function placementSnapshot(date, segmentId) {
    const day = state.days[date];
    if (!day) return null;
    const assignment = day.assignments[segmentId];
    if (!assignment) return null;
    const segment = day.segments.find((item) => item.id === segmentId);
    return {
      date,
      segmentId,
      start: segment ? segment.start : '',
      end: segment ? segment.end : '',
      note: assignment.note || '',
      completed: Boolean(assignment.completed)
    };
  }

  function pushTrashEntry(entry) {
    state.trash.unshift(entry);
    if (state.trash.length > 50) state.trash.length = 50;
  }

  function trashBlockDefinition(blockId, options = {}) {
    const block = getBlock(blockId);
    if (!block) return false;

    const placements = [];
    for (const [date, day] of Object.entries(state.days)) {
      for (const [segmentId, assignment] of Object.entries(day.assignments || {})) {
        if (assignment && assignment.blockId === blockId) {
          const snapshot = placementSnapshot(date, segmentId);
          if (snapshot) placements.push(snapshot);
        }
      }
    }

    pushTrashEntry({
      id: uid('trash'),
      type: 'block',
      title: block.title,
      color: block.color,
      description: block.description || '',
      blockId: block.id,
      placements,
      deletedAt: Date.now()
    });

    state.blocks = state.blocks.filter((item) => item.id !== blockId);
    for (const day of Object.values(state.days)) {
      for (const [segmentId, assignment] of Object.entries(day.assignments || {})) {
        if (assignment && assignment.blockId === blockId) delete day.assignments[segmentId];
      }
    }

    if (editingBlockId === blockId) resetComposer();
    saveState();
    renderAll();
    // Keep the tray and the composer list in lockstep even if the board render is interrupted.
    renderPalette();
    renderLibrary();
    renderTrash();
    showToast(
      placements.length
        ? `「${block.title}」已移入回收站，包含 ${placements.length} 项安排。`
        : `「${block.title}」已移入回收站。`
    );
    return true;
  }

  function removePlacementDirect(date, segmentId, options = {}) {
    const day = state.days[date];
    const assignment = day && day.assignments[segmentId];
    if (!assignment) return false;
    const block = getBlock(assignment.blockId);

    delete day.assignments[segmentId];
    saveState();
    renderAll();

    showToast(
      options.fromDrag
        ? `${block ? `「${block.title}」` : '这项安排'}已从日程表移除；日程块模板仍保留在托盘中。`
        : `${block ? `「${block.title}」` : '这项安排'}已从日程表移除；日程块模板仍保留。`
    );
    return true;
  }

  function findRestorableSegment(day, placement) {
    let segment = day.segments.find((item) => item.id === placement.segmentId);
    if (!segment && placement.start) {
      segment = day.segments.find((item) => item.start === placement.start && (!placement.end || item.end === placement.end));
    }
    if (!segment && placement.start) {
      segment = day.segments.find((item) => item.start === placement.start);
    }
    return segment || null;
  }

  function ensureTrashBlock(entry) {
    const existing = getBlock(entry.blockId);
    if (existing) return existing;
    const block = {
      id: entry.blockId || uid('blk'),
      title: entry.title,
      color: normalizeHex(entry.color) || COLOR_PALETTE[0],
      description: entry.description || '',
      createdAt: Date.now()
    };
    state.blocks.push(block);
    return block;
  }

  function restoreTrashEntry(entryId) {
    const entry = state.trash.find((item) => item.id === entryId);
    if (!entry) return;

    if (entry.type === 'placement') {
      const placement = entry.placements[0];
      if (!placement) {
        showToast('这条回收记录缺少可还原的信息。', 'warning');
        return;
      }
      const day = ensureDay(placement.date);
      const segment = findRestorableSegment(day, placement);
      if (!segment) {
        showToast('原来的时间段已经不存在，暂时无法还原。', 'warning');
        return;
      }
      if (day.assignments[segment.id]) {
        showToast('这个时间格已经有其他安排，暂时无法还原。', 'warning');
        return;
      }
      const block = ensureTrashBlock(entry);
      day.assignments[segment.id] = makeAssignment(block.id, placement);
      state.trash = state.trash.filter((item) => item.id !== entryId);
      saveState();
      renderAll();
      showToast(`「${entry.title}」已还原到 ${formatChineseDate(placement.date)}。`);
      return;
    }

    const block = ensureTrashBlock(entry);
    let restored = 0;
    let skipped = 0;

    for (const placement of entry.placements) {
      const day = ensureDay(placement.date);
      const segment = findRestorableSegment(day, placement);
      if (!segment || day.assignments[segment.id]) {
        skipped += 1;
        continue;
      }
      day.assignments[segment.id] = makeAssignment(block.id, placement);
      restored += 1;
    }

    state.trash = state.trash.filter((item) => item.id !== entryId);
    saveState();
    renderAll();

    if (restored && skipped) {
      showToast(`「${entry.title}」已还原，恢复 ${restored} 项，跳过 ${skipped} 项冲突安排。`, 'warning', 3600);
    } else if (restored) {
      showToast(`「${entry.title}」已还原，并恢复 ${restored} 项安排。`);
    } else if (skipped) {
      showToast(`「${entry.title}」已重新加入日程块库，${skipped} 项安排因冲突未恢复。`, 'warning', 3600);
    } else {
      showToast(`「${entry.title}」已还原到日程块库。`);
    }
  }

  function clearTrashWithConfirm() {
    if (!state.trash.length) return;
    askConfirm({
      title: '清空回收站？',
      message: '回收站里的内容将被永久删除，无法再还原。',
      confirmText: '永久清空',
      onConfirm: () => {
        state.trash = [];
        saveState();
        renderAll();
        showToast('回收站已清空。');
      }
    });
  }

  /* ------------------------------------------------------------------------
     Week navigation
     ------------------------------------------------------------------------ */

  function setWeek(weekStartISO, selectedDateISO) {
    const weekDate = parseISODate(weekStartISO);
    if (!weekDate) return;
    let nextWeek = toISODate(mondayOf(weekDate));
    if (nextWeek < MIN_WEEK_START) nextWeek = MIN_WEEK_START;
    if (nextWeek > MAX_WEEK_START) nextWeek = MAX_WEEK_START;
    state.ui.weekStart = nextWeek;
    state.ui.selectedDate = inRangeISO(selectedDateISO) ? selectedDateISO : nextWeek;
    renderAll();
    saveState();
  }

  function navigateWeek(offset) {
    const current = parseISODate(state.ui.weekStart);
    if (!current) return;
    const next = addDays(current, offset * 7);
    const nextISO = toISODate(next);
    if (nextISO < MIN_WEEK_START || nextISO > MAX_WEEK_START) return;

    const selected = state.ui.selectedDate;
    const selectedIndex = getWeekDates(state.ui.weekStart).indexOf(selected);
    const nextWeekDates = getWeekDates(nextISO);
    const nextSelected = nextWeekDates[selectedIndex] || nextISO;

    setWeek(nextISO, inRangeISO(nextSelected) ? nextSelected : nextISO);
  }

  function goToToday() {
    const today = getTodayISO();
    if (!inRangeISO(today)) {
      showToast('今天不在 2026.01.01 — 2029.12.31 的日历范围内。', 'warning');
      return;
    }
    setWeek(toISODate(mondayOf(parseISODate(today))), today);
  }

  /* ------------------------------------------------------------------------
     Reuse previous week
     ------------------------------------------------------------------------ */

  function getPreviousWeekStart() {
    const current = parseISODate(state.ui.weekStart);
    return current ? toISODate(addDays(current, -7)) : null;
  }

  function buildReusePlan() {
    const prevStart = getPreviousWeekStart();
    if (!prevStart) return null;

    const prevDates = getWeekDates(prevStart);
    const selected = [];
    let total = 0;
    let unfinished = 0;
    let completed = 0;

    for (const date of prevDates) {
      if (!inRangeISO(date)) continue;
      const day = state.days[date];
      if (!day) continue;

      for (const segment of day.segments) {
        const assignment = day.assignments[segment.id];
        if (!assignment) continue;
        const block = getBlock(assignment.blockId);
        if (!block) continue;

        total += 1;
        if (assignment.completed) completed += 1;
        else unfinished += 1;
        selected.push({ sourceDate: date, segment, assignment, block });
      }
    }

    const items = [];
    const plannedTargets = new Set();
    let skippedTime = 0;
    let skippedOccupied = 0;
    let skippedRange = 0;

    for (const source of selected) {
      const targetDate = toISODate(addDays(parseISODate(source.sourceDate), 7));
      if (!inRangeISO(targetDate)) {
        skippedRange += 1;
        continue;
      }

      const targetDay = ensureDay(targetDate);
      const targetSegment = targetDay.segments.find((segment) => {
        return segment.start === source.segment.start && segment.end === source.segment.end;
      }) || targetDay.segments.find((segment) => segment.start === source.segment.start);

      if (!targetSegment) {
        skippedTime += 1;
        continue;
      }

      const targetKey = `${targetDate}::${targetSegment.id}`;
      if (targetDay.assignments[targetSegment.id] || plannedTargets.has(targetKey)) {
        skippedOccupied += 1;
        continue;
      }

      plannedTargets.add(targetKey);
      items.push({
        targetDate,
        targetSegmentId: targetSegment.id,
        sourceDate: source.sourceDate,
        segment: source.segment,
        assignment: source.assignment,
        block: source.block
      });
    }

    return {
      prevStart,
      prevDates,
      total,
      unfinished,
      completed,
      selectedCount: selected.length,
      items,
      skippedTime,
      skippedOccupied,
      skippedRange
    };
  }

  function reusePreviousWeek() {
    closeTodayPanel();
    if (state.ui.weekStart <= MIN_WEEK_START) {
      showToast('已经是最早的一周，没有可复用的上周。', 'warning');
      return;
    }

    const plan = buildReusePlan();
    if (!plan || !plan.total) {
      showToast('上周还没有放置任何日程，暂时没有可复用的内容。', 'warning');
      return;
    }

    if (!plan.items.length) {
      const skipped = plan.skippedTime + plan.skippedOccupied + plan.skippedRange;
      showToast(
        `上周有 ${plan.total} 项安排，但本周没有可填入的匹配时间格${skipped ? `（${skipped} 项冲突或时间轴不匹配）` : ''}。`,
        'warning',
        3800
      );
      return;
    }

    applyReusePlan(plan);
  }

  function applyReusePlan(plan) {
    if (!plan || !plan.items.length) return;

    let applied = 0;
    for (const item of plan.items) {
      const targetDay = ensureDay(item.targetDate);
      const targetSegment = targetDay.segments.find((segment) => segment.id === item.targetSegmentId);
      if (!targetSegment || targetDay.assignments[targetSegment.id]) continue;

      targetDay.assignments[targetSegment.id] = makeAssignment(item.block.id, {
        note: item.assignment.completed ? '' : item.assignment.note,
        completed: false,
        createdAt: Date.now()
      });
      applied += 1;
    }

    const preSkipped = plan.skippedTime + plan.skippedOccupied + plan.skippedRange;
    const skipped = preSkipped + (plan.items.length - applied);
    saveState();
    renderAll();

    if (!applied) {
      showToast('没有可带入的日程，请检查本周时间格是否已满。', 'warning');
      return;
    }

    showToast(
      skipped
        ? `已一键复用 ${applied} 项日程，${skipped} 项因时间轴或冲突跳过。`
        : `已一键复用 ${applied} 项日程，未完成内容已顺延到本周。`
    );
  }

  /* ------------------------------------------------------------------------
     Late evening reminder
     ------------------------------------------------------------------------ */

  function isLateEvening() {
    return new Date().getHours() >= 22;
  }

  function getLateUnfinishedItems() {
    const today = getTodayISO();
    const day = state.days[today];
    const items = [];

    if (day) {
      for (const segment of day.segments) {
        const assignment = day.assignments[segment.id];
        if (!assignment || assignment.completed) continue;
        const block = getBlock(assignment.blockId);
        if (!block) continue;
        items.push({ kind: 'schedule', date: today, segment, assignment, block });
      }
      items.sort((a, b) => timeToMinutes(a.segment.start) - timeToMinutes(b.segment.start));
    }

    for (const task of getTodoList(today)) {
      if (!task.completed) items.push({ kind: 'todo', date: today, task });
    }

    return items;
  }

  function renderLateReminder(items) {
    els.lateReminderSub.textContent = `今天还有 ${items.length} 项待办没有完成。`;
    els.lateReminderList.innerHTML = items.map((item) => {
      if (item.kind === 'todo') {
        return `
          <button class="late-reminder-item" type="button" data-late-kind="todo" data-late-date="${item.date}" data-late-todo-id="${esc(item.task.id)}">
            <span class="late-reminder-dot" style="--late-color:${normalizeHex(item.task.color) || TODO_NOTE_COLORS[0]}" aria-hidden="true"></span>
            <span class="late-item-copy">
              <strong>${esc(item.task.text)}</strong>
              <small>小事 · 今天还没完成</small>
            </span>
            <span class="late-reminder-arrow" aria-hidden="true">›</span>
          </button>
        `;
      }

      return `
        <button class="late-reminder-item" type="button" data-late-kind="schedule" data-late-date="${item.date}" data-late-segment="${esc(item.segment.id)}">
          <span class="late-reminder-dot" style="--late-color:${normalizeHex(item.block.color) || COLOR_PALETTE[0]}" aria-hidden="true"></span>
          <span class="late-item-copy">
            <strong>${esc(item.block.title)}</strong>
            <small>${item.segment.start}–${item.segment.end} · ${formatChineseDate(item.date)}</small>
          </span>
          <span class="late-reminder-arrow" aria-hidden="true">›</span>
        </button>
      `;
    }).join('');
  }

  function maybeShowLateReminder() {
    if (!state || !state.profile.nickname) return false;
    if (!isLateEvening()) return false;
    if (els.lateReminderDialog.open) return false;
    if (document.querySelector('dialog[open]')) return false;
    const activeElement = document.activeElement;
    if (activeElement && activeElement.matches('input, textarea, select')) return false;

    const items = getLateUnfinishedItems();
    if (!items.length) return false;

    renderLateReminder(items);
    els.lateReminderDialog.showModal();
    return true;
  }

  function scheduleLateReminderCheck() {
    window.clearTimeout(lateReminderTimer);
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 22, 0, 0, 0);
    if (now.getTime() >= next.getTime()) next.setDate(next.getDate() + 1);
    const delay = clamp(next.getTime() - now.getTime(), 1000, 2147483647);
    lateReminderTimer = window.setTimeout(() => {
      maybeShowLateReminder();
      scheduleLateReminderCheck();
    }, delay);
  }

  /* ------------------------------------------------------------------------
     Board interactions: removing, selecting, timeline settings, resizing
     ------------------------------------------------------------------------ */

  function removeScheduledBlock(date, segmentId) {
    const assignment = getAssignment(date, segmentId);
    if (!assignment) return;
    removePlacementDirect(date, segmentId);
  }

  function handleBoardClick(event) {
    const removeButton = event.target.closest('[data-remove-schedule]');
    if (removeButton) {
      removeScheduledBlock(removeButton.dataset.date, removeButton.dataset.segmentId);
      return;
    }

    const timelineButton = event.target.closest('[data-open-timeline]');
    if (timelineButton) {
      openTimelineEditor(timelineButton.dataset.openTimeline);
      return;
    }

    const dateButton = event.target.closest('[data-select-date]');
    if (dateButton) {
      state.ui.selectedDate = dateButton.dataset.selectDate;
      renderHeader();
      renderBoard();
      saveState({ silent: true });
    }
  }

  function handleBoardPointerDown(event) {
    const handle = event.target.closest('.row-resizer');
    if (!handle) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    const date = handle.dataset.resizeDate;
    const segmentId = handle.dataset.resizeSegment;
    const day = state.days[date];
    if (!day) return;
    const segment = day.segments.find((item) => item.id === segmentId);
    const row = handle.closest('.time-row');
    if (!segment || !row) return;

    event.preventDefault();
    event.stopPropagation();

    const rowRect = row.getBoundingClientRect();
    resizeState = {
      date,
      segmentId,
      segment,
      row,
      rowTop: rowRect.top,
      startY: event.clientY,
      startHeight: segment.height,
      lastHeight: segment.height,
      lastSnapBottom: null,
      pointerId: event.pointerId
    };
    snapTargets = collectSnapTargets(date);

    document.body.classList.add('is-resizing');
    window.addEventListener('pointermove', handleResizeMove, { passive: false });
    window.addEventListener('pointerup', finishResize);
    window.addEventListener('pointercancel', cancelResize);
  }

  function collectSnapTargets(excludeDate) {
    const targets = [];
    els.dayGrid.querySelectorAll('.time-row').forEach((row) => {
      if (row.dataset.rowDate === excludeDate) return;
      const rect = row.getBoundingClientRect();
      const label = row.querySelector('.time-end');
      targets.push({
        date: row.dataset.rowDate,
        segmentId: row.dataset.rowSegment,
        bottom: rect.bottom,
        label: label ? label.textContent : ''
      });
    });
    return targets;
  }

  function findSnapTarget(candidateBottom) {
    const threshold = 9;
    let nearest = null;

    for (const target of snapTargets) {
      const distance = Math.abs(target.bottom - candidateBottom);
      if (distance > threshold) continue;
      if (!nearest || distance < nearest.distance) nearest = { ...target, distance };
    }

    if (!nearest) return null;

    const aligned = snapTargets.filter((target) => Math.abs(target.bottom - nearest.bottom) <= 1.5);
    return {
      bottom: nearest.bottom,
      count: aligned.length,
      label: nearest.label || '同一时间'
    };
  }

  function showAlignGuide(bottom, count, label) {
    const boardRect = els.boardScroll.getBoundingClientRect();
    els.alignGuide.hidden = false;
    els.alignGuide.style.left = `${boardRect.left}px`;
    els.alignGuide.style.width = `${boardRect.width}px`;
    els.alignGuide.style.top = `${bottom}px`;
    els.alignGuideLabel.textContent = count > 1 ? `已对齐 ${count} 个时段 · ${label}` : `已对齐 · ${label}`;
  }

  function hideAlignGuide() {
    els.alignGuide.hidden = true;
    if (resizeState) {
      resizeState.row.classList.remove('is-snap-aligned');
      resizeState.lastSnapBottom = null;
    }
  }

  function handleResizeMove(event) {
    if (!resizeState) return;
    event.preventDefault();

    const rawHeight = Math.max(
      MIN_ROW_HEIGHT,
      Math.round(resizeState.startHeight + event.clientY - resizeState.startY)
    );
    const candidateBottom = resizeState.rowTop + rawHeight;
    let snap = findSnapTarget(candidateBottom);
    if (snap) {
      const snapHeight = snap.bottom - resizeState.rowTop;
      if (snapHeight < MIN_ROW_HEIGHT - 1) snap = null;
    }
    let nextHeight = rawHeight;

    if (snap) {
      nextHeight = Math.max(MIN_ROW_HEIGHT, Math.round(snap.bottom - resizeState.rowTop));
      resizeState.row.classList.add('is-snap-aligned');
      showAlignGuide(snap.bottom, snap.count, snap.label);

      if (resizeState.lastSnapBottom !== snap.bottom) {
        resizeState.lastSnapBottom = snap.bottom;
        if (typeof navigator.vibrate === 'function') navigator.vibrate(8);
        resizeState.row.classList.remove('snap-pulse');
        void resizeState.row.offsetWidth;
        resizeState.row.classList.add('snap-pulse');
        window.setTimeout(() => {
          if (resizeState && resizeState.row) resizeState.row.classList.remove('snap-pulse');
        }, 260);
      }
    } else {
      resizeState.row.classList.remove('is-snap-aligned');
      hideAlignGuide();
    }

    resizeState.segment.height = nextHeight;
    resizeState.lastHeight = nextHeight;
    resizeState.row.style.height = `${nextHeight}px`;
    updateBoardHeights();

    els.resizeTip.hidden = false;
    els.resizeTip.textContent = snap
      ? `${resizeState.segment.start}–${resizeState.segment.end} · ${nextHeight}px · 已对齐`
      : `${resizeState.segment.start}–${resizeState.segment.end} · ${nextHeight}px`;
    const left = clamp(event.clientX + 14, 8, window.innerWidth - 190);
    const top = clamp(event.clientY - 30, 8, window.innerHeight - 36);
    els.resizeTip.style.left = `${left}px`;
    els.resizeTip.style.top = `${top}px`;
  }

  function finishResize() {
    if (!resizeState) return;
    cleanupResize();
    saveState();
  }

  function cancelResize() {
    cleanupResize();
    saveState({ silent: true });
  }

  function cleanupResize() {
    if (!resizeState) return;
    const segment = resizeState.segment;
    if (segment) {
      segment.height = Math.max(MIN_ROW_HEIGHT, resizeState.lastHeight);
    }
    document.body.classList.remove('is-resizing');
    els.resizeTip.hidden = true;
    els.alignGuide.hidden = true;
    if (resizeState.row) {
      resizeState.row.classList.remove('is-snap-aligned', 'snap-pulse');
    }
    snapTargets = [];
    window.removeEventListener('pointermove', handleResizeMove);
    window.removeEventListener('pointerup', finishResize);
    window.removeEventListener('pointercancel', cancelResize);
    resizeState = null;
    updateBoardHeights();
  }

  function handleBoardDoubleClick(event) {
    const scheduled = event.target.closest('[data-scheduled-block]');
    if (scheduled && !event.target.closest('.block-remove')) {
      openScheduleDetail(scheduled.dataset.sourceDate, scheduled.dataset.sourceSegment);
      return;
    }

    const handle = event.target.closest('.row-resizer');
    if (!handle) return;
    const date = handle.dataset.resizeDate;
    const segmentId = handle.dataset.resizeSegment;
    const day = state.days[date];
    if (!day) return;
    const segment = day.segments.find((item) => item.id === segmentId);
    const row = handle.closest('.time-row');
    if (!segment || !row) return;

    segment.height = DEFAULT_ROW_HEIGHT;
    row.style.height = `${DEFAULT_ROW_HEIGHT}px`;
    updateBoardHeights();
    saveState();
    showToast('这一行已恢复默认高度。');
  }

  function openScheduleDetail(date, segmentId) {
    const assignment = getAssignment(date, segmentId);
    if (!assignment) return;
    const block = getBlock(assignment.blockId);
    const day = state.days[date];
    const segment = day && day.segments.find((item) => item.id === segmentId);
    if (!block || !segment) return;

    detailContext = { date, segmentId, dirty: false };
    els.detailTitle.textContent = block.title;
    els.detailWhen.textContent = `${formatChineseDate(date)} · ${segment.start}–${segment.end}`;
    els.detailColorDot.style.setProperty('--detail-color', normalizeHex(block.color) || COLOR_PALETTE[0]);
    els.detailNote.value = assignment.note || '';
    updateDetailState();
    if (!els.detailDialog.open) els.detailDialog.showModal();
    window.setTimeout(() => els.detailNote.focus(), 40);
  }

  function updateDetailState() {
    if (!detailContext) return;
    const assignment = getAssignment(detailContext.date, detailContext.segmentId);
    if (!assignment) {
      if (els.detailDialog.open) els.detailDialog.close();
      return;
    }

    els.detailStatus.textContent = assignment.completed ? '已完成' : '待完成';
    els.detailStatus.classList.toggle('is-complete', assignment.completed);
    els.detailCompleteBtn.classList.toggle('is-complete', assignment.completed);
    els.detailCompleteBtn.querySelector('span').textContent = assignment.completed
      ? '已完成 · 点击撤销'
      : '标记为已完成';
    els.detailCompleteBtn.setAttribute('aria-pressed', assignment.completed ? 'true' : 'false');
    els.detailToggleHint.textContent = assignment.completed
      ? '再次点击按钮，可以撤销完成状态。'
      : '完成后，这个日程会在周计划里铺上一层淡灰色。';
  }

  function queueDetailSave() {
    if (!detailContext) return;
    const assignment = getAssignment(detailContext.date, detailContext.segmentId);
    if (!assignment) return;
    assignment.note = els.detailNote.value;
    const block = getBlock(assignment.blockId);
    if (block) block.description = assignment.note;
    detailContext.dirty = true;
    window.clearTimeout(detailSaveTimer);
    detailSaveTimer = window.setTimeout(() => {
      saveState({ silent: true });
      detailSaveTimer = null;
    }, 280);
  }

  function flushDetailSave() {
    window.clearTimeout(detailSaveTimer);
    detailSaveTimer = null;
    if (!detailContext) return false;
    const assignment = getAssignment(detailContext.date, detailContext.segmentId);
    if (!assignment) return false;
    assignment.note = els.detailNote.value;
    const block = getBlock(assignment.blockId);
    if (block) block.description = assignment.note;
    saveState({ silent: true });
    return detailContext.dirty;
  }

  function toggleDetailComplete() {
    if (!detailContext) return;
    const assignment = getAssignment(detailContext.date, detailContext.segmentId);
    if (!assignment) return;
    assignment.completed = !assignment.completed;
    saveState();
    updateDetailState();
    renderBoard();
    renderProfile();
    renderTodayTrigger();
    if (todayPanelOpen) renderTodayPanel();
    showToast(assignment.completed ? '已标记为完成。' : '已撤销完成状态。');
  }

  function openBlockNoteEditor(blockId) {
    const block = getBlock(blockId);
    if (!block) return;

    closeTodayPanel();
    const placements = getBlockPlacements(blockId);
    const distinctNotes = [...new Set(
      placements.map(({ assignment }) => assignment.note).filter((note) => note && note.trim())
    )];

    let initialText = '';
    if (distinctNotes.length === 1) {
      initialText = distinctNotes[0];
    } else if (block.description && block.description.trim()) {
      initialText = block.description;
    } else if (distinctNotes.length > 1) {
      initialText = distinctNotes[0];
    }

    blockNoteEditingId = blockId;
    els.blockNoteSub.textContent = `${block.title} · ${placements.length ? `已放置 ${placements.length} 项` : '尚未放置'}`;
    els.blockNoteColorDot.style.setProperty('--detail-color', normalizeHex(block.color) || COLOR_PALETTE[0]);
    els.blockNoteInput.value = initialText;

    if (!placements.length) {
      els.blockNoteHint.textContent = '当前还没有放置这个日程块；保存后，下次拖入时间格时会自动带上这段描述。';
    } else if (distinctNotes.length > 1) {
      els.blockNoteHint.textContent = `已放置 ${placements.length} 项，目前有 ${distinctNotes.length} 种不同描述；保存后会统一为这段内容。`;
    } else {
      els.blockNoteHint.textContent = `保存后会同步到已放置的 ${placements.length} 项日程；双击格子里的日程看到的也是这段描述。`;
    }

    if (!els.blockNoteDialog.open) els.blockNoteDialog.showModal();
    window.setTimeout(() => els.blockNoteInput.focus(), 40);
  }

  function saveBlockNoteDescription() {
    const block = getBlock(blockNoteEditingId);
    if (!block) return;

    const text = els.blockNoteInput.value.slice(0, 2000);
    block.description = text;

    let synced = 0;
    for (const day of Object.values(state.days)) {
      for (const assignment of Object.values(day.assignments || {})) {
        if (assignment && assignment.blockId === block.id) {
          assignment.note = text;
          synced += 1;
        }
      }
    }

    saveState();
    if (els.blockNoteDialog.open) els.blockNoteDialog.close();
    blockNoteEditingId = null;
    renderAll();
    showToast(
      synced
        ? `${text.trim() ? '日志描述已保存' : '日志描述已清空'}，并同步到 ${synced} 项日程。`
        : '日志描述已保存，下次放入这个日程块时会自动带出。'
    );
  }

  /* ------------------------------------------------------------------------
     Pointer drag and drop
     ------------------------------------------------------------------------ */

  function handleDocumentPointerDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (document.querySelector('dialog[open]')) return;

    const paletteCard = event.target.closest('[data-palette-block]');
    const scheduledBlock = event.target.closest('[data-scheduled-block]');
    const origin = paletteCard || scheduledBlock;
    if (!origin) return;
    if (event.target.closest('button')) return;

    const blockId = paletteCard
      ? paletteCard.dataset.paletteBlock
      : scheduledBlock.dataset.blockId;
    const block = getBlock(blockId);
    if (!block) return;

    dragState = {
      block,
      sourceType: paletteCard ? 'palette' : 'scheduled',
      sourceDate: scheduledBlock ? scheduledBlock.dataset.sourceDate : null,
      sourceSegment: scheduledBlock ? scheduledBlock.dataset.sourceSegment : null,
      originEl: origin,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      started: false,
      currentSlot: null,
      currentTrash: null,
      currentValid: false,
      pointerId: event.pointerId
    };

    window.addEventListener('pointermove', handleDragMove, { passive: false });
    window.addEventListener('pointerup', handleDragEnd);
    window.addEventListener('pointercancel', cancelDrag);
  }

  function updateDragTrashCopy(sourceType) {
    const title = els.dragTrash.querySelector('strong');
    const note = els.dragTrash.querySelector('small');
    if (!title || !note) return;
    if (sourceType === 'scheduled') {
      title.textContent = '从日程表删除';
      note.textContent = '松手移除安排，日程块保留';
    } else {
      title.textContent = '移入回收站';
      note.textContent = '松手删除日程块';
    }
  }

  function defaultDragHint() {
    if (!dragState) return '拖入时间格';
    return dragState.sourceType === 'scheduled'
      ? '拖到空白格，或与另一个日程交换'
      : '拖入空白格，或替换已有日程';
  }

  function startDragVisual(event) {
    if (!dragState) return;
    dragState.started = true;
    document.body.classList.add('is-dragging');
    dragState.originEl.classList.add(dragState.sourceType === 'palette' ? 'is-drag-source' : 'is-being-dragged');
    updateDragTrashCopy(dragState.sourceType);

    els.dragGhost.style.setProperty('--block-color', normalizeHex(dragState.block.color) || COLOR_PALETTE[0]);
    els.dragGhost.innerHTML = `
      <span class="drag-ghost-dot" aria-hidden="true"></span>
      <span class="drag-ghost-copy">
        <strong>${esc(dragState.block.title)}</strong>
        <span>${esc(defaultDragHint())}</span>
      </span>
    `;
    els.dragGhost.classList.add('is-visible');
    els.dragTrash.hidden = false;
    positionDragGhost(event.clientX, event.clientY);
  }

  function setDragHint(text) {
    const hint = els.dragGhost.querySelector('.drag-ghost-copy span');
    if (hint && hint.textContent !== text) hint.textContent = text;
  }

  function positionDragGhost(clientX, clientY) {
    const left = clamp(clientX - 91, 8, Math.max(8, window.innerWidth - 190));
    const top = clamp(clientY - 58, 8, Math.max(8, window.innerHeight - 64));
    els.dragGhost.style.transform = `translate3d(${left}px, ${top}px, 0) rotate(-1deg)`;
  }

  function clearDropTarget() {
    if (!dragState || !dragState.currentSlot) return;
    dragState.currentSlot.classList.remove('is-drop-target', 'is-invalid', 'is-swap-target', 'is-replace-target');
    dragState.currentSlot = null;
    dragState.currentValid = false;
  }

  function clearTrashTarget() {
    if (!dragState || !dragState.currentTrash) return;
    dragState.currentTrash.classList.remove('is-trash-hover');
    dragState.currentTrash = null;
  }

  function updateDropTarget(slot) {
    if (!dragState) return;
    if (!slot) {
      clearDropTarget();
      setDragHint(defaultDragHint());
      return;
    }
    if (dragState.currentSlot === slot) return;

    clearDropTarget();

    const sameSource = dragState.sourceType === 'scheduled'
      && slot.dataset.date === dragState.sourceDate
      && slot.dataset.segmentId === dragState.sourceSegment;
    const occupied = slot.classList.contains('has-block');

    dragState.currentSlot = slot;

    if (sameSource) {
      dragState.currentValid = false;
      setDragHint('这个日程已经在这里');
      return;
    }

    if (!occupied) {
      dragState.currentValid = true;
      slot.classList.add('is-drop-target');
      setDragHint('放入这个时间格');
      return;
    }

    const existingTitle = slot.querySelector('.scheduled-title');
    const targetTitle = existingTitle ? existingTitle.textContent.trim() : '已有日程';
    dragState.currentValid = true;

    if (dragState.sourceType === 'scheduled') {
      slot.classList.add('is-swap-target');
      setDragHint(`松开与「${targetTitle}」交换`);
    } else {
      slot.classList.add('is-replace-target');
      setDragHint(`松开更换为「${dragState.block.title}」`);
    }
  }

  function updateTrashTarget(target) {
    if (!dragState) return;
    if (dragState.currentTrash === target) return;
    clearDropTarget();
    clearTrashTarget();
    dragState.currentTrash = target;
    target.classList.add('is-trash-hover');
    setDragHint(
      dragState.sourceType === 'scheduled'
        ? '松手从日程表删除，日程块模板保留'
        : '松手删除这个日程块'
    );
  }

  function handleDragMove(event) {
    if (!dragState) return;

    const dx = event.clientX - dragState.startX;
    const dy = event.clientY - dragState.startY;

    if (!dragState.started) {
      if (Math.hypot(dx, dy) < 5) return;
      startDragVisual(event);
    }

    event.preventDefault();
    dragState.lastX = event.clientX;
    dragState.lastY = event.clientY;
    positionDragGhost(event.clientX, event.clientY);

    const element = document.elementFromPoint(event.clientX, event.clientY);
    const trashTarget = element && element.closest ? element.closest('[data-recycle-drop]') : null;

    if (trashTarget) {
      updateTrashTarget(trashTarget);
    } else {
      clearTrashTarget();
      const slot = element && element.closest ? element.closest('.slot') : null;
      updateDropTarget(slot);
    }

    autoScrollDuringDrag(event.clientX, event.clientY);
  }

  function autoScrollDuringDrag(clientX, clientY) {
    const boardRect = els.boardScroll.getBoundingClientRect();
    const withinBoardY = clientY >= boardRect.top && clientY <= boardRect.bottom;

    if (withinBoardY) {
      if (clientX > boardRect.right - 42) {
        els.boardScroll.scrollLeft += 12;
      } else if (clientX < boardRect.left + 42) {
        els.boardScroll.scrollLeft -= 12;
      }
    }

    if (clientY > window.innerHeight - 54) {
      window.scrollBy(0, 12);
    } else if (clientY < 54) {
      window.scrollBy(0, -12);
    }
  }

  function swapScheduledAssignments(sourceDate, sourceSegment, targetDate, targetSegment) {
    const sourceDay = state.days[sourceDate];
    const targetDay = state.days[targetDate];
    const sourceAssignment = sourceDay && sourceDay.assignments[sourceSegment];
    const targetAssignment = targetDay && targetDay.assignments[targetSegment];
    if (!sourceAssignment || !targetAssignment) return false;

    const sourceBlock = getBlock(sourceAssignment.blockId);
    const targetBlock = getBlock(targetAssignment.blockId);
    if (!sourceBlock || !targetBlock) return false;

    const sourceSnapshot = { ...sourceAssignment };
    const targetSnapshot = { ...targetAssignment };

    targetDay.assignments[targetSegment] = makeAssignment(sourceSnapshot.blockId, sourceSnapshot);
    sourceDay.assignments[sourceSegment] = makeAssignment(targetSnapshot.blockId, targetSnapshot);

    saveState();
    renderAll();
    showToast(`已交换「${sourceBlock.title}」和「${targetBlock.title}」。`);
    return true;
  }

  function confirmPaletteReplacement(blockId, targetDate, targetSegmentId) {
    const block = getBlock(blockId);
    const targetAssignment = getAssignment(targetDate, targetSegmentId);
    if (!block || !targetAssignment) return;

    if (targetAssignment.blockId === block.id) {
      showToast(`这个时间格已经是「${block.title}」。`);
      return;
    }

    const oldBlock = getBlock(targetAssignment.blockId);
    const oldTitle = oldBlock ? oldBlock.title : '已有日程';

    askConfirm({
      title: `更换「${oldTitle}」？`,
      message: `将用「${block.title}」替换这个时间格。原安排及其日志会从日程表移除，「${oldTitle}」日程块模板仍保留在托盘中。`,
      confirmText: '确认更换',
      onConfirm: () => {
        const day = state.days[targetDate];
        const liveAssignment = day && day.assignments[targetSegmentId];
        if (!liveAssignment) {
          showToast('这个时间格已经发生变化，请重新拖动。', 'warning');
          return;
        }
        if (liveAssignment.blockId === block.id) {
          showToast(`这个时间格已经是「${block.title}」。`);
          return;
        }

        day.assignments[targetSegmentId] = makeAssignment(block.id, {
          note: block.description || ''
        });
        saveState();
        renderAll();
        showToast(`已将「${oldTitle}」更换为「${block.title}」。`);
      }
    });
  }

  function handleDragEnd(event) {
    if (!dragState) return;

    const wasStarted = dragState.started;
    const sourceDate = dragState.sourceDate;
    const sourceSegment = dragState.sourceSegment;
    const sourceType = dragState.sourceType;
    const block = dragState.block;
    const clientX = Number.isFinite(event.clientX) ? event.clientX : dragState.lastX;
    const clientY = Number.isFinite(event.clientY) ? event.clientY : dragState.lastY;

    if (!wasStarted) {
      cleanupDrag();
      return;
    }

    const element = document.elementFromPoint(clientX, clientY);
    const trashTarget = element && element.closest ? element.closest('[data-recycle-drop]') : null;

    if (trashTarget) {
      cleanupDrag();
      if (sourceType === 'palette') {
        trashBlockDefinition(block.id, { fromDrag: true });
      } else if (sourceDate && sourceSegment) {
        removePlacementDirect(sourceDate, sourceSegment, { fromDrag: true });
      }
      return;
    }

    const slot = element && element.closest ? element.closest('.slot') : null;
    const targetDate = slot ? slot.dataset.date : null;
    const targetSegment = slot ? slot.dataset.segmentId : null;

    if (!slot || !targetDate || !targetSegment) {
      cleanupDrag();
      return;
    }

    const sameSource = sourceType === 'scheduled'
      && targetDate === sourceDate
      && targetSegment === sourceSegment;
    const occupied = slot.classList.contains('has-block');

    if (sameSource) {
      cleanupDrag();
      return;
    }

    if (occupied) {
      cleanupDrag();
      if (sourceType === 'scheduled') {
        if (sourceDate && sourceSegment) {
          swapScheduledAssignments(sourceDate, sourceSegment, targetDate, targetSegment);
        }
        return;
      }
      confirmPaletteReplacement(block.id, targetDate, targetSegment);
      return;
    }

    const targetDay = ensureDay(targetDate);
    if (!targetDay) {
      cleanupDrag();
      return;
    }

    let sourceAssignment = null;
    if (sourceType === 'scheduled' && sourceDate && sourceSegment) {
      const sourceDay = state.days[sourceDate];
      if (!sourceDay) {
        cleanupDrag();
        return;
      }
      sourceAssignment = sourceDay.assignments[sourceSegment] ? { ...sourceDay.assignments[sourceSegment] } : null;
      delete sourceDay.assignments[sourceSegment];
    }

    const assignmentData = sourceType === 'palette'
      ? { note: block.description || '' }
      : (sourceAssignment || {});
    targetDay.assignments[targetSegment] = makeAssignment(block.id, assignmentData);
    const segment = targetDay.segments.find((item) => item.id === targetSegment);
    const dayIndex = weekdayIndexOf(targetDate);
    const message = segment
      ? `已放入 ${WEEKDAYS[dayIndex]} ${segment.start}–${segment.end}`
      : '已放入时间格';

    cleanupDrag();
    saveState();
    renderAll();
    showToast(message);
  }

  function cancelDrag() {
    cleanupDrag();
  }

  function cleanupDrag() {
    if (!dragState) return;
    if (dragState.currentSlot) {
      dragState.currentSlot.classList.remove('is-drop-target', 'is-invalid', 'is-swap-target', 'is-replace-target');
    }
    if (dragState.currentTrash) {
      dragState.currentTrash.classList.remove('is-trash-hover');
    }
    if (dragState.originEl) {
      dragState.originEl.classList.remove('is-drag-source', 'is-being-dragged');
    }

    document.body.classList.remove('is-dragging');
    els.dragGhost.classList.remove('is-visible');
    els.dragGhost.innerHTML = '';
    els.dragGhost.style.transform = '';
    els.dragTrash.hidden = true;
    els.dragTrash.classList.remove('is-trash-hover');

    window.removeEventListener('pointermove', handleDragMove);
    window.removeEventListener('pointerup', handleDragEnd);
    window.removeEventListener('pointercancel', cancelDrag);
    dragState = null;
  }

  /* ------------------------------------------------------------------------
     Calendar dialog
     ------------------------------------------------------------------------ */

  function populateCalendarSelects() {
    const yearOptions = [];
    for (let year = 2026; year <= 2029; year += 1) {
      yearOptions.push(`<option value="${year}">${year}年</option>`);
    }
    els.calYear.innerHTML = yearOptions.join('');

    const monthOptions = [];
    for (let month = 0; month < 12; month += 1) {
      monthOptions.push(`<option value="${month}">${month + 1}月</option>`);
    }
    els.calMonth.innerHTML = monthOptions.join('');
  }

  function openCalendar() {
    closeTodayPanel();
    const selected = inRangeISO(state.ui.selectedDate) ? state.ui.selectedDate : getTodayISO();
    const date = parseISODate(inRangeISO(selected) ? selected : DATE_MIN);
    calendarCursor = { year: date.getFullYear(), month: date.getMonth() };
    renderCalendar();
    if (!els.calendarDialog.open) els.calendarDialog.showModal();
  }

  function moveCalendar(monthOffset) {
    const date = new Date(calendarCursor.year, calendarCursor.month + monthOffset, 1, 12);
    let year = date.getFullYear();
    let month = date.getMonth();
    if (year < 2026) { year = 2026; month = 0; }
    if (year > 2029) { year = 2029; month = 11; }
    calendarCursor = { year, month };
    renderCalendar();
  }

  function renderCalendar() {
    const { year, month } = calendarCursor;
    els.calYear.value = String(year);
    els.calMonth.value = String(month);

    const first = new Date(year, month, 1, 12);
    const daysInMonth = new Date(year, month + 1, 0, 12).getDate();
    const offset = (first.getDay() + 6) % 7;
    const today = getTodayISO();
    const weekDates = getWeekDates(state.ui.weekStart);

    const cells = [];
    for (let index = 0; index < offset; index += 1) {
      cells.push('<span class="cal-blank" aria-hidden="true"></span>');
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(year, month, day, 12);
      const iso = toISODate(date);
      const count = countAssignmentsForDate(iso);
      const classes = ['cal-day'];
      if (iso === today) classes.push('is-today');
      if (iso === state.ui.selectedDate) classes.push('is-selected');
      if (weekDates.includes(iso)) classes.push('in-week');
      if (count > 0) classes.push('has-plan');

      const labelParts = [`${year}年${month + 1}月${day}日`, WEEKDAYS[weekdayIndexOf(iso)]];
      if (count > 0) labelParts.push(`${count} 项安排`);
      if (iso === today) labelParts.push('今天');

      cells.push(`
        <button class="${classes.join(' ')}" type="button" data-cal-date="${iso}" aria-label="${esc(labelParts.join('，'))}" ${iso === today ? 'aria-current="date"' : ''}>
          <span class="cal-num">${day}</span>
          <span class="cal-dot" aria-hidden="true"></span>
        </button>
      `);
    }

    els.calGrid.innerHTML = cells.join('');
    els.calPrev.disabled = year === 2026 && month === 0;
    els.calNext.disabled = year === 2029 && month === 11;
    els.calToday.disabled = !inRangeISO(today);
  }

  function jumpToDate(iso) {
    if (!inRangeISO(iso)) return;
    const targetWeek = toISODate(mondayOf(parseISODate(iso)));
    if (els.calendarDialog.open) els.calendarDialog.close();
    setWeek(targetWeek, iso);
    showToast(`已切换至 ${formatChineseDate(iso)} 所在周`);
  }

  /* ------------------------------------------------------------------------
     Timeline editor
     ------------------------------------------------------------------------ */

  function openTimelineEditor(date) {
    if (!inRangeISO(date)) return;
    const day = ensureDay(date);
    timelineDate = date;
    timelineDraft = day.segments.map((segment) => ({ ...segment }));

    const weekday = WEEKDAYS[weekdayIndexOf(date)];
    const parsed = parseISODate(date);
    els.timelineTitle.textContent = `${weekday} · ${parsed.getMonth() + 1}月${parsed.getDate()}日的时间轴`;
    els.timelineSub.textContent = '这一日拥有独立的时间段与高度，不会影响其他日期。';

    const first = timelineDraft[0];
    const last = timelineDraft[timelineDraft.length - 1];
    els.genStart.value = first ? first.start : '08:00';
    els.genEnd.value = last ? last.end : '22:00';
    els.genStep.value = '90';
    els.timelineError.hidden = true;
    renderTimelineRows();

    if (!els.timelineDialog.open) els.timelineDialog.showModal();
  }

  function renderTimelineRows() {
    if (!timelineDraft || !timelineDraft.length) {
      els.timelineList.innerHTML = '<div class="timeline-empty">还没有时间段，先添加一个，或使用上方“快速生成”。</div>';
      return;
    }

    els.timelineList.innerHTML = timelineDraft.map((segment, index) => {
      const duration = durationLabel(segment.start, segment.end);
      return `
        <div class="timeline-row" data-draft-id="${esc(segment.id)}">
          <span class="row-index">${pad2(index + 1)}</span>
          <input type="time" data-field="start" value="${esc(segment.start)}" aria-label="第 ${index + 1} 段开始时间">
          <span class="time-arrow" aria-hidden="true">—</span>
          <input type="time" data-field="end" value="${esc(segment.end)}" aria-label="第 ${index + 1} 段结束时间">
          <span class="segment-duration">${duration}</span>
          <button class="segment-delete" type="button" data-delete-segment="${esc(segment.id)}" aria-label="删除第 ${index + 1} 个时间段">
            <svg class="icon"><use href="#i-x"></use></svg>
          </button>
        </div>
      `;
    }).join('');
  }

  function handleTimelineListChange(event) {
    const input = event.target.closest('input[data-field]');
    if (!input || !timelineDraft) return;
    const row = input.closest('[data-draft-id]');
    const segment = timelineDraft.find((item) => item.id === row.dataset.draftId);
    if (!segment) return;
    segment[input.dataset.field] = input.value;
    const duration = row.querySelector('.segment-duration');
    if (duration) duration.textContent = durationLabel(segment.start, segment.end);
    els.timelineError.hidden = true;
  }

  function handleTimelineListClick(event) {
    const button = event.target.closest('[data-delete-segment]');
    if (!button || !timelineDraft) return;
    timelineDraft = timelineDraft.filter((segment) => segment.id !== button.dataset.deleteSegment);
    els.timelineError.hidden = true;
    renderTimelineRows();
  }

  function addTimelineSegment() {
    if (!timelineDraft) return;
    const last = timelineDraft[timelineDraft.length - 1];
    let start = last && normalizeTime(last.end) ? last.end : '08:00';
    let startMinutes = timeToMinutes(start);

    if (startMinutes == null || startMinutes >= 23 * 60 + 30) {
      start = '08:00';
      startMinutes = 8 * 60;
    }

    const endMinutes = Math.min(startMinutes + 60, 1439);
    if (endMinutes <= startMinutes) {
      showTimelineError('这一天的可用时间已经排满，请先调整已有时间段。');
      return;
    }

    timelineDraft.push({
      id: uid('seg'),
      start: minutesToTime(startMinutes),
      end: minutesToTime(endMinutes),
      height: DEFAULT_ROW_HEIGHT
    });
    els.timelineError.hidden = true;
    renderTimelineRows();
    els.timelineList.scrollTop = els.timelineList.scrollHeight;
    const rows = els.timelineList.querySelectorAll('.timeline-row');
    const lastRow = rows[rows.length - 1];
    if (lastRow) {
      const input = lastRow.querySelector('input[data-field="start"]');
      if (input) input.focus();
    }
  }

  function generateTimeline() {
    const start = normalizeTime(els.genStart.value);
    const end = normalizeTime(els.genEnd.value);
    const step = Number(els.genStep.value);

    if (!start || !end) {
      showTimelineError('请填写有效的开始和结束时间。');
      return;
    }
    if (timeToMinutes(end) <= timeToMinutes(start)) {
      showTimelineError('结束时间需要晚于开始时间。');
      return;
    }
    if (!Number.isFinite(step) || step < 15) {
      showTimelineError('间隔时间至少为 15 分钟。');
      return;
    }

    const generated = [];
    let cursor = timeToMinutes(start);
    const endMinutes = timeToMinutes(end);
    let guard = 0;

    while (cursor < endMinutes && guard < 96) {
      const next = Math.min(cursor + step, endMinutes);
      const startLabel = minutesToTime(cursor);
      const matching = timelineDraft ? timelineDraft.find((segment) => segment.start === startLabel) : null;
      generated.push({
        id: matching ? matching.id : uid('seg'),
        start: startLabel,
        end: minutesToTime(next),
        height: matching ? matching.height : DEFAULT_ROW_HEIGHT
      });
      cursor = next;
      guard += 1;
    }

    timelineDraft = generated;
    els.timelineError.hidden = true;
    renderTimelineRows();
  }

  function showTimelineError(message) {
    els.timelineError.textContent = message;
    els.timelineError.hidden = false;
    els.timelineError.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function validateTimelineDraft() {
    if (!timelineDraft || !timelineDraft.length) {
      showTimelineError('这一天至少需要一个时间段。');
      return null;
    }

    const normalized = [];
    for (let index = 0; index < timelineDraft.length; index += 1) {
      const segment = timelineDraft[index];
      const start = normalizeTime(segment.start);
      const end = normalizeTime(segment.end);
      if (!start || !end) {
        showTimelineError(`第 ${index + 1} 个时间段的时间不完整。`);
        return null;
      }
      if (timeToMinutes(start) >= timeToMinutes(end)) {
        showTimelineError(`第 ${index + 1} 个时间段的结束时间需要晚于开始时间。`);
        return null;
      }
      normalized.push({
        id: segment.id,
        start,
        end,
        height: Math.max(MIN_ROW_HEIGHT, Number(segment.height) || DEFAULT_ROW_HEIGHT)
      });
    }

    normalized.sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));

    for (let index = 1; index < normalized.length; index += 1) {
      if (timeToMinutes(normalized[index].start) < timeToMinutes(normalized[index - 1].end)) {
        showTimelineError('时间段之间不能重叠，请检查开始与结束时间。');
        return null;
      }
    }

    return normalized;
  }

  function countLostAssignmentsCurrent(sorted) {
    if (!timelineDate) return 0;
    const day = state.days[timelineDate];
    if (!day) return 0;
    const nextIds = new Set(sorted.map((segment) => segment.id));
    return Object.keys(day.assignments || {}).filter((segmentId) => !nextIds.has(segmentId)).length;
  }

  function countLostAssignmentsForWeek(sorted) {
    let lost = countLostAssignmentsCurrent(sorted);
    const starts = new Set(sorted.map((segment) => segment.start));

    for (const date of getWeekDates(state.ui.weekStart)) {
      if (date === timelineDate || !inRangeISO(date)) continue;
      const day = state.days[date];
      if (!day) continue;
      for (const segmentId of Object.keys(day.assignments || {})) {
        const segment = day.segments.find((item) => item.id === segmentId);
        if (segment && !starts.has(segment.start)) lost += 1;
      }
    }
    return lost;
  }

  function prepareTimelineSave(applyToWeek) {
    const sorted = validateTimelineDraft();
    if (!sorted) return;

    if (applyToWeek) {
      const otherDates = getWeekDates(state.ui.weekStart)
        .filter((date) => date !== timelineDate && inRangeISO(date));
      if (!otherDates.length) {
        showTimelineError('这一周没有其他可应用的日期。');
        return;
      }
      const lost = countLostAssignmentsForWeek(sorted);
      const message = lost
        ? `将把当前时间轴应用到本周其余 ${otherDates.length} 天；有 ${lost} 项安排无法对应新时间段，会被移除。`
        : `将把当前时间轴应用到本周其余 ${otherDates.length} 天，开始时间相同的安排会自动保留。`;
      askConfirm({
        title: '应用到整周？',
        message,
        confirmText: '应用',
        onConfirm: () => commitTimeline(sorted, true)
      });
      return;
    }

    const lost = countLostAssignmentsCurrent(sorted);
    if (lost > 0) {
      askConfirm({
        title: '保存这组时间段？',
        message: `有 ${lost} 项已排日程不在新的时间段内，保存后会被移除。`,
        confirmText: '保存',
        onConfirm: () => commitTimeline(sorted, false)
      });
      return;
    }

    commitTimeline(sorted, false);
  }

  function commitTimeline(sorted, applyToWeek) {
    if (!timelineDate) return;
    const day = ensureDay(timelineDate);
    const nextSegments = sorted.map((segment) => ({
      id: segment.id,
      start: segment.start,
      end: segment.end,
      height: Math.max(MIN_ROW_HEIGHT, Number(segment.height) || DEFAULT_ROW_HEIGHT)
    }));
    const nextIds = new Set(nextSegments.map((segment) => segment.id));
    const nextAssignments = {};

    for (const [segmentId, blockId] of Object.entries(day.assignments || {})) {
      if (nextIds.has(segmentId)) nextAssignments[segmentId] = blockId;
    }

    day.segments = nextSegments;
    day.assignments = nextAssignments;

    const targetDates = applyToWeek
      ? getWeekDates(state.ui.weekStart).filter((date) => date !== timelineDate && inRangeISO(date))
      : [];

    for (const date of targetDates) {
      const targetDay = ensureDay(date);
      const existingByStart = new Map(targetDay.segments.map((segment) => [segment.start, segment]));

      const repairedSegments = sorted.map((segment) => {
        const existing = existingByStart.get(segment.start);
        return {
          id: existing ? existing.id : uid('seg'),
          start: segment.start,
          end: segment.end,
          height: segment.height
        };
      });

      const repairedIds = new Set(repairedSegments.map((segment) => segment.id));
      const repairedAssignments = {};
      for (const [segmentId, blockId] of Object.entries(targetDay.assignments || {})) {
        if (repairedIds.has(segmentId)) repairedAssignments[segmentId] = blockId;
      }

      targetDay.segments = repairedSegments;
      targetDay.assignments = repairedAssignments;
    }

    if (els.timelineDialog.open) els.timelineDialog.close();
    timelineDraft = null;
    timelineDate = null;

    saveState();
    renderAll();
    showToast(applyToWeek ? '时间轴已应用到本周。' : '这一日的时间轴已保存。');
  }

  /* ------------------------------------------------------------------------
     Confirmation and toast helpers
     ------------------------------------------------------------------------ */

  function askConfirm(options) {
    const {
      title = '确认操作',
      message = '',
      confirmText = '确定',
      danger = true,
      onConfirm = null
    } = options;

    confirmAction = typeof onConfirm === 'function' ? onConfirm : null;
    els.confirmTitle.textContent = title;
    els.confirmMessage.textContent = message;
    els.confirmOk.textContent = confirmText;
    els.confirmOk.classList.toggle('btn-danger', danger);
    els.confirmOk.classList.toggle('btn-accent', !danger);
    els.confirmSymbol.classList.toggle('is-neutral', !danger);

    if (!els.confirmDialog.open) els.confirmDialog.showModal();
  }

  function closeConfirm() {
    confirmAction = null;
    if (els.confirmDialog.open) els.confirmDialog.close();
  }

  function showToast(message, type = 'success', duration = 2600) {
    if (!els.toast) return;
    window.clearTimeout(toastTimer);
    const iconName = type === 'error' || type === 'warning' ? 'i-alert' : 'i-check';
    els.toast.className = `toast${type === 'warning' ? ' is-warning' : ''}${type === 'error' ? ' is-error' : ''}`;
    els.toast.innerHTML = `<span class="toast-icon"><svg class="icon"><use href="#${iconName}"></use></svg></span><span>${esc(message)}</span>`;
    els.toast.hidden = false;
    window.requestAnimationFrame(() => els.toast.classList.add('is-visible'));

    toastTimer = window.setTimeout(() => {
      els.toast.classList.remove('is-visible');
      window.setTimeout(() => {
        if (!els.toast.classList.contains('is-visible')) els.toast.hidden = true;
      }, 220);
    }, duration);
  }

  /* ------------------------------------------------------------------------
     Menu, import and export
     ------------------------------------------------------------------------ */

  function setMenuOpen(open) {
    menuOpen = open;
    els.appMenu.hidden = !open;
    els.menuButton.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function exportBackup() {
    const payload = JSON.stringify(state, null, 2);
    const blob = new Blob([payload], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `周迹备份-${getTodayISO()}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1200);
    showToast('备份已导出。');
  }

  function handleImportFile(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();

    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const imported = normalizeState(parsed);
        askConfirm({
          title: '导入这份备份？',
          message: `备份包含 ${imported.blocks.length} 个日程块、${Object.keys(imported.days).length} 天的数据、${imported.memos.length} 条长期备忘。导入后会覆盖当前的全部内容。`,
          confirmText: '导入并覆盖',
          onConfirm: () => {
            state = imported;
            resetComposer();
            selectedColor = COLOR_PALETTE[0];
            syncColorUI();
            renderAll();
            renderMemoTicker();
            startMemoTicker();
            saveState();
            showToast('备份已导入。');
            if (!state.profile.nickname) window.setTimeout(openNicknameDialog, 300);
          }
        });
      } catch (error) {
        showToast('备份文件无法读取，或不是有效的周迹备份。', 'error', 3200);
      } finally {
        els.importFile.value = '';
      }
    };

    reader.onerror = () => {
      showToast('读取文件失败，请重试。', 'error');
      els.importFile.value = '';
    };

    reader.readAsText(file, 'utf-8');
  }

  function clearWeekAssignments() {
    const count = countAssignmentsForWeek();
    if (!count) {
      showToast('本周还没有已放置的日程。', 'warning');
      return;
    }

    askConfirm({
      title: '清空本周安排？',
      message: `本周共有 ${count} 项日程。清空后，时间轴与日程块库都会保留。`,
      confirmText: '清空本周',
      onConfirm: () => {
        for (const date of getWeekDates(state.ui.weekStart)) {
          if (state.days[date]) state.days[date].assignments = {};
        }
        saveState();
        renderAll();
        showToast('本周安排已清空。');
      }
    });
  }

  function clearAllData() {
    askConfirm({
      title: '清空全部数据？',
      message: '所有日期的时间轴、日程安排、日程块、小事清单、长期备忘和回收站都会被删除，且无法撤销。昵称与打卡记录会保留。建议先导出备份。',
      confirmText: '全部清空',
      onConfirm: () => {
        const weekStart = state.ui.weekStart;
        const selectedDate = state.ui.selectedDate;
        state = {
          version: 3,
          profile: state.profile,
          blocks: [],
          days: {},
          todos: {},
          trash: [],
          memos: [],
          ui: { weekStart, selectedDate },
          updatedAt: Date.now()
        };
        resetComposer();
        selectedColor = COLOR_PALETTE[0];
        syncColorUI();
        renderAll();
        saveState();
        renderMemoTicker();
        startMemoTicker();
        showToast('全部周计划数据已清空，昵称和打卡记录已保留。');
      }
    });
  }

  /* ------------------------------------------------------------------------
     Event binding and init
     ------------------------------------------------------------------------ */

  function handleMenuAction(action) {
    setMenuOpen(false);
    if (action === 'export') exportBackup();
    if (action === 'import') {
      els.importFile.value = '';
      els.importFile.click();
    }
    if (action === 'clear-week') clearWeekAssignments();
    if (action === 'clear-all') clearAllData();
  }

  function bindEvents() {
    els.prevWeek.addEventListener('click', () => navigateWeek(-1));
    els.nextWeek.addEventListener('click', () => navigateWeek(1));
    els.thisWeek.addEventListener('click', goToToday);
    els.brandHome.addEventListener('click', (event) => {
      event.preventDefault();
      goToToday();
    });
    els.profileButton.addEventListener('click', openProfileDialog);

    document.querySelectorAll('[data-rail-action]').forEach((button) => {
      button.addEventListener('click', () => {
        closeTodayPanel();
        setMenuOpen(false);
        const action = button.dataset.railAction;
        if (action === 'today') goToToday();
        else if (action === 'calendar') openCalendar();
        else if (action === 'memo') openMemoManager();
        else if (action === 'profile') openProfileDialog();
      });
    });

    els.nicknameForm.addEventListener('submit', handleNicknameSubmit);
    els.nicknameInput.addEventListener('input', () => {
      els.nicknameError.hidden = true;
    });
    els.nicknameDialog.addEventListener('cancel', (event) => {
      if (!state.profile.nickname) event.preventDefault();
    });

    els.profileNicknameForm.addEventListener('submit', handleProfileNicknameSubmit);
    els.profileCheckin.addEventListener('click', handleProfileCheckin);

    els.todayButton.addEventListener('click', () => {
      if (todayPanelOpen) closeTodayPanel();
      else openTodayPanel();
    });
    els.todayClose.addEventListener('click', closeTodayPanel);
    els.todoPrevDate.addEventListener('click', () => shiftTodoDate(-1));
    els.todoNextDate.addEventListener('click', () => shiftTodoDate(1));
    els.todoToday.addEventListener('click', () => {
      if (inRangeISO(getTodayISO())) setTodoDate(getTodayISO());
    });
    els.todoDateInput.addEventListener('change', () => {
      const next = els.todoDateInput.value;
      if (inRangeISO(next)) setTodoDate(next);
      else els.todoDateInput.value = ensureTodoDate();
    });
    els.todoForm.addEventListener('submit', handleTodoSubmit);
    els.todayScheduleList.addEventListener('click', (event) => {
      const toggle = event.target.closest('[data-toggle-day-schedule]');
      if (toggle) {
        toggleScheduleFromToday(toggle.dataset.date, toggle.dataset.segmentId);
        return;
      }
      const open = event.target.closest('[data-open-day-schedule]');
      if (open) openScheduleFromToday(open.dataset.date, open.dataset.segmentId);
    });
    els.todayTodoList.addEventListener('click', (event) => {
      const toggle = event.target.closest('[data-toggle-day-todo]');
      if (toggle) {
        toggleCustomTodo(toggle.dataset.date, toggle.dataset.todoId);
        return;
      }
      const remove = event.target.closest('[data-delete-day-todo]');
      if (remove) deleteCustomTodo(remove.dataset.date, remove.dataset.todoId);
    });

    els.reuseLastWeek.addEventListener('click', reusePreviousWeek);

    els.lateReminderList.addEventListener('click', (event) => {
      const item = event.target.closest('[data-late-kind]');
      if (!item) return;
      const kind = item.dataset.lateKind;
      const date = item.dataset.lateDate;
      if (els.lateReminderDialog.open) els.lateReminderDialog.close();

      if (kind === 'todo') {
        todoDate = getTodayISO();
        window.setTimeout(() => {
          openTodayPanel(todoDate);
          const todoId = item.dataset.lateTodoId;
          window.setTimeout(() => {
            const note = Array.from(els.todayTodoList.querySelectorAll('[data-todo-id]'))
              .find((element) => element.dataset.todoId === todoId);
            if (note) {
              note.classList.add('is-flash');
              note.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
              window.setTimeout(() => note.classList.remove('is-flash'), 1200);
            }
          }, 80);
        }, 80);
        return;
      }

      const segmentId = item.dataset.lateSegment;
      window.setTimeout(() => openScheduleDetail(date, segmentId), 80);
    });

    els.trashList.addEventListener('click', (event) => {
      const restoreButton = event.target.closest('[data-restore-trash]');
      if (restoreButton) restoreTrashEntry(restoreButton.dataset.restoreTrash);
    });
    els.clearTrash.addEventListener('click', clearTrashWithConfirm);

    els.detailNote.addEventListener('input', queueDetailSave);
    els.detailCompleteBtn.addEventListener('click', toggleDetailComplete);

    els.calendarOpen.addEventListener('click', openCalendar);
    els.calPrev.addEventListener('click', () => moveCalendar(-1));
    els.calNext.addEventListener('click', () => moveCalendar(1));
    els.calYear.addEventListener('change', () => {
      calendarCursor.year = Number(els.calYear.value);
      renderCalendar();
    });
    els.calMonth.addEventListener('change', () => {
      calendarCursor.month = Number(els.calMonth.value);
      renderCalendar();
    });
    els.calToday.addEventListener('click', () => {
      if (inRangeISO(getTodayISO())) jumpToDate(getTodayISO());
    });
    els.calGrid.addEventListener('click', (event) => {
      const button = event.target.closest('[data-cal-date]');
      if (button) jumpToDate(button.dataset.calDate);
    });

    els.menuButton.addEventListener('click', (event) => {
      event.stopPropagation();
      closeTodayPanel();
      setMenuOpen(!menuOpen);
    });
    els.appMenu.addEventListener('click', (event) => {
      const item = event.target.closest('[data-menu-action]');
      if (item) handleMenuAction(item.dataset.menuAction);
    });
    document.addEventListener('click', (event) => {
      if (menuOpen && !event.target.closest('.menu-wrap')) setMenuOpen(false);
      if (todayPanelOpen
        && !event.target.closest('#todayPanel')
        && !event.target.closest('#todayButton')) {
        closeTodayPanel();
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (menuOpen) setMenuOpen(false);
      if (todayPanelOpen) closeTodayPanel();
    });

    els.importFile.addEventListener('change', handleImportFile);

    els.blockForm.addEventListener('submit', handleBlockSubmit);
    els.colorSwatches.addEventListener('click', (event) => {
      const button = event.target.closest('[data-color]');
      if (!button) return;
      selectedColor = normalizeHex(button.dataset.color) || COLOR_PALETTE[0];
      syncColorUI();
    });
    els.blockColor.addEventListener('input', () => {
      selectedColor = normalizeHex(els.blockColor.value) || COLOR_PALETTE[0];
      syncColorUI();
    });
    els.cancelEdit.addEventListener('click', () => resetComposer());

    els.libraryList.addEventListener('click', (event) => {
      const editButton = event.target.closest('[data-edit-block]');
      if (editButton) {
        startEditingBlock(editButton.dataset.editBlock);
        return;
      }
      const deleteButton = event.target.closest('[data-delete-block]');
      if (deleteButton) deleteBlockWithConfirm(deleteButton.dataset.deleteBlock);
    });

    els.paletteList.addEventListener('click', (event) => {
      const noteButton = event.target.closest('[data-edit-block-note]');
      if (!noteButton) return;
      event.preventDefault();
      event.stopPropagation();
      openBlockNoteEditor(noteButton.dataset.editBlockNote);
    });

    els.blockNoteSave.addEventListener('click', saveBlockNoteDescription);
    els.blockNoteDialog.addEventListener('close', () => {
      blockNoteEditingId = null;
    });

    els.dayGrid.addEventListener('click', handleBoardClick);
    els.dayGrid.addEventListener('pointerdown', handleBoardPointerDown);
    els.dayGrid.addEventListener('dblclick', handleBoardDoubleClick);
    document.addEventListener('pointerdown', handleDocumentPointerDown);

    els.timelineList.addEventListener('input', handleTimelineListChange);
    els.timelineList.addEventListener('change', handleTimelineListChange);
    els.timelineList.addEventListener('click', handleTimelineListClick);
    els.addSegment.addEventListener('click', addTimelineSegment);
    els.generateTimeline.addEventListener('click', generateTimeline);
    els.saveTimeline.addEventListener('click', () => prepareTimelineSave(false));
    els.applyTimelineWeek.addEventListener('click', () => prepareTimelineSave(true));

    els.timelineDialog.addEventListener('close', () => {
      timelineDraft = null;
      timelineDate = null;
    });

    els.detailDialog.addEventListener('close', () => {
      const dirty = flushDetailSave();
      detailContext = null;
      window.clearTimeout(detailSaveTimer);
      detailSaveTimer = null;
      if (dirty) {
        renderBoard();
        renderPalette();
      }
    });

    els.memoTicker.addEventListener('click', openMemoManager);
    els.memoTicker.addEventListener('mouseenter', stopMemoTicker);
    els.memoTicker.addEventListener('mouseleave', startMemoTicker);
    els.memoNew.addEventListener('click', startNewMemo);
    els.memoList.addEventListener('click', (event) => {
      const item = event.target.closest('[data-memo-id]');
      if (item) selectMemoForEditing(item.dataset.memoId);
    });
    els.memoForm.addEventListener('submit', handleMemoSubmit);
    els.memoLinkMode.addEventListener('change', () => {
      updateMemoEditorMode();
      if (els.memoLinkMode.checked) {
        const firstInput = els.memoUrlList.querySelector('.memo-url-input');
        if (firstInput) firstInput.focus();
      }
    });
    els.memoName.addEventListener('input', () => {
      els.memoError.hidden = true;
    });
    els.memoAddUrl.addEventListener('click', () => {
      const row = addMemoUrlRow('');
      if (row) {
        row.querySelector('.memo-url-input').focus();
        els.memoError.hidden = true;
      }
    });
    els.memoUrlList.addEventListener('input', (event) => {
      const row = event.target.closest('[data-memo-url-row]');
      if (!row) return;
      updateMemoUrlRowLink(row);
      els.memoError.hidden = true;
    });
    els.memoUrlList.addEventListener('click', (event) => {
      const removeButton = event.target.closest('[data-remove-memo-url]');
      if (!removeButton) return;
      const row = removeButton.closest('[data-memo-url-row]');
      if (row) row.remove();
      if (!els.memoUrlList.querySelector('[data-memo-url-row]')) addMemoUrlRow('');
      updateMemoAddUrlState();
      els.memoError.hidden = true;
    });
    els.memoDescription.addEventListener('input', () => {
      els.memoError.hidden = true;
    });
    els.memoWeightRange.addEventListener('input', () => {
      els.memoWeightNumber.value = els.memoWeightRange.value;
    });
    els.memoWeightNumber.addEventListener('input', () => {
      const value = Number(els.memoWeightNumber.value);
      if (Number.isFinite(value) && value >= 1 && value <= 10) {
        els.memoWeightRange.value = String(Math.round(value));
      }
    });
    els.memoWeightNumber.addEventListener('change', () => {
      syncMemoWeight(els.memoWeightNumber.value);
    });
    els.memoDelete.addEventListener('click', handleMemoDelete);
    els.memoDialog.addEventListener('close', () => {
      startMemoTicker();
    });

    document.querySelectorAll('[data-close-dialog]').forEach((button) => {
      button.addEventListener('click', () => {
        const dialog = document.getElementById(button.dataset.closeDialog);
        if (dialog && dialog.open) dialog.close();
      });
    });

    document.querySelectorAll('dialog').forEach((dialog) => {
      dialog.addEventListener('click', (event) => {
        if (event.target !== dialog) return;
        if (dialog.id === 'nicknameDialog' && !state.profile.nickname) return;
        dialog.close();
      });
    });

    els.confirmCancel.addEventListener('click', closeConfirm);
    els.confirmOk.addEventListener('click', () => {
      const action = confirmAction;
      confirmAction = null;
      if (els.confirmDialog.open) els.confirmDialog.close();
      if (action) action();
    });
    els.confirmDialog.addEventListener('close', () => {
      confirmAction = null;
    });
    els.confirmDialog.addEventListener('cancel', () => {
      confirmAction = null;
    });
  }

  function init() {
    cacheElements();
    populateCalendarSelects();
    renderColorSwatches();
    bindEvents();

    const loaded = loadState();
    state = loaded.value;
    todoDate = inRangeISO(getTodayISO()) ? getTodayISO() : DATE_MIN;
    renderAll();
    renderMemoTicker();
    startMemoTicker();
    updateSaveStatus('saved');

    if (loaded.firstRun) {
      saveState({ silent: true });
    }

    if (state.profile.nickname) {
      if (recordCheckIn({ silent: true })) {
        saveState({ silent: true });
        renderProfile();
      }
      window.setTimeout(() => maybeShowLateReminder(), 850);
    } else {
      window.setTimeout(openNicknameDialog, 420);
    }

    scheduleLateReminderCheck();

    if (loaded.warning) {
      window.setTimeout(() => showToast(loaded.warning, 'warning', 4800), 900);
    }
  }

  init();
})();
