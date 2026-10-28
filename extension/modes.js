// Shared by the popup, worker and runner. Old data defaults to the unfollow mode.
globalThis.FollowbackModes = (() => {
  const modes = {
    unfollow: {
      title: "Deixar de seguir quem não me segue",
      heading: "Automatizar os unfollows",
      candidatesLabel: "não seguem de volta",
      actionLabel: "Deixar de seguir",
      confirmedLabel: "unfollow(s) confirmado(s)",
      copy: "A extensão visita os perfis que você segue e que não aparecem nos seguidores, e confirma “Deixar de seguir” automaticamente.",
      csv: "instagram-nao-seguem-de-volta.csv",
      logCsv: "instagram-unfollow-log.csv",
      successStatuses: ["unfollowed", "already_not_following"],
    },
    remove_follower: {
      title: "Remover seguidores que não sigo",
      heading: "Automatizar a remoção de seguidores",
      candidatesLabel: "seguidores que não sigo",
      actionLabel: "Remover seguidores",
      confirmedLabel: "seguidor(es) removido(s)",
      copy: "Usa os mesmos arquivos da Meta. A extensão confere o perfil, procura o @ na sua lista de seguidores e confirma “Remover”. Abra seu próprio perfil antes de iniciar. Perfis que você passou a seguir são pulados.",
      csv: "instagram-seguidores-que-nao-sigo.csv",
      logCsv: "instagram-remocao-seguidores-log.csv",
      successStatuses: ["follower_removed", "now_following"],
    },
  };
  const normalize = (mode) => mode === "remove_follower" ? mode : "unfollow";
  const info = (mode) => modes[normalize(mode)];
  const candidates = (dataset, mode) => normalize(mode) === "remove_follower"
    ? dataset?.removalCandidates || [] : dataset?.candidates || [];
  const progress = (saved, mode) => {
    const key = normalize(mode);
    const value = saved.progressByMode?.[key];
    if (Array.isArray(value)) return value;
    return key === "unfollow" && Array.isArray(saved.progress) ? saved.progress : [];
  };
  const mergeProgress = (saved, state) => {
    const merged = {
      unfollow: [...progress(saved, "unfollow")],
      remove_follower: [...progress(saved, "remove_follower")],
    };
    if (saved.progressByMode?.ignoredRuns) merged.ignoredRuns = { ...saved.progressByMode.ignoredRuns };
    if (!saved.dataset || !Array.isArray(state?.log)) return merged;
    // Legacy runs belong only to legacy datasets; do not reuse a previous import's log.
    if (state.datasetId ? state.datasetId !== saved.dataset.importedAt : Array.isArray(saved.dataset.removalCandidates)) return merged;
    const mode = normalize(state.mode);
    if (state.startedAt && merged.ignoredRuns?.[mode] === state.startedAt) return merged;
    const eligible = new Set(candidates(saved.dataset, mode));
    const done = new Set(merged[mode]);
    for (const entry of state.log) {
      if (eligible.has(entry.username) && info(mode).successStatuses.includes(entry.status)) done.add(entry.username);
    }
    merged[mode] = [...done];
    return merged;
  };
  return { normalize, info, candidates, progress, mergeProgress };
})();
