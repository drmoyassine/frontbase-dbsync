import { create } from 'zustand';

interface HistoryState {
    past: any[];
    present: any | null;
    future: any[];
}

interface HistoryStore extends HistoryState {
    // Actions
    pushState: (state: any) => void;
    undo: () => any | null;
    redo: () => any | null;
    canUndo: () => boolean;
    canRedo: () => boolean;
    clear: () => void;
}

const MAX_HISTORY_SIZE = 50;

export const useHistoryStore = create<HistoryStore>((set, get) => ({
    past: [],
    present: null,
    future: [],

    pushState: (newState) => {
        set((state) => {
            const newPast = [...state.past, state.present].filter(s => s !== null);

            // Limit history size
            if (newPast.length > MAX_HISTORY_SIZE) {
                newPast.shift();
            }

            return {
                past: newPast,
                present: newState,
                future: [] // Clear future when new state is pushed
            };
        });
    },

    undo: () => {
        const { past, present, future } = get();

        if (past.length === 0) return null;

        const previous = past[past.length - 1];
        const newPast = past.slice(0, past.length - 1);

        set({
            past: newPast,
            present: previous,
            future: present ? [present, ...future] : future
        });

        return previous;
    },

    redo: () => {
        const { past, present, future } = get();

        if (future.length === 0) return null;

        const next = future[0];
        const newFuture = future.slice(1);

        set({
            past: present ? [...past, present] : past,
            present: next,
            future: newFuture
        });

        return next;
    },

    canUndo: () => get().past.length > 0,
    canRedo: () => get().future.length > 0,

    clear: () => set({ past: [], present: null, future: [] })
}));
