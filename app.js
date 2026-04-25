const state = {
  results: [],
  activeFilter: "all"
};

const els = {
  form: document.querySelector("#trackerForm"),
  clientName: document.querySelector("#clientName"),
  domain: document.querySelector("#domain"),
  keywordInput: document.querySelector("#keywordInput"),
  keywordFile: document.querySelector("#keywordFile"),
  keywordCount: document.querySelector("#keywordCount"),
  sampleButton: document.querySelector("#sampleButton"),
  clearKeywordsButton: document.querySelector("#clearKeywordsButton"),
  country: document.querySelector("#country"),
  device: document.querySelector("#device"),
  locations: document.querySelector("#locations"),
  language: document.querySelector("#language"),
  engine: document.querySelector("#engine"),
  targetPages: document.querySelector("#targetPages"),
  locationEngine: document.querySelector("#locationEngine"),
  resultSource: document.querySelector("#resultSource"),
  providerEndpoint: document.querySelector("#providerEndpoint"),
  sourceBadge: document.querySelector("#sourceBadge"),
  runButtonText: document.querySelector("#runButtonText"),
  accuracyBanner: document.querySelector("#accuracyBanner"),
  pageCount: document.querySelector("#pageCount"),
  workspaceTitle: document.querySelector("#workspaceTitle"),
  totalKeywords: document.querySelector("#totalKeywords"),
  averageRank: document.querySelector("#averageRank"),
  topTen: document.querySelector("#topTen"),
  pageMatches: document.querySelector("#pageMatches"),
  resultsBody: document.querySelector("#resultsBody"),
  priorityList: document.querySelector("#priorityList"),
  issueCount: document.querySelector("#issueCount"),
  runStatus: document.querySelector("#runStatus"),
  lastRun: document.querySelector("#lastRun"),
  saveButton: document.querySelector("#saveButton"),
  exportButton: document.querySelector("#exportButton"),
  geoSummary: document.querySelector("#geoSummary"),
  ipSummary: document.querySelector("#ipSummary"),
  sourceSummary: document.querySelector("#sourceSummary"),
  filters: document.querySelectorAll(".segmented button")
};

const sampleKeywords = [
  "emergency dentist",
  "teeth whitening near me",
  "family dentist chicago",
  "same day dental crown",
  "invisalign chicago"
];

const samplePages = [
  "https://example.com/services/emergency-dentist",
  "https://example.com/services/teeth-whitening",
  "https://example.com/services/family-dentistry",
  "https://example.com/services/invisalign"
];

function cleanList(value) {
  return value
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeUrl(url) {
  return url.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "").toLowerCase();
}

function seededNumber(input, min, max) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }
  const span = max - min + 1;
  return min + (Math.abs(hash) % span);
}

function inferTargetPage(keyword, pages, domain) {
  if (!pages.length && domain) {
    return domain;
  }

  const keywordParts = keyword.toLowerCase().split(/\s+/).filter((word) => word.length > 3);
  const scored = pages.map((page) => {
    const normalized = page.toLowerCase();
    const score = keywordParts.reduce((total, word) => total + (normalized.includes(word) ? 1 : 0), 0);
    return { page, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.score > 0 ? scored[0].page : pages[0] || "";
}

function buildFeatures(seed) {
  const features = ["Map Pack", "Reviews", "People Also Ask", "Images", "Local Ads"];
  const count = seededNumber(seed, 1, 3);
  return features.filter((_, index) => seededNumber(`${seed}-${index}`, 0, 10) > 5).slice(0, count);
}

function createDemoSerpResult({ keyword, location, country, device, engine, language, pages, domain }) {
  const seed = `${keyword}|${location}|${country}|${device}|${engine}|${language}`;
  const rank = seededNumber(seed, 1, 58);
  const change = seededNumber(`${seed}|change`, -9, 11);
  const matchedPage = inferTargetPage(keyword, pages, domain);
  const ownsResult = rank <= 20 || seededNumber(`${seed}|owned`, 0, 10) > 3;
  const status = rank <= 10 && ownsResult ? "win" : rank <= 20 ? "watch" : "issue";

  return {
    keyword,
    location,
    rank,
    change,
    matchedPage: ownsResult ? matchedPage : "",
    features: buildFeatures(seed),
    status
  };
}

function readCampaign() {
  const keywords = cleanList(els.keywordInput.value);
  const locations = cleanList(els.locations.value || "Default location");
  const pages = cleanList(els.targetPages.value);

  return {
    clientName: els.clientName.value.trim(),
    domain: els.domain.value.trim(),
    keywords,
    country: els.country.value,
    device: els.device.value,
    locations,
    language: els.language.value,
    engine: els.engine.value,
    pages,
    locationEngine: els.locationEngine.value,
    resultSource: els.resultSource.value,
    providerEndpoint: els.providerEndpoint.value.trim()
  };
}

function updateCounts() {
  els.keywordCount.textContent = cleanList(els.keywordInput.value).length;
  els.pageCount.textContent = cleanList(els.targetPages.value).length;
  const name = els.clientName.value.trim();
  els.workspaceTitle.textContent = name ? `${name} campaign` : "Untitled campaign";
  els.geoSummary.textContent = els.locations.value.trim()
    ? `${els.locations.value.trim()} / ${els.country.value}`
    : "Location pending";
  els.ipSummary.textContent = els.locationEngine.value;
  const liveMode = els.resultSource.value === "live";
  els.sourceBadge.textContent = liveMode ? "Live" : "Demo";
  els.sourceBadge.classList.toggle("good", liveMode);
  els.sourceBadge.classList.toggle("warn", !liveMode);
  els.runButtonText.textContent = liveMode ? "Run live check" : "Run demo check";
  els.sourceSummary.textContent = liveMode ? "Live backend endpoint" : "Demo runner only";
  els.accuracyBanner.textContent = liveMode
    ? "Live mode sends the campaign request to your configured backend endpoint."
    : "Demo results are not Google rankings. Connect a live SERP API backend before using reports for clients.";
  els.accuracyBanner.classList.toggle("live", liveMode);
}

async function runRankCheck() {
  const campaign = readCampaign();

  if (!campaign.keywords.length) {
    els.runStatus.textContent = "Add at least one keyword first";
    return;
  }

  if (campaign.resultSource === "live") {
    state.results = await runLiveProvider(campaign);
  } else {
    state.results = campaign.keywords.flatMap((keyword) =>
      campaign.locations.map((location) =>
        createDemoSerpResult({
          keyword,
          location,
          country: campaign.country,
          device: campaign.device,
          engine: campaign.engine,
          language: campaign.language,
          pages: campaign.pages,
          domain: campaign.domain
        })
      )
    );
  }

  if (!state.results.length) {
    render();
    persistCampaign();
    return;
  }

  els.runStatus.textContent = campaign.resultSource === "live"
    ? `${campaign.engine} live check completed`
    : `${campaign.engine} ${campaign.device.toLowerCase()} demo check completed`;
  els.lastRun.textContent = new Date().toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });

  render();
  persistCampaign();
}

async function runLiveProvider(campaign) {
  if (!campaign.providerEndpoint) {
    els.runStatus.textContent = "Add a backend endpoint for live SERP checks";
    return [];
  }

  els.runStatus.textContent = "Requesting live SERP data";

  try {
    const response = await fetch(campaign.providerEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientName: campaign.clientName,
        domain: campaign.domain,
        keywords: campaign.keywords,
        locations: campaign.locations,
        country: campaign.country,
        device: campaign.device,
        language: campaign.language,
        engine: campaign.engine,
        targetPages: campaign.pages,
        locationEngine: campaign.locationEngine
      })
    });

    const payload = await response.json();
    if (payload.error) {
      throw new Error(payload.error);
    }
    if (!response.ok) {
      throw new Error(`Provider returned ${response.status}`);
    }
    const rows = Array.isArray(payload) ? payload : payload.results;
    if (!Array.isArray(rows)) {
      throw new Error("Provider response must include a results array");
    }

    return rows.map(normalizeProviderResult);
  } catch (error) {
    els.runStatus.textContent = `Live check failed: ${error.message}`;
    return [];
  }
}

function normalizeProviderResult(row) {
  const rank = Number(row.rank) || 0;
  const status = row.status || (rank > 0 && rank <= 10 ? "win" : rank <= 20 ? "watch" : "issue");

  return {
    keyword: row.keyword || "",
    location: row.location || "",
    rank: rank || 0,
    change: Number(row.change) || 0,
    matchedPage: row.matchedPage || row.url || "",
    features: Array.isArray(row.features) ? row.features : [],
    status
  };
}

function filteredResults() {
  if (state.activeFilter === "wins") {
    return state.results.filter((result) => result.status === "win");
  }

  if (state.activeFilter === "issues") {
    return state.results.filter((result) => result.status === "issue");
  }

  return state.results;
}

function renderMetrics(results) {
  const trackedKeywords = new Set(state.results.map((result) => result.keyword)).size;
  const totalRank = state.results.reduce((sum, result) => sum + result.rank, 0);
  const average = state.results.length ? Math.round(totalRank / state.results.length) : 0;
  const topTenCount = state.results.filter((result) => result.rank <= 10).length;
  const matches = state.results.filter((result) => result.matchedPage).length;

  els.totalKeywords.textContent = trackedKeywords;
  els.averageRank.textContent = state.results.length ? average : "-";
  els.topTen.textContent = state.results.length ? `${Math.round((topTenCount / state.results.length) * 100)}%` : "0%";
  els.pageMatches.textContent = matches;
  els.issueCount.textContent = state.results.filter((result) => result.status === "issue").length;

  if (!results.length && state.results.length) {
    els.resultsBody.innerHTML = `<tr class="empty-row"><td colspan="7">No rows match this filter.</td></tr>`;
  }
}

function statusLabel(status) {
  if (status === "win") return "Top opportunity";
  if (status === "watch") return "Needs monitoring";
  return "Needs page work";
}

function renderTable(results) {
  if (!state.results.length) {
    els.resultsBody.innerHTML = `<tr class="empty-row"><td colspan="7">Add keywords, choose a location, and run a check.</td></tr>`;
    return;
  }

  if (!results.length) {
    els.resultsBody.innerHTML = `<tr class="empty-row"><td colspan="7">No rows match this filter.</td></tr>`;
    return;
  }

  els.resultsBody.innerHTML = results
    .map((result) => {
      const changeClass = result.change > 0 ? "up" : result.change < 0 ? "down" : "";
      const changeText = result.change > 0 ? `+${result.change}` : `${result.change}`;
      const features = result.features.length ? result.features : ["Organic"];

      return `
        <tr>
          <td><strong>${escapeHtml(result.keyword)}</strong></td>
          <td>${escapeHtml(result.location)}</td>
          <td><span class="rank">${result.rank}</span></td>
          <td><strong class="change ${changeClass}">${changeText}</strong></td>
          <td class="url-cell" title="${escapeHtml(result.matchedPage || "Not found")}">${escapeHtml(result.matchedPage || "Not found")}</td>
          <td><div class="feature-list">${features.map((feature) => `<span>${escapeHtml(feature)}</span>`).join("")}</div></td>
          <td><strong class="status ${result.status}">${statusLabel(result.status)}</strong></td>
        </tr>
      `;
    })
    .join("");
}

function renderPriorities() {
  const issues = state.results
    .filter((result) => result.status === "issue")
    .sort((a, b) => b.rank - a.rank)
    .slice(0, 4);

  if (!issues.length) {
    els.priorityList.innerHTML = "<li>No ranking gaps yet.</li>";
    return;
  }

  els.priorityList.innerHTML = issues
    .map((issue) => {
      const page = issue.matchedPage ? normalizeUrl(issue.matchedPage) : "No target page matched";
      return `<li><strong>${escapeHtml(issue.keyword)}</strong> ranks #${issue.rank} in ${escapeHtml(issue.location)}. ${escapeHtml(page)}</li>`;
    })
    .join("");
}

function render() {
  const results = filteredResults();
  renderMetrics(results);
  renderTable(results);
  renderPriorities();
  updateCounts();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function persistCampaign() {
  const payload = {
    campaign: {
      clientName: els.clientName.value,
      domain: els.domain.value,
      keywordInput: els.keywordInput.value,
      country: els.country.value,
      device: els.device.value,
      locations: els.locations.value,
      language: els.language.value,
      engine: els.engine.value,
      targetPages: els.targetPages.value,
      locationEngine: els.locationEngine.value,
      resultSource: els.resultSource.value,
      providerEndpoint: els.providerEndpoint.value || "/api/rank-check"
    },
    results: state.results,
    activeFilter: state.activeFilter
  };

  localStorage.setItem("localrank-studio", JSON.stringify(payload));
}

function restoreCampaign() {
  const stored = localStorage.getItem("localrank-studio");
  if (!stored) return;

  try {
    const payload = JSON.parse(stored);
    const campaign = payload.campaign || {};
    Object.entries(campaign).forEach(([key, value]) => {
      if (els[key]) els[key].value = value;
    });
    if (!els.providerEndpoint.value.trim()) {
      els.providerEndpoint.value = "/api/rank-check";
    }
    state.results = Array.isArray(payload.results) ? payload.results : [];
    state.activeFilter = payload.activeFilter || "all";
    els.filters.forEach((button) => button.classList.toggle("active", button.dataset.filter === state.activeFilter));
  } catch (error) {
    localStorage.removeItem("localrank-studio");
  }
}

async function readKeywordFile(file) {
  const extension = file.name.split(".").pop().toLowerCase();

  if (["xlsx", "xls"].includes(extension) && window.XLSX) {
    const buffer = await file.arrayBuffer();
    const workbook = window.XLSX.read(buffer, { type: "array" });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = window.XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
    return rows.flat().filter(Boolean).join("\n");
  }

  return file.text();
}

function exportCsv() {
  if (!state.results.length) return;

  const header = ["Keyword", "Location", "Rank", "Change", "Matched Page", "SERP Features", "Status"];
  const rows = state.results.map((result) => [
    result.keyword,
    result.location,
    result.rank,
    result.change,
    result.matchedPage || "Not found",
    result.features.join(" | ") || "Organic",
    statusLabel(result.status)
  ]);

  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "local-rank-results.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

els.form.addEventListener("submit", (event) => {
  event.preventDefault();
  runRankCheck();
});

els.sampleButton.addEventListener("click", () => {
  els.clientName.value = "Bright Dental Co.";
  els.domain.value = "https://example.com";
  els.keywordInput.value = sampleKeywords.join("\n");
  els.locations.value = "Chicago, IL; Oak Park, IL; 60614";
  els.targetPages.value = samplePages.join("\n");
  updateCounts();
});

els.clearKeywordsButton.addEventListener("click", () => {
  els.keywordInput.value = "";
  updateCounts();
});

els.keywordFile.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  els.runStatus.textContent = "Reading keyword file";
  try {
    els.keywordInput.value = await readKeywordFile(file);
    els.runStatus.textContent = `${file.name} imported`;
    updateCounts();
  } catch (error) {
    els.runStatus.textContent = "Could not import this file";
  } finally {
    event.target.value = "";
  }
});

[els.clientName, els.domain, els.keywordInput, els.locations, els.targetPages, els.country, els.device, els.language, els.engine, els.locationEngine, els.resultSource, els.providerEndpoint].forEach((input) => {
  input.addEventListener("input", () => {
    updateCounts();
    persistCampaign();
  });
});

els.filters.forEach((button) => {
  button.addEventListener("click", () => {
    state.activeFilter = button.dataset.filter;
    els.filters.forEach((filterButton) => filterButton.classList.toggle("active", filterButton === button));
    render();
    persistCampaign();
  });
});

els.saveButton.addEventListener("click", () => {
  persistCampaign();
  els.runStatus.textContent = "Campaign saved locally";
});

els.exportButton.addEventListener("click", exportCsv);

restoreCampaign();
render();
