// Starts payment for the selected KlientBoost plan.
//
// Order of preference:
//   1. GoHighLevel: send the onboarding details to the GHL inbound webhook
//      (GHL_WEBHOOK_URL, so the agent lands in GHL Contacts) and return the
//      plan's GHL payment link.
//   2. Stripe Checkout, if STRIPE_SECRET_KEY is set.
//   3. Otherwise answer 503 and the site falls back to email.

// GoHighLevel payment links (Payments > Payment Links), one per plan.
// These are public checkout URLs, so they live here rather than in secrets.
const GHL_LINKS = {
  essential: process.env.GHL_LINK_ESSENTIAL || 'https://link.fastpaydirect.com/payment-link/6ae4c1d000921ddbe8ee0606',
  advanced: process.env.GHL_LINK_ADVANCED || 'https://link.fastpaydirect.com/payment-link/6ae4c23e5b49394de8f58211',
  elite: process.env.GHL_LINK_ELITE || 'https://link.fastpaydirect.com/payment-link/6ae4c2885b49394de8f58213',
  flex: process.env.GHL_LINK_FLEX || 'https://link.fastpaydirect.com/payment-link/6ae4c2c300921ddbe8ee060b'
};

const PLANS = {
  essential: { name: 'Essential', amount: 37500, interval: 'year' },
  advanced: { name: 'Advanced', amount: 57500, interval: 'year' },
  elite: { name: 'Elite', amount: 87500, interval: 'year' },
  flex: { name: 'Flex', amount: 20000, interval: 'month' }
};

const FIELDS = [
  'first_name', 'last_name', 'email', 'phone', 'brokerage', 'license_number', 'mls_id',
  'primary_area', 'primary_radius', 'secondary_area', 'secondary_radius', 'zip_codes',
  'account_manager', 'agree_terms', 'sms_updates'
];
const REQUIRED = ['first_name', 'last_name', 'email', 'phone', 'brokerage', 'license_number', 'primary_area', 'primary_radius'];

const ALLOWED_HOSTS = /^(klientboost\.us|www\.klientboost\.us|[a-z0-9-]+\.vercel\.app)$/i;

function clean(v) {
  if (v === true) return 'yes';
  if (v === false || v == null) return '';
  return String(v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 450);
}

async function sendToGhl(plan, data, origin) {
  const url = process.env.GHL_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ plan: plan.name, source: `${origin}/pricing` }, data))
    });
  } catch (e) {
    console.error('GHL webhook failed', e && e.message);
  }
}

async function stripeSession(key, planId, plan, data, origin) {
  const p = new URLSearchParams();
  p.append('mode', 'subscription');
  p.append('line_items[0][quantity]', '1');
  p.append('line_items[0][price_data][currency]', 'usd');
  p.append('line_items[0][price_data][unit_amount]', String(plan.amount));
  p.append('line_items[0][price_data][recurring][interval]', plan.interval);
  p.append('line_items[0][price_data][product_data][name]', `KlientBoost ${plan.name} plan`);
  p.append('customer_email', data.email);
  p.append('billing_address_collection', 'auto');
  p.append('allow_promotion_codes', 'true');
  p.append('success_url', `${origin}/pricing?status=success&session_id={CHECKOUT_SESSION_ID}`);
  p.append('cancel_url', `${origin}/pricing?status=cancelled&plan=${planId}`);
  p.append('metadata[plan]', plan.name);
  p.append('subscription_data[metadata][plan]', plan.name);
  FIELDS.forEach((f) => {
    if (!data[f]) return;
    p.append(`metadata[${f}]`, data[f]);
    p.append(`subscription_data[metadata][${f}]`, data[f]);
  });
  const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: p.toString()
  });
  const json = await r.json();
  if (!r.ok || !json.url) {
    console.error('Stripe error', r.status, json && json.error && json.error.message);
    return null;
  }
  return json.url;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  let body = req.body || {};
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }

  const planId = body.plan;
  const plan = PLANS[planId];
  if (!plan) return res.status(400).json({ error: 'Please choose a plan.' });

  const ghlLink = GHL_LINKS[planId];
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!ghlLink && !stripeKey) return res.status(503).json({ error: 'Online payment is not switched on yet.' });

  const data = {};
  FIELDS.forEach((f) => { data[f] = clean(body[f]); });
  const missing = REQUIRED.filter((f) => !data[f]);
  if (missing.length || data.agree_terms !== 'yes') {
    return res.status(400).json({ error: 'Please fill in all required fields and accept the terms.' });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '');
  const origin = ALLOWED_HOSTS.test(host) ? `https://${host}` : 'https://klientboost.us';

  if (ghlLink) {
    await sendToGhl(plan, data, origin);
    return res.status(200).json({ url: ghlLink });
  }

  try {
    const url = await stripeSession(stripeKey, planId, plan, data, origin);
    if (url) return res.status(200).json({ url });
  } catch (e) {
    console.error('Stripe request failed', e && e.message);
  }
  return res.status(502).json({ error: 'The payment page could not be opened. Please try again or email support@klientboost.us.' });
};
