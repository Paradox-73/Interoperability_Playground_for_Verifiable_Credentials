/**
 * Runs the playback reducer with a timer: while playing, the next event is shown after the pause
 * `delayBefore` computes from the recorded timestamps.
 */
import type { RunEvent } from '@inji-playground/protocol';
import { useEffect, useReducer } from 'react';
import { delayBefore, initialPlayer, playerReducer, type PlayerAction, type PlayerState } from './player';

export function usePlayer(events: readonly RunEvent[]): [PlayerState, (action: PlayerAction) => void] {
  const [state, dispatch] = useReducer(playerReducer, events.length, initialPlayer);

  useEffect(() => {
    dispatch({ type: 'load', total: events.length });
  }, [events]);

  useEffect(() => {
    if (!state.playing || state.position >= state.total) return;
    const timer = setTimeout(
      () => dispatch({ type: 'tick' }),
      delayBefore(events, state.position, state.speed),
    );
    return () => clearTimeout(timer);
  }, [state.playing, state.position, state.total, state.speed, events]);

  return [state, dispatch];
}
