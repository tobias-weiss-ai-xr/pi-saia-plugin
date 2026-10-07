#!/usr/bin/env node
/**
 * Minimal GitHub-Actions filter glob checker.
 *
 * Workflow `branches:` / `tags:` filters are *globs*, not regexes. A filter like
 * `v[0-9]+.[0-9]+.[0-9]+` looks like a regex but is read as a glob, where `+` is
 * a literal character — so it matched no real tag and releases never fired. This
 * matcher supports exactly the constructs such a filter uses and treats
 * everything else literally, so the test fails loudly on that mistake instead of
 * silently passing.
 *
 * Usage: node glob-matcher.mjs <pattern> <mustMatchJsonArray> <mustNotMatchJsonArray>
 * Exits 0 when the pattern matches every required and no forbidden sample.
 */

/** GitHub filter glob -> RegExp. `*` is one path segment, `?` one character. */
export function globToRegExp(glob) {
  let out = "";
  for (const ch of glob) {
    if (ch === "*") out += "[^/]*";
    else if (ch === "?") out += ".";
    // Escape regex metacharacters so '+' etc. stay literal, like a glob.
    else out += ch.replace(/[.+^${}()|\\]/g, "\\$&");
  }
  return new RegExp("^" + out + "$");
}

const [pattern, mustMatchJson = "[]", mustNotMatchJson = "[]"] = process.argv.slice(2);

if (!pattern) {
  console.error("usage: glob-matcher.mjs <pattern> [mustMatchJson] [mustNotMatchJson]");
  process.exit(2);
}

const mustMatch = JSON.parse(mustMatchJson);
const mustNotMatch = JSON.parse(mustNotMatchJson);
const re = globToRegExp(pattern);

const missing = mustMatch.filter((value) => !re.test(value));
const unexpected = mustNotMatch.filter((value) => re.test(value));

if (missing.length) {
  console.error(`filter ${JSON.stringify(pattern)} does not match: ${missing.join(", ")}`);
  process.exit(1);
}
if (unexpected.length) {
  console.error(`filter ${JSON.stringify(pattern)} unexpectedly matches: ${unexpected.join(", ")}`);
  process.exit(1);
}
process.exit(0);
