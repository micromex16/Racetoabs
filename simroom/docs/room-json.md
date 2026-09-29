# room.json reference

`room.json` is the whole room: name, look, tiles, folders, displays and hotkeys.
It lives in `%APPDATA%\SimRoom\` next to two folders:

```
%APPDATA%\SimRoom\
  room.json      the configuration (this document)
  assets\        your images: logos, tile art, backgrounds, slideshow photos
  backups\       room-<date>-<time>.json, written before every save (last 50 kept)
  room.schema.json   a copy of the schema, refreshed each time SimRoom starts
```

The machine-readable schema is [`schema/room.schema.json`](../schema/room.schema.json).
Point your editor at it (VS Code picks it up automatically through the `"$schema": "./room.schema.json"` line)
and you get autocomplete and red squiggles while you type.

**Hand edits apply live.** Save the file and the home screen redraws within a second.
If the file has a mistake, SimRoom shows a readable list of what's wrong and where,
and leaves your file alone until you fix it or choose to start from the sample room
(the broken file is kept as `room.broken-<date>.json`).

To check a file without the app: `npm run check -- "%APPDATA%\SimRoom\room.json"`.

Anything you leave out gets its default, so a minimal room is:

```json
{ "version": 1, "room": { "name": "My Room" }, "tiles": [] }
```

Sizes marked "px at 1080p" scale with the screen, so the same room looks the
same on a 1080p TV and a 4K projector.

---

## Top level

| Key | What it is |
|---|---|
| `version` | Always `1`. |
| `room` | Name and tagline. |
| `logo` | Your logo and where it sits. |
| `clock` | Clock and date in the header. |
| `theme` | Which theme is active, plus your own themes. |
| `tileStyle` | Corner radius, border, shadow, glow and label size for every tile. |
| `grid` | Columns and spacing. |
| `tiles` | The home-screen tiles, in order. |
| `displays` | What each monitor shows (Phase 4). |
| `idle` | The ambient screen after inactivity (Phase 5). |
| `hotkeys` | Global keys (Phase 2/3). |
| `startup` | Auto-start and full screen. |
| `security` | Optional PIN (set from the editor, Phase 3). |

## `room`

| Key | Default | Notes |
|---|---|---|
| `name` | required | Up to 80 characters. |
| `tagline` | `""` | Smaller line under the name. |
| `namePosition` | `"left"` | `left`, `center`, `right`. The clock moves to the left when the name is on the right. |
| `nameSize` | `56` | px at 1080p, 24–160. |
| `showName` | `true` | `false` hides the text so the logo stands alone. |

## `logo`

| Key | Default | Notes |
|---|---|---|
| `image` | `null` | A PNG or SVG in `assets\`, e.g. `"logo.png"` or `"logos/club.svg"`. |
| `position` | `"top-left"` | `top-left`, `top-center`, `top-right`, `bottom-left`, `bottom-right`, `watermark` (big and centered behind the tiles). |
| `height` | `88` | px at 1080p. Bottom positions draw at 60% of this. |
| `opacity` | `1` | 0–1. Try 0.08–0.15 for a watermark. |

## `clock`

`show` (`true`), `format` (`"12h"` or `"24h"`), `showDate` (`true`).

## `theme`

```json
"theme": {
  "active": "clubhouse",
  "custom": [
    {
      "id": "my-club",
      "name": "My Club",
      "colors": {
        "background": "#0c2418", "tile": "#163b28", "tileHover": "#1f5238",
        "text": "#f7f1e1", "muted": "#d2c7a8", "accent": "#d4af55", "border": "#2f6146"
      },
      "fonts": { "display": "Playfair Display", "body": "Inter" },
      "background": { "type": "image", "image": "backgrounds/course.jpg", "fit": "cover", "overlay": 0.5 }
    }
  ]
}
```

Built-in presets for `active`: `clubhouse`, `cinema`, `arcade`, `sonoran`, `metal`, `black`.
If `active` names a theme that doesn't exist you get Clubhouse and a warning.

**Colors:** hex (`#rgb`, `#rrggbb`, `#rrggbbaa`). `accent` colors the icons, focus ring and hover glow. `muted` is for secondary text like the date.

**Fonts** (bundled, work offline): `Inter`, `Oswald`, `Bebas Neue`, `Montserrat`, `Playfair Display`, `Roboto Condensed`, `Segoe UI`. `display` is used for the room name, clock and tile labels; `body` for everything else.

**Background:**

| `type` | Keys |
|---|---|
| `solid` | Uses `colors.background`. |
| `gradient` | `from`, `to`, `angle` (degrees, default 160), `radial` (`true` = glow from the top). |
| `image` | `image` (file in `assets\`), `fit` (`cover`, `contain`, `tile`), `overlay` (0–0.95 darkening, default 0.45). |

## `tileStyle`

| Key | Default | Notes |
|---|---|---|
| `radius` | `18` | Corner radius, 0–64. |
| `border` | `2` | Border width in px, 0 = none. |
| `shadow` | `true` | Drop shadow under tiles. |
| `hoverGlow` | `true` | Accent glow on hover/focus. |
| `labelSize` | `28` | px at 1080p, 24–72. Featured (2x2) tiles draw labels ~1.9x bigger. Never below 24. |

## `grid`

`columns` (`6`, 2–12) and `gap` (`22`, px at 1080p). Tiles flow left to right and
fill holes automatically. The grid sizes itself to fit the screen without scrolling
whenever it can.

## Tiles

Every tile has:

| Key | Default | Notes |
|---|---|---|
| `id` | required | Unique across the whole room. Letters, numbers, `-`, `_`. |
| `label` | required | Up to 40 characters. |
| `kind` | required | `launch`, `folder`, `website`, `action`. |
| `size` | `"1x1"` | `1x1` square, `2x1` wide, `2x2` featured. |
| `labelPosition` | `"bottom-left"` | `bottom-left`, `bottom-center`, `hidden`. |
| `art` | first letter | See below. |

### `art`

| `type` | Keys |
|---|---|
| `icon` | `icon`: a built-in icon name (list below). |
| `image` | `image`: a file in `assets\`; it fills the tile and the label sits on a dark fade. |
| `glyph` | `glyph`: a big letter or emoji, e.g. `"⛳"`. |

Any art type can also set `color` (the tile's background) and `iconColor`
(the icon or glyph color; default is the theme accent).

**Built-in icons:** golf, flag, target, trophy, crown, theater, tv, tv-old, ticket,
play, video, camera, photo, games, gamepad, xbox, steam, twitch, music, radio,
headphones, mic, speaker, web, www, news, leaderboard, chart, netflix, youtube,
spotify, amazon, disney, apple, plane, flight, wind, satellite, antenna, wifi,
weather, cloud, sun, moon, temperature, settings, adjustments, tools, power, sleep,
restart, exit, door, lock, home, back, desktop, laptop, volume, volume-low, mute,
apps, grid, folder, sparkles, star, heart, bulb, bolt, clock, stopwatch, calendar,
user, users, map-pin, car, bike, run, swim, football, basketball, tennis, baseball,
american-football, beer, drink, coffee, pizza.

### `kind: "launch"`

Runs `steps` in order (Phase 2 does the launching; Phase 1 shows what would run).

```json
{
  "id": "golf", "label": "GOLF", "kind": "launch", "size": "2x2",
  "art": { "type": "icon", "icon": "golf" },
  "steps": [
    {
      "name": "Foresight launch monitor",
      "path": "C:\\Program Files\\Foresight Sports\\FSX Pro\\FSX Pro.exe",
      "wait": { "type": "process", "process": "FSX Pro.exe", "timeout": 90 }
    },
    { "name": "FSX Play", "path": "C:\\Program Files\\Foresight Sports\\FSX Play\\FSX Play.exe", "focus": true }
  ]
}
```

| Step key | Notes |
|---|---|
| `path` | Required. An `.exe`, a Start Menu `.lnk`, or a URI like `steam://open/bigpicture`. `%APPDATA%`-style variables work. Remember to double every `\` in JSON. |
| `name` | Friendly name shown while launching. |
| `args` | List of arguments, e.g. `["-bigpicture"]`. |
| `cwd` | Working folder; defaults to the exe's folder. |
| `processName` | What counts as "already running"; defaults to the exe name. |
| `wait` | `{ "type": "none" }`, `{ "type": "seconds", "seconds": 5 }`, `{ "type": "window", "title": "FSX" }`, or `{ "type": "process", "process": "FSX Pro.exe" }`, each with an optional `timeout` (seconds, default 90). |
| `focus` | `true` brings this program to the front once it's up. |

### `kind: "folder"`

Has its own `tiles` list; folders can hold folders. Opening one shows a Back tile first; **Esc** goes up one level.

### `kind: "website"`

`url`: the page to open in a full-screen kiosk window with a Home button (Phase 2).

### `kind: "action"`

`action` is one of: `sleep`, `restart`, `shutdown`, `show-desktop`, `volume-up`,
`volume-down`, `mute`, `windows-settings`, `next-theme`, `open-room-folder`, `exit`.
In Phase 1, `next-theme`, `open-room-folder`, `windows-settings` and `exit` work; the rest arrive in Phase 2.

## `displays` (Phase 4)

```json
"displays": {
  "assignments": {
    "<display id>": { "label": "Projector", "role": "image", "image": "splash.jpg", "fit": "cover" }
  }
}
```

`role`: `home`, `image`, `slideshow` (`folder`, `interval`, `crossfade`), `clock`, `mirror`, `none`.
You'll assign these by dragging in the editor rather than typing ids.

## `idle` (Phase 5)

`enabled` (`true`), `minutes` (`10`), `folder` (`"slideshow"`, inside `assets\`), `interval` (`12` seconds per photo).

## `hotkeys`

`home` (`"Ctrl+Alt+Home"`) brings SimRoom back over any game; `editor` (`"Ctrl+E"`) toggles the editor.
They use Electron accelerator syntax: `Ctrl`, `Alt`, `Shift`, `Super`, plus a key like `Home`, `F12`, `E`.

## `startup`

`autoStart` (`true`, start at Windows sign-in; Phase 5) and `fullscreen` (`true`).

## `security`

`pinHash` (`null`): set from the editor in Phase 3. It guards Exit to Windows and the editor.
