# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Tactiq is a football (soccer) match analysis web app. Coaches and analysts annotate live or recorded matches by tagging events on an interactive pitch while watching YouTube video. After the match, a post-game dashboard offers heatmaps, event filtering, and an AI chat powered by Claude.

## Development & Deployment

This is a **static site + Netlify Functions** project. There is no build step — HTML files are served directly.

**Local development:**
```bash
npm install          # installs @supabase/supabase-js and stripe
netlify dev          # serves site locally with functions at /.netlify/functions/*
```

**Deploy:** Push to `main` on GitHub (`holaricardodata/tactiqfutbol`). Netlify auto-deploys.

**Netlify Functions** live in `netlify/functions/`. They are invoked via `fetch('/.netlify/functions/<name>', ...)` from the frontend.

## Architecture

### Pages
| File | Role |
|------|------|
| `landing.html` | Marketing page with pricing |
| `app.html` | Main annotation app (match tagging, YouTube player, pitch SVG) |
| `postpartido.html` | Post-match dashboard: heatmap, event table, AI chat |
| `index.html` | Minimal coming-soon redirect |

### Serverless Functions
| File | Role |
|------|------|
| `netlify/functions/chat.js` | Proxies to Claude API (`claude-sonnet-4-20250514`), enforces per-plan question limits |
| `netlify/functions/crear-checkout.js` | Creates Stripe Checkout session |
| `netlify/functions/stripe-webhook.js` | Handles Stripe events → updates `perfiles.plan` in Supabase |
| `netlify/functions/portal-stripe.js` | Redirects user to Stripe billing portal |

### Data Flow
- **Auth**: Supabase Auth (email/password). JWT passed as `Authorization: Bearer <token>` to all Netlify functions.
- **Database**: Supabase tables `perfiles` (user plan, usage counters, stripe IDs) and `partidos` (match events).
- **Match data handoff**: `app.html` saves match JSON to `localStorage` key `tactiq_ultimo_partido`; `postpartido.html` reads it on load.
- **Supabase client**: Initialized with hardcoded public URL + anon key in each HTML file. Functions use `SUPABASE_SERVICE_KEY` from environment.

### Plans & Limits
| Plan | Matches/month | AI questions/cycle |
|------|--------------|-------------------|
| Trial | 1 | 10 |
| Entrenador | 3 | 10 |
| Analista | 5 | 20 |
| Élite | 10 | 30 |

Limits are enforced in `chat.js` (questions) and `app.html` (matches). The 30-day billing cycle resets counters.

## Key Patterns

- **No JS framework** — plain DOM manipulation. All styles are `<style>` tags inside each HTML file.
- **No build pipeline** — editing an HTML file is a direct change to production output.
- **SVG pitch** — the interactive football field is an inline SVG. Click coordinates are normalized to 0–100 percentage values before saving.
- **YouTube IFrame API** — loaded dynamically; `ytPlayer` is the global player instance.
- **Rate limiting in `chat.js`** — in-memory `Map` (resets on cold start), 15 req/min per user.
- **Stripe webhook flow** — `checkout.session.completed` / `customer.subscription.*` events update `perfiles.plan`. The webhook may fire before the checkout function returns, so lookups use both `stripe_customer_id` and `supabase_user_id` from Stripe metadata.

## Environment Variables

Set in Netlify dashboard (not committed). Functions expect:

```
SUPABASE_URL
SUPABASE_SERVICE_KEY
ANTHROPIC_API_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_ENTRENADOR
STRIPE_PRICE_ANALISTA
STRIPE_PRICE_ELITE
```

The frontend uses the **public** Supabase URL and anon key hardcoded in each HTML file.
