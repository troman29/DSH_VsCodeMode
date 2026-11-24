/** Explorer lifecycle: local refresh is offline, remote checks are explicit. @author ddj 2026年10月09号 */
import { uiText } from '../../uiLocale.js'
import React from 'react'
import { bindSvnScope } from '../../svnNotice.js'
import { rpc } from '../../rpc.js'
import { explorerPathOf, remoteIndexOf } from '../../../shared/svnExplorer.js'
import type { SvnViewRequest, SvnViewRow } from '../../../shared/svnExplorer.js'
import { ExplorerViewClient } from './explorerView.js'
import type { ExplorerNotice, ExplorerView } from './explorerView.js'
import type { SvnRemoteOutdatedEntry } from '../../../shared/svn.js'
import type { SidebarCtx } from '../types.js'

interface LocalSnapshot { view: ExplorerView; key: string }

// --region Explicit repository check
/** @private @author ddj 2026年10月09号 @param ctx Sidebar context. @param local Confirmed snapshot. @returns Expiring read-only remote evidence and check action. */
function useRemoteCheck(ctx: SidebarCtx | undefined, local: LocalSnapshot | null, resetToken: number, scope: string) {
  const [remote, setRemote] = React.useState<Map<string, number> | null>(null)
  const [message, setMessage] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const control = React.useRef<AbortController | null>(null)
  const epoch = React.useRef(0)
  const expiry = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  /** @private @author ddj 2026年10月09号 Cancel stale request/timer without updating an unmounted component. */
  function cancel() {
    epoch.current++
    control.current?.abort()
    control.current = null
    if (expiry.current) clearTimeout(expiry.current)
    expiry.current = null
  }
  /** @private @author ddj 2026年10月09号 @returns Cleanup; scope/local changes invalidate repository evidence. */
  function reset() { cancel(); setRemote(null); setMessage(''); setBusy(false); return cancel }
  React.useEffect(reset, [scope, resetToken])

  /** @public @author ddj 2026年10月09号 Contact repository once; failures/expiry never imply up-to-date. */
  async function checkRemote() {
    if (!local || control.current) return
    cancel()
    setRemote(null)
    const controller = new AbortController()
    control.current = controller
    const seq = epoch.current
    setBusy(true)
    setMessage(uiText('正在检查仓库更新（只读）…', "Checking repository updates (read-only)…", "Проверка обновлений репозитория (только чтение)…"))
    try {
      const out = await rpc('svn.remoteStatus', { sessionId: ctx?.sessionId, path: '' }, controller.signal)
      if (controller.signal.aborted || seq !== epoch.current) return
      if (!out.ok) { setMessage(out.error); return }
      /** @private @author ddj 2026年10月09号 @param entry WC-relative change. @returns Session subset. */
      function scopeEntry(entry: SvnRemoteOutdatedEntry): SvnRemoteOutdatedEntry[] {
        const path = explorerPathOf(entry.path, local!.view.prefix)
        return path === null ? [] : [{ ...entry, path }]
      }
      const scoped = out.outdated.flatMap(scopeEntry)
      setRemote(remoteIndexOf(scoped))
      setMessage(uiText('检查于 ', "Checked at ", "Проверено в ") + new Date().toLocaleTimeString() + uiText('：', ": ", ": ") + scoped.length + uiText(' 项可更新', " updates available", " доступных обновлений")
        + (out.truncated ? uiText('（结果不完整）', " (partial result)", " (неполный результат)") : '') + (out.againstRev === null ? '' : uiText('，仓库 r', ", repository r", ", репозиторий r") + out.againstRev))
      /** @private @author ddj 2026年10月09号 Expire evidence; no automatic repository recheck. */
      function expire() { setRemote(null); setMessage(uiText('远端检查已过期，请重新检查仓库更新', "Remote check expired; check repository updates again", "Удалённая проверка устарела; проверьте обновления снова")) }
      expiry.current = setTimeout(expire, 60_000)
    } catch (error) { if (!controller.signal.aborted && seq === epoch.current) setMessage(String(error)) }
    finally { if (seq === epoch.current) { control.current = null; setBusy(false) } }
  }
  return { remote, message, busy, checkRemote }
}
// --endregion

/** @private @author ddj 2026年10月10号 @param view Compact metadata. @returns Honest refresh/failure/last-confirmed status. */
function localMessage(view?: ExplorerView): string {
  if (!view) return uiText('正在读取本地 SVN 状态…', "Loading local SVN status…", "Загрузка локального состояния SVN…")
  const time = view.confirmedAt ? uiText('；最后确认 ', "; last confirmed ", "; последнее подтверждение ") + new Date(view.confirmedAt).toLocaleTimeString() : uiText('；尚未确认', "; not confirmed yet", "; ещё не подтверждено")
  if (view.error) return uiText('SVN 状态陈旧：', "SVN status is stale: ", "Состояние SVN устарело: ") + view.error + time
  return (view.refreshing ? uiText('SVN 状态刷新中', "Refreshing SVN status", "Обновление состояния SVN") : view.complete ? uiText('SVN 本地状态已确认', "Local SVN status confirmed", "Локальное состояние SVN подтверждено") : uiText('SVN 状态未完整确认', "SVN status not fully confirmed", "Состояние SVN подтверждено не полностью")) + time
}
// --region Offline local status
/** @public @author ddj 2026年10月09号 @param ctx Sidebar context. @returns Scope-bound local/remote icons; unknown entries never show green. */
export function useExplorerSvn(ctx: SidebarCtx | undefined, rows: readonly SvnViewRow[] = []) {
  const [local, setLocal] = React.useState<LocalSnapshot | null>(null)
  const [remoteToken, setRemoteToken] = React.useState(0)
  const owner = React.useRef<ExplorerViewClient | null>(null)
  const ready = ctx?.svn?.managed === true && ctx?.svn?.svnCli === true
  const scope = ctx?.scope ?? ctx?.sessionId ?? ''
  const key = JSON.stringify([scope, ready])
  const snapshot = local?.key === key ? local : null
  const remote = useRemoteCheck(ctx, snapshot, remoteToken, key)

  /** @private @author ddj 2026年10月10号 @returns Scope owner cleanup; late results cannot populate a new workspace. */
  function mount() {
    setLocal(null)
    bindSvnScope(ctx?.sessionId, scope)
    if (!ready) return
    /** @private @author ddj 2026年10月10号 @param view Compact state. Publish only this mounted scope. */
    function publish(view: ExplorerView) { setLocal({ view, key }) }
    /** @private @author ddj 2026年10月10号 Invalidate explicit remote evidence after non-text changes. */
    function dropRemote() { setRemoteToken((value) => value + 1) }
    /** @private @author ddj 2026年10月10号 @param args Compact projection. @param signal UI fetch lifetime. @returns Authenticated response. */
    function fetch(args: SvnViewRequest, signal: AbortSignal) { return rpc('svn.explorerView', args, signal) }
    const client = new ExplorerViewClient(scope, fetch, publish, dropRemote)
    client.sessionId = ctx?.sessionId
    owner.current = client
    client.setRows(rows)
    client.visibility(document.visibilityState !== 'hidden')
    return () => { client.dispose(); if (owner.current === client) owner.current = null }
  }
  React.useEffect(mount, [key])
  /** @private @author ddj 2026年10月10号 Row expansion/session switch only reprojects; Host owns shared workspace cache. */
  function project() {
    bindSvnScope(ctx?.sessionId, scope)
    if (owner.current) { owner.current.sessionId = ctx?.sessionId; owner.current.setRows(rows) }
  }
  React.useEffect(project, [rows, ctx?.sessionId])
  /** @private @author ddj 2026年10月10号 Unknown changes-list origins calibrate once; known event bursts are already scheduled. */
  function changes() { owner.current?.changes() }
  React.useEffect(changes, [ctx?.svnChanges])

  /** @private @author ddj 2026年10月10号 @returns Scoped notices/focus/visibility listener cleanup. */
  function listen() {
    /** @private @author ddj 2026年10月10号 @param event Pathful or legacy notification. Legacy unknown scope safely falls back to full. */
    function notice(event: Event) {
      const detail = (event as CustomEvent<ExplorerNotice & { path?: string }>).detail ?? {}
      owner.current?.notify({ ...detail, paths: detail.paths ?? (detail.path ? [detail.path] : undefined) })
    }
    /** @private @author ddj 2026年10月10号 Trigger only offline calibration; focus and visibility coalesce. */
    function visibility() { owner.current?.visibility(document.visibilityState !== 'hidden') }
    window.addEventListener('edrv:refresh', notice)
    window.addEventListener('edrv:file-changed', notice)
    window.addEventListener('focus', visibility)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      window.removeEventListener('edrv:refresh', notice); window.removeEventListener('edrv:file-changed', notice)
      window.removeEventListener('focus', visibility); document.removeEventListener('visibilitychange', visibility)
    }
  }
  React.useEffect(listen, [])
  /** @public @author ddj 2026年10月10号 Request an explicit offline full scan. */
  function refreshLocal() { owner.current?.refresh() }
  return { ...remote, local: snapshot?.view.marks ?? null, remote: snapshot ? remote.remote : null,
    message: ready ? localMessage(snapshot?.view) + (remote.message ? uiText('；', "; ", "; ") + remote.message : '') : '', canCheck: ready && snapshot !== null, refreshLocal }
}
// --endregion
