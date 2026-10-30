# KlientBoost website

Static site for https://klientboost.us, hosted on Vercel.

- `design/` – the page designs (`*.dc.html`) this site is generated from.
- `tools/build.py` – turns the designs into the HTML pages at the repo root:
  `python3 tools/build.py`
- `assets/app.js` – small runtime for the interactive parts (pricing toggle,
  ROI calculator, multi-step forms, checkout plan picker).
- `vercel.json` – clean URLs plus redirects from the old site's URLs.

Forms (buyers, sellers, contact, plan requests) open a pre-filled email to
support@klientboost.us. Swap `KB.sendForm` in `assets/app.js` for a CRM or
form-service call when one is ready.

## Payments (GoHighLevel)

`api/checkout.js` sends each plan to its GoHighLevel payment link
(KlientBoost sub-account → Payments → Payment Links), processed by the Stripe
account connected in GoHighLevel. After paying, GoHighLevel redirects to
`/pricing?status=success`.

| Plan | Price | GHL product |
| --- | --- | --- |
| Essential | $375 / year | KlientBoost Essential Plan |
| Advanced | $575 / year | KlientBoost Advanced Plan |
| Elite | $875 / year | KlientBoost Elite Plan |
| Flex | $200 / month | KlientBoost Flex Plan |

Optional: set `GHL_WEBHOOK_URL` (a GoHighLevel workflow "Inbound Webhook"
trigger URL) in Vercel to also send the onboarding details (license, MLS ID,
service areas) into GoHighLevel Contacts. If a `STRIPE_SECRET_KEY` is set and a
plan has no GHL link, Stripe Checkout is used instead.
