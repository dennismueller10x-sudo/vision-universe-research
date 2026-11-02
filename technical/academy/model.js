/* Academy state only: no market data, indicator calculations or account requests. */
(function (g) {
  'use strict';
  var KEY = 'vu-technical-academy-progress-v1', SESSION_KEY = 'vu-technical-academy-session-v1';
  function read(storage, content) {
    try {
      var value = JSON.parse(storage.getItem(KEY));
      if (!value || value.schemaVersion !== 1 || value.contentVersion !== content.contentVersion || !Array.isArray(value.completed)) return [];
      return content.lessons.filter(function (l) {
        var revision = value.revisions && value.revisions[l.id];
        // Original v1 records had no revisions: they can only certify unchanged v1 lessons.
        return value.completed.indexOf(l.id) >= 0 && (revision === undefined ? l.version === 1 : revision === l.version);
      }).map(function (l) { return l.id; });
    } catch (_) { return []; }
  }
  function outdated(storage, content) {
    try {
      var value=JSON.parse(storage.getItem(KEY));
      return !!(value && Array.isArray(value.completed) && value.completed.some(function(id){
        return content.lessons.some(function(l){return l.id===id;}) && read(storage,content).indexOf(id)<0;
      }));
    } catch (_) { return false; }
  }
  function save(storage, content, ids) {
    try {
      var lessons = content.lessons.filter(function (l) { return ids.indexOf(l.id) >= 0; }), revisions = {};
      lessons.forEach(function (l) { revisions[l.id] = l.version; });
      storage.setItem(KEY, JSON.stringify({ schemaVersion: 1, contentVersion: content.contentVersion,
        completed: lessons.map(function (l) { return l.id; }), revisions: revisions }));
      return true;
    } catch (_) { return false; }
  }
  function session(storage, content) {
    try {
      var value = JSON.parse(storage.getItem(SESSION_KEY));
      var lesson = value && content.lessons.find(function (l) { return l.id === value.id; });
      if (!lesson || value.contentVersion !== content.contentVersion || value.lessonVersion !== lesson.version) return null;
      return { id: lesson.id, contentVersion: content.contentVersion, lessonVersion: lesson.version,
        choice: lesson.quiz.choices.some(function(c){return c.id === value.choice;}) ? value.choice : null,
        checked: value.checked === true, y: Number.isFinite(value.y) && value.y >= 0 ? value.y : 0 };
    } catch (_) { return null; }
  }
  function saveSession(storage, value) {
    try { storage.setItem(SESSION_KEY, JSON.stringify(value)); return true; } catch (_) { return false; }
  }
  function answer(quiz, id) { return quiz.type === 'single-choice' && quiz.choices.some(function (c) { return c.id === id; }) && quiz.answer === id; }
  function safeLink(href) { return typeof href === 'string' && /^#\/(assistent(?:\/[a-z-]+)?|chart|screener|vorlagen(?:\/[a-zA-Z0-9-]+)?)$/.test(href); }
  var api = { KEY: KEY, SESSION_KEY: SESSION_KEY, read: read, save: save, outdated: outdated, session: session, saveSession: saveSession, answer: answer, safeLink: safeLink };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  g.VUAcademyModel = api;
})(globalThis);
