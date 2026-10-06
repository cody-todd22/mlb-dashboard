# MLB Dashboard

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
| Header tiles (T1–T4) | Any club stat. With **All MLB** selected, each tile shows the league's best club. With a team selected, it shows that team's value and its rank out of 30. |
| Ticker | Scrolls through live scores, upcoming games, postseason series standings and recent finals. With a team selected, that team's items come first, then "Around the league". Hover or press pause to stop it. |
| Race chart (R) | Games above .500 or winning percentage at the end of each month: the six best records, or the selected team's division. |
| Standings (S) | Best records, or the selected team's division. |
| Featured boards (F1, F2) and boards (B1–B6) | Any of the 93 player leaderboards the API ranks. Each bar shows a player's share of the #1 value. Boards ranked low-to-high, like ERA, are detected automatically. |
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
- **Player pool:** qualified, all players, or rookies, set separately for league and club boards.
- **Leaders per board:** 3, 5 or 10.
- **Auto-refresh.** While a game is live, scores refresh every 30 seconds; otherwise every 5 minutes. Standings, club stats and leaders refresh every 15 minutes.
- **Blocks:** choose the stat or metric for every block, or hide it.

## Endpoints used

| Data | Endpoint |
|---|---|
| Season calendar | `GET /api/v1/seasons/{year}?sportId=1` |
| Standings, plus month-end standings for the race chart | `GET /api/v1/standings?leagueId=103,104&season=&standingsTypes=regularSeason[&date=YYYY-MM-DD]` |
| Club stats | `GET /api/v1/teams/stats?season=&sportId=1&group=hitting\|pitching\|fielding&stats=season&gameType=R\|P` |
| Leaderboards | `GET /api/v1/stats/leaders?leaderCategories=&statGroup=&season=&sportId=1&limit=&leaderGameTypes=&playerPool=[&teamId=]` |
| Schedule, scores, series status, TV, probable pitchers | `GET /api/v1/schedule?sportId=1&startDate=&endDate=&hydrate=team,linescore,probablePitcher,broadcasts(all),seriesStatus` |

Notes from building against the API:

- **Request one leaderboard category per call.** When a single request mixes categories from different stat groups, the endpoint silently returns its default categories, or nothing.
- **Always pass `leaderGameTypes`.** Without it, some pitching boards blend in other game types.
- Advanced stats such as WAR, wOBA and Statcast exit velocity aren't in the MLB Stats API leaderboards. Adding them would need another source, such as Baseball Savant CSV exports.

## Offline snapshot

If the API can't be reached, the board loads `js/snapshot.js`, real data saved on Oct 6, 2026. This happens when a sandbox blocks network calls or the device is offline. The header shows a **Snapshot** label so it's never mistaken for live data. The snapshot covers standings, the race chart, club stats, the schedule, about 30 league leaderboards, and the default leaderboards for the Dodgers, Cardinals, Padres and White Sox. Other boards show a "Live data board" placeholder until the live API is reachable. In snapshot mode only, Settings has a **Sample live games** switch that adds two made-up in-progress scores so you can see the live ticker state.

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
