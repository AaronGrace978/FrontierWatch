// FrontierWatch popup — live page origin, alert log, lab atlas.

'use strict';

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtTime(ts) {
  return new Date(ts).toLocaleString();
}

function originBlock(o) {
  if (!o) return '';
  const unknown = o.labId === 'unknown' || /unknown/i.test(o.lab || '') || /unknown/i.test(o.country || '');
  let html = '<div class="origin-card">';
  html += '<h2>' + (unknown ? 'Lab not in the public catalog' : 'Where this model came from') + '</h2>';
  html += '<div class="lab-name">' + esc(o.lab) + '</div>';
  html += '<div class="lab-meta">' + esc(o.country);
  if (o.hq) html += ' · ' + esc(o.hq);
  if (o.weights) html += ' · ' + esc(o.weights) + ' weights';
  html += '</div>';
  if (o.lineage) html += '<div class="lab-meta">' + esc(o.lineage) + '</div>';
  if (o.status) html += '<div class="lab-meta">Status: ' + esc(o.status) + '</div>';
  if (unknown && !o.lineage) {
    html += '<div class="lab-meta">Chat templates, internal IDs, local inference, or unreleased phrasing — no public lab match.</div>';
  }
  html += '<div class="chips">';
  (o.models || []).forEach(function (m) {
    html += '<span class="chip">' + esc(m) + '</span>';
  });
  if (o.confidence) html += '<span class="chip">' + o.confidence + '% confidence</span>';
  html += '</div></div>';
  return html;
}

function findingHtml(f) {
  const sev = f.severity || 'medium';
  let html = '<div class="finding"><span class="sev ' + esc(sev) + '">' + esc(sev) + '</span>';
  if (typeof f.confidence === 'number') html += '<span class="conf">' + f.confidence + '%</span>';
  html += '<strong>' + esc(f.label) + '</strong>';
  if (f.modelName) html += ' · ' + esc(f.modelName);
  if (f.origin && f.origin.lab) html += '<br>' + esc(f.origin.lab) + ' · ' + esc(f.origin.country);
  html += '<br>' + esc(f.match) + '</div>';
  return html;
}

function renderLive(state) {
  const box = document.getElementById('liveBox');
  if (!state || !state.findings || state.findings.length === 0) {
    box.innerHTML = '<div class="empty">This page looks clean so far.<br>FrontierWatch is watching text, comments, scripts, and outbound AI API hosts — all on-device.</div>';
    return;
  }
  const parts = [];
  const top = (state.origins && state.origins[0]) || null;
  if (top) parts.push(originBlock(top));
  if (state.origins && state.origins.length > 1) {
    parts.push('<div class="lab-meta" style="padding:0 4px 8px">Also detected: ' +
      state.origins.slice(1).map(function (o) { return esc(o.lab) + ' (' + esc(o.country) + ')'; }).join(' · ') +
      '</div>');
  }
  (state.findings || []).slice(0, 12).forEach(function (f) {
    const cls = 'finding-row ' + (f.severity || 'medium');
    parts.push('<div class="' + cls + '">' + findingHtml(f).replace('class="finding"', 'class="finding" style="margin:0;border:0;background:transparent;padding:0"') + '</div>');
  });
  box.innerHTML = parts.join('');
}

function renderLog(log) {
  const list = document.getElementById('list');
  let high = 0, med = 0;
  for (const e of log) {
    if (e.severity === 'high') high++;
    else if (e.severity === 'medium') med++;
  }
  document.getElementById('statHigh').textContent = high;
  document.getElementById('statMed').textContent = med;
  document.getElementById('statPages').textContent = log.length;

  if (log.length === 0) {
    list.innerHTML = '<div class="empty">No alerts yet. Browse normally — the toolbar badge turns gold/red when a page trips a signature.</div>';
    return;
  }

  const parts = [];
  for (const e of log.slice(0, 40)) {
    const cls = e.severity === 'high' ? 'entry high' : (e.severity === 'low' ? 'entry low' : 'entry');
    let html = '<div class="' + cls + '">';
    html += '<div class="url">' + esc(e.url) + '</div>';
    html += '<div class="meta">' + esc(fmtTime(e.ts)) + ' — ' + e.count + ' finding' + (e.count === 1 ? '' : 's');
    if (e.origins && e.origins[0]) html += ' · ' + esc(e.origins[0].lab);
    html += '</div>';
    for (const f of (e.findings || []).slice(0, 4)) html += findingHtml(f);
    html += '</div>';
    parts.push(html);
  }
  list.innerHTML = parts.join('');
}

function renderAtlas(log) {
  const atlas = document.getElementById('atlas');
  const byLab = {};
  for (const e of log) {
    for (const o of (e.origins || [])) {
      if (!o.labId) continue;
      if (!byLab[o.labId]) {
        byLab[o.labId] = {
          lab: o.lab, country: o.country, hq: o.hq, weights: o.weights,
          models: [], hits: 0, confidence: 0
        };
      }
      const row = byLab[o.labId];
      row.hits += 1;
      if (o.confidence > row.confidence) row.confidence = o.confidence;
      (o.models || []).forEach(function (m) {
        if (row.models.indexOf(m) === -1) row.models.push(m);
      });
    }
  }
  const labs = Object.keys(byLab).map(function (id) { return byLab[id]; });
  labs.sort(function (a, b) { return b.hits - a.hits; });
  if (!labs.length) {
    atlas.innerHTML = '<div class="empty">No lab origins recorded yet. When a page names a frontier model or calls a provider API, it shows up here with country and HQ.</div>';
    return;
  }
  atlas.innerHTML = labs.map(function (o) {
    return originBlock({
      lab: o.lab,
      country: o.country,
      hq: o.hq,
      weights: o.weights,
      models: o.models.concat([o.hits + ' page hit' + (o.hits === 1 ? '' : 's')]),
      confidence: o.confidence
    });
  }).join('');
}

var fwHasStorage = (typeof chrome !== 'undefined') && chrome.storage && chrome.storage.local;

function loadLog(cb) {
  if (!fwHasStorage) { cb([]); return; }
  chrome.storage.local.get({ fwLog: [] }, function (data) {
    cb(data.fwLog || []);
  });
}

function loadLive() {
  if (!(typeof chrome !== 'undefined' && chrome.tabs && chrome.runtime)) {
    renderLive(null);
    return;
  }
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    const tab = tabs && tabs[0];
    if (!tab) { renderLive(null); return; }
    chrome.runtime.sendMessage({ type: 'fw_get_tab', tabId: tab.id }, function (state) {
      renderLive(state || null);
    });
  });
}

function refresh() {
  loadLog(function (log) {
    renderLog(log);
    renderAtlas(log);
  });
  loadLive();
}

document.querySelectorAll('.tabs button').forEach(function (btn) {
  btn.addEventListener('click', function () {
    document.querySelectorAll('.tabs button').forEach(function (b) { b.classList.remove('on'); });
    document.querySelectorAll('.panel').forEach(function (p) { p.classList.remove('on'); });
    btn.classList.add('on');
    const id = 'panel' + btn.getAttribute('data-tab').charAt(0).toUpperCase() + btn.getAttribute('data-tab').slice(1);
    document.getElementById(id).classList.add('on');
  });
});

document.getElementById('btnClear').addEventListener('click', function () {
  if (!fwHasStorage) { refresh(); return; }
  chrome.storage.local.set({ fwLog: [] }, refresh);
});

document.getElementById('btnExport').addEventListener('click', function () {
  if (!fwHasStorage) return;
  chrome.storage.local.get({ fwLog: [] }, function (data) {
    const blob = new Blob([JSON.stringify(data.fwLog, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'frontierwatch-log-' + Date.now() + '.json';
    a.click();
    URL.revokeObjectURL(url);
  });
});

document.getElementById('btnRescan').addEventListener('click', function () {
  if (!(typeof chrome !== 'undefined' && chrome.tabs)) return;
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    const tab = tabs && tabs[0];
    if (!tab) return;
    chrome.tabs.sendMessage(tab.id, { type: 'fw_rescan' }, function () {
      setTimeout(loadLive, 400);
    });
  });
});

refresh();
