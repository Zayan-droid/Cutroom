import { create } from 'zustand';

export type ToastTone = 'default' | 'success' | 'danger';
export interface Toast {
  id: string;
  text: string;
  tone: ToastTone;
}

interface ToastState {
  toasts: Toast[];
  push: (text: string, tone?: ToastTone) => void;
  dismiss: (id: string) => void;
}

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (text, tone = 'default') => {
    const id = Math.random().toString(36).slice(2);
    set((s) => ({ toasts: [...s.toasts, { id, text, tone }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 2600);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

// Callable outside React (used by the mock store for micro-feedback).
export const toast = (text: string, tone?: ToastTone) => useToasts.getState().push(text, tone);
