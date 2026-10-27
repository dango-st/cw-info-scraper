import axios from 'axios';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const DEFAULT_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
};

export function createClient({ timeoutMs }) {
  return axios.create({
    timeout: timeoutMs,
    headers: DEFAULT_HEADERS,
    validateStatus: (status) => status < 500,
  });
}

/** GET a page's HTML, retrying with exponential backoff on network errors, 429 and 5xx. */
export async function fetchHtml(client, url, { maxRetries }) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await client.get(url, { responseType: 'text' });
      if (res.status === 429) throw new Error('429 Too Many Requests');
      if (res.status === 404) return null;
      if (res.status >= 400) throw new Error(`HTTP ${res.status}`);
      return res.data;
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const wait = 2000 * 2 ** attempt;
        console.warn(`  ! ${err.message} — retry ${attempt + 1}/${maxRetries} in ${wait}ms`);
        await sleep(wait);
      }
    }
  }
  throw lastError;
}
