// The Christmas Eve visit times are requested; model proportions and animation timings are visual guesses (metres/seconds).
export const SANTA = {
  // #1923 authored visual guesses in metres; shared by the GLB exporter and failed-load path.
  surface: {
    radial: 16, detail: [10, 6], small: [6, 4],
    palette: { red: 0x981f2b, white: 0xe9e3d7, skin: 0xdca78b, black: 0x26201c, gold: 0xc7a25b, iris: 0x587984, innerEar: 0xb87966 },
    // Rings are [height, half width, half depth, depth centre]. Silhouettes, not measured anatomy.
    coat: [[0.015,.255,.205,.035],[.07,.29,.235,.035],[.16,.306,.252,.032],[.27,.31,.26,.028],[.38,.285,.235,.02],[.49,.247,.192,.008],[.55,.21,.16,.006],[.58,.135,.115,.015]],
    head: [[.655,.062,.075,.025],[.69,.092,.105,.028],[.735,.121,.121,.02],[.78,.139,.134,.015],[.83,.139,.128,.01],[.88,.13,.124,.006],[.925,.102,.105,0],[.951,.045,.055,0]],
    neck: [[.555,.067,.067,.018],[.66,.073,.073,.021],[.705,.079,.077,.023]],
    beard: [[.435,.025,.025,.202],[.465,.075,.045,.205],[.51,.125,.061,.195],[.565,.155,.068,.175],[.62,.164,.068,.157],[.675,.15,.058,.144],[.72,.127,.043,.14],[.75,.109,.035,.137],[.785,.123,.027,.106]],
    sleeve: [[-.315,.071,.076,.064],[-.27,.077,.083,.055],[-.21,.089,.092,.039],[-.13,.095,.099,.022],[-.055,.099,.098,.012],[.01,.083,.084,.006]],
    palm: [[-.405,.042,.03,.076],[-.375,.052,.035,.073],[-.34,.047,.035,.067],[-.315,.031,.027,.06]],
    nose: [[.759,.023,.019,.17],[.779,.031,.033,.181],[.801,.025,.033,.174],[.829,.012,.017,.146]],
    ear: { at: [.139,.79,.013], scale: [.022,.046,.025], inner: [.015,.029,.009], innerOffset: [.009,0,.019] },
    cheek: { at: [.091,.775,.125], scale: [.039,.027,.013] },
    eye: { x: .054, y: .829, z: .131, white: [.021,.012,.007], iris: [.008,.009,.003], pupil: [.004,.006,.002], irisZ: .006, pupilZ: .009 },
    brow: { at: [.054,.852,.137], scale: [.035,.009,.012], slope: -.06 },
    moustache: { at: [.042,.746,.171], scale: [.05,.017,.025], slope: .14 },
    collar: { at: [0,.556,.012], scale: [.16,.055,.14] },
    hem: { at: [0,.032,.035], scale: [.278,.035,.222] },
    cuff: { at: [0,-.312,.063], scale: [.079,.025,.083] },
    belt: { y: .171, height: .049, width: .305, depth: .253, centre: .034, buckleZ: .292, buckle: [.089,.073,.014], opening: [.058,.047,.006], openingZ: .009 },
    placket: { at: [0,.354,.257], scale: [.026,.259,.016] },
    finger: { xs: [-.036,-.012,.012,.035], lengths: [.044,.054,.05,.038], radius: .011, z: .08, rootY: -.39, grip: .035, radial: 6, profile: [[1,.48,.65,1],[.8,.8,.9,1],[.35,1,1,.6],[0,1,1,0]] },
    thumb: { at: [-.05,-.355,.098], scale: [.019,.039,.021], angle: -.56 },
    palmRadial: 10,
    cloth: { shade: .045, wrinkle: .004, folds: 7, shadeY: 70, shadeX: 13, coatY: 24, sleeveY: 55, sleeveWave: 3 },
    beardRadial: 24, beardGroove: .012, beardShade: .10, beardShadeX: 160, beardWave: 10,
    trouser: { radial: 12, fold: .004, thighFraction: .68, kneeDrop: .075, calfFraction: .56, foldLength: 2, foldAround: 3, radii: [.083,.093,.09,.083,.076,.068] },
    hatTrim: { brim: [.155,.033,.146], tuft: [.048,.052,.048] },
    boot: { scale: [.095,.075,.163], cuff: [.074,.024,.077] },
  },
  month: 12, date: 24, arrives: 15, sleeps: 16, leaves: 21,
  seatIndex: 1,
  blush: { base: 0xe4a39b, red: 0xbf363b, fullAfterSips: 10 }, // visual colour guesses; one step per completed sip
  // Visual anatomy guesses; front is supplied from the actual LANDSKRONA depth.
  hat: { radius: 0.16, height: 0.36, bend: 0.16, drop: 0.10 },
  legs: { radius: 0.09, clearance: 0.035, thighY: 0.10, kneeY: 0.065, bootY: 0.075, bootH: 0.075, spread: 0.16 },
  size: { belly: [0.33, 0.36, 0.28], head: 0.15, beard: [0.2, 0.21, 0.13] },
  sip: { every: 14, seconds: 3.2, arm: 1.9, inward: 0.5, glassRest: [-0.28, 0.31, 0.4], glassMouth: [-0.08, 0.78, 0.25], tilt: -0.8 },
  sleep: { x: 0.65, y: 0.23, z: 0.04, breathe: 0.008, text: [0.64, 0.22], textSeconds: 2.8, textRise: 0.4 },
  greetingSeconds: 2.5,
  laugh: { seconds: 0.8, beats: 3, gap: 0.23, duration: 0.18, hz: 145, gain: 0.28 },
};

/** Game calendar, half-open intervals: sitting 15–16, sleeping 16–21, absent otherwise. */
export function santaState(day) {
  if (day.month !== SANTA.month || day.date !== SANTA.date) return 'away';
  if (day.hour >= SANTA.arrives && day.hour < SANTA.sleeps) return 'sitting';
  if (day.hour >= SANTA.sleeps && day.hour < SANTA.leaves) return 'sleeping';
  return 'away';
}
