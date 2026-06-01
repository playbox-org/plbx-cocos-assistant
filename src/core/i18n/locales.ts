/**
 * Panel-level i18n.
 *
 * The Playbox panel is custom HTML, and the developer chooses its language
 * independently of the Cocos editor locale. So we keep our own dictionary and
 * apply it by walking `[data-i18n]` elements in the panel.
 *
 * Coverage is the chrome (tabs, Settings, primary action buttons/headers).
 * More keys can be added incrementally — `translate` falls back en → key, so a
 * missing translation shows English (or the raw key), never a blank.
 *
 * NOTE: the Chinese (zh) strings are a first pass and should be reviewed by a
 * native speaker before they are considered final.
 */

export type Lang = 'en' | 'ru' | 'zh';

export const SUPPORTED_LANGS: Lang[] = ['en', 'ru', 'zh'];
export const DEFAULT_LANG: Lang = 'en';

export type LocaleDict = Record<string, string>;

export const LOCALES: Record<Lang, LocaleDict> = {
  en: {
    'tab.buildReport': 'Build Report',
    'tab.compress': 'Compress',
    'tab.package': 'Package',
    'tab.deploy': 'Deploy',

    'action.analyze': 'Analyze Project',
    'action.compressAll': 'Compress All',

    'settings.title': 'Settings',
    'settings.updates': 'Updates',
    'settings.version': 'Version',
    'settings.checkUpdates': 'Check for updates',
    'settings.behavior': 'Behavior',
    'settings.autoPackage': 'Auto-package after build',
    'settings.showOnStart': 'Show Playbox panel on editor start',
    'settings.language': 'Language',

    // Shared words
    'common.type': 'Type',
    'common.status': 'Status',
    'common.format': 'Format',
    'common.quality': 'Quality',
    'common.cancel': 'Cancel',
    'common.copy': 'Copy',

    // Build Report tab
    'buildReport.totalAssets': 'Total Assets',
    'buildReport.allProjectAssets': 'All Project Assets',
    'buildReport.buildSizeReal': 'Build Size real',
    'buildReport.images': 'Images',
    'buildReport.audio': 'Audio',
    'buildReport.showUnused': 'Show unused assets',
    'buildReport.colName': 'Name',
    'buildReport.colSourceSize': 'Source Size',
    'buildReport.colBuildSize': 'Build Size',
    'buildReport.colExtension': 'Extension',
    'buildReport.emptyState': 'Click "Analyze Project" to scan assets',

    // Compress tab
    'compress.presets': 'Presets:',
    'compress.presetWeb': 'Web Optimized',
    'compress.presetMax': 'Max Quality',
    'compress.presetFast': 'Fast',
    'compress.presetHigh': 'High Compression',
    'compress.colAsset': 'Asset',
    'compress.colOriginal': 'Original',
    'compress.colCompressed': 'Compressed',
    'compress.colSavings': 'Savings',
    'compress.emptyState': 'Run "Analyze Project" in Build Report tab first',

    // Package tab
    'package.networks': 'Networks',
    'package.netAll': 'All',
    'package.netNone': 'None',
    'package.moreNetworks': 'More networks',
    'package.buildSettings': 'Build Settings',
    'package.orientation': 'Orientation',
    'package.portrait': 'Portrait',
    'package.landscape': 'Landscape',
    'package.auto': 'Auto',
    'package.iosStoreUrl': 'iOS Store URL',
    'package.androidStoreUrl': 'Android Store URL',
    'package.output': 'Output',
    'package.buildDirectory': 'Build Directory',
    'package.outputDirectory': 'Output Directory',
    'package.outputNaming': 'Output Naming',
    'package.tplStandard': 'Standard',
    'package.tplFlat': 'Flat',
    'package.tplCustom': 'Custom',
    'package.validate': 'Validate',
    'package.packAll': 'Pack All',
    'package.openOutput': 'Open Output Folder',
    'package.generateAdapter': 'Generate plbx_html.ts',
    'package.colNetwork': 'Network',
    'package.colSize': 'Size',
    'package.colLimit': 'Limit',
    'package.colCreated': 'Created',
    'package.emptyState': 'Select networks and click "Pack All"',

    // Deploy tab
    'deploy.authentication': 'Authentication',
    'deploy.apiToken': 'API Token',
    'deploy.apiTokenPlaceholder': 'Paste your PLBX API token...',
    'deploy.saveLogin': 'Save & Login',
    'deploy.deployment': 'Deployment',
    'deploy.project': 'Project',
    'deploy.projectPlaceholder': 'Search or select project...',
    'deploy.refresh': 'Refresh',
    'deploy.newShort': '+ New',
    'deploy.newProject': 'New Project',
    'deploy.existingDeployments': 'Existing deployments',
    'deploy.deploymentName': 'Deployment Name',
    'deploy.networkBuild': 'Network Build',
    'deploy.buildPath': 'Build Path',
    'deploy.deploy': 'Deploy',
    'deploy.result': 'Result',

    // Preview overlay
    'preview.original': 'ORIGINAL',
    'preview.compressed': 'COMPRESSED',
    'preview.apply': 'Apply',
  },
  ru: {
    'tab.buildReport': 'Отчёт сборки',
    'tab.compress': 'Сжатие',
    'tab.package': 'Упаковка',
    'tab.deploy': 'Деплой',

    'action.analyze': 'Анализ проекта',
    'action.compressAll': 'Сжать всё',

    'settings.title': 'Настройки',
    'settings.updates': 'Обновления',
    'settings.version': 'Версия',
    'settings.checkUpdates': 'Проверить обновления',
    'settings.behavior': 'Поведение',
    'settings.autoPackage': 'Авто-упаковка после сборки',
    'settings.showOnStart': 'Показывать панель Playbox при старте редактора',
    'settings.language': 'Язык',

    // Shared words
    'common.type': 'Тип',
    'common.status': 'Статус',
    'common.format': 'Формат',
    'common.quality': 'Качество',
    'common.cancel': 'Отмена',
    'common.copy': 'Копировать',

    // Build Report tab
    'buildReport.totalAssets': 'Всего ассетов',
    'buildReport.allProjectAssets': 'Все ассеты проекта',
    'buildReport.buildSizeReal': 'Размер сборки (факт.)',
    'buildReport.images': 'Изображения',
    'buildReport.audio': 'Аудио',
    'buildReport.showUnused': 'Показать неиспользуемые ассеты',
    'buildReport.colName': 'Имя',
    'buildReport.colSourceSize': 'Размер исходника',
    'buildReport.colBuildSize': 'Размер в сборке',
    'buildReport.colExtension': 'Расширение',
    'buildReport.emptyState': 'Нажмите «Анализ проекта», чтобы просканировать ассеты',

    // Compress tab
    'compress.presets': 'Пресеты:',
    'compress.presetWeb': 'Для веба',
    'compress.presetMax': 'Макс. качество',
    'compress.presetFast': 'Быстро',
    'compress.presetHigh': 'Сильное сжатие',
    'compress.colAsset': 'Ассет',
    'compress.colOriginal': 'Оригинал',
    'compress.colCompressed': 'Сжатый',
    'compress.colSavings': 'Экономия',
    'compress.emptyState': 'Сначала выполните «Анализ проекта» на вкладке «Отчёт сборки»',

    // Package tab
    'package.networks': 'Сети',
    'package.netAll': 'Все',
    'package.netNone': 'Снять все',
    'package.moreNetworks': 'Ещё сети',
    'package.buildSettings': 'Параметры сборки',
    'package.orientation': 'Ориентация',
    'package.portrait': 'Портретная',
    'package.landscape': 'Альбомная',
    'package.auto': 'Авто',
    'package.iosStoreUrl': 'URL в App Store',
    'package.androidStoreUrl': 'URL в Google Play',
    'package.output': 'Вывод',
    'package.buildDirectory': 'Каталог сборки',
    'package.outputDirectory': 'Каталог вывода',
    'package.outputNaming': 'Шаблон имён',
    'package.tplStandard': 'Стандартный',
    'package.tplFlat': 'Плоский',
    'package.tplCustom': 'Свой',
    'package.validate': 'Проверить',
    'package.packAll': 'Упаковать всё',
    'package.openOutput': 'Открыть папку вывода',
    'package.generateAdapter': 'Сгенерировать plbx_html.ts',
    'package.colNetwork': 'Сеть',
    'package.colSize': 'Размер',
    'package.colLimit': 'Лимит',
    'package.colCreated': 'Создано',
    'package.emptyState': 'Выберите сети и нажмите «Упаковать всё»',

    // Deploy tab
    'deploy.authentication': 'Авторизация',
    'deploy.apiToken': 'API-токен',
    'deploy.apiTokenPlaceholder': 'Вставьте ваш API-токен PLBX...',
    'deploy.saveLogin': 'Сохранить и войти',
    'deploy.deployment': 'Деплой',
    'deploy.project': 'Проект',
    'deploy.projectPlaceholder': 'Найдите или выберите проект...',
    'deploy.refresh': 'Обновить',
    'deploy.newShort': '+ Новый',
    'deploy.newProject': 'Новый проект',
    'deploy.existingDeployments': 'Существующие деплои',
    'deploy.deploymentName': 'Имя деплоя',
    'deploy.networkBuild': 'Сборка под сеть',
    'deploy.buildPath': 'Путь к сборке',
    'deploy.deploy': 'Развернуть',
    'deploy.result': 'Результат',

    // Preview overlay
    'preview.original': 'ОРИГИНАЛ',
    'preview.compressed': 'СЖАТЫЙ',
    'preview.apply': 'Применить',
  },
  zh: {
    'tab.buildReport': '构建报告',
    'tab.compress': '压缩',
    'tab.package': '打包',
    'tab.deploy': '部署',

    'action.analyze': '分析项目',
    'action.compressAll': '全部压缩',

    'settings.title': '设置',
    'settings.updates': '更新',
    'settings.version': '版本',
    'settings.checkUpdates': '检查更新',
    'settings.behavior': '行为',
    'settings.autoPackage': '构建后自动打包',
    'settings.showOnStart': '编辑器启动时显示 Playbox 面板',
    'settings.language': '语言',

    // Shared words (zh: best-effort, pending native review)
    'common.type': '类型',
    'common.status': '状态',
    'common.format': '格式',
    'common.quality': '质量',
    'common.cancel': '取消',
    'common.copy': '复制',

    // Build Report tab
    'buildReport.totalAssets': '资源总数',
    'buildReport.allProjectAssets': '项目全部资源',
    'buildReport.buildSizeReal': '构建实际大小',
    'buildReport.images': '图片',
    'buildReport.audio': '音频',
    'buildReport.showUnused': '显示未使用资源',
    'buildReport.colName': '名称',
    'buildReport.colSourceSize': '源大小',
    'buildReport.colBuildSize': '构建大小',
    'buildReport.colExtension': '扩展名',
    'buildReport.emptyState': '点击“分析项目”以扫描资源',

    // Compress tab
    'compress.presets': '预设：',
    'compress.presetWeb': 'Web 优化',
    'compress.presetMax': '最高质量',
    'compress.presetFast': '快速',
    'compress.presetHigh': '高压缩',
    'compress.colAsset': '资源',
    'compress.colOriginal': '原始',
    'compress.colCompressed': '压缩后',
    'compress.colSavings': '节省',
    'compress.emptyState': '请先在“构建报告”选项卡中运行“分析项目”',

    // Package tab
    'package.networks': '广告网络',
    'package.netAll': '全选',
    'package.netNone': '清空',
    'package.moreNetworks': '更多网络',
    'package.buildSettings': '构建设置',
    'package.orientation': '方向',
    'package.portrait': '竖屏',
    'package.landscape': '横屏',
    'package.auto': '自动',
    'package.iosStoreUrl': 'iOS 商店链接',
    'package.androidStoreUrl': 'Android 商店链接',
    'package.output': '输出',
    'package.buildDirectory': '构建目录',
    'package.outputDirectory': '输出目录',
    'package.outputNaming': '输出命名',
    'package.tplStandard': '标准',
    'package.tplFlat': '扁平',
    'package.tplCustom': '自定义',
    'package.validate': '验证',
    'package.packAll': '全部打包',
    'package.openOutput': '打开输出文件夹',
    'package.generateAdapter': '生成 plbx_html.ts',
    'package.colNetwork': '网络',
    'package.colSize': '大小',
    'package.colLimit': '上限',
    'package.colCreated': '创建时间',
    'package.emptyState': '选择网络并点击“全部打包”',

    // Deploy tab
    'deploy.authentication': '身份验证',
    'deploy.apiToken': 'API 令牌',
    'deploy.apiTokenPlaceholder': '粘贴你的 PLBX API 令牌...',
    'deploy.saveLogin': '保存并登录',
    'deploy.deployment': '部署',
    'deploy.project': '项目',
    'deploy.projectPlaceholder': '搜索或选择项目...',
    'deploy.refresh': '刷新',
    'deploy.newShort': '+ 新建',
    'deploy.newProject': '新建项目',
    'deploy.existingDeployments': '现有部署',
    'deploy.deploymentName': '部署名称',
    'deploy.networkBuild': '网络构建',
    'deploy.buildPath': '构建路径',
    'deploy.deploy': '部署',
    'deploy.result': '结果',

    // Preview overlay
    'preview.original': '原始',
    'preview.compressed': '压缩后',
    'preview.apply': '应用',
  },
};

/** Coerce arbitrary input (e.g. 'zh-CN', 'EN', undefined) to a supported Lang. */
export function normalizeLang(input: string | null | undefined): Lang {
  if (!input) return DEFAULT_LANG;
  const base = input.toLowerCase().split(/[-_]/)[0];
  return (SUPPORTED_LANGS as string[]).includes(base) ? (base as Lang) : DEFAULT_LANG;
}

/** Translate a key, falling back: chosen lang → English → the key itself. */
export function translate(lang: Lang, key: string): string {
  const l = normalizeLang(lang);
  return LOCALES[l][key] ?? LOCALES.en[key] ?? key;
}
