import { upsertUsers } from './db.js';

// Flat columns for the viewer's CSV export. Nested fields (recentFeedbacks,
// recentContracts, ratingItems) are kept in full in MongoDB.
export const CSV_COLUMNS = [
  'id', 'profileUrl', 'displayName', 'emails', 'headline',
  'accountType', 'gender', 'ageRange', 'prefecture',
  'status', 'statusText', 'minHourlyWage', 'maxHourlyWage', 'hoursPerWeek', 'webMeeting',
  'registeredAt', 'lastAccessAt', 'lastAccessText',
  'occupations', 'jobCategories', 'skills',
  'ratingAverage', 'ratingCount', 'projectFinishedRate', 'contractCount',
  'identityVerified', 'proCrowdworker', 'viewCount', 'watchlistCount',
  'introduction', 'comment', 'page', 'error',
];

const csvCell = (v) => {
  const s = Array.isArray(v) ? v.join(' | ') : String(v ?? '');
  return `"${s.replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
};

export const CSV_HEADER = '﻿' + CSV_COLUMNS.join(',') + '\n'; // BOM so Excel reads Japanese correctly
export const toCsvRow = (user) => CSV_COLUMNS.map((c) => csvCell(user[c])).join(',');

/** Upserts each user into MongoDB as soon as it's scraped. `extra` fields (e.g. the search keyword) go on every record. */
export function createMongoStorage(collection, extra = {}) {
  return {
    describe: () => `MongoDB ${collection.dbName}.${collection.collectionName}`,
    append: (users) => upsertUsers(collection, users, extra),
  };
}
