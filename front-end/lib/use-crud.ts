"use client";

import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";

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
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: ({ id, input }: { id: number | null; input: TInput }) =>
      id === null ? create(input) : update(id, input),
    onMutate: async ({ id, input }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<TItem[]>(queryKey);
      queryClient.setQueryData<TItem[]>(queryKey, (current = []) =>
        id === null
          ? [optimisticCreate(input), ...current]
          : current.map((item) => (item.id === id ? optimisticUpdate(item, input) : item)),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });
  const destroy = useMutation({
    mutationFn: (id: number) => remove(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<TItem[]>(queryKey);
      queryClient.setQueryData<TItem[]>(queryKey, (current = []) =>
        current.filter((item) => item.id !== id),
      );
      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });
  return { save, destroy };
}
