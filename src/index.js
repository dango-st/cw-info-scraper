import path from 'node:path';
import readline from 'node:readline/promises';
import { config } from './config.js';
import { connectDb } from './db.js';
import { scrape } from './scraper.js';
import { combineStorage, createFileStorage, createMongoStorage } from './storage.js';
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

  const { client, users } = await connectDb(config);
  console.log(`Connected to MongoDB (${config.mongoDb}.users)`);

  const storages = [createMongoStorage(users, { searchKeywords })];
  if (config.saveFiles) storages.push(createFileStorage(config.outputDir));
  const storage = combineStorage(...storages);

  try {
    const { total, pagesFetched } = await scrape(startUrl, config, storage);
    console.log(`\nDone: ${total} users from ${pagesFetched} page(s).`);
    storage.describe().forEach((d) => console.log(`  ${d}`));
    await reportUntranslated(path.join(config.outputDir, 'untranslated-terms.txt'));
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
