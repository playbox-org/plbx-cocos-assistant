module.exports = {
  title: 'Расширение Playbox',
  description: 'Инструменты сборки Playbox: отчёты, сжатие, упаковка и деплой.',
  'open-panel': 'Открыть панель Playbox',
  panels: {
    default: {
      title: 'Playbox',
    },
  },
  networks: {
    'moloco-v2': 'Moloco V2.0 (Launcher API)',
  },
  'moloco-v2-desc':
    'Создаёт launcher.html (<3KB) + payload.js (IIFE). Launcher отправляется в Moloco QA вручную, payload загружается через /cm/v1/creative-assets API.',
  'preview-mv2': {
    'macro-fires': 'Срабатывания макросов MolocoV2',
    'manual-triggers': 'Ручные триггеры',
    'trigger-viewable': 'Видимый',
    'trigger-hidden': 'Скрытый',
    'trigger-pause': 'Пауза',
    'trigger-resume': 'Продолжить',
    'trigger-cta': 'CTA',
    'trigger-end-game': 'Конец игры',
    'trigger-simulate-taps': 'Симулировать тапы',
    'trigger-reset': 'Сброс',
    'viewable-listener-check': 'Подписка viewableChange зарегистрирована',
    'final-url-check': 'final_url использован в CTA',
    'duplicate-fire-warning': 'Маяк сработал более одного раза — проверь логику',
  },
};
