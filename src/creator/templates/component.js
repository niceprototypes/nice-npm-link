/**
 * @fileoverview Component-folder templates — the .tsx, .types.ts,
 * .styles.ts, and folder index that live under src/components/{Name}/.
 *
 * @module creator/templates/component
 */

/**
 * The minimal component implementation file.
 *
 * @param {string} componentName - PascalCase component name
 * @returns {string}
 */
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

/**
 * The types file — interface + namespace pattern matching nice-react-typography.
 *
 * @param {string} componentName
 * @returns {string}
 */
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

/**
 * The styles file — empty styled wrapper, ready to be filled in.
 *
 * @returns {string}
 */
function stylesFile() {
  return `import styled from "styled-components"

export const Wrapper = styled.div\`\`
`;
}

/**
 * The component-folder index — re-exports the default and the types namespace.
 *
 * @param {string} componentName
 * @returns {string}
 */
function componentIndex(componentName) {
  return `export { default } from "./${componentName}"
export { default as ${componentName}Types } from "./types"
export * from "./types"
`;
}

module.exports = { componentFile, typesFile, stylesFile, componentIndex };
