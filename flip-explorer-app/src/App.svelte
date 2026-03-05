<script>
  import { onMount } from 'svelte'
  import { fetchGzipCsv, fetchJson } from './lib/data.js'
  import {
    criterionBlurb,
    criterionLabel,
    modelPrettyName,
    parseListMaybe,
    toBool,
    toFloat,
    toInt,
    versionRoles
  } from './lib/parse.js'
  import { markHighlights } from './lib/highlight.js'

  const DATA_BASE = './data'

  let manifest = null
  let status = 'Loading…'
  let error = null

  /** @type {any[]} */
  let flipCases = []
  /** @type {Map<string, any>} */
  let pairTexts = new Map()
  /** @type {Map<string, any>} key=pair_id||criterion */
  let offsetsConsensus = new Map()
  /** @type {Map<string, any>} key=pair_id||criterion */
  let offsetsPerCoder = new Map()

  // UI state
  let view = 'criteria' // criteria | cases
  let flipType = 'any' // any | stance | salience | both
  let selectedCriterion = 'any'
  let selectedEvaluator = 'any'
  let selectedStyle = 'any'
  let minDefined = 2
  let search = ''
  let requireConsensusEvidence = false
  let selectedStyleFocus = 'any' // only used on criterion page

  // detail drawer
  let selected = null // { pair_id, criterion }
  let evidenceMode = 'consensus' // consensus | perCoder
  let coderTab = null // coder_model string (null = all coders combined)
  let highlightsEnabled = true
  let hlStats = { R1: null, R2: null }

  // pagination
  const PAGE_SIZE = 60
  let page = 1

  function keyPC(pair_id, criterion) {
    const pid = String(pair_id || '').trim()
    const crit = String(criterion || '').trim()
    return `${pid}||${crit}`
  }

  function normId(x) {
    return String(x || '').trim()
  }

  function updateUrl() {
    const p = new URLSearchParams()
    if (view !== 'criteria') p.set('view', view)
    if (flipType !== 'any') p.set('flip', flipType)
    if (selectedCriterion !== 'any') p.set('crit', selectedCriterion)
    if (selectedEvaluator !== 'any') p.set('eval', selectedEvaluator)
    if (selectedStyle !== 'any') p.set('style', selectedStyle)
    if (minDefined !== 2) p.set('minDefined', String(minDefined))
    if (search.trim()) p.set('q', search.trim())
    if (selectedStyleFocus !== 'any') p.set('styleFocus', selectedStyleFocus)
    if (selected?.pair_id && selected?.criterion) {
      p.set('pair_id', selected.pair_id)
      p.set('criterion', selected.criterion)
    }
    const newUrl = `${location.pathname}?${p.toString()}`
    history.replaceState(null, '', newUrl)
  }

  function readUrl() {
    const p = new URLSearchParams(location.search)
    view = p.get('view') || view
    flipType = p.get('flip') || flipType
    selectedCriterion = p.get('crit') || selectedCriterion
    selectedEvaluator = p.get('eval') || selectedEvaluator
    selectedStyle = p.get('style') || selectedStyle
    minDefined = Number.parseInt(p.get('minDefined') || String(minDefined), 10) || minDefined
    search = p.get('q') || search
    selectedStyleFocus = p.get('styleFocus') || selectedStyleFocus

    const pid = p.get('pair_id')
    const cid = p.get('criterion')
    if (pid && cid) selected = { pair_id: pid, criterion: cid }
  }

  function openCase(row) {
    selected = { pair_id: normId(row.pair_id), criterion: normId(row.criterion) }
    evidenceMode = 'consensus'
    coderTab = null
    hlStats = { R1: null, R2: null }
    page = 1
    updateUrl()
  }

  function closeDrawer() {
    selected = null
    updateUrl()
  }

  function goHome() {
    selected = null
    selectedCriterion = 'any'
    selectedStyleFocus = 'any'
    view = 'criteria'
    updateUrl()
  }

  function parseEvidenceOffsetsRows(rows) {
    const cons = new Map()
    const per = new Map()

    for (const r of rows) {
      const pid = normId(r.pair_id)
      const crit = normId(r.criterion)
      const rlab = normId(r.rationale)
      const source = normId(r.source)
      if (!pid || !crit || (rlab !== 'R1' && rlab !== 'R2')) continue
      const k = keyPC(pid, crit)

      const item = {
        snippet: String(r.snippet || ''),
        refers_to: normId(r.refers_to || 'unknown').toLowerCase(),
        coder_model: normId(r.coder_model || ''),
        source,
        found: toBool(r.found) === true,
        start: toInt(r.start, null),
        length: toInt(r.length, null),
        mode: normId(r.mode || ''),
        score: toFloat(r.score, null)
      }

      if (source === 'consensus') {
        if (!cons.has(k)) cons.set(k, { R1: [], R2: [] })
        cons.get(k)[rlab].push(item)
      } else if (source === 'per_coder') {
        const coder = item.coder_model
        if (!coder) continue
        if (!per.has(k)) per.set(k, { R1: {}, R2: {} })
        const slot = per.get(k)
        if (!slot[rlab]) continue
        if (!slot[rlab][coder]) slot[rlab][coder] = []
        slot[rlab][coder].push(item)
      }
    }

    return { cons, per }
  }

  function refersPill(refersTo) {
    const r = String(refersTo || '').toLowerCase()
    if (r === 'version_a') return { cls: 'a', label: 'Version A' }
    if (r === 'version_b') return { cls: 'b', label: 'Version B' }
    if (r === 'both') return { cls: 'both', label: 'both' }
    return { cls: 'unk', label: 'unknown' }
  }

  async function loadAll() {
    try {
      status = 'Loading manifest…'
      manifest = await fetchJson(`${DATA_BASE}/manifest.json`)

      status = 'Loading flip cases…'
      const flipRows = await fetchGzipCsv(`${DATA_BASE}/flip_cases_consensus.csv.gz`)
      // normalize minimal fields used by UI
      flipCases = flipRows.map((r) => ({
        pair_id: normId(r.pair_id),
        criterion: normId(r.criterion || r.criterion_id),
        flip_type: String(r.flip_type || 'any'),
        evaluator_model: normId(r.evaluator_model),
        style: normId(r.style),
        ai_creator: normId(r.ai_creator),
        n_defined: toInt(r.n_defined, 0) ?? 0,
        n_coders: toInt(r.n_coders, null),
        thresh: toInt(r.thresh, null),
        salience_votes: toInt(r.salience_votes, null),
        relaxed_votes_cond: toInt(r.relaxed_votes_cond, null),
        consensus_salience_uncond: toBool(r.consensus_salience_uncond),
        consensus_relaxed_cond: toBool(r.consensus_relaxed_cond)
      }))

      status = 'Loading pair texts…'
      const textRows = await fetchGzipCsv(`${DATA_BASE}/pair_texts_for_consensus_flips.csv.gz`)
      pairTexts = new Map()
      for (const r of textRows) {
        const pid = normId(r.pair_id)
        if (!pid) continue
        pairTexts.set(pid, {
          pair_id: pid,
          evaluator_model: normId(r.evaluator_model),
          style: normId(r.style),
          ai_creator: normId(r.ai_creator),
          queneau_story_id: r.queneau_story_id,
          ai_story_id: r.ai_story_id,
          rationale_R1: String(r.rationale_R1 || ''),
          rationale_R2: String(r.rationale_R2 || ''),
          A_labels: r.A_labels,
          B_labels: r.B_labels,
          A_actual_creators: r.A_actual_creators,
          B_actual_creators: r.B_actual_creators
        })
      }

      status = 'Loading evidence offsets…'
      const offRows = await fetchGzipCsv(`${DATA_BASE}/evidence_offsets.csv.gz`)
      const parsed = parseEvidenceOffsetsRows(offRows)
      offsetsConsensus = parsed.cons
      offsetsPerCoder = parsed.per

      status = null
    } catch (e) {
      console.error(e)
      error = String(e?.message || e)
      status = null
    }
  }

  function uniqueSorted(xs) {
    return Array.from(new Set(xs.filter(Boolean))).sort((a, b) => a.localeCompare(b))
  }

  $: criteria = uniqueSorted(flipCases.map((r) => r.criterion))
  $: evaluators = uniqueSorted(flipCases.map((r) => r.evaluator_model))
  $: styles = uniqueSorted(flipCases.map((r) => r.style))

  // Criterion cards: counts (public-facing; no dense metadata)
  $: criterionCards = criteria.map((cid) => {
    const rows = flipCases.filter((r) => r.criterion === cid)
    const stance = rows.filter((r) => r.flip_type === 'stance' || r.flip_type === 'both').length
    const salience = rows.filter((r) => r.flip_type === 'salience' || r.flip_type === 'both').length
    const nPairs = new Set(rows.map((r) => r.pair_id)).size
    return { cid, stance, salience, nPairs }
  })

  $: isCriterionPage = view === 'criteria' && selectedCriterion !== 'any'

  // Style ranking for the current criterion (uses flip-only dataset; interpret as “within consensus flips shown”)
  $: styleRanking = (() => {
    if (!isCriterionPage) return []
    const rows = flipCases.filter((r) => r.criterion === selectedCriterion)
    const by = new Map()
    for (const r of rows) {
      const s = r.style || '(missing style)'
      if (!by.has(s)) by.set(s, { style: s, stance: 0, salience: 0, total: 0, pairs: new Set() })
      const obj = by.get(s)
      obj.total += 1
      obj.pairs.add(r.pair_id)
      if (r.flip_type === 'stance' || r.flip_type === 'both') obj.stance += 1
      if (r.flip_type === 'salience' || r.flip_type === 'both') obj.salience += 1
    }
    const out = Array.from(by.values()).map((o) => ({
      style: o.style,
      stance: o.stance,
      salience: o.salience,
      total: o.total,
      nPairs: o.pairs.size,
      stanceShare: o.total ? o.stance / o.total : 0
    }))
    // Rank by stance share (primary), then stance count (secondary)
    out.sort((a, b) => (b.stanceShare - a.stanceShare) || (b.stance - a.stance))
    return out
  })()

  // Example gallery for criterion page
  const EXAMPLE_PAGE_SIZE = 12
  let examplePage = 1
  $: if (isCriterionPage) examplePage = Math.max(1, examplePage)
  $: examplesAll = (() => {
    if (!isCriterionPage) return []
    let rows = flipCases.filter((r) => r.criterion === selectedCriterion)
    if (selectedStyleFocus !== 'any') rows = rows.filter((r) => r.style === selectedStyleFocus)
    if (requireConsensusEvidence) {
      rows = rows.filter((r) => {
        const k = keyPC(r.pair_id, r.criterion)
        const ev = offsetsConsensus?.get(k)
        const n = (ev?.R1?.length || 0) + (ev?.R2?.length || 0)
        return n > 0
      })
    }
    // Best-examples policy (public-facing):
    // - stance/both: require highlightable evidence on BOTH sides (R1 and R2)
    // - salience: allow one-sided evidence (that’s the mechanism), but label which side
    const scoreRow = (r) => {
      const k = keyPC(r.pair_id, r.criterion)
      const ev = offsetsConsensus?.get(k)
      const r1 = ev?.R1 || []
      const r2 = ev?.R2 || []
      const foundR1 = r1.filter((x) => x?.found === true).length
      const foundR2 = r2.filter((x) => x?.found === true).length
      const totalR1 = r1.length
      const totalR2 = r2.length
      const found = foundR1 + foundR2
      const total = totalR1 + totalR2

      const isStance = r.flip_type === 'stance' || r.flip_type === 'both'
      const isSal = r.flip_type === 'salience'

      let bestOk = true
      let salienceSide = null

      if (isStance) {
        bestOk = foundR1 > 0 && foundR2 > 0
      } else if (isSal) {
        // prefer clean one-sided evidence; if both sides have evidence, it may still be informative
        bestOk = (foundR1 > 0) !== (foundR2 > 0)
        salienceSide = foundR1 > 0 && foundR2 === 0 ? 'R1' : (foundR2 > 0 && foundR1 === 0 ? 'R2' : null)
      }

      return { found, total, foundR1, foundR2, totalR1, totalR2, bestOk, salienceSide }
    }

    const enriched = rows.map((r) => {
      const sc = scoreRow(r)
      return {
        ...r,
        ev_found: sc.found,
        ev_total: sc.total,
        ev_found_r1: sc.foundR1,
        ev_found_r2: sc.foundR2,
        best_ok: sc.bestOk,
        salience_side: sc.salienceSide
      }
    })

    // Default: only best examples (stance requires both sides evidence; salience prefers one-sided evidence)
    let kept = enriched.filter((r) => r.best_ok)

    // If we filtered too aggressively (e.g., rare criterion/style), fall back gracefully.
    if (kept.length < 6) kept = enriched

    return kept.sort((a, b) => (b.ev_found - a.ev_found) || (b.ev_total - a.ev_total))
  })()

  $: exampleTotalPages = Math.max(1, Math.ceil(examplesAll.length / EXAMPLE_PAGE_SIZE))
  $: examplePage = Math.min(examplePage, exampleTotalPages)
  $: examples = examplesAll.slice((examplePage - 1) * EXAMPLE_PAGE_SIZE, examplePage * EXAMPLE_PAGE_SIZE)

  // Flip-type availability (avoid confusing “both” when there are zero cases)
  $: flipTypeCounts = (() => {
    const c = { stance: 0, salience: 0, both: 0 }
    for (const r of flipCases) {
      if (r.flip_type === 'stance') c.stance += 1
      else if (r.flip_type === 'salience') c.salience += 1
      else if (r.flip_type === 'both') c.both += 1
    }
    return c
  })()

  $: if (flipType !== 'any' && (flipTypeCounts?.[flipType] || 0) === 0) {
    flipType = 'any'
  }

  function critClass(cid) {
    const id = String(cid || '')
    if (id.startsWith('C1_')) return 'crit-c1'
    if (id.startsWith('C2_')) return 'crit-c2'
    if (id.startsWith('C3_')) return 'crit-c3'
    if (id.startsWith('C4_')) return 'crit-c4'
    if (id.startsWith('C5_')) return 'crit-c5'
    if (id.startsWith('C6_')) return 'crit-c6'
    return ''
  }

  $: filtered = flipCases.filter((r) => {
    if (!r.pair_id) return false
    if (flipType !== 'any' && r.flip_type !== flipType) return false
    if (selectedCriterion !== 'any' && r.criterion !== selectedCriterion) return false
    if (selectedEvaluator !== 'any' && r.evaluator_model !== selectedEvaluator) return false
    if (selectedStyle !== 'any' && r.style !== selectedStyle) return false

    // interpretability: when stance flip is involved, enforce minDefined
    if ((flipType === 'stance' || flipType === 'both' || flipType === 'any') && r.consensus_relaxed_cond) {
      if ((r.n_defined || 0) < minDefined) return false
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      const hay = `${r.pair_id} ${r.style} ${r.evaluator_model} ${r.criterion}`.toLowerCase()
      if (!hay.includes(q)) return false
    }

    if (requireConsensusEvidence) {
      const k = keyPC(r.pair_id, r.criterion)
      const ev = offsetsConsensus?.get(k)
      const n = (ev?.R1?.length || 0) + (ev?.R2?.length || 0)
      if (n <= 0) return false
    }
    return true
  })

  $: totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  $: page = Math.min(page, totalPages)
  $: pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  $: selectedRow = selected
    ? flipCases.find((r) => r.pair_id === selected.pair_id && r.criterion === selected.criterion)
    : null
  $: selectedText = selected?.pair_id ? pairTexts.get(selected.pair_id) : null

  // IMPORTANT: Svelte reactivity does not track dependencies inside helper functions.
  // Compute selected evidence in a reactive block with explicit dependencies.
  $: selectedEvidence = (() => {
    if (!selected) return evidenceMode === 'consensus' ? { R1: [], R2: [] } : { R1: {}, R2: {} }
    const k = keyPC(selected.pair_id, selected.criterion)
    if (evidenceMode === 'consensus') {
      return offsetsConsensus.get(k) || { R1: [], R2: [] }
    }
    return offsetsPerCoder.get(k) || { R1: {}, R2: {} }
  })()

  $: evidenceDebug = (() => {
    if (!selected) return null
    const k = keyPC(selected.pair_id, selected.criterion)
    const c = offsetsConsensus?.get(k)
    const perLoaded = offsetsPerCoder instanceof Map
    const pc = offsetsPerCoder?.get(k)
    const cR1 = Array.isArray(c?.R1) ? c.R1.length : 0
    const cR2 = Array.isArray(c?.R2) ? c.R2.length : 0
    const pcR1 = perLoaded && pc?.R1 ? Object.values(pc.R1).reduce((a, arr) => a + (arr?.length || 0), 0) : null
    const pcR2 = perLoaded && pc?.R2 ? Object.values(pc.R2).reduce((a, arr) => a + (arr?.length || 0), 0) : null
    const nCoders = perLoaded && pc ? uniqueSorted([...Object.keys(pc.R1 || {}), ...Object.keys(pc.R2 || {})]).length : null
    return { k, cR1, cR2, pcR1, pcR2, nCoders, perLoaded }
  })()

  // Evidence list for each rationale, as a reactive value.
  // IMPORTANT: do NOT compute this with {@const} inside the template, because evidence loads async
  // and we want the list to update when `selectedEvidence` changes.
  $: evListR1 =
    evidenceMode === 'consensus'
      ? (selectedEvidence?.R1 || [])
      : (coderTab
          ? (selectedEvidence?.R1?.[coderTab] || [])
          : Object.values(selectedEvidence?.R1 || {}).flat())

  $: evListR2 =
    evidenceMode === 'consensus'
      ? (selectedEvidence?.R2 || [])
      : (coderTab
          ? (selectedEvidence?.R2?.[coderTab] || [])
          : Object.values(selectedEvidence?.R2 || {}).flat())

  // coder list (explicit dependencies, no helper indirection)
  $: coderOptions =
    evidenceMode !== 'perCoder'
      ? []
      : uniqueSorted([
          ...Object.keys(selectedEvidence?.R1 || {}),
          ...Object.keys(selectedEvidence?.R2 || {})
        ])

  $: if (evidenceMode !== 'perCoder') {
    coderTab = null
  } else if (coderTab && !coderOptions.includes(coderTab)) {
    coderTab = null
  }

  onMount(async () => {
    readUrl()
    await loadAll()
    updateUrl()
  })
</script>

<div class="shell">
  <header class="topbar">
    <div class="title">
      <div class="h1">Flip Explorer</div>
      <div class="sub">
        Consensus criterion inversions (open-label vs counterbalanced)
        {#if manifest}
          <span class="chip">pairs={manifest.n_pairs_consensus_flips} · cases={manifest.n_flip_case_rows}</span>
        {/if}
      </div>
    </div>
    <div class="actions">
      <button class="btn ghost" type="button" on:click={goHome}>Criteria</button>
      <button
        class={"btn ghost " + (view === 'cases' ? 'primary' : '')}
        type="button"
        on:click={() => { view = view === 'cases' ? 'criteria' : 'cases'; updateUrl(); }}
        title="Switch between criterion-first view and the full cases table."
      >
        {view === 'cases' ? 'Narrative view' : 'All cases'}
      </button>
      <a class="btn ghost" href="../" rel="noreferrer">Back to site</a>
      {#if selected}
        <button class="btn" type="button" on:click={closeDrawer}>Close</button>
      {/if}
    </div>
  </header>

  {#if error}
    <div class="err">
      <div class="errTitle">Could not load data</div>
      <div class="errBody">{error}</div>
      <div class="errHint">
        Make sure this page is served from <code>/flip-explorer/</code> and the datasets exist under
        <code>/flip-explorer/data/</code>.
      </div>
    </div>
  {:else}
    <div class="layout">
      <aside class="filters">
        <div class="block">
          <div class="blockTitle">Filters</div>

          <div class="lblRow">
            <div class="lbl">Flip type</div>
            <button
              class="infoIcon"
              type="button"
              aria-label="What is flip type?"
              data-tip="Flip type describes the mechanism: stance flip = the rationale’s AI-vs-human preference reverses between conditions; salience shift = the criterion is mentioned in only one condition."
            >
              i
            </button>
          </div>
          <div class="seg">
            {#each ['any','stance','salience','both'].filter((ft) => ft === 'any' || (flipTypeCounts?.[ft] || 0) > 0) as ft}
              <button
                class={"btn " + (flipType === ft ? 'primary' : '')}
                type="button"
                disabled={ft !== 'any' && (flipTypeCounts?.[ft] || 0) === 0}
                title={ft !== 'any' && (flipTypeCounts?.[ft] || 0) === 0 ? 'No cases of this type in the current export.' : ''}
                on:click={() => { if (ft === 'any' || (flipTypeCounts?.[ft] || 0) > 0) { flipType = ft; page = 1; updateUrl(); } }}
              >
                {ft}{ft !== 'any' ? ` (${flipTypeCounts?.[ft] || 0})` : ''}
              </button>
            {/each}
          </div>

          <div class="lblRow">
            <div class="lbl">Criterion</div>
            <button
              class="infoIcon"
              type="button"
              aria-label="What is a criterion?"
              data-tip="A criterion is a category of reasons the evaluator uses (e.g., style markers, authenticity, clarity). We track how the use of these criteria changes across conditions."
            >
              i
            </button>
          </div>
          <select class="sel" bind:value={selectedCriterion} on:change={() => { page = 1; updateUrl(); }}>
            <option value="any">Any</option>
            {#each criteria as c}
              <option value={c}>{criterionLabel(c)}</option>
            {/each}
          </select>

          {#if isCriterionPage}
            <div class="lblRow">
              <div class="lbl">Style focus</div>
              <button
                class="infoIcon"
                type="button"
                aria-label="What is style focus?"
                data-tip="Styles are the different rewriting constraints (e.g., Sonnet, Lipogram). This lets you focus the examples on one style."
              >
                i
              </button>
            </div>
            <select class="sel" bind:value={selectedStyleFocus} on:change={() => { examplePage = 1; updateUrl(); }}>
              <option value="any">Any</option>
              {#each styleRanking.map(r => r.style) as s}
                <option value={s}>{s}</option>
              {/each}
            </select>
          {/if}

          <div class="lblRow">
            <div class="lbl">Evaluator model</div>
            <button
              class="infoIcon"
              type="button"
              aria-label="What is evaluator model?"
              data-tip="The evaluator model is the system that wrote the rationale. You can compare how different judge models exhibit criterion flips."
            >
              i
            </button>
          </div>
          <select class="sel" bind:value={selectedEvaluator} on:change={() => { page = 1; updateUrl(); }}>
            <option value="any">Any</option>
            {#each evaluators as m}
              <option value={m}>{modelPrettyName(m)}</option>
            {/each}
          </select>

          <div class="lblRow">
            <div class="lbl">Style</div>
            <button
              class="infoIcon"
              type="button"
              aria-label="What is style?"
              data-tip="Style is the rewriting constraint/genre prompt applied to the text (e.g., Sonnet, Free verse)."
            >
              i
            </button>
          </div>
          <select class="sel" bind:value={selectedStyle} on:change={() => { page = 1; updateUrl(); }}>
            <option value="any">Any</option>
            {#each styles as s}
              <option value={s}>{s}</option>
            {/each}
          </select>

          <div class="lblRow">
            <div class="lbl">Min defined (stance)</div>
            <button
              class="infoIcon"
              type="button"
              aria-label="What is min defined?"
              data-tip="For stance flips, we require that enough coders produced a defined AI-vs-human stance in both conditions. ≥2 is the usual consensus; 3/3 is stricter."
            >
              i
            </button>
          </div>
          {#if flipType === 'stance' || flipType === 'both' || flipType === 'any'}
            <div class="seg small">
              <button
                class={"btn " + (minDefined === 2 ? 'primary' : '')}
                type="button"
                on:click={() => { minDefined = 2; page = 1; updateUrl(); }}
                title="Consensus threshold: at least 2 coders with defined stances"
              >
                ≥2 defined
              </button>
              <button
                class={"btn " + (minDefined === 3 ? 'primary' : '')}
                type="button"
                on:click={() => { minDefined = 3; page = 1; updateUrl(); }}
                title="Stricter: require 3/3 coders with defined stances"
              >
                3/3 defined
              </button>
            </div>
            <div class="muted">Applies to stance flips only.</div>
          {:else}
            <div class="muted">Not applicable for salience-only view.</div>
          {/if}

          <div class="lblRow">
            <div class="lbl">Search</div>
            <button
              class="infoIcon"
              type="button"
              aria-label="What does search do?"
              data-tip="Search matches pair_id, style, evaluator model, and criterion id."
            >
              i
            </button>
          </div>
          <input class="inp" type="search" bind:value={search} placeholder="pair_id / style / model…" on:input={() => { page = 1; updateUrl(); }} />

          <div class="lblRow">
            <div class="lbl">Usefulness</div>
            <button
              class="infoIcon"
              type="button"
              aria-label="What is usefulness?"
              data-tip="This hides cases where we can’t highlight any consensus evidence, so the examples you open are immediately interpretable."
            >
              i
            </button>
          </div>
          <label class="toggle" style="margin-top:2px;">
            <input type="checkbox" bind:checked={requireConsensusEvidence} on:change={() => { page = 1; updateUrl(); }} />
            <span>Only show cases with consensus evidence</span>
          </label>
          <div class="muted">Helps focus on cases where evidence can be highlighted.</div>
        </div>

        <div class="block">
          <div class="blockTitle">Status</div>
          {#if status}
            <div class="muted">{status}</div>
          {:else}
            <div class="muted">Loaded {flipCases.length} cases.</div>
            <div class="muted">Matching filters: <b>{filtered.length}</b></div>
          {/if}
        </div>
      </aside>

      <main class={"results " + (isCriterionPage ? critClass(selectedCriterion) : '')}>
        {#if view === 'criteria' && selectedCriterion === 'any'}
          <div class="resultsHeader">
            <div class="resultsTitle">Pick a criterion</div>
          </div>
          <div class="hintRow">
            <div class="muted">
              Choose a criterion to see how it flips across styles, then open a few concrete examples.
            </div>
          </div>

          <div class="cards">
            {#each criterionCards as c (c.cid)}
              <button
                type="button"
                class={"card " + critClass(c.cid)}
                on:click={() => { selectedCriterion = c.cid; selectedStyleFocus = 'any'; requireConsensusEvidence = true; view = 'criteria'; updateUrl(); }}
              >
                <div class="cardTitle">
                  <span class={"critDot " + critClass(c.cid)}></span>
                  {criterionLabel(c.cid)}
                </div>
                <div class="cardBlurb">{criterionBlurb(c.cid)}</div>
                <div class="cardStats">
                  <div class="stat">
                    <div class="statN">{c.stance}</div>
                    <div class="statLbl">stance flips</div>
                  </div>
                  <div class="stat">
                    <div class="statN">{c.salience}</div>
                    <div class="statLbl">salience shifts</div>
                  </div>
                  <div class="stat">
                    <div class="statN">{c.nPairs}</div>
                    <div class="statLbl">pairs</div>
                  </div>
                </div>
              </button>
            {/each}
          </div>
        {:else if isCriterionPage}
          <div class="resultsHeader">
            <div class="resultsTitle">
              <span class={"critDot " + critClass(selectedCriterion)}></span>
              {criterionLabel(selectedCriterion)}
            </div>
            <div class="pager">
              <button class="btn" type="button" on:click={() => { selectedCriterion = 'any'; selectedStyleFocus = 'any'; updateUrl(); }}>Back</button>
            </div>
          </div>

          <div class="hintRow">
            <div class="muted">{criterionBlurb(selectedCriterion)}</div>
          </div>

          <div class="twoUp">
            <section class={"panel " + critClass(selectedCriterion)}>
              <div class="panelTitle">Where does it flip most (by style)?</div>
              <div class="muted">
                Ranked by stance-flip share (within the consensus-flip set shown here).
              </div>
              <div class="styleList">
                {#each styleRanking.slice(0, 18) as s (s.style)}
                  <button
                    type="button"
                    class={"styleRow " + (selectedStyleFocus === s.style ? 'active' : '')}
                    on:click={() => { selectedStyleFocus = selectedStyleFocus === s.style ? 'any' : s.style; examplePage = 1; updateUrl(); }}
                    title="Click to focus examples on this style."
                  >
                    <div class="styleName">{s.style}</div>
                    <div class="styleNums">
                      <span class="chip">stance {s.stance}</span>
                      <span class="chip">share {(s.stanceShare * 100).toFixed(0)}%</span>
                    </div>
                  </button>
                {/each}
              </div>
            </section>

            <section class={"panel " + critClass(selectedCriterion)}>
              <div class="panelTitle">Examples</div>
              <div class="muted">
                Click an example to open the paired rationales with highlighted evidence.
              </div>

              <div class="gallery">
                {#each examples as r (r.pair_id + '|' + r.criterion)}
                  <button class="exCard" type="button" on:click={() => openCase(r)}>
                    <div class="exTop">
                      <div class="exStyle">{r.style}</div>
                      <span class="chip">{r.flip_type}</span>
                    </div>
                    <div class="exMeta muted">
                      evidence {r.ev_found}/{r.ev_total} · {modelPrettyName(r.evaluator_model)}
                    </div>
                    {#if r.flip_type === 'salience' && r.salience_side}
                      <div class="exMeta muted">salience shift: evidence in {r.salience_side} only</div>
                    {:else if (r.flip_type === 'stance' || r.flip_type === 'both')}
                      <div class="exMeta muted">stance flip: evidence in R1={r.ev_found_r1}, R2={r.ev_found_r2}</div>
                    {/if}
                  </button>
                {/each}
              </div>

              <div class="pager" style="margin-top:10px;">
                <button class="btn" type="button" disabled={examplePage <= 1} on:click={() => { examplePage = Math.max(1, examplePage - 1); updateUrl(); }}>
                  Prev
                </button>
                <span class="muted">Page {examplePage} / {exampleTotalPages}</span>
                <button class="btn" type="button" disabled={examplePage >= exampleTotalPages} on:click={() => { examplePage = Math.min(exampleTotalPages, examplePage + 1); updateUrl(); }}>
                  Next
                </button>
              </div>
            </section>
          </div>
        {:else}
          <div class="resultsHeader">
            <div class="resultsTitle">Cases</div>
            <div class="pager">
              <button class="btn" type="button" disabled={page <= 1} on:click={() => { page = Math.max(1, page - 1); updateUrl(); }}>Prev</button>
              <span class="muted">Page {page} / {totalPages}</span>
              <button class="btn" type="button" disabled={page >= totalPages} on:click={() => { page = Math.min(totalPages, page + 1); updateUrl(); }}>Next</button>
            </div>
          </div>

          <div class="hintRow">
            <div class="muted">
              Tip: click a row to open the paired rationales and highlighted evidence.
              {#if pairTexts.size && flipCases.length}
                <span class="chip">texts loaded: {pairTexts.size}/{new Set(flipCases.map(r => r.pair_id)).size}</span>
              {/if}
            </div>
          </div>

          <div class="table">
            <div class="row head">
              <div>Criterion</div>
              <div>Evaluator</div>
              <div>Style</div>
              <div>Flip</div>
              <div class="right">Votes</div>
            </div>
            {#each pageRows as r (r.pair_id + '|' + r.criterion)}
              <button class="row body" type="button" on:click={() => openCase(r)}>
                <div class="cell crit">{criterionLabel(r.criterion)}</div>
                <div class="cell">{modelPrettyName(r.evaluator_model)}</div>
                <div class="cell">{r.style}</div>
                <div class="cell">
                  <span class="chip">{r.flip_type}</span>
                  {#if r.consensus_relaxed_cond}
                    <span class="chip">defined={r.n_defined}</span>
                  {/if}
                </div>
                <div class="cell right">
                  {#if r.flip_type === 'salience' || r.flip_type === 'both'}
                    <span class="muted">sal {r.salience_votes}/{r.thresh}</span>
                  {/if}
                  {#if r.flip_type !== 'salience'}
                    <span class="muted">flip {r.relaxed_votes_cond}/{r.thresh}</span>
                  {/if}
                </div>
              </button>
            {/each}
          </div>
        {/if}
      </main>
    </div>
  {/if}

  {#if selected && selectedRow}
    <div class="drawer">
      <div class="drawerTop">
        <div class="drawerTitle">{criterionLabel(selectedRow.criterion)}</div>
        <div class="drawerMeta">
          <span class="chip">{modelPrettyName(selectedRow.evaluator_model || selectedText?.evaluator_model)}</span>
          <span class="chip">{selectedRow.style || selectedText?.style}</span>
          <span class="chip">{selectedRow.flip_type}</span>
          {#if selectedRow.consensus_relaxed_cond}
            <span class="chip">defined={selectedRow.n_defined}</span>
          {/if}
          <span class="chip">pair_id: {selected.pair_id}</span>
        </div>

        <div class="drawerActions">
          <label class="toggle">
            <input type="checkbox" bind:checked={highlightsEnabled} />
            <span>highlights</span>
          </label>

          <div class="seg small">
            <button class={"btn " + (evidenceMode === 'consensus' ? 'primary' : '')} type="button" on:click={() => { evidenceMode = 'consensus'; updateUrl(); }}>Consensus evidence</button>
            <button
              class={"btn " + (evidenceMode === 'perCoder' ? 'primary' : '')}
              type="button"
              on:click={() => { evidenceMode = 'perCoder'; coderTab = null; updateUrl(); }}
              title="Shows evidence extracted by each coder. Default is 'All coders combined'."
            >
              Per-coder
            </button>
          </div>

          {#if evidenceMode === 'perCoder'}
            <select class="sel small" bind:value={coderTab} on:change={updateUrl} disabled={coderOptions.length === 0}>
              {#if coderOptions.length === 0}
                <option value="">(no coders loaded)</option>
              {:else}
                <option value="">All coders (combined)</option>
                {#each coderOptions as c}
                  <option value={c}>{c}</option>
                {/each}
              {/if}
            </select>
          {/if}

          <button class="btn" type="button" on:click={closeDrawer}>Close</button>
        </div>
      </div>

      {#if evidenceDebug}
        <div class="muted" style="margin: 6px 0 10px;">
          Evidence found: consensus R1={evidenceDebug.cR1}, R2={evidenceDebug.cR2}
          · per-coder
          {#if evidenceDebug.perLoaded}
            R1={evidenceDebug.pcR1}, R2={evidenceDebug.pcR2} ({evidenceDebug.nCoders} coders loaded)
          {:else}
            (not loaded)
          {/if}
          {#if evidenceMode === 'perCoder'}
            · active coder: {coderTab || '(none)'}
          {/if}
        </div>
      {/if}

      <div class="legend">
        <span class="pill a">Version A</span>
        <span class="pill b">Version B</span>
        <span class="pill both">both</span>
        <span class="pill unk">unknown</span>
      </div>

      {#if !selectedText}
        <div class="err" style="margin: 0;">
          <div class="errTitle">Text not available for this case</div>
          <div class="errHint">
            This usually means <code>pair_texts_for_consensus_flips.csv.gz</code> does not contain this <code>pair_id</code>.
            Re-export texts for all flip pairs and re-copy into <code>/flip-explorer/data/</code>.
          </div>
        </div>
      {:else}
      {#key selectedText.pair_id + '|' + selectedRow.criterion + '|' + evidenceMode + '|' + (coderTab || '')}
        <div class="twoCol">
          {#each ['R1','R2'] as rlab}
            {@const txt = rlab === 'R1' ? selectedText.rationale_R1 : selectedText.rationale_R2}
            {@const labelsAny = rlab === 'R1' ? selectedText.A_labels : selectedText.B_labels}
            {@const creatorsAny = rlab === 'R1' ? selectedText.A_actual_creators : selectedText.B_actual_creators}
            {@const roles = versionRoles(creatorsAny)}
            {@const labels = parseListMaybe(labelsAny).map(String)}
            {@const creators = roles.creators}
            {@const evList = rlab === 'R1' ? evListR1 : evListR2}
            {@const stats = rlab === 'R1' ? hlStats.R1 : hlStats.R2}

            <section class="pane">
              <div class="paneHead">
                <div class="paneTitle">{rlab} <span class="muted">({rlab === 'R1' ? 'open_label' : 'counterbalanced'})</span></div>
                <div class="paneMap muted">
                  {#if roles.ai && roles.human}
                    Stable mapping: <b>AI = Version {roles.ai}</b> · <b>Human = Version {roles.human}</b>
                  {:else}
                    Stable mapping unavailable
                  {/if}
                </div>
                <div class="vb">
                  <div class="vbRow"><span class="pill a">Version A</span> <span class="muted">text from <b>{creators?.[0] || '(missing)'}</b> (shown: {labels?.[0] || '(missing)'})</span></div>
                  <div class="vbRow"><span class="pill b">Version B</span> <span class="muted">text from <b>{creators?.[1] || '(missing)'}</b> (shown: {labels?.[1] || '(missing)'})</span></div>
                </div>
                {#if highlightsEnabled && evList.length > 0}
                  <div class="muted" style="margin-top:8px;">
                    Highlights: {stats?.matchedSnippets ?? 0}/{stats?.totalSnippets ?? evList.length} snippets matched
                  </div>
                {/if}
              </div>

              <div
                class="paneBody"
                use:markHighlights={{
                  enabled: highlightsEnabled,
                  ranges: evList,
                  text: txt,
                  onResult: (res) => {
                    if (rlab === 'R1') hlStats = { ...hlStats, R1: res }
                    else hlStats = { ...hlStats, R2: res }
                  }
                }}
              ></div>

              <details class="evDetails">
                <summary class="muted">Evidence snippets ({evList.length})</summary>
                <div class="evList">
                  {#if evList.length === 0}
                    <div class="muted">
                      No {evidenceMode === 'consensus' ? 'consensus' : 'per-coder'} evidence snippets for this rationale.
                      {#if evidenceMode === 'consensus'}
                        <span class="muted"> (consensus requires ≥2 coders agreeing on a snippet)</span>
                      {/if}
                      {#if evidenceMode === 'consensus'}
                        <button class="btn" type="button" style="margin-left:10px;" on:click={() => { evidenceMode = 'perCoder'; coderTab = null; }}>
                          Try per-coder
                        </button>
                      {/if}
                    </div>
                  {:else}
                    {#each evList as e, i (String(e?.snippet || '') + '|' + i)}
                      {@const pill = refersPill(e?.refers_to)}
                      <div class={"evItem " + pill.cls}>
                        <span class={"pill " + pill.cls}>{pill.label}</span>
                        <span class="evText">{e?.snippet}</span>
                      </div>
                    {/each}
                  {/if}
                </div>
              </details>
            </section>
          {/each}
        </div>
      {/key}
      {/if}
    </div>
  {/if}
</div>

<style>
  .shell {
    min-height: 100vh;
  }
  .topbar {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    gap: 16px;
    justify-content: space-between;
    align-items: flex-start;
    padding: 14px 16px;
    border-bottom: 1px solid var(--border);
    background: color-mix(in srgb, var(--bg) 92%, transparent);
    backdrop-filter: blur(10px);
  }
  .title .h1 {
    font-size: 18px;
    font-weight: 850;
    letter-spacing: -0.01em;
  }
  .sub {
    margin-top: 2px;
    font-size: 13px;
    color: var(--muted);
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    align-items: center;
  }
  .actions {
    display: flex;
    gap: 10px;
    align-items: center;
  }

  .layout {
    display: grid;
    grid-template-columns: 320px 1fr;
    gap: 14px;
    padding: 14px 16px;
  }
  @media (max-width: 980px) {
    .layout {
      grid-template-columns: 1fr;
    }
  }

  .filters {
    position: sticky;
    top: 66px;
    align-self: start;
    display: grid;
    gap: 12px;
  }
  @media (max-width: 980px) {
    .filters {
      position: static;
    }
  }
  .block {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 14px;
    box-shadow: var(--shadow);
    padding: 12px;
  }
  .blockTitle {
    font-weight: 850;
    margin-bottom: 8px;
    letter-spacing: -0.01em;
  }
  .lbl {
    display: block;
    font-size: 12px;
    color: var(--muted);
    margin: 10px 0 6px;
    font-weight: 750;
  }
  .lblRow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .lblRow .lbl {
    margin: 10px 0 6px;
  }
  .critDot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 999px;
    margin-right: 8px;
    border: 1px solid var(--border);
    vertical-align: middle;
    background: color-mix(in srgb, var(--panel) 80%, transparent);
  }
  .critDot.crit-c1 { background: color-mix(in srgb, var(--c1) 40%, var(--panel)); }
  .critDot.crit-c2 { background: color-mix(in srgb, var(--c2) 40%, var(--panel)); }
  .critDot.crit-c3 { background: color-mix(in srgb, var(--c3) 40%, var(--panel)); }
  .critDot.crit-c4 { background: color-mix(in srgb, var(--c4) 40%, var(--panel)); }
  .critDot.crit-c5 { background: color-mix(in srgb, var(--c5) 40%, var(--panel)); }
  .critDot.crit-c6 { background: color-mix(in srgb, var(--c6) 40%, var(--panel)); }
  .seg {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .seg.small .btn {
    padding: 6px 8px;
    font-size: 12px;
  }
  .sel,
  .inp {
    width: 100%;
    border: 1px solid var(--border);
    background: var(--panel-2);
    color: var(--text);
    border-radius: 10px;
    padding: 9px 10px;
    font-size: 13px;
    outline: none;
  }
  .sel.small {
    width: auto;
    padding: 7px 8px;
    font-size: 12px;
  }
  .range {
    width: 100%;
  }
  .muted {
    color: var(--muted);
    font-size: 12.5px;
  }

  .results {
    min-width: 0;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 14px;
    box-shadow: var(--shadow);
    padding: 10px;
  }
  .cards {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    padding: 6px;
  }
  @media (max-width: 980px) {
    .cards {
      grid-template-columns: 1fr;
    }
  }
  .card {
    text-align: left;
    border: 1px solid var(--border);
    background: var(--panel);
    border-radius: 14px;
    padding: 12px;
    box-shadow: var(--shadow);
    cursor: pointer;
  }
  /* Criterion cards use a per-card color variable for hover */
  .card { --crit: var(--accent); }
  .card.crit-c1 { --crit: var(--c1); background: color-mix(in srgb, var(--c1) 16%, var(--panel)); }
  .card.crit-c2 { --crit: var(--c2); background: color-mix(in srgb, var(--c2) 16%, var(--panel)); }
  .card.crit-c3 { --crit: var(--c3); background: color-mix(in srgb, var(--c3) 16%, var(--panel)); }
  .card.crit-c4 { --crit: var(--c4); background: color-mix(in srgb, var(--c4) 16%, var(--panel)); }
  .card.crit-c5 { --crit: var(--c5); background: color-mix(in srgb, var(--c5) 16%, var(--panel)); }
  .card.crit-c6 { --crit: var(--c6); background: color-mix(in srgb, var(--c6) 16%, var(--panel)); }
  .card.crit-c1 .stat { background: color-mix(in srgb, var(--c1) 10%, var(--panel-2)); }
  .card.crit-c2 .stat { background: color-mix(in srgb, var(--c2) 10%, var(--panel-2)); }
  .card.crit-c3 .stat { background: color-mix(in srgb, var(--c3) 10%, var(--panel-2)); }
  .card.crit-c4 .stat { background: color-mix(in srgb, var(--c4) 10%, var(--panel-2)); }
  .card.crit-c5 .stat { background: color-mix(in srgb, var(--c5) 10%, var(--panel-2)); }
  .card.crit-c6 .stat { background: color-mix(in srgb, var(--c6) 10%, var(--panel-2)); }

  .results.crit-c1 { background: color-mix(in srgb, var(--c1) 7%, var(--panel)); }
  .results.crit-c2 { background: color-mix(in srgb, var(--c2) 7%, var(--panel)); }
  .results.crit-c3 { background: color-mix(in srgb, var(--c3) 7%, var(--panel)); }
  .results.crit-c4 { background: color-mix(in srgb, var(--c4) 7%, var(--panel)); }
  .results.crit-c5 { background: color-mix(in srgb, var(--c5) 7%, var(--panel)); }
  .results.crit-c6 { background: color-mix(in srgb, var(--c6) 7%, var(--panel)); }

  .panel.crit-c1 { background: color-mix(in srgb, var(--c1) 7%, var(--panel)); border-color: color-mix(in srgb, var(--c1) 28%, var(--border)); }
  .panel.crit-c2 { background: color-mix(in srgb, var(--c2) 7%, var(--panel)); border-color: color-mix(in srgb, var(--c2) 28%, var(--border)); }
  .panel.crit-c3 { background: color-mix(in srgb, var(--c3) 7%, var(--panel)); border-color: color-mix(in srgb, var(--c3) 28%, var(--border)); }
  .panel.crit-c4 { background: color-mix(in srgb, var(--c4) 7%, var(--panel)); border-color: color-mix(in srgb, var(--c4) 28%, var(--border)); }
  .panel.crit-c5 { background: color-mix(in srgb, var(--c5) 7%, var(--panel)); border-color: color-mix(in srgb, var(--c5) 28%, var(--border)); }
  .panel.crit-c6 { background: color-mix(in srgb, var(--c6) 7%, var(--panel)); border-color: color-mix(in srgb, var(--c6) 28%, var(--border)); }
  .card:hover {
    border-color: color-mix(in srgb, var(--crit) 45%, var(--border));
    background: color-mix(in srgb, var(--crit) 22%, var(--panel));
  }
  .cardTitle {
    font-weight: 900;
    letter-spacing: -0.01em;
    margin-bottom: 6px;
  }
  .cardBlurb {
    font-size: 12.5px;
    color: var(--muted);
    line-height: 1.35;
    margin-bottom: 10px;
  }
  .cardStats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }
  .stat {
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 8px 10px;
    background: var(--panel-2);
  }
  .statN {
    font-size: 18px;
    font-weight: 900;
    letter-spacing: -0.01em;
    line-height: 1.1;
  }
  .statLbl {
    margin-top: 2px;
    font-size: 12px;
    color: var(--muted);
    font-weight: 750;
  }

  .twoUp {
    display: grid;
    grid-template-columns: 1fr 1.25fr;
    gap: 12px;
    padding: 6px;
  }
  @media (max-width: 980px) {
    .twoUp {
      grid-template-columns: 1fr;
    }
  }
  .panel {
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--panel);
    box-shadow: var(--shadow);
    padding: 12px;
  }
  .panelTitle {
    font-weight: 900;
    letter-spacing: -0.01em;
    margin-bottom: 6px;
  }
  .styleList {
    margin-top: 10px;
    display: grid;
    gap: 8px;
  }
  .styleRow {
    width: 100%;
    display: flex;
    justify-content: space-between;
    gap: 10px;
    align-items: center;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--panel-2);
    padding: 8px 10px;
    cursor: pointer;
    text-align: left;
  }
  .styleRow:hover {
    border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
  }
  .styleRow.active {
    background: color-mix(in srgb, var(--accent) 8%, var(--panel-2));
    border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
  }
  .styleName {
    font-weight: 800;
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .styleNums {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-shrink: 0;
  }
  .gallery {
    margin-top: 10px;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  @media (max-width: 980px) {
    .gallery {
      grid-template-columns: 1fr;
    }
  }
  .exCard {
    text-align: left;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--panel-2);
    padding: 10px 12px;
    cursor: pointer;
  }
  .exCard:hover {
    border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
  }
  .exTop {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    align-items: baseline;
  }
  .exStyle {
    font-weight: 900;
    letter-spacing: -0.01em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .exMeta {
    margin-top: 6px;
  }
  .resultsHeader {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 8px 6px 10px;
  }
  .hintRow {
    padding: 0 6px 10px;
  }
  .resultsTitle {
    font-weight: 850;
    letter-spacing: -0.01em;
  }
  .pager {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .table {
    border-top: 1px solid var(--border);
  }
  .row {
    display: grid;
    grid-template-columns: 1.2fr 1fr 1fr 0.9fr 0.7fr;
    gap: 10px;
    align-items: center;
    padding: 10px 8px;
    border-bottom: 1px solid var(--border);
  }
  .row.head {
    font-size: 12px;
    color: var(--muted);
    font-weight: 750;
    background: color-mix(in srgb, var(--panel) 70%, transparent);
  }
  .row.body {
    width: 100%;
    text-align: left;
    background: transparent;
    border: none;
    cursor: pointer;
  }
  .row.body:hover {
    background: color-mix(in srgb, var(--accent) 6%, transparent);
  }
  .cell {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cell.crit {
    font-weight: 780;
  }
  .right {
    text-align: right;
    justify-self: end;
  }

  .err {
    margin: 20px 16px;
    padding: 16px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--panel);
    box-shadow: var(--shadow);
  }
  .errTitle {
    font-weight: 850;
    margin-bottom: 6px;
  }
  .errBody {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
    font-size: 12px;
    color: var(--muted);
    white-space: pre-wrap;
  }
  .errHint {
    margin-top: 10px;
    color: var(--muted);
    font-size: 12px;
  }

  .drawer {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    top: 76px;
    background: color-mix(in srgb, var(--bg) 94%, transparent);
    backdrop-filter: blur(14px);
    border-top: 1px solid var(--border);
    overflow: auto;
    padding: 12px 16px 18px;
  }
  .drawerTop {
    display: grid;
    gap: 8px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 10px;
  }
  .drawerTitle {
    font-weight: 900;
    letter-spacing: -0.01em;
    font-size: 16px;
  }
  .drawerMeta {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    align-items: center;
  }
  .drawerActions {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
  }
  .toggle {
    display: inline-flex;
    gap: 8px;
    align-items: center;
    font-size: 12px;
    color: var(--muted);
    font-weight: 750;
  }
  .legend {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
    margin: 8px 0 10px;
  }
  .twoCol {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  @media (max-width: 980px) {
    .twoCol {
      grid-template-columns: 1fr;
    }
  }
  .pane {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 14px;
    box-shadow: var(--shadow);
    overflow: hidden;
  }
  .paneHead {
    padding: 12px 12px 10px;
    border-bottom: 1px solid var(--border);
    background: color-mix(in srgb, var(--panel) 80%, transparent);
  }
  .paneTitle {
    font-weight: 900;
    letter-spacing: -0.01em;
  }
  .paneMap {
    margin-top: 4px;
  }
  .vb {
    margin-top: 10px;
    display: grid;
    gap: 6px;
  }
  .vbRow {
    display: flex;
    gap: 8px;
    align-items: baseline;
    flex-wrap: wrap;
  }
  .paneBody {
    padding: 12px;
    white-space: pre-wrap;
    line-height: 1.45;
    font-size: 13px;
  }
  .evDetails {
    border-top: 1px solid var(--border);
    padding: 10px 12px 12px;
    background: color-mix(in srgb, var(--panel) 70%, transparent);
  }
  .evDetails summary {
    cursor: pointer;
    user-select: none;
    font-weight: 750;
  }
  .evList {
    margin-top: 10px;
    display: grid;
    gap: 8px;
  }
  .evItem {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 8px;
    align-items: baseline;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--panel);
  }
  .evItem.a {
    background: color-mix(in srgb, var(--hl-a) 22%, var(--panel));
  }
  .evItem.b {
    background: color-mix(in srgb, var(--hl-b) 22%, var(--panel));
  }
  .evItem.both {
    background: color-mix(in srgb, var(--hl-both) 22%, var(--panel));
  }
  .evItem.unk {
    background: color-mix(in srgb, var(--hl-unk) 22%, var(--panel));
  }
  .evText {
    font-size: 12.5px;
    color: var(--text);
    white-space: normal;
  }
</style>
