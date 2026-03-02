declare const Editor: any;

import { readFileSync } from 'fs';
import { join } from 'path';

const template = readFileSync(join(__dirname, '../../static/template/index.html'), 'utf-8');
const style = readFileSync(join(__dirname, '../../static/style/index.css'), 'utf-8');

export const PanelDefinition = Editor.Panel.define({
  template,
  style,

  $: {
    tabBuildReport: '#tab-build-report',
    tabCompress: '#tab-compress',
    tabPackage: '#tab-package',
    tabDeploy: '#tab-deploy',

    contentBuildReport: '#content-build-report',
    contentCompress: '#content-compress',
    contentPackage: '#content-package',
    contentDeploy: '#content-deploy',
  },

  ready() {
    const tabs = [
      { btn: this.$.tabBuildReport, content: this.$.contentBuildReport },
      { btn: this.$.tabCompress,    content: this.$.contentCompress    },
      { btn: this.$.tabPackage,     content: this.$.contentPackage     },
      { btn: this.$.tabDeploy,      content: this.$.contentDeploy      },
    ];

    const activateTab = (index: number) => {
      tabs.forEach((t, i) => {
        if (t.btn) t.btn.classList.toggle('active', i === index);
        if (t.content) (t.content as HTMLElement).style.display = i === index ? 'block' : 'none';
      });
    };

    tabs.forEach((t, i) => {
      if (t.btn) {
        t.btn.addEventListener('click', () => activateTab(i));
      }
    });

    // Show first tab by default
    activateTab(0);
  },

  close() {
    // cleanup if needed
  },
});
