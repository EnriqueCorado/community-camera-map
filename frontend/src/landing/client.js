// The one script on the public help pages (inlined at the end of <body> and
// allowed by its hash in the page's Content-Security-Policy). Optional
// helpers, each shown only when the browser supports it:
//  - share: Copy link and the phone's Share sheet on the "Share this" box;
//  - offline (home pages): nothing is stored until "Save all pages" is
//    tapped; that registers this folder's service worker (help/sw.js or
//    ayuda/sw.js), and "Remove saved pages" deletes everything again;
//  - read aloud: reads the page with a voice the browser reports as on-device
//    (localService). Voices that send text to a server are never used.
// Words come from data-* attributes, so the script is the same in every language.
/* eslint-disable */
(function () {
  var body = document.body;

  // ------------------------------------------------------------- offline
  var swUrl = body.getAttribute("data-sw");
  var scope = body.getAttribute("data-scope");
  var box = document.querySelector("[data-offline]");
  if (box && swUrl && scope && "serviceWorker" in navigator && window.caches) {
    var sw = navigator.serviceWorker;
    var saveBtn = box.querySelector("[data-save]");
    var clearBtn = box.querySelector("[data-clear]");
    var state = box.querySelector("[data-state]"); // what's true now (not announced)
    var news = box.querySelector("[role=status]"); // results of a tap (announced)
    var word = function (key, date) {
      return (box.getAttribute("data-" + key) || "").replace("{date}", date || "");
    };
    var show = function (saved, date) {
      clearBtn.hidden = !saved;
      state.textContent = saved ? word("saved-on", date) : "";
    };
    var timer = 0;
    var done = function () {
      clearTimeout(timer);
      saveBtn.disabled = false;
      clearBtn.disabled = false;
    };
    var send = function (reg, msg) {
      var to = sw.controller || reg.active || reg.waiting || reg.installing;
      if (to) to.postMessage(msg);
      clearTimeout(timer);
      timer = setTimeout(function () {
        done();
        news.textContent = word("failed");
      }, 60000);
    };
    sw.addEventListener("message", function (e) {
      var d = e.data || {};
      if (d.type === "status") return show(d.saved, d.date);
      done();
      if (d.type === "saved") {
        show(true, d.date);
        news.textContent = word("saved");
      } else if (d.type === "failed") {
        news.textContent = word(d.reason === "space" ? "no-space" : "failed");
      } else if (d.type === "cleared") {
        show(false);
        news.textContent = word("cleared");
      }
    });
    // Already saved on this device? (Looks only at this browser; no request.)
    sw.getRegistration(scope).then(function (reg) {
      if (reg && reg.active) reg.active.postMessage({ type: "status" });
      else show(false);
      box.hidden = false;
    });
    saveBtn.addEventListener("click", function () {
      saveBtn.disabled = true;
      news.textContent = word("saving");
      // Ask the browser to keep the pages (it may still clear them when space is low).
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
      sw.register(swUrl, { scope: scope })
        .then(function () {
          return sw.ready;
        })
        .then(function (reg) {
          send(reg, { type: "save" });
        })
        .catch(function () {
          done();
          news.textContent = word("failed");
        });
    });
    clearBtn.addEventListener("click", function () {
      clearBtn.disabled = true;
      sw.getRegistration(scope).then(function (reg) {
        if (reg) send(reg, { type: "clear" });
        else {
          done();
          show(false);
        }
      });
    });
  }

  // --------------------------------------------------------------- share
  // Copy link (Clipboard API) and the phone's Share sheet, shown only when
  // the browser has them. The WhatsApp link works without this script.
  var shareBox = document.querySelector("[data-share]");
  if (shareBox) {
    var url = shareBox.getAttribute("data-url");
    var said = shareBox.querySelector("[role=status]");
    var copyBtn = shareBox.querySelector("[data-copy]");
    var nativeBtn = shareBox.querySelector("[data-native]");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      copyBtn.hidden = false;
      copyBtn.addEventListener("click", function () {
        navigator.clipboard.writeText(url).then(
          function () {
            said.textContent = shareBox.getAttribute("data-copied");
          },
          function () {
            said.textContent = shareBox.getAttribute("data-failed") + " " + url;
          },
        );
      });
    }
    if (navigator.share) {
      nativeBtn.hidden = false;
      nativeBtn.addEventListener("click", function () {
        navigator
          .share({ title: shareBox.getAttribute("data-title"), text: shareBox.getAttribute("data-text"), url: url })
          .catch(function () {}); // cancelled
      });
    }
  }

  // ---------------------------------------------------------- read aloud
  var listen = document.querySelector("[data-listen]");
  var synth = window.speechSynthesis;
  if (!listen || !synth || !window.SpeechSynthesisUtterance) return;
  var lang = document.documentElement.lang;
  var button = listen.querySelector("button");
  var label = button.querySelector("[data-label]");
  var voice = null;
  var queue = [];
  var current = null;
  var on = false;
  // Held so the browser can't discard it mid-sentence (Chrome would never
  // fire its "end" event and the reading would stall).
  var speaking = null;
  // Bumped on every start and stop, so events from a cancelled utterance (which
  // arrive late) can't stop or advance a newer reading.
  var session = 0;

  // Apple lists joke voices as ordinary local voices; never pick them.
  var NOVELTY = /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Deranged|Hysterical|Pipe Organ)\b/i;
  var pickVoice = function () {
    if (on) return; // never switch voices, or hide Stop, in the middle of a reading
    var voices = synth.getVoices().filter(function (v) {
      return v.localService && v.lang.toLowerCase().indexOf(lang) === 0 && !NOVELTY.test(v.name);
    });
    var score = function (v) {
      return (/-US$/i.test(v.lang) ? 2 : 0) + (v.default ? 1 : 0);
    };
    voices.sort(function (a, b) {
      return score(b) - score(a);
    });
    voice = voices[0] || null;
    listen.hidden = !voice;
  };
  pickVoice();
  // Chrome fills the list a moment after load.
  if (synth.addEventListener) synth.addEventListener("voiceschanged", pickVoice);
  else synth.onvoiceschanged = pickVoice;

  // What gets read: headings, the intro, and list items, in page order;
  // not citations, the sources section (data-quiet), link lists or the controls.
  var units = function () {
    var main = document.querySelector("main");
    var skip = "[data-quiet], .more, .crumbs, .open, [data-listen], [data-offline], .vh";
    return Array.prototype.filter.call(main.querySelectorAll("h1, h2, .lead, li, .notario > p"), function (el) {
      return !el.closest(skip);
    });
  };
  var textOf = function (el) {
    var copy = el.cloneNode(true);
    Array.prototype.forEach.call(copy.querySelectorAll(".cite, [data-nosay]"), function (c) {
      c.remove();
    });
    // Keep the parts of a card or office apart (not one run-on word).
    Array.prototype.forEach.call(copy.querySelectorAll("span, a, strong"), function (c) {
      c.append(" ");
    });
    return (copy.textContent || "").replace(/\s+/g, " ").trim();
  };
  var mark = function (el) {
    if (current) current.classList.remove("reading");
    current = el;
    if (el) {
      el.classList.add("reading");
      el.scrollIntoView({ block: "nearest" });
    }
  };
  var stop = function () {
    session++;
    on = false;
    queue = [];
    speaking = null;
    synth.cancel();
    mark(null);
    label.textContent = button.getAttribute("data-start");
    pickVoice(); // catch up with any voice list change during the reading
  };
  var next = function () {
    if (!on) return;
    var el = queue.shift();
    if (!el) return stop();
    var text = textOf(el);
    if (!text) return next();
    mark(el);
    var u = new SpeechSynthesisUtterance(text);
    u.voice = voice;
    u.lang = voice.lang;
    u.rate = 0.95;
    var mine = session;
    u.onend = function () {
      if (mine === session) next();
    };
    u.onerror = function () {
      if (mine === session) stop();
    };
    speaking = u;
    synth.speak(u);
  };
  button.addEventListener("click", function () {
    if (on) return stop();
    if (!voice) return;
    synth.cancel();
    session++;
    on = true;
    queue = units();
    label.textContent = button.getAttribute("data-stop");
    next();
  });
  window.addEventListener("pagehide", function () {
    if (on) stop();
  });
})();
