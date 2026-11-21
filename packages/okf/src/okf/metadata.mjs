/** OKF 0.3 interpretation; the original metadata is never rewritten. */
const mapping = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);
const text = (value) => typeof value === 'string' && value.trim().length > 0;
const absent = (value) =>
  value == null || value === '' || (Array.isArray(value) && value.length === 0);
const list = (value) => (absent(value) ? [] : Array.isArray(value) ? value : [value]);
const actor = (value) =>
  text(value) && /^(?:[^\s:/]+\/[^\s]+|[a-z][a-z\d+.-]*:[\s\S]*\S)$/i.test(value);

/** Parse only RFC 3339 dates/instants, never JavaScript's permissive date prose. */
function timestamp(value) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value !== 'string') return null;
  const match =
    /^(\d{4}-\d{2}-\d{2})(?:[Tt](\d{2}):(\d{2}):(\d{2})(\.\d+)?([Zz]|[+-]\d{2}:\d{2}))?$/.exec(
      value,
    );
  if (!match) return null;
  const day = Date.parse(match[1] + 'T00:00:00Z');
  if (!Number.isFinite(day) || new Date(day).toISOString().slice(0, 10) !== match[1]) return null;
  if (match[2] === undefined) return day;
  const [, , hour, minute, second, fraction = '', zone] = match;
  if (+hour > 23 || +minute > 59 || +second > 60) return null;
  if (zone.length > 1 && (+zone.slice(1, 3) > 23 || +zone.slice(4) > 59)) return null;
  const instant = Date.parse(
    `${match[1]}T${hour}:${minute}:${second === '60' ? '59' : second}${fraction}${zone.toUpperCase()}`,
  );
  return Number.isFinite(instant) ? instant + (second === '60' ? 1000 : 0) : null;
}

/**
 * Derive advisory metadata at a caller-chosen instant. This does not attest runs
 * or grant execution permission. Unknown fields remain in the source metadata.
 * @param {Record<string, unknown>} metadata
 * @param {{now?: Date}} [options]
 * @returns {import('../types.js').MetadataState}
 */
export function readMetadata(metadata, { now = new Date() } = {}) {
  if (!Number.isFinite(now.getTime())) throw new TypeError('now must be a valid Date');
  const warnings = [];
  const entries = (key, required) =>
    list(metadata[key]).filter((entry, index) => {
      if (mapping(entry) && required.every((field) => text(entry[field]))) return true;
      warnings.push(`${key}[${index}]: missing or invalid ${required.join(', ')}`);
      return false;
    });
  const tags = list(metadata.tags).filter((tag) => {
    if (text(tag)) return true;
    warnings.push('tags: expected non-empty strings');
    return false;
  });
  const sources = entries('sources', ['resource']);
  const parameters = entries('parameters', ['name', 'type']);
  let generatedAt = null;
  let hasGeneration = !absent(metadata.generated);
  if (hasGeneration) {
    if (!mapping(metadata.generated) || !actor(metadata.generated.by)) {
      warnings.push('generated: missing or invalid by');
      hasGeneration = false;
    } else {
      generatedAt = timestamp(metadata.generated.at);
      if (generatedAt === null)
        warnings.push('generated.at: current verification cannot be determined');
    }
  }
  const verified = list(metadata.verified).filter((event, index) => {
    if (mapping(event) && actor(event.by) && timestamp(event.at) !== null) return true;
    warnings.push(`verified[${index}]: valid by and at are required`);
    return false;
  });
  const currentVerifications = verified.filter(
    (event) => !hasGeneration || (generatedAt !== null && timestamp(event.at) >= generatedAt),
  );
  const trustTier = currentVerifications.some((event) => event.by.startsWith('human:'))
    ? 'human-reviewed'
    : currentVerifications.length
      ? 'machine-confirmed'
      : 'unverified';
  const deadline = timestamp(metadata.stale_after);
  const freshness = absent(metadata.stale_after)
    ? 'unspecified'
    : deadline === null
      ? 'malformed'
      : now.getTime() >= deadline
        ? 'stale'
        : 'fresh';
  if (freshness === 'malformed') warnings.push('stale_after: malformed timestamp');
  const status = absent(metadata.status) ? 'stable' : metadata.status;
  if (!['draft', 'stable', 'deprecated'].includes(status)) warnings.push('status: unknown value');
  return {
    tags,
    sources,
    parameters,
    verified,
    currentVerifications,
    trustTier,
    freshness,
    status,
    current: status === 'stable' && freshness !== 'stale' && freshness !== 'malformed',
    warnings,
  };
}

/** Enumerate only defined path fields, retaining their exact metadata location.
 * @param {Record<string, unknown>} metadata
 * @returns {{field: string, href: string}[]}
 */
export function metadataPaths(metadata) {
  const paths = [];
  const add = (field, value, descriptor = false) => {
    if (text(value) && !(descriptor && /\s/.test(value))) paths.push({ field, href: value });
  };
  add('resource', metadata.resource);
  list(metadata.sources).forEach((source, index) => {
    if (mapping(source)) add(`sources[${index}].resource`, source.resource, true);
  });
  add('computation', metadata.computation);
  for (const key of ['executor', 'attester'])
    if (mapping(metadata[key])) add(`${key}.resource`, metadata[key].resource);
  if (metadata.status === 'deprecated') add('superseded_by', metadata.superseded_by);
  return paths;
}
