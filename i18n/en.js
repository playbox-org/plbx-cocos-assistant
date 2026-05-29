module.exports = {
  title: 'Playbox Extension',
  description: 'Playbox build tools: reports, compression, packaging and deployment.',
  'open-panel': 'Open Playbox Panel',
  panels: {
    default: {
      title: 'Playbox',
    },
  },
  networks: {
    'moloco-v2': 'Moloco V2.0 (Launcher API)',
  },
  'moloco-v2-desc':
    'Outputs launcher.html (<3KB) + payload.js (IIFE). Submit launcher to Moloco QA, upload payload via /cm/v1/creative-assets API.',
  'preview-mv2': {
    'macro-fires': 'MolocoV2 Macro Fires',
    'manual-triggers': 'Manual triggers',
    'trigger-viewable': 'Viewable',
    'trigger-hidden': 'Hidden',
    'trigger-pause': 'Pause',
    'trigger-resume': 'Resume',
    'trigger-cta': 'CTA',
    'trigger-end-game': 'End game',
    'trigger-simulate-taps': 'Simulate taps',
    'trigger-reset': 'Reset',
    'viewable-listener-check': 'viewableChange listener registered',
    'final-url-check': 'final_url consumed by CTA',
    'duplicate-fire-warning': 'Beacon fired more than once — verify intent',
  },
};
