const marks = /\p{M}+/gu;
const whitespace = /\s/u;

export function foldPageText(text) {
  return text.normalize('NFD').replace(marks, '').toLowerCase().replace(/\s+/gu, ' ').trim();
}

// Match in a folded copy; return offsets into the literal PDF text in UTF-16.
export function originalMatch(text, foldedQuery) {
  if (!foldedQuery) return null;
  const begins = [], ends = [];
  let folded = '', offset = 0;
  for (const character of text) {
    const next = offset + character.length;
    const part = character.normalize('NFD').replace(marks, '').toLowerCase();
    if (!part || (whitespace.test(character) && folded.endsWith(' '))) {
      if (ends.length) ends[ends.length - 1] = next;
    } else {
      const value = whitespace.test(character) ? ' ' : part;
      folded += value;
      for (let i = 0; i < value.length; i++) {
        begins.push(offset);
        ends.push(next);
      }
    }
    offset = next;
  }
  const at = folded.indexOf(foldedQuery);
  if (at === -1) return null;
  return [begins[at], ends[at + foldedQuery.length - 1]];
}

export function literalSnippet(text, foldedQuery, radius = 60) {
  const hit = originalMatch(text, foldedQuery);
  if (!hit) return {before: text.slice(0, radius * 2), match: '', after: ''};
  return {
    before: text.slice(Math.max(0, hit[0] - radius), hit[0]),
    match: text.slice(hit[0], hit[1]),
    after: text.slice(hit[1], hit[1] + radius),
  };
}
