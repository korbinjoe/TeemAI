import { useEffect, useState } from 'react'
import type { DirEntry } from '../components/home/types'
import { authFetch } from '@/config/api'

export const useDirPicker = (dirHistory: string[]) => {
  const [dirModalOpen, setDirModalOpen] = useState(false)
  const [homeDir, setHomeDir] = useState('/')
  const [browsePath, setBrowsePath] = useState('/')
  const [dirs, setDirs] = useState<DirEntry[]>([])
  const [loadingDirs, setLoadingDirs] = useState(false)
  const [dirSearch, setDirSearch] = useState('')
  const [searchResults, setSearchResults] = useState<DirEntry[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [newFolderMode, setNewFolderMode] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [newFolderError, setNewFolderError] = useState('')
  const [pickingForCreateWs, setPickingForCreateWs] = useState(false)

  // Fetch homeDir
  useEffect(() => {
    authFetch('/api/home-dir')
      .then((res) => res.ok ? res.json() : Promise.reject(new Error()))
      .then((data: { home?: string }) => {
        setHomeDir(data.home || '/')
      })
      .catch(() => {})
  }, [])

  const loadDirs = async (path: string) => {
    setLoadingDirs(true)
    try {
      const res = await authFetch(`/api/list-dirs?path=${encodeURIComponent(path)}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setDirs(data.dirs ?? [])
      setBrowsePath(data.parent ?? path)
    } catch {
      setDirs([])
    } finally {
      setLoadingDirs(false)
    }
  }

  const openDirPicker = async () => {
    const startPath = dirHistory[0] || homeDir || '/'
    setDirModalOpen(true)
    setDirSearch('')
    setSearchResults([])
    setNewFolderMode(false)
    setNewFolderName('')
    setNewFolderError('')
    await loadDirs(startPath)
  }

  const openDirPickerForCreateWs = async () => {
    setPickingForCreateWs(true)
    const startPath = dirHistory[0] || homeDir || '/'
    setDirModalOpen(true)
    setDirSearch('')
    setSearchResults([])
    setNewFolderMode(false)
    setNewFolderName('')
    setNewFolderError('')
    await loadDirs(startPath)
  }

  const handleCreateFolder = async (onPick: (path: string) => void) => {
    const name = newFolderName.trim()
    if (!name) return
    const fullPath = `${browsePath}/${name}`.replace(/\/+/g, '/')
    try {
      const res = await authFetch('/api/mkdir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: fullPath }),
      })
      if (!res.ok) {
        const data = await res.json()
        setNewFolderError(data.error || 'Failed to create folder')
        return
      }
      setNewFolderMode(false)
      setNewFolderName('')
      setNewFolderError('')
      await loadDirs(browsePath)
      onPick(fullPath)
    } catch {
      setNewFolderError('Network error')
    }
  }

  useEffect(() => {
    if (!dirModalOpen) return
    const keyword = dirSearch.trim()
    if (!keyword) {
      setSearchResults([])
      setSearchLoading(false)
      return
    }
    const timer = setTimeout(async () => {
      setSearchLoading(true)
      try {
        const params = new URLSearchParams({ q: keyword, root: homeDir || '/' })
        const res = await authFetch(`/api/search-dirs?${params.toString()}`)
        if (!res.ok) throw new Error()
        const data = await res.json()
        setSearchResults(data.results ?? [])
      } catch {
        setSearchResults([])
      } finally {
        setSearchLoading(false)
      }
    }, 220)
    return () => clearTimeout(timer)
  }, [dirModalOpen, dirSearch, homeDir])

  return {
    dirModalOpen, setDirModalOpen,
    homeDir,
    browsePath,
    dirs,
    loadingDirs,
    dirSearch, setDirSearch,
    searchResults,
    searchLoading,
    newFolderMode, setNewFolderMode,
    newFolderName, setNewFolderName,
    newFolderError, setNewFolderError,
    pickingForCreateWs, setPickingForCreateWs,
    loadDirs,
    openDirPicker,
    openDirPickerForCreateWs,
    handleCreateFolder,
  }
}
