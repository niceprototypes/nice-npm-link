/**
 * @fileoverview String helpers used by the template emitters.
 *
 * @module creator/templates/helpers
 */

/**
 * Capitalizes first letter of a string.
 * @param {string} s
 * @returns {string}
 */
function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Converts a package name like "nice-react-lightbox" to the component
 * name "Lightbox".
 *
 * @param {string} packageName
 * @returns {string}
 */
function toComponentName(packageName) {
  // Drop the "nice-react-" prefix, split on hyphens, capitalize each segment.
  const suffix = packageName.replace(/^nice-react-/, '');
  return suffix.split('-').map(capitalize).join('');
}

/**
 * Converts a component name like "Lightbox" to a lowercase prefix "lightbox".
 *
 * @param {string} componentName
 * @returns {string}
 */
function toPrefix(componentName) {
  return componentName.charAt(0).toLowerCase() + componentName.slice(1);
}

module.exports = { capitalize, toComponentName, toPrefix };
