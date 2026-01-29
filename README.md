# fid

[English](README.md) | [한국어](README.ko.md)

A terminal UI for viewing git diffs with style.

![fid](https://img.shields.io/badge/terminal-UI-blue)

## Features

- **Diff Viewer** - View git diffs with syntax highlighting
- **Staged/Unstaged Sections** - Easily distinguish between staged and unstaged changes
- **Multiple Themes** - One Dark, GitHub Dark, Monokai
- **Setup Wizard** - First-run configuration with live preview
- **Command Palette** - Quick access to files and commands with `/` key
- **Keyboard Navigation** - Vim-style navigation (j/k/g/G) and arrow keys

## Installation

### Homebrew (Recommended)

```bash
brew install 3000-2/tap/fid
```

To update:

```bash
brew upgrade fid
```

### From Source

```bash
git clone https://github.com/3000-2/fid.git
cd fid
bun install
```

Requires [Bun](https://bun.sh) runtime.

## Usage

```bash
# Homebrew
fid
fid /path/to/git/repo

# From source
bun run start
bun run start /path/to/git/repo
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `/` | Open command palette |
| `?` | Show help |
| `j` / `↓` | Move down |
| `k` / `↑` | Move up |
| `g` | Go to first file |
| `G` | Go to last file |
| `Enter` | Select file |
| `b` | Toggle sidebar |
| `r` | Refresh files |
| `Esc` | Close modal |
| `Ctrl+C` | Exit |

## Command Palette

Press `/` to open the command palette. You can:

- **Search files** - Type to filter changed files by name
- **Settings** - Open theme and preferences
- **Help** - View keyboard shortcuts
- **Refresh** - Reload changed files

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
