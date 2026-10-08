// #493: the old single root could move every Tilly poster off its wall.
// New per-art ids deliberately cannot collide with that old group id.
export const LEGACY_POSTER_GROUP = 'f-kposters-1-0-0-0-0';
export function migratePosterLayout(state) {
  if (!state?.pieces || !Object.hasOwn(state.pieces, LEGACY_POSTER_GROUP)) return state;
  const pieces = { ...state.pieces };
  delete pieces[LEGACY_POSTER_GROUP];
  return { ...state, revision: state.revision + 1, pieces,
    migrations: { ...state.migrations, individualPosters: 1 } };
}
