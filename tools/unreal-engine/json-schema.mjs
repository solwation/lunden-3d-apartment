// A small JSON Schema validator for the shared/schema/*.json contracts (#2245), so checks run with plain Node and no
// dependencies. Supports exactly the keywords those schemas use: type (incl. arrays and "integer"), const, enum,
// required, properties, additionalProperties (boolean or schema), items, minItems, maxItems, minimum, maximum,
// pattern, maxLength and local $ref ("#/$defs/…"). Unknown keywords (title, description, $id …) are ignored.

const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
const isType = (v, t) => (t === 'integer' ? Number.isInteger(v) : t === 'number' ? typeof v === 'number' && Number.isFinite(v) : typeOf(v) === t);

/** Errors of `value` against `schema` (root schema `root` for $ref), as ["<path>: <message>", …]; [] = valid. */
export function validate(value, schema, root = schema, at = '$', errors = []) {
  if (schema.$ref) {
    const target = schema.$ref.replace(/^#\//, '').split('/').reduce((o, k) => o?.[k], root);
    if (!target) { errors.push(`${at}: unresolved $ref ${schema.$ref}`); return errors; }
    return validate(value, target, root, at, errors);
  }
  if (schema.type) {
    const types = [].concat(schema.type);
    if (!types.some((t) => isType(value, t))) { errors.push(`${at}: expected ${types.join('|')}, got ${typeOf(value)}`); return errors; }
  }
  if ('const' in schema && JSON.stringify(value) !== JSON.stringify(schema.const)) errors.push(`${at}: expected ${JSON.stringify(schema.const)}, got ${JSON.stringify(value)}`);
  if (schema.enum && !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(value))) errors.push(`${at}: ${JSON.stringify(value)} not in ${JSON.stringify(schema.enum)}`);
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${at}: ${value} < minimum ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${at}: ${value} > maximum ${schema.maximum}`);
  }
  if (typeof value === 'string') {
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) errors.push(`${at}: ${JSON.stringify(value)} does not match ${schema.pattern}`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${at}: longer than ${schema.maxLength}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${at}: fewer than ${schema.minItems} items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${at}: more than ${schema.maxItems} items`);
    if (schema.items) value.forEach((v, i) => validate(v, schema.items, root, `${at}[${i}]`, errors));
  }
  if (typeOf(value) === 'object') {
    for (const k of schema.required ?? []) if (!(k in value)) errors.push(`${at}: missing required "${k}"`);
    const props = schema.properties ?? {};
    for (const [k, v] of Object.entries(value)) {
      if (props[k]) validate(v, props[k], root, `${at}.${k}`, errors);
      else if (schema.additionalProperties === false) errors.push(`${at}: unexpected property "${k}"`);
      else if (typeof schema.additionalProperties === 'object') validate(v, schema.additionalProperties, root, `${at}.${k}`, errors);
    }
  }
  return errors;
}

/** The JSON chunk of a GLB (glTF 2.0 binary container), parsed. */
export function glbJson(buf) {
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB (magic)');
  const len = buf.readUInt32LE(12), type = buf.readUInt32LE(16);
  if (type !== 0x4e4f534a) throw new Error('GLB: first chunk is not JSON');
  return JSON.parse(buf.subarray(20, 20 + len).toString('utf8'));
}
