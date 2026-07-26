import { useCallback, useReducer } from 'react';

interface HistoryState<T> {
  baseline: T;
  past: T[];
  present: T;
  future: T[];
}

type HistoryAction<T> =
  | { type: 'set'; value: T }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'reset' }
  | { type: 'replace'; value: T }
  | { type: 'commit' };

const MAX_HISTORY = 80;

const createState = <T,>(value: T): HistoryState<T> => ({
  baseline: value,
  past: [],
  present: value,
  future: []
});

const historyReducer = <T,>(state: HistoryState<T>, action: HistoryAction<T>): HistoryState<T> => {
  switch (action.type) {
    case 'set':
      if (Object.is(action.value, state.present)) return state;
      return {
        ...state,
        past: [...state.past.slice(-(MAX_HISTORY - 1)), state.present],
        present: action.value,
        future: []
      };
    case 'undo': {
      const previous = state.past.at(-1);
      if (previous === undefined) return state;
      return {
        ...state,
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future]
      };
    }
    case 'redo': {
      const next = state.future[0];
      if (next === undefined) return state;
      return {
        ...state,
        past: [...state.past, state.present],
        present: next,
        future: state.future.slice(1)
      };
    }
    case 'reset':
      if (Object.is(state.present, state.baseline)) return state;
      return {
        ...state,
        past: [...state.past.slice(-(MAX_HISTORY - 1)), state.present],
        present: state.baseline,
        future: []
      };
    case 'replace':
      return createState(action.value);
    case 'commit':
      return { baseline: state.present, past: [], present: state.present, future: [] };
    default:
      return state;
  }
};

export const useUndoableState = <T,>(initialValue: T) => {
  const [state, dispatch] = useReducer(historyReducer<T>, initialValue, createState<T>);

  const set = useCallback((value: T | ((current: T) => T)) => {
    const nextValue = typeof value === 'function'
      ? (value as (current: T) => T)(state.present)
      : value;
    dispatch({ type: 'set', value: nextValue });
  }, [state.present]);

  return {
    value: state.present,
    set,
    undo: useCallback(() => dispatch({ type: 'undo' }), []),
    redo: useCallback(() => dispatch({ type: 'redo' }), []),
    reset: useCallback(() => dispatch({ type: 'reset' }), []),
    replace: useCallback((value: T) => dispatch({ type: 'replace', value }), []),
    commit: useCallback(() => dispatch({ type: 'commit' }), []),
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    undoValue: state.past.at(-1),
    redoValue: state.future[0],
    isDirty: !Object.is(state.present, state.baseline)
  };
};
