declare const Editor: any;

export interface ProjectSettings {
  selectedNetworks: string[];
  projectName: string;
  deploymentName: string;
  deployProjectId: string;
  defaultDeployNetwork: string;
  storeUrlIos: string;
  storeUrlAndroid: string;
  orientation: 'portrait' | 'landscape' | 'auto';
  autoPackage: boolean;
  buildDir: string;
  outputDir: string;
}

const DEFAULT_SETTINGS: ProjectSettings = {
  selectedNetworks: ['ironsource', 'applovin', 'google', 'facebook', 'unity'],
  projectName: '',  // will default to project folder name
  deploymentName: '',
  deployProjectId: '',
  defaultDeployNetwork: 'ironsource',
  storeUrlIos: '',
  storeUrlAndroid: '',
  orientation: 'portrait',
  autoPackage: true,
  buildDir: 'build/web-mobile',
  outputDir: 'build/plbx-html',
};

/** Get project-scoped settings */
export async function getProjectSettings(): Promise<ProjectSettings> {
  try {
    const saved = await Editor.Profile.getProject('plbx-cocos-extension', 'settings', 'local');
    const projectName = saved?.projectName || getDefaultProjectName();
    return { ...DEFAULT_SETTINGS, ...saved, projectName };
  } catch {
    return { ...DEFAULT_SETTINGS, projectName: getDefaultProjectName() };
  }
}

/** Save project-scoped settings */
export async function saveProjectSettings(settings: Partial<ProjectSettings>): Promise<void> {
  const current = await getProjectSettings();
  const merged = { ...current, ...settings };
  await Editor.Profile.setProject('plbx-cocos-extension', 'settings', merged, 'local');
}

/** Get global PLBX API token (shared across all projects) */
export async function getGlobalToken(): Promise<string> {
  try {
    return await Editor.Profile.getConfig('plbx-cocos-extension', 'apiKey', 'local') || '';
  } catch {
    return '';
  }
}

/** Save global PLBX API token */
export async function saveGlobalToken(token: string): Promise<void> {
  await Editor.Profile.setConfig('plbx-cocos-extension', 'apiKey', token, 'local');
}

function getDefaultProjectName(): string {
  try {
    const path = Editor.Project.path;
    return path.split('/').pop() || path.split('\\').pop() || 'untitled';
  } catch {
    return 'untitled';
  }
}
