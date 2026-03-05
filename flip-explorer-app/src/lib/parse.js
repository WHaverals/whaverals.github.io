export function toInt(x, fallback = null) {
  if (x === null || x === undefined) return fallback
  const n = Number.parseInt(String(x), 10)
  return Number.isFinite(n) ? n : fallback
}

export function toFloat(x, fallback = null) {
  if (x === null || x === undefined) return fallback
  const n = Number.parseFloat(String(x))
  return Number.isFinite(n) ? n : fallback
}

export function toBool(x) {
  if (typeof x === 'boolean') return x
  if (x === null || x === undefined) return false
  const s = String(x).trim().toLowerCase()
  if (['true', 't', '1', 'yes', 'y'].includes(s)) return true
  if (['false', 'f', '0', 'no', 'n', '', 'nan', 'none'].includes(s)) return false
  return Boolean(x)
}

export function parseListMaybe(x) {
  if (x === null || x === undefined) return []
  if (Array.isArray(x)) return x
  const s0 = String(x).trim()
  if (!s0.startsWith('[') || !s0.endsWith(']')) return []

  // Try JSON-ish conversion first
  try {
    const s =
      s0
        .replaceAll('None', 'null')
        .replaceAll('True', 'true')
        .replaceAll('False', 'false')
        // naive single-quote -> double-quote conversion
        .replace(/'/g, '"')
    const obj = JSON.parse(s)
    return Array.isArray(obj) ? obj : []
  } catch {
    // Fallback: split on commas (good enough for simple string lists)
    const inner = s0.slice(1, -1).trim()
    if (!inner) return []
    return inner
      .split(',')
      .map((t) => t.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean)
  }
}

export function versionRoles(actualCreatorsList) {
  const creators = parseListMaybe(actualCreatorsList).map(String)
  if (creators.length !== 2) return { creators, ai: null, human: null }
  const [cA, cB] = creators
  const aIsHuman = cA.includes('Queneau')
  const bIsHuman = cB.includes('Queneau')
  if (aIsHuman && !bIsHuman) return { creators, ai: 'B', human: 'A' }
  if (bIsHuman && !aIsHuman) return { creators, ai: 'A', human: 'B' }
  return { creators, ai: null, human: null }
}

export function modelPrettyName(model) {
  const m = String(model || '')
  const map = {
    'openai/gpt-4o-mini': 'GPT-4o Mini',
    'openai/gpt-3.5-turbo-instruct': 'GPT-3.5 Turbo',
    'openai/gpt-4': 'GPT-4',
    'anthropic/claude-3.5-haiku': 'Claude 3.5 Haiku',
    'anthropic/claude-sonnet-4': 'Claude Sonnet 4',
    'google/gemini-2.5-flash': 'Gemini 2.5 Flash',
    'mistralai/mistral-medium-3': 'Mistral Medium',
    'mistralai/mistral-nemo': 'Mistral Nemo',
    'meta-llama/llama-4-maverick': 'Llama 4 Maverick',
    'meta-llama/llama-3.3-70b-instruct': 'Llama 3.3 70B',
    'deepseek/deepseek-r1-0528': 'DeepSeek R1',
    'deepseek/deepseek-r1-0528:free': 'DeepSeek R1',
    'deepseek/deepseek-chat-v3-0324': 'DeepSeek Chat v3',
    'qwen/qwen-2.5-72b-instruct': 'Qwen 2.5 72B',
    'cohere/command-r-08-2024': 'Command R'
  }
  return map[m] || m
}

export function criterionLabel(cid) {
  const id = String(cid || '')
  const labels = {
    C1_formal_constraint_or_formal_correctness: 'C1 — formal constraint/correctness',
    C2_style_markers_textual_evidence: 'C2 — style markers / textual evidence',
    C3_voice_authenticity_naturalness: 'C3 — voice/authenticity/naturalness',
    C4_clarity_coherence: 'C4 — clarity/coherence',
    C5_creativity_novelty_vs_convention: 'C5 — creativity/novelty',
    C6_genre_or_style_fit_norms: 'C6 — genre/style fit norms'
  }
  return labels[id] || id
}

export function criterionBlurb(cid) {
  const id = String(cid || '')
  const blurbs = {
    C1_formal_constraint_or_formal_correctness:
      'Does the rationale emphasize formal constraints, rule-following, or “correctness” (structure, meter, grammar, adherence to constraints)?',
    C2_style_markers_textual_evidence:
      'Does it cite concrete textual features as “style markers” (word choice, spelling, punctuation, formatting, specific phrases) as evidence?',
    C3_voice_authenticity_naturalness:
      'Does it judge the voice as authentic vs artificial (naturalness, human-like voice, sincerity, “sounds real”)?',
    C4_clarity_coherence:
      'Does it focus on clarity, coherence, readability, and whether the text “hangs together” as a piece?',
    C5_creativity_novelty_vs_convention:
      'Does it praise/penalize originality vs cliché (novel imagery, inventiveness, surprising choices)?',
    C6_genre_or_style_fit_norms:
      'Does it judge fit to genre/style norms (e.g., “this is/ isn’t a sonnet”, “matches free verse conventions”)?'
  }
  return blurbs[id] || ''
}

