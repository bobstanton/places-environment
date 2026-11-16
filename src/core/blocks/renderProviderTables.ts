import * as _placesDom from 'places-shared/utils';
import type { ProviderTableDefinition } from 'vaultquery/provider-types';
import { weatherTableDefinitions, tideTableDefinitions, solarTableDefinitions } from 'places-environment/core';

export function renderProviderTables(container: HTMLElement): void {
  const definitions: ProviderTableDefinition[] = [...weatherTableDefinitions(), ...tideTableDefinitions(), ...solarTableDefinitions()];

  for (const definition of definitions) {
    _placesDom.createElement(_placesDom.createElement(container, 'h3'), 'code', { text: definition.name });
    if (definition.description) _placesDom.createElement(container, 'p', { text: definition.description });

    const wrapper = _placesDom.createDiv(container, 'places-environment-help-table-wrapper');
    const table = _placesDom.createElement(wrapper, 'table', { cls: 'places-environment-help-table' });
    const head = _placesDom.createElement(_placesDom.createElement(table, 'thead'), 'tr');

    for (const label of ['Column', 'Type', 'Notes']) _placesDom.createElement(head, 'th', { text: label });

    const body = _placesDom.createElement(table, 'tbody');

    for (const column of definition.columns) {
      const row = _placesDom.createElement(body, 'tr');

      _placesDom.createElement(_placesDom.createElement(row, 'td'), 'code', { text: column.name });
      _placesDom.createElement(row, 'td', { text: column.type });
      const notes: string[] = [];

      if (definition.primaryKey.includes(column.name)) notes.push('primary key');
      else if (column.nullable === false) notes.push('required');

      _placesDom.createElement(row, 'td', { text: notes.join(', ') });
    }
  }
  }
