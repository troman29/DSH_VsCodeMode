/** Compact file-tab host for optional Univer documents. @author ddj 2026年11月12号 */
import { uiText } from '../uiLocale.js'
import React from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { rpc } from '../rpc.js'
import { isUniverPath } from '../../shared/univer.js'
import { fileState, startGateway } from './api.js'
import { activeWorktree, reviewAddress, viewerAddress } from './routing.js'
import { confirmUniver, refreshUniver, subscribeUniver, trackUniver, univerSnapshot } from './store.js'
import type { SessionState } from './store.js'
import type { UniverFileState } from '../../shared/univer.js'

interface HostProps {
  path: string
  sessionId: string
  onOpen: (path: string) => void
  onFallback: () => void
  source?: string
  sourceChanged?: boolean
}
interface ImportControl {
  create: (refresh?: boolean) => Promise<void>
  start: () => Promise<void>
  busy: boolean
  error: string
}

/** @public @author ddj 2026年11月12号 @param sessionId Active scope. @returns Reactive in-page snapshot. */
export function useUniver(sessionId: string): SessionState {
  const subscribe = React.useCallback((listener: () => void) => subscribeUniver(sessionId, listener), [sessionId])
  const revision = React.useCallback(() => univerSnapshot(sessionId).revision, [sessionId])
  React.useSyncExternalStore(subscribe, revision, revision)
  return univerSnapshot(sessionId)
}

/** @private @author ddj 2026年11月12号 @param props File and scope. @param permitted Explicit writable consent. @param running Gateway state. @returns Latest visible file state or error. */
function useDocument(props: HostProps, permitted: boolean, running: boolean) {
  const [state, setState] = React.useState<UniverFileState>()
  const [error, setError] = React.useState('')
  React.useEffect(() => {
    void refreshUniver(props.sessionId)
    if (!isUniverPath(props.path) || !permitted || !running) return
    let active = true
    let pending = false
    const controller = new AbortController()
    /** @private @author ddj 2026年11月12号 @sideEffects Polls only visible consented files; drops stale responses. */
    async function load() {
      if (pending || document.visibilityState === 'hidden') return
      pending = true
      try {
        await refreshUniver(props.sessionId)
        const current = univerSnapshot(props.sessionId)
        if (!active || !current.confirmed || !current.capability?.writable || !current.capability.available) return
        const next = await fileState(props.path, props.sessionId, controller.signal)
        if (!active) return
        setState(next)
        trackUniver(props.sessionId, { file: props.path, state: next })
        setError('')
      } catch (cause) {
        if (active) {
          setState(undefined)
          trackUniver(props.sessionId, { file: props.path, state: undefined })
          setError(String(cause))
        }
      }
      finally { pending = false }
    }
    void load()
    const timer = window.setInterval(() => { void load() }, 5000)
    return () => { active = false; controller.abort(); window.clearInterval(timer) }
  }, [props.path, props.sessionId, permitted, running])
  return { state, error }
}

/** @private @author ddj 2026年11月12号 @param props Source and navigation. @returns Explicit import/start commands with mounted-generation guard. */
function useImport(props: HostProps): ImportControl {
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const operation = React.useRef(crypto.randomUUID())
  const live = React.useRef(true)
  const pending = React.useRef(false)
  React.useEffect(() => { live.current = true; return () => { live.current = false } }, [])
  /** @private @author ddj 2026年11月12号 @sideEffects Creates a new draft copy; never retries on uncertain results or navigates a different session. */
  async function create(refresh = false): Promise<void> {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError(uiText('创建副本并导入内容…', "Creating copy and importing content…", "Создание копии и импорт содержимого…"))
    try {
      const source = props.source ?? props.path
      const result = await rpc('edrv.univer.openCached', { sessionId: props.sessionId, source, operationId: operation.current, refresh })
      if (!result.ok) throw new Error(result.error)
      const imported = result.cached.imported
      if (!imported.success) throw new Error((imported.error ?? uiText('导入失败', "Import failed", "Ошибка импорта")) + uiText('；阶段：', "; stage: ", "; этап: ") + imported.stage + uiText('；缓存：', "; cache: ", "; кэш: ") + (imported.file ?? uiText('未创建', "Not created", "Не создано")) + uiText('。请在设置中检查，不要重复导入。', ". Check settings; do not import again.", ". Проверьте настройки; не повторяйте импорт."))
      trackUniver(props.sessionId, { file: imported.file!, source, sourceChanged: result.cached.sourceChanged, worktreeId: imported.worktreeId })
      if (live.current) props.onOpen(imported.file!)
    } catch (cause) { if (live.current) setError(String(cause)) }
    finally { pending.current = false; if (live.current) setBusy(false) }
  }
  /** @private @author ddj 2026年11月12号 @sideEffects Starts Gateway only on explicit action. */
  async function start(): Promise<void> {
    try { setBusy(true); await startGateway(); await refreshUniver(props.sessionId); if (live.current) setError('') }
    catch (cause) { if (live.current) setError(String(cause)) }
    finally { if (live.current) setBusy(false) }
  }
  return { busy, error, create, start }
}

/** @private @author ddj 2026年11月12号 @param props File/scope. @param scope Current capability. @param control Explicit import actions. @returns Import and safety panel in one surface. */
function importPanel(props: HostProps, scope: SessionState, control: ImportControl): React.ReactElement {
  return React.createElement('section', { className: 'edrv-uv-import' },
    React.createElement('h3', null, uiText('使用 Univer 编辑', "Edit with Univer", "Редактировать в Univer")),
    React.createElement('p', null, uiText('文档将自动保存到当前工作区 .dsh 专属缓存；原文件保持不变。已有编辑与草稿会保留。', "Documents auto-save to this workspace's dedicated .dsh cache. Original files remain unchanged. Existing edits and drafts are retained.", "Документы сохраняются в отдельный кэш .dsh рабочего пространства. Исходные файлы не изменяются. Правки и черновики сохраняются.")),
    !scope.confirmed ? consentPanel(props.sessionId) : null,
    scope.confirmed ? React.createElement('p', { role: 'status' }, control.error || uiText('正在准备工作区缓存…', "Preparing workspace cache…", "Подготовка кэша рабочего пространства…")) : null)
}

/** @private @author ddj 2026年11月12号 @param sessionId Explicit consent scope. @returns Persistent risk explanation and affirmative action. */
function consentPanel(sessionId: string): React.ReactElement {
  return React.createElement('section', { className: 'edrv-uv-consent' },
    React.createElement('p', null, uiText('Viewer 仅适用于可信单用户环境，不能保证按会话隔离文件访问。此确认不会改变沙箱权限。', "Viewer is for trusted single-user environments only. Session-isolated file access is not guaranteed. This consent does not change sandbox permissions.", "Viewer предназначен только для доверенной однопользовательской среды. Изоляция доступа к файлам по сеансам не гарантируется. Согласие не меняет разрешения песочницы.")),
    React.createElement(Button, { onClick: () => confirmUniver(sessionId, true) }, uiText('我了解限制，允许当前会话加载 Viewer', "I understand the limitations; allow Viewer in this session", "Я понимаю ограничения; разрешить Viewer в этом сеансе")))
}

/** @private @author ddj 2026年11月12号 @param props File/scope. @param scope Capability. @param control Import actions. @param state File state. @param selected Draft identity. @returns Guarded surface; no iframe before writable consent. */
function hostContent(props: HostProps, scope: SessionState, control: ImportControl, state?: UniverFileState, selected?: string): React.ReactNode {
  if (!scope.capability?.available) return React.createElement('p', null, scope.error ?? uiText('Univer Office 未启用或接口不兼容', "Univer Office is disabled or its API is incompatible", "Univer Office отключён или API несовместим"))
  if (!scope.capability.writable) return React.createElement('p', null, uiText('当前会话为只读或策略不可用，未加载 Univer Viewer', "Session is read-only or policy unavailable; Univer Viewer was not loaded", "Сеанс доступен только для чтения или политика недоступна; Univer Viewer не загружен"))
  if (!isUniverPath(props.path)) return importPanel(props, scope, control)
  if (!scope.confirmed) return consentPanel(props.sessionId)
  if (scope.capability.gateway !== 'running') return React.createElement('section', null,
    React.createElement('p', null, uiText('启动 Univer 服务后可查看文档', "Start the Univer service to view documents", "Запустите сервис Univer для просмотра документов")), React.createElement(Button, { onClick: control.start, disabled: control.busy }, uiText('启动服务', "Start service", "Запустить сервис")))
  try {
    const candidate = state && reviewAddress(state, selected)
    if (!candidate) return React.createElement('p', null, uiText('读取文档状态…', "Loading document status…", "Загрузка состояния документа…"))
    const address = viewerAddress(candidate, window.location.origin, props.sessionId)
    return React.createElement('iframe', { className: 'edrv-uv-frame', src: address, title: props.path })
  } catch (cause) { return React.createElement('p', null, String(cause)) }
}

/** @public @author ddj 2026年11月12号 @param props File and active session. @returns In-tab import/consent/Viewer surface. */
export function UniverHost(props: HostProps): React.ReactElement {
  const scope = useUniver(props.sessionId)
  const control = useImport(props)
  const permitted = scope.capability?.available === true && scope.capability.writable && scope.confirmed
  const document = useDocument(props, permitted, scope.capability?.gateway === 'running')
  const started = React.useRef(false)
  React.useEffect(() => {
    if (!permitted || isUniverPath(props.path) || started.current) return
    started.current = true
    void control.create()
  }, [permitted, props.path])
  const [selected, setSelected] = React.useState(univerSnapshot(props.sessionId).documents.get(props.path)?.worktreeId ?? '')
  const drafts = document.state?.worktrees.filter(activeWorktree) ?? []
  const source = props.source ?? scope.documents.get(props.path)?.source
  return React.createElement('div', { className: 'edrv-uv-host', 'data-univer-path': props.path, 'data-univer-session': props.sessionId }, 
    React.createElement('header', { className: 'edrv-uv-toolbar' }, React.createElement('span', { title: props.path }, (source ?? props.path).split(/[\\/]/).pop()),
      React.createElement(Button, { onClick: () => setSelected('') }, uiText('当前版本', "Current version", "Текущая версия")),
      drafts.map((draft) => React.createElement(Button, { key: draft.worktreeId, onClick: () => setSelected(draft.worktreeId) }, (draft.name ?? uiText('草稿', "Draft", "Черновик")) + (draft.status === 'ready' ? uiText(' · 审阅', " · Review", " · Проверить") : uiText(' · 查看', " · View", " · Просмотреть")))),
      React.createElement(Button, { onClick: props.onFallback }, uiText('其他打开方式', "Other ways to open", "Другие способы открытия"))),
    source ? React.createElement('small', { className: 'edrv-uv-notice' }, uiText('来源：', "Source: ", "Источник: ") + source + uiText('；工作区缓存，原文件未修改', "; workspace cache; original file unchanged", "; кэш пространства; исходный файл не изменён")) : null,
    props.sourceChanged && source ? React.createElement('div', { className: 'edrv-uv-notice' }, uiText('源文件已更新；当前缓存保留已有编辑。', "Source file updated; current cache retains existing edits.", "Исходный файл обновлён; текущий кэш сохраняет правки."),
      React.createElement(Button, { disabled: control.busy, onClick: () => { void control.create(true) } }, uiText('导入源文件新版本', "Import new source version", "Импортировать новую версию исходного файла"))) : null,
    control.error || document.error ? React.createElement('p', { role: 'status', className: 'edrv-uv-notice' }, control.error || document.error) : null,
    hostContent(props, scope, control, document.state, selected),
    React.createElement('footer', { className: 'edrv-uv-footer' }, uiText('可信单用户环境 · 不承诺按会话隔离文件访问 · 原文件不自动覆盖', "Trusted single-user environment · No guaranteed session file isolation · Originals are not overwritten automatically", "Доверенная однопользовательская среда · Изоляция файлов по сеансам не гарантируется · Оригиналы автоматически не перезаписываются")))
}

/** @public @author ddj 2026年11月12号 @param props Session and navigation. @returns Semantic-review entries excluded from text decisions. */
export function UniverReviews(props: { sessionId: string; onOpen: (path: string) => void }): React.ReactElement | null {
  const scope = useUniver(props.sessionId)
  if (!scope.capability?.available) return null
  const documents = [...scope.documents.values()].filter((document) => document.state?.worktrees.some(activeWorktree))
  if (!documents.length) return null
  return React.createElement('section', { className: 'edrv-uv-reviews' }, React.createElement('h4', null, uiText('Univer 草稿', "Univer drafts", "Черновики Univer")),
    documents.map((document) => React.createElement(Button, { key: document.file, onClick: () => props.onOpen(document.file) }, document.file + uiText(' · 查看 / 审阅', " · View / Review", " · Просмотреть / Проверить"))),
    React.createElement('small', null, uiText('仅显示当前会话已发现的文档；不参与代码批量采纳或撤销。', "Shows only documents discovered in this session; excluded from bulk code acceptance or undo.", "Показаны только документы текущего сеанса; они не участвуют в массовом принятии или отмене кода.")))
}
