import { useState, type SyntheticEvent } from "react";
import { TextField } from "../../../components/TextField";
import { DIFFICULTY_VALUES, type EditorFieldErrors, type EditorFormInput } from "../../../lib/buildEditorSchema";
import { CREST_OPTIONS, RaceCrest } from "../RaceCrestPicker";
import { TagsInput } from "./TagsInput";

const OWN_RACE_OPTIONS = CREST_OPTIONS.filter((id) => id !== "any");

/**
 * The "Build" section: title, race/opponents crest pickers (reused from
 * `FilterBar`'s `RaceCrestPicker`, not a plain `<select>`, so the editor
 * feels like part of the same product), difficulty, patch, tags, summary
 * with a live counter, author, and a collapsed "More fields" group for the
 * site-only optional fields (Discord, source URL, description) — kept out
 * of the way since most private builds never need them.
 */
export function MetaFields({
  form,
  apiBase,
  errors,
  onChange,
}: {
  form: EditorFormInput;
  apiBase: string;
  errors: EditorFieldErrors;
  onChange: (patch: Partial<EditorFormInput>) => void;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(
    Boolean(form.authorDiscord || form.sourceUrl || form.description),
  );

  function handleToggle(event: SyntheticEvent<HTMLDetailsElement>) {
    setAdvancedOpen(event.currentTarget.open);
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="kicker">Build</p>

      <TextField label="Title" value={form.title} onChange={(e) => onChange({ title: e.target.value })} error={errors.title} />

      <div>
        <span className="mb-1.5 block font-mono text-xs uppercase tracking-[0.14em] text-faint">Race</span>
        <div role="radiogroup" aria-label="Race" className="flex gap-2">
          {OWN_RACE_OPTIONS.map((id) => (
            <RaceCrest key={id} id={id} apiBase={apiBase} active={form.race === id} onClick={() => onChange({ race: id })} />
          ))}
        </div>
        {errors.race ? (
          <span role="alert" className="mt-1 block text-[0.7rem] text-loss">
            {errors.race}
          </span>
        ) : null}
      </div>

      <div>
        <span className="mb-1.5 block font-mono text-xs uppercase tracking-[0.14em] text-faint">
          Opponents (empty = any)
        </span>
        <div role="group" aria-label="Opponents" className="flex gap-2">
          {OWN_RACE_OPTIONS.map((id) => {
            const active = form.vsRaces.includes(id);
            return (
              <RaceCrest
                key={id}
                id={id}
                apiBase={apiBase}
                active={active}
                onClick={() =>
                  onChange({ vsRaces: active ? form.vsRaces.filter((race) => race !== id) : [...form.vsRaces, id] })
                }
              />
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <label className="block text-xs">
          <span className="mb-1 block font-mono uppercase tracking-[0.14em] text-faint">Difficulty</span>
          <select
            value={form.difficulty}
            onChange={(e) => onChange({ difficulty: e.target.value })}
            aria-invalid={errors.difficulty ? "true" : undefined}
            className="h-9 w-full rounded border border-line bg-surface-2/60 px-2.5 text-sm text-fg outline-none focus:border-gold/60"
          >
            <option value="">Pick difficulty</option>
            {DIFFICULTY_VALUES.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
          {errors.difficulty ? (
            <span role="alert" className="mt-1 block text-[0.7rem] text-loss">
              {errors.difficulty}
            </span>
          ) : null}
        </label>
        <TextField label="Patch (optional)" value={form.patch} onChange={(e) => onChange({ patch: e.target.value })} error={errors.patch} />
      </div>

      <TagsInput value={form.tags} onChange={(tags) => onChange({ tags })} error={errors.tags} />

      <label className="block text-xs">
        <span className="mb-1 flex items-center justify-between font-mono uppercase tracking-[0.14em] text-faint">
          <span>Summary</span>
          <span className="tnum">{form.summary.length}/200</span>
        </span>
        <textarea
          rows={3}
          maxLength={200}
          value={form.summary}
          onChange={(e) => onChange({ summary: e.target.value })}
          aria-invalid={errors.summary ? "true" : undefined}
          className="w-full rounded border border-line bg-surface-2/60 p-2.5 text-sm text-fg outline-none focus:border-gold/60"
        />
        {errors.summary ? (
          <span role="alert" className="mt-1 block text-[0.7rem] text-loss">
            {errors.summary}
          </span>
        ) : null}
      </label>

      <TextField label="Author" value={form.author} onChange={(e) => onChange({ author: e.target.value })} error={errors.author} />

      <details open={advancedOpen} onToggle={handleToggle}>
        <summary className="cursor-pointer font-mono text-xs uppercase tracking-[0.14em] text-faint hover:text-gold">
          More fields (optional)
        </summary>
        <div className="mt-3 flex flex-col gap-3">
          <TextField
            label="Discord (optional)"
            value={form.authorDiscord}
            onChange={(e) => onChange({ authorDiscord: e.target.value })}
            error={errors.authorDiscord}
          />
          <TextField
            label="Source URL (optional)"
            value={form.sourceUrl}
            onChange={(e) => onChange({ sourceUrl: e.target.value })}
            error={errors.sourceUrl}
          />
          <label className="block text-xs">
            <span className="mb-1 block font-mono uppercase tracking-[0.14em] text-faint">Description (optional)</span>
            <textarea
              rows={4}
              maxLength={6000}
              value={form.description}
              onChange={(e) => onChange({ description: e.target.value })}
              className="w-full rounded border border-line bg-surface-2/60 p-2.5 text-sm text-fg outline-none focus:border-gold/60"
            />
          </label>
        </div>
      </details>
    </div>
  );
}
