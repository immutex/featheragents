import { create } from 'zustand';

import type { EventEntry } from '@/data/mock';

type EventStore = {
  events: EventEntry[];
  push: (event: EventEntry) => void;
  replace: (events: EventEntry[]) => void;
  clear: () => void;
};

export const useEventStore = create<EventStore>((set) => ({
  events: [],
  push: (event) => set((state) => ({
    events: [event, ...state.events.filter((entry) => entry.id !== event.id)].slice(0, 100),
  })),
  replace: (events) => set({ events: events.slice(0, 100) }),
  clear: () => set({ events: [] }),
}));
