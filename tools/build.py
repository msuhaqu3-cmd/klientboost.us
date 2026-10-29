"""Build the static KlientBoost site from the design pages in /design.

Usage:  python3 tools/build.py
Writes one .html file per page to the repo root (served by Vercel with clean URLs).
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DESIGN = ROOT / "design"
SITE_URL = "https://www.klientboost.us"
ACCENT = "#FFB547"

# design file -> (output file, URL path, <title>, meta description)
PAGES = {
    "Main": ("index.html", "/", "KlientBoost | Exclusive Real Estate Referrals & Appointments",
             "Exclusive, phone-verified buyer and seller referrals in the zip codes you choose, with appointments set for you. Plans from $375 a year."),
    "Story": ("about-us.html", "/about-us", "Our Story | KlientBoost",
              "KlientBoost is a relationship-first referral network that connects real estate agents with verified buyers and sellers in their local markets."),
    "Buyers": ("for-buyers.html", "/for-buyers", "For Buyers | KlientBoost",
               "Tell us what you're looking for and we'll match you with a trusted local agent who knows the area."),
    "Sellers": ("for-sellers.html", "/for-sellers", "For Sellers | KlientBoost",
                "Tell us about your property and we'll match you with a local agent who can help you price, market and sell it."),
    "Checkout": ("pricing.html", "/pricing", "Plans & Pricing | KlientBoost",
                 "Choose your KlientBoost plan: Essential, Advanced, Elite or Flex. Exclusive zip codes, verified referrals and appointments set for you."),
    "Contact": ("contact-us.html", "/contact-us", "Book a Call | KlientBoost",
                "Talk to the KlientBoost team and check whether your zip codes are still available."),
    "Terms": ("term-condition.html", "/term-condition", "Terms and Conditions | KlientBoost",
              "The terms and conditions for using KlientBoost's services."),
    "Privacy": ("privacy-policy.html", "/privacy-policy", "Privacy Policy | KlientBoost",
                "How KlientBoost collects, uses and protects your information."),
    "Cancellation": ("cancellation-policy.html", "/cancellation-policy", "Cancellation Policy | KlientBoost",
                     "How to cancel your KlientBoost membership."),
    "Communication": ("communication-policy.html", "/communication-policy", "Communication Policy | KlientBoost",
                      "How KlientBoost communicates with clients, agents and partners."),
    "TermsOfUse": ("terms-of-use.html", "/terms-of-use", "Terms of Use | KlientBoost",
                   "The terms that apply when you use the KlientBoost website."),
}

LINKS = {name + ".dc.html": info[1] for name, info in PAGES.items()}
LINKS.update({
    "https://klientboost.us/contact-us": "/contact-us",
    "https://klientboost.us/trial": "/pricing",
    "https://klientboost.us/pricing": "/pricing",
    "https://klientboost.us/about-us": "/about-us",
    "https://klientboost.us/faq": "/#faq",
    "https://klientboost.us/home": "/",
})

# Page-specific changes for the live site (forms deliver to the inbox; no fake payment).
PATCHES = {
    "Buyers": [
        ('<div style="flex: 1 1 520px; min-width: 0; background: #FFFFFF; border: 1px solid #DCDFEA; border-radius: 28px; padding: 36px; box-sizing: border-box">',
         '<div id="lead-form" style="flex: 1 1 520px; min-width: 0; background: #FFFFFF; border: 1px solid #DCDFEA; border-radius: 28px; padding: 36px; box-sizing: border-box">'),
        ("submit: function () { self.setState({ step: 3 }); }",
         "submit: function () { if (window.KB) KB.sendForm('#lead-form', 'New buyer request from klientboost.us'); self.setState({ step: 3 }); }"),
        ("A local agent who covers your area will reach out soon to help with your search.",
         "Your email app should open with your details filled in. Press send, and a local agent who covers your area will reach out. If it didn't open, email us at support@klientboost.us."),
    ],
    "Sellers": [
        ('<div style="flex: 1 1 520px; min-width: 0; background: #FFFFFF; border: 1px solid #DCDFEA; border-radius: 28px; padding: 36px; box-sizing: border-box">',
         '<div id="lead-form" style="flex: 1 1 520px; min-width: 0; background: #FFFFFF; border: 1px solid #DCDFEA; border-radius: 28px; padding: 36px; box-sizing: border-box">'),
        ("submit: function () { self.setState({ step: 3 }); }",
         "submit: function () { if (window.KB) KB.sendForm('#lead-form', 'New seller request from klientboost.us'); self.setState({ step: 3 }); }"),
        ("A local agent who covers your zip code will reach out soon to talk about your sale.",
         "Your email app should open with your details filled in. Press send, and a local agent who covers your zip code will reach out. If it didn't open, email us at support@klientboost.us."),
    ],
    "Checkout": [
        ('<div style="flex: 999 1 560px; min-width: 0; display: flex; flex-direction: column; gap: 24px">',
         '<div id="checkout-form" style="flex: 999 1 560px; min-width: 0; display: flex; flex-direction: column; gap: 24px">'),
        ("Three quick steps: pick a plan, add your details, then pay securely.",
         "Pick a plan and add your details. We'll confirm your zip codes, then send you a secure payment link."),
        ("Payment</h2>", "Confirm</h2>"),
        ('<p style="margin: 10px 0 0; font-weight: 700; color: #26304D">[Your payment processor\'s secure card form goes here]</p>\n<p style="margin: 6px 0 0; font-size: 14px">Embed the hosted checkout from your payment provider in this box.</p>',
         '<p style="margin: 10px 0 0; font-weight: 700; color: #26304D">No card needed today</p>\n<p style="margin: 6px 0 0; font-size: 14px">Once we confirm your zip codes are available, we\'ll email you a secure payment link.</p>'),
        ('<span style="font-weight: 700">Due today</span>', '<span style="font-weight: 700">Plan price</span>'),
        ('<button type="button" style="margin-top: 24px; width: 100%; font: inherit; font-weight: 800; font-size: 17px; padding: 17px; min-height: 56px; border: 0; border-radius: 14px; background: #FFB547; color: #0B1430; cursor: pointer">Complete purchase</button>',
         '<button type="button" onClick="{{submit}}" style="margin-top: 24px; width: 100%; font: inherit; font-weight: 800; font-size: 17px; padding: 17px; min-height: 56px; border: 0; border-radius: 14px; background: #FFB547; color: #0B1430; cursor: pointer">Request this plan</button>\n'
         '<sc-if value="{{sent}}" hint-placeholder-val="{{false}}"><p role="status" style="margin: 14px 0 0; background: #1B2A57; border-radius: 12px; padding: 14px; font-size: 14px; line-height: 1.55; color: #FFFFFF">Your email app should open with your request filled in. Press send and we\'ll confirm your zip codes. If it didn\'t open, email support@klientboost.us.</p></sc-if>'),
        ('Secure, encrypted payment</p>', 'Nothing is charged on this page</p>'),
        ("zipsLabel: cur.zips + ' exclusive zip codes'",
         "zipsLabel: cur.zips + ' exclusive zip codes',\n      sent: !!self.state.sent,\n      submit: function () { if (window.KB) KB.sendForm('#checkout-form', 'Plan request: ' + cur.name + ' (' + cur.price + ')'); self.setState({ sent: true }); }"),
    ],
}


def section(src, start_pat, end_pat):
    m = re.search(start_pat + r"(.*?)" + end_pat, src, re.S)
    if not m:
        raise SystemExit(f"pattern not found: {start_pat}")
    return m.group(1)


def body_of(name):
    src = (DESIGN / f"{name}.dc.html").read_text()
    return src


def component_markup(name):
    src = body_of(name)
    return section(src, r"</helmet>", r"</x-dc>").strip()


def build_page(name, nav, footer):
    out_file, path, title, desc = PAGES[name]
    src = body_of(name)
    helmet = section(src, r"<helmet>", r"</helmet>")
    style = section(helmet, r"<style>", r"</style>").strip()
    markup = section(src, r"</helmet>", r"</x-dc>").strip()
    logic = section(src, r"<script type=\"text/x-dc\" data-dc-script[^>]*>", r"</script>").strip()

    for old, new in PATCHES.get(name, []):
        if old in markup:
            markup = markup.replace(old, new)
        elif old in logic:
            logic = logic.replace(old, new)
        else:
            raise SystemExit(f"{name}: patch target not found: {old[:60]}")

    markup = re.sub(r'<dc-import name="Nav"[^>]*></dc-import>', nav, markup)
    markup = re.sub(r'<dc-import name="Footer"[^>]*></dc-import>', footer, markup)
    markup = markup.replace("{{accent}}", ACCENT)
    for old, new in LINKS.items():
        markup = markup.replace(f'href="{old}"', f'href="{new}"')
    leftover = re.findall(r'href="[^"]*\.dc\.html', markup)
    if leftover:
        raise SystemExit(f"{name}: unresolved links {leftover}")

    canonical = SITE_URL + ("" if path == "/" else path)
    html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{desc}">
<link rel="canonical" href="{canonical}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="KlientBoost">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="{canonical}">
<meta name="twitter:card" content="summary">
<meta name="theme-color" content="#0F1B3D">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
{style}
html{{scroll-behavior:smooth}}
[id]{{scroll-margin-top:96px}}
sc-if,sc-for{{display:contents}}
@media (max-width:720px){{#app>div>div[style*="sticky"]{{position:static!important}}[id]{{scroll-margin-top:12px}}}}
[data-cloak] sc-if,[data-cloak] sc-for{{visibility:hidden}}
</style>
</head>
<body>
<div id="app" data-cloak>
{markup}
</div>
<script type="text/x-dc" id="page-logic">
{logic}
</script>
<script src="/assets/app.js"></script>
</body>
</html>
"""
    (ROOT / out_file).write_text(html)
    return out_file


def main():
    nav = component_markup("Nav")
    footer = component_markup("Footer")
    built = [build_page(n, nav, footer) for n in PAGES]
    print("built:", ", ".join(built))


if __name__ == "__main__":
    sys.exit(main())
