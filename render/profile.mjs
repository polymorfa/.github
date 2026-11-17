// Renders the Polymorfa organization profile (profile/README.md) and its
// cards. A scheduled workflow runs this daily and commits the result, so
// GitHub serves static files and nothing renders on page load.
//
//   node profile.mjs <repo root>
//
// Cards are light and dark SVGs. satori turns text into paths, so they do
// not depend on fonts at view time.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import satori from 'satori'

const HERE = path.dirname(new URL(import.meta.url).pathname)
const OUT = path.resolve(process.argv[2] ?? path.join(HERE, '..'))
const read = (f) => readFileSync(path.join(HERE, f))
const FONTS = [
  { name: 'Geist', data: read('fonts/Geist-Regular.ttf'), weight: 400 },
  { name: 'Geist', data: read('fonts/Geist-Medium.ttf'), weight: 500 },
  { name: 'Geist', data: read('fonts/Geist-SemiBold.ttf'), weight: 600 },
  { name: 'Geist Mono', data: read('fonts/GeistMono-Regular.ttf'), weight: 400 },
  { name: 'Geist Mono', data: read('fonts/GeistMono-Medium.ttf'), weight: 500 },
]

/* ── Live data (a snapshot here; the production route fetches it). ───── */
const gh = (repo) => {
  const r = JSON.parse(execFileSync('gh', ['api', `repos/${repo}`, '--jq', '{s:.stargazers_count,l:.language}']))
  return { stars: r.s, lang: r.l }
}
const fmt = (n) => n.toLocaleString('en-US')
const kfmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(n))

const BUILD = [
  ['sdks', 'SDKs for TypeScript, Go, Python, PHP, Rust and C# on one API contract.', 'SDKs for TypeScript, Go, Python, PHP, Rust and C#, plus the UI Kit'],
  ['cli', 'The polymorfa command, an MCP server and agent skills.', 'The polymorfa command, an MCP server and agent skills'],
  ['integrations', 'Polymorfa apps for n8n, Make, Zapier and Pipedream.', 'Apps for n8n, Make, Zapier and Pipedream'],
  ['signal-node', 'Self-hosted Signal service. Keys and message plaintext stay on your servers.', 'Self-hosted Signal service: keys and plaintext stay on your servers'],
  ['agent-kit', 'Skills and a docs MCP for Claude Code, Codex, Gemini CLI and Cursor.', 'Skills and a docs MCP for coding agents'],
]
const OSS = [
  ['hypermeow', 'whatsmeow for scale: 79% lower group send p95 and 98% fewer SQL calls.', 'whatsmeow for scale: 79% lower group send p95, 98% fewer SQL calls'],
  ['cellar', 'Download, diff and search any Meta client revision. CLI and MCP.', 'Download, diff and search any Meta client revision'],
  ['jigger', 'A WhatsApp protocol spec extracted from shipped client code.', 'A WhatsApp protocol spec extracted from shipped code'],
  ['sentinel-tests', 'Versioned tests for WhatsApp behavior and the libraries that implement it.', 'Versioned tests for WhatsApp behavior'],
  ['libsignal-protocol-go', 'Go implementation of the Signal protocol for WhatsApp.', 'Go Signal protocol for WhatsApp'],
]
const S = Object.fromEntries([...BUILD, ...OSS].map(([n]) => [n, gh(`polymorfa/${n}`)]))
/* Languages to show where GitHub's primary language misdescribes the repository. */
const LANGUAGE = { 'signal-node': 'Rust', cli: 'Shell' }
for (const [n, l] of Object.entries(LANGUAGE)) S[n].lang = l
/* Repositories that show every language above 5% of their code, largest first. */
const ALL_LANGUAGES = ['sdks']
for (const n of ALL_LANGUAGES) {
  const bytes = JSON.parse(execFileSync('gh', ['api', `repos/polymorfa/${n}/languages`]))
  const total = Object.values(bytes).reduce((a, b) => a + b, 0)
  S[n].langs = Object.entries(bytes).filter(([, b]) => b / total >= 0.05).map(([l]) => l)
}
const LIBS_ALL = [['Baileys', gh('WhiskeySockets/Baileys')], ['whatsapp-web.js', gh('wwebjs/whatsapp-web.js')], ['whatsmeow', gh('tulir/whatsmeow')], ['whatsapp-rust', gh('oxidezap/whatsapp-rust')]]
const LIBS = LIBS_ALL

/* ── Tokens from apps/frontend/app/theme.css ────────────────────────── */
const TOKENS = {
  light: { bg: '#ffffff', fg: '#0a0a0a', muted: '#737373', border: '#e5e5e5', subtle: '#fafafa', amber: '#f59e0b', lock: 'lockup-light.svg' },
  dark: { bg: '#0a0a0a', fg: '#fafafa', muted: '#a1a1a1', border: '#262626', subtle: '#111111', amber: '#fbbf24', lock: 'lockup-dark.svg' },
}
const LANG = { Go: '#00ADD8', Rust: '#dea584', TypeScript: '#3178c6', JavaScript: '#f1e05a', Python: '#3572A5', PHP: '#4F5D95', 'C#': '#178600', Shell: '#89e051' }

/* ── Helpers ────────────────────────────────────────────────────────── */
function h(type, style = {}, ...children) {
  const kids = children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false && c !== '')
  const props = { style: { display: 'flex', ...style } }
  if (kids.length) props.children = kids.length === 1 ? kids[0] : kids
  return { type, props }
}
const img = (src, w, hh, style = {}) => ({ type: 'img', props: { src, width: w, height: hh, style } })
const svgUri = (s) => `data:image/svg+xml;base64,${Buffer.from(s).toString('base64')}`
const jpg = (f) => `data:image/jpeg;base64,${read(f).toString('base64')}`
function icon(name, color, size = 16, sw = 1.5, fill) {
  let s = readFileSync(path.join(HERE, 'node_modules/lucide-static/icons', `${name}.svg`), 'utf8')
  s = s.replace(/currentColor/g, color).replace(/stroke-width="2"/, `stroke-width="${sw}"`)
  if (fill) s = s.replace(/fill="none"/, `fill="${fill}"`)
  return img(svgUri(s), size, size)
}
function brand(file, width) {
  const s = read(file).toString()
  const [, w, hh] = s.match(/width="([\d.]+)" height="([\d.]+)"/)
  return img(svgUri(s), width, (width * Number(hh)) / Number(w))
}
async function render(node, w, hh, title) {
  const svg = (await satori(node, { width: w, height: hh, fonts: FONTS }))
    // One decimal is enough at display size and keeps each card small.
    .replace(/(\d+\.\d)\d+/g, '$1')
  return svg.replace(/^<svg([^>]*)>/, `<svg$1 role="img" aria-label="${title.replace(/"/g, '&quot;')}"><title>${title.replace(/&/g, '&amp;')}</title>`)
}

const G = 5
/* Repositories shown two to a row at the top of their section. */
const FEATURED = ['sdks', 'cli', 'hypermeow', 'cellar']
/* Star counts appear only above this, so new repositories don't show a 0 or 1. */
const MIN_STARS = 10
const star = (V, t, size = 13) => (V.mono ? icon('star', t.muted, size) : icon('star', t.amber, size, 1.5, t.amber))
const langDot = (V, t, lang) => h('div', { width: 8, height: 8, borderRadius: 8, backgroundColor: V.mono ? t.muted : LANG[lang] ?? t.muted })
const repoName = (t, name, size = 14) => h('div', { fontFamily: 'Geist Mono', fontSize: size, fontWeight: 500, whiteSpace: 'nowrap' }, h('div', { color: t.muted }, 'polymorfa/'), h('div', { color: t.fg }, name))
const surface = (t, style, ...k) => h('div', { width: '100%', height: '100%', backgroundColor: t.bg, border: `1px solid ${t.border}`, borderRadius: 10, color: t.fg, ...style }, ...k)

/* ── Pieces ─────────────────────────────────────────────────────────── */
const TAGLINE = 'The platform for building on WhatsApp.'
const SUBLINE = 'Public SDKs, tools and libraries from the Polymorfa team.'

function proofNode(V, t, { inline = false } = {}) {
  return h('div', { alignItems: 'center', gap: 12, flexWrap: 'nowrap' },
    h('div', { alignItems: 'center' },
      img(jpg('rajeh.jpg'), 30, 30, { borderRadius: 30, border: `2px solid ${t.bg}` }),
      img(jpg('joao.jpg'), 30, 30, { borderRadius: 30, border: `2px solid ${t.bg}`, marginLeft: -8 })),
    h('div', { fontSize: 13, color: t.muted, whiteSpace: 'nowrap', flexShrink: 0 }, 'From the maintainers of'),
    h('div', { gap: 5 }, LIBS.map(([n, s]) =>
      h('div', { alignItems: 'center', gap: 5, flexShrink: 0, height: 28, padding: '0 10px', borderRadius: 99, border: `1px solid ${t.border}`, fontSize: 12, backgroundColor: t.bg },
        h('div', { color: t.fg, fontWeight: 500 }, n), star(V, t, 12), h('div', { fontFamily: 'Geist Mono', fontSize: 11.5, color: t.muted }, kfmt(s.stars))))))
}

async function header(V, t) {
  const W = 900, H = 160
  return render(h('div', { width: W, height: H, flexDirection: 'column', fontFamily: 'Geist', color: t.fg },
    h('div', { height: 96, padding: '0 10px', alignItems: 'center', justifyContent: 'space-between' },
      brand(t.lock, 230),
      h('div', { flexDirection: 'column', alignItems: 'flex-end', gap: 5 }, h('div', { fontSize: 17, fontWeight: 500 }, TAGLINE), h('div', { fontSize: 14, color: t.muted }, SUBLINE))),
    h('div', { height: 64, padding: G },
      surface(t, { alignItems: 'center', padding: '0 18px', backgroundColor: t.subtle }, proofNode(V, t)))),
    W, H, `Polymorfa. ${TAGLINE} ${SUBLINE} From the maintainers of ${LIBS.map(([n, s]) => `${n} (${fmt(s.stars)} stars)`).join(', ')}.`)
}

async function label(V, t, text, right) {
  const W = 900, H = 40
  return render(h('div', { width: W, height: H, alignItems: 'center', gap: 12, padding: '0 10px', fontFamily: 'Geist' },
    h('div', { fontSize: 13, fontWeight: 500, color: t.fg, whiteSpace: 'nowrap' }, text),
    h('div', { flexGrow: 1, height: 1, backgroundColor: t.border }),
    h('div', { fontSize: 12.5, color: t.muted, whiteSpace: 'nowrap' }, right)), W, H, text)
}

function meta(V, t, s, size = 12) {
  return h('div', { alignItems: 'center', gap: 12, fontSize: size, color: t.muted },
    ...(s.langs ?? (s.lang ? [s.lang] : [])).map((l) => h('div', { alignItems: 'center', gap: 6 }, langDot(V, t, l), l)),
    s.stars > MIN_STARS && h('div', { alignItems: 'center', gap: 5 }, star(V, t, 12), h('div', { fontFamily: 'Geist Mono' }, fmt(s.stars))))
}

async function repoCard(V, t, [name, desc, short]) {
  const s = S[name]
  if (V.layout === 'rows') {
    const W = 900, H = 50
    return render(h('div', { width: W, height: H, padding: '3px 5px', fontFamily: 'Geist' },
      surface(t, { alignItems: 'center', gap: 18, padding: '0 16px', borderRadius: 8 },
        h('div', { width: 250 }, repoName(t, name, 13)),
        h('div', { flexGrow: 1, fontSize: 13, color: t.muted, whiteSpace: 'nowrap' }, short),
        h('div', { width: 150, justifyContent: 'flex-end' }, meta(V, t, s)))), W, H, `polymorfa/${name}: ${desc}`)
  }
  const W = FEATURED.includes(name) ? 450 : 300
  const H = 128
  return render(h('div', { width: W, height: H, padding: G, fontFamily: 'Geist' },
    surface(t, { flexDirection: 'column', padding: '15px 16px' },
      repoName(t, name, name.length > 16 && W === 300 ? 12.5 : 13.5),
      h('div', { marginTop: 7, fontSize: 12.5, lineHeight: 1.42, color: t.muted, lineClamp: 2, display: 'block' }, desc),
      h('div', { marginTop: 'auto' }, meta(V, t, s)))), W, H, `polymorfa/${name}: ${desc}`)
}

async function more(V, t) {
  const W = 900, H = 102
  return render(h('div', { width: W, height: H, flexDirection: 'column', fontFamily: 'Geist' },
    h('div', { height: 42, alignItems: 'center', gap: 12, padding: '0 10px' },
      h('div', { fontSize: 13, fontWeight: 500, color: t.fg, whiteSpace: 'nowrap' }, 'More from Polymorfa'),
      h('div', { flexGrow: 1, height: 1, backgroundColor: t.border })),
    h('div', { height: 60, padding: G },
      surface(t, { alignItems: 'center', justifyContent: 'space-between', padding: '0 18px', borderStyle: 'dashed' },
        h('div', { alignItems: 'center', gap: 10, fontSize: 13.5, color: t.fg },
          icon('folder-git-2', t.muted, 16), 'Browse every repository',
          h('div', { color: t.muted }, 'This page is curated and can fall behind.')),
        h('div', { alignItems: 'center', gap: 6, fontFamily: 'Geist Mono', fontSize: 12.5, color: t.fg }, 'github.com/orgs/polymorfa/repositories', icon('arrow-up-right', t.muted, 14))))),
    W, H, 'More from Polymorfa. Browse every repository; this page is curated and can fall behind.')
}

/* ── README and output ─────────────────────────────────────────────── */
const V = { layout: 'grid3' }
const ALL = 'https://github.com/orgs/polymorfa/repositories'
function readme(base) {
  const pic = (name, width, href, alt) => {
    const p = `<picture><source media="(prefers-color-scheme: dark)" srcset="${base}${name}-dark.svg"><img alt="${alt}" src="${base}${name}-light.svg" width="${width}"></picture>`
    return href ? `<a href="${href}">${p}</a>` : p
  }
  const card = ([n, d]) => pic(n, FEATURED.includes(n) ? '50%' : '33.33%', `https://github.com/polymorfa/${n}`, `polymorfa/${n}: ${d}`)
  const oss = [...OSS.filter(([n]) => FEATURED.includes(n)), ...OSS.filter(([n]) => !FEATURED.includes(n))]
  return `<!-- Generated by render/profile.mjs. Edit the script, not this file; a daily workflow regenerates it. -->

${pic('header', '100%', 'https://www.polymorfa.com', `Polymorfa. ${TAGLINE} ${SUBLINE} From the maintainers of Baileys, whatsapp-web.js, whatsmeow and whatsapp-rust.`)}

<p align="center"><a href="https://www.polymorfa.com">Website</a>&nbsp;&nbsp;·&nbsp;&nbsp;<a href="https://docs.polymorfa.com">Docs</a>&nbsp;&nbsp;·&nbsp;&nbsp;<a href="https://docs.polymorfa.com/changelog">Changelog</a>&nbsp;&nbsp;·&nbsp;&nbsp;<a href="https://www.polymorfa.com/pricing">Pricing</a></p>

${pic('s-build', '100%', null, 'Build with Polymorfa')}
${[...BUILD.filter(([n]) => FEATURED.includes(n)), ...BUILD.filter(([n]) => !FEATURED.includes(n))].map(card).join('')}

${pic('s-oss', '100%', null, 'Open source')}
${oss.map(card).join('')}

${pic('more', '100%', ALL, 'More from Polymorfa. Browse every repository; this page is curated and can fall behind.')}
`
}

const cards = path.join(OUT, 'profile', 'cards')
rmSync(cards, { recursive: true, force: true })
mkdirSync(cards, { recursive: true })
for (const mode of ['light', 'dark']) {
  const t = TOKENS[mode]
  const w = (n, svg) => writeFileSync(path.join(cards, `${n}-${mode}.svg`), svg)
  w('header', await header(V, t))
  w('s-build', await label(V, t, 'Build with Polymorfa', `${BUILD.length} repositories`))
  w('s-oss', await label(V, t, 'Open source', `${OSS.length} repositories`))
  for (const r of [...BUILD, ...OSS]) w(r[0], await repoCard(V, t, r))
  w('more', await more(V, t))
}
writeFileSync(path.join(OUT, 'profile', 'README.md'), readme('cards/'))
writeFileSync(path.join(OUT, 'profile', 'stars.json'), JSON.stringify({ polymorfa: S, maintained: Object.fromEntries(LIBS) }, null, 2) + '\n')
console.log('rendered profile')
