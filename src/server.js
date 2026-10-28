import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { config } from './config.js';
import { connectDb } from './db.js';
import { CSV_HEADER, toCsvRow } from './storage.js';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

const SORTABLE = new Set([
  'scrapedAt', 'displayName', 'ratingAverage', 'ratingCount', 'contractCount',
  'viewCount', 'watchlistCount', 'lastAccessAt', 'projectFinishedRate', 'minHourlyWage',
]);

// Fields shown in the table; the detail endpoint returns the whole document.
const LIST_PROJECTION = {
  displayName: 1, emails: 1, headline: 1, gender: 1, ageRange: 1, prefecture: 1,
  occupations: 1, ratingAverage: 1, ratingCount: 1, contractCount: 1, viewCount: 1,
  lastAccessAt: 1, statusText: 1, minHourlyWage: 1, profileUrl: 1, error: 1, comment: 1,
};

const MAX_COMMENT_LENGTH = 2000;

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Build a MongoDB filter from the query string. */
function buildFilter(q) {
  const and = [];
  if (q.q) {
    const re = new RegExp(escapeRegex(q.q.trim()), 'i');
    and.push({
      $or: ['_id', 'displayName', 'emails', 'introduction', 'headline', 'occupations', 'jobCategories', 'skills', 'comment']
        .map((field) => ({ [field]: re })),
    });
  }
  for (const field of ['gender', 'ageRange', 'prefecture', 'occupations', 'searchKeywords']) {
    if (q[field]) and.push({ [field]: q[field] });
  }
  if (q.hasEmail === '1') and.push({ 'emails.0': { $exists: true } });
  if (q.hasEmail === '0') and.push({ 'emails.0': { $exists: false } });
  if (q.hasComment === '1') and.push({ comment: { $nin: [null, ''] } });
  if (q.hasComment === '0') and.push({ comment: { $in: [null, ''] } });
  if (q.minRating) and.push({ ratingAverage: { $gte: Number(q.minRating) } });
  return and.length ? { $and: and } : {};
}

function buildSort(q) {
  const field = SORTABLE.has(q.sort) ? q.sort : 'scrapedAt';
  return { [field]: q.order === 'asc' ? 1 : -1, _id: 1 };
}

const { users } = await connectDb(config);
const app = express();
app.use(express.static(PUBLIC_DIR));
app.use(express.json());

app.get('/api/users', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const filter = buildFilter(req.query);
    const [items, total] = await Promise.all([
      users.find(filter, { projection: LIST_PROJECTION })
        .sort(buildSort(req.query)).skip((page - 1) * limit).limit(limit).toArray(),
      users.countDocuments(filter),
    ]);
    res.json({ total, page, limit, items });
  } catch (err) {
    next(err);
  }
});

app.get('/api/users/:id', async (req, res, next) => {
  try {
    const user = await users.findOne({ _id: req.params.id });
    if (!user) return res.status(404).json({ error: 'not found' });
    res.json(user);
  } catch (err) {
    next(err);
  }
});

/** Save the viewer's comment on a user. The scraper never overwrites this field. */
app.patch('/api/users/:id', async (req, res, next) => {
  try {
    const { comment } = req.body ?? {};
    if (typeof comment !== 'string' || comment.length > MAX_COMMENT_LENGTH) {
      return res.status(400).json({ error: `comment must be a string of at most ${MAX_COMMENT_LENGTH} characters` });
    }
    const result = await users.findOneAndUpdate(
      { _id: req.params.id },
      { $set: { comment: comment.trim(), commentUpdatedAt: new Date() } },
      { returnDocument: 'after', projection: { comment: 1, commentUpdatedAt: 1 } },
    );
    if (!result) return res.status(404).json({ error: 'not found' });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/** Values for the filter dropdowns plus headline counts. */
app.get('/api/facets', async (req, res, next) => {
  try {
    const distinct = (field) => users.distinct(field).then((v) => v.filter(Boolean).sort());
    const [total, withEmail, genders, ageRanges, prefectures, occupations, searchKeywords] = await Promise.all([
      users.countDocuments(),
      users.countDocuments({ 'emails.0': { $exists: true } }),
      distinct('gender'),
      distinct('ageRange'),
      distinct('prefecture'),
      distinct('occupations'),
      distinct('searchKeywords'),
    ]);
    res.json({ total, withEmail, genders, ageRanges, prefectures, occupations, searchKeywords });
  } catch (err) {
    next(err);
  }
});

/** Download the current filtered result as CSV. */
app.get('/api/export.csv', async (req, res, next) => {
  try {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="crowdworks-users.csv"`);
    res.write(CSV_HEADER);
    for await (const u of users.find(buildFilter(req.query)).sort(buildSort(req.query))) {
      res.write(toCsvRow({ ...u, id: u._id }) + '\n');
    }
    res.end();
  } catch (err) {
    next(err);
  }
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

app.listen(config.port, () => {
  console.log(`Viewer running at http://localhost:${config.port}`);
});
