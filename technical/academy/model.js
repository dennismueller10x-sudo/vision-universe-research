/* Content and local progress only. No market data or indicator dependency. */
(function (g) {
  'use strict';
  var KEY = 'vu-technical-academy-progress-v1';
  function read(storage, content) {
    try {
      var value = JSON.parse(storage.getItem(KEY));
      if (!value || value.schemaVersion !== 1 || value.contentVersion !== content.contentVersion || !Array.isArray(value.completed)) return [];
      return content.lessons.filter(function (l) { return value.completed.indexOf(l.id) >= 0; }).map(function (l) { return l.id; });
    } catch (_) { return []; }
  }
  function save(storage, content, ids) {
    try {
      storage.setItem(KEY, JSON.stringify({ schemaVersion: 1, contentVersion: content.contentVersion,
        completed: content.lessons.filter(function (l) { return ids.indexOf(l.id) >= 0; }).map(function (l) { return l.id; }) }));
      return true;
    } catch (_) { return false; }
  }
  function answer(quiz, id) { return quiz.type === 'single-choice' && quiz.choices.some(function (c) { return c.id === id; }) && quiz.answer === id; }
  function safeLink(href) { return typeof href === 'string' && /^#\/(assistent\/[a-z-]+|chart|screener|vorlagen(?:\/[a-zA-Z0-9-]+)?)$/.test(href); }
  var api = { KEY: KEY, read: read, save: save, answer: answer, safeLink: safeLink };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  g.VUAcademyModel = api;
})(globalThis);
