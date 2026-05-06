# Race to Abs

A simple daily-accountability tracker. Log a quick yes/no checklist each day, rack up points, and see who's winning the week.

## Run it

Open `index.html` in any modern browser. There's no build step and no backend — entries are saved to your browser's `localStorage`.

To share a live link, host the three files (`index.html`, `styles.css`, `app.js`) on any static host (GitHub Pages, Netlify, Vercel, etc.).

## Daily checklist & points

| Question | Yes | No |
|---|---|---|
| Did you exercise 30 minutes today? | +3 | 0 |
| Extra 5 minutes of core? | +2 | 0 |
| Did you hit your nutrition goal? | +3 | 0 |
| More than 7 hours of sleep? | +2 | 0 |
| More than 60 oz of water? | +2 | 0 |
| Did you stretch or foam roll? | +2 | 0 |
| No alcohol today? | +2 | 0 |
| Less than 1 hour of non-work screen time? | +2 | 0 |

Max **18 points/day**, **126 points/week**.

To rebalance, edit the `QUESTIONS` array at the top of `app.js`.

## Features

- One entry per person per day (re-saving the same name + date overwrites it).
- Weekly leaderboard (Mon–Sun) with a date picker to view past weeks.
- Full entry history with per-row delete.
- Mobile-friendly.

## Notes

- Data is stored only on the device that logged it. Each person tracks their own entries on their own browser, then compares totals.
- Use the same spelling of your name each day so the leaderboard groups your entries correctly (matching is case-insensitive and trimmed).
