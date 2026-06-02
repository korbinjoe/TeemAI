import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Send, Loader2 } from 'lucide-react'
import { API_BASE, authFetch } from '@/config/api'
import { getWebSocketClient } from '@/services/WebSocketClient'
import { cn } from '@/lib/utils'

interface WorkspaceLite {
  id: string
  name: string
}

const MobileDispatch = () => {
  const navigate = useNavigate()
  const [workspaces, setWorkspaces] = useState<WorkspaceLite[]>([])
  const [selectedWsId, setSelectedWsId] = useState<string>('')
  const [prompt, setPrompt] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    authFetch(`${API_BASE}/api/workspaces`)
      .then((r) => r.ok ? r.json() : [])
      .then((ws: WorkspaceLite[]) => {
        setWorkspaces(ws)
        if (ws.length > 0) setSelectedWsId(ws[0].id)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleSend = useCallback(async () => {
    if (!selectedWsId || !prompt.trim() || sending) return
    setSending(true)
    try {
      const res = await authFetch(`${API_BASE}/api/workspaces/${selectedWsId}/chats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: prompt.trim().slice(0, 60) }),
      })
      if (!res.ok) throw new Error('Failed to create mission')
      const chat = await res.json()
      const ws = getWebSocketClient()
      await ws.connect()
      ws.send('expert:user-input', { chatId: chat.id, text: prompt.trim() })
      navigate(`/mobile/mission/${chat.id}`)
    } catch {
      setSending(false)
    }
  }, [selectedWsId, prompt, sending, navigate])

  if (loading) {
    return (
      <div className="px-4 pt-4">
        <p className="text-sm text-text-secondary">Loading...</p>
      </div>
    )
  }

  if (workspaces.length === 0) {
    return (
      <div className="px-4 pt-4">
        <h1 className="text-lg font-semibold text-text-primary">New Mission</h1>
        <p className="mt-2 text-sm text-text-secondary">No workspaces available. Create one on your desktop first.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full px-4 pt-4 pb-4">
      <h1 className="text-lg font-semibold text-text-primary mb-4">New Mission</h1>

      <div className="mb-3">
        <label className="block text-[11px] font-medium text-text-secondary mb-1.5">Workspace</label>
        <select
          value={selectedWsId}
          onChange={(e) => setSelectedWsId(e.target.value)}
          className="w-full rounded-lg border border-border-subtle bg-bg-secondary px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent-brand"
        >
          {workspaces.map((ws) => (
            <option key={ws.id} value={ws.id}>{ws.name}</option>
          ))}
        </select>
      </div>

      <div className="flex-1 mb-3">
        <label className="block text-[11px] font-medium text-text-secondary mb-1.5">Prompt</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe what you want done..."
          className="w-full h-32 rounded-lg border border-border-subtle bg-bg-secondary px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-accent-brand resize-none"
        />
      </div>

      <button
        type="button"
        onClick={handleSend}
        disabled={!prompt.trim() || sending}
        className={cn(
          'flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-colors',
          prompt.trim() && !sending
            ? 'bg-accent-brand text-white'
            : 'bg-bg-secondary text-text-muted cursor-not-allowed',
        )}
      >
        {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        {sending ? 'Dispatching...' : 'Dispatch Mission'}
      </button>
    </div>
  )
}

export default MobileDispatch
