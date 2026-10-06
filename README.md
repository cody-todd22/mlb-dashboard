# Baseball Dashboard

A broadcast-style MLB stats dashboard that reads live from the public MLB Stats API (`statsapi.mlb.com`). No build step, no API key, no server code. It's plain HTML, CSS and JavaScript.

## Run it

Any static host works: GitHub Pages, Netlify, Vercel, Cloudflare Pages, S3, or a Raspberry Pi behind a TV.

```bash
# from this folder
python3 -m http.server 8080
# then open http://localhost:8080
```

Opening `index.html` straight from disk also works in most browsers. The MLB Stats API allows cross-origin requests.

`preview.html` is the same app without the `<html>`/`<head>` wrapper, used for the hosted preview. You don't need it for your own deployment.

## What's on the board

| Block | What it shows |
|---|---|
| Header tiles (T1–T4) | Any club stat. With **All MLB** selected, each tile shows the league's best club and its value. With a team selected, it shows that team's value and its rank out of 30. |
| Ticker | Labeled **MLB**, or the selected team's abbreviation. Scrolls through live scores, upcoming games, postseason series standings, undecided next-round matchups ("NLCS LAD/ATL vs MIL/SD") and finals. On the MLB page, regular-season finals are today's and yesterday's. On a team page: that team's games today plus its last 7 results, then today's games around the league. In the postseason, every series' most recent game and upcoming games show on every page. Hover or press pause to stop it. |
| Feature chart (R) | One of 18 views, grouped in the picker: **Race to October** (games above .500, winning percentage, games back in the division, wild-card race, division standing over time, month-by-month record), **Stat races** (a leader race for any counting stat, a title race for a rate stat), **Team trends** (runs scored vs. allowed, team OPS and ERA by month, home run race), **Form and game-by-game** (every game as a bar, rolling 10-game form, home vs. road, one-run games) and **Team players** (top hitters' OPS and rotation ERA, team pages only). |
| Standings (S) | Best records, or the selected team's division. |
| Featured boards (F1, F2) and boards (B1–B6) | Any of the 93 player leaderboards the API ranks. Each bar shows a player's share of the #1 value, with a slanted end that meets the value block. On team pages, all players are listed by default and rate stats mark anyone not yet qualified with an asterisk (3.1 plate appearances or 1 inning per team game). |
| All-clubs chart (C) | Any club stat for all 30 clubs, drawn as distance from the MLB average so "up" always means better. |
| Coming up (U) | The next six games, or the selected team's next games. |

Every block switches to the selected team, and the club colors restyle the page.

## Settings

Settings open from the **Settings** button. They're saved in the browser's `localStorage`.

- **Theme:** Auto (follows the device), Light, Dark.
- **Layout:** Standard or **TV**. TV mode fits a 16:9 screen with no scrolling and uses larger type. It rotates the leader boards and charts on a timer, hides the cursor when the mouse is idle, and asks the browser to keep the screen awake. Move the mouse or press Tab to bring up Full screen, Settings and Exit TV mode.
- **Ticker** on/off and speed.
- **Default team:** the team the board opens on.
- **Stats from:** regular season or postseason.
- **Player pool:** qualified, all players, or rookies, set separately for the MLB page (default qualified) and team pages (default all players).
- **Leaders per board:** 3, 5 or 10.
- **Auto-refresh.** While a game is live, scores refresh every minute. With no game live, the board sleeps until about a minute before the next scheduled first pitch. Standings, club stats, leaders and charts reload once a day at 5 AM local time.
- **Blocks:** choose the stat or metric for every block, or hide it.

## Endpoints used

| Data | Endpoint |
|---|---|
| Season calendar | `GET /api/v1/seasons/{year}?sportId=1` |
| Standings, plus month-end standings for the race chart | `GET /api/v1/standings?leagueId=103,104&season=&standingsTypes=regularSeason[&date=YYYY-MM-DD]` |
| Club stats | `GET /api/v1/teams/stats?season=&sportId=1&group=hitting\|pitching\|fielding&stats=season&gameType=R\|P` |
| Leaderboards | `GET /api/v1/stats/leaders?leaderCategories=&statGroup=&season=&sportId=1&limit=&leaderGameTypes=&playerPool=[&teamId=]` |
| Schedule, scores, series status, TV, probable pitchers | `GET /api/v1/schedule?sportId=1&startDate=&endDate=&hydrate=team,linescore,probablePitcher,broadcasts(all),seriesStatus` (add `teamId=` for a team's last 7 results) |
| Every final this season (game-by-game charts) | `GET /api/v1/schedule?sportId=1&gameType=R&season=&startDate=&endDate=&fields=…` |
| Club stats month by month | `GET /api/v1/teams/stats?stats=byDateRange&startDate=&endDate=&group=hitting\|pitching&season=&sportId=1` (one call per month) |
| Team rosters (qualification, top hitters, rotation) | `GET /api/v1/stats?stats=season&group=&teamId=&season=&playerPool=ALL&limit=200` |
| A player's stats by month (stat races) | `GET /api/v1/people/{id}/stats?stats=byMonth&group=&season=&gameType=R` |

Notes from building against the API:

- **Request one leaderboard category per call.** When a single request mixes categories from different stat groups, the endpoint silently returns its default categories, or nothing.
- **Always pass `leaderGameTypes`.** Without it, some pitching boards blend in other game types.
- **`/teams/stats?stats=byMonth` returns a server error**, for one club or all of them. Monthly club numbers come from one `byDateRange` request per month instead.
- Undecided playoff matchups come back as placeholder clubs ("NL Higher Seed", ids 5513–5525). The board maps them to the bracket from the series feeding that round.
- Advanced stats such as WAR, wOBA and Statcast exit velocity aren't in the MLB Stats API leaderboards. Adding them would need another source, such as Baseball Savant CSV exports.

## Offline snapshot

If the API can't be reached, the board loads `js/snapshot.js`, real data saved on Oct 6, 2026. This happens when a sandbox blocks network calls or the device is offline. The header shows a **Snapshot** label so it's never mistaken for live data. The snapshot covers standings, the race chart, club stats, the schedule, about 30 league leaderboards, and the default leaderboards for the Dodgers, Cardinals, Padres and White Sox. Anything else shows **Available with live data**. On the live board, a block that comes back empty says **No data came back** instead, so a broken request or API change is easy to spot. In snapshot mode only, Settings has a **Sample live games** switch that adds two made-up in-progress scores so you can see the live ticker state.

## Files

```
index.html        page shell
css/app.css       theme tokens (light and dark), components, TV layout
js/config.js      30 clubs with colors and divisions, the stat catalog, club metrics, default settings
js/api.js         MLB Stats API calls and normalization
js/charts.js      race line chart, all-clubs chart, leader bar scaling
js/snapshot.js    offline fallback data
js/app.js         state, rendering, ticker, settings, TV mode
```

Club colors are approximations of each team's primary and secondary colors. A few header shades are deepened so white text stays readable. No team logos are included; they're trademarks of the clubs.

MLB data is © MLB Advanced Media and subject to its terms of use, which allow individual, non-commercial use of the Stats API. Check those terms before using this commercially.
