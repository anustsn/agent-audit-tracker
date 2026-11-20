/* Agent Audit Tracker: renders data/bundle.js (window.TRACKER).
   Three kinds of information are kept apart and labelled on the page:
   document facts (registries, quoted identifiers), researcher classification (questions, ratings, roles, coding links)
   and evidence quality (origin, integrity). An automatic check is labelled as such.
   All external text is inserted with textContent, never as HTML. Links are limited to https URLs. */
(function () {
  "use strict";
  function $(id) { return document.getElementById(id); }
  var T = window.TRACKER;
  if (!T) {
    $("checked").textContent = "Data not loaded: run scripts/update_status.py to build data/bundle.js.";
    return;
  }

  // ------------------------------------------------------------------ data
  var sources = (T.sources && T.sources.sources) || [];
  var research = (T.sources && T.sources.related_research) || [];
  var byId = {};
  sources.forEach(function (s) { byId[s.id] = s; });
  var status = T.status.sources || {};
  var reviews = T.status.reviews || {};
  var fields = T.fields;
  var rows = fields.rows;
  var rowById = {};
  rows.forEach(function (r) { rowById[r.id] = r; });
  var cols = sources.filter(function (s) { return s.matrix; });
  var changes = (T.changes || []).slice().reverse();
  var drafts = (T.status.discovered || []).slice().sort(function (a, b) {
    return (b.updated || "").localeCompare(a.updated || "") || a.name.localeCompare(b.name);
  });
  var CLS = T.classification || {};
  var roles = CLS.roles || [];
  var roleById = {};
  roles.forEach(function (r) { roleById[r.id] = r; });
  var QUAL = T.quality || {};
  var FACTS = T.document_facts || {};
  var REFS = T.references || { documents: {}, targets: {} };
  var REQ = T.requirements || null;
  var BUILD = T.build || {};
  var RLOG = (T.ratings_log || []).slice().reverse();
  var TEXTS = T.status.texts || {};
  var SNAP = T.status.ratings_snapshot || {};
  // Publication setting (data/site.json). false = catalogue: document facts only, no researcher ratings.
  var SHOW_RATINGS = !!((T.site || {}).show_ratings);
  Array.prototype.forEach.call(document.querySelectorAll("[data-ratings]"), function (e) { e.hidden = !SHOW_RATINGS; });
  Array.prototype.forEach.call(document.querySelectorAll("[data-catalogue]"), function (e) { e.hidden = SHOW_RATINGS; });
  var nameToId = {};
  sources.forEach(function (s) { if (s.track && s.track.name) nameToId[s.track.name] = s.id; });

  var STATES = ["explicit", "partial", "external", "check", "unspecified", "unreviewed"];
  var LABEL = { explicit: "explicit", partial: "partial", external: "external", check: "to check",
                unspecified: "not specified", unreviewed: "not reviewed", stale: "re-check", current: "current" };
  var RANK = { explicit: 5, partial: 4, external: 3, check: 2, unspecified: 1, unreviewed: 0 };
  var LAYER = { doc: "Document fact", res: "Researcher classification", qual: "Evidence quality", auto: "Automatic check" };

  // ------------------------------------------------------------------ helpers
  function safeUrl(u) { return typeof u === "string" && /^https:\/\/[^\s"<>]+$/i.test(u) ? u : null; }
  function el(tag, p, kids) {
    var e = document.createElement(tag);
    p = p || {};
    if (p.text != null) e.textContent = String(p.text);
    if (p.cls) e.className = p.cls;
    if (p.href) {
      var u = safeUrl(p.href);
      if (u) { e.href = u; e.rel = "noopener noreferrer"; e.target = "_blank"; }
    }
    if (p.title) e.title = p.title;
    if (p.attrs) Object.keys(p.attrs).forEach(function (k) { e.setAttribute(k, p.attrs[k]); });
    if (p.on) Object.keys(p.on).forEach(function (k) { e.addEventListener(k, p.on[k]); });
    (kids || []).forEach(function (c) {
      if (c == null || c === "") return;
      e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return e;
  }
  function badge(kind, text) { return el("span", { cls: "badge " + kind, text: text || LABEL[kind] || kind }); }
  function layer(kind) { return el("span", { cls: "layer layer-" + kind, text: LAYER[kind] }); }
  function fmtTime(s) { return s ? String(s).replace("T", " ").replace(/:\d\dZ$/, " UTC").replace(/Z$/, " UTC") : ""; }
  function th(text) { return el("th", { text: text, attrs: { scope: "col" } }); }
  function head(table, labels) { table.appendChild(el("thead", {}, [el("tr", {}, labels.map(th))])); }
  function dl(pairs) {
    var d = el("dl", { cls: "kv" });
    pairs.forEach(function (p) {
      var v = p[1];
      if (v == null || v === "" || (Array.isArray(v) && !v.length)) return;
      d.appendChild(el("dt", { text: p[0] }));
      var dd = el("dd");
      if (Array.isArray(v)) dd.appendChild(el("ul", { cls: "plain" }, v.map(function (x) { return el("li", { text: x }); })));
      else if (typeof v === "object") dd.appendChild(v);
      else dd.textContent = String(v);
      d.appendChild(dd);
    });
    return d;
  }
  function h3(t, kind) { return el("h3", {}, [t, kind ? " " : null, kind ? layer(kind) : null]); }
  function plural(n, word) { return n + " " + word + (n === 1 ? "" : "s"); }
  function linkBtn(text, fn, label) {
    var name = !label || label === text ? text : text + " (" + label + ")";   // accessible name starts with the visible text
    return el("button", { cls: "linkbtn", text: text, attrs: { type: "button", "aria-label": name },
                          on: { click: function () { fn(this); } } });
  }
  function daysAgo(dateStr) {
    if (!dateStr || !T.status.checked_at) return null;
    var d = (Date.parse(T.status.checked_at) - Date.parse(dateStr)) / 864e5;
    return isNaN(d) ? null : Math.max(0, Math.floor(d));
  }
  function freshText(dateStr) {
    var n = daysAgo(dateStr);
    if (n == null) return "";
    return n === 0 ? "today" : n === 1 ? "1 day ago" : n < 60 ? n + " days ago" : Math.round(n / 30) + " months ago";
  }
  function shortHash(h) { return h ? String(h).slice(0, 12) + "…" : ""; }
  var announceTimer = null;
  function announce(msg) {          // polite status message for screen readers after a filter or view change
    var s = $("status-msg");
    if (!s) return;
    clearTimeout(announceTimer);
    s.textContent = "";
    announceTimer = setTimeout(function () { s.textContent = msg; }, 60);
  }
  function verifiedOf(id) { return ((fields.mappings[id] || {}).verified) || {}; }
  function textRec(id, which) { return ((TEXTS[id] || {})[which]) || null; }
  function textNode(id, which) {
    var t = textRec(id, which);
    if (!t) return null;
    if (t.sha256) return el("span", {}, [el("a", { href: t.url, text: t.doc }), el("span", { cls: "sig mono", text: "SHA-256 " + t.sha256, title: "SHA-256 of the archived plain text, " + (t.bytes || "?") + " bytes" })]);
    if (t.sha) return el("span", {}, [el("a", { href: t.url, text: "commit " + t.sha.slice(0, 12) + "…" }), el("span", { cls: "sig mono", text: t.sha })]);
    if (t.head_sha) return el("span", {}, [el("a", { href: t.url, text: "pull request" }), el("span", { cls: "sig mono", text: "head " + t.head_sha })]);
    if (t.as_of) return el("span", {}, [el("a", { href: t.url, text: "pull request as of " + fmtTime(t.as_of) }), el("span", { cls: "sig", text: t.note || "" })]);
    if (t.url) return el("a", { href: t.url, text: "open on GitHub" });
    return null;
  }
  function refName(n) {
    var m = /^(rfc|bcp|std)(\d+)$/.exec(n || "");
    return m ? m[1].toUpperCase() + " " + m[2] : n;
  }

  // ------------------------------------------------------------------ classification and facts
  function rolesOf(id) { return ((CLS.document_roles || {})[id] || []).map(function (r) { return (roleById[r] || {}).name || r; }); }
  function hasRole(id, role) { return ((CLS.document_roles || {})[id] || []).indexOf(role) >= 0; }
  function docType(id) {
    var st = status[id] || {};
    if (st.doc_type) return { value: st.doc_type, src: "doc", note: st.doc_type_source || "registry" };
    var v = (CLS.document_types || {})[id];
    return v ? { value: v, src: "res", note: "researcher label" } : { value: "", src: "", note: "" };
  }
  function maturity(id) {
    var raw = (status[id] || {}).state || "";
    var map = (CLS.maturity_rule || {}).map || {};
    return { raw: raw, norm: map[raw] || "" };
  }
  function stability(id) { return ((FACTS.stability || {})[id]) || null; }
  function reqLevel(colId, rowId) { return ((FACTS.requirement_levels || {})[colId + "/" + rowId]) || null; }
  function qualityOf(colId, rowId) {
    var a = QUAL.assessments || {}, def = QUAL["default"] || "Not established";
    var cell = a[colId + "/" + rowId] || {}, doc = a[colId] || {};
    return { origin: cell.origin || def, integrity: doc.integrity || def };
  }
  var emptyRoles = roles.filter(function (r) { return !sources.some(function (s) { return hasRole(s.id, r.id); }); });

  // ------------------------------------------------------------------ review state
  function colReview(id) { return reviews[id] || { state: "current" }; }
  function reviewBadge(id) {
    var r = colReview(id).state;
    return badge(r === "stale" ? "stale" : r === "unread" ? "unreviewed" : "current", r === "unread" ? "not read" : null);
  }
  function shortRev(s, v) {
    if (!v) return "";
    if (s.track.type === "ietf") { var m = /-(\d{2})$/.exec(v); return m ? "-" + m[1] : v; }
    if (s.track.type === "github_pr") return "updated " + v.slice(0, 10);
    return v;
  }
  function renamed(s) {
    var r = colReview(s.id);
    return s.track.type === "ietf" && r.from && r.to && r.from.replace(/-\d{2}$/, "") !== r.to.replace(/-\d{2}$/, "");
  }
  function readLabel(s) {
    var r = colReview(s.id), v = (fields.mappings[s.id] || {}).verified || {};
    if (r.state === "unread") return "not read yet";
    if (s.track.type === "ietf") return r.from || (v.name || s.track.name) + "-" + v.rev;
    if (v.sha) return "commit " + v.sha;
    if (v.updated) return "as of " + fmtTime(v.updated);
    return "";
  }
  function reviewMsg(s) {
    var r = colReview(s.id), st = status[s.id] || {};
    if (r.state === "unread") return "Not read yet; current revision " + (st.version || "");
    if (r.state === "current") return "Rated at the current revision";
    if (renamed(s)) return "Renamed and revised: read " + r.from + ", now " + r.to;
    if (s.track.type === "github_pr") return "Pull request updated since it was read";
    return "Newer revision: read " + shortRev(s, r.from) + ", now " + shortRev(s, r.to);
  }

  function cellOf(col, row) {
    var c = ((fields.mappings[col.id] || {}).cells || {})[row.id];
    var st = colReview(col.id).state;
    return { col: col, row: row, filled: !!c, status: c ? c.status : "unreviewed", text: c ? c.text : "",
             ids: (c && c.ids) || [], stale: st === "stale" && !!c, colState: st };
  }
  function tags(c) { return c.stale ? [c.status, "stale"] : [c.status]; }
  function cellText(c) { return c.text + " " + c.ids.join(" ") + " " + LABEL[c.status]; }
  function best(row, list, currentOnly) {
    var b = null;
    list.forEach(function (col) {
      var c = cellOf(col, row);
      if (!c.filled || (currentOnly && c.colState !== "current")) return;
      if (!b || RANK[c.status] > RANK[b.status]) b = c;
    });
    return b;
  }
  function verdict(c) {
    var r = colReview(c.col.id);
    if (r.state !== "stale" || !c.filled) return null;
    if (r.error) return { cls: "v-unchecked", text: "comparison failed", detail: r.error };
    var f = (r.fields || {})[c.row.id];
    if (c.col.track.type === "github_pr") return { cls: "v-unchecked", text: "not checked automatically",
                                  detail: "Identifiers are not checked for pull requests; read the commits added since." };
    if (!f || !f.length) return { cls: "v-unchecked", text: "not checked automatically",
                                  detail: "No field identifiers are recorded for this cell; read the comparison." };
    var counted = f.some(function (x) { return x.old != null; });
    var never = f.filter(function (x) { return x.old === 0 && x.new === 0; }).map(function (x) { return x.id; });
    var gone = f.filter(function (x) { return x.old > 0 && x.new === 0; }).map(function (x) { return x.id; });
    var moved = f.filter(function (x) { return x.in_changed_lines; }).map(function (x) { return x.id; });
    if (gone.length) return { cls: "v-gone", text: "identifier no longer found", detail: gone.join(", ") };
    if (moved.length) return { cls: "v-changed", text: "in changed lines", detail: moved.join(", ") };
    if (never.length) return { cls: "v-unchecked", text: "identifier not found in either revision", detail: never.join(", ") };
    if (!counted) return { cls: "v-same", text: "not in changed lines", detail: "No identifier appears in a changed line of the diff. Presence in the whole text was not counted. Read before relying on it." };
    return { cls: "v-same", text: "no change found", detail: "Identifiers present in both revisions and not in a changed line. Read before relying on it." };
  }
  function idLines(c) {
    var f = (colReview(c.col.id).fields || {})[c.row.id] || [];
    return f.map(function (x) {
      var counts = x.old == null ? "" : x.old + " → " + x.new + " mentions, ";
      return x.id + ": " + counts + (x.in_changed_lines ? "in a changed line" : "not in a changed line");
    });
  }

  // ------------------------------------------------------------------ references (document facts)
  var processRefs = REFS.process_refs || [];
  function refEntry(id) { return (REFS.documents || {})[id] || null; }
  function targetInfo(n) { return (REFS.targets || {})[n] || {}; }
  function refDiff(id) {
    var e = refEntry(id);
    if (!e || !e.read || !e.current || e.read.doc === e.current.doc) return null;
    function key(r) { return r.target + "|" + r.type; }
    var a = {}, b = {};
    e.read.refs.forEach(function (r) { a[key(r)] = r; });
    e.current.refs.forEach(function (r) { b[key(r)] = r; });
    return { added: e.current.refs.filter(function (r) { return !a[key(r)]; }),
             removed: e.read.refs.filter(function (r) { return !b[key(r)]; }) };
  }
  var replacedRefs = [];
  sources.forEach(function (s) {
    var e = refEntry(s.id);
    if (!e || !e.current) return;
    e.current.refs.forEach(function (r) {
      var t = targetInfo(r.target);
      if (t.state === "Replaced") replacedRefs.push({ id: s.id, doc: e.current.doc, target: r.target, type: r.type, by: t.replaced_by || [] });
    });
  });

  // ------------------------------------------------------------------ header
  $("checked").textContent = "Status last checked: " + (fmtTime(T.status.checked_at) || "never");
  (function layerKey() {
    var k = $("layer-key");
    if (!k) return;
    [["doc", "stated by a document or its registry, with a revision or pointer"],
     ["res", "the researcher's questions, ratings, roles and coding links"],
     ["qual", "how far an auditor could rely on it; \"Not established\" means not yet assessed"],
     ["auto", "a heuristic computed by the update script"]].forEach(function (p) {
      k.appendChild(el("li", {}, [layer(p[0]), " " + p[1]]));
    });
  })();

  // ------------------------------------------------------------------ overview
  var counts = {};
  STATES.forEach(function (k) { counts[k] = 0; });
  var staleCells = 0;
  cols.forEach(function (col) {
    rows.forEach(function (row) {
      var c = cellOf(col, row);
      counts[c.status] += 1;
      if (c.stale) staleCells += 1;
    });
  });
  var totalCells = cols.length * rows.length;
  function explicitRows(currentOnly) {
    return rows.filter(function (r) { var b = best(r, cols, currentOnly); return b && b.status === "explicit"; }).length;
  }
  var staleCols = cols.filter(function (s) { return colReview(s.id).state === "stale"; });
  var unreadCols = cols.filter(function (s) { return colReview(s.id).state === "unread"; });

  function tile(label, value, sub, target, extra) {
    return el("a", { cls: "tile", attrs: { href: "#" + target } },
      [el("span", { cls: "tile-label", text: label }), el("span", { cls: "tile-value", text: value }),
       sub ? el("span", { cls: "tile-sub", text: sub }) : null].concat(extra || []));
  }
  function segBar() {
    var bar = el("div", { cls: "seg", attrs: { role: "img", "aria-label": "Matrix cells by specification status: " + STATES.map(function (k) {
      return LABEL[k] + " " + counts[k]; }).join(", ") + ", of " + totalCells } });
    STATES.forEach(function (k) {
      if (!counts[k]) return;
      var part = el("span", { cls: "seg-part s-" + k, title: LABEL[k] + ": " + counts[k] + " of " + totalCells + " cells" });
      part.style.flexGrow = counts[k];
      bar.appendChild(part);
    });
    var key = el("ul", { cls: "seg-key" }, STATES.filter(function (k) { return counts[k]; }).map(function (k) {
      return el("li", {}, [el("span", { cls: "sw s-" + k, attrs: { "aria-hidden": "true" } }), LABEL[k] + " " + counts[k]]);
    }));
    return [bar, key];
  }
  var drafts1st = drafts.map(function (d) { return d.first_seen || ""; }).filter(Boolean).sort();
  var newest = drafts1st.length ? drafts1st[drafts1st.length - 1] : "";
  var newestN = drafts.filter(function (d) { return d.first_seen === newest; }).length;
  var draftSub = !newest ? "found automatically" :
    (newestN === drafts.length ? "all first seen on " + newest : newestN + " first seen on " + newest);
  var checkCells = [];
  cols.forEach(function (col) { rows.forEach(function (row) { var c = cellOf(col, row); if (c.status === "check") checkCells.push(c); }); });

  var tiles = $("tiles");
  var withApi = sources.filter(function (s) { return s.track.type !== "manual"; });
  var recent = withApi.filter(function (s) {
    var u = (status[s.id] || {}).updated;
    return u && T.status.checked_at && (Date.parse(T.status.checked_at) - Date.parse(u)) / 864e5 <= 30;
  });
  function processFree(refs) { return refs.filter(function (r) { return (REFS.process_refs || []).indexOf(r.target) < 0; }); }
  var currentRefs = [];
  sources.forEach(function (s) { var e = (REFS.documents || {})[s.id]; if (e && e.current) currentRefs = currentRefs.concat(processFree(e.current.refs)); });
  if (!SHOW_RATINGS) {
    tiles.appendChild(tile("Tracked documents", String(sources.length),
      withApi.length + " checked automatically, " + (sources.length - withApi.length) + " by hand; " +
      (roles.length - emptyRoles.length) + " of " + roles.length + " roles have a tracked document", "/documents"));
    tiles.appendChild(tile("Updated in the 30 days before the last check", String(recent.length) + " / " + withApi.length,
      "New revision, commit or update reported by the registry; RFCs are fixed texts and never count", "/documents", [layer("doc")]));
    tiles.appendChild(tile("Current references to replaced drafts", String(replacedRefs.length),
      "A current revision cites a draft that has since been replaced (Datatracker)", "/references", [layer("doc")]));
    tiles.appendChild(tile("Related drafts found", String(drafts.length), draftSub, "/drafts", [layer("auto")]));
  } else {
  tiles.appendChild(tile("Tracked documents", String(sources.length),
    cols.length + " rated in the matrix, " + (sources.length - cols.length) + " status only; " +
    (roles.length - emptyRoles.length) + " of " + roles.length + " roles have a tracked document", "documents"));
  tiles.appendChild(tile("Questions rated explicit at a current revision", explicitRows(true) + " / " + rows.length,
    "Researcher rating. " + explicitRows(false) + " / " + rows.length + " if older reads are counted; " + staleCells + " rated cells await re-check",
    "coverage", segBar()));
  tiles.appendChild(tile("Documents needing review", String(staleCols.length + unreadCols.length),
    staleCols.length + " newer revision, " + unreadCols.length + " not read, " + checkCells.length + " cells to check", "review"));
  tiles.appendChild(tile("Current references to replaced drafts", String(replacedRefs.length),
    "Document fact (Datatracker): a current revision cites a draft that has since been replaced", "references"));
  tiles.appendChild(tile("Related drafts found", String(drafts.length), draftSub, "discovered-section"));
  }

  // ------------------------------------------------------------------ coverage statement (researcher's scope)
  (function renderScope() {
    var cov = CLS.coverage || {}, t = $("scope-table");
    if (!t) return;
    $("scope-not-tool").textContent = (cov.not_an_audit_tool || "") + " " + (cov.about || "");
    head(t, ["Area", "Examples", "Status", "Note"]);
    var tb = el("tbody");
    (cov.areas || []).forEach(function (r) {
      tb.appendChild(el("tr", {}, [el("td", { text: r.area }), el("td", { text: r.examples }),
        el("td", {}, [el("span", { cls: "pill", text: r.status })]), el("td", { text: r.note || "" })]));
    });
    t.appendChild(tb);
    if (cov.scope_frozen) $("scope-not-tool").textContent += " " + cov.scope_frozen;
    $("scope-questions").textContent = (cov.question_scope || "").replace(" (not yet published)", SHOW_RATINGS ? "" : " (not yet published)");
  })();

  // ------------------------------------------------------------------ observations (computed, never written by hand)
  (function renderObservations() {
    var ul = $("observations");
    if (!ul) return;
    $("obs-asof").textContent = "Computed from the data below. Document status as of " + (fmtTime(T.status.checked_at) || "unknown") + ".";
    function item(kinds, text) { ul.appendChild(el("li", {}, kinds.map(layer).concat([" " + text]))); }
    if (!SHOW_RATINGS) {
      item(["doc"], recent.length + " of " + withApi.length + " documents checked automatically were updated in the 30 days before the last check" +
        (recent.length ? ": " + recent.map(function (s) { return s.short + " (" + ((status[s.id] || {}).version || "") + ", " + ((status[s.id] || {}).updated || "") + ")"; }).join("; ") : "") + ".");
      if (replacedRefs.length) {
        item(["doc"], "Current revisions cite drafts that have since been replaced " + plural(replacedRefs.length, "time") + ": " +
          replacedRefs.map(function (x) { return byId[x.id].short + " → " + x.target; }).join("; ") +
          ". Such a citation may have been correct when it was written.");
      } else {
        item(["doc"], "No current revision of a tracked draft cites a draft that has been replaced.");
      }
      var nNorm = currentRefs.filter(function (r) { return r.type === "normative"; }).length;
      item(["doc"], "The current revisions of the tracked Internet-Drafts list " + currentRefs.length + " references (" + nNorm +
        " normative, " + (currentRefs.length - nNorm) + " informative or other), not counting process references.");
      item(["doc"], drafts.length + " active Internet-Drafts cite a tracked draft and look related (" + draftSub + "). They have not been reviewed.");
    } else {
    item(["res"], "Questions rated explicit at a current revision: " + explicitRows(true) + " of " + rows.length +
      ". Counting ratings made on older revisions: " + explicitRows(false) + " of " + rows.length + ".");
    var rated = totalCells - counts.unreviewed;
    item(["res"], counts.unreviewed + " of " + totalCells + " matrix cells are not reviewed. Of the " + rated +
      " rated cells, " + staleCells + " were rated on an older revision of the document.");
    if (replacedRefs.length) {
      item(["doc"], "Current revisions cite drafts that have since been replaced " + plural(replacedRefs.length, "time") + ": " +
        replacedRefs.map(function (x) { return byId[x.id].short + " → " + x.target; }).join("; ") +
        ". Such a citation may have been correct when it was written.");
    } else {
      item(["doc"], "No current revision of a tracked draft cites a draft that has been replaced.");
    }
    var byType = {}, nExplicit = 0;
    cols.forEach(function (col) {
      rows.forEach(function (row) {
        var c = cellOf(col, row);
        if (c.status !== "explicit") return;
        nExplicit += 1;
        var t = docType(col.id).value || "unknown type";
        byType[t] = (byType[t] || 0) + 1;
      });
    });
    if (nExplicit) {
      var parts = Object.keys(byType).sort(function (a, b) { return byType[b] - byType[a]; })
        .map(function (t) { return byType[t] + " from " + t; });
      var unreadTypes = unreadCols.map(function (s) { return s.short + " (" + (docType(s.id).value || "unknown type") + ")"; });
      item(["res", "doc"], "Of " + plural(nExplicit, "cell") + " rated explicit, " + parts.join(", ") + "." +
        (unreadTypes.length ? " Not reviewed yet: " + unreadTypes.join(", ") + "." : ""));
    }
    }

    // Researcher observations: dated notes, checked against the figures they were based on
    var METRICS = { explicit_current: explicitRows(true), explicit_any: explicitRows(false), unreviewed_cells: counts.unreviewed,
                    stale_cells: staleCells, replaced_refs: replacedRefs.length };
    var ro = $("res-observations"), notes = ((T.observations || {}).notes || []).slice().sort(function (a, b) { return (b.date || "").localeCompare(a.date || ""); });
    if (!notes.length) ro.appendChild(el("li", { cls: "muted", text: "None recorded yet." }));
    notes.forEach(function (n) {
      var changed = Object.keys(n.based_on || {}).filter(function (k) { return k in METRICS && METRICS[k] !== n.based_on[k]; });
      ro.appendChild(el("li", {}, [layer("res"), " " + (n.date || "undated") + (n.by ? " · " + n.by : "") + ": " + (n.text || ""),
        changed.length ? el("span", { cls: "sig changed", text: "Figures changed since this note: " + changed.map(function (k) { return k + " was " + n.based_on[k] + ", now " + METRICS[k]; }).join("; ") + "." }) : null]));
    });
    // Research findings: links to published work only
    var fl = $("findings"), items = ((T.findings || {}).items || []);
    if (!items.length) fl.appendChild(el("li", { cls: "muted", text: "None yet." }));
    items.forEach(function (f) {
      fl.appendChild(el("li", {}, [(f.date ? f.date + " · " : ""), safeUrl(f.url) ? el("a", { href: f.url, text: f.title || f.url }) : (f.title || ""),
        f.citation ? el("span", { cls: "sig", text: f.citation }) : null]));
    });
  })();

  // ------------------------------------------------------------------ review queue
  var queue = [];
  staleCols.forEach(function (s) {
    var r = colReview(s.id);
    var filled = rows.filter(function (row) { return cellOf(s, row).filled; });
    var moved = 0;
    filled.forEach(function (row) { var v = verdict(cellOf(s, row)); if (v && (v.cls === "v-changed" || v.cls === "v-gone")) moved += 1; });
    var auto = [];
    if (r.lines_added != null) auto.push("+" + r.lines_added + " / −" + r.lines_removed + " lines");
    if (r.commits != null) auto.push(plural(r.commits, "commit"));
    if (r.sections_added && r.sections_added.length) auto.push(plural(r.sections_added.length, "section") + " added");
    if (r.sections_removed && r.sections_removed.length) auto.push(plural(r.sections_removed.length, "section") + " removed");
    var d = refDiff(s.id);
    if (d && (d.added.length || d.removed.length)) auto.push("references +" + d.added.length + " / −" + d.removed.length);
    if (r.error) auto.push("comparison failed");
    queue.push({ kind: "doc", id: s.id, item: s.short, why: reviewMsg(s),
                 affected: plural(filled.length, "rated cell") + "; " + moved + " with identifiers in changed lines",
                 auto: auto.join(", ") || "not compared", link: r.compare_url, linkText: "Compare revisions" });
  });
  unreadCols.forEach(function (s) {
    var st = status[s.id] || {};
    queue.push({ kind: "doc", id: s.id, item: s.short, why: reviewMsg(s), affected: "no cells rated",
                 auto: "", link: s.url, linkText: "Read " + (st.version || "document") });
  });
  checkCells.forEach(function (c) {
    queue.push({ kind: "cell", id: c.col.id, row: c.row.id, item: c.col.short + ": " + c.row.question,
                 why: "Rated \"to check\": " + c.text, affected: "1 cell", auto: "", link: c.col.url, linkText: "Open document" });
  });
  replacedRefs.forEach(function (x) {
    var s = byId[x.id];
    queue.push({ kind: "doc", id: x.id, item: s.short + " cites " + x.target,
                 why: "Current revision " + x.doc + " has a " + x.type + " reference to " + x.target + ", now replaced by " +
                      (x.by.join(", ") || "another draft") + " (Datatracker). The citation may have been correct when written.",
                 affected: "", auto: "", link: "https://datatracker.ietf.org/doc/" + encodeURIComponent(x.target) + "/", linkText: "Open cited draft" });
  });
  sources.forEach(function (s) {
    var st = status[s.id] || {};
    if (st.error) queue.push({ kind: "doc", id: s.id, item: s.short, why: "Status check failed; last known values shown",
                               affected: "", auto: st.error, link: s.url, linkText: "Open document" });
    if (s.track.type === "manual" && st.updated && T.status.checked_at) {
      var age = (Date.parse(T.status.checked_at) - Date.parse(st.updated)) / 864e5;
      if (age > 180) queue.push({ kind: "doc", id: s.id, item: s.short, why: "Checked by hand " + Math.round(age) + " days ago",
                                  affected: "", auto: "", link: s.url, linkText: "Check again" });
    }
  });
  (function renderQueue() {
    var t = $("review-table");
    $("review-count").textContent = "(" + queue.length + ")";
    if (!queue.length) { t.appendChild(el("tbody", {}, [el("tr", {}, [el("td", { text: "Nothing to review." })])])); return; }
    head(t, ["Item", "Why", "Evidence affected", "Automatic check", "Next step"]);
    var tb = el("tbody");
    queue.forEach(function (q) {
      var open = q.kind === "cell"
        ? linkBtn(q.item, function (b) { openCell(q.id, q.row, b); }, "Details: " + q.item)
        : linkBtn(q.item, function (b) { openDoc(q.id, b); }, "Details: " + q.item);
      tb.appendChild(el("tr", {}, [
        el("td", {}, [open]), el("td", { text: q.why }), el("td", { text: q.affected }), el("td", { text: q.auto }),
        el("td", {}, [q.link ? el("a", { href: q.link, text: q.linkText }) : null])
      ]));
    });
    t.appendChild(tb);
  })();

  // ------------------------------------------------------------------ filters
  var S = { q: "", row: "", hide: {}, states: {}, notes: false, refDoc: "", refView: "read", refProcess: false };
  function hit(str) { return !S.q || String(str || "").toLowerCase().indexOf(S.q) >= 0; }
  function anyState() { return Object.keys(S.states).some(function (k) { return S.states[k]; }); }

  function chip(label, pressed, onToggle, swatch) {
    var b = el("button", { cls: "chip", attrs: { type: "button", "aria-pressed": String(pressed) } },
      [swatch ? el("span", { cls: "sw s-" + swatch, attrs: { "aria-hidden": "true" } }) : null, label]);
    b.addEventListener("click", function () {
      var p = b.getAttribute("aria-pressed") !== "true";
      b.setAttribute("aria-pressed", String(p));
      onToggle(p);
    });
    return b;
  }
  function buildFilters() {
    var f = $("filters");
    f.textContent = "";
    var sel = el("select", { attrs: { id: "f-row" } }, [el("option", { text: "All questions", attrs: { value: "" } })]
      .concat(rows.map(function (r) { return el("option", { text: r.question + (r.signals ? " (" + r.signals + ")" : ""), attrs: { value: r.id } }); })));
    sel.value = S.row;
    sel.addEventListener("change", function () { S.row = sel.value; renderMatrix(); });
    f.appendChild(el("div", { cls: "fgroup" }, [el("label", { text: "Question", attrs: { "for": "f-row" } }), sel]));
    f.appendChild(el("div", { cls: "fgroup", attrs: { role: "group", "aria-label": "Documents" } },
      [el("span", { cls: "flabel", text: "Documents" })].concat(cols.map(function (c) {
        return chip(c.short, !S.hide[c.id], function (p) { S.hide[c.id] = !p; renderMatrix(); });
      }))));
    f.appendChild(el("div", { cls: "fgroup", attrs: { role: "group", "aria-label": "Specification status" } },
      [el("span", { cls: "flabel", text: "Status" })].concat(STATES.concat(["stale"]).map(function (k) {
        return chip(LABEL[k], !!S.states[k], function (p) { S.states[k] = p; renderMatrix(); }, k);
      }))));
    var notes = el("input", { attrs: { type: "checkbox", id: "f-notes" } });
    notes.checked = S.notes;
    notes.addEventListener("change", function () { S.notes = notes.checked; renderMatrix(); });
    f.appendChild(el("div", { cls: "fgroup" }, [
      el("label", { cls: "check-label", attrs: { "for": "f-notes" } }, [notes, " Show researcher notes in cells"]),
      el("button", { cls: "reset", text: "Reset filters", attrs: { type: "button" },
                     on: { click: function () { S.row = ""; S.hide = {}; S.states = {}; S.notes = false; buildFilters(); renderMatrix();
                       var rb = document.querySelector("#filters .reset"); if (rb) rb.focus(); } } })
    ]));
  }

  // ------------------------------------------------------------------ matrix
  var matrixHits = 0;
  function renderMatrix() {
    var table = $("matrix");
    table.textContent = "";
    var vis = cols.filter(function (c) { return !S.hide[c.id]; });
    var filterOn = anyState();
    var hr = el("tr", {}, [el("th", { attrs: { scope: "col" } }, ["Evidence question ", el("small", { cls: "muted", text: "(researcher)" })])]);
    vis.forEach(function (col) {
      var st = status[col.id] || {}, dt = docType(col.id);
      var h = el("th", { cls: "colhead", attrs: { scope: "col" } }, [
        linkBtn(col.short, function (b) { openDoc(col.id, b); }, "Details: " + col.title),
        el("small", { text: (st.version || "") + (dt.value ? " · " + dt.value : "") }),
        reviewBadge(col.id)
      ]);
      h.title = reviewMsg(col);
      hr.appendChild(h);
    });
    hr.appendChild(el("th", { cls: "colhead", attrs: { scope: "col" },
      title: "Highest researcher rating among the shown documents that were rated at their current revision" },
      [el("span", { text: "Best current rating" })]));
    table.appendChild(el("thead", {}, [hr]));

    var tb = el("tbody");
    matrixHits = 0;
    rows.forEach(function (row) {
      if (S.row && S.row !== row.id) return;
      var cells = vis.map(function (col) { return cellOf(col, row); });
      var qHit = hit(row.question + " " + row.signals);
      if (!qHit && !cells.some(function (c) { return hit(cellText(c)); })) return;
      if (filterOn && !cells.some(function (c) { return tags(c).some(function (t) { return S.states[t]; }); })) return;
      matrixHits += 1;
      var tr = el("tr", {}, [el("th", { attrs: { scope: "row" } }, [
        linkBtn(row.question, function (b) { openQuestion(row.id, b); }, "Question view: " + row.question),
        row.signals ? el("span", { cls: "sig", text: "Signals " + row.signals }) : null])]);
      cells.forEach(function (c) {
        var dim = (filterOn && !tags(c).some(function (t) { return S.states[t]; })) || (S.q && !qHit && !hit(cellText(c)));
        var btn = el("button", { cls: "cell", attrs: { type: "button", "aria-label": c.col.short + ", " + row.question + ": " +
          LABEL[c.status] + (c.stale ? ", rated on an older revision" : "") },
          on: { click: function () { openCell(c.col.id, row.id, this); } } }, [badge(c.status)]);
        if (c.stale) btn.appendChild(el("span", { cls: "stale-mark", text: "re-check", attrs: { "aria-hidden": "true" } }));
        if (c.ids.length) btn.appendChild(el("code", { cls: "ids", text: c.ids.slice(0, 2).join(", ") + (c.ids.length > 2 ? " +" + (c.ids.length - 2) : "") }));
        if (S.notes && c.text) btn.appendChild(el("span", { cls: "cell-text", text: c.text }));
        tr.appendChild(el("td", { cls: dim ? "dim" : "" }, [btn]));
      });
      var bc = best(row, vis, true), ba = best(row, vis, false);
      var td = el("td", { cls: "bestcell" }, [bc ? badge(bc.status) : badge("unreviewed", "none")]);
      if (bc) td.appendChild(el("span", { cls: "sig", text: bc.col.short }));
      if (ba && (!bc || RANK[ba.status] > RANK[bc.status]))
        td.appendChild(el("span", { cls: "sig older", text: "Older read: " + LABEL[ba.status] + " (" + ba.col.short + " " + shortRev(ba.col, colReview(ba.col.id).from) + ")" }));
      tr.appendChild(td);
      tb.appendChild(tr);
    });
    table.appendChild(tb);
    $("matrix-empty").hidden = matrixHits > 0;
    updateInfo();
    if (matrixRendered) announce("Specification status: showing " + matrixHits + " of " + rows.length + " questions and " + vis.length + " of " + cols.length + " documents.");
    matrixRendered = true;
  }
  var matrixRendered = false;

  var legend = $("legend");
  legend.appendChild(el("span", { cls: "legend-title" }, ["Specification status ", layer("res")]));
  STATES.forEach(function (k) { legend.appendChild(el("span", {}, [badge(k), " " + ((fields.legend || {})[k] || "").replace(/^[^:]+:\s*/, "")])); });
  legend.appendChild(el("span", {}, [badge("stale"), " Rated on an older revision of the document."]));

  // ------------------------------------------------------------------ provenance
  function statusFrom(st) {
    if (!st.source) return "fetched " + fmtTime(T.status.checked_at);
    if (st.source === "checked by hand") return "checked by hand on " + (st.updated || "?");
    return st.source + ", " + fmtTime(st.checked_at || T.status.checked_at);
  }
  (function renderBuild() {
    var box = $("build-info");
    if (!box) return;
    var commit = BUILD.source_commit, repo = BUILD.repository;
    box.appendChild(dl([
      ["Data version", BUILD.tracker_version ? "v" + BUILD.tracker_version : null],
      ["Generated", fmtTime(BUILD.generated_at) + (BUILD.where ? " (" + BUILD.where + ")" : "")],
      ["Source commit", commit ? el("a", { href: "https://github.com/" + repo + "/commit/" + commit, text: commit }) : "not recorded (local run)"],
      ["Workflow run", BUILD.run_url ? el("a", { href: BUILD.run_url, text: "run " + BUILD.run_id }) : null],
      ["SHA-256 of curated files", el("details", {}, [el("summary", { text: Object.keys(BUILD.curated_sha256 || {}).length + " files" }),
        el("ul", { cls: "plain mono" }, Object.keys(BUILD.curated_sha256 || {}).map(function (f) { return el("li", { text: "data/" + f + ": " + BUILD.curated_sha256[f] }); }))])]
    ]));
    var fb = $("footer-build");
    if (fb) fb.textContent = "Data v" + (BUILD.tracker_version || "?") + ", generated " + fmtTime(BUILD.generated_at) + (commit ? " from commit " + commit.slice(0, 7) : " (local run)") + ".";
  })();
  (function renderDocProv() {
    var t = $("doc-prov");
    if (!t) return;
    head(t, ["Document", "Type", "Current revision", "Exact text or commit", "Status from", "Updated"]);
    var tb = el("tbody");
    sources.forEach(function (s) {
      var st = status[s.id] || {}, dt = docType(s.id);
      tb.appendChild(el("tr", {}, [
        el("td", {}, [linkBtn(s.short, function (b) { openDoc(s.id, b); }, "Details: " + s.title)]),
        el("td", {}, [dt.value, el("span", { cls: "sig", text: dt.note })]),
        el("td", { text: st.version || "" }),
        el("td", { cls: "wrap-anywhere" }, [textNode(s.id, "current") || el("a", { href: s.url, text: "source page" }),
          (TEXTS[s.id] || {}).error ? el("span", { cls: "sig", text: "Hash not refreshed in the last run: " + TEXTS[s.id].error }) : null]),
        el("td", { text: statusFrom(st) }),
        el("td", { cls: "nowrap", text: st.updated || "" })
      ]));
    });
    t.appendChild(tb);
  })();
  (function renderProv() {
    var t = $("prov");
    head(t, ["Document", "Rated at revision", "Text that was read", "Read on", "Rated by", "Sections read", "How it was read", "Current revision", "Status from", "Review"]);
    var tb = el("tbody");
    cols.forEach(function (s) {
      var st = status[s.id] || {}, m = fields.mappings[s.id] || {}, v = verifiedOf(s.id);
      tb.appendChild(el("tr", {}, [
        el("td", {}, [linkBtn(s.short, function (b) { openDoc(s.id, b); }, "Details: " + s.title), el("span", { cls: "sig", text: docType(s.id).value })]),
        el("td", { text: readLabel(s) }),
        el("td", { cls: "wrap-anywhere" }, [textNode(s.id, "read") || el("span", { cls: "muted", text: colReview(s.id).state === "unread" ? "not read" : "not recorded" })]),
        el("td", { cls: "nowrap", text: v.read_on || "" }),
        el("td", { text: v.by || "Not recorded" }),
        el("td", { text: (v.sections && v.sections.length) ? v.sections.join("; ") : "Not recorded" }),
        el("td", { text: m.basis || "" }),
        el("td", { cls: "wrap-anywhere" }, [textNode(s.id, "current") || (st.version || "")]),
        el("td", { text: statusFrom(st) }),
        el("td", {}, [reviewBadge(s.id)])
      ]));
    });
    t.appendChild(tb);
  })();
  (function renderRatingsLog() {
    var t = $("ratings-log");
    if (!t) return;
    head(t, ["Date", "Cell", "Change", "Old → new", "Rated at", "Data version"]);
    var tb = el("tbody");
    RLOG.slice(0, 100).forEach(function (r) {
      var parts = r.cell.split("/"), s = byId[parts[0]], row = rowById[parts[1]];
      var cellLabel = s && row ? linkBtn(s.short + ": " + row.question, function (b) { openCell(s.id, row.id, b); }, "Cell details") : r.cell === "*" ? "all cells" : r.cell;
      var ov = (r.old == null && r.new == null) ? "" : String(r.old == null ? "—" : r.old) + " → " + String(r.new == null ? "—" : r.new);
      tb.appendChild(el("tr", {}, [el("td", { cls: "nowrap", text: r.date }), el("td", {}, [cellLabel]), el("td", { text: r.change }),
        el("td", { text: ov }), el("td", { text: r.rated_at || "" }), el("td", { text: r.version ? "v" + r.version : "" })]));
    });
    if (!RLOG.length) tb.appendChild(el("tr", {}, [el("td", { cls: "muted", text: "No rating changes recorded yet.", attrs: { colspan: "6" } })]));
    if (RLOG.length > 100) tb.appendChild(el("tr", {}, [el("td", { cls: "muted", text: "Showing the latest 100 of " + RLOG.length + " entries; the full log is in data/ratings_log.json.", attrs: { colspan: "6" } })]));
    t.appendChild(tb);
  })();

  // ------------------------------------------------------------------ references
  var refHits = 0;
  var refsRendered = false;
  var refRowsForExport = [];
  function buildRefControls() {
    var f = $("ref-controls");
    f.textContent = "";
    var ietf = sources.filter(function (s) { return refEntry(s.id); });
    var sel = el("select", { attrs: { id: "ref-doc" } }, [el("option", { text: "All tracked Internet-Drafts", attrs: { value: "" } })]
      .concat(ietf.map(function (s) { return el("option", { text: s.short, attrs: { value: s.id } }); })));
    sel.value = S.refDoc;
    sel.addEventListener("change", function () { S.refDoc = sel.value; renderRefs(); });
    f.appendChild(el("div", { cls: "fgroup" }, [el("label", { text: "Citing document", attrs: { "for": "ref-doc" } }), sel]));
    if (!SHOW_RATINGS) S.refView = "current";
    var g = el("div", { cls: "fgroup", attrs: { role: "radiogroup", "aria-label": "Revision" } }, [el("span", { cls: "flabel", text: "Revision" })]);
    g.hidden = !SHOW_RATINGS;
    [["read", "Revision that was read"], ["current", "Current revision"]].forEach(function (p) {
      var inp = el("input", { attrs: { type: "radio", name: "ref-view", id: "ref-view-" + p[0], value: p[0] } });
      inp.checked = S.refView === p[0];
      inp.addEventListener("change", function () { if (inp.checked) { S.refView = p[0]; renderRefs(); } });
      g.appendChild(el("label", { cls: "check-label", attrs: { "for": "ref-view-" + p[0] } }, [inp, " " + p[1]]));
    });
    f.appendChild(g);
    var pr = el("input", { attrs: { type: "checkbox", id: "ref-process" } });
    pr.checked = S.refProcess;
    pr.addEventListener("change", function () { S.refProcess = pr.checked; renderRefs(); });
    f.appendChild(el("div", { cls: "fgroup" }, [el("label", { cls: "check-label", attrs: { "for": "ref-process" } },
      [pr, " Show process references (" + processRefs.map(refName).join(", ") + ")"])]));
  }
  function renderRefs() {
    var t = $("refs");
    t.textContent = "";
    head(t, ["Citing document", "Cited in", "Cites", "Citation type", "Cited document status", "Note"]);
    var tb = el("tbody");
    refHits = 0;
    refRowsForExport = [];
    var hidden = 0;
    sources.forEach(function (s) {
      var e = refEntry(s.id);
      if (!e || (S.refDoc && S.refDoc !== s.id)) return;
      var view = e[S.refView];
      var diff = refDiff(s.id);
      var addedKeys = {};
      if (diff) diff.added.forEach(function (r) { addedKeys[r.target + "|" + r.type] = true; });
      if (!view) {
        var why = e.error ? "References could not be fetched in the last run (" + e.error + ")."
                : S.refView === "read" ? "Not read, so there is no read revision. Switch to the current revision to see its references."
                : "No references recorded.";
        if (hit(s.short)) tb.appendChild(el("tr", {}, [el("td", {}, [linkBtn(s.short, function (b) { openDoc(s.id, b); })]),
          el("td", { cls: "muted", text: why, attrs: { colspan: "5" } })]));
        return;
      }
      view.refs.forEach(function (r) {
        if (!S.refProcess && processRefs.indexOf(r.target) >= 0) { hidden += 1; return; }
        var ti = targetInfo(r.target);
        var trackedId = nameToId[r.target];
        var stText = [ti.state, ti.std_level, ti.error ? "status not refreshed (" + ti.error + ")" : ""].filter(Boolean).join(", ");
        var notes = [];
        if (trackedId) notes.push("tracked: " + byId[trackedId].short);
        if (ti.state === "Replaced") notes.push("replaced by " + (ti.replaced_by || []).join(", "));
        if (S.refView === "current" && addedKeys[r.target + "|" + r.type]) notes.push("added since the revision that was read");
        var hay = [s.short, view.doc, r.target, refName(r.target), ti.title, r.type, stText, notes.join(" ")].join(" ");
        if (!hit(hay)) return;
        refHits += 1;
        refRowsForExport.push([s.id, S.refView, view.doc, r.target, r.type, ti.title || "", ti.state || "", (ti.replaced_by || []).join("; "), trackedId || ""]);
        tb.appendChild(el("tr", { cls: ti.state === "Replaced" ? "flag-row" : "" }, [
          el("td", {}, [linkBtn(s.short, function (b) { openDoc(s.id, b); }, "Details: " + s.title)]),
          el("td", { cls: "nowrap", text: view.doc.replace(/^.*-(\d{2})$/, "-$1"), title: view.doc }),
          el("td", {}, [el("a", { href: "https://datatracker.ietf.org/doc/" + encodeURIComponent(r.target) + "/", text: refName(r.target) }),
                        ti.title ? el("span", { cls: "sig", text: ti.title }) : null]),
          el("td", { text: r.type }),
          el("td", { text: stText }),
          el("td", { text: notes.join("; ") })
        ]));
      });
    });
    if (!refHits) tb.appendChild(el("tr", {}, [el("td", { cls: "muted", text: "No references match.", attrs: { colspan: "6" } })]));
    t.appendChild(tb);
    $("refs-info").textContent = refHits + " references shown" + (hidden ? "; " + hidden + " process references hidden" : "") + ".";
    updateInfo();
    if (refsRendered) announce("References: " + $("refs-info").textContent);
    refsRendered = true;
  }
  (function renderLinks() {
    var t = $("links");
    head(t, ["From", "Relation", "To", "Pointer", "Verification"]);
    var tb = el("tbody");
    var ext = CLS.external_nodes || {};
    (CLS.links || []).forEach(function (l) {
      var from = byId[l.from], to = byId[l.to] || ext[l.to] || { name: l.to };
      tb.appendChild(el("tr", {}, [
        el("td", {}, [from ? linkBtn(from.short, function (b) { openDoc(from.id, b); }) : l.from]),
        el("td", { text: l.relation }),
        el("td", {}, [to.url ? el("a", { href: to.url, text: to.name || to.short }) : (to.short || to.name), to.tracked === false ? el("span", { cls: "sig", text: "not tracked" }) : null]),
        el("td", { text: l.pointer }),
        el("td", {}, [el("span", { cls: "verif verif-" + String(l.verification).toLowerCase(), text: l.verification })])
      ]));
    });
    t.appendChild(tb);
  })();

  // ------------------------------------------------------------------ documents
  var docHits = 0;
  function docState(st) {
    var state = st.state || "";
    if (st.replaced_by && st.replaced_by.length) state += " → " + st.replaced_by.join(", ");
    if (st.group_type === "WG") state += " · " + st.group + " WG";
    if (st.labels && st.labels.length) state += " [" + st.labels.join(", ") + "]";
    if (st.expires) state += " · expires " + st.expires;
    if (st.std_level) state += " · " + st.std_level;
    if (st.obsoleted_by && st.obsoleted_by.length) state += " · obsoleted by " + st.obsoleted_by.join(", ");
    if (st.updated_by && st.updated_by.length) state += " · updated by " + st.updated_by.join(", ");
    if (st.source === "checked by hand" && st.updated && T.status.checked_at &&
        (Date.parse(T.status.checked_at) - Date.parse(st.updated)) / 864e5 > 365) state += " · manual check due";
    if (st.error) state += " (check failed; last known values)";
    return state;
  }
  function renderDocs() {
    var t = $("sources");
    t.textContent = "";
    head(t, ["Document", "Type", "Roles (researcher)", "Version", "State", "Last change"].concat(SHOW_RATINGS ? ["Evidence review"] : []));
    var tb = el("tbody");
    docHits = 0;
    sources.forEach(function (s) {
      var st = status[s.id] || {}, dt = docType(s.id), mt = maturity(s.id), rl = rolesOf(s.id), sb = stability(s.id);
      if (!hit([s.short, s.title, s.group, s.note, st.title, dt.value, rl.join(" "), mt.raw].join(" "))) return;
      docHits += 1;
      tb.appendChild(el("tr", {}, [
        el("td", {}, [linkBtn(s.title, function (b) { openDoc(s.id, b); }, "Details: " + s.title), el("span", { cls: "sig", text: s.group })]),
        el("td", {}, [dt.value, el("span", { cls: "sig", text: dt.note })]),
        el("td", { text: rl.join(", ") }),
        el("td", {}, [st.version || "", st.published ? el("span", { cls: "sig", text: "published " + st.published }) : null,
                      sb ? el("span", { cls: "sig", text: "stability: " + sb.value }) : null]),
        el("td", {}, [docState(st), mt.norm ? el("span", { cls: "sig", text: "maturity (rule): " + mt.norm }) : null]),
        el("td", { cls: "nowrap" }, [st.updated || (st.published ? "published " + st.published : ""),
          st.updated ? el("span", { cls: "sig", text: (st.source === "checked by hand" ? "checked by hand, " : "") + freshText(st.updated) }) : null]),
        SHOW_RATINGS ? el("td", {}, [s.matrix ? reviewBadge(s.id) : el("span", { cls: "muted", text: "status only" })]) : null
      ]));
    });
    var researchShown = 0;
    research.forEach(function (r, i) {
      var type = (CLS.related_research_types || {})[String(i)] || "Research";
      if (!hit([r.title, type].join(" "))) return;
      if (!researchShown++) tb.appendChild(el("tr", { cls: "cat-row" }, [el("th", { text: "Related work (not tracked)",
        attrs: { colspan: String(SHOW_RATINGS ? 7 : 6), scope: "colgroup" } })]));
      docHits += 1;
      tb.appendChild(el("tr", {}, [el("td", {}, [el("a", { href: r.url, text: r.title })]),
        el("td", {}, [type, el("span", { cls: "sig", text: "researcher label" })]),
        el("td", { text: "" }), el("td", { text: "" }), el("td", { cls: "muted", text: "related work, not tracked" }), el("td", { text: "" }),
        SHOW_RATINGS ? el("td", { text: "" }) : null]));
    });
    t.appendChild(tb);
    $("doc-count").textContent = "(" + (S.q ? docHits + " matching; " : "") + sources.length + " tracked + " + research.length + " related work)";
    var er = $("empty-roles");
    if (er) er.textContent = emptyRoles.length ? "Roles with no tracked document (researcher roles): " + emptyRoles.map(function (r) { return r.name; }).join(", ") + "." : "";
  }

  // ------------------------------------------------------------------ changes
  var changeHits = 0;
  function changeInfo(c) {
    var s = byId[c.id];
    var txt = c.field + ": " + (c.old == null ? "" : c.old + " → ") + (Array.isArray(c.new) ? c.new.join(", ") : c.new);
    if (!s) return { s: null, txt: txt, affected: "", rr: c.field === "new related draft" ? "screen for scope" : "" };
    if (!s.matrix) return { s: s, txt: txt, affected: "status only", rr: "" };
    var filled = rows.filter(function (row) { return cellOf(s, row).filled; }).length;
    var r = colReview(s.id);
    var rr = r.state === "stale" ? "required (rated at " + shortRev(s, r.from) + ")"
           : r.state === "unread" ? "not read yet" : "done (rated at current revision)";
    return { s: s, txt: txt, affected: filled ? filled + " of " + rows.length + " questions rated" : "no cells rated", rr: rr };
  }
  function timelineInto(box, list, limit) {
    box.textContent = "";
    var byDate = [], seen = {};
    list.slice(0, limit).forEach(function (c) {
      if (!seen[c.date]) { seen[c.date] = { date: c.date, items: [] }; byDate.push(seen[c.date]); }
      seen[c.date].items.push(c);
    });
    byDate.forEach(function (g) {
      var ul = el("ul", { cls: "plain" });
      g.items.forEach(function (c) {
        var i = changeInfo(c), name = i.s ? i.s.short : c.id;
        var doc = i.s ? linkBtn(name, function (b) { openDoc(i.s.id, b); }, "Details: " + name)
                      : el("a", { href: "https://datatracker.ietf.org/doc/" + encodeURIComponent(c.id) + "/", text: c.id });
        ul.appendChild(el("li", {}, [doc, " · " + i.txt,
          (SHOW_RATINGS && i.rr) ? el("span", { cls: "sig", text: "Evidence affected: " + (i.affected || "none") + "; re-review: " + i.rr }) : null]));
      });
      box.appendChild(el("li", {}, [el("time", { text: g.date, attrs: { datetime: g.date } }), ul]));
    });
    if (!byDate.length) box.appendChild(el("li", { cls: "muted", text: S.q ? "No matching changes." : "No changes recorded yet." }));
  }
  function renderChanges() {
    var matching = changes.filter(function (c) {
      var i = changeInfo(c), name = i.s ? i.s.short : c.id;
      return hit([name, c.id, i.txt].join(" "));
    });
    changeHits = matching.length;
    var box = $("changes");
    box.textContent = "";
    var ol = el("ol", { cls: "timeline" });
    box.appendChild(ol);
    timelineInto(ol, matching, 200);
    $("changes-count").textContent = "(" + (S.q ? changeHits + " matching of " : "") + changes.length + ")";
    var home = $("home-timeline");
    if (home && !S.q) timelineInto(home, changes, 5);
  }

  // ------------------------------------------------------------------ related drafts
  var shortByName = {};
  sources.forEach(function (s) { if (s.track && s.track.name) shortByName[s.track.name] = s.short; });
  var draftHits = 0;
  function renderDrafts() {
    var t = $("discovered");
    t.textContent = "";
    head(t, ["Draft", "Title", "Version", "Updated", "First seen", "Cites"]);
    var tb = el("tbody");
    draftHits = 0;
    drafts.forEach(function (d) {
      var cites = (d.cites || []).map(function (n) { return shortByName[n] || n; }).join(", ");
      if (!hit([d.name, d.title, cites].join(" "))) return;
      draftHits += 1;
      tb.appendChild(el("tr", {}, [
        el("td", {}, [el("a", { href: d.url, text: d.name })]), el("td", { text: d.title }),
        el("td", { text: d.version }), el("td", { cls: "nowrap", text: d.updated }), el("td", { cls: "nowrap", text: d.first_seen || "" }),
        el("td", { text: cites })
      ]));
    });
    t.appendChild(tb);
    $("disc-count").textContent = "(" + (S.q ? draftHits + " of " : "") + drafts.length + ")";
  }

  // ------------------------------------------------------------------ search
  function updateInfo() {
    var box = $("q-info");
    box.textContent = "";
    if (!S.q) return;
    var parts = [["documents", docHits, "documents"], ["references", refHits, "references"], ["drafts", draftHits, "related drafts"], ["changes", changeHits, "changes"]];
    if (SHOW_RATINGS) parts.unshift(["matrix", matrixHits, "questions"]);
    box.appendChild(document.createTextNode("Matches: "));
    parts.forEach(function (p, k) {
      if (k) box.appendChild(document.createTextNode(" · "));
      box.appendChild(el("a", { text: p[1] + " " + p[2], attrs: { href: "#/" + p[0] } }));
    });
  }
  var timer = null;
  $("q").addEventListener("input", function () {
    var v = this.value;
    clearTimeout(timer);
    timer = setTimeout(function () {
      S.q = v.trim().toLowerCase();
      renderDocs(); renderChanges(); renderDrafts(); renderRefs(); renderMatrix();
      announce($("q-info").textContent || "Search cleared. All rows shown.");
    }, 120);
  });

  // ------------------------------------------------------------------ detail panel
  var dlg = $("panel"), lastFocus = null;
  function setHash(h) {
    try { history.replaceState(null, "", h ? "#" + h : "#/" + currentView); } catch (e) { /* file:// */ }
  }
  function showPanel(title, nodes, opener, hash) {
    if (!dlg.open) lastFocus = opener || document.activeElement;
    $("panel-title").textContent = title;
    var b = $("panel-body");
    b.textContent = "";
    nodes.forEach(function (n) { if (n) b.appendChild(n); });
    if (!dlg.open) { if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", ""); }
    b.scrollTop = 0;
    $("panel-title").focus();          // start reading at the title; Tab then reaches Close and the content
    setHash(hash);
  }
  function closePanel() { setHash(""); if (typeof dlg.close === "function") dlg.close(); else { dlg.removeAttribute("open"); onClose(); } }
  function onClose() { setHash(""); if (lastFocus && document.body.contains(lastFocus)) lastFocus.focus(); }
  dlg.addEventListener("close", onClose);
  $("panel-close").addEventListener("click", closePanel);
  dlg.addEventListener("click", function (e) {
    if (e.target !== dlg) return;
    var r = dlg.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closePanel();   // backdrop only
  });

  function evidenceTable(s) {
    var t = el("table", { cls: "mini" });
    head(t, ["Question", "Rating", "Identifiers", "Automatic check"]);
    var tb = el("tbody");
    rows.forEach(function (row) {
      var c = cellOf(s, row);
      if (!c.filled) return;
      var v = verdict(c);
      tb.appendChild(el("tr", {}, [
        el("td", {}, [linkBtn(row.question, function (b) { openCell(s.id, row.id, b); }, "Cell details: " + row.question)]),
        el("td", {}, [badge(c.status)]),
        el("td", {}, [c.ids.length ? el("code", { text: c.ids.join(", ") }) : el("span", { cls: "muted", text: "none recorded" })]),
        el("td", {}, v ? [el("span", { cls: "verdict " + v.cls, text: v.text }), el("span", { cls: "sig", text: v.detail })] : [])
      ]));
    });
    t.appendChild(tb);
    return el("div", { cls: "scroll" }, [t]);
  }
  function comparisonBlock(s) {
    var r = colReview(s.id);
    var out = [h3("Revision comparison", "auto")];
    out.push(dl([
      ["Previous (read)", r.from], ["Current", r.to],
      ["Re-review", "Required: the cells were rated on the previous revision."],
      ["Changed lines", r.lines_added != null ? "+" + r.lines_added + " added, −" + r.lines_removed + " removed (page headers ignored)" : null],
      ["Commits since", r.commits != null ? String(r.commits) : null],
      ["Sections added", r.sections_added], ["Sections removed", r.sections_removed],
      ["Files changed", r.files_changed ? r.files_changed.concat(r.files_total > r.files_changed.length ? ["… " + r.files_total + " in total"] : []) : null],
      ["Commit messages", r.commit_messages],
      ["Method", r.method], ["Compared", fmtTime(r.checked_at)], ["Error", r.error]
    ]));
    if (r.compare_url) out.push(el("p", {}, [el("a", { cls: "btnlink", href: r.compare_url, text: "Open side-by-side comparison" })]));
    out.push(el("h4", { text: "Rated cells affected" }));
    out.push(evidenceTable(s));
    out.push(el("p", { cls: "hint", text: "The automatic check only looks for identifier names. \"No change found\" does not replace reading the new revision." }));
    return out;
  }
  function refSummary(s) {
    var e = refEntry(s.id);
    if (!e) return [];
    function count(v) {
      if (!v) return null;
      var n = v.refs.filter(function (r) { return r.type === "normative"; }).length;
      return v.doc + ": " + v.refs.length + " references (" + n + " normative)";
    }
    var d = refDiff(s.id);
    var rep = replacedRefs.filter(function (x) { return x.id === s.id; }).map(function (x) { return x.target + " (" + x.type + "), replaced by " + x.by.join(", "); });
    return [h3("References", "doc"), dl([
      ["Revision that was read", SHOW_RATINGS ? (e.read ? count(e.read) : "not read") : null],
      ["Current revision", count(e.current)],
      ["Added since read", d && SHOW_RATINGS ? d.added.map(function (r) { return refName(r.target) + " (" + r.type + ")"; }) : null],
      ["Removed since read", d && SHOW_RATINGS ? d.removed.map(function (r) { return refName(r.target) + " (" + r.type + ")"; }) : null],
      ["Cites replaced drafts", rep],
      ["Source", "IETF Datatracker, " + fmtTime(REFS.checked_at)],
      ["Error", e.error]
    ]), el("p", { cls: "hint", text: "A normative reference is a citation type. It does not mean that one document implements the other." })];
  }
  function openDoc(id, opener) {
    var s = byId[id];
    if (!s) return;
    var st = status[id] || {}, dt = docType(id), mt = maturity(id), sb = stability(id);
    var nodes = [
      el("p", {}, [el("a", { href: s.url, text: s.title })]),
      dl([["Publisher", s.group], ["Note", s.note]]),
      h3("Status and metadata", "doc"),
      dl([["Version", st.version], ["Updated", st.updated], ["State (as reported)", docState(st)],
          ["Current text", textNode(id, "current")],
          ["Type", dt.src === "doc" ? dt.value + " (" + dt.note + ")" : null],
          ["Stability", sb ? sb.value + " (" + sb.pointer + ")" : null],
          ["Latest commit", st.message], ["Status from", statusFrom(st)], ["Check error", st.error]]),
      h3("Classification", "res"),
      dl([["Roles", rolesOf(id).join(", ") || "none assigned"],
          ["Type", dt.src === "res" ? dt.value : null],
          ["Maturity (normalised)", mt.norm ? mt.norm + " (rule: " + mt.raw + " → " + mt.norm + ")" : null]])
    ];
    if (s.matrix && SHOW_RATINGS) {
      var m = fields.mappings[id] || {}, v = m.verified || {};
      var filled = rows.map(function (row) { return cellOf(s, row); }).filter(function (c) { return c.filled; });
      var tally = STATES.map(function (k) {
        var n = filled.filter(function (c) { return c.status === k; }).length;
        return n ? n + " " + LABEL[k] : "";
      }).filter(Boolean).join(", ");
      nodes.push(dl([
        ["Review", el("span", {}, [reviewBadge(id), " " + reviewMsg(s)])],
        ["Rated at revision", readLabel(s)], ["Text that was read", textNode(id, "read")], ["Read on", v.read_on],
        ["Rated by", v.by || "Not recorded"], ["Sections read", (v.sections && v.sections.length) ? v.sections : "Not recorded"],
        ["How it was read", m.basis],
        ["Cells rated", filled.length + " of " + rows.length + (tally ? " (" + tally + ")" : "") + "; the rest are not reviewed"]
      ]));
    }
    if (SHOW_RATINGS) {
      nodes.push(h3("Quality assessment", "qual"));
      nodes.push(dl([["Integrity of the record format", qualityOf(id, "").integrity]]));
    }
    nodes = nodes.concat(refSummary(s));
    if (s.matrix && SHOW_RATINGS) {
      var r = colReview(id);
      if (r.state === "stale") nodes = nodes.concat(comparisonBlock(s));
      else if (r.state === "unread") nodes.push(el("p", { cls: "hint", text: "Not read yet. After reading " + (st.version || "the current revision") + ", rate this column in data/fields.json and record the revision in \"verified\"." }));
      else if (rows.some(function (row) { return cellOf(s, row).filled; })) { nodes.push(el("h4", { text: "Rated cells" })); nodes.push(evidenceTable(s)); }
    }
    var hist = changes.filter(function (c) { return c.id === id; });
    if (hist.length) {
      nodes.push(h3("Change history", "doc"));
      nodes.push(el("ul", { cls: "plain" }, hist.map(function (c) { return el("li", { text: c.date + " · " + changeInfo(c).txt }); })));
    }
    showPanel(s.short, nodes, opener, "doc=" + id);
  }

  function openCell(colId, rowId, opener) {
    var s = byId[colId], row = rowById[rowId];
    if (!s || !row) return;
    var c = cellOf(s, row), r = colReview(colId), m = fields.mappings[colId] || {}, v = m.verified || {}, st = status[colId] || {};
    var vd = verdict(c), q = qualityOf(colId, rowId), rl = reqLevel(colId, rowId);
    var nodes = [
      el("p", { cls: "panel-q", text: row.question }),
      row.signals ? el("p", { cls: "sig", text: "Signals " + row.signals + " (researcher catalogue)" }) : null,
      h3("Rating", "res"),
      dl([
        ["Specification status", el("span", {}, [badge(c.status), " " + (fields.legend[c.status] || "")])],
        ["Researcher note", c.text || null],
        ["Rated at revision", c.filled ? readLabel(s) : null], ["Read on", c.filled ? v.read_on : null],
        ["Rated by", c.filled ? (v.by || "Not recorded") : null],
        ["First recorded", c.filled && SNAP[colId + "/" + rowId] ? SNAP[colId + "/" + rowId].first_seen + " (data v" + SNAP[colId + "/" + rowId].added_in + ")" : null],
        ["How it was read", c.filled ? m.basis : null]
      ]),
      h3("In the document", "doc"),
      dl([
        ["Document", el("a", { href: s.url, text: s.title })],
        ["Identifiers as written", c.ids.length ? el("code", { text: c.ids.join(", ") }) : "none recorded"],
        ["Location in the document", c.filled ? (((fields.mappings[colId] || {}).cells || {})[rowId] || {}).where || "Not recorded" : null],
        ["Text that was read", c.filled ? textNode(colId, "read") : null],
        ["Requirement level", rl ? rl.value + " (" + [rl.revision, rl.section].filter(Boolean).join(" ") + ")" : "Not recorded"],
        ["Current revision", (st.version || "") + (st.updated ? " (" + st.updated + ")" : "")],
        ["Review", el("span", {}, [reviewBadge(colId), " " + reviewMsg(s)])],
        ["Status from", statusFrom(st)]
      ]),
      h3("Quality assessment", "qual"),
      dl([["Origin (as specified)", q.origin], ["Integrity of the record format", q.integrity]]),
      el("p", { cls: "hint", text: "\"Not established\" means the research has not determined it. A specified field is not by itself reliable audit evidence." })
    ];
    if (vd) {
      nodes.push(h3("Automatic revision check", "auto"));
      nodes.push(dl([["Result", el("span", { cls: "verdict " + vd.cls, text: vd.text })], ["Detail", vd.detail], ["Per identifier", idLines(c)]]));
    }
    var links = [];
    if (r.compare_url) links.push(el("a", { cls: "btnlink", href: r.compare_url, text: "Compare revisions" }));
    links.push(el("button", { cls: "btnlink", text: "Document details", attrs: { type: "button" }, on: { click: function () { openDoc(colId, null); } } }));
    links.push(el("button", { cls: "btnlink", text: "Question view", attrs: { type: "button" }, on: { click: function () { openQuestion(rowId, null); } } }));
    nodes.push(el("p", { cls: "actions" }, links));
    showPanel(s.short + " · " + LABEL[c.status], nodes, opener, "cell=" + colId + "/" + rowId);
  }

  // ------------------------------------------------------------------ audit question view
  function block(n, title, kind, kids) {
    return el("div", { cls: "qv-block" }, [el("h3", {}, [n + ". " + title + " ", layer(kind)])].concat(kids));
  }
  function cellItem(c) {
    return el("li", { cls: "qv-item" }, [
      badge(c.status), " ",
      linkBtn(c.col.short, function (b) { openCell(c.col.id, c.row.id, b); }, "Cell details: " + c.col.short),
      c.stale ? el("span", { cls: "stale-mark", text: "re-check" }) : null,
      c.ids.length ? el("code", { cls: "ids", text: c.ids.join(", ") }) : null,
      c.text ? el("span", { cls: "sig", text: c.text }) : null
    ]);
  }
  function names(list) { return list.map(function (c) { return c.col.short; }).join(", "); }
  var datasetLists = {};
  if (REQ) Object.keys(REQ.signals || {}).forEach(function (k) { (REQ.signals[k].units || []).forEach(function (u) { datasetLists[u.source] = true; }); });

  function questionNodes(row) {
    var cells = cols.map(function (col) { return cellOf(col, row); });
    var sigs = (row.signals || "").split(",").map(function (x) { return x.trim(); }).filter(Boolean);
    var out = [];

    // 1. Requirements linked by researcher coding
    var req = [el("p", { cls: "sig", text: "The question and its links are the researcher's. Each link runs question → monitoring signal → OWASP requirement unit, as coded in the dataset below. The OWASP documents do not use these questions." })];
    var mappedLists = {};
    if (REQ && sigs.length) {
      var ul = el("ul", { cls: "plain qv-req" });
      sigs.forEach(function (sid) {
        var sg = (REQ.signals || {})[sid];
        if (!sg) return;
        var byRisk = {}, order = [];
        sg.units.forEach(function (u) {
          mappedLists[u.source] = true;
          if (!byRisk[u.risk_id]) { byRisk[u.risk_id] = { risk: u.risk, units: [] }; order.push(u.risk_id); }
          byRisk[u.risk_id].units.push(u.unit);
        });
        ul.appendChild(el("li", {}, [el("strong", { text: sid + " " + sg.name }), " · " + plural(sg.units.length, "linked requirement unit"),
          el("ul", { cls: "plain" }, order.map(function (k) { return el("li", { text: k + " " + byRisk[k].risk + ": " + byRisk[k].units.join(", ") }); }))]));
      });
      req.push(ul);
      var pv = REQ.provenance || {};
      req.push(el("p", { cls: "sig" }, ["Coding from ", el("a", { href: pv.url, text: (pv.dataset || "dataset") + " v" + (pv.version || "?") }), ". " + (pv.note || "")]));
    } else {
      req.push(el("p", { cls: "muted", text: sigs.length ? "Requirement data not loaded." : "No monitoring signal is coded for this question, so no requirement unit is linked." }));
    }
    var noUnits = sources.filter(function (s) { return datasetLists[s.id] && !mappedLists[s.id]; });
    if (sigs.length && noUnits.length) req.push(el("p", { cls: "sig", text: "No requirement unit coded to this question's signals in: " + noUnits.map(function (s) { return s.short; }).join(", ") + "." }));
    var unmapped = sources.filter(function (s) { return hasRole(s.id, "audit-control") && !datasetLists[s.id]; });
    if (unmapped.length) req.push(el("p", { cls: "sig", text: "Not coded yet: " + unmapped.map(function (s) { return s.short; }).join(", ") + "." }));
    out.push(block(1, "Requirements linked by researcher coding", "res", req));

    // 2. Telemetry fields
    var tel = cells.filter(function (c) { return hasRole(c.col.id, "telemetry"); });
    var tk = [el("ul", { cls: "plain" }, tel.map(cellItem))];
    if (REQ && sigs.length) {
      tk.push(el("p", { cls: "sig", text: "RQ1 coverage code (researcher coding): " + sigs.map(function (sid) {
        var sg = (REQ.signals || {})[sid]; return sg ? sid + " " + sg.otel_coverage : sid; }).join(", ") + ". " + ((REQ.provenance || {}).coverage_codes || "") }));
    }
    out.push(block(2, "Telemetry fields, as rated", "res", tk));

    // 3. Other documents by role
    var sup = cells.filter(function (c) { return !hasRole(c.col.id, "telemetry") && ["explicit", "partial", "external", "check"].indexOf(c.status) >= 0; });
    var sk = [];
    roles.forEach(function (r) {
      var inR = sup.filter(function (c) { return hasRole(c.col.id, r.id); });
      if (inR.length) { sk.push(el("h4", { text: r.name })); sk.push(el("ul", { cls: "plain" }, inR.map(cellItem))); }
    });
    if (!sk.length) sk.push(el("p", { cls: "muted", text: "No other rated document addresses it." }));
    sk.push(el("p", { cls: "sig", text: "Roles are the researcher's grouping; a document can appear under several roles." }));
    if (emptyRoles.length) sk.push(el("p", { cls: "sig", text: "Roles with no tracked document: " + emptyRoles.map(function (r) { return r.name; }).join(", ") + "." }));
    out.push(block(3, "Other documents that address it, by role", "res", sk));

    // 4. Missing now
    var bc = best(row, cols, true), ba = best(row, cols, false);
    var mk = [];
    var curExplicit = cells.filter(function (c) { return c.colState === "current" && c.status === "explicit"; });
    if (curExplicit.length) {
      mk.push(el("p", {}, [badge("explicit"), " Rated explicit at a current revision in " + names(curExplicit) + "."]));
    } else {
      mk.push(el("p", {}, [el("strong", { text: "No document is rated explicit at a current revision." })]));
      mk.push(el("p", {}, ["Best current rating: ", bc ? badge(bc.status) : badge("unreviewed", "none"), bc ? " " + bc.col.short : ""]));
      if (ba && ba.status === "explicit") {
        var olderExplicit = cells.filter(function (c) { return c.stale && c.status === "explicit"; });
        mk.push(el("p", { cls: "sig", text: "An older read is rated explicit: " + olderExplicit.map(function (c) { return c.col.short + " " + shortRev(c.col, colReview(c.col.id).from); }).join(", ") + ". Re-read before relying on it." }));
      }
      var gaps = cells.filter(function (c) { return c.colState === "current" && (c.status === "unspecified" || c.status === "partial"); });
      if (gaps.length) { mk.push(el("h4", { text: "What the current ratings lack" })); mk.push(el("ul", { cls: "plain" }, gaps.map(cellItem))); }
    }
    mk.push(el("p", { cls: "sig" }, [layer("qual"), " Origin and integrity have not been established for any field. A specified field is not by itself reliable audit evidence."]));
    out.push(block(4, "What evidence is missing now", "res", mk));

    // 5. Not specified vs not reviewed
    var no = cells.filter(function (c) { return c.status === "unspecified"; });
    var unrev = cells.filter(function (c) { return c.status === "unreviewed"; });
    out.push(block(5, "Not specified vs not reviewed", "res", [dl([
      ["Not specified (read)", no.length ? names(no) : "none"],
      ["Not reviewed", unrev.length ? names(unrev) : "none"]
    ]), el("p", { cls: "sig", text: "\"Not reviewed\" is not evidence that a document is silent; nobody has checked it yet." })]));
    return out;
  }
  function renderQuestionView(rowId) {
    var box = $("qv");
    box.textContent = "";
    var row = rowById[rowId] || rows[0];
    questionNodes(row).forEach(function (n) { box.appendChild(n); });
  }
  (function setupQuestionView() {
    var sel = $("qv-select");
    rows.forEach(function (r) { sel.appendChild(el("option", { text: r.question + (r.signals ? " (" + r.signals + ")" : ""), attrs: { value: r.id } })); });
    sel.addEventListener("change", function () { renderQuestionView(sel.value); announce("Question view updated: " + (rowById[sel.value] || {}).question + ". Five sections below."); });
    if (rows.length) renderQuestionView(rows[0].id);
  })();
  function openQuestion(rowId, opener) {
    var row = rowById[rowId];
    if (!row) return;
    var nodes = [row.signals ? el("p", { cls: "sig", text: "Signals " + row.signals + " (researcher catalogue)" }) : null].concat(questionNodes(row));
    nodes.push(el("p", { cls: "actions" }, [el("button", { cls: "btnlink", text: "Show in the question view", attrs: { type: "button" },
      on: { click: function () { $("qv-select").value = rowId; renderQuestionView(rowId); lastFocus = $("qv-select"); closePanel(); $("questions").scrollIntoView(); } } })]));
    showPanel(row.question, nodes, opener, "question=" + rowId);
  }

  // ------------------------------------------------------------------ export
  function csvCell(v) {
    var s = v == null ? "" : String(v);
    // Neutralise spreadsheet formulas (CSV injection): a leading control character, or = + - @ as the
    // first non-blank character. Titles of third-party drafts flow into these files.
    if (/^[\t\r\n]/.test(s) || /^\s*[=+\-@]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }
  function toCsv(header, data) {
    return "﻿" + [header].concat(data).map(function (r) { return r.map(csvCell).join(","); }).join("\r\n") + "\r\n";
  }
  function download(name, text, type) {
    var blob = new Blob([text], { type: type });
    var url = URL.createObjectURL(blob);
    var a = el("a", { attrs: { href: url, download: name } });
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1000);
  }
  var stamp = (T.status.checked_at || "").slice(0, 10) || "undated";
  var EXPORTS = {
    "matrix-csv": function () {
      var data = [];
      rows.forEach(function (row) {
        cols.forEach(function (s) {
          var c = cellOf(s, row), r = colReview(s.id), v = verdict(c), st = status[s.id] || {}, dt = docType(s.id),
              q = qualityOf(s.id, row.id), rl = reqLevel(s.id, row.id);
          var vf = verifiedOf(s.id), tr = textRec(s.id, "read") || {}, sn = SNAP[s.id + "/" + row.id] || {},
              cellData = ((fields.mappings[s.id] || {}).cells || {})[row.id] || {};
          data.push([row.id, row.question, row.signals, s.id, s.short, dt.value, dt.note, rolesOf(s.id).join("; "),
                     c.status, LABEL[c.status], c.text, r.state, c.filled ? readLabel(s) : "",
                     c.filled ? (vf.read_on || "") : "", c.filled ? (vf.by || "Not recorded") : "", c.filled ? (cellData.where || "Not recorded") : "",
                     c.filled ? (tr.url || "") : "", c.filled ? (tr.sha256 || tr.sha || "") : "", sn.first_seen || "", sn.added_in || "",
                     String(st.version || "").replace(/^-(\d+)$/, "$1"), c.ids.join("; "), rl ? rl.value : "Not recorded", q.origin, q.integrity, v ? v.text : "", v ? v.detail : "",
                     BUILD.tracker_version || "", BUILD.source_commit || ""]);
        });
      });
      download("agent-audit-matrix-" + stamp + ".csv", toCsv(["question_id", "res_question", "res_signals", "document_id", "document",
        "document_type", "document_type_source", "res_roles", "res_status", "res_status_label", "res_note", "column_review",
        "rated_at_revision", "read_on", "rated_by", "location_in_document", "read_text_url", "read_text_sha256_or_commit",
        "first_recorded", "added_in_version", "doc_current_revision", "doc_identifiers", "doc_requirement_level",
        "quality_origin", "quality_integrity", "auto_check", "auto_check_detail", "data_version", "source_commit"], data), "text/csv;charset=utf-8");
    },
    "refs-csv": function () {
      var saved = [S.refView, S.refDoc, S.refProcess, S.q], data = [];
      (SHOW_RATINGS ? ["read", "current"] : ["current"]).forEach(function (v) { S.refView = v; S.refDoc = ""; S.refProcess = true; S.q = ""; renderRefs(); data = data.concat(refRowsForExport); });
      S.refView = saved[0]; S.refDoc = saved[1]; S.refProcess = saved[2]; S.q = saved[3]; renderRefs();
      download("agent-audit-references-" + stamp + ".csv", toCsv(["citing_document", "revision_view", "cited_in", "cites", "citation_type",
        "cited_title", "cited_state", "cited_replaced_by", "cited_tracked_as"], data), "text/csv;charset=utf-8");
    },
    "ratings-csv": function () {
      download("agent-audit-ratings-log-" + stamp + ".csv", toCsv(["date", "cell", "change", "old", "new", "rated_at", "data_version"],
        (T.ratings_log || []).map(function (r) { return [r.date, r.cell, r.change, r.old == null ? "" : r.old, r.new == null ? "" : r.new, r.rated_at || "", r.version || ""]; })),
        "text/csv;charset=utf-8");
    },
    "review-csv": function () {
      download("agent-audit-review-queue-" + stamp + ".csv", toCsv(["item", "why", "evidence_affected", "automatic_check", "link"],
        queue.map(function (q) { return [q.item, q.why, q.affected, q.auto, q.link || ""]; })), "text/csv;charset=utf-8");
    },
    "drafts-csv": function () {
      download("agent-audit-related-drafts-" + stamp + ".csv", toCsv(["name", "title", "revision", "updated", "first_seen", "state", "group", "cites", "url"],
        drafts.map(function (d) { return [d.name, d.title, String(d.version || "").replace(/^-(\d+)$/, "$1"), d.updated, d.first_seen || "", d.state, d.group, (d.cites || []).join("; "), d.url]; })),
        "text/csv;charset=utf-8");
    },
    "json": function () {
      download("agent-audit-tracker-" + stamp + ".json", JSON.stringify({
        exported_from: "https://anustsn.github.io/agent-audit-tracker/",
        licence: "Data CC BY 4.0, except requirements (CC BY-SA 4.0); see LICENSE-DATA.md",
        layers: { document_facts: ["status", "references", "document_facts"], researcher_classification: ["fields", "classification", "requirements", "ratings_log"], evidence_quality: ["quality"] },
        checked_at: T.status.checked_at, sources: T.sources, status: T.status, references: T.references || null,
        document_facts: T.document_facts || null, fields: T.fields, classification: T.classification || null,
        requirements: T.requirements || null, quality: T.quality || null, changes: T.changes,
        observations: T.observations || null, findings: T.findings || null,
        ratings_log: T.ratings_log || [], build: T.build || null
      }, null, 2), "application/json");
    }
  };
  Array.prototype.forEach.call(document.querySelectorAll("[data-export]"), function (b) {
    b.addEventListener("click", function () { EXPORTS[b.getAttribute("data-export")](); });
  });

  // ------------------------------------------------------------------ views (one page, one view at a time)
  var VIEW_NAMES = { home: "Overview", documents: "Documents", matrix: "Specification status", questions: "Question view",
                     review: "Review queue", references: "References", drafts: "Related drafts", changes: "Changes",
                     provenance: "Provenance", about: "About" };
  var RATING_VIEWS = { matrix: 1, questions: 1, review: 1 };
  var currentView = "home";
  function showView(v, focus) {
    if (!VIEW_NAMES[v] || (RATING_VIEWS[v] && !SHOW_RATINGS)) v = "home";
    var changed = v !== currentView;
    currentView = v;
    Array.prototype.forEach.call(document.querySelectorAll("main > section[data-view]"), function (s) {
      var on = s.getAttribute("data-view") === v;
      if (s.hasAttribute("data-ratings") && !SHOW_RATINGS) on = false;
      s.hidden = !on;
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-view-link]"), function (a) {
      if (a.getAttribute("data-view-link") === v) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    document.title = (v === "home" ? "" : VIEW_NAMES[v] + " · ") + "Agent Audit Tracker";
    if (focus && changed) {
      window.scrollTo(0, 0);
      var h = document.querySelector('main > section[data-view="' + v + '"] .view-title');
      if (h) h.focus({ preventScroll: true });
      announce("Showing " + VIEW_NAMES[v] + ".");
    }
  }
  function route(fromHashChange) {
    var h = location.hash || "", m;
    if ((m = /^#\/([a-z]+)$/.exec(h))) { showView(m[1], fromHashChange); return; }
    if ((m = /^#doc=([\w-]+)$/.exec(h))) { showView("documents", false); openDoc(m[1], null); return; }
    if (SHOW_RATINGS && (m = /^#cell=([\w-]+)\/([\w-]+)$/.exec(h))) { showView("matrix", false); openCell(m[1], m[2], null); return; }
    if (SHOW_RATINGS && (m = /^#question=([\w-]+)$/.exec(h))) { showView("questions", false); openQuestion(m[1], null); return; }
    if (h.length > 1 && /^#[\w-]+$/.test(h)) {        // old section anchors such as #method or #documents
      var target = document.getElementById(h.slice(1));
      var sec = target && target.closest("main > section[data-view]");
      if (sec) { showView(sec.getAttribute("data-view"), false); target.scrollIntoView(); return; }
    }
    showView("home", fromHashChange);
  }

  // ------------------------------------------------------------------ source health (monitoring-style status line)
  function renderHealth() {
    var box = $("health");
    if (!box) return;
    var auto = sources.filter(function (s) { return s.track.type !== "manual"; });
    var failed = [];
    sources.forEach(function (s) {
      var st = status[s.id] || {};
      if (st.error) failed.push(s.short + " (status)");
      if ((TEXTS[s.id] || {}).error) failed.push(s.short + " (text hash)");
      var r = (REFS.documents || {})[s.id];
      if (r && r.error) failed.push(s.short + " (references)");
    });
    if ((T.status.discovery_errors || []).length) failed.push("related-draft search");
    var manual = sources.filter(function (s) { return s.track.type === "manual"; });
    var due = manual.filter(function (s) { var n = daysAgo((status[s.id] || {}).updated); return n != null && n > 365; });
    var ok = !failed.length;
    box.className = "health " + (ok ? "health-ok" : "health-warn");
    box.textContent = "";
    box.appendChild(el("span", { cls: "health-mark", text: ok ? "✓" : "!", attrs: { "aria-hidden": "true" } }));
    box.appendChild(el("span", {}, [
      el("strong", { text: ok ? "All " + auto.length + " automatic checks succeeded" : failed.length + " automatic check" + (failed.length === 1 ? "" : "s") + " failed: " + failed.join(", ") + ". Last known values are shown" }),
      " in the last run (" + (fmtTime(T.status.checked_at) || "never") + (BUILD.where ? ", " + BUILD.where : "") +
        (BUILD.source_commit ? ", commit " + BUILD.source_commit.slice(0, 7) : "") + "). " +
        manual.length + " documents are checked by hand" + (due.length ? "; check due: " + due.map(function (s) { return s.short; }).join(", ") : "; none overdue") + "."
    ]));
  }

  // ------------------------------------------------------------------ theme (not stored: the page keeps nothing in the browser)
  function setupTheme() {
    var btn = $("theme-btn");
    if (!btn) return;
    var modes = ["auto", "light", "dark"], k = 0;
    function apply() {
      var m = modes[k];
      if (m === "auto") document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", m);
      btn.textContent = "Theme: " + m;
      btn.setAttribute("aria-label", "Colour theme: " + m + ". Activate to change.");
    }
    btn.addEventListener("click", function () { k = (k + 1) % modes.length; apply(); announce("Colour theme: " + modes[k] + "."); });
    apply();
  }

  // ------------------------------------------------------------------ start
  buildFilters();
  buildRefControls();
  renderDocs();
  renderChanges();
  renderDrafts();
  renderRefs();
  renderMatrix();
  renderHealth();
  setupTheme();
  var methodRatings = $("method-ratings");
  if (methodRatings && SHOW_RATINGS) methodRatings.open = true;
  window.addEventListener("hashchange", function () { route(true); });
  route(false);
})();
