/* MLB Live Board — static configuration: clubs, colors, stat catalog, team metrics, defaults. */
(function () {
  'use strict';
  var X = (window.MLBX = window.MLBX || {});

  X.API_BASE = 'https://statsapi.mlb.com/api/v1';

  /* Divisions in display order. */
  X.DIVISIONS = [
    { id: 201, name: 'AL East', league: 'AL' },
    { id: 202, name: 'AL Central', league: 'AL' },
    { id: 200, name: 'AL West', league: 'AL' },
    { id: 204, name: 'NL East', league: 'NL' },
    { id: 205, name: 'NL Central', league: 'NL' },
    { id: 203, name: 'NL West', league: 'NL' }
  ];

  /*
   * Club colors: [primary (header fill), secondary (strip / value chips), text on secondary,
   *               mark color on light surfaces, mark color on dark surfaces].
   * A few header fills are deepened slightly so white text on them stays legible (4.5:1).
   */
  function T(id, abbr, name, full, div, c) { return { id: id, abbr: abbr, name: name, full: full, div: div, primary: c[0], secondary: c[1], onSecondary: c[2], inkLight: c[3], inkDark: c[4] }; }
  X.TEAMS = [
    T(110, 'BAL', 'Orioles', 'Baltimore Orioles', 201, ['#BC3D00', '#27251F', '#FFFFFF', '#BC3D00', '#FF8A4C']),
    T(111, 'BOS', 'Red Sox', 'Boston Red Sox', 201, ['#BD3039', '#0C2340', '#FFFFFF', '#BD3039', '#FF6E78']),
    T(147, 'NYY', 'Yankees', 'New York Yankees', 201, ['#0C2340', '#C4CED3', '#0C2340', '#0C2340', '#A9C3E6']),
    T(139, 'TB', 'Rays', 'Tampa Bay Rays', 201, ['#092C5C', '#8FBCE6', '#092C5C', '#092C5C', '#8FBCE6']),
    T(141, 'TOR', 'Blue Jays', 'Toronto Blue Jays', 201, ['#134A8E', '#E8291C', '#FFFFFF', '#134A8E', '#74A9F0']),
    T(145, 'CWS', 'White Sox', 'Chicago White Sox', 202, ['#27251F', '#C4CED4', '#27251F', '#27251F', '#C4CED4']),
    T(114, 'CLE', 'Guardians', 'Cleveland Guardians', 202, ['#00385D', '#E50022', '#FFFFFF', '#00385D', '#62A9E3']),
    T(116, 'DET', 'Tigers', 'Detroit Tigers', 202, ['#0C2340', '#FA4616', '#0C2340', '#0C2340', '#FF8A5C']),
    T(118, 'KC', 'Royals', 'Kansas City Royals', 202, ['#004687', '#BD9B60', '#1A1A1A', '#004687', '#74B3F2']),
    T(142, 'MIN', 'Twins', 'Minnesota Twins', 202, ['#002B5C', '#D31145', '#FFFFFF', '#002B5C', '#FF6E8F']),
    T(133, 'ATH', 'Athletics', 'Athletics', 200, ['#003831', '#EFB21E', '#003831', '#003831', '#EFB21E']),
    T(117, 'HOU', 'Astros', 'Houston Astros', 200, ['#002D62', '#EB6E1F', '#002D62', '#002D62', '#FF9A55']),
    T(108, 'LAA', 'Angels', 'Los Angeles Angels', 200, ['#BA0021', '#003263', '#FFFFFF', '#BA0021', '#FF6077']),
    T(136, 'SEA', 'Mariners', 'Seattle Mariners', 200, ['#0C2C56', '#005C5C', '#FFFFFF', '#0C2C56', '#3FC7C1']),
    T(140, 'TEX', 'Rangers', 'Texas Rangers', 200, ['#003278', '#C0111F', '#FFFFFF', '#003278', '#74A3FF']),
    T(144, 'ATL', 'Braves', 'Atlanta Braves', 204, ['#13274F', '#CE1141', '#FFFFFF', '#13274F', '#FF6488']),
    T(146, 'MIA', 'Marlins', 'Miami Marlins', 204, ['#14171A', '#00A3E0', '#14171A', '#0077A8', '#3FC3F5']),
    T(121, 'NYM', 'Mets', 'New York Mets', 204, ['#002D72', '#FF5910', '#111418', '#002D72', '#FF8A4D']),
    T(143, 'PHI', 'Phillies', 'Philadelphia Phillies', 204, ['#C8102E', '#002D72', '#FFFFFF', '#C8102E', '#FF6070']),
    T(120, 'WSH', 'Nationals', 'Washington Nationals', 204, ['#AB0003', '#14225A', '#FFFFFF', '#AB0003', '#FF5A5F']),
    T(112, 'CHC', 'Cubs', 'Chicago Cubs', 205, ['#0E3386', '#CC3433', '#FFFFFF', '#0E3386', '#7FA6FF']),
    T(113, 'CIN', 'Reds', 'Cincinnati Reds', 205, ['#C6011F', '#000000', '#FFFFFF', '#C6011F', '#FF5A6B']),
    T(158, 'MIL', 'Brewers', 'Milwaukee Brewers', 205, ['#12284B', '#FFC52F', '#12284B', '#12284B', '#FFC52F']),
    T(134, 'PIT', 'Pirates', 'Pittsburgh Pirates', 205, ['#27251F', '#FDB827', '#27251F', '#27251F', '#FDB827']),
    T(138, 'STL', 'Cardinals', 'St. Louis Cardinals', 205, ['#C41E3A', '#0C2340', '#FFFFFF', '#C41E3A', '#FF6676']),
    T(109, 'ARI', 'D-backs', 'Arizona Diamondbacks', 203, ['#A71930', '#E3D4AD', '#2A1F1F', '#A71930', '#FF6B7E']),
    T(115, 'COL', 'Rockies', 'Colorado Rockies', 203, ['#33006F', '#C4CED4', '#1D1D1D', '#33006F', '#B48CFF']),
    T(119, 'LAD', 'Dodgers', 'Los Angeles Dodgers', 203, ['#005A9C', '#EF3E42', '#FFFFFF', '#005A9C', '#62B2F0']),
    T(135, 'SD', 'Padres', 'San Diego Padres', 203, ['#2F241D', '#FFC425', '#2F241D', '#2F241D', '#FFC425']),
    T(137, 'SF', 'Giants', 'San Francisco Giants', 203, ['#27251F', '#FD5A1E', '#111418', '#C7400B', '#FD7A45'])
  ];
  X.LEAGUE = { id: 'MLB', abbr: 'MLB', name: 'MLB', full: 'Major League Baseball', div: null, primary: '#041E42', secondary: '#BF0D3E', onSecondary: '#FFFFFF', inkLight: '#041E42', inkDark: '#8DB3EE' };

  X.TEAM_BY_ID = {};
  X.TEAMS.forEach(function (t) { X.TEAM_BY_ID[t.id] = t; });
  X.TEAM_BY_FULL = {};
  X.TEAMS.forEach(function (t) { X.TEAM_BY_FULL[t.full.toLowerCase()] = t; });
  X.DIV_BY_ID = {};
  X.DIVISIONS.forEach(function (d) { X.DIV_BY_ID[d.id] = d; });

  /*
   * Every player leaderboard the MLB Stats API ranks (GET /leagueLeaderTypes), by stat group.
   * key = "<statGroup>:<leaderCategory>". `short` is the column label; `name` the full label.
   */
  function S(group, cat, short, name) { return { key: group + ':' + cat, group: group, cat: cat, short: short, name: name }; }
  X.STAT_GROUPS = [
    { id: 'hitting', label: 'Hitting' },
    { id: 'pitching', label: 'Pitching' },
    { id: 'fielding', label: 'Fielding' },
    { id: 'catching', label: 'Catching' }
  ];
  X.STATS = [
    S('hitting', 'battingAverage', 'AVG', 'Batting average'),
    S('hitting', 'onBasePercentage', 'OBP', 'On-base percentage'),
    S('hitting', 'sluggingPercentage', 'SLG', 'Slugging percentage'),
    S('hitting', 'onBasePlusSlugging', 'OPS', 'On-base plus slugging'),
    S('hitting', 'homeRuns', 'HR', 'Home runs'),
    S('hitting', 'runsBattedIn', 'RBI', 'Runs batted in'),
    S('hitting', 'runs', 'R', 'Runs scored'),
    S('hitting', 'hits', 'H', 'Hits'),
    S('hitting', 'doubles', '2B', 'Doubles'),
    S('hitting', 'triples', '3B', 'Triples'),
    S('hitting', 'extraBaseHits', 'XBH', 'Extra-base hits'),
    S('hitting', 'totalBases', 'TB', 'Total bases'),
    S('hitting', 'walks', 'BB', 'Walks'),
    S('hitting', 'intentionalWalks', 'IBB', 'Intentional walks'),
    S('hitting', 'hitByPitches', 'HBP', 'Hit by pitch'),
    S('hitting', 'strikeouts', 'SO', 'Strikeouts (batting)'),
    S('hitting', 'stolenBases', 'SB', 'Stolen bases'),
    S('hitting', 'caughtStealing', 'CS', 'Caught stealing'),
    S('hitting', 'stolenBasePercentage', 'SB%', 'Stolen-base percentage'),
    S('hitting', 'gamesPlayed', 'G', 'Games played'),
    S('hitting', 'totalPlateAppearances', 'PA', 'Plate appearances'),
    S('hitting', 'atBats', 'AB', 'At-bats'),
    S('hitting', 'sacrificeFlies', 'SF', 'Sacrifice flies'),
    S('hitting', 'sacrificeBunts', 'SH', 'Sacrifice bunts'),
    S('hitting', 'groundIntoDoublePlays', 'GIDP', 'Grounded into double plays'),
    S('hitting', 'groundOuts', 'GO', 'Groundouts'),
    S('hitting', 'airOuts', 'AO', 'Air outs'),
    S('hitting', 'flyouts', 'FO', 'Flyouts'),
    S('hitting', 'groundoutToFlyoutRatio', 'GO/AO', 'Groundout-to-airout ratio'),
    S('hitting', 'numberOfPitches', 'NP', 'Pitches seen'),
    S('hitting', 'catchersInterference', 'CI', "Reached on catcher's interference"),

    S('pitching', 'earnedRunAverage', 'ERA', 'Earned run average'),
    S('pitching', 'walksAndHitsPerInningPitched', 'WHIP', 'Walks + hits per inning'),
    S('pitching', 'strikeouts', 'K', 'Strikeouts (pitching)'),
    S('pitching', 'wins', 'W', 'Wins'),
    S('pitching', 'losses', 'L', 'Losses'),
    S('pitching', 'winPercentage', 'W%', 'Winning percentage'),
    S('pitching', 'saves', 'SV', 'Saves'),
    S('pitching', 'saveOpportunities', 'SVO', 'Save opportunities'),
    S('pitching', 'holds', 'HLD', 'Holds'),
    S('pitching', 'blownSaves', 'BS', 'Blown saves'),
    S('pitching', 'inningsPitched', 'IP', 'Innings pitched'),
    S('pitching', 'gamesPlayed', 'G', 'Games pitched'),
    S('pitching', 'gamesStarted', 'GS', 'Games started'),
    S('pitching', 'gamesFinished', 'GF', 'Games finished'),
    S('pitching', 'completeGames', 'CG', 'Complete games'),
    S('pitching', 'shutouts', 'SHO', 'Shutouts'),
    S('pitching', 'strikeoutsPer9Inn', 'K/9', 'Strikeouts per 9 innings'),
    S('pitching', 'walksPer9Inn', 'BB/9', 'Walks per 9 innings'),
    S('pitching', 'hitsPer9Inn', 'H/9', 'Hits per 9 innings'),
    S('pitching', 'strikeoutWalkRatio', 'K/BB', 'Strikeout-to-walk ratio'),
    S('pitching', 'battingAverage', 'OAVG', 'Opponent batting average'),
    S('pitching', 'onBasePercentage', 'OOBP', 'Opponent on-base percentage'),
    S('pitching', 'onBasePlusSlugging', 'OOPS', 'Opponent OPS'),
    S('pitching', 'hits', 'H', 'Hits allowed'),
    S('pitching', 'runs', 'R', 'Runs allowed'),
    S('pitching', 'earnedRun', 'ER', 'Earned runs allowed'),
    S('pitching', 'homeRuns', 'HR', 'Home runs allowed'),
    S('pitching', 'doubles', '2B', 'Doubles allowed'),
    S('pitching', 'triples', '3B', 'Triples allowed'),
    S('pitching', 'walks', 'BB', 'Walks allowed'),
    S('pitching', 'intentionalWalks', 'IBB', 'Intentional walks issued'),
    S('pitching', 'hitBatsman', 'HB', 'Hit batters'),
    S('pitching', 'wildPitch', 'WP', 'Wild pitches'),
    S('pitching', 'balk', 'BK', 'Balks'),
    S('pitching', 'pickoffs', 'PK', 'Pickoffs'),
    S('pitching', 'stolenBases', 'SB', 'Stolen bases allowed'),
    S('pitching', 'totalBattersFaced', 'BF', 'Batters faced'),
    S('pitching', 'numberOfPitches', 'NP', 'Pitches thrown'),
    S('pitching', 'pitchesPerInning', 'P/IP', 'Pitches per inning'),
    S('pitching', 'groundoutToFlyoutRatio', 'GO/AO', 'Groundout-to-airout ratio'),

    S('fielding', 'fieldingPercentage', 'FPCT', 'Fielding percentage'),
    S('fielding', 'errors', 'E', 'Errors'),
    S('fielding', 'throwingErrors', 'TE', 'Throwing errors'),
    S('fielding', 'assists', 'A', 'Assists'),
    S('fielding', 'outfieldAssists', 'OFA', 'Outfield assists'),
    S('fielding', 'putOuts', 'PO', 'Putouts'),
    S('fielding', 'chances', 'TC', 'Total chances'),
    S('fielding', 'doublePlays', 'DP', 'Double plays turned'),
    S('fielding', 'triplePlays', 'TP', 'Triple plays'),
    S('fielding', 'rangeFactorPerGame', 'RF/G', 'Range factor per game'),
    S('fielding', 'rangeFactorPer9Inn', 'RF/9', 'Range factor per 9 innings'),
    S('fielding', 'innings', 'INN', 'Innings in the field'),
    S('fielding', 'gamesPlayed', 'G', 'Games in the field'),

    S('catching', 'caughtStealing', 'CS', 'Runners caught stealing'),
    S('catching', 'stolenBasePercentage', 'SB%', 'Stolen-base percentage against'),
    S('catching', 'stolenBases', 'SB', 'Stolen bases allowed'),
    S('catching', 'passedBalls', 'PB', 'Passed balls'),
    S('catching', 'catcherEarnedRunAverage', 'CERA', "Catcher's ERA"),
    S('catching', 'pickoffs', 'PK', 'Pickoffs'),
    S('catching', 'catchersInterference', 'CI', "Catcher's interference"),
    S('catching', 'wildPitch', 'WP', 'Wild pitches while catching'),
    S('catching', 'innings', 'INN', 'Innings caught')
  ];
  X.STAT_BY_KEY = {};
  X.STATS.forEach(function (s) { X.STAT_BY_KEY[s.key] = s; });

  /*
   * Club-level metrics, used by the header tiles and the all-clubs chart.
   * src: st = standings, hit / pit / fld = team season stats. low = lower is better.
   * fmt: int, rate3 (.xxx), dec2, pct3, signed, text.
   */
  function M(key, src, field, label, short, fmt, low) { return { key: key, src: src, field: field, label: label, short: short, fmt: fmt, low: !!low }; }
  X.TEAM_METRICS = [
    M('st:record', 'st', 'pct', 'Record', 'W–L', 'record'),
    M('st:pct', 'st', 'pct', 'Winning percentage', 'PCT', 'rate3'),
    M('st:wins', 'st', 'wins', 'Wins', 'W', 'int'),
    M('st:losses', 'st', 'losses', 'Losses', 'L', 'int', true),
    M('st:rd', 'st', 'rd', 'Run differential', 'RD', 'signed'),
    M('st:rs', 'st', 'rs', 'Runs scored', 'RS', 'int'),
    M('st:ra', 'st', 'ra', 'Runs allowed', 'RA', 'int', true),
    M('st:streak', 'st', 'streakN', 'Current streak', 'STRK', 'streak'),
    M('st:last10', 'st', 'l10w', 'Last 10 games', 'L10', 'l10'),
    M('st:home', 'st', 'homePct', 'Home record', 'HOME', 'home'),
    M('st:away', 'st', 'awayPct', 'Road record', 'ROAD', 'away'),
    M('hit:avg', 'hit', 'avg', 'Team batting average', 'AVG', 'rate3'),
    M('hit:obp', 'hit', 'obp', 'Team on-base percentage', 'OBP', 'rate3'),
    M('hit:slg', 'hit', 'slg', 'Team slugging', 'SLG', 'rate3'),
    M('hit:ops', 'hit', 'ops', 'Team OPS', 'OPS', 'rate3'),
    M('hit:homeRuns', 'hit', 'homeRuns', 'Team home runs', 'HR', 'int'),
    M('hit:runs', 'hit', 'runs', 'Runs scored (batting)', 'R', 'int'),
    M('hit:hits', 'hit', 'hits', 'Team hits', 'H', 'int'),
    M('hit:doubles', 'hit', 'doubles', 'Team doubles', '2B', 'int'),
    M('hit:triples', 'hit', 'triples', 'Team triples', '3B', 'int'),
    M('hit:rbi', 'hit', 'rbi', 'Team RBI', 'RBI', 'int'),
    M('hit:baseOnBalls', 'hit', 'baseOnBalls', 'Team walks', 'BB', 'int'),
    M('hit:strikeOuts', 'hit', 'strikeOuts', 'Team strikeouts (batting)', 'SO', 'int', true),
    M('hit:stolenBases', 'hit', 'stolenBases', 'Team stolen bases', 'SB', 'int'),
    M('hit:totalBases', 'hit', 'totalBases', 'Team total bases', 'TB', 'int'),
    M('hit:leftOnBase', 'hit', 'leftOnBase', 'Runners left on base', 'LOB', 'int', true),
    M('pit:era', 'pit', 'era', 'Team ERA', 'ERA', 'dec2', true),
    M('pit:whip', 'pit', 'whip', 'Team WHIP', 'WHIP', 'dec2', true),
    M('pit:strikeOuts', 'pit', 'strikeOuts', 'Team strikeouts (pitching)', 'K', 'int'),
    M('pit:baseOnBalls', 'pit', 'baseOnBalls', 'Walks allowed', 'BB', 'int', true),
    M('pit:homeRuns', 'pit', 'homeRuns', 'Home runs allowed', 'HRA', 'int', true),
    M('pit:hits', 'pit', 'hits', 'Hits allowed', 'HA', 'int', true),
    M('pit:avg', 'pit', 'avg', 'Opponent batting average', 'OAVG', 'rate3', true),
    M('pit:strikeoutsPer9Inn', 'pit', 'strikeoutsPer9Inn', 'Strikeouts per 9', 'K/9', 'dec2'),
    M('pit:walksPer9Inn', 'pit', 'walksPer9Inn', 'Walks per 9', 'BB/9', 'dec2', true),
    M('pit:strikeoutWalkRatio', 'pit', 'strikeoutWalkRatio', 'Strikeout-to-walk ratio', 'K/BB', 'dec2'),
    M('pit:saves', 'pit', 'saves', 'Team saves', 'SV', 'int'),
    M('pit:holds', 'pit', 'holds', 'Team holds', 'HLD', 'int'),
    M('pit:blownSaves', 'pit', 'blownSaves', 'Blown saves', 'BS', 'int', true),
    M('pit:completeGames', 'pit', 'completeGames', 'Complete games', 'CG', 'int'),
    M('pit:shutouts', 'pit', 'shutouts', 'Shutouts', 'SHO', 'int'),
    M('fld:errors', 'fld', 'errors', 'Team errors', 'E', 'int', true),
    M('fld:fielding', 'fld', 'fielding', 'Team fielding percentage', 'FPCT', 'rate3'),
    M('fld:doublePlays', 'fld', 'doublePlays', 'Double plays turned', 'DP', 'int'),
    M('fld:assists', 'fld', 'assists', 'Team assists', 'A', 'int')
  ];
  X.METRIC_BY_KEY = {};
  X.TEAM_METRICS.forEach(function (m) { X.METRIC_BY_KEY[m.key] = m; });
  X.METRIC_GROUPS = [
    { src: 'st', label: 'Standings' },
    { src: 'hit', label: 'Team hitting' },
    { src: 'pit', label: 'Team pitching' },
    { src: 'fld', label: 'Team fielding' }
  ];

  /* The blocks a person can assign stats to, in dashboard order. */
  X.BLOCKS = {
    tiles: [
      { id: 'tile1', code: 'T1', label: 'Header tile 1' },
      { id: 'tile2', code: 'T2', label: 'Header tile 2' },
      { id: 'tile3', code: 'T3', label: 'Header tile 3' },
      { id: 'tile4', code: 'T4', label: 'Header tile 4' }
    ],
    featured: [
      { id: 'feat1', code: 'F1', label: 'Featured board 1' },
      { id: 'feat2', code: 'F2', label: 'Featured board 2' }
    ],
    boards: [
      { id: 'board1', code: 'B1', label: 'Board 1' },
      { id: 'board2', code: 'B2', label: 'Board 2' },
      { id: 'board3', code: 'B3', label: 'Board 3' },
      { id: 'board4', code: 'B4', label: 'Board 4' },
      { id: 'board5', code: 'B5', label: 'Board 5' },
      { id: 'board6', code: 'B6', label: 'Board 6' }
    ]
  };

  X.DEFAULT_SETTINGS = {
    v: 1,
    theme: 'auto',            // auto | light | dark
    layout: 'standard',       // standard | tv
    defaultTeam: 'MLB',
    gameType: 'R',            // R regular season | P postseason
    pool: 'QUALIFIED',        // QUALIFIED | ALL | ROOKIES
    teamPool: 'QUALIFIED',
    limit: 5,
    ticker: true,
    tickerSpeed: 'normal',    // slow | normal | fast
    tvRotate: 12,             // seconds per TV panel
    refresh: true,
    sampleLive: false,        // snapshot preview only
    blocks: {
      tile1: 'st:record', tile2: 'st:rd', tile3: 'hit:ops', tile4: 'pit:era',
      race: 'gap',            // gap | pct | hide
      standings: 'show',
      feat1: 'hitting:runsBattedIn', feat2: 'hitting:onBasePlusSlugging',
      board1: 'hitting:homeRuns', board2: 'hitting:battingAverage', board3: 'hitting:stolenBases',
      board4: 'pitching:earnedRunAverage', board5: 'pitching:strikeouts', board6: 'pitching:wins',
      clubs: 'st:rd',
      upnext: 'show'
    }
  };
})();
