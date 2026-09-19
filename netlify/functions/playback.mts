const NEXSTREAM_BASE = "https://api.codespecters.com/embed";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

function integer(value: string | null) {
  if (!value || !/^\\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export default async function handler(req: Request) {
  if (req.method !== "GET") return json({ error: "GET required" }, 405);

  const apiKey = process.env.NEXSTREAM_API_KEY;
  if (!apiKey) return json({ error: "NEXSTREAM_API_KEY is not configured" }, 503);

  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  const tmdbId = integer(url.searchParams.get("tmdbId"));

  if (type !== "movie" && type !== "tv") return json({ error: "type must be movie or tv" }, 400);
  if (!tmdbId) return json({ error: "A valid tmdbId is required" }, 400);

  if (type === "movie") {
    return json({
      provider: "nexstream",
      type,
      tmdbId,
      embedUrl: NEXSTREAM_BASE + "/movie/" + tmdbId + "?apikey=" + encodeURIComponent(apiKey),
    });
  }

  const season = integer(url.searchParams.get("season"));
  const episode = integer(url.searchParams.get("episode"));
  if (!season || !episode) return json({ error: "season and episode are required for TV playback" }, 400);

  return json({
    provider: "nexstream",
    type,
    tmdbId,
    season,
    episode,
    embedUrl: NEXSTREAM_BASE + "/tv/" + tmdbId + "/" + season + "/" + episode + "?apikey=" + encodeURIComponent(apiKey),
  });
}

export const config = {
  path: "/api/playback",
};