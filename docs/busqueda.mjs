// All offsets exposed by this module are original JavaScript UTF-16 offsets.
// They can be used with String.slice and with DOM Range on the same text.
const wordChar = /[\p{L}\p{N}_]/u;
const wordPattern = /[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:[’'][\p{L}\p{M}\p{N}]+)*/gu;
const markPattern = /\p{M}+/gu;
const textPiecePattern = /[^\p{M}]\p{M}*|\p{M}+/gu;
const typicalPunctuation = {
  '‘': "'", '’': "'", 'ʼ': "'", '“': '"', '”': '"',
  '‐': '-', '‑': '-', '‒': '-', '–': '-', '—': '-', '−': '-', 'ς': 'σ'
};

function foldChars(text) {
  return text.normalize('NFD').replace(markPattern, '').toLowerCase()
    .replace(/[‘’ʼ“”‐‑‒–—−ς]/gu, character => typicalPunctuation[character])
    .replace(/[\u00ad\u200b]/gu, '');
}

/** Forma exclusiva para comparar. El texto entregado a la persona conserva su fuente. */
export function fold(value) {
  return foldChars(String(value ?? '')).replace(/\s+/gu, ' ').trim();
}

function literalMap(text) {
  // Delaying a space until the next word implements trim and keeps a whole
  // original whitespace run available when a phrase crosses a line break.
  const starts = [];
  const ends = [];
  let normalized = '';
  let spaceStart = -1;
  let spaceEnd = -1;
  for (const part of text.matchAll(textPiecePattern)) {
    const piece = foldChars(part[0]);
    if (!piece) continue;
    const begin = part.index;
    const end = begin + part[0].length;
    if (/^\s+$/u.test(piece)) {
      if (normalized.length && spaceStart === -1) spaceStart = begin;
      spaceEnd = end;
      continue;
    }
    if (spaceStart !== -1) {
      normalized += ' ';
      starts.push(spaceStart);
      ends.push(spaceEnd);
      spaceStart = -1;
    }
    normalized += piece;
    for (let index = 0; index < piece.length; index++) {
      starts.push(begin);
      ends.push(end);
    }
  }
  return {normalized, starts, ends};
}

function previousPoint(text, offset) {
  if (!offset) return '';
  const last = text.charCodeAt(offset - 1);
  const length = offset > 1 && last >= 0xdc00 && last <= 0xdfff ? 2 : 1;
  return text.slice(offset - length, offset);
}

function nextPoint(text, offset) {
  const point = text.codePointAt(offset);
  return point === undefined ? '' : String.fromCodePoint(point);
}

function bounded(text, start, end) {
  return !(wordChar.test(nextPoint(text, start)) && wordChar.test(previousPoint(text, start))) &&
    !(wordChar.test(previousPoint(text, end)) && wordChar.test(nextPoint(text, end)));
}

function normalizedRanges(text, query, mode) {
  const ranges = [];
  if (!query) return ranges;
  let cursor = 0;
  while (cursor <= text.length - query.length) {
    const start = text.indexOf(query, cursor);
    if (start === -1) break;
    const end = start + query.length;
    const accepted = mode === 'fragment' || bounded(text, start, end);
    if (accepted) ranges.push([start, end]);
    cursor = accepted ? end : start + 1;
  }
  return ranges;
}

/** Posiciones UTF-16 [inicio, fin) que se pueden pasar directamente a String.slice. */
export function literalRanges(text, query, {mode = 'fragment'} = {}) {
  const value = String(text ?? '');
  const needle = fold(query);
  if (!needle || !value) return [];
  const map = literalMap(value);
  return normalizedRanges(map.normalized, needle, mode)
    .map(([start, end]) => [map.starts[start], map.ends[end - 1]]);
}

// These are typing shortcuts. A shortcut is registered only if the book with
// that name actually exists in this edition. Its printed title has priority.
const alternativeAbbreviations = {
  genesis: ['gn', 'gen'], exodo: ['ex', 'exo'], levitico: ['lv', 'lev'],
  numeros: ['nm', 'num'], deuteronomio: ['dt', 'deut'], josue: ['jos'],
  jueces: ['jue', 'juec'], rut: ['rt'], samuel: ['s', 'sam', 'sa'],
  reyes: ['r', 're', 'rey'], cronicas: ['cr', 'cro'], esdras: ['esd'],
  nehemias: ['neh'], ester: ['est'], salmos: ['sal', 'sl', 'salmo'],
  proverbios: ['pr', 'prov'], eclesiastes: ['ec', 'ecl'],
  cantares: ['cnt', 'cant'], isaias: ['is', 'isa'], jeremias: ['jer', 'jr'],
  lamentaciones: ['lm', 'lam'], ezequiel: ['ez', 'ezq'], daniel: ['dn', 'dan'],
  oseas: ['os'], joel: ['jl'], amos: ['am'], abdias: ['abd'],
  jonas: ['jon'], miqueas: ['mi', 'miq'], nahum: ['nah'],
  habacuc: ['hab'], sofonias: ['sof'], hageo: ['hag', 'hg'],
  zacarias: ['zac'], malaquias: ['mal'], mateo: ['mt', 'mat'],
  marcos: ['mr', 'mc', 'marc'], lucas: ['lc', 'luc'], juan: ['jn'],
  hechos: ['hch'], romanos: ['ro', 'rom'], corintios: ['co', 'cor'],
  galatas: ['ga', 'gal'], efesios: ['ef'], filipenses: ['fil', 'flp'],
  colosenses: ['col'], tesalonicenses: ['ts', 'tes'],
  timoteo: ['ti', 'tim'], tito: ['tit'], filemon: ['flm'],
  hebreos: ['he', 'heb'], santiago: ['stg', 'sant'],
  pedro: ['p', 'pe', 'ped'], judas: ['jud'], apocalipsis: ['ap', 'apoc']
};

const ordinalForms = {
  primer: '1', primero: '1', primera: '1',
  segundo: '2', segunda: '2', tercero: '3', tercer: '3', tercera: '3',
  i: '1', ii: '2', iii: '3'
};

function bookKey(value) {
  return fold(value)
    .replace(/^(primer[oa]?|segund[oa]|tercer[oa]?|iii|ii|i)\b[\s.-]*(?:de\s+)?/u,
      (_, ordinal) => ordinalForms[ordinal])
    .replace(/^([123])\s*[°ºª]/u, '$1')
    .replace(/^([123])\s*(?:era|ero|er|ra|da|do|ro|a|o)(?=[.\s-])/u, '$1')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

function ordinalOf(key) {
  return /^\d+/u.exec(key)?.[0] ?? '';
}

function titleInfo(book, position) {
  const title = bookKey(book.name);
  const ordinal = ordinalOf(title);
  const root = title.slice(ordinal.length);
  const short = Array.isArray(book.abbr) ? book.abbr : [book.abbr];
  const official = [title, bookKey(book.id), ...short.map(bookKey)].filter(Boolean);
  const alternatives = (alternativeAbbreviations[root] ?? []).map(token => ordinal + token);
  const keys = [...new Set([...official, ...alternatives])];
  return {book, title, ordinal, keys, position};
}

// Bounded optimal-string-alignment distance, including adjacent transpositions.
// No work is done outside the band that can still reach the requested bound.
function editDistance(a, b, maximum) {
  if (a === b) return 0;
  const aLength = a.length;
  const bLength = b.length;
  const outside = maximum + 1;
  if (Math.abs(aLength - bLength) > maximum) return outside;
  let priorPrior = new Int16Array(bLength + 1).fill(outside);
  let prior = Int16Array.from({length: bLength + 1}, (_, i) => Math.min(i, outside));
  let row = new Int16Array(bLength + 1).fill(outside);
  for (let i = 1; i <= aLength; i++) {
    const left = Math.max(1, i - maximum);
    const right = Math.min(bLength, i + maximum);
    row[left - 1] = left === 1 ? Math.min(i, outside) : outside;
    let rowMin = row[left - 1];
    for (let j = left; j <= right; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j - 1] + 1, prior[j] + 1, prior[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        row[j] = Math.min(row[j], priorPrior[j - 2] + 1);
      }
      rowMin = Math.min(rowMin, row[j]);
    }
    if (right < bLength) row[right + 1] = outside;
    if (rowMin > maximum) return outside;
    [priorPrior, prior, row] = [prior, row, priorPrior];
  }
  return prior[bLength];
}

function tolerance(key) {
  if (key.length < 3) return 0;
  if (key.length < 6) return 1;
  return key.length < 11 ? 2 : 3;
}

function byBook(query, records, typos) {
  const key = bookKey(query);
  if (!key) return records.map(record => ({record, match: 'prefix', tier: 1, distance: 0}));
  const numeric = ordinalOf(key);
  const max = typos ? tolerance(key) : 0;
  const ranked = [];
  for (const record of records) {
    if (numeric && numeric !== record.ordinal) continue;
    let match = '';
    let tier = 0;
    let distance = 0;
    if (record.keys.includes(key)) {
      match = 'exact';
      tier = record.title === key ? 0 : 1;
    } else if (record.keys.some(alias => alias.startsWith(key))) {
      match = 'prefix';
      tier = 2;
    } else if (key.length >= 2 && record.title.includes(key)) {
      match = 'part';
      tier = 3;
    } else if (max) {
      distance = Math.min(...record.keys.filter(alias => alias.length >= 3)
        .map(alias => editDistance(key, alias, max)), max + 1);
      if (distance <= max) {
        match = 'suggestion';
        tier = 4;
      }
    }
    if (match) ranked.push({record, match, tier, distance});
  }
  return ranked.sort((a, b) => a.tier - b.tier || a.distance - b.distance ||
    a.record.position - b.record.position);
}

// A numeric ordinal belongs to the book. The chapter and verses are parsed
// from the complete trailing reference before lookup or numeric validation.
const referencePattern = /^(.+?[\p{L}\p{M}.])\s*[,;]?\s*(\d{1,3})(?:\s*(?:[:.,;/]|\s)\s*(\d{1,3})(?:\s*-\s*(\d{1,3}))?)?\.?$/u;

function parseReference(query) {
  const cleaned = fold(query)
    .replace(/\b(?:capitulos?|cap)\.?\s*/gu, ' ')
    .replace(/\b(?:versiculos?|vers?|vv?)\.?\s*(?=\d)/gu, ':')
    .trim();
  const parts = referencePattern.exec(cleaned);
  if (!parts || /[:;,/]/u.test(parts[1])) return null;
  const [, title, ch, first, last] = parts;
  const chapter = Number(ch);
  const start = first ? Number(first) : null;
  const end = last ? Number(last) : start;
  if (!chapter || (start !== null && (!start || !end || end < start))) return null;
  return {title, chapter, start, end};
}

function validatedRef({chapter, start, end}, record) {
  const ch = record.book.chapters.find(c => c.n === chapter);
  if (!ch) return null;
  if (start !== null && (!ch.verses.some(v => v.n === start) || !ch.verses.some(v => v.n === end))) {
    return null;
  }
  return {book: record.book.id, chapter, start, end};
}

function pageInteger(value, fallback, ceiling) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(ceiling, Math.max(1, Math.floor(number))) : fallback;
}

function searchableVerse(entry, needle, mode, score) {
  const value = entry.normalized;
  const first = value.indexOf(needle);
  if (first === -1) return null;
  if (!score && mode === 'fragment') return 0;
  const ranges = normalizedRanges(value, needle, mode);
  if (!ranges.length) return null;
  if (!score) return 0;
  return (value === needle ? 200 : 0) + (ranges.some(([a,b]) => bounded(value, a, b)) ? 40 : 0) +
    (ranges[0][0] === 0 ? 15 : 0) + Math.min(8, ranges.length) * 2;
}

function crossNeedles(query) {
  const cuts = [];
  for (let pos = query.indexOf(' '); pos !== -1; pos = query.indexOf(' ', pos + 1)) {
    cuts.push([query.slice(0, pos), query.slice(pos + 1)]);
  }
  return cuts;
}

// To span a verse boundary the query has to end one of its words exactly at
// the end of a source verse. Only then do we inspect the following verse(s).
function crossingHits(scope, index, cuts, mode) {
  const first = scope[index];
  const hits = [];
  if (first.midHeading) return hits;
  for (const [left, right] of cuts) {
    if (!first.normalized.endsWith(left)) continue;
    const begin = first.normalized.length - left.length;
    if (mode !== 'fragment' && !bounded(first.normalized, begin, first.normalized.length)) continue;
    let remaining = right;
    for (let j = index + 1; j < scope.length; j++) {
      const next = scope[j];
      if (next.book !== first.book || next.chapter !== first.chapter || next.breakBefore ||
          next.midHeading || next.verse.n !== scope[j - 1].verse.n + 1) break;
      if (next.normalized.startsWith(remaining)) {
        if (mode !== 'fragment' && !bounded(next.normalized, 0, remaining.length)) break;
        hits.push({entry: first, score: 40, span: scope.slice(index, j + 1),
          begin, finish: remaining.length});
        break;
      }
      if (!remaining.startsWith(next.normalized + ' ')) break;
      remaining = remaining.slice(next.normalized.length + 1);
    }
  }
  return hits;
}

function resultFromHit(hit, query, mode) {
  const {entry, span} = hit;
  const base = {book:entry.book, chapter:entry.chapter, n:entry.verse.n, p:entry.verse.p};
  if (!span) {
    return {...base, t:entry.verse.t, ranges:literalRanges(entry.verse.t, query, {mode})};
  }
  let fullTextOffset = 0;
  const combinedRanges = [];
  const parts = span.map((row, i) => {
    const {n, t, p} = row.verse;
    const map = literalMap(t);
    const start = map.starts[i === 0 ? hit.begin : 0];
    const end = map.ends[i === span.length - 1 ? hit.finish - 1 : map.normalized.length - 1];
    combinedRanges.push([fullTextOffset + start, fullTextOffset + end]);
    fullTextOffset += t.length + 1;
    return {n, t, p, ranges:[[start, end]]};
  });
  // The newline is just a presentation separator. Every stored or shared
  // source slice is available individually in parts with its own offsets.
  return {...base, end:parts.at(-1).n, t:parts.map(v => v.t).join('\n'), ranges:combinedRanges, parts};
}

function vocabularyFor(entries) {
  const terms = new Map();
  const foldedTokens = new Map();
  for (const {verse} of entries) {
    for (const match of verse.t.matchAll(wordPattern)) {
      const surface = match[0];
      let key = foldedTokens.get(surface);
      if (!key) {
        key = fold(surface);
        foldedTokens.set(surface, key);
      }
      const known = terms.get(key);
      if (known) {
        known.frequency++;
      } else if (key.length > 1) {
        terms.set(key, {key, surface, frequency: 1});
      }
    }
  }
  const byLength = new Map();
  for (const term of terms.values()) {
    if (!byLength.has(term.key.length)) byLength.set(term.key.length, []);
    byLength.get(term.key.length).push(term);
  }
  return {terms, byLength};
}

function nearestTerms(key, vocabulary, typos) {
  const maximum = typos ? tolerance(key) : 0;
  if (!maximum) return [];
  const candidates = [];
  for (let length = key.length - maximum; length <= key.length + maximum; length++) {
    for (const term of vocabulary.byLength.get(length) ?? []) {
      if (term.key === key) continue;
      const distance = editDistance(key, term.key, maximum);
      if (distance <= maximum) candidates.push({term, distance});
    }
  }
  return candidates.sort((a, b) => a.distance - b.distance ||
    b.term.frequency - a.term.frequency || a.term.key.localeCompare(b.term.key, 'es'))
    .slice(0, 5).map(candidate => candidate.term);
}

function suggestQueries(query, scope, vocabulary, mode, typos) {
  const tokens = [...String(query).matchAll(wordPattern)];
  if (!tokens.length || tokens.length > 32) return [];
  const suggestions = new Set();
  const existing = [];
  let pairs = 0;
  for (const token of tokens) {
    const key = fold(token[0]);
    const current = vocabulary.terms.get(key);
    if (current) {
      existing.push(current);
      continue;
    }
    if (++pairs > 4) break;
    for (const term of nearestTerms(key, vocabulary, typos)) {
      const candidate = query.slice(0, token.index) + term.surface +
        query.slice(token.index + token[0].length);
      const needle = fold(candidate);
      if (tokens.length === 1 || scope.some(e => searchableVerse(e, needle, mode, false) !== null)) {
        suggestions.add(candidate);
      }
    }
  }
  if (!suggestions.size && tokens.length > 1) {
    // The full expression is missing. These individual choices are attested
    // search terms, each of which leads to results within the selected book(s).
    existing.sort((a, b) => a.frequency - b.frequency);
    for (const term of existing) suggestions.add(term.surface);
  }
  return [...suggestions].slice(0, 5);
}

/**
 * Mantiene los índices en memoria, con construcción diferida del índice de palabras.
 * books() consulta los nombres, reference() valida una ubicación y words() pagina
 * los versículos en orden bíblico o por relevancia. Ningún método modifica corpus.
 */
export function createSearch(corpus) {
  const records = corpus.books.map(titleInfo);
  let entries;
  let perBook;
  let lastVocabulary;
  let allVocabulary;
  function scopeFor(book) {
    if (!entries) {
      entries = [];
      perBook = new Map();
      for (const book of corpus.books) {
        const rows = [];
        for (const chapter of book.chapters) {
          const breakBefore = new Set((chapter.headings ?? []).filter(h => !h.at).map(h => h.before));
          const midHeading = new Set((chapter.headings ?? []).filter(h => h.at).map(h => h.before));
          for (const verse of chapter.verses) {
            if (typeof verse.t !== 'string' || !verse.t.length) continue;
            const entry = {book: book.id, chapter: chapter.n, verse,
              normalized: fold(verse.t), position: entries.length,
              breakBefore:breakBefore.has(verse.n), midHeading:midHeading.has(verse.n)};
            rows.push(entry);
            entries.push(entry);
          }
        }
        perBook.set(book.id, rows);
      }
    }
    return book ? perBook.get(book) ?? [] : entries;
  }

  function getVocabulary(book, scope) {
    if (!book) return allVocabulary ??= vocabularyFor(scope);
    if (lastVocabulary?.book !== book) lastVocabulary = {book, value: vocabularyFor(scope)};
    return lastVocabulary.value;
  }

  function books(query = '', {typos = true, limit = 16} = {}) {
    return byBook(query, records, typos).slice(0, pageInteger(limit, 16, records.length))
      .map(({record: {book}, match}) => ({
        id: book.id, name: book.name, abbr: book.abbr, group: book.group, match
      }));
  }

  function reference(query, {typos = true} = {}) {
    const parts = parseReference(query);
    if (!parts) return null;
    const matches = byBook(parts.title, records, typos);
    const [first, second] = matches;
    if (!first || first.match === 'part') return null;
    if (second && first.tier === second.tier && first.distance === second.distance) return null;
    return validatedRef(parts, first.record);
  }

  function referenceSuggestions(query, {typos = true, limit = 5} = {}) {
    const parts = parseReference(query);
    if (!parts) return [];
    const candidates = byBook(parts.title, records, typos);
    const exact = candidates.filter(candidate => candidate.match === 'exact');
    const result = [];
    for (const {record} of (exact.length ? exact : candidates)) {
      if (validatedRef(parts, record)) {
        const verses = parts.start === null ? '' : ':' + parts.start +
          (parts.end !== parts.start ? '–' + parts.end : '');
        result.push(record.book.name + ' ' + parts.chapter + verses);
      } else if (exact.length && record.book.chapters.length) {
        // An invalid number must not redirect a clearly named book to a
        // similarly spelled one. Offer a location that really exists in it.
        const closest = record.book.chapters.reduce((a, b) =>
          Math.abs(a.n - parts.chapter) <= Math.abs(b.n - parts.chapter) ? a : b);
        const label = record.book.name + ' ' + closest.n;
        result.push(label);
        if (closest.n === parts.chapter && parts.start !== null && closest.verses.length) {
          const verse = closest.verses.reduce((a, b) =>
            Math.abs(a.n - parts.start) <= Math.abs(b.n - parts.start) ? a : b);
          result.push(label + ':' + verse.n);
        }
      }
      if (result.length >= limit) break;
    }
    return result.slice(0, limit);
  }

  function words(query, {book = '', mode = 'fragment', order = 'relevance', page = 1,
    limit = 24, suggest = true, typos = true, crossVerse = false} = {}) {
    const term = String(query ?? '').trim();
    const needle = fold(term);
    const size = pageInteger(limit, 24, 500);
    if (!needle) return {items: [], total: 0, page: 1, pages: 0, suggestions: []};
    const scope = scopeFor(book);
    const scored = order !== 'biblical';
    const cuts = crossVerse && needle.includes(' ') ? crossNeedles(needle) : [];
    const hits = [];
    for (let index = 0; index < scope.length; index++) {
      const entry = scope[index];
      const score = searchableVerse(entry, needle, mode, scored);
      if (score !== null) hits.push({entry, score});
      if (cuts.length) hits.push(...crossingHits(scope, index, cuts, mode));
    }
    if (scored) hits.sort((a, b) => b.score - a.score || a.entry.position - b.entry.position);
    const total = hits.length;
    const pages = Math.ceil(total / size);
    const current = pageInteger(page, 1, Math.max(1, pages));
    const items = hits.slice((current - 1) * size, current * size)
      .map(hit => resultFromHit(hit, term, mode));
    const suggestions = !total && suggest && scope.length ?
      suggestQueries(term, scope, getVocabulary(book, scope), mode, typos) : [];
    return {items, total, page: current, pages, suggestions};
  }

  return {books, reference, referenceSuggestions, words};
}
