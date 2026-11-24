/**
 * dsh-vscode-mode client — AI 提交信息的小状态机（生成中 / 失败原因 / 风格）。
 *
 * 为什么单独成模块：提交对话框要保持「按钮文字恒定、状态位变化」的既有面板口径，
 * 生成态与错误文案不能混进对话框的渲染逻辑里，否则每次改文案都要动 UI。
 * @author ddj 2026年11月15号
 */
import { uiText } from './uiLocale.js'
import type { AiCommitStyle } from '../shared/svn.js'
import { svnAiCommitMsg } from './svnCommit.js'

/** 生成状态。 */
export type AiCommitPhase = 'idle' | 'running' | 'failed' | 'done'

/** 生成状态快照。 */
export interface AiCommitState {
  /** 阶段。 */
  phase: AiCommitPhase
  /** 状态位文案（按钮文字不随状态变化）。 */
  note: string
  /** 最近一次失败原因（phase=failed 时有值）。 */
  error?: string
  /** 实际使用的模型（phase=done 时有值）。 */
  model?: string
}

/** 风格展示名。 */
export const AI_COMMIT_STYLE_LABEL: Record<AiCommitStyle, string> = {
  get plain() { return uiText('中文模板', "Chinese template", "Шаблон на китайском") },
  conventional: 'Conventional',
}

/** 初始状态。 */
export const AI_COMMIT_IDLE: AiCommitState = { phase: 'idle', get note() { return uiText('就绪', "Ready", "Готово") } }

/**
 * 执行一次生成并返回下一状态与新文本（不修改任何外部状态）。
 * @author ddj 2026年11月15号
 * @param sessionId 会话 id
 * @param paths 提交范围
 * @param style 风格
 * @returns 下一状态与生成的完整信息（失败时 text 为空）
 */
export async function runAiCommit(
  sessionId: string | undefined,
  paths: string[],
  style: AiCommitStyle,
): Promise<{ state: AiCommitState; text: string }> {
  if (!paths.length) return { state: { phase: 'failed', note: uiText('未选择文件', "No files selected", "Файлы не выбраны"), error: uiText('请先勾选要提交的文件（AI 只分析提交范围）', "Select files to commit first (AI analyzes the commit scope only)", "Сначала отметьте файлы для коммита (AI анализирует только выбранную область)") }, text: '' }
  const outcome = await svnAiCommitMsg(sessionId, paths, style)
  if (!outcome.ok) {
    return { state: { phase: 'failed', note: uiText('生成失败', "Generation failed", "Не удалось создать сообщение"), error: outcome.message }, text: '' }
  }
  return {
    state: { phase: 'done', note: uiText('已生成', "Generated", "Создано"), ...(outcome.model ? { model: outcome.model } : {}) },
    text: outcome.text ?? '',
  }
}
