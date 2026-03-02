export const configs: Record<string, any> = {
  'web-mobile': {
    hooks: './hooks',
    options: {
      autoPackage: {
        default: true,
        render: { ui: 'ui-checkbox' },
        label: 'Auto Package for Networks',
      },
    },
  },
};
