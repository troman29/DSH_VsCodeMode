/** Official immutable patch ledger; current files use the existing editor. @author ddj 2026年10月26号 */
import { uiText } from '../uiLocale.js'
import React from 'react'
import { rpc } from '../rpc.js'
import { openEditorView } from '../events.js'
import { refreshReview } from '../state/reviewFeed.js'
import { PENDING_PREFIX } from '../../shared/pendingReview.js'
import type { ReviewDetail, ReviewItem, ReviewPage } from '../../shared/review.js'
const h = React.createElement
/** @private @author ddj 2026年10月26号 @param props Latest first-page metadata. @returns Paginated rows independent of expanded historical patch. */
export function ReviewLedger(props: { sessionId: string; first: ReviewPage | null; history?: boolean; path?: string }) {
  const [page, setPage] = React.useState<ReviewPage | null>(props.first)
  const [history, setHistory] = React.useState(props.history ?? false)
  const [cursor, setCursor] = React.useState(0)
  const [detail, setDetail] = React.useState<ReviewDetail | null>(null)
  const [error, setError] = React.useState('')
  const [aligning, setAligning] = React.useState(false)
  const [alignNote, setAlignNote] = React.useState('')
  const selected = React.useRef<AbortController | null>(null)
  React.useEffect(() => () => selected.current?.abort(), [])
  React.useEffect(() => {
    const controller = new AbortController()
    if (!history && !props.path && cursor === 0) { setPage(props.first); return () => controller.abort() }
    void rpc('edrv.review.list', { sessionId: props.sessionId, history, cursor, path: props.path }, controller.signal).then((result) => {
      if (controller.signal.aborted) return
      if (result.ok) { setPage(result.page); setError('') }
      else setError(result.error)
    }).catch((cause) => { if (!controller.signal.aborted) setError(String(cause)) })
    return () => controller.abort()
  }, [props.sessionId, props.first, props.path, cursor, history])

  /** @private @author ddj 2026年10月26号 @param item Frozen version identity; patch is never built from disk. */
  async function select(item: ReviewItem): Promise<void> {
    selected.current?.abort()
    const controller = new AbortController()
    selected.current = controller
    try {
      const result = await rpc('edrv.review.detail', { sessionId: props.sessionId, id: item.id }, controller.signal)
      if (controller.signal.aborted) return
      if (result.ok) { setDetail(result.detail); setError('') }
      else setError(result.error)
    } catch (cause) { if (!controller.signal.aborted) setError(String(cause)) }
  }
  /** @private @author ddj 2026年11月24号 @description 手动补扫：用版本库基线与已知内容对齐一次，把漏采的改动补进列表。 */
  async function align(): Promise<void> {
    if (aligning) return
    setAligning(true)
    try {
      const result = await rpc('edrv.pending.align', { sessionId: props.sessionId })
      if (!result.ok) { setAlignNote(result.error); return }
      setAlignNote(result.imported ? uiText(`补扫新增 ${result.imported} 条（版本库报告 ${result.changed} 个改动）`, `Scan added ${result.imported} records (repository reports ${result.changed} changes)`, `Сканирование добавило ${result.imported} записей (репозиторий сообщает об изменениях: ${result.changed})`) : uiText(`没有需要补录的改动（版本库报告 ${result.changed} 个改动）`, `No missing changes to capture (repository reports ${result.changed} changes)`, `Нет пропущенных изменений (репозиторий сообщает об изменениях: ${result.changed})`))
      refreshReview(props.sessionId)
    } catch (cause) { setAlignNote(String(cause)) }
    finally { setAligning(false) }
  }
  const gaps = page?.gaps ?? []
  return h('div', { style: { marginTop: 8 } },
    h('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
      h('label', null, h('input', { type: 'checkbox', checked: history, onChange: () => { setHistory(!history); setCursor(0) } }), uiText('显示已处理及被替换的历史', "Show resolved and superseded history", "Показать обработанную и заменённую историю")),
      h('button', { type: 'button', disabled: aligning, title: uiText('用版本库基线与已知内容对齐一次，补录漏采的改动', "Align repository baseline with known contents to capture missed changes", "Сверить базовую версию репозитория с известным содержимым для добавления пропущенных изменений"), onClick: () => { void align() } },
        aligning ? uiText('补扫中…', "Scanning…", "Сканирование…") : uiText('补扫一次', "Scan once", "Сканировать один раз"))),
    alignNote ? h('small', { role: 'status', style: { display: 'block', marginTop: 4 } }, alignNote) : null,
    error ? h('div', { role: 'alert' }, error) : null,
    !page ? h('p', { role: 'status' }, uiText('正在读取官方审查记录…', "Reading built-in review records…", "Чтение встроенных записей проверки…")) : null,
    page && !page.items.length ? h('p', null, history ? uiText('暂无已落盘历史。', "No persisted history yet.", "Сохранённой истории ещё нет.") : uiText('没有待处理的官方记录；可切换查看历史。', "No pending built-in records; switch to history to view past records.", "Нет ожидающих встроенных записей; переключитесь на историю для просмотра прошлых записей.")) : null,
    h('div', { style: { maxHeight: 210, overflow: 'auto' } }, page?.items.map((item) => h('button', {
      key: item.id, type: 'button', onClick: () => { void select(item) },
      title: item.currentPath || item.path,
      style: { display: 'block', width: '100%', textAlign: 'left', padding: '6px 4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
    }, item.id.startsWith(PENDING_PREFIX)
      ? uiText(`【待审】${item.display}  +${item.added} −${item.deleted} · ${item.decision}${item.sourceLabel ? ' · ' + item.sourceLabel : ''}${item.kind === 'oversized' ? uiText(' · 过大', " · Oversized", " · Слишком большой") : ''}`, `[Pending] ${item.display}  +${item.added} −${item.deleted} · ${item.decision}${item.sourceLabel ? ' · ' + item.sourceLabel : ''}${item.kind === 'oversized' ? uiText(' · 过大', " · Oversized", " · Слишком большой") : ''}`, `[Ожидает проверки] ${item.display}  +${item.added} −${item.deleted} · ${item.decision}${item.sourceLabel ? ' · ' + item.sourceLabel : ''}${item.kind === 'oversized' ? uiText(' · 过大', " · Oversized", " · Слишком большой") : ''}`)
      : uiText(`轮次 ${item.turn} · ${item.display}  +${item.added} −${item.deleted} · ${item.decision}${item.current ? '' : uiText('（已被同轮新版本替换）', " (superseded by a newer version in the same turn)", " (заменено новой версией в том же ходе)")}`, `Turn ${item.turn} · ${item.display}  +${item.added} −${item.deleted} · ${item.decision}${item.current ? '' : uiText('（已被同轮新版本替换）', " (superseded by a newer version in the same turn)", " (заменено новой версией в том же ходе)")}`, `Ход ${item.turn} · ${item.display}  +${item.added} −${item.deleted} · ${item.decision}${item.current ? '' : uiText('（已被同轮新版本替换）', " (superseded by a newer version in the same turn)", " (заменено новой версией в том же ходе)")}`)))),
    cursor > 0 ? h('button', { type: 'button', onClick: () => setCursor(Math.max(0, cursor - 50)) }, uiText('上一页', "Previous page", "Предыдущая страница")) : null,
    page?.nextCursor !== null && page?.nextCursor !== undefined ? h('button', { type: 'button', onClick: () => setCursor(page.nextCursor!) }, uiText('下一页', "Next page", "Следующая страница")) : null,
    // 采集缺口是诊断信息，排在条目之后折叠起来：放最前面会把真正要点的待审条目挤出可视区。
    gaps.length
      ? h('details', { key: 'gaps', style: { marginTop: 6 } },
        h('summary', { style: { cursor: 'pointer', fontSize: 11 } }, uiText(`采集不完整 ${gaps.length} 条（诊断信息）`, `Incomplete captures: ${gaps.length} (diagnostics)`, `Неполных записей: ${gaps.length} (диагностика)`)),
        gaps.map((gap) => h('div', { key: `${gap.sessionId}:${gap.seq}`, role: 'status', style: { fontSize: 11 } }, uiText(`轮次 ${gap.turn} 采集不完整：${gap.error}`, `Turn ${gap.turn} capture incomplete: ${gap.error}`, `Ход ${gap.turn}, неполная запись: ${gap.error}`))))
      : null,
    detail ? h(PatchDetail, { key: detail.item.id, sessionId: props.sessionId, detail, onChanged: () => { setDetail(null); refreshReview(props.sessionId) } }) : null)
}

/** @private @author ddj 2026年10月26号 @param props Immutable patch and current review revision. @returns Read-only source with explicit capability gates. */
function PatchDetail(props: { sessionId: string; detail: ReviewDetail; onChanged(): void }) {
  const [error, setError] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [operationId] = React.useState(() => crypto.randomUUID())
  const lifetime = React.useRef<AbortController | null>(null)
  React.useEffect(() => {
    lifetime.current = new AbortController()
    return () => lifetime.current?.abort()
  }, [])
  const { item, diff, capability } = props.detail
  /** @private @author ddj 2026年10月26号 Marks reviewed only; never writes disk. Stable operation id survives retries while mounted. */
  async function keep(): Promise<void> {
    setBusy(true)
    try {
      const result = await rpc('edrv.review.decide', { sessionId: props.sessionId, id: item.id, seq: item.seq, revision: item.revision,
        operationId, decision: 'accepted' }, lifetime.current?.signal)
      if (lifetime.current?.signal.aborted) return
      if (result.ok) props.onChanged()
      else setError(result.error)
    } catch (cause) { if (!lifetime.current?.signal.aborted) setError(String(cause)) }
    finally { if (!lifetime.current?.signal.aborted) setBusy(false) }
  }
  return h('article', { style: { marginTop: 10, borderTop: '1px solid var(--border-color, #d9dee7)', paddingTop: 8 } },
    h('strong', null, uiText(`${item.display} · 轮次 ${item.turn} / 事件 ${item.seq}`, `${item.display} · Turn ${item.turn} / Event ${item.seq}`, `${item.display} · Ход ${item.turn} / Событие ${item.seq}`)),
    h('div', null, uiText(`来源会话 ${item.sessionId} · 采集于 ${props.detail.capturedAt}`, `Source session ${item.sessionId} · Captured at ${props.detail.capturedAt}`, `Исходная сессия ${item.sessionId} · Записано ${props.detail.capturedAt}`)),
    h('p', null, capability.reason),
    diff.kind === 'text' ? h('div', null,
      h('div', null, `${diff.before ? uiText('原文件存在', "Original file exists", "Исходный файл существует") : uiText('原文件不存在', "Original file absent", "Исходный файл отсутствует")} / ${diff.after ? uiText('结果文件存在', "Result file exists", "Итоговый файл существует") : uiText('结果文件不存在', "Result file absent", "Итоговый файл отсутствует")}${diff.coarse ? uiText(' · 粗粒度比较', " · Coarse comparison", " · Приблизительное сравнение") : ''}`),
      h('pre', { style: { overflow: 'auto', maxHeight: 400, fontSize: 11, lineHeight: 1.6 }, 'aria-label': uiText('官方历史差异（只读）', "Built-in historical diff (read-only)", "Встроенные исторические различия (только чтение)") },
        diff.hunks.map((chunk, index) => h('div', { key: index },
          h('div', null, `@@ -${chunk.oldStart},${chunk.oldLines} +${chunk.newStart},${chunk.newLines} @@`),
          chunk.lines.map((line, position) => h('div', { key: position, style: { background: line.startsWith('+') ? 'light-dark(#e5f5e8, #173522)' : line.startsWith('-') ? 'light-dark(#fce9e9, #452323)' : undefined } }, line)))))
    ) : h('p', null, diff.kind === 'binary' ? uiText('二进制文件：官方不提供文本差异。', "Binary file: the built-in review does not provide text diffs.", "Двоичный файл: встроенная проверка не предоставляет текстовые различия.") : uiText('文件超过官方大小限制：没有差异内容。', "File exceeds the built-in size limit; no diff content available.", "Файл превышает встроенный предел размера; содержимое различий недоступно.")),
    error ? h('div', { role: 'alert' }, error) : null,
    h('button', { type: 'button', disabled: busy || !capability.keep, onClick: () => { void keep() } }, uiText('标记已审（不改文件）', "Mark reviewed (do not modify file)", "Отметить проверенным (не менять файл)")),
    h('button', { type: 'button', disabled: true, title: capability.reason }, uiText('拒绝写回不可用', "Reject write-back unavailable", "Запись отклонения недоступна")),
    h('button', { type: 'button', onClick: () => openEditorView(item.currentPath) }, uiText('编辑当前文件', "Edit current file", "Изменить текущий файл")))
}
