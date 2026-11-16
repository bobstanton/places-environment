import { normalizePath, App } from 'obsidian';

export function getLocationStringFromFrontmatter(app: App, sourcePath: string): string | null {
  try {
    const file = app.vault.getFileByPath(normalizePath(sourcePath));

    if (!file) return null;

    const fileCache = app.metadataCache.getFileCache(file);
    const frontmatterLocation: unknown = fileCache?.frontmatter?.["Location"];

    return typeof frontmatterLocation === 'string' ? frontmatterLocation : null;
  } catch {
    return null;
  }
}
