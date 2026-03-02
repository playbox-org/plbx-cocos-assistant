declare const Editor: any;

export async function onAfterBuild(options: any, result: any): Promise<void> {
  const pkgOptions = options.packages?.['plbx-cocos-extension'];
  console.log('[plbx] Build finished. Output:', result?.dest);
  if (pkgOptions?.autoReport) {
    Editor.Message.send('plbx-cocos-extension', 'on-build-finished', {
      dest: result?.dest,
      platform: options?.platform,
    });
  }
}
