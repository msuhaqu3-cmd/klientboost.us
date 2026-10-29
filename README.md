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
