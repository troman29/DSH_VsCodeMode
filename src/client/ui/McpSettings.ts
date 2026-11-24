// @ts-nocheck
/**
 * dsh-vscode-mode client — VSCodeMode 设置区：通用 / MCP 管理 / 语言服务器 / 性能优化 / 兼容性。
 * （快捷键统一由 DSH 官方快捷键机制管理：通用页只提供「打开官方快捷键配置」跳转入口，
 *   插件不再自建录键编辑器，也不再注册独立「快捷键」设置区。）
 * MCP 管理 Tab 下含三个子页签：我的 MCP（profile 全局）/ 项目 MCP（各项目 .mcp.json）/ MCP 市场（占位）。
 * 作者 ddj 2026年08月22号 / 2026年08月26号 / 2026年08月27号 / 2026年10月
 */
import React from 'react'
import { uiText } from '../uiLocale.js'
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import { SettingRow, SettingNotice } from './SettingsUi.js'
import { rpc } from '../rpc.js'
import type { MpcProject, MpcServer } from '../../shared/mcp.js'
import { configOf } from '../mcpForm.js'
import { parseMcpPolicy } from '../../shared/mcp.js'
import { McpState } from '../mcpState.js'
import { statusOf, statusTone } from '../../shared/mcpStatus.js'
import '../styles/mcp.css'
import { availableOpeners, AUTO_OPEN_TOOL } from '../fileOpeners.js'
import { SettingsContext } from '../settingsContext.js'
import { openOfficialShortcuts } from '../shortcutsOfficial.js'
import { normalizeSidebarMinWidth, SIDEBAR_MIN_DEFAULT } from '../sidebarMin.js'
import { EDITOR_LIMIT_CEIL, EDITOR_LIMIT_DEFAULT, normalizeMaxOpenEditors } from '../../shared/editorLimit.js'
import { TORTOISE_DIR_DEFAULT } from '../../shared/svn.js'
import { DEFAULT_NATIVE_CSV } from '../../shared/nativeOpen.js'
import { LspSettings } from './LspSettings.js'
import { PerfSettings } from './PerfSettings.js'
import { IntegrationSettings } from './IntegrationSettings.js'
import { AiSettings } from './AiSettings.js'
import { UniverCacheSettings } from '../univer/UniverCacheSettings.js'

const EMPTY = { serverName: '', transport: 'stdio', command: '', args: '', cwd: '', url: '', headers: '', startup: 'on-demand', sharing: 'agent', startupTimeoutMs: 60000 }

/** @private @author ddj 2026年10月08号 @param props Server snapshot, page-wide busy state and actions. @returns Lifecycle-evidence card; enabled does not imply online. */
function ServerCard({ server, busy, onRefresh, onToggle, onRemove, onConnect, onPolicy }) {
  return React.createElement('article', { className: 'vsm-mcp-card' },
    React.createElement('div', { className: 'vsm-mcp-card-head' },
      React.createElement('div', { className: 'vsm-mcp-title' }, React.createElement('span', { className: 'vsm-mcp-dot ' + statusTone(server) }), server.serverName),
      React.createElement('div', { className: 'vsm-mcp-actions' },
        React.createElement('button', { disabled: !!busy, onClick: () => onRefresh(server.id), title: uiText('重新装配会话实例', "Recreate session instance", "Пересоздать экземпляр сеанса") }, '↻'),
        React.createElement('button', { disabled: !!busy, className: 'vsm-danger', onClick: () => onRemove(server.id), title: uiText('删除 MCP', "Delete MCP", "Удалить MCP") }, '⌫'),
        React.createElement('button', { disabled: !!busy, className: 'vsm-switch ' + (server.enabled ? 'on' : ''), onClick: () => onToggle(server), title: uiText('配置启用不代表连接在线', "Enabled configuration does not mean connected", "Включённая конфигурация не означает подключение"), 'aria-label': server.enabled ? uiText('禁用配置（不代表在线）', "Disable configuration (not connection status)", "Отключить конфигурацию (не статус подключения)") : uiText('启用配置（不代表在线）', "Enable configuration (not connection status)", "Включить конфигурацию (не статус подключения)"), 'aria-pressed': !!server.enabled }, server.enabled ? '●' : '○'),
      ),
    ),
    React.createElement('div', { className: 'vsm-mcp-meta' }, statusOf(server), ' · ', server.toolCount, uiText(' 个工具 · ', " tools · ", " инструментов · "), server.transport,
      server.instanceCount !== undefined ? ' · ' + server.instanceCount + uiText(' 个连接实例', " connection instances", " экземпляров подключения") : '',
      server.sessionCount !== undefined ? ' · ' + server.sessionCount + uiText(' 个会话使用', " sessions using it", " использующих сеансов") : ''),
    server.policy && React.createElement(ProjectPolicy, { server, busy, onConnect, onPolicy }),
    server.error && React.createElement('div', { className: 'vsm-mcp-error' }, server.error),
    React.createElement('div', { className: 'vsm-mcp-tools' }, server.tools.map((tool) => React.createElement('span', { key: tool.name, className: 'vsm-mcp-chip', title: tool.description || tool.name }, tool.name))),
  )
}

/** @private @author ddj 2026年10月20号 @param props Project policy and locked actions. @returns Explicit strategy controls and sharing risk notice. */
function ProjectPolicy({ server, busy, onConnect, onPolicy }) {
  /** @author ddj 2026年10月20号 @param event Strategy selection. Saves only an explicit user change. */
  const startup = (event) => onPolicy?.(server, { ...server.policy, startup: event.target.value })
  /** @author ddj 2026年10月20号 @param event Sharing selection. Requires acknowledgement before state sharing. */
  const sharing = (event) => {
    const mode = event.target.value
    if (mode === 'workspace' && !window.confirm(uiText('同一工作区的会话将共享此 MCP 的连接和内部状态；工具串行不等于业务状态隔离。确认服务适合共享？', "Sessions in this workspace will share this MCP connection and internal state. Serial tool execution does not isolate application state. Is this service safe to share?", "Сеансы этого рабочего пространства разделят подключение и внутреннее состояние MCP. Последовательный вызов инструментов не изолирует состояние. Сервис допускает совместное использование?"))) return
    onPolicy?.(server, { ...server.policy, sharing: mode })
  }
  return React.createElement('div', { className: 'vsm-mcp-meta' },
    React.createElement('label', null, uiText('启动 ', "Startup ", "Запуск "), React.createElement('select', { disabled: !!busy, value: server.policy.startup, onChange: startup },
      React.createElement('option', { value: 'on-demand' }, uiText('按需启动', "On demand", "По требованию")), React.createElement('option', { value: 'background' }, uiText('后台预热', "Background warm-up", "Фоновый прогрев")))),
    React.createElement('label', null, uiText(' 连接 ', " Connection ", " Подключение "), React.createElement('select', { disabled: !!busy, value: server.policy.sharing, onChange: sharing },
      React.createElement('option', { value: 'agent' }, uiText('逐会话隔离', "Isolated per session", "Изоляция по сеансам")), React.createElement('option', { value: 'workspace' }, uiText('工作区共享（共享状态）', "Shared workspace (shared state)", "Общее для пространства (общее состояние)")))),
    React.createElement('button', { disabled: !!busy || !server.enabled, onClick: onConnect }, uiText('连接当前活跃会话', "Connect current active session", "Подключить текущий активный сеанс")),
    React.createElement('small', null, uiText('默认按需启动，不阻塞新对话；首次使用仍需等待。共享仅显式启用。', "Starts on demand by default without blocking new conversations. First use still requires waiting. Sharing requires explicit activation.", "По умолчанию запускается по требованию, не блокируя новые диалоги. Первый вызов требует ожидания. Совместный доступ включается явно.")))
}

/** 按项目标题或路径过滤，大小写不敏感。 */
export function filterProjects(projects, query) {
  const needle = String(query ?? '').trim().toLowerCase()
  if (!needle) return projects
  return projects.filter((project) => `${project.title} ${project.workspacePath}`.toLowerCase().includes(needle))
}

/** 带搜索的项目组合框。 */
function ProjectPicker({ projects, value, onChange }) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [highlight, setHighlight] = React.useState(0)
  const rootRef = React.useRef(null)
  const selected = projects.find((project) => project.workspacePath === value)
  const filtered = React.useMemo(() => filterProjects(projects, query), [projects, query])

  React.useEffect(() => {
    const close = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const choose = (project) => {
    onChange(project.workspacePath)
    setQuery('')
    setOpen(false)
  }
  const move = (delta) => setHighlight((old) => Math.max(0, Math.min(Math.max(0, filtered.length - 1), old + delta)))
  const keyDown = (event) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); move(1) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); move(-1) }
    else if (event.key === 'Enter' && filtered[highlight]) { event.preventDefault(); choose(filtered[highlight]) }
    else if (event.key === 'Escape') { event.preventDefault(); setOpen(false) }
  }
  return React.createElement('div', { className: 'vsm-project-picker', ref: rootRef },
    React.createElement('button', { className: 'vsm-project-picker-trigger', role: 'combobox', 'aria-expanded': open, onClick: () => setOpen((old) => !old) },
      React.createElement('span', { className: 'vsm-project-picker-label' }, selected?.title || uiText('选择项目', "Select project", "Выберите проект"), selected && React.createElement('small', null, selected.workspacePath)),
      React.createElement('span', { className: 'vsm-project-picker-arrow' }, open ? '⌃' : '⌄'),
    ),
    open && React.createElement('div', { className: 'vsm-project-picker-menu' },
      React.createElement('input', { autoFocus: true, className: 'vsm-project-picker-search', value: query, placeholder: uiText('搜索项目名称或路径…', "Search project name or path…", "Поиск по имени или пути проекта…"), onChange: (event) => { setQuery(event.target.value); setHighlight(0) }, onKeyDown: keyDown }),
      React.createElement('div', { className: 'vsm-project-picker-options', role: 'listbox' }, filtered.length ? filtered.map((project, index) => React.createElement('button', { key: project.workspacePath, role: 'option', 'aria-selected': project.workspacePath === value, className: 'vsm-project-option ' + (index === highlight ? 'highlight' : '') + (project.workspacePath === value ? ' selected' : ''), onMouseEnter: () => setHighlight(index), onClick: () => choose(project) }, React.createElement('span', null, project.title), React.createElement('small', null, project.workspacePath, ' · ', project.servers.length, uiText(' 个 MCP', " MCP servers", " серверов MCP")))) : React.createElement('div', { className: 'vsm-project-picker-empty' }, uiText('没有匹配的项目', "No matching projects", "Подходящих проектов нет"))),
    ),
  )
}

/** @private @author ddj 2026年10月08号 @param props Project view, shared busy lock and actions. @returns Project cards with actions disabled for any active mutation. */
function ProjectGroup({ project, busy, onAdd, onRefresh, onToggle, onRemove, onConnect, onPolicy }) {
  const head = React.createElement('div', { className: 'vsm-project-head' },
    React.createElement('div', { className: 'vsm-project-title' }, React.createElement('span', { className: 'vsm-project-icon' }, '▣'), React.createElement('div', null, React.createElement('span', { className: 'vsm-project-name' }, project.title), React.createElement('span', { className: 'vsm-project-path' }, project.workspacePath))),
    React.createElement('button', { className: 'vsm-primary vsm-small', disabled: !!busy, onClick: () => onAdd(project) }, uiText('+ 添加 MCP', "+ Add MCP", "+ Добавить MCP")),
  )
  let body
  if (project.missingDir) body = React.createElement('div', { className: 'vsm-project-empty' }, uiText('项目目录已不存在，无法管理 MCP', "Project directory no longer exists; MCP management is unavailable", "Каталог проекта отсутствует; управление MCP недоступно"))
  else if (project.fileError) body = React.createElement('div', { className: 'vsm-mcp-error vsm-mcp-banner' }, project.fileError)
  else if (!project.servers.length) body = React.createElement('div', { className: 'vsm-project-empty' }, uiText('此项目未配置 MCP', "No MCP configured for this project", "MCP для этого проекта не настроен"))
  else body = project.servers.map((server) => React.createElement(ServerCard, { key: server.serverName, server, busy, onConnect: () => onConnect(project, server), onPolicy: (server, policy) => onPolicy(project, server, policy), onRefresh: (id) => onRefresh(project, server, id), onToggle: () => onToggle(project, server), onRemove: (id) => onRemove(project, server, id) }))
  return React.createElement('section', { className: 'vsm-project' }, head, body)
}

/** 通用设置：选择当前对话文件链接的打开器 + 开发形态开关 + 编辑器布局（侧边栏最小宽度）+ 官方快捷键入口。 */
function GeneralSettings({ registry, getShortcuts }) {
  const [tool, setTool] = React.useState(AUTO_OPEN_TOOL)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const [devForm, setDevForm] = React.useState(null)
  const [devBusy, setDevBusy] = React.useState(false)
  const [devMessage, setDevMessage] = React.useState('')
  const [updateState, setUpdateState] = React.useState(null) // { current, latest, hasUpdate }
  const [updateBusy, setUpdateBusy] = React.useState(false)
  const [updateMessage, setUpdateMessage] = React.useState('')
  const [minW, setMinW] = React.useState(SIDEBAR_MIN_DEFAULT)
  const [minDraft, setMinDraft] = React.useState(null) // 输入草稿（null=跟随已保存值；blur/Enter 提交）
  const [limit, setLimit] = React.useState(EDITOR_LIMIT_DEFAULT)
  const [limitDraft, setLimitDraft] = React.useState(null) // 页签上限草稿（同上提交语义）
  const [nativeSaved, setNativeSaved] = React.useState(DEFAULT_NATIVE_CSV) // 原生打开范围已保存值
  const [nativeDraft, setNativeDraft] = React.useState(null) // 原生打开范围草稿（同上提交语义）
  const [refIntakeOn, setRefIntakeOn] = React.useState(true) // 引用接入（拖拽/粘贴/复制 → 引用 chip）
  const [searchReplaceOn, setSearchReplaceOn] = React.useState(true) // 搜索面板全局替换
  const [extWatchOn, setExtWatchOn] = React.useState(true) // 外部改动实时捕获（watch）
  const [extScanOn, setExtScanOn] = React.useState(true) // 外部改动补扫（启动对齐与定时）
  const [kbMessage, setKbMessage] = React.useState('') // 打开官方快捷键弹窗的失败说明（空 = 未失败）
  const settings = React.useContext(SettingsContext)
  const snapshot = settings?.getSnapshot?.()
  const loading = !snapshot || snapshot.status === 'loading'
  const unavailable = snapshot?.status === 'unavailable' || !settings
  const notReady = snapshot?.status !== 'ready'
  React.useEffect(() => {
    const onChange = () => {
      const snap = settings?.getSnapshot?.()
      const next = snap?.value?.fileOpenTool
      if (typeof next === 'string') setTool(next)
      setMinW(normalizeSidebarMinWidth(snap?.value?.sidebarMinWidth))
      setLimit(normalizeMaxOpenEditors(snap?.value?.maxOpenEditors))
      const native = snap?.value?.nativeOpenExts
      setNativeSaved(typeof native === 'string' && native.trim() ? native : DEFAULT_NATIVE_CSV)
      setRefIntakeOn(snap?.value?.refIntake !== false)
      setSearchReplaceOn(snap?.value?.searchReplace !== false)
      setExtWatchOn(snap?.value?.externalWatch !== false)
      setExtScanOn(snap?.value?.externalScan !== false)
    }
    onChange()
    return settings?.subscribe?.(onChange)
  }, [settings])
  React.useEffect(() => {
    rpc('vscode.devFormGet', {}).then((result) => {
      if (result.ok) setDevForm(result.devForm)
    }).catch(() => { /* 开发形态查询失败静默 */ })
  }, [])
  const save = (value) => {
    setTool(value); setBusy(true); setError('')
    if (!settings?.set) { setError(uiText('设置服务不可用', "Settings service unavailable", "Сервис настроек недоступен")); setBusy(false); return }
    settings.set('fileOpenTool', value).catch((e) => setError(String(e))).finally(() => setBusy(false))
  }
  /** 提交侧边栏最小宽度（归一化夹取 180–560 后持久化）。 */
  const saveMinW = (raw) => {
    const next = normalizeSidebarMinWidth(raw)
    setMinW(next); setBusy(true); setError('')
    if (!settings?.set) { setError(uiText('设置服务不可用', "Settings service unavailable", "Сервис настроек недоступен")); setBusy(false); return }
    settings.set('sidebarMinWidth', next).catch((e) => setError(String(e))).finally(() => setBusy(false))
  }
  /** 结束输入（blur/Enter）时提交草稿。 */
  const commitMinW = () => {
    if (minDraft === null) return
    setMinDraft(null)
    saveMinW(minDraft)
  }
  /** 提交页签数量上限（归一化夹取 0–50 后持久化；0 = 不限制）。 */
  const saveLimit = (raw) => {
    const next = normalizeMaxOpenEditors(raw)
    setLimit(next); setBusy(true); setError('')
    if (!settings?.set) { setError(uiText('设置服务不可用', "Settings service unavailable", "Сервис настроек недоступен")); setBusy(false); return }
    settings.set('maxOpenEditors', next).catch((e) => setError(String(e))).finally(() => setBusy(false))
  }
  /** 结束输入（blur/Enter）时提交页签上限草稿。 */
  const commitLimit = () => {
    if (limitDraft === null) return
    setLimitDraft(null)
    saveLimit(limitDraft)
  }
  /** 提交原生打开范围（逗号分隔后缀；空串回落默认让位清单后持久化）。 */
  const saveNative = (raw) => {
    const next = String(raw ?? '').trim() || DEFAULT_NATIVE_CSV
    setNativeSaved(next); setNativeDraft(null); setBusy(true); setError('')
    if (!settings?.set) { setError(uiText('设置服务不可用', "Settings service unavailable", "Сервис настроек недоступен")); setBusy(false); return }
    settings.set('nativeOpenExts', next).catch((e) => setError(String(e))).finally(() => setBusy(false))
  }
  /** 结束输入（blur/Enter）时提交原生打开范围草稿。 */
  const commitNative = () => {
    if (nativeDraft === null) return
    saveNative(nativeDraft)
  }
  /**
   * 提交布尔开关（引用接入 / 搜索替换）。
   * @author ddj 2026年11月15号
   * @param key 设置字段名
   * @param value 新值（true/false）
   * @param apply 乐观写入本地状态的函数（失败时用 !value 回滚）
   * @returns 无（失败经 error 状态提示）
   * @sideEffects 写设置文档；客户端特性读取由 index.ts 的设置桥同拍推送
   */
  const saveToggle = (key, value, apply) => {
    apply(value)
    setBusy(true)
    setError('')
    if (!settings?.set) {
      setError(uiText('设置服务不可用', "Settings service unavailable", "Сервис настроек недоступен"))
      apply(!value)
      setBusy(false)
      return
    }
    settings.set(key, value).catch((e) => {
      setError(String(e))
      apply(!value)
    }).finally(() => setBusy(false))
  }
  const closeDevForm = () => {
    if (!window.confirm(uiText('关闭开发形态：插件将切换为正式版安装（版本依赖 + 删除工作区链接），pnpm 装配后需重启 DSH 生效。确认关闭？', "Disable development mode? This switches to a release installation (version dependency and removal of the workspace link). Restart DSH after pnpm assembly to apply.", "Отключить режим разработки? Плагин перейдёт на релизную установку (зависимость версии вместо ссылки на рабочее пространство). После сборки pnpm перезапустите DSH."))) return
    setDevBusy(true)
    setDevMessage('')
    rpc('vscode.devFormSet', { enabled: false }).then((result) => {
      if (!result.ok) { setDevMessage(uiText('关闭失败：', "Failed to disable: ", "Не удалось отключить: ") + String(result.error)); return }
      setDevForm(result.devForm)
      setDevMessage(result.restart ? uiText('已切换为正式版，重启 DSH 后生效。', "Switched to release mode. Restart DSH to apply.", "Выбран релизный режим. Перезапустите DSH для применения.") : uiText('已关闭开发形态。', "Development mode disabled.", "Режим разработки отключён."))
    }).catch((e) => setDevMessage(uiText('关闭失败：', "Failed to disable: ", "Не удалось отключить: ") + String(e))).finally(() => setDevBusy(false))
  }
  /** 检查 npm registry 是否有比当前版本更新的发布（结果落 updateState）。 */
  const runUpdateCheck = () => {
    setUpdateBusy(true)
    setUpdateMessage('')
    rpc('vscode.updateCheck', {}).then((result) => {
      if (!result.ok) { setUpdateMessage(uiText('检查失败：', "Check failed: ", "Ошибка проверки: ") + String(result.error)); return }
      setUpdateState({ current: result.current ?? '', latest: result.latest ?? '', hasUpdate: result.hasUpdate === true })
      setUpdateMessage(result.hasUpdate ? uiText('发现新版本 v', "New version available: v", "Доступна новая версия v") + result.latest : uiText('已是最新版本。', "Already up to date.", "Установлена актуальная версия."))
    }).catch((e) => setUpdateMessage(uiText('检查失败：', "Check failed: ", "Ошибка проверки: ") + String(e))).finally(() => setUpdateBusy(false))
  }
  /** 触发官方 pluginManager「先删后装」自我更新（页面会断开，成功与否均不再回报本页）。 */
  const runSelfUpdate = () => {
    const target = updateState?.latest ?? ''
    if (!window.confirm(uiText('更新到 v', "Update to v", "Обновить до v") + target + uiText('：更新中插件会先卸载再安装，页面将短暂断开，完成后请刷新页面或重启 DSH。\n注意：若安装失败（如断网），插件会保持未安装状态，可在官方插件管理页重新安装恢复。确认更新？', ": the plugin is uninstalled before reinstalling, briefly disconnecting this page. Refresh or restart DSH afterward.\nWarning: if installation fails (e.g. offline), the plugin stays uninstalled. Reinstall it from official plugin management to recover. Confirm update?", ": плагин будет удалён перед повторной установкой, страница временно отключится. Затем обновите страницу или перезапустите DSH.\nВнимание: при ошибке установки (например без сети) плагин останется удалённым. Восстановите его через стандартное управление плагинами. Подтвердить обновление?"))) return
    setUpdateBusy(true)
    setUpdateMessage('')
    rpc('vscode.updateSelf', {}).then((result) => {
      if (!result.ok) { setUpdateMessage(uiText('更新失败：', "Update failed: ", "Ошибка обновления: ") + String(result.error)); setUpdateBusy(false); return }
      setUpdateMessage(uiText('更新已开始，页面即将断开；完成后请刷新页面或重启 DSH。', "Update started; the page will disconnect. Refresh the page or restart DSH when complete.", "Обновление началось; страница отключится. После завершения обновите страницу или перезапустите DSH."))
    }).catch((e) => { setUpdateMessage(uiText('更新失败：', "Update failed: ", "Ошибка обновления: ") + String(e)); setUpdateBusy(false) })
  }
  /**
   * 唤起官方快捷键弹窗（键位统一归官方机制；入口不可用时展示手动打开方式）。
   * @author ddj 2026年09月28号
   */
  const openShortcuts = () => {
    const probe = typeof getShortcuts === 'function' ? getShortcuts : () => null
    setKbMessage(openOfficialShortcuts(probe()))
  }
  const options = [{ id: AUTO_OPEN_TOOL, label: uiText('自动选择', "Automatic", "Автоматически"), description: uiText('按当前已注册工具自动选择', "Automatically select a registered tool", "Автоматический выбор зарегистрированного инструмента") }, ...availableOpeners(registry).map((item) => ({ id: item.id, label: item.label, description: item.description }))]
  const currentOption = options.some((item) => item.id === tool) ? tool : AUTO_OPEN_TOOL
  const devFormRow = devForm?.enabled ? React.createElement('div', { className: 'vsm-general-row' },
    React.createElement('span', null, uiText('开发形态', "Development mode", "Режим разработки"), React.createElement('small', { className: 'vsm-devform-note' }, uiText('工作区链接安装：', "Workspace-link installation: ", "Установка через ссылку на рабочее пространство: ") + devForm.path)),
    React.createElement('div', { className: 'vsm-devform-actions' },
      devMessage && React.createElement('small', { className: 'vsm-devform-msg' }, devMessage),
      React.createElement('button', { className: 'vsm-devform-close', disabled: devBusy, onClick: closeDevForm }, devBusy ? uiText('切换中…', "Switching…", "Переключение…") : uiText('关闭开发形态', "Disable development mode", "Отключить режим разработки")),
    ),
  ) : null
  const updateRow = React.createElement('div', { className: 'vsm-general-row' },
    React.createElement('span', null, uiText('插件更新', "Plugin updates", "Обновления плагина"),
      React.createElement('small', { className: 'vsm-devform-note' },
        uiText('当前版本 v', "Current version v", "Текущая версия v") + (updateState?.current ?? '') + (devForm?.enabled ? uiText('；开发形态下请走工作区同步流程', "; use workspace synchronization in development mode", "; в режиме разработки используйте синхронизацию рабочего пространства") : ''))),
    React.createElement('div', { className: 'vsm-devform-actions' },
      updateMessage && React.createElement('small', { className: 'vsm-devform-msg' }, updateMessage),
      updateState?.hasUpdate
        ? React.createElement('button', { disabled: updateBusy || devForm?.enabled === true, onClick: runSelfUpdate, title: devForm?.enabled ? uiText('开发形态下请走工作区同步流程', "Use workspace synchronization in development mode", "В режиме разработки используйте синхронизацию рабочего пространства") : undefined }, updateBusy ? uiText('更新中…', "Updating…", "Обновление…") : uiText('更新到 v', "Update to v", "Обновить до v") + (updateState.latest ?? ''))
        : React.createElement('button', { disabled: updateBusy || devForm?.enabled === true, onClick: runUpdateCheck, title: devForm?.enabled ? uiText('开发形态下请走工作区同步流程', "Use workspace synchronization in development mode", "В режиме разработки используйте синхронизацию рабочего пространства") : undefined }, updateBusy ? uiText('检查中…', "Checking…", "Проверка…") : uiText('检查更新', "Check for updates", "Проверить обновления")),
    ),
  )
  return React.createElement('section', { className: 'vsm-general-page' },

    unavailable && React.createElement('div', { className: 'vsm-mcp-error vsm-mcp-banner' }, uiText('设置服务暂不可用，当前使用自动选择。', "Settings service is temporarily unavailable. Automatic selection is active.", "Сервис настроек временно недоступен. Используется автоматический выбор.")),
    error && React.createElement('div', { className: 'vsm-mcp-error vsm-mcp-banner' }, error),
    React.createElement('section', { className: 'vsm-panel' },
      React.createElement('h3', { className: 'vsm-panel-title' }, uiText('文件打开', "Opening files", "Открытие файлов")),
      React.createElement('div', { className: 'vsm-panel-body' },
        React.createElement('label', { className: 'vsm-general-row' }, React.createElement('span', null, uiText('文件链接使用工具', "Tool for file links", "Инструмент для файловых ссылок")), React.createElement('select', { value: currentOption, disabled: loading || unavailable || notReady || busy || snapshot?.writable === false, onChange: (event) => save(event.target.value) }, options.map((item) => React.createElement('option', { key: item.id, value: item.id }, item.label))), loading && React.createElement('small', null, uiText('读取中…', "Loading…", "Загрузка…"))),

      ),
    ),
    React.createElement('section', { className: 'vsm-panel' },
      React.createElement('h3', { className: 'vsm-panel-title' }, uiText('编辑器', "Editor", "Редактор")),
      React.createElement('div', { className: 'vsm-panel-body' },
        React.createElement(SettingRow, { label: uiText('侧边栏最小宽度', "Minimum sidebar width", "Минимальная ширина боковой панели"), description: uiText('180–560 px；拖拽低于此宽度时自动隐藏。', "180–560 px; dragging below this width hides the sidebar.", "180–560 px; при уменьшении ниже этой ширины панель скрывается.") },
          React.createElement(Input, {
            type: 'number', min: 180, max: 560, step: 10,
            value: minDraft ?? minW,
            disabled: loading || unavailable || notReady || busy || snapshot?.writable === false,
            title: uiText('180–560 px；拖拽侧边栏低于该宽度时自动隐藏', "180–560 px; hide the sidebar when dragged below this width", "180–560 px; скрывать панель при уменьшении ниже этой ширины"),
            onChange: (event) => setMinDraft(event.target.value),
            onBlur: commitMinW,
            onKeyDown: (event) => { if (event.key === 'Enter') commitMinW() },
          })),
        React.createElement(SettingRow, { label: uiText('页签数量上限', "Maximum open tabs", "Максимум открытых вкладок"), description: uiText('0 表示不限制；超限时关闭最久未使用的页签，固定页签除外。', "0 means unlimited. Above the limit, close the least recently used unpinned tab.", "0 — без ограничения. При превышении закрывается самая давно неиспользованная незакреплённая вкладка.") },
          React.createElement(Input, {
            type: 'number', min: 0, max: EDITOR_LIMIT_CEIL, step: 1,
            value: limitDraft ?? limit,
            disabled: loading || unavailable || notReady || busy || snapshot?.writable === false,
            title: uiText('0 = 不限制；超出上限时自动关闭最久未使用的页签（固定页签不受影响）', "0 = unlimited; exceeding the limit closes the least recently used tab (pinned tabs are unaffected)", "0 = без ограничения; при превышении закрывается самая давно неиспользованная вкладка (кроме закреплённых)"),
            onChange: (event) => setLimitDraft(event.target.value),
            onBlur: commitLimit,
            onKeyDown: (event) => { if (event.key === 'Enter') commitLimit() },
          })),
        React.createElement(SettingRow, { label: uiText('原生预览文件类型', "Native preview file types", "Типы файлов для встроенного просмотра"), description: uiText('后缀以逗号分隔；留空恢复默认 Office 与二进制类型。CSV、TSV 需显式加入。', "Comma-separated extensions; leave empty to restore default Office and binary types. Add CSV and TSV explicitly.", "Расширения через запятую; пустое поле восстанавливает типы Office и двоичные файлы по умолчанию. CSV и TSV добавляются явно.") },
          React.createElement(Input, {
            type: 'text',
            value: nativeDraft ?? nativeSaved,
            disabled: loading || unavailable || notReady || busy || snapshot?.writable === false,
            title: uiText('逗号分隔后缀（如 doc,xlsx）：文件树点击命中时用 DSH 官方预览原生打开；留空 = 默认让位清单（Office + 不可预览二进制）', "Comma-separated extensions (e.g. doc,xlsx): matching files open in DSH native preview. Empty = defaults (Office and non-previewable binaries).", "Расширения через запятую (например doc,xlsx): соответствующие файлы открываются встроенным просмотром DSH. Пустое поле = Office и двоичные файлы по умолчанию."),
            placeholder: uiText('doc,xlsx,…（留空恢复默认）', "doc,xlsx,… (empty restores defaults)", "doc,xlsx,… (пустое поле восстанавливает значения)"),
            onChange: (event) => setNativeDraft(event.target.value),
            onBlur: commitNative,
            onKeyDown: (event) => { if (event.key === 'Enter') commitNative() },
          })),
      ),
    ),
    React.createElement('section', { className: 'vsm-panel' },
      React.createElement('h3', { className: 'vsm-panel-title' }, uiText('交互', "Interaction", "Взаимодействие")),
      React.createElement('div', { className: 'vsm-panel-body' },
        React.createElement(SettingRow, { label: uiText('引用接入', "Reference intake", "Добавление ссылок в диалог"), description: uiText('资源管理器拖入的文件、编辑器里复制的行选区、粘贴的文件会落成对话引用 chip；关闭后完全走原生行为。', "Dragged files, copied editor line selections, and pasted files become conversation reference chips. Disable to use native behavior.", "Перетаскиваемые файлы, скопированные строки редактора и вставленные файлы становятся ссылками в диалоге. Отключите для стандартного поведения.") },
          React.createElement('input', {
            type: 'checkbox', checked: refIntakeOn,
            disabled: loading || unavailable || notReady || busy || snapshot?.writable === false,
            onChange: (event) => saveToggle('refIntake', event.target.checked, setRefIntakeOn),
          })),
        React.createElement(SettingRow, { label: uiText('搜索替换', "Search and replace", "Поиск и замена"), description: uiText('搜索面板显示替换入口（先预览命中再确认写盘）；关闭后只保留搜索。', "Show replacement controls in search (preview matches before confirming writes). Disable to keep search only.", "Показывать замену в панели поиска (предпросмотр совпадений перед подтверждением записи). При отключении остаётся только поиск.") },
          React.createElement('input', {
            type: 'checkbox', checked: searchReplaceOn,
            disabled: loading || unavailable || notReady || busy || snapshot?.writable === false,
            onChange: (event) => saveToggle('searchReplace', event.target.checked, setSearchReplaceOn),
          })),
      ),
    ),
    React.createElement('section', { className: 'vsm-panel' },
      React.createElement('h3', { className: 'vsm-panel-title' }, uiText('改动捕获', "Change capture", "Отслеживание изменений")),
      React.createElement('div', { className: 'vsm-panel-body' },
        React.createElement(SettingRow, { label: uiText('实时捕获', "Live capture", "Отслеживание в реальном времени"), description: uiText('agent 用 shell 或脚本（node -e、prettier、生成器）写文件时，改动也会进审查面板；关闭后只认 edit/write 等写工具。', "Include changes written by agents through shell commands or scripts (node -e, prettier, generators) in the review panel. Disable to track only write tools such as edit/write.", "Включать в проверку изменения агента через shell и скрипты (node -e, prettier, генераторы). При отключении учитываются только инструменты записи, например edit/write.") },
          React.createElement('input', {
            type: 'checkbox', checked: extWatchOn,
            disabled: loading || unavailable || notReady || busy || snapshot?.writable === false,
            onChange: (event) => saveToggle('externalWatch', event.target.checked, setExtWatchOn),
          })),
        React.createElement(SettingRow, { label: uiText('补扫对齐', "Catch-up scan", "Дополнительное сканирование"), description: uiText('启动时与每 10 分钟用版本库比对一次，把漏采的改动补录进来；关闭后仍可手动补扫。', "Compare with version control at startup and every 10 minutes to capture missed changes. Manual scans remain available when disabled.", "Сравнивать с репозиторием при запуске и каждые 10 минут для поиска пропущенных изменений. Ручное сканирование доступно и при отключении.") },
          React.createElement('input', {
            type: 'checkbox', checked: extScanOn,
            disabled: loading || unavailable || notReady || busy || snapshot?.writable === false,
            onChange: (event) => saveToggle('externalScan', event.target.checked, setExtScanOn),
          })),
      ),
    ),
    React.createElement('section', { className: 'vsm-panel' },
      React.createElement('h3', { className: 'vsm-panel-title' }, uiText('快捷键', "Keyboard shortcuts", "Сочетания клавиш")),
      React.createElement('div', { className: 'vsm-panel-body' },
        React.createElement('label', { className: 'vsm-general-row' },
          React.createElement('span', null, uiText('键位配置', "Shortcut configuration", "Настройка сочетаний клавиш"),
            React.createElement('small', { className: 'vsm-devform-note' },
              uiText('在官方快捷键面板统一配置插件与 DSH 命令，支持录键、冲突检查及恢复默认。', "Configure plugin and DSH commands in the official shortcut panel, with key recording, conflict checks, and reset to defaults.", "Настройте команды плагина и DSH в стандартной панели сочетаний клавиш: запись клавиш, проверка конфликтов и сброс настроек."))),
          React.createElement(Button, { variant: 'outline', size: 'sm', onClick: openShortcuts }, uiText('配置快捷键', "Configure shortcuts", "Настроить сочетания клавиш"))),
        kbMessage && React.createElement('small', { className: 'vsm-devform-msg' }, kbMessage)),
    ),
    React.createElement('section', { className: 'vsm-panel' },
      React.createElement('h3', { className: 'vsm-panel-title' }, uiText('安装与更新', "Installation and updates", "Установка и обновления")),
      React.createElement('div', { className: 'vsm-panel-body' }, devFormRow, updateRow)),
    React.createElement(SvnSettingsSection, null),
    React.createElement(IntegrationSettings, null),
  )
}

/** 检测快照 → 一行状态文案（未检测/未检出/能力可用性）。 */
function svnStatusText(info) {
  if (!info) return uiText('未检测（打开编辑器后自动检测）', "Not checked (checked automatically when the editor opens)", "Не проверено (проверка при открытии редактора)")
  if (!info.managed) return uiText('当前工作区不受 SVN 管理（SVN 入口隐藏）', "Workspace is not managed by SVN (SVN controls hidden)", "Рабочее пространство не использует SVN (элементы SVN скрыты)")
  const parts = [info.svnCli ? uiText('svn CLI 可用', "svn CLI available", "svn CLI доступен") : uiText('svn CLI 不可用（更新不可用）', "svn CLI unavailable (update unavailable)", "svn CLI недоступен (обновление недоступно)")]
  parts.push(info.tortoise ? uiText('TortoiseSVN 可用', "TortoiseSVN available", "TortoiseSVN доступен") : uiText('TortoiseSVN 不可用（仅 Windows）', "TortoiseSVN unavailable (Windows only)", "TortoiseSVN недоступен (только Windows)"))
  return uiText('受 SVN 管理 · ', "Managed by SVN · ", "Под управлением SVN · ") + parts.join(' · ')
}

/**
 * SVN 设置节：路径覆盖 + 检测状态行。
 * 写入经 SettingsContext（namespace dsh-vscode-mode）；状态经 svn.status 直测（force），
 * 并监听 edrv:svn-status 事件跟随编辑器侧重测结果刷新。
 * @author ddj 2026年09月16号
 */
function SvnSettingsSection() {
  const settings = React.useContext(SettingsContext)
  const snapshot = settings?.getSnapshot?.()
  const loading = !snapshot || snapshot.status === 'loading'
  const unavailable = snapshot?.status === 'unavailable' || !settings
  const notReady = snapshot?.status !== 'ready'
  const [svnPath, setSvnPath] = React.useState('')
  const [svnDraft, setSvnDraft] = React.useState(null)
  const [tortoisePath, setTortoisePath] = React.useState('')
  const [tortoiseDraft, setTortoiseDraft] = React.useState(null)
  const [readOnly, setReadOnly] = React.useState(false)
  const [scale, setScale] = React.useState(1)
  const [autoAdd, setAutoAdd] = React.useState(true)
  const [autoDelete, setAutoDelete] = React.useState(true)
  const [commitStyle, setCommitStyle] = React.useState('plain')
  const [svnInfo, setSvnInfo] = React.useState(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  React.useEffect(() => {
    const onChange = () => {
      const snap = settings?.getSnapshot?.()
      setSvnPath(typeof snap?.value?.svnPath === 'string' ? snap.value.svnPath : '')
      setTortoisePath(typeof snap?.value?.tortoisePath === 'string' ? snap.value.tortoisePath : '')
      setReadOnly(snap?.value?.svnReadOnly === true)
      setScale(typeof snap?.value?.svnCommandTimeoutScale === 'number' ? snap.value.svnCommandTimeoutScale : 1)
      setAutoAdd(snap?.value?.svnAutoAddUnversioned !== false)
      setAutoDelete(snap?.value?.svnAutoDeleteMissing !== false)
      setCommitStyle(snap?.value?.aiCommitStyle === 'conventional' ? 'conventional' : 'plain')
    }
    onChange()
    return settings?.subscribe?.(onChange)
  }, [settings])
  const probe = React.useCallback(() => {
    rpc('svn.status', { force: true }).then((res) => {
      if (res.ok) { setSvnInfo(res); setError('') }
      else setSvnInfo(null)
    }).catch(() => setSvnInfo(null))
  }, [])
  React.useEffect(() => { probe() }, [probe])
  React.useEffect(() => {
    const onSvnStatus = () => probe()
    window.addEventListener('edrv:svn-status', onSvnStatus)
    return () => window.removeEventListener('edrv:svn-status', onSvnStatus)
  }, [probe])
  /** 提交路径字段（blur/Enter 共用；成功后强制重测反映新路径）。 */
  const savePath = (key, value, apply) => {
    setBusy(true); setError('')
    if (!settings?.set) { setError(uiText('设置服务不可用', "Settings service unavailable", "Сервис настроек недоступен")); setBusy(false); return }
    settings.set(key, value).then(() => { apply(); probe() }).catch((e) => setError(String(e))).finally(() => setBusy(false))
  }
  const commitSvn = () => {
    if (svnDraft === null) return
    const next = svnDraft.trim()
    setSvnDraft(null)
    savePath('svnPath', next, () => setSvnPath(next))
  }
  const commitTortoise = () => {
    if (tortoiseDraft === null) return
    const next = tortoiseDraft.trim()
    setTortoiseDraft(null)
    savePath('tortoisePath', next, () => setTortoisePath(next))
  }
  /** 通用设置写入（布尔/数字/枚举；失败就地报错，不吞）。 */
  const saveValue = (key, value, apply) => {
    setBusy(true); setError('')
    if (!settings?.set) { setError(uiText('设置服务不可用', "Settings service unavailable", "Сервис настроек недоступен")); setBusy(false); return }
    settings.set(key, value).then(() => { apply() }).catch((e) => setError(String(e))).finally(() => setBusy(false))
  }
  const disabled = loading || unavailable || notReady || busy || snapshot?.writable === false
  return React.createElement('section', { className: 'vsm-panel' },
    React.createElement('h3', { className: 'vsm-panel-title' }, 'SVN'),
    React.createElement('div', { className: 'vsm-panel-body' },
      React.createElement('div', { className: 'vsm-general-row' },
        React.createElement('span', null, uiText('检测状态', "Detection status", "Статус обнаружения")),
        React.createElement('small', null, svnStatusText(svnInfo)),
        React.createElement('button', { className: 'vsm-primary vsm-small', disabled: busy, onClick: probe, title: uiText('重新检测', "Detect again", "Повторить обнаружение") }, uiText('重测', "Retest", "Проверить снова"))),
      error && React.createElement('small', { className: 'vsm-mcp-error' }, error),
      React.createElement('label', { className: 'vsm-general-row' },
        React.createElement('span', null, uiText('svn 可执行路径', "svn executable path", "Путь к исполняемому файлу svn")),
        React.createElement('input', {
          value: svnDraft ?? svnPath, placeholder: uiText('空 = 使用 PATH 中的 svn', "Empty = use svn from PATH", "Пусто = использовать svn из PATH"), disabled,
          onChange: (event) => setSvnDraft(event.target.value),
          onBlur: commitSvn,
          onKeyDown: (event) => { if (event.key === 'Enter') commitSvn() },
        })),
      React.createElement('label', { className: 'vsm-general-row' },
        React.createElement('span', null, uiText('TortoiseSVN 目录', "TortoiseSVN directory", "Каталог TortoiseSVN")),
        React.createElement('input', {
          value: tortoiseDraft ?? tortoisePath, placeholder: TORTOISE_DIR_DEFAULT, disabled,
          onChange: (event) => setTortoiseDraft(event.target.value),
          onBlur: commitTortoise,
          onKeyDown: (event) => { if (event.key === 'Enter') commitTortoise() },
        })),
      React.createElement('label', { className: 'vsm-general-row' },
        React.createElement('span', null, uiText('超时倍数', "Timeout multiplier", "Множитель тайм-аута")),
        React.createElement('input', {
          value: String(scale), placeholder: '1', disabled, title: uiText('SVN 命令超时倍数（0.2–20；仓库慢或工作副本大时调到 2–3）', "SVN command timeout multiplier (0.2–20; use 2–3 for slow repositories or large working copies)", "Множитель тайм-аута SVN (0.2–20; 2–3 для медленных репозиториев или больших рабочих копий)"),
          onChange: (event) => {
            const next = Number(event.target.value)
            if (Number.isFinite(next)) setScale(next)
          },
          onBlur: () => saveValue('svnCommandTimeoutScale', Math.min(20, Math.max(0.2, scale)), () => {}),
        })),
      React.createElement('label', { className: 'vsm-general-row' },
        React.createElement('span', null, uiText('只读模式', "Read-only mode", "Режим только чтения")),
        React.createElement('input', {
          type: 'checkbox', checked: readOnly, disabled,
          title: uiText('开启后拒绝全部写操作（提交/还原/更新/属性写入），只保留查看与比对', "Reject all writes (commit/revert/update/property changes); allow viewing and comparison only", "Запретить запись (коммиты, откат, обновление, свойства); оставить просмотр и сравнение"),
          onChange: () => saveValue('svnReadOnly', !readOnly, () => setReadOnly(!readOnly)),
        })),
      React.createElement('label', { className: 'vsm-general-row' },
        React.createElement('span', null, uiText('提交前自动加入', "Auto-add before commit", "Автодобавление перед коммитом")),
        React.createElement('input', {
          type: 'checkbox', checked: autoAdd, disabled,
          title: uiText('提交时对勾选的未版本控制文件自动 svn add（关闭后这些文件会被跳过并在结果里列出）', "Run svn add for selected unversioned files before commit (otherwise skip them and list them in the result)", "Выполнять svn add для выбранных неотслеживаемых файлов перед коммитом (иначе пропустить и указать в результате)"),
          onChange: () => saveValue('svnAutoAddUnversioned', !autoAdd, () => setAutoAdd(!autoAdd)),
        })),
      React.createElement('label', { className: 'vsm-general-row' },
        React.createElement('span', null, uiText('提交前自动删除', "Auto-delete before commit", "Автоудаление перед коммитом")),
        React.createElement('input', {
          type: 'checkbox', checked: autoDelete, disabled,
          title: uiText('提交时对勾选的已删除文件自动 svn delete（关闭后这些文件会被跳过并在结果里列出）', "Run svn delete for selected missing files before commit (otherwise skip them and list them in the result)", "Выполнять svn delete для выбранных удалённых файлов перед коммитом (иначе пропустить и указать в результате)"),
          onChange: () => saveValue('svnAutoDeleteMissing', !autoDelete, () => setAutoDelete(!autoDelete)),
        })),
      React.createElement('label', { className: 'vsm-general-row' },
        React.createElement('span', null, uiText('AI 提交信息风格', "AI commit message style", "Стиль сообщения коммита ИИ")),
        React.createElement('select', {
          value: commitStyle, disabled,
          title: uiText('plain = 中文「<模块>：<标题>」；conventional = type(scope): subject', "plain = Chinese “<module>: <title>”; conventional = type(scope): subject", "plain = китайский шаблон «<модуль>: <заголовок>»; conventional = type(scope): subject"),
          onChange: (event) => {
            const next = event.target.value === 'conventional' ? 'conventional' : 'plain'
            saveValue('aiCommitStyle', next, () => setCommitStyle(next))
          },
        },
          React.createElement('option', { value: 'plain' }, uiText('中文模板', "Chinese template", "Китайский шаблон")),
          React.createElement('option', { value: 'conventional' }, 'Conventional Commits'))),
    ),
  )
}

/** 兼容性小节：host 报告（RPC compat）+ 客户端本地适配项。 */
function CompatSection({ getSummary }) {
  const [report, setReport] = React.useState(null)
  const [error, setError] = React.useState('')
  React.useEffect(() => {
    let alive = true
    rpc('compat', {}).then((result) => {
      if (!alive) return
      if (!result.ok) setError(String(result.error))
      else setReport(result.report)
    }).catch((e) => { if (alive) setError(String(e)) })
    return () => { alive = false }
  }, [])
  const renderItems = (list) => (list ?? []).map((item) => React.createElement('div', { key: item.name, className: 'vsm-compat-item ' + (item.active ? 'ok' : 'warn') },
    React.createElement('span', { className: 'vsm-compat-name' }, item.name),
    React.createElement('span', { className: 'vsm-compat-note' }, item.note ?? (item.active ? uiText('正常', "OK", "Работает") : uiText('未生效', "Inactive", "Не действует"))),
  ))
  /** 兼容性分组面板：标题 + 线框内容区。 */
  const group = (title, children) => React.createElement('section', { className: 'vsm-panel' },
    React.createElement('h3', { className: 'vsm-panel-title' }, title),
    React.createElement('div', { className: 'vsm-panel-body' }, children),
  )
  const warnings = report?.warnings ?? []
  const devForm = report?.devForm
  const versionText = report?.dshVersion
    ? uiText('（DSH ', "(DSH ", "(DSH ") + report.dshVersion + uiText(' · 插件 ', " · Plugin ", " · Плагин ") + (report?.pluginVersion ?? '') + uiText('）', ")", ")")
    : report?.pluginVersion ? uiText('（插件版本 ', "(Plugin version ", "(Версия плагина ") + report.pluginVersion + uiText('）', ")", ")") : ''
  return React.createElement('section', { className: 'vsm-general-page' },
    React.createElement('h2', null, uiText('兼容性', "Compatibility", "Совместимость")),
    React.createElement('p', null, uiText('检测与其他插件 / DSH 版本的适配状态与已知问题。', "Check compatibility with other plugins and DSH versions, including known issues.", "Проверка совместимости с другими плагинами и версиями DSH, включая известные проблемы.") + versionText),
    error && React.createElement('div', { className: 'vsm-mcp-error vsm-mcp-banner' }, error),
    devForm?.enabled && group(uiText('开发形态', "Development mode", "Режим разработки"), React.createElement('div', { className: 'vsm-compat-item ok' }, React.createElement('span', { className: 'vsm-compat-name' }, uiText('开发形态开启（工作区链接安装）', "Development mode enabled (workspace-link installation)", "Режим разработки включён (ссылка на рабочее пространство)")), React.createElement('span', { className: 'vsm-compat-note' }, devForm.path))),
    group(uiText('版本适配', "Version adapters", "Адаптеры версий"), renderItems(report?.adapters)),
    group(uiText('外部插件与服务', "External plugins and services", "Внешние плагины и сервисы"), renderItems(report?.external)),
    group(uiText('客户端适配', "Client adapters", "Клиентские адаптеры"), renderItems(getSummary?.(report?.dshVersion ?? '') ?? [])),
    group(uiText('护栏', "Guardrails", "Защитные ограничения"), renderItems(report?.guards)),
    group(uiText('警告', "Warnings", "Предупреждения"), warnings.length ? warnings.map((w, index) => React.createElement('div', { key: index, className: 'vsm-mcp-error vsm-mcp-banner' }, w)) : React.createElement('div', { className: 'vsm-compat-item ok' }, React.createElement('span', { className: 'vsm-compat-name' }, uiText('未检测到兼容性问题', "No compatibility issues detected", "Проблем совместимости не обнаружено")), React.createElement('span', { className: 'vsm-compat-note' }, ''))),
  )
}

/** MCP 管理子页签定义（我的 / 项目 / 市场）。 */
const MCP_TABS = [
  { id: 'mine', get label() { return uiText('我的 MCP', "My MCP", "Мои MCP") } },
  { id: 'projects', get label() { return uiText('项目 MCP', "Project MCP", "MCP проекта") } },
  { id: 'market', get label() { return uiText('MCP 市场', "MCP marketplace", "Каталог MCP") } },
]

/**
 * MCP 管理面板：顶层「MCP 管理」Tab 下的三个子页签容器。
 * 作者 ddj 2026年08月27号
 * @param {object[]} servers 全局 MCP 服务列表
 * @param {object[]} projects 项目及其项目级 MCP 列表
 * @param {string} busy 正在执行的操作标识
 * @param {object} draft 新增表单草稿
 * @param {Function} edit 草稿字段变更回调
 * @param {Function} resetDraft 清空草稿回调
 * @author ddj 2026年10月08号
 */
function McpManagePanel(props) {
  const { projects, busy, draft, edit, resetDraft, saveGlobal, saveProject } = props
  const [mcpTab, setMcpTab] = React.useState('mine')
  const [showForm, setShowForm] = React.useState(false)
  const [projectForm, setProjectForm] = React.useState(null)
  const [selectedPath, setSelectedPath] = React.useState('')

  React.useEffect(() => {
    if (!projects.length) {
      setSelectedPath('')
      return
    }
    if (!projects.some((project) => project.workspacePath === selectedPath)) setSelectedPath(projects[0].workspacePath)
  }, [projects, selectedPath])

  /** @author ddj 2026年10月08号 @description Close the successful global form. */
  const closeGlobalForm = () => setShowForm(false)
  /** @author ddj 2026年10月08号 @description Close the successful project form. */
  const closeProjectForm = () => setProjectForm(null)
  /** @author ddj 2026年10月08号 @param project Target project. @description Open a project draft only when idle. */
  const addProject = (project) => {
    if (busy) return
    resetDraft?.()
    setShowForm(false)
    setProjectForm({ workspacePath: project.workspacePath, title: project.title })
  }
  /** @author ddj 2026年10月08号 @description Open a global draft only when idle. */
  const addGlobal = () => {
    if (busy) return
    resetDraft?.()
    setProjectForm(null)
    setShowForm(true)
  }

  const body = manageBody(props, mcpTab, selectedPath, setSelectedPath, addProject)

  const form = showForm
    ? React.createElement(McpForm, { title: uiText('添加全局 MCP', "Add global MCP", "Добавить глобальный MCP"), draft, busy, edit, save: () => saveGlobal(closeGlobalForm), close: closeGlobalForm })
    : projectForm
      ? React.createElement(McpForm, { project: true, title: uiText('添加项目 MCP · ', "Add project MCP · ", "Добавить MCP проекта · ") + projectForm.title, draft, busy, edit, save: () => saveProject(projectForm.workspacePath, closeProjectForm), close: closeProjectForm })
      : null
  return React.createElement(React.Fragment, null,
    React.createElement('div', { className: 'vsm-mcp-subhead' },
      React.createElement('nav', { className: 'vsm-mcp-subtabs' }, MCP_TABS.map((item) => React.createElement('button', { key: item.id, className: mcpTab === item.id ? 'active' : '', onClick: () => setMcpTab(item.id) }, item.label))),
      React.createElement('button', { className: 'vsm-primary vsm-small', disabled: !!busy, onClick: addGlobal }, uiText('+ 添加全局 MCP', "+ Add global MCP", "+ Добавить глобальный MCP")),
    ),
    body,
    form,
  )
}

/** @private @author ddj 2026年10月08号 @param props Current view and actions. @param tab Selected MCP subtab. @param path Selected project. @param select Project setter. @param add Project form opener. @returns Selected global/project/market content. */
function manageBody(props, tab, path, select, add) {
  const { servers, projects, busy, refreshGlobal, toggleGlobal, removeGlobal, refreshProject, toggleProject, removeProject } = props
  if (tab === 'market') return React.createElement('div', { className: 'vsm-mcp-empty' }, uiText('MCP 市场暂未接入', "MCP marketplace is not connected yet", "Каталог MCP пока не подключён"))
  if (tab !== 'projects') {
    return servers.length
      ? servers.map((server) => React.createElement(ServerCard, { key: server.id, server, busy, onRefresh: refreshGlobal, onToggle: toggleGlobal, onRemove: removeGlobal }))
      : React.createElement('div', { className: 'vsm-mcp-empty' }, uiText('还没有配置全局 MCP', "No global MCP configured", "Глобальные MCP не настроены"))
  }
  if (!projects.length) return React.createElement('div', { className: 'vsm-mcp-empty' }, uiText('还没有项目', "No projects yet", "Проектов пока нет"))
  const project = projects.find((item) => item.workspacePath === path)
  return React.createElement(React.Fragment, null,
    React.createElement(ProjectPicker, { projects, value: path, onChange: select }),
    project ? React.createElement(ProjectGroup, { project, busy, onAdd: add, onRefresh: refreshProject, onToggle: toggleProject, onRemove: removeProject, onConnect: props.connectProject, onPolicy: props.policyProject }) : React.createElement('div', { className: 'vsm-mcp-empty' }, uiText('请选择项目', "Select a project", "Выберите проект")),
  )
}

//region MCP page state and locked actions
/** @private @author ddj 2026年10月08号 @returns Mounted controller reference and its published view. */
function useMcpState() {
  const ref = React.useRef(null)
  const [view, setView] = React.useState({ servers: [], projects: [], loading: true, busy: '', error: '' })
  /** @author ddj 2026年10月08号 @description Subscribe to document visibility and initialize MCP data. @returns Unmount cleanup. */
  const mount = () => {
    const state = new McpState(rpc, setView)
    ref.current = state
    /** @author ddj 2026年10月08号 @description Gate snapshots on actual document visibility. */
    const visibility = () => state.setVisible(document.visibilityState === 'visible')
    /** @author ddj 2026年10月08号 @description Stop controller and remove page listener. */
    const cleanup = () => {
      document.removeEventListener('visibilitychange', visibility)
      state.dispose()
      if (ref.current === state) ref.current = null
    }
    visibility()
    document.addEventListener('visibilitychange', visibility)
    void state.load()
    return cleanup
  }
  React.useEffect(mount, [])
  return { ref, view }
}

/** @private @author ddj 2026年10月08号 @param state Mounted controller. @param id Server identity. @param method Mutation RPC. @param args Request fields. @returns Locked completion. */
function globalAction(state, id, method, args) {
  /** @author ddj 2026年10月08号 @returns Global mutation result. */
  const request = () => rpc(method, args)
  /** @author ddj 2026年10月08号 @param result Global mutation result. @description Apply only successful mutation to the latest controller view. */
  const commit = (result) => {
    state.view.servers = method === 'mcp.remove'
      ? state.view.servers.filter((server) => server.id !== id)
      : state.view.servers.map((server) => server.id === id ? result.server : server)
  }
  return state?.mutate(id, request, commit)
}

/** @private @author ddj 2026年10月08号 @param state Mounted controller. @param path Project path. @param name Server identity. @param method Mutation RPC. @param extra Optional request fields. @returns Locked completion. */
function projectAction(state, path, name, method, extra = {}) {
  /** @author ddj 2026年10月08号 @returns Project mutation result. */
  const request = () => rpc(method, { workspacePath: path, serverName: name, ...extra })
  /** @author ddj 2026年10月08号 @param result Project mutation result. @description Replace project in the current view. */
  const commit = (result) => {
    state.view.projects = state.view.projects.map((project) => project.workspacePath === path ? result.project : project)
  }
  return state?.mutate(path + ':' + name, request, commit)
}

/** @private @author ddj 2026年10月08号 @param ref Mounted controller reference. @returns Global/project card actions sharing a synchronous lock. */
function cardActions(ref, getSession) {
  /** @author ddj 2026年10月08号 @param id Global identity. @returns Locked refresh. */
  const refreshGlobal = (id) => globalAction(ref.current, id, 'mcp.refresh', { id })
  /** @author ddj 2026年10月08号 @param server Current configuration. @returns Locked enable change. */
  const toggleGlobal = (server) => globalAction(ref.current, server.id, 'mcp.toggle', { id: server.id, enabled: !server.enabled })
  /** @author ddj 2026年10月08号 @param id Global identity from ServerCard. @returns Confirmed locked deletion. */
  const removeGlobal = (id) => !ref.current?.view.busy && window.confirm(uiText('确认删除此 MCP 服务？', "Delete this MCP service?", "Удалить этот сервис MCP?")) && globalAction(ref.current, id, 'mcp.remove', { id })
  /** @author ddj 2026年10月08号 @param project Project. @param server Configuration. @returns Locked refresh. */
  const refreshProject = (project, server) => projectAction(ref.current, project.workspacePath, server.serverName, 'mcp.projectRefresh')
  /** @author ddj 2026年10月08号 @param project Project. @param server Configuration. @returns Locked enable change. */
  const toggleProject = (project, server) => projectAction(ref.current, project.workspacePath, server.serverName, 'mcp.projectToggle', { enabled: !server.enabled })
  /** @author ddj 2026年10月08号 @param project Project. @param server Configuration. @returns Confirmed locked deletion. */
  const removeProject = (project, server) => !ref.current?.view.busy && window.confirm(uiText('确认删除此项目的 MCP「', "Delete this project's MCP “", "Удалить MCP этого проекта «") + server.serverName + uiText('」？', "”?", "»?")) && projectAction(ref.current, project.workspacePath, server.serverName, 'mcp.projectRemove')
  /** @author ddj 2026年10月20号 @param project Owner workspace. @param server Enabled service. @returns Explicit connection for an already-active current session. */
  const connectProject = (project, server) => {
    const sessionId = getSession?.()
    if (!sessionId) return ref.current?.mutate('connect', async () => ({ ok: false, error: uiText('请先打开此项目的活跃会话', "Open an active session for this project first", "Сначала откройте активный сеанс этого проекта") }), () => undefined)
    return projectAction(ref.current, project.workspacePath, server.serverName, 'mcp.projectConnect', { sessionId })
  }
  /** @author ddj 2026年10月20号 @param project Owner. @param server Masked editable config. @param policy Explicit user strategy. @returns Serialized strategy persistence. */
  const policyProject = (project, server, policy) => projectAction(ref.current, project.workspacePath, server.serverName, 'mcp.projectSave', { config: server.config, policy })
  return { refreshGlobal, toggleGlobal, removeGlobal, refreshProject, toggleProject, removeProject, connectProject, policyProject }
}

/** @private @author ddj 2026年10月08号 @param state Controller. @param draft Editable fields. @param setDraft Draft setter. @param path Optional project target. @param close Success-only close callback. @returns Locked save, validation included. */
function saveDraft(state, draft, setDraft, path, close) {
  /** @author ddj 2026年10月08号 @returns Validated save result. @throws Malformed arguments/headers. */
  const request = () => {
    const config = configOf(draft)
    return path === null ? rpc('mcp.save', { config }) : rpc('mcp.projectSave', { workspacePath: path, serverName: config.serverName, config, policy: parseMcpPolicy({ startup: draft.startup, sharing: draft.sharing, startupTimeoutMs: Number(draft.startupTimeoutMs) }) })
  }
  /** @author ddj 2026年10月08号 @param result Save result. @description Update current view and only then reset/close the form. */
  const commit = (result) => {
    if (path !== null) state.view.projects = state.view.projects.map((project) => project.workspacePath === path ? result.project : project)
    else {
      const servers = state.view.servers
      state.view.servers = servers.some((server) => server.id === result.server.id)
        ? servers.map((server) => server.id === result.server.id ? result.server : server) : servers.concat(result.server)
    }
    setDraft(EMPTY)
    close()
  }
  return state?.mutate(path === null ? 'save' : 'project-save', request, commit)
}
//endregion

/** @public @author ddj 2026年10月08号 @param props Settings integrations. @returns MCP management page with visible-tab-only snapshot polling. */
export function McpSettings(props) {
  const openerRegistry = props?.openerRegistry ?? { list: () => [] }
  const compatSummary = props?.compatSummary ?? (() => [])
  const getShortcuts = props?.getShortcuts ?? (() => null)
  const { ref, view } = useMcpState()
  const { servers, projects, loading, busy, error } = view
  const [tab, setTab] = React.useState('general')
  const [draft, setDraft] = React.useState(EMPTY)
  /** @author ddj 2026年10月08号 @description Select polling scope and invalidate late responses on tab leave. @returns Tab cleanup. */
  const selectTab = () => {
    const state = ref.current
    state?.setActive(tab === 'mcp')
    /** @author ddj 2026年10月08号 @description Cancel reads on tab switch. */
    const cleanup = () => state?.setActive(false)
    return cleanup
  }
  React.useEffect(selectTab, [tab])
  const { refreshGlobal, toggleGlobal, removeGlobal, refreshProject, toggleProject, removeProject, connectProject, policyProject } = cardActions(ref, props?.getMcpSession)
  /** @author ddj 2026年10月08号 @param close Success-only close callback. @returns Global save completion. */
  const saveGlobal = (close) => saveDraft(ref.current, draft, setDraft, null, close)
  /** @author ddj 2026年10月08号 @param path Target project. @param close Success-only close callback. @returns Project save completion. */
  const saveProject = (path, close) => saveDraft(ref.current, draft, setDraft, path, close)
  /** @author ddj 2026年10月08号 @param key Draft field. @param value User input. @description Keep draft edits unavailable during a save. */
  const edit = (key, value) => { if (!ref.current?.view.busy) setDraft((old) => ({ ...old, [key]: value })) }
  /** @author ddj 2026年10月08号 @description Reset the draft when no mutation is pending. */
  const resetDraft = () => { if (!ref.current?.view.busy) setDraft(EMPTY) }
  let body
  if (tab === 'mcp' && loading) body = React.createElement('div', { className: 'vsm-mcp-empty' }, uiText('正在读取 MCP 服务…', "Loading MCP services…", "Загрузка сервисов MCP…"))
  else if (tab === 'general') body = React.createElement(React.Fragment, null,
    React.createElement(GeneralSettings, { registry: openerRegistry, getShortcuts }),
    React.createElement(UniverCacheSettings, { getSession: props?.getMcpSession ?? (() => undefined) }))
  else if (tab === 'mcp') body = React.createElement(McpManagePanel, { servers, projects, busy, draft, edit, resetDraft,
    saveGlobal, saveProject, connectProject, policyProject,
    refreshGlobal, toggleGlobal, removeGlobal, refreshProject, toggleProject, removeProject })
  else if (tab === 'compat') body = React.createElement(CompatSection, { getSummary: compatSummary })
  else if (tab === 'lsp') body = React.createElement(LspSettings, null)
  else if (tab === 'ai') body = React.createElement(AiSettings, null)
  else body = React.createElement(PerfSettings, null)
  return React.createElement('section', { className: 'vsm-mcp-page' },
    React.createElement('header', { className: 'vsm-mcp-header' }, React.createElement('div', null, React.createElement('h2', null, 'VSCodeMode'), React.createElement('p', null, uiText('编辑器偏好、开发工具与系统集成。', "Editor preferences, developer tools, and system integration.", "Настройки редактора, инструменты разработки и системная интеграция.")))),
    React.createElement('nav', { className: 'vsm-mcp-tabs', 'aria-label': uiText('VSCodeMode 设置分类', "VSCodeMode settings categories", "Категории настроек VSCodeMode") },
      [['general', uiText('通用', "General", "Общие")], ['mcp', uiText('MCP 管理', "MCP management", "Управление MCP")], ['lsp', uiText('语言服务器', "Language servers", "Языковые серверы")], ['ai', uiText('AI 补全', "AI completion", "ИИ-дополнение")], ['perf', uiText('性能优化', "Performance", "Производительность")], ['compat', uiText('兼容性', "Compatibility", "Совместимость")]].map(([id, label]) =>
        React.createElement('button', { key: id, type: 'button', className: tab === id ? 'active' : '', 'aria-current': tab === id ? 'page' : undefined, 'aria-controls': 'vsm-settings-content', onClick: () => setTab(id) }, label))),
    tab === 'mcp' && React.createElement(SettingNotice, { message: error, error: true }),
    React.createElement('div', { className: 'vsm-settings-content', id: 'vsm-settings-content' }, body),
  )
}

/** @private @author ddj 2026年10月08号 @param props Draft, shared busy lock, edit/save/close callbacks. @returns Lossless argument/header form; failed save stays open. */
function McpForm({ title, draft, busy, edit, save, close, project }) {
  /** @author ddj 2026年10月08号 @param key Draft field. @returns Short input change callback. */
  const change = (key) => (event) => edit(key, event.target.value)
  /** @author ddj 2026年10月08号 @param key Draft field. @param placeholder Input hint. @returns Disabled-while-busy input. */
  const input = (key, placeholder) => React.createElement('input', { disabled: !!busy, value: draft[key], onChange: change(key), placeholder })
  /** @author ddj 2026年10月08号 @param key Draft field. @returns Disabled-while-busy text area. */
  const textarea = (key) => React.createElement('textarea', { disabled: !!busy, value: draft[key], onChange: change(key) })
  const fields = draft.transport === 'stdio' ? React.createElement(React.Fragment, null,
    React.createElement('label', null, uiText('命令', "Command", "Команда"), input('command', 'npx')),
    React.createElement('label', null, uiText('参数（JSON string[] 或每行一个；保留空格，空参数用 JSON）', "Arguments (JSON string[] or one per line; preserves spaces; use JSON for empty arguments)", "Аргументы (JSON string[] или по одному на строку; пробелы сохраняются; пустые аргументы задаются через JSON)"), textarea('args')),
    React.createElement('label', null, uiText('工作目录（可选）', "Working directory (optional)", "Рабочий каталог (необязательно)"), input('cwd', '')),
  ) : React.createElement(React.Fragment, null,
    React.createElement('label', null, 'URL', input('url', 'http://localhost:3000/mcp')),
    React.createElement('label', null, uiText('请求头（每行 key=value，键不可重复）', "Headers (key=value per line; unique keys)", "Заголовки (key=value по одному на строку; ключи уникальны)"), textarea('headers')),
  )
  return React.createElement('div', { className: 'vsm-mcp-modal' }, React.createElement('div', { className: 'vsm-mcp-dialog' },
    React.createElement('h3', null, title),
    React.createElement('label', null, uiText('名称', "Name", "Название"), input('serverName', uiText('例如 codegraph', "e.g. codegraph", "например codegraph"))),
    React.createElement('label', null, uiText('传输方式', "Transport", "Транспорт"), React.createElement('select', { disabled: !!busy, value: draft.transport, onChange: change('transport') }, React.createElement('option', { value: 'stdio' }, 'stdio'), React.createElement('option', { value: 'streamable-http' }, 'streamable-http'))),
    fields,
    project && React.createElement('label', null, uiText('启动策略', "Startup policy", "Политика запуска"), React.createElement('select', { disabled: !!busy, value: draft.startup, onChange: change('startup') }, React.createElement('option', { value: 'on-demand' }, uiText('按需启动（默认）', "On demand (default)", "По требованию (по умолчанию)")), React.createElement('option', { value: 'background' }, uiText('后台预热', "Background warm-up", "Фоновый прогрев")))),
    project && React.createElement('label', null, uiText('连接模式', "Connection mode", "Режим подключения"), React.createElement('select', { disabled: !!busy, value: draft.sharing, onChange: change('sharing') }, React.createElement('option', { value: 'agent' }, uiText('逐会话隔离（默认）', "Isolated per session (default)", "Изоляция по сеансам (по умолчанию)")), React.createElement('option', { value: 'workspace' }, uiText('工作区共享（共享服务内部状态）', "Shared workspace (shares internal service state)", "Общее для пространства (общее внутреннее состояние сервиса)")))),
    project && React.createElement('label', null, uiText('初始化预算（毫秒，1000–300000）', "Initialization budget (ms, 1000–300000)", "Лимит инициализации (мс, 1000–300000)"), input('startupTimeoutMs', '60000')),
    React.createElement('label', null, uiText('工具加载（DSH 0.2.3+）', "Tool loading (DSH 0.2.3+)", "Загрузка инструментов (DSH 0.2.3+)"), React.createElement('select', { disabled: !!busy, value: draft.toolLoading ?? 'eager', onChange: change('toolLoading') }, React.createElement('option', { value: 'eager' }, uiText('随连接加载（默认）', "Load on connection (default)", "При подключении (по умолчанию)")), React.createElement('option', { value: 'on-demand' }, uiText('按需加载（省上下文）', "Load on demand (saves context)", "По требованию (экономит контекст)")))),
    project && React.createElement('small', null, uiText('新对话不等待连接。共享必须确认服务适合共享状态；不为 CodeGraph 自动启用。', "New conversations do not wait for connection. Enable sharing only if the service supports shared state; it is not enabled automatically for CodeGraph.", "Новые диалоги не ждут подключения. Включайте общий доступ только для сервисов с поддержкой общего состояния; для CodeGraph он не включается автоматически.")),
    React.createElement('div', { className: 'vsm-mcp-dialog-actions' }, React.createElement('button', { disabled: !!busy, onClick: close }, uiText('取消', "Cancel", "Отмена")), React.createElement('button', { className: 'vsm-primary', disabled: !!busy, onClick: save }, uiText('保存配置', "Save configuration", "Сохранить настройки"))),
  ))
}
