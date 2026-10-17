import { create } from 'zustand'

type View = { name: 'shelf' } | { name: 'reader'; bookId: string }

const LEAVE_MS = 220

interface AppState {
  view: View
  /** El lector se está desvaneciendo y la biblioteca ya se ve debajo. */
  leaving: boolean
  openBook(bookId: string): void
  closeBook(): void
}

export const useApp = create<AppState>((set, get) => ({
  view: { name: 'shelf' },
  leaving: false,
  openBook: bookId => set({ view: { name: 'reader', bookId }, leaving: false }),
  closeBook() {
    if (get().leaving) return
    set({ leaving: true })
    setTimeout(() => set({ view: { name: 'shelf' }, leaving: false }), LEAVE_MS)
  },
}))
