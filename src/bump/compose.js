/**
 * @fileoverview Composing a git commit message from bump-intent entries.
 *
 * @module bump/compose
 */

/**
 * Composes a git commit message from a list of bump entries.
 *
 * Single entry → entry's message becomes the commit subject. No level prefix,
 * because the level is bump intent (consumed at `--publish`), not commit
 * metadata.
 *
 * Multiple entries → first entry's message is the subject, remaining entries
 * become a bulleted body. The blank line between subject and body is required
 * by git's commit message conventions.
 *
 * Used by the publisher to derive the publish-commit's subject + body from
 * the entries that ship in a release.
 *
 * @param {Array<{level: string, message: string}>} entries
 * @returns {string} Commit message ready to pass to `git commit -F`
 */
function composeCommitMessage(entries) {
  if (!entries.length) return '';
  if (entries.length === 1) return entries[0].message;

  const [head, ...rest] = entries;
  const body = rest.map((e) => `- ${e.message}`).join('\n');
  return `${head.message}\n\n${body}`;
}

module.exports = { composeCommitMessage };
