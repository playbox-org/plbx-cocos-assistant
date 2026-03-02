export type QueryDependenciesFn = (uuid: string) => Promise<string[]>;

export interface DependencyResult {
  referencedUuids: Set<string>;
  sceneUuids: string[];
}

export interface ResolveOptions {
  maxConcurrency?: number;
  maxDepth?: number;
}

/**
 * Recursively resolve all asset dependencies starting from scene UUIDs.
 * Uses BFS with visited set to prevent cycles and configurable depth limit.
 */
export async function resolveSceneDependencies(
  sceneUuids: string[],
  queryDeps: QueryDependenciesFn,
  options?: ResolveOptions,
): Promise<DependencyResult> {
  const maxDepth = options?.maxDepth ?? 100;
  const maxConcurrency = options?.maxConcurrency ?? 10;

  const visited = new Set<string>();
  // BFS queue: [uuid, depth]
  let queue: Array<{ uuid: string; depth: number }> = sceneUuids.map(uuid => ({ uuid, depth: 0 }));

  while (queue.length > 0) {
    // Take a batch up to maxConcurrency, filtering already-visited and too-deep
    const batch = queue.splice(0, maxConcurrency)
      .filter(item => !visited.has(item.uuid) && item.depth <= maxDepth);

    if (batch.length === 0) continue;

    // Mark as visited before querying (prevents re-queuing)
    for (const item of batch) {
      visited.add(item.uuid);
    }

    // Query dependencies in parallel
    const results = await Promise.allSettled(
      batch.map(async (item) => {
        const deps = await queryDeps(item.uuid);
        return { uuid: item.uuid, depth: item.depth, deps };
      }),
    );

    // Enqueue discovered dependencies
    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      const { depth, deps } = result.value;
      const nextDepth = depth + 1;

      for (const depUuid of deps) {
        if (!visited.has(depUuid) && nextDepth <= maxDepth) {
          queue.push({ uuid: depUuid, depth: nextDepth });
        }
      }
    }
  }

  return {
    referencedUuids: visited,
    sceneUuids: [...sceneUuids],
  };
}
