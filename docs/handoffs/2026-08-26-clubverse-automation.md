# ClubVerse Automation Handoff — 2026-08-26

The site now updates itself. Every Sunday at 1pm Central, a script pulls the club's schedule, results, and standings
straight from ClubVerse and rewrites the relevant parts of the site — no one has to touch anything.

This note covers what's live, a timezone bug that was caught and fixed before it could recur, two features added on
top, and what's still manual.

Commits: `bb6e586`, `40607aa` on `main`.

## 1. How the sync works

A GitHub Actions workflow (`.github/workflows/update-clubverse.yml`) runs on a cron schedule every Sunday. It
launches a headless browser against the club's public [D-Town 40+ League page](https://clubverseapp.com/t/d-town-40-league-2026)
on ClubVerse, reads the live match data, and rewrites five marked regions of `index.html`: the topbar ticker, the
league standing line, the last-result/next-match cards, the league standings table, and the player stats table.

1. **Scrape** — Playwright opens ClubVerse's fixtures tab and reads the rendered text. The data loads live via
   Firestore, so a plain HTTP fetch wouldn't see it.
2. **Parse** — `scripts/update-clubverse.mjs` turns that text into structured fixtures, standings, and stats for
   North Texans specifically.
3. **Rewrite** — the five `<!-- AUTO:...:START/END -->` comment markers in `index.html` get replaced in place.
   Everything outside them (hand-written copy, layout, imagery) is left alone.
4. **Commit, only if something changed** — if the rewritten file is byte-identical to what's already live, nothing
   is committed. A quiet week produces zero noise in the repo's history.
5. **Fail loudly, not silently** — if ClubVerse's page structure doesn't match what the script expects, it aborts
   without touching the site and opens a GitHub Issue with a link to the failed run. The live site simply stays on
   last week's data until someone looks.

## 2. Bug caught: kickoff times were off by 5 hours

The first live run wrote **12:00 PM** for a match ClubVerse actually lists at **7:00 AM**. Before trusting the
automation, this was checked directly against the live ClubVerse page rather than assumed — and it was a real bug,
not a schedule change.

- **Root cause** — ClubVerse renders kickoff times client-side from a stored UTC instant, using whatever timezone
  the browser is in. GitHub's runners default to UTC, so times came out shifted by exactly the CDT-to-UTC offset —
  5 hours.
- **Fix** — the scraper's browser context is now pinned to `America/Chicago`, so scraped times always match what a
  fan sees on ClubVerse, regardless of where the job happens to run.

## 3. Two features added

**Rotating topbar ticker** (`js/main.js`) — the red ticker at the very top of the site used to show the last result
and next match side-by-side on desktop, but only "Next" on mobile — the result was getting silently dropped on
phones. It now shows one at a time and flips between the last result and the next match every 20 seconds, on every
screen size.

**League standings table** (Schedule section) — the short "remaining fixtures" list under the schedule cards has
been replaced with a full 5-team league table (PL, W, D, L, GF, GA, GD, Pts), with North Texans' row highlighted.
It's rebuilt automatically by the same Sunday sync.

## 4. Running it by hand

The Sunday schedule is fully automatic, but it can also be triggered on demand — useful right after a match if you
don't want to wait for the weekly run.

```sh
gh workflow run update-clubverse.yml
gh run watch $(gh run list --workflow=update-clubverse.yml -L1 --json databaseId -q '.[0].databaseId') --exit-status
```

Or from GitHub's UI: **Actions → Update ClubVerse schedule data → Run workflow**.

Locally, the same script runs with `npm run update-clubverse` (writes straight into `index.html` — review the diff
before committing).

## 5. Key files

| File | What it's for |
|---|---|
| `.github/workflows/update-clubverse.yml` | The Sunday 1pm CDT cron job, plus the failure-issue step. |
| `scripts/update-clubverse.mjs` | The scraper/parser/renderer — the only place ClubVerse-specific logic lives. |
| `index.html` | Source of truth for the page. Five `AUTO:*` marker blocks are machine-written; everything else is hand-authored. |
| `css/styles.css` / `js/main.js` | Styling and the ticker rotation timer. |

## 6. Still manual / open items

Carried over from earlier work, not touched by this automation:

- **Solar's sponsor logo** — still a text placeholder ("$OLAR"), needs a real logo image supplied.
- **Social media links** — Facebook/Instagram/X/TikTok icons in the footer and topbar all point to `#` until real
  handles are provided.
- **Leadership / founders section** — not yet built; flagged earlier as a possible addition.

A fuller-context, formatted version of this note is also published as a private artifact:
https://claude.ai/code/artifact/bf87a82c-5432-455b-be6c-e9894622f10c
