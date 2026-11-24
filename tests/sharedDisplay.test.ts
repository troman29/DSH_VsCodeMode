import { afterEach, describe, expect, it } from 'vitest'
import { sharedDisplay } from '../src/client/sharedDisplay.js'
import { bindUiLocale } from '../src/client/uiLocale.js'
import { svnActionsFor } from '../src/shared/svnActions.js'
import { SVN_STATUS_LABEL, SVN_LOG_ACTION_LABEL, SVN_TORTOISE_LABELS } from '../src/shared/svn.js'
import { statusOf } from '../src/shared/mcpStatus.js'

afterEach(() => bindUiLocale(undefined))

const canonicalLabels = [
  ...svnActionsFor('palette').map((action) => action.label),
  ...Object.values(SVN_STATUS_LABEL),
  ...Object.values(SVN_LOG_ACTION_LABEL),
  ...Object.values(SVN_TORTOISE_LABELS),
  ...['connected', 'connecting', 'configured', 'unverified', 'error', 'disabled', 'unknown'].map((status) => statusOf({ enabled: true, status } as never)),
  '全局技能', '当前工作区技能', '纯文本', '全语言', '局部非法字节', '二进制',
]

describe('shared metadata display boundary', () => {
  it.each(['en', 'ru'])('localizes every canonical shared label in %s without mutating its source', (active) => {
    bindUiLocale({ getLocale: () => ({ active }) })
    const originals = [...canonicalLabels]
    for (const label of canonicalLabels) {
      expect(sharedDisplay(label)).not.toMatch(/[\u3400-\u9fff]/)
      expect(sharedDisplay(label)).not.toBe('')
    }
    expect(canonicalLabels).toEqual(originals)
  })

  it.each(['en', 'ru', 'zh', 'unknown'])('retains unknown user text and dynamic validation details in %s', (active) => {
    bindUiLocale({ getLocale: () => ({ active }) })
    for (const text of ['用户自己的中文名称', '规则文件不存在或已移除：my-rule.mdc', 'constructor', '__proto__', '', 'Custom label']) {
      expect(sharedDisplay(text)).toBe(text)
    }
  })

  it('resolves locale live and defaults unknown languages to English', () => {
    let active = 'en'
    bindUiLocale({ getLocale: () => ({ active }) })
    expect(sharedDisplay('冲突')).toBe('Conflict')
    active = 'ru'
    expect(sharedDisplay('冲突')).toBe('Конфликт')
    active = 'unknown'
    expect(sharedDisplay('冲突')).toBe('Conflict')
    active = 'zh'
    expect(sharedDisplay('冲突')).toBe('冲突')
  })
})
