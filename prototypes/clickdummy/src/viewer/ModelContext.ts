import { createContext, useContext } from 'react';

import type { ViewerModel } from './model';
import type { ModelState } from './useModel';

export const ModelContext = createContext<ModelState>({ status: 'loading' });

export function useModelState(): ModelState {
  return useContext(ModelContext);
}

export function useReadyModel(): ViewerModel | null {
  const state = useModelState();
  return state.status === 'ready' ? state.model : null;
}
