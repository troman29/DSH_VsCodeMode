import { createUniver, LocaleType, mergeLocales, type ICellData } from '@univerjs/presets'
import { UniverSheetsCorePreset } from '@univerjs/preset-sheets-core'
import enUS from '@univerjs/preset-sheets-core/locales/en-US'
import ruRU from '@univerjs/preset-sheets-core/locales/ru-RU'
import { uiText } from '../uiLocale.js'
import '@univerjs/preset-sheets-core/lib/index.css'
import './panel.css'
import { editExcel, exportExcel, notifyExcel, type ExcelState } from './controller.js'
import { openOriginal } from '../remoteOpenRouter.js'

/** @public @author ddj 2026年10月28号 @param state Shared per-file controller. @param path Original file path. @param cwd Owning workspace for native path resolution. @returns Movable shared DOM node; one workbook never mounts two diverging engines. */
export function excelPanel(state: ExcelState, path: string, cwd?: string): HTMLElement {
  if (state.node) return state.node
  const root = document.createElement('div')
  root.className = 'edrv-excel-panel'
  const tools = document.createElement('div')
  tools.className = 'edrv-excel-tools'
  const exportButton = document.createElement('button')
  exportButton.textContent = uiText('基础 · 导出副本', "Basic · Export copy", "Базовый режим · Экспорт копии")
  const advanced = document.createElement('button')
  advanced.textContent = uiText('高级 · Excel / WPS', "Advanced · Excel / WPS", "Расширенный режим · Excel / WPS")
  const notice = document.createElement('div')
  notice.className = 'edrv-excel-notice'
  tools.append(exportButton, advanced)
  root.append(tools, notice)
  const workbookDoc = state.document
  if (!workbookDoc) throw new Error(uiText('Excel 未加载', "Excel not loaded", "Excel не загружен"))
  /** @private @author ddj 2026年10月28号 @sideEffects Updates status only; no original-file mutation. */
  function renderNotice(): void { notice.textContent = state.notice || (workbookDoc!.reasons.length ? uiText('只读数据预览；禁止编辑和导出。', "Read-only data preview; editing and export are disabled.", "Предпросмотр данных только для чтения; правка и экспорт запрещены.") + workbookDoc!.reasons.join('；') : uiText('基础编辑：仅支持常用单元格和五种聚合公式；Ctrl+S 不写原件。高级功能请用 Excel/WPS。', "Basic editing supports common cells and five aggregate formulas only. Ctrl+S does not write the original. Use Excel/WPS for advanced features.", "Базовый режим поддерживает обычные ячейки и пять формул агрегации. Ctrl+S не изменяет оригинал. Для расширенных функций используйте Excel/WPS.")) }
  state.listeners.add(renderNotice)
  renderNotice()
  exportButton.disabled = workbookDoc.reasons.length > 0
  /** @private @author ddj 2026年10月28号 @sideEffects Starts download without clearing dirty. */
  async function download(): Promise<void> { try { await exportExcel(state, path) } catch (error) { state.notice = String(error); notifyExcel(state) } }
  /** @private @author ddj 2026年10月28号 @sideEffects Explicit official Host handoff of the original, never an exported copy or plugin recursion. */
  async function nativeOpen(): Promise<void> {
    if (state.dirty) {
      const choice = window.prompt(uiText('高级应用打开的是原件，不包含当前编辑。输入：原件 / 导出 / 取消。导出仅下载，请从下载位置打开副本。', "The external application opens the original without current edits. Enter: original / export / cancel. Export only downloads a copy; open it from the download location.", "Внешнее приложение откроет оригинал без текущих правок. Введите: оригинал / экспорт / отмена. Экспорт только скачивает копию; откройте её из папки загрузок."), uiText('取消', 'cancel', 'отмена'))
      if (choice && ['导出', 'export', 'экспорт'].includes(choice.trim().toLowerCase())) { await download(); return }
      if (!choice || !['原件', 'original', 'оригинал'].includes(choice.trim().toLowerCase())) return
    }
    try { await openOriginal({ path: state.path || path }, cwd) } catch (error) { state.notice = String(error); notifyExcel(state) }
  }
  exportButton.onclick = download
  advanced.onclick = nativeOpen
  if (workbookDoc.reasons.length) {
    renderPreview(root, state)
    state.dispose = () => { state.listeners.delete(renderNotice); root.remove() }
  } else mountGrid(root, state, renderNotice)
  state.node = root
  return root
}

/** @private @author ddj 2026年10月28号 @param root Shared root. @param state Loaded controller. @param notice Listener cleanup. @sideEffects Creates one OSS engine with all workbook changes tracked; never a persistence service. */
function mountGrid(root: HTMLElement, state: ExcelState, notice: () => void): void {
  const container = document.createElement('div')
  container.className = 'edrv-excel-grid'
  root.append(container)
  const { univer, univerAPI } = createUniver({ locale: uiText('enUS', 'enUS', 'ruRU') as LocaleType, locales: { [LocaleType.EN_US]: mergeLocales(enUS), [LocaleType.RU_RU]: mergeLocales(ruRU) }, presets: [UniverSheetsCorePreset({ container })] })
  const workbook = univerAPI.createWorkbook(structuredClone(state.document!.snapshot))
  state.capture = () => workbook.save()
  /** @private @author ddj 2026年10月28号 @param command Completed command. @sideEffects Only data mutations create a dirty revision; selection changes do not. */
  function changed(command: { id: string; type?: number }): void {
    if (command.type === 2) editExcel(state)
  }
  const subscription = workbook.onCommandExecuted(changed)
  state.dispose = () => { subscription.dispose(); state.listeners.delete(notice); univer.dispose(); root.remove() }
}

/** @private @author ddj 2026年10月28号 @param root Preview root. @param state Unsupported workbook. @sideEffects Renders plain text, never formula HTML or an editable engine. */
function renderPreview(root: HTMLElement, state: ExcelState): void {
  const preview = document.createElement('div')
  preview.className = 'edrv-excel-preview'
  const snapshot = state.document!.snapshot
  for (const id of snapshot.sheetOrder) {
    const sheet = snapshot.sheets[id]
    const heading = document.createElement('h3')
    heading.textContent = sheet.name || id
    const table = document.createElement('table')
    for (const [rowIndex, cells] of Object.entries(sheet.cellData || {})) {
      const row = table.insertRow()
      row.insertCell().textContent = String(Number(rowIndex) + 1)
      for (const [column, cell] of Object.entries(cells || {}) as [string, ICellData][]) row.insertCell().textContent = `${Number(column) + 1}: ${cell?.v ?? cell?.f ?? ''}`
    }
    preview.append(heading, table)
  }
  root.append(preview)
}
