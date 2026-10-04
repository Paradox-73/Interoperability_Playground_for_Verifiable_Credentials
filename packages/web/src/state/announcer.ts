/**
 * Messages for screen-reader users, read out by the polite live region in the app shell
 * (<LiveAnnouncer />). Any component can announce; only the latest message is kept, because live
 * regions read changes, not history.
 */
import { create } from 'zustand';

interface AnnouncerState {
  message: string;
  /** Increases on every announcement, so repeating the same text is still read again. */
  sequence: number;
  announce: (message: string) => void;
}

export const useAnnouncer = create<AnnouncerState>()((set) => ({
  message: '',
  sequence: 0,
  announce: (message) => set((state) => ({ message, sequence: state.sequence + 1 })),
}));

export function announce(message: string): void {
  useAnnouncer.getState().announce(message);
}

export function resetAnnouncer(): void {
  useAnnouncer.setState({ message: '', sequence: 0 });
}
