import { describe, it, expect } from 'vitest';
import { npmCmd, augmentedEnv } from '../../../src/core/updater/update';

// The one-click npm jobs (install sharp, install the packaging kit) run through
// one runner. On Windows it used to be unrunnable: execFile can't spawn a bare
// 'npm' (it's npm.cmd), and the PATH shim split on ':', shredding "C:\...".
describe('npm runner is platform-aware', () => {
  it('resolves npm.cmd on Windows, npm elsewhere', () => {
    expect(npmCmd('win32')).toBe('npm.cmd');
    expect(npmCmd('darwin')).toBe('npm');
    expect(npmCmd('linux')).toBe('npm');
  });

  it('leaves a Windows PATH untouched', () => {
    const env = { PATH: 'C:\\Program Files\\nodejs;C:\\Windows\\system32' };
    expect(augmentedEnv('win32', env).PATH).toBe(env.PATH);
  });

  it('still repairs the trimmed macOS GUI PATH', () => {
    const out = augmentedEnv('darwin', { PATH: '/usr/bin' }).PATH || '';
    expect(out.split(':')).toContain('/opt/homebrew/bin');
    expect(out.split(':')).toContain('/usr/bin');
  });
});
