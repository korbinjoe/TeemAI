import { useState } from 'react'
import QueuedMessagesBar from '@/components/chat/input/QueuedMessagesBar'
import type { QueuedMessage } from '@/types/chat'

const mk = (id: string, text: string, mentions = 0, images = 0): QueuedMessage => ({
  id,
  text,
  mentions: Array.from({ length: mentions }, (_, i) => ({ id: `m${i}`, name: `agent${i}` })),
  images: Array.from({ length: images }, () => ({ data: '', mediaType: 'image/png', preview: '' })),
  targetAgentId: null,
  enqueuedAt: Date.now(),
})

const SHORT: QueuedMessage[] = [
  mk('1', 'First queued message: Test styling'),
  mk('2', 'Second longer message, check truncation and overflow rendering, need long enough to trigger truncate'),
  mk('3', 'Third message with mention', 2, 0),
  mk('4', 'Short', 0, 0),
  mk('5', 'Fifth message with image attachments demo', 1, 3),
]

const LONG_LIST: QueuedMessage[] = Array.from({ length: 12 }, (_, i) =>
  mk(`L${i}`, `This is message ${i + 1} with a very very very very very very very very very very very very long text, used to test list overflow scrolling`, i % 3, i % 4),
)

const QueuedMessagesBarDemo = () => {
  const [a, setA] = useState(SHORT)
  const [b, setB] = useState(LONG_LIST)
  const [c, setC] = useState<QueuedMessage[]>([mk('only', 'Only one message in queue')])
  const [d, setD] = useState(SHORT)
  return (
    <div className="min-h-screen bg-bg-base p-6 space-y-6 text-text-primary">
      <h1 className="text-lg font-medium">QueuedMessagesBar Demo</h1>

      <section>
        <p className="text-text-muted text-xs mb-2">A. Standard 5 items (with long text + mention + image)</p>
        <QueuedMessagesBar queue={a} onRemove={(id) => setA((q) => q.filter((m) => m.id !== id))} onClear={() => setA([])} />
      </section>

      <section>
        <p className="text-text-muted text-xs mb-2">B. 12 items (triggers scrolling)</p>
        <QueuedMessagesBar queue={b} onRemove={(id) => setB((q) => q.filter((m) => m.id !== id))} onClear={() => setB([])} />
      </section>

      <section>
        <p className="text-text-muted text-xs mb-2">C. Single item</p>
        <QueuedMessagesBar queue={c} onRemove={(id) => setC((q) => q.filter((m) => m.id !== id))} onClear={() => setC([])} />
      </section>

      <section>
        <p className="text-text-muted text-xs mb-2">D. Narrow container (simulating real width above input ~ 720px)</p>
        <div className="max-w-[720px]">
          <QueuedMessagesBar queue={d} onRemove={(id) => setD((q) => q.filter((m) => m.id !== id))} onClear={() => setD([])} />
        </div>
      </section>
    </div>
  )
}

export default QueuedMessagesBarDemo
