import { FeatherConfigSchema, type FeatherConfig } from '../config/schema.js';

export function renderFeatherkitConfig(config: FeatherConfig): string {
  return JSON.stringify(FeatherConfigSchema.parse(config), null, 2) + '\n';
}
