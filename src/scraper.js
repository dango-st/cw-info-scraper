import { createClient, fetchHtml, sleep } from './http.js';
import { mergeUser, parseListPage, parseUserPage } from './parser.js';
import { toEnglish } from './translate.js';

/** Return a copy of `baseUrl` with its `page` query parameter set to `page`. */
export function withPage(baseUrl, page) {
  const url = new URL(baseUrl);
  url.searchParams.set('page', String(page));
  return url.href;
}

/** Fetch one user's profile page; on failure keep the list data and record the error. */
async function scrapeUser(client, listUser, config) {
  try {
    const html = await fetchHtml(client, listUser.profileUrl, config);
    return toEnglish(mergeUser(listUser, html ? parseUserPage(html) : null));
  } catch (err) {
    console.warn(`    ! ${listUser.id}: ${err.message}`);
    return { ...toEnglish(mergeUser(listUser, null)), error: err.message };
  }
}

/**
 * Walk page = startPage, startPage+1, ... until a page returns no users
 * (or only users we've already seen in this run, which happens when the site
 * clamps out-of-range pages to the last page). For each user not already in
 * the database, fetch their profile page and save the merged record. Users
 * already saved are skipped, however old their record is.
 */
export async function scrape(baseUrl, config, storage, client = createClient(config)) {
  const seen = new Set();
  let page = config.startPage;
  let pagesFetched = 0;
  let saved = 0;
  let skipped = 0;

  while (true) {
    if (config.maxPages && pagesFetched >= config.maxPages) {
      console.log(`Reached MAX_PAGES (${config.maxPages}).`);
      break;
    }

    const url = withPage(baseUrl, page);
    console.log(`[page ${page}] ${url}`);

    const html = await fetchHtml(client, url, config);
    pagesFetched++;
    if (!html) {
      console.log('  no response body — stopping.');
      break;
    }

    const { users, resultCountText } = parseListPage(html);
    if (pagesFetched === 1 && resultCountText) console.log(`  ${resultCountText}`);

    if (!users.length) {
      console.log('  no users on this page — done.');
      break;
    }
    const fresh = users.filter((u) => !seen.has(u.id));
    if (!fresh.length) {
      console.log('  same users as an earlier page (past the last page) — done.');
      break;
    }
    fresh.forEach((u) => seen.add(u.id));

    const existing = await storage.existingIds(fresh.map((u) => u.id));
    const toScrape = fresh.filter((u) => !existing.has(u.id));
    skipped += fresh.length - toScrape.length;
    console.log(`  ${toScrape.length} new, ${fresh.length - toScrape.length} already saved (skipped)`);

    for (const [i, listUser] of toScrape.entries()) {
      const user = await scrapeUser(client, listUser, config);
      await storage.append([{ ...user, page }]);
      saved++;
      console.log(`  (${i + 1}/${toScrape.length}) ${user.id} ${user.displayName} ${user.emails.join(' ')}`);
      await sleep(config.detailDelayMs);
    }

    page++;
    await sleep(config.delayMs);
  }

  return { saved, skipped, pagesFetched };
}
