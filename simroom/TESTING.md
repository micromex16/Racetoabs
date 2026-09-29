# Testing SimRoom

## Phase 1: skeleton

### Install

1. Run `SimRoom-Setup-0.1.0.exe` (or build it yourself: `npm install`, then `npm run dist`; output lands in `dist\`).
   The installer isn't code-signed yet, so Windows SmartScreen will say "Windows protected your PC".
   Click **More info → Run anyway**.
2. Keep the defaults and let it launch at the end.
   - Or skip installing and double-click `SimRoom-Portable-0.1.0.exe`.
   - Or from source: `npm install`, then `npm start` (full screen) or `npm run start:windowed` (in a normal window).

### What to check

| # | Do this | You should see |
|---|---|---|
| 1 | Launch SimRoom | Full screen, no taskbar or window frame. Header shows **Micromex Sim Room**, "Tap a square to play", and the time and date on the right. |
| 2 | Look at the grid | GOLF is the big 2x2 tile on the left, then Condor, Theater, Music, PGA Tour, Games, Weather, The Room. Everything fits with no scrolling. Folder tiles show a small folder badge with a count. |
| 3 | Stand across the room | Every tile label is readable. |
| 4 | Hover or tap a tile | Its border lights up in the accent color and it glows. |
| 5 | Tap **Theater** | A Back tile, then Netflix, YouTube TV and Prime Video, each in its brand color. The footer shows *Home › Theater* and *Esc Back*. |
| 6 | Press **Esc** | Back to Home. Press Esc again at Home: nothing happens (it never exits). |
| 7 | Open **Music**, tap **Back**; open **Games**, tap **Home** in the footer | Each one returns Home. |
| 8 | Tap **GOLF** | A message says it will start Foresight launch monitor, then FSX Play, and that launching arrives in Phase 2. Nothing launches yet. |
| 9 | Tap **PGA Tour** | A message says it will open the leaderboard website in Phase 2. |
| 10 | **The Room → Next Theme**, 6 times | The theme cycles Cinema → Arcade → Sonoran Desert → Brushed Metal → Black → Clubhouse, with a "Theme: …" message each time. Every theme stays easy to read. |
| 11 | Quit and relaunch | The theme you picked is still active. |
| 12 | **The Room → Room Folder** | Explorer opens `%APPDATA%\SimRoom\` with `room.json`, `assets\` and `backups\`. `backups\` holds one timestamped copy per theme change. |
| 13 | **The Room → Settings** | Windows Settings opens. |
| 14 | **The Room → Exit to Windows** | SimRoom closes. |

### Editing room.json by hand (live reload)

Leave SimRoom running and open `%APPDATA%\SimRoom\room.json` in Notepad.

| # | Change | You should see, within a second of saving |
|---|---|---|
| 15 | `"name": "Micromex Sim Room"` → `"name": "Back Nine"` | The header updates. |
| 16 | GOLF's `"size": "2x2"` → `"2x1"` | GOLF becomes a wide tile and the grid reflows. |
| 17 | `"columns": 6` → `4` | Bigger tiles, more rows. |
| 18 | `"format": "12h"` → `"24h"` | 24-hour clock. |
| 19 | `"namePosition": "left"` → `"center"`, then `"right"` | The name moves. On `right`, the clock moves to the left. |
| 20 | Delete a comma somewhere | A dark error screen names the problem with its line and column. It doesn't crash, and your file is untouched. Put the comma back and save: the home screen returns by itself. |
| 21 | Set a tile's `"size"` to `"3x3"` | The error reads like *tiles[0] "GOLF" → size must be one of: "1x1", "2x1", "2x2".* |
| 22 | On the error screen, click **Start from the sample room** | The sample room loads. Your broken file is kept as `room.broken-<date>.json`. |
| 23 | Give two tiles the same `"id"` | The error names both tiles. |
| 24 | Set `"active": "nope"` in `theme` | Clubhouse shows, with a message that theme "nope" wasn't found. |

### Logo and background (hand edit for now; the editor arrives in Phase 3)

25. Copy a PNG into `%APPDATA%\SimRoom\assets\` as `logo.png`, then set `"logo": { "image": "logo.png", "position": "top-left" }`. It appears beside the name.
    Try `"position": "watermark", "opacity": 0.12` for a large faint logo behind the tiles, and `"showName": false` under `room` for the logo alone.
26. Copy a photo into `assets\` as `bg.jpg`. Add a custom theme with
    `"background": { "type": "image", "image": "bg.jpg", "overlay": 0.5 }` (see `docs/room-json.md`) and set it active.
    The photo fills the screen and is darkened so the tiles stay readable.

### Known gaps in Phase 1 (by design)

- Launch, website, sleep, restart and volume tiles show a message instead of acting (Phase 2).
- There's no global hotkey or tray icon yet (Phase 2). To leave, use **The Room → Exit to Windows** or Alt+F4.
- There's no in-app editor yet (Phase 3). Edit `room.json` by hand; it reloads live.
