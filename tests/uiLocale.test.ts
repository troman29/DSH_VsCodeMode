import { afterEach, describe, expect, it } from 'vitest'
import { bindUiLocale, uiText } from '../src/client/uiLocale.js'

afterEach(() => bindUiLocale(undefined))

describe('editor display locale', () => {
  it.each([
    ['en', 'Save'],
    ['en-US', 'Save'],
    ['ru', 'Сохранить'],
    ['ru-RU', 'Сохранить'],
    ['de', 'Save'],
    ['zh-CN', '保存'],
  ])('selects the expected display text for %s', (active, expected) => {
    bindUiLocale({ getLocale: () => ({ active }) })
    expect(uiText('保存', 'Save', 'Сохранить')).toBe(expected)
  })

  it('uses English before the host locale is available', () => {
    expect(uiText('保存', 'Save', 'Сохранить')).toBe('Save')
  })

  it('reads the current host language on every call', () => {
    let active = 'en'
    bindUiLocale({ getLocale: () => ({ active }) })
    expect(uiText('保存', 'Save', 'Сохранить')).toBe('Save')
    active = 'ru'
    expect(uiText('保存', 'Save', 'Сохранить')).toBe('Сохранить')
  })
})
