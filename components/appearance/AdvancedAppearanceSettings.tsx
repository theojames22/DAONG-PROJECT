"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Moon,
  Palette,
  RotateCcw,
  Save,
  Sparkles,
  Sun,
  Undo2,
  Wand2,
  X,
} from "lucide-react";
import { useTheme } from "@/components/theme/ThemeProvider";
import AppearancePreview from "./AppearancePreview";
import {
  COLOR_GROUPS,
  COLOR_LABELS,
  DEFAULT_LIGHT_COLORS,
  DEFAULT_DARK_COLORS,
  PRESET_BY_ID,
  THEME_PRESETS,
  applyPreset,
  cloneAppearance,
  contrastRatio,
  getContrastReport,
  markCustom,
  normalizeHex,
  pickLabelOn,
  pickReadableForeground,
  resetAllToDefault,
  resetPaletteToDefault,
  validateAppearancePreferences,
  type AppearanceColors,
  type AppearancePreferences,
  type ColorKey,
  type ContrastLevel,
  type ContrastPair,
  type Density,
  type PresetId,
  type RadiusStyle,
  type CardStyle,
  type SidebarStyle,
  type MotionPreference,
  type ResolvedTheme,
} from "@/lib/appearance";

type Feedback = { type: "success" | "error" | "info"; text: string } | null;
type ConfirmAction = "reset-theme" | "restore-all" | null;

const LEVEL_CLASS: Record<ContrastLevel, string> = {
  good: "bg-success-soft text-success",
  attention: "bg-warning-soft text-warning",
  poor: "bg-danger-soft text-danger",
};

const LEVEL_LABEL: Record<ContrastLevel, string> = {
  good: "Good",
  attention: "Needs attention",
  poor: "Poor",
};

function levelForPair(ratio: number, required: number): ContrastLevel {
  if (ratio >= required) return "good";
  if (ratio >= Math.max(3, required * 0.8)) return "attention";
  return "poor";
}

function ContrastBadge({
  ratio,
  required,
}: {
  ratio: number;
  required: number;
}) {
  const level = levelForPair(ratio, required);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${LEVEL_CLASS[level]}`}
      title={`${ratio.toFixed(2)}:1 — ${LEVEL_LABEL[level]}`}
    >
      <span
        className="h-1.5 w-1.5 rounded-full bg-current"
        aria-hidden="true"
      />
      {ratio.toFixed(2)}:1
    </span>
  );
}

function ColorField({
  colorKey,
  value,
  mode,
  colors,
  autoAdjustText,
  onChange,
  onReset,
}: {
  colorKey: ColorKey;
  value: string;
  mode: ResolvedTheme;
  colors: AppearanceColors;
  autoAdjustText: boolean;
  onChange: (value: string) => void;
  onReset: () => void;
}) {
  const [text, setText] = useState(value.toUpperCase());
  const [error, setError] = useState<string | null>(null);
  const meta = COLOR_LABELS[colorKey];

  useEffect(() => {
    setText(value.toUpperCase());
    setError(null);
  }, [value]);

  const contrast = useMemo(() => {
    let foreground = value;
    let background = colors.pageBackground;
    let required = 4.5;
    let label = "Text on page";

    if (colorKey === "pageBackground") {
      foreground = colors.mainText;
      background = value;
      label = "Main text on this background";
    } else if (colorKey === "cardBackground" || colorKey === "elevatedSurface") {
      foreground = colors.mainText;
      background = value;
      label = "Main text on this surface";
    } else if (
      colorKey === "mainText" ||
      colorKey === "secondaryText" ||
      colorKey === "mutedText"
    ) {
      const pageRatio = contrastRatio(value, colors.pageBackground);
      const cardRatio = contrastRatio(value, colors.cardBackground);
      if (cardRatio < pageRatio) {
        background = colors.cardBackground;
        label = "Text on cards";
      } else {
        background = colors.pageBackground;
        label = "Text on page";
      }
    } else if (colorKey === "border") {
      foreground = value;
      background = colors.pageBackground;
      required = 3;
      label = "Border against page";
    } else {
      foreground = pickLabelOn(value);
      background = value;
      label = "Label on this fill";
    }

    const autoAdjustable =
      colorKey === "pageBackground" ||
      colorKey === "cardBackground" ||
      colorKey === "elevatedSurface" ||
      colorKey === "mainText" ||
      colorKey === "secondaryText" ||
      colorKey === "mutedText";

    let autoAdjusted = false;
    if (autoAdjustText && autoAdjustable) {
      const adjusted = pickReadableForeground(foreground, background, required);
      if (adjusted !== foreground) {
        foreground = adjusted;
        autoAdjusted = true;
      }
    }

    const ratio = contrastRatio(foreground, background);
    return {
      foreground,
      background,
      ratio,
      required,
      label: autoAdjusted ? `${label} · auto-adjusted` : label,
    };
  }, [
    colorKey,
    value,
    colors.pageBackground,
    colors.cardBackground,
    colors.mainText,
    autoAdjustText,
  ]);

  function commit(nextText: string) {
    setText(nextText);
    const normalized = normalizeHex(nextText);
    if (!normalized) {
      setError("Use a HEX value such as #2563EB.");
      return;
    }
    setError(null);
    onChange(normalized);
  }

  return (
    <div className="rounded-xl border border-border bg-[var(--card-bg)] p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[12px] font-bold text-ink">{meta.label}</p>
          <p className="mt-0.5 text-[10.5px] leading-snug text-ink-muted">
            {meta.hint}
          </p>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="neu-focus flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ink-subtle transition-colors hover:bg-[var(--surface-2)] hover:text-ink"
          aria-label={`Reset ${meta.label} to default`}
          title={`Reset ${meta.label} to default`}
        >
          <RotateCcw className="h-3 w-3" />
        </button>
      </div>

      <div className="mt-2 flex items-center gap-1.5">
        <label
          className="relative h-9 w-10 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-border"
          style={{ backgroundColor: normalizeHex(value) ?? "#000000" }}
          title={`Choose ${meta.label} color`}
        >
          <span className="sr-only">Choose {meta.label} color</span>
          <input
            type="color"
            value={normalizeHex(value) ?? "#000000"}
            onChange={(event) => {
              const normalized = normalizeHex(event.target.value);
              if (normalized) {
                setError(null);
                onChange(normalized);
              }
            }}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label={`${meta.label} color picker`}
          />
        </label>
        <input
          value={text}
          onChange={(event) => commit(event.target.value)}
          onBlur={() => {
            if (!normalizeHex(text)) setText(value.toUpperCase());
            setError(null);
          }}
          maxLength={7}
          spellCheck={false}
          aria-label={`${meta.label} HEX value`}
          aria-invalid={Boolean(error)}
          className={`elev-pressed min-w-0 flex-1 rounded-lg px-2 py-2 font-mono text-[11.5px] uppercase text-ink outline-none ${
            error ? "ring-2 ring-[var(--danger-solid)]" : ""
          }`}
        />
        <ContrastBadge ratio={contrast.ratio} required={contrast.required} />
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        {error ? (
          <p role="alert" className="text-[10px] font-semibold text-danger">
            {error}
          </p>
        ) : (
          <p className="truncate text-[10px] text-ink-subtle">{contrast.label}</p>
        )}
        {mode === "light" && colorKey === "border" ? (
          <span className="text-[9.5px] font-semibold text-ink-subtle">AA UI</span>
        ) : null}
      </div>
    </div>
  );
}

function OptionGroup<T extends string>({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: string;
  hint?: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <p className="text-[11.5px] font-bold text-ink">{label}</p>
        {hint && <p className="text-[9.5px] text-ink-subtle">{hint}</p>}
      </div>
      <div
        className="grid gap-1 rounded-xl bg-[var(--surface-2)] p-1"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
        role="group"
        aria-label={label}
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(option.value)}
              className={`neu-focus rounded-lg px-1.5 py-1.5 text-[10.5px] font-semibold transition-all ${
                selected
                  ? "bg-[var(--card-bg)] text-ink shadow-sm"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PairRow({ pair }: { pair: ContrastPair }) {
  return (
    <div className="flex items-start justify-between gap-2 border-b border-border py-1.5 last:border-0">
      <div className="flex min-w-0 items-start gap-1.5">
        <span
          className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-black/10 text-[8px] font-black"
          style={{ backgroundColor: pair.background, color: pair.foreground }}
          aria-hidden="true"
        >
          Aa
        </span>
        <div className="min-w-0">
          <p className="text-[10.5px] font-semibold leading-tight text-ink">
            {pair.label}
          </p>
          <p className="mt-0.5 font-mono text-[9px] text-ink-subtle">
            {pair.foreground} on {pair.background} · needs {pair.required}:1
          </p>
          {!pair.passes && pair.suggestion && (
            <p className="mt-0.5 text-[9px] leading-snug text-warning">
              Try {pair.suggestion}
            </p>
          )}
        </div>
      </div>
      <ContrastBadge ratio={pair.ratio} required={pair.required} />
    </div>
  );
}

export default function AdvancedAppearanceSettings({
  onExpandedChange,
}: {
  onExpandedChange?: (expanded: boolean) => void;
}) {
  const { preferences, savePreferences, saving, theme } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState<AppearancePreferences>(() =>
    cloneAppearance(preferences)
  );
  const [editorMode, setEditorMode] = useState<ResolvedTheme>(theme);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [confirming, setConfirming] = useState<ConfirmAction>(null);

  useEffect(() => {
    setDraft(cloneAppearance(preferences));
  }, [preferences]);

  useEffect(() => {
    setEditorMode(theme);
  }, [theme]);

  useEffect(() => {
    onExpandedChange?.(expanded);
  }, [expanded, onExpandedChange]);

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(preferences),
    [draft, preferences]
  );
  const palette = draft[editorMode];
  const validation = useMemo(
    () => validateAppearancePreferences(draft),
    [draft]
  );
  const contrast = useMemo(
    () => getContrastReport(draft, editorMode),
    [draft, editorMode]
  );
  const presetName =
    palette.preset === "custom"
      ? "Custom Theme"
      : PRESET_BY_ID.get(palette.preset)?.name ?? "Custom Theme";

  function updateColor(key: ColorKey, value: string) {
    setDraft((previous) => {
      const next = cloneAppearance(previous);
      next[editorMode].colors[key] = value;
      next[editorMode].preset = "custom";
      return next;
    });
    setFeedback(null);
  }

  function resetColor(key: ColorKey) {
    const defaults =
      editorMode === "dark" ? DEFAULT_DARK_COLORS : DEFAULT_LIGHT_COLORS;
    updateColor(key, defaults[key]);
  }

  function selectPreset(id: PresetId) {
    setDraft((previous) =>
      id === "custom"
        ? markCustom(previous, editorMode)
        : applyPreset(previous, editorMode, id)
    );
    setFeedback(null);
  }

  function setOption<K extends keyof AppearancePreferences["options"]>(
    key: K,
    value: AppearancePreferences["options"][K]
  ) {
    setDraft((previous) => ({
      ...cloneAppearance(previous),
      options: { ...previous.options, [key]: value },
    }));
    setFeedback(null);
  }

  async function applyChanges() {
    setFeedback(null);
    if (validation.blocking.length > 0) {
      setFeedback({
        type: "error",
        text: "Some text/background pairs are below WCAG AA. Enable Auto-adjust or choose the suggested colors before saving.",
      });
      return;
    }
    const result = await savePreferences(draft);
    if (result.ok) {
      setFeedback({
        type: "success",
        text: "Appearance saved for your account and applied everywhere.",
      });
    } else {
      setFeedback({
        type: "error",
        text: result.error ?? "Appearance was not saved.",
      });
    }
  }

  function cancelChanges() {
    setDraft(cloneAppearance(preferences));
    setFeedback({
      type: "info",
      text: "Unsaved changes discarded. Your previously saved appearance is still active.",
    });
  }

  function confirmReset() {
    if (confirming === "reset-theme") {
      setDraft((previous) => resetPaletteToDefault(previous, editorMode));
      setFeedback({
        type: "info",
        text: `${editorMode === "dark" ? "Dark" : "Light"} palette reset to the Daong default in the preview. Choose Apply changes to save it.`,
      });
    } else if (confirming === "restore-all") {
      setDraft((previous) => {
        const next = resetAllToDefault();
        next.mode = previous.mode;
        return next;
      });
      setEditorMode("light");
      setFeedback({
        type: "info",
        text: "Light and Dark appearance restored in the preview. Choose Apply changes to save.",
      });
    }
    setConfirming(null);
  }

  const modeColors = THEME_PRESETS.map((preset) => ({
    preset,
    colors: editorMode === "dark" ? preset.dark : preset.light,
  }));

  return (
    <section className="border-t border-border px-5 py-4">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        aria-controls="advanced-appearance-panel"
        className="neu-focus flex w-full items-center justify-between gap-3 rounded-xl text-left"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary-text)]">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block text-[13.5px] font-bold text-ink">
              Advanced Appearance
            </span>
            <span className="mt-0.5 block text-[11.5px] text-ink-muted">
              Themes, custom colors, contrast checks and interface styling.
            </span>
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-ink-muted transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        />
      </button>

      {expanded && (
        <div
          id="advanced-appearance-panel"
          className="mt-4 space-y-4"
        >
          {/* Palette editor tab */}
          <div className="rounded-2xl border border-border bg-[var(--surface-2)] p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="flex items-center gap-1.5 text-[12px] font-bold text-ink">
                  <Palette className="h-3.5 w-3.5 text-[var(--primary-text)]" aria-hidden="true" />
                  Palette
                </p>
                <p className="mt-0.5 text-[10.5px] text-ink-muted">
                  Light and Dark palettes are saved independently. Editing one never changes the other.
                </p>
              </div>
              <div
                className="flex rounded-full border border-border bg-[var(--card-bg)] p-0.5"
                role="group"
                aria-label="Palette to edit"
              >
                {(
                  [
                    { mode: "light" as const, label: "Light", Icon: Sun },
                    { mode: "dark" as const, label: "Dark", Icon: Moon },
                  ]
                ).map(({ mode, label, Icon }) => (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={editorMode === mode}
                    onClick={() => setEditorMode(mode)}
                    className={`neu-focus flex items-center gap-1 rounded-full px-2.5 py-1 text-[10.5px] font-bold transition-colors ${
                      editorMode === mode
                        ? "bg-[var(--primary)] text-[var(--on-primary)]"
                        : "text-ink-muted hover:text-ink"
                    }`}
                  >
                    <Icon className="h-3 w-3" aria-hidden="true" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold text-ink">
                Ready-made themes
                <span className="ml-1.5 font-normal text-ink-muted">
                  Selected: {presetName}
                </span>
              </p>
              <span className="text-[9.5px] font-semibold text-ink-subtle">
                {editorMode === "dark" ? "Dark palette" : "Light palette"}
              </span>
            </div>

            <div className="mt-2 grid max-h-[270px] gap-2 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
              {modeColors.map(({ preset, colors }) => {
                const selected = palette.preset === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => selectPreset(preset.id)}
                    aria-pressed={selected}
                    className={`neu-focus rounded-xl border p-2 text-left transition-all ${
                      selected
                        ? "border-[var(--primary)] bg-[var(--primary-soft)] shadow-sm"
                        : "border-border bg-[var(--card-bg)] hover:border-[var(--primary-border)]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="flex gap-1" aria-hidden="true">
                        {[colors.primary, colors.accent, colors.cardBackground, colors.mainText].map(
                          (color, index) => (
                            <span
                              key={`${preset.id}-${index}`}
                              className="h-3.5 w-3.5 rounded-full border border-black/10"
                              style={{ backgroundColor: color }}
                            />
                          )
                        )}
                      </span>
                      {selected && (
                        <Check
                          className="h-3.5 w-3.5 text-[var(--primary-text)]"
                          aria-hidden="true"
                        />
                      )}
                    </div>
                    <p className="mt-1.5 text-[10.5px] font-bold leading-tight text-ink">
                      {preset.name}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-[9px] leading-snug text-ink-muted">
                      {preset.description}
                    </p>
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => selectPreset("custom")}
                aria-pressed={palette.preset === "custom"}
                className={`neu-focus rounded-xl border p-2 text-left transition-all ${
                  palette.preset === "custom"
                    ? "border-[var(--primary)] bg-[var(--primary-soft)] shadow-sm"
                    : "border-dashed border-border bg-[var(--card-bg)] hover:border-[var(--primary-border)]"
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="flex gap-1" aria-hidden="true">
                    {[
                      palette.colors.primary,
                      palette.colors.accent,
                      palette.colors.cardBackground,
                      palette.colors.mainText,
                    ].map((color, index) => (
                      <span
                        key={`custom-${index}`}
                        className="h-3.5 w-3.5 rounded-full border border-black/10"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </span>
                  {palette.preset === "custom" && (
                    <Check
                      className="h-3.5 w-3.5 text-[var(--primary-text)]"
                      aria-hidden="true"
                    />
                  )}
                </div>
                <p className="mt-1.5 text-[10.5px] font-bold leading-tight text-ink">
                  Custom Theme
                </p>
                <p className="mt-0.5 text-[9px] leading-snug text-ink-muted">
                  Your own colors. Editing any swatch switches here automatically.
                </p>
              </button>
            </div>
          </div>

          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
            <div className="space-y-4">
              {/* Custom colors */}
              <div className="rounded-2xl border border-border bg-[var(--surface-2)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-[12px] font-bold text-ink">
                    <Wand2 className="h-3.5 w-3.5 text-[var(--primary-text)]" aria-hidden="true" />
                    Custom colors
                  </p>
                  <span className="text-[9.5px] font-semibold text-ink-subtle">
                    Changes mark this palette as Custom
                  </span>
                </div>

                <div className="mt-3 space-y-3">
                  {COLOR_GROUPS.map((group) => (
                    <div key={group.id}>
                      <p className="text-[10.5px] font-bold uppercase tracking-wide text-ink-muted">
                        {group.title}
                      </p>
                      <p className="mb-1.5 text-[9.5px] text-ink-subtle">
                        {group.description}
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {group.keys.map((key) => (
                          <ColorField
                            key={key}
                            colorKey={key}
                            value={palette.colors[key]}
                            mode={editorMode}
                            colors={palette.colors}
                            autoAdjustText={draft.options.autoAdjustText}
                            onChange={(value) => updateColor(key, value)}
                            onReset={() => resetColor(key)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Additional styling */}
              <div className="rounded-2xl border border-border bg-[var(--surface-2)] p-3">
                <p className="text-[12px] font-bold text-ink">Interface styling</p>
                <p className="mt-0.5 text-[10.5px] text-ink-muted">
                  These shared options apply to both palettes.
                </p>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <OptionGroup<Density>
                    label="Interface density"
                    value={draft.options.density}
                    options={[
                      { value: "comfortable", label: "Comfortable" },
                      { value: "compact", label: "Compact" },
                    ]}
                    onChange={(value) => setOption("density", value)}
                  />
                  <OptionGroup<RadiusStyle>
                    label="Border radius"
                    value={draft.options.radius}
                    options={[
                      { value: "sharp", label: "Sharp" },
                      { value: "rounded", label: "Rounded" },
                      { value: "extra-rounded", label: "Extra" },
                    ]}
                    onChange={(value) => setOption("radius", value)}
                  />
                  <OptionGroup<CardStyle>
                    label="Card appearance"
                    value={draft.options.cardStyle}
                    options={[
                      { value: "border", label: "Border" },
                      { value: "shadow", label: "Shadow" },
                      { value: "elevated", label: "Elevated" },
                    ]}
                    onChange={(value) => setOption("cardStyle", value)}
                  />
                  <OptionGroup<SidebarStyle>
                    label="Sidebar appearance"
                    value={draft.options.sidebarStyle}
                    options={[
                      { value: "default", label: "Default" },
                      { value: "subtle", label: "Subtle" },
                      { value: "elevated", label: "Elevated" },
                    ]}
                    onChange={(value) => setOption("sidebarStyle", value)}
                  />
                  <OptionGroup<MotionPreference>
                    label="Animation"
                    hint="OS reduced motion is always respected"
                    value={draft.options.motion}
                    options={[
                      { value: "full", label: "Full motion" },
                      { value: "reduced", label: "Reduced" },
                    ]}
                    onChange={(value) => setOption("motion", value)}
                  />
                </div>

                <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-xl border border-border bg-[var(--card-bg)] p-2.5">
                  <input
                    type="checkbox"
                    checked={draft.options.autoAdjustText}
                    onChange={(event) =>
                      setOption("autoAdjustText", event.target.checked)
                    }
                    className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
                  />
                  <span className="min-w-0">
                    <span className="block text-[11.5px] font-bold text-ink">
                      Auto-adjust text colors
                    </span>
                    <span className="mt-0.5 block text-[10px] leading-snug text-ink-muted">
                      Recommended. Derives readable foreground colors for every surface
                      while keeping your selected backgrounds. Manually chosen colors
                      are never overwritten.
                    </span>
                  </span>
                </label>
              </div>
            </div>

            {/* Preview + contrast */}
            <div className="space-y-3 xl:sticky xl:top-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[12px] font-bold text-ink">Live theme preview</p>
                <span className="text-[9.5px] font-semibold text-ink-subtle">
                  Updates instantly · not saved yet
                </span>
              </div>
              <AppearancePreview preferences={draft} mode={editorMode} />

              <div className="rounded-2xl border border-border bg-[var(--surface-2)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[12px] font-bold text-ink">
                    Contrast check · {editorMode === "dark" ? "Dark" : "Light"}
                  </p>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      contrast.blocking.length === 0
                        ? LEVEL_CLASS.good
                        : LEVEL_CLASS.poor
                    }`}
                  >
                    {contrast.blocking.length === 0 ? (
                      <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                    ) : (
                      <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                    )}
                    {contrast.blocking.length === 0
                      ? "WCAG AA ready"
                      : `${contrast.blocking.length} blocking issue${
                          contrast.blocking.length === 1 ? "" : "s"
                        }`}
                  </span>
                </div>

                {contrast.adjustments.length > 0 && (
                  <div className="mt-2 rounded-lg border border-border bg-[var(--card-bg)] p-2">
                    <p className="flex items-center gap-1 text-[10px] font-bold text-ink">
                      <Wand2 className="h-3 w-3 text-[var(--primary-text)]" aria-hidden="true" />
                      Auto-adjusted for readability
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {contrast.adjustments.slice(0, 4).map((item, index) => (
                        <li
                          key={`${item.key}-${item.surface}-${index}`}
                          className="font-mono text-[9px] leading-snug text-ink-muted"
                        >
                          {item.label} on {item.surface}: {item.from} →{" "}
                          <span className="font-bold text-ink">{item.to}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1 text-[9px] text-ink-subtle">
                      Your swatches are preserved; only the derived text token changes.
                    </p>
                  </div>
                )}

                <div className="mt-2 max-h-[230px] overflow-y-auto pr-1">
                  {contrast.pairs.map((pair) => (
                    <PairRow key={pair.id} pair={pair} />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {validation.blocking.length > 0 && (
            <div
              role="alert"
              className="rounded-xl border border-[var(--danger-border)] bg-[var(--danger-soft)] p-3 text-danger"
            >
              <p className="flex items-center gap-1.5 text-[11.5px] font-bold">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                Fix these before saving
              </p>
              <ul className="mt-1 list-inside list-disc space-y-0.5 text-[10px] leading-snug">
                {validation.errors.slice(0, 4).map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
              <p className="mt-1 text-[9.5px]">
                Tip: turn on Auto-adjust text colors, or choose a color with more
                contrast against its background.
              </p>
            </div>
          )}

          {feedback && (
            <p
              role={feedback.type === "error" ? "alert" : "status"}
              className={`flex items-start gap-1.5 rounded-xl border p-2.5 text-[11px] font-semibold ${
                feedback.type === "success"
                  ? "border-[var(--success-border)] bg-[var(--success-soft)] text-success"
                  : feedback.type === "error"
                    ? "border-[var(--danger-border)] bg-[var(--danger-soft)] text-danger"
                    : "border-border bg-[var(--surface-2)] text-ink-muted"
              }`}
            >
              {feedback.type === "success" ? (
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              ) : feedback.type === "error" ? (
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              ) : (
                <Undo2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              )}
              {feedback.text}
            </p>
          )}

          {confirming && (
            <div
              role="alertdialog"
              aria-labelledby="appearance-confirm-title"
              className="rounded-xl border border-[var(--warning-border)] bg-[var(--warning-soft)] p-3"
            >
              <p
                id="appearance-confirm-title"
                className="text-[11.5px] font-bold text-warning"
              >
                {confirming === "reset-theme"
                  ? `Reset the ${editorMode === "dark" ? "Dark" : "Light"} palette?`
                  : "Restore both Light and Dark defaults?"}
              </p>
              <p className="mt-0.5 text-[10px] leading-snug text-warning">
                {confirming === "reset-theme"
                  ? "This replaces the current palette in the preview with the original Daong palette. Nothing is saved until you choose Apply changes."
                  : "This resets both palettes and all styling options in the preview. Nothing is saved until you choose Apply changes."}
              </p>
              <div className="mt-2 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirming(null)}
                  className="btn-secondary !px-3 !py-1.5 !text-[10.5px]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmReset}
                  className="btn-primary !px-3 !py-1.5 !text-[10.5px]"
                >
                  Yes, reset preview
                </button>
              </div>
            </div>
          )}

          <div className="sticky bottom-0 z-10 -mx-5 mt-1 flex flex-wrap items-center justify-between gap-2 border-t border-border bg-[var(--elevated-surface)] px-5 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={applyChanges}
                disabled={saving || !dirty || validation.blocking.length > 0}
                className="btn-primary !text-[12px]"
                title={
                  validation.blocking.length > 0
                    ? "Fix the contrast issues before saving"
                    : !dirty
                      ? "No unsaved changes"
                      : undefined
                }
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                {saving ? "Saving…" : "Apply changes"}
              </button>
              <button
                type="button"
                onClick={cancelChanges}
                disabled={saving || !dirty}
                className="btn-secondary !text-[12px]"
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setConfirming("reset-theme")}
                disabled={saving}
                className="neu-focus rounded-lg px-2 py-1.5 text-[10.5px] font-semibold text-ink-muted hover:bg-[var(--surface-2)] hover:text-ink"
              >
                <RotateCcw className="mr-1 inline h-3 w-3" aria-hidden="true" />
                Reset theme
              </button>
              <button
                type="button"
                onClick={() => setConfirming("restore-all")}
                disabled={saving}
                className="neu-focus rounded-lg px-2 py-1.5 text-[10.5px] font-semibold text-ink-muted hover:bg-[var(--danger-soft)] hover:text-danger"
              >
                Restore all defaults
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
