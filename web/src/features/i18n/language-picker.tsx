"use client";

import { useId } from "react";
import { useLanguage, useText } from "./i18n";
import { isLanguage, LANGUAGES, languageLabels } from "./messages";

export function LanguagePicker() {
  const id = useId();
  const t = useText();
  const { language, setLanguage } = useLanguage();
  return <label className="language-picker" htmlFor={`${id}-select`}>
    <span id={`${id}-label`}>{t("language.label")}</span>
    <select id={`${id}-select`} aria-labelledby={`${id}-label`} value={language} onChange={event => {
      if (isLanguage(event.target.value)) setLanguage(event.target.value);
    }}>{LANGUAGES.map(value => <option key={value} value={value} lang={value}>{languageLabels[value]}</option>)}</select>
  </label>;
}