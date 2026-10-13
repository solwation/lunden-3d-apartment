// Tools-only inputs supplied before fixture execution by the external HTML companion.
// tools/ is excluded from deployment; no fallback, product globals or parser override.
function secretTestInputs() {
  if (!/^\/tools\//.test(location.pathname)) throw new Error('Private fixture inputs are only available on tools pages.');
  const input = window.__lundenSecretTestInputs;
  if (!input || !Array.isArray(input.codes) || input.codes.length !== 2
      || input.codes.some(code => typeof code !== 'string' || !code.trim())
      || input.codes[0] === input.codes[1]) throw new Error('Missing or invalid explicit private fixture input.');
  return Object.freeze({ codes: Object.freeze([...input.codes]) });
}
