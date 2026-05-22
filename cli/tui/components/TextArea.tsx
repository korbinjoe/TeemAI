/**
 * TextArea —
 *
 * Enter Alt+Enter
 * ←→↑↓BackspaceIME
 * Ctrl+V onImagePaste
 */

import React, { useState, useEffect } from 'react'
import { Box, Text, useInput } from 'ink'
import { saveClipboardImage, readClipboardText } from '../../lib/clipboard.js'

interface TextAreaProps {
  value: string
  onChange: (value: string) => void
  onSubmit: (value: string) => void
  onImagePaste?: (imagePath: string) => void
  placeholder?: string
}

const TextArea = ({ value, onChange, onSubmit, onImagePaste, placeholder }: TextAreaProps) => {
  const [cursor, setCursor] = useState(value.length)

  useEffect(() => {
    setCursor((c) => Math.min(c, value.length))
  }, [value])

  useInput((input, key) => {
    if (key.backspace || key.delete) {
      if (cursor > 0) {
        onChange(value.slice(0, cursor - 1) + value.slice(cursor))
        setCursor(cursor - 1)
      }
      return
    }

    if (key.tab || key.escape) return

    if (key.ctrl && input === 'v') {
      const imagePath = saveClipboardImage()
      if (imagePath) {
        onImagePaste?.(imagePath)
        return
      }
      const text = readClipboardText()
      if (text) {
        const next = value.slice(0, cursor) + text + value.slice(cursor)
        onChange(next)
        setCursor(cursor + text.length)
      }
      return
    }

    if (key.ctrl && input === 'a') {
      const lineStart = value.slice(0, cursor).lastIndexOf('\n') + 1
      setCursor(lineStart)
      return
    }

    if (key.ctrl) return

    if (key.return && !key.meta) {
      onSubmit(value)
      return
    }

    if (key.return && key.meta) {
      const next = value.slice(0, cursor) + '\n' + value.slice(cursor)
      onChange(next)
      setCursor(cursor + 1)
      return
    }

    if (key.leftArrow) {
      setCursor(Math.max(0, cursor - 1))
      return
    }

    if (key.rightArrow) {
      setCursor(Math.min(value.length, cursor + 1))
      return
    }

    if (key.upArrow) {
      const before = value.slice(0, cursor)
      const lastNl = before.lastIndexOf('\n')
      if (lastNl === -1) return
      const col = cursor - lastNl - 1
      const prevStart = before.lastIndexOf('\n', lastNl - 1) + 1
      const prevLen = lastNl - prevStart
      setCursor(prevStart + Math.min(col, prevLen))
      return
    }

    if (key.downArrow) {
      const before = value.slice(0, cursor)
      const lineStart = before.lastIndexOf('\n') + 1
      const col = cursor - lineStart
      const nextNl = value.indexOf('\n', cursor)
      if (nextNl === -1) return
      const nextStart = nextNl + 1
      const nextEnd = value.indexOf('\n', nextStart)
      const nextLen = (nextEnd === -1 ? value.length : nextEnd) - nextStart
      setCursor(nextStart + Math.min(col, nextLen))
      return
    }

    if (input) {
      const filtered = input.replace(/[\x00-\x1f]/g, '')
      if (filtered) {
        onChange(value.slice(0, cursor) + filtered + value.slice(cursor))
        setCursor(cursor + filtered.length)
      }
    }
  })

  if (!value) {
    return (
      <Text>
        <Text color="dim">{placeholder || ''}</Text>
        <Text inverse> </Text>
      </Text>
    )
  }

  const lines = value.split('\n')
  const lineStarts: number[] = []
  let off = 0
  for (const line of lines) {
    lineStarts.push(off)
    off += line.length + 1
  }

  return (
    <Box flexDirection="column">
      {lines.map((line, i) => {
        const start = lineStarts[i]
        const inLine = cursor >= start && cursor <= start + line.length
        if (!inLine) {
          return <Text key={i}>{line || ' '}</Text>
        }
        const col = cursor - start
        const before = line.slice(0, col)
        const cursorChar = col < line.length ? line[col] : ' '
        const after = col < line.length ? line.slice(col + 1) : ''
        return (
          <Text key={i}>
            {before}
            <Text inverse>{cursorChar}</Text>
            {after}
          </Text>
        )
      })}
    </Box>
  )
}

export default TextArea
