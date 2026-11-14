"use client";

import type { QueryKey } from "@tanstack/react-query";
import { useOptimisticMutation } from "@/lib/use-optimistic-mutation";

type CrudOptions<TItem extends { id: number }, TInput> = {
  queryKey: QueryKey;
  create: (input: TInput) => Promise<unknown>;
  update: (id: number, input: TInput) => Promise<unknown>;
  remove: (id: number) => Promise<unknown>;
  optimisticCreate: (input: TInput) => TItem;
  optimisticUpdate: (item: TItem, input: TInput) => TItem;
};

export function useCrud<TItem extends { id: number }, TInput>({
  queryKey,
  create,
  update,
  remove,
  optimisticCreate,
  optimisticUpdate,
}: CrudOptions<TItem, TInput>) {
  const save = useOptimisticMutation<TItem[], { id: number | null; input: TInput }>({
    queryKey,
    mutationFn: ({ id, input }: { id: number | null; input: TInput }) =>
      id === null ? create(input) : update(id, input),
    optimisticUpdate: (current, { id, input }) =>
      id === null
        ? [optimisticCreate(input), ...current]
        : current.map((item) => (item.id === id ? optimisticUpdate(item, input) : item)),
  });
  const destroy = useOptimisticMutation<TItem[], number>({
    queryKey,
    mutationFn: (id: number) => remove(id),
    optimisticUpdate: (current, id) => current.filter((item) => item.id !== id),
  });
  return { save, destroy };
}
