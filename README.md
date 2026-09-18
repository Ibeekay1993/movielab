# MovieLab

Production rebuild of the original single-file movie prototype.

## Direction

MovieLab combines premium personalization, dense discovery, transparent availability, and a rights-aware playback architecture, with Nigerian and African cinema treated as first-class discovery categories.

## Current branch

This branch establishes the React/TypeScript/Vite foundation and preserves the original myflix-single-file.html as the migration reference.

## Next

Supabase schema and RLS; catalogue ingestion; profiles; My List; Continue Watching; territory-aware availability; rights and playback authorization; recommendation engine; MovieLab GPT; admin CMS; automated tests; deployment.

## Content rule

MovieLab must only provide playback for content it is authorized to stream. Metadata, availability, and playback rights are separate concerns. External provider discovery should use legitimate provider destinations rather than scraping or proxying unauthorized streams.

## Commands

npm install
npm run dev
npm run build
npm test