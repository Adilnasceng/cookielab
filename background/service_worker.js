/**
 * CookieLab — Background Service Worker (MV3)
 * Minimal worker; most logic lives in the popup.
 */

'use strict';

// ─── Install / Update ───────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    console.log('[CookieLab] Extension installed. Welcome to CookieLab!');
    // Initialise storage defaults
    chrome.storage.local.set({
      snapshots: {},
      settings: {
        highlightSessions: true,
        showSecurityWarnings: true
      }
    });
  } else if (reason === 'update') {
    console.log('[CookieLab] Extension updated.');
  }
});

// ─── Message Passing (for future extensibility) ──────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {

    case 'GET_COOKIES': {
      const { url } = message;
      chrome.cookies.getAll({ url }, (cookies) => {
        if (chrome.runtime.lastError) {
          sendResponse({ error: chrome.runtime.lastError.message, cookies: [] });
        } else {
          sendResponse({ cookies });
        }
      });
      return true; // keep port open for async response
    }

    case 'SET_COOKIE': {
      const { details } = message;
      chrome.cookies.set(details, (cookie) => {
        if (chrome.runtime.lastError) {
          sendResponse({ error: chrome.runtime.lastError.message });
        } else {
          sendResponse({ cookie });
        }
      });
      return true;
    }

    case 'REMOVE_COOKIE': {
      const { url, name } = message;
      chrome.cookies.remove({ url, name }, (details) => {
        if (chrome.runtime.lastError) {
          sendResponse({ error: chrome.runtime.lastError.message });
        } else {
          sendResponse({ details });
        }
      });
      return true;
    }

    case 'PING':
      sendResponse({ pong: true, version: chrome.runtime.getManifest().version });
      return false;

    default:
      sendResponse({ error: `Unknown message type: ${message.type}` });
      return false;
  }
});
