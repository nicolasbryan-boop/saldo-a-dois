'use client';

import { useState } from 'react';

/**
 * Local state that resets when `resetKey` changes.
 *
 * This is the "adjusting state when a prop changes" pattern from the React
 * docs: the comparison happens during render and the re-render is discarded
 * before anything is painted. Doing the same work in an effect would render
 * once with the stale value, then again with the fresh one — visible as a
 * flash of the previous item's data when a sheet is reopened for a different
 * row, which is exactly the bug this avoids.
 *
 * @param initial   value to (re)start from
 * @param resetKey  identity of what the state belongs to, e.g. a row id
 */
export function useResettableState<T>(
  initial: T,
  resetKey: unknown,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(initial);
  const [seenKey, setSeenKey] = useState(resetKey);

  if (!Object.is(seenKey, resetKey)) {
    setSeenKey(resetKey);
    setValue(initial);
  }

  return [value, setValue];
}
