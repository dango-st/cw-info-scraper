import readline from 'node:readline/promises';
import { config } from './config.js';
import { connectDb } from './db.js';
import { scrape } from './scraper.js';
import { createMongoStorage } from './storage.js';
import { reportUntranslated } from './translate.js';

async function getStartUrl() {
  if (process.argv[2]) return process.argv[2];
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('CrowdWorks listing URL: ');
  rl.close();
  return answer.trim();
}

async function main() {
  const startUrl = await getStartUrl();
  let searchKeywords;
  try {
    searchKeywords = new URL(startUrl).searchParams.get('keywords') ?? '';
  } catch {
    console.error(`Invalid URL: ${startUrl}`);
    process.exit(1);
  }

  const { client, users, untranslatedTerms } = await connectDb(config);
  const storage = createMongoStorage(users, { searchKeywords });
  console.log(`Connected to ${storage.describe()}`);

  try {
    const { total, pagesFetched } = await scrape(startUrl, config, storage);
    console.log(`\nDone: ${total} users from ${pagesFetched} page(s) saved to ${storage.describe()}.`);
  } finally {
    // Also runs after a crash, so terms found before it aren't lost.
    await reportUntranslated(untranslatedTerms).catch((err) => console.warn('Could not save untranslated terms:', err.message));
    await client.close();
  }
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
