import type { CompetitionFormat } from '../types/format.types';

export function createFormat(config: CompetitionFormat): CompetitionFormat {
  if (!config.id || !config.name || !config.version) {
    throw new Error('createFormat: id, name, and version are required');
  }
  return config;
}
