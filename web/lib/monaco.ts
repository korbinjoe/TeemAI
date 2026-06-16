/**
 * Monaco Editor
 *
 *  @monaco-editor/react  monaco-editor  CDN
 *  Monaco  import
 */
import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
import 'monaco-editor/esm/vs/language/typescript/monaco.contribution'

const typeScriptLanguage = monaco.languages.typescript

if (typeScriptLanguage) {
  const { typescriptDefaults, javascriptDefaults } = typeScriptLanguage

  typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: true,
  })
  javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: true,
  })
}

loader.config({ monaco })
