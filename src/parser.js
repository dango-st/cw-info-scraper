import * as cheerio from 'cheerio';

const BASE = 'https://crowdworks.jp';
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** Read and JSON-parse the `data="..."` attribute Vue components are mounted with. */
function readData($, selector) {
  const raw = $(selector).attr('data');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const clean = (s) => (s ?? '').replace(/\s+/g, ' ').trim();
const names = (list) => (list ?? []).map((x) => x.localized_name ?? x.name).filter(Boolean);
const extractEmails = (text) => [...new Set((text ?? '').match(EMAIL_RE) ?? [])];

/* ------------------------------------------------------------------ */
/* List page: /public/employees?...&page=N                            */
/* ------------------------------------------------------------------ */

/**
 * Returns { users, resultCountText }. `users` is empty when the page has no
 * more results.
 */
export function parseListPage(html) {
  const $ = cheerio.load(html);
  const list = readData($, '#pc-worker-card-list');
  const tabs = readData($, '#employee-search-tabs');

  const users = (list?.workers ?? []).map(({ employee }) => {
    const u = employee.user ?? {};
    return {
      id: String(employee.user_id),
      profileUrl: `${BASE}/public/employees/${employee.user_id}`,
      displayName: u.display_name ?? '',
      status: employee.status ?? '',
      simpleIntroduction: employee.simple_introduction ?? '',
      introduction: employee.introduction ?? '',
      minHourlyWage: employee.min_hourly_wage ?? null,
      maxHourlyWage: employee.max_hourly_wage ?? null,
      hoursPerWeek: employee.hours_limit_label ?? '',
      webMeeting: employee.web_meeting_text ?? '',
      lastAccessAt: u.public_last_access ?? '',
      occupations: names(u.occupations),
      jobCategories: names(u.job_categories),
      skills: names(u.skills),
      proCrowdworker: !!u.pro_crowdworker,
      topProCrowdworker: !!u.top_pro_crowdworker,
      identityVerified: !!u.identity_verified,
      contractCount: u.contract_summary?.count_as_employee_except_tasks ?? 0,
      feedbackScore: u.feedback_summary?.score_as_employee ?? null,
      pictureUrl: u.picture_url ?? '',
    };
  });

  const resultCountText = cheerio.load(tabs?.resultCountHtml ?? '').text();
  return { users, resultCountText };
}

/* ------------------------------------------------------------------ */
/* User page: /public/employees/:id                                   */
/* ------------------------------------------------------------------ */

/** "個人 / 男性 / 20代前半 ( 愛知県 )" -> { accountType, gender, ageRange, prefecture } */
function parseAttributes(text) {
  const out = { accountType: '', gender: '', ageRange: '', prefecture: '' };
  const pref = text.match(/[(（]\s*(.+?)\s*[)）]/);
  if (pref) out.prefecture = pref[1];
  const parts = text.replace(/[(（].*?[)）]/, '').split('/').map(clean).filter(Boolean);
  for (const p of parts) {
    if (/^(個人|法人)$/.test(p)) out.accountType = p;
    else if (/^(男性|女性)$/.test(p)) out.gender = p;
    else if (/代/.test(p)) out.ageRange = p;
  }
  return out;
}

/** Collect the <dl class="summary"><dt>label</dt><dd>value</dd></dl> blocks into a map. */
function summaryMap($) {
  const map = {};
  $('.employee-summaries dl.summary').each((_, dl) => {
    map[clean($(dl).find('dt').text())] = clean($(dl).find('dd').text());
  });
  return map;
}

/** The view-count / watchlist table in the sidebar. */
function statsMap($) {
  const map = {};
  $('table.summary tr').each((_, tr) => {
    const key = clean($(tr).find('th').text()).replace(/\s*[:：]$/, '');
    if (key) map[key] = clean($(tr).find('td').text());
  });
  return map;
}

const toInt = (s) => {
  const n = parseInt(String(s ?? '').replace(/[^\d]/g, ''), 10);
  return Number.isNaN(n) ? null : n;
};

export function parseUserPage(html) {
  const $ = cheerio.load(html);
  const achievements = readData($, '#pc-employee-achievements-container')?.employee ?? {};
  const feedbacks = readData($, '#summary-feedbacks-container')?.feedbacks ?? {};
  const contracts = readData($, '#summary-contracts-container')?.contracts?.contracts ?? [];
  const summary = summaryMap($);
  const stats = statsMap($);

  // Keep <br> line breaks in the introduction.
  const introEl = $('.introduction p').first().clone();
  introEl.find('br').replaceWith('\n');
  const introduction = introEl.text().split('\n').map((l) => l.trim()).join('\n').trim();

  const userId = readData($, '#employee-tabs-container')?.userId;

  return {
    id: userId ? String(userId) : undefined,
    displayName: clean($('.user-display-name').first().text()),
    headline: [clean($('.subtitle-in-h1-pc').text()), clean($('.subtitle-out-of-h1-pc a').text())]
      .filter(Boolean)
      .join(' / '),
    ...parseAttributes(clean($('p.attributes').first().text())),
    lastAccessText: clean($('p.last_activity').first().text()).replace(/^最終アクセス[:：]\s*/, ''),
    statusText: summary['ステータス'] ?? '',
    hourlyWageText: summary['時間単価'] ?? '',
    registeredAt: summary['登録日'] ?? '',
    introduction,
    viewCount: toInt(stats['閲覧回数']),
    watchlistCount: toInt(stats['気になる！リスト']),
    identityVerified: !!achievements.isIdentiryVerified, // sic: typo is in CrowdWorks' own data
    ndaConcluded: !!achievements.nonDisclosureAgreementConcluded,
    qualifiedInvoiceIssuer: !!achievements.isQualifiedInvoiceIssuer,
    ratingAverage: feedbacks.total_rating?.average_score ?? achievements.feedbacks?.averageScore ?? null,
    ratingCount: feedbacks.total_rating?.evaluation_count ?? achievements.feedbacks?.count ?? 0,
    ratingItems: Object.fromEntries(
      (feedbacks.total_rating?.rating_item_scores ?? []).map((r) => [r.label_text, r.score]),
    ),
    projectFinishedRate: achievements.projectFinishedRate?.value ?? null,
    contractCount: achievements.countAsEmployeeExceptTasks ?? 0,
    recentFeedbacks: (feedbacks.user_ratings ?? []).map((r) => ({
      score: r.average_score,
      comment: r.comment,
      jobTitle: r.job_offer_title,
      ratedAt: r.rated_at,
    })),
    recentContracts: contracts.map((c) => ({
      jobTitle: c.job_offer_title,
      category: c.job_offer_category_name,
      paymentType: c.payment_type,
      condition: clean(c.condition_text),
      period: c.period,
    })),
  };
}

/** Combine list-card data with profile-page data into one record. */
export function mergeUser(listUser, detail) {
  const merged = { ...listUser, ...(detail ?? {}), id: listUser.id };
  // The list JSON has the raw introduction; fall back to the page text if missing.
  merged.introduction = listUser.introduction || detail?.introduction || '';
  merged.ratingAverage ??= listUser.feedbackScore;
  merged.emails = extractEmails(`${merged.introduction}\n${merged.simpleIntroduction}`);
  return merged;
}
