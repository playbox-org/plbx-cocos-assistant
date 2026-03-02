import { describe, it, expect, vi } from 'vitest';
import { resolveSceneDependencies, QueryDependenciesFn } from '../../../src/core/build-report/dependency-resolver';

describe('resolveSceneDependencies', () => {
  it('should return scene UUIDs in the result', async () => {
    const queryDeps: QueryDependenciesFn = vi.fn().mockResolvedValue([]);
    const result = await resolveSceneDependencies(['scene-uuid-1'], queryDeps);

    expect(result.sceneUuids).toEqual(['scene-uuid-1']);
    expect(result.referencedUuids.has('scene-uuid-1')).toBe(true);
  });

  it('should recursively collect dependencies', async () => {
    const deps: Record<string, string[]> = {
      'scene-1': ['prefab-1', 'texture-1'],
      'prefab-1': ['material-1', 'texture-2'],
      'material-1': [],
      'texture-1': [],
      'texture-2': [],
    };
    const queryDeps: QueryDependenciesFn = vi.fn(async (uuid: string) => deps[uuid] ?? []);

    const result = await resolveSceneDependencies(['scene-1'], queryDeps);

    expect(result.referencedUuids).toEqual(
      new Set(['scene-1', 'prefab-1', 'texture-1', 'material-1', 'texture-2']),
    );
  });

  it('should handle circular dependencies without infinite loop', async () => {
    const deps: Record<string, string[]> = {
      'a': ['b'],
      'b': ['c'],
      'c': ['a'], // cycle!
    };
    const queryDeps: QueryDependenciesFn = vi.fn(async (uuid: string) => deps[uuid] ?? []);

    const result = await resolveSceneDependencies(['a'], queryDeps);
    expect(result.referencedUuids).toEqual(new Set(['a', 'b', 'c']));
  });

  it('should handle multiple scenes', async () => {
    const deps: Record<string, string[]> = {
      'scene-1': ['texture-1'],
      'scene-2': ['texture-2'],
      'texture-1': [],
      'texture-2': [],
    };
    const queryDeps: QueryDependenciesFn = vi.fn(async (uuid: string) => deps[uuid] ?? []);

    const result = await resolveSceneDependencies(['scene-1', 'scene-2'], queryDeps);
    expect(result.referencedUuids).toEqual(
      new Set(['scene-1', 'scene-2', 'texture-1', 'texture-2']),
    );
  });

  it('should handle query errors gracefully', async () => {
    const queryDeps: QueryDependenciesFn = vi.fn().mockRejectedValue(new Error('API error'));
    const result = await resolveSceneDependencies(['scene-1'], queryDeps);

    expect(result.referencedUuids.has('scene-1')).toBe(true);
    // Should not throw
  });

  it('should handle empty scene list', async () => {
    const queryDeps: QueryDependenciesFn = vi.fn();
    const result = await resolveSceneDependencies([], queryDeps);

    expect(result.referencedUuids.size).toBe(0);
    expect(result.sceneUuids).toEqual([]);
    expect(queryDeps).not.toHaveBeenCalled();
  });

  it('should respect maxDepth option', async () => {
    const deps: Record<string, string[]> = {
      'scene': ['level1'],
      'level1': ['level2'],
      'level2': ['level3'],
      'level3': [],
    };
    const queryDeps: QueryDependenciesFn = vi.fn(async (uuid: string) => deps[uuid] ?? []);

    const result = await resolveSceneDependencies(['scene'], queryDeps, { maxDepth: 2 });
    // Should stop at depth 2: scene(0) → level1(1) → level2(2) but NOT level3(3)
    expect(result.referencedUuids.has('level2')).toBe(true);
    expect(result.referencedUuids.has('level3')).toBe(false);
  });
});
