import { useMemo, useState } from "react";
import { Button } from "../../../components/Button";
import { IconButton } from "../../../components/IconButton";
import { Modal } from "../../../components/Modal";
import {
  blankEditorForm,
  createEditorFormSchema,
  flattenEditorErrors,
  fromBuild,
  toLocalBuildInput,
  type EditorFieldErrors,
  type EditorFormInput,
  type EditorStepInput,
} from "../../../lib/buildEditorSchema";
import { createLocalBuild, deleteLocalBuild, duplicateAsLocal, updateLocalBuild } from "../../../lib/localBuilds";
import { readLocalBuilds, writeLocalBuilds } from "../../../data/localBuildsStore";
import { isLocalBuild, type AnyBuild } from "../../../data/useAllBuilds";
import { useIcons } from "../../../data/useIcons";
import { SELECTED_BUILD_SLUG } from "../../../store/keys";
import { writeKey } from "../../../store/state";
import { MetaFields } from "./MetaFields";
import { StepsEditor } from "./StepsEditor";

export type BuildEditorMode = "new" | "edit" | "duplicate";

/** A small confirm strip rendered inside the modal itself (never
 *  `window.confirm`, which the app can't reliably intercept/test and which
 *  looks nothing like the rest of the UI). */
function ConfirmBar({
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-4 flex items-center justify-between rounded border border-gold/50 bg-gold/10 p-3">
      <p className="text-sm text-fg">{message}</p>
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Keep editing
        </Button>
        <Button variant="danger" size="sm" onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}

function labelFor(mode: BuildEditorMode): string {
  if (mode === "new") return "New private build";
  if (mode === "duplicate") return "Duplicate build";
  return "Edit private build";
}

/** Full-width editor modal for create/edit/duplicate. Saving always goes
 *  through `lib/localBuilds.ts`'s pure helpers plus the read/write pair in
 *  `data/localBuildsStore.ts` — this component owns form state and
 *  validation only, never touches `localStorage` directly. */
export function BuildEditorModal({
  mode,
  sourceBuild,
  apiBase,
  allBuilds,
  onClose,
  initialValues,
}: {
  mode: BuildEditorMode;
  /** The build being edited (mode "edit") or copied from (mode
   *  "duplicate"). Ignored (and may be omitted) for mode "new". */
  sourceBuild?: AnyBuild | null;
  apiBase: string;
  allBuilds: AnyBuild[];
  onClose: () => void;
  /** F002: when provided (mode "new" only — a replay import), seeds the
   *  form with these values instead of the blank defaults. Nothing else
   *  about "new" mode changes — the user still has to hit Save. */
  initialValues?: EditorFormInput;
}) {
  const { icons } = useIcons(apiBase, allBuilds);

  const [form, setForm] = useState<EditorFormInput>(() => {
    if (mode === "edit" && sourceBuild) return fromBuild(sourceBuild);
    if (mode === "duplicate" && sourceBuild) return fromBuild(duplicateAsLocal(sourceBuild));
    if (initialValues) return initialValues;
    return blankEditorForm();
  });
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<EditorFieldErrors>({});
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const knownIconKeys = useMemo(() => new Set(icons.map((icon) => icon.key)), [icons]);
  const schema = useMemo(
    () => createEditorFormSchema((key) => knownIconKeys.size === 0 || knownIconKeys.has(key)),
    [knownIconKeys],
  );

  function updateForm(patch: Partial<EditorFormInput>) {
    setForm((current) => ({ ...current, ...patch }));
    setDirty(true);
  }

  function updateSteps(steps: EditorStepInput[]) {
    updateForm({ steps });
  }

  function requestClose() {
    if (dirty && !confirmDiscard) {
      setConfirmDiscard(true);
      return;
    }
    onClose();
  }

  async function handleSave() {
    const result = schema.safeParse(form);
    if (!result.success) {
      setErrors(flattenEditorErrors(result.error));
      return;
    }
    setErrors({});
    const input = toLocalBuildInput(result.data, apiBase);

    if (mode === "edit" && sourceBuild && isLocalBuild(sourceBuild)) {
      await writeLocalBuilds(updateLocalBuild(readLocalBuilds(), sourceBuild.slug, input));
      onClose();
      return;
    }

    const created = createLocalBuild(input);
    await writeLocalBuilds([...readLocalBuilds(), created]);
    await writeKey(SELECTED_BUILD_SLUG, created.slug);
    onClose();
  }

  async function handleDelete() {
    if (!sourceBuild) return;
    await writeLocalBuilds(deleteLocalBuild(readLocalBuilds(), sourceBuild.slug));
    onClose();
  }

  const label = labelFor(mode);
  const errorMessages = Object.entries(errors);

  return (
    <Modal label={label} onClose={requestClose} widthClassName="w-[min(52rem,calc(100vw-2rem))]">
      <div className="flex items-center justify-between">
        <h2 className="text-base">{label}</h2>
        <IconButton aria-label="Close editor" onClick={requestClose}>
          ×
        </IconButton>
      </div>

      {errorMessages.length > 0 ? (
        <div role="alert" className="mt-3 rounded border border-loss/50 bg-loss/10 p-3 text-xs text-loss">
          <p className="font-bold uppercase tracking-wide">Fix the highlighted fields</p>
          <ul className="mt-1 list-disc pl-4">
            {errorMessages.map(([key, message]) => (
              <li key={key}>{message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 flex flex-col gap-6">
        <MetaFields form={form} apiBase={apiBase} errors={errors} onChange={updateForm} />
        <StepsEditor steps={form.steps} icons={icons} errors={errors} onChange={updateSteps} />
      </div>

      <div className="mt-6 flex items-center justify-between gap-2 border-t border-line/60 pt-4">
        <div>
          {mode === "edit" ? (
            <Button variant="danger" onClick={() => setConfirmDelete(true)}>
              Delete
            </Button>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={requestClose}>
            Cancel
          </Button>
          <Button variant="gold" onClick={() => void handleSave()}>
            Save
          </Button>
        </div>
      </div>

      {confirmDiscard ? (
        <ConfirmBar
          message="Discard changes?"
          confirmLabel="Discard"
          onConfirm={onClose}
          onCancel={() => setConfirmDiscard(false)}
        />
      ) : null}
      {confirmDelete ? (
        <ConfirmBar
          message="Delete this build?"
          confirmLabel="Delete"
          onConfirm={() => void handleDelete()}
          onCancel={() => setConfirmDelete(false)}
        />
      ) : null}
    </Modal>
  );
}
