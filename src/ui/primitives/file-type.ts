/** Coarse file-category classification shared by link and file surfaces. */
import { classifyCodeFileType, type CodeFileType } from './code-file-types';

/** File categories a link or file card can name. */
export type FileType =
  | CodeFileType
  | 'code'
  | 'excel'
  | 'html'
  | 'image'
  | 'markdown'
  | 'other'
  | 'pdf'
  | 'ppt'
  | 'video'
  | 'word';

type ClassifiedFileType = FileType;

const EXTENSION_TYPES: Readonly<Record<string, ClassifiedFileType>> = {
  scss: 'code',
  sass: 'code',
  less: 'code',
  vue: 'code',
  svelte: 'code',
  astro: 'code',
  bat: 'code',
  cmd: 'code',
  csv: 'excel',
  tsv: 'excel',
  html: 'html',
  htm: 'html',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  svg: 'image',
  webp: 'image',
  avif: 'image',
  bmp: 'image',
  ico: 'image',
  tif: 'image',
  tiff: 'image',
  heic: 'image',
  heif: 'image',
  md: 'markdown',
  mdx: 'markdown',
  markdown: 'markdown',
  pdf: 'pdf',
  ppt: 'ppt',
  pptx: 'ppt',
  key: 'ppt',
  mp4: 'video',
  mov: 'video',
  m4v: 'video',
  webm: 'video',
  mkv: 'video',
  avi: 'video',
  mpg: 'video',
  mpeg: 'video',
  doc: 'word',
  docx: 'word',
  rtf: 'word',
  odt: 'word',
  pages: 'word',
  xls: 'excel',
  xlsx: 'excel',
  xlsm: 'excel',
  xlsb: 'excel',
  xlt: 'excel',
  xltx: 'excel',
  xltm: 'excel',
  ods: 'excel',
  ots: 'excel',
  fods: 'excel',
  numbers: 'excel',
};

const NAME_TYPES: Readonly<Record<string, ClassifiedFileType>> = {
  changelog: 'markdown',
  contributing: 'markdown',
  readme: 'markdown',
};

function basename(path: string): string {
  return path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1);
}

/**
 * Extract the final suffix from a file path without changing its case.
 * A leading dot starts a suffix, while a missing or trailing dot returns an empty string.
 * @param path - File path or basename using either path separator.
 * @returns The characters after the basename's final dot.
 */
export function fileExtension(path: string): string {
  const name = basename(path);
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1);
}

/**
 * Classify a file path or name for file-card presentation.
 * Matching is case-insensitive and applies code filename rules before extension rules;
 * unknown names fall back to `other`.
 * @param path - File path or basename using either path separator.
 * @returns The file's closed presentation category.
 */
export function classifyFileType(path: string): ClassifiedFileType {
  const name = basename(path).toLowerCase();
  const extension = fileExtension(name).toLowerCase();
  return classifyCodeFileType(name, extension)
    ?? NAME_TYPES[name]
    ?? EXTENSION_TYPES[extension]
    ?? 'other';
}
