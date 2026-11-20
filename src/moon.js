// The moon's real phase and position (#2194): a low-precision lunar ephemeris (the Astronomical Almanac's short series:
// longitude to ~0.3 deg, latitude ~0.1 deg, distance parallax ~0.003 deg) for the game's date and time. Pure maths, no THREE, no
// DOM: daycycle.js turns the hour angle and declination into the sky direction and feeds the phase to the sky shader and the moonlight.

const RAD = Math.PI / 180;
const norm = (d) => ((d % 360) + 360) % 360;
const sinD = (d) => Math.sin(d * RAD), cosD = (d) => Math.cos(d * RAD);

/** Julian date of a UTC timestamp (ms). */
export const julianDate = (utcMs) => utcMs / 864e5 + 2440587.5;

/**
 * The moon (and the sun it is lit by) at UTC time `utcMs`, seen from latitude `lat`, east longitude `lon` (degrees).
 * Returns { ra, dec (deg), ha (hour angle, deg, + = west of the meridian), alt, az (deg, topocentric altitude, azimuth from
 * south + = west like daycycle's skyDirection), elong (elongation from the sun, rad, 0 new … pi full), illum (lit fraction 0–1),
 * phase (0 new, .25 first quarter, .5 full, .75 last quarter), waxing }.
 */
export function moonState(utcMs, lat, lon) {
  const jd = julianDate(utcMs), T = (jd - 2451545) / 36525;
  // ecliptic longitude / latitude (deg) and horizontal parallax (deg) of the moon
  const lm = 218.32 + 481267.881 * T + 6.29 * sinD(135.0 + 477198.87 * T) - 1.27 * sinD(259.3 - 413335.36 * T)
    + 0.66 * sinD(235.7 + 890534.22 * T) + 0.21 * sinD(269.9 + 954397.74 * T) - 0.19 * sinD(357.5 + 35999.05 * T) - 0.11 * sinD(186.5 + 966404.03 * T);
  const bm = 5.13 * sinD(93.3 + 483202.02 * T) + 0.28 * sinD(228.2 + 960400.89 * T) - 0.28 * sinD(318.3 + 6003.15 * T) - 0.17 * sinD(217.6 - 407332.21 * T);
  const par = 0.9508 + 0.0518 * cosD(135.0 + 477198.87 * T) + 0.0095 * cosD(259.3 - 413335.36 * T) + 0.0078 * cosD(235.7 + 890534.22 * T) + 0.0028 * cosD(269.9 + 954397.74 * T);
  // the sun's ecliptic longitude (deg)
  const g = 357.528 + 35999.05 * T, ls = 280.46 + 36000.771 * T + 1.915 * sinD(g) + 0.02 * sinD(2 * g);
  // ecliptic -> equatorial
  const eps = 23.439 - 0.013 * T;
  const x = cosD(bm) * cosD(lm), y = cosD(eps) * cosD(bm) * sinD(lm) - sinD(eps) * sinD(bm), z = sinD(eps) * cosD(bm) * sinD(lm) + cosD(eps) * sinD(bm);
  const ra = norm(Math.atan2(y, x) / RAD), dec = Math.asin(Math.max(-1, Math.min(1, z))) / RAD;
  // sidereal time -> hour angle -> horizontal
  const gmst = 280.46061837 + 360.98564736629 * (jd - 2451545), ha = norm(gmst + lon - ra + 180) - 180;
  const sinAlt = sinD(lat) * sinD(dec) + cosD(lat) * cosD(dec) * cosD(ha);
  const alt0 = Math.asin(sinAlt) / RAD, alt = alt0 - par * cosD(alt0); // topocentric: the moon is near enough to drop by its parallax
  const az = Math.atan2(sinD(ha), cosD(ha) * sinD(lat) - Math.tan(dec * RAD) * cosD(lat)) / RAD;
  // phase from the elongation
  const dl = norm(lm - ls), elong = Math.acos(Math.max(-1, Math.min(1, cosD(bm) * cosD(dl))));
  return { ra, dec, ha, alt, az, elong, illum: (1 - Math.cos(elong)) / 2, phase: dl / 360, waxing: dl < 180 };
}

/** Moonrise and moonset timestamps (ms) within [fromMs, fromMs + hours h], found by stepping the altitude (limb at -0.83 deg, like the sun). */
export function moonEvents(fromMs, hours, lat, lon, stepMin = 10) {
  const rise = [], set = [], n = Math.ceil(hours * 60 / stepMin), h0 = -0.83;
  let prev = moonState(fromMs, lat, lon).alt - h0;
  for (let i = 1; i <= n; i++) {
    const t = fromMs + i * stepMin * 6e4, a = moonState(t, lat, lon).alt - h0;
    if ((prev < 0) !== (a < 0)) (a > prev ? rise : set).push(t - stepMin * 6e4 * a / (a - prev));
    prev = a;
  }
  return { rise, set };
}

/** Phase name (Swedish) for a phase value 0–1, for the wall calendar / debug. */
export function phaseName(phase) {
  const names = ['Nymåne', 'Tilltagande skära', 'Första kvarteret', 'Tilltagande måne', 'Fullmåne', 'Avtagande måne', 'Sista kvarteret', 'Avtagande skära'];
  return names[Math.floor(((phase % 1) + 1) % 1 * 8 + 0.5) % 8];
}
