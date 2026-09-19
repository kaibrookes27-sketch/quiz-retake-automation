const {
  getActiveSubscriptionContracts,
  getLastBillingDate,
  getLastSentCycle,
  setLastSentCycle,
} = require('../lib/shopify');
const { sendQuizRetakeEmail } = require('../lib/email');

// How many days after billing to send the email. Override with the
// TARGET_DAYS env var for testing (e.g. set it to 0 to fire on anyone
// billed today, for a quick end-to-end test).
const TARGET_DAYS = parseInt(process.env.TARGET_DAYS || '21', 10);

// If true, logs what WOULD happen instead of actually sending emails or
// writing metafields. Use this for your first test run.
const DRY_RUN = process.env.DRY_RUN === 'true';

function daysBetween(a, b) {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.floor((a.setHours(0, 0, 0, 0) - b.setHours(0, 0, 0, 0)) / msPerDay);
}

module.exports = async (req, res) => {
  // Vercel Cron requests carry this header automatically. Also accept a
  // manual secret so you can trigger a test run yourself via curl/browser.
  const isCron = req.headers['x-vercel-cron'] !== undefined;
  const providedSecret = req.headers['x-cron-secret'] || req.query?.secret;
  const isAuthorizedManualCall =
    process.env.CRON_SECRET && providedSecret === process.env.CRON_SECRET;

  if (!isCron && !isAuthorizedManualCall) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const today = new Date();
  const results = { checked: 0, sent: 0, skipped: 0, errors: [] };

  try {
    const contracts = await getActiveSubscriptionContracts();
    results.checked = contracts.length;

    for (const contract of contracts) {
      try {
        const lastBillingDate = getLastBillingDate(contract);
        const daysSinceBilling = daysBetween(new Date(today), new Date(lastBillingDate));

        if (daysSinceBilling < TARGET_DAYS) {
          results.skipped++;
          continue; // not due yet
        }

        const cycleKey = lastBillingDate.toISOString().slice(0, 10); // YYYY-MM-DD
        const lastSentCycle = await getLastSentCycle(contract.customer.id);

        if (lastSentCycle === cycleKey) {
          results.skipped++;
          continue; // already sent for this billing cycle
        }

        if (DRY_RUN) {
          console.log(
            `[DRY RUN] Would email ${contract.customer.email} — billed ${cycleKey}, ${daysSinceBilling} days ago.`
          );
        } else {
          await sendQuizRetakeEmail({
            to: contract.customer.email,
            firstName: contract.customer.firstName,
          });
          await setLastSentCycle(contract.customer.id, cycleKey);
        }

        results.sent++;
      } catch (err) {
        results.errors.push({ contractId: contract.id, message: err.message });
      }
    }

    res.status(200).json({ dryRun: DRY_RUN, ...results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
