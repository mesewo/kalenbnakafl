export function withBuildFallback<T>(
  fetcher: () => Promise<T>,
  isBuildPhase: boolean,
  isUnavailable: (error: unknown) => boolean,
): Promise<T | null>;
export function withEmptyArrayOnFailure<T>(fetcher: () => Promise<T[]>): Promise<T[]>;
