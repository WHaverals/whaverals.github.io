import pako from 'pako'
import Papa from 'papaparse'

function _abToText(ab) {
  const bytes = new Uint8Array(ab)
  const txt = pako.ungzip(bytes, { to: 'string' })
  return txt
}

export async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-cache' })
  if (!res.ok) throw new Error(`fetch_failed:${res.status}:${url}`)
  return await res.json()
}

export async function fetchGzipCsv(url) {
  const res = await fetch(url, { cache: 'no-cache' })
  if (!res.ok) throw new Error(`fetch_failed:${res.status}:${url}`)
  const ab = await res.arrayBuffer()
  const text = _abToText(ab)
  const parsed = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false
  })
  if (parsed.errors?.length) {
    // Keep first error for debugging; still return data if possible
    console.warn('CSV parse errors', parsed.errors.slice(0, 3))
  }
  return parsed.data
}

