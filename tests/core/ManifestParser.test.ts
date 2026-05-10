import { describe, it, expect } from 'vitest';
import { ManifestParser } from '../../src/core/ManifestParser';
import { SystemExit } from '../../src/core/SystemExit';

const validYaml = `
project_id: "test_project"
workflow: "supervised"

plugins:
  state_manager: "in_memory_store"
  vault: "env_vault"
  memory: "local_memory"
  model_drivers:
    - id: "anthropic_adapter"
      type: "drivers.models.anthropic"
    - id: "openai_adapter"
      type: "drivers.models.openai"

agents:
  - id: "senior_coder"
    use_driver: "anthropic_adapter"
    model: "claude-3-5-sonnet"
    status: "auto"
  - id: "researcher"
    use_driver: "openai_adapter"
    model: "gpt-4o"
    status: "auto"

sequence:
  - step: "code_fix"
    agent: "senior_coder"
    on_failure: "rework"
    max_retries: 2
`;

const sequenceWithInputRefsYaml = `
project_id: "test_project"
workflow: "supervised"

plugins:
  model_drivers:
    - id: "anthropic_adapter"
      type: "drivers.models.anthropic"

agents:
  - id: "senior_coder"
    use_driver: "anthropic_adapter"
    model: "claude-3-5-sonnet"
    status: "auto"

sequence:
  - step: "analyze"
    agent: "senior_coder"
    max_retries: 1
  - step: "implement"
    agent: "senior_coder"
    input_refs:
      - "mem://v1/analyze"
      - "mem://v1/spec"
    max_retries: 2
`;

const missingDriverYaml = `
project_id: "test_project"
workflow: "supervised"

plugins:
  model_drivers:
    - id: "anthropic_adapter"
      type: "drivers.models.anthropic"

agents:
  - id: "researcher"
    use_driver: "openai_adapter"
    model: "gpt-4o"
`;

const noDriversYaml = `
project_id: "test_project"
workflow: "supervised"

plugins:
  model_drivers: []

agents:
  - id: "agent"
    use_driver: "any_driver"
    model: "gpt-4"
`;

const noAgentsYaml = `
project_id: "test_project"
workflow: "supervised"

plugins:
  model_drivers:
    - id: "anthropic_adapter"
      type: "drivers.models.anthropic"

agents: []
`;

const invalidYaml = `
project_id: "test_project"
workflow: "supervised"
plugins: { bad yaml
`;

describe('ManifestParser', () => {
  describe('validate', () => {
    it('should pass when all agent use_driver references are valid', () => {
      const manifest = ManifestParser.parse(validYaml);
      expect(() => ManifestParser.validate(manifest)).not.toThrow();
    });

    it('should pass when there are no agents', () => {
      const manifest = ManifestParser.parse(noAgentsYaml);
      expect(() => ManifestParser.validate(manifest)).not.toThrow();
    });

    it('should throw SystemExit when an agent references a non-existent driver', () => {
      const manifest = ManifestParser.parse(missingDriverYaml);
      expect(() => ManifestParser.validate(manifest)).toThrow(SystemExit);
    });

    it('should throw SystemExit when model_drivers is empty but agents exist', () => {
      const manifest = ManifestParser.parse(noDriversYaml);
      expect(() => ManifestParser.validate(manifest)).toThrow(SystemExit);
    });

    it('should include the agent ID in the error message for missing driver', () => {
      const manifest = ManifestParser.parse(missingDriverYaml);
      try {
        ManifestParser.validate(manifest);
        expect.fail('Expected SystemExit');
      } catch (e) {
        expect(e).toBeInstanceOf(SystemExit);
        expect((e as SystemExit).message).toContain('researcher');
        expect((e as SystemExit).message).toContain('openai_adapter');
      }
    });

    it('should validate all agents when multiple exist', () => {
      const manifest = ManifestParser.parse(validYaml);
      expect(() => ManifestParser.validate(manifest)).not.toThrow();
      expect(manifest.agents).toHaveLength(2);
    });
  });

  describe('parse', () => {
    it('should parse a valid YAML manifest into structured object', () => {
      const manifest = ManifestParser.parse(validYaml);

      expect(manifest.project_id).toBe('test_project');
      expect(manifest.workflow).toBe('supervised');
      expect(manifest.plugins.model_drivers).toHaveLength(2);
      expect(manifest.plugins.model_drivers[0].id).toBe('anthropic_adapter');
      expect(manifest.agents).toHaveLength(2);
      expect(manifest.agents[0].use_driver).toBe('anthropic_adapter');
      expect(manifest.agents[1].use_driver).toBe('openai_adapter');
      expect(manifest.sequence).toHaveLength(1);
      expect(manifest.sequence[0].step).toBe('code_fix');
    });

    it('should parse optional sequence fields with defaults', () => {
      const yaml = `
project_id: "p1"
workflow: "supervised"
plugins:
  model_drivers: []
agents: []
`;
      const manifest = ManifestParser.parse(yaml);
      expect(manifest.sequence).toEqual([]);
    });

    it('should throw SystemExit on invalid YAML syntax', () => {
      expect(() => ManifestParser.parse(invalidYaml)).toThrow(SystemExit);
    });

    it('should parse sequence step with input_refs field', () => {
      const manifest = ManifestParser.parse(sequenceWithInputRefsYaml);
      expect(manifest.sequence).toHaveLength(2);
      expect(manifest.sequence[0].step).toBe('analyze');
      expect(manifest.sequence[0].input_refs).toBeUndefined();
      expect(manifest.sequence[1].step).toBe('implement');
      expect(manifest.sequence[1].input_refs).toEqual(['mem://v1/analyze', 'mem://v1/spec']);
    });

    it('should throw SystemExit on schema validation failure', () => {
      const invalidSchemaYaml = `
project_id: "test_project"
workflow: "supervised"
plugins:
  model_drivers:
    - type: "drivers.models.anthropic"
agents: []
`;
      // Missing 'id' in model_drivers should fail schema validation
      expect(() => ManifestParser.parse(invalidSchemaYaml)).toThrow(SystemExit);
    });
  });
});
