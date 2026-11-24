import { uiText } from './uiLocale.js'
import type { CompatAdapter } from '../shared/compat.js'
import { SIDEBAR_PLUGIN } from './compat.js'

/** Runtime installation facts, separate from the DSH version and user intent. */
export interface ClientCompatState {
  settingsService: string
  settingsReady: boolean
  openPathReady: boolean
  remoteReady: boolean
  sidebarOpener: boolean
  legacySidebar: boolean
  officialSidebar: boolean
  fileClaim: boolean
  claimWanted: boolean
  selected: string
  officialMenus?: boolean
  forge?: boolean
  /** 模板语言（EJS/Jinja/Nunjucks/Blade/Haml/Slim/ERB）是否注册成功（v0.30.0）。 */
  templateLanguages?: boolean
  /** 是否探测到官方 composer 座位（引用接入依赖它，v0.30.0）。 */
  composerSeat?: boolean
  /** 搜索面板全局替换是否可用（v0.30.0）。 */
  searchReplace?: boolean
}

/**
 * Classify the API generation without importing the host's node-only version probe.
 * @private @author ddj 2026年10月13号
 * @param input Running DSH version from the compat RPC.
 * @param patch First supported 0.1.x patch (alpha.1).
 * @returns Whether that API generation is expected; undefined for unknown versions.
 */
function apiExpected(input: string, patch: number): boolean | undefined {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*))?(?:\+[0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*)?$/.exec(input.trim())
  if (!match) return undefined
  const major = Number(match[1])
  const minor = Number(match[2])
  const current = Number(match[3])
  if (major !== 0) return major > 0
  if (minor !== 1) return minor > 1
  if (current !== patch) return current > patch
  const pre = match[4]
  if (!pre) return true
  const parts = pre.split('.')
  if (/^\d+$/.test(parts[0])) return false
  if (parts[0] !== 'alpha') return parts[0] > 'alpha'
  return parts.length > 1 && (/^\d+$/.test(parts[1]) ? Number(parts[1]) >= 1 : true)
}

/**
 * Build only applicable diagnostics; explicit legacy choices still expose missing capabilities.
 * @public @author ddj 2026年10月13号
 * @param state Actual client installation facts and user selection.
 * @param version Running DSH version; unknown versions retain conservative diagnostics.
 * @returns Visible adapters, without changing routing or installation.
 */
export function clientSummary(state: ClientCompatState, version = ''): CompatAdapter[] {
  const remoteExpected = apiExpected(version, 3)
  const officialExpected = apiExpected(version, 5)
  const official = state.officialSidebar
  const legacyChosen = state.selected === SIDEBAR_PLUGIN
  const items: CompatAdapter[] = [{
    name: uiText('设置桥', "Settings bridge", "Мост настроек"), active: state.settingsReady,
    note: state.settingsReady ? uiText('使用 ', "Using ", "Используется ") + state.settingsService + uiText(' 桥', " bridge", " — мост") : uiText('未绑定设置服务（持久化不可用，晚到重试窗口内自愈）', "Settings service not bound (persistence unavailable; retries can recover delayed availability)", "Сервис настроек не подключён (сохранение недоступно; повторные попытки могут восстановить подключение)"),
  }]
  if (remoteExpected !== true && !state.remoteReady && !official) {
    items.push({ name: uiText('文件打开路由（workspaces.openPath）', "File opening route (workspaces.openPath)", "Маршрут открытия файлов (workspaces.openPath)"), active: state.openPathReady, note: uiText('旧版对话文件链接路由，失败回退系统打开', "Legacy conversation file-link route; falls back to system opening on failure", "Старый маршрут файловых ссылок диалога; при ошибке открывает системным способом") })
  }
  if (remoteExpected !== false || state.remoteReady) {
    items.push({ name: uiText('会话文件链接路由（remote.session.openWorkspacePath）', "Session file-link route (remote.session.openWorkspacePath)", "Маршрут файловых ссылок сеанса (remote.session.openWorkspacePath)"), active: state.remoteReady, note: state.remoteReady ? uiText('会话文件链接走插件打开器，失败回退系统打开', "Session file links use the plugin opener; falls back to system opening on failure", "Файловые ссылки сеанса используют плагин; при ошибке открываются системным способом") : uiText('适用路由未安装（服务缺失或补丁失败）', "Required route not installed (missing service or failed patch)", "Нужный маршрут не установлен (сервис отсутствует или патч не применён)") })
  }
  if (legacyChosen || state.sidebarOpener || (!official && officialExpected !== true)) {
    items.push({ name: uiText('侧边栏打开器（', "Sidebar opener (", "Открытие в боковой панели (") + SIDEBAR_PLUGIN + uiText('）', ")", ")"), active: state.sidebarOpener, note: state.sidebarOpener ? uiText('已注册（优先级 80）', "Registered (priority 80)", "Зарегистрировано (приоритет 80)") : uiText('未检测到侧边栏打开能力', "Sidebar opening capability not detected", "Открытие в боковой панели не обнаружено") })
  }
  if (official || officialExpected !== false) {
    items.push({ name: uiText('侧边栏编辑区（官方 Sidebar）', "Sidebar editor (official Sidebar)", "Редактор боковой панели (стандартная Sidebar)"), active: official, note: official ? uiText('编辑区=官方右侧 Sidebar Tab（对话+编辑同屏）', "Editor = official right Sidebar tab (conversation and editor together)", "Редактор = стандартная правая вкладка Sidebar (диалог и редактор вместе)") : uiText('官方侧边栏服务未探测到', "Official sidebar service not detected", "Стандартный сервис боковой панели не обнаружен") })
  }
  if (!official && (state.legacySidebar || officialExpected !== true)) {
    items.push({ name: uiText('侧边栏编辑区（', "Sidebar editor (", "Редактор боковой панели (") + SIDEBAR_PLUGIN + uiText('，归档）', ", legacy)", ", устаревший)"), active: state.legacySidebar, note: state.legacySidebar ? uiText('编辑区=旧版侧边栏 Tab', "Editor = legacy sidebar tab", "Редактор = старая вкладка боковой панели") : uiText('旧版侧边栏回退能力未检测到', "Legacy sidebar fallback not detected", "Резервная старая боковая панель не обнаружена") })
  }
  if (state.fileClaim || (state.claimWanted && (official || officialExpected !== false))) {
    items.push({ name: uiText('文件链接官方认领（dsh-resource://file）', "Official file-link claim (dsh-resource://file)", "Стандартный перехват файловых ссылок (dsh-resource://file)"), active: state.fileClaim, note: state.fileClaim ? uiText('聊天文件链接转发进单一编辑器页签', "Conversation file links forward to a single editor tab", "Файловые ссылки диалога направляются в одну вкладку редактора") : uiText('官方文件链接认领未安装', "Official file-link claim not installed", "Стандартный перехват файловых ссылок не установлен") })
  }
  if (state.officialMenus !== undefined) items.push({ name: uiText('官方右键菜单', "Official context menu", "Стандартное контекстное меню"), active: state.officialMenus, note: state.officialMenus ? uiText('插件动作接入共享菜单', "Plugin actions integrated into the shared menu", "Действия плагина добавлены в общее меню") : uiText('服务缺失或装配失败，保留插件菜单', "Service missing or assembly failed; plugin menu retained", "Сервис отсутствует или сборка не удалась; сохранено меню плагина") })
  if (state.forge !== undefined) items.push({ name: uiText('Forge 导航', "Forge navigation", "Навигация Forge"), active: state.forge, note: state.forge ? uiText('导航至官方面板与本地变更；PR 保持官方审查', "Navigate to the official panel and local changes; PR review remains official", "Переход к стандартной панели и локальным изменениям; проверка PR остаётся стандартной") : uiText('官方 Forge 未安装或未启用，不自动启用', "Official Forge is not installed or enabled; not enabled automatically", "Стандартный Forge не установлен или отключён; автоматически не включается") })
  if (state.templateLanguages !== undefined) {
    items.push({ name: uiText('模板语言高亮（EJS/ERB/Nunjucks/Jinja2/Blade/Haml/Slim）', "Template syntax highlighting (EJS/ERB/Nunjucks/Jinja2/Blade/Haml/Slim)", "Подсветка шаблонов (EJS/ERB/Nunjucks/Jinja2/Blade/Haml/Slim)"), active: state.templateLanguages, note: state.templateLanguages ? uiText('已注册到 Monaco（编辑器打开模板文件按对应语法分色）', "Registered with Monaco (template files use matching syntax highlighting)", "Зарегистрировано в Monaco (шаблоны используют соответствующую подсветку синтаксиса)") : uiText('Monaco 未就绪或注册失败，模板文件回落 plaintext', "Monaco unavailable or registration failed; templates fall back to plaintext", "Monaco недоступен или регистрация не удалась; шаблоны отображаются как plaintext") })
  }
  if (state.composerSeat !== undefined) {
    items.push({ name: uiText('引用接入（拖文件/粘贴文件/复制行引用）', "Reference intake (drag/paste files, copy line references)", "Добавление ссылок (перетаскивание/вставка файлов, копирование ссылок на строки)"), active: state.composerSeat, note: state.composerSeat ? uiText('探测到官方对话输入区，拖入/粘贴会落成引用 chip', "Official conversation composer detected; dragged/pasted files become reference chips", "Обнаружено стандартное поле диалога; перетаскиваемые/вставленные файлы становятся ссылками") : uiText('未探测到对话输入区（旧版 DSH 或未打开会话），引用接入自动不生效', "Conversation composer not detected (older DSH or no open session); reference intake inactive", "Поле диалога не обнаружено (старая версия DSH или нет открытого сеанса); добавление ссылок не действует") })
  }
  if (state.searchReplace !== undefined) {
    items.push({ name: uiText('搜索面板全局替换', "Search panel global replacement", "Глобальная замена в панели поиска"), active: state.searchReplace, note: state.searchReplace ? uiText('先预览命中数再确认写盘；执行前自动落盘已打开页签', "Preview match count before confirming writes; automatically save open tabs before execution", "Предпросмотр числа совпадений перед записью; открытые вкладки автоматически сохраняются перед выполнением") : uiText('当前环境未启用', "Not enabled in this environment", "В текущей среде не включено") })
  }
  return items
}
