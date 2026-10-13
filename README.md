# Canpad

**Read the tape. A live board for Solana flow.**

[![Live site](https://img.shields.io/badge/live-canpad.fun-111111?style=flat-square)](https://canpad.fun)
![Chain](https://img.shields.io/badge/chain-Solana-111111?style=flat-square)

| | |
|---|---|
| Chain | Solana |
| Contract address | `pending` (not yet stated) |
| Site | https://canpad.fun |

## Overview

Canpad is a single-page board that ranks the ten busiest boosted mints on Solana by 24h turnover. It shows price, 24h change, turnover and depth for each, refreshes every minute, and hands over the full mint address with one click.

The page is static. Everything dynamic happens in the browser against two public DexScreener endpoints.

## Features

- Top ten boosted Solana mints, ranked by 24h turnover
- Price, 24h change, turnover and depth per row, with a copy button for each mint
- Scrolling price ticker fed by the same data
- Polling every 60 seconds, paused while the tab is hidden, exponential backoff on failure, last good rows kept
- Contract address slot that stays inert until an address is stated
- Reduced-motion support: every animation has an instant fallback

## Links

- Site: https://canpad.fun
- X: pending
- GitHub: pending

## Develop

```bash
npm run build   # writes the deployable site to dist/
npm run gates   # builds nothing, checks dist/ and proves both register branches
npm run serve   # serves dist/ on http://localhost:4173
```

`dist/` is the folder you upload. Every external fact (contract address, social links, market feed, chain) lives in `src/register.json` as one record with a state of `stated`, `absent` or `unconfirmed`.

## License

MIT
