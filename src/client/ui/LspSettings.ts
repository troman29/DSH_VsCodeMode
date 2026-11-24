// @ts-nocheck
/**
 * dsh-vscode-mode client — 「语言服务器」设置子 Tab。
 * 四视图：服务器（状态 + 每语言启用/命令/路径）｜已安装（卸载/更新）｜市场（Open VSX 搜索/安装 + 本地 vsix）｜更新。
 * 状态经 edrv.lsp.detect（检测结果驱动卡片动态显示），配置经 edrv.lsp.configGet/Update，扩展经 edrv.lsp.ext.*。
 * 作者 ddj 2026-08-27 / 2026-09-03
 */
import React from 'react'
import { uiText } from '../uiLocale.js'
import { rpc } from '../rpc.js'
import '../styles/mcp.css'

/** 支持语言的展示元数据（卡片显示由检测结果驱动；未知 id 走 langMeta 兜底）。 */
const LANG_META = {
  lua: { label: uiText('Lua（EmmyLua / LuaLS）', "Lua (EmmyLua / LuaLS)", "Lua (EmmyLua / LuaLS)"), get hint() { return uiText('优先使用已安装 EmmyLua；未安装时回退 LuaLS 或 PATH 中的 lua-language-server', "Prefer installed EmmyLua; otherwise use LuaLS or lua-language-server from PATH", "Приоритет у установленного EmmyLua; иначе LuaLS или lua-language-server из PATH") } },
  csharp: { label: uiText('C#（Roslyn / DotRush / OmniSharp）', "C# (Roslyn / DotRush / OmniSharp)", "C# (Roslyn / DotRush / OmniSharp)"), get hint() { return uiText('优先自动发现 ms-dotnettools.csharp / DotRush 扩展（DotRush 需 .NET 10 运行时）；也可手动指定', "Prefer auto-detected ms-dotnettools.csharp / DotRush extensions (DotRush requires .NET 10); manual configuration is also supported", "Приоритет у обнаруженных ms-dotnettools.csharp / DotRush (DotRush требует .NET 10); доступна ручная настройка") } },
}

/** 语言展示元数据（含未知 id 兜底）。 */
function langMeta(id) {
  return LANG_META[id] || { label: id + uiText('（语言服务器）', " (language server)", " (языковой сервер)"), hint: '' }
}

/** 该语言是否已存配置（禁用开关或手动命令/路径）。 */
function hasStoredConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') return false
  if (cfg.enabled === false) return true
  return Boolean((cfg.command && cfg.command.trim()) || (cfg.path && cfg.path.trim()))
}

/** 该语言是否显示卡片：检测到可用 LSP、已存配置、或存在待安装的缺失环境。 */
function langVisible(status, config) {
  if (!status) return false
  if (status.source && status.source !== 'none') return true
  if (hasStoredConfig(config[status.languageId])) return true
  return Array.isArray(status.missingEnv) && status.missingEnv.length > 0
}

const PHASE_LABEL = {
  get idle() { return uiText('未启动', "Not started", "Не запущен") }, get starting() { return uiText('启动中', "Starting", "Запуск") }, get ready() { return uiText('就绪', "Ready", "Готов") }, get indexing() { return uiText('索引中', "Indexing", "Индексация") }, get unavailable() { return uiText('不可用', "Unavailable", "Недоступен") }, get stopped() { return uiText('已停止', "Stopped", "Остановлен") },
}
const SOURCE_LABEL = { get extension() { return uiText('扩展', "Extension", "Расширение") }, get discover() { return uiText('自动发现', "Auto-detected", "Автообнаружение") }, get manual() { return uiText('手动配置', "Manual configuration", "Ручная настройка") }, get none() { return uiText('未配置', "Not configured", "Не настроен") } }
const TABS = [
  { id: 'servers', get label() { return uiText('服务器', "Servers", "Серверы") } },
  { id: 'installed', get label() { return uiText('已安装', "Installed", "Установлено") } },
  { id: 'market', get label() { return uiText('市场', "Marketplace", "Каталог") } },
  { id: 'updates', get label() { return uiText('更新', "Update", "Обновить") } },
]

/** 环境安装按钮文案（按安装进行态）。 */
function envButtonLabel(req, envStates) {
  const state = (envStates ?? []).find((s) => s.id === req.id)
  if (state?.phase === 'downloading') return uiText('下载中…', "Downloading…", "Скачивание…")
  if (state?.phase === 'extracting') return uiText('安装中…', "Installing…", "Установка…")
  if (state?.phase === 'done') return uiText('已完成', "Completed", "Завершено")
  if (state?.phase === 'failed') return uiText('重试', "Retry", "Повторить")
  return uiText('一键安装', "Install automatically", "Установить автоматически")
}

/** 语言卡片：状态 + 缺失环境提示（一键安装/官网下载） + 启用开关 + 命令/路径配置 + 重新检测。 */
function LangCard({ lang, config, status, busy, envStates, onInstallEnv, onToggle, onSave, onRedetect }) {
  const [pathDraft, setPathDraft] = React.useState(config?.path ?? '')
  const [commandDraft, setCommandDraft] = React.useState(config?.command ?? '')
  React.useEffect(() => { setPathDraft(config?.path ?? ''); setCommandDraft(config?.command ?? '') }, [config?.path, config?.command])
  const phase = status?.phase ?? 'idle'
  return React.createElement('article', { className: 'vsm-mcp-card' },
    React.createElement('div', { className: 'vsm-mcp-card-head' },
      React.createElement('div', { className: 'vsm-mcp-title' },
        React.createElement('span', { className: 'vsm-mcp-dot ' + (phase === 'ready' || phase === 'indexing' ? 'connected' : phase === 'unavailable' ? 'error' : 'disabled') }),
        lang.label),
      React.createElement('div', { className: 'vsm-mcp-actions' },
        React.createElement('button', { className: 'vsm-switch ' + (config?.enabled !== false ? 'on' : ''), onClick: () => onToggle(lang.id, config?.enabled !== false ? false : true), 'aria-label': uiText('启用/禁用', "Enable/disable", "Включить/отключить") }, config?.enabled !== false ? '●' : '○'))),
    React.createElement('div', { className: 'vsm-mcp-meta' },
      PHASE_LABEL[phase] ?? phase, ' · ', SOURCE_LABEL[status?.source] ?? status?.source,
      status?.providerName ? ' · ' + status.providerName : '',
      status?.version ? ' · v' + status.version : '',
      (phase === 'ready' && status?.root) ? ' · ' + String(status.root).split(/[\\/]/).pop() : ''),
    status?.reason ? React.createElement('div', { className: 'vsm-mcp-error' }, status.reason) : null,
    Array.isArray(status?.candidates) && status.candidates.length > 1
      ? React.createElement('div', { className: 'vsm-lsp-hint' },
        uiText('候选（', "Candidates (", "Кандидаты (") + status.candidates.length + uiText('）：', "): ", "): ") + status.candidates.map((c) =>
          c.name + (c.version ? ' v' + c.version : '') + (c.chosen ? uiText('（当前）', " (current)", " (текущий)") : '')).join(' · '))
      : null,
    Array.isArray(status?.missingEnv) && status.missingEnv.length
      ? React.createElement('div', { className: 'vsm-lsp-hint' },
        uiText('缺少运行环境（一键安装后自动生效）：', "Missing runtime (activated automatically after installation):", "Отсутствует среда выполнения (активируется после установки):"),
        status.missingEnv.map((req) => React.createElement('div', { key: req.id, className: 'vsm-mcp-actions' },
          React.createElement('span', null, req.label, req.detail ? uiText('（', " (", " (") + req.detail + uiText('）', ")", ")") : ''),
          req.installable ? React.createElement('button', {
            className: 'vsm-primary vsm-small',
            disabled: busy === 'env:' + req.id,
            onClick: () => onInstallEnv(lang.id, req),
          }, envButtonLabel(req, envStates)) : null,
          req.manualUrl ? React.createElement('a', {
            href: req.manualUrl, target: '_blank', rel: 'noreferrer',
            style: { color: 'inherit', textDecoration: 'underline', alignSelf: 'center' },
          }, req.manualLabel ?? uiText('官网下载', "Official download", "Скачать с официального сайта")) : null)))
      : null,
    React.createElement('div', { className: 'vsm-lsp-form' },
      React.createElement('label', null, React.createElement('span', null, uiText('可执行文件路径（绝对路径，优先）', "Executable path (absolute, preferred)", "Путь к исполняемому файлу (абсолютный, приоритетный)")), React.createElement('input', { value: pathDraft, placeholder: uiText('如 C:/.../lua-language-server.exe', "e.g. C:/.../lua-language-server.exe", "например C:/.../lua-language-server.exe"), onChange: (e) => setPathDraft(e.target.value) })),
      React.createElement('label', null, React.createElement('span', null, uiText('命令名（PATH 内查找）', "Command name (searched in PATH)", "Имя команды (поиск в PATH)")), React.createElement('input', { value: commandDraft, placeholder: uiText('如 lua-language-server', "e.g. lua-language-server", "например lua-language-server"), onChange: (e) => setCommandDraft(e.target.value) })),
      React.createElement('button', { className: 'vsm-primary', disabled: busy === lang.id, onClick: () => onSave(lang.id, pathDraft, commandDraft) }, busy === lang.id ? uiText('保存中…', "Saving…", "Сохранение…") : uiText('保存配置', "Save configuration", "Сохранить настройки")),
      React.createElement('button', { className: 'vsm-primary vsm-small', disabled: busy === lang.id, onClick: () => onRedetect(lang.id), title: uiText('清缓存并重新选择语言服务器（EmmyLua / LuaLS）', "Clear cache and reselect the language server (EmmyLua / LuaLS)", "Очистить кэш и выбрать языковой сервер снова (EmmyLua / LuaLS)") }, busy === lang.id ? uiText('检测中…', "Detecting…", "Обнаружение…") : uiText('重新检测', "Detect again", "Повторить обнаружение"))),
    React.createElement('div', { className: 'vsm-lsp-hint' }, lang.hint))
}

/** 已装扩展卡片：清单 + 卸载/更新。 */
function InstalledCard({ ext, busy, onUninstall, onUpdate }) {
  return React.createElement('article', { className: 'vsm-mcp-card' },
    React.createElement('div', { className: 'vsm-mcp-card-head' },
      React.createElement('div', { className: 'vsm-mcp-title' },
        React.createElement('span', { className: 'vsm-mcp-dot connected' }),
        React.createElement('span', null, ext.displayName || ext.name),
        React.createElement('span', { className: 'vsm-ext-ver' }, ext.id + ' · v' + ext.version)),
      React.createElement('div', { className: 'vsm-mcp-actions' },
        React.createElement('button', { className: 'vsm-primary vsm-small', disabled: busy === ext.id, onClick: () => onUpdate(ext) }, uiText('更新', "Update", "Обновить")),
        React.createElement('button', { className: 'vsm-danger vsm-small', disabled: busy === ext.id, onClick: () => onUninstall(ext) }, uiText('卸载', "Uninstall", "Удалить")))),
    ext.description ? React.createElement('div', { className: 'vsm-lsp-hint' }, ext.description) : null)
}

/** 市场条目卡片：安装/已装态。 */
function MarketCard({ item, installed, busy, onInstall }) {
  const has = installed.some((e) => e.id === item.id)
  return React.createElement('article', { className: 'vsm-mcp-card' },
    React.createElement('div', { className: 'vsm-mcp-card-head' },
      React.createElement('div', { className: 'vsm-mcp-title' },
        React.createElement('span', { className: 'vsm-mcp-dot ' + (has ? 'connected' : 'disabled') }),
        React.createElement('span', null, item.displayName || item.name),
        React.createElement('span', { className: 'vsm-ext-ver' }, item.id + ' · v' + item.version)),
      React.createElement('div', { className: 'vsm-mcp-actions' },
        React.createElement('button', { className: 'vsm-primary vsm-small', disabled: has || busy === item.id, onClick: () => onInstall(item) }, has ? uiText('已安装', "Installed", "Установлено") : uiText('安装', "Install", "Установить")))),
    item.description ? React.createElement('div', { className: 'vsm-lsp-hint' }, item.description) : null)
}

/**
 * 语言服务器设置页：服务器状态/配置 + VSIX 扩展（安装/更新/卸载三视图）。
 * @author ddj 2026年08月27号
 */
export function LspSettings() {
  const [tab, setTab] = React.useState('servers')
  const [config, setConfig] = React.useState({})
  const [servers, setServers] = React.useState([])
  const [installed, setInstalled] = React.useState([])
  const [updates, setUpdates] = React.useState([])
  const [market, setMarket] = React.useState([])
  const [query, setQuery] = React.useState('')
  const [vsixPath, setVsixPath] = React.useState('')
  const [busy, setBusy] = React.useState('')
  const [error, setError] = React.useState('')
  const [loading, setLoading] = React.useState(true)
  const [envStates, setEnvStates] = React.useState([])
  const [envLang, setEnvLang] = React.useState('')

  const refreshServers = React.useCallback(() => {
    Promise.all([rpc('edrv.lsp.configGet', {}), rpc('edrv.lsp.detect', {})])
      .then(([cfg, det]) => {
        if (cfg?.ok) setConfig(cfg.config ?? {})
        if (det?.ok) setServers(det.servers ?? [])
        setError('')
      })
      .catch((e) => setError(String(e)))
  }, [])

  const refreshExt = React.useCallback(() => {
    Promise.all([rpc('edrv.lsp.ext.list', {}), rpc('edrv.lsp.ext.updates', {})])
      .then(([l, u]) => {
        if (l?.ok) setInstalled(l.extensions ?? [])
        if (u?.ok) setUpdates(u.updates ?? [])
        setError('')
      })
      .catch((e) => setError(String(e)))
  }, [])

  const refreshEnvStates = React.useCallback(() => {
    return rpc('edrv.lsp.envState', {})
      .then((res) => {
        if (res?.ok) setEnvStates(res.states ?? [])
        return res?.states ?? []
      })
      .catch(() => [])
  }, [])

  const refresh = React.useCallback(() => {
    setLoading(true)
    Promise.all([refreshServers(), refreshExt()]).finally(() => setLoading(false))
  }, [refreshServers, refreshExt])

  React.useEffect(() => { refresh() }, [refresh])

  const switchTab = (next) => {
    setTab(next)
    setError('')
    if (next === 'market' && !query) setQuery('lua language server')
    if (next === 'installed' || next === 'updates') void refreshExt()
    if (next === 'servers') void refreshServers()
  }

  /** 合并 redetect/configUpdate 返回的服务器状态：只替换该语言条目。 */
  const mergeServers = (languageId, list) => {
    setServers((prev) => Array.isArray(list)
      ? [...prev.filter((s) => s.languageId !== languageId), ...list]
      : prev)
  }

  /** 重检测后通知编辑器：与 host 重新同步已打开的模型（触发重新 acquire）。 */
  const notifyResync = React.useCallback((languageId) => {
    window.dispatchEvent(new CustomEvent('edrv:lsp-redetect', { detail: { languageId } }))
  }, [])

  /** 一键安装缺失环境：启动内置安装器（成功后进入轮询，完成自动重同步）。 */
  const installEnv = (languageId, req) => {
    const key = 'env:' + req.id
    setBusy(key)
    setError('')
    setEnvLang(languageId)
    rpc('edrv.lsp.envInstall', { languageId, id: req.id })
      .then((res) => {
        if (!res?.ok) { setError(res?.error ?? uiText('无法启动安装', "Unable to start installation", "Не удалось начать установку")); return }
        void refreshEnvStates()
        void refreshServers()
      })
      .catch((e) => setError(String(e)))
      .finally(() => setBusy(''))
  }

  // 环境安装进行中：2s 轮询进度并刷新状态；某项转入 done 时由下方过渡检测重同步
  React.useEffect(() => {
    const states = envStates ?? []
    const installing = states.some((s) => s.phase === 'downloading' || s.phase === 'extracting')
    if (!installing) return
    const timer = setInterval(() => {
      void refreshEnvStates()
      void refreshServers()
    }, 2000)
    return () => clearInterval(timer)
  }, [envStates, refreshEnvStates, refreshServers])

  // 环境安装完成过渡检测：刷新状态并通知编辑器重新同步对应语言
  const prevEnvPhases = React.useRef({})
  React.useEffect(() => {
    const states = envStates ?? []
    for (const s of states) {
      const prev = prevEnvPhases.current[s.id]
      if (prev && prev !== 'done' && s.phase === 'done' && envLang) {
        void refreshServers()
        notifyResync(envLang)
      }
      prevEnvPhases.current[s.id] = s.phase
    }
  }, [envStates, envLang, refreshServers, notifyResync])

  const saveLang = (languageId, path, command) => {
    setBusy(languageId)
    setError('')
    rpc('edrv.lsp.configUpdate', { languageId, path, command })
      .then((res) => {
        if (!res?.ok) { setError(res?.error ?? uiText('保存失败', "Save failed", "Ошибка сохранения")); return }
        setConfig(res.config ?? {})
        mergeServers(languageId, res.servers)
        notifyResync(languageId) // 保存后自动重新检测 + 同步模型
      })
      .catch((e) => setError(String(e)))
      .finally(() => setBusy(''))
  }

  const toggleLang = (languageId, enabled) => {
    setBusy(languageId)
    rpc('edrv.lsp.configUpdate', { languageId, enabled })
      .then((res) => {
        if (!res?.ok) { setError(res?.error ?? uiText('切换失败', "Switch failed", "Ошибка переключения")); return }
        setConfig(res.config ?? {})
        mergeServers(languageId, res.servers)
        notifyResync(languageId) // 切换启用状态后自动重新检测 + 同步模型
      })
      .catch((e) => setError(String(e)))
      .finally(() => setBusy(''))
  }

  const redetectLang = (languageId) => {
    setBusy(languageId)
    setError('')
    rpc('edrv.lsp.redetect', { languageId })
      .then((res) => {
        if (!res?.ok) { setError(res?.error ?? uiText('重新检测失败', "Detection failed", "Ошибка обнаружения")); return }
        mergeServers(languageId, res.servers)
        notifyResync(languageId)
      })
      .catch((e) => setError(String(e)))
      .finally(() => setBusy(''))
  }

  const searchMarket = () => {
    if (!query.trim()) return
    setBusy('__market')
    setError('')
    rpc('edrv.lsp.ext.market', { query: query.trim(), size: 12 })
      .then((res) => {
        if (res?.ok) setMarket(res.extensions ?? [])
        else setError(res?.error ?? uiText('搜索失败', "Search failed", "Ошибка поиска"))
      })
      .catch((e) => setError(String(e)))
      .finally(() => setBusy(''))
  }

  const installMarket = (item) => {
    setBusy(item.id)
    setError('')
    rpc('edrv.lsp.ext.install', { namespace: item.namespace, name: item.name })
      .then((res) => {
        if (!res?.ok) { setError(res?.error ?? uiText('安装失败', "Installation failed", "Ошибка установки")); return }
        void refreshExt()
        void refreshServers() // 新装 LSP 使对应语言卡片出现
      })
      .catch((e) => setError(String(e)))
      .finally(() => setBusy(''))
  }

  const installLocal = () => {
    if (!vsixPath.trim()) return
    setBusy('__vsix')
    setError('')
    rpc('edrv.lsp.ext.install', { vsixPath: vsixPath.trim() })
      .then((res) => {
        if (!res?.ok) { setError(res?.error ?? uiText('安装失败', "Installation failed", "Ошибка установки")); return }
        setVsixPath('')
        void refreshExt()
        void refreshServers() // 新装 LSP 使对应语言卡片出现
      })
      .catch((e) => setError(String(e)))
      .finally(() => setBusy(''))
  }

  const uninstallExt = (ext) => {
    if (!window.confirm(uiText('卸载扩展 ', "Uninstall extension ", "Удалить расширение ") + ext.id + uiText('？', "?", "?"))) return
    setBusy(ext.id)
    setError('')
    rpc('edrv.lsp.ext.uninstall', { id: ext.id })
      .then((res) => {
        if (!res?.ok) setError(res?.error ?? uiText('卸载失败', "Uninstall failed", "Ошибка удаления"))
        void refreshExt()
        void refreshServers() // 卸载后对应语言卡片按最新检测隐匿
      })
      .catch((e) => setError(String(e)))
      .finally(() => setBusy(''))
  }

  const updateExt = (ext) => {
    setBusy(ext.id)
    setError('')
    rpc('edrv.lsp.ext.update', { id: ext.id })
      .then((res) => {
        if (!res?.ok) setError(res?.error ?? uiText('更新失败', "Update failed", "Ошибка обновления"))
        void refreshExt()
        void refreshServers() // 更新后选用版本随之变化
      })
      .catch((e) => setError(String(e)))
      .finally(() => setBusy(''))
  }

  if (loading) return React.createElement('div', { className: 'vsm-mcp-empty' }, uiText('正在读取语言服务器状态…', "Loading language server status…", "Загрузка состояния языковых серверов…"))
  const nav = React.createElement('nav', { className: 'vsm-mcp-subtabs', 'aria-label': uiText('语言服务器分类', "Language server categories", "Категории языковых серверов") },
    TABS.map((t) => React.createElement('button', { key: t.id, className: tab === t.id ? 'active' : '', onClick: () => switchTab(t.id) }, t.label)))
  const header = React.createElement('div', { className: 'vsm-mcp-header' },
    React.createElement('div', null,
      React.createElement('h2', null, uiText('语言服务器（LSP）', "Language servers (LSP)", "Языковые серверы (LSP)")),
      React.createElement('p', null, uiText('代码索引 / 引用查找 / 动态跳转；可安装 VSIX 语言服务器扩展（Open VSX 市场 / 本地 .vsix）。', "Code indexing, reference lookup, and navigation. Install VSIX language server extensions from Open VSX or local .vsix files.", "Индексация кода, поиск ссылок и навигация. Устанавливайте языковые серверы VSIX из Open VSX или локальных файлов .vsix."))),
    React.createElement('button', { className: 'vsm-primary', onClick: refresh }, uiText('↻ 刷新', "↻ Refresh", "↻ Обновить")))
  const banner = error ? React.createElement('div', { className: 'vsm-mcp-error vsm-mcp-banner' }, error) : null

  /** 线框面板容器：标题 + 内容体。 */
  const panel = (title, children) => React.createElement('section', { className: 'vsm-panel' },
    React.createElement('h3', { className: 'vsm-panel-title' }, title),
    React.createElement('div', { className: 'vsm-panel-body' }, children),
  )

  let body = null
  if (tab === 'servers') {
    // 动态显示：检测结果（detect 全量）驱动卡片可见性；未检出语言灰字列出
    const detected = Array.isArray(servers) ? servers : []
    const visible = detected.filter((s) => langVisible(s, config))
    const hidden = detected.filter((s) => !visible.includes(s))
    body = panel(uiText('语言服务器', "Language servers", "Языковые серверы"), React.createElement(React.Fragment, null,
      visible.length ? visible.map((status) => {
        const meta = langMeta(status.languageId)
        return React.createElement(LangCard, {
          key: status.languageId, lang: { id: status.languageId, label: meta.label, hint: meta.hint },
          config: config[status.languageId] ?? {},
          status,
          busy, envStates, onInstallEnv: installEnv, onToggle: toggleLang, onSave: saveLang, onRedetect: redetectLang,
        })
      }) : React.createElement('div', { className: 'vsm-mcp-empty' },
        uiText('未检测到已安装的语言服务器；可切换到「市场」搜索安装（如 sumneko.lua），或安装本地 .vsix 后刷新。', "No installed language servers detected. Search the marketplace (e.g. sumneko.lua), or install a local .vsix and refresh.", "Установленные языковые серверы не обнаружены. Найдите их в каталоге (например sumneko.lua) или установите локальный .vsix и обновите.")),
      hidden.length ? React.createElement('div', { className: 'vsm-lsp-hint' },
        uiText('未检测到：', "Not detected: ", "Не обнаружено: ") + hidden.map((s) => langMeta(s.languageId).label).join(uiText('、', ", ", ", ")) + uiText(' —— 可在「市场」安装后刷新。', " — install from the marketplace, then refresh.", " — установите из каталога и обновите.")) : null,
      React.createElement('div', { className: 'vsm-lsp-hint' }, uiText('提示：打开对应语言的文件即自动（惰性）启动语言服务器；未配置时编辑器功能不受影响，大纲回退内置解析。', "Opening a matching file starts its language server on demand. Without configuration, the editor still works and the outline uses built-in parsing.", "Открытие файла запускает соответствующий языковой сервер по требованию. Без настройки редактор работает, а структура использует встроенный разбор."))))
  } else if (tab === 'installed') {
    body = panel(uiText('已安装扩展', "Installed extensions", "Установленные расширения"), React.createElement(React.Fragment, null,
      React.createElement('div', { className: 'vsm-lsp-hint' }, uiText('已安装的语言服务器扩展（存于 ~/.dsh/dsh-vscode-mode/extensions/）。语言服务器被自动发现为「扩展」源。', "Installed language server extensions (stored in ~/.dsh/dsh-vscode-mode/extensions/). Detected servers use the Extension source.", "Установленные языковые серверы (в ~/.dsh/dsh-vscode-mode/extensions/). Обнаруженные серверы используют источник «Расширение».")),
      installed.length ? installed.map((ext) => React.createElement(InstalledCard, { key: ext.id, ext, busy, onUninstall: uninstallExt, onUpdate: updateExt }))
        : React.createElement('div', { className: 'vsm-mcp-empty' }, uiText('还没有安装扩展（去「市场」或指定本地 .vsix）', "No extensions installed (use the marketplace or a local .vsix)", "Расширения не установлены (используйте каталог или локальный .vsix)"))))
  } else if (tab === 'market') {
    body = panel(uiText('扩展市场', "Extension marketplace", "Каталог расширений"), React.createElement(React.Fragment, null,
      React.createElement('div', { className: 'vsm-lsp-form' },
        React.createElement('label', null, React.createElement('span', null, uiText('搜索 Open VSX 市场', "Search Open VSX marketplace", "Поиск в каталоге Open VSX")), React.createElement('input', { value: query, placeholder: uiText('如 sumneko.lua / lua language server', "e.g. sumneko.lua / lua language server", "например sumneko.lua / lua language server"), onChange: (e) => setQuery(e.target.value), onKeyDown: (e) => { if (e.key === 'Enter') searchMarket() } })),
        React.createElement('button', { className: 'vsm-primary', disabled: busy === '__market', onClick: searchMarket }, busy === '__market' ? uiText('搜索中…', "Searching…", "Поиск…") : uiText('搜索', "Search", "Найти"))),
      React.createElement('div', { className: 'vsm-lsp-form' },
        React.createElement('label', null, React.createElement('span', null, uiText('安装本地 .vsix 文件（服务器绝对路径）', "Install local .vsix file (absolute server path)", "Установить локальный .vsix (абсолютный путь на сервере)")), React.createElement('input', { value: vsixPath, placeholder: uiText('如 C:/Downloads/sumneko.lua-3.19.1.vsix', "e.g. C:/Downloads/sumneko.lua-3.19.1.vsix", "например C:/Downloads/sumneko.lua-3.19.1.vsix"), onChange: (e) => setVsixPath(e.target.value) })),
        React.createElement('button', { className: 'vsm-primary', disabled: busy === '__vsix', onClick: installLocal }, busy === '__vsix' ? uiText('安装中…', "Installing…", "Установка…") : uiText('安装本地 .vsix', "Install local .vsix", "Установить локальный .vsix"))),
      React.createElement('div', { className: 'vsm-lsp-hint' }, uiText('市场安装会下载并解包 VSIX 到扩展目录；含语言服务器（如 sumneko.lua）的扩展会被自动发现。', "Marketplace installation downloads and extracts VSIX into the extensions directory. Extensions containing language servers (e.g. sumneko.lua) are detected automatically.", "Установка из каталога скачивает и распаковывает VSIX в каталог расширений. Языковые серверы (например sumneko.lua) обнаруживаются автоматически.")),
      market.map((item) => React.createElement(MarketCard, { key: item.id, item, installed, busy, onInstall: installMarket }))))
  } else {
    body = panel(uiText('可用更新', "Available updates", "Доступные обновления"), React.createElement(React.Fragment, null,
      React.createElement('div', { className: 'vsm-lsp-hint' }, uiText('已装扩展与 Open VSX 最新版的差异。', "Compare installed extensions with the latest Open VSX versions.", "Сравнение установленных расширений с актуальными версиями Open VSX.")),
      updates.length ? updates.map((u) => React.createElement('article', { key: u.id, className: 'vsm-mcp-card' },
        React.createElement('div', { className: 'vsm-mcp-card-head' },
          React.createElement('div', { className: 'vsm-mcp-title' },
            React.createElement('span', { className: 'vsm-mcp-dot error' }),
            React.createElement('span', null, u.displayName || u.id),
            React.createElement('span', { className: 'vsm-ext-ver' }, 'v' + u.current + ' → v' + u.latest)),
          React.createElement('div', { className: 'vsm-mcp-actions' },
            React.createElement('button', { className: 'vsm-primary vsm-small', disabled: busy === u.id, onClick: () => updateExt(u) }, busy === u.id ? uiText('更新中…', "Updating…", "Обновление…") : uiText('更新', "Update", "Обновить"))))))
        : React.createElement('div', { className: 'vsm-mcp-empty' }, uiText('全部已是最新', "Everything is up to date", "Все версии актуальны"))))
  }
  return React.createElement('div', { className: 'vsm-settings-stack' }, header, nav, banner, body)
}
