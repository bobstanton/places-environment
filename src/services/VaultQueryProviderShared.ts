import type { ProviderTableDefinition } from 'vaultquery/api';
import { VALUE_DETAILS } from 'places-shared/settings';

// Helpers shared by the tide/solar/weather VaultQuery table providers.

export function locationString(latitude: number, longitude: number): string {
  return `${latitude}, ${longitude}`;
}

export function textColumn(name: string, nullable = true): ProviderTableDefinition['columns'][number] {
  return { name, type: 'TEXT', nullable };
}

export function integerColumn(name: string, nullable = true): ProviderTableDefinition['columns'][number] {
  return { name, type: 'INTEGER', nullable };
}

export function realColumn(name: string, nullable = true): ProviderTableDefinition['columns'][number] {
  return { name, type: 'REAL', nullable };
}

// Undefined for an empty list; the caller applies its own default (all tables,
// or inference from the requested variables).
export function parseRequestedTableList(value: string | undefined, aliasToTable: Record<string, string>, blockLabel: string, expectedText: string): string[] | undefined {
  const values = (value ?? '')
    .split(',')
    .map(table => table.trim().toLowerCase())
    .filter(Boolean);

  if (values.length === 0) return undefined;

  return Array.from(new Set(values.map(table => {
    const resolved = aliasToTable[table];
    if (!resolved) {
      throw new Error(`Unsupported ${blockLabel} table: ${table}. Expected ${expectedText}.`);
    }
    return resolved;
  })));
}

export function sharedValueCompletions(key: string): Array<{ label: string; detail: string }> {
  return Object.entries(VALUE_DETAILS[key] ?? {}).map(([label, detail]) => ({ label, detail }));
}
