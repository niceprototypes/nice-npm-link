# nice-npm-link

A utility to streamline the npm linking process for Nice components when working locally, automatically removing conflicting peer dependencies.

## Purpose

This tool was created specifically to simplify local development of the Nice component ecosystem. When developing multiple Nice React components that depend on each other (nice-react-button, nice-react-icon, nice-react-flex, etc.), this tool ensures smooth linking without the common pitfalls of duplicate React instances.

## Problem

When developing multiple React component libraries that depend on each other, you often run into issues with duplicate React instances and conflicting peer dependencies. This happens because each linked package brings its own copy of React, React DOM, and styled-components, causing:

- "Invalid hook call" errors
- Multiple React instances running simultaneously
- Styled-components context issues
- TypeScript declaration conflicts

## Solution

`nice-npm-link` solves this by:

1. **Cleaning up conflicting packages** - Removes duplicate copies of React, React DOM, styled-components, and their TypeScript definitions from `node_modules`
2. **Proper npm linking** - Creates global links and links them to your project in the correct order
3. **Simple CLI interface** - Just point it at your component directory and it handles the rest

## Installation

### Global Installation (Recommended)

```bash
npm install -g nice-npm-link
```

### Local Installation

```bash
npm install nice-npm-link
npx nice-npm-link --help
```

## Usage

### Link a Component Package

```bash
# From your main project directory
nice-npm-link ../nice-react-button

# Or with absolute path
nice-npm-link /Users/username/Code/nice-react-button
```

### Clean Only (Remove Conflicting Packages)

```bash
# Remove default packages only
nice-npm-link --clean-only

# Remove custom packages only
nice-npm-link --clean-only --exclude @mui/material,@mui/icons-material

# Add extra packages to default list
nice-npm-link --clean-only --add-exclude @emotion/react,@emotion/styled
```

### Custom Package Exclusion

```bash
# Override default packages with custom list
nice-npm-link --exclude react,react-dom ../nice-react-button

# Add additional packages to the default exclusion list
nice-npm-link --add-exclude @emotion/react,@emotion/styled ../nice-react-button

# Combine both (removes only react, react-dom, and @mui packages)
nice-npm-link --exclude react,react-dom --add-exclude @mui/material ../nice-react-button
```

### Help

```bash
nice-npm-link --help
```

## What It Does

1. **Removes conflicting packages** from your `node_modules`:
   - Default packages removed:
     - `react`
     - `react-dom`
     - `styled-components`
     - `@types/react`
     - `@types/react-dom`
   - Or your custom list of packages using `--exclude`
   - Or default packages plus your additions using `--add-exclude`

2. **Creates npm link** in the target package directory

3. **Links the package** to your current project

4. **Provides feedback** on each step with clear success/error messages

## Example Workflow

```bash
# In your main project (e.g., helpshelf-ui)
cd /path/to/helpshelf-ui

# Link your button component
nice-npm-link ../nice-react-button

# Now you can import and use the component
# Changes to nice-react-button will be reflected immediately
```

## Unlinking

To unlink a package later:

```bash
npm unlink package-name
```

## Requirements

- Node.js and npm
- The target package must have a valid `package.json`
- You must run this from the project where you want to link the package

## License

MIT