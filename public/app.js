const $ = (sel) => document.querySelector(sel);
const form = $('#filters');
const tbody = $('#table tbody');
const state = { page: 1, limit: 50, total: 0, activeId: null };

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const list = (v) => (Array.isArray(v) ? v : []);
const fmtDate = (s) => (s ? new Date(s).toLocaleString('ja-JP', { dateStyle: 'medium', timeStyle: 'short' }) : '');
const dash = (v) => (v === null || v === undefined || v === '' ? '<span class="muted">–</span>' : esc(v));

function filterParams() {
  const params = new URLSearchParams();
  for (const [k, v] of new FormData(form)) if (v) params.set(k, v);
  return params;
}

async function getJson(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

/** navigator.clipboard only exists on https/localhost; fall back for http://<LAN IP>. */
async function copyText(text) {
  if (navigator.clipboard) return navigator.clipboard.writeText(text);
  const ta = Object.assign(document.createElement('textarea'), { value: text });
  document.body.append(ta);
  ta.select();
  document.execCommand('copy');
  ta.remove();
}

const EYE_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/></svg>';

let toastTimer;
function toast(message, isError = false) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.toggle('error', isError);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), isError ? 6000 : 1800);
}

const copyButton = (text) => `<button class="copy" type="button" data-copy="${esc(text)}" title="Copy ${esc(text)}">Copy</button>`;

/* ---------- facets / dropdowns ---------- */

async function loadFacets() {
  const f = await getJson('/api/facets');
  $('#stats').innerHTML = `<b>${f.total.toLocaleString()}</b> users · <b>${f.withEmail.toLocaleString()}</b> with email`;
  const fill = (name, values) => {
    const sel = form.elements[name];
    for (const v of values) sel.add(new Option(v, v));
  };
  fill('gender', f.genders);
  fill('ageRange', f.ageRanges);
  fill('prefecture', f.prefectures);
  fill('occupations', f.occupations);
  fill('searchKeywords', f.searchKeywords);
}

/* ---------- table ---------- */

async function loadUsers() {
  const params = filterParams();
  params.set('page', state.page);
  params.set('limit', state.limit);
  history.replaceState(null, '', `?${params}`);
  $('#export').href = `/api/export.csv?${filterParams()}`;

  const data = await getJson(`/api/users?${params}`);
  state.total = data.total;

  if (!data.items.length) {
    tbody.innerHTML = `<tr><td colspan="12" class="empty">No users match these filters.</td></tr>`;
  } else {
    tbody.innerHTML = data.items.map((u) => `
      <tr data-id="${esc(u._id)}" class="${u._id === state.activeId ? 'active' : ''}">
        <td class="view-col"><button class="eye" type="button" data-view="${esc(u._id)}" title="View details" aria-label="View details for ${esc(u.displayName)}">${EYE_ICON}</button></td>
        <td><a href="${esc(u.profileUrl || `https://crowdworks.jp/public/employees/${u._id}`)}" target="_blank" rel="noopener" title="Open CrowdWorks profile">${esc(u._id)}</a></td>
        <td><div class="copy-line"><span>${esc(u.displayName)}${u.error ? ' <span title="profile fetch failed">⚠</span>' : ''}</span>${u.displayName ? copyButton(u.displayName) : ''}</div></td>
        <td class="email">${list(u.emails).map((e) => `<div class="copy-line"><span>${esc(e)}</span>${copyButton(e)}</div>`).join('') || '<span class="muted">–</span>'}</td>
        <td>${[u.gender, u.ageRange].filter(Boolean).map(esc).join(' / ') || '<span class="muted">–</span>'}</td>
        <td>${dash(u.prefecture)}</td>
        <td class="wrap">${list(u.occupations).map(esc).join(', ') || '<span class="muted">–</span>'}</td>
        <td class="num">${u.ratingAverage != null ? `${u.ratingAverage} <span class="muted">(${u.ratingCount ?? 0})</span>` : '<span class="muted">–</span>'}</td>
        <td class="num">${dash(u.contractCount)}</td>
        <td class="num">${dash(u.viewCount)}</td>
        <td>${fmtDate(u.lastAccessAt) || '<span class="muted">–</span>'}</td>
        <td><input class="comment" data-comment-for="${esc(u._id)}" value="${esc(u.comment)}" placeholder="Add comment…" maxlength="2000"></td>
      </tr>`).join('');
  }

  const pages = Math.max(1, Math.ceil(state.total / state.limit));
  $('#pageInfo').textContent = `Page ${state.page} / ${pages} · ${state.total.toLocaleString()} results`;
  $('#prev').disabled = state.page <= 1;
  $('#next').disabled = state.page >= pages;
}

/* ---------- detail panel ---------- */

const kv = (rows) => `<dl class="kv">${rows
  .filter(([, v]) => v !== undefined)
  .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v === null || v === '' ? '<span class="muted">–</span>' : v}</dd>`)
  .join('')}</dl>`;
const chips = (arr) => (list(arr).length ? `<div class="chips">${arr.map((x) => `<span class="chip">${esc(x)}</span>`).join('')}</div>` : '<span class="muted">–</span>');
const scoreClass = (s) => (s >= 4 ? 'good' : s <= 2 ? 'bad' : '');
const yesNo = (b) => (b ? 'Yes' : 'No');

async function openDetail(id) {
  state.activeId = id;
  document.querySelectorAll('tbody tr').forEach((tr) => tr.classList.toggle('active', tr.dataset.id === id));
  const u = await getJson(`/api/users/${encodeURIComponent(id)}`);
  const emails = list(u.emails);

  $('#detailBody').innerHTML = `
    <h2 id="detailTitle">${esc(u.displayName)} ${u.displayName ? copyButton(u.displayName) : ''}</h2>
    <div class="muted">${esc(u.headline)}</div>
    <p><a href="${esc(u.profileUrl)}" target="_blank" rel="noopener">Open on CrowdWorks ↗</a></p>

    <h3>Contact</h3>
    <div class="emails">${emails.length
      ? emails.map((e) => `${esc(e)} ${copyButton(e)}`).join('<br>')
      : '<span class="muted">No email found</span>'}</div>

    <h3>Comment</h3>
    <textarea class="comment" data-comment-for="${esc(u._id)}" rows="3" maxlength="2000" placeholder="Add comment…">${esc(u.comment)}</textarea>
    <div class="muted small">${u.commentUpdatedAt ? `Saved ${esc(fmtDate(u.commentUpdatedAt))}` : 'Saved automatically when you click away'}</div>

    <h3>Profile</h3>
    ${kv([
      ['ID', esc(u._id)],
      ['Type', esc(u.accountType)],
      ['Gender', esc(u.gender)],
      ['Age', esc(u.ageRange)],
      ['Prefecture', esc(u.prefecture)],
      ['Status', esc(u.statusText || u.status)],
      ['Hourly wage', u.minHourlyWage != null ? `${esc(u.minHourlyWage)} ~ ${esc(u.maxHourlyWage ?? '')} JPY` : ''],
      ['Hours / week', esc(u.hoursPerWeek)],
      ['Web meeting', esc(u.webMeeting)],
      ['Registered', esc(u.registeredAt)],
      ['Last access', `${esc(fmtDate(u.lastAccessAt))} <span class="muted">${esc(u.lastAccessText ?? '')}</span>`],
      ['Identity verified', yesNo(u.identityVerified)],
      ['Pro crowdworker', yesNo(u.proCrowdworker)],
      ['Invoice issuer', yesNo(u.qualifiedInvoiceIssuer)],
      ['Profile views', esc(u.viewCount)],
      ['Watchlisted by', esc(u.watchlistCount)],
    ])}

    <h3>Performance</h3>
    ${kv([
      ['Rating', u.ratingAverage != null ? `<span class="score ${scoreClass(u.ratingAverage)}">${esc(u.ratingAverage)}</span> (${esc(u.ratingCount)} reviews)` : ''],
      ...Object.entries(u.ratingItems ?? {}).map(([k, v]) => [`· ${k}`, esc(v)]),
      ['Contracts', esc(u.contractCount)],
      ['Completion rate', u.projectFinishedRate != null ? `${esc(u.projectFinishedRate)}%` : ''],
    ])}

    <h3>Occupations</h3>${chips(u.occupations)}
    <h3>Job categories</h3>${chips(u.jobCategories)}
    <h3>Skills</h3>${chips(u.skills)}

    <h3>Introduction</h3>
    <p class="intro">${esc((u.introduction || '').trim()) || '<span class="muted">–</span>'}</p>

    <h3>Recent feedback</h3>
    ${list(u.recentFeedbacks).map((f) => `
      <div class="item">
        <span class="score ${scoreClass(f.score)}">★ ${esc(f.score)}</span>
        <span class="muted">${esc(fmtDate(f.ratedAt))}</span><br>
        ${esc(f.comment)}<br><span class="muted">${esc(f.jobTitle)}</span>
      </div>`).join('') || '<span class="muted">–</span>'}

    <h3>Recent contracts</h3>
    ${list(u.recentContracts).map((c) => `
      <div class="item">
        ${esc(c.jobTitle)}<br>
        <span class="muted">${esc(c.category)} · ${esc(c.paymentType)} · ${esc(c.condition)} · ${esc(c.period)}</span>
      </div>`).join('') || '<span class="muted">–</span>'}

    <h3>Record</h3>
    ${kv([
      ['Search keyword', esc(u.searchKeywords)],
      ['List page', esc(u.page)],
      ['First scraped', esc(fmtDate(u.firstScrapedAt))],
      ['Last scraped', esc(fmtDate(u.scrapedAt))],
      ['Error', u.error ? esc(u.error) : undefined],
    ])}
    <details><summary>Raw JSON</summary><pre class="raw">${esc(JSON.stringify(u, null, 2))}</pre></details>
  `;
  $('#detail').hidden = false;
  $('#detail .modal').scrollTop = 0;
  document.body.classList.add('modal-open');
  $('#close').focus();
}

function closeDetail() {
  if ($('#detail').hidden) return;
  // Save a comment that's still being edited before the modal disappears.
  const active = document.activeElement;
  if (active?.matches('.comment')) active.blur();
  $('#detail').hidden = true;
  document.body.classList.remove('modal-open');
  state.activeId = null;
  document.querySelectorAll('tbody tr.active').forEach((tr) => tr.classList.remove('active'));
}

/* ---------- events ---------- */

let searchTimer;
form.addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { state.page = 1; loadUsers(); }, e.target.type === 'search' ? 300 : 0);
});
form.addEventListener('submit', (e) => e.preventDefault());
$('#reset').addEventListener('click', () => { form.reset(); state.page = 1; loadUsers(); });
$('#prev').addEventListener('click', () => { state.page--; loadUsers(); });
$('#next').addEventListener('click', () => { state.page++; loadUsers(); });
$('#limit').addEventListener('change', (e) => { state.limit = +e.target.value; state.page = 1; loadUsers(); });
// Only the eye button opens the details; the rest of the row is left for copying and comments.
tbody.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-view]');
  if (btn) openDetail(btn.dataset.view).catch((err) => toast(`Could not load user: ${err.message}`, true));
});
$('#close').addEventListener('click', closeDetail);
$('#detail').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeDetail(); // click on the dark backdrop
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !e.target.matches('.comment')) closeDetail();
});

// Copy buttons (table and detail panel).
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-copy]');
  if (!btn) return;
  try {
    await copyText(btn.dataset.copy);
    btn.textContent = 'Copied';
  } catch {
    btn.textContent = 'Failed';
  }
  setTimeout(() => (btn.textContent = 'Copy'), 1200);
});

// Comments save when the box loses focus (or Enter in the table's one-line box).
async function saveComment(el) {
  const id = el.dataset.commentFor;
  el.classList.remove('saved', 'error');
  try {
    const { comment } = await getJson(`/api/users/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment: el.value }),
    });
    // Keep the table row and the detail panel in sync.
    document.querySelectorAll('.comment').forEach((other) => {
      if (other.dataset.commentFor === id) other.value = comment;
    });
    el.classList.add('saved');
    el.title = '';
    setTimeout(() => el.classList.remove('saved'), 1200);
    toast('Comment saved');
  } catch (err) {
    el.classList.add('error');
    el.title = `Not saved: ${err.message}`;
    const hint = err.message.startsWith('404') && !err.message.includes('not found')
      ? ' — the server is running old code, restart it with `npm run server`'
      : '';
    const reason = err.message.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 120);
    toast(`Comment NOT saved: ${reason}${hint}`, true);
  }
}
document.addEventListener('change', (e) => {
  if (e.target.matches('.comment')) saveComment(e.target);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('input.comment')) e.target.blur();
});

/* ---------- init: restore filters from the URL ---------- */

(async function init() {
  await loadFacets();
  const params = new URLSearchParams(location.search);
  for (const [k, v] of params) if (form.elements[k]) form.elements[k].value = v;
  state.page = +params.get('page') || 1;
  state.limit = +params.get('limit') || 50;
  $('#limit').value = String(state.limit);
  await loadUsers();
})().catch((err) => {
  tbody.innerHTML = `<tr><td colspan="12" class="empty">Failed to load: ${esc(err.message)}</td></tr>`;
});
