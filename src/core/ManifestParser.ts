import { SystemExit } from './SystemExit';
import yaml from 'js-yaml';
import { z } from 'zod';

export const ModelDriverConfigSchema = z.object({
  id: z.string(),
  type: z.string(),
});

export const AgentConfigSchema = z.object({
  id: z.string(),
  use_driver: z.string(),
  model: z.string(),
  status: z.string().optional(),
  tools: z.array(z.string()).optional(),
});

export const SequenceStepSchema = z.object({
  step: z.string(),
  agent: z.string(),
  evaluator: z.string().optional(),
  on_failure: z.string().optional(),
  max_retries: z.number().optional(),
});

export const ManifestSchema = z.object({
  project_id: z.string(),
  workflow: z.string().default('supervised'),
  plugins: z.object({
    state_manager: z.string().optional(),
    vault: z.string().optional(),
    memory: z.string().optional(),
    model_drivers: z.array(ModelDriverConfigSchema).default([]),
  }).catchall(z.unknown()).default({ model_drivers: [] }),
  agents: z.array(AgentConfigSchema).default([]),
  sequence: z.array(SequenceStepSchema).default([]),
});

export type ModelDriverConfig = z.infer<typeof ModelDriverConfigSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type SequenceStep = z.infer<typeof SequenceStepSchema>;
export type Manifest = z.infer<typeof ManifestSchema>;

export class ManifestParser {
  /**
   * Parse a YAML string into a Manifest object.
   * Throws SystemExit if the YAML is malformed or invalid.
   */
  static parse(yamlStr: string): Manifest {
    try {
      const raw = yaml.load(yamlStr);
      const result = ManifestSchema.safeParse(raw);
      
      if (!result.success) {
        throw new SystemExit(`Failed to parse manifest: ${result.error.message}`);
      }
      
      return result.data;
    } catch (e) {
      if (e instanceof SystemExit) throw e;
      throw new SystemExit(`Failed to parse manifest: ${(e as Error).message}`);
    }
  }

  /**
   * Validate that every agent's use_driver references a registered driver.
   * Throws SystemExit if validation fails.
   */
  static validate(manifest: Manifest): void {
    const driverIds = new Set(
      manifest.plugins.model_drivers.map((d) => d.id)
    );

    for (const agent of manifest.agents) {
      if (!driverIds.has(agent.use_driver)) {
        throw new SystemExit(
          `Missing driver for agent '${agent.id}': driver '${agent.use_driver}' is not registered in plugins.model_drivers. Bootstrap aborted.`
        );
      }
    }
  }
}
