// Load a JSONL file produced by the scraper into MongoDB:
//   npm run import -- output/users-....jsonl
import fs from 'node:fs';
import { config } from './config.js';
import { connectDb, upsertUsers } from './db.js';

const file = process.argv[2];
if (!file) {
  console.error('Usage: npm run import -- <file.jsonl>');
  process.exit(1);
}

const records = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const { client, users } = await connectDb(config);
try {
  await upsertUsers(users, records);
  console.log(`Imported ${records.length} users into ${config.mongoDb}.users (total now ${await users.countDocuments()})`);
} finally {
  await client.close();
}
