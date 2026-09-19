# Quiz Retake Automation

Runs once a day. Finds every subscriber whose last billing was 21+ days ago
and hasn't already been emailed for this cycle, and sends them the
"retake the quiz / switch tiers" email via Resend.

This replaces the Shopify Flow + Shopify Messaging setup — no admin UI to
navigate, no menus that might move again. It's a standalone piece of code
that only talks to Shopify's API directly.

## ⚠️ Before you rely on this

The Shopify GraphQL field names in `lib/shopify.js` were written from
documentation, not tested against a live store (no live network access
when this was built). **Before your first real run:**

1. Log into your Shopify admin → Settings → Apps and sales channels →
   Develop apps (see setup below) → open your app → API docs / GraphiQL.
2. Paste in the `subscriptionContracts` query from `lib/shopify.js` and run
   it manually. Confirm it returns real data with no field errors.
3. If any field name has changed, update `lib/shopify.js` to match — the
   query is isolated in one function, `getActiveSubscriptionContracts()`.

## Setup

### 1. Create a custom app in Shopify (for API access)

1. Shopify admin → Settings → Apps and sales channels → Develop apps
2. Click "Create an app", name it something like "Quiz Retake Automation"
3. Configure Admin API scopes — you need at minimum:
   - `read_customers`
   - `write_customers` (for the metafield tracking)
   - `read_own_subscription_contracts` (or `read_customer_payment_methods`
     depending on your API version — check what's listed for subscriptions)
4. Install the app on your store
5. Go to the "API credentials" tab and reveal the **Admin API access token**
   — copy this, you'll need it as `SHOPIFY_ADMIN_API_TOKEN`

### 2. Set up Resend

1. Sign up at resend.com (free tier is plenty for this volume)
2. Verify a sending domain (or subdomain) you own — this is required
   before you can send real emails, not just test ones
3. Create an API key, copy it as `RESEND_API_KEY`

### 3. Deploy to Vercel

1. Push this folder to a GitHub repo
2. Go to vercel.com → New Project → import that repo
3. Before deploying, add all the environment variables from `.env.example`
   under Project Settings → Environment Variables — fill in real values
4. Deploy

Vercel will automatically pick up `vercel.json` and schedule the cron job
to hit `/api/check-quiz-retake` daily at 9am UTC.

## Testing safely before going live

**Do this before turning on real sends:**

1. In Vercel's environment variables, set `DRY_RUN=true` and
   `TARGET_DAYS=0` (so it matches anyone billed today, not 21 days ago)
2. Redeploy
3. Manually trigger it — visit:
   `https://your-project.vercel.app/api/check-quiz-retake?secret=YOUR_CRON_SECRET`
4. Check the JSON response and your Vercel function logs — you should see
   `[DRY RUN] Would email ...` lines for anyone billed today, with no real
   emails sent and no metafields written
5. Once that looks right, set `DRY_RUN=false` and do one more real test run
   the same way, ideally against your own test subscription — confirm the
   actual email lands and looks right
6. Set `TARGET_DAYS` back to `21`, redeploy, and you're live

## How it avoids duplicate sends

Each customer gets a metafield (`quiz_retake.last_sent_cycle`) storing the
date of the billing cycle they were last emailed for. Every day the job
checks whether today's matching cycle is different from that stored value
before sending — so even if the cron runs more than once, or someone stays
"21+ days" past billing for several days in a row, they'll only get one
email per cycle.

## Known limitation

If the daily cron genuinely fails to run on the exact day someone crosses
21 days (Vercel's cron is generally reliable, but not guaranteed to the
minute), the `daysSinceBilling < TARGET_DAYS` check means anyone who's
past that threshold will still catch it the next day it does run — this
script checks "21 or more days," not "exactly 21," so a missed run just
delays the email by a day or two rather than skipping it entirely.
