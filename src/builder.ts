export const configs: Record<string, any> = {
  'web-mobile': {
    hooks: './hooks',
    options: {
      autoReport: {
        default: true,
        render: { ui: 'ui-checkbox' },
        label: 'Auto Build Report',
      },
    },
  },
};
