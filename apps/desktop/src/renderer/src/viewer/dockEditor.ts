import { useEffect } from 'react';
import { create } from 'zustand';

/** Which editor in the dock is open; opening one closes the others (audit B-06: one at a time). */
const useDockEditor = create<{ open: string | null }>(() => ({ open: null }));

/** Takes the dock for `name` while `isOpen`, and calls `close` when another editor takes it. */
export function useOneEditor(name: string, isOpen: boolean, close: () => void): void {
  const current = useDockEditor((s) => s.open);
  useEffect(() => {
    if (isOpen) useDockEditor.setState({ open: name });
  }, [isOpen, name]);
  useEffect(() => {
    if (isOpen && current !== null && current !== name) close();
  }, [current, isOpen, name, close]);
}
