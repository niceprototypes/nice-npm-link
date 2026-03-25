/**
 * @fileoverview File templates for scaffolding new component packages
 * @module creator/templates
 */

/**
 * Capitalizes first letter of a string
 * @param {string} s
 * @returns {string}
 */
function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Converts a package name like "nice-react-lightbox" to the component name "Lightbox"
 * @param {string} packageName
 * @returns {string}
 */
function toComponentName(packageName) {
  // Remove "nice-react-" prefix, split on hyphens, capitalize each segment
  const suffix = packageName.replace(/^nice-react-/, '');
  return suffix.split('-').map(capitalize).join('');
}

/**
 * Converts a component name like "Lightbox" to a lowercase prefix "lightbox"
 * @param {string} componentName
 * @returns {string}
 */
function toPrefix(componentName) {
  return componentName.charAt(0).toLowerCase() + componentName.slice(1);
}

// ──────────────────────────────────────────────────────────────────────────────
// Templates
// ──────────────────────────────────────────────────────────────────────────────

function packageJson(packageName) {
  return JSON.stringify({
    name: packageName,
    version: '0.1.0',
    type: 'module',
    description: '',
    main: 'dist/index.js',
    module: 'dist/index.esm.js',
    types: 'dist/index.d.ts',
    files: ['dist'],
    scripts: {
      build: 'rollup -c',
      dev: 'rollup -c -w',
      typecheck: 'tsc --noEmit',
      prepublishOnly: 'npm run build',
      prepare: 'npm run build',
    },
    keywords: ['react', 'component', 'nice-react'],
    author: '',
    license: 'MIT',
    dependencies: {
      'nice-react-styles': 'file:../nice-react-styles',
    },
    peerDependencies: {
      react: '>=19.2.0 <20.0.0',
      'react-dom': '>=19.2.0 <20.0.0',
      'styled-components': '>=6.1.18 <7.0.0',
    },
    devDependencies: {
      'nice-configuration': 'file:../nice-configuration',
      react: '19.2.0',
      'react-dom': '19.2.0',
      'styled-components': '6.1.19',
      '@types/react': '^19.0.0',
      '@types/react-dom': '^19.0.0',
      '@rollup/plugin-commonjs': '^25.0.7',
      '@rollup/plugin-node-resolve': '^15.2.3',
      '@rollup/plugin-typescript': '^11.1.5',
      rollup: '^4.9.1',
      'rollup-plugin-dts': '^6.1.0',
      'rollup-plugin-peer-deps-external': '^2.2.4',
      tslib: '^2.6.2',
      typescript: '^5.5.0',
    },
  }, null, 2) + '\n';
}

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

function rollupConfig() {
  return `import { createConfiguration } from 'nice-configuration/rollup'

export default createConfiguration()
`;
}

function srcIndex(componentName) {
  return `export { default } from "./components/${componentName}"
export { default as ${componentName}Types } from "./components/${componentName}/types"
export * from "./components/${componentName}/types"
export { ${componentName}Styles, get${componentName}Token } from "./tokens"
`;
}

function componentFile(componentName) {
  return `import React from "react"
import type { ${componentName}Props } from "./types"

const ${componentName}: React.FC<${componentName}Props> = ({
  children,
}) => {
  return (
    <div>{children}</div>
  )
}

export default ${componentName}
`;
}

function typesFile(componentName) {
  return `import * as React from "react"

/**
 * ${componentName}Props
 *
 * Complete prop definition for the ${componentName} component.
 */
export interface ${componentName}Props {
  /** Content to render */
  children?: React.ReactNode
}

const ${componentName}Types = {} as const

namespace ${componentName}Types {
  export type Props = ${componentName}Props
}

export default ${componentName}Types
`;
}

function stylesFile() {
  return `import styled from "styled-components"

export const Wrapper = styled.div\`\`
`;
}

function componentIndex(componentName) {
  return `export { default } from "./${componentName}"
export { default as ${componentName}Types } from "./types"
export * from "./types"
`;
}

function getTokenFile(componentName) {
  const prefix = toPrefix(componentName);
  return `import { getComponentToken, type TokenResult } from "nice-react-styles"

export function get${componentName}Token(name: string, variant?: string, mode?: string): TokenResult {
  return getComponentToken("${prefix}", name, variant, mode)
}
`;
}

function stylesComponentFile(componentName) {
  return `import type { ComponentType } from "react"

export const ${componentName}Styles: ComponentType = () => null
`;
}

function tokensIndex(componentName) {
  return `export { ${componentName}Styles } from "./${componentName}Styles"
export { get${componentName}Token } from "./get${componentName}Token"
`;
}

module.exports = {
  capitalize,
  toComponentName,
  toPrefix,
  packageJson,
  tsconfigJson,
  rollupConfig,
  srcIndex,
  componentFile,
  typesFile,
  stylesFile,
  componentIndex,
  getTokenFile,
  stylesComponentFile,
  tokensIndex,
};