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

## Telegram ingestion

MovieLab includes a permission-gated Telegram ingestion pipeline for channels and groups that MovieLab is authorized to use.

Flow:

`Telegram → telegram-webhook → telegram_media → ingestion job → AI classification → TMDB metadata → Supabase catalogue → media_assets`

The webhook accepts video messages from registered, active, permission-confirmed sources. Each source can independently enable `auto_publish`. High-confidence AI matches can then be published automatically; uncertain matches remain in review.

### Supabase Edge Function secrets

- `TELEGRAM_BOT_TOKEN` — bot token used by the webhook registration function.
- `TELEGRAM_WEBHOOK_SECRET` — secret Telegram sends with webhook requests.
- `TELEGRAM_PROCESSOR_SECRET` — internal secret protecting the ingestion processor.
- `TELEGRAM_PROCESSOR_URL` — deployed URL of `process-telegram-ingestion`.
- `TMDB_API_KEY` — metadata/artwork lookup.
- `GEMINI_API_KEY` — AI title/series/episode classification.
- `GEMINI_MODEL` — optional, defaults to `gemini-2.5-flash`.

The Telegram Bot API supports `channel_post` updates and webhook secret tokens; the connector therefore requires the bot to have the access Telegram permits for the source chat. A user account/MTProto connector is a separate adapter and should only be enabled for sources MovieLab is authorized to ingest.

### Deployment sequence

1. Apply the catalogue and Telegram migrations.
2. Deploy `telegram-webhook`, `process-telegram-ingestion`, and `telegram-register-webhook`.
3. Configure the secrets above.
4. Register each authorized channel/group in `telegram_channels`.
5. Set `permission_confirmed=true` only after the source owner has authorized MovieLab.
6. Set `status='active'`.
7. Enable `auto_publish=true` only for sources whose content MovieLab is authorized to publish automatically.
8. Register the Telegram webhook with the deployed webhook URL.


## Metadata and availability providers

MovieLab uses provider adapters so the catalogue is not locked to one external API.

- TMDB: movie/TV metadata, artwork, search, and watch-provider metadata. Its free developer API is for non-commercial use with attribution; commercial use requires the appropriate TMDB license.
- TVmaze: TV metadata, seasons, episodes, cast and schedules. Its public API is free and licensed under CC BY-SA with attribution/share-alike requirements.
- Watchmode: streaming-availability discovery and provider destinations. Its current free Developer plan provides 2,500 monthly credits for non-commercial use, supports up to three countries, requires attribution, and limits free-plan cached data to 30 days. It does not provide movie playback.

Configure these Supabase Edge Function secrets:

- `TMDB_API_KEY`
- `WATCHMODE_API_KEY`
- `OMDB_API_KEY`
- `METADATA_SYNC_SECRET`

The `metadata-provider` Edge Function exposes controlled server-side search and Watchmode availability lookup. API data does not grant MovieLab streaming rights; playback still requires a valid MovieLab rights record or an authorized provider destination.

## Netlify deployment

MovieLab is a Vite SPA and is configured for Netlify with `netlify.toml` and `public/_redirects`.

Netlify build settings:
- Build command: `npm run build`
- Publish directory: `dist`
- Node: 20

Frontend environment variables should contain only browser-safe values such as:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Never put service-role keys, Telegram bot tokens, TMDB/OMDb/Watchmode secrets, Gemini keys, or Cloudflare Stream API tokens in `VITE_*` variables.

## MovieLab media layer

The catalogue supports multiple media sources without removing Telegram or metadata/availability APIs.

Sources include:
- Telegram ingestion
- MovieLab CMS uploads
- TMDB metadata
- TVmaze metadata
- OMDb development/non-commercial metadata
- Watchmode availability
- future partner APIs, X signals, R2/S3/Bunny/Cloudflare adapters

Cloudflare Stream direct uploads are implemented through the protected `media-upload` Edge Function. Configure:
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_STREAM_TOKEN`

The upload function requires a MovieLab `admin` or `editor` role and creates a direct browser upload URL. Raw media credentials never reach the browser.

Rights are deliberately separate from metadata. A media asset is not returned by the protected playback helper unless it is ready, active, and marked `authorized` or `licensed`.
