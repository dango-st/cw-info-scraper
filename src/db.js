import { MongoClient } from 'mongodb';

/** "mongodb://user:pass@a.x.net:27017,b.x.net/..." -> "a.x.net (+1)" — credentials never included. */
export function describeMongoHost(uri) {
  const hosts = uri.replace(/^mongodb(\+srv)?:\/\/([^@/]*@)?/, '').split(/[/?]/)[0].split(',');
  const first = hosts[0].replace(/:\d+$/, '');
  return hosts.length > 1 ? `${first} (+${hosts.length - 1})` : first;
}

/**
 * Connect and return { client, users, untranslatedTerms }.
 * `users` holds scraped users; `untranslatedTerms` holds Japanese terms
 * that src/dictionary.js doesn't cover yet.
 */
export async function connectDb({ mongoUri, mongoDb }) {
  if (!mongoUri) throw new Error('MONGODB_URI is not set — add your MongoDB connection string to .env');
  const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  const db = client.db(mongoDb);
  const users = db.collection('users');
  const untranslatedTerms = db.collection('untranslated_terms');
  await Promise.all([
    users.createIndex({ scrapedAt: -1 }),
    users.createIndex({ ratingAverage: -1 }),
    users.createIndex({ contractCount: -1 }),
    users.createIndex({ prefecture: 1 }),
    users.createIndex({ 'emails.0': 1 }),
  ]);
  return { client, users, untranslatedTerms };
}

/**
 * Insert or update users keyed by their CrowdWorks id (stored as `_id`).
 * `firstScrapedAt` is set once; `scrapedAt` is refreshed on every run.
 */
export async function upsertUsers(users, records, extra = {}) {
  if (!records.length) return;
  const now = new Date();
  await users.bulkWrite(
    records.map((r) => ({
      updateOne: {
        filter: { _id: r.id },
        update: { $set: { ...r, ...extra, scrapedAt: now }, $setOnInsert: { firstScrapedAt: now } },
        upsert: true,
      },
    })),
    { ordered: false },
  );
}

/** Add `counts` (Map term -> occurrences) to the untranslated_terms collection. */
export async function saveUntranslatedTerms(untranslatedTerms, counts) {
  if (!counts.size) return;
  const now = new Date();
  await untranslatedTerms.bulkWrite(
    [...counts].map(([term, n]) => ({
      updateOne: {
        filter: { _id: term },
        update: { $inc: { count: n }, $set: { lastSeenAt: now } },
        upsert: true,
      },
    })),
    { ordered: false },
  );
}
