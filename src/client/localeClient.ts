import { bindUiLocale, type UiLocaleSource } from './uiLocale.js'

/** Locale integration for editor navigation; English is the safe fallback. */

/** locale 命名空间（与包名一致，避免与其他插件串词条）。 */
export const LOCALE_NS = 'dsh-vscode-mode'

/** Missing translations fall back to English, never Chinese. */
export const LOCALE_FALLBACK = 'en'

/** 壳层文案词典（键名即 slot label / Tab 标题的稳定标识）。 */
export const LOCALE_DICTS: Record<string, Record<string, string>> = {
  zh: {
    'slot.fileEditor': '文件编辑',
    'slot.diff': '差异',
    'slot.sessionSize': '会话体积',
    'slot.settings': 'VSCodeMode',
    'guide.title': '文件编辑',
    'guide.description': 'Monaco 文件编辑器：对话与编辑同屏（差异审查/跳转/大纲）',
    'review.openEditor': '在 VSCodeMode 打开',
    'review.openFile': '在编辑器打开',
    'review.addPending': '插入对话草稿',
    'review.pendingBlock': '待审',
    'review.commentAction': '插入对话草稿',
  },
  ru: {
    'slot.fileEditor': 'Редактор файлов',
    'slot.diff': 'Изменения',
    'slot.sessionSize': 'Размер сессии',
    'slot.settings': 'VSCodeMode',
    'guide.title': 'Редактор файлов',
    'guide.description': 'Редактор Monaco рядом с чатом: изменения, навигация и структура файла',
    'review.openEditor': 'Открыть в VSCodeMode',
    'review.openFile': 'Открыть в редакторе',
    'review.addPending': 'Вставить в черновик',
    'review.pendingBlock': 'На проверке',
    'review.commentAction': 'Вставить в черновик',
  },
  en: {
    'slot.fileEditor': 'File editor',
    'slot.diff': 'Diff',
    'slot.sessionSize': 'Session size',
    'slot.settings': 'VSCodeMode',
    'guide.title': 'File editor',
    'guide.description': 'Monaco file editor: chat and editing side by side (diff review, jump, outline)',
    'review.openEditor': 'Open in VSCodeMode',
    'review.openFile': 'Open in editor',
    'review.addPending': 'Insert into draft',
    'review.pendingBlock': 'pending',
    'review.commentAction': 'Insert into draft',
  },
}

/** locale 服务的最小结构面（结构性探测，不 import 官方类型）。 */
export interface LocaleLike extends Partial<UiLocaleSource> {
  register?: (ns: string, dicts: Record<string, Record<string, string>>) => unknown
  bind?: (ns: string) => (key: string) => string
}

/** 翻译函数：键 → 当前语言文案（找不到时回落英文，再回落键本身）。 */
export type Translate = (key: string) => string

/**
 * 取词条：Active language, then English, then the key itself.
 * @author ddj 2026年10月19号
 * @param lang 语言 id
 * @param key 词条键
 * @returns 文案
 */
function lookup(lang: string, key: string): string {
  return LOCALE_DICTS[lang]?.[key] ?? LOCALE_DICTS[LOCALE_FALLBACK]?.[key] ?? key
}

/**
 * 生成不依赖 locale 服务的直读翻译函数（服务缺失/注册失败时使用）。
 * @author ddj 2026年10月19号
 * @param lang 语言 id
 * @returns 翻译函数
 */
export function directTranslate(lang: string = LOCALE_FALLBACK): Translate {
  return (key: string) => lookup(lang, key)
}

/**
 * 注册本插件词典并返回翻译函数。
 * 服务缺失、重复注册或 bind 抛错都不影响插件其余部分：一律回落直读词典。
 * @author ddj 2026年10月19号
 * @param ctx DSH 客户端上下文
 * @returns 翻译函数（读取时才解析当前语言，可直接放进 slot label thunk）
 */
export function installLocale(ctx: { get: (name: string) => unknown }): Translate {
  let service: LocaleLike | undefined
  try {
    service = ctx.get('locale') as LocaleLike | undefined
  } catch {
    // 服务缺失或探测抛错：后续一律按未命中处理。
  }

  bindUiLocale(typeof service?.getLocale === 'function' ? service as UiLocaleSource : undefined)

  // 注册失败（例如同名 ns 已被占）不应连带废掉 bind，故两段各自 try。
  try {
    if (service && typeof service.register === 'function') service.register(LOCALE_NS, LOCALE_DICTS)
  } catch {
    // 词典未注册成功：仍尝试 bind，最后还有直读词典兜底。
  }

  try {
    if (service && typeof service.bind === 'function') {
      const bound = service.bind(LOCALE_NS)
      if (typeof bound === 'function') return (key: string) => bound(key)
    }
  } catch {
    // bind 异常按未命中处理。
  }

  return directTranslate()
}
