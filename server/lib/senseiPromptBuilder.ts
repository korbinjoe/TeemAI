/**
 * Sensei Prompt Builder —  Claude CLI  user message
 *
 * - mode='agents-only' AGENTS.md
 * - mode='full-suite' LLM  IDENTITY + AGENTS + SOUL
 *
 * sensei  system prompt ai-assets/agents/sensei/AGENTS.md
 * system prompt
 */

export type SenseiMode = 'agents-only' | 'full-suite'

const buildAgentsOnlyPrompt = (description: string): string =>
  [
    'Based on the following description, generate a high-quality AGENTS.md system prompt file for the digital worker.',
    '',
    'Requirements:',
    '1. Output the complete AGENTS.md Markdown content directly (no YAML frontmatter needed, no code fences)',
    '2. Include key sections: role definition, core capabilities, workflow, output standards',
    '3. Professional language, clear instructions, well-structured, logically complete',
    '4. Use the same language as the digital worker description unless the description explicitly requests another language.',
    '',
    'Digital worker description:',
    description.trim(),
  ].join('\n')

const buildFullSuiteUserPrompt = (description: string): string =>
  [
    'You are an expert AI agent designer. Generate a complete agent definition by outputting three markdown sections.',
    '',
    '## Output Format (STRICT)',
    '',
    'You MUST output exactly three sections separated by these markers (flush left, each on its own line):',
    '',
    '===IDENTITY===',
    'YAML-like key-value pairs defining the agent identity. Required keys:',
    '  name: <agent name, concise and professional>',
    '  description: <one-line role summary>',
    '  nickname: <short informal name>',
    '  animal: <spirit animal that matches the agent personality>',
    '  provider: Claude Code',
    '  allowedTools: []',
    '  disallowedTools: []',
    '',
    '===AGENTS===',
    'A complete AGENTS.md system prompt in Markdown. Include:',
    '  - Role definition and core identity',
    '  - Core capabilities and responsibilities',
    '  - Workflow and methodology',
    '  - Output standards and quality criteria',
    '  - Constraints and boundaries',
    '',
    '===SOUL===',
    'Personality configuration in Markdown with these sections:',
    '  ## Personality — describe traits and behavior style',
    '  ## Tone — one of: formal, casual, playful (with explanation)',
    '  ## Verbosity — one of: concise, moderate, detailed (with explanation)',
    '  ## Collaboration Style — how the agent interacts with other agents',
    '',
    '## Rules',
    '- Use the same language as the Digital Worker Description unless it explicitly requests another language',
    '- Do NOT add any text, explanation, or code fences outside the three sections',
    '- All three sections must be semantically coherent (nickname consistent with personality, animal matching character)',
    '- The AGENTS.md section should be thorough, professional, and well-structured',
    '',
    '## Digital Worker Description',
    description.trim(),
  ].join('\n')

export const buildFullSuitePrompt = (description: string, mode: SenseiMode): string => {
  const trimmed = description.trim()
  if (!trimmed) {
    throw new Error('description must not be empty')
  }
  return mode === 'full-suite' ? buildFullSuiteUserPrompt(trimmed) : buildAgentsOnlyPrompt(trimmed)
}
