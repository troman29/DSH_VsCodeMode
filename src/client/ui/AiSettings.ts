// @ts-nocheck
/**
 * dsh-vscode-mode client — AI 补全设置卡片。
 * 开关 + 模型下拉（edrv.ai.models 目录，按 provider 分组，默认「自动」）+
 * 思考强度下拉（随所选模型的 efforts 元数据动态渲染：无档位隐藏；含「跟随默认」）。
 * 保存走 edrv.ai.configUpdate；保存后广播 edrv:ai-config 事件让 provider 即时生效。
 * 第二组「AI 任务模型」：非补全 AI 调用（AI 智能整理等）专用路由，独立于补全模型；
 * 留空 = 跟随补全模型配置（向后兼容）。
 * 作者 ddj
 */
import { uiText } from '../uiLocale.js'
import React from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { SettingNotice } from './SettingsUi.js'
import { rpc } from '../rpc.js'
import { setAiInlineEnabled } from '../ai/inlineProvider.js'
import { isDelistedModel } from '../../shared/ai.js'

/**
 * AI 补全设置卡片（设置页「AI 补全」Tab 主体）。
 * @author ddj
 */
export function AiSettings() {
  const [cfg, setCfg] = React.useState(null)
  const [dir, setDir] = React.useState(null)
  const [note, setNote] = React.useState('')
  const [error, setError] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    Promise.all([rpc('edrv.ai.configGet', {}), rpc('edrv.ai.models', {})])
      .then(([c, d]) => {
        if (c.ok) {
          setCfg({
            enabled: c.enabled, provider: c.provider, model: c.model, effort: c.effort,
            taskProvider: c.taskProvider || '', taskModel: c.taskModel || '', taskEffort: c.taskEffort || '',
          })
        } else setError(c.error || uiText('配置读取失败', "Failed to read configuration", "Не удалось прочитать конфигурацию"))
        if (d.ok) setDir(d)
        else setError(d.error || uiText('模型目录读取失败', "Failed to read model catalog", "Не удалось прочитать каталог моделей"))
      })
      .catch((e) => setError(String(e)))
  }, [])

  /** 所选 provider 下的模型条目（自动路由时取首组供档位参考）。 */
  const modelsOf = (provider) => {
    if (!dir?.providers?.length) return []
    if (!provider) return dir.providers[0]?.models ?? []
    return dir.providers.find((p) => p.id === provider)?.models ?? []
  }

  /** 档位可选项（补全/任务两组选择器共用）：模型无 reasoning 元数据 → 空数组（隐藏）。 */
  const effortsOf = (provider, model) => {
    const models = modelsOf(provider)
    return models.find((m) => m.model === model)?.efforts ?? models[0]?.efforts ?? []
  }

  const save = async (patch) => {
    setBusy(true)
    setError('')
    try {
      const res = await rpc('edrv.ai.configUpdate', patch)
      if (!res.ok) throw new Error(res.error || uiText('保存失败', "Save failed", "Ошибка сохранения"))
      setCfg({
        enabled: res.enabled, provider: res.provider, model: res.model, effort: res.effort,
        taskProvider: res.taskProvider || '', taskModel: res.taskModel || '', taskEffort: res.taskEffort || '',
      })
      setAiInlineEnabled(res.enabled)
      setNote(uiText('已保存', "Saved", "Сохранено"))
      window.dispatchEvent(new CustomEvent('edrv:ai-config', { detail: { enabled: res.enabled } }))
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  const toggle = () => save({ enabled: !cfg.enabled })

  /** 下拉值 `provider/model` → 换模型 patch（档位不属新模型时一并清空；补全/任务两组共用）。 */
  const patchOfModel = (value, keys) => {
    if (!value) return { [keys.provider]: '', [keys.model]: '' }
    const idx = value.indexOf('/')
    const provider = value.slice(0, idx)
    const model = value.slice(idx + 1)
    const efforts = modelsOf(provider).find((m) => m.model === model)?.efforts ?? []
    const keep = efforts.some((e) => e.id === cfg[keys.effort])
    return keep ? { [keys.provider]: provider, [keys.model]: model } : { [keys.provider]: provider, [keys.model]: model, [keys.effort]: '' }
  }

  const pickModel = (value) => save(patchOfModel(value, { provider: 'provider', model: 'model', effort: 'effort' }))
  const pickTaskModel = (value) => save(patchOfModel(value, { provider: 'taskProvider', model: 'taskModel', effort: 'taskEffort' }))

  if (!cfg) return React.createElement('div', { className: 'vsm-mcp-empty' }, error || uiText('正在读取 AI 补全配置…', "Reading AI completion configuration…", "Чтение настроек AI-дополнения…"))

  const modelValue = cfg.provider && cfg.model ? cfg.provider + '/' + cfg.model : ''
  const taskModelValue = cfg.taskProvider && cfg.taskModel ? cfg.taskProvider + '/' + cfg.taskModel : ''
  const efforts = effortsOf(cfg.provider, cfg.model)
  const taskEfforts = effortsOf(cfg.taskProvider, cfg.taskModel)
  // G7：配置指向已从官方默认列表下架的模型（DSH 0.1.6-alpha.2 移除 V4 Flash 系列）。
  // 仅提示，不擅自改写用户已保存的配置（避免覆盖其意图）；清空即回到自动路由。
  const delisted = isDelistedModel(cfg.model)
  const taskDelisted = isDelistedModel(cfg.taskModel)
  return React.createElement('section', { className: 'vsm-ai-settings' },
    React.createElement('h3', null, uiText('AI 自动补全（实验）', "AI completion (experimental)", "AI-дополнение (экспериментальное)")),
    React.createElement('p', { className: 'vsm-lsp-note' }, uiText('编辑停顿后由模型生成内联建议（ghost text），Tab 接受，Alt+\\ 手动触发。每次补全是一次模型调用；建议选择非推理模型，且思考强度选「跟随默认」或最低档以获得更快响应。', "The model generates inline suggestions after you pause editing. Tab accepts, Alt+\\ triggers manually. Each completion calls the model. For faster responses, use a non-reasoning model and default or minimum reasoning effort.", "Модель предлагает текст после паузы в редактировании. Tab принимает, Alt+\\ вызывает вручную. Каждое дополнение вызывает модель. Для быстрого ответа выберите модель без рассуждений и стандартный или минимальный уровень.")),
    (delisted
      ? React.createElement('div', { className: 'vsm-mcp-error vsm-mcp-banner' },
          uiText('当前模型「', "Current model “", "Текущая модель «") + cfg.model + uiText('」已从 DSH 默认模型列表移除（0.1.6-alpha.2 起）。该模型可能不再可用；将「模型」改回「自动」即可使用第一个可用模型（现有配置不会被自动改动）。', "” was removed from DSH’s default model list in 0.1.6-alpha.2 and may be unavailable. Set Model to Auto to use the first available model. Existing settings are not changed automatically.", "» удалена из стандартного списка DSH в 0.1.6-alpha.2 и может быть недоступна. Выберите автоматический режим для первой доступной модели. Сохранённые настройки автоматически не меняются."))
      : null),
    React.createElement('div', { className: 'vsm-lsp-row' },
      React.createElement(Button, { variant: cfg.enabled ? 'primary' : 'outline', size: 'sm', 'aria-pressed': cfg.enabled, disabled: busy, onClick: toggle },
        cfg.enabled ? uiText('已开启（点击关闭）', "Enabled (click to disable)", "Включено (нажмите для выключения)") : uiText('已关闭（点击开启）', "Disabled (click to enable)", "Выключено (нажмите для включения)")),
    ),
    React.createElement('div', { className: 'vsm-lsp-row' },
      React.createElement('label', null, uiText('模型', "Model", "Модель"),
        React.createElement('select', { value: modelValue, disabled: busy || !dir?.providers?.length, onChange: (e) => pickModel(e.target.value) },
          React.createElement('option', { value: '' }, dir?.providers?.length ? uiText('自动（取第一个可用模型）', "Auto (first available model)", "Автоматически (первая доступная модель)") : uiText('无可用模型', "No models available", "Нет доступных моделей")),
          (dir?.providers ?? []).flatMap((p) => p.models.map((m) => React.createElement('option', { key: p.id + '/' + m.model, value: p.id + '/' + m.model }, p.name + ' · ' + m.name)))),
      ),
      efforts.length ? React.createElement('label', null, uiText('思考强度', "Reasoning effort", "Уровень рассуждения"),
        React.createElement('select', { value: cfg.effort, disabled: busy, onChange: (e) => save({ effort: e.target.value }) },
          React.createElement('option', { value: '' }, uiText('跟随默认', "Use default", "По умолчанию")),
          efforts.map((e) => React.createElement('option', { key: e.id, value: e.id }, e.name))),
      ) : null,
    ),
    React.createElement('h3', null, uiText('AI 任务模型', "AI task model", "Модель AI-задач")),
    React.createElement('p', { className: 'vsm-lsp-note' }, uiText('独立于补全模型：整理分析可选推理模型 + 较高思考强度，补全仍可选快模型。留空 = 跟随补全模型配置。', "Independent of completion: use a reasoning model with higher effort for analysis and a fast model for completion. Leave blank to use completion settings.", "Независимо от дополнения: для анализа можно выбрать рассуждающую модель с высоким уровнем, для дополнения — быструю. Пустое значение использует настройки дополнения.")),
    (taskDelisted
      ? React.createElement('div', { className: 'vsm-mcp-error vsm-mcp-banner' },
          uiText('任务模型「', "Task model “", "Модель задач «") + cfg.taskModel + uiText('」已从 DSH 默认模型列表移除（0.1.6-alpha.2 起）。该模型可能不再可用；将「模型」改回「自动」即可跟随补全配置（现有配置不会被自动改动）。', "” was removed from DSH’s default model list in 0.1.6-alpha.2 and may be unavailable. Set Model to Auto to use completion settings. Existing settings are not changed automatically.", "» удалена из стандартного списка DSH в 0.1.6-alpha.2 и может быть недоступна. Выберите автоматический режим для настроек дополнения. Сохранённые настройки автоматически не меняются."))
      : null),
    React.createElement('div', { className: 'vsm-lsp-row' },
      React.createElement('label', null, uiText('模型', "Model", "Модель"),
        React.createElement('select', { value: taskModelValue, disabled: busy || !dir?.providers?.length, onChange: (e) => pickTaskModel(e.target.value) },
          React.createElement('option', { value: '' }, uiText('自动（跟随补全配置）', "Auto (use completion settings)", "Автоматически (настройки дополнения)")),
          (dir?.providers ?? []).flatMap((p) => p.models.map((m) => React.createElement('option', { key: p.id + '/' + m.model, value: p.id + '/' + m.model }, p.name + ' · ' + m.name)))),
      ),
      taskEfforts.length ? React.createElement('label', null, uiText('思考强度', "Reasoning effort", "Уровень рассуждения"),
        React.createElement('select', { value: cfg.taskEffort, disabled: busy, onChange: (e) => save({ taskEffort: e.target.value }) },
          React.createElement('option', { value: '' }, uiText('跟随默认', "Use default", "По умолчанию")),
          taskEfforts.map((e) => React.createElement('option', { key: e.id, value: e.id }, e.name))),
      ) : null,
    ),
    React.createElement(SettingNotice, { message: note }),
    React.createElement(SettingNotice, { message: error, error: true }),
  )
}
