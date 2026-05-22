/**
 * OutputParser - JSONL
 *
 *  CLI  JSONL  SessionFileWatcher
 * parser  newMessages
 *  state.messages SessionFileWatcher  push
 */

import {
  parseNewLines,
  createParserState,
  type ParserState,
  type ParsedMessage,
} from './ConversationParser'

export interface OutputParser {
  createState(): ParserState
  parseNewLines(
    lines: string[],
    startLine: number,
    state: ParserState,
  ): { newMessages: ParsedMessage[]; replacedStatsId: string | null }
}

/** Claude OutputParser —  ConversationParser */
export const claudeOutputParser: OutputParser = {
  createState: createParserState,
  parseNewLines,
}
