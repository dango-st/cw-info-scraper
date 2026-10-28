// Re-run the Japanese → English translation over every user already in MongoDB.
// Use after the first upgrade, and again after adding entries to src/dictionary.js:
//   npm run translate-db
import { config } from './config.js';
import { connectDb } from './db.js';
import { reportUntranslated, toEnglish } from './translate.js';

const BATCH = 500;
const { client, users, untranslatedTerms } = await connectDb(config);
try {
  let ops = [];
  let updated = 0;
  for await (const doc of users.find()) {
    const { _id, ...fields } = toEnglish(doc);
    ops.push({ updateOne: { filter: { _id }, update: { $set: fields } } });
    if (ops.length >= BATCH) {
      updated += (await users.bulkWrite(ops, { ordered: false })).modifiedCount;
      ops = [];
    }
  }
  if (ops.length) updated += (await users.bulkWrite(ops, { ordered: false })).modifiedCount;
  console.log(`Translated ${updated} of ${await users.countDocuments()} users in ${config.mongoDb}.users`);
  await reportUntranslated(untranslatedTerms);
} finally {
  await client.close();
}
