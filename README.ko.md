# fid

[English](README.md) | [한국어](README.ko.md)

스타일리시한 터미널 Git Diff 뷰어

![fid](https://img.shields.io/badge/terminal-UI-blue)

## 기능

- **Diff 뷰어** - 구문 강조가 적용된 git diff 보기
- **Staged/Unstaged 섹션** - staged와 unstaged 변경사항 구분
- **다양한 테마** - One Dark, GitHub Dark, Monokai
- **설정 마법사** - 첫 실행 시 라이브 프리뷰와 함께 설정
- **명령 팔레트** - `/` 키로 파일 및 명령어 빠른 접근
- **키보드 네비게이션** - Vim 스타일 (j/k/g/G) 및 방향키 지원
- **자동 새로고침** - 터미널 포커스 시 자동으로 새로고침

## 설치

### Homebrew (권장)

```bash
brew install 3000-2/tap/fid
```

업데이트:

```bash
brew upgrade fid
```

### 소스에서 설치

```bash
git clone https://github.com/3000-2/fid.git
cd fid
bun install
```

[Bun](https://bun.sh) 런타임 필요.

## 사용법

```bash
# Homebrew
fid
fid /path/to/git/repo

# 소스에서 실행
bun run start
bun run start /path/to/git/repo
```

## 키보드 단축키

### 일반
| 키 | 동작 |
|-----|--------|
| `Tab` | 포커스 전환 (사이드바 / Diff) |
| `/` | 명령 팔레트 열기 |
| `?` | 도움말 보기 |
| `b` | 사이드바 토글 |
| `r` | 파일 새로고침 |
| `Ctrl+C` | 종료 |

### 사이드바 (포커스 시)
| 키 | 동작 |
|-----|--------|
| `j` / `k` | 파일 탐색 |
| `g` / `G` | 처음 / 마지막 파일 |
| `Enter` | 파일 선택 |
| `[` / `]` | 사이드바 크기 조절 |

### Diff 뷰 (포커스 시)
| 키 | 동작 |
|-----|--------|
| `j` / `k` | 위 / 아래 스크롤 |
| `d` / `u` | 반 페이지 아래 / 위 |
| `gg` / `G` | 처음 / 끝 |
| `n` / `N` | 다음 / 이전 hunk |

## 명령 팔레트

`/` 키를 눌러 명령 팔레트를 엽니다:

- **파일 검색** - 변경된 파일을 이름으로 필터링
- **Settings** - 테마 및 환경설정 열기
- **Help** - 키보드 단축키 보기
- **Refresh** - 변경된 파일 새로고침

## 설정

설정은 `~/.config/fid/config.json`에 저장됩니다:

```json
{
  "theme": "one-dark",
  "sidebarPosition": "left",
  "sidebarWidth": 32
}
```

### 테마

- `one-dark` - 다크 블루 그레이 (기본값)
- `github-dark` - 블루 액센트의 다크 테마
- `monokai` - 따뜻한 색상의 클래식 다크 테마

### 사이드바 위치

- `left` - 왼쪽에 파일 목록
- `right` - 오른쪽에 파일 목록

## 라이선스

MIT
