"use client";

import { useId, useState } from "react";
import {
  APPEARANCE_PRESETS,
  DEFAULT_APPEARANCE,
  appearanceAttributes,
  appearanceOf,
  appearanceVariables,
  applyAppearancePreset,
  type BlockAppearance,
  type PageAppearance,
} from "@/lib/appearance";
import type { Block, Locale, Page } from "@/lib/types";
import styles from "./appearance-controls.module.css";

type Choice<T extends string> = readonly [value: T, ru: string, en: string];
type AppearanceKey = Exclude<keyof PageAppearance, "theme">;

const choices: { [K in AppearanceKey]: readonly Choice<PageAppearance[K]>[] } = {
  font: [["editorial", "С засечками", "Editorial"], ["modern", "Современный", "Modern"], ["rounded", "Мягкий", "Rounded"], ["mono", "Моноширинный", "Monospace"]],
  background: [["solid", "Однотонный", "Solid"], ["gradient", "Градиент", "Gradient"], ["mesh", "Переливы", "Mesh"]],
  pattern: [["none", "Без узора", "None"], ["dots", "Точки", "Dots"], ["grid", "Сетка", "Grid"]],
  surface: [["solid", "Сплошная", "Solid"], ["outline", "Контур", "Outline"], ["glass", "Стекло", "Glass"]],
  radius: [["sharp", "Прямые", "Sharp"], ["soft", "Мягкие", "Soft"], ["round", "Округлые", "Round"]],
  spacing: [["compact", "Плотно", "Compact"], ["comfortable", "Умеренно", "Comfortable"], ["airy", "Просторно", "Airy"]],
  shadow: [["none", "Без тени", "None"], ["soft", "Лёгкая", "Soft"], ["deep", "Глубокая", "Deep"]],
  button: [["solid", "Заливка", "Solid"], ["outline", "Контур", "Outline"], ["pill", "Капсула", "Pill"]],
  entrance: [["none", "Без эффекта", "Off"], ["fade", "Проявление", "Fade"], ["rise", "Снизу вверх", "Rise"], ["scale", "Приближение", "Scale"]],
  hover: [["none", "Без эффекта", "Off"], ["lift", "Приподнять", "Lift"], ["glow", "Подсветить", "Glow"]],
  speed: [["slow", "Медленно", "Slow"], ["normal", "Обычно", "Normal"], ["fast", "Быстро", "Fast"]],
};

const labels = {
  font: ["Шрифт", "Font"], background: ["Фон", "Background"], pattern: ["Узор", "Pattern"],
  surface: ["Поверхность карточек", "Card surface"], radius: ["Углы", "Corners"], spacing: ["Отступы", "Spacing"],
  shadow: ["Тень", "Shadow"], button: ["Стиль кнопок", "Button style"], entrance: ["Появление", "Entrance"],
  hover: ["При наведении", "Hover effect"], speed: ["Скорость анимации", "Motion speed"],
} as const satisfies Record<AppearanceKey, readonly [string, string]>;

const copy = {
  ru: {
    heading: "Оформление страницы", intro: "Начните с темы, затем добавьте свой характер.", presets: "Готовые темы",
    sample: "Живой пример", sampleTitle: "Место для вашей идеи", sampleText: "Консультации и полезные материалы",
    sampleAction: "Обсудить задачу", previewNote: "Только пример. Страница не публикуется.", replay: "Повторить анимацию",
    accent: "Акцентный цвет", advanced: "Фон и карточки", motion: "Анимация и эффекты", reset: "Сбросить оформление",
    resetNote: "Вернуть исходную тему и её акцентный цвет.",
    reducedMotion: "Системная настройка уменьшения движения всегда важнее выбранных эффектов.",
    blockHeading: "Эффекты блока", blockNote: "Оставьте эффекты страницы или выберите свои для этого блока.",
  },
  en: {
    heading: "Page appearance", intro: "Start with a theme, then make it yours.", presets: "Presets",
    sample: "Live sample", sampleTitle: "A space for your ideas", sampleText: "Conversations and useful resources",
    sampleAction: "Let’s talk", previewNote: "Preview only. This does not publish your page.", replay: "Replay animation",
    accent: "Accent color", advanced: "Background and cards", motion: "Motion and effects", reset: "Reset appearance",
    resetNote: "Restore the original theme and its accent color.",
    reducedMotion: "Your device’s reduced motion setting always takes priority.",
    blockHeading: "Block effects", blockNote: "Use the page effects or choose your own for this block.",
  },
} as const;

function SelectField<T extends string>({ label, value, options, locale, onChange, describedBy }: {
  label: string; value: T; options: readonly Choice<T>[]; locale: Locale; onChange: (value: T) => void; describedBy?: string;
}) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <select value={value} aria-describedby={describedBy} onChange={event => {
        const choice = options.find(option => option[0] === event.target.value);
        if (choice) onChange(choice[0]);
      }}>
        {options.map(([key, ru, en]) => <option key={key} value={key}>{locale === "ru" ? ru : en}</option>)}
      </select>
    </label>
  );
}

export function AppearanceControls({ page, locale, onChange }: { page: Page; locale: Locale; onChange: (page: Page) => void }) {
  const id = useId();
  const [replay, setReplay] = useState(0);
  const text = copy[locale];
  const appearance = appearanceOf(page.appearance);
  const motionNoteId = `${id}-motion-note`;

  function field<K extends AppearanceKey>(key: K) {
    return <SelectField<PageAppearance[K]>
      key={key}
      label={labels[key][locale === "ru" ? 0 : 1]}
      locale={locale}
      value={appearance[key]}
      options={choices[key]}
      describedBy={key === "entrance" || key === "hover" || key === "speed" ? motionNoteId : undefined}
      onChange={value => onChange({ ...page, appearance: { ...appearance, [key]: value } })}
    />;
  }

  return (
    <section className={styles.panel} aria-labelledby={`${id}-heading`}>
      <header className={styles.heading}>
        <h3 id={`${id}-heading`}>{text.heading}</h3>
        <p>{text.intro}</p>
      </header>

      <fieldset className={styles.presetField}>
        <legend>{text.presets}</legend>
        <div className={styles.presets}>
          {APPEARANCE_PRESETS.map(preset => (
            <button
              key={preset.id}
              type="button"
              className={styles.preset}
              aria-pressed={appearance.theme === preset.id}
              data-appearance-preset={preset.id}
              aria-describedby={`${id}-preset-${preset.id}`}
              onClick={() => onChange(applyAppearancePreset(page, preset.id))}
            >
              <span className={styles.swatch} style={appearanceVariables(preset.appearance, preset.accent)} {...appearanceAttributes(preset.appearance)} aria-hidden="true">
                <span className={styles.swatchCard}><span /><span /><i /></span>
                {appearance.theme === preset.id && <span className={styles.selectedMark}>✓</span>}
              </span>
              <span className={styles.presetName}>{preset.name[locale]}</span>
              <span id={`${id}-preset-${preset.id}`} className={styles.srOnly}>{preset.description[locale]}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <figure className={styles.preview}>
        <figcaption className={styles.previewHeading}>
          <span>{text.sample}</span>
          <button type="button" className={styles.replay} onClick={() => setReplay(value => value + 1)} aria-describedby={motionNoteId}>
            <span aria-hidden="true">↻</span>{text.replay}
          </button>
        </figcaption>
        <div className={styles.sample} style={appearanceVariables(appearance, page.accent)} {...appearanceAttributes(appearance)} aria-label={text.sample} role="group">
          <div key={`${appearance.entrance}-${appearance.speed}-${replay}`} className={styles.sampleMotion}>
            <div className={styles.sampleCard}>
              <span className={styles.sampleTitle}>{text.sampleTitle}</span>
              <p>{text.sampleText}</p>
              <span className={styles.sampleButton}>{text.sampleAction}<span aria-hidden="true">↗</span></span>
            </div>
          </div>
        </div>
        <p className={styles.note}>{text.previewNote}</p>
      </figure>

      <div className={styles.fields}>
        <label className={`${styles.field} ${styles.accentField}`}>
          <span>{text.accent}</span>
          <span className={styles.colorControl}>
            <input type="color" value={page.accent} onChange={event => onChange({ ...page, accent: event.target.value })} />
            <span aria-hidden="true">{page.accent.toUpperCase()}</span>
          </span>
        </label>
        {field("font")}
      </div>

      <details className={styles.details}>
        <summary>{text.advanced}<span aria-hidden="true">+</span></summary>
        <div className={styles.fields}>
          {field("background")}{field("pattern")}{field("surface")}{field("radius")}
          {field("spacing")}{field("shadow")}{field("button")}
        </div>
      </details>
      <details className={styles.details}>
        <summary>{text.motion}<span aria-hidden="true">+</span></summary>
        <div className={styles.fields}>{field("entrance")}{field("hover")}{field("speed")}</div>
      </details>
      <p className={styles.note} id={motionNoteId}>{text.reducedMotion}</p>
      <div className={styles.resetRow}>
        <button type="button" className={styles.reset} aria-describedby={`${id}-reset-note`} onClick={() => onChange(applyAppearancePreset(page, DEFAULT_APPEARANCE.theme))}>{text.reset}</button>
        <p className={styles.note} id={`${id}-reset-note`}>{text.resetNote}</p>
      </div>
    </section>
  );
}

export function BlockAppearanceControls({ block, locale, onChange }: { block: Block; locale: Locale; onChange: (block: Block) => void }) {
  const id = useId();
  const text = copy[locale];
  const inherit = ["inherit", "Как на странице", "Use page setting"] as const;
  const motionNoteId = `${id}-motion-note`;

  function update<K extends keyof BlockAppearance>(key: K, value: NonNullable<BlockAppearance[K]>) {
    onChange({ ...block, appearance: { ...block.appearance, [key]: value } });
  }

  return (
    <section className={`${styles.panel} ${styles.blockPanel}`} aria-labelledby={`${id}-heading`}>
      <header className={styles.heading}>
        <h3 id={`${id}-heading`}>{text.blockHeading}</h3>
        <p>{text.blockNote}</p>
      </header>
      <div className={styles.fields}>
        <SelectField<NonNullable<BlockAppearance["entrance"]>>
          label={labels.entrance[locale === "ru" ? 0 : 1]} locale={locale}
          value={block.appearance?.entrance ?? "inherit"} options={[inherit, ...choices.entrance]}
          onChange={value => update("entrance", value)} describedBy={motionNoteId}
        />
        <SelectField<NonNullable<BlockAppearance["hover"]>>
          label={labels.hover[locale === "ru" ? 0 : 1]} locale={locale}
          value={block.appearance?.hover ?? "inherit"} options={[inherit, ...choices.hover]}
          onChange={value => update("hover", value)} describedBy={motionNoteId}
        />
      </div>
      <p className={styles.note} id={motionNoteId}>{text.reducedMotion}</p>
    </section>
  );
}
