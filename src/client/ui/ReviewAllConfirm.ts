import { uiText } from '../uiLocale.js'
import React from 'react'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'

interface ReviewAllProps {
  reject: boolean
  count: number
  onCancel: () => void
  onConfirm: () => void
}

/**
 * @public
 * @author ddj 2026年10月27号
 * @description Confirm workspace-wide review through the DSH modal; dismissing never applies a decision.
 * @param props Pending file count, action and explicit confirmation callbacks.
 * @returns DSH-themed confirmation with distinct Keep and Undo safety descriptions.
 */
export function ReviewAllConfirm(props: ReviewAllProps): React.ReactElement {
  const action = props.reject ? 'Undo All' : 'Keep All'
  const warning = props.reject
    ? uiText('撤销会改写磁盘；逐项安全校验，遇到冲突停止，已完成项不会自动恢复。', "Undo rewrites disk files. Each item is checked for safety; conflicts stop the operation. Completed items are not automatically restored.", "Undo перезаписывает файлы на диске. Каждый элемент проверяется; конфликт останавливает операцию. Выполненные элементы автоматически не восстанавливаются.")
    : uiText('只标记待审修改为保留，不改写文件；个别条目若已变化或需在活跃端判定会被跳过并留在列表里，可逐个处理。', "Only mark pending changes as kept; files are not rewritten. Changed items or items requiring the active client are skipped and remain for individual review.", "Только отметить ожидающие изменения сохранёнными, без перезаписи файлов. Изменённые элементы или требующие активного клиента пропускаются и остаются для отдельной проверки.")
  const footer = React.createElement(React.Fragment, null,
    React.createElement(Button, { variant: 'ghost', onClick: props.onCancel, autoFocus: true }, uiText('取消', "Cancel", "Отмена")),
    React.createElement(Button, { variant: 'primary', onClick: props.onConfirm }, uiText('确认 ', "Confirm ", "Подтвердить ") + action))

  return React.createElement(Modal, {
    open: true,
    title: action + uiText(' 确认', " confirmation", " — подтверждение"),
    closeLabel: uiText('取消', "Cancel", "Отмена"),
    onClose: props.onCancel,
    description: uiText(`处理当前工作区全部 ${props.count} 个待审差异文件（含其他轮次）？`, `Process all ${props.count} pending changed files in the current workspace (including other turns)?`, `Обработать все ожидающие изменённые файлы рабочей области: ${props.count} (включая другие ходы)?`),
    footer,
  }, React.createElement('p', null, warning))
}
