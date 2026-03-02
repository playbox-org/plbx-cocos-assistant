declare const Editor: any;

export async function onAfterBuild(options: any, result: any): Promise<void> {
  const pkgOptions = options.packages?.['plbx-cocos-extension'];
  if (pkgOptions?.autoReport) {
    Editor.Message.send('plbx-cocos-extension', 'on-build-finished');
  }
  console.log('[plbx] Build finished. Output:', result?.dest);
}
