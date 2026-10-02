import mermaid from 'mermaid';
import DOMPurify from 'dompurify';
import { createId } from '../../../identifiers';
import { prepareDiagram } from './mermaid-source';

let queue: Promise<unknown> = Promise.resolve();
export function renderDiagram(source: string, dark: boolean, signal: AbortSignal) {
  const render = async () => {
    signal.throwIfAborted();
    const prepared = prepareDiagram(source);
    const styles = getComputedStyle(document.body);
    const token = (name: string) => styles.getPropertyValue(name).trim();
    const background = token('--dsw-alias-bg-base');
    const surface = token('--dsw-specific-bubble');
    const text = token('--dsw-alias-label-primary');
    const line = token('--dsw-alias-label-secondary');
    const accent = token('--dsw-alias-state-business-primary');
    const secondary = token('--dsw-alias-bg-module-platform');
    const config = {
      startOnLoad: false,
      securityLevel: 'strict' as const,
      suppressErrorRendering: true,
      theme: 'base' as const,
      themeVariables: {
        darkMode: dark,
        background,
        primaryColor: surface,
        primaryTextColor: text,
        primaryBorderColor: accent,
        lineColor: line,
        secondaryColor: secondary,
        tertiaryColor: background,
        actorBkg: surface,
        actorBorder: accent,
        actorTextColor: text,
        signalColor: line,
        signalTextColor: text,
        edgeLabelBackground: background,
        noteBkgColor: secondary,
        noteTextColor: text,
        activeTaskBkgColor: surface,
        activeTaskBorderColor: accent,
        doneTaskBkgColor: secondary,
        doneTaskBorderColor: line,
        taskTextDarkColor: text,
        taskTextOutsideColor: text,
        critBkgColor: token('--dsw-alias-file-diff-deleted-bg'),
        critBorderColor: token('--dsw-alias-state-error-primary'),
        gridColor: line,
      },
      fontFamily: styles.fontFamily,
      htmlLabels: false,
      flowchart: { htmlLabels: false },
      maxTextSize: 20000,
      maxEdges: 300,
      logLevel: 'fatal' as const,
    };
    mermaid.initialize({ ...config, secure: Object.keys(config) });
    const host = document.createElement('div');
    // Width-dependent diagrams otherwise measure a shrink-to-fit SVG viewport of only 300px.
    // Use a stable canvas on mobile as well; the resulting image is fitted by the viewer.
    host.style.cssText =
      'position:fixed;left:-10000px;top:0;width:1200px;visibility:hidden;pointer-events:none';
    document.body.append(host);
    try {
      const result = await mermaid.render(`diagram-${createId()}`, prepared.source, host);
      signal.throwIfAborted();
      const clean = DOMPurify.sanitize(result.svg, {
        USE_PROFILES: { svg: true, svgFilters: true },
        FORBID_TAGS: ['foreignObject', 'script', 'image', 'a'],
      });
      const parsed = new DOMParser().parseFromString(clean, 'image/svg+xml');
      const svg = parsed.documentElement;
      if (svg.localName !== 'svg' || parsed.querySelector('parsererror'))
        throw new Error('The diagram could not be rendered.');
      const externalResource = (value: string) =>
        /@import|@font-face|expression\(/i.test(value) ||
        [...value.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)].some(
          (match) => !match[2]?.trim().startsWith('#'),
        );
      for (const style of svg.querySelectorAll('style'))
        if (externalResource(style.textContent ?? ''))
          throw new Error('External diagram resources are not supported.');
      // No external references can leave the browser through the generated image.
      for (const element of svg.querySelectorAll('*')) {
        for (const attribute of Array.from(element.attributes)) {
          if (
            (attribute.localName === 'href' && !attribute.value.startsWith('#')) ||
            externalResource(attribute.value)
          )
            element.removeAttributeNode(attribute);
        }
      }
      const [, , width, height] = (svg.getAttribute('viewBox') ?? '').split(/[ ,]+/).map(Number);
      if (
        !width ||
        !height ||
        width < 0 ||
        height < 0 ||
        !Number.isFinite(width) ||
        !Number.isFinite(height) ||
        width > 8192 ||
        height > 8192
      )
        throw new Error('This diagram is too large to preview.');
      svg.setAttribute('width', String(Math.ceil(width)));
      svg.setAttribute('height', String(Math.ceil(height)));
      const title =
        prepared.title ||
        svg.querySelector('title, .titleText, .flowchartTitleText')?.textContent ||
        'Mermaid diagram';
      return {
        blob: new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }),
        title,
        size: { width: Math.ceil(width), height: Math.ceil(height) },
      };
    } finally {
      host.remove();
    }
  };
  const result = queue.then(render, render);
  queue = result.catch(() => undefined);
  return result;
}
