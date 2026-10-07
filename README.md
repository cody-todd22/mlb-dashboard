# Baseball Dashboard

A broadcast-style MLB stats dashboard that reads live from the public MLB Stats API (`statsapi.mlb.com`). No build step, no API key, no server code. It's plain HTML, CSS and JavaScript.

It also has a **College mode** for NCAA Division I baseball. Switch it on under Settings → League. See [College mode](#college-mode) below.

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
| Featured boards (F1, F2) and boards (B1–B6) | Any of the 93 player leaderboards the API ranks, plus 28 sabermetrics listed under their own **Sabermetrics** header in the picker: WAR, RAR, wOBA, wRC+, wRC, wRAA, batting, baserunning (BsR, UBR, wSB, wGDP), Spd, fielding, positional and replacement runs for position players; WAR, RA9-WAR, RAR, FIP, xFIP, FIP−, ERA−, shutdowns, meltdowns and leverage (pLI, inLI, gmLI, exLI) for pitchers. Lower-is-better stats (FIP, xFIP, FIP−, ERA−) rank lowest first. Each bar shows a player's share of the #1 value, with a slanted end that meets the value block. On team pages, all players are listed by default and rate stats mark anyone not yet qualified with an asterisk (3.1 plate appearances or 1 inning per team game). |
| All-clubs chart (C) | Any club stat for all 30 clubs, drawn as distance from the MLB average so "up" always means better. |
| Coming up (U) | The next six games, or the selected team's next games. |

Every block switches to the selected team, and the club colors restyle the page.

## Settings

Settings open from the **Settings** button. They're saved in the browser's `localStorage`.

- **League:** MLB or College (D1). Display settings (theme, layout, ticker, refresh, leaders per board) are shared by both boards. Each board keeps its own block choices and default view. Adding `?league=college` or `?league=mlb` to the address opens that board regardless of the saved setting, which is handy for a TV.

- **Theme:** Auto (follows the device), Light, Dark.
- **Layout:** Standard or **TV**. TV mode fits a 16:9 screen with no scrolling and uses larger type. It rotates the leader boards and charts on a timer, hides the cursor when the mouse is idle, and asks the browser to keep the screen awake. Move the mouse or press Tab to bring up Full screen, Settings and Exit TV mode.
- **Ticker** on/off and speed.
- **Default team:** the team the board opens on.
- **Stats from:** regular season or postseason.
- **Player pool:** qualified, all players, or rookies, set separately for the MLB page (default qualified) and team pages (default all players).
- **Leaders per board:** 3, 5 or 10.
- **Auto-refresh.** While a game is live, scores refresh every minute. With no game live, the board sleeps until about a minute before the next scheduled first pitch. Standings, club stats, leaders and charts reload once a day at 5 AM local time.
- **Blocks:** choose the stat or metric for every block, or hide it.

## College mode

College mode covers NCAA Division I baseball: all 304 D1 programs in 31 conferences (30 conferences plus independents). It has the same layout, ticker, charts, dark mode and TV mode as the MLB board, with three levels of navigation:

1. **All D1.** The standings block shows the D1Baseball.com Top 25. Leaders are the NCAA's national leaders. The clubs chart compares the Top 25.
2. **A conference.** Pick it from the **Conference** menu. You get conference standings, the conference's leaders and a chart of every club in the conference.
3. **A team.** Pick it from the **Team** menu that appears next to the conference. Everything switches to that team, and the board takes on the school's colors.

| Block | College version |
|---|---|
| Header tiles | Overall record, conference record, run differential, streak, last 10, home and road records, plus any of the NCAA's 30 team stat lists. A team's tile shows its D1 rank (for example "12th of 304 in D1"). |
| Ticker | Labeled **D1**, the conference abbreviation, or the team abbreviation. It shows live scores, today's games and recent finals. On the All D1 page, regular-season games involving ranked teams come first. Poll ranks appear in front of team abbreviations. In June the ticker follows the NCAA Tournament: Regionals, Super Regionals (best of three, with series pips), the College World Series and the CWS Finals. |
| Feature chart | **Race to Omaha:** games above .500, winning percentage, conference games back, conference standing over time, and month-by-month record. These are charted week by week. **Team trends:** runs scored vs. allowed, season in one picture, rolling 10-game form, home vs. road, and one-run games. |
| Standings | The Top 25 on the All D1 page. Otherwise the conference table, with conference and overall records. |
| Leader boards | Any of the NCAA's 39 individual stat lists. By default the boards show per-game rates: HR/G, K/9, BA, RBI/G, R/G, SB/G, ERA and WHIP. |
| Clubs chart | The Top 25, or every club in the conference, compared with the group's average. |

### Data: the NCAA API through a small relay

College data comes from the free [NCAA API](https://github.com/henrygd/ncaa-api), an open-source wrapper around ncaa.com. These are the endpoints the board uses:

| Data | Endpoint |
|---|---|
| Scores and schedule for a day | `GET /scoreboard/baseball/d1/YYYY/MM/DD` |
| Top 25 | `GET /rankings/baseball/d1` (D1Baseball.com) |
| Player stat lists | `GET /stats/baseball/d1/current/individual/{id}?page=N` |
| Team stat lists, including W-L (`319`) | `GET /stats/baseball/d1/current/team/{id}?page=N` |

**Browsers won't let a hosted page call the NCAA API directly.** The API sends no CORS headers, so a board served from your own site needs a relay. `worker/ncaa-relay.js` is a ready-made Cloudflare Worker, and the free plan is plenty. It adds the headers and caches responses: finished days for a week, recent scores for 45 seconds, stats and the poll for 30 minutes.

1. In the Cloudflare dashboard, go to **Workers & Pages → Create → Create Worker**.
2. Replace the starter code with the contents of `worker/ncaa-relay.js` and select **Deploy**.
3. Copy the worker's address, such as `https://ncaa-relay.yourname.workers.dev`.
4. On the board, open **Settings → Data → NCAA data address**, paste the address, and press Enter.

The relay has optional variables:
- `UPSTREAM` points the relay at your own copy of the NCAA API, which removes the public instance's limit of 5 requests a second. To run one: `docker run -p 3000:3000 henrygd/ncaa-api`.
- `NCAA_KEY` is sent as the `x-ncaa-key` header, for when your copy sets `NCAA_HEADER_KEY`.
- `ALLOWED_ORIGINS` limits the relay to your board's address.

If the board can't reach the address, it falls back to the saved snapshot, and Settings shows the error.

### How records are worked out

The NCAA API has no standings and no team schedules. The board handles this as follows:

- **Overall records** come from the NCAA's official W-L list (team stat 319).
- **Everything else** comes from the season's scoreboards. That covers conference records, streaks, last 10, home and road records, and every chart. On the first visit the board downloads every scoreboard of the season, about 130 days, and a progress line shows how far it has got. The results are kept on the device in `localStorage`, about 450 KB. After that the board only fetches days that may still change. **Settings → Season results → Download again** starts over.
- **A conference game** is a game between two clubs in the same conference that met more than once within three days, as a series or a doubleheader. This leaves out non-conference meetings and most conference-tournament games, which the scoreboard doesn't label. A conference that plays single-game conference matchups will be undercounted.
- **Conference membership** follows the NCAA's current affiliation, so schools that realign over the summer appear in their new conference.
- **Run differential** is runs scored (team stat 213) minus runs allowed (team stat 211).
- **Duplicate games:** the scoreboard sometimes lists a postseason game twice under two ids, a day apart. Same clubs and same score within two days count once.

### Limits worth knowing

- **Qualified players only:** the NCAA's stat lists include only qualified players, and only the national top 150 to 250 in each stat. Conference and team boards show players from those lists, so a team board can be short or empty for some stats. The board says so when that happens.
- **One poll:** the D1Baseball.com Top 25 is the only poll the API returns. Its "previous rank" column drives the Move column.
- **No probable pitchers or venues:** these aren't on the NCAA scoreboard.
- **Season dates:** the season runs from mid-February through the CWS Finals in late June. From July until the next Opening Day, the board shows the final numbers from the season just finished.
- **Colors:** school colors come from teamcolorcodes.com and are approximations. Header colors are darkened where needed so white text stays readable. For schools whose main color is light, such as Carolina blue or gold, the darker school color fills the header and the light color becomes the accent. No logos are included, because they're trademarks of the schools.

### College snapshot

`js/college/snapshot.js` holds the final 2026 season: overall records, the final Top 25, the default player and team stat lists, and every NCAA Tournament game. Full regular-season results were too large to bundle. In the snapshot, conference records and the feature charts therefore show **Available with live data**.

## Endpoints used (MLB)

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
- **Sabermetrics aren't leaderboard categories.** They come from `GET /api/v1/stats?stats=sabermetrics&group=hitting|pitching&season=&sportId=1&playerPool=&limit=2000&gameType=[&teamId=]`, which returns every metric for every player in one response. The board fetches each list once (per group, player pool, team and game type), keeps it until the 5 AM reload, and ranks it itself, because the server's ascending sort is unreliable and `teamId` results aren't fully sorted. Rate stats (wOBA, wRC+, Spd, FIP, xFIP, FIP−, ERA−, the leverage indexes) follow the player-pool setting and get the not-yet-qualified asterisk on team pages. Counting stats (WAR, RAR, runs above average, shutdowns, meltdowns) rank every player. Position-player and pitcher WAR are separate figures, so two-way players appear on each list with that part only. `wLeague`, the league's wOBA constant, is the same for every player, so it isn't offered.
- Statcast stats such as exit velocity aren't in the MLB Stats API. Adding them would need another source, such as Baseball Savant CSV exports.

## Offline snapshot (MLB)

If the API can't be reached, the board loads `js/snapshot.js`, real data saved on Oct 6, 2026. This happens when a sandbox blocks network calls or the device is offline. The header shows a **Snapshot** label so it's never mistaken for live data. The snapshot covers standings, the race chart, club stats, the schedule, about 30 league leaderboards (including position-player and pitcher WAR), and the default leaderboards for the Dodgers, Cardinals, Padres and White Sox. Anything else shows **Available with live data**. On the live board, a block that comes back empty says **No data came back** instead, so a broken request or API change is easy to spot. In snapshot mode only, Settings has a **Sample live games** switch that adds two made-up in-progress scores so you can see the live ticker state.

## Files

```
index.html               page shell
css/app.css              theme tokens (light and dark), components, TV layout
js/config.js             30 clubs with colors and divisions, the stat catalog, club metrics, default settings
js/api.js                MLB Stats API calls and normalization
js/charts.js             line charts, game bars, clubs chart, leader bar scaling (shared)
js/snapshot.js           MLB offline fallback data
js/app.js                MLB board: state, rendering, ticker, settings, TV mode, league switch
js/college/config.js     304 D1 schools and 31 conferences with colors, NCAA stat ids, metrics, defaults
js/college/api.js        NCAA API calls, request pacing, season download and on-device cache, records
js/college/snapshot.js   College offline fallback data (final 2026 season)
js/college/app.js        College board
worker/ncaa-relay.js     Cloudflare Worker relay for the NCAA API
```

Club colors are approximations of each team's primary and secondary colors. A few header shades are deepened so white text stays readable. No team logos are included; they're trademarks of the clubs.

MLB data is © MLB Advanced Media and subject to its terms of use, which allow individual, non-commercial use of the Stats API. Check those terms before using this commercially.
