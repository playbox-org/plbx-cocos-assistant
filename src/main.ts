declare const Editor: any;

export const load = function () {
  console.log('plbx-cocos-extension loaded');
};

export const unload = function () {
  console.log('plbx-cocos-extension unloaded');
};

export const methods: Record<string, (...args: any[]) => any> = {
  openPanel() {
    Editor.Panel.open('plbx-cocos-extension');
  },
  onBuildFinished() {
    Editor.Panel.open('plbx-cocos-extension');
  },
  onSceneReady() {
    // placeholder
  },
};
