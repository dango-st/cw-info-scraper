import fs from 'node:fs';
import path from 'node:path';
import { upsertUsers } from './db.js';

// Flat columns for the CSV. Nested fields (recentFeedbacks, recentContracts,
// ratingItems) are kept in full in the JSONL file and MongoDB.
export const CSV_COLUMNS = [
  'id', 'profileUrl', 'displayName', 'emails', 'headline',
  'accountType', 'gender', 'ageRange', 'prefecture',
  'status', 'statusText', 'minHourlyWage', 'maxHourlyWage', 'hoursPerWeek', 'webMeeting',
  'registeredAt', 'lastAccessAt', 'lastAccessText',
  'occupations', 'jobCategories', 'skills',
  'ratingAverage', 'ratingCount', 'projectFinishedRate', 'contractCount',
  'identityVerified', 'proCrowdworker', 'viewCount', 'watchlistCount',
  'introduction', 'page', 'error',
];

const csvCell = (v) => {
  const s = Array.isArray(v) ? v.join(' | ') : String(v ?? '');
  return `"${s.replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
};

export const CSV_HEADER = '﻿' + CSV_COLUMNS.join(',') + '\n'; // BOM so Excel reads Japanese correctly
export const toCsvRow = (user) => CSV_COLUMNS.map((c) => csvCell(user[c])).join(',');

/** Writes results incrementally so a crash mid-run doesn't lose earlier users. */
export function createFileStorage(outputDir, name) {
  fs.mkdirSync(outputDir, { recursive: true });
  const base = name ?? `users-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const jsonlPath = path.join(outputDir, `${base}.jsonl`);
  const csvPath = path.join(outputDir, `${base}.csv`);

  fs.writeFileSync(jsonlPath, '');
  fs.writeFileSync(csvPath, CSV_HEADER);

  return {
    describe: () => [csvPath, jsonlPath],
    async append(users) {
      if (!users.length) return;
      fs.appendFileSync(jsonlPath, users.map((u) => JSON.stringify(u)).join('\n') + '\n');
      fs.appendFileSync(csvPath, users.map(toCsvRow).join('\n') + '\n');
    },
  };
}

/** Upserts each user into MongoDB. `extra` fields (e.g. the search URL) are stored on every record. */
export function createMongoStorage(collection, extra = {}) {
  return {
    describe: () => [`MongoDB ${collection.dbName}.${collection.collectionName}`],
    append: (users) => upsertUsers(collection, users, extra),
  };
}

/** Fan out to several storages. */
export function combineStorage(...storages) {
  return {
    describe: () => storages.flatMap((s) => s.describe()),
    async append(users) {
      for (const s of storages) await s.append(users);
    },
  };
}
