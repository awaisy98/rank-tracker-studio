import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

const PORT = Number(process.env.PORT || 4173);
const ROOT = process.cwd();
const SERPAPI_URL = "https://serpapi.com/search.json";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8"
};

const languageCodes = {
  English: "en",
  Spanish: "es",
  French: "fr",
  Arabic: "ar",
  Hindi: "hi"
};

const countryCodes = {
  "United States": "us",
  "United Kingdom": "uk",
  Canada: "ca",
  Australia: "au",
  India: "in",
  "United Arab Emirates": "ae"
};

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 1_000_000) throw new Error("Request is too large");
  }
  return JSON.parse(body || "{}");
}

function cleanList(value) {
  return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : [];
}

function normalizeUrl(value) {
  try {
    const url = new URL(value);
    return `${url.hostname.replace(/^www\./, "")}${url.pathname.replace(/\/$/, "")}`.toLowerCase();
  } catch {
    return String(value || "").replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "").toLowerCase();
  }
}

function urlMatchesCandidate(resultUrl, candidates) {
  const normalized = normalizeUrl(resultUrl);
  return candidates.some((candidate) => {
    const target = normalizeUrl(candidate);
    return target && (normalized === target || normalized.startsWith(`${target}/`) || normalized.includes(target));
  });
}

function collectResultLinks(result) {
  const links = [result.link].filter(Boolean);
  const sitelinks = result.sitelinks || {};

  for (const group of ["inline", "expanded", "list"]) {
    if (Array.isArray(sitelinks[group])) {
      links.push(...sitelinks[group].map((item) => item.link).filter(Boolean));
    }
  }

  return links;
}

function findMatchingOrganic(organicResults, candidates) {
  for (const result of organicResults) {
    const links = collectResultLinks(result);
    const matchedLink = links.find((link) => urlMatchesCandidate(link, candidates));
    if (matchedLink) {
      return {
        rank: Number(result.position) || organicResults.indexOf(result) + 1,
        url: matchedLink
      };
    }
  }

  return { rank: null, url: "" };
}

function extractFeatures(payload, matchedRank) {
  const features = [];

  if (Array.isArray(payload.ads) && payload.ads.length) features.push("Ads");
  if (Array.isArray(payload.local_results?.places) && payload.local_results.places.length) features.push("Map Pack");
  if (Array.isArray(payload.people_also_ask) && payload.people_also_ask.length) features.push("People Also Ask");
  if (Array.isArray(payload.related_questions) && payload.related_questions.length) features.push("Related Questions");
  if (Array.isArray(payload.inline_images) && payload.inline_images.length) features.push("Images");
  if (matchedRank) features.push("Organic");

  return features.length ? features : ["Organic"];
}

function statusForRank(rank) {
  if (!rank) return "issue";
  if (rank <= 10) return "win";
  if (rank <= 20) return "watch";
  return "issue";
}

async function runSerpApiSearch({ keyword, location, campaign }) {
  const apiKey = campaign.apiKey || process.env.SERPAPI_KEY;
  if (!apiKey) {
    throw new Error("No SerpApi key provided.");
  }
  const params = new URLSearchParams({
    engine: "google",
    q: keyword,
    api_key: apiKey,
    location,
    device: campaign.device?.toLowerCase() === "desktop" ? "desktop" : "mobile",
    hl: languageCodes[campaign.language] || "en",
    gl: countryCodes[campaign.country] || "us",
    num: "100",
    no_cache: "true"
  });

  const response = await fetch(`${SERPAPI_URL}?${params.toString()}`);
  const payload = await response.json();

  if (!response.ok || payload.error) {
    throw new Error(payload.error || `SerpApi returned ${response.status}`);
  }

  const organicResults = Array.isArray(payload.organic_results) ? payload.organic_results : [];
  const candidates = [...campaign.targetPages, campaign.domain].filter(Boolean);
  const match = findMatchingOrganic(organicResults, candidates);

  return {
    keyword,
    location,
    rank: match.rank || 0,
    change: 0,
    matchedPage: match.url,
    features: extractFeatures(payload, match.rank),
    status: statusForRank(match.rank),
    source: "SerpApi"
  };
}

async function handleRankCheck(request, response) {
  if (!process.env.SERPAPI_KEY && !body.apiKey) {
    sendJson(response, 500, {
      error: "SERPAPI_KEY is missing. Create a free SerpApi account, then start the server with SERPAPI_KEY=your_key."
    });
    return;
  }

  try {
    const body = await readJson(request);
    const campaign = {
      apiKey: String(body.apiKey || ""),
      clientName: String(body.clientName || ""),
      domain: String(body.domain || ""),
      keywords: cleanList(body.keywords),
      locations: cleanList(body.locations),
      country: String(body.country || "United States"),
      device: String(body.device || "Mobile"),
      language: String(body.language || "English"),
      engine: String(body.engine || "Google"),
      targetPages: cleanList(body.targetPages)
    };

    if (!campaign.keywords.length) {
      sendJson(response, 400, { error: "At least one keyword is required." });
      return;
    }

    if (!campaign.locations.length) {
      sendJson(response, 400, { error: "At least one location is required." });
      return;
    }

    if (campaign.engine !== "Google") {
      sendJson(response, 400, { error: "The free SerpApi connector currently supports Google only." });
      return;
    }

    const jobs = [];
    for (const keyword of campaign.keywords) {
      for (const location of campaign.locations) {
        jobs.push(runSerpApiSearch({ keyword, location, campaign }));
      }
    }

    const results = await Promise.all(jobs);
    sendJson(response, 200, { results, provider: "SerpApi" });
  } catch (error) {
    sendJson(response, 500, { error: error.message || "Live rank check failed." });
  }
}

async function serveStatic(request, response) {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);
  const requestPath = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
  const filePath = path.normalize(path.join(ROOT, decodeURIComponent(requestPath)));

  if (!filePath.startsWith(ROOT)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const data = await readFile(filePath);
    response.writeHead(200, { "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream" });
    response.end(data);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}

const server = http.createServer(async (request, response) => {
  if (request.method === "POST" && request.url?.startsWith("/api/rank-check")) {
    await handleRankCheck(request, response);
    return;
  }

  await serveStatic(request, response);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`LocalRank Studio running on port ${PORT}`);
});
