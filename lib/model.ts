// Token Radar — value model "radar-2".
//
// Every pre-token protocol in the sealed snapshot gets an implied value
// calibrated from the snapshot's own live-token protocols: the implied value
// of a protocol is its TVL times the median market-cap/TVL multiple of its
// sector, adjusted for seven-day growth and for age. No hardcoded name list
// anywhere — every number below is computed from the snapshot at runtime.
//
//   implied = round(TVL x sector_multiple x growth x maturity)
//
//   sector_multiple = median(mcap / TVL) of the live-token protocols in the
//     same category, when that category has at least 4 live samples; otherwise
//     the global median. Clamped to [0.05, 1.5], rounded to 4 decimals.
//   growth   = 1 + clamp(change_7d, -50, 100) / 100 x 0.6
//   maturity = 0.6 + min(age_days, 1095) / 1095 x 0.4, with 365 days used
//     when the protocol has no listing date.
//
// The board ranks the watchlist (all 40, whatever their size) plus every
// other tokenless protocol under the $50M floor — CEX rows and versioned
// slugs (…-v2, …-v3) never appear — by implied value, best first. The 24
// largest live-token protocols by market cap are carried alongside as the
// "live" set, so the page can show what already has a token.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface BoardModel {
  sector_multiple: number;
  sector_sample: number;
  sector_fallback: boolean;
  base_usd: number;
  growth_pct: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  age_days: number | null;
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: string;
  age_days: number | null;
  implied_value_usd: number;
  model: BoardModel;
  farm_steps: string[];
}

export interface SectorCalibration {
  category: string;
  sample: number;
  multiple: number;
  fallback: boolean;
}

export interface DataRow {
  rank: number;
  slug: string;
  name: string;
  category: string;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  watchlist: boolean;
  sector_multiple: number;
  sector_sample: number;
  sector_fallback: boolean;
  base_usd: number;
  growth_multiplier: number;
  maturity_multiplier: number;
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
  change_7d: number | null;
}

export interface Radar {
  as_of: string;
  source: string;
  floor_usd: number;
  model: Record<string, number>;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  calibration: {
    global_multiple: number;
    global_sample: number;
    sectors: SectorCalibration[];
  };
  rows: DataRow[];
  live: LiveRow[];
}

// ---------------------------------------------------------------------------
// Model parameters — the only constants in the file. They shape the formula;
// they never name a protocol.
// ---------------------------------------------------------------------------

const PARAMS = {
  min_sample: 4, // live samples needed before a sector trusts its own median
  multiple_low: 0.05, // sector multiple clamp, low
  multiple_high: 1.5, // sector multiple clamp, high
  growth_weight: 0.6, // how much of the 7-day move flows into the value
  growth_floor: -50, // worst 7-day move that still counts, in percent
  growth_cap: 100, // best 7-day move that still counts, in percent
  maturity_floor: 0.6, // value factor of a brand-new protocol
  maturity_range: 0.4, // extra factor earned over three years
  maturity_days: 1095, // three years, in days
  unknown_age_days: 365, // assumed age when no listing date is known
};

const LIVE_SET_SIZE = 24; // live-token protocols carried alongside the board
const VERSIONED_SLUG = /-v\d+$/; // aera-v2, bdex-v3, … — forks, not new launches

// ---------------------------------------------------------------------------
// Small numeric helpers
// ---------------------------------------------------------------------------

function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Whole days from a listing date to the snapshot date; null when unknown. */
function ageDays(listedAt: string | null, asOf: string): number | null {
  if (listedAt === null) return null;
  const [ly, lm, ld] = listedAt.split("-").map(Number);
  const [ay, am, ad] = asOf.split("-").map(Number);
  const listed = Date.UTC(ly, lm - 1, ld);
  const asOfMs = Date.UTC(ay, am - 1, ad);
  return Math.round((asOfMs - listed) / 86400000);
}

// ---------------------------------------------------------------------------
// Farm plan. The step text is derived from the row itself — category picks
// the action, TVL picks the size, age picks the hold — so the same plan
// function serves the model and the page. Keep this function self-contained:
// the dashboard copies it verbatim inside a // BEGIN FARM … // END FARM
// block and the verifier evals that block on its own.
// ---------------------------------------------------------------------------

function farmSteps(row: {
  name: string;
  category: string;
  chains: string[];
  tvl_usd: number;
  age_days: number | null;
}): string[] {
  const chain = row.chains.length > 0 ? row.chains[0] : "the chain";
  const amount = row.tvl_usd >= 1000000000 ? 150 : row.tvl_usd >= 100000000 ? 100 : 50;
  const gas = amount >= 150 ? 8 : 4;
  const half = amount / 2;
  const age = row.age_days === null ? 365 : row.age_days;
  const days = age < 180 ? 60 : age < 365 ? 45 : 30;
  const name = row.name;
  const cost = `Cost: $${amount} of capital and about $${gas} of gas. Time: 15 minutes to set up.`;

  let open: string;
  let weekly: string;
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

// ---------------------------------------------------------------------------
// Snapshot parsing
// ---------------------------------------------------------------------------

export function parseSnapshot(text: string): Snapshot {
  const data = JSON.parse(text) as Snapshot;
  if (!data || !Array.isArray(data.protocols) || !Array.isArray(data.watchlist)) {
    throw new Error("snapshot must have protocols[] and watchlist[]");
  }
  if (typeof data.as_of !== "string" || typeof data.floor_usd !== "number") {
    throw new Error("snapshot must have as_of and floor_usd");
  }
  return data;
}

// ---------------------------------------------------------------------------
// Radar build
// ---------------------------------------------------------------------------

export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: Radar } {
  const asOf = snapshot.as_of;
  const watchlist = new Set(snapshot.watchlist);

  // Live-token protocols: a market cap exists and is positive. Their
  // mcap/TVL ratios calibrate the multiples; nothing else is used.
  const liveProtocols = snapshot.protocols.filter(
    (p) => p.mcap_usd !== null && p.mcap_usd > 0,
  );
  const ratiosByCategory = new Map<string, number[]>();
  const allRatios: number[] = [];
  for (const p of liveProtocols) {
    const ratio = (p.mcap_usd as number) / p.tvl_usd;
    allRatios.push(ratio);
    const bucket = ratiosByCategory.get(p.category);
    if (bucket) bucket.push(ratio);
    else ratiosByCategory.set(p.category, [ratio]);
  }
  const globalMultiple = round4(median(allRatios));
  const globalSample = allRatios.length;

  // Sector calibration: only categories with enough live samples get their
  // own multiple; the rest fall back to the global median. Listed A–Z.
  const sectors: SectorCalibration[] = [...ratiosByCategory.entries()]
    .filter(([, ratios]) => ratios.length >= PARAMS.min_sample)
    .map(([category, ratios]) => ({
      category,
      sample: ratios.length,
      multiple: round4(clamp(median(ratios), PARAMS.multiple_low, PARAMS.multiple_high)),
      fallback: false,
    }))
    .sort((a, b) => (a.category < b.category ? -1 : a.category > b.category ? 1 : 0));
  const multipleByCategory = new Map(sectors.map((s) => [s.category, s.multiple]));

  // Score one candidate protocol.
  const score = (p: SnapshotProtocol) => {
    const sample = ratiosByCategory.get(p.category)?.length ?? 0;
    const fallback = sample < PARAMS.min_sample;
    const multiple = fallback
      ? globalMultiple
      : (multipleByCategory.get(p.category) as number);
    const growthPct = clamp(p.change_7d === null ? 0 : p.change_7d, PARAMS.growth_floor, PARAMS.growth_cap);
    const growth = 1 + (growthPct / 100) * PARAMS.growth_weight;
    const age = ageDays(p.listed_at, asOf);
    const effectiveAge = age === null ? PARAMS.unknown_age_days : age;
    const maturity =
      PARAMS.maturity_floor +
      (Math.min(effectiveAge, PARAMS.maturity_days) / PARAMS.maturity_days) * PARAMS.maturity_range;
    const baseUsd = Math.round(p.tvl_usd * multiple);
    const implied = Math.round(baseUsd * growth * maturity);
    return {
      multiple,
      sample: fallback ? globalSample : sample,
      fallback,
      baseUsd,
      growthPct,
      growth,
      growthRounded: round4(growth),
      maturity,
      maturityRounded: round4(maturity),
      age,
      implied,
    };
  };

  // Board candidates: tokenless protocols. The watchlist is always in;
  // anything else must sit under the floor, must not be a CEX, and must not
  // be a versioned fork (…-v2, …-v3).
  const candidates = snapshot.protocols.filter((p) => {
    if (p.symbol !== null) return false;
    if (watchlist.has(p.slug)) return true;
    if (p.tvl_usd >= snapshot.floor_usd) return false;
    if (p.category === "CEX") return false;
    if (VERSIONED_SLUG.test(p.slug)) return false;
    return true;
  });

  const scored = candidates.map((p) => ({ p, s: score(p) }));
  scored.sort((a, b) => b.s.implied - a.s.implied);

  const board: BoardRow[] = scored.map(({ p, s }, i) => ({
    rank: i + 1,
    slug: p.slug,
    name: p.name,
    category: p.category,
    chains: p.chains,
    tvl_usd: p.tvl_usd,
    change_7d: p.change_7d,
    mcap_usd: p.mcap_usd,
    listed_at: p.listed_at,
    gecko_id: p.gecko_id,
    symbol: p.symbol,
    token_status: "pre-token",
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      sector_multiple: s.multiple,
      sector_sample: s.sample,
      sector_fallback: s.fallback,
      base_usd: s.baseUsd,
      growth_pct: s.growthPct,
      growth_multiplier: s.growthRounded,
      maturity_multiplier: s.maturityRounded,
      age_days: s.age,
    },
    farm_steps: farmSteps({
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      age_days: s.age,
    }),
  }));

  // The page's data rows: the same board, flattened, without the farm plan
  // (the page derives it from the same farm function) and with the watchlist
  // flag attached.
  const rows: DataRow[] = board.map((r) => ({
    rank: r.rank,
    slug: r.slug,
    name: r.name,
    category: r.category,
    chains: r.chains,
    tvl_usd: r.tvl_usd,
    change_7d: r.change_7d,
    mcap_usd: r.mcap_usd,
    listed_at: r.listed_at,
    age_days: r.age_days,
    implied_value_usd: r.implied_value_usd,
    watchlist: watchlist.has(r.slug),
    sector_multiple: r.model.sector_multiple,
    sector_sample: r.model.sector_sample,
    sector_fallback: r.model.sector_fallback,
    base_usd: r.model.base_usd,
    growth_multiplier: r.model.growth_multiplier,
    maturity_multiplier: r.model.maturity_multiplier,
  }));

  // Live set: the largest live-token protocols by market cap, exchanges
  // excluded — they already have a token and a market of their own.
  const live: LiveRow[] = liveProtocols
    .filter((p) => p.category !== "CEX")
    .sort((a, b) => (b.mcap_usd as number) - (a.mcap_usd as number))
    .slice(0, LIVE_SET_SIZE)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd as number,
      change_7d: p.change_7d,
    }));

  const earlySize = board.filter((r) => !watchlist.has(r.slug)).length;
  const radar: Radar = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model: PARAMS,
    model_version: "radar-2",
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: earlySize,
    live_size: live.length,
    calibration: {
      global_multiple: globalMultiple,
      global_sample: globalSample,
      sectors,
    },
    rows,
    live,
  };

  return { board, radar };
}

// ---------------------------------------------------------------------------
// Board sanity checks. Returns null when the board is well formed, otherwise
// a short description of the first problem found.
// ---------------------------------------------------------------------------

export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) {
    return `board size ${board.length} outside 100–4000`;
  }
  const watchlist = new Set(snapshot.watchlist);
  const seen = new Set<string>();
  let previous = Infinity;
  for (let i = 0; i < board.length; i++) {
    const row = board[i];
    if (row.rank !== i + 1) return `rank ${row.rank} out of order at position ${i + 1}`;
    if (row.implied_value_usd > previous) {
      return `implied value rises at rank ${row.rank}`;
    }
    previous = row.implied_value_usd;
    if (row.implied_value_usd <= 0) return `non-positive implied value at rank ${row.rank}`;
    if (seen.has(row.slug)) return `duplicate slug ${row.slug}`;
    seen.add(row.slug);
    if (row.farm_steps.length !== 7) {
      return `row ${row.slug} has ${row.farm_steps.length} farm steps, expected 7`;
    }
    for (const step of row.farm_steps) {
      if (step.length < 20 || step.length > 600) {
        return `farm step length ${step.length} out of 20–600 for ${row.slug}`;
      }
    }
  }
  for (const slug of watchlist) {
    if (!seen.has(slug)) return `watchlist protocol ${slug} missing from the board`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Serialise the radar for the dashboard: a single assignment the page reads
// as window.RADAR.
// ---------------------------------------------------------------------------

export function dataScript(radar: Radar): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
