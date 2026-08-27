// Pulls North Texans Football Group's own schedule/results/standings/stats
// from our public D-Town 40+ League page on ClubVerse and writes them into
// the marked <!-- AUTO:...:START/END --> regions of index.html.
//
// ClubVerse renders match/standings data via a live Firestore listener, not
// in the initial HTML, so this needs a real browser (Playwright) rather than
// a plain HTTP fetch. Run with: node scripts/update-clubverse.mjs
//
// Fails loudly (non-zero exit) if the page structure doesn't match what we
// expect, rather than silently writing bad data — see assert() below.

import { chromium } from "playwright";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const INDEX_HTML = path.join(ROOT, "index.html");

const TOURNAMENT_URL = "https://clubverseapp.com/t/d-town-40-league-2026";
const TEAM_NAME = "North Texans Football Group";

const TEAM_DISPLAY = {
  "North Texans Football Group": "North Texans",
  "D-Town FC Blue": "D-Town FC Blue",
  "D-Town FC White": "D-Town FC White",
  "Euless United FC": "Euless United FC",
  "FortWorth Rising Star FC": "FortWorth Rising Star",
};

const TEAM_LOGO = {
  "North Texans Football Group": "images/icon-120.png",
  "D-Town FC Blue": "images/team-dtown.png",
  "D-Town FC White": "images/team-dtown.png",
  "Euless United FC": "images/team-euless.png",
  "FortWorth Rising Star FC": "images/team-fortworth.png",
};

function displayName(team) {
  if (TEAM_DISPLAY[team]) return TEAM_DISPLAY[team];
  return team.replace(/\s+FC$/, "");
}

function initials(team) {
  return team
    .split(/\s+/)
    .filter((w) => !/^(FC|the)$/i.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

function monoBadge(team) {
  const logo = TEAM_LOGO[team];
  if (logo) {
    return `<img src="${logo}" alt="" loading="lazy" decoding="async" />`;
  }
  return initials(team);
}

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`ClubVerse update aborted: ${message}`);
  }
}

// --- Text extraction -------------------------------------------------

async function getTournamentText(page) {
  // Not "networkidle": ClubVerse holds a long-polling Firestore connection
  // open indefinitely, so the network never actually goes idle.
  await page.goto(`${TOURNAMENT_URL}#matches`, { waitUntil: "domcontentloaded" });

  // Data loads via a live Firestore listener; wait for it to actually
  // populate rather than trusting networkidle alone.
  await page.waitForFunction(
    () => document.body.innerText.includes("MATCHES"),
    { timeout: 20000 }
  );

  const main = page.locator("main").first();

  // The fixture widget defaults to an "Upcoming" filter, which is also
  // where standings/player-stats/teams live (unaffected by the filter).
  const defaultText = await main.innerText();
  assert(defaultText.includes(TEAM_NAME), `expected team name "${TEAM_NAME}" not found on page`);

  // Completed results only appear after switching that filter — clicking
  // "Completed" specifically (rather than "All") has proven the more
  // reliable target in testing.
  let completedText = "";
  try {
    const completedTab = page.locator("button", { hasText: "Completed" }).first();
    await completedTab.scrollIntoViewIfNeeded({ timeout: 10000 });
    await completedTab.click({ timeout: 10000 });
    await page.waitForTimeout(1200);
    completedText = await main.innerText();
  } catch (err) {
    console.warn('Could not switch to the "Completed" fixtures filter — completed results will be skipped.', err.message);
  }

  return { defaultText, completedText };
}

function splitLines(text) {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

// --- Fixtures ----------------------------------------------------------

function parseFixtures(lines) {
  const fixtures = [];
  let currentDate = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const dateMatch = line.match(/^[A-Z]+,\s+([A-Z]{3})\s+(\d{1,2}),\s+(\d{4})$/);
    if (dateMatch) {
      currentDate = { month: dateMatch[1], day: Number(dateMatch[2]), year: Number(dateMatch[3]) };
      continue;
    }
    if (!currentDate) continue;

    // Completed: "FT" / TeamA / "12 - 3" / TeamB
    if (line === "FT" && lines[i + 1] && lines[i + 2] && lines[i + 3]) {
      const scoreMatch = lines[i + 2].match(/^(\d+)\s*-\s*(\d+)$/);
      if (scoreMatch) {
        fixtures.push({
          date: { ...currentDate },
          status: "completed",
          teamA: lines[i + 1],
          scoreA: Number(scoreMatch[1]),
          scoreB: Number(scoreMatch[2]),
          teamB: lines[i + 3],
        });
        i += 3;
        continue;
      }
    }

    // Upcoming: "7:00 AM" / TeamA / "vs" / TeamB
    const timeMatch = line.match(/^(\d{1,2}:\d{2}\s*(AM|PM))$/i);
    if (timeMatch && lines[i + 1] && lines[i + 2] === "vs" && lines[i + 3]) {
      fixtures.push({
        date: { ...currentDate },
        status: "upcoming",
        time: timeMatch[1].replace(/\s+/, " ").toUpperCase(),
        teamA: lines[i + 1],
        teamB: lines[i + 3],
      });
      i += 3;
      continue;
    }
  }

  return fixtures;
}

function fixtureDateValue(f) {
  const months = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
  return new Date(f.date.year, months[f.date.month], f.date.day).getTime();
}

function fixtureDateShort(f) {
  const month = f.date.month[0] + f.date.month.slice(1).toLowerCase();
  return `${month} ${f.date.day}`;
}

// --- Standings -----------------------------------------------------------

function parseStanding(lines, teamName) {
  const idx = lines.indexOf("Standings");
  assert(idx !== -1, '"Standings" section not found');
  // The header row keeps its cells tab-joined on one line by innerText
  // (e.g. "#\tTEAM\tPL\t...\tPTS"), so match by substring, not equality.
  const headerIdx = lines.findIndex((l, i) => i > idx && l.includes("PTS"));
  assert(headerIdx !== -1, "standings header row not found");

  for (let i = headerIdx + 1; i < lines.length - 1; i++) {
    if (lines[i] === "Knockout Bracket" || lines[i] === "Advances to knockout bracket") break;
    if (lines[i + 1] === teamName && /^\d+$/.test(lines[i])) {
      return Number(lines[i]);
    }
  }
  return null;
}

// --- Player stats --------------------------------------------------------

function parseStatSection(lines, sectionHeader, subHeader, stopHeaders) {
  const start = lines.indexOf(sectionHeader);
  if (start === -1) return [];
  const subIdx = lines[start + 1] === subHeader ? start + 1 : start;
  const results = [];

  for (let i = subIdx + 1; i < lines.length - 2; i++) {
    if (stopHeaders.includes(lines[i])) break;
    // pattern: INITIALS / Name / Team / Number
    if (/^[A-Z]{1,3}$/.test(lines[i]) && lines[i + 3] && /^\d+$/.test(lines[i + 3])) {
      results.push({ name: lines[i + 1], team: lines[i + 2], value: Number(lines[i + 3]) });
      i += 3;
    }
  }
  return results;
}

function parsePlayerStats(lines, teamName) {
  const scorers = parseStatSection(lines, "Top Scorers", "GOALS", ["Top Assists", "Most MVPs", "Teams"]);
  const assists = parseStatSection(lines, "Top Assists", "ASSISTS", ["Most MVPs", "Teams"]);
  const mvps = parseStatSection(lines, "Most MVPs", "MVPS", ["Teams"]);

  const byName = new Map();
  const ensure = (name) => {
    if (!byName.has(name)) byName.set(name, { name, goals: 0, assists: 0, mvps: 0 });
    return byName.get(name);
  };

  scorers.filter((s) => s.team === teamName).forEach((s) => (ensure(s.name).goals = s.value));
  assists.filter((s) => s.team === teamName).forEach((s) => (ensure(s.name).assists = s.value));
  mvps.filter((s) => s.team === teamName).forEach((s) => (ensure(s.name).mvps = s.value));

  return [...byName.values()].sort((a, b) => b.goals + b.assists + b.mvps - (a.goals + a.assists + a.mvps));
}

// --- HTML generation -------------------------------------------------

function renderTicker({ last, next }) {
  const items = [];
  if (last) {
    const won = last.us > last.them;
    const drew = last.us === last.them;
    const cls = won ? "win" : drew ? "draw" : "loss";
    const letter = won ? "W" : drew ? "D" : "L";
    items.push(
      `<span class="ticker-item ticker-last"><span class="ticker-badge ticker-badge--${cls}">${letter}</span> ${last.us}&ndash;${last.them} vs ${displayName(last.opponent)}</span>`
    );
  }
  if (next) {
    items.push(
      `<span class="ticker-item ticker-next"><strong>Next:</strong>&nbsp;vs ${displayName(next.opponent)} &middot; ${fixtureDateShort(next.fixture)}, ${next.time}</span>`
    );
  }
  if (items.length === 2) {
    return `<div class="topbar-ticker">\n          ${items[0]}\n          <span class="ticker-sep" aria-hidden="true">&middot;</span>\n          ${items[1]}\n        </div>`;
  }
  return `<div class="topbar-ticker">\n          ${items.join("\n          ")}\n        </div>`;
}

function renderMatches({ last, next }) {
  const won = last && last.us > last.them;
  const drew = last && last.us === last.them;
  const badgeCls = won ? "win" : drew ? "draw" : "loss";
  const badgeLabel = won ? "Win" : drew ? "Draw" : "Loss";
  const scoreCls = won ? "" : drew ? " match-score--draw" : " match-score--loss";

  const resultCard = last
    ? `<div class="match-card match-card--result reveal">
            <span class="match-badge match-badge--${badgeCls}">${badgeLabel}</span>
            <div class="match-side">
              <span class="match-mono">${monoBadge(TEAM_NAME)}</span>
              <span>${displayName(TEAM_NAME)}</span>
            </div>
            <div class="match-mid">
              <span class="match-status">${fixtureDateShort(last.fixture)} &middot; Full Time</span>
              <span class="match-score${scoreCls}">${last.us}&ndash;${last.them}</span>
            </div>
            <div class="match-side">
              <span class="match-mono">${monoBadge(last.opponent)}</span>
              <span>${displayName(last.opponent)}</span>
            </div>
          </div>`
    : "";

  const nextCard = next
    ? `<div class="match-card reveal">
            <div class="match-side">
              <span class="match-mono">${monoBadge(TEAM_NAME)}</span>
              <span>${displayName(TEAM_NAME)}</span>
            </div>
            <div class="match-mid">
              <span class="match-status">Next &middot; ${fixtureDateShort(next.fixture)}, ${next.time}</span>
              <span class="match-vs">VS</span>
            </div>
            <div class="match-side">
              <span class="match-mono">${monoBadge(next.opponent)}</span>
              <span>${displayName(next.opponent)}</span>
            </div>
          </div>`
    : "";

  return `<div class="schedule-grid">\n          ${resultCard}\n\n          ${nextCard}\n        </div>`;
}

function renderFixtureList(remaining) {
  if (!remaining.length) {
    return `<ul class="fixture-list reveal">\n        </ul>`;
  }
  const items = remaining
    .map(
      (f) => `          <li>
            <span class="fixture-date">${fixtureDateShort(f.fixture)}</span>
            <span class="fixture-teams">${displayName(f.opponent)} <em>vs</em> ${displayName(TEAM_NAME)}</span>
            <span class="fixture-time">${f.time}</span>
          </li>`
    )
    .join("\n");
  return `<ul class="fixture-list reveal">\n${items}\n        </ul>`;
}

function renderStatsBody(stats) {
  if (!stats.length) {
    return `<tbody>\n              <tr><td colspan="4">No stats recorded yet this season.</td></tr>\n            </tbody>`;
  }
  const rows = stats
    .map(
      (s) => `              <tr>
                <td>${s.name}</td>
                <td>${s.goals}</td>
                <td>${s.assists}</td>
                <td>${s.mvps}</td>
              </tr>`
    )
    .join("\n");
  return `<tbody>\n${rows}\n            </tbody>`;
}

function replaceMarked(html, marker, replacement) {
  const re = new RegExp(`(<!-- AUTO:${marker}:START -->)([\\s\\S]*?)(<!-- AUTO:${marker}:END -->)`);
  assert(re.test(html), `marker AUTO:${marker} not found in index.html`);
  return html.replace(re, `$1\n        ${replacement}\n        $3`);
}

// --- Main ------------------------------------------------------------

async function main() {
  const browser = await chromium.launch();
  // ClubVerse renders match times client-side from a stored UTC instant
  // using the browser's local timezone. Pin it to Central time so scraped
  // times match what fans see, regardless of the CI runner's OS timezone
  // (GitHub Actions runners default to UTC, which shifted times by +5h).
  const context = await browser.newContext({ timezoneId: "America/Chicago" });
  const page = await context.newPage();
  let defaultText, completedText;
  try {
    ({ defaultText, completedText } = await getTournamentText(page));
  } finally {
    await browser.close();
  }

  const lines = splitLines(defaultText);
  const allFixtures = [...parseFixtures(lines), ...(completedText ? parseFixtures(splitLines(completedText)) : [])];
  assert(allFixtures.length > 0, "no fixtures parsed from the page");

  const ourFixtures = allFixtures
    .filter((f) => f.teamA === TEAM_NAME || f.teamB === TEAM_NAME)
    .map((f) => {
      const weAreA = f.teamA === TEAM_NAME;
      const opponent = weAreA ? f.teamB : f.teamA;
      if (f.status === "completed") {
        return {
          status: "completed",
          fixture: f,
          opponent,
          us: weAreA ? f.scoreA : f.scoreB,
          them: weAreA ? f.scoreB : f.scoreA,
        };
      }
      return { status: "upcoming", fixture: f, opponent, time: f.time };
    });

  assert(ourFixtures.length > 0, `no fixtures found for "${TEAM_NAME}"`);

  const completed = ourFixtures.filter((f) => f.status === "completed").sort((a, b) => fixtureDateValue(a.fixture) - fixtureDateValue(b.fixture));
  const upcoming = ourFixtures.filter((f) => f.status === "upcoming").sort((a, b) => fixtureDateValue(a.fixture) - fixtureDateValue(b.fixture));

  const last = completed.length ? completed[completed.length - 1] : null;
  const next = upcoming.length ? upcoming[0] : null;
  const remainingUpcoming = upcoming.slice(1);

  const standingRank = parseStanding(lines, TEAM_NAME);
  const standingText = standingRank ? `${ordinal(standingRank)} in the group` : "in the group";

  const stats = parsePlayerStats(lines, TEAM_NAME);

  let html = await readFile(INDEX_HTML, "utf8");
  html = replaceMarked(html, "TICKER", renderTicker({ last, next }));
  html = replaceMarked(html, "STANDING", standingText);
  html = replaceMarked(html, "MATCHES", renderMatches({ last, next }));
  html = replaceMarked(html, "FIXTURES", renderFixtureList(remainingUpcoming));
  html = replaceMarked(html, "STATS", renderStatsBody(stats));

  await writeFile(INDEX_HTML, html, "utf8");

  console.log("ClubVerse update applied:");
  console.log("  Last:", last ? `${last.us}-${last.them} vs ${last.opponent}` : "(none)");
  console.log("  Next:", next ? `vs ${next.opponent} (${next.time})` : "(none)");
  console.log("  Standing:", standingText);
  console.log("  Stats rows:", stats.length);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
