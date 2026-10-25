// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * The page's polite live region. Screen readers read each new announcement (finished steps, run
 * results) without moving focus. The region exists from the first render, as live regions must.
 */
import { useAnnouncer } from '../state/announcer';

export function LiveAnnouncer() {
  const message = useAnnouncer((state) => state.message);
  const sequence = useAnnouncer((state) => state.sequence);
  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only" data-testid="live-announcer">
      {/* The key makes React replace the text node, so an identical message is read again. */}
      <span key={sequence}>{message}</span>
    </div>
  );
}
