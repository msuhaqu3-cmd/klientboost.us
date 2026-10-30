/* KlientBoost page runtime: binds {{holes}}, sc-if, sc-for and on* handlers
   in each page's markup to the page's Component logic. No dependencies. */
(function () {
  'use strict';

  function DCLogic(props) {
    this.props = props || {};
    this.state = {};
  }
  DCLogic.prototype.setState = function (patch) {
    var next = typeof patch === 'function' ? patch(this.state) : patch;
    for (var k in next) if (Object.prototype.hasOwnProperty.call(next, k)) this.state[k] = next[k];
    if (this.__render) this.__render();
  };
  DCLogic.prototype.forceUpdate = function () { if (this.__render) this.__render(); };

  var HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;
  var WHOLE = /^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/;

  function lookup(scope, path) {
    path = path.trim();
    if (path === 'true') return true;
    if (path === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(path)) return Number(path);
    var parts = path.split('.');
    var v = scope;
    for (var i = 0; i < parts.length; i++) {
      if (v == null) return undefined;
      v = v[parts[i]];
    }
    return v;
  }
  function interp(tpl, scope) {
    return tpl.replace(HOLE, function (_, p) {
      var v = lookup(scope, p);
      return v == null ? '' : String(v);
    });
  }
  var EVENTS = { onclick: 'click', onchange: 'input', oninput: 'input', onsubmit: 'submit' };

  // Returns update(scope) for the subtree rooted at node.
  function bind(node) {
    var updaters = [];

    if (node.nodeType === 3) {
      if (node.nodeValue.indexOf('{{') === -1) return null;
      var tpl = node.nodeValue;
      return function (scope) { node.nodeValue = interp(tpl, scope); };
    }
    if (node.nodeType !== 1) return null;

    var tag = node.tagName.toLowerCase();

    if (tag === 'sc-for') {
      var listExpr = (node.getAttribute('list') || '').match(WHOLE);
      var as = node.getAttribute('as') || 'item';
      var tplHTML = node.innerHTML;
      node.innerHTML = '';
      node.style.display = 'contents';
      return function (scope) {
        var list = listExpr ? lookup(scope, listExpr[1]) : [];
        node.innerHTML = '';
        (list || []).forEach(function (item, i) {
          var holder = document.createElement('div');
          holder.innerHTML = tplHTML;
          var child = Object.create(scope);
          child[as] = item;
          child.$index = i;
          Array.prototype.slice.call(holder.childNodes).forEach(function (c) {
            node.appendChild(c);
            var u = bind(c);
            if (u) u(child);
          });
        });
      };
    }

    if (tag === 'sc-if') {
      var condExpr = (node.getAttribute('value') || '').match(WHOLE);
      node.style.display = 'contents';
      Array.prototype.slice.call(node.childNodes).forEach(function (c) {
        var u = bind(c); if (u) updaters.push(u);
      });
      return function (scope) {
        var on = !!(condExpr && lookup(scope, condExpr[1]));
        node.style.display = on ? 'contents' : 'none';
        node.hidden = !on;
        if (on) updaters.forEach(function (u) { u(scope); });
      };
    }

    var current = null;
    Array.prototype.slice.call(node.attributes).forEach(function (attr) {
      var name = attr.name, val = attr.value;
      if (name.indexOf('hint-') === 0) { node.removeAttribute(name); return; }
      if (val.indexOf('{{') === -1) return;
      var ev = EVENTS[name.toLowerCase()];
      if (ev) {
        var m = val.match(WHOLE);
        node.removeAttribute(name);
        node.addEventListener(ev, function (e) {
          var fn = m && current ? lookup(current, m[1]) : null;
          if (typeof fn === 'function') fn(e);
        });
        return;
      }
      updaters.push(function (scope) {
        var whole = val.match(WHOLE);
        var out = whole ? lookup(scope, whole[1]) : interp(val, scope);
        if (name === 'value' && 'value' in node) {
          if (document.activeElement !== node) node.value = out == null ? '' : out;
        } else if (out === false || out == null) {
          node.removeAttribute(name);
        } else {
          var next = out === true ? '' : String(out);
          // Only touch changed attributes: re-setting an iframe's src reloads it.
          if (node.getAttribute(name) !== next) {
            node.setAttribute(name, next);
            // data-src="{{…}}" on an iframe: load only the real address, never the raw template.
            if (name === 'data-src' && next) node.setAttribute('src', next);
          }
        }
      });
    });

    Array.prototype.slice.call(node.childNodes).forEach(function (c) {
      var u = bind(c); if (u) updaters.push(u);
    });

    if (!updaters.length) return function (scope) { current = scope; };
    return function (scope) {
      current = scope;
      updaters.forEach(function (u) { u(scope); });
    };
  }

  function boot() {
    var root = document.getElementById('app');
    var src = document.getElementById('page-logic');
    var Component = DCLogic;
    if (src) {
      Component = new Function('DCLogic', src.textContent + '\n;return Component;')(DCLogic);
    }
    var comp = new Component({});
    if (!comp.state) comp.state = {};
    if (!comp.props) comp.props = {};
    var update = bind(root);
    comp.__render = function () { if (update) update(comp.renderVals ? comp.renderVals() : {}); };
    comp.__render();
    if (typeof comp.componentDidMount === 'function') comp.componentDidMount();
    root.removeAttribute('data-cloak');
    if (document.getElementById('checkout-form') && window.KB.watchLead) window.KB.watchLead('#checkout-form');
  }

  // Collects every filled field in a container and opens a pre-written email
  // to the KlientBoost inbox, so submissions reach the team without a backend.
  window.KB = {
    inbox: 'support@klientboost.us',
    sendForm: function (selector, subject) {
      var box = document.querySelector(selector);
      if (!box) return;
      var lines = [];
      var seenRadio = {};
      box.querySelectorAll('input, select, textarea').forEach(function (el) {
        var label = '';
        if (el.type === 'radio') {
          if (seenRadio[el.name]) return;
          seenRadio[el.name] = true;
          var fs = el.closest('fieldset');
          var lg = fs && fs.querySelector('legend');
          label = lg ? lg.textContent : el.name;
          var picked = box.querySelector('input[type=radio][name="' + el.name + '"]:checked');
          var val = picked ? picked.parentNode.textContent.trim() : '';
          if (val) lines.push(label.replace(/\*/g, '').trim() + ': ' + val);
          return;
        }
        if (el.id) {
          var l = box.querySelector('label[for="' + el.id + '"]');
          if (l) label = l.textContent;
        }
        if (el.type === 'checkbox') {
          var wrap = el.closest('label');
          var txt = (wrap ? wrap.textContent : 'Checkbox').trim();
          lines.push((txt.length > 60 ? txt.slice(0, 60) + '…' : txt) + ': ' + (el.checked ? 'Yes' : 'No'));
          return;
        }
        var v = (el.value || '').trim();
        if (!v || v === 'Select…') return;
        lines.push((label || el.name || el.id).replace(/\*/g, '').replace(/\s*\(optional\)\s*/i, '').trim() + ': ' + v);
      });
      lines.push('', 'Sent from ' + location.href);
      var href = 'mailto:' + this.inbox + '?subject=' + encodeURIComponent(subject) +
        '&body=' + encodeURIComponent(lines.join('\n'));
      window.location.href = href;
    }
  };

  // Checks the checkout form, then asks /api/checkout for a Stripe Checkout
  // page and sends the visitor there. done(errorMessage | null).
  window.KB.startCheckout = function (selector, plan, done) {
    var box = document.querySelector(selector);
    if (!box) return done('Something went wrong. Please refresh the page and try again.');
    var data = { plan: plan };
    var missing = [];
    box.querySelectorAll('input[name], select[name], textarea[name]').forEach(function (el) {
      var val = el.type === 'checkbox' ? el.checked : (el.value || '').trim();
      data[el.name] = val;
      var bad = el.required && (el.type === 'checkbox' ? !el.checked : !val);
      if (el.name === 'email' && val && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(val)) bad = true;
      if (el.name === 'phone' && val && val.replace(/\D/g, '').length < 10) bad = true;
      el.setAttribute('aria-invalid', bad ? 'true' : 'false');
      if (bad) {
        var l = el.id && box.querySelector('label[for="' + el.id + '"]');
        var name = el.type === 'checkbox' ? 'agreement to the terms'
          : (l ? l.textContent.replace(/\*|\(.*\)/g, '').trim().toLowerCase() : el.name);
        missing.push(name);
      }
    });
    if (missing.length) {
      var first = box.querySelector('[aria-invalid="true"]');
      if (first) first.focus();
      return done('Please check: ' + missing.join(', ') + '.');
    }
    fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, ok: r.ok, body: j }; });
    }).then(function (res) {
      if (res.ok && res.body.url) {
        // Stripe Checkout can't be shown inside a page, so it opens full screen.
        if (/^https:\/\/checkout\.stripe\.com\//.test(res.body.url)) { window.location.href = res.body.url; return; }
        done(null, res.body.url);
        return;
      }
      if (res.status === 503) {
        window.KB.sendForm(selector, 'Plan request: ' + plan);
        done('Online payment is being switched on. Your email app opened with your details, so press send and we\'ll email you a secure payment link.');
        return;
      }
      done(res.body.error || 'Something went wrong. Please try again or email support@klientboost.us.');
    }).catch(function () {
      done('We couldn\'t reach the payment page. Check your connection and try again.');
    });
  };

  // Onboarding details on the checkout page: sent to /api/lead (and from there to
  // GoHighLevel) when the agent moves into the payment form or leaves the page.
  window.KB.watchLead = function (selector) {
    var last = '';
    function collect() {
      var box = document.querySelector(selector);
      if (!box) return null;
      var data = { plan: box.getAttribute('data-plan') || '' };
      box.querySelectorAll('input[name], select[name], textarea[name]').forEach(function (el) {
        data[el.name] = el.type === 'checkbox' ? el.checked : (el.value || '').trim();
      });
      if (!data.email && !data.phone) return null;
      return data;
    }
    function send() {
      var data = collect();
      if (!data) return;
      var body = JSON.stringify(data);
      if (body === last) return;
      last = body;
      try {
        if (navigator.sendBeacon) {
          navigator.sendBeacon('/api/lead', new Blob([body], { type: 'application/json' }));
        } else {
          fetch('/api/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true });
        }
      } catch (e) {}
    }
    window.addEventListener('blur', function () {
      setTimeout(function () {
        if (document.activeElement && document.activeElement.tagName === 'IFRAME') send();
      }, 0);
    });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') send();
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
