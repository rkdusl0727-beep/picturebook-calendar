const DEFAULT_TITLE = '그림책 달력';
const LEGACY_TITLE_KEY = 'picture-book-calendar-title';
const LEGACY_ENTRIES_KEY = 'picture-book-calendar';
const LEGACY_DELETED_DATES_KEY = 'picture-book-calendar-deleted-dates';
const LEGACY_TITLE_UPDATED_KEY = 'picture-book-calendar-title-updated-at';
const DEFAULT_CALENDAR_ID_KEY = 'picture-book-calendar-default-id';
const calendarIdentity = getCalendarIdentity();
const CALENDAR_ID = calendarIdentity.id;
const STORAGE_PREFIX = `picture-book-calendar:${CALENDAR_ID}`;
const LOCAL_TITLE_KEY = `${STORAGE_PREFIX}:title`;
const LOCAL_ENTRIES_KEY = `${STORAGE_PREFIX}:entries`;
const LOCAL_DELETED_DATES_KEY = `${STORAGE_PREFIX}:deleted-dates`;
const LOCAL_TITLE_UPDATED_KEY = `${STORAGE_PREFIX}:title-updated-at`;
const SYNC_API_URL = `/api/calendar-state?calendar=${encodeURIComponent(CALENDAR_ID)}`;
const SYNC_INTERVAL_MS = 8000;

if (calendarIdentity.shouldMigrateLegacy) {
  migrateLegacyStorage();
}

const state = {
  cursor: new Date(),
  selectedDate: toDateKey(new Date()),
  modalQuery: '',
  searchResults: [],
  holidaysByYear: {},
  holidayLoadingYears: new Set(),
  drafts: {},
  isEditingTitle: false,
  isComposingTitle: false,
  syncReady: false,
  syncTimer: null,
  syncInterval: null,
  titleUpdatedAt: loadTitleUpdatedAt(),
  deletedDates: loadDeletedDates(),
  entries: loadEntries()
};

const substituteImages = [
  { title: '휴가', accent: '#8fd3c1', bg: '#eefaf7', icon: 'sun' },
  { title: '현장학습', accent: '#b8d889', bg: '#f5fbeb', icon: 'tree' },
  { title: '행사', accent: '#f4c866', bg: '#fff8df', icon: 'star' }
].map((item) => ({
  ...item,
  thumbnail: makeSubstituteImage(item)
}));

const grid = document.querySelector('#grid');
const monthLabel = document.querySelector('#monthLabel');
const calendarTitle = document.querySelector('#calendarTitle');
const bookCount = document.querySelector('#bookCount');
const modalTitle = document.querySelector('#modalTitle');
const coverResults = document.querySelector('#coverResults');
const bookModal = document.querySelector('#bookModal');
const closeModal = document.querySelector('#closeModal');
const statusEl = document.querySelector('#status');
const clearDateButton = document.querySelector('#clearDateButton');
const copyCalendarLinkButton = document.querySelector('#copyCalendarLink');
const newCalendarButton = document.querySelector('#newCalendarButton');

document.querySelector('#prevMonth').addEventListener('click', () => changeMonth(-1));
document.querySelector('#nextMonth').addEventListener('click', () => changeMonth(1));
document.querySelector('#saveButton').addEventListener('click', saveCalendarImage);
closeModal.addEventListener('click', closeBookModal);
clearDateButton.addEventListener('click', clearSelectedDate);
copyCalendarLinkButton.addEventListener('click', copyCalendarLink);
newCalendarButton.addEventListener('click', createNewCalendar);
bookModal.addEventListener('click', (event) => {
  if (event.target === bookModal) {
    closeBookModal();
  }
});
calendarTitle.value = localStorage.getItem(LOCAL_TITLE_KEY) || calendarTitle.value;
calendarTitle.addEventListener('input', () => {
  state.titleUpdatedAt = Date.now();
  localStorage.setItem(LOCAL_TITLE_KEY, calendarTitle.value.trim() || DEFAULT_TITLE);
  localStorage.setItem(LOCAL_TITLE_UPDATED_KEY, String(state.titleUpdatedAt));
  scheduleRemoteSave();
});
render();
loadRemoteState();

function getCalendarIdentity() {
  const url = new URL(window.location.href);
  const requestedId = url.searchParams.get('calendar');

  if (isValidCalendarId(requestedId)) {
    return { id: requestedId, shouldMigrateLegacy: false };
  }

  const storedId = localStorage.getItem(DEFAULT_CALENDAR_ID_KEY);
  const id = isValidCalendarId(storedId) ? storedId : createCalendarId();

  localStorage.setItem(DEFAULT_CALENDAR_ID_KEY, id);
  url.searchParams.set('calendar', id);
  window.history.replaceState({}, '', url);

  return { id, shouldMigrateLegacy: true };
}

function isValidCalendarId(value) {
  return /^[A-Za-z0-9_-]{20,80}$/.test(String(value || ''));
}

function createCalendarId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID().replaceAll('-', '');
  }

  const random = Math.random().toString(36).slice(2);
  return `${Date.now().toString(36)}${random}${random}`.slice(0, 32);
}

function migrateLegacyStorage() {
  const migrations = [
    [LEGACY_TITLE_KEY, LOCAL_TITLE_KEY],
    [LEGACY_ENTRIES_KEY, LOCAL_ENTRIES_KEY],
    [LEGACY_DELETED_DATES_KEY, LOCAL_DELETED_DATES_KEY],
    [LEGACY_TITLE_UPDATED_KEY, LOCAL_TITLE_UPDATED_KEY]
  ];

  migrations.forEach(([legacyKey, nextKey]) => {
    if (localStorage.getItem(nextKey) === null && localStorage.getItem(legacyKey) !== null) {
      localStorage.setItem(nextKey, localStorage.getItem(legacyKey));
    }
  });
}

async function copyCalendarLink() {
  const originalText = copyCalendarLinkButton.textContent;

  try {
    await navigator.clipboard.writeText(window.location.href);
    copyCalendarLinkButton.textContent = '주소 복사 완료';
  } catch {
    window.prompt('아래 달력 주소를 복사해 주세요.', window.location.href);
  }

  window.setTimeout(() => {
    copyCalendarLinkButton.textContent = originalText;
  }, 1800);
}

function createNewCalendar() {
  const url = new URL(window.location.href);
  url.searchParams.set('calendar', createCalendarId());
  window.location.href = url.toString();
}

function changeMonth(offset) {
  state.cursor = new Date(state.cursor.getFullYear(), state.cursor.getMonth() + offset, 1);
  state.selectedDate = toDateKey(new Date(state.cursor.getFullYear(), state.cursor.getMonth(), 1));
  render();
}

function render() {
  clearWeekendEntries();
  const year = state.cursor.getFullYear();
  const month = state.cursor.getMonth();
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 41);
  ensureHolidays(year);
  ensureHolidays(start.getFullYear());
  ensureHolidays(end.getFullYear());
  monthLabel.textContent = `${year}년 ${month + 1}월`;
  updateBookCount(year, month);
  grid.innerHTML = '';

  for (let index = 0; index < 42; index += 1) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
    const dateKey = toDateKey(date);
    const entry = state.entries[dateKey];
    const draftTitle = state.drafts[dateKey] ?? entry?.title ?? '';
    const holiday = state.holidaysByYear[date.getFullYear()]?.[dateKey];
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const isNoBookInputDay = isWeekend || Boolean(holiday);
    const cell = document.createElement('div');
    cell.tabIndex = 0;
    cell.role = 'button';
    cell.className = 'day';
    cell.dataset.date = dateKey;

    if (date.getMonth() !== month) {
      cell.classList.add('outside-month');
      cell.removeAttribute('tabindex');
      cell.removeAttribute('role');
      grid.append(cell);
      continue;
    }

    if (date.getDay() === 0) {
      cell.classList.add('sunday');
    }

    if (date.getDay() === 6) {
      cell.classList.add('saturday');
    }

    if (isWeekend) {
      cell.classList.add('no-entry-day');
      cell.removeAttribute('tabindex');
      cell.removeAttribute('role');
    }

    if (holiday) {
      cell.classList.add('holiday');
      cell.title = holiday.localName || holiday.name || '공휴일';
    }

    if (dateKey === state.selectedDate) {
      cell.classList.add('is-selected');
    }

    if (entry?.kind === 'book') {
      cell.classList.add('has-book');
    }

    cell.innerHTML = `
      <span class="date">${date.getDate()}</span>
      ${holiday ? `<span class="holiday-name">${escapeHtml(holiday.localName || holiday.name)}</span>` : ''}
      ${entry ? `
        <span class="book-in-day">
          ${entry.thumbnail ? `<img class="cover" src="${escapeHtml(proxiedImageUrl(entry.thumbnail))}" alt="${escapeHtml(entry.title)}">` : '<span class="cover empty-cover">표지 없음</span>'}
        </span>
      ` : ''}
      ${entry?.kind === 'substitute' || isNoBookInputDay ? '' : `
        <span class="day-title-row">
          <input class="day-title-input" type="text" inputmode="text" autocomplete="off" value="${escapeHtml(draftTitle)}" placeholder="그림책 제목" aria-label="${dateKey} 그림책 제목">
        </span>
      `}
    `;

    if (!isNoBookInputDay && entry?.kind !== 'substitute') {
      cell.classList.add('has-title-input');
      cell.removeAttribute('role');
    }

    cell.addEventListener('click', (event) => {
      if (isWeekend) {
        return;
      }

      if (event.target.closest('.day-title-row')) {
        return;
      }
      const input = cell.querySelector('.day-title-input');
      const query = input?.value.trim() || '';

      if (query) {
        openBookModal(dateKey, query);
      } else {
        openSubstituteModal(dateKey);
      }
    });
    cell.addEventListener('keydown', (event) => {
      if (isWeekend) {
        return;
      }

      if (event.target.closest('.day-title-row')) {
        return;
      }

      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        const input = cell.querySelector('.day-title-input');
        const query = input?.value.trim() || '';

        if (query) {
          openBookModal(dateKey, query);
        } else {
          openSubstituteModal(dateKey);
        }
      }
    });
    grid.append(cell);
  }

  grid.querySelectorAll('.day-title-input').forEach((input) => {
    input.addEventListener('click', (event) => event.stopPropagation());
    input.addEventListener('focus', () => {
      state.isEditingTitle = true;
      state.selectedDate = input.closest('.day').dataset.date;
    });
    input.addEventListener('blur', () => {
      state.isEditingTitle = false;
      const dateKey = input.closest('.day').dataset.date;
      const entry = state.entries[dateKey];

      if (!input.value.trim() && entry?.kind !== 'substitute') {
        delete state.entries[dateKey];
        delete state.drafts[dateKey];
        state.deletedDates[dateKey] = Date.now();
        saveEntries();
        render();
      }
    });
    input.addEventListener('compositionstart', () => {
      state.isComposingTitle = true;
    });
    input.addEventListener('compositionend', () => {
      state.isComposingTitle = false;
      const dateKey = input.closest('.day').dataset.date;
      const draftTitle = input.value;

      if (draftTitle.trim()) {
        state.drafts[dateKey] = draftTitle;
      }
    });
    input.addEventListener('input', () => {
      const dateKey = input.closest('.day').dataset.date;
      const draftTitle = input.value;

      if (draftTitle.trim()) {
        state.drafts[dateKey] = draftTitle;
        return;
      }

      delete state.drafts[dateKey];
    });
    input.addEventListener('keydown', (event) => {
      event.stopPropagation();

      if (event.isComposing || event.keyCode === 229) {
        return;
      }

      if (event.key !== 'Enter') {
        return;
      }

      event.preventDefault();
      const dateKey = input.closest('.day').dataset.date;
      const query = input.value.trim();

      if (query) {
        openBookModal(dateKey, query);
      } else {
        openSubstituteModal(dateKey);
      }
    });
  });

  renderCoverResults();
}

function focusTitleInput(input) {
  input.focus({ preventScroll: true });

  if (typeof input.setSelectionRange === 'function') {
    const length = input.value.length;
    input.setSelectionRange(length, length);
  }
}

function clearWeekendEntries() {
  let changed = false;

  Object.keys(state.entries).forEach((dateKey) => {
    const date = new Date(dateKey);

    if (date.getDay() === 0 || date.getDay() === 6) {
      delete state.entries[dateKey];
      state.deletedDates[dateKey] = Date.now();
      changed = true;
    }
  });

  if (changed) {
    saveEntries();
  }
}

function updateBookCount(year, month) {
  const count = Object.keys(state.entries).filter((date) => {
    const entryDate = new Date(date);
    return entryDate.getFullYear() === year
      && entryDate.getMonth() === month
      && state.entries[date]?.kind !== 'substitute';
  }).length;

  bookCount.innerHTML = `이번달 우리가 함께 읽은 그림책 <strong>${count}권</strong>`;
}

async function ensureHolidays(year) {
  if (state.holidaysByYear[year] || state.holidayLoadingYears.has(year)) {
    return;
  }

  state.holidayLoadingYears.add(year);

  try {
    const response = await fetch(`/api/holidays?year=${year}`);
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || '공휴일 정보를 불러오지 못했습니다.');
    }

    state.holidaysByYear[year] = Object.fromEntries(
      (payload.holidays || []).map((holiday) => [holiday.date, holiday])
    );
  } catch (error) {
    console.warn(error);
    state.holidaysByYear[year] = {};
  } finally {
    state.holidayLoadingYears.delete(year);

    if (state.isEditingTitle || state.isComposingTitle || Object.keys(state.drafts).length) {
      return;
    }

    render();
  }
}

function openBookModal(dateKey, query = '') {
  state.selectedDate = dateKey;
  state.modalQuery = query.trim();
  state.searchResults = [];
  const selectedBook = state.entries[dateKey];
  const searchQuery = query || selectedBook?.title || '';
  modalTitle.textContent = searchQuery ? `"${searchQuery}" 표지를 골라주세요` : '제목을 입력해 주세요';
  bookModal.hidden = false;
  render();
  renderCoverResults();
  updateClearDateButton();
  setStatus('');

  if (searchQuery) {
    searchBookCovers(searchQuery);
  }
}

function openSubstituteModal(dateKey) {
  state.selectedDate = dateKey;
  state.modalQuery = '';
  state.searchResults = [];
  modalTitle.textContent = `${dateKey}에 넣을 이미지를 골라주세요`;
  bookModal.hidden = false;
  render();
  renderCoverResults();
  updateClearDateButton();
  setStatus('그림책을 읽지 않은 날에는 아래 이미지를 넣을 수 있어요.');
}

function closeBookModal() {
  bookModal.hidden = true;
  state.modalQuery = '';
  state.searchResults = [];
  renderCoverResults();
  updateClearDateButton();
}

async function searchBookCovers(query) {
  if (!query) {
    setStatus('그림책 제목을 입력해 주세요.');
    return;
  }

  setStatus(`${state.selectedDate}에 넣을 표지를 검색하는 중...`);
  coverResults.innerHTML = '';

  try {
    const response = await fetch(`/api/search-books?query=${encodeURIComponent(query)}&display=8`);
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(toUserSearchError(payload.error));
    }

    state.searchResults = payload.books || [];
    renderCoverResults();
    setStatus(state.searchResults.length ? '' : '검색 결과가 없습니다.');
  } catch (error) {
    state.searchResults = [];
    renderCoverResults();
    setStatus(error.message);
  }
}

function toUserSearchError(message) {
  if (String(message || '').includes('NAVER_CLIENT')) {
    return '네이버 API 키가 아직 설정되지 않았습니다. .env에 NAVER_CLIENT_ID와 NAVER_CLIENT_SECRET을 넣고 서버를 다시 켜야 검색됩니다.';
  }

  return message || '표지 검색에 실패했습니다.';
}

function selectCover(index) {
  const book = state.searchResults[index];

  if (!book) {
    return;
  }

  state.entries[state.selectedDate] = book;
  state.entries[state.selectedDate].updatedAt = Date.now();
  state.entries[state.selectedDate].thumbnail = proxiedImageUrl(book.thumbnail);
  delete state.deletedDates[state.selectedDate];
  delete state.drafts[state.selectedDate];
  saveEntries();
  render();
  setStatus(`${state.selectedDate}에 표지를 넣었습니다.`);
  closeBookModal();
}

function selectSubstitute(index) {
  const substitute = substituteImages[index];

  if (!substitute) {
    return;
  }

  state.entries[state.selectedDate] = {
    kind: 'substitute',
    title: substitute.title,
    thumbnail: substitute.thumbnail,
    updatedAt: Date.now()
  };
  delete state.deletedDates[state.selectedDate];
  delete state.drafts[state.selectedDate];
  saveEntries();
  render();
  setStatus(`${state.selectedDate}에 ${substitute.title} 이미지를 넣었습니다.`);
  closeBookModal();
}

function clearSelectedDate() {
  if (!state.selectedDate) {
    return;
  }

  delete state.entries[state.selectedDate];
  delete state.drafts[state.selectedDate];
  state.deletedDates[state.selectedDate] = Date.now();
  saveEntries();
  closeBookModal();
  render();
}

function updateClearDateButton() {
  clearDateButton.hidden = !state.entries[state.selectedDate];
}

function renderCoverResults() {
  if (!state.modalQuery) {
    coverResults.innerHTML = `
      <div class="cover-grid substitute-grid">
        ${substituteImages.map((item, index) => `
          <button class="cover-choice substitute-choice" type="button" data-substitute-index="${index}" title="${escapeHtml(item.title)}">
            <img src="${escapeHtml(item.thumbnail)}" alt="">
          </button>
        `).join('')}
      </div>
    `;

    coverResults.querySelectorAll('[data-substitute-index]').forEach((button) => {
      button.addEventListener('click', () => selectSubstitute(Number(button.dataset.substituteIndex)));
    });
    return;
  }

  const resultBlock = state.searchResults.length ? `
    <div class="cover-grid">
      ${state.searchResults.map((book, index) => `
        <button class="cover-choice" type="button" data-cover-index="${index}" title="${escapeHtml(book.title)}">
          ${book.thumbnail ? `<img src="${escapeHtml(proxiedImageUrl(book.thumbnail))}" alt="">` : '<span class="empty-cover">표지 없음</span>'}
          <span>${escapeHtml(book.title)}</span>
        </button>
      `).join('')}
    </div>
  ` : '';

  coverResults.innerHTML = resultBlock;

  coverResults.querySelectorAll('[data-cover-index]').forEach((button) => {
    button.addEventListener('click', () => selectCover(Number(button.dataset.coverIndex)));
  });
}

async function saveCalendarImage() {
  const calendar = document.querySelector('#calendar');
  const titlePreview = createTitlePreview();
  calendar.classList.add('capture-mode');
  calendarTitle.hidden = true;
  calendarTitle.insertAdjacentElement('afterend', titlePreview);

  try {
    await nextFrame();
    await inlineCalendarImages(calendar);
    await waitForImages(calendar);

    const canvas = await html2canvas(calendar, {
      backgroundColor: null,
      scale: 3,
      useCORS: true,
      imageTimeout: 15000,
      windowWidth: calendar.scrollWidth,
      windowHeight: calendar.scrollHeight,
      width: calendar.scrollWidth,
      height: calendar.scrollHeight
    });

    const fileName = `${monthLabel.textContent.replaceAll(' ', '-')}-${calendarTitle.value || '그림책 달력'}.png`;
    const blob = await canvasToBlob(canvas);
    const file = new File([blob], fileName, { type: 'image/png' });

    if (isMobileDevice() && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: calendarTitle.value || '그림책 달력'
        });
        return;
      } catch (error) {
        if (error.name === 'AbortError') {
          return;
        }
      }
    }

    if (!isMobileDevice() && window.showSaveFilePicker) {
      try {
        await saveWithFilePicker(blob, fileName);
        return;
      } catch (error) {
        if (error.name === 'AbortError') {
          return;
        }
      }
    }

    const link = document.createElement('a');
    link.download = fileName;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
  } finally {
    titlePreview.remove();
    calendarTitle.hidden = false;
    calendar.classList.remove('capture-mode');
  }
}

function createTitlePreview() {
  const preview = document.createElement('div');
  preview.className = 'brand-title-preview';
  preview.textContent = calendarTitle.value.trim() || '그림책 달력';
  return preview;
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }

      reject(new Error('이미지를 만들지 못했습니다.'));
    }, 'image/png');
  });
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function saveWithFilePicker(blob, suggestedName) {
  const handle = await window.showSaveFilePicker({
    suggestedName,
    types: [
      {
        description: 'PNG 이미지',
        accept: {
          'image/png': ['.png']
        }
      }
    ]
  });
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
}

function isMobileDevice() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 1 && /Macintosh/i.test(navigator.userAgent));
}

async function inlineCalendarImages(root) {
  const images = Array.from(root.querySelectorAll('img'));

  await Promise.all(images.map(async (image) => {
    if (image.src.startsWith('data:')) {
      return;
    }

    try {
      const dataUrl = await imageSrcToDataUrl(image.src);
      image.src = dataUrl;
    } catch {
      // If conversion fails, keep the original image so the screen is not disturbed.
    }
  }));
}

async function imageSrcToDataUrl(src) {
  const response = await fetch(src);

  if (!response.ok) {
    throw new Error('이미지를 불러오지 못했습니다.');
  }

  const blob = await response.blob();

  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(reader.result));
    reader.addEventListener('error', reject);
    reader.readAsDataURL(blob);
  });
}

function proxiedImageUrl(url) {
  if (!url || url.startsWith('data:') || url.startsWith('/api/image-proxy')) {
    return url || '';
  }

  return `/api/image-proxy?url=${encodeURIComponent(url)}`;
}

async function waitForImages(root) {
  const images = Array.from(root.querySelectorAll('img'));

  await Promise.all(images.map((image) => {
    if (image.complete && image.naturalWidth > 0) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      image.addEventListener('load', resolve, { once: true });
      image.addEventListener('error', resolve, { once: true });
    });
  }));
}

function loadEntries() {
  try {
    return normalizeEntries(JSON.parse(localStorage.getItem(LOCAL_ENTRIES_KEY) || '{}'));
  } catch {
    return {};
  }
}

function loadDeletedDates() {
  try {
    return normalizeDeletedDates(JSON.parse(localStorage.getItem(LOCAL_DELETED_DATES_KEY) || '{}'));
  } catch {
    return {};
  }
}

function loadTitleUpdatedAt() {
  const value = Number(localStorage.getItem(LOCAL_TITLE_UPDATED_KEY) || 0);
  return Number.isFinite(value) ? value : 0;
}

function saveEntries() {
  localStorage.setItem(LOCAL_ENTRIES_KEY, JSON.stringify(state.entries));
  localStorage.setItem(LOCAL_DELETED_DATES_KEY, JSON.stringify(state.deletedDates));
  scheduleRemoteSave();
}

async function loadRemoteState() {
  state.syncReady = true;
  await syncFromRemote({ saveAfterMerge: hasLocalState() });
  startSyncPolling();
}

async function syncFromRemote({ saveAfterMerge = false } = {}) {
  try {
    const response = await fetch(SYNC_API_URL, {
      cache: 'no-store'
    });
    const remoteState = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(remoteState.error || '달력 데이터를 불러오지 못했습니다.');
    }

    const changed = mergeRemoteState(remoteState);
    persistLocalState();

    if (changed) {
      render();
    }

    if (saveAfterMerge || changed) {
      scheduleRemoteSave();
    }
  } catch (error) {
    console.warn(error);
  }
}

function mergeRemoteState(remoteState) {
  const previousSnapshot = JSON.stringify({
    title: calendarTitle.value.trim() || DEFAULT_TITLE,
    titleUpdatedAt: state.titleUpdatedAt,
    entries: state.entries,
    deletedDates: state.deletedDates
  });
  const remoteEntries = normalizeEntries(remoteState.entries);
  const remoteDeletedDates = normalizeDeletedDates(remoteState.deletedDates);
  const remoteTitle = String(remoteState.title || '').trim() || DEFAULT_TITLE;
  const remoteTitleUpdatedAt = normalizeTimestamp(remoteState.titleUpdatedAt);
  const localTitle = calendarTitle.value.trim() || DEFAULT_TITLE;

  if (
    remoteTitleUpdatedAt > state.titleUpdatedAt
    || (!state.titleUpdatedAt && remoteTitle !== DEFAULT_TITLE && localTitle === DEFAULT_TITLE)
  ) {
    calendarTitle.value = remoteTitle;
    state.titleUpdatedAt = remoteTitleUpdatedAt || Date.now();
  }

  const mergedDates = new Set([
    ...Object.keys(state.entries),
    ...Object.keys(remoteEntries),
    ...Object.keys(state.deletedDates),
    ...Object.keys(remoteDeletedDates)
  ]);

  const nextEntries = {};
  const nextDeletedDates = {};

  mergedDates.forEach((dateKey) => {
    const localEntry = state.entries[dateKey];
    const remoteEntry = remoteEntries[dateKey];
    const localEntryTime = getEntryTime(localEntry);
    const remoteEntryTime = getEntryTime(remoteEntry);
    const localDeletedTime = normalizeTimestamp(state.deletedDates[dateKey]);
    const remoteDeletedTime = normalizeTimestamp(remoteDeletedDates[dateKey]);
    const latestTime = Math.max(localEntryTime, remoteEntryTime, localDeletedTime, remoteDeletedTime);

    if (latestTime === 0) {
      if (localEntry || remoteEntry) {
        nextEntries[dateKey] = localEntry || remoteEntry;
      }
      return;
    }

    if (latestTime === localDeletedTime || latestTime === remoteDeletedTime) {
      nextDeletedDates[dateKey] = latestTime;
      return;
    }

    const entry = remoteEntryTime > localEntryTime ? remoteEntry : localEntry;

    if (entry) {
      nextEntries[dateKey] = {
        ...entry,
        updatedAt: getEntryTime(entry) || latestTime
      };
    }
  });

  state.entries = nextEntries;
  state.deletedDates = nextDeletedDates;
  persistLocalState();

  return previousSnapshot !== JSON.stringify({
    title: calendarTitle.value.trim() || DEFAULT_TITLE,
    titleUpdatedAt: state.titleUpdatedAt,
    entries: state.entries,
    deletedDates: state.deletedDates
  });
}

function persistLocalState() {
  localStorage.setItem(LOCAL_TITLE_KEY, calendarTitle.value.trim() || DEFAULT_TITLE);
  localStorage.setItem(LOCAL_TITLE_UPDATED_KEY, String(state.titleUpdatedAt || 0));
  localStorage.setItem(LOCAL_ENTRIES_KEY, JSON.stringify(state.entries));
  localStorage.setItem(LOCAL_DELETED_DATES_KEY, JSON.stringify(state.deletedDates));
}

function hasLocalState() {
  const title = calendarTitle.value.trim();

  return Object.keys(state.entries).length > 0
    || Object.keys(state.deletedDates).length > 0
    || (title && title !== DEFAULT_TITLE);
}

function startSyncPolling() {
  if (state.syncInterval) {
    return;
  }

  state.syncInterval = setInterval(() => {
    if (document.hidden || state.isEditingTitle || state.isComposingTitle || !state.syncReady) {
      return;
    }

    syncFromRemote();
  }, SYNC_INTERVAL_MS);
}

function scheduleRemoteSave() {
  if (!state.syncReady) {
    return;
  }

  clearTimeout(state.syncTimer);
  state.syncTimer = setTimeout(saveRemoteState, 500);
}

async function saveRemoteState() {
  try {
    const response = await fetch(SYNC_API_URL, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        title: calendarTitle.value.trim() || DEFAULT_TITLE,
        titleUpdatedAt: state.titleUpdatedAt || Date.now(),
        entries: state.entries,
        deletedDates: state.deletedDates
      })
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || '달력 데이터를 저장하지 못했습니다.');
    }
  } catch (error) {
    console.warn(error);
  }
}

function normalizeEntries(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([dateKey, entry]) => /^\d{4}-\d{2}-\d{2}$/.test(dateKey) && entry && typeof entry === 'object')
      .map(([dateKey, entry]) => [
        dateKey,
        {
          ...entry,
          updatedAt: getEntryTime(entry)
        }
      ])
  );
}

function normalizeDeletedDates(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([dateKey]) => /^\d{4}-\d{2}-\d{2}$/.test(dateKey))
      .map(([dateKey, timestamp]) => [dateKey, normalizeTimestamp(timestamp)])
      .filter(([, timestamp]) => timestamp > 0)
  );
}

function getEntryTime(entry) {
  return normalizeTimestamp(entry?.updatedAt);
}

function normalizeTimestamp(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function setStatus(message) {
  statusEl.textContent = message;
}

function toDateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function makeSubstituteImage({ title, accent, bg, icon }) {
  const iconMarkup = {
    sun: `<circle cx="54" cy="38" r="15" fill="${accent}"/><g stroke="${accent}" stroke-width="5" stroke-linecap="round"><path d="M54 12v8M54 56v8M28 38h8M72 38h8M36 20l6 6M66 50l6 6M72 20l-6 6M42 50l-6 6"/></g>`,
    heart: `<path d="M54 67C35 54 25 45 25 33c0-9 7-15 15-15 6 0 11 3 14 8 3-5 8-8 14-8 8 0 15 6 15 15 0 12-10 21-29 34Z" fill="${accent}"/>`,
    star: `<path d="M54 15l10 22 24 3-18 16 5 24-21-12-21 12 5-24-18-16 24-3 10-22Z" fill="${accent}"/>`,
    moon: `<path d="M68 73c-22 0-39-17-39-38 0-10 4-19 10-26-1 4-2 8-2 12 0 22 18 40 40 40 3 0 6 0 9-1-5 8-11 13-18 13Z" fill="${accent}"/>`,
    tree: `<path d="M54 16c9 0 16 7 16 16 8 2 14 9 14 18 0 10-8 18-18 18H42c-10 0-18-8-18-18 0-9 6-16 14-18 0-9 7-16 16-16Z" fill="${accent}"/><path d="M54 48v32" stroke="#8a6f4d" stroke-width="6" stroke-linecap="round"/>`,
    gift: `<path d="M24 35h60v45H24z" fill="${accent}"/><path d="M54 35v45M24 50h60" stroke="#fff" stroke-width="6"/><path d="M54 35c-12 0-20-5-20-12 0-5 4-9 9-9 7 0 11 8 11 21Zm0 0c12 0 20-5 20-12 0-5-4-9-9-9-7 0-11 8-11 21Z" fill="none" stroke="${accent}" stroke-width="6"/>`
  }[icon];

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="180" height="240" viewBox="0 0 108 144">
      <rect width="108" height="144" rx="18" fill="${bg}"/>
      <rect x="9" y="9" width="90" height="126" rx="14" fill="#fff" opacity=".72"/>
      ${iconMarkup}
      <text x="54" y="117" text-anchor="middle" font-family="sans-serif" font-size="16" font-weight="800" fill="#594a55">${title}</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}
