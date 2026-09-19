// Talks to Shopify's Admin GraphQL API.
//
// IMPORTANT: field names on SubscriptionContract etc. can shift between
// Shopify API versions. This was written against the 2025-01-ish shape of
// the schema from documentation, but wasn't tested against a live store
// (no live network access when this was built). Before relying on it:
//   1. Run a small test query in Shopify's GraphiQL app (Settings > Apps >
//      develop apps > your app > API docs / GraphiQL) to confirm these
//      exact field names still exist on your store's API version.
//   2. See the README for how to do a safe dry run.

const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN; // e.g. mysterymanga.myshopify.com
const SHOPIFY_ADMIN_API_TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN;
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2025-01';

async function shopifyGraphQL(query, variables = {}) {
  const res = await fetch(
    `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_ADMIN_API_TOKEN,
      },
      body: JSON.stringify({ query, variables }),
    }
  );

  if (!res.ok) {
    throw new Error(`Shopify API HTTP error ${res.status}: ${await res.text()}`);
  }

  const json = await res.json();
  if (json.errors) {
    throw new Error(`Shopify GraphQL errors: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

// Fetches every active subscription contract, paging through all of them.
// Returns customer info + enough billing data to work out the last billing
// date ourselves (nextBillingDate minus the billing interval).
async function getActiveSubscriptionContracts() {
  const contracts = [];
  let cursor = null;
  let hasNextPage = true;

  const query = `
    query ActiveSubscriptions($cursor: String) {
      subscriptionContracts(first: 50, after: $cursor, query: "status:active") {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            id
            nextBillingDate
            billingPolicy {
              interval
              intervalCount
            }
            customer {
              id
              email
              firstName
              tags
            }
          }
        }
      }
    }
  `;

  while (hasNextPage) {
    const data = await shopifyGraphQL(query, { cursor });
    const conn = data.subscriptionContracts;
    for (const edge of conn.edges) {
      contracts.push(edge.node);
    }
    hasNextPage = conn.pageInfo.hasNextPage;
    cursor = conn.pageInfo.endCursor;
  }

  return contracts;
}

// Computes the most recent billing date from nextBillingDate and the
// billing interval (e.g. MONTHLY / intervalCount 1).
function getLastBillingDate(contract) {
  const next = new Date(contract.nextBillingDate);
  const { interval, intervalCount } = contract.billingPolicy;
  const result = new Date(next);

  switch (interval) {
    case 'DAY':
      result.setDate(result.getDate() - intervalCount);
      break;
    case 'WEEK':
      result.setDate(result.getDate() - 7 * intervalCount);
      break;
    case 'MONTH':
      result.setMonth(result.getMonth() - intervalCount);
      break;
    case 'YEAR':
      result.setFullYear(result.getFullYear() - intervalCount);
      break;
    default:
      throw new Error(`Unrecognized billing interval: ${interval}`);
  }
  return result;
}

// Reads the "last cycle we sent this customer the quiz-retake email" marker,
// stored as a metafield on the customer so we don't need our own database.
async function getLastSentCycle(customerId) {
  const query = `
    query GetMetafield($id: ID!) {
      customer(id: $id) {
        metafield(namespace: "quiz_retake", key: "last_sent_cycle") {
          value
        }
      }
    }
  `;
  const data = await shopifyGraphQL(query, { id: customerId });
  return data.customer?.metafield?.value || null;
}

// Writes that marker after we've successfully sent the email, so tomorrow's
// run knows not to send it again for the same billing cycle.
async function setLastSentCycle(customerId, isoDateString) {
  const mutation = `
    mutation SetMetafield($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { field message }
      }
    }
  `;
  const variables = {
    metafields: [
      {
        ownerId: customerId,
        namespace: 'quiz_retake',
        key: 'last_sent_cycle',
        type: 'single_line_text_field',
        value: isoDateString,
      },
    ],
  };
  const data = await shopifyGraphQL(mutation, variables);
  const errors = data.metafieldsSet.userErrors;
  if (errors && errors.length) {
    throw new Error(`Failed to set metafield: ${JSON.stringify(errors)}`);
  }
}

module.exports = {
  getActiveSubscriptionContracts,
  getLastBillingDate,
  getLastSentCycle,
  setLastSentCycle,
};
