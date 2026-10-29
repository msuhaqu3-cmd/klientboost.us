// Creates a Stripe Checkout session for the selected KlientBoost plan and
// returns its URL. Needs the STRIPE_SECRET_KEY environment variable in Vercel;
// without it the endpoint answers 503 and the site falls back to email.

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

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return res.status(503).json({ error: 'Online payment is not switched on yet.' });

  let body = req.body || {};
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }

  const plan = PLANS[body.plan];
  if (!plan) return res.status(400).json({ error: 'Please choose a plan.' });

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
  p.append('cancel_url', `${origin}/pricing?status=cancelled&plan=${body.plan}`);
  p.append('metadata[plan]', plan.name);
  p.append('subscription_data[metadata][plan]', plan.name);
  FIELDS.forEach((f) => {
    if (!data[f]) return;
    p.append(`metadata[${f}]`, data[f]);
    p.append(`subscription_data[metadata][${f}]`, data[f]);
  });

  try {
    const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: p.toString()
    });
    const json = await r.json();
    if (!r.ok || !json.url) {
      console.error('Stripe error', r.status, json && json.error && json.error.message);
      return res.status(502).json({ error: 'The payment page could not be opened. Please try again or email support@klientboost.us.' });
    }
    return res.status(200).json({ url: json.url });
  } catch (e) {
    console.error('Stripe request failed', e && e.message);
    return res.status(502).json({ error: 'The payment page could not be opened. Please try again or email support@klientboost.us.' });
  }
};
