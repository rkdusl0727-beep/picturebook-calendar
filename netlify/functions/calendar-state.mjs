const STORE_NAME = 'picturebook-calendar';
const STATE_KEY = 'shared-calendar';
const DEFAULT_TITLE = '그림책 달력';
const MAX_BODY_LENGTH = 800_000;

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return json(204, {});
  }

  if (event.httpMethod === 'GET') {
    const state = await readCalendarState();
    return json(200, state);
  }

  if (event.httpMethod === 'PUT' || event.httpMethod === 'POST') {
    if (String(event.body || '').length > MAX_BODY_LENGTH) {
      return json(413, { error: '저장할 데이터가 너무 큽니다.' });
    }

    const payload = parseBody(event.body);
    const nextState = normalizeState(payload);

    await writeCalendarState(nextState);

    return json(200, nextState);
  }

  return json(405, { error: 'Method not allowed' });
}

async function readCalendarState() {
  const store = await getCalendarStore();
  const saved = await store.get(STATE_KEY, { type: 'json' });

  return normalizeState(saved);
}

async function writeCalendarState(state) {
  const store = await getCalendarStore();
  await store.setJSON(STATE_KEY, {
    ...state,
    updatedAt: new Date().toISOString()
  });
}

async function getCalendarStore() {
  const { getStore } = await import('@netlify/blobs');
  return getStore(STORE_NAME);
}

function parseBody(body) {
  try {
    return JSON.parse(body || '{}');
  } catch {
    return {};
  }
}

function normalizeState(value) {
  const source = value && typeof value === 'object' ? value : {};

  return {
    version: 1,
    title: normalizeTitle(source.title),
    entries: normalizeEntries(source.entries),
    updatedAt: source.updatedAt || null
  };
}

function normalizeTitle(value) {
  const title = String(value || '').trim();
  return title || DEFAULT_TITLE;
}

function normalizeEntries(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([dateKey, entry]) => /^\d{4}-\d{2}-\d{2}$/.test(dateKey) && entry && typeof entry === 'object')
      .map(([dateKey, entry]) => [dateKey, normalizeEntry(entry)])
      .filter(([, entry]) => entry)
  );
}

function normalizeEntry(entry) {
  const title = String(entry.title || '').trim();
  const thumbnail = String(entry.thumbnail || '').trim();
  const kind = String(entry.kind || '').trim();

  if (!title && !thumbnail) {
    return null;
  }

  const safeEntry = {
    title,
    thumbnail,
    kind,
    authors: Array.isArray(entry.authors) ? entry.authors.map(String).slice(0, 5) : [],
    publisher: String(entry.publisher || ''),
    isbn: String(entry.isbn || ''),
    url: String(entry.url || ''),
    contents: String(entry.contents || ''),
    publishedAt: String(entry.publishedAt || ''),
    discount: String(entry.discount || ''),
    originalThumbnail: String(entry.originalThumbnail || '')
  };

  Object.keys(safeEntry).forEach((key) => {
    if (safeEntry[key] === '' || (Array.isArray(safeEntry[key]) && safeEntry[key].length === 0)) {
      delete safeEntry[key];
    }
  });

  return safeEntry;
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    },
    body: statusCode === 204 ? '' : JSON.stringify(body)
  };
}
