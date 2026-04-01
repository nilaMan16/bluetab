# BlueTab

BlueTab is a Ghibli-inspired trip planning web app built for low-network use. It stores data locally in IndexedDB, syncs to Supabase when online, supports phone-number OTP authentication, and lets travelers share trips through invite codes and QR codes.

## Features

- Create multiple trips with destination, dates, notes, and mood-driven cover text.
- Build an itinerary with timed stops and cost estimates.
- Save places with address text, map links, categories, and price estimates.
- Track shared expenses and rough per-person budget splits.
- Keep preparation checklists and freeform travel notes.
- Work offline first with local persistence in IndexedDB.
- Sync trips to Supabase cloud storage after sign in.
- Invite collaborators with a shareable code and QR.
- Installable PWA for better mobile and low-connectivity use.

## Stack

- React + Vite + TypeScript
- Supabase Auth and Postgres for online backend
- Dexie / IndexedDB for local-first persistence
- `vite-plugin-pwa` for caching and installability

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy environment variables:

   ```bash
   copy .env.example .env
   ```

3. Fill in your Supabase values in `.env`.

4. Run the app:

   ```bash
   npm run dev
   ```

## Supabase setup

1. Create a new Supabase project.
2. In the SQL editor, run [`supabase/schema.sql`](./supabase/schema.sql).
3. In Authentication, enable Phone auth and configure an SMS provider for OTP delivery.
4. Copy the project URL and anon key into `.env`.

The schema uses Row Level Security so authenticated members of a trip can read and update it.

## Deploy

### Frontend

Deploy the Vite app to Vercel, Netlify, or Cloudflare Pages.

- Build command: `npm run build`
- Output directory: `dist`
- Environment variables:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`

### Backend

Supabase acts as the online backend server:

- Authentication service
- Postgres database
- REST and realtime APIs

## Next improvements

- Add image uploads for tickets and moodboards.
- Add route weather and forecast cards.
- Add exchange-rate helpers and settlement suggestions.
- Add drag-and-drop itinerary ordering.
- Add push notifications for booking reminders.
