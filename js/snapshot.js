/* MLB Live Board — bundled snapshot of real MLB Stats API data (pulled Oct 6, 2026, 11:47 AM CT).
 * Used only when the live API can't be reached (offline, or a sandbox that blocks network calls).
 * Club leaderboards are included for four clubs; everything else covers all 30. */
(function () {
  'use strict';
  var X = (window.MLBX = window.MLBX || {});
  var ID = {};
  X.TEAMS.forEach(function (t) { ID[t.abbr] = t.id; });

  /* abbr: [W, L, run diff, games back, division rank, streak] — final 2026 regular season */
  var ST = {
    TB: [98, 64, 86, '-', 1, 'L1'], NYY: [93, 68, 138, '4.5', 2, 'W1'], BOS: [87, 75, 78, '11.0', 3, 'L1'], BAL: [79, 82, -21, '18.5', 4, 'L1'], TOR: [79, 83, -46, '19.0', 5, 'W1'],
    CLE: [85, 77, 11, '-', 1, 'L1'], CWS: [84, 78, 56, '1.0', 2, 'W1'], MIN: [77, 85, -58, '8.0', 3, 'W1'], DET: [76, 86, 71, '9.0', 4, 'L1'], KC: [69, 93, -120, '16.0', 5, 'W1'],
    HOU: [81, 81, -32, '-', 1, 'W2'], TEX: [80, 82, -46, '1.0', 2, 'L1'], SEA: [76, 86, -58, '5.0', 3, 'W2'], ATH: [64, 98, -238, '17.0', 4, 'L2'], LAA: [62, 100, -97, '19.0', 5, 'L2'],
    ATL: [94, 68, 116, '-', 1, 'L1'], PHI: [88, 74, 15, '6.0', 2, 'W1'], MIA: [80, 82, 3, '14.0', 3, 'W1'], WSH: [77, 85, 6, '17.0', 4, 'W1'], NYM: [74, 88, -32, '20.0', 5, 'L1'],
    MIL: [103, 59, 214, '-', 1, 'W5'], CHC: [89, 73, 147, '14.0', 2, 'W1'], PIT: [82, 80, 28, '21.0', 3, 'W1'], STL: [77, 85, -29, '26.0', 4, 'L4'], CIN: [75, 87, -160, '28.0', 5, 'L1'],
    LAD: [100, 62, 201, '-', 1, 'W3'], SD: [91, 71, 41, '9.0', 2, 'W2'], ARI: [86, 76, 9, '14.0', 3, 'L2'], SF: [65, 97, -91, '35.0', 4, 'L5'], COL: [58, 104, -192, '42.0', 5, 'L1']
  };

  /* abbr: W-L at the end of Apr, May, Jun, Jul, Aug */
  var MONTHS = {
    NYY: [20, 11, 36, 23, 48, 37, 61, 48, 78, 60], TB: [18, 12, 36, 20, 49, 33, 64, 44, 82, 55], BAL: [15, 16, 28, 32, 39, 48, 53, 56, 69, 69], TOR: [14, 17, 29, 31, 40, 46, 50, 59, 68, 70], BOS: [12, 19, 25, 33, 37, 47, 57, 51, 75, 63],
    CLE: [16, 16, 34, 27, 44, 42, 56, 54, 69, 68], DET: [16, 16, 22, 38, 37, 49, 51, 58, 63, 74], CWS: [14, 17, 32, 27, 45, 39, 57, 51, 72, 65], MIN: [14, 18, 27, 33, 41, 46, 55, 55, 66, 72], KC: [12, 19, 22, 37, 35, 51, 46, 64, 62, 76],
    ATH: [17, 14, 28, 31, 40, 46, 45, 64, 53, 85], SEA: [16, 16, 31, 29, 44, 43, 53, 57, 64, 74], TEX: [15, 16, 28, 31, 44, 42, 55, 54, 68, 70], LAA: [12, 20, 23, 37, 36, 51, 42, 67, 53, 85], HOU: [12, 20, 27, 34, 43, 45, 55, 55, 70, 68],
    ATL: [22, 10, 40, 20, 49, 34, 64, 45, 82, 56], MIA: [15, 16, 26, 34, 46, 40, 55, 55, 69, 69], WSH: [15, 17, 31, 29, 44, 43, 55, 55, 66, 74], PHI: [12, 19, 30, 29, 48, 38, 57, 52, 78, 60], NYM: [10, 21, 26, 33, 36, 50, 47, 63, 62, 76],
    CIN: [20, 11, 30, 28, 39, 45, 51, 57, 65, 73], CHC: [19, 12, 32, 28, 48, 38, 62, 47, 78, 60], STL: [18, 13, 31, 26, 44, 38, 54, 55, 68, 70], MIL: [16, 14, 35, 21, 52, 31, 67, 41, 85, 53], PIT: [16, 16, 32, 28, 43, 43, 55, 55, 67, 71],
    LAD: [20, 11, 38, 21, 56, 30, 69, 40, 82, 55], SD: [19, 11, 32, 26, 43, 41, 55, 54, 73, 65], ARI: [16, 14, 31, 27, 43, 42, 57, 52, 73, 66], COL: [14, 18, 22, 38, 33, 53, 42, 67, 52, 86], SF: [13, 18, 23, 36, 35, 50, 47, 62, 57, 81]
  };

  /* abbr: [AVG, OBP, SLG, OPS, HR, SB, ERA, K (pitching), WHIP, SV] */
  var TS = {
    MIL: [.258, .341, .403, .744, 154, 162, 3.57, 1433, 1.19, 47], TB: [.258, .326, .402, .728, 169, 164, 3.78, 1204, 1.14, 56], LAD: [.257, .338, .424, .762, 204, 72, 3.68, 1376, 1.17, 43],
    COL: [.254, .322, .417, .739, 180, 109, 5.57, 1019, 1.53, 32], PIT: [.253, .330, .404, .734, 186, 132, 4.18, 1369, 1.30, 34], CHC: [.251, .339, .428, .767, 220, 114, 4.19, 1161, 1.27, 33],
    MIA: [.249, .326, .400, .726, 168, 163, 4.10, 1205, 1.28, 32], KC: [.248, .316, .402, .718, 170, 130, 4.63, 1088, 1.39, 36], TOR: [.247, .310, .381, .691, 152, 75, 3.90, 1306, 1.29, 50],
    ATL: [.246, .309, .409, .718, 204, 83, 3.59, 1258, 1.25, 46], ARI: [.246, .318, .402, .720, 166, 103, 4.09, 1039, 1.28, 37], WSH: [.246, .321, .423, .744, 210, 178, 4.74, 1185, 1.39, 36],
    BOS: [.245, .319, .398, .717, 163, 107, 3.59, 1298, 1.24, 42], ATH: [.245, .317, .402, .719, 194, 91, 5.42, 1253, 1.50, 37], SF: [.245, .306, .400, .706, 178, 88, 4.38, 1121, 1.36, 28],
    MIN: [.245, .317, .403, .720, 187, 91, 4.69, 1246, 1.38, 41], SD: [.244, .319, .398, .717, 183, 164, 3.91, 1217, 1.28, 46], HOU: [.242, .315, .417, .732, 226, 50, 4.55, 1305, 1.35, 47],
    TEX: [.242, .317, .396, .713, 183, 78, 4.32, 1257, 1.31, 41], DET: [.241, .320, .400, .720, 181, 58, 3.65, 1196, 1.22, 29], PHI: [.240, .312, .395, .707, 182, 105, 4.00, 1460, 1.28, 39],
    STL: [.239, .313, .378, .691, 167, 100, 4.29, 1188, 1.35, 44], NYM: [.239, .310, .396, .706, 204, 83, 4.18, 1326, 1.30, 29], CLE: [.239, .316, .380, .696, 162, 146, 3.78, 1415, 1.26, 41],
    CWS: [.236, .320, .406, .726, 211, 93, 4.13, 1233, 1.31, 38], NYY: [.235, .311, .409, .720, 223, 153, 3.24, 1339, 1.16, 43], LAA: [.234, .310, .369, .679, 154, 93, 4.22, 1329, 1.34, 22],
    BAL: [.234, .314, .396, .710, 199, 78, 4.20, 1207, 1.35, 42], SEA: [.233, .314, .379, .693, 182, 114, 4.22, 1273, 1.25, 33], CIN: [.229, .305, .394, .699, 213, 112, 4.88, 1207, 1.45, 40]
  };

  /* Leaderboards: [rank, name, club, value] */
  var L = {
    MLB: {
      'hitting:runsBattedIn': [[1, 'Alec Burleson', 'STL', '116'], [2, 'Pete Alonso', 'BAL', '113'], [3, 'Sal Stewart', 'CIN', '112'], [4, 'Pete Crow-Armstrong', 'CHC', '107'], [5, 'CJ Abrams', 'WSH', '106'], [5, 'Yordan Alvarez', 'HOU', '106']],
      'hitting:onBasePlusSlugging': [[1, 'Yordan Alvarez', 'HOU', '1.033'], [2, 'Pete Crow-Armstrong', 'CHC', '.942'], [3, 'Willson Contreras', 'BOS', '.902'], [4, 'Ben Rice', 'NYY', '.897'], [5, 'James Wood', 'WSH', '.891']],
      'hitting:homeRuns': [[1, 'Pete Crow-Armstrong', 'CHC', '45'], [1, 'Kyle Schwarber', 'PHI', '45'], [3, 'Pete Alonso', 'BAL', '43'], [4, 'Yordan Alvarez', 'HOU', '42'], [4, 'Junior Caminero', 'TB', '42']],
      'hitting:battingAverage': [[1, 'Yordan Alvarez', 'HOU', '.316'], [2, 'Gabriel Moreno', 'ARI', '.311'], [3, 'Luis Arraez', 'PHI', '.310'], [4, 'Chandler Simpson', 'TB', '.306'], [5, 'Otto Lopez', 'MIA', '.305']],
      'hitting:stolenBases': [[1, 'Nasim Nuñez', 'WSH', '49'], [2, 'Chandler Simpson', 'TB', '46'], [3, 'Bobby Witt Jr.', 'KC', '45'], [4, 'Jazz Chisholm Jr.', 'NYY', '41'], [4, 'Pete Crow-Armstrong', 'CHC', '41']],
      'hitting:runs': [[1, 'Pete Crow-Armstrong', 'CHC', '119'], [2, 'Randy Arozarena', 'SEA', '113'], [3, 'Miguel Vargas', 'CWS', '106'], [3, 'James Wood', 'WSH', '106'], [5, 'Yordan Alvarez', 'HOU', '105'], [5, 'Ben Rice', 'NYY', '105']],
      'hitting:hits': [[1, 'Otto Lopez', 'MIA', '191'], [2, 'Luis Arraez', 'PHI', '185'], [3, 'Fernando Tatis Jr.', 'SD', '181'], [4, 'Yandy Díaz', 'TB', '180'], [5, 'Yordan Alvarez', 'HOU', '179']],
      'hitting:doubles': [[1, 'Bryan Reynolds', 'PIT', '40'], [2, 'Wilyer Abreu', 'BOS', '38'], [3, 'Alec Burleson', 'STL', '37'], [3, 'Brice Turang', 'MIL', '37'], [5, 'Rafael Devers', 'SF', '36'], [5, 'Michael Harris II', 'ATL', '36'], [5, 'Brandon Nimmo', 'TEX', '36'], [5, 'Bryson Stott', 'PHI', '36']],
      'hitting:triples': [[1, 'Corbin Carroll', 'ARI', '17'], [2, 'Jake McCarthy', 'COL', '13'], [3, 'Otto Lopez', 'MIA', '9'], [3, 'Geraldo Perdomo', 'ARI', '9'], [5, 'Pete Crow-Armstrong', 'CHC', '8'], [5, 'Daylen Lile', 'WSH', '8']],
      'hitting:walks': [[1, 'Yordan Alvarez', 'HOU', '109'], [2, 'Bryce Harper', 'PHI', '107'], [2, 'Mike Trout', 'LAA', '107'], [4, 'Kyle Schwarber', 'PHI', '105'], [5, 'James Wood', 'WSH', '102']],
      'hitting:onBasePercentage': [[1, 'Yordan Alvarez', 'HOU', '.432'], [2, 'TJ Rumfield', 'COL', '.390'], [3, 'Jake Bauers', 'MIL', '.389'], [4, 'James Wood', 'WSH', '.388'], [5, 'Gabriel Moreno', 'ARI', '.388']],
      'hitting:sluggingPercentage': [[1, 'Yordan Alvarez', 'HOU', '.601'], [2, 'Pete Crow-Armstrong', 'CHC', '.570'], [3, 'Ben Rice', 'NYY', '.534'], [4, 'Hunter Goodman', 'COL', '.529'], [5, 'Rafael Devers', 'SF', '.525']],
      'hitting:totalBases': [[1, 'Pete Crow-Armstrong', 'CHC', '357'], [2, 'Yordan Alvarez', 'HOU', '341'], [3, 'Junior Caminero', 'TB', '323'], [4, 'Pete Alonso', 'BAL', '314'], [4, 'Matt Olson', 'ATL', '314']],
      'hitting:strikeouts': [[1, 'Colson Montgomery', 'CWS', '227'], [2, 'Kyle Schwarber', 'PHI', '220'], [3, 'Zach Neto', 'LAA', '215'], [4, 'Austin Riley', 'ATL', '201'], [5, 'Munetaka Murakami', 'CWS', '196']],
      'pitching:earnedRunAverage': [[1, 'Jacob Misiorowski', 'MIL', '1.86'], [2, 'Cam Schlittler', 'NYY', '1.94'], [3, 'Chris Sale', 'ATL', '2.18'], [4, 'Dylan Cease', 'TOR', '2.40'], [5, 'Yoshinobu Yamamoto', 'LAD', '2.51']],
      'pitching:strikeouts': [[1, 'Jacob Misiorowski', 'MIL', '247'], [2, 'Gavin Williams', 'CLE', '244'], [3, 'Dylan Cease', 'TOR', '239'], [4, 'Cam Schlittler', 'NYY', '234'], [5, 'Jesús Luzardo', 'PHI', '221'], [5, 'Cristopher Sánchez', 'PHI', '221']],
      'pitching:wins': [[1, 'Cristopher Sánchez', 'PHI', '18'], [2, 'Sonny Gray', 'BOS', '17'], [3, 'Drew Rasmussen', 'TB', '16'], [4, 'Chase Burns', 'CIN', '15'], [4, 'Foster Griffin', 'CLE', '15'], [4, 'Nick Martinez', 'TB', '15'], [4, 'Jacob Misiorowski', 'MIL', '15'], [4, 'Eduardo Rodriguez', 'ARI', '15']],
      'pitching:saves': [[1, 'Bryan Baker', 'TB', '41'], [1, 'Cade Smith', 'CLE', '41'], [3, 'Mason Miller', 'SD', '38'], [3, "Riley O'Brien", 'STL', '38'], [5, 'David Bednar', 'NYY', '35'], [5, 'Aroldis Chapman', 'BOS', '35'], [5, 'Louis Varland', 'TOR', '35']],
      'pitching:holds': [[1, 'Kevin Kelly', 'TB', '33'], [1, 'Tyler Rogers', 'TOR', '33'], [3, 'Hunter Gaddis', 'CLE', '32'], [4, 'Dylan Lee', 'ATL', '31'], [5, 'Brent Headrick', 'NYY', '29']],
      'pitching:inningsPitched': [[1, 'Sandy Alcantara', 'MIA', '214.0'], [2, 'Cristopher Sánchez', 'PHI', '207.0'], [3, 'Michael Wacha', 'KC', '200.2'], [4, 'Cam Schlittler', 'NYY', '193.2'], [5, 'Eduardo Rodriguez', 'ARI', '189.2']],
      'pitching:walksAndHitsPerInningPitched': [[1, 'Jacob Misiorowski', 'MIL', '0.80'], [2, 'Yoshinobu Yamamoto', 'LAD', '0.87'], [3, 'Drew Rasmussen', 'TB', '0.91'], [4, 'Cam Schlittler', 'NYY', '0.92'], [5, 'Chris Sale', 'ATL', '0.98']],
      'pitching:strikeoutsPer9Inn': [[1, 'Jacob Misiorowski', 'MIL', '12.98'], [2, 'Dylan Cease', 'TOR', '12.73'], [3, 'Gavin Williams', 'CLE', '12.11'], [4, 'Jacob deGrom', 'TEX', '11.12'], [5, 'Cam Schlittler', 'NYY', '11.11']],
      'pitching:battingAverage': [[1, 'Jacob Misiorowski', 'MIL', '.157'], [2, 'Dylan Cease', 'TOR', '.180'], [3, 'Yoshinobu Yamamoto', 'LAD', '.182'], [4, 'Cam Schlittler', 'NYY', '.185'], [5, 'Drew Rasmussen', 'TB', '.199']],
      'pitching:onBasePlusSlugging': [[1, 'Jacob Misiorowski', 'MIL', '.470'], [2, 'Drew Rasmussen', 'TB', '.543'], [3, 'Cam Schlittler', 'NYY', '.544'], [4, 'Yoshinobu Yamamoto', 'LAD', '.545'], [5, 'Dylan Cease', 'TOR', '.546']],
      'pitching:homeRuns': [[1, 'Aaron Nola', 'PHI', '37'], [2, 'Shota Imanaga', 'CHC', '35'], [2, 'Jeffrey Springs', 'ATH', '35'], [4, 'Tomoyuki Sugano', 'COL', '33'], [5, 'Brady Singer', 'CIN', '32']],
      'pitching:hits': [[1, 'Sandy Alcantara', 'MIA', '204'], [1, 'Cristopher Sánchez', 'PHI', '204'], [3, 'Seth Lugo', 'KC', '200'], [4, 'George Kirby', 'SEA', '197'], [5, 'Brady Singer', 'CIN', '188']],
      'pitching:runs': [[1, 'Michael Lorenzen', 'TOR', '113'], [2, 'Seth Lugo', 'KC', '107'], [2, 'Brady Singer', 'CIN', '107'], [4, 'Jeffrey Springs', 'ATH', '105'], [5, 'Kyle Freeland', 'COL', '104']],
      'pitching:walks': [[1, 'Robbie Ray', 'SD', '84'], [2, 'Joey Cantillo', 'CLE', '81'], [3, 'Bubba Chandler', 'PIT', '80'], [4, 'Dylan Cease', 'TOR', '78'], [5, 'Andrew Abbott', 'CIN', '76'], [5, 'Taj Bradley', 'MIN', '76']],
      'pitching:stolenBases': [[1, 'Dylan Cease', 'TOR', '33'], [2, 'Eury Pérez', 'MIA', '31'], [3, 'Matthew Liberatore', 'STL', '24'], [4, 'Andrew Abbott', 'CIN', '23'], [4, 'Sean Burke', 'CWS', '23'], [4, 'George Kirby', 'SEA', '23'], [4, 'Drew Rasmussen', 'TB', '23'], [4, 'Robbie Ray', 'SD', '23']],
      'fielding:errors': [[1, 'Otto Lopez', 'MIA', '21'], [1, 'Trea Turner', 'PHI', '21'], [3, 'CJ Abrams', 'WSH', '20'], [3, 'Junior Caminero', 'TB', '20'], [3, 'Kazuma Okamoto', 'TOR', '20']]
    },
    LAD: {
      'hitting:runsBattedIn': [[1, 'Andy Pages', 'LAD', '85'], [2, 'Shohei Ohtani', 'LAD', '81'], [3, 'Max Muncy', 'LAD', '76']],
      'hitting:onBasePlusSlugging': [[1, 'Shohei Ohtani', 'LAD', '.889'], [2, 'Max Muncy', 'LAD', '.838'], [3, 'Andy Pages', 'LAD', '.811']],
      'hitting:homeRuns': [[1, 'Shohei Ohtani', 'LAD', '30'], [2, 'Max Muncy', 'LAD', '29'], [3, 'Mookie Betts', 'LAD', '23'], [3, 'Andy Pages', 'LAD', '23']],
      'hitting:battingAverage': [[1, 'Freddie Freeman', 'LAD', '.288'], [2, 'Shohei Ohtani', 'LAD', '.275'], [3, 'Andy Pages', 'LAD', '.274']],
      'hitting:stolenBases': [[1, 'Andy Pages', 'LAD', '13'], [2, 'Kyle Tucker', 'LAD', '12'], [3, 'Shohei Ohtani', 'LAD', '11']],
      'pitching:earnedRunAverage': [[1, 'Yoshinobu Yamamoto', 'LAD', '2.53']],
      'pitching:strikeouts': [[1, 'Yoshinobu Yamamoto', 'LAD', '182'], [2, 'Emmet Sheehan', 'LAD', '132'], [3, 'Roki Sasaki', 'LAD', '123']],
      'pitching:wins': [[1, 'Yoshinobu Yamamoto', 'LAD', '14'], [2, 'Justin Wrobleski', 'LAD', '12'], [3, 'Shohei Ohtani', 'LAD', '8']],
      'pitching:saves': [[1, 'Tanner Scott', 'LAD', '25'], [2, 'Edwin Díaz', 'LAD', '7'], [3, 'Alex Vesia', 'LAD', '3']]
    },
    STL: {
      'hitting:runsBattedIn': [[1, 'Alec Burleson', 'STL', '116'], [2, 'Jordan Walker', 'STL', '102'], [3, 'Iván Herrera', 'STL', '69']],
      'hitting:onBasePlusSlugging': [[1, 'Alec Burleson', 'STL', '.816'], [2, 'Jordan Walker', 'STL', '.793'], [3, 'Iván Herrera', 'STL', '.735']],
      'hitting:homeRuns': [[1, 'Jordan Walker', 'STL', '29'], [2, 'Alec Burleson', 'STL', '26'], [3, 'Iván Herrera', 'STL', '19']],
      'hitting:battingAverage': [[1, 'Alec Burleson', 'STL', '.279'], [2, 'Jordan Walker', 'STL', '.269'], [3, 'JJ Wetherholt', 'STL', '.242']],
      'hitting:stolenBases': [[1, 'Jordan Walker', 'STL', '22'], [2, 'JJ Wetherholt', 'STL', '14'], [3, 'Victor Scott II', 'STL', '12']],
      'pitching:earnedRunAverage': [[1, 'Andre Pallante', 'STL', '3.83'], [2, 'Michael McGreevy', 'STL', '3.95']],
      'pitching:strikeouts': [[1, 'Matthew Liberatore', 'STL', '154'], [2, 'Kyle Leahy', 'STL', '132'], [3, 'Michael McGreevy', 'STL', '115']],
      'pitching:wins': [[1, 'Andre Pallante', 'STL', '12'], [2, 'Kyle Leahy', 'STL', '10'], [3, 'Gordon Graceffo', 'STL', '8']],
      'pitching:saves': [[1, "Riley O'Brien", 'STL', '38'], [2, 'George Soriano', 'STL', '4'], [3, 'Ryne Stanek', 'STL', '2']]
    },
    SD: {
      'hitting:runsBattedIn': [[1, 'Manny Machado', 'SD', '91'], [2, 'Jackson Merrill', 'SD', '87'], [3, 'Fernando Tatis Jr.', 'SD', '83']],
      'hitting:onBasePlusSlugging': [[1, 'Fernando Tatis Jr.', 'SD', '.828'], [2, 'Jackson Merrill', 'SD', '.743'], [3, 'Manny Machado', 'SD', '.710']],
      'hitting:homeRuns': [[1, 'Manny Machado', 'SD', '30'], [2, 'Jackson Merrill', 'SD', '26'], [3, 'Fernando Tatis Jr.', 'SD', '25']],
      'hitting:battingAverage': [[1, 'Fernando Tatis Jr.', 'SD', '.289'], [2, 'Jackson Merrill', 'SD', '.254'], [3, 'Xander Bogaerts', 'SD', '.231']],
      'hitting:stolenBases': [[1, 'Fernando Tatis Jr.', 'SD', '38'], [2, 'Jackson Merrill', 'SD', '27'], [3, 'Xander Bogaerts', 'SD', '22']],
      'pitching:earnedRunAverage': [[1, 'Michael King', 'SD', '3.21']],
      'pitching:strikeouts': [[1, 'Michael King', 'SD', '159'], [2, 'Walker Buehler', 'SD', '131'], [3, 'Mason Miller', 'SD', '129']],
      'pitching:wins': [[1, 'Michael King', 'SD', '12'], [2, 'Randy Vásquez', 'SD', '10'], [3, 'Walker Buehler', 'SD', '9'], [3, 'Adrian Morejon', 'SD', '9']],
      'pitching:saves': [[1, 'Mason Miller', 'SD', '38'], [2, 'Adrian Morejon', 'SD', '3'], [3, 'Jason Adam', 'SD', '2'], [3, 'Bradgley Rodriguez', 'SD', '2']]
    },
    CWS: {
      'hitting:runsBattedIn': [[1, 'Miguel Vargas', 'CWS', '93'], [2, 'Colson Montgomery', 'CWS', '87'], [3, 'Andrew Benintendi', 'CWS', '78']],
      'hitting:onBasePlusSlugging': [[1, 'Miguel Vargas', 'CWS', '.837'], [2, 'Munetaka Murakami', 'CWS', '.825'], [3, 'Sam Antonacci', 'CWS', '.766']],
      'hitting:homeRuns': [[1, 'Munetaka Murakami', 'CWS', '35'], [2, 'Miguel Vargas', 'CWS', '33'], [3, 'Colson Montgomery', 'CWS', '31']],
      'hitting:battingAverage': [[1, 'Sam Antonacci', 'CWS', '.277'], [2, 'Chase Meidroth', 'CWS', '.276'], [3, 'Miguel Vargas', 'CWS', '.250']],
      'hitting:stolenBases': [[1, 'Miguel Vargas', 'CWS', '22'], [2, 'Sam Antonacci', 'CWS', '20'], [3, 'Luisangel Acuña', 'CWS', '18']],
      'pitching:earnedRunAverage': [[1, 'Sean Burke', 'CWS', '3.34']],
      'pitching:strikeouts': [[1, 'Sean Burke', 'CWS', '185'], [2, 'Anthony Kay', 'CWS', '129'], [3, 'Davis Martin', 'CWS', '122']],
      'pitching:wins': [[1, 'Sean Burke', 'CWS', '11'], [2, 'Anthony Kay', 'CWS', '10'], [3, 'Davis Martin', 'CWS', '9']],
      'pitching:saves': [[1, 'Seranthony Domínguez', 'CWS', '12'], [2, 'Grant Taylor', 'CWS', '10'], [3, 'Bryan Hudson', 'CWS', '8']]
    }
  };

  /* Schedule window (game times in UTC). */
  function G(pk, date, day, away, home, round, num, ifNec, tv, pa, ph, tbd) {
    return { pk: pk, date: date, day: day, tbd: !!tbd, state: 'pre', detailed: 'Scheduled', away: { id: ID[away], score: null }, home: { id: ID[home], score: null },
      inning: '', outs: null, gameType: 'D', post: true, round: round, gameNum: num, gamesInSeries: 5, ifNec: ifNec, seriesNote: '', seriesStatus: null, tv: tv, probAway: pa || null, probHome: ph || null };
  }
  function F(pk, date, day, away, as, home, hs, round, num) {
    var g = G(pk, date, day, away, home, round, num, false, '');
    g.state = 'final'; g.detailed = 'Final'; g.away.score = as; g.home.score = hs;
    return g;
  }
  var NLDS = 'NL Division Series', ALDS = 'AL Division Series';
  var GAMES = [
    F(1, '2026-10-03T20:00:00Z', '2026-10-03', 'CWS', 3, 'CLE', 0, ALDS, 1),
    F(2, '2026-10-03T23:00:00Z', '2026-10-03', 'NYY', 0, 'TB', 1, ALDS, 1),
    F(3, '2026-10-03T22:00:00Z', '2026-10-03', 'ATL', 3, 'LAD', 5, NLDS, 1),
    F(4, '2026-10-03T19:00:00Z', '2026-10-03', 'SD', 2, 'MIL', 3, NLDS, 1),
    F(5, '2026-10-04T19:00:00Z', '2026-10-04', 'SD', 3, 'MIL', 4, NLDS, 2),
    F(6, '2026-10-04T22:00:00Z', '2026-10-04', 'ATL', 3, 'LAD', 2, NLDS, 2),
    G(7, '2026-10-06T22:00:00Z', '2026-10-06', 'LAD', 'ATL', NLDS, 3, false, 'FS1', 'Yoshinobu Yamamoto', 'Chris Sale'),
    G(8, '2026-10-07T01:30:00Z', '2026-10-06', 'MIL', 'SD', NLDS, 3, false, 'FS1', 'Dustin May', 'Nick Pivetta'),
    G(9, '2026-10-07T20:00:00Z', '2026-10-07', 'CLE', 'CWS', ALDS, 3, false, 'TBS'),
    G(10, '2026-10-07T22:00:00Z', '2026-10-07', 'LAD', 'ATL', NLDS, 4, false, 'FS1'),
    G(11, '2026-10-08T00:00:00Z', '2026-10-07', 'TB', 'NYY', ALDS, 3, false, 'TBS', 'Nick Martinez', 'Max Fried'),
    G(12, '2026-10-08T02:00:00Z', '2026-10-07', 'MIL', 'SD', NLDS, 4, true, 'FS1'),
    G(13, '2026-10-08T21:00:00Z', '2026-10-08', 'CLE', 'CWS', ALDS, 4, true, 'TBS'),
    G(14, '2026-10-09T00:00:00Z', '2026-10-08', 'TB', 'NYY', ALDS, 4, true, 'TBS'),
    G(15, '2026-10-09T20:30:00Z', '2026-10-09', 'SD', 'MIL', NLDS, 5, true, 'FS1'),
    G(16, '2026-10-10T00:00:00Z', '2026-10-09', 'ATL', 'LAD', NLDS, 5, true, 'FOX'),
    G(17, '2026-10-10T17:00:00Z', '2026-10-10', 'CWS', 'CLE', ALDS, 5, true, 'TBS', null, null, true),
    G(18, '2026-10-10T17:00:00Z', '2026-10-10', 'NYY', 'TB', ALDS, 5, true, 'TBS', null, null, true)
  ];
  var SERIES = [
    { round: ALDS, a: ID.CWS, aw: 2, b: ID.CLE, bw: 0, need: 3, over: false, note: '' },
    { round: ALDS, a: ID.TB, aw: 2, b: ID.NYY, bw: 0, need: 3, over: false, note: '' },
    { round: NLDS, a: ID.LAD, aw: 1, b: ID.ATL, bw: 1, need: 3, over: false, note: '' },
    { round: NLDS, a: ID.MIL, aw: 2, b: ID.SD, bw: 0, need: 3, over: false, note: '' }
  ];
  /* Illustrative in-progress scores for previewing the live ticker state (settings → sample live games). */
  var SAMPLE_LIVE = { 7: { as: 1, hs: 2, inning: 'Middle 6th', outs: null }, 8: { as: 1, hs: 2, inning: 'Top 6th', outs: 1 } };

  function build() {
    var standings = {};
    Object.keys(ST).forEach(function (a) {
      var r = ST[a], t = X.TEAM_BY_ID[ID[a]], sc = r[5];
      standings[ID[a]] = { w: r[0], l: r[1], pct: r[0] / (r[0] + r[1]), rd: r[2], rs: null, ra: null, gb: r[3], divRank: r[4], div: t.div,
        streak: sc, streakN: (sc.charAt(0) === 'W' ? 1 : -1) * parseInt(sc.slice(1), 10), l10: null, l10w: null, home: null, homePct: null, away: null, awayPct: null };
    });
    var hit = {}, pit = {};
    Object.keys(TS).forEach(function (a) {
      var r = TS[a];
      hit[ID[a]] = { avg: r[0], obp: r[1], slg: r[2], ops: r[3], homeRuns: r[4], stolenBases: r[5] };
      pit[ID[a]] = { era: r[6], strikeOuts: r[7], whip: r[8], saves: r[9] };
    });
    var pts = {};
    Object.keys(MONTHS).forEach(function (a) {
      var m = MONTHS[a], arr = [[0, 0]];
      for (var i = 0; i < 10; i += 2) arr.push([m[i], m[i + 1]]);
      arr.push([ST[a][0], ST[a][1]]);
      pts[ID[a]] = arr;
    });
    var leaders = {};
    Object.keys(L).forEach(function (scope) {
      var key = scope === 'MLB' ? 'MLB' : String(ID[scope]);
      leaders[key] = {};
      Object.keys(L[scope]).forEach(function (k) {
        leaders[key][k] = L[scope][k].map(function (r) { return { rank: r[0], name: r[1], teamId: ID[r[2]], value: r[3] }; });
      });
    });
    return {
      asOf: '2026-10-06T16:47:00Z', now: '2026-10-06T16:47:00Z', season: 2026, phase: 'post',
      standings: standings, teamStats: { hit: hit, pit: pit, fld: {} },
      race: { labels: ['Opening', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Final'], pts: pts },
      games: GAMES, series: SERIES, leaders: leaders, sampleLive: SAMPLE_LIVE
    };
  }

  X.SNAPSHOT = build();
})();
