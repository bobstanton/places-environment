export interface TemplateBlockSource {
  settingsSource: string;
  template: string | null;
}

export function splitTemplateBlockSource(source: string): TemplateBlockSource {
  const delimiter = /^---[ \t]*$/m;
  const match = delimiter.exec(source);

  if (!match) {
    return { settingsSource: source.trim(), template: null };
  }

  return {
    settingsSource: source.slice(0, match.index).trim(),
    template: source.slice(match.index + match[0].length).trim(),
  };
}
