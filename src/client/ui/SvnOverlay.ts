/** Small vector overlays over official file-type icons. @author ddj 2026年10月09号 */
import { uiText } from '../uiLocale.js'
import React from 'react'
import type { SvnExplorerMark, SvnViewMark } from '../../shared/svnExplorer.js'
/** @public @author ddj 2026年10月10号 @param row Compact mark. @returns Overlay description; stale evidence never renders a green check. */
export function viewOverlayOf(row?: SvnViewMark): SvnExplorerMark | null {
  if (!row?.kind || (row.stale && row.kind === 'clean')) return null
  const names = { clean: uiText('本地正常（不表示仓库无更新）', "Locally clean (repository may have updates)", "Локально без изменений (в репозитории могут быть обновления)"), modified: uiText('本地修改', "Local changes", "Локальные изменения"), conflict: uiText('冲突或阻塞', "Conflict or obstruction", "Конфликт или препятствие"),
    added: uiText('新增', "Added", "Добавлено"), deleted: uiText('删除或缺失', "Deleted or missing", "Удалено или отсутствует"), unversioned: uiText('未受控', "Unversioned", "Вне контроля версий"), ignored: uiText('忽略', "Ignored", "Исключено"), external: uiText('外部引用', "External reference", "Внешняя ссылка") }
  return { kind: row.kind, title: names[row.kind] + (row.count ? uiText('；子项 ', "; child changes: ", "; изменений во вложенных элементах: ") + row.count + uiText(' 处变更', " changes", " изменений") : '')
    + (row.stale ? uiText('；状态陈旧，等待确认', "; stale status, awaiting confirmation", "; состояние устарело, ожидается подтверждение") : '') }
}
const SIGNS = { clean: '✓', modified: '!', conflict: '×', added: '+', deleted: '−', unversioned: '?', ignored: '·', external: '↗' }

/** @public @author ddj 2026年10月09号 @param mark Confirmed local mark. @param remote Remote changed-item count. @returns Accessible vector overlay; remote arrow coexists with local conflict. */
export function svnOverlayEl(mark: SvnExplorerMark | null, remote: number): React.ReactElement | null {
  if (!mark && !remote) return null
  const title = 'SVN ' + (mark?.title ?? uiText('本地状态未确认', "Local status unconfirmed", "Локальное состояние не подтверждено")) + (remote ? uiText('；仓库有可更新内容（', "; repository updates available (", "; доступны обновления репозитория (") + remote + uiText(' 项）', " items)", " элементов)") : '')
  const svg = mark ? React.createElement('svg', { viewBox: '0 0 12 12', width: 12, height: 12, 'aria-hidden': true },
    React.createElement('circle', { cx: 6, cy: 6, r: 5.5, fill: 'currentColor' }),
    React.createElement('text', { x: 6, y: 9, textAnchor: 'middle', fill: '#fff', fontSize: 9, fontFamily: 'Arial, sans-serif', fontWeight: 700 }, SIGNS[mark.kind])) : null
  return React.createElement('span', { className: 'edrv-svn-overlay', title, 'aria-label': title, role: 'img' },
    mark ? React.createElement('span', { className: 'edrv-svn-local edrv-svn-icon-' + mark.kind }, svg) : null,
    remote ? React.createElement('span', { className: 'edrv-svn-remote', 'aria-hidden': true }, '↓') : null)
}
