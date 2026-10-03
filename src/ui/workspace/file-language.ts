export function fileLanguage(path: string): string | undefined {
  const extension = path.split('.').at(-1)?.toLowerCase() ?? '';
  return ({ ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx', mjs: 'javascript',
    json: 'json', md: 'markdown', mdx: 'markdown', html: 'html', htm: 'html', css: 'css',
    py: 'python', rs: 'rust', go: 'go', sh: 'shell', bash: 'shell', nix: 'nix',
    yaml: 'yaml', yml: 'yaml', toml: 'toml', sql: 'sql', svg: 'xml', xml: 'xml',
  } as Record<string, string>)[extension];
}
