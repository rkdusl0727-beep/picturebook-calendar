const state = {
  cursor: new Date(),
  selectedDate: toDateKey(new Date()),
  modalQuery: '',
  searchResults: [],
  holidaysByYear: {},
  holidayLoadingYears: new Set(),
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

document.querySelector('#prevMonth').addEventListener('click', () => changeMonth(-1));
document.querySelector('#nextMonth').addEventListener('click', () => changeMonth(1));
document.querySelector('#saveButton').addEventListener('click', saveCalendarImage);
closeModal.addEventListener('click', closeBookModal);
clearDateButton.addEventListener('click', clearSelectedDate);
bookModal.addEventListener('click', (event) => {
  if (event.target === bookModal) {
    closeBookModal();
  }
});
calendarTitle.value = localStorage.getItem('picture-book-calendar-title') || calendarTitle.value;
calendarTitle.addEventListener('input', () => {
  localStorage.setItem('picture-book-calendar-title', calendarTitle.value.trim() || '그림책 달력');
});
render();

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

    cell.innerHTML = `
      <span class="date">${date.getDate()}</span>
      ${holiday ? `<span class="holiday-name">${escapeHtml(holiday.localName || holiday.name)}</span>` : ''}
      ${entry ? `
        <span class="book-in-day">
          ${entry.thumbnail ? `<img class="cover" src="${escapeHtml(entry.thumbnail)}" alt="${escapeHtml(entry.title)}">` : '<span class="cover empty-cover">표지 없음</span>'}
        </span>
      ` : ''}
      ${entry?.kind === 'substitute' || isNoBookInputDay ? '' : `
        <span class="day-title-row">
          <input class="day-title-input" type="text" value="${escapeHtml(entry?.title || '')}" placeholder="그림책 제목" aria-label="${dateKey} 그림책 제목">
        </span>
      `}
    `;
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
    input.addEventListener('input', () => {
      const dateKey = input.closest('.day').dataset.date;
      const entry = state.entries[dateKey];

      if (!input.value.trim() && entry?.kind !== 'substitute') {
        delete state.entries[dateKey];
        saveEntries();
        render();
      }
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

function clearWeekendEntries() {
  let changed = false;

  Object.keys(state.entries).forEach((dateKey) => {
    const date = new Date(dateKey);

    if (date.getDay() === 0 || date.getDay() === 6) {
      delete state.entries[dateKey];
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
    thumbnail: substitute.thumbnail
  };
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
          ${book.thumbnail ? `<img src="${escapeHtml(book.thumbnail)}" alt="">` : '<span class="empty-cover">표지 없음</span>'}
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
  const canvas = await html2canvas(calendar, {
    backgroundColor: null,
    scale: 3,
    useCORS: true
  });
  const link = document.createElement('a');
  link.download = `${monthLabel.textContent.replaceAll(' ', '-')}-${calendarTitle.value || '그림책 달력'}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

function loadEntries() {
  try {
    return JSON.parse(localStorage.getItem('picture-book-calendar') || '{}');
  } catch {
    return {};
  }
}

function saveEntries() {
  localStorage.setItem('picture-book-calendar', JSON.stringify(state.entries));
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
