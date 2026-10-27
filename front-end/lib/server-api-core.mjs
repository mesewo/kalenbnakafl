export async function withBuildFallback(fetcher, isBuildPhase, isUnavailable) {
  try {
    return await fetcher();
  } catch (error) {
    if (isBuildPhase && isUnavailable(error)) return null;
    throw error;
  }
}

export async function withEmptyArrayOnFailure(fetcher) {
  try {
    return await fetcher();
  } catch {
    return [];
  }
}
