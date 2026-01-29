# FID

Terminal UI for viewing git diffs with style. Built with Bun + TypeScript + @opentui/core.

## Project Structure

```
src/
├── index.ts          # Entry point
├── components/       # UI components (CommandPalette, DiffViewer, GitChanges, etc.)
├── layouts/          # MainLayout - app orchestration
├── services/         # git.ts (git ops), config.ts (settings)
├── themes/           # Color themes
└── utils/            # logger, path, fuzzy, clipboard
```

## Commands

```bash
bun run start              # Run app
bun run start /path/to/repo
bun run dev                # Watch mode
```

## Critical Rules

**NEVER commit or push without explicit user permission.**

**NEVER use console.log/console.error.** Use `logger` from `src/utils/logger.ts`.

**ALWAYS validate external paths** with `safeResolvePath()` from `src/utils/path.ts` to prevent path traversal.

## Conventions

- All git commands must use `-C ${cwd}` option
- Use `isExpectedGitError()` for silent handling of common git errors
- Use `loadingId` pattern for async operations with UI updates to prevent race conditions
- All colors from `theme.colors` object
- Components extend `BoxRenderable`, implement `handleKey()`, `setTheme()`, `destroy()`

## Config

`~/.config/fid/config.json` - theme, sidebarPosition, sidebarWidth, browseAllFiles
