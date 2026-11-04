import { useEffect } from 'react';

import { platform } from '../platform';
import { useStudio } from '../state/store';

/** Keeps the store's variants in step with the main process (M2c, ADR 0021). */
export function useVariantsBridge(): void {
  const setVariants = useStudio((s) => s.setVariants);
  useEffect(() => {
    const api = platform().variants;
    const off = api.onChange(setVariants);
    void api
      .current()
      .then(setVariants)
      .catch(() => undefined);
    return off;
  }, [setVariants]);
}
