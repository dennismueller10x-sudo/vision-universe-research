/* =========================================================================
   VISION UNIVERSE QUANT 2.0 — PRODUCT LANGUAGE v1

   One dictionary for everything a user reads.

   The internal names stay exactly as they are in code, contracts and
   methodology - nothing here renames a field, an enum or a version. What
   this module decides is only which words reach the surface, and in which
   order: the meaning first, the internal name last and folded away.

   WHY A MODULE AND NOT A STYLE GUIDE

   A style guide drifts. Two views written a month apart end up calling the
   same thing two things, and nobody notices because both look fine on their
   own page. Here there is one place the words live, every surface reads it,
   and the markdown document is generated from it. A term that is missing
   throws instead of printing its own id in front of a reader.

   THE FOUR LAYERS

     MEANING       a simple statement. No jargon, no bare number.
     EXPLANATION   why that statement exists.
     EVIDENCE      the values behind it, with cutoff and origin.
     METHODOLOGY   the full technical description, always folded away.

   A surface that starts at layer four is a surface a beginner closes.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = typeof module !== "undefined" && module.exports;
  var DICTIONARY = isNode ? require("../methodology/product-language-v1.json") : null;

  var REQUIRED = ["id", "internal", "userLabel", "beginner", "professionalLabel", "tooltip", "negative", "unavailable"];

  var index = null;
  var categoryOf = null;

  function build(dictionary) {
    index = {};
    categoryOf = {};
    (dictionary.categories || []).forEach(function (category) {
      (category.terms || []).forEach(function (term) {
        if (index[term.id]) throw new Error("product-language: duplicate term '" + term.id + "'");
        index[term.id] = term;
        categoryOf[term.id] = category.id;
      });
    });
    return dictionary;
  }

  function load(dictionary) {
    DICTIONARY = dictionary;
    index = null;
    return build(dictionary);
  }

  function ready() {
    if (!DICTIONARY) throw new Error("product-language: the dictionary was never loaded");
    if (!index) build(DICTIONARY);
    return DICTIONARY;
  }

  /* Fail closed. A missing term is a mistake in the product, and printing
     its id in front of a reader is how such a mistake ships unnoticed. */
  function term(id) {
    ready();
    var entry = index[id];
    if (!entry) throw new Error("product-language: no term '" + id + "'");
    return entry;
  }

  function has(id) {
    ready();
    return !!index[id];
  }

  function label(id) { return term(id).userLabel; }
  function beginner(id) { return term(id).beginner; }
  function pro(id) { return term(id).professionalLabel; }
  function tooltip(id) { return term(id).tooltip; }
  function negative(id) { return term(id).negative; }
  function unavailable(id) { return term(id).unavailable; }
  function internal(id) { return term(id).internal; }

  /* The headline form. Falls back to the label so a surface never has to
     ask twice, and so adding a question later is not a breaking change. */
  function question(id) {
    var entry = term(id);
    return entry.question || entry.userLabel;
  }

  function category(id) {
    ready();
    return categoryOf[id] || null;
  }

  function ids(categoryId) {
    ready();
    return Object.keys(index).filter(function (id) { return !categoryId || categoryOf[id] === categoryId; });
  }

  function categories() {
    return (ready().categories || []).map(function (entry) {
      return { id: entry.id, label: entry.label, terms: entry.terms.slice() };
    });
  }

  function layers() { return (ready().layers || []).slice(); }
  function rules() { return (ready().rules || []).slice(); }
  function forbidden() { return (ready().forbiddenInPrimaryCopy || []).slice(); }
  function version() { return ready().methodologyVersion; }

  /* Every entry complete, every field non-empty. Run by a test rather than
     trusted, because a half-filled entry is how a tooltip ends up blank in
     production. */
  function validate() {
    var errors = [];
    var dictionary;
    try { dictionary = ready(); } catch (error) { return { valid: false, errors: [error.message] }; }
    if (typeof dictionary.methodologyVersion !== "string" || !dictionary.methodologyVersion) errors.push("methodologyVersion missing");
    if (!Array.isArray(dictionary.layers) || dictionary.layers.length !== 4) errors.push("the four layers must be declared");
    (dictionary.categories || []).forEach(function (categoryEntry) {
      if (!categoryEntry.id || !categoryEntry.label) errors.push("a category has no id or label");
      (categoryEntry.terms || []).forEach(function (entry) {
        REQUIRED.forEach(function (field) {
          if (typeof entry[field] !== "string" || !entry[field].trim()) {
            errors.push("term '" + (entry.id || "?") + "' is missing " + field);
          }
        });
        if (entry.userLabel === entry.professionalLabel && categoryEntry.id !== "state") {
          errors.push("term '" + entry.id + "': user label and professional label are identical, so one of them is not doing its job");
        }
      });
    });
    return { valid: errors.length === 0, errors: errors };
  }

  /* Does a string lead with an internal term? Used by the guard test on the
     frontend source and by anything that assembles a headline. A term is
     allowed further down, in a folded methodology section - this only asks
     about copy that stands at the front. */
  function violatesPrimaryCopy(text) {
    if (typeof text !== "string" || !text) return null;
    var list = forbidden();
    for (var i = 0; i < list.length; i++) {
      var needle = list[i];
      var pattern = new RegExp("(^|[^A-Za-z0-9])" + needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([^A-Za-z0-9]|$)");
      if (pattern.test(text)) return needle;
    }
    return null;
  }

  var api = {
    LAYERS: ["MEANING", "EXPLANATION", "EVIDENCE", "METHODOLOGY"],
    REQUIRED_FIELDS: REQUIRED.slice(),
    load: load,
    term: term,
    has: has,
    label: label,
    beginner: beginner,
    pro: pro,
    tooltip: tooltip,
    negative: negative,
    unavailable: unavailable,
    internal: internal,
    question: question,
    category: category,
    ids: ids,
    categories: categories,
    layers: layers,
    rules: rules,
    forbidden: forbidden,
    version: version,
    validate: validate,
    violatesPrimaryCopy: violatesPrimaryCopy
  };

  if (isNode) module.exports = api;
  else {
    global.VUProductLanguage = api;
    /* In the browser the dictionary is fetched once and handed in; until it
       arrives every accessor throws rather than guessing a word. */
  }
})(typeof window !== "undefined" ? window : globalThis);
