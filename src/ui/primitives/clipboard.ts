// Clipboard write shared by copy controls. Success feedback stays with each
// control; this helper only reports whether the host accepted a write.

/**
 * Write text to the clipboard, preferring the async Clipboard API and
 * falling back to `execCommand('copy')` on hosts (insecure contexts)
 * that omit it.
 * @param text - the exact text to place on the clipboard.
 * @returns true only when the host accepted the write.
 */
export async function writeClipboard(text: string): Promise<boolean> {
  // lib.dom types clipboard non-optional, but insecure contexts omit it.
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Denied permissions / iframe policy — do not claim success.
      return false;
    }
  }
  // execCommand('copy') is the only clipboard fallback where the async API
  // is missing; deprecated but deliberately retained.
  const exec = typeof document.execCommand === 'function' ? document.execCommand.bind(document) : undefined;
  if (exec === undefined) return false;
  const el = document.createElement('textarea');
  el.value = text;
  el.setAttribute('readonly', '');
  el.style.position = 'fixed';
  el.style.left = '-9999px';
  document.body.appendChild(el);
  el.select();
  try {
    return exec('copy');
  } catch {
    return false;
  } finally {
    el.remove();
  }
}
