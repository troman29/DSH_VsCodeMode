import { uiText } from '../uiLocale.js'
import React from 'react'
import { Button, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import { callIdAttr } from '../state/records.js'
import { sidecarKeepTitle, sidecarLabel, sidecarLabelTitle, sidecarUndoTitle, reviewBarView } from '../reviewBar.js'
import type { OfficialDownView } from '../reviewBar.js'
import { barIcon } from './OfficialDiffBar.js'
import { ReviewAllRow } from './reviewAllRow.js'
import { badgeOf } from './shared.js'

/** 侧车差异区域：由 records 派生的行范围，不含官方块元数据。 */
export interface SidecarRegion {
  callId: string
  idx: number
  start?: number
  end?: number
  oldLines?: string[]
  newLines?: string[]
  create?: boolean
  status?: string
}

/** 侧车栏输入：字段与官方栏对齐，缺的是官方记录元数据，多的是侧车区域的 keep/undo 能力。 */
export interface SidecarBarProps {
  activePath?: string
  missingDeletion?: boolean
  pendingRegions?: SidecarRegion[]
  staleRegions?: SidecarRegion[]
  diffIdx?: number
  /** 编辑器内容是否就绪；未就绪时不得断言差异失效 */
  contentReady?: boolean
  fileIdx?: number
  /** 待审文件总数；null 表示官方元数据尚未就绪，栏内显示占位 */
  fileTotal?: number | null
  allPendingCount?: number
  reviewBatchBusy?: boolean
  /** 官方元数据通道失败时的可操作提示 */
  officialDown?: OfficialDownView
  onRetryOfficial?: () => void
  onAcceptFile: () => void
  onUndoFile: () => void
  onAcceptAllFiles: () => void
  onUndoAllFiles: () => void
  onPrevFile: () => void
  onNextFile: () => void
  onPrevDiff: () => void
  onNextDiff: () => void
  onOpenLauncher: (tab: string) => void
  onJump?: (region: SidecarRegion) => void
  onRollback?: () => void
  onRefresh?: () => void
  reviewError?: string
  reviewErrorTone?: 'info' | 'error'
}

/**
 * 侧车（历史捕获）差异栏：与官方栏同一套版式、同一套按钮位置，只把数据源与标识换掉。
 * 两套栏并存是数据现实，但外观不能分家，否则用户会以为插件版本不一致。
 * @public
 * @author ddj 2026年10月28号
 * @param props 侧车区域计数、批量可用性与回调
 * @returns 与官方栏同构的差异工具栏；展开后列出侧车区域
 */
export function SidecarDiffBar(props: SidecarBarProps): React.ReactElement {
  const pendingRegions = props.pendingRegions ?? []
  const staleRegions = props.staleRegions ?? []
  const [menu, setMenu] = React.useState<'more' | null>(null)
  const name = String(props.activePath || '').split(/[\\/]/).pop() || uiText('当前文件', "Current file", "Текущий файл")
  const count = pendingRegions.length
  const total = count + staleRegions.length
  const busy = props.reviewBatchBusy === true
  const canDecide = total > 0 && !busy
  const view = reviewBarView({
    jumps: count, stale: staleRegions.length, index: props.diffIdx ?? 0,
    ready: props.contentReady === true, pendingRecords: total, canKeep: true,
  })
  const down = props.officialDown

  /** @private @author ddj 2026年10月28号 @param tab 既有总览页签 @returns 打开既有总览并收起菜单 */
  function openOverview(tab: string): void { props.onOpenLauncher(tab); setMenu(null) }

  /** @private @author ddj 2026年10月28号 @param mark 工具栏图标 @param label 无障碍名称 @param action 既有回调 @param disabled 是否禁用 @param title 禁用原因 @returns 紧凑导航按钮 */
  function navButton(mark: Parameters<typeof barIcon>[0], label: string, action: () => void, disabled: boolean, title?: string): React.ReactElement {
    return <Button size="sm" variant="ghost" className="edrv-review-icon" aria-label={label} title={title || label} disabled={disabled} onClick={action}>{barIcon(mark)}</Button>
  }

  const moreTrigger = <Button size="sm" variant="ghost" className="edrv-review-icon" aria-label={uiText("更多审查操作", "More review actions", "Другие действия проверки")} title={uiText("更多审查操作", "More review actions", "Другие действия проверки")} aria-haspopup="menu" aria-expanded={menu === 'more'} onClick={() => setMenu(menu === 'more' ? null : 'more')}>{barIcon('more')}</Button>

  return <div className="edrv-diffbar edrv-diffbar-dock edrv-reviewbar" data-edrv-diffbox="1" data-edrv-diff-source="sidecar" role="region" aria-label={uiText("文件差异审查", "File diff review", "Проверка различий файла")}>
    <ReviewAllRow
      total={props.fileTotal ?? null}
      current={(props.fileTotal ?? 0) && (props.fileIdx ?? -1) >= 0 ? (props.fileIdx ?? 0) + 1 : 0}
      busy={busy}
      pending={props.allPendingCount}
      onOpen={() => props.onOpenLauncher('pending')}
      onKeepAll={props.onAcceptAllFiles}
      onUndoAll={props.onUndoAllFiles}
      keepTitle={uiText("把这批历史改动全部标记为已看过（只改记录，不动磁盘文件）", "Mark all these historical changes reviewed (records only; disk files unchanged)", "Отметить все исторические изменения проверенными (только записи; файлы на диске не меняются)")}
      undoTitle={uiText("逐项撤销这些历史改动；缺少证据或遇到冲突即停止", "Undo these historical changes individually; stop on missing evidence or conflict", "Отменять исторические изменения по одному; остановиться при нехватке данных или конфликте")}
    />
    {props.missingDeletion ? <div className="edrv-review-notice" role="status">{uiText("文件已删除 · 展示最后记录快照。Keep 保留删除；Undo 恢复展示的完整快照。", "File deleted · Showing the last recorded snapshot. Keep preserves deletion; Undo restores the complete shown snapshot.", "Файл удалён · Показан последний записанный снимок. Keep сохраняет удаление; Undo восстанавливает показанный полный снимок.")}</div> : null}
    {busy ? <div className="edrv-review-notice" role="status">{uiText("正在处理历史改动…", "Processing historical changes…", "Обработка исторических изменений…")}</div> : null}
    {down ? <div className="edrv-review-notice edrv-review-notice-warn edrv-sidecar-down" role="status">
      <span className="edrv-sidecar-down-text">{down.text}</span>
      {props.onRetryOfficial ? <Button size="sm" variant="ghost" onClick={props.onRetryOfficial} title={uiText("重新读取官方待审记录", "Reload built-in pending records", "Перечитать встроенные ожидающие записи")}>{down.retryLabel || uiText('重试', "Retry", "Повторить")}</Button> : null}
    </div> : null}
    <div className="edrv-review-heading">
      <span className="edrv-review-filemark">{barIcon('file')}</span>
      <span className="edrv-review-filename" title={props.activePath}>{name}</span>
      <span className="edrv-review-source" title={sidecarLabelTitle()}>{sidecarLabel()}</span>
      <span className="edrv-review-pending" title={view.pendingTitle}>{uiText("待审 ", "Pending ", "Ожидают проверки ")}<strong>{total}</strong></span>
    </div>
    <div className="edrv-review-tools">
      <div className="edrv-review-nav" role="group" aria-label={uiText("文件导航", "File navigation", "Навигация по файлам")}>
        {navButton('left', uiText('上一个差异文件', "Previous changed file", "Предыдущий изменённый файл"), props.onPrevFile, !props.fileTotal)}
        {navButton('right', uiText('下一个差异文件', "Next changed file", "Следующий изменённый файл"), props.onNextFile, !props.fileTotal)}
      </div>
      <div className="edrv-review-nav edrv-review-blocknav" role="group" aria-label={uiText("差异导航", "Diff navigation", "Навигация по различиям")}>
        {navButton('up', uiText('上一个差异', "Previous diff", "Предыдущее различие"), props.onPrevDiff, !count, view.navPrevTitle)}
        <span className="edrv-review-position" aria-live="polite">{view.position}</span>
        {navButton('down', uiText('下一个差异', "Next diff", "Следующее различие"), props.onNextDiff, !count, view.navNextTitle)}
      </div>
      <div className="edrv-review-actions">
        <Button size="sm" variant="ghost" className="edrv-review-undo" icon={barIcon('undo')} onClick={props.onUndoFile} disabled={!canDecide} title={props.missingDeletion ? uiText('恢复展示的完整历史快照（不会覆盖重新出现的文件）', "Restore the complete displayed historical snapshot (does not overwrite a reappeared file)", "Восстановить показанный полный исторический снимок (не перезаписывает вновь появившийся файл)") : sidecarUndoTitle()}>Undo</Button>
        <Button size="sm" variant="primary" className="edrv-review-keep" icon={barIcon('check')} onClick={props.onAcceptFile} disabled={!canDecide} title={props.missingDeletion ? uiText('保持文件删除并结清覆盖的待审历史记录，不写文件', "Keep deletion and resolve covered pending history without writing files", "Сохранить удаление и завершить охваченные ожидающие записи без записи файлов") : sidecarKeepTitle()}>Keep</Button>
        <Menu open={menu === 'more'} anchor={moreTrigger} items={[{ id: 'pending', label: uiText('差异总览', "Diff overview", "Обзор различий") }, { id: 'archive', label: uiText('归档 / 历史', "Archive / History", "Архив / История") }, { id: 'rollback', label: uiText('回滚当前文件', "Revert current file", "Восстановить текущий файл") }, { id: 'refresh', label: uiText('刷新', "Refresh", "Обновить") }]} onSelect={(id: string) => {
          if (id === 'rollback') { setMenu(null); props.onRollback?.(); return }
          if (id === 'refresh') { setMenu(null); props.onRefresh?.(); return }
          openOverview(id)
        }} onClose={() => setMenu(null)} side="top" align="end" portal compact autoFocus />
      </div>
    </div>
    {view.notice ? <div className={view.noticeTone === 'warn' ? 'edrv-review-notice edrv-review-notice-warn' : 'edrv-review-notice'} role="status">{view.notice}</div> : null}
    {props.reviewError ? <div className={props.reviewErrorTone === 'info' ? 'edrv-review-notice' : 'edrv-review-notice edrv-review-error'} role={props.reviewErrorTone === 'info' ? 'status' : 'alert'}>{props.reviewError}</div> : null}
  </div>
}
