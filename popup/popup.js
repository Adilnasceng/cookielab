/**
 * CookieLab — popup.js
 * Developer-focused cookie manager for security learning & backend testing.
 * Vanilla JS, Manifest V3, Chrome Extensions API.
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const SESSION_KEYWORDS = ['session', 'token', 'auth', 'jwt', 'sid', 'access', 'refresh', 'bearer', 'login', 'csrf', 'xsrf'];

const SAMESITE_LABELS = {
  strict:         'Strict',
  lax:            'Lax',
  no_restriction: 'None',
  unspecified:    '?'
};

// ═══════════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════════

let currentUrl    = '';
let currentDomain = '';
let allCookies    = [];
let searchQuery   = '';
let editingRow    = null; // currently in-edit cookie name

// ═══════════════════════════════════════════════════════════════════════════════
// INITIALISATION
// ═══════════════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
  initTabs();
  initCookiesTab();
  initJwtTab();
  initSnapshotsTab();
  initSecurityTab();

  await loadCurrentTab();
  await refreshCookies();
});

// ═══════════════════════════════════════════════════════════════════════════════
// TAB MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `tab-${tabId}`));

  // Refresh data when switching to security tab
  if (tabId === 'security') renderSecurityTab();
  if (tabId === 'snapshots') renderSnapshotsList();
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHROME API HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function fetchCookies(url) {
  return new Promise(resolve => {
    chrome.cookies.getAll({ url }, cookies => {
      resolve(cookies || []);
    });
  });
}

async function saveCookie(details) {
  return new Promise((resolve, reject) => {
    chrome.cookies.set(details, cookie => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(cookie);
    });
  });
}

async function deleteCookie(url, name) {
  return new Promise((resolve, reject) => {
    chrome.cookies.remove({ url, name }, result => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(result);
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOAD CURRENT TAB & COOKIES
// ═══════════════════════════════════════════════════════════════════════════════

async function loadCurrentTab() {
  try {
    const tab = await getCurrentTab();
    if (!tab || !tab.url) {
      setDomainDisplay('(no active tab)', '');
      return;
    }
    const url = new URL(tab.url);
    currentUrl    = tab.url;
    currentDomain = url.hostname;
    setDomainDisplay(currentDomain, currentUrl);
  } catch {
    setDomainDisplay('(unavailable)', '');
  }
}

function setDomainDisplay(domain, url) {
  const el = document.getElementById('domainValue');
  el.textContent = domain || url || '—';
  el.title       = url;
}

async function refreshCookies() {
  if (!currentUrl) return;
  allCookies = await fetchCookies(currentUrl);
  document.getElementById('cookieCount').textContent = `${allCookies.length} cookie${allCookies.length !== 1 ? 's' : ''}`;
  renderCookieTable();
}

// ═══════════════════════════════════════════════════════════════════════════════
// COOKIES TAB
// ═══════════════════════════════════════════════════════════════════════════════

function initCookiesTab() {
  document.getElementById('refreshBtn').addEventListener('click', async () => {
    await refreshCookies();
    showToast('Cookies refreshed', 'info');
  });

  document.getElementById('searchInput').addEventListener('input', e => {
    searchQuery = e.target.value.trim().toLowerCase();
    renderCookieTable();
  });

  document.getElementById('addCookieBtn').addEventListener('click', toggleAddForm);
  document.getElementById('cancelAddBtn').addEventListener('click', hideAddForm);
  document.getElementById('confirmAddBtn').addEventListener('click', handleAddCookie);
  document.getElementById('deleteAllBtn').addEventListener('click', handleDeleteAll);
}

// ─── Cookie Table Rendering ───────────────────────────────────────────────────

function renderCookieTable() {
  const tbody  = document.getElementById('cookieTableBody');
  const empty  = document.getElementById('cookieEmptyState');
  const table  = document.getElementById('cookieTable');

  const filtered = allCookies.filter(c =>
    !searchQuery ||
    c.name.toLowerCase().includes(searchQuery) ||
    c.value.toLowerCase().includes(searchQuery)
  );

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    empty.classList.remove('hidden');
    table.classList.add('hidden');
    return;
  }

  empty.classList.add('hidden');
  table.classList.remove('hidden');

  // Sort: session tokens first, then alphabetical
  const sorted = [...filtered].sort((a, b) => {
    const aS = isSessionToken(a.name) ? 0 : 1;
    const bS = isSessionToken(b.name) ? 0 : 1;
    if (aS !== bS) return aS - bS;
    return a.name.localeCompare(b.name);
  });

  tbody.innerHTML = '';
  sorted.forEach(cookie => tbody.appendChild(buildCookieRow(cookie)));
}

function buildCookieRow(cookie) {
  const tr = document.createElement('tr');
  const isSession  = isSessionToken(cookie.name);
  const isDisabled = cookie.value === '' && cookie._wasDisabled;

  if (isSession)  tr.classList.add('session-row');
  if (isDisabled) tr.classList.add('disabled-row');
  tr.dataset.name = cookie.name;

  // ── Name cell ──
  const tdName = document.createElement('td');
  tdName.className = 'col-name';
  const nameWrap = document.createElement('div');
  nameWrap.className = 'cell-name';
  if (isSession) {
    const keyIcon = document.createElement('span');
    keyIcon.className = 'key-icon';
    keyIcon.textContent = '🔑';
    nameWrap.appendChild(keyIcon);
  }
  const nameSpan = document.createElement('span');
  nameSpan.className = 'cell-truncate';
  nameSpan.textContent = cookie.name;
  nameSpan.title = cookie.name;
  nameWrap.appendChild(nameSpan);
  tdName.appendChild(nameWrap);

  // ── Value cell ──
  const tdValue = document.createElement('td');
  tdValue.className = 'col-value';
  if (cookie.httpOnly) {
    const span = document.createElement('span');
    span.className = 'http-only-value';
    span.textContent = '[httpOnly]';
    span.title = 'HttpOnly cookies cannot be read by JavaScript';
    tdValue.appendChild(span);
  } else {
    const span = document.createElement('span');
    span.className = 'cell-value';
    span.textContent = truncate(cookie.value, 20);
    span.title = 'Click to view full value';
    span.addEventListener('click', () => openValueModal(cookie));
    tdValue.appendChild(span);
    if (isDisabled) {
      const badge = document.createElement('span');
      badge.className = 'disabled-badge';
      badge.textContent = 'OFF';
      tdValue.appendChild(badge);
    }
  }

  // ── Domain cell ──
  const tdDomain = document.createElement('td');
  tdDomain.className = 'col-domain';
  const domSpan = document.createElement('span');
  domSpan.className = 'cell-truncate text-muted';
  domSpan.textContent = cookie.domain;
  domSpan.title = cookie.domain;
  tdDomain.appendChild(domSpan);

  // ── Path cell ──
  const tdPath = document.createElement('td');
  tdPath.className = 'col-path';
  const pathSpan = document.createElement('span');
  pathSpan.className = 'cell-truncate text-muted';
  pathSpan.textContent = cookie.path;
  pathSpan.title = cookie.path;
  tdPath.appendChild(pathSpan);

  // ── Expires cell ──
  const tdExp = document.createElement('td');
  tdExp.className = 'col-exp';
  const { text: expText, cls: expCls } = formatExpiry(cookie.expirationDate, cookie.session);
  const expSpan = document.createElement('span');
  expSpan.className = expCls;
  expSpan.textContent = expText;
  tdExp.appendChild(expSpan);

  // ── Flags cell ──
  const tdFlags = document.createElement('td');
  tdFlags.className = 'col-flags';
  const flagsDiv = document.createElement('div');
  flagsDiv.className = 'flags';
  flagsDiv.appendChild(makeFlagBadge(cookie.secure   ? 'S'   : '!S',  cookie.secure   ? 'ok'      : 'warn', cookie.secure ? 'Secure' : 'Not Secure'));
  flagsDiv.appendChild(makeFlagBadge(cookie.httpOnly ? 'H'   : '!H',  cookie.httpOnly ? 'ok'      : 'warn', cookie.httpOnly ? 'HttpOnly' : 'No HttpOnly'));
  const ssLabel = SAMESITE_LABELS[cookie.sameSite] || '?';
  const ssCls   = cookie.sameSite === 'strict' ? 'ok' : cookie.sameSite === 'lax' ? 'info' : cookie.sameSite === 'no_restriction' ? 'danger' : 'neutral';
  flagsDiv.appendChild(makeFlagBadge(ssLabel, ssCls, `SameSite=${ssLabel}`));
  tdFlags.appendChild(flagsDiv);

  // ── Actions cell ──
  const tdAct = document.createElement('td');
  tdAct.className = 'col-act';
  const actDiv = document.createElement('div');
  actDiv.className = 'row-actions';

  // Copy button
  const copyBtn = makeIconBtn('📋', 'Copy value', 'success', () => {
    copyToClipboard(cookie.value);
    showToast(`Copied "${cookie.name}"`, 'success');
  });
  actDiv.appendChild(copyBtn);

  // Send to JWT (only if looks like JWT or is session-like)
  if (looksLikeJWT(cookie.value) || isSession) {
    const jwtBtn = makeIconBtn('🔐', 'Send to JWT Decoder', '', () => {
      document.getElementById('jwtInput').value = cookie.value;
      switchTab('jwt');
      decodeAndRenderJWT(cookie.value);
    });
    actDiv.appendChild(jwtBtn);
  }

  // Edit button
  const editBtn = makeIconBtn('✏️', 'Edit cookie', '', () => startInlineEdit(tr, cookie));
  actDiv.appendChild(editBtn);

  // Toggle (disable/enable) button — skip for httpOnly
  if (!cookie.httpOnly) {
    const isOff = cookie._wasDisabled || cookie.value === '';
    const toggleBtn = makeIconBtn(isOff ? '✅' : '🚫', isOff ? 'Enable cookie' : 'Disable cookie', '', () => handleToggleCookie(cookie));
    actDiv.appendChild(toggleBtn);
  }

  // Delete button
  const delBtn = makeIconBtn('🗑', 'Delete cookie', 'danger', async () => {
    await handleDeleteCookie(cookie);
  });
  actDiv.appendChild(delBtn);

  tdAct.appendChild(actDiv);

  tr.append(tdName, tdValue, tdDomain, tdPath, tdExp, tdFlags, tdAct);
  return tr;
}

function makeFlagBadge(text, cls, title) {
  const span = document.createElement('span');
  span.className = `flag flag-${cls}`;
  span.textContent = text;
  span.title = title;
  return span;
}

function makeIconBtn(icon, title, extraClass, onClick) {
  const btn = document.createElement('button');
  btn.className = `btn-icon${extraClass ? ' ' + extraClass : ''}`;
  btn.textContent = icon;
  btn.title = title;
  btn.addEventListener('click', onClick);
  return btn;
}

// ─── Inline Edit ─────────────────────────────────────────────────────────────

function startInlineEdit(tr, cookie) {
  if (editingRow) cancelInlineEdit();
  editingRow = cookie.name;
  tr.classList.add('edit-row');

  const cells = tr.querySelectorAll('td');

  // Name
  cells[0].innerHTML = '';
  cells[0].appendChild(makeEditInput(cookie.name, 'edit-name'));

  // Value (skip if httpOnly)
  cells[1].innerHTML = '';
  if (cookie.httpOnly) {
    const span = document.createElement('span');
    span.className = 'http-only-value';
    span.textContent = '[httpOnly — no edit]';
    cells[1].appendChild(span);
  } else {
    cells[1].appendChild(makeEditInput(cookie.value, 'edit-value'));
  }

  // Domain
  cells[2].innerHTML = '';
  cells[2].appendChild(makeEditInput(cookie.domain, 'edit-domain'));

  // Path
  cells[3].innerHTML = '';
  cells[3].appendChild(makeEditInput(cookie.path, 'edit-path'));

  // Expires — replace with a number input (days)
  cells[4].innerHTML = '';
  const expInput = makeEditInput(
    cookie.expirationDate ? Math.max(0, Math.round((cookie.expirationDate * 1000 - Date.now()) / 86400000)) : '',
    'edit-expires'
  );
  expInput.type = 'number';
  expInput.placeholder = 'days';
  expInput.min = '0';
  cells[4].appendChild(expInput);

  // Flags — replace with save/cancel
  cells[5].innerHTML = '';
  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn btn-primary';
  saveBtn.style.fontSize = '10px';
  saveBtn.style.padding = '3px 7px';
  saveBtn.textContent = '💾';
  saveBtn.title = 'Save changes';
  saveBtn.addEventListener('click', () => saveInlineEdit(tr, cookie));
  cells[5].appendChild(saveBtn);

  // Actions — replace with cancel
  cells[6].innerHTML = '';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn';
  cancelBtn.style.fontSize = '10px';
  cancelBtn.style.padding = '3px 7px';
  cancelBtn.textContent = '✕';
  cancelBtn.title = 'Cancel edit';
  cancelBtn.addEventListener('click', cancelInlineEdit);
  cells[6].appendChild(cancelBtn);
}

function makeEditInput(value, id) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'edit-input';
  input.id = id;
  input.value = value;
  input.spellcheck = false;
  input.autocomplete = 'off';
  return input;
}

async function saveInlineEdit(tr, originalCookie) {
  const newName   = tr.querySelector('#edit-name')?.value.trim()   || originalCookie.name;
  const newValue  = tr.querySelector('#edit-value')?.value         ?? originalCookie.value;
  const newDomain = tr.querySelector('#edit-domain')?.value.trim() || originalCookie.domain;
  const newPath   = tr.querySelector('#edit-path')?.value.trim()   || originalCookie.path;
  const expiresIn = tr.querySelector('#edit-expires')?.value;

  const details = buildCookieDetails({
    url:        currentUrl,
    name:       newName,
    value:      newValue,
    domain:     newDomain,
    path:       newPath,
    secure:     originalCookie.secure,
    httpOnly:   originalCookie.httpOnly,
    sameSite:   originalCookie.sameSite,
    expiresIn:  expiresIn !== '' ? Number(expiresIn) : null,
    session:    originalCookie.session
  });

  try {
    // Delete old if name changed
    if (newName !== originalCookie.name) {
      await deleteCookie(currentUrl, originalCookie.name);
    }
    await saveCookie(details);
    showToast(`Saved "${newName}"`, 'success');
    editingRow = null;
    await refreshCookies();
  } catch (err) {
    showToast(`Save failed: ${err.message}`, 'error');
  }
}

function cancelInlineEdit() {
  editingRow = null;
  renderCookieTable();
}

// ─── Add Cookie ───────────────────────────────────────────────────────────────

function toggleAddForm() {
  const form = document.getElementById('addCookieForm');
  const isVisible = form.classList.contains('visible');
  if (isVisible) {
    hideAddForm();
  } else {
    form.classList.add('visible');
    document.getElementById('newDomain').placeholder = currentDomain || 'example.com';
    document.getElementById('newName').focus();
  }
}

function hideAddForm() {
  const form = document.getElementById('addCookieForm');
  form.classList.remove('visible');
  // Clear fields
  ['newName','newValue','newDomain','newPath','newExpires'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('newSameSite').value = 'lax';
  document.getElementById('newSecure').checked   = false;
  document.getElementById('newHttpOnly').checked  = false;
}

async function handleAddCookie() {
  const name     = document.getElementById('newName').value.trim();
  const value    = document.getElementById('newValue').value;
  const domain   = document.getElementById('newDomain').value.trim() || currentDomain;
  const path     = document.getElementById('newPath').value.trim()   || '/';
  const expires  = document.getElementById('newExpires').value;
  const sameSite = document.getElementById('newSameSite').value;
  const secure   = document.getElementById('newSecure').checked;
  const httpOnly = document.getElementById('newHttpOnly').checked;

  if (!name) {
    showToast('Cookie name is required', 'error');
    return;
  }

  const details = buildCookieDetails({
    url:       currentUrl,
    name,
    value,
    domain,
    path,
    secure,
    httpOnly,
    sameSite,
    expiresIn: expires !== '' ? Number(expires) : null,
    session:   expires === ''
  });

  try {
    await saveCookie(details);
    showToast(`Added cookie "${name}"`, 'success');
    hideAddForm();
    await refreshCookies();
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

// ─── Delete ───────────────────────────────────────────────────────────────────

async function handleDeleteCookie(cookie) {
  try {
    await deleteCookie(currentUrl, cookie.name);
    showToast(`Deleted "${cookie.name}"`, 'info');
    await refreshCookies();
  } catch (err) {
    showToast(`Delete failed: ${err.message}`, 'error');
  }
}

async function handleDeleteAll() {
  if (!currentUrl || allCookies.length === 0) return;
  const confirm = window.confirm(`Delete ALL ${allCookies.length} cookie(s) for this domain?`);
  if (!confirm) return;
  for (const c of allCookies) {
    try { await deleteCookie(currentUrl, c.name); } catch {}
  }
  showToast(`Deleted ${allCookies.length} cookies`, 'info');
  await refreshCookies();
}

// ─── Toggle (Disable / Enable) ───────────────────────────────────────────────

async function handleToggleCookie(cookie) {
  const storageKey = `toggle_${cookie.domain}_${cookie.name}`;

  if (cookie.value !== '') {
    // Disable: store original value, set to empty
    const store = {};
    store[storageKey] = cookie.value;
    await chrome.storage.session.set(store);

    const details = buildCookieDetails({
      url:      currentUrl,
      name:     cookie.name,
      value:    '',
      domain:   cookie.domain,
      path:     cookie.path,
      secure:   cookie.secure,
      httpOnly: cookie.httpOnly,
      sameSite: cookie.sameSite,
      session:  cookie.session,
      expiresIn: cookie.expirationDate
        ? Math.round((cookie.expirationDate * 1000 - Date.now()) / 86400000)
        : null
    });
    try {
      await saveCookie(details);
      showToast(`Disabled "${cookie.name}"`, 'info');
    } catch (err) {
      showToast(`Toggle failed: ${err.message}`, 'error');
    }
  } else {
    // Enable: restore original value
    const stored = await chrome.storage.session.get(storageKey);
    const originalValue = stored[storageKey] ?? '';
    await chrome.storage.session.remove(storageKey);

    const details = buildCookieDetails({
      url:      currentUrl,
      name:     cookie.name,
      value:    originalValue,
      domain:   cookie.domain,
      path:     cookie.path,
      secure:   cookie.secure,
      httpOnly: cookie.httpOnly,
      sameSite: cookie.sameSite,
      session:  cookie.session,
      expiresIn: cookie.expirationDate
        ? Math.round((cookie.expirationDate * 1000 - Date.now()) / 86400000)
        : null
    });
    try {
      await saveCookie(details);
      showToast(`Enabled "${cookie.name}"`, 'success');
    } catch (err) {
      showToast(`Toggle failed: ${err.message}`, 'error');
    }
  }
  await refreshCookies();
}

// ─── Value Modal ─────────────────────────────────────────────────────────────

function openValueModal(cookie) {
  const modal   = document.getElementById('valueModal');
  const title   = document.getElementById('valueModalTitle');
  const body    = document.getElementById('valueModalBody');
  const copyBtn = document.getElementById('valueCopyBtn');
  const jwtBtn  = document.getElementById('valueJwtBtn');
  const b64Btn  = document.getElementById('valueB64Btn');

  title.textContent = `Cookie: ${cookie.name}`;
  body.textContent  = cookie.value;

  copyBtn.onclick = () => {
    copyToClipboard(cookie.value);
    showToast('Copied!', 'success');
  };

  // JWT button
  if (looksLikeJWT(cookie.value)) {
    jwtBtn.classList.remove('hidden');
    jwtBtn.onclick = () => {
      document.getElementById('jwtInput').value = cookie.value;
      closeModal('valueModal');
      switchTab('jwt');
      decodeAndRenderJWT(cookie.value);
    };
  } else {
    jwtBtn.classList.add('hidden');
  }

  // Base64 button
  if (looksLikeBase64(cookie.value) && !looksLikeJWT(cookie.value)) {
    b64Btn.classList.remove('hidden');
    b64Btn.onclick = () => {
      closeModal('valueModal');
      openBase64Modal(cookie.value);
    };
  } else {
    b64Btn.classList.add('hidden');
  }

  document.getElementById('valueCloseBtn').onclick = () => closeModal('valueModal');
  modal.classList.add('visible');
  modal.addEventListener('click', e => { if (e.target === modal) closeModal('valueModal'); });
}

function openBase64Modal(value) {
  const modal = document.getElementById('b64Modal');
  const body  = document.getElementById('b64ModalBody');
  try {
    const decoded = decodeBase64Safe(value);
    body.textContent = decoded;
  } catch {
    body.textContent = '(Could not decode — not valid Base64)';
  }
  document.getElementById('b64CopyBtn').onclick = () => {
    copyToClipboard(body.textContent);
    showToast('Copied decoded value', 'success');
  };
  document.getElementById('b64CloseBtn').onclick = () => closeModal('b64Modal');
  modal.classList.add('visible');
  modal.addEventListener('click', e => { if (e.target === modal) closeModal('b64Modal'); });
}

function closeModal(id) {
  document.getElementById(id).classList.remove('visible');
}

// ═══════════════════════════════════════════════════════════════════════════════
// JWT DECODER TAB
// ═══════════════════════════════════════════════════════════════════════════════

function initJwtTab() {
  document.getElementById('jwtDecodeBtn').addEventListener('click', () => {
    const val = document.getElementById('jwtInput').value.trim();
    if (val) decodeAndRenderJWT(val);
    else showToast('Paste a JWT token first', 'error');
  });

  document.getElementById('jwtClipboardBtn').addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      document.getElementById('jwtInput').value = text;
      decodeAndRenderJWT(text);
    } catch {
      showToast('Clipboard access denied', 'error');
    }
  });

  document.getElementById('jwtClearBtn').addEventListener('click', () => {
    document.getElementById('jwtInput').value = '';
    setJwtStatus('empty');
    showJwtSections(false);
    document.getElementById('jwtEmpty').classList.remove('hidden');
  });

  document.getElementById('jwtInput').addEventListener('input', e => {
    const val = e.target.value.trim();
    if (!val) { setJwtStatus('empty'); showJwtSections(false); document.getElementById('jwtEmpty').classList.remove('hidden'); return; }
    if (looksLikeJWT(val)) setJwtStatus('valid');
    else setJwtStatus('invalid');
  });

  document.getElementById('jwtCopySigBtn').addEventListener('click', () => {
    const sig = document.getElementById('jwtSigBox').textContent;
    copyToClipboard(sig);
    showToast('Signature copied', 'success');
  });
}

function decodeAndRenderJWT(token) {
  token = token.trim();
  const result = decodeJWT(token);

  if (!result) {
    setJwtStatus('invalid');
    showJwtSections(false);
    document.getElementById('jwtEmpty').classList.remove('hidden');
    showToast('Not a valid JWT', 'error');
    return;
  }

  setJwtStatus('valid');
  document.getElementById('jwtEmpty').classList.add('hidden');
  showJwtSections(true);

  // Header
  document.getElementById('jwtHeaderBox').innerHTML = syntaxHighlightJSON(result.header);

  // Payload
  document.getElementById('jwtPayloadBox').innerHTML = syntaxHighlightJSON(result.payload);

  // exp badge
  const expBadge = document.getElementById('jwtExpBadge');
  if (result.payload.exp) {
    const expMs   = result.payload.exp * 1000;
    const diffSec = Math.round((expMs - Date.now()) / 1000);
    if (diffSec < 0) {
      const ago = humanizeDuration(-diffSec);
      expBadge.textContent = `Expired ${ago} ago`;
      expBadge.className   = 'jwt-exp-badge expired';
    } else {
      const left = humanizeDuration(diffSec);
      expBadge.textContent = `Expires in ${left}`;
      expBadge.className   = 'jwt-exp-badge valid';
    }
  } else {
    expBadge.textContent = 'No exp claim';
    expBadge.className   = 'jwt-exp-badge none';
  }

  // Signature
  document.getElementById('jwtSigBox').textContent = result.signature;
}

function decodeJWT(token) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const decode = str => JSON.parse(atob(str.replace(/-/g, '+').replace(/_/g, '/')));
    return {
      header:    decode(parts[0]),
      payload:   decode(parts[1]),
      signature: parts[2]
    };
  } catch {
    return null;
  }
}

function setJwtStatus(state) {
  const el = document.getElementById('jwtStatus');
  const map = {
    valid:   { text: '✓ Valid JWT',    cls: 'valid'   },
    invalid: { text: '✗ Invalid',      cls: 'invalid' },
    empty:   { text: 'Waiting…',       cls: 'empty'   }
  };
  const s = map[state] || map.empty;
  el.textContent = s.text;
  el.className   = `jwt-status ${s.cls}`;
}

function showJwtSections(show) {
  ['jwtHeaderSection', 'jwtPayloadSection', 'jwtSigSection'].forEach(id => {
    document.getElementById(id).classList.toggle('hidden', !show);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SNAPSHOTS TAB
// ═══════════════════════════════════════════════════════════════════════════════

function initSnapshotsTab() {
  document.getElementById('saveSnapshotBtn').addEventListener('click', handleSaveSnapshot);
  document.getElementById('exportCookiesBtn').addEventListener('click', handleExportCookies);
  document.getElementById('importCookiesBtn').addEventListener('click', () => {
    document.getElementById('importFileInput').click();
  });
  document.getElementById('importFileInput').addEventListener('change', handleImportCookies);

  document.getElementById('snapshotNameInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleSaveSnapshot();
  });
}

async function handleSaveSnapshot() {
  const nameInput = document.getElementById('snapshotNameInput');
  const name = nameInput.value.trim() || `Snapshot ${new Date().toLocaleTimeString()}`;

  if (!currentUrl) { showToast('No active tab to snapshot', 'error'); return; }

  const cookies   = await fetchCookies(currentUrl);
  const snapshots = await getSnapshots();

  snapshots[name] = {
    name,
    cookies,
    url:       currentUrl,
    domain:    currentDomain,
    timestamp: Date.now()
  };

  await chrome.storage.local.set({ snapshots });
  nameInput.value = '';
  showToast(`Snapshot "${name}" saved (${cookies.length} cookies)`, 'success');
  renderSnapshotsList();
}

async function getSnapshots() {
  const result = await chrome.storage.local.get('snapshots');
  return result.snapshots || {};
}

async function renderSnapshotsList() {
  const snapshots  = await getSnapshots();
  const list       = document.getElementById('snapshotsList');
  const emptyState = document.getElementById('snapshotsEmptyState');
  const entries    = Object.values(snapshots).sort((a, b) => b.timestamp - a.timestamp);

  // Sadece dinamik öğeleri temizle — emptyState'e dokunma
  const clearDynamic = () => {
    Array.from(list.children).forEach(child => {
      if (child.id !== 'snapshotsEmptyState') child.remove();
    });
  };

  if (entries.length === 0) {
    clearDynamic();
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  clearDynamic();

  entries.forEach(snap => {
    const item = document.createElement('div');
    item.className = 'snapshot-item';

    const info = document.createElement('div');
    info.className = 'snapshot-info';

    const nameEl = document.createElement('div');
    nameEl.className = 'snapshot-name';
    nameEl.textContent = snap.name || 'Unnamed Snapshot';

    const meta = document.createElement('div');
    meta.className = 'snapshot-meta';
    meta.textContent = `${snap.cookies?.length ?? 0} cookies · ${snap.domain ?? snap.url} · ${new Date(snap.timestamp).toLocaleString()}`;

    info.append(nameEl, meta);

    const actions = document.createElement('div');
    actions.className = 'snapshot-actions';

    const restoreBtn = document.createElement('button');
    restoreBtn.className = 'btn btn-primary';
    restoreBtn.style.fontSize = '10px';
    restoreBtn.textContent = '↩ Restore';
    restoreBtn.addEventListener('click', () => handleRestoreSnapshot(snap));

    const exportBtn = document.createElement('button');
    exportBtn.className = 'btn';
    exportBtn.style.fontSize = '10px';
    exportBtn.textContent = '⬇';
    exportBtn.title = 'Export this snapshot';
    exportBtn.addEventListener('click', () => downloadJSON(snap.cookies, `cookielab-snap-${snap.name}.json`));

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn-danger';
    deleteBtn.style.fontSize = '10px';
    deleteBtn.textContent = '🗑';
    deleteBtn.title = 'Delete snapshot';
    deleteBtn.addEventListener('click', () => handleDeleteSnapshot(snap.name));

    actions.append(restoreBtn, exportBtn, deleteBtn);
    item.append(info, actions);
    list.appendChild(item);
  });
}

async function handleRestoreSnapshot(snap) {
  if (!currentUrl) { showToast('No active tab', 'error'); return; }

  const ok = window.confirm(`Restore snapshot "${snap.name}"?\nThis will overwrite current cookies for this domain.`);
  if (!ok) return;

  // Delete current cookies
  const current = await fetchCookies(currentUrl);
  for (const c of current) {
    try { await deleteCookie(currentUrl, c.name); } catch {}
  }

  // Re-set snapshot cookies
  let restored = 0;
  for (const c of (snap.cookies || [])) {
    try {
      const expiresIn = c.expirationDate
        ? Math.round((c.expirationDate * 1000 - Date.now()) / 86400000)
        : null;
      const details = buildCookieDetails({
        url:       currentUrl,
        name:      c.name,
        value:     c.value,
        domain:    c.domain,
        path:      c.path,
        secure:    c.secure,
        httpOnly:  c.httpOnly,
        sameSite:  c.sameSite,
        session:   c.session,
        expiresIn: expiresIn !== null && expiresIn > 0 ? expiresIn : null
      });
      await saveCookie(details);
      restored++;
    } catch {}
  }

  showToast(`Restored ${restored}/${snap.cookies.length} cookies`, 'success');
  await refreshCookies();
  switchTab('cookies');
}

async function handleDeleteSnapshot(name) {
  const snapshots = await getSnapshots();
  delete snapshots[name];
  await chrome.storage.local.set({ snapshots });
  showToast(`Snapshot "${name}" deleted`, 'info');
  renderSnapshotsList();
}

function handleExportCookies() {
  if (!allCookies.length) { showToast('No cookies to export', 'error'); return; }
  downloadJSON(allCookies, `cookielab-${currentDomain}-${Date.now()}.json`);
  showToast(`Exported ${allCookies.length} cookies`, 'success');
}

function handleImportCookies(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async evt => {
    try {
      const cookies = JSON.parse(evt.target.result);
      if (!Array.isArray(cookies)) throw new Error('Expected a JSON array');

      let imported = 0;
      for (const c of cookies) {
        if (!c.name) continue;
        const expiresIn = c.expirationDate
          ? Math.round((c.expirationDate * 1000 - Date.now()) / 86400000)
          : null;
        try {
          await saveCookie(buildCookieDetails({
            url:       currentUrl,
            name:      c.name,
            value:     c.value || '',
            domain:    c.domain || currentDomain,
            path:      c.path  || '/',
            secure:    c.secure    || false,
            httpOnly:  c.httpOnly  || false,
            sameSite:  c.sameSite  || 'lax',
            session:   c.session,
            expiresIn: expiresIn !== null && expiresIn > 0 ? expiresIn : null
          }));
          imported++;
        } catch {}
      }

      showToast(`Imported ${imported}/${cookies.length} cookies`, 'success');
      await refreshCookies();
      switchTab('cookies');
    } catch (err) {
      showToast(`Import failed: ${err.message}`, 'error');
    }
    e.target.value = '';
  };
  reader.readAsText(file);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECURITY TAB
// ═══════════════════════════════════════════════════════════════════════════════

function initSecurityTab() {
  document.getElementById('refreshSecurityBtn').addEventListener('click', () => {
    refreshCookies().then(renderSecurityTab);
    showToast('Security analysis updated', 'info');
  });
}

function renderSecurityTab() {
  const analyzed = analyzeSecurityFlags(allCookies);
  const list     = document.getElementById('securityList');
  const empty    = document.getElementById('securityEmptyState');

  // Summary counts
  const dangers  = analyzed.reduce((n, a) => n + a.issues.filter(i => i.level === 'danger').length,  0);
  const warnings = analyzed.reduce((n, a) => n + a.issues.filter(i => i.level === 'warning').length, 0);
  const clean    = analyzed.filter(a => a.issues.length === 0).length;
  const total    = dangers + warnings;

  document.getElementById('securityScoreNum').textContent  = total;
  document.getElementById('statDangers').textContent       = `${dangers} critical issue${dangers !== 1 ? 's' : ''}`;
  document.getElementById('statWarnings').textContent      = `${warnings} warning${warnings !== 1 ? 's' : ''}`;
  document.getElementById('statOk').textContent            = `${clean} cookie${clean !== 1 ? 's' : ''} clean`;

  const badge = document.getElementById('securityScoreBadge');
  badge.className = `security-score-badge ${total === 0 ? 'score-ok' : dangers > 0 ? 'score-danger' : 'score-warning'}`;

  // Sadece dinamik öğeleri temizle — emptyState'e dokunma
  const clearDynamic = () => {
    Array.from(list.children).forEach(child => {
      if (child.id !== 'securityEmptyState') child.remove();
    });
  };

  if (allCookies.length === 0) {
    clearDynamic();
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  clearDynamic();

  // Sort: most issues first
  analyzed.sort((a, b) => {
    const aD = a.issues.filter(i => i.level === 'danger').length;
    const bD = b.issues.filter(i => i.level === 'danger').length;
    if (aD !== bD) return bD - aD;
    return b.issues.length - a.issues.length;
  });

  analyzed.forEach(({ cookie, issues }) => {
    const item = document.createElement('div');
    const hasDanger  = issues.some(i => i.level === 'danger');
    const hasWarning = issues.some(i => i.level === 'warning');
    item.className = 'security-item ' + (hasDanger ? 'has-danger' : hasWarning ? 'has-warning' : 'has-ok');

    const header = document.createElement('div');
    header.className = 'security-item-header';

    const nameEl = document.createElement('div');
    nameEl.className = 'security-item-name';
    if (isSessionToken(cookie.name)) {
      nameEl.textContent = '🔑 ' + cookie.name;
    } else {
      nameEl.textContent = cookie.name;
    }

    // Issue icon summary
    const icons = document.createElement('div');
    icons.className = 'security-item-icons';
    const dangers  = issues.filter(i => i.level === 'danger');
    const warnings = issues.filter(i => i.level === 'warning');
    if (dangers.length)  icons.innerHTML += `<span title="${dangers.length} critical">🔴</span>`;
    if (warnings.length) icons.innerHTML += `<span title="${warnings.length} warnings">⚠️</span>`;
    if (!issues.length)  icons.innerHTML += `<span title="No issues">✅</span>`;

    const chevron = document.createElement('span');
    chevron.className = 'security-chevron';
    chevron.textContent = '›';

    header.append(nameEl, icons, chevron);
    header.addEventListener('click', () => item.classList.toggle('expanded'));

    // Issues list
    const issuesDiv = document.createElement('div');
    issuesDiv.className = 'security-issues';

    if (issues.length === 0) {
      const row = document.createElement('div');
      row.className = 'issue-row';
      row.innerHTML = '<span class="issue-icon">✅</span><span class="issue-msg ok">No security issues found</span>';
      issuesDiv.appendChild(row);
    } else {
      issues.forEach(issue => {
        const row = document.createElement('div');
        row.className = 'issue-row';
        const icon = issue.level === 'danger' ? '🔴' : '⚠️';
        row.innerHTML = `<span class="issue-icon">${icon}</span><span class="issue-msg ${issue.level}">${escapeHtml(issue.msg)}</span>`;
        issuesDiv.appendChild(row);
      });
    }

    // Cookie details
    const detailRow = document.createElement('div');
    detailRow.className = 'issue-row';
    detailRow.style.marginTop = '4px';
    detailRow.style.borderTop = '1px solid var(--border)';
    detailRow.style.paddingTop = '4px';
    detailRow.style.color = 'var(--text-muted)';
    detailRow.style.fontSize = '10px';
    detailRow.textContent = `Domain: ${cookie.domain} | Path: ${cookie.path} | SameSite: ${SAMESITE_LABELS[cookie.sameSite] || '?'}`;
    issuesDiv.appendChild(detailRow);

    item.append(header, issuesDiv);
    list.appendChild(item);
  });
}

function analyzeSecurityFlags(cookies) {
  return cookies.map(cookie => {
    const issues    = [];
    const sensitive = isSessionToken(cookie.name);

    if (!cookie.secure) {
      issues.push({
        level: sensitive ? 'danger' : 'warning',
        msg:   sensitive
          ? `Missing Secure flag on sensitive cookie "${cookie.name}"`
          : 'Missing Secure flag — cookie sent over HTTP'
      });
    }

    if (!cookie.httpOnly && sensitive) {
      issues.push({
        level: 'danger',
        msg:   `Missing HttpOnly flag — "${cookie.name}" accessible via JS (XSS risk)`
      });
    }

    if (cookie.sameSite === 'no_restriction' && !cookie.secure) {
      issues.push({
        level: 'danger',
        msg:   'SameSite=None requires Secure flag (CSRF risk)'
      });
    }

    if (cookie.sameSite === 'no_restriction' && sensitive) {
      issues.push({
        level: 'warning',
        msg:   'SameSite=None on sensitive cookie allows cross-site requests'
      });
    }

    if (cookie.expirationDate) {
      const days = (cookie.expirationDate * 1000 - Date.now()) / 86400000;
      if (days < 0) {
        issues.push({ level: 'warning', msg: 'Cookie has already expired' });
      } else if (days > 365 && sensitive) {
        issues.push({ level: 'warning', msg: `Very long expiry: ${Math.floor(days)} days — consider shorter session lifetime` });
      } else if (days > 730) {
        issues.push({ level: 'warning', msg: `Long expiry: ${Math.floor(days)} days` });
      }
    }

    return { cookie, issues };
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function isSessionToken(name) {
  const lower = name.toLowerCase();
  return SESSION_KEYWORDS.some(kw => lower.includes(kw));
}

function looksLikeJWT(value) {
  if (!value || typeof value !== 'string') return false;
  const parts = value.split('.');
  if (parts.length !== 3) return false;
  return parts.every(p => /^[A-Za-z0-9+/\-_]+=*$/.test(p) && p.length > 2);
}

function looksLikeBase64(value) {
  if (!value || value.length < 8) return false;
  return /^[A-Za-z0-9+/\-_]+=*$/.test(value) && value.length % 4 !== 1;
}

function decodeBase64Safe(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  return decodeURIComponent(
    atob(normalized).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
  );
}

function buildCookieDetails({ url, name, value, domain, path, secure, httpOnly, sameSite, session, expiresIn }) {
  const details = {
    url,
    name,
    value:    value ?? '',
    domain:   domain || undefined,
    path:     path   || '/',
    secure:   !!secure,
    httpOnly: !!httpOnly,
    sameSite: sameSite || 'lax'
  };

  if (!session && expiresIn != null && expiresIn >= 0) {
    details.expirationDate = Math.round((Date.now() / 1000) + expiresIn * 86400);
  }

  return details;
}

function formatExpiry(expirationDate, session) {
  if (session || !expirationDate) {
    return { text: 'Session', cls: 'exp-session' };
  }
  const days = (expirationDate * 1000 - Date.now()) / 86400000;
  if (days < 0) {
    return { text: 'Expired', cls: 'exp-expired' };
  }
  if (days < 7) {
    return { text: `${Math.ceil(days)}d`, cls: 'exp-soon' };
  }
  if (days < 365) {
    return { text: `${Math.round(days)}d`, cls: 'exp-ok' };
  }
  return { text: `${Math.round(days / 365)}y`, cls: 'exp-ok' };
}

function humanizeDuration(seconds) {
  if (seconds < 60)   return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) + '…' : str;
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).catch(() => {
    // Fallback for restricted contexts
    const el = document.createElement('textarea');
    el.value = text;
    el.style.position = 'fixed';
    el.style.opacity  = '0';
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
  });
}

function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Syntax-highlighted JSON ─────────────────────────────────────────────────

function syntaxHighlightJSON(obj) {
  const json = JSON.stringify(obj, null, 2);
  return json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    match => {
      let cls = 'json-number';
      if (/^"/.test(match)) {
        cls = /:$/.test(match) ? 'json-key' : 'json-string';
      } else if (/true|false/.test(match)) {
        cls = 'json-boolean';
      } else if (/null/.test(match)) {
        cls = 'json-null';
      }
      return `<span class="${cls}">${escapeHtml(match)}</span>`;
    }
  );
}

// ─── Toast Notifications ─────────────────────────────────────────────────────

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icon = { success: '✓', error: '✗', info: 'ℹ' }[type] || 'ℹ';
  toast.textContent = `${icon} ${message}`;

  container.appendChild(toast);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('show'));
  });

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 200);
  }, 2500);
}
