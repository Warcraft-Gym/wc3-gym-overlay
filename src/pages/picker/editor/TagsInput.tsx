import { TagChip } from "../../../components/BuildBadges";
import { TextField } from "../../../components/TextField";

/**
 * Comma-separated tags, entered as one text field (same input model as the
 * site's submission form) with a live chip preview underneath so the
 * lowercase/dedupe-free/8-cap transform (`buildEditorSchema.ts`) is visible
 * before Save rather than a surprise afterwards.
 */
export function TagsInput({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
}) {
  const preview = value
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 8);

  return (
    <div>
      <TextField
        label="Tags"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="rush, fast-expand, safe"
        error={error}
      />
      {preview.length ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {preview.map((tag, i) => (
            <TagChip key={`${tag}-${i}`}>{tag}</TagChip>
          ))}
        </div>
      ) : null}
    </div>
  );
}
