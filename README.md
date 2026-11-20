# D&G Bus Finder

A fast, accessible, mobile-first web application for searching live **Dumfries & Galloway** bus timetables — designed for non-regular bus users who find traditional PDF timetables confusing.

- **Live site:** `https://gordonwright10.github.io/Dgbuses/`
- **Hosting cost:** £0 (static site on GitHub Pages)
- **Data refresh:** Nightly GitHub Actions ETL pipeline pulling live **DfT NaPTAN** stops (`ATCO 680`) and **Traveline TNDS** Scottish timetables (`S.zip`)

## Features

- **Place-First Search:** Search by town/village (e.g. *Annan*, *Lockerbie*, *Castle Douglas*) or specific stop/landmark (e.g. *DGRI*, *Whitesands*).
- **Zero Timetable Jargon:** Plain-English boarding/alighting labels (*Opposite Bank of Scotland*, *Outside Loreburn Centre*), duration badges, and clear notices for *School days only*, *School holidays only*, and bank holiday restrictions.
- **Interactive Route & Stop Maps:** Powered by Leaflet + OpenStreetMap with boarding/alighting pins, stop-by-stop timelines, and GPS **Find stops near me**.
- **Simple Route Timetables:** Browse every D&G route by number, town, or operator with expandable stop lists instead of cramped PDF matrices.
- **Zero-Dependency Python ETL (`scripts/ingest.py`):** Uses Python 3 standard library only so nightly GitHub Actions syncs run quickly with zero `pip install` overhead.

## Local Development

```bash
# Install frontend dependencies
npm install

# (Optional) Regenerate sample D&G data in public/data/
python3 scripts/seed_sample_data.py

# Run ETL unit tests
python3 -m unittest discover -s tests -v

# Start Vite dev server
npm run dev
```

## Running the Live ETL Locally

```bash
export TNDS_FTP_USER="your-tnds-username"
export TNDS_FTP_PASS="your-tnds-password"
python3 scripts/ingest.py
```

You can also test with local files:

```bash
python3 scripts/ingest.py --local-naptan stops.csv --local-tnds S.zip
```

## GitHub Pages Setup

1. Ensure repository secrets `TNDS_FTP_USER` and `TNDS_FTP_PASS` are configured under **Settings → Secrets and variables → Actions**.
2. Under **Settings → Pages → Build and deployment**, set **Source** to **GitHub Actions**.
3. Push to `main` or manually trigger **Nightly Data Sync & Deploy to GitHub Pages** under the **Actions** tab.
