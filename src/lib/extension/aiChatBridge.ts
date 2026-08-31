import { AI_SITE_ORIGINS, matchAiSite } from './aiSites';
import { captureLatestReplyInPage, fillComposeBoxInPage } from './pageActions';

/** True only inside the extension build (chrome.scripting/chrome.tabs don't
 * exist in a plain browser tab), so the web app renders none of this. */
export function isExtensionRuntime(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.scripting && !!chrome.tabs && !!chrome.permissions;
}

export type ChatBridgeError =
  | { key: 'chatBridgeTabUnreadable' }
  | { key: 'chatBridgeUnsupportedSite'; vars: { hostname: string } }
  | { key: 'chatBridgeNoInputFound'; vars: { site: string } }
  | { key: 'chatBridgeNoReplyFound' }
  | { key: 'chatBridgeAccessError' };

export type ChatBridgeResult<T extends object = object> =
  | ({ ok: true; site: string } & T)
  | { ok: false; error: ChatBridgeError };

/** Requests host access to every supported AI chat site in one native
 * permission prompt, the first time any chat-bridge button is used — after
 * that, chrome.permissions.contains() is already satisfied and this is a
 * no-op. A true per-site prompt (asking only for the one site the user is
 * currently on) isn't possible here: it would require reading the active
 * tab's URL *before* we have permission to read it, which needs either this
 * same permission (circular) or the broad "tabs" permission, which brings
 * its own Chrome Web Store warning ("Read your browsing history") that a
 * privacy tool shouldn't be asking for just to detect a handful of known
 * chat sites. request() must run inside a user gesture — every caller here
 * is a button's onClick handler, so that's satisfied. */
async function ensureChatSitePermission(): Promise<boolean> {
  const has = await chrome.permissions.contains({ origins: AI_SITE_ORIGINS });
  if (has) return true;
  try {
    return await chrome.permissions.request({ origins: AI_SITE_ORIGINS });
  } catch {
    return false;
  }
}

async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ?? null;
}

/** Fills the detected site's compose box — never submits it. The user
 * reviews the assembled prompt in the chat's own input and sends it
 * themselves, same "review before it leaves your device" principle as the
 * rest of the app. */
export async function sendPromptToActiveChatTab(prompt: string): Promise<ChatBridgeResult> {
  if (!(await ensureChatSitePermission())) return { ok: false, error: { key: 'chatBridgeAccessError' } };
  const tab = await getActiveTab();
  if (!tab?.id) return { ok: false, error: { key: 'chatBridgeTabUnreadable' } };
  // Only populated now because permission for a matching origin exists;
  // an unsupported tab's URL stays hidden, same as before any grant.
  const hostname = tab.url ? new URL(tab.url).hostname : '';
  const site = matchAiSite(hostname);
  if (!site) return { ok: false, error: { key: 'chatBridgeUnsupportedSite', vars: { hostname: hostname || 'this tab' } } };
  try {
    const results = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: fillComposeBoxInPage, args: [prompt] });
    const result = results[0]?.result;
    if (!result?.ok) return { ok: false, error: { key: 'chatBridgeNoInputFound', vars: { site: site.label } } };
    return { ok: true, site: site.label };
  } catch {
    return { ok: false, error: { key: 'chatBridgeAccessError' } };
  }
}

/** Reads the latest assistant reply from the detected site's page — a
 * best-effort DOM heuristic (see pageActions.ts), not a guaranteed-accurate
 * extraction. Returns the captured text for the caller to drop into the
 * "Paste AI result" field, exactly as if the user had copy-pasted it. */
export async function captureReplyFromActiveChatTab(): Promise<ChatBridgeResult<{ text: string }>> {
  if (!(await ensureChatSitePermission())) return { ok: false, error: { key: 'chatBridgeAccessError' } };
  const tab = await getActiveTab();
  if (!tab?.id) return { ok: false, error: { key: 'chatBridgeTabUnreadable' } };
  const hostname = tab.url ? new URL(tab.url).hostname : '';
  const site = matchAiSite(hostname);
  if (!site) return { ok: false, error: { key: 'chatBridgeUnsupportedSite', vars: { hostname: hostname || 'this tab' } } };
  try {
    const results = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: captureLatestReplyInPage });
    const result = results[0]?.result;
    if (!result?.ok || !result.text) return { ok: false, error: { key: 'chatBridgeNoReplyFound' } };
    return { ok: true, site: site.label, text: result.text };
  } catch {
    return { ok: false, error: { key: 'chatBridgeAccessError' } };
  }
}
