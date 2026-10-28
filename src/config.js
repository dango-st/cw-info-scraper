import 'dotenv/config';

const int = (value, fallback) => {
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? fallback : n;
};

export const config = {
  startPage: int(process.env.START_PAGE, 1),
  maxPages: int(process.env.MAX_PAGES, 0),
  delayMs: int(process.env.DELAY_MS, 2000),
  detailDelayMs: int(process.env.DETAIL_DELAY_MS, 1500),
  maxRetries: int(process.env.MAX_RETRIES, 3),
  timeoutMs: int(process.env.TIMEOUT_MS, 30000),
  mongoUri: process.env.MONGODB_URI || '',
  mongoDb: process.env.MONGODB_DB || 'crowdworks',
  port: int(process.env.PORT, 3000),
};
