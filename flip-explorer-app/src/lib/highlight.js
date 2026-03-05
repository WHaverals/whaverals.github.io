import Mark from 'mark.js'

function refersClass(refersTo) {
  const r = String(refersTo || '').toLowerCase()
  if (r === 'version_a') return 'a'
  if (r === 'version_b') return 'b'
  if (r === 'both') return 'both'
  return 'unk'
}

/**
 * Svelte action: highlight evidence snippets using mark.js.
 * Params:
 * - ranges: [{ found, start, length, refers_to, ... }]
 * - enabled: boolean
 * - text: string (pane text; action owns node.textContent)
 * - onResult: (stats) => void
 */
export function markHighlights(node, params) {
  let mark = new Mark(node)
  let last = null

  async function apply(p) {
    const { ranges = [], enabled = true, text = null, onResult = null } = p || {}

    // IMPORTANT: let the action own the text content.
    // If Svelte renders `{txt}` inside this node, it will overwrite mark.js DOM mutations on updates.
    if (text !== null && text !== undefined) {
      const nextText = String(text)
      if (node.textContent !== nextText) node.textContent = nextText
    }

    // Render text is already in DOM; ensure we start clean.
    await new Promise((resolve) => {
      mark.unmark({ done: resolve })
    })

    const totalSnippets = Array.isArray(ranges) ? ranges.length : 0

    if (!enabled || !Array.isArray(ranges) || ranges.length === 0) {
      try {
        if (typeof onResult === 'function') onResult({ totalSnippets, matchedSnippets: 0, totalMarks: 0 })
      } catch {}
      return
    }

    // Build safe, non-overlapping ranges (mark.js doesn't like overlaps).
    const rs = []
    for (const r of ranges) {
      const found = r?.found === true || String(r?.found || '').toLowerCase() === 'true'
      const start = Number.parseInt(String(r?.start ?? ''), 10)
      const length = Number.parseInt(String(r?.length ?? ''), 10)
      if (!found) continue
      if (!Number.isFinite(start) || !Number.isFinite(length)) continue
      if (start < 0 || length <= 0) continue
      rs.push({ start, length, refers_to: r?.refers_to })
    }

    // Prefer earlier ranges; for same start, keep longer first.
    rs.sort((a, b) => (a.start - b.start) || (b.length - a.length))

    const picked = []
    let lastEnd = -1
    for (const r of rs) {
      const end = r.start + r.length
      if (r.start >= lastEnd) {
        picked.push(r)
        lastEnd = end
      }
    }

    const totalMarks = await new Promise((resolve) => {
      mark.markRanges(picked, {
        className: 'hl',
        exclude: ['script', 'style'],
        each: (el, range) => {
          try {
            el.classList.add(refersClass(range?.refers_to))
          } catch {}
        },
        done: resolve
      })
    })

    try {
      if (typeof onResult === 'function') {
        onResult({
          totalSnippets,
          matchedSnippets: picked.length,
          totalMarks: Number(totalMarks || 0)
        })
      }
    } catch (e) {
      // no-op: highlighting should never fail because the callback errored
    }
  }

  function update(p) {
    // avoid redundant re-application for same reference
    if (p === last) return
    last = p
    apply(p)
  }

  update(params)

  return {
    update,
    destroy() {
      mark.unmark()
    }
  }
}

