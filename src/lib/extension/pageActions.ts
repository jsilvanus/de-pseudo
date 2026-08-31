/** Functions in this file are never called directly — they're passed as the
 * `func` argument to `chrome.scripting.executeScript`, which serializes the
 * function body and re-runs it inside the target page's own JS context. That
 * means each function must be fully self-contained: no references to
 * anything outside its own body (module-level helpers, imports, closures
 * over outer variables) will exist once it's injected, so every helper it
 * needs is declared *inside* it, even at the cost of duplication between the
 * two functions below.
 *
 * Both use generic, site-agnostic DOM heuristics rather than hardcoded
 * per-site CSS selectors (ChatGPT/Claude/Copilot/Gemini all use obfuscated,
 * frequently-changing class names for their React/ProseMirror internals, so
 * a selector pinned today is likely to break within months). This trades
 * precision for resilience: it should keep working, imperfectly, across
 * markup changes, rather than working perfectly until the first change. The
 * one exception is ChatGPT's `data-message-author-role` attribute, used as a
 * first-try hook in captureLatestReplyInPage because it's been stable for a
 * long time — with the generic heuristic as a fallback if it's ever removed. */

export type FillResult = { ok: boolean; reason?: string };

export function fillComposeBoxInPage(text: string): FillResult {
  function isVisible(el: Element): boolean {
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 40 && rect.height > 10;
  }

  const candidates = Array.from(document.querySelectorAll('textarea, [contenteditable="true"]')).filter(isVisible);
  if (!candidates.length) return { ok: false, reason: 'no-input-found' };

  // Chat compose boxes are almost always the last sizeable text input in the
  // document, docked near the bottom of the viewport — sort ascending by
  // top position and take the lowest one.
  candidates.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
  const target = candidates[candidates.length - 1] as HTMLElement;

  target.scrollIntoView({ block: 'center' });
  target.focus();

  if (target.tagName === 'TEXTAREA') {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
    if (setter) setter.call(target, text);
    else (target as HTMLTextAreaElement).value = text;
    target.dispatchEvent(new Event('input', { bubbles: true }));
  } else {
    // Rich-text editors (ProseMirror, Lexical, Draft.js — used by most of
    // these sites) only pick up changes made through real input events;
    // execCommand('insertText', ...) is deprecated but still the one
    // cross-editor way to fire those correctly. textContent is a last-resort
    // fallback for editors that don't respond to it at all.
    document.execCommand('selectAll', false);
    document.execCommand('delete', false);
    const inserted = document.execCommand('insertText', false, text);
    if (!inserted) {
      target.textContent = text;
      target.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
  target.dispatchEvent(new Event('change', { bubbles: true }));
  return { ok: true };
}

export type CaptureResult = { ok: boolean; text?: string; reason?: string };

export function captureLatestReplyInPage(): CaptureResult {
  const chatGptTurns = document.querySelectorAll('[data-message-author-role="assistant"]');
  if (chatGptTurns.length) {
    const last = chatGptTurns[chatGptTurns.length - 1] as HTMLElement;
    const text = last.innerText.trim();
    if (text) return { ok: true, text };
  }

  function isVisible(el: Element): boolean {
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 40 && rect.height > 10;
  }

  const inputs = Array.from(document.querySelectorAll('textarea, [contenteditable="true"]'));
  const composeBox = inputs.filter(isVisible).sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top).pop();
  const composeTop = composeBox?.getBoundingClientRect().top ?? Infinity;

  // Best-effort fallback for sites without a reliable message marker: take
  // the last reasonably-sized, low-nesting text block that sits above the
  // compose box (replies appear above the input in effectively every chat
  // UI) and isn't part of the input itself.
  const blocks = Array.from(document.querySelectorAll('p, div, article, section')).filter(el => {
    if (!isVisible(el)) return false;
    if (composeBox && (composeBox === el || composeBox.contains(el) || el.contains(composeBox))) return false;
    const rect = el.getBoundingClientRect();
    if (rect.top >= composeTop) return false;
    const text = (el as HTMLElement).innerText?.trim() ?? '';
    return text.length > 20 && el.children.length <= 6;
  });
  if (!blocks.length) return { ok: false, reason: 'no-reply-found' };

  blocks.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
  const last = blocks[blocks.length - 1] as HTMLElement;
  return { ok: true, text: last.innerText.trim() };
}
