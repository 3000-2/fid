# fid

[English](README.md) | [한국어](README.ko.md)

A terminal UI for viewing git diffs with style.

![fid](https://img.shields.io/badge/terminal-UI-blue)

## Features

- **Diff Viewer** - View git diffs with syntax highlighting
- **Staged/Unstaged Sections** - Easily distinguish between staged and unstaged changes
- **Multiple Themes** - One Dark, GitHub Dark, Monokai
- **Setup Wizard** - First-run configuration with live preview
- **Settings Modal** - Change settings on the fly with `/` key
- **Keyboard Navigation** - Vim-style navigation (j/k) and arrow keys

## Requirements

- [Bun](https://bun.sh) runtime
- [opentui](https://github.com/anthropics/opentui) (local dependency)

## Installation

```bash
git clone https://github.com/3000-2/fid.git
cd fid
bun install
```

## Usage

```bash
# Run in current directory
bun run start

# Run in specific directory
bun run start /path/to/git/repo
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `j` / `↓` | Move down |
| `k` / `↑` | Move up |
| `Enter` | Select file |
| `/` | Open settings |
| `Esc` | Close settings |
| `b` | Toggle sidebar |
| `r` | Refresh files |
| `Ctrl+C` | Exit |

## Configuration

Settings are stored in `~/.config/fid/config.json`:

```json
{
  "theme": "one-dark",
  "sidebarPosition": "left"
}
```

### Available Themes

- `one-dark` - Dark blue-gray (default)
- `github-dark` - Dark with blue accents
- `monokai` - Classic dark with warm colors

### Sidebar Position

- `left` - Files on the left side
- `right` - Files on the right side

## License

MIT
