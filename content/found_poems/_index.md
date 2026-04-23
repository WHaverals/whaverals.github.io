---
title: "Poetry, found in the PPA"
description: "Reception history of poetry, found in the Princeton Prosody Archive"
draft: false
layout: single
ShowBreadCrumbs: false
hideAuthor: true
---

This page introduces an interactive map of poetic reception in the [Princeton Prosody Archive](https://ppa.princeton.edu/) (PPA). 

The visualization encodes how poems travel together: two poems are neighbours in the map when they tend to appear (often excerpted) in the same works (i.e., proximity reflects co-citation across the PPA). The underlying view summarises **13,445 poems** and their joint occurrence patterns across **2,767 host works** in the PPA (specifically, the ['Literary Collection'](https://prosody.princeton.edu/archive/?collections=10)). 

Each dot is a poem; two dots sit close together when the same PPA hosts tend to quote them both. Colour marks community membership (a Leiden clustering on a kNN graph built from the poems' shared PPA-host signatures), and dot size encodes how many hosts cite the poem (drastically weighted to keep large anthologies--quoting *a lot* of poetry--from dominating the geometry).

A longer write-up of the data, the filters, and the methods is in preparation; for now, the map itself is the argument → **[Open the interactive map](https://whaverals.github.io/found_poems/found_poems.html)**.

