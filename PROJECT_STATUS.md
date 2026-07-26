# Project Status — Skillona Globe MVP

## Current stage

Stage 1: Functional visual prototype

## Completed

- [x] Reuse `skillona.ai` for the initial MVP
- [x] Preserve globe-first product differentiation
- [x] Establish English as the application UI language
- [x] Build full-screen interactive 3D globe
- [x] Add global sample property dataset
- [x] Add property markers and marker clustering
- [x] Add location/property search
- [x] Add basic filters and sorting
- [x] Add desktop and mobile result interface
- [x] Add property detail view
- [x] Add saved properties prototype
- [x] Add browser-based listing publication prototype
- [x] Document deployment and production limitations

## Next

- [x] Push this prototype to a development branch (`globe-mvp`)
- [x] Open a draft pull request (#1)
- [x] Prepare Supabase + PostGIS schema (`supabase/migrations/0001_init_schema.sql`)
- [x] Create Supabase project and run migration 0001
- [ ] Run migration 0002 in the SQL Editor (coords + photo upload permissions)
- [x] Connect the globe to the live database: auth, listing publication, photo upload
- [ ] Confirm Vercel preview deployment
- [ ] Review UI and globe behavior
- [ ] Build Supabase schema with PostGIS
- [ ] Add authentication
- [ ] Add real listing storage and image uploads
- [ ] Build moderation dashboard
- [ ] Add Stripe test-mode listing payments

## Acceptance criteria for this stage

- Globe loads and rotates
- User can zoom anywhere in the world
- Listing markers are clickable
- Search and filters change both the list and globe
- Details open from list or marker
- User can add a local test listing and see it on the globe
- Interface works on desktop and mobile
