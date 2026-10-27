import { MongoClient } from 'mongodb';

/** Connect and return { client, users } where `users` is the users collection. */
export async function connectDb({ mongoUri, mongoDb }) {
  const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  const users = client.db(mongoDb).collection('users');
  await Promise.all([
    users.createIndex({ scrapedAt: -1 }),
    users.createIndex({ ratingAverage: -1 }),
    users.createIndex({ contractCount: -1 }),
    users.createIndex({ prefecture: 1 }),
    users.createIndex({ 'emails.0': 1 }),
  ]);
  return { client, users };
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
