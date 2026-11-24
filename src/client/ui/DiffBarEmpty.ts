// @ts-nocheck
/**
 * dsh-vscode-mode client — DiffBarEmpty：无文件打开 / 当前文件无差异但有差异文件时的空态浮窗。
 * 迁移自原 src/client/index.ts 的 DiffBarEmpty，语义不改。
 * 作者 ddj 2026-08-20
 */
import { uiText } from '../uiLocale.js'
import React from 'react'

/**
 * 空态差异条：提示当前状态 + 查看下一个差异文件 + ⋮（总览/归档/刷新）。
 */
export function DiffBarEmpty(props) {
  const { sum, active, staleCount, onNextFile, onOpenLauncher, onRefresh } = props
  const [menuOpen, setMenuOpen] = React.useState(false)
  const n = sum?.totalFiles ?? 0
  const tip = active
    ? (staleCount > 0 ? uiText('当前文件有 ', "Current file has ", "В текущем файле ") + staleCount + uiText(' 处差异无法定位（可能已被后续修改影响）', " unlocatable changes (possibly affected by later edits)", " различий без позиции (возможно, из-за последующих правок)") : uiText('当前文件无待处理差异', "No pending changes in current file", "В текущем файле нет ожидающих изменений"))
    : uiText('未打开文件', "No file open", "Файл не открыт")

  const menu = menuOpen
    ? React.createElement(React.Fragment, null,
        React.createElement('div', { style: { position: 'fixed', inset: 0, zIndex: 44 }, onClick: () => setMenuOpen(false) }),
        React.createElement('div', { className: 'edrv-diffbar-menu' },
          React.createElement('button', { className: 'edrv-diffmenu-item', onClick: () => { onOpenLauncher('pending'); setMenuOpen(false) } }, uiText('🗂 差异总览', "🗂 Diff overview", "🗂 Обзор различий")),
          React.createElement('button', { className: 'edrv-diffmenu-item', onClick: () => { onOpenLauncher('archive'); setMenuOpen(false) } }, uiText('📁 归档', "📁 Archive", "📁 Архив")),
          React.createElement('div', { className: 'edrv-diffmenu-sep' }),
          React.createElement('button', { className: 'edrv-diffmenu-item', onClick: () => { onRefresh(); setMenuOpen(false) } }, uiText('⟳ 刷新', "⟳ Refresh", "⟳ Обновить"))))
    : null

  return React.createElement('div', { className: 'edrv-diffbar', 'data-edrv-diffbox': '1' },
    React.createElement('div', { className: 'edrv-diffbar-row' },
      React.createElement('span', { className: 'edrv-diffbar-count' }, uiText('⚠ 差异 ', "⚠ Changes: ", "⚠ Изменения: ") + n + uiText(' 文件', " files", " файлов")),
      React.createElement('span', { className: 'edrv-diffbar-file' }, tip),
      React.createElement('button', { className: 'edrv-pill edrv-pill-keep', title: uiText('打开并跳转到下一个差异文件', "Open and jump to the next changed file", "Открыть и перейти к следующему изменённому файлу"), onClick: onNextFile }, uiText('查看下一个差异文件', "View next changed file", "Показать следующий изменённый файл")),
      React.createElement('button', { className: 'edrv-pill edrv-pill-ghost', title: uiText('更多操作', "More actions", "Другие действия"), onClick: () => setMenuOpen((v) => !v) }, '⋮')),
    menu)
}
