// Merges freshly-extracted Add Content results into a person's existing
// grammar/vocab arrays, de-duplicating by id / topic+word so re-running
// extraction on the same notes doesn't create duplicate entries.

function mergeGrammar(existing, incoming) {
  const existingIds = new Set(existing.map((t) => t.id));
  const merged = existing.slice();

  incoming.forEach((topic) => {
    let id = topic.id || 'topic';
    let suffix = 2;
    while (existingIds.has(id)) {
      id = `${topic.id || 'topic'}-${suffix}`;
      suffix += 1;
    }
    existingIds.add(id);
    merged.push({ ...topic, id });
  });

  return merged;
}

function mergeVocab(existing, incoming) {
  const merged = existing.map((g) => ({ topic: g.topic, words: g.words.slice() }));

  incoming.forEach((group) => {
    const match = merged.find((g) => g.topic.trim().toLowerCase() === (group.topic || '').trim().toLowerCase());
    if (match) {
      const existingSk = new Set(match.words.map((w) => w.sk));
      (group.words || []).forEach((w) => {
        if (!existingSk.has(w.sk)) {
          match.words.push(w);
          existingSk.add(w.sk);
        }
      });
    } else {
      merged.push({ topic: group.topic, words: group.words || [] });
    }
  });

  return merged;
}

module.exports = { mergeGrammar, mergeVocab };
