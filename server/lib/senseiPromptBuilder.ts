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
    '1. Output the complete AGENTS.md Markdown content directly (no YAML frontmatter needed)',
    '2. Include key sections: role definition, core capabilities, workflow, output standards',
    '3. Professional language, clear instructions, well-structured, logically complete',
    '4. ALL output MUST be written in English regardless of the input language',
    '',
    'Digital worker description:',
    description.trim(),
  ].join('\n')

const buildFullSuiteUserPrompt = (description: string): string =>
  [
    'MODE: FULL_SUITE',
    '',
    'Follow the format specification in the "Full Suite Generation Mode" section of the system prompt,',
    'output three markdown sections at once: IDENTITY / AGENTS / SOUL.',
    '',
    'Strict requirements:',
    '- Must use three section separators: ===IDENTITY=== / ===AGENTS=== / ===SOUL=== (flush left, one per line)',
    '- All three sections must be semantically coherent (nickname consistent with personality tone, emoji matching animal)',
    '- Do not add any explanatory text or code fences outside the three sections',
    '- ALL output MUST be written in English regardless of the input language',
    '',
    'Digital worker description:',
    description.trim(),
  ].join('\n')

export const buildFullSuitePrompt = (description: string, mode: SenseiMode): string => {
  const trimmed = description.trim()
  if (!trimmed) {
    throw new Error('description must not be empty')
  }
  return mode === 'full-suite' ? buildFullSuiteUserPrompt(trimmed) : buildAgentsOnlyPrompt(trimmed)
}
