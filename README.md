# CrowdWorks user scraper

Walks a CrowdWorks member search (`/public/employees?...&page=N`), opens each user's
profile page, and saves the combined data to MongoDB (and optionally CSV/JSONL).
A small web viewer lets you search and browse what's been saved.

## Setup

```
npm install
copy .env.example .env      # set MONGODB_URI if MongoDB isn't on localhost:27017
```

## Scrape

```
npm start -- "https://crowdworks.jp/public/employees?category=employees&keywords=%40gmail.com&page=1"
```

Users are upserted by CrowdWorks ID, so running again updates existing records
instead of duplicating them.

## Browse

```
npm run server              # http://localhost:3000
```

Search, filter (email / gender / age / prefecture / occupation / keyword), sort,
click a row for the full profile, and export the filtered list as CSV.

## Other commands

| Command | What it does |
|---|---|
| `npm run import -- file.jsonl` | Load a saved JSONL file into MongoDB |
| `npm run sample` | Parse the saved `list.md` / `one user.md` offline into `output/sample.*` |

## Settings (.env)

| Name | Default | |
|---|---|---|
| `MONGODB_URI` | `mongodb://127.0.0.1:27017` | |
| `MONGODB_DB` | `crowdworks` | collection is `users` |
| `SAVE_FILES` | `true` | also write CSV/JSONL to `OUTPUT_DIR` |
| `DELAY_MS` | `2000` | wait between list pages |
| `DETAIL_DELAY_MS` | `1500` | wait between profile pages |
| `MAX_PAGES` | `0` | 0 = until no more results |
| `START_PAGE` | `1` | |
| `PORT` | `3000` | viewer port |
