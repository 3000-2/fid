# fid

[English](README.md) | [한국어](README.ko.md)

A terminal UI for viewing git diffs with style.

![fid](https://img.shields.io/badge/terminal-UI-blue)

## Features

- **Diff Viewer** - View git diffs with syntax highlighting
- **Search in Diff** - Find text in diff view with `Ctrl+F`
- **Git Log** - View commit history with ASCII graph visualization and auto-pagination
- **Staged/Unstaged Sections** - Easily distinguish between staged and unstaged changes
- **Stage/Unstage** - Toggle file staging with `s` key
- **Hunk Operations** - Stage, unstage, or discard individual hunks
- **Commit** - Commit staged changes directly from the command palette
- **Full File View** - Toggle between diff and full file view with `o` key
- **Monorepo Support** - Group files by project directory (e.g., `apps/web`, `packages/ui`)
- **Submodule Support** - Track and view changes in git submodules
- **Multiple Themes** - One Dark, GitHub Dark, Monokai, Catppuccin, Dracula
- **Setup Wizard** - First-run configuration with live preview
- **Command Palette** - Fuzzy search for files and commands with `/` key
- **Keyboard Navigation** - Vim-style navigation (j/k/g/G) and arrow keys
- **Auto-Refresh** - Automatically refreshes when terminal gains focus

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

### General
| Key | Action |
|-----|--------|
| `Tab` | Toggle focus (Sidebar / Diff) |
| `/` | Open command palette |
| `?` | Show help |
| `b` | Toggle sidebar |
| `r` | Refresh files |
| `Ctrl+C` | Exit |

### Sidebar (when focused)
| Key | Action |
|-----|--------|
| `j` / `k` | Navigate files |
| `g` / `G` | First / Last file |
| `Enter` | Select file |
| `s` | Stage / Unstage file |
| `[` / `]` | Resize sidebar |

### Diff View (when focused)
| Key | Action |
|-----|--------|
| `j` / `k` | Scroll up / down |
| `d` / `u` | Half page down / up |
| `gg` / `G` | Top / Bottom |
| `n` / `N` | Next / Previous hunk |
| `+` | Stage current hunk |
| `-` | Unstage current hunk |
| `x` | Discard current hunk |
| `o` | Toggle full file view |
| `L` | Load more lines (for large files) |
| `Ctrl+F` | Search in diff |

### Git Log View
| Key | Action |
|-----|--------|
| `j` / `k` | Navigate commits |
| `g` / `G` | First / Last commit |
| `d` / `u` | Half page down / up |
| `Enter` | View commit files |
| `Esc` | Close log / Exit commit view |

Commits are loaded automatically as you scroll to the bottom.

## Command Palette

Press `/` to open the command palette. You can:

- **Fuzzy search** - Type partial matches (e.g., `mlay` finds `MainLayout.ts`)
- **Browse all files** - Search any project file (enable in Settings)
- **Scroll results** - Use arrow keys to navigate through all matches
- **Commit** - Commit staged changes with a message
- **Log** - View commit history with graph
- **Stage All** - Stage all changed files
- **Unstage All** - Unstage all staged files
- **Settings** - Open theme and preferences
- **Help** - View keyboard shortcuts
- **Refresh** - Reload changed files

## Configuration

Settings are stored in `~/.config/fid/config.json`:

```json
{
  "theme": "one-dark",
  "sidebarPosition": "left",
  "sidebarWidth": 32,
  "browseAllFiles": false
}
```

### Available Themes

- `one-dark` - Dark blue-gray (default)
- `github-dark` - Dark with blue accents
- `monokai` - Classic dark with warm colors
- `catppuccin` - Soothing pastel theme
- `dracula` - Dark with vibrant colors

### Sidebar Position

- `left` - Files on the left side
- `right` - Files on the right side

### Browse All Files

When enabled, the command palette allows searching all project files, not just git changes.

## License

MIT
