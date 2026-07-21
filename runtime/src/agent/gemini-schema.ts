// Gemini's `functionDeclarations` schema is a strict subset of OpenAPI 3.x:
// it rejects modern JSON-Schema keywords like `exclusiveMinimum`,
// `exclusiveMaximum`, `$schema`, `additionalProperties`, `const`, `format`
// on strings other than a small allow-list, etc. Zod v4 emits several of
// these by default via `.min()`, `.int()`, `.positive()`, and so on — and
// MCP tools converted from those Zod schemas carry them through to the LLM.
//
// This module strips those keywords in-place from an already-produced JSON
// schema object. It is intentionally narrow: only fields that provably
// break Gemini today, no attempts at "cleaning up" perfectly valid schemas.

const UNSUPPORTED_KEYS = new Set([
  'exclusiveMinimum',
  'exclusiveMaximum',
  '$schema',
  '$id',
  'default',
  'const',
]);

const NUMERIC_ONLY_STRING_KEYS = new Set(['format']);

const STRING_FORMAT_ALLOWLIST = new Set(['enum', 'date-time', 'date', 'time', 'duration']);

export function sanitizeForGemini(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(sanitizeForGemini);
  if (!schema || typeof schema !== 'object') return schema;
  const src = schema as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(src)) {
    if (UNSUPPORTED_KEYS.has(key)) continue;

    if (key === 'type') {
      // Gemini expects a single OpenAPI type — collapse `["string", "null"]`
      // arrays down to the first non-null type.
      if (Array.isArray(value)) {
        const primary = value.find((t) => t !== 'null');
        out[key] = primary ?? 'string';
        continue;
      }
    }

    if (
      NUMERIC_ONLY_STRING_KEYS.has(key) &&
      typeof value === 'string' &&
      src['type'] === 'string' &&
      !STRING_FORMAT_ALLOWLIST.has(value)
    ) {
      continue;
    }

    if (key === 'anyOf' || key === 'oneOf' || key === 'allOf') {
      // Gemini's function schema only supports `properties`, `type`, `items`,
      // `required`, `description`, `enum`. Collapse trivial anyOfs of a
      // single branch; otherwise drop the discriminator to keep the branch
      // that carries the tool description.
      if (Array.isArray(value)) {
        const branches = value.map(sanitizeForGemini) as Record<string, unknown>[];
        const nonNull = branches.filter((b) => b && b['type'] !== 'null');
        if (nonNull.length === 1) {
          Object.assign(out, nonNull[0]);
          continue;
        }
        out[key] = branches;
        continue;
      }
    }

    out[key] = sanitizeForGemini(value);
  }

  return out;
}
