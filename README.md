# CrowdWorks user scraper

Walks a CrowdWorks member search (`/public/employees?...&page=N`), opens each user's
profile page, translates the fixed fields (prefecture, gender, age, occupations,
categories, …) to English, and saves everything to MongoDB. A small web viewer lets
you search, browse and comment on what's been saved.

All data lives in MongoDB — nothing is written to local files.

## Setup

```
npm install
copy .env.example .env      # set MONGODB_URI (required) and MONGODB_DB
```

## Scrape

```
npm start -- "https://crowdworks.jp/public/employees?category=employees&keywords=%40gmail.com&page=1"
```

Each user is saved as soon as it's scraped, keyed by CrowdWorks ID. Users already
in the database are always skipped (their profile page isn't fetched again), so
re-running a search only adds new users and leaves saved records and comments
untouched.

## Browse

```
npm run server              # http://localhost:3000
```

- Search and filter (email / comment / gender / age / prefecture / occupation / keyword), sort
- Eye icon opens the full profile; the ID opens the CrowdWorks page
- Copy buttons for name and email, a comment box on every row
- Export the filtered list as CSV

Restart the server after pulling new code.

## Other commands

| Command | What it does |
|---|---|
| `npm run translate-db` | Re-translate every saved user (after adding terms to `src/dictionary.js`) |
| `npm run import -- file.jsonl` | Load a JSONL backup into MongoDB |
| `npm run sample` | Parse the saved `list.md` / `one user.md` and print the result (no DB) |

Japanese terms with no translation yet are kept as-is and collected in the
`untranslated_terms` collection. Add them to `src/dictionary.js` and run
`npm run translate-db`.

## MongoDB collections

| Collection | Contents |
|---|---|
| `users` | One document per user, `_id` = CrowdWorks ID |
| `untranslated_terms` | Japanese terms missing from the dictionary, with counts |

## Settings (.env)

| Name | Default | |
|---|---|---|
| `MONGODB_URI` | — | **required** |
| `MONGODB_DB` | `crowdworks` | |
| `DELAY_MS` | `2000` | wait between list pages |
| `DETAIL_DELAY_MS` | `1500` | wait between profile pages |
| `MAX_PAGES` | `0` | 0 = until no more results |
| `START_PAGE` | `1` | |
| `PORT` | `3000` | viewer port |
