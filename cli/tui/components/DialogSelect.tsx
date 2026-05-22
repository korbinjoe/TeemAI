/**
 * DialogSelect —
 *
 *  OpenCode dialog-select
 * - category
 * - ↑↓  + Enter  + Esc
 */

import React, { useState, useMemo } from 'react'
import { Box, Text, useInput } from 'ink'

export interface DialogSelectOption<T = string> {
  label: string
  value: T
  description?: string
  icon?: string
  footer?: string
  category?: string
}

interface DialogSelectProps<T> {
  title: string
  options: DialogSelectOption<T>[]
  onSelect: (value: T) => void
  onCancel: () => void
  initialIndex?: number
}

const fuzzyMatch = (text: string, query: string): boolean => {
  const lower = text.toLowerCase()
  const q = query.toLowerCase()
  let qi = 0
  for (let i = 0; i < lower.length && qi < q.length; i++) {
    if (lower[i] === q[qi]) qi++
  }
  return qi === q.length
}

function DialogSelect<T>({ title, options, onSelect, onCancel, initialIndex = 0 }: DialogSelectProps<T>) {
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState(initialIndex)

  const filtered = useMemo(() => {
    if (!filter) return options
    return options.filter((o) =>
      fuzzyMatch(o.label, filter) ||
      fuzzyMatch(o.description ?? '', filter) ||
      fuzzyMatch(o.category ?? '', filter)
    )
  }, [options, filter])

  const grouped = useMemo(() => {
    const groups: { category: string; items: (DialogSelectOption<T> & { flatIndex: number })[] }[] = []
    const map = new Map<string, (DialogSelectOption<T> & { flatIndex: number })[]>()
    let flatIndex = 0

    for (const opt of filtered) {
      const cat = opt.category ?? ''
      if (!map.has(cat)) {
        const items: (DialogSelectOption<T> & { flatIndex: number })[] = []
        map.set(cat, items)
        groups.push({ category: cat, items })
      }
      map.get(cat)!.push({ ...opt, flatIndex })
      flatIndex++
    }
    return groups
  }, [filtered])

  useInput((input, key) => {
    if (key.escape) {
      onCancel()
      return
    }

    if (key.return) {
      const item = filtered[selected]
      if (item) onSelect(item.value)
      return
    }

    if (key.upArrow) {
      setSelected((s) => (s - 1 + filtered.length) % filtered.length)
      return
    }

    if (key.downArrow) {
      setSelected((s) => (s + 1) % filtered.length)
      return
    }

    if (key.backspace || key.delete) {
      setFilter((f) => f.slice(0, -1))
      setSelected(0)
      return
    }

    const digit = parseInt(input)
    if (!isNaN(digit) && digit >= 1 && digit <= 9 && digit <= filtered.length && !filter) {
      const item = filtered[digit - 1]
      if (item) onSelect(item.value)
      return
    }

    if (input && input.length === 1 && input.charCodeAt(0) >= 0x20) {
      setFilter((f) => f + input)
      setSelected(0)
    }
  })

  const termWidth = process.stdout.columns || 80
  const boxWidth = Math.min(60, termWidth - 4)

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      width={boxWidth}
      paddingX={1}
    >
      {/* Header */}
      <Box justifyContent="space-between">
        <Text bold color="cyan">{title}</Text>
        <Text color="dim">{filtered.length} items</Text>
      </Box>

      {/* Search */}
      {filter ? (
        <Box marginTop={1}>
          <Text color="dim">{'> '}</Text>
          <Text>{filter}</Text>
          <Text color="dim">▏</Text>
        </Box>
      ) : (
        <Box marginTop={1}>
          <Text color="dim">{'> Type to filter...'}</Text>
        </Box>
      )}

      {/* Options */}
      <Box flexDirection="column" marginTop={1}>
        {grouped.map(({ category, items }) => (
          <Box key={category} flexDirection="column">
            {category && (
              <Box marginTop={items[0]?.flatIndex === 0 ? 0 : 1}>
                <Text color="dim" dimColor>{category}</Text>
              </Box>
            )}
            {items.map((opt) => {
              const isSelected = opt.flatIndex === selected
              const idx = opt.flatIndex + 1
              return (
                <Box key={String(opt.value)} justifyContent="space-between">
                  <Box>
                    <Text color={isSelected ? 'cyan' : 'dim'}>
                      {isSelected ? '› ' : '  '}
                    </Text>
                    {!filter && idx <= 9 && (
                      <Text color="dim">{idx}. </Text>
                    )}
                    {opt.icon && <Text>{opt.icon} </Text>}
                    <Text bold={isSelected} color={isSelected ? 'white' : undefined}>
                      {opt.label}
                    </Text>
                    {opt.description && (
                      <Text color="dim">  {opt.description}</Text>
                    )}
                  </Box>
                  {opt.footer && (
                    <Text color="dim">{opt.footer}</Text>
                  )}
                </Box>
              )
            })}
          </Box>
        ))}
        {filtered.length === 0 && (
          <Text color="dim">  No matches</Text>
        )}
      </Box>

      {/* Footer */}
      <Box marginTop={1} justifyContent="space-between">
        <Box gap={2}>
          <Text><Text color="white">↑↓</Text> <Text color="dim">select</Text></Text>
          <Text><Text color="white">enter</Text> <Text color="dim">confirm</Text></Text>
          <Text><Text color="white">esc</Text> <Text color="dim">cancel</Text></Text>
        </Box>
      </Box>
    </Box>
  )
}

export default DialogSelect
