# Simple Recall

An [Obsidian](https://obsidian.md) plugin for lightweight active recall and spaced repetition — no decks, no cards, no separate UI. Just pick a folder of notes and review them on your own terms.

## How it works

1. Configure one or more **target folders** in your vault (Settings → Simple Recall).
2. The plugin scans those folders, reads frontmatter metadata, and builds a **tracking CSV** (`simple-recall.csv`) inside your vault.
3. Each day, run **"Start daily review"** — the algorithm picks N notes (default 3) from across three time buckets:
   - **Recent** — notes you reviewed recently. Surface the weakest ones first.
   - **Medium** — notes about to drift into the "old" bucket.
   - **Old** — notes you haven't seen in a while. Most overdue + hardest + never-reviewed get priority.
4. Click **Go** on any note → it opens in a new tab. Read it, think about it, then run **"Mark as reviewed"**.
5. Rate your recall on a 1–5 scale (Forgot → Knew it cold). The plugin updates tracking and appends a row to the **history CSV** (`simple-recall-history.csv`).
6. Repeat until the session is complete.

## Features

- **Ribbon icon** + **4 commands** — start review, mark reviewed, rescan folders, show history.
- **Smart 3-bucket algorithm** — random jitter (`±3`) for variety; per-bucket scoring that prioritises weak, overdue, and new notes.
- **Per-note refresh** (↻) — swap a note for another from the same bucket.
- **Refresh all** — re-run the algorithm, keeping already-reviewed notes.
- **Status bar counter** — shows `★ 1/3 reviewed` while a session is active.
- **Review history** (`simple-recall-history.csv`) — append-only log viewable in the left sidebar, grouped by Today / Past 7d / Past 30d / Older. Click any title to open the note.
- **Auto-scan on startup** — detects new, deleted, and renamed notes automatically.
- **File watchers** — vault `create`/`delete`/`rename` events stay in sync with the tracking CSV without manual rescans.

## Commands

| Command | What it does |
|---|---|
| `Start daily review` | Scan tracking CSV, pick notes, show selection modal |
| `Mark as reviewed` | Rate the currently open note (1–5) and log it |
| `Rescan folders` | Force re-sync target folders with the tracking CSV |
| `Show review history` | Open the history sidebar view |

## Settings

| Setting | Default | Description |
|---|---|---|
| Target folders | `Notes/` | One or more folders to scan for notes |
| Notes per session | 3 | How many notes to pick each session (1–10) |
| Include subfolders | On | Also scan subdirectories of target folders |
| Tracking CSV path | `simple-recall.csv` | Path to the tracking CSV in your vault |
| History CSV path | `simple-recall-history.csv` | Path to the review history CSV |
| Auto-scan on startup | On | Automatically scan target folders when Obsidian starts |

## Frontmatter fields used

| Field | Fallback |
|---|---|
| `title` | File basename |
| `tags` | — (semicolon/comma-separated) |
| `type` / `note_type` | `''` |
| `created` / `created_at` | File `ctime` |

## Data storage

Everything stays in your vault as plain-text CSV files — no external databases, no cloud dependency. You can version-control them alongside your notes.

**Tracking CSV** (`path,title,tags,note_type,created_at,last_reviewed,total_reviews,understanding_rating,days_since_review`)

Read-write, updated on every review and every rescan.

**History CSV** (`date,path,title,rating,days_since_review,total_reviews`)

Append-only. Used by the sidebar history view.

## Installation
1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/loic/obsidian-simple-recall/releases).
2. Copy them to `VaultFolder/.obsidian/plugins/obsidian-simple-recall/`.
3. Enable the plugin in Obsidian Settings → Community plugins.

## Development

```bash
npm install
npm run dev      # watch mode
npm run build    # tsc check + production bundle
npm run lint     # eslint (v9, flat config)
```

- Built with [esbuild](https://esbuild.github.io/) (CJS output, inline sourcemaps).
- Min Obsidian version: `1.5.7`.
- Release tag format: `1.0.1` (no leading `v`). CI builds `main.js` and attaches it to the release draft.

## License

MIT
