# PPA Poets network page: data build

The page at `static/ppa_poets/` (published at https://whaverals.github.io/ppa_poets/, cited in the JCA article's footnote 18) loads two compact JSON files built by this script.

## Inputs and outputs

- **Inputs** (in `static/ppa_poets/`):
  - `poets.gexf`: the hand-laid-out Gephi export, which supplies positions and community colours;
  - `temporal_index.json`: the notebook-11 temporal sidecar (PPA-Ends-of-Prosody, `notebooks/11_attention_ecologies_network.ipynb`, cell 45).
- **Outputs**: `static/ppa_poets/data/network.json` and `data/time.json`, about 2.8 MB together.

The page doesn't load the input files themselves.

## Rebuild

```bash
python3 tools/ppa_poets/build_data.py
```

After rebuilding, bump `DATA_VERSION` in `static/ppa_poets/app.js`, and the `?v=` strings in `index.html` if `app.js` or `style.css` changed. GitHub Pages caches files for 10 minutes, and the version strings stop returning visitors from mixing old and new files.

## Preview locally

```bash
cd ~/gitrepos/whaverals.github.io/static/ppa_poets && python3 -m http.server 8000
```

Then open http://localhost:8000/. Useful deep links:

- `#poet=Q82083`: Keats, all years
- `#poet=Q82083&w=1820`: Keats in the 1820–1849 window
- `#w=1770&new=1`: 1770–1799, with new entrants ringed
- `#color=period`: coloured by period
- `?embed=1`: compact mode for slides

## Fixed choices

These come from the review in `REVIEW_ppa_poets.md`, which is untracked:

- **Community names** follow the article (p. 25).
- **Colours** keep Figure 7's hue for each community, darkened so every pair stays distinguishable under simulated colour-vision deficiencies.
- **Periods** use the article's Figure 5 bins (birth year + 20).
- **Thin windows**: windows with fewer than 50 works are flagged (NETWORK.md §6.2).
- **Links** are weighted by excess co-mention (`assoc`). The default shows each poet's 3 strongest.
