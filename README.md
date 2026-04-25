# LocalRank Studio

A self-contained SEO rank-tracking web app prototype for location-based keyword monitoring.

## What it does

- Accepts keywords by manual input, CSV/TXT upload, or Excel upload when the SheetJS CDN is available.
- Captures client, campaign domain, target pages, country, city/ZIP/region, language, device, search engine, and location engine.
- Runs a deterministic demo SERP check so the UI can be tested without scraping search engines.
- Supports a live SERP API backend endpoint for real rank data.
- Shows local ranking positions, changes, matched target pages, SERP features, priority gaps, and campaign KPIs.
- Saves campaign state in browser local storage and exports results as CSV.

## Open the app

Run the local backend so live checks can keep the SerpApi key private:

```powershell
$env:SERPAPI_KEY="your_serpapi_key"
node server.mjs
```

Then open `http://127.0.0.1:4173/`.

You can get a free SerpApi key from [SerpApi pricing](https://serpapi.com/pricing). The free tier is useful for testing, but it is limited, so one scan can use many credits:

```text
keywords x locations x devices = searches used
```

## Accuracy note

Demo mode is not accurate rank tracking. It generates stable sample positions for UI testing only.

For production, switch **Rank source** to **SerpApi live backend**. The included `server.mjs` calls SerpApi with location, device, language, country, keywords, and target pages, then returns normalized rank rows to the browser. Direct automated scraping and IP rotation against search engines can violate provider terms, so the app uses a provider API instead.

Expected live endpoint shape:

```json
{
  "results": [
    {
      "keyword": "emergency dentist",
      "location": "Chicago, IL",
      "rank": 7,
      "change": 2,
      "matchedPage": "https://example.com/services/emergency-dentist",
      "features": ["Map Pack", "Reviews"],
      "status": "win"
    }
  ]
}
```
