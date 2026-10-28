// Parser check against saved HTML — prints the result, writes nothing and
// doesn't touch MongoDB: `npm run sample -- <listPage.html> <userPage.html>`
import fs from 'node:fs';
import { mergeUser, parseListPage, parseUserPage } from './parser.js';
import { reportUntranslated, toEnglish } from './translate.js';

const [listFile = 'list.md', userFile = 'one user.md'] = process.argv.slice(2);

const { users, resultCountText } = parseListPage(fs.readFileSync(listFile, 'utf8'));
const detail = parseUserPage(fs.readFileSync(userFile, 'utf8'));
const records = users.map((u) => toEnglish(mergeUser(u, u.id === detail.id ? detail : null)));

console.log(`${resultCountText} — parsed ${users.length} users, profile page matched user ${detail.id}`);
console.log(JSON.stringify(records.find((r) => r.id === detail.id), null, 2));
console.log(`\n${records.filter((r) => r.emails.length).length}/${records.length} users have an email`);
await reportUntranslated();
