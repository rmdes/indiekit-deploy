const SLUG_MAX = 80;

// Combining diacritical marks block (U+0300..U+036F). Built via RegExp
// constructor + escape sequences so the source stays ASCII-safe across
// editors that may not preserve raw combining characters.
const COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g");

export function slugify(input) {
  if (input === undefined || input === null) return "untitled";
  const slug = String(input)
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX);
  return slug || "untitled";
}

export function slugFromFilename(filename) {
  const base = filename.replace(/\.(md|markdown|mdx)$/i, "");
  // Jekyll-style: 2024-03-15-my-slug → my-slug
  const dated = base.match(/^\d{4}-\d{2}-\d{2}-(.+)$/);
  if (dated) return slugify(dated[1]);
  return slugify(base);
}

export function dateFromFilename(filename) {
  const m = filename.match(/^(\d{4})-(\d{2})-(\d{2})-/);
  if (!m) return null;
  const [, y, mo, d] = m;
  return new Date(`${y}-${mo}-${d}T12:00:00Z`);
}
