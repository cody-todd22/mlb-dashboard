/* MLB Live Board · Football modes (NFL and FBS college football) — static catalog: teams with colors,
 * divisions and conferences, ESPN stat categories, club metrics, chart options and defaults.
 * Team ids are ESPN ids. Colors come from nflverse (NFL) and collegefootballdata.com (FBS) and are
 * approximations; header fills are deepened where needed so white text stays legible. */
(function () {
  'use strict';
  var X = (window.MLBX = window.MLBX || {});
  var F = (X.Football = X.Football || {});

  F.ESPN_SITE = 'https://site.api.espn.com/apis/site/v2/sports/football/';
  F.ESPN_STANDINGS = 'https://site.api.espn.com/apis/v2/sports/football/';
  F.ESPN_STATS = 'https://site.web.api.espn.com/apis/common/v3/sports/football/';

  /* colors: [header fill, accent, text on accent, mark on light, mark on dark, ticker accent] */
  function colors(o, c) { o.primary = c[0]; o.secondary = c[1]; o.onSecondary = c[2]; o.inkLight = c[3]; o.inkDark = c[4]; o.tick = c[5]; return o; }
  function T(id, abbr, school, nick, group, c, conf) { return colors({ id: id, abbr: abbr, school: school, nick: nick, name: nick || school, full: (school + ' ' + nick).trim(), group: group, conf: conf || null }, c); }
  function G(id, abbr, full, c, conf) { return colors({ id: id, abbr: abbr, name: abbr, full: full, conf: conf || null }, c); }

  F.LEAGUES = {};
  F.LEAGUES.nfl = {
    id: 'nfl', path: 'nfl', label: 'NFL', allLabel: 'All NFL', groupLabel: 'Division', groupWord: 'division', title: 'National Football League',
    root: colors({ id: 'ALL', abbr: 'NFL', name: 'NFL', full: 'National Football League' }, ['#013369', '#D50A0A', '#FFFFFF', '#013369', '#8DB3EE', '#F2A7A7']),
    groups: [
    G("afc-east", "AFC East", "AFC East", ["#B0102A", "#FFFFFF", "#B0102A", "#B0102A", "#EE425E", "#F4889A"], "AFC"),
    G("afc-north", "AFC North", "AFC North", ["#B0102A", "#FFFFFF", "#B0102A", "#B0102A", "#EE425E", "#F4889A"], "AFC"),
    G("afc-south", "AFC South", "AFC South", ["#B0102A", "#FFFFFF", "#B0102A", "#B0102A", "#EE425E", "#F4889A"], "AFC"),
    G("afc-west", "AFC West", "AFC West", ["#B0102A", "#FFFFFF", "#B0102A", "#B0102A", "#EE425E", "#F4889A"], "AFC"),
    G("nfc-east", "NFC East", "NFC East", ["#013369", "#FFFFFF", "#013369", "#013369", "#2083ED", "#2083ED"], "NFC"),
    G("nfc-north", "NFC North", "NFC North", ["#013369", "#FFFFFF", "#013369", "#013369", "#2083ED", "#2083ED"], "NFC"),
    G("nfc-south", "NFC South", "NFC South", ["#013369", "#FFFFFF", "#013369", "#013369", "#2083ED", "#2083ED"], "NFC"),
    G("nfc-west", "NFC West", "NFC West", ["#013369", "#FFFFFF", "#013369", "#013369", "#2083ED", "#2083ED"], "NFC")
    ],
    teams: [
    T("22", "ARI", "Arizona", "Cardinals", "nfc-west", ["#97233F", "#000000", "#FFFFFF", "#97233F", "#D85776", "#E3859B"], "NFC"),
    T("1", "ATL", "Atlanta", "Falcons", "nfc-south", ["#A71930", "#000000", "#FFFFFF", "#A71930", "#E44C65", "#EE8A9A"], "NFC"),
    T("33", "BAL", "Baltimore", "Ravens", "afc-north", ["#241773", "#9E7C0C", "#111418", "#241773", "#8373E3", "#8373E3"], "AFC"),
    T("2", "BUF", "Buffalo", "Bills", "afc-east", ["#00338D", "#FFFFFF", "#00338D", "#00338D", "#4180F0", "#4583F0"], "AFC"),
    T("29", "CAR", "Carolina", "Panthers", "nfc-south", ["#000000", "#0085CA", "#000000", "#000000", "#108AC9", "#108AC9"], "NFC"),
    T("3", "CHI", "Chicago", "Bears", "nfc-north", ["#0B162A", "#E64100", "#111418", "#0B162A", "#5783D3", "#5783D3"], "NFC"),
    T("4", "CIN", "Cincinnati", "Bengals", "afc-north", ["#000000", "#FB4F14", "#000000", "#000000", "#FB4F14", "#FB4F14"], "AFC"),
    T("5", "CLE", "Cleveland", "Browns", "afc-north", ["#311D00", "#FF3C00", "#311D00", "#311D00", "#FF3C00", "#FF3C00"], "AFC"),
    T("6", "DAL", "Dallas", "Cowboys", "nfc-east", ["#002244", "#B0B7BC", "#002244", "#002244", "#1983EC", "#1983EC"], "NFC"),
    T("7", "DEN", "Denver", "Broncos", "afc-west", ["#002244", "#FB4F14", "#002244", "#002244", "#1983EC", "#1983EC"], "AFC"),
    T("8", "DET", "Detroit", "Lions", "nfc-north", ["#0076B6", "#FFFFFF", "#0076B6", "#0076B6", "#118BCE", "#91D3F6"], "NFC"),
    T("9", "GB", "Green Bay", "Packers", "nfc-north", ["#203731", "#FFB612", "#203731", "#203731", "#538E7F", "#538E7F"], "NFC"),
    T("34", "HOU", "Houston", "Texans", "afc-south", ["#03202F", "#FFFFFF", "#03202F", "#03202F", "#108BCA", "#108BCA"], "AFC"),
    T("11", "IND", "Indianapolis", "Colts", "afc-south", ["#002C5F", "#A5ACAF", "#002C5F", "#002C5F", "#2984EE", "#2984EE"], "AFC"),
    T("30", "JAX", "Jacksonville", "Jaguars", "afc-south", ["#006778", "#000000", "#FFFFFF", "#006778", "#0E92A8", "#12C3E0"], "AFC"),
    T("12", "KC", "Kansas City", "Chiefs", "afc-west", ["#E31837", "#FFB612", "#111418", "#E31837", "#EB435D", "#F9C4CC"], "AFC"),
    T("24", "LAC", "Los Angeles", "Chargers", "afc-west", ["#007BC7", "#FFC20E", "#111418", "#007BC7", "#118AD4", "#AADAF8"], "AFC"),
    T("14", "LAR", "Los Angeles", "Rams", "nfc-west", ["#003594", "#FFD100", "#003594", "#003594", "#4280F0", "#4C87F0"], "NFC"),
    T("13", "LV", "Las Vegas", "Raiders", "afc-west", ["#000000", "#A5ACAF", "#000000", "#000000", "#828282", "#828282"], "AFC"),
    T("15", "MIA", "Miami", "Dolphins", "afc-east", ["#008088", "#FFFFFF", "#008088", "#008E97", "#0C919A", "#2EE3EE"], "AFC"),
    T("16", "MIN", "Minnesota", "Vikings", "nfc-north", ["#4F2683", "#FFC62F", "#4F2683", "#4F2683", "#9B6DD5", "#A075D7"], "NFC"),
    T("17", "NE", "New England", "Patriots", "afc-east", ["#002244", "#C60C30", "#FFFFFF", "#002244", "#1983EC", "#1983EC"], "AFC"),
    T("18", "NO", "New Orleans", "Saints", "nfc-south", ["#000000", "#D3BC8D", "#000000", "#000000", "#D3BC8D", "#D3BC8D"], "NFC"),
    T("19", "NYG", "New York", "Giants", "nfc-east", ["#0B2265", "#FFFFFF", "#0B2265", "#0B2265", "#597FED", "#597FED"], "NFC"),
    T("20", "NYJ", "New York", "Jets", "afc-east", ["#003F2D", "#FFFFFF", "#003F2D", "#003F2D", "#0C9971", "#0C9971"], "AFC"),
    T("21", "PHI", "Philadelphia", "Eagles", "nfc-east", ["#004C54", "#A5ACAF", "#111418", "#004C54", "#0D909E", "#0EA1B1"], "NFC"),
    T("23", "PIT", "Pittsburgh", "Steelers", "afc-north", ["#000000", "#FFB612", "#000000", "#000000", "#FFB612", "#FFB612"], "AFC"),
    T("26", "SEA", "Seattle", "Seahawks", "nfc-west", ["#002244", "#69BE28", "#002244", "#002244", "#1983EC", "#1983EC"], "NFC"),
    T("25", "SF", "San Francisco", "49ers", "nfc-west", ["#AA0000", "#B3995D", "#111418", "#AA0000", "#EF3F3F", "#F58181"], "NFC"),
    T("27", "TB", "Tampa Bay", "Buccaneers", "nfc-south", ["#A71930", "#FFFFFF", "#A71930", "#A71930", "#E44C65", "#EE8A9A"], "NFC"),
    T("10", "TEN", "Tennessee", "Titans", "afc-south", ["#2C7BB7", "#FFFFFF", "#2C7BB7", "#4495D2", "#4495D2", "#BBD9EF"], "AFC"),
    T("28", "WSH", "Washington", "Commanders", "nfc-east", ["#5A1414", "#FFB612", "#5A1414", "#5A1414", "#DA5A5A", "#DA5A5A"], "NFC")
    ]
  };
  F.LEAGUES.cfb = {
    id: 'cfb', path: 'college-football', label: 'College football', allLabel: 'All FBS', groupLabel: 'Conference', groupWord: 'conference', title: 'FBS College Football', groupsParam: '80',
    root: colors({ id: 'ALL', abbr: 'FBS', name: 'FBS', full: 'FBS College Football' }, ['#1B2A41', '#C9A227', '#1B2A41', '#1B2A41', '#8DB3EE', '#E8C766']),
    groups: [
    G("acc", "ACC", "Atlantic Coast Conference", ["#013CA6", "#C9A227", "#111418", "#013CA6", "#417FF0", "#598FF2"]),
    G("american", "American", "American Athletic Conference", ["#0E2240", "#C8102E", "#FFFFFF", "#0E2240", "#4C84D8", "#4C84D8"]),
    G("big-12", "Big 12", "Big 12 Conference", ["#1B365D", "#FFFFFF", "#1B365D", "#1B365D", "#5385CD", "#5385CD"]),
    G("big-ten", "Big Ten", "Big Ten Conference", ["#0B2A55", "#8DA9C4", "#0B2A55", "#0B2A55", "#3C83E6", "#3C83E6"]),
    G("cusa", "Conference USA", "Conference USA", ["#12284C", "#FFFFFF", "#12284C", "#12284C", "#4F82D5", "#4F82D5"]),
    G("ind", "Independents", "FBS Independents", ["#2E3640", "#A7B1BC", "#2E3640", "#2E3640", "#72849A", "#72849A"]),
    G("mac", "MAC", "Mid-American Conference", ["#003865", "#7FB539", "#003865", "#003865", "#1285E2", "#1285E2"]),
    G("mwc", "Mountain West", "Mountain West Conference", ["#002D56", "#8A8D8F", "#111418", "#002D56", "#1384EB", "#1384EB"]),
    G("pac-12", "Pac-12", "Pac-12 Conference", ["#1E2A3A", "#5DA9E9", "#1E2A3A", "#1E2A3A", "#6585AF", "#6585AF"]),
    G("sec", "SEC", "Southeastern Conference", ["#002B5C", "#D4A12A", "#002B5C", "#002B5C", "#2683ED", "#2683ED"]),
    G("sun-belt", "Sun Belt", "Sun Belt Conference", ["#002B5C", "#FFC72C", "#002B5C", "#002B5C", "#2683ED", "#2683ED"])
    ],
    teams: [
    T("2005", "AF", "Air Force", "Falcons", "mwc", ["#003594", "#FFFFFF", "#003594", "#003594", "#4280F0", "#4C87F0"]),
    T("2006", "AKR", "Akron", "Zips", "mac", ["#041E42", "#A89968", "#041E42", "#041E42", "#3382EE", "#3382EE"]),
    T("333", "ALA", "Alabama", "Crimson Tide", "sec", ["#9E1B32", "#FFFFFF", "#9E1B32", "#9E1B32", "#E1526B", "#EA8294"]),
    T("2026", "APP", "App State", "Mountaineers", "sun-belt", ["#000000", "#FFCD00", "#000000", "#000000", "#FFCD00", "#FFCD00"]),
    T("12", "ARIZ", "Arizona", "Wildcats", "big-12", ["#CC0033", "#FFFFFF", "#CC0033", "#CC0033", "#EF3E6A", "#F8A5BA"]),
    T("9", "ASU", "Arizona State", "Sun Devils", "big-12", ["#8C1D40", "#FFC627", "#8C1D40", "#8C1D40", "#FFC627", "#FFC627"]),
    T("8", "ARK", "Arkansas", "Razorbacks", "sec", ["#A32136", "#FFFFFF", "#A32136", "#A32136", "#DC5369", "#E78A99"]),
    T("2032", "ARST", "Arkansas State", "Red Wolves", "sun-belt", ["#CC092F", "#000000", "#FFFFFF", "#CC092F", "#EF3C5F", "#F8A4B5"]),
    T("349", "ARMY", "Army", "Black Knights", "american", ["#000000", "#D3BC8D", "#000000", "#000000", "#D3BC8D", "#D3BC8D"]),
    T("2", "AUB", "Auburn", "Tigers", "sec", ["#0C2340", "#F26522", "#0C2340", "#0C2340", "#4286DB", "#4286DB"]),
    T("252", "BYU", "BYU", "Cougars", "big-12", ["#003DA5", "#FFFFFF", "#003DA5", "#003DA5", "#3F80EF", "#5790F1"]),
    T("2050", "BALL", "Ball State", "Cardinals", "mac", ["#BA0C2F", "#FFFFFF", "#BA0C2F", "#BA0C2F", "#EF3D61", "#F692A6"]),
    T("239", "BAY", "Baylor", "Bears", "big-12", ["#154734", "#FFB81C", "#154734", "#154734", "#2C966E", "#2D9A71"]),
    T("68", "BOIS", "Boise State", "Broncos", "pac-12", ["#0033A0", "#FFFFFF", "#0033A0", "#0033A0", "#497EF0", "#5285F1"]),
    T("103", "BC", "Boston College", "Eagles", "acc", ["#8C2232", "#DBCCA6", "#8C2232", "#8C2232", "#D75B6E", "#DF7C8B"]),
    T("189", "BGSU", "Bowling Green", "Falcons", "mac", ["#D44300", "#4F2C1D", "#FFFFFF", "#FD5000", "#FD5000", "#F9C8B2"]),
    T("2084", "BUF", "Buffalo", "Bulls", "mac", ["#005BBB", "#FFFFFF", "#005BBB", "#005BBB", "#2084ED", "#79B5F4"]),
    T("25", "CAL", "California", "Golden Bears", "acc", ["#041E42", "#FFC72C", "#041E42", "#041E42", "#3382EE", "#3382EE"]),
    T("2117", "CMU", "Central Michigan", "Chippewas", "mac", ["#6A0032", "#FFC82E", "#6A0032", "#6A0032", "#EE338B", "#EE338B"]),
    T("2429", "CLT", "Charlotte", "49ers", "american", ["#005035", "#A49665", "#111418", "#005035", "#0C9567", "#0EA874"]),
    T("2132", "CIN", "Cincinnati", "Bearcats", "big-12", ["#000000", "#E00122", "#FFFFFF", "#000000", "#EF3E58", "#EF3E58"]),
    T("228", "CLEM", "Clemson", "Tigers", "acc", ["#C75300", "#FFFFFF", "#C75300", "#F56600", "#F56600", "#F8CBAA"]),
    T("324", "CCU", "Coastal Carolina", "Chanticleers", "sun-belt", ["#006F71", "#FFFFFF", "#006F71", "#006F71", "#0C9598", "#11CDD0"]),
    T("38", "COLO", "Colorado", "Buffaloes", "big-12", ["#000000", "#CFB87C", "#000000", "#000000", "#CFB87C", "#CFB87C"]),
    T("36", "CSU", "Colorado State", "Rams", "pac-12", ["#1E4D2B", "#C8C372", "#1E4D2B", "#1E4D2B", "#3B9654", "#3FA15A"]),
    T("48", "DEL", "Delaware", "Blue Hens", "cusa", ["#00539F", "#FFD200", "#00539F", "#00539F", "#1485EC", "#5BAAF2"]),
    T("150", "DUKE", "Duke", "Blue Devils", "acc", ["#00539B", "#FFFFFF", "#00539B", "#00539B", "#1386E9", "#52A7F1"]),
    T("151", "ECU", "East Carolina", "Pirates", "american", ["#592A8A", "#FDC82F", "#592A8A", "#592A8A", "#9E6CD2", "#A87BD7"]),
    T("2199", "EMU", "Eastern Michigan", "Eagles", "mac", ["#046A38", "#FFFFFF", "#046A38", "#046A38", "#0C9A54", "#10C96E"]),
    T("57", "FLA", "Florida", "Gators", "sec", ["#0021A5", "#FA4616", "#111418", "#0021A5", "#5C7AF2", "#5C7AF2"]),
    T("2226", "FAU", "Florida Atlantic", "Owls", "american", ["#003366", "#FFFFFF", "#003366", "#003366", "#1D85ED", "#1D85ED"]),
    T("2229", "FIU", "Florida International", "Panthers", "cusa", ["#091F3F", "#C3993F", "#091F3F", "#091F3F", "#4082E4", "#4082E4"]),
    T("52", "FSU", "Florida State", "Seminoles", "acc", ["#782F40", "#CEB888", "#782F40", "#782F40", "#C4687D", "#CC7E90"]),
    T("278", "FRES", "Fresno State", "Bulldogs", "pac-12", ["#C41230", "#FFFFFF", "#C41230", "#C41230", "#ED3F5D", "#F6A1B0"]),
    T("61", "UGA", "Georgia", "Bulldogs", "sec", ["#BA0C2F", "#FFFFFF", "#BA0C2F", "#BA0C2F", "#EF3D61", "#F692A6"]),
    T("290", "GASO", "Georgia Southern", "Eagles", "sun-belt", ["#041E42", "#FFFFFF", "#041E42", "#041E42", "#3382EE", "#3382EE"]),
    T("2247", "GAST", "Georgia State", "Panthers", "sun-belt", ["#0039A6", "#FFFFFF", "#0039A6", "#0039A6", "#4580F0", "#588DF1"]),
    T("59", "GT", "Georgia Tech", "Yellow Jackets", "acc", ["#837542", "#FFFFFF", "#837542", "#A59353", "#B3A369", "#DAD3B7"]),
    T("62", "HAW", "Hawai'i", "Rainbow Warriors", "mwc", ["#024731", "#FFFFFF", "#024731", "#024731", "#0C986C", "#0D9D6F"]),
    T("248", "HOU", "Houston", "Cougars", "big-12", ["#C8102E", "#FFFFFF", "#C8102E", "#C8102E", "#EF3F5C", "#F7A2B0"]),
    T("356", "ILL", "Illinois", "Fighting Illini", "big-ten", ["#CC4900", "#13294B", "#FFFFFF", "#FF5F05", "#FF5F05", "#F8C6AA"]),
    T("84", "IU", "Indiana", "Hoosiers", "big-ten", ["#990000", "#FFFFFF", "#990000", "#990000", "#F04242", "#F36D6D"]),
    T("2294", "IOWA", "Iowa", "Hawkeyes", "big-ten", ["#000000", "#FFCD00", "#000000", "#000000", "#FFCD00", "#FFCD00"]),
    T("66", "ISU", "Iowa State", "Cyclones", "big-12", ["#C8102E", "#F1BE48", "#111418", "#C8102E", "#EF3F5C", "#F7A2B0"]),
    T("55", "JXST", "Jacksonville State", "Gamecocks", "cusa", ["#CC0000", "#000000", "#FFFFFF", "#CC0000", "#F04242", "#F8A5A5"]),
    T("256", "JMU", "James Madison", "Dukes", "sun-belt", ["#450084", "#CBB677", "#450084", "#450084", "#AB5EF2", "#AB5EF2"]),
    T("2305", "KU", "Kansas", "Jayhawks", "big-12", ["#0051BA", "#FFFFFF", "#0051BA", "#0051BA", "#2D81EE", "#74ABF4"]),
    T("2306", "KSU", "Kansas State", "Wildcats", "big-12", ["#512888", "#FFFFFF", "#512888", "#512888", "#9B6FD5", "#A077D7"]),
    T("338", "KENN", "Kennesaw State", "Owls", "cusa", ["#0B1315", "#FDBB30", "#0B1315", "#0B1315", "#FDBB30", "#FDBB30"]),
    T("2309", "KENT", "Kent State", "Golden Flashes", "mac", ["#002664", "#EAAB00", "#002664", "#002664", "#3C80EF", "#3C80EF"]),
    T("96", "UK", "Kentucky", "Wildcats", "sec", ["#0033A0", "#FFFFFF", "#0033A0", "#0033A0", "#497EF0", "#5285F1"]),
    T("99", "LSU", "LSU", "Tigers", "sec", ["#461D7C", "#FDD023", "#461D7C", "#461D7C", "#9B6ADC", "#9B6ADC"]),
    T("2335", "LIB", "Liberty", "Flames", "cusa", ["#0A254E", "#FFFFFF", "#0A254E", "#0A254E", "#3E81E6", "#3E81E6"]),
    T("309", "UL", "Louisiana", "Ragin' Cajuns", "sun-belt", ["#CE181E", "#000000", "#FFFFFF", "#CE181E", "#EA494E", "#F5ADB0"]),
    T("2348", "LT", "Louisiana Tech", "Bulldogs", "sun-belt", ["#003087", "#FFFFFF", "#003087", "#003087", "#4581F0", "#4581F0"]),
    T("97", "LOU", "Louisville", "Cardinals", "acc", ["#C9001F", "#000000", "#FFFFFF", "#C9001F", "#EF405B", "#F8A3B0"]),
    T("276", "MRSH", "Marshall", "Thundering Herd", "sun-belt", ["#000000", "#00B140", "#000000", "#000000", "#00B140", "#00B140"]),
    T("120", "MD", "Maryland", "Terrapins", "big-ten", ["#CE1126", "#FFFFFF", "#CE1126", "#CE1126", "#EF4155", "#F8A9B2"]),
    T("113", "MASS", "Massachusetts", "Minutemen", "mac", ["#881C1C", "#FFFFFF", "#881C1C", "#881C1C", "#DC5656", "#E27070"]),
    T("235", "MEM", "Memphis", "Tigers", "american", ["#00498F", "#9C9EA1", "#111418", "#00498F", "#1884EC", "#429BF0"]),
    T("2390", "MIA", "Miami", "Hurricanes", "acc", ["#005030", "#F47321", "#111418", "#005030", "#F47321", "#F47321"]),
    T("193", "M-OH", "Miami (OH)", "RedHawks", "mac", ["#C41230", "#FFFFFF", "#C41230", "#C41230", "#ED3F5D", "#F6A1B0"]),
    T("130", "MICH", "Michigan", "Wolverines", "big-ten", ["#00274C", "#FFCB05", "#00274C", "#00274C", "#1785EC", "#1785EC"]),
    T("127", "MSU", "Michigan State", "Spartans", "big-ten", ["#173F35", "#FFFFFF", "#173F35", "#173F35", "#35917A", "#35917A"]),
    T("2393", "MTSU", "Middle Tennessee", "Blue Raiders", "cusa", ["#036EB7", "#FFFFFF", "#036EB7", "#036EB7", "#128ADB", "#8BCAF6"]),
    T("135", "MINN", "Minnesota", "Golden Gophers", "big-ten", ["#7A0019", "#FFCC33", "#7A0019", "#7A0019", "#EF3D62", "#EF3D62"]),
    T("344", "MSST", "Mississippi State", "Bulldogs", "sec", ["#5D1725", "#C1C6C8", "#5D1725", "#5D1725", "#D65A73", "#D65A73"]),
    T("142", "MIZ", "Missouri", "Tigers", "sec", ["#000000", "#F1B82D", "#000000", "#000000", "#F1B82D", "#F1B82D"]),
    T("2623", "MOST", "Missouri State", "Bears", "cusa", ["#5E0009", "#FFFFFF", "#5E0009", "#5E0009", "#EF4050", "#EF4050"]),
    T("152", "NCSU", "NC State", "Wolfpack", "acc", ["#CC0000", "#FFFFFF", "#CC0000", "#CC0000", "#F04242", "#F8A5A5"]),
    T("2426", "NAVY", "Navy", "Midshipmen", "american", ["#00225B", "#B5A67C", "#00225B", "#00225B", "#3D80EF", "#3D80EF"]),
    T("158", "NEB", "Nebraska", "Cornhuskers", "big-ten", ["#D00000", "#FFFFFF", "#D00000", "#D00000", "#F04141", "#F8A9A9"]),
    T("2440", "NEV", "Nevada", "Wolf Pack", "mwc", ["#041E42", "#8A8D8F", "#041E42", "#041E42", "#3382EE", "#3382EE"]),
    T("167", "UNM", "New Mexico", "Lobos", "mwc", ["#BA0C2F", "#A7A8AA", "#111418", "#BA0C2F", "#EF3D61", "#F692A6"]),
    T("166", "NMSU", "New Mexico State", "Aggies", "cusa", ["#8C0B42", "#FFFFFF", "#8C0B42", "#8C0B42", "#EF3785", "#F25D9C"]),
    T("153", "UNC", "North Carolina", "Tar Heels", "acc", ["#13294B", "#7BAFD4", "#13294B", "#13294B", "#7BAFD4", "#7BAFD4"]),
    T("2449", "NDSU", "North Dakota State", "Bison", "mwc", ["#00583D", "#FFC425", "#00583D", "#00583D", "#0C986D", "#0EB07E"]),
    T("249", "UNT", "North Texas", "Mean Green", "american", ["#00853E", "#FFFFFF", "#00853E", "#00853E", "#0C974D", "#13EC78"]),
    T("2459", "NIU", "Northern Illinois", "Huskies", "mwc", ["#C8102E", "#000000", "#FFFFFF", "#C8102E", "#EF3F5C", "#F7A2B0"]),
    T("77", "NU", "Northwestern", "Wildcats", "big-ten", ["#582C83", "#FFFFFF", "#582C83", "#582C83", "#9F6FCF", "#A77BD3"]),
    T("87", "ND", "Notre Dame", "Fighting Irish", "ind", ["#0C2340", "#C99700", "#0C2340", "#0C2340", "#4286DB", "#4286DB"]),
    T("195", "OHIO", "Ohio", "Bobcats", "mac", ["#024230", "#FFFFFF", "#024230", "#024230", "#0C9971", "#0C9971"]),
    T("194", "OSU", "Ohio State", "Buckeyes", "big-ten", ["#BA0C2F", "#A7B1B7", "#111418", "#BA0C2F", "#EF3D61", "#F692A6"]),
    T("201", "OU", "Oklahoma", "Sooners", "sec", ["#841617", "#FFFFFF", "#841617", "#841617", "#E25152", "#E66768"]),
    T("197", "OKST", "Oklahoma State", "Cowboys", "big-12", ["#000000", "#FE5C00", "#000000", "#000000", "#FE5C00", "#FE5C00"]),
    T("295", "ODU", "Old Dominion", "Monarchs", "sun-belt", ["#043657", "#98C5EA", "#043657", "#043657", "#1289D8", "#1289D8"]),
    T("145", "MISS", "Ole Miss", "Rebels", "sec", ["#13294B", "#CF142B", "#FFFFFF", "#13294B", "#5285D3", "#5285D3"]),
    T("2483", "ORE", "Oregon", "Ducks", "big-ten", ["#007030", "#FEE11A", "#007030", "#007030", "#0C9748", "#11CF62"]),
    T("204", "ORST", "Oregon State", "Beavers", "pac-12", ["#000000", "#DC4405", "#000000", "#000000", "#E85113", "#E85113"]),
    T("213", "PSU", "Penn State", "Nittany Lions", "big-ten", ["#001E44", "#FFFFFF", "#001E44", "#001E44", "#2C82EE", "#2C82EE"]),
    T("221", "PITT", "Pittsburgh", "Panthers", "acc", ["#003594", "#FFB81C", "#003594", "#003594", "#4280F0", "#4C87F0"]),
    T("2509", "PUR", "Purdue", "Boilermakers", "big-ten", ["#000000", "#CEB888", "#000000", "#000000", "#CEB888", "#CEB888"]),
    T("242", "RICE", "Rice", "Owls", "american", ["#00205B", "#C1C6C8", "#00205B", "#00205B", "#427FF0", "#427FF0"]),
    T("164", "RUTG", "Rutgers", "Scarlet Knights", "big-ten", ["#CE0E2D", "#FFFFFF", "#CE0E2D", "#CE0E2D", "#EF3E5B", "#F8ABB7"]),
    T("2567", "SMU", "SMU", "Mustangs", "acc", ["#D70000", "#FFFFFF", "#D70000", "#D70000", "#F04343", "#F9B0B0"]),
    T("16", "SAC", "Sacramento State", "Hornets", "mac", ["#00573C", "#CDB97D", "#111418", "#00573C", "#0C976C", "#0EAF7D"]),
    T("2534", "SHSU", "Sam Houston", "Bearkats", "cusa", ["#D1470A", "#FFFFFF", "#D1470A", "#F56423", "#F56423", "#F9C9B3"]),
    T("21", "SDSU", "San Diego State", "Aztecs", "pac-12", ["#A6192E", "#000000", "#FFFFFF", "#A6192E", "#E44B62", "#ED8998"]),
    T("23", "SJSU", "San José State", "Spartans", "mwc", ["#0055A2", "#E5A823", "#111418", "#0055A2", "#1384EB", "#5DABF2"]),
    T("6", "USA", "South Alabama", "Jaguars", "sun-belt", ["#00205B", "#FFFFFF", "#00205B", "#00205B", "#427FF0", "#427FF0"]),
    T("2579", "SC", "South Carolina", "Gamecocks", "sec", ["#73000A", "#FFFFFF", "#73000A", "#73000A", "#F0404F", "#F0404F"]),
    T("58", "USF", "South Florida", "Bulls", "american", ["#006747", "#CFC493", "#111418", "#006747", "#0C986D", "#10C28B"]),
    T("2572", "USM", "Southern Miss", "Golden Eagles", "sun-belt", ["#231F20", "#FFC72C", "#231F20", "#231F20", "#FFC72C", "#FFC72C"]),
    T("24", "STAN", "Stanford", "Cardinal", "acc", ["#8C1515", "#FFFFFF", "#8C1515", "#8C1515", "#E55050", "#E96B6B"]),
    T("183", "SYR", "Syracuse", "Orange", "acc", ["#000E54", "#F76900", "#000E54", "#000E54", "#F76900", "#F76900"]),
    T("2628", "TCU", "TCU", "Horned Frogs", "big-12", ["#4D1979", "#FFFFFF", "#4D1979", "#4D1979", "#A765DF", "#A765DF"]),
    T("218", "TEM", "Temple", "Owls", "american", ["#A41E35", "#FFFFFF", "#A41E35", "#A41E35", "#DF536B", "#EA8B9B"]),
    T("2633", "TENN", "Tennessee", "Volunteers", "sec", ["#B85E00", "#FFFFFF", "#B85E00", "#E57500", "#FF8200", "#F7CA9C"]),
    T("251", "TEX", "Texas", "Longhorns", "sec", ["#BF5700", "#FFFFFF", "#BF5700", "#BF5700", "#CD6611", "#F8C9A3"]),
    T("245", "TA&M", "Texas A&M", "Aggies", "sec", ["#500000", "#FFFFFF", "#500000", "#500000", "#F04141", "#F04141"]),
    T("326", "TXST", "Texas State", "Bobcats", "pac-12", ["#501214", "#FFFFFF", "#501214", "#501214", "#DA595E", "#DA595E"]),
    T("2641", "TTU", "Texas Tech", "Red Raiders", "big-12", ["#C30020", "#000000", "#FFFFFF", "#C30020", "#EF3F5C", "#F79DAC"]),
    T("2649", "TOL", "Toledo", "Rockets", "mac", ["#0B2240", "#FFCD00", "#0B2240", "#0B2240", "#3E84DE", "#3E84DE"]),
    T("2653", "TROY", "Troy", "Trojans", "sun-belt", ["#862633", "#B1B1B1", "#111418", "#862633", "#D25F6F", "#DA7B88"]),
    T("2655", "TULN", "Tulane", "Green Wave", "american", ["#006747", "#FFFFFF", "#006747", "#006747", "#0C986D", "#10C28B"]),
    T("202", "TLSA", "Tulsa", "Golden Hurricane", "american", ["#003595", "#D0B787", "#003595", "#003595", "#4381F0", "#4D87F1"]),
    T("5", "UAB", "UAB", "Blazers", "american", ["#1A5632", "#FDB913", "#1A5632", "#1A5632", "#2D9556", "#35B066"]),
    T("2116", "UCF", "UCF", "Knights", "big-12", ["#000000", "#B4A169", "#000000", "#000000", "#B4A169", "#B4A169"]),
    T("26", "UCLA", "UCLA", "Bruins", "big-ten", ["#2774AE", "#FFFFFF", "#2774AE", "#2774AE", "#2E87CB", "#A7CEEB"]),
    T("41", "CONN", "UConn", "Huskies", "ind", ["#000E2F", "#FFFFFF", "#000E2F", "#000E2F", "#4D7EF1", "#4D7EF1"]),
    T("2433", "ULM", "UL Monroe", "Warhawks", "sun-belt", ["#840029", "#FDB913", "#840029", "#840029", "#EF3871", "#F15082"]),
    T("2439", "UNLV", "UNLV", "Rebels", "mwc", ["#CF0A2C", "#CAC8C8", "#111418", "#CF0A2C", "#F0405E", "#F8A8B6"]),
    T("30", "USC", "USC", "Trojans", "big-ten", ["#990000", "#FFCC00", "#990000", "#990000", "#F04242", "#F36D6D"]),
    T("2638", "UTEP", "UTEP", "Miners", "mwc", ["#041E42", "#FF8200", "#041E42", "#041E42", "#FF8200", "#FF8200"]),
    T("2636", "UTSA", "UTSA", "Roadrunners", "american", ["#0C2340", "#F15A22", "#0C2340", "#0C2340", "#4286DB", "#4286DB"]),
    T("254", "UTAH", "Utah", "Utes", "big-12", ["#BE0000", "#FFFFFF", "#BE0000", "#BE0000", "#F04444", "#F69494"]),
    T("328", "USU", "Utah State", "Aggies", "pac-12", ["#0F2439", "#FFFFFF", "#0F2439", "#0F2439", "#4287CD", "#4287CD"]),
    T("238", "VAN", "Vanderbilt", "Commodores", "sec", ["#000000", "#CFAE70", "#000000", "#000000", "#CFAE70", "#CFAE70"]),
    T("258", "UVA", "Virginia", "Cavaliers", "acc", ["#232D4B", "#F84C1E", "#111418", "#232D4B", "#6F82BC", "#6F82BC"]),
    T("259", "VT", "Virginia Tech", "Hokies", "acc", ["#861F41", "#E87722", "#111418", "#861F41", "#D85781", "#DF7497"]),
    T("154", "WAKE", "Wake Forest", "Demon Deacons", "acc", ["#8D733A", "#2C2A29", "#FFFFFF", "#B19049", "#CEB888", "#E0D2B3"]),
    T("264", "WASH", "Washington", "Huskies", "big-ten", ["#33006F", "#E8D3A2", "#33006F", "#33006F", "#A462F2", "#A462F2"]),
    T("265", "WSU", "Washington State", "Cougars", "pac-12", ["#A60F2D", "#FFFFFF", "#A60F2D", "#A60F2D", "#EE4264", "#F37E96"]),
    T("277", "WVU", "West Virginia", "Mountaineers", "big-12", ["#002855", "#EAAA00", "#002855", "#002855", "#EAAA00", "#EAAA00"]),
    T("98", "WKU", "Western Kentucky", "Hilltoppers", "cusa", ["#C60C30", "#FFFFFF", "#C60C30", "#C60C30", "#EF3E61", "#F7A1B2"]),
    T("2711", "WMU", "Western Michigan", "Broncos", "mac", ["#532E1F", "#F1C500", "#532E1F", "#532E1F", "#BD6E4E", "#BD6E4E"]),
    T("275", "WIS", "Wisconsin", "Badgers", "big-ten", ["#A00000", "#FFFFFF", "#A00000", "#A00000", "#EF3F3F", "#F47373"]),
    T("2751", "WYO", "Wyoming", "Cowboys", "mwc", ["#492F24", "#FFC425", "#492F24", "#492F24", "#AF755C", "#AF755C"])
    ]
  };

  /*
   * Player leaderboards, from ESPN's statistics/byathlete feed. cat + field = the stat's place in that
   * feed (sort=<cat>.<field>:desc). q = the feed's category filter. rate = a per-attempt or per-game
   * figure, ranked among qualified players only (otherwise one 40-yard carry would top yards per carry).
   */
  function P(cat, field, short, name, q, grp, extra) {
    var s = { key: cat + '.' + field, cat: cat, field: field, short: short, name: name, q: q, group: grp };
    for (var k in extra || {}) s[k] = extra[k];
    return s;
  }
  var RATE = { rate: true };
  F.STAT_GROUPS = [{ id: 'passing', label: 'Passing' }, { id: 'rushing', label: 'Rushing' }, { id: 'receiving', label: 'Receiving' },
    { id: 'defense', label: 'Defense' }, { id: 'scoring', label: 'Scoring' }, { id: 'kicking', label: 'Kicking and punting' }, { id: 'returns', label: 'Returns' }];
  F.STATS = [
    P('passing', 'passingYards', 'PASS YDS', 'Passing yards', 'offense:passing', 'passing'),
    P('passing', 'passingTouchdowns', 'PASS TD', 'Passing touchdowns', 'offense:passing', 'passing'),
    P('passing', 'passingYardsPerGame', 'PASS YPG', 'Passing yards per game', 'offense:passing', 'passing', RATE),
    P('passing', 'completions', 'CMP', 'Completions', 'offense:passing', 'passing'),
    P('passing', 'passingAttempts', 'ATT', 'Pass attempts', 'offense:passing', 'passing'),
    P('passing', 'completionPct', 'CMP%', 'Completion percentage', 'offense:passing', 'passing', RATE),
    P('passing', 'yardsPerPassAttempt', 'Y/A', 'Yards per pass attempt', 'offense:passing', 'passing', RATE),
    P('passing', 'QBRating', 'RTG', 'Passer rating', 'offense:passing', 'passing', RATE),
    P('passing', 'QBR', 'QBR', 'ESPN Total QBR', 'offense:passing', 'passing', RATE),
    P('passing', 'longPassing', 'LONG', 'Longest pass', 'offense:passing', 'passing'),
    P('passing', 'interceptions', 'INT', 'Interceptions thrown', 'offense:passing', 'passing'),
    P('passing', 'sacks', 'SACKED', 'Times sacked', 'offense:passing', 'passing'),
    P('rushing', 'rushingYards', 'RUSH YDS', 'Rushing yards', 'offense:rushing', 'rushing'),
    P('rushing', 'rushingTouchdowns', 'RUSH TD', 'Rushing touchdowns', 'offense:rushing', 'rushing'),
    P('rushing', 'rushingYardsPerGame', 'RUSH YPG', 'Rushing yards per game', 'offense:rushing', 'rushing', RATE),
    P('rushing', 'rushingAttempts', 'CAR', 'Carries', 'offense:rushing', 'rushing'),
    P('rushing', 'yardsPerRushAttempt', 'YPC', 'Yards per carry', 'offense:rushing', 'rushing', RATE),
    P('rushing', 'longRushing', 'LONG', 'Longest run', 'offense:rushing', 'rushing'),
    P('rushing', 'rushingBigPlays', 'BIG', 'Runs of 20+ yards', 'offense:rushing', 'rushing'),
    P('rushing', 'rushingFirstDowns', '1ST', 'Rushing first downs', 'offense:rushing', 'rushing'),
    P('receiving', 'receivingYards', 'REC YDS', 'Receiving yards', 'offense:receiving', 'receiving'),
    P('receiving', 'receptions', 'REC', 'Receptions', 'offense:receiving', 'receiving'),
    P('receiving', 'receivingTouchdowns', 'REC TD', 'Receiving touchdowns', 'offense:receiving', 'receiving'),
    P('receiving', 'receivingTargets', 'TGT', 'Targets', 'offense:receiving', 'receiving'),
    P('receiving', 'receivingYardsPerGame', 'REC YPG', 'Receiving yards per game', 'offense:receiving', 'receiving', RATE),
    P('receiving', 'yardsPerReception', 'Y/R', 'Yards per reception', 'offense:receiving', 'receiving', RATE),
    P('receiving', 'longReception', 'LONG', 'Longest reception', 'offense:receiving', 'receiving'),
    P('receiving', 'receivingYardsAfterCatch', 'YAC', 'Yards after catch', 'offense:receiving', 'receiving'),
    P('receiving', 'receivingFirstDowns', '1ST', 'Receiving first downs', 'offense:receiving', 'receiving'),
    P('receiving', 'receivingBigPlays', 'BIG', 'Catches of 20+ yards', 'offense:receiving', 'receiving'),
    P('defensive', 'sacks', 'SACKS', 'Sacks', 'defense', 'defense'),
    P('defensiveInterceptions', 'interceptions', 'INT', 'Interceptions', 'defense', 'defense'),
    P('defensive', 'totalTackles', 'TKL', 'Total tackles', 'defense', 'defense'),
    P('defensive', 'soloTackles', 'SOLO', 'Solo tackles', 'defense', 'defense'),
    P('defensive', 'tacklesForLoss', 'TFL', 'Tackles for loss', 'defense', 'defense'),
    P('defensive', 'passesDefended', 'PD', 'Passes defended', 'defense', 'defense'),
    P('general', 'fumblesForced', 'FF', 'Forced fumbles', 'defense', 'defense'),
    P('general', 'fumblesRecovered', 'FR', 'Fumbles recovered', 'defense', 'defense'),
    P('defensiveInterceptions', 'interceptionYards', 'INT YDS', 'Interception return yards', 'defense', 'defense'),
    P('defensiveInterceptions', 'interceptionTouchdowns', 'PICK-6', 'Interceptions returned for touchdowns', 'defense', 'defense'),
    P('scoring', 'totalTouchdowns', 'TD', 'Total touchdowns', 'scoring', 'scoring'),
    P('scoring', 'totalPoints', 'PTS', 'Points scored', 'scoring', 'scoring'),
    P('scoring', 'totalPointsPerGame', 'PTS/G', 'Points per game', 'scoring', 'scoring', RATE),
    P('kicking', 'fieldGoalsMade', 'FGM', 'Field goals made', 'specialTeams:kicking', 'kicking'),
    P('kicking', 'fieldGoalPct', 'FG%', 'Field goal percentage', 'specialTeams:kicking', 'kicking', RATE),
    P('kicking', 'longFieldGoalMade', 'LONG FG', 'Longest field goal', 'specialTeams:kicking', 'kicking'),
    P('kicking', 'fieldGoalsMade50', '50+', 'Field goals of 50+ yards', 'specialTeams:kicking', 'kicking'),
    P('kicking', 'extraPointsMade', 'XPM', 'Extra points made', 'specialTeams:kicking', 'kicking'),
    P('punting', 'grossAvgPuntYards', 'AVG', 'Gross punting average', 'specialTeams:punting', 'kicking', RATE),
    P('punting', 'netAvgPuntYards', 'NET', 'Net punting average', 'specialTeams:punting', 'kicking', RATE),
    P('punting', 'puntsInside20', 'IN20', 'Punts inside the 20', 'specialTeams:punting', 'kicking'),
    P('returning', 'kickReturnYards', 'KR YDS', 'Kick return yards', 'specialTeams:returning', 'returns'),
    P('returning', 'yardsPerKickReturn', 'KR AVG', 'Yards per kick return', 'specialTeams:returning', 'returns', RATE),
    P('returning', 'puntReturnYards', 'PR YDS', 'Punt return yards', 'specialTeams:returning', 'returns'),
    P('returning', 'yardsPerPuntReturn', 'PR AVG', 'Yards per punt return', 'specialTeams:returning', 'returns', RATE),
    P('returning', 'kickReturnTouchdowns', 'KR TD', 'Kick return touchdowns', 'specialTeams:returning', 'returns'),
    P('returning', 'puntReturnTouchdowns', 'PR TD', 'Punt return touchdowns', 'specialTeams:returning', 'returns')
  ];
  F.STAT_BY_KEY = {}; F.STATS.forEach(function (s) { F.STAT_BY_KEY[s.key] = s; });

  /*
   * Club metrics. 'st' = worked out from the season's results (records, points); 'ts' = ESPN's team
   * statistics feed (statistics/byteam): side 'own' = the team's offense, 'opp' = what it allowed.
   */
  function M(src, id, short, label, fmt, low, extra) {
    var m = { key: src + ':' + id, src: src, id: id, short: short, label: label, fmt: fmt, low: !!low };
    for (var k in extra || {}) m[k] = extra[k];
    return m;
  }
  F.METRIC_GROUPS = [{ src: 'st', label: 'Standings' }, { src: 'off', label: 'Offense' }, { src: 'def', label: 'Defense' }, { src: 'misc', label: 'Turnovers and situations' }];
  F.TEAM_METRICS = [
    M('st', 'record', 'W-L', 'Record', 'record'),
    M('st', 'pct', 'PCT', 'Winning percentage', 'rate3'),
    M('st', 'grp', 'GRP', 'Division or conference record', 'grp'),
    M('st', 'ppg', 'PPG', 'Points per game', 'dec1'),
    M('st', 'oppg', 'OPP PPG', 'Points allowed per game', 'dec1', true),
    M('st', 'diff', 'DIFF', 'Point differential', 'signed'),
    M('st', 'streak', 'STRK', 'Streak', 'streak'),
    M('st', 'home', 'HOME', 'Home record', 'home'),
    M('st', 'away', 'ROAD', 'Road record', 'away'),
    M('st', 'close', '1-SCORE', 'One-score games (8 points or fewer)', 'close'),
    M('ts', 'own.passing.yardsPerGame', 'YDS/G', 'Total yards per game', 'dec1', false, { grp: 'off' }),
    M('ts', 'own.passing.netPassingYardsPerGame', 'PASS/G', 'Passing yards per game', 'dec1', false, { grp: 'off' }),
    M('ts', 'own.rushing.rushingYardsPerGame', 'RUSH/G', 'Rushing yards per game', 'dec1', false, { grp: 'off' }),
    M('ts', 'own.rushing.yardsPerRushAttempt', 'YPC', 'Yards per carry', 'dec1', false, { grp: 'off' }),
    M('ts', 'own.passing.yardsPerPassAttempt', 'Y/A', 'Yards per pass attempt', 'dec1', false, { grp: 'off' }),
    M('ts', 'own.passing.passingTouchdowns', 'PASS TD', 'Passing touchdowns', 'int', false, { grp: 'off' }),
    M('ts', 'own.rushing.rushingTouchdowns', 'RUSH TD', 'Rushing touchdowns', 'int', false, { grp: 'off' }),
    M('ts', 'own.passing.sacks', 'SACKED', 'Sacks allowed', 'int', true, { grp: 'off' }),
    M('ts', 'opp.passing.yardsPerGame', 'YDS/G', 'Total yards allowed per game', 'dec1', true, { grp: 'def' }),
    M('ts', 'opp.passing.netPassingYardsPerGame', 'PASS/G', 'Passing yards allowed per game', 'dec1', true, { grp: 'def' }),
    M('ts', 'opp.rushing.rushingYardsPerGame', 'RUSH/G', 'Rushing yards allowed per game', 'dec1', true, { grp: 'def' }),
    M('ts', 'opp.passing.sacks', 'SACKS', 'Sacks by the defense', 'int', false, { grp: 'def' }),
    M('ts', 'opp.passing.interceptions', 'INT', 'Interceptions by the defense', 'int', false, { grp: 'def' }),
    M('ts', 'own.miscellaneous.turnOverDifferential', 'TO +/-', 'Turnover differential', 'signed', false, { grp: 'misc' }),
    M('ts', 'own.miscellaneous.totalTakeaways', 'TAKE', 'Takeaways', 'int', false, { grp: 'misc' }),
    M('ts', 'own.miscellaneous.totalGiveaways', 'GIVE', 'Giveaways', 'int', true, { grp: 'misc' }),
    M('ts', 'own.miscellaneous.thirdDownConvPct', '3RD%', 'Third-down conversion rate', 'pct1', false, { grp: 'misc' }),
    M('ts', 'own.miscellaneous.fourthDownConvPct', '4TH%', 'Fourth-down conversion rate', 'pct1', false, { grp: 'misc' }),
    M('ts', 'opp.miscellaneous.thirdDownConvPct', 'OPP 3RD%', 'Opponents’ third-down rate', 'pct1', true, { grp: 'misc' }),
    M('ts', 'own.miscellaneous.totalPenaltyYards', 'PEN YDS', 'Penalty yards', 'int', true, { grp: 'misc' })
  ];
  F.METRIC_BY_KEY = {}; F.TEAM_METRICS.forEach(function (m) { F.METRIC_BY_KEY[m.key] = m; });

  F.FEATURE_GROUPS = {
    nfl: [
      { label: 'Race to the playoffs', options: [['gap', 'Games above .500'], ['pct', 'Winning percentage'], ['gb', 'Games back in the division'], ['grank', 'Division standing over time'], ['line', 'Playoff line (games above or below the 7th seed)']] },
      { label: 'Team trends', options: [['pdiff', 'Point differential'], ['scoring', 'Points scored vs. allowed'], ['season', 'Season in one picture (every game)'], ['close', 'One-score games']] }
    ],
    cfb: [
      { label: 'Race to the Playoff', options: [['gap', 'Games above .500'], ['pct', 'Winning percentage'], ['gb', 'Conference games back'], ['grank', 'Conference standing over time'], ['poll', 'AP poll rank by week']] },
      { label: 'Team trends', options: [['pdiff', 'Point differential'], ['scoring', 'Points scored vs. allowed'], ['season', 'Season in one picture (every game)'], ['close', 'One-score games']] }
    ]
  };

  F.BLOCKS = {
    tiles: [{ id: 'tile1', code: 'T1', label: 'Tile 1' }, { id: 'tile2', code: 'T2', label: 'Tile 2' }, { id: 'tile3', code: 'T3', label: 'Tile 3' }, { id: 'tile4', code: 'T4', label: 'Tile 4' }],
    featured: [{ id: 'feat1', code: 'F1', label: 'Featured board 1' }, { id: 'feat2', code: 'F2', label: 'Featured board 2' }],
    boards: [{ id: 'board1', code: 'B1', label: 'Board 1' }, { id: 'board2', code: 'B2', label: 'Board 2' }, { id: 'board3', code: 'B3', label: 'Board 3' },
      { id: 'board4', code: 'B4', label: 'Board 4' }, { id: 'board5', code: 'B5', label: 'Board 5' }, { id: 'board6', code: 'B6', label: 'Board 6' }]
  };
  function defaults(poll) {
    return {
      v: 1, defaultScope: 'ALL', relay: '',
      blocks: {
        tile1: 'st:record', tile2: 'st:ppg', tile3: 'st:oppg', tile4: 'st:diff',
        race: 'gap', standings: 'show', clubs: 'st:diff', upnext: 'show',
        feat1: 'passing.passingYards', feat2: 'rushing.rushingYards',
        board1: 'passing.passingTouchdowns', board2: 'receiving.receivingYards', board3: 'receiving.receptions',
        board4: 'defensive.sacks', board5: 'defensiveInterceptions.interceptions', board6: 'defensive.totalTackles'
      }
    };
  }
  F.DEFAULT_SETTINGS = { nfl: defaults(), cfb: defaults() };

  Object.keys(F.LEAGUES).forEach(function (id) {
    var L = F.LEAGUES[id];
    L.TEAM_BY_ID = {}; L.teams.forEach(function (t) { L.TEAM_BY_ID[t.id] = t; });
    L.GROUP_BY_ID = {}; L.groups.forEach(function (g) { L.GROUP_BY_ID[g.id] = g; });
  });
})();
