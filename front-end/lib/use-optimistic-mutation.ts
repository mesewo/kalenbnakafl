"use client";

import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";

type OptimisticMutationOptions<TData, TVariables> = {
  queryKey: QueryKey;
  invalidateQueryKey?: QueryKey;
  mutationFn: (variables: TVariables) => Promise<unknown>;
  optimisticUpdate: (current: TData, variables: TVariables) => TData;
  onError?: (error: unknown, variables: TVariables) => void;
  onSuccess?: (variables: TVariables) => void;
};

export function useOptimisticMutation<TData, TVariables>({
  queryKey,
  invalidateQueryKey = queryKey,
  mutationFn,
  optimisticUpdate,
  onError,
  onSuccess,
}: OptimisticMutationOptions<TData, TVariables>) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<TData>(queryKey);
      if (previous !== undefined) {
        queryClient.setQueryData<TData>(queryKey, optimisticUpdate(previous, variables));
      }
      return { previous };
    },
    onError: (error, variables, context) => {
      if (context?.previous !== undefined) queryClient.setQueryData(queryKey, context.previous);
      onError?.(error, variables);
    },
    onSuccess: (_result, variables) => onSuccess?.(variables),
    onSettled: () => queryClient.invalidateQueries({ queryKey: invalidateQueryKey }),
  });
}
