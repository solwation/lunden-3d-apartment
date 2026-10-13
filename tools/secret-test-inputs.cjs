// Explicit private fixture inputs only; never derive credentials from published production code.
const fs = require('fs'), path = require('path');
function validateSecretTestInputs(value) {
  if (!value || !Array.isArray(value.codes) || value.codes.length !== 2
      || value.codes.some(code => typeof code !== 'string' || !code.trim())
      || value.codes[0] === value.codes[1]) throw new Error('Private test input must contain exactly two distinct nonempty strings in codes.');
  return { codes: [...value.codes] }; // Preserve input exactly; normalization belongs to the real parser.
}
function loadSecretTestInputs(env = process.env) {
  const file = env.LUNDEN_SECRET_TEST_INPUTS;
  if (!file) throw new Error('Set LUNDEN_SECRET_TEST_INPUTS to an external private JSON file.');
  if (!path.isAbsolute(file)) throw new Error('Private test input path must be absolute and external to the checkout.');
  let value;
  try {
    const real = fs.realpathSync(file), root = fs.realpathSync(path.join(__dirname, '..'));
    if (real === root || real.startsWith(root + path.sep)) throw new Error('Checkout input file');
    value = JSON.parse(fs.readFileSync(real, 'utf8'));
  }
  catch { throw new Error('Cannot read private test input JSON.'); }
  return validateSecretTestInputs(value);
}
function redact(text, { codes }) {
  const privateValues = [...codes, codes[1].slice(0, -1), codes[0] + 's', '/' + codes[1].replace(' is ', ' is not ')].sort((a, b) => b.length - a.length);
  for (const value of privateValues) if (value) text = String(text).split(value).join('[private input]');
  return String(text);
}
module.exports = { loadSecretTestInputs, validateSecretTestInputs, redact };
