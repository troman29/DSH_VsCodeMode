// @ts-nocheck
/**
 * dsh-vscode-mode client — 「系统集成」设置面板（跨平台）。
 * 右键菜单：Windows=HKCU 三类键（reg）/ Linux=Nautilus 脚本 + Dolphin 服务菜单（文件写入）/
 * macOS=Automator 快速操作（一键复制配方手动创建，自动检测/移除）。
 * 深链基址来自设置 integrationBaseUrl（settings.set 持久化）。
 * Unity 集成：登记项目根 + 一键安装/更新内嵌包到 <项目>/Packages/com.dsh.editor。
 * 作者 ddj 2026-09-07
 */
import React from 'react'
import { uiText } from '../uiLocale.js'
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import { SettingNotice } from './SettingsUi.js'
import { rpc } from '../rpc.js'
import { SettingsContext } from '../settingsContext.js'

/** launcher 状态文案。 */
function launcherText(launcher) {
  if (!launcher?.present) return uiText('未安装', "Not installed", "Не установлено")
  return launcher.compiled ? uiText('已编译 exe（无闪窗）', "Compiled exe (no console flash)", "Скомпилированный exe (без вспышки консоли)") : uiText('已安装', "Installed", "Установлено")
}

/** 注册条目状态文案（跨平台 entries）。 */
function entriesText(entries) {
  if (!entries?.length) return uiText('本平台无自动注册入口', "Automatic registration is unavailable on this platform", "Автоматическая регистрация недоступна на этой платформе")
  return entries.map((entry) => entry.label + (entry.registered ? ' ✓' : ' ✗')).join(' · ')
}

/** macOS Automator 快速操作配方（复制到剪贴板，用户按步骤创建）。 */
function automatorRecipe(launcherPath) {
  return [
    uiText('macOS Finder 快速操作（Automator）配置步骤：', "Set up a macOS Finder Quick Action (Automator):", "Настройка быстрого действия macOS Finder (Automator):"),
    uiText('1. Automator → 新建 → 快速操作', "1. Automator → New → Quick Action", "1. Automator → Новый → Быстрое действие"),
    uiText('2. 「工作流程接收当前」选：文件或文件夹；位于：任何应用程序', "2. Set “Workflow receives current” to files or folders in any application", "2. Выберите получение файлов или папок в любой программе"),
    uiText('3. 添加动作「运行 Shell 脚本」，Shell 选 /bin/bash，传递输入选「作为参数」', "3. Add “Run Shell Script”; select /bin/bash and pass input as arguments", "3. Добавьте «Запустить shell-скрипт»; выберите /bin/bash и передачу ввода аргументами"),
    uiText('4. 脚本内容替换为：', "4. Replace the script with:", "4. Замените скрипт следующим:"),
    '   exec "' + launcherPath + '" "$@"',
    uiText('5. 保存为：在 DSH 文件编辑中打开', "5. Save as: Open in DSH File Editor", "5. Сохраните как: Открыть в редакторе файлов DSH"),
    uiText('完成后在 Finder 右键 → 快速操作/服务 中出现「在 DSH 文件编辑中打开」。', "Finder context menu → Quick Actions/Services will show “Open in DSH File Editor”.", "В контекстном меню Finder → Быстрые действия/Службы появится «Открыть в редакторе файлов DSH»."),
  ].join('\n')
}

/** 单个 Unity 项目行。 */
function ProjectRow({ project, busy, onInstall, onRemove }) {
  const versionText = project.missingDir
    ? uiText('目录不存在', "Directory missing", "Каталог отсутствует")
    : project.error
      ? project.error
      : project.installedVersion
        ? uiText('已装 v', "Installed v", "Установлена v") + project.installedVersion + (project.upToDate ? uiText('（最新）', " (up to date)", " (актуальная)") : uiText('（可更新）', " (update available)", " (доступно обновление)"))
        : uiText('未安装', "Not installed", "Не установлено")
  const installable = !project.missingDir && !project.error
  return React.createElement('div', { className: 'vsm-general-row', key: project.path },
    React.createElement('span', null,
      project.title,
      React.createElement('small', { className: 'vsm-devform-note' }, ' ' + project.path + ' · ' + versionText)),
    React.createElement('div', { className: 'vsm-devform-actions' },
      React.createElement('button', {
        className: 'vsm-primary vsm-small',
        disabled: !installable || busy === 'install:' + project.path,
        title: project.upToDate ? uiText('重新安装（整目录替换）', "Reinstall (replace entire directory)", "Переустановить (заменить весь каталог)") : uiText('安装/更新到该 Unity 项目', "Install/update in this Unity project", "Установить/обновить в этом проекте Unity"),
        onClick: () => onInstall(project.path),
      }, busy === 'install:' + project.path ? uiText('安装中…', "Installing…", "Установка…") : project.installedVersion ? (project.upToDate ? uiText('重装', "Reinstall", "Переустановить") : uiText('更新', "Update", "Обновить")) : uiText('安装', "Install", "Установить")),
      React.createElement('button', { disabled: busy === 'remove:' + project.path, onClick: () => onRemove(project.path) }, uiText('移除登记', "Remove registration", "Удалить регистрацию")),
    ),
  )
}

/** 平台提示条（注册语义差异说明）。 */
function PlatformNote({ platform, registered }) {
  if (platform === 'win32') return null
  const text = platform === 'linux'
    ? uiText('Linux 注册覆盖 GNOME Files（Nautilus）与 KDE Dolphin 两个主流文件管理器（文件写入即注册，无需管理员）；其他文件管理器暂未支持。', "Linux registration supports GNOME Files (Nautilus) and KDE Dolphin through file creation, without administrator rights. Other file managers are not yet supported.", "В Linux регистрация поддерживает GNOME Files (Nautilus) и KDE Dolphin через создание файлов, без прав администратора. Другие файловые менеджеры пока не поддерживаются.")
    : uiText('macOS：点「复制 Automator 配方」按提示创建快速操作（约 1 分钟），创建后此处自动显示 ✓；「移除注册」仅删除引用本插件 launcher 的快速操作。', "macOS: copy the Automator instructions and create the Quick Action (about 1 minute). A ✓ appears automatically afterward. Remove registration deletes only Quick Actions referencing this plugin's launcher.", "macOS: скопируйте инструкцию Automator и создайте быстрое действие (около минуты). Затем автоматически появится ✓. Удаление регистрации удаляет только действия с launcher этого плагина.")
  return React.createElement('small', { className: 'vsm-devform-msg' }, text)
}

/**
 * 系统集成面板（挂在 VSCodeMode 设置「通用」页底部）。
 * @author ddj 2026年09月07号
 */
export function IntegrationSettings() {
  const settings = React.useContext(SettingsContext)
  const [status, setStatus] = React.useState(null)
  const [statusError, setStatusError] = React.useState('')
  const [unity, setUnity] = React.useState(null)
  const [error, setError] = React.useState('')
  const [message, setMessage] = React.useState('')
  const [busy, setBusy] = React.useState('')
  const [baseUrl, setBaseUrl] = React.useState('')
  const [baseDraft, setBaseDraft] = React.useState(null)
  const [rootDraft, setRootDraft] = React.useState('')

  React.useEffect(() => {
    let alive = true
    Promise.all([rpc('edrv.integration.status', {}), rpc('edrv.unity.list', {})]).then(([st, ul]) => {
      if (!alive) return
      if (st.ok) { setStatus(st); setBaseUrl(st.baseUrl); setStatusError('') } else setStatusError(String(st.error))
      if (ul.ok) setUnity(ul)
    }).catch((e) => { if (alive) setError(String(e)) })
    return () => { alive = false }
  }, [])

  const platform = status?.platform ?? ''
  const onWin = platform === 'win32'
  const onLinux = platform === 'linux'
  const onMac = platform === 'darwin'
  const anyRegistered = (status?.entries ?? []).some((entry) => entry.registered && !entry.manual)

  const refreshUnity = () => rpc('edrv.unity.list', {}).then((result) => { if (result.ok) setUnity(result) })

  /** 注册/移除右键菜单（Windows/Linux；macOS 注册按钮替换为配方复制）。 */
  const runMenu = (key, method, done) => {
    setBusy(key); setError(''); setMessage('')
    rpc(method, {}).then((result) => {
      if (!result.ok) throw new Error(result.error)
      setStatus(result)
      setMessage(done)
    }).catch((e) => setError(String(e?.message ?? e))).finally(() => setBusy(''))
  }
  const register = () => runMenu('register', 'edrv.integration.register',
    onLinux ? uiText('已注册：在 Nautilus / Dolphin 中右键文件或文件夹即可看到「在 DSH 文件编辑中打开」（首次出现可能需重启文件管理器）。', "Registered: right-click a file or folder in Nautilus / Dolphin and select “Open in DSH File Editor”. You may need to restart the file manager once.", "Зарегистрировано: нажмите правой кнопкой файл или папку в Nautilus / Dolphin и выберите «Открыть в редакторе файлов DSH». Может потребоваться перезапуск файлового менеджера.") : uiText('右键菜单已注册：右键文件/文件夹 →「在 DSH 文件编辑中打开」。', "Context menu registered: right-click a file/folder → “Open in DSH File Editor”.", "Контекстное меню зарегистрировано: правая кнопка по файлу/папке → «Открыть в редакторе файлов DSH»."))
  const unregister = () => runMenu('unregister', 'edrv.integration.unregister', uiText('右键菜单注册已移除。', "Context menu registration removed.", "Регистрация контекстного меню удалена."))

  /** 复制 macOS Automator 配方（含 launcher 实际路径）。 */
  const copyRecipe = () => {
    const text = automatorRecipe(status?.launcher?.path ?? '$HOME/.dsh/dsh-vscode-mode/shell/dsh-open.sh')
    navigator.clipboard?.writeText(text)
      .then(() => setMessage(uiText('配方已复制，粘贴到备忘录按步骤操作即可。', "Instructions copied. Paste into a note and follow the steps.", "Инструкция скопирована. Вставьте её в заметку и выполните шаги.")))
      .catch(() => setMessage(text))
  }

  /** 保存深链基址（settings.set 持久化；已注册时提示重新注册刷新 launcher ini）。 */
  const saveBase = () => {
    const next = String(baseDraft ?? '').trim()
    if (!next) return
    if (!settings?.set) { setError(uiText('设置服务不可用', "Settings service unavailable", "Сервис настроек недоступен")); return }
    setBusy('base'); setError(''); setMessage('')
    settings.set('integrationBaseUrl', next)
      .then(() => { setBaseUrl(next); setMessage(uiText('深链基址已保存；如已注册右键菜单，请点「注册」刷新 launcher 配置。', "Deep-link base URL saved. If the context menu is registered, click Register to refresh the launcher configuration.", "Базовый URL ссылок сохранён. Если контекстное меню зарегистрировано, нажмите «Зарегистрировать» для обновления настроек launcher.")) })
      .catch((e) => setError(String(e)))
      .finally(() => setBusy(''))
  }

  /** 登记 Unity 项目（校验 Assets/ProjectSettings）。 */
  const addProject = () => {
    setBusy('add'); setError(''); setMessage('')
    rpc('edrv.unity.add', { path: rootDraft.trim() }).then((result) => {
      if (!result.ok) throw new Error(result.error)
      setRootDraft('')
      setMessage(uiText('项目已登记，点「安装」把包复制进项目 Packages/ 目录。', "Project registered. Click Install to copy the package into the project's Packages/ directory.", "Проект зарегистрирован. Нажмите «Установить» для копирования пакета в каталог Packages/ проекта."))
      return refreshUnity()
    }).catch((e) => setError(String(e?.message ?? e))).finally(() => setBusy(''))
  }

  /** 一键安装/更新（整目录替换内嵌包）。 */
  const installProject = (path) => {
    setBusy('install:' + path); setError(''); setMessage('')
    rpc('edrv.unity.install', { path }).then((result) => {
      if (!result.ok) throw new Error(result.error)
      const project = result.project
      setMessage(uiText('已安装/更新：', "Installed/updated: ", "Установлено/обновлено: ") + project.title + uiText('（v', " (v", " (v") + project.installedVersion + uiText('）。Unity 已打开时切回窗口即生效。', "). Switch back to an open Unity window to apply.", "). Переключитесь в открытое окно Unity для применения."))
      return refreshUnity()
    }).catch((e) => setError(String(e?.message ?? e))).finally(() => setBusy(''))
  }

  /** 移除登记（不删除已安装的包目录）。 */
  const removeProject = (path) => {
    if (!window.confirm(uiText('移除该项目的登记？（不删除已安装的包目录）', "Remove this project's registration? The installed package directory will remain.", "Удалить регистрацию проекта? Каталог установленного пакета останется."))) return
    setBusy('remove:' + path); setError(''); setMessage('')
    rpc('edrv.unity.remove', { path })
      .then(refreshUnity)
      .catch((e) => setError(String(e)))
      .finally(() => setBusy(''))
  }

  /** 复制包源路径（手动 Add package from disk 兜底）。 */
  const copySource = () => {
    const text = unity?.sourcePath ?? ''
    if (!text) return
    navigator.clipboard?.writeText(text)
      .then(() => setMessage(uiText('已复制包源路径：', "Package source path copied: ", "Путь к исходному пакету скопирован: ") + text))
      .catch(() => setMessage(uiText('包源路径：', "Package source path: ", "Путь к исходному пакету: ") + text))
  }

  return React.createElement('section', { className: 'vsm-panel' },
    React.createElement('h3', { className: 'vsm-panel-title' }, uiText('系统集成', "System integration", "Системная интеграция")),
    React.createElement('div', { className: 'vsm-panel-body' },
      React.createElement('p', { style: { margin: '0 0 8px' } },
        uiText('从文件管理器或 Unity 直接打开 DSH 编辑器。Unity 使用内嵌包，无需修改项目 manifest。', "Open the DSH editor directly from your file manager or Unity. Unity uses an embedded package without changing the project manifest.", "Открывайте редактор DSH из файлового менеджера или Unity. Unity использует встроенный пакет без изменения манифеста проекта.")),
      React.createElement(SettingNotice, { message: error, error: true }),
      React.createElement(SettingNotice, { message }),
      status && !onWin && React.createElement(PlatformNote, { platform, registered: anyRegistered }),
      React.createElement('label', { className: 'vsm-general-row' },
        React.createElement('span', null, uiText('DSH 服务地址', "DSH service URL", "Адрес сервиса DSH")),
        React.createElement(Input, {
          value: baseDraft ?? baseUrl,
          placeholder: 'http://127.0.0.1:3080',
          onChange: (event) => setBaseDraft(event.target.value),
          onKeyDown: (event) => { if (event.key === 'Enter') saveBase() },
        }),
        React.createElement(Button, { variant: 'outline', size: 'sm', disabled: busy === 'base' || baseDraft === null, onClick: saveBase }, uiText('保存地址', "Save URL", "Сохранить адрес")),
      ),
      React.createElement('label', { className: 'vsm-general-row' },
        React.createElement('span', null,
          uiText('右键菜单 ', "Context menu ", "Контекстное меню "),
          React.createElement('small', { className: 'vsm-devform-note' },
            status
              ? entriesText(status.entries) + uiText(' · launcher：', " · launcher: ", " · launcher: ") + launcherText(status.launcher)
              : statusError ? uiText('状态获取失败：', "Failed to load status: ", "Ошибка загрузки состояния: ") + statusError : uiText('读取中…', "Loading…", "Загрузка…"))),
        React.createElement('div', { className: 'vsm-devform-actions' },
          (onWin || onLinux) && React.createElement('button', { className: 'vsm-primary vsm-small', disabled: busy === 'register', onClick: register }, busy === 'register' ? uiText('注册中…', "Registering…", "Регистрация…") : uiText('注册', "Register", "Зарегистрировать")),
          onMac && React.createElement('button', { className: 'vsm-primary vsm-small', onClick: copyRecipe }, uiText('复制 Automator 配方', "Copy Automator instructions", "Скопировать инструкцию Automator")),
          status && React.createElement('button', { disabled: busy === 'unregister' || (!anyRegistered && !onMac), onClick: unregister }, uiText('移除注册', "Remove registration", "Удалить регистрацию")),
        ),
      ),
      React.createElement('div', { className: 'vsm-general-row', style: { alignItems: 'flex-start' } },
        React.createElement('span', null,
          uiText('Unity 一键安装 ', "Unity automatic installation ", "Автоматическая установка Unity "),
          React.createElement('small', { className: 'vsm-devform-note' },
            unity ? uiText('包 v', "Package v", "Пакет v") + (unity.sourceVersion ?? '?') + ' · ' + unity.sourcePath : uiText('读取中…', "Loading…", "Загрузка…"))),
        React.createElement('div', { className: 'vsm-devform-actions' },
          React.createElement('button', { onClick: copySource }, uiText('复制包源路径', "Copy package source path", "Скопировать путь к исходному пакету")),
        ),
      ),
      (unity?.projects ?? []).map((project) => React.createElement(ProjectRow, {
        key: project.path,
        project,
        busy,
        onInstall: installProject,
        onRemove: removeProject,
      })),
      React.createElement('label', { className: 'vsm-general-row' },
        React.createElement('span', null, uiText('添加 Unity 项目', "Add Unity project", "Добавить проект Unity")),
        React.createElement(Input, {
          value: rootDraft,
          placeholder: uiText('项目根目录（含 Assets 与 ProjectSettings）', "Project root (containing Assets and ProjectSettings)", "Корень проекта (с Assets и ProjectSettings)"),
          onChange: (event) => setRootDraft(event.target.value),
          onKeyDown: (event) => { if (event.key === 'Enter') addProject() },
        }),
        React.createElement('button', { className: 'vsm-primary vsm-small', disabled: busy === 'add' || !rootDraft.trim(), onClick: addProject }, busy === 'add' ? uiText('校验中…', "Validating…", "Проверка…") : uiText('添加', "Add", "Добавить")),
      ),
      React.createElement('small', null, uiText('安装 = 复制到 <项目>/Packages/com.dsh.editor（内嵌包）；更新 = 整目录替换；卸载 = 删除该目录。Unity 打开时切回窗口自动刷新生效。插件卸载/重载时会自动清理并恢复右键菜单注册（「移除注册」后不再恢复）。', "Install copies to <project>/Packages/com.dsh.editor (embedded package). Update replaces the entire directory; uninstall deletes it. Switch back to Unity to refresh. Plugin uninstall/reload cleans up and restores context menu registration (not restored after Remove registration).", "Установка копирует пакет в <проект>/Packages/com.dsh.editor. Обновление заменяет весь каталог; удаление удаляет его. Переключитесь в Unity для обновления. При удалении/перезагрузке плагина регистрация меню очищается и восстанавливается (кроме явно удалённой регистрации).")),
    ),
  )
}
