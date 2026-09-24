// FrontierWatch content script
// Scans page text, comments, meta, scripts, and DOM traps; reports origin-attributed findings.

(function () {
  'use strict';

  if (window.__frontierwatchLoaded) return;
  window.__frontierwatchLoaded = true;

  var lastHash = '';

  function collectUrls() {
    const urls = [];
    try {
      const nodes = document.querySelectorAll('script[src], link[href], iframe[src], form[action], img[src]');
      for (const n of nodes) {
        const u = n.getAttribute('src') || n.getAttribute('href') || n.getAttribute('action');
        if (u) urls.push(u);
      }
    } catch (e) { /* ignore */ }
    return urls;
  }

  function scanPage() {
    let findings = [];
    const pageHost = (typeof location !== 'undefined' && location.hostname) ? location.hostname : '';

    let pageText = '';
    try {
      pageText = (document.documentElement.innerText || '').slice(0, 500000);
    } catch (e) {
      pageText = '';
    }
    findings = findings.concat(fwScanText(pageText, { channel: 'text', pageHost: pageHost }));

    let html = '';
    try {
      html = (document.documentElement.outerHTML || '').slice(0, 500000);
    } catch (e) {
      html = '';
    }
    const comments = html.match(/<!--[\s\S]*?-->/g) || [];
    for (const c of comments) {
      findings = findings.concat(fwScanText(c, { channel: 'html-comment', pageHost: pageHost }));
    }

    const scripts = html.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) || [];
    for (let i = 0; i < Math.min(scripts.length, 40); i++) {
      findings = findings.concat(fwScanText(scripts[i], { channel: 'script', pageHost: pageHost }));
    }

    try {
      findings = findings.concat(fwScanMeta(document));
    } catch (e) { /* ignore */ }

    try {
      findings = findings.concat(fwScanUrls(collectUrls()));
    } catch (e) { /* ignore */ }

    try {
      const trapHits = FW_SIGNATURES.agentTraps.check(document);
      for (const t of trapHits) {
        findings.push({
          kind: 'dom-trap',
          family: 'agentTraps',
          label: FW_SIGNATURES.agentTraps.label + ' (' + t.type + ')',
          severity: FW_SIGNATURES.agentTraps.severity,
          match: t.snippet,
          confidence: t.confidence || 70,
          channel: 'hidden'
        });
      }
    } catch (e) { /* never break the page */ }

    findings = fwDedupe(findings);
    for (const f of findings) {
      if (!f.kind) f.kind = f.channel || 'text';
    }
    return findings.slice(0, 80);
  }

  function scanImages(done) {
    if (typeof fwSniffImage !== 'function' || typeof fwImageFindings !== 'function') {
      done([]);
      return;
    }
    const urls = [];
    try {
      const nodes = document.querySelectorAll('img[src]');
      for (let i = 0; i < nodes.length && urls.length < 6; i++) {
        const src = nodes[i].currentSrc || nodes[i].src;
        if (src && src.indexOf('data:image/svg') !== 0) urls.push(src);
      }
    } catch (e) { /* ignore */ }
    if (!urls.length) {
      done([]);
      return;
    }
    let left = urls.length;
    const findings = [];
    urls.forEach(function (url) {
      fetch(url, { credentials: 'omit' }).then(function (res) {
        return res.arrayBuffer();
      }).then(function (buf) {
        const bytes = new Uint8Array(buf.slice(0, 262144));
        const extra = fwImageFindings(fwSniffImage(bytes), url);
        for (let i = 0; i < extra.length; i++) findings.push(extra[i]);
      }).catch(function () { /* CORS or data URL */ }).then(function () {
        left -= 1;
        if (left <= 0) done(findings);
      });
    });
  }

  function report(findings, force) {
    const hash = fwFingerprint(findings);
    if (!force && hash === lastHash) return;
    lastHash = hash;
    try {
      chrome.runtime.sendMessage({
        type: 'fw_findings',
        url: location.href,
        title: document.title || '',
        ts: Date.now(),
        findings: findings,
        origins: fwSummarizeOrigins(findings)
      });
    } catch (e) { /* extension reloading */ }
  }

  function runScan(force) {
    let findings = [];
    try {
      findings = scanPage();
    } catch (e) {
      findings = [];
    }
    scanImages(function (imgFindings) {
      report(fwDedupe(findings.concat(imgFindings || [])), force);
    });
  }

  chrome.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
    if (!msg || msg.type !== 'fw_rescan') return false;
    runScan(true);
    sendResponse({ ok: true });
    return false;
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { runScan(false); }, { once: true });
  } else {
    runScan(false);
  }

  let scheduled = false;
  const observer = new MutationObserver(function (mutations) {
    if (scheduled) return;
    let big = false;
    for (const m of mutations) {
      if (m.addedNodes && m.addedNodes.length > 3) { big = true; break; }
    }
    if (!big) return;
    scheduled = true;
    setTimeout(function () {
      scheduled = false;
      runScan(false);
    }, 1500);
  });

  try {
    observer.observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) { /* document_start race */ }
})();
