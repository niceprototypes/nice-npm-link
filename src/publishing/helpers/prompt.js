/**
 * @fileoverview Interactive prompts — line-based and single-keystroke.
 *
 * @module publisher/helpers/prompt
 */

const readline = require('readline');

/**
 * Prompts the user for input via stdin.
 *
 * @param {string} question - Prompt text
 * @returns {Promise<string>} User's response (trimmed)
 */
function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Prompts for a single keystroke from a fixed accept set. Submits
 * immediately when any `acceptKeys` character is pressed (no Enter
 * needed). Enter alone submits an empty string. Bare Esc is supported
 * when included in `acceptKeys`.
 *
 * Falls back to the line-based `prompt()` when stdin is not a TTY
 * (e.g. piped input in CI) so non-interactive callers still work.
 *
 * @param {string} question - Prompt text
 * @param {string[]} acceptKeys - Keys that auto-submit on first press
 * @returns {Promise<string>} Pressed key, or "" for Enter
 */
function promptKey(question, acceptKeys) {
  const stdin = process.stdin;
  if (!stdin.isTTY) return prompt(question);

  process.stdout.write(question);

  return new Promise((resolve) => {
    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    const cleanup = () => {
      stdin.setRawMode(wasRaw || false);
      stdin.removeListener('data', onData);
      stdin.pause();
    };

    const onData = (key) => {
      // Ctrl+C exits the process
      if (key === '') {
        cleanup();
        process.stdout.write('\n');
        process.exit(130);
      }
      // Enter submits empty string (treated as "recommendation")
      if (key === '\r' || key === '\n') {
        cleanup();
        process.stdout.write('\n');
        resolve('');
        return;
      }
      // Bare Esc — only matches when the data chunk is exactly `\x1b` and
      // not the prefix of a longer escape sequence (arrow keys are
      // delivered as `\x1b[A`/`\x1b[B`/etc. in a single chunk, so they
      // miss this exact-match check).
      if (key === '' && acceptKeys.includes('')) {
        cleanup();
        process.stdout.write('Esc\n');
        resolve(key);
        return;
      }
      // Matched key — submit immediately
      if (acceptKeys.includes(key)) {
        cleanup();
        process.stdout.write(`${key}\n`);
        resolve(key);
      }
      // Any other key is ignored (no echo, no advance)
    };

    stdin.on('data', onData);
  });
}

module.exports = { prompt, promptKey };
