// FrontierWatch background service worker
// Alert log, live tab attribution, API-host observation.

'use strict';

importScripts('models.js', 'lineage.js', 'unicode.js', 'provenance.js', 'signatures.js');

const FW_MAX_LOG = 500;
const fwTabState = {};

async function fwAppendLog(entry) {
  const data = await chrome.storage.local.get({ fwLog: [] });
  const log = data.fwLog;
  const prev = log[0];
  if (prev && prev.url === entry.url && prev.hash === entry.hash && (entry.ts - prev.ts) < 15000) {
    log[0] = entry;
  } else {
    log.unshift(entry);
  }
  if (log.length > FW_MAX_LOG) log.length = FW_MAX_LOG;
  await chrome.storage.local.set({ fwLog: log });
}

function fwTopSeverity(findings) {
  let top = 'low';
  for (const f of findings) {
    if (f.severity === 'high') return 'high';
    if (f.severity === 'medium') top = 'medium';
  }
  return top;
}

async function fwBadge(tabId, count, severity) {
  if (typeof tabId !== 'number' || tabId < 0) return;
  const text = count === 0 ? '' : (count > 99 ? '99+' : String(count));
  try {
    await chrome.action.setBadgeText({ tabId: tabId, text: text });
    const color = severity === 'high' ? '#c2410c' : severity === 'medium' ? '#d97706' : '#64748b';
    await chrome.action.setBadgeBackgroundColor({ tabId: tabId, color: color });
  } catch (e) { /* tab closed */ }
}

function fwMergeNetwork(tabId, originFinding) {
  const state = fwTabState[tabId] || { findings: [], origins: [], url: '', title: '', ts: Date.now() };
  const already = state.findings.some(function (f) {
    return f.family === 'servingHints' && f.match === originFinding.match;
  });
  if (!already) {
    state.findings = fwDedupe(state.findings.concat([originFinding]));
    state.origins = fwSummarizeOrigins(state.findings);
    state.ts = Date.now();
    fwTabState[tabId] = state;
    fwBadge(tabId, state.findings.length, fwTopSeverity(state.findings));
  }
}

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg) return false;

  if (msg.type === 'fw_get_tab') {
    const tabId = msg.tabId;
    sendResponse(fwTabState[tabId] || null);
    return false;
  }

  if (msg.type !== 'fw_findings') return false;

  const tabId = sender && sender.tab ? sender.tab.id : -1;
  const findings = msg.findings || [];
  const origins = msg.origins || fwSummarizeOrigins(findings);
  const hash = fwFingerprint(findings);

  const state = {
    url: msg.url || '',
    title: msg.title || '',
    ts: msg.ts || Date.now(),
    findings: findings,
    origins: origins,
    hash: hash
  };
  if (tabId >= 0) fwTabState[tabId] = state;

  if (findings.length === 0) {
    fwBadge(tabId, 0, 'low');
    return false;
  }

  const topSeverity = fwTopSeverity(findings);
  const entry = {
    url: state.url,
    title: state.title,
    ts: state.ts,
    severity: topSeverity,
    count: findings.length,
    findings: findings,
    origins: origins,
    hash: hash
  };

  fwAppendLog(entry).then(function () {
    return fwBadge(tabId, findings.length, topSeverity);
  }).catch(function () { /* storage unavailable */ });

  return false;
});

chrome.tabs.onUpdated.addListener(function (tabId, changeInfo) {
  if (changeInfo.status === 'loading') {
    delete fwTabState[tabId];
    fwBadge(tabId, 0, 'low');
  }
});

chrome.tabs.onRemoved.addListener(function (tabId) {
  delete fwTabState[tabId];
});

try {
  chrome.webRequest.onBeforeRequest.addListener(
    function (details) {
      if (details.tabId < 0) return;
      let host = '';
      try { host = new URL(details.url).hostname; } catch (e) { return; }
      const hit = fwHostLab(host);
      if (!hit) return;
      const labId = hit.lab || 'unknown';
      fwMergeNetwork(details.tabId, {
        kind: 'network',
        family: hit.lab ? 'servingHints' : 'unknownOrigin',
        label: hit.gateway ? 'Live call to a model gateway' : 'Live API call to model provider',
        severity: 'high',
        match: hit.label + ' · ' + host,
        confidence: 94,
        channel: 'network',
        origin: fwOriginFromLab(labId, { lineage: hit.gateway || hit.label })
      });
    },
    { urls: ['<all_urls>'] }
  );
} catch (e) {
  // webRequest may be unavailable in some browsers
}
