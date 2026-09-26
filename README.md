# Kausu uzskaite (bucket counter PWA)

Offline-capable counter for loader buckets per shift. Plain static files — no build step.

## Run locally
```
python3 -m http.server 8000
```
Open http://localhost:8000

## Deploy (needs HTTPS for install/offline)
- **Netlify:** drag this folder onto https://app.netlify.com/drop
- **GitHub Pages:** push the folder to a repo → Settings → Pages → deploy from `main` / root.

After changing any file, bump `CACHE` in `sw.js` (e.g. `kausi-v2`) so phones pick up the update.

## Install on phone
- **iPhone:** open the link in **Safari** → Share → **Add to Home Screen**. (Must be Safari; keep it on the Home Screen so iOS doesn't clear the saved data.)
- **Android:** open in Chrome → menu → **Install app** / Add to Home screen.

## Usage
- Tap **+ / −** or type a number. Row flashes yellow on each change. **↶ Atsaukt** undoes the last change.
- Counts are saved on every tap (survive closing the app).
- **Pabeigt maiņu** saves the shift to history and resets to 0, then offers to share the report.
- **☰** opens history: tap a shift to share, download CSV, or delete. CSV is `;`-separated UTF-8 (opens correctly in Excel with Latvian letters).

## Changing the items
Edit the `ITEMS` array at the top of `app.js` (keep `id`s stable so history still lines up).
