export type AiSite = { id: string; label: string; hostnames: string[] };

/** Sites the chat-tab bridge recognizes. Detection is hostname-only — no
 * page-structure knowledge lives here, so adding a new site is a one-line
 * change here plus a matching "https://<hostname>/*" entry in
 * extension/manifest.json's optional_host_permissions (kept in sync by
 * hand — manifest.json is static JSON and can't import this list). Whether
 * the generic DOM heuristics in pageActions.ts actually find that site's
 * message box/reply is a separate, unavoidably best-effort concern (see the
 * comments there). */
export const AI_SITES: AiSite[] = [
  { id: 'chatgpt', label: 'ChatGPT', hostnames: ['chatgpt.com', 'chat.openai.com'] },
  { id: 'claude', label: 'Claude', hostnames: ['claude.ai'] },
  { id: 'copilot', label: 'Copilot', hostnames: ['copilot.microsoft.com', 'm365.cloud.microsoft'] },
  { id: 'gemini', label: 'Gemini', hostnames: ['gemini.google.com'] },
];

/** Match patterns for every AI_SITES hostname, in the exact form the
 * chrome.permissions API expects — must mirror extension/manifest.json's
 * optional_host_permissions. */
export const AI_SITE_ORIGINS: string[] = AI_SITES.flatMap(site => site.hostnames.map(h => `https://${h}/*`));

export function matchAiSite(hostname: string): AiSite | null {
  return AI_SITES.find(site => site.hostnames.some(h => hostname === h || hostname.endsWith(`.${h}`))) ?? null;
}
