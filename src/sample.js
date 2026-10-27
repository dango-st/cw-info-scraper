// Offline run against saved HTML: `npm run sample -- <listPage.html> <userPage.html>`
// Parses the list page, merges the saved profile page into the matching user,
// and writes output/sample.csv + output/sample.jsonl.
import fs from 'node:fs';
import { config } from './config.js';
import { mergeUser, parseListPage, parseUserPage } from './parser.js';
import { createFileStorage } from './storage.js';

const [listFile = 'list.md', userFile = 'one user.md'] = process.argv.slice(2);

const { users, resultCountText } = parseListPage(fs.readFileSync(listFile, 'utf8'));
const detail = parseUserPage(fs.readFileSync(userFile, 'utf8'));
const detailId = detail.id;

const storage = createFileStorage(config.outputDir, 'sample');
const records = users.map((u) => ({ ...mergeUser(u, u.id === detailId ? detail : null), page: 1 }));
await storage.append(records);

console.log(`${resultCountText} — parsed ${users.length} users, profile page matched user ${detailId}`);
console.log(JSON.stringify(records.find((r) => r.id === detailId), null, 2));
console.log(`\n${storage.describe().join('\n')}`);
