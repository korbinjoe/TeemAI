import type { QueuedMessage } from '../types/chat'

const store = new Map<string, QueuedMessage[]>()

export const chatQueueStore = {
  get: (chatId: string): QueuedMessage[] => store.get(chatId) ?? [],
  set: (chatId: string, queue: QueuedMessage[]) => {
    if (queue.length === 0) store.delete(chatId)
    else store.set(chatId, queue)
  },
}
