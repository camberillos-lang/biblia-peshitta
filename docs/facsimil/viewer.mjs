import {enIPhoneNativo,compartirArchivo} from '../iphone.mjs';
import {foldPageText, literalSnippet, originalMatch} from './search.mjs';

const nameForPage = (n) => 'Página ' + n;
const pause = () => new Promise((resolve) => setTimeout(resolve, 0));
const localUrl = (path) => new URL(path, import.meta.url).href;
let instanceNumber = 0;

function ensureStyles() {
  if (document.getElementById('bp-facsimil-css')) return;
  const link = document.createElement('link');
  link.id = 'bp-facsimil-css';
  link.rel = 'stylesheet';
  link.href = localUrl('./viewer.css');
  document.head.append(link);
}

function highlighted(element, before, match, after) {
  element.replaceChildren(document.createTextNode(before));
  if (match) {
    const mark = document.createElement('mark');
    mark.textContent = match;
    element.append(mark);
  }
  element.append(document.createTextNode(after));
}

function markPrintedHit(layer, overlay, query) {
  if (!query) return;
  const segments = [];
  let text = '';
  for (const element of layer.querySelectorAll('span, br')) {
    if (element.tagName === 'BR') {
      text += '\n';
    } else if (element.childNodes.length === 1 && element.firstChild.nodeType === Node.TEXT_NODE) {
      const node = element.firstChild;
      const start = text.length;
      text += node.data;
      segments.push({node, start, end: text.length});
    }
  }
  const found = originalMatch(text, query);
  if (!found) return;
  const first = segments.find((segment) => segment.end > found[0]);
  const last = segments.find((segment) => segment.end >= found[1]);
  if (!first || !last) return;
  const range = new Range();
  range.setStart(first.node, Math.max(0, found[0] - first.start));
  range.setEnd(last.node, Math.max(0, found[1] - last.start));
  const bounds = overlay.getBoundingClientRect();
  for (const rect of range.getClientRects()) {
    if (!rect.width || !rect.height) continue;
    const hit = document.createElement('span');
    hit.className = 'fx-hit';
    hit.ariaHidden = 'true';
    hit.style.cssText = 'left:' + (rect.left - bounds.left) + 'px;top:' + (rect.top - bounds.top)
      + 'px;width:' + rect.width + 'px;height:' + rect.height + 'px';
    overlay.append(hit);
  }
}

function pdfText(content) {
  return content.items.filter((item) => typeof item.str === 'string')
    .map((item) => item.str + (item.hasEOL ? '\n' : '')).join('');
}

/**
 * Mount a self-contained viewer inside container. pagesIndex may be an array of
 * untouched page texts or the object from tools/facsimil_indice.py. Page inputs,
 * outputs and callbacks use one-based physical PDF pages.
 */
export function mountFacsimile(container, {pdf, page = 1, pagesIndex, onPageChange} = {}) {
  ensureStyles();
  const root = document.createElement('section');
  root.className = 'bp-facsimil';
  root.setAttribute('aria-label', 'Facsímil del PDF original');
  container.replaceChildren(root);
  const id = 'fx-' + (++instanceNumber);
  // The UI template has no edition content or user input interpolated into it.
  root.innerHTML = [
    '<div class="fx-controls">',
    '<div class="fx-paging"><button type="button" class="fx-prev" aria-label="Página anterior" title="Página anterior" disabled>‹</button>',
    '<button type="button" class="fx-next" aria-label="Página siguiente" title="Página siguiente" disabled>›</button></div>',
    '<form class="fx-jump"><label for="' + id + '-page">Página</label>',
    '<input class="fx-number" id="' + id + '-page" type="number" min="1" step="1" inputmode="numeric" value="1" required>',
    '<span class="fx-total"></span><button type="submit">Ir</button></form>',
    '<select class="fx-zoom" aria-label="Ampliación de la página">',
    '<option value="1">Ajustar</option><option value="1.25">125 %</option><option value="1.5">150 %</option>',
    '<option value="2">200 %</option><option value="2.5">250 %</option></select></div>',
    '<details class="fx-search"><summary>Buscar en todo el PDF</summary>',
    '<form class="fx-search-form"><input type="search" aria-label="Palabra o frase del PDF" placeholder="Palabra o frase" required>',
    '<button type="submit">Buscar</button><button class="fx-reset" type="button" hidden>Limpiar</button></form>',
    '<p class="fx-meta fx-coverage">La búsqueda incluye las páginas que contienen una capa de texto.</p>',
    '<p class="fx-progress fx-search-status" role="status"></p><div class="fx-results"></div>',
    '<button type="button" class="fx-more" hidden>Ver más resultados</button></details>',
    '<p class="fx-progress fx-page-status" role="status">Abriendo el PDF…</p>',
    '<div class="fx-stage" tabindex="0" role="region" aria-label="Página original del documento"></div>',
    '<details class="fx-transcription"><summary>Texto de esta página</summary><pre></pre></details>',
    '<div class="fx-footer"><a class="fx-link fx-download" download="Biblia-Peshitta.pdf">Descargar PDF original</a>',
    '<a class="fx-link fx-native" target="_blank" rel="noopener">Abrir PDF en otra pestaña</a></div>',
  ].join('');
  const at = (selector) => root.querySelector(selector);
  const jump = at('.fx-jump'), pageInput = at('.fx-number'), total = at('.fx-total');
  const prev = at('.fx-prev'), next = at('.fx-next'), zoom = at('.fx-zoom');
  const stage = at('.fx-stage'), pageStatus = at('.fx-page-status');
  const search = at('.fx-search'), searchForm = at('.fx-search-form');
  const queryInput = searchForm.querySelector('input'), reset = at('.fx-reset');
  const results = at('.fx-results'), more = at('.fx-more'), searchStatus = at('.fx-search-status');
  const transcript = at('.fx-transcription pre');
  const rows = Array.isArray(pagesIndex) ? pagesIndex : pagesIndex?.pages;
  const rawPages = Array.isArray(rows) ? rows.slice() : [];
  const foldedPages = [];
  const imagePages = pagesIndex?.imageOnlyPages || [];
  if (imagePages.length) {
    at('.fx-coverage').textContent = 'Busca también en las notas y los materiales editoriales. '
      + 'Las páginas ilustradas sin texto indexable se consultan por número de página.';
  }
  const source = pdf instanceof Blob ? pdf : new Blob([pdf], {type: 'application/pdf'});
  const objectUrl = URL.createObjectURL(source.type === 'application/pdf' ? source
    : new Blob([source], {type: 'application/pdf'}));
  at('.fx-download').href = objectUrl;
  at('.fx-native').href = objectUrl;
  if(enIPhoneNativo()){
    at('.fx-native').remove();
    at('.fx-download').textContent='Guardar o compartir el PDF original';
    at('.fx-download').onclick=event=>{event.preventDefault();compartirArchivo('Biblia-Peshitta.pdf',source instanceof Blob?source:new Blob([source],{type:'application/pdf'})).catch(err=>{pageStatus.textContent=err.message;});};
  }
  let doc, runtime, loadingTask, drawing, textLayer, observer, displayedPage;
  let current = Math.max(1, Math.trunc(Number(page)) || 1);
  let pageAttempt = 0, searchAttempt = 0, pageWidth = -1, announcedPage = 0;
  let query = '', pageQuery = '', matches = [], presented = 0, destroyed = false;
  let lastText = '';
  const valid = (attempt) => !destroyed && attempt === pageAttempt;

  function displayTranscript(raw) {
    lastText = raw;
    if (!raw.trim() || raw.trim() === String(current)) {
      transcript.textContent = imagePages.includes(current)
        ? 'Esta página contiene una imagen. Consúltala en el facsímil.'
        : (raw.trim() ? raw : 'La capa de texto de esta página está vacía.');
      return;
    }
    const region = pageQuery && originalMatch(raw, pageQuery);
    if (region) highlighted(transcript, raw.slice(0, region[0]), raw.slice(...region), raw.slice(region[1]));
    else transcript.textContent = raw;
  }

  async function destinationPage(destination) {
    const dest = typeof destination === 'string' ? await doc.getDestination(destination) : destination;
    if (!dest || destroyed) return null;
    const ref = dest[0];
    return typeof ref === 'number' ? ref + 1 : 1 + await doc.getPageIndex(ref);
  }

  async function addInternalLinks(pageObject, viewport, overlay, attempt) {
    const annotations = await pageObject.getAnnotations({intent: 'display'});
    if (!valid(attempt)) return;
    for (const entry of annotations) {
      if (entry.subtype !== 'Link' || !entry.dest || !Array.isArray(entry.rect)) continue;
      let target;
      try { target = await destinationPage(entry.dest); } catch { continue; }
      if (!valid(attempt)) return;
      if (!target) continue;
      const [x1, y1, x2, y2] = viewport.convertToViewportRectangle(entry.rect);
      const link = document.createElement('a');
      link.href = objectUrl + '#page=' + target;
      link.title = 'Ir a la página ' + target;
      link.setAttribute('aria-label', link.title);
      link.style.cssText = 'left:' + Math.min(x1, x2) + 'px;top:' + Math.min(y1, y2)
        + 'px;width:' + Math.abs(x2 - x1) + 'px;height:' + Math.abs(y2 - y1) + 'px';
      link.addEventListener('click', (event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        goTo(target);
      });
      overlay.append(link);
    }
  }

  async function renderPage() {
    if (!doc || destroyed) return false;
    const attempt = ++pageAttempt;
    drawing?.cancel();
    textLayer?.cancel();
    pageInput.value = String(current);
    pageStatus.textContent = 'Abriendo página ' + current + '…';
    prev.disabled = current <= 1;
    next.disabled = current >= doc.numPages;
    const number = current;
    try {
      const item = await doc.getPage(number);
      if (!valid(attempt)) return false;
      if (displayedPage && displayedPage !== item) displayedPage.cleanup();
      displayedPage = item;
      const base = item.getViewport({scale: 1});
      pageWidth = Math.max(1, stage.clientWidth);
      const fit = Math.min(pageWidth, 1050) / base.width;
      const viewport = item.getViewport({scale: fit * Number(zoom.value)});
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(6e6 / (viewport.width * viewport.height)));
      const paper = document.createElement('div');
      paper.className = 'fx-paper';
      paper.style.width = viewport.width + 'px';
      paper.style.height = viewport.height + 'px';
      paper.style.setProperty('--total-scale-factor', viewport.scale);
      paper.style.setProperty('--scale-round-x', '1px');
      paper.style.setProperty('--scale-round-y', '1px');
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(viewport.width * pixelRatio));
      canvas.height = Math.max(1, Math.round(viewport.height * pixelRatio));
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', nameForPage(number) + ' del PDF original');
      const layer = document.createElement('div');
      layer.className = 'fx-text';
      layer.setAttribute('aria-hidden', 'true');
      const overlay = document.createElement('div');
      overlay.className = 'fx-overlay';
      paper.append(canvas, layer, overlay);
      const oldCanvas = stage.querySelector('canvas');
      if (oldCanvas) oldCanvas.width = oldCanvas.height = 0;
      stage.replaceChildren(paper);
      drawing = item.render({canvas, viewport, transform: [pixelRatio, 0, 0, pixelRatio, 0, 0]});
      await drawing.promise;
      if (!valid(attempt)) return false;
      pageStatus.textContent = '';
      if (announcedPage !== number) {
        announcedPage = number;
        onPageChange?.(number);
      }
      // The canvas is already final. A text-layer/annotation error must not hide it.
      try {
        const content = await item.getTextContent({disableNormalization: true});
        if (!valid(attempt)) return true;
        const raw = rawPages[number - 1] ?? pdfText(content);
        rawPages[number - 1] = raw;
        displayTranscript(raw);
        textLayer = new runtime.TextLayer({textContentSource: content, viewport, container: layer});
        await textLayer.render();
        if (valid(attempt)) markPrintedHit(layer, overlay, pageQuery);
      } catch {
        if (valid(attempt)) displayTranscript(rawPages[number - 1] || '');
      }
      try { await addInternalLinks(item, viewport, overlay, attempt); } catch { /* The native PDF retains its links. */ }
      return true;
    } catch {
      if (valid(attempt)) {
        stage.replaceChildren();
        displayTranscript(rawPages[number - 1] || '');
        pageStatus.textContent = 'No se pudo dibujar esta página. Puedes abrir el PDF original en otra pestaña.';
      }
      return false;
    }
  }

  async function pageText(number) {
    if (typeof rawPages[number - 1] === 'string') return rawPages[number - 1];
    const item = await doc.getPage(number);
    const content = await item.getTextContent({disableNormalization: true});
    const value = pdfText(content);
    rawPages[number - 1] = value;
    if (number !== current) item.cleanup();
    return value;
  }

  function appendResults(limit = 20) {
    const fragment = document.createDocumentFragment();
    const end = Math.min(matches.length, presented + limit);
    for (; presented < end; presented++) {
      const number = matches[presented];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'fx-result';
      const ref = document.createElement('strong');
      ref.textContent = nameForPage(number);
      const line = document.createElement('span');
      const snippet = literalSnippet(rawPages[number - 1], query);
      highlighted(line, snippet.before, snippet.match, snippet.after);
      button.append(ref, line);
      button.addEventListener('click', async () => {
        search.open = false;
        await goTo(number, query);
        if (!destroyed) stage.focus({preventScroll: true});
      });
      fragment.append(button);
    }
    results.append(fragment);
    more.hidden = presented >= matches.length;
  }

  async function findPages(input) {
    const attempt = ++searchAttempt;
    query = foldPageText(String(input));
    matches = [];
    presented = 0;
    results.replaceChildren();
    more.hidden = true;
    reset.hidden = !query;
    if (!query) {
      searchStatus.textContent = '';
      pageQuery = '';
      for (const hit of root.querySelectorAll('.fx-hit')) hit.remove();
      displayTranscript(lastText);
      return [];
    }
    await ready;
    if (!doc || destroyed || attempt !== searchAttempt) return [];
    search.open = true;
    queryInput.value = String(input);
    searchStatus.textContent = 'Buscando en el PDF…';
    let unavailable = 0;
    for (let number = 1; number <= doc.numPages; number++) {
      if (destroyed || attempt !== searchAttempt) return [];
      let folded = foldedPages[number - 1];
      if (folded === undefined) {
        try { folded = foldPageText(await pageText(number)); }
        catch { unavailable++; continue; }
        foldedPages[number - 1] = folded;
      }
      if (destroyed || attempt !== searchAttempt) return [];
      if (folded.includes(query)) matches.push(number);
      if (number % 32 === 0) {
        if (presented < 20) appendResults(20 - presented);
        searchStatus.textContent = 'Buscando · ' + number + ' de ' + doc.numPages + ' páginas';
        await pause();
      }
    }
    if (presented < 20) appendResults(20 - presented);
    more.hidden = presented >= matches.length;
    searchStatus.textContent = matches.length ? (matches.length === 1 ? '1 página encontrada.' : matches.length + ' páginas encontradas.')
      : 'Sin coincidencias. Prueba una palabra más corta o consulta una página por su número.';
    if (unavailable) searchStatus.textContent += ' Páginas sin índice disponible: ' + unavailable + '.';
    return matches.slice();
  }

  async function goTo(number, queryToMark = '') {
    if (!doc) await ready;
    if (!doc || destroyed) return false;
    const target = Number(number);
    if (!Number.isInteger(target) || target < 1 || target > doc.numPages) return false;
    if (current !== target) {
      lastText = '';
      transcript.textContent = '';
    }
    current = target;
    pageQuery = queryToMark;
    stage.scrollLeft = 0;
    return renderPage();
  }

  async function load() {
    try {
      runtime = await import('./vendor/pdf.mjs');
      if (destroyed) return false;
      runtime.GlobalWorkerOptions.workerSrc = localUrl('./vendor/pdf.worker.mjs');
      const data = new Uint8Array(await source.arrayBuffer());
      if (destroyed) return false;
      // This edition has embedded fonts, Identity-H, and RGB JPEGs. It needs
      // neither remote character maps nor external images or font downloads.
      loadingTask = runtime.getDocument({data, isEvalSupported: false, useSystemFonts: false, useWasm: false});
      doc = await loadingTask.promise;
      if (destroyed) return false;
      current = Math.min(current, doc.numPages);
      total.textContent = 'de ' + doc.numPages;
      pageInput.max = doc.numPages;
      await renderPage();
      if (destroyed) return false;
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(() => {
          if (Math.max(1, stage.clientWidth) !== pageWidth) renderPage();
        });
        observer.observe(stage);
      }
      return true;
    } catch {
      if (!destroyed) {
        pageStatus.textContent = 'El visor no pudo abrir este archivo. Usa «Abrir PDF en otra pestaña» para consultarlo.';
        jump.hidden = zoom.hidden = search.hidden = at('.fx-transcription').hidden = true;
      }
      return false;
    }
  }

  prev.addEventListener('click', () => goTo(current - 1));
  next.addEventListener('click', () => goTo(current + 1));
  jump.addEventListener('submit', (event) => { event.preventDefault(); goTo(+pageInput.value); });
  zoom.addEventListener('change', renderPage);
  searchForm.addEventListener('submit', (event) => { event.preventDefault(); findPages(queryInput.value); });
  queryInput.addEventListener('input', () => { if (!queryInput.value) findPages(''); });
  more.addEventListener('click', () => appendResults());
  reset.addEventListener('click', () => { queryInput.value = ''; findPages(''); queryInput.focus(); });
  stage.addEventListener('keydown', (event) => {
    if (event.target !== stage || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    if (event.key === 'PageDown' || event.key === 'PageUp') {
      event.preventDefault();
      goTo(current + (event.key === 'PageDown' ? 1 : -1));
    }
  });
  const ready = load();
  return {
    ready, goTo, find: findPages,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      ++pageAttempt; ++searchAttempt;
      observer?.disconnect();
      drawing?.cancel();
      textLayer?.cancel();
      const canvas = stage.querySelector('canvas');
      if (canvas) canvas.width = canvas.height = 0;
      loadingTask?.destroy().catch(() => {});
      URL.revokeObjectURL(objectUrl);
      root.remove();
    },
  };
}
