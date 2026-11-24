import { afterEach, describe, expect, it } from 'vitest'
import { quickMenuValidationDisplay, sharedDisplay } from '../src/client/sharedDisplay.js'
import { bindUiLocale } from '../src/client/uiLocale.js'
import { parsePairs } from '../src/client/mcpForm.js'

const details = '目录/规则中文.mdc\nextra: 原始错误'
const dynamicMessages = [
  '工作区规则目录不存在：' + details,
  '规则文件不存在或已移除：' + details,
  '规则解析失败：' + details,
  '规则已停用，不会生效：' + details,
  '规则来自其他工作区，发送时会跳过：' + details,
  '当前会话不可见（可能已移除或未被该会话加载）：' + details,
  '技能名不合法：' + details,
  '项目规则缺少工作区：' + details,
  '技能不可用：' + details,
  '规则不可用：' + details,
  '未能读取规则正文，已跳过内联：' + details,
]
const limits = ['名称过长（上限 80 字）', '优先级需在 0 到 9999 之间', '已达最大嵌套层数（上限 5）', '提示词过长（上限 50000 字符）']

afterEach(() => bindUiLocale(undefined))

describe('canonical quick-menu validation renderer', () => {
  it.each(['en', 'ru'])('translates only the canonical wrapper and preserves Chinese details in %s', (active) => {
    bindUiLocale({ getLocale: () => ({ active }) })
    for (const message of dynamicMessages) {
      const rendered = quickMenuValidationDisplay(message)
      expect(rendered).toContain(details)
      expect(rendered.slice(0, rendered.indexOf(details))).not.toMatch(/[\u3400-\u9fff]/)
      expect(sharedDisplay(message)).toBe(message)
    }
    for (const message of limits) {
      expect(quickMenuValidationDisplay(message)).not.toMatch(/[\u3400-\u9fff]/)
      expect(quickMenuValidationDisplay(message)).toContain(message.match(/\d+/)![0])
    }
  })

  it('retains unknown strings and requires a complete anchored template', () => {
    for (const message of ['用户自定义文本', 'prefix 名称过长（上限 80 字）', '名称过长（上限 80 字） trailing']) {
      expect(quickMenuValidationDisplay(message)).toBe(message)
    }
  })

  it('keeps original Chinese messages when Chinese is active', () => {
    bindUiLocale({ getLocale: () => ({ active: 'zh' }) })
    for (const message of [...dynamicMessages, ...limits]) {
      expect(quickMenuValidationDisplay(message)).toBe(message)
    }
  })
})

describe('MCP form validation display', () => {
  it.each(['en', 'ru'])('retains duplicate header identity and translates the wrapper in %s', (active) => {
    bindUiLocale({ getLocale: () => ({ active }) })
    expect(() => parsePairs('X-Key=one\nx-key=two')).toThrow('x-key')
    try {
      parsePairs('invalid header')
    } catch (error) {
      expect(String(error)).not.toMatch(/[\u3400-\u9fff]/)
      expect(String(error)).toContain('1')
    }
  })
})
