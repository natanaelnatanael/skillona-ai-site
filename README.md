# Skillona Globe — Real Estate Globe MVP

First functional prototype for converting `skillona.ai` from static micro-sites into a global real-estate marketplace built around an interactive 3D globe.

## What works now

- Interactive CesiumJS globe
- OpenStreetMap development imagery
- Property markers and automatic clustering
- Fly-to-property interaction
- Global search by country, city, title or property type (live, updates as you type)
- Filters for transaction, property type, price and coastal location (applied instantly on change)
- Result sorting
- Responsive property result cards
- Property detail panel
- Browser-based saved properties
- Prototype listing form
- New test listings stored in browser localStorage
- Responsive desktop and mobile layout

## What is intentionally not connected yet

- User accounts and authentication
- PostgreSQL/PostGIS database
- Server-side listing storage
- Image uploads
- Moderation queue
- Seller messaging
- Stripe payments
- Automatic translation and currency conversion
- Production map imagery or Cesium terrain

## Run locally

Because Cesium and map tiles are loaded from external CDNs, serve this directory over HTTP instead of opening the HTML file directly.

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Deploy

This is a static project and can be deployed directly to Vercel. The root `index.html` is the homepage.

## Production warning

The MVP uses the public OpenStreetMap tile server for development. A commercial launch must use a licensed/self-hosted map tile provider and comply with required attribution and usage policies.

## Next implementation stage

1. Confirm the visual direction and interaction model.
2. Replace local sample data with Supabase PostgreSQL + PostGIS.
3. Add authentication and user roles.
4. Build server-backed listing creation and photo uploads.
5. Add admin moderation and fraud reporting.
6. Add launch promotion rules and Stripe test payments.
7. Replace development map imagery with a commercial production provider.
