"""Build the compact JSON that static/ppa_poets/ loads.

Reads the Gephi export (poets.gexf) and the notebook-11 temporal sidecar
(temporal_index.json) from static/ppa_poets/ and writes
static/ppa_poets/data/network.json and data/time.json.
Positions and community colours are copied from the Gephi file unchanged.

Run from anywhere:  python3 tools/ppa_poets/build_data.py
After rebuilding, bump DATA_VERSION in static/ppa_poets/app.js.
"""

import json
import math
import re
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
SRC = REPO / "static" / "ppa_poets"
OUT = SRC / "data"
OUT.mkdir(exist_ok=True)

NS = {"g": "http://gexf.net/1.3", "viz": "http://gexf.net/1.3/viz"}
ARCHIVE_START = 1559
THIN_WORKS = 50  # NETWORK.md 6.2: below this, read a window as descriptive only

# The seven Gephi community colours, named as in the article (p. 25-26).
# "color" is the prototype's palette; "gephi" is the colour used in Figure 7.
GROUPS = [
    ("classical", (206, 218, 132), "Classical antiquity", "#6E7F12",
     "A classical and humanist apparatus through which prosodists route their discussions."),
    ("medieval", (255, 199, 131), "Medieval writing", "#F7B03C",
     "Centred on Chaucer, with Middle English, Latin and French points of comparison."),
    ("earlymod", (221, 203, 177), "Early modern English poetry", "#7A5A3A",
     "An early modern repertoire anchored by Shakespeare, Spenser, Jonson, Marlowe, Donne and Sidney."),
    ("c18", (161, 224, 176), "Eighteenth-century criticism", "#1A9E79",
     "An eighteenth-century critical-pedagogical lane around Pope, Dryden, Johnson and Swift."),
    ("romantic", (236, 200, 228), "Romantic and Victorian poetry", "#C25BA8",
     "A large Anglophone neighbourhood centred on nineteenth-century exemplars."),
    ("modern", (255, 184, 174), "Modern and transatlantic field", "#E8573F",
     "The transatlantic and early-modernist penumbra of the nineteenth-century neighbourhood."),
    ("continental", (161, 221, 225), "Continental comparison", "#3B8FD0",
     "French and German comparanda treated as a parallel tradition of verse theory."),
]

# Period bins on eligibility year (birth + 20), as in notebook 07 / article Figure 5.
PERIODS = [
    ("antiquity", "Classical Antiquity", "≈ 800 BCE–500 CE", -10_000, 500, "#5B3A8E"),
    ("lateant", "Late Antiquity / Early Medieval", "≈ 500–1000", 500, 1000, "#8E7CC3"),
    ("medieval", "High & Late Medieval", "≈ 1000–1500", 1000, 1500, "#3F6FB5"),
    ("renaissance", "Renaissance / Early Modern", "≈ 1500–1660", 1500, 1660, "#2C9A9A"),
    ("restoration", "Restoration & Enlightenment", "≈ 1660–1780", 1660, 1780, "#5AA343"),
    ("revolutionary", "Revolutionary & Romantic", "≈ 1780–1837", 1780, 1837, "#C9A227"),
    ("victorian", "Victorian / Realist", "≈ 1837–1901", 1837, 1901, "#E07B39"),
    ("modernp", "Modern / Early 20th Century", "≈ 1901–1929", 1901, 10_000, "#C8414B"),
]
UNKNOWN_PERIOD = ("unknown", "Birth year unknown", "", None, None, "#9A9A9A")

ORDINAL_SUFFIX = re.compile(r",\s+\d+(st|nd|rd|th)\s+.*$")


def short_label(label):
    return ORDINAL_SUFFIX.sub("", label).strip()


def clean_title(t):
    if not t:
        return None
    return re.sub(r"[\s:;,/.=]+$", "", str(t)).strip() or None


def work_url(m):
    if not m:
        return None
    if m.get("source_url"):
        return m["source_url"]
    wid, src = str(m.get("work_id") or ""), str(m.get("source") or "").lower()
    if not wid:
        return None
    if "hathitrust" in src:
        return f"https://hdl.handle.net/2027/{wid}"
    if "eebo" in src:
        return f"http://name.umdl.umich.edu/{wid}.0001.001"
    if "gale" in src:
        return f"https://link.gale.com/apps/doc/{wid.split('-')[0]}/ECCO"
    return None


def period_index(birth):
    if birth is None:
        return len(PERIODS)
    e = birth + 20
    for i, (_, _, _, lo, hi, _) in enumerate(PERIODS):
        if lo <= e < hi:
            return i
    return len(PERIODS)


def rnd(x, nd):
    return float(round(x, nd))


def main():
    root = ET.parse(SRC / "poets.gexf").getroot()
    ti = json.loads((SRC / "temporal_index.json").read_text(encoding="utf-8"))
    meta = ti["node_meta"]
    rgb_to_group = {g[1]: i for i, g in enumerate(GROUPS)}

    nodes = {k: [] for k in ["qid", "label", "short", "x", "y", "deg", "works", "group", "period",
                             "birth", "elig", "entry", "first", "top"]}
    idx = {}
    for n in root.findall(".//g:nodes/g:node", NS):
        qid = n.get("id")
        av = {a.get("for"): a.get("value") for a in n.findall(".//g:attvalue", NS)}
        pos = n.find("viz:position", NS)
        col = n.find("viz:color", NS)
        rgb = (int(col.get("r")), int(col.get("g")), int(col.get("b")))
        m = meta.get(qid, {})
        label = n.get("label")
        birth = m.get("birth_year")
        birth = int(birth) if birth is not None else None
        entry = m.get("entry_year")
        fm, tw = m.get("first_ppa_mention"), m.get("top_ppa_work")
        idx[qid] = len(nodes["qid"])
        nodes["qid"].append(qid)
        nodes["label"].append(label)
        nodes["short"].append(short_label(label))
        nodes["x"].append(rnd(float(pos.get("x")), 1))
        nodes["y"].append(rnd(float(pos.get("y")), 1))
        nodes["deg"].append(int(av["degree"]))
        nodes["works"].append(int(av["d1"]))
        nodes["group"].append(rgb_to_group[rgb])
        nodes["period"].append(period_index(birth))
        nodes["birth"].append(birth)
        nodes["elig"].append(max(birth + 20, ARCHIVE_START) if birth is not None else None)
        nodes["entry"].append(int(entry) if entry is not None else None)
        nodes["first"].append(
            [fm.get("year"), clean_title(fm.get("title")), fm.get("author"), work_url(fm), fm.get("page")]
            if fm else None)
        nodes["top"].append(
            [tw.get("year"), clean_title(tw.get("title")), tw.get("author"), work_url(tw), tw.get("windows")]
            if tw else None)

    edges = {k: [] for k in ["s", "t", "a", "w", "e"]}
    edge_idx = {}
    for e in root.findall(".//g:edges/g:edge", NS):
        av = {a.get("for"): a.get("value") for a in e.findall(".//g:attvalue", NS)}
        s, t = idx[e.get("source")], idx[e.get("target")]
        a = float(av["d8"])
        key = "|".join(sorted([e.get("source"), e.get("target")]))
        edge_idx[key] = len(edges["s"])
        edges["s"].append(s)
        edges["t"].append(t)
        edges["a"].append(rnd(a, 3) if a < 10 else rnd(a, 1))
        edges["w"].append(int(av["d9"]))
        edges["e"].append(rnd(float(av["d11"]), 2))

    # Rank of each link among each endpoint's links (by association); keep the better rank.
    by_node = defaultdict(list)
    for i, (s, t, a) in enumerate(zip(edges["s"], edges["t"], edges["a"])):
        by_node[s].append((a, i))
        by_node[t].append((a, i))
    rank = [10**9] * len(edges["s"])
    for lst in by_node.values():
        lst.sort(reverse=True)
        for r, (_, i) in enumerate(lst, start=1):
            rank[i] = min(rank[i], r)
    edges["r"] = rank

    groups_out = []
    for i, (gid, gephi, name, color, desc) in enumerate(GROUPS):
        members = [j for j, g in enumerate(nodes["group"]) if g == i]
        anchors = sorted(members, key=lambda j: -nodes["deg"][j])[:8]
        groups_out.append({"id": gid, "name": name, "color": color,
                           "gephi": "rgb({},{},{})".format(*gephi), "desc": desc,
                           "n": len(members), "anchors": anchors})

    periods_out = []
    for i, p in enumerate(PERIODS + [UNKNOWN_PERIOD]):
        periods_out.append({"id": p[0], "name": p[1], "range": p[2], "color": p[5],
                            "n": sum(1 for v in nodes["period"] if v == i)})

    network = {
        "meta": {
            "nodes": len(nodes["qid"]), "edges": len(edges["s"]),
            "attention_works": 2967, "work_universe": 3149,
            "min_pair_works": ti["meta"]["min_pair_support"],
            "window_pages": ti["meta"]["window_l_pages"],
            "source": "Gephi export poets.gexf (layout and communities) + notebook 11 temporal index",
        },
        "groups": groups_out, "periods": periods_out, "nodes": nodes, "edges": edges,
    }

    n = len(nodes["qid"])
    windows, node_works, win_edges = [], [], []
    for s in ti["slices"]:
        works = [0] * n
        for q, st in s["node_stats"].items():
            works[idx[q]] = st["works"]
        es = s["edge_stats"]
        e_list, w_list, a_list = [], [], []
        for key in s["edges"]:
            i = edge_idx.get(key)
            if i is None:
                continue
            st = es.get(key, {})
            e_list.append(i)
            w_list.append(int(st.get("works", 0)))
            a = float(st.get("assoc", 0.0))
            a_list.append(rnd(a, 3) if a < 10 else rnd(a, 1))
        summ = s["summary"]
        windows.append({"label": s["label"], "start": s["start_year"], "end": s["end_year"],
                        "works": summ["works"], "attn": summ["attention_works"],
                        "poets": summ["active_poets"], "links": summ["active_edges"],
                        "thin": summ["works"] < THIN_WORKS})
        node_works.append(works)
        win_edges.append({"e": e_list, "w": w_list, "a": a_list})

    time = {"meta": {"window_years": ti["meta"]["rolling_years"], "step_years": ti["meta"]["rolling_step_years"],
                     "age_min": ti["meta"]["age_min_for_temporal_eligibility"], "thin_works": THIN_WORKS,
                     "restricted_to_global_links": ti["meta"]["temporal_edges_restricted_to_global_backbone"]},
            "windows": windows, "nodeWorks": node_works, "edges": win_edges}

    for name, obj in [("network.json", network), ("time.json", time)]:
        path = OUT / name
        path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"wrote {path.relative_to(REPO)} ({path.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
