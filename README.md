# Token Radar: model radar-2

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/FebbyUtomo/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/FebbyUtomo/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar. It reads a sealed snapshot of every protocol DefiLlama
tracks, ranks the protocols that still record no token by what their launch
would be worth, and shows a dashboard with the board, a detail view for every
protocol, and the steps to farm it. An entry for the make.fun bounty
`token-radar-01` ("Build the best token launch radar").

## The model (radar-2)

Implied value comes from the snapshot's own figures, in four parts:

```
sector multiple = median market-cap-to-TVL of the live-token protocols in the
                  same category, computed from this snapshot at run time.
                  A category with fewer than 4 live tokens falls back to the
                  global median (0.2138 on this snapshot). Every multiple is
                  clamped to 0.05–1.50 so a thin category cannot hand a
                  protocol a hundred-fold multiple.
base            = tvl_usd x sector multiple
growth          = 1 + clamp(change_7d, -50, 100) / 100 x 0.6
maturity        = 0.6 + min(age_days, 1095) / 1095 x 0.4
implied         = round(base x growth x maturity)
```

A lending protocol is scored against lending tokens, a DEX against DEX
tokens, and a category with no live-token history against the whole market.
The rule is the same for every protocol. The dashboard prints the
calibration table, so any reader can check the multiple each row was given.
Each protocol's detail view shows its own four parts.

The board covers all 40 watchlist protocols (TVL ≥ $50M, no token on
record) plus the 186 pre-token protocols below the floor with the most TVL,
226 rows in total. Live-token protocols are set aside with their market
caps shown.

## Run it

```sh
node main.ts --input <snapshot.json|directory>
```

Outside the grader's container, set `MAKEFUN_OUTPUT_DIR`:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

Needs Node 22.18 or later, standard library only, nothing to install. It
writes `board.json`, `data.js`, `dashboard/`, `screenshots/` and `dossier.json`
to the output directory.

## Layout

- `main.ts`: entrypoint that reads the snapshot, scores the board, and writes the output
- `lib/model.ts`: the radar-2 model, the farm plans, and the snapshot parser
- `vendor/makefun-board.ts`: make.fun's dossier library, copied byte-for-byte from the kit
- `dashboard/`: the static page (index.html, app.css, app.js), no network
- `screenshots/`: the three screenshots (the board, a detail view, a filtered view)

## License

MIT. See `LICENSE`.
