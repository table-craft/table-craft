// Docs site generator: docs/*.md → /docs/<slug>.html (same look as the landing page).
// Used by the Vite plugin in site/vite.config.js — rendered on request in dev, emitted as static pages on build.
import fs from 'node:fs';
import path from 'node:path';
import { Marked } from 'marked';

export const REPO = 'https://github.com/table-craft/table-craft';

// sidebar order; slug = file name without .md ("README" → "index")
export const NAV = [
  { title: 'Guides', items: ['index', 'getting-started', 'concepts', 'following-the-game', 'testing', 'balance', 'mcp'] },
  { title: 'Reference', items: ['game-module', 'scene', 'hud', 'fx', 'rules-kit', 'mechanics', 'client', 'server'] },
];
const SHORT = { index: 'Overview', testing: 'Bots & referee', fx: 'Effects (fx)', 'rules-kit': 'Rules kit T', mcp: 'AI assistants (MCP)', balance: 'Balance lab' };

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const strip = (html) => html.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
// GitHub-style heading ids, so links like scene.md#ui-nodes keep working
export const slugify = (text) => text.toLowerCase().trim().replace(/<[^>]+>/g, '').replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s/g, '-');

function rewriteHref(href) {
  if (!href || /^(https?:|mailto:|#)/.test(href)) return href;
  const [file, hash] = href.split('#');
  const tail = hash ? `#${hash}` : '';
  if (/^[\w-]+\.md$/.test(file)) return `${file === 'README.md' ? 'index' : file.slice(0, -3)}.html${tail}`;
  if (file.startsWith('../')) return `${REPO}/blob/main/${file.replace(/^(\.\.\/)+/, '')}${tail}`;
  return href;
}

function renderPage(md) {
  const toc = [];
  const used = new Map();
  const marked = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth }) {
        const inner = this.parser.parseInline(tokens);
        let id = slugify(strip(inner));
        const n = used.get(id) || 0; used.set(id, n + 1);
        if (n) id = `${id}-${n}`;
        if (depth === 2 || depth === 3) toc.push({ depth, id, text: strip(inner) });
        if (depth === 1) return `<h1>${inner}</h1>\n`;
        return `<h${depth} id="${id}"><a class="anchor" href="#${id}" aria-hidden="true">#</a>${inner}</h${depth}>\n`;
      },
      code({ text, lang }) {
        const l = (lang || '').split(/\s/)[0].toLowerCase();
        const label = { js: 'JavaScript', jsx: 'JSX', ts: 'TypeScript', bash: 'Terminal', sh: 'Terminal', css: 'CSS', json: 'JSON' }[l] || '';
        return `<div class="code">${label ? `<span class="code-lang">${label}</span>` : ''}<button class="code-copy" type="button">Copy</button><pre><code class="lang-${l || 'text'}">${esc(text)}</code></pre></div>\n`;
      },
      link({ href, title, tokens }) {
        const h = rewriteHref(href);
        const ext = /^https?:/.test(h) ? ' target="_blank" rel="noopener"' : '';
        return `<a href="${esc(h)}"${title ? ` title="${esc(title)}"` : ''}${ext}>${this.parser.parseInline(tokens)}</a>`;
      },
    },
  });
  // wide tables scroll horizontally on small screens
  const html = marked.parse(md).replace(/<table>/g, '<div class="table-wrap"><table>').replace(/<\/table>/g, '</table></div>');
  const title = (md.match(/^#\s+(.+)$/m) || [])[1]?.replace(/`/g, '') || 'Docs';
  const lead = strip(marked.parse((md.split('\n').find((l) => l.trim() && !l.startsWith('#') && !l.startsWith('>') && !l.startsWith('|') && !l.startsWith('```')) || ''))).trim();
  return { title, html, toc, lead };
}

export function loadDocs(docsDir) {
  const pages = new Map();
  for (const f of fs.readdirSync(docsDir).filter((x) => x.endsWith('.md'))) {
    const slug = f === 'README.md' ? 'index' : f.slice(0, -3);
    const md = fs.readFileSync(path.join(docsDir, f), 'utf8');
    pages.set(slug, { slug, file: f, md, ...renderPage(md) });
  }
  return pages;
}

const order = () => NAV.flatMap((g) => g.items);

function navHtml(pages, current) {
  return NAV.map((g) => `<div class="side-group"><div class="side-title">${g.title}</div>${g.items.filter((s) => pages.has(s)).map((s) => {
    const p = pages.get(s);
    return `<a href="${s}.html" class="${s === current ? 'on' : ''}">${esc(SHORT[s] || p.title)}</a>`;
  }).join('')}</div>`).join('');
}

function tocHtml(page) {
  if (page.toc.length < 2) return '';
  return `<div class="toc-title">On this page</div>${page.toc.map((t) => `<a href="#${t.id}" class="d${t.depth}">${esc(t.text)}</a>`).join('')}`;
}

function pagerHtml(pages, slug) {
  const seq = order().filter((s) => pages.has(s));
  const i = seq.indexOf(slug);
  const link = (s, dir) => (s ? `<a class="pager-${dir}" href="${s}.html"><span>${dir === 'prev' ? '← Previous' : 'Next →'}</span><b>${esc(SHORT[s] || pages.get(s).title)}</b></a>` : '<span></span>');
  return link(seq[i - 1], 'prev') + link(seq[i + 1], 'next');
}

// search index: page titles + headings with a short snippet (embedded in every page, a few KB)
export function searchIndex(pages) {
  const out = [];
  for (const p of pages.values()) {
    out.push({ t: p.title, u: `${p.slug}.html`, s: p.lead.slice(0, 140), p: '' });
    for (const h of p.toc) out.push({ t: h.text, u: `${p.slug}.html#${h.id}`, s: '', p: SHORT[p.slug] || p.title });
  }
  return out;
}

// fills the processed docs.html template for one page
export function fillTemplate(template, pages, slug) {
  const page = pages.get(slug);
  return template
    .replace(/(src|href)="\.\//g, '$1="../')
    .replace('<!--DOC:TITLE-->', esc(page.title))
    .replace('<!--DOC:DESC-->', esc(page.lead.slice(0, 160)))
    .replace('<!--DOC:NAV-->', navHtml(pages, slug))
    .replace('<!--DOC:CONTENT-->', page.html)
    .replace('<!--DOC:TOC-->', tocHtml(page))
    .replace('<!--DOC:PAGER-->', pagerHtml(pages, slug))
    .replace('<!--DOC:EDIT-->', `${REPO}/edit/main/docs/${page.file}`)
    .replace('<!--DOC:INDEX-->', JSON.stringify(searchIndex(pages)).replace(/</g, '\\u003c'));
}
