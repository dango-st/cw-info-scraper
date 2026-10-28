import {
  ACCOUNT_TYPE, GENDER, PAYMENT_TYPE, PREFECTURES, STATUS_TEXT, TERMS, WEB_MEETING,
} from './dictionary.js';

// CJK punctuation (〜, 。), hiragana, katakana, CJK ideographs and full-width forms.
const JAPANESE_RE = /[　-ヿ㐀-鿿＀-￯]/;
const hasJapanese = (s) => typeof s === 'string' && JAPANESE_RE.test(s);

/** Japanese terms we had no translation for in this process, with how often they appeared. */
export const untranslated = new Map();

function lookup(table, value) {
  if (!hasJapanese(value)) return value; // empty, null or already English
  const key = value.trim();
  if (table[key]) return table[key];
  untranslated.set(key, (untranslated.get(key) ?? 0) + 1);
  return value;
}

const term = (v) => lookup(TERMS, v);
const terms = (arr) => (Array.isArray(arr) ? arr.map(term) : arr);

/** "2023年12月27日(金)" -> "2023-12-27" (applied to every date in the string). */
const dates = (s) =>
  s.replace(/(\d{4})年(\d{1,2})月(\d{1,2})日(?:\s*[(（][^)）]*[)）])?/g,
    (_, y, m, d) => `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`);

/** Shared fix-ups for amounts and ranges. */
const amounts = (s) =>
  s.replace(/([\d,]+)\s*円/g, '$1 JPY').replace(/\s*[〜～]\s*/g, ' ~ ').replace(/[：]/g, ': ').trim();

function ageRange(s) {
  if (!hasJapanese(s)) return s;
  if (/^10代/.test(s)) return 'Teens';
  const m = s.match(/(\d+)代(前半|後半)?(以上)?/);
  if (!m) return lookup({}, s);
  const decade = `${m[1]}s`;
  if (m[3]) return `${decade}+`;
  if (m[2] === '前半') return `Early ${decade}`;
  if (m[2] === '後半') return `Late ${decade}`;
  return decade;
}

function hoursPerWeek(s) {
  if (!hasJapanese(s)) return s;
  let m;
  if ((m = s.match(/^(\d+)\s*[〜～]\s*(\d+)\s*時間$/))) return `${m[1]}-${m[2]} hours/week`;
  if ((m = s.match(/^(\d+)\s*時間以下$/))) return `Up to ${m[1]} hours/week`;
  if ((m = s.match(/^(\d+)\s*時間以上$/))) return `${m[1]}+ hours/week`;
  return lookup({}, s);
}

const UNITS = { 秒: 'second', 分: 'minute', 時間: 'hour', 日: 'day', 週間: 'week', ヶ月: 'month', か月: 'month', ヵ月: 'month', 年: 'year' };

/** "6日前" -> "6 days ago", "1年以上前" -> "over 1 year ago". */
function relativeTime(s) {
  if (!hasJapanese(s)) return s;
  const m = s.match(/(\d+)\s*(秒|分|時間|日|週間|ヶ月|か月|ヵ月|年)(以上)?前/);
  if (!m) return lookup({ たった今: 'just now', 今日: 'today' }, s);
  const n = Number(m[1]);
  const unit = UNITS[m[2]] + (n === 1 ? '' : 's');
  return `${m[3] ? 'over ' : ''}${n} ${unit} ago`;
}

function contractPeriod(s) {
  if (!hasJapanese(s)) return s;
  const out = dates(s)
    .replace(/終了日[:：]\s*/, 'End date: ')
    .replace(/開始日[:：]\s*/, 'Start date: ')
    .replace(/契約期間[:：]\s*/, 'Period: ')
    .replace(/[〜～]/g, ' ~ ');
  return hasJapanese(out) ? lookup({}, s) : out;
}

function contractCondition(s) {
  if (!hasJapanese(s)) return s;
  const out = amounts(
    s.replace(/契約金額（目安）/g, 'Contract amount (est.)')
      .replace(/契約金額/g, 'Contract amount')
      .replace(/時間単価/g, 'Hourly rate')
      .replace(/稼働時間/g, 'Working hours')
      .replace(/時間\/週/g, 'hours/week'),
  ).replace(/\s+/g, ' ');
  return hasJapanese(out) ? lookup({}, s) : out;
}

/** "音楽・音響・ナレーション / ライター" -> "Music / Audio / Narration | Writer". */
const headline = (s) => (hasJapanese(s) ? s.split(/\s+\/\s+/).map(term).join(' | ') : s);

/**
 * Return a copy of a scraped user record with the fixed-vocabulary fields
 * translated to English. Free text written by the user (introduction,
 * review comments, job titles, display name) is left as-is.
 * Safe to run on records that are already English.
 */
export function toEnglish(user) {
  const u = { ...user };
  u.accountType = lookup(ACCOUNT_TYPE, u.accountType);
  u.gender = lookup(GENDER, u.gender);
  u.ageRange = ageRange(u.ageRange);
  u.prefecture = lookup(PREFECTURES, u.prefecture);
  u.statusText = lookup(STATUS_TEXT, u.statusText);
  u.webMeeting = lookup(WEB_MEETING, u.webMeeting);
  u.hoursPerWeek = hoursPerWeek(u.hoursPerWeek);
  u.lastAccessText = relativeTime(u.lastAccessText);
  if (hasJapanese(u.registeredAt)) u.registeredAt = dates(u.registeredAt);
  if (hasJapanese(u.hourlyWageText)) u.hourlyWageText = amounts(u.hourlyWageText);
  u.headline = headline(u.headline);
  u.occupations = terms(u.occupations);
  u.jobCategories = terms(u.jobCategories);
  u.skills = terms(u.skills);
  if (Array.isArray(u.recentContracts)) {
    u.recentContracts = u.recentContracts.map((c) => ({
      ...c,
      category: term(c.category),
      paymentType: lookup(PAYMENT_TYPE, c.paymentType),
      condition: contractCondition(c.condition),
      period: contractPeriod(c.period),
    }));
  }
  return u;
}

/**
 * Report the terms that still need a dictionary entry. With a collection,
 * they're saved to MongoDB (untranslated_terms); otherwise just printed.
 */
export async function reportUntranslated(untranslatedTerms) {
  if (!untranslated.size) return;
  const sorted = [...untranslated].sort((a, b) => b[1] - a[1]);
  console.log(`\n${untranslated.size} Japanese term(s) had no translation and were kept as-is:`);
  sorted.slice(0, 20).forEach(([t, n]) => console.log(`  ${n}\t${t}`));
  if (sorted.length > 20) console.log(`  … and ${sorted.length - 20} more`);
  if (untranslatedTerms) {
    const { saveUntranslatedTerms } = await import('./db.js');
    await saveUntranslatedTerms(untranslatedTerms, untranslated);
    console.log(`Saved to MongoDB collection "${untranslatedTerms.collectionName}".`);
  }
  console.log('Add them to src/dictionary.js, then run `npm run translate-db` to update saved records.');
  untranslated.clear();
}
