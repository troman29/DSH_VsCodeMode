export interface UiLocaleSource {
  getLocale(): { active: string }
}

let localeSource: UiLocaleSource | undefined

export function bindUiLocale(source: UiLocaleSource | undefined): void {
  localeSource = source
}

/** Keep technical identifiers and file contents outside this display-only boundary. */
export function uiText(chinese: string, english: string, russian: string): string {
  const language = localeSource?.getLocale().active ?? 'en'
  if (language.toLowerCase().startsWith('ru')) {
    return russian
  }
  if (language.toLowerCase().startsWith('zh')) {
    return chinese
  }
  return english
}
