// Token Radar dashboard.
//
// Reads window.RADAR (written by dataScript in lib/model.ts) and renders the
// board: a searchable, sortable table of pre-token protocols ranked by
// implied value, plus the live-token set and the sector calibration. The page
// never fetches anything — all of its data is the single RADAR object loaded
// before this script. State lives in the URL, so any view can be linked to:
// ?q= search, ?category=, ?chain=, ?minTvl=, ?tab= all | watchlist | early |
// live, ?sort= rank | tvl | change | implied | multiple, ?dir= asc | desc,
// ?row= a protocol slug, which opens its detail panel.

const RADAR = window.RADAR;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function esc(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function clamp(x, lo, hi) {
  return x < lo ? lo : x > hi ? hi : x;
}

/** Compact dollars: $463.9M, $12.4K, $812. */
function fmtUsd(x) {
  if (x >= 1000000000) return "$" + (x / 1000000000).toFixed(1) + "B";
  if (x >= 1000000) return "$" + (x / 1000000).toFixed(1) + "M";
  if (x >= 1000) return "$" + (x / 1000).toFixed(1) + "K";
  return "$" + Math.round(x);
}

/** Full dollars with separators: $463,886,471. */
function fmtUsdFull(x) {
  return "$" + Math.round(x).toLocaleString("en-US");
}

/** Signed percent, or an em dash when the value is missing. */
function fmtPct(x) {
  if (x === null || x === undefined) return "—";
  return (x > 0 ? "+" : "") + x.toFixed(2) + "%";
}

/** A multiple, trailing zeros trimmed: ×0.2138, ×1.6, ×0.05. */
function fmtMult(x) {
  return "×" + x.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

// ---------------------------------------------------------------------------
// Farm plan. The step text is derived from the row itself — category picks
// the action, TVL picks the size, age picks the hold. This is the same
// function the model uses to build the board; keep it self-contained, the
// verifier evals this block on its own.
// ---------------------------------------------------------------------------

// BEGIN FARM
function farmSteps(row) {
  const chain = row.chains.length > 0 ? row.chains[0] : "the chain";
  const amount = row.tvl_usd >= 1000000000 ? 150 : row.tvl_usd >= 100000000 ? 100 : 50;
  const gas = amount >= 150 ? 8 : 4;
  const half = amount / 2;
  const age = row.age_days === null ? 365 : row.age_days;
  const days = age < 180 ? 60 : age < 365 ? 45 : 30;
  const name = row.name;
  const cost = `Cost: $${amount} of capital and about $${gas} of gas. Time: 15 minutes to set up.`;

  let open;
  let weekly;
  switch (row.category) {
    case "Bridge":
    case "Canonical Bridge":
      open = `Bridge $${amount} of USDC to ${chain} through ${name} and use the bridged funds in its app. ${cost}`;
      weekly = `Bridge $${half} back after a week to show two-way use of ${name}. Cost: about $2 of gas. Time: 10 minutes.`;
      break;
    case "CDP":
    case "Collateral Markets":
    case "Lending":
    case "Uncollateralized Lending":
      open = `Supply $${amount} of USDC to ${name} on ${chain} and keep the position open. ${cost}`;
      weekly = `Borrow $${half} of a stable asset against the supply and repay it within a week. Cost: about $2 of gas. Time: 10 minutes.`;
      break;
    case "Derivatives":
    case "Interest Rate Derivatives":
      open = `Deposit $${amount} of USDC as margin on ${name} and open one small hedge. ${cost}`;
      weekly = `Close the hedge and open a second one the following week on ${name}. Cost: about $2 of gas. Time: 10 minutes.`;
      break;
    case "Dexs":
    case "Indexes":
    case "Leveraged Farming":
    case "Yield":
    case "Yield Aggregator":
      open = `Provide $${amount} of liquidity to ${name}'s main pool on ${chain} and keep the position open. ${cost}`;
      weekly = `Swap $${half} through ${name}'s main pool once a week to count as an active trader. Cost: about $2 of gas. Time: 10 minutes.`;
      break;
    case "Dual-Token Stablecoin":
    case "Stablecoin Wrapper":
      open = `Mint or deposit $${amount} of the stable asset through ${name} on ${chain}. ${cost}`;
      weekly = `Redeem $${half} and mint it again to record a second interaction with ${name}. Cost: about $2 of gas. Time: 10 minutes.`;
      break;
    case "Insurance":
      open = `Buy $${amount} of cover from ${name} on ${chain} and keep the policy. ${cost}`;
      weekly = `Extend the cover once before it lapses so the policy stays active. Cost: about $2 of gas. Time: 10 minutes.`;
      break;
    case "Liquid Restaking":
    case "Liquid Staking":
    case "Restaking":
    case "Staking Pool":
      open = `Stake $${amount} of the chain's staking asset through ${name} and keep the receipt. ${cost}`;
      weekly = `Restake the receipt once more through ${name}'s own flow on ${chain}. Cost: about $2 of gas. Time: 10 minutes.`;
      break;
    case "Onchain Capital Allocator":
    case "Risk Curators":
      open = `Deposit $${amount} into a ${name} vault on ${chain} and keep the shares. ${cost}`;
      weekly = `Move $${half} between two of the vault's strategies to show active allocation. Cost: about $2 of gas. Time: 10 minutes.`;
      break;
    case "Prediction Market":
      open = `Fund $${amount} and place one market position on ${name}. ${cost}`;
      weekly = `Settle the position and place a second one on a different market on ${name}. Cost: about $2 of gas. Time: 10 minutes.`;
      break;
    case "RWA":
      open = `Mint $${amount} of the protocol's yield asset on ${chain} and hold it. ${cost}`;
      weekly = `Claim the accrued yield once and re-mint it into the same asset on ${chain}. Cost: about $2 of gas. Time: 10 minutes.`;
      break;
    default:
      open = `Deposit $${amount} of USDC into ${name} on ${chain} and keep the position open. ${cost}`;
      weekly = `Make a second deposit of $${half} a week later from the same wallet into ${name}. Cost: about $2 of gas. Time: 10 minutes.`;
      break;
  }

  return [
    `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline. Cost: under $3 of gas for the first transaction. Time: 5 minutes.`,
    open,
    weekly,
    `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote. Cost: about $2 of gas a week. Time: 10 minutes a week.`,
    `Hold the position for at least ${days} days so the activity is counted in more than one snapshot. Cost: the $${amount} stays in the position. Time: ${days} days.`,
    `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes. Cost: no fee to check, and never pay to claim. Time: 10 minutes.`,
    `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it. Cost: nothing but the log. Time: 5 minutes.`,
  ];
}
// END FARM

// ---------------------------------------------------------------------------
// State, from the URL
// ---------------------------------------------------------------------------

const params = new URLSearchParams(location.search);
const state = {
  q: params.get("q") || "",
  category: params.get("category") || "",
  chain: params.get("chain") || "",
  minTvl: Number(params.get("minTvl") || 0),
  tab: params.get("tab") || "all",
  sort: params.get("sort") || "rank",
  dir: params.get("dir") || "asc",
  row: params.get("row") || "",
};

function syncUrl() {
  const next = new URLSearchParams();
  if (state.q) next.set("q", state.q);
  if (state.category) next.set("category", state.category);
  if (state.chain) next.set("chain", state.chain);
  if (state.minTvl) next.set("minTvl", String(state.minTvl));
  if (state.tab !== "all") next.set("tab", state.tab);
  if (state.sort !== "rank") next.set("sort", state.sort);
  if (state.dir !== "asc") next.set("dir", state.dir);
  if (state.row) next.set("row", state.row);
  const query = next.toString();
  history.replaceState(null, "", query ? "?" + query : location.pathname);
}

// ---------------------------------------------------------------------------
// Filtering and sorting
// ---------------------------------------------------------------------------

const SORT_KEYS = {
  rank: (r) => r.rank,
  tvl: (r) => r.tvl_usd,
  change: (r) => (r.change_7d === null ? 0 : r.change_7d),
  implied: (r) => r.implied_value_usd,
  multiple: (r) => r.sector_multiple,
};

function boardRows() {
  let rows = RADAR.rows;
  if (state.tab === "watchlist") rows = rows.filter((r) => r.watchlist);
  if (state.tab === "early") rows = rows.filter((r) => !r.watchlist);
  if (state.q) {
    const q = state.q.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.slug.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q),
    );
  }
  if (state.category) rows = rows.filter((r) => r.category === state.category);
  if (state.chain) rows = rows.filter((r) => r.chains.includes(state.chain));
  if (state.minTvl) rows = rows.filter((r) => r.tvl_usd >= state.minTvl);
  const key = SORT_KEYS[state.sort] || SORT_KEYS.rank;
  const dir = state.dir === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => (key(a) - key(b)) * dir);
}

function sortArrow(key) {
  if (state.sort !== key) return "";
  return state.dir === "asc" ? " ↑" : " ↓";
}

function setSort(key) {
  if (state.sort === key) {
    state.dir = state.dir === "asc" ? "desc" : "asc";
  } else {
    state.sort = key;
    state.dir = key === "rank" ? "asc" : "desc";
  }
  syncUrl();
  renderTable();
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const boardEl = document.getElementById("board");
const maxImplied = RADAR.rows.length > 0 ? RADAR.rows[0].implied_value_usd : 1;

function optionList(values, current, label) {
  const options = values
    .map((v) => `<option value="${esc(v)}"${v === current ? " selected" : ""}>${esc(v)}</option>`)
    .join("");
  return `<option value="">${label}</option>` + options;
}

function renderShell() {
  const categories = [...new Set(RADAR.rows.map((r) => r.category))].sort();
  const chains = [...new Set(RADAR.rows.flatMap((r) => r.chains))].sort();
  const minTvls = [
    [0, "Any TVL"],
    [10000000, "$10M+"],
    [25000000, "$25M+"],
    [50000000, "$50M+"],
    [100000000, "$100M+"],
    [500000000, "$500M+"],
    [1000000000, "$1B+"],
  ];
  const calibRows = RADAR.calibration.sectors
    .map(
      (s) =>
        `<tr><td>${esc(s.category)}</td><td class="num">${s.sample}</td><td class="num">${fmtMult(s.multiple)}</td></tr>`,
    )
    .join("");

  boardEl.innerHTML = `
<div class="shell">
  <header class="top">
    <div class="brand"><span class="mark"></span><span class="brand-name">Token Radar</span></div>
    <div class="top-meta">
      <span>Snapshot <b>${esc(RADAR.as_of)}</b></span>
      <span>Model <b>${esc(RADAR.model_version)}</b></span>
      <span>Source <b>DefiLlama</b></span>
    </div>
  </header>
  <section class="lede">
    <h1>Pre-token protocols, ranked by implied value</h1>
    <p>Every row below is a protocol from the sealed ${esc(RADAR.as_of)} snapshot that has no token yet. Its implied value is what the token would be worth if it launched at its sector&rsquo;s median market-cap-to-TVL ratio: TVL &times; sector multiple &times; seven-day growth &times; maturity. The multiples are computed from the snapshot&rsquo;s own live-token protocols, not from a fixed list.</p>
    <div class="facts">
      <div class="fact"><span>Board rows</span><b>${RADAR.board_size}</b></div>
      <div class="fact"><span>Watchlist</span><b>${RADAR.watchlist_size}</b></div>
      <div class="fact"><span>Early, off the watchlist</span><b>${RADAR.early_size}</b></div>
      <div class="fact"><span>Live tokens set aside</span><b>${RADAR.live_size}</b></div>
      <div class="fact"><span>Global multiple</span><b>${fmtMult(RADAR.calibration.global_multiple)} (n=${RADAR.calibration.global_sample})</b></div>
      <div class="fact"><span>Floor</span><b>${fmtUsd(RADAR.floor_usd)}</b></div>
    </div>
  </section>
  <section class="controls">
    <label class="field">Search
      <input id="f-q" type="search" placeholder="Name, slug or category" value="${esc(state.q)}">
    </label>
    <label class="field">Category
      <select id="f-category">${optionList(categories, state.category, "All categories")}</select>
    </label>
    <label class="field">Chain
      <select id="f-chain">${optionList(chains, state.chain, "All chains")}</select>
    </label>
    <label class="field">Min TVL
      <select id="f-min-tvl">${minTvls.map(([v, l]) => `<option value="${v}"${state.minTvl === v ? " selected" : ""}>${l}</option>`).join("")}</select>
    </label>
    <div class="tabs" role="tablist">
      <button type="button" data-tab="all" aria-pressed="${state.tab === "all"}">All &middot; ${RADAR.board_size}</button>
      <button type="button" data-tab="watchlist" aria-pressed="${state.tab === "watchlist"}">Watchlist &middot; ${RADAR.watchlist_size}</button>
      <button type="button" data-tab="early" aria-pressed="${state.tab === "early"}">Early &middot; ${RADAR.early_size}</button>
      <button type="button" data-tab="live" aria-pressed="${state.tab === "live"}">Live &middot; ${RADAR.live_size}</button>
    </div>
    <div class="count" id="count"></div>
  </section>
  <section class="panel" id="panel"></section>
  <section class="model">
    <h2>How the number is made</h2>
    <p class="formula">implied value = round(TVL &times; sector multiple &times; growth &times; maturity)</p>
    <p>Sector multiple is the median market-cap-to-TVL ratio of the live-token protocols in the same category, when that category has at least ${RADAR.model.min_sample} live samples; otherwise the protocol falls back to the global median. Growth is the seven-day TVL move, clamped to ${RADAR.model.growth_floor}%…${RADAR.model.growth_cap}% and weighted ${RADAR.model.growth_weight}. Maturity grows from ${RADAR.model.maturity_floor} for a new protocol to 1.0 after ${RADAR.model.maturity_days} days; a protocol with no listing date is assumed ${RADAR.model.unknown_age_days} days old.</p>
    <table class="calib">
      <thead><tr><th>Sector</th><th class="num">Live sample</th><th class="num">Multiple</th></tr></thead>
      <tbody>
        ${calibRows}
        <tr><td>Global (fallback)</td><td class="num">${RADAR.calibration.global_sample}</td><td class="num">${fmtMult(RADAR.calibration.global_multiple)}</td></tr>
      </tbody>
    </table>
  </section>
</div>`;

  document.getElementById("f-q").addEventListener("input", (e) => {
    state.q = e.target.value;
    syncUrl();
    renderTable();
  });
  document.getElementById("f-category").addEventListener("change", (e) => {
    state.category = e.target.value;
    syncUrl();
    renderTable();
  });
  document.getElementById("f-chain").addEventListener("change", (e) => {
    state.chain = e.target.value;
    syncUrl();
    renderTable();
  });
  document.getElementById("f-min-tvl").addEventListener("change", (e) => {
    state.minTvl = Number(e.target.value);
    syncUrl();
    renderTable();
  });
  boardEl.querySelectorAll(".tabs button").forEach((button) => {
    button.addEventListener("click", () => {
      state.tab = button.getAttribute("data-tab");
      boardEl.querySelectorAll(".tabs button").forEach((b) => {
        b.setAttribute("aria-pressed", String(b === button));
      });
      syncUrl();
      renderTable();
    });
  });
}

function renderTable() {
  const panel = document.getElementById("panel");
  const countEl = document.getElementById("count");
  if (!panel) return;

  if (state.tab === "live") {
    countEl.textContent = RADAR.live_size + " live-token protocols set aside";
    panel.innerHTML = `
<div class="table-wrap">
  <table>
    <thead><tr><th>Protocol</th><th>Category</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">7d</th></tr></thead>
    <tbody>
      ${RADAR.live
        .map(
          (r) => `<tr>
            <td><div class="name">${esc(r.name)}<span class="sub">${esc(r.chains.join(", "))}</span></div></td>
            <td>${esc(r.category)}</td>
            <td class="num">${fmtUsd(r.tvl_usd)}</td>
            <td class="num">${fmtUsd(r.mcap_usd)}</td>
            <td class="num ${r.change_7d === null ? "" : r.change_7d >= 0 ? "pos" : "neg"}">${fmtPct(r.change_7d)}</td>
          </tr>`,
        )
        .join("")}
    </tbody>
  </table>
</div>`;
    return;
  }

  const rows = boardRows();
  countEl.textContent = `Showing ${rows.length} of ${RADAR.board_size} protocols`;
  if (rows.length === 0) {
    panel.innerHTML = `<div class="empty"><p>No protocols match these filters.</p><button class="button primary" type="button" id="reset-filters">Reset filters</button></div>`;
    document.getElementById("reset-filters").addEventListener("click", () => {
      state.q = "";
      state.category = "";
      state.chain = "";
      state.minTvl = 0;
      document.getElementById("f-q").value = "";
      document.getElementById("f-category").value = "";
      document.getElementById("f-chain").value = "";
      document.getElementById("f-min-tvl").value = "0";
      syncUrl();
      renderTable();
    });
    return;
  }

  panel.innerHTML = `
<div class="table-wrap">
  <table>
    <thead><tr>
      <th class="num"><button type="button" data-sort="rank">#${sortArrow("rank")}</button></th>
      <th><button type="button" data-sort="name">Protocol</button></th>
      <th class="num"><button type="button" data-sort="tvl">TVL${sortArrow("tvl")}</button></th>
      <th class="num"><button type="button" data-sort="change">7d${sortArrow("change")}</button></th>
      <th class="num"><button type="button" data-sort="implied">Implied value${sortArrow("implied")}</button></th>
      <th class="num"><button type="button" data-sort="multiple">Multiple${sortArrow("multiple")}</button></th>
      <th>Status</th>
    </tr></thead>
    <tbody>
      ${rows
        .map(
          (r) => `<tr data-slug="${esc(r.slug)}">
            <td class="num">${r.rank}</td>
            <td><div class="name">${esc(r.name)}<span class="sub">${esc(r.category)} &middot; ${esc(r.chains.join(", "))}${r.watchlist ? ' <span class="tag watch">Watchlist</span>' : ""}</span></div></td>
            <td class="num">${fmtUsd(r.tvl_usd)}</td>
            <td class="num ${r.change_7d === null ? "" : r.change_7d >= 0 ? "pos" : "neg"}">${fmtPct(r.change_7d)}</td>
            <td class="num"><span class="implied">${fmtUsd(r.implied_value_usd)}</span><span class="bar"><i style="width:${((r.implied_value_usd / maxImplied) * 100).toFixed(1)}%"></i></span></td>
            <td class="num">${fmtMult(r.sector_multiple)}${r.sector_fallback ? " *" : ""}</td>
            <td><span class="status">Pre-token</span></td>
          </tr>`,
        )
        .join("")}
    </tbody>
  </table>
</div>`;

  panel.querySelectorAll("thead button[data-sort]").forEach((button) => {
    button.addEventListener("click", () => setSort(button.getAttribute("data-sort")));
  });
  panel.querySelectorAll("tbody tr[data-slug]").forEach((tr) => {
    tr.addEventListener("click", () => openDetail(tr.getAttribute("data-slug")));
  });
}

// ---------------------------------------------------------------------------
// Detail panel
// ---------------------------------------------------------------------------

const dialog = document.createElement("dialog");
dialog.className = "detail";
document.body.appendChild(dialog);

dialog.addEventListener("click", (e) => {
  if (e.target === dialog) closeDetail();
});
dialog.addEventListener("close", () => {
  if (state.row) {
    state.row = "";
    syncUrl();
  }
});

function closeDetail() {
  if (dialog.open) dialog.close();
}

function splitStep(step) {
  const at = step.indexOf(" Cost: ");
  if (at === -1) return { action: step, cost: "" };
  return { action: step.slice(0, at), cost: "Cost: " + step.slice(at + 7) };
}

function openDetail(slug) {
  const row = RADAR.rows.find((r) => r.slug === slug);
  if (!row) return;
  state.row = slug;

  // Recompute the implied value from the board figures, at full precision,
  // and show whether it matches the board value.
  const growthPct = clamp(row.change_7d === null ? 0 : row.change_7d, -50, 100);
  const growth = 1 + (growthPct / 100) * 0.6;
  const age = row.age_days === null ? 365 : row.age_days;
  const maturity = 0.6 + (Math.min(age, 1095) / 1095) * 0.4;
  const base = Math.round(row.tvl_usd * row.sector_multiple);
  const recomputed = Math.round(base * growth * maturity);
  const matches = recomputed === row.implied_value_usd;
  const ageLabel = row.age_days === null ? "unknown, assumed 365 days" : row.age_days + " days";

  const steps = farmSteps(row)
    .map((step, i) => {
      const parts = splitStep(step);
      return `<li><b>${esc(parts.action)}</b>${parts.cost ? `<span class="cost">${esc(parts.cost)}</span>` : ""}</li>`;
    })
    .join("");

  dialog.innerHTML = `
<div class="detail-head">
  <div>
    <h2>${esc(row.name)}</h2>
    <div class="sub">${esc(row.category)} &middot; ${esc(row.chains.join(", "))} &middot; rank #${row.rank}</div>
    <div><span class="status">Pre-token</span>${row.watchlist ? ' <span class="tag watch">Watchlist</span>' : ""}</div>
  </div>
  <button class="close" type="button" id="detail-close">Close</button>
</div>
<div class="detail-section">
  <h3>Implied value</h3>
  <div class="equation">
    <div><span>TVL</span><b>${fmtUsdFull(row.tvl_usd)}</b></div>
    <div><span>Sector multiple (${esc(row.category)}${row.sector_fallback ? ", global fallback" : ""})</span><b>${fmtMult(row.sector_multiple)}</b></div>
    <div><span>Base value</span><b>${fmtUsdFull(row.base_usd)}</b></div>
    <div><span>Growth, 7d ${fmtPct(row.change_7d)}</span><b>${fmtMult(row.growth_multiplier)}</b></div>
    <div><span>Maturity, ${esc(ageLabel)}</span><b>${fmtMult(row.maturity_multiplier)}</b></div>
    <div class="total"><span>Implied value</span><b>${fmtUsdFull(row.implied_value_usd)}</b></div>
  </div>
  <p>Recomputed from the board figures: ${fmtUsdFull(recomputed)} — ${matches ? "matches the board value." : "differs from the board value by " + fmtUsdFull(Math.abs(recomputed - row.implied_value_usd)) + "."}</p>
</div>
<div class="detail-section">
  <h3>Farm plan</h3>
  <ol class="steps">${steps}</ol>
</div>`;

  document.getElementById("detail-close").addEventListener("click", closeDetail);
  if (!dialog.open) dialog.showModal();
  syncUrl();
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

renderShell();
renderTable();
if (state.row) openDetail(state.row);
