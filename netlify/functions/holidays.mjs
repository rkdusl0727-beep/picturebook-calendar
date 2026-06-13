const HOLIDAY_API_BASE_URL = 'https://date.nager.at/api/v3/PublicHolidays';

export async function handler(event) {
  if (event.httpMethod && event.httpMethod !== 'GET') {
    return json(405, { error: 'Method not allowed' });
  }

  const year = Number(event.queryStringParameters?.year);

  if (!Number.isInteger(year) || year < 1900 || year > 2100) {
    return json(400, { error: '연도를 확인해 주세요.' });
  }

  try {
    const response = await fetch(`${HOLIDAY_API_BASE_URL}/${year}/KR`);
    const payload = await response.json().catch(() => []);

    if (!response.ok || !Array.isArray(payload)) {
      return json(502, { error: '공휴일 정보를 불러오지 못했습니다.' });
    }

    return json(200, {
      year,
      holidays: payload.map((holiday) => ({
        date: holiday.date,
        localName: holiday.localName || holiday.name || '',
        name: holiday.name || holiday.localName || ''
      }))
    });
  } catch {
    return json(502, { error: '공휴일 정보를 불러오지 못했습니다.' });
  }
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=86400'
    },
    body: JSON.stringify(body)
  };
}
