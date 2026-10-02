/** One block of a settled tool result's content array. */
export interface ToolContentBlock {
  type: string;
  text?: string;
  media_type?: string;
  hash?: string | null;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A string field of a tool input, or undefined when absent or not text. */
export function inputString(input: unknown, key: string): string | undefined {
  if (!isRecord(input)) return undefined;
  const value = input[key];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/** The blocks of a settled result content array; anything else yields none. */
export function contentBlocks(content: unknown): ToolContentBlock[] {
  if (!Array.isArray(content)) return [];
  return content.filter((block): block is ToolContentBlock => isRecord(block) && typeof block.type === 'string');
}

/** Every text block of a settled result joined, mirroring the transcript's flattening. */
export function contentText(content: unknown): string {
  return contentBlocks(content)
    .flatMap((block) => (block.type === 'text' && typeof block.text === 'string' ? [block.text] : []))
    .join('\n');
}

/** The text a row shows as its result body: streamed output while the call runs, else the settled content text. */
export function resultText(call: { state: string; output: string; content: unknown }): string {
  const settled = contentText(call.content);
  if (call.state === 'completed' || call.state === 'error') return settled || call.output;
  return call.output || settled;
}

export function firstLine(text: string): string {
  const newline = text.indexOf('\n');
  return (newline === -1 ? text : text.slice(0, newline)).trim();
}
