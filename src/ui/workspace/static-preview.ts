/** A separate opaque-origin iframe renders only static HTML. */
export function staticHtmlPreview(source: string): string {
  const doc = new DOMParser().parseFromString(source, 'text/html');
  // Remove navigation, nested browsing contexts, active content, and network-bearing metadata.
  for (const node of doc.querySelectorAll('script, iframe, frame, frameset, object, embed, base, link, meta, form, svg, math, template')) node.remove();
  for (const node of doc.querySelectorAll('*')) {
    for (const attribute of [...node.attributes]) {
      if (/^on/i.test(attribute.name) || ['href', 'xlink:href', 'action', 'formaction', 'ping', 'srcset', 'background'].includes(attribute.name))
        node.removeAttribute(attribute.name);
      if (attribute.name === 'src' && !(node.tagName === 'IMG' && /^data:image\/(?:png|jpeg|gif|webp);base64,/i.test(attribute.value)))
        node.removeAttribute(attribute.name);
    }
  }
  // The first policy cannot be weakened by document content. CSP also blocks CSS URLs/imports.
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; connect-src 'none'; media-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><meta name="referrer" content="no-referrer">${doc.head.innerHTML}</head><body>${doc.body.innerHTML}</body></html>`;
}
