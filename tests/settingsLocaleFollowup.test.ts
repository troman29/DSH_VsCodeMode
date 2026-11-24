import { afterEach, describe, expect, it, vi } from 'vitest'
import { allowClose, editExcel, excelState, releaseExcel } from '../src/client/excel/controller.js'
import { setExcelCodec } from '../src/client/excel/codecLoader.js'
import { bindUiLocale } from '../src/client/uiLocale.js'
import { sidecarLabel, sidecarKeepDone, sessionDownNotice } from '../src/client/reviewBar.js'
import { loadFailureText, monacoHint } from '../src/client/loadFailure.js'

function dirtyWorkbook(scope: string) {
  const state = excelState(scope, 'book.xlsx')
  state.document = { reasons: [], snapshot: { id: scope, name: 'Book', locale: 'enUS' as never, appVersion: '1', sheets: {}, sheetOrder: [], styles: {} } }
  editExcel(state)
  return state
}

afterEach(() => {
  bindUiLocale(undefined)
  setExcelCodec()
  vi.unstubAllGlobals()
})

describe('localized Excel close commands', () => {
  it.each(['discard', 'отказаться', '放弃', ' DISCARD '])('requires explicit confirmation for %s', async (command) => {
    const state = dirtyWorkbook(command)
    const confirm = vi.fn().mockReturnValue(false)
    vi.stubGlobal('window', { prompt: () => command, confirm })
    expect(await allowClose(state, 'book.xlsx')).toBe(false)
    expect(confirm).toHaveBeenCalledOnce()
    expect(state.dirty).toBe(true)
    releaseExcel(command, 'book.xlsx')
  })

  it.each(['export', 'экспорт', '导出'])('exports but retains edits if discard is declined for %s', async (command) => {
    const state = dirtyWorkbook(command)
    const downloadExcel = vi.fn().mockResolvedValue(undefined)
    setExcelCodec(async () => ({ decodeExcel: vi.fn(), downloadExcel }))
    vi.stubGlobal('window', { prompt: () => command, confirm: () => false })
    expect(await allowClose(state, 'book.xlsx')).toBe(false)
    expect(downloadExcel).toHaveBeenCalledOnce()
    expect(state.dirty).toBe(true)
    releaseExcel(command, 'book.xlsx')
  })

  it.each(['cancel', 'отмена', '取消', 'unknown', null])('preserves edits without confirmation for %s', async (command) => {
    const scope = 'cancel-' + command
    const state = dirtyWorkbook(scope)
    const confirm = vi.fn()
    vi.stubGlobal('window', { prompt: () => command, confirm })
    expect(await allowClose(state, 'book.xlsx')).toBe(false)
    expect(confirm).not.toHaveBeenCalled()
    expect(state.dirty).toBe(true)
    releaseExcel(scope, 'book.xlsx')
  })
})

describe('localized network failure classification', () => {
  it.each(['en', 'ru', 'zh'])('retains network guidance for generated %s diagnostics', (active) => {
    bindUiLocale({ getLocale: () => ({ active }) })
    const message = loadFailureText('Monaco', '/assets/loader.js', 0)
    const hint = monacoHint(message)
    expect(hint).toBe(monacoHint('Failed to fetch'))
    expect(message).toContain('/assets/loader.js')
  })
})

describe('review display accessors', () => {
  it('reads the active locale after module import', () => {
    let active = 'en'
    bindUiLocale({ getLocale: () => ({ active }) })
    expect(sidecarLabel()).toBe('Historical changes')
    active = 'ru'
    expect(sidecarLabel()).toBe('Исторические изменения')
    expect(sidecarKeepDone()).toBe('Отмечено как просмотренное (файл не изменён)')
    expect(sessionDownNotice()).toContain('Сеанс не активен')
    active = 'unknown'
    expect(sidecarLabel()).toBe('Historical changes')
  })
})
