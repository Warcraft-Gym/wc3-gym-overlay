import { RefreshCw, Settings as SettingsIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "../../../components/Button";
import { relativeTime } from "../../../lib/relativeTime";
import { isValidBattleTag } from "../../../opponentWatcher";
import { refreshProfile } from "../../../profileLoader";
import { OPPONENT, PROFILE, SETTINGS } from "../../../store/keys";
import { updateKey } from "../../../store/state";
import type { ProfilePick } from "../../../w3c/profile";
import { useStoreValue } from "../../../store/useStore";
import { ProfileView } from "./ProfileView";

/** Reloads the profile when the tab opens and when a game you were in ends
 *  (the opponent card's `live` going from true to false). */
function useProfileRefresh(): void {
  const live = useStoreValue(OPPONENT).live;
  const wasLive = useRef(live);
  useEffect(() => {
    void refreshProfile();
  }, []);
  useEffect(() => {
    if (wasLive.current && !live) void refreshProfile({ force: true });
    wasLive.current = live;
  }, [live]);
}

/** The Profile tab: your own W3Champions stats, or the state explaining
 *  why there are none yet. */
export function ProfileTab({ onOpenSettings }: { onOpenSettings: () => void }) {
  const settings = useStoreValue(SETTINGS);
  const state = useStoreValue(PROFILE);
  const [now, setNow] = useState(() => Date.now());
  useProfileRefresh();
  useEffect(() => setNow(Date.now()), [state.fetchedAt]);

  const tag = settings.myBattleTag;
  if (!tag || !isValidBattleTag(tag)) {
    return (
      <section className="panel flex flex-col items-start gap-3 p-6">
        <h2 className="font-display text-lg uppercase tracking-[0.06em]">Your profile</h2>
        <p className="text-sm text-muted">Set your W3Champions BattleTag to see your matchups, maps, form and play style.</p>
        <Button variant="gold" onClick={onOpenSettings}>
          <SettingsIcon size={16} aria-hidden /> Open Settings
        </Button>
      </section>
    );
  }

  const sameTag = state.tag?.toLowerCase() === tag.toLowerCase();
  const profile = sameTag ? state.profile : null;
  const loading = state.status === "loading" || state.status === "idle";

  const refresh = (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" onClick={() => void refreshProfile({ force: true })} disabled={loading} aria-label="Refresh profile">
        <RefreshCw size={14} aria-hidden className={loading ? "animate-spin" : undefined} /> Refresh
      </Button>
      {state.fetchedAt ? <p className="text-xs text-faint">Updated {relativeTime(state.fetchedAt, now)}</p> : null}
    </div>
  );

  if (state.status === "error" && sameTag) {
    return (
      <section className="panel flex flex-col items-start gap-3 p-6">
        <p role="alert" className="text-sm text-loss">
          {state.error}
        </p>
        <Button onClick={() => void refreshProfile({ force: true })}>Try again</Button>
      </section>
    );
  }
  if (!profile) {
    return (
      <section className="panel p-6">
        <p className="text-sm text-muted">{loading ? `Loading ${tag}'s W3Champions games…` : `No 1v1 games found for ${tag} in the last two seasons.`}</p>
      </section>
    );
  }
  async function pickRace(race: ProfilePick): Promise<void> {
    await updateKey(SETTINGS, (s) => ({ ...s, profileRace: race }));
    await refreshProfile();
  }
  return <ProfileView profile={profile} apiBase={settings.apiBase} actions={refresh} onRace={(race) => void pickRace(race)} />;
}
