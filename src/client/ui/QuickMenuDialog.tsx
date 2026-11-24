/**
 * dsh-vscode-mode client — 快捷菜单的配置弹窗（新增/编辑项 + 全局设置）。
 *
 * 设计要点：配置不再有独立设置页，全部从菜单就地入口打开；
 * 表单按「类型」动态取舍字段（组只要名称/归属/优先级，按钮额外要提示词与绑定）；
 * 工作区限定沿祖先链继承——父组已限定时本项只读展示继承值，避免出现互相矛盾的配置。
 * 技能与规则都走多选下拉（候选来自目录扫描，不再手输名字）；分段与开关统一由 QuickMenuPickers 提供。
 * 作者 ddj 2026年10月30号
 */
import { quickMenuValidationDisplay, sharedDisplay } from '../sharedDisplay.js'
import React from 'react'
import { uiText } from '../uiLocale.js'
import { ModalShell } from './ModalShell.js'
import { PickMulti, PickSeg, PickSwitch, PickWorkspace } from './QuickMenuPickers.js'
import type { PickGroup, PickOption, PickSegOption } from './QuickMenuPickers.js'
import type { QuickMenuHost } from '../quickMenuHost.js'
import {
  QUICK_MENU_DEFAULT_DEPTH,
  QUICK_MENU_MAX_DEPTH,
  QUICK_MENU_MIN_DEPTH,
  QUICK_MENU_NAME_CAP,
  QUICK_MENU_ORDER_CAP,
  QUICK_MENU_PROMPT_CAP,
  bindingKey,
  depthOf,
  descendantIds,
  inheritWorkspaces,
  itemStatus,
  normalizePath,
  parseDoc,
  serializeDoc,
  validateItem,
  validateRule,
  validateSkill,
} from '../../shared/quickMenu.js'
import type {
  ClickAction,
  QuickButton,
  QuickGroup,
  QuickItemType,
  QuickMenuItem,
  QuickMenuDoc,
  RuleBinding,
  RuleInjectMode,
  RuleListSnapshot,
  ValidateContext,
} from '../../shared/quickMenu.js'
import { groupSkills } from '../../shared/skillCatalog.js'
import type { SkillCatalog, SkillInfo } from '../../shared/skillCatalog.js'

/** 表单项候选（规则下拉的展示与状态）。 */
interface RuleChoice {
  binding: RuleBinding
  label: string
  hint: string
}

/** 类型分段的可选值。 */
const TYPE_OPTIONS: PickSegOption[] = [
  { value: 'button', get label() { return uiText('按钮', "Button", "Кнопка") } },
  { value: 'group', get label() { return uiText('组', "Group", "Группа") } },
]

/** 规则注入方式分段的可选值。 */
const MODE_OPTIONS: PickSegOption[] = [
  { value: 'reference', get label() { return uiText('引用', "Reference", "Ссылка") } },
  { value: 'inline', get label() { return uiText('内联正文', "Inline content", "Встроенный текст") } },
]

/** 最大嵌套层数分段的可选值（1–5）。 */
const DEPTH_OPTIONS: PickSegOption[] = Array.from({ length: QUICK_MENU_MAX_DEPTH }, (_, index) => {
  const depth = QUICK_MENU_MIN_DEPTH + index
  return { value: String(depth), label: String(depth) }
})

/** 技能描述在候选行里的最大长度。 */
const SKILL_HINT_CAP = 28

/**
 * 截断技能描述，作为候选行的次要说明。
 * @author ddj 2026年10月30号
 * @param description 技能描述
 * @returns 单行摘要
 */
function brief(description: string): string | undefined {
  const text = description.trim().replace(/\s+/g, ' ')
  if (text === '') return undefined
  return text.length > SKILL_HINT_CAP ? text.slice(0, SKILL_HINT_CAP) + '…' : text
}

/**
 * 单个技能候选（状态点来自会话可见性校验）。
 * @author ddj 2026年10月30号
 * @param name 技能名
 * @param ctx 校验上下文
 * @param hint 次要说明
 * @returns 候选项
 */
function skillOption(name: string, ctx: ValidateContext, hint?: string): PickOption {
  const status = validateSkill(name, ctx)
  return {
    key: name,
    label: name,
    ...(hint ? { hint } : {}),
    ...(status.state === 'ok' ? {} : { state: status.state === 'warn' ? 'warn' : undefined }),
    ...(status.reason ? { reason: quickMenuValidationDisplay(status.reason) } : {}),
  }
}

/**
 * 技能候选分组：全局技能 / 当前工作区技能 / 已绑定但不在候选内。
 * @author ddj 2026年10月30号
 * @param catalog 目录扫描结果（读取失败为 null）
 * @param names 当前会话可见技能名（候选为空时的兜底来源）
 * @param selected 已绑定技能名
 * @param ctx 校验上下文
 * @returns 分组候选
 */
function skillGroups(
  catalog: SkillCatalog | null,
  names: string[] | null,
  selected: string[],
  ctx: ValidateContext,
): PickGroup[] {
  const groups: PickGroup[] = []
  const known = new Set<string>()

  for (const group of groupSkills(catalog)) {
    const options = group.skills.map((info: SkillInfo) => skillOption(info.name, ctx, brief(info.description)))
    for (const option of options) known.add(option.key)
    if (options.length > 0) groups.push({ key: group.key, label: sharedDisplay(group.label), options })
  }

  // 目录读不到（旧 host 或权限问题）时退回会话可见技能名，避免下拉变空
  if (groups.length === 0 && names && names.length > 0) {
    const options = names.map((name) => skillOption(name, ctx))
    for (const option of options) known.add(option.key)
    groups.push({ key: 'session', label: uiText('当前会话技能', "Current session skills", "Навыки текущего сеанса"), options })
  }

  const extra = selected.filter((name) => !known.has(name))
  if (extra.length > 0) {
    groups.push({
      key: 'bound',
      label: uiText('已绑定（不在候选内）', "Bound (not in available choices)", "Привязано (нет среди вариантов)"),
      options: extra.map((name) => skillOption(name, ctx, uiText('候选目录里没有该技能，可取消绑定', "Skill is absent from the catalog; you can unbind it", "Навык отсутствует в каталоге; привязку можно удалить"))),
    })
  }
  return groups
}

/**
 * 单个规则候选（状态点来自 validateRule）。
 * @author ddj 2026年10月30号
 * @param choice 规则候选
 * @param ctx 校验上下文
 * @returns 候选项
 */
function ruleOption(choice: RuleChoice, ctx: ValidateContext): PickOption {
  const status = validateRule(choice.binding, ctx)
  const state = status.state === 'warn' || status.state === 'error' ? status.state : undefined
  return {
    key: bindingKey(choice.binding),
    label: choice.label,
    hint: choice.hint,
    ...(state ? { state } : {}),
    ...(status.reason ? { reason: quickMenuValidationDisplay(status.reason) } : {}),
  }
}

/**
 * 规则候选分组：用户规则 / 当前工作区规则 / 已绑定但已失效。
 * @author ddj 2026年10月30号
 * @param choices 规则候选
 * @param selected 已绑定规则
 * @param ctx 校验上下文
 * @returns 分组候选
 */
function ruleGroups(choices: RuleChoice[], selected: RuleBinding[], ctx: ValidateContext): PickGroup[] {
  const known = new Set(choices.map((choice) => bindingKey(choice.binding)))
  const user = choices.filter((choice) => choice.binding.scope === 'user')
  const project = choices.filter((choice) => choice.binding.scope === 'project')
  const groups: PickGroup[] = []

  if (user.length > 0) {
    groups.push({ key: 'user', label: uiText('用户规则', "User rules", "Правила пользователя"), options: user.map((choice) => ruleOption(choice, ctx)) })
  }
  if (project.length > 0) {
    groups.push({ key: 'project', label: uiText('当前工作区规则', "Current workspace rules", "Правила текущего пространства"), options: project.map((choice) => ruleOption(choice, ctx)) })
  }

  const extra = selected.filter((binding) => !known.has(bindingKey(binding)))
  if (extra.length > 0) {
    groups.push({
      key: 'bound',
      label: uiText('已绑定（规则已不存在）', "Bound (rule no longer exists)", "Привязано (правило отсутствует)"),
      options: extra.map((binding) => {
        const status = validateRule(binding, ctx)
        return {
          key: bindingKey(binding),
          label: binding.file,
          hint: binding.scope === 'user' ? uiText('用户规则', "User rules", "Правила пользователя") : uiText('项目规则', "Project rules", "Правила проекта"),
          state: status.state === 'warn' ? 'warn' : 'error',
          reason: status.reason ? quickMenuValidationDisplay(status.reason) : uiText('候选里没有该规则，可取消绑定', "Rule is absent from the choices; you can unbind it", "Правило отсутствует среди вариантов; привязку можно удалить"),
        }
      }),
    })
  }
  return groups
}

/**
 * 构造待保存草稿（编辑时沿用原 id，校验需要它判断自身子树）。
 * @author ddj 2026年10月30号
 * @param id 项 id
 * @param fields 表单字段
 * @returns 菜单项
 */
function buildDraft(
  id: string,
  fields: {
    type: QuickItemType
    name: string
    order: number
    parentId: string | null
    workspaces: string[] | null
    prompt: string
    skills: string[]
    rules: RuleBinding[]
    ruleMode: RuleInjectMode
    clickAction: ClickAction | 'inherit'
  },
): QuickMenuItem {
  const base = {
    id,
    name: fields.name,
    order: fields.order,
    parentId: fields.parentId,
    workspaces: fields.workspaces,
  }
  if (fields.type === 'group') return { ...base, type: 'group' } as QuickGroup
  const button: QuickButton = {
    ...base,
    type: 'button',
    prompt: fields.prompt,
    skills: fields.skills,
    rules: fields.rules,
    ruleMode: fields.ruleMode,
  }
  if (fields.clickAction !== 'inherit') button.clickAction = fields.clickAction
  return button
}

/**
 * 归属组候选（组自身与自身子树不能当父级，否则会成环）。
 * @author ddj 2026年10月30号
 * @param doc 文档
 * @param selfId 正在编辑的项 id
 * @returns 候选（顶层 + 可选组）
 */
function groupChoices(doc: QuickMenuDoc, selfId: string): Array<{ id: string; label: string }> {
  const banned = selfId === '' ? [] : descendantIds(doc, selfId)
  const out: Array<{ id: string; label: string }> = [{ id: '', label: uiText('顶层（root 组）', "Top level (root group)", "Верхний уровень (корневая группа)") }]
  for (const item of doc.items) {
    if (item.type !== 'group' || banned.includes(item.id)) continue
    out.push({ id: item.id, label: item.name + uiText('（第 ', " (level ", " (уровень ") + depthOf(doc, item.id) + uiText(' 层）', ")", ")") })
  }
  return out
}

/**
 * 规则候选（用户规则 + 当前工作区的项目规则）。
 * @author ddj 2026年10月30号
 * @param snapshot 规则快照
 * @param cwd 当前工作区
 * @returns 候选列表
 */
function ruleChoices(snapshot: RuleListSnapshot | null, cwd?: string): RuleChoice[] {
  if (!snapshot) return []
  const out: RuleChoice[] = []
  for (const info of snapshot.user) {
    const binding: RuleBinding = { scope: 'user', file: info.file }
    if (info.origin) binding.origin = info.origin
    out.push({ binding, label: info.file, hint: uiText('用户规则 · ', "User rule · ", "Правило пользователя · ") + (info.type === 'always' ? uiText('总是生效', "Always active", "Действует всегда") : info.type === 'auto' ? uiText('按 globs', "By globs", "По glob-шаблонам") : uiText('手动', "Manual", "Вручную")) })
  }
  const wanted = normalizePath(cwd ?? '')
  for (const project of snapshot.projects) {
    if (wanted !== '' && normalizePath(project.workspacePath) !== wanted) continue
    for (const info of project.rules) {
      out.push({
        binding: { scope: 'project', workspacePath: project.workspacePath, file: info.file },
        label: info.file,
        hint: uiText('项目规则 · ', "Project rule · ", "Правило проекта · ") + project.title,
      })
    }
  }
  return out
}

/** 分组区块的属性。 */
interface SectionProps {
  title: string
  hint?: string
  children?: React.ReactNode
}

/**
 * 表单里的分组区块（标题 + 说明 + 内容），把长表单切成可扫读的几段。
 * @author ddj 2026年10月30号
 * @param props 区块属性
 * @returns 区块元素
 */
function Section(props: SectionProps) {
  return React.createElement(
    'div',
    { className: 'edrv-qm-section' },
    React.createElement(
      'div',
      { className: 'edrv-qm-section-head' },
      React.createElement('span', { className: 'edrv-qm-section-title' }, props.title),
      props.hint ? React.createElement('span', { className: 'edrv-qm-section-hint' }, props.hint) : null,
    ),
    React.createElement('div', { className: 'edrv-qm-section-body' }, props.children),
  )
}

/** 新建项弹窗的 props。 */
export interface QuickItemDialogProps {
  host: QuickMenuHost
  /** 编辑已有项时传入（新建省略）。 */
  item?: QuickMenuItem
  /** 新建时的归属组（null = 顶层）。 */
  parentId: string | null
  onClose(): void
}

/**
 * 新增/编辑菜单项弹窗。
 * @author ddj 2026年10月30号
 * @param props host、待编辑项、父组、关闭回调
 * @returns 弹窗元素
 */
export function QuickItemDialog(props: QuickItemDialogProps) {
  const { host, item, parentId } = props
  const doc = host.store.getState().doc
  const editing = item
  const [type, setType] = React.useState<QuickItemType>(editing?.type ?? 'button')
  const [name, setName] = React.useState(editing?.name ?? '')
  const [order, setOrder] = React.useState(editing?.order ?? 100)
  const [parent, setParent] = React.useState<string | null>(editing?.parentId ?? parentId)
  const [workspaces, setWorkspaces] = React.useState<string[] | null>(editing?.workspaces ?? null)
  const [prompt, setPrompt] = React.useState(editing?.type === 'button' ? editing.prompt : '')
  const [skills, setSkills] = React.useState<string[]>(editing?.type === 'button' ? editing.skills.slice() : [])
  const [rules, setRules] = React.useState<RuleBinding[]>(editing?.type === 'button' ? editing.rules.slice() : [])
  const [ruleMode, setRuleMode] = React.useState<RuleInjectMode>(editing?.type === 'button' ? editing.ruleMode : 'reference')
  const [clickAction, setClickAction] = React.useState<ClickAction | 'inherit'>(editing?.type === 'button' ? editing.clickAction ?? 'inherit' : 'inherit')
  const [catalog, setCatalog] = React.useState<SkillCatalog | null>(null)
  const [snapshot, setSnapshot] = React.useState<RuleListSnapshot | null>(null)
  const [skillNames, setSkillNames] = React.useState<string[] | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    let alive = true
    const cwd = host.store.getContext().cwd
    void (async () => {
      const [loadedRules, loadedSkills, loadedCatalog] = await Promise.all([
        host.rules().catch(() => null),
        host.skills().catch(() => null),
        host.skillCatalog(cwd).catch(() => null),
      ])
      if (!alive) return
      setSnapshot(loadedRules)
      setSkillNames(loadedSkills)
      setCatalog(loadedCatalog)
    })()
    return () => { alive = false }
  }, [host])

  const before = host.store.getContext()
  const ctx: ValidateContext = { cwd: before.cwd, rules: snapshot ?? undefined, skillNames }
  const draftId = editing?.id ?? ''
  const draft = buildDraft(draftId === '' ? 'draft' : draftId, {
    type, name, order, parentId: parent, workspaces, prompt, skills, rules, ruleMode, clickAction,
  })
  const status = validateItem(draft, doc)
  const choices = ruleChoices(snapshot, before.cwd)
  const parentItem = parent === null ? null : doc.items.find((entry) => entry.id === parent)
  const inherited = parentItem ? inheritWorkspaces(doc, parentItem) : null
  const workspaceList = host.workspaces()
  const skillPick = skillGroups(catalog, skillNames, skills, ctx)
  const rulePick = ruleGroups(choices, rules, ctx)
  const ruleByKey = new Map(choices.map((choice) => [bindingKey(choice.binding), choice.binding]))

  /**
   * 切换技能绑定。
   * @author ddj 2026年10月30号
   * @param target 技能名
   */
  function toggleSkill(target: string): void {
    setSkills((current) => current.includes(target) ? current.filter((entry) => entry !== target) : current.concat(target))
  }

  /**
   * 切换规则绑定（键来自下拉，失效规则也能取消绑定）。
   * @author ddj 2026年10月30号
   * @param key bindingKey 结果
   */
  function toggleRuleKey(key: string): void {
    const binding = ruleByKey.get(key)
    setRules((current) => {
      if (current.some((entry) => bindingKey(entry) === key)) {
        return current.filter((entry) => bindingKey(entry) !== key)
      }
      return binding ? current.concat(binding) : current
    })
  }

  /**
   * 保存（新建或更新）；冲突/校验失败时留在弹窗内提示。
   * @author ddj 2026年10月30号
   */
  async function onSave(): Promise<void> {
    if (status.errors.length > 0) return
    setBusy(true)
    const finalItem = buildDraft(editing?.id ?? host.store.nextId(type), {
      type, name, order, parentId: parent, workspaces, prompt, skills, rules, ruleMode, clickAction,
    })
    const result = editing ? await host.store.updateItem(finalItem) : await host.store.createItem(finalItem)
    setBusy(false)
    if (!result.ok) {
      setError(result.error ?? uiText('保存失败', "Save failed", "Ошибка сохранения"))
      return
    }
    props.onClose()
  }

  /**
   * 删除该项及其子项。
   * @author ddj 2026年10月30号
   */
  async function onDelete(): Promise<void> {
    if (!editing) return
    const suffix = editing.type === 'group' ? uiText('及其全部子项', " and all its children", " и все дочерние элементы") : ''
    if (!window.confirm(uiText('确认删除「', "Delete “", "Удалить «") + editing.name + uiText('」', "”", "»") + suffix + uiText('？', "?", "?"))) return
    setBusy(true)
    const result = await host.store.removeItem(editing.id)
    setBusy(false)
    if (!result.ok) {
      setError(result.error ?? uiText('删除失败', "Delete failed", "Ошибка удаления"))
      return
    }
    props.onClose()
  }

  /**
   * 类型与名称。
   * @author ddj 2026年10月30号
   * @returns 表单行
   */
  function basicRow(): React.ReactNode {
    return React.createElement('div', { className: 'edrv-qm-row2' },
      React.createElement('div', { className: 'edrv-qm-field edrv-qm-field--narrow' },
        React.createElement('span', { className: 'edrv-qm-field-label' }, uiText('类型', "Type", "Тип")),
        React.createElement(PickSeg, {
          options: TYPE_OPTIONS,
          value: type,
          label: uiText('菜单项类型', "Menu item type", "Тип элемента меню"),
          onChange: (next) => setType(next as QuickItemType),
        })),
      React.createElement('label', { className: 'edrv-qm-field' },
        React.createElement('span', { className: 'edrv-qm-field-label' }, uiText('名称', "Name", "Название")),
        React.createElement('input', {
          className: 'edrv-qm-input', value: name, maxLength: QUICK_MENU_NAME_CAP,
          placeholder: type === 'group' ? uiText('例如：代码审查', "e.g. Code review", "например: Проверка кода") : uiText('例如：审查当前改动', "e.g. Review current changes", "например: Проверить текущие изменения"),
          onChange: (event) => setName(event.target.value),
        })))
  }

  /**
   * 归属组与同级优先级。
   * @author ddj 2026年10月30号
   * @returns 表单行
   */
  function placeRow(): React.ReactNode {
    return React.createElement('div', { className: 'edrv-qm-row2' },
      React.createElement('label', { className: 'edrv-qm-field' },
        React.createElement('span', { className: 'edrv-qm-field-label' }, uiText('归属组', "Parent group", "Родительская группа")),
        React.createElement('select', {
          className: 'edrv-qm-select', value: parent ?? '',
          onChange: (event: React.ChangeEvent<HTMLSelectElement>) => setParent(event.target.value === '' ? null : event.target.value),
        }, groupChoices(doc, draftId).map((choice) => React.createElement('option', { key: choice.id, value: choice.id }, choice.label)))),
      React.createElement('div', { className: 'edrv-qm-field' },
        React.createElement('span', { className: 'edrv-qm-field-label' }, uiText('同级优先级（越小越靠前）', "Sibling priority (lower comes first)", "Приоритет на уровне (меньше — выше)")),
        React.createElement('div', { className: 'edrv-qm-inline' },
          React.createElement('input', {
            className: 'edrv-qm-input edrv-qm-input--order', type: 'number', min: 0, max: QUICK_MENU_ORDER_CAP, value: order,
            onChange: (event) => setOrder(Number(event.target.value) || 0),
          }),
          React.createElement('button', { type: 'button', className: 'edrv-qm-btn edrv-qm-btn--sm', onClick: () => setOrder((value) => Math.max(0, value - 10)) }, uiText('上移', "Move up", "Выше")),
          React.createElement('button', { type: 'button', className: 'edrv-qm-btn edrv-qm-btn--sm', onClick: () => setOrder((value) => Math.min(QUICK_MENU_ORDER_CAP, value + 10)) }, uiText('下移', "Move down", "Ниже")))))
  }

  /**
   * 限定工作区（继承上级组时只读）。
   * @author ddj 2026年10月30号
   * @returns 表单行
   */
  function workspaceField(): React.ReactNode {
    return React.createElement('div', { className: 'edrv-qm-field' },
      React.createElement('div', { className: 'edrv-qm-field-head' },
        React.createElement('span', { className: 'edrv-qm-field-label' }, uiText('限定工作区', "Workspace scope", "Область рабочих пространств")),
        React.createElement('span', { className: 'edrv-qm-field-hint' }, inherited
          ? uiText('遵循上级组：', "Inherited from parent: ", "От родительской группы: ") + inherited.join(uiText('、', ", ", ", ")) + uiText('（此项不可编辑）', " (read-only)", " (только чтение)")
          : uiText('默认全部工作区可见，可切到当前工作区或展开更多', "Visible in all workspaces by default; select the current workspace or expand for more", "По умолчанию видно во всех пространствах; выберите текущее или откройте остальные"))),
      React.createElement(PickWorkspace, {
        buttonId: 'edrv-qm-pick-workspaces',
        workspaces: workspaceList,
        selected: inherited ?? workspaces,
        cwd: before.cwd,
        inherited: inherited !== null,
        inheritedHint: uiText('遵循上级组，此项不可编辑', "Inherited from parent group; read-only", "Унаследовано от родительской группы; только чтение"),
        onChange: (next) => setWorkspaces(next),
      }))
  }

  /**
   * 提示词输入。
   * @author ddj 2026年10月30号
   * @returns 表单行
   */
  function promptField(): React.ReactNode {
    return React.createElement('div', { className: 'edrv-qm-field' },
      React.createElement('div', { className: 'edrv-qm-field-head' },
        React.createElement('span', { className: 'edrv-qm-field-label' }, uiText('预填提示词', "Prefilled prompt", "Готовый запрос")),
        React.createElement('span', { className: 'edrv-qm-field-hint' }, uiText('占位符：{{workspace}} {{selection}} {{date}} {{rules}} {{skills}}', "Placeholders: {{workspace}} {{selection}} {{date}} {{rules}} {{skills}}", "Подстановки: {{workspace}} {{selection}} {{date}} {{rules}} {{skills}}"))),
      React.createElement('textarea', {
        className: 'edrv-qm-textarea', value: prompt, maxLength: QUICK_MENU_PROMPT_CAP,
        placeholder: uiText('点击后发送给 AI 的内容…', "Content sent to AI when clicked…", "Текст для ИИ при нажатии…"),
        onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => setPrompt(event.target.value),
      }))
  }

  /**
   * 绑定技能（多选下拉，候选来自全局与工作区技能目录）。
   * @author ddj 2026年10月30号
   * @returns 表单行
   */
  function skillField(): React.ReactNode {
    return React.createElement('div', { className: 'edrv-qm-field' },
      React.createElement('div', { className: 'edrv-qm-field-head' },
        React.createElement('span', { className: 'edrv-qm-field-label' }, uiText('绑定技能', "Skill bindings", "Привязки навыков")),
        React.createElement('span', { className: 'edrv-qm-field-hint' }, uiText('发送时写成 /技能名；黄点=当前会话不可见', "Sent as /skill-name; yellow dot = unavailable in this session", "Отправляется как /имя-навыка; жёлтая точка = недоступно в текущем сеансе"))),
      React.createElement(PickMulti, {
        buttonId: 'edrv-qm-pick-skills',
        groups: skillPick,
        selected: skills,
        unit: uiText('个技能', " skills", " навыков"),
        emptyText: uiText('没有可选技能（全局技能目录与当前工作区 .dsh/skills 均为空）', "No skills available (global skills and workspace .dsh/skills are both empty)", "Нет доступных навыков (глобальный каталог и .dsh/skills рабочего пространства пусты)"),
        onToggle: toggleSkill,
      }))
  }

  /**
   * 绑定规则（多选下拉 + 引用/内联切换）。
   * @author ddj 2026年10月30号
   * @returns 表单行
   */
  function ruleField(): React.ReactNode {
    return React.createElement('div', { className: 'edrv-qm-field' },
      React.createElement('div', { className: 'edrv-qm-field-head' },
        React.createElement('span', { className: 'edrv-qm-field-label' }, uiText('绑定规则', "Rule bindings", "Привязки правил")),
        React.createElement(PickSeg, {
          options: MODE_OPTIONS,
          value: ruleMode,
          label: uiText('规则注入方式', "Rule injection mode", "Способ добавления правил"),
          onChange: (next) => setRuleMode(next as RuleInjectMode),
        })),
      React.createElement(PickMulti, {
        buttonId: 'edrv-qm-pick-rules',
        groups: rulePick,
        selected: rules.map((binding) => bindingKey(binding)),
        unit: uiText('条规则', " rules", " правил"),
        emptyText: uiText('没有可选规则（可在规则面板新建 .mdc 规则）', "No rules available (create .mdc rules in the rules panel)", "Нет доступных правил (создайте правила .mdc в панели правил)"),
        onToggle: toggleRuleKey,
      }))
  }

  /**
   * 点击动作（跟随全局 / 直接发送 / 只填入）。
   * @author ddj 2026年10月30号
   * @returns 表单行
   */
  function clickField(): React.ReactNode {
    return React.createElement('label', { className: 'edrv-qm-field' },
      React.createElement('span', { className: 'edrv-qm-field-label' }, uiText('点击动作', "Click action", "Действие при нажатии")),
      React.createElement('select', {
        className: 'edrv-qm-select', value: clickAction,
        onChange: (event: React.ChangeEvent<HTMLSelectElement>) => setClickAction(event.target.value as ClickAction | 'inherit'),
      },
        React.createElement('option', { value: 'inherit' }, uiText('跟随全局', "Use global setting", "Общая настройка")),
        React.createElement('option', { value: 'send' }, uiText('直接发送', "Send directly", "Отправить сразу")),
        React.createElement('option', { value: 'fill' }, uiText('只填入输入框', "Fill input only", "Только заполнить поле"))))
  }

  // 标题从滚动区里提出来做成固定头：长表单往下滚时仍知道自己在编辑什么
  const parentName = parent === null ? null : (doc.items.find((entry) => entry.id === parent)?.name ?? null)
  const typeLabel = type === 'group' ? uiText('组', "Group", "Группа") : uiText('按钮', "Button", "Кнопка")
  const headTitle = editing ? uiText('编辑「', "Edit “", "Изменить «") + editing.name + uiText('」', "”", "»") : parent === null ? uiText('新建顶层项', "New top-level item", "Новый элемент верхнего уровня") : uiText('新建子项', "New child item", "Новый дочерний элемент")
  const headSub = (editing ? (editing.type === 'group' ? uiText('组', "Group", "Группа") : uiText('按钮', "Button", "Кнопка")) : typeLabel)
    + (parentName ? uiText(' · 位于「', " · In “", " · В «") + parentName + uiText('」', "”", "»") : uiText(' · 位于顶层', " · At top level", " · На верхнем уровне"))

  const header = React.createElement('div', { className: 'edrv-qm-head' },
    React.createElement('div', { className: 'edrv-qm-head-title' }, headTitle),
    React.createElement('div', { className: 'edrv-qm-head-sub' }, headSub))

  const body = React.createElement('div', { className: 'edrv-qm-dialog-body' },
    React.createElement(Section, { title: uiText('基本信息', "Basic information", "Основные сведения") }, basicRow(), placeRow(), workspaceField()),
    type === 'button' ? React.createElement(Section, { title: uiText('提示词', "Prompt", "Запрос"), hint: uiText('点击后发给 AI 的内容', "Content sent to AI when clicked", "Текст для ИИ при нажатии") }, promptField()) : null,
    type === 'button' ? React.createElement(Section, { title: uiText('绑定', "Bindings", "Привязки") }, skillField(), ruleField()) : null,
    type === 'button' ? React.createElement(Section, { title: uiText('行为', "Behavior", "Поведение") }, clickField()) : null,
    error !== '' ? React.createElement('div', { className: 'edrv-qm-error-list' }, error) : null,
    status.errors.length > 0 ? React.createElement('ul', { className: 'edrv-qm-error-list' }, status.errors.map((text) => React.createElement('li', { key: text }, quickMenuValidationDisplay(text)))) : null,
    status.warnings.length > 0 ? React.createElement('ul', { className: 'edrv-qm-warn-list' }, status.warnings.map((text) => React.createElement('li', { key: text }, quickMenuValidationDisplay(text)))) : null,
  )

  const actions = React.createElement('div', { className: 'edrv-qm-actions' },
    editing ? React.createElement('button', { type: 'button', className: 'edrv-qm-btn edrv-qm-btn--danger', disabled: busy, onClick: () => { void onDelete() } }, uiText('删除', "Delete", "Удалить")) : null,
    React.createElement('span', { className: 'edrv-qm-actions-grow' }),
    React.createElement('button', { type: 'button', className: 'edrv-qm-btn', onClick: props.onClose }, uiText('取消', "Cancel", "Отмена")),
    React.createElement('button', {
      type: 'button', className: 'edrv-qm-btn edrv-qm-btn--primary', disabled: busy || status.errors.length > 0,
      onClick: () => { void onSave() },
    }, busy ? uiText('保存中…', "Saving…", "Сохранение…") : editing ? uiText('保存', "Save", "Сохранить") : uiText('创建', "Create", "Создать")))

  return React.createElement(ModalShell, {
    dialogClass: 'edrv-qm-dialog', zIndex: 220,
    onClose: props.onClose, closeOnMask: false,
  }, header, body, actions)
}

/** 全局设置弹窗 props。 */
export interface MenuGlobalDialogProps {
  host: QuickMenuHost
  onClose(): void
}

/**
 * 菜单全局设置（显隐、点击动作、最大嵌套层数、位置重置、导入导出、失效绑定清理）。
 * @author ddj 2026年10月30号
 * @param props host 与关闭回调
 * @returns 弹窗元素
 */
export function MenuGlobalDialog(props: MenuGlobalDialogProps) {
  const { host } = props
  const doc = host.store.getState().doc
  const [enabled, setEnabled] = React.useState(doc.enabled)
  const [clickAction, setClickAction] = React.useState<ClickAction>(doc.clickAction)
  const [maxDepth, setMaxDepth] = React.useState(doc.maxDepth || QUICK_MENU_DEFAULT_DEPTH)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const ctx = host.store.getContext()
  const broken = collectBroken(doc, ctx)
  const fileRef = React.useRef<HTMLInputElement>(null)

  /**
   * 保存全局设置。
   * @author ddj 2026年10月30号
   */
  async function onSave(): Promise<void> {
    setBusy(true)
    const result = await host.store.save({ ...doc, enabled, clickAction, maxDepth })
    setBusy(false)
    if (!result.ok) {
      setError(result.error ?? uiText('保存失败', "Save failed", "Ошибка сохранения"))
      return
    }
    props.onClose()
  }

  /**
   * 清理全部失效绑定（移除失效规则/技能，保留提示词）。
   * @author ddj 2026年10月30号
   */
  async function onClean(): Promise<void> {
    setBusy(true)
    const items = doc.items.map((item) => {
      if (item.type !== 'button') return item
      const rules = item.rules.filter((binding) => validateRule(binding, ctx).state === 'ok')
      const skills = item.skills.filter((name) => validateSkill(name, ctx).state === 'ok')
      return { ...item, rules, skills }
    })
    const result = await host.store.save({ ...doc, enabled, clickAction, maxDepth, items })
    setBusy(false)
    if (!result.ok) setError(result.error ?? uiText('清理失败', "Cleanup failed", "Ошибка очистки"))
    else host.notify(uiText('已清理失效绑定', "Invalid bindings removed", "Недействительные привязки удалены"))
  }

  /**
   * 配置备份与迁移（导出 / 导入 / 重置按钮位置）。
   * @author ddj 2026年10月30号
   * @returns 按钮行
   */
  function backupRow(): React.ReactNode {
    // 导入用真按钮触发隐藏的 file input：label 会被弹窗样式（display:flex + margin）改盒模型，导致与相邻按钮错位
    return React.createElement('div', { className: 'edrv-qm-btn-row' },
      React.createElement('input', {
        ref: fileRef, type: 'file', accept: 'application/json', style: { display: 'none' },
        onChange: (event) => { void onImport(event, host, setError) },
      }),
      React.createElement('button', { type: 'button', className: 'edrv-qm-btn', onClick: () => downloadDoc(doc) }, uiText('导出 JSON', "Export JSON", "Экспорт JSON")),
      React.createElement('button', {
        type: 'button', className: 'edrv-qm-btn',
        onClick: () => fileRef.current?.click(),
      }, uiText('导入 JSON', "Import JSON", "Импорт JSON")),
      React.createElement('button', {
        type: 'button', className: 'edrv-qm-btn',
        onClick: () => { host.store.patchLauncher(null, null); void host.store.flushLauncher(); host.notify(uiText('已重置悬浮按钮位置', "Floating button position reset", "Положение плавающей кнопки сброшено")) },
      }, uiText('重置按钮位置', "Reset button position", "Сбросить положение кнопки")))
  }

  const header = React.createElement('div', { className: 'edrv-qm-head' },
    React.createElement('div', { className: 'edrv-qm-head-title' }, uiText('菜单设置', "Menu settings", "Настройки меню")),
    React.createElement('div', { className: 'edrv-qm-head-sub' }, uiText('悬浮按钮、交互行为与配置迁移', "Floating button, interaction, and configuration migration", "Плавающая кнопка, взаимодействие и перенос настроек")))

  const body = React.createElement('div', { className: 'edrv-qm-dialog-body' },
    React.createElement(Section, { title: uiText('外观', "Appearance", "Внешний вид") },
      React.createElement(PickSwitch, {
        buttonId: 'edrv-qm-switch-enabled',
        label: uiText('显示悬浮按钮', "Show floating button", "Показывать плавающую кнопку"),
        hint: uiText('关闭后左侧不再显示快捷菜单按钮，配置会保留', "Hide the left quick menu button while keeping its configuration", "Скрыть кнопку быстрого меню слева, сохранив настройки"),
        checked: enabled,
        onChange: setEnabled,
      })),
    React.createElement(Section, { title: uiText('交互', "Interaction", "Взаимодействие") },
      React.createElement('label', { className: 'edrv-qm-field' },
        React.createElement('span', { className: 'edrv-qm-field-label' }, uiText('点击默认动作', "Default click action", "Действие по умолчанию")),
        React.createElement('select', {
          className: 'edrv-qm-select', value: clickAction,
          onChange: (event: React.ChangeEvent<HTMLSelectElement>) => setClickAction(event.target.value as ClickAction),
        },
          React.createElement('option', { value: 'send' }, uiText('直接发送给 AI', "Send directly to AI", "Сразу отправить ИИ")),
          React.createElement('option', { value: 'fill' }, uiText('只填入输入框', "Fill input only", "Только заполнить поле")))),
      React.createElement('div', { className: 'edrv-qm-field' },
        React.createElement('div', { className: 'edrv-qm-field-head' },
          React.createElement('span', { className: 'edrv-qm-field-label' }, uiText('最大嵌套层数', "Maximum nesting depth", "Максимальная глубина вложенности")),
          React.createElement('span', { className: 'edrv-qm-field-hint' }, uiText('root 列里的项是第 1 层；调小不删除已有深层项，只禁止继续新增', "Items in the root column are level 1. Reducing the limit keeps existing deeper items but prevents new ones.", "Элементы корневого столбца — уровень 1. Уменьшение лимита сохраняет глубокие элементы, но запрещает добавление новых."))),
        React.createElement(PickSeg, {
          options: DEPTH_OPTIONS,
          value: String(maxDepth),
          label: uiText('最大嵌套层数', "Maximum nesting depth", "Максимальная глубина вложенности"),
          onChange: (next) => setMaxDepth(Number(next) || QUICK_MENU_DEFAULT_DEPTH),
        }))),
    React.createElement(Section, { title: uiText('配置备份与迁移', "Configuration backup and migration", "Резервное копирование и перенос настроек") }, backupRow()),
    React.createElement(Section, {
      title: uiText('绑定状态', "Binding status", "Состояние привязок"),
      hint: broken.length === 0 ? uiText('全部可用', "All available", "Все доступны") : String(broken.length) + uiText(' 项失效', " invalid items", " недействительных элементов"),
    },
      broken.length > 0 ? React.createElement('ul', { className: 'edrv-qm-error-list' },
        broken.map((entry) => React.createElement('li', { key: entry.key }, entry.label))) : null,
      broken.length > 0 ? React.createElement('div', { className: 'edrv-qm-btn-row' },
        React.createElement('button', { type: 'button', className: 'edrv-qm-btn', disabled: busy, onClick: () => { void onClean() } }, uiText('清理失效绑定', "Remove invalid bindings", "Удалить недействительные привязки"))) : null),
    error !== '' ? React.createElement('div', { className: 'edrv-qm-error-list' }, error) : null,
    React.createElement('div', { className: 'edrv-qm-field-hint' }, uiText('左侧按钮 / 菜单项', "Left button / menu items", "Кнопка слева / элементы меню")
      + (host.store.isMounted() ? uiText('（当前界面已挂载）', " (mounted in the current interface)", " (добавлено в текущий интерфейс)") : uiText('（当前 DSH 未提供浮层槽，按钮不显示）', " (this DSH provides no overlay slot; button is hidden)", " (эта версия DSH не предоставляет слот оверлея; кнопка скрыта)"))),
  )

  return React.createElement(ModalShell, {
    dialogClass: 'edrv-qm-dialog', zIndex: 220, onClose: props.onClose, closeOnMask: false,
  }, header, body,
  React.createElement('div', { className: 'edrv-qm-actions' },
    React.createElement('span', { className: 'edrv-qm-actions-grow' }),
    React.createElement('button', { type: 'button', className: 'edrv-qm-btn', onClick: props.onClose }, uiText('取消', "Cancel", "Отмена")),
    React.createElement('button', { type: 'button', className: 'edrv-qm-btn edrv-qm-btn--primary', disabled: busy, onClick: () => { void onSave() } }, busy ? uiText('保存中…', "Saving…", "Сохранение…") : uiText('保存', "Save", "Сохранить"))))
}

/**
 * 收集全菜单的失效绑定（设置弹窗顶部汇总）。
 * @author ddj 2026年10月30号
 * @param doc 文档
 * @param ctx 校验上下文
 * @returns 失效条目文案
 */
function collectBroken(doc: QuickMenuDoc, ctx: ValidateContext): Array<{ key: string; label: string }> {
  const out: Array<{ key: string; label: string }> = []
  for (const item of doc.items) {
    if (item.type !== 'button') continue
    const status = itemStatus(item, ctx)
    status.errors.concat(status.warnings).forEach((reason, index) => {
      out.push({ key: item.id + ':' + index, label: item.name + ' → ' + quickMenuValidationDisplay(reason) })
    })
  }
  return out
}

/**
 * 下载当前文档为 JSON（浏览器侧 Blob，不经 host）。
 * @author ddj 2026年10月30号
 * @param doc 文档
 */
function downloadDoc(doc: QuickMenuDoc): void {
  const blob = new Blob([serializeDoc(doc)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'quick-menu.json'
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/**
 * 导入 JSON（解析失败/校验不通过时给错误文案）。
 * @author ddj 2026年10月30号
 * @param event 文件输入事件
 * @param host 宿主
 * @param setError 错误回写
 */
async function onImport(event: React.ChangeEvent<HTMLInputElement>, host: QuickMenuHost, setError: (text: string) => void): Promise<void> {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  let text = ''
  try {
    text = await file.text()
  } catch (error) {
    setError(uiText('读取文件失败：', "Failed to read file: ", "Ошибка чтения файла: ") + String(error))
    return
  }
  const parsed = parseDoc(text)
  if (parsed.warning) {
    setError(parsed.warning)
    return
  }
  const result = await host.store.save(parsed.doc)
  if (!result.ok) setError(result.error ?? uiText('导入失败', "Import failed", "Ошибка импорта"))
  else host.notify(uiText('已导入快捷菜单配置', "Quick menu configuration imported", "Настройки быстрого меню импортированы"))
}
