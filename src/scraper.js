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
 * (or only users we've already seen, which happens when the site clamps
 * out-of-range pages to the last page). For each user, also fetch their
 * profile page and save the merged record.
 */
export async function scrape(baseUrl, config, storage) {
  const client = createClient(config);
  const seen = new Set();
  let page = config.startPage;
  let pagesFetched = 0;

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

    const fresh = users.filter((u) => !seen.has(u.id));
    if (!fresh.length) {
      console.log('  no new users on this page — done.');
      break;
    }

    for (const [i, listUser] of fresh.entries()) {
      seen.add(listUser.id);
      const user = await scrapeUser(client, listUser, config);
      await storage.append([{ ...user, page }]);
      console.log(`  (${i + 1}/${fresh.length}) ${user.id} ${user.displayName} ${user.emails.join(' ')}`);
      await sleep(config.detailDelayMs);
    }
    console.log(`  page ${page} done (total ${seen.size})`);

    page++;
    await sleep(config.delayMs);
  }

  return { total: seen.size, pagesFetched };
}
