// @ts-nocheck
/**
 * dsh-vscode-mode client — SVN 补丁预览对话框（W2-1 Create Patch）。
 *
 * 承载 `svn.patchText` 的产物：只读 pre 展示 + 复制/保存两个出口。
 * 文案强调「仅生成」——本对话框不做也不提供补丁应用（P5 另议）；
 * truncated = host 检测到 stdout 超限丢头（PROGRESS §六.1），明示「不完整」防误用；
 * binary = 补丁里含二进制文件的 "Cannot display" 通知段（M4 实测形态）。
 * 作者 ddj 2026年09月20号
 */
import { uiText } from '../uiLocale.js'
import React from 'react'
import { FloatingWindow } from './FloatingWindow.js'
import { downloadText } from './svnExport.js'

/**
 * 补丁预览对话框。
 * @author ddj 2026年09月20号
 * @param props.path 补丁目标（工作区相对路径）
 * @param props.text 补丁文本（unified 格式）
 * @param props.truncated host 检测到输出被截断（头部 Index: 丢失）
 * @param props.binary 补丁含二进制文件通知段（无文本差异内容）
 * @param props.onNote 轻量反馈（复制/保存结果；缺省静默）
 * @param props.onClose 关闭回调
 * @returns 弹窗元素
 */
export function SvnPatchDialog(props) {
  const { path, text, truncated, binary, onNote, onClose } = props
  const fileName = 'svn-patch-' + String(path || 'wc').split(/[\\/]/).pop().replace(/[^\w.-]+/g, '_') + '.patch'

  /** 复制补丁全文（剪贴板不可用时提示手动复制）。 */
  const copyText = () => {
    void navigator.clipboard?.writeText(text).then(
      () => onNote?.(uiText('补丁已复制到剪贴板', "Patch copied to clipboard", "Патч скопирован в буфер обмена")),
      () => onNote?.(uiText('复制失败：请点击文本区手动全选复制', "Copy failed. Select all text and copy manually.", "Не удалось скопировать. Выделите весь текст и скопируйте вручную.")),
    )
  }
  /** 保存为 .patch 文件（复用 W1-4 前端下载，仅本地不外发）。 */
  const saveFile = () => {
    const done = downloadText(fileName, text, 'text/x-diff')
    onNote?.(done ? uiText('已保存 ', "Saved ", "Сохранено ") + fileName : uiText('保存失败：浏览器下载能力不可用', "Save failed: browser downloads unavailable", "Ошибка сохранения: загрузки браузера недоступны"))
  }

  return React.createElement(FloatingWindow, {
    title: uiText('SVN 补丁预览', "SVN patch preview", "Предпросмотр патча SVN"), height: 560,
    key: 'edrv-svn-patch',
    dialogClass: 'edrv-svn-patch-dialog',
    width: 760,
    onClose,
  },
    React.createElement('div', { className: 'edrv-svn-patch-head' },
      React.createElement('h3', { className: 'edrv-svnlog-title' }, uiText('SVN 补丁（仅生成，不应用）', "SVN patch (generate only, do not apply)", "Патч SVN (только создание, без применения)")),
      React.createElement('span', { className: 'edrv-svnlog-target', title: path || '' }, path || uiText('（工作副本根）', "(Working copy root)", "(Корень рабочей копии)")),
      React.createElement('span', { style: { flex: 1 } }),
      React.createElement('button', { className: 'edrv-svn-act', title: uiText('关闭', "Close", "Закрыть"), onClick: onClose }, '✕')),
    React.createElement('div', { className: 'edrv-svn-patch-notes' },
      (truncated ? React.createElement('span', { className: 'edrv-svn-patch-warn' }, uiText('⚠ 补丁超出 16MB 上限已截断（头部丢失），内容不完整，请勿使用', "⚠ Patch exceeded 16MB and was truncated at the beginning. It is incomplete; do not use it.", "⚠ Патч превысил 16MB, начало обрезано. Он неполный; не используйте его.")) : null),
      (binary ? React.createElement('span', { className: 'edrv-svn-patch-warn' }, uiText('⚠ 包含二进制文件：这些文件只有 "Cannot display" 占位段，无文本差异内容', "⚠ Contains binary files: these have only “Cannot display” placeholders, not text diffs", "⚠ Содержит двоичные файлы: для них есть только заглушки «Cannot display», без текстовых различий")) : null)),
    React.createElement('pre', { className: 'edrv-svn-patch-pre' }, text || uiText('（空补丁：目标无差异）', "(Empty patch: target has no differences)", "(Пустой патч: различий нет)")),
    React.createElement('div', { className: 'edrv-svn-patch-foot' },
      React.createElement('button', { className: 'edrv-svn-act', title: uiText('复制补丁全文到剪贴板', "Copy entire patch to clipboard", "Копировать весь патч в буфер обмена"), onClick: copyText }, uiText('复制', "Copy", "Копировать")),
      React.createElement('button', { className: 'edrv-svn-act', title: uiText('保存为本地 .patch 文件（仅本地，不外发）', "Save as a local .patch file (not sent externally)", "Сохранить локальный файл .patch (без внешней отправки)"), onClick: saveFile }, uiText('保存 .patch', "Save .patch", "Сохранить .patch")),
      React.createElement('span', { style: { flex: 1 } }),
      React.createElement('span', { className: 'edrv-svn-count' }, String(text.length) + uiText(' 字符', " characters", " символов"))))
}
