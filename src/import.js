// Load a JSONL file produced by the scraper into MongoDB (translated to English):
//   npm run import -- output/users-....jsonl
import fs from 'node:fs';
import { config } from './config.js';
import { connectDb, upsertUsers } from './db.js';
import { reportUntranslated, toEnglish } from './translate.js';

const file = process.argv[2];
if (!file) {
  console.error('Usage: npm run import -- <file.jsonl>');
  process.exit(1);
}

const records = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => toEnglish(JSON.parse(l)));
const { client, users, untranslatedTerms } = await connectDb(config);
try {
  await upsertUsers(users, records);
  console.log(`Imported ${records.length} users into ${config.mongoDb}.users (total now ${await users.countDocuments()})`);
  await reportUntranslated(untranslatedTerms);
} finally {
  await client.close();
}
