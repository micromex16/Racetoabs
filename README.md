# Race to Abs

A 30-day accountability challenge. Sign in, tick off your daily check-ins, watch the leaderboard. No weight, no measurements, no photos — just points and streaks.

## What it does

- **Daily check-in** — 8 yes/no items, max 18 pts/day, 540 pts over 30 days
- **Shared start date** — everyone races the same calendar window
- **Live leaderboard** — sorted by total challenge points
- **Streaks** — consecutive logged days
- **Cross-device** — log from phone or laptop, all synced

## Setup (one time, ~5 min)

### 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → sign up → **New project** (free tier is plenty).
2. Pick a region near you. Save the project password somewhere; you won't need it for the app.

### 2. Run the schema

1. In the Supabase dashboard, open **SQL Editor → New query**.
2. Paste the contents of [`supabase/schema.sql`](supabase/schema.sql) and click **Run**.
3. This creates the `settings`, `profiles`, and `entries` tables with row-level security.

### 3. Set the challenge start date

1. Open **Table Editor → settings**.
2. Edit the single row's `challenge_start_date` to whatever calendar date the group starts. (`challenge_days` defaults to 30.)

### 4. Configure auth redirect

The app uses email **magic links**. The link in the email needs to point back to where the app is hosted.

1. Open **Authentication → URL Configuration**.
2. Set **Site URL** to wherever you'll host the app (e.g. `https://racetoabs.netlify.app` or `http://localhost:8000` for local).
3. Add the same URL under **Redirect URLs**.

### 5. Drop your keys into the app

1. Open **Project Settings → API**.
2. Copy **Project URL** and the **anon/public** key.
3. Paste them into [`config.js`](config.js):
   ```js
   window.RACE_CONFIG = {
     SUPABASE_URL: "https://YOURPROJECT.supabase.co",
     SUPABASE_ANON_KEY: "eyJhbGciOi...",
   };
   ```

The anon key is safe to ship to the browser — RLS in `schema.sql` controls what users can read/write.

## Run it

The app is three static files (`index.html`, `styles.css`, `app.js`) plus `config.js`. It needs to be served over HTTP (not opened as `file://`) for magic-link auth to work.

**Quick local test:**
```bash
python3 -m http.server 8000
# open http://localhost:8000
```

**Deploy:** push the repo to GitHub and connect it to [Netlify](https://netlify.com), [Vercel](https://vercel.com), or [Cloudflare Pages](https://pages.cloudflare.com). No build step.

## Daily checklist

| Item | Points |
|---|---|
| 30 minutes of exercise | 3 |
| Extra 5 minutes of core | 2 |
| Hit your nutrition goal | 3 |
| More than 7 hours of sleep | 2 |
| More than 60 oz of water | 2 |
| Stretched or foam rolled | 2 |
| No alcohol today | 2 |
| Less than 1 hr non-work screen time | 2 |
| **Daily max** | **18** |
| **30-day max** | **540** |

To rebalance, edit the `QUESTIONS` array at the top of `app.js`.

## How users join

1. Visit the site.
2. Enter their email → click the link in the inbox.
3. Pick a display name. That's it — they're in.

## Files

- `index.html` — markup for all four views (loading, sign-in, onboarding, app)
- `styles.css` — fitness-tracker dark theme
- `app.js` — auth, data loading, rendering, points/streak math
- `config.js` — your Supabase URL + anon key (you fill this in)
- `supabase/schema.sql` — tables, indexes, triggers, RLS policies
