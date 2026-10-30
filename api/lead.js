// Receives the onboarding details from the checkout page and forwards them to a
// GoHighLevel workflow "Inbound Webhook" (GHL_WEBHOOK_URL), so each agent's
// license, MLS ID and service areas land in GoHighLevel Contacts.
// Without GHL_WEBHOOK_URL it accepts the request and does nothing.

const FIELDS = [
  'plan', 'first_name', 'last_name', 'email', 'phone', 'brokerage', 'license_number', 'mls_id',
  'primary_area', 'primary_radius', 'secondary_area', 'secondary_radius', 'zip_codes',
  'account_manager', 'sms_updates'
];

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
  let body = req.body || {};
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  const data = {};
  FIELDS.forEach((f) => { data[f] = clean(body[f]); });
  if (!data.email && !data.phone) return res.status(400).json({ error: 'Email or phone is required.' });
  if (data.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email)) data.email = '';

  const url = process.env.GHL_WEBHOOK_URL;
  if (!url) return res.status(204).end();
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ source: 'klientboost.us/pricing' }, data))
    });
  } catch (e) {
    console.error('GHL webhook failed', e && e.message);
  }
  return res.status(204).end();
};
