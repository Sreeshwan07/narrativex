import { useCallback, useEffect, useRef, useState } from "react";
import type { Deck } from "@/lib/deck/schema";
import { loadDraft, saveDraft } from "@/lib/deck/editing";

const LIMIT = 60;

/**
 * Editable deck state with undo/redo and localStorage persistence.
 * The generated deck seeds the state; every export reads from here.
 */
export function useDeckEditor(generated: Deck) {
  const [deck, setDeck] = useState<Deck>(generated);
  const past = useRef<Deck[]>([]);
  const future = useRef<Deck[]>([]);
  const [version, setVersion] = useState(0);

  // Restore a draft for this same generated deck after a refresh.
  useEffect(() => {
    const draft = loadDraft();
    if (draft && draft.generatedAt === generated.generatedAt) setDeck(draft);
    else setDeck(generated);
    past.current = [];
    future.current = [];
    setVersion((v) => v + 1);
  }, [generated]);

  useEffect(() => {
    saveDraft(deck);
  }, [deck]);

  const commit = useCallback((next: Deck | ((current: Deck) => Deck)) => {
    setDeck((current) => {
      const resolved = typeof next === "function" ? next(current) : next;
      if (resolved === current) return current;
      past.current = [...past.current, current].slice(-LIMIT);
      future.current = [];
      return resolved;
    });
    setVersion((v) => v + 1);
  }, []);

  const undo = useCallback(() => {
    setDeck((current) => {
      const prev = past.current[past.current.length - 1];
      if (!prev) return current;
      past.current = past.current.slice(0, -1);
      future.current = [current, ...future.current].slice(0, LIMIT);
      return prev;
    });
    setVersion((v) => v + 1);
  }, []);

  const redo = useCallback(() => {
    setDeck((current) => {
      const next = future.current[0];
      if (!next) return current;
      future.current = future.current.slice(1);
      past.current = [...past.current, current].slice(-LIMIT);
      return next;
    });
    setVersion((v) => v + 1);
  }, []);

  return {
    deck,
    commit,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
    /** Changes whenever history moves — used to re-render toolbar state. */
    version,
  };
}
