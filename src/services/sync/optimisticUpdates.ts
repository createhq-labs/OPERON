export type OptimisticUpdate<T> = {
  rollback: () => void;
  commit: () => void;
};

export function withOptimisticUpdate<T>(action: () => T, rollback: () => void): OptimisticUpdate<T> {
  const result = action();
  return {
    commit: () => {
      // no-op commit path for optimistic persistence
    },
    rollback,
  };
}
