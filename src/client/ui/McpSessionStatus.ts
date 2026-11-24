/** Official session-row slots; no DOM patching or session activation. @author ddj 2026年10月20号 */
import { uiText } from '../uiLocale.js'
import React, { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import type { McpPhase } from '../../shared/mcp.js'
import { McpSessionState, type SessionMcpView } from '../mcpSessionState.js'

const labels: Record<McpPhase, string> = {
  get idle() { return uiText('待使用，尚未启动', "Idle, not started", "Ожидает использования, не запущен") }, get preparing() { return uiText('读取项目配置', "Reading project configuration", "Чтение конфигурации проекта") }, get queued() { return uiText('等待 MCP 启动名额', "Waiting for an MCP startup slot", "Ожидание слота запуска MCP") }, get loading() { return uiText('加载 MCP 插件模块', "Loading MCP plugin module", "Загрузка модуля плагина MCP") },
  get starting() { return uiText('等待 MCP 插件启动', "Waiting for MCP plugin startup", "Ожидание запуска плагина MCP") }, get stopping() { return uiText('释放旧 MCP 实例', "Releasing previous MCP instance", "Освобождение предыдущего экземпляра MCP") }, get ready() { return uiText('初始化完成，连接健康未验证', "Initialized; connection health not verified", "Инициализация завершена; соединение не проверено") },
  get error() { return uiText('初始化异常', "Initialization error", "Ошибка инициализации") }, get none() { return uiText('无需加载项目 MCP', "No project MCP needs loading", "Загрузка MCP проекта не требуется") },
}
const busy = new Set<McpPhase>(['preparing', 'queued', 'loading', 'starting', 'stopping'])
export interface McpRowProps { sessionId: string; store: McpSessionState }

/** @private @author ddj 2026年10月20号 @param props Root row identity and shared poller. @returns Stable per-session observation. */
function useMcpView({ sessionId, store }: McpRowProps): SessionMcpView {
  const subscribe = useCallback((notify: () => void) => store.subscribe(sessionId, notify), [store, sessionId])
  const snapshot = useCallback(() => store.get(sessionId), [store, sessionId])
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}

/** @public @author ddj 2026年10月20号 @param view Current observation. @returns Accessible row label; steady states deliberately do not occupy the leading slot. */
export function mcpRowLabel(view: SessionMcpView): string | undefined {
  if (view.stale) return undefined
  if (!view.status || (!busy.has(view.status.phase) && view.status.phase !== 'error')) return undefined
  return uiText('项目 MCP：', "Project MCP: ", "MCP проекта: ") + labels[view.status.phase]
}

/** @public @author ddj 2026年10月20号 @param props Official row sessionId and poller. @returns 16px loading/error marker; official running/approval states retain precedence. */
export function McpSessionIcon(props: McpRowProps): React.ReactElement | null {
  const view = useMcpView(props)
  const label = mcpRowLabel(view)
  if (!label) return null
  const warning = view.status?.phase === 'error'
  return React.createElement('span', {
    role: 'img', 'aria-label': label, title: label,
    style: { display: 'inline-flex', width: 16, height: 16, alignItems: 'center', justifyContent: 'center',
      color: warning ? 'var(--color-warning, #b7791f)' : 'var(--color-text-secondary, currentColor)', fontSize: 13 },
  }, warning ? '⚠' : '◌')
}

/** @private @author ddj 2026年10月20号 @param start Stage start. @param end Stage finish or local clock. @returns Human-readable elapsed time, without claiming a timeout. */
function elapsed(start: number, end: number): string { return Math.max(0, (end - start) / 1000).toFixed(1) + uiText(' 秒', " seconds", " с") }

/** @private @author ddj 2026年10月27号 @param view Query observation. @returns Query-only explanation, separate from initialization health. */
function queryMessage(view: SessionMcpView): string {
  if (view.reason === 'paused') return uiText('状态查询已暂停', "Status polling paused", "Проверка состояния приостановлена")
  if (view.reason === 'pending') return uiText('正在查询项目 MCP 状态', "Querying project MCP status", "Проверка состояния MCP проекта")
  return uiText('状态查询暂不可用，不代表 MCP 初始化失败', "Status query temporarily unavailable; this does not mean MCP initialization failed", "Проверка состояния временно недоступна; это не означает ошибку инициализации MCP")
}

/** @public @author ddj 2026年10月20号 @param props Official hover sessionId and poller. @returns Project-only diagnostic detail, never transport credentials. */
export function McpSessionDetail(props: McpRowProps): React.ReactElement {
  const view = useMcpView(props)
  const [now, setNow] = useState(Date.now)
  const status = view.status
  useEffect(() => {
    if (!status || view.stale || !busy.has(status.phase)) return
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(tick)
  }, [status, view.stale])

  const children: React.ReactNode[] = [React.createElement('strong', { key: 'title' }, uiText('项目 MCP', "Project MCP", "MCP проекта"))]
  if (view.stale) {
    children.push(React.createElement('div', { key: 'stale', role: 'status' }, queryMessage(view)))
    if (status) children.push(React.createElement('div', { key: 'history' }, uiText('以下为上次观测结果，不代表当前状态', "Last observed results below; they do not represent the current state", "Ниже результаты последнего наблюдения, а не текущее состояние")))
    if (view.observedAt !== undefined) children.push(React.createElement('div', { key: 'observed' },
      uiText('上次观测时间：', "Last observed: ", "Последнее наблюдение: ") + new Date(view.observedAt).toLocaleString()))
  }
  if (!status && !view.stale) children.push(React.createElement('div', { key: 'empty' }, uiText('当前无活跃 MCP 实例', "No active MCP instances", "Нет активных экземпляров MCP")))
  if (status) {
    // Unobserved time must not look like continued initialization, including per-server timing.
    let observedNow = now
    if (view.stale) observedNow = view.observedAt ?? status.phaseAt
    const end = status.finishedAt ?? observedNow
    const completed = status.servers.filter((server) => server.phase === 'ready').length
    const slow = !view.stale && busy.has(status.phase) && now - status.phaseAt > 10000
    children.push(React.createElement('div', { key: 'phase' }, labels[status.phase], slow ? uiText('（耗时较长，不代表失败）', " (taking longer; this does not mean failure)", " (занимает больше времени; это не означает ошибку)") : ''))
    children.push(React.createElement('div', { key: 'time' }, uiText(`${completed}/${status.servers.length} 已初始化 · 总耗时 ${elapsed(status.startedAt, end)} · 当前阶段 ${elapsed(status.phaseAt, end)}`, `${completed}/${status.servers.length} initialized · Total elapsed ${elapsed(status.startedAt, end)} · Current phase ${elapsed(status.phaseAt, end)}`, `${completed}/${status.servers.length} инициализировано · Всего прошло ${elapsed(status.startedAt, end)} · Текущий этап ${elapsed(status.phaseAt, end)}`)))
    if (status.configMs !== undefined) children.push(React.createElement('div', { key: 'config' }, uiText(`配置准备 ${elapsed(0, status.configMs)}`, `Configuration preparation ${elapsed(0, status.configMs)}`, `Подготовка конфигурации ${elapsed(0, status.configMs)}`)))
    if (status.error) children.push(React.createElement('div', { key: 'error' }, status.error))
    for (const server of status.servers) children.push(React.createElement('div', { key: 'server:' + server.serverName },
      `${server.serverName}：${labels[server.phase]}${server.reused ? uiText(' · 复用已有连接', " · Reusing existing connection", " · Повторное использование соединения") : ''}${server.phase === 'idle' ? '' : ' · ' + elapsed(server.startedAt, server.finishedAt ?? observedNow)}`,
      server.queuedMs === undefined ? '' : uiText(' · 排队 ', " · Queued ", " · В очереди ") + elapsed(0, server.queuedMs),
      server.connectMs === undefined ? '' : uiText(' · 初始化 ', " · Initialization ", " · Инициализация ") + elapsed(0, server.connectMs),
      server.firstCallMs === undefined ? '' : uiText(' · 首次工具执行 ', " · First tool execution ", " · Первый вызов инструмента ") + elapsed(0, server.firstCallMs),
      server.error ? ' · ' + server.error : ''))
  }
  children.push(React.createElement('small', { key: 'scope' }, uiText('仅 VSCodeMode 管理的项目 MCP；不含全局或 preset MCP。', "Project MCP managed by VSCodeMode only; excludes global and preset MCP.", "Только MCP проекта под управлением VSCodeMode; без глобальных MCP и MCP пресета.")))
  return React.createElement('section', { 'aria-label': uiText('项目 MCP 状态', "Project MCP status", "Состояние MCP проекта"), style: { display: 'grid', gap: 4, maxWidth: 320, overflowWrap: 'anywhere', fontSize: 12 } }, children)
}
