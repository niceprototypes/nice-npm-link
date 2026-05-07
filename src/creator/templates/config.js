/**
 * @fileoverview Build-config templates — tsconfig and rollup.
 *
 * @module creator/templates/config
 */

/**
 * Generates tsconfig.json that extends the shared nice-configuration React preset.
 *
 * @returns {string}
 */
function tsconfigJson() {
  return JSON.stringify({
    extends: 'nice-configuration/typescript/react',
    compilerOptions: {
      outDir: 'dist',
      declarationDir: 'dist/types',
    },
    include: ['src'],
    exclude: ['node_modules', 'dist', '**/*.test.ts', '**/*.test.tsx'],
  }, null, 2) + '\n';
}

/**
 * Generates rollup.config.js that defers entirely to createConfiguration().
 *
 * @returns {string}
 */
function rollupConfig() {
  return `import { createConfiguration } from 'nice-configuration/rollup'

export default createConfiguration()
`;
}

module.exports = { tsconfigJson, rollupConfig };
