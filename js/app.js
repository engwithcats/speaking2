/* Fairytopia Questions — логика игры */
(function () {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // Счётчики относятся к текущему раунду и только к проверяемым ответам.
  const Encouragement = {
    streak: 0, mistakes: 0, timer: null,
    hide() { clearTimeout(this.timer); $("#cat-notice").hidden = true; },
    reset() { this.streak = 0; this.mistakes = 0; this.hide(); },
    show(support) {
      this.hide();
      $("#cat-notice-image").src = support ? "assets/ошибка.PNG" : "assets/радостная.PNG";
      $("#cat-notice-message").innerHTML = support
        ? '<strong>Не переживай! Ты справишься.</strong><p>А с полугодовыми курсами котиков тебе будет проще</p>'
        : '<strong>Молодец! Не останавливайся!</strong>';
      $("#cat-notice-link").hidden = !support;
      $("#cat-notice").hidden = false;
      if (!support) this.timer = setTimeout(() => this.hide(), 6000);
    },
    answer(ok) {
      if (ok) {
        this.streak++;
        if ([5, 15, 25, 50].includes(this.streak)) this.show(false);
      } else {
        this.streak = 0;
        this.mistakes++;
        if (this.mistakes === 3) this.show(true);
      }
    }
  };
  $("#cat-notice-close").addEventListener("click", () => Encouragement.hide());

  /* ---------- утилиты ---------- */
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, rnd = Math.random) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function withBlanks(s) { return esc(s).replace(/_{2,}/g, '<span class="blank"></span>'); }
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  };

  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2400);
  }

  function confetti(n = 40) {
    const items = ["✨", "🦋", "💜", "🌟", "💫", "🪄"];
    for (let i = 0; i < n; i++) {
      const el = document.createElement("div");
      el.className = "confetti";
      el.textContent = items[i % items.length];
      el.style.left = Math.random() * 100 + "vw";
      el.style.fontSize = 14 + Math.random() * 18 + "px";
      el.style.animationDuration = 2.2 + Math.random() * 2.2 + "s";
      el.style.animationDelay = Math.random() * 0.6 + "s";
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 5200);
    }
  }

  /* ---------- блёстки на фоне ---------- */
  (function makeSparkles() {
    const box = $("#sparkles");
    if (!box) return;
    for (let i = 0; i < 26; i++) {
      const s = document.createElement("div");
      s.className = "sparkle" + (i % 3 === 0 ? " gold" : "");
      s.style.left = Math.random() * 100 + "%";
      s.style.top = Math.random() * 100 + "%";
      s.style.animationDelay = Math.random() * 3 + "s";
      s.style.animationDuration = 2 + Math.random() * 3 + "s";
      box.appendChild(s);
    }
  })();

  /* ---------- навигация ---------- */
  const starters = {};
  function show(name) {
    $$(".screen").forEach(s => s.classList.remove("active"));
    $("#screen-" + name).classList.add("active");
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  }
  function go(name) {
    Encouragement.reset();
    if (name !== "fight") Duel.leave();
    show(name);
    if (starters[name]) starters[name]();
  }
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-go]");
    if (b) go(b.dataset.go);
  });

  let endAgain = null;
  function showEnd(title, text, again) {
    $("#end-title").textContent = title;
    $("#end-text").innerHTML = text;
    endAgain = again;
    show("end");
    confetti();
  }
  $("#end-again").addEventListener("click", () => endAgain && endAgain());

  /* ======================================================
     1. FLASHCARDS
     ====================================================== */
  const RULES = [
    "В первом вопросе называй место из задания: Where is the shop located? (не Where is it located?)",
    "Не используй they: What type of food does the restaurant serve?",
    "Никаких What about …?, How much is the price?, Where is the location?, How long are the opening hours?",
    "Косвенный вопрос — только полный и с прямым порядком слов: Could you tell me where the hotel is situated?",
    "Не теряй артикли: What are the dental programmes?",
    "В minimum age всегда указывай действие: What is the minimum age to join the club?"
  ];
  const CARDS = [
    { front: "Правила вопросов ✨", label: "Запомни", rules: RULES },
    ...window.TEMPLATES.map(t => ({ front: t.cat, label: t.cat, lines: t.lines })),
    { front: "X of Y — универсальный шаблон", label: "Для любого пункта вида X of Y", lines: ["What is the ___ of ___?", "#Например:", "What is the duration of the tour?", "What is the size of the shop?"] }
  ];
  const Flash = { i: 0 };

  function renderBack(card) {
    if (card.rules) {
      return '<ul class="flash-rules">' + card.rules.map(r => "<li>" + esc(r) + "</li>").join("") + "</ul>";
    }
    let html = "<ul>";
    card.lines.forEach(l => {
      if (l.startsWith("#")) html += '<li class="sub" style="list-style:none;padding-left:0;border:0">' + esc(l.slice(1)) + "</li>";
      else if (l.startsWith("=")) html += '<li style="border:0;padding-left:0;list-style:none"><span class="formula">' + esc(l.slice(1)) + "</span></li>";
      else html += "<li>" + withBlanks(l) + "</li>";
    });
    return html + "</ul>";
  }
  function renderFlash() {
    const card = CARDS[Flash.i];
    const fc = $("#flashcard");
    fc.classList.remove("flipped");
    // меняем текст после того, как карточка повернулась лицом
    setTimeout(() => {
      $("#flash-front").textContent = card.front;
      $("#flash-back-label").textContent = card.label;
      $("#flash-back").innerHTML = renderBack(card);
      $("#flash-back").scrollTop = 0;
    }, fc.dataset.ready ? 160 : 0);
    fc.dataset.ready = "1";
    $("#flash-counter").textContent = Flash.i + 1 + " / " + CARDS.length;
    $("#flash-progress").style.width = ((Flash.i + 1) / CARDS.length) * 100 + "%";
    $("#flash-prev").disabled = Flash.i === 0;
    $("#flash-next").textContent = Flash.i === CARDS.length - 1 ? "Готово ✓" : "Далее →";
  }
  function flip() { $("#flashcard").classList.toggle("flipped"); }
  function flashNext() {
    if (Flash.i < CARDS.length - 1) { Flash.i++; renderFlash(); }
    else showEnd("Все карточки пройдены! 🎉", "Ты повторил(а) все " + CARDS.length + " карточек с шаблонами вопросов. Начнём сначала или выберем другой режим?", () => go("flash"));
  }
  function flashPrev() { if (Flash.i > 0) { Flash.i--; renderFlash(); } }
  starters.flash = () => { Flash.i = 0; delete $("#flashcard").dataset.ready; renderFlash(); };

  $("#flash-flip").addEventListener("click", flip);
  $("#flash-next").addEventListener("click", flashNext);
  $("#flash-prev").addEventListener("click", flashPrev);
  (function swipe() {
    const fc = $("#flashcard");
    let x0 = null, y0 = null, moved = false;
    fc.addEventListener("pointerdown", e => { x0 = e.clientX; y0 = e.clientY; moved = false; });
    fc.addEventListener("pointermove", e => { if (x0 !== null && Math.abs(e.clientX - x0) > 10) moved = true; });
    fc.addEventListener("pointerup", e => {
      if (x0 === null) return;
      const dx = e.clientX - x0, dy = e.clientY - y0;
      x0 = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) { dx < 0 ? flashNext() : flashPrev(); }
      else if (!moved) flip();
    });
    fc.addEventListener("pointercancel", () => { x0 = null; });
    fc.addEventListener("keydown", e => {
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); flip(); }
    });
    document.addEventListener("keydown", e => {
      if (!$("#screen-flash").classList.contains("active")) return;
      if (e.key === "ArrowRight") flashNext();
      if (e.key === "ArrowLeft") flashPrev();
    });
  })();

  /* ======================================================
     Пазл «собери вопрос» (общий для Mix & Match и Fight)
     ====================================================== */
  function createPuzzle(container, item, rnd = Math.random) {
    const [point, question] = item;
    const words = question.split(/\s+/);
    let order = words.map((w, i) => i);
    if (words.length > 1) {
      let tries = 0;
      do { order = shuffle(order, rnd); tries++; } while (order.every((v, i) => words[v] === words[i]) && tries < 20);
    }

    container.innerHTML =
      '<div class="mix-point"><div class="face-label">Ask about</div><div class="point">' + esc(point) + "</div></div>" +
      '<div class="zone-label">Твой вопрос</div><div class="drop-zone answer" data-zone="answer"></div>' +
      '<div class="zone-label">Слова</div><div class="drop-zone bank" data-zone="bank"></div>' +
      '<div class="feedback" aria-live="polite"></div>';
    const answer = $(".answer", container), bank = $(".bank", container), fb = $(".feedback", container);
    let locked = false;

    order.forEach(i => {
      const t = document.createElement("button");
      t.type = "button";
      t.className = "tile";
      t.textContent = words[i];
      t.dataset.w = words[i];
      bank.appendChild(t);
      attachDrag(t);
    });

    function clearState() {
      answer.classList.remove("correct", "wrong");
      fb.className = "feedback"; fb.innerHTML = "";
    }
    function attachDrag(tile) {
      let start = null, dragging = false, ph = null, clone = null, offX = 0, offY = 0;
      const move = e => {
        if (!start || locked) return;
        if (!dragging && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 6) {
          dragging = true;
          clearState();
          const r = tile.getBoundingClientRect();
          offX = start.x - r.left; offY = start.y - r.top;
          ph = document.createElement("div");
          ph.className = "placeholder";
          ph.style.height = r.height + "px";
          ph.style.width = r.width + "px";
          tile.parentNode.insertBefore(ph, tile);
          clone = tile.cloneNode(true);
          clone.classList.add("dragging");
          clone.style.width = r.width + "px";
          document.body.appendChild(clone);
          tile.style.display = "none";
        }
        if (dragging) {
          e.preventDefault();
          clone.style.left = e.clientX - offX + "px";
          clone.style.top = e.clientY - offY + "px";
          const el = document.elementFromPoint(e.clientX, e.clientY);
          const zone = el && el.closest(".drop-zone");
          $$(".drop-zone", container).forEach(z => z.classList.toggle("hot", z === zone));
          if (zone && container.contains(zone)) {
            const tiles = $$(".tile", zone).filter(t => t !== tile);
            let before = null;
            for (const t of tiles) {
              const r = t.getBoundingClientRect();
              if (e.clientY < r.top) { before = t; break; }
              if (e.clientY <= r.bottom && e.clientX < r.left + r.width / 2) { before = t; break; }
            }
            if (before) zone.insertBefore(ph, before); else zone.appendChild(ph);
          }
        }
      };
      const end = () => {
        document.removeEventListener("pointermove", move);
        document.removeEventListener("pointerup", end);
        document.removeEventListener("pointercancel", end);
        if (dragging) {
          ph.parentNode.insertBefore(tile, ph);
          ph.remove(); clone.remove();
          tile.style.display = "";
          $$(".drop-zone", container).forEach(z => z.classList.remove("hot"));
        } else if (start && !locked) {
          clearState();
          (tile.parentNode === bank ? answer : bank).appendChild(tile);
        }
        start = null; dragging = false; ph = null; clone = null;
      };
      tile.addEventListener("pointerdown", e => {
        if (locked || e.button > 0) return;
        start = { x: e.clientX, y: e.clientY };
        document.addEventListener("pointermove", move, { passive: false });
        document.addEventListener("pointerup", end);
        document.addEventListener("pointercancel", end);
      });
      tile.addEventListener("keydown", e => {
        if ((e.key === "Enter" || e.key === " ") && !locked) {
          e.preventDefault(); clearState();
          (tile.parentNode === bank ? answer : bank).appendChild(tile);
          tile.focus();
        }
      });
      tile.addEventListener("click", e => e.preventDefault());
    }

    return {
      question,
      current() { return $$(".tile", answer).map(t => t.dataset.w).join(" "); },
      isComplete() { return bank.children.length === 0; },
      check() {
        const ok = this.current() === question;
        answer.classList.remove("correct", "wrong");
        void answer.offsetWidth;
        answer.classList.add(ok ? "correct" : "wrong");
        return ok;
      },
      feedback(html, cls) { fb.className = "feedback " + (cls || ""); fb.innerHTML = html; },
      reset() {
        if (locked) return;
        clearState();
        order.forEach(i => {
          const t = $$(".tile", container).find(x => x.dataset.w === words[i] && x.parentNode === answer);
          if (t) bank.appendChild(t);
        });
      },
      reveal() {
        const all = $$(".tile", container);
        words.forEach(w => {
          const t = all.find(x => x.dataset.w === w && !x.dataset.used);
          t.dataset.used = "1";
          answer.appendChild(t);
        });
        answer.classList.remove("wrong");
        answer.classList.add("correct");
        this.lock();
      },
      lock() { locked = true; $$(".tile", container).forEach(t => (t.disabled = true)); }
    };
  }

  /* ======================================================
     2. MIX & MATCH
     ====================================================== */
  const Mix = { deck: [], i: 0, score: 0, tries: 0, revealed: false, puzzle: null, count: 20 };
  starters.mix = () => {
    $("#mix-setup").hidden = false;
    $("#mix-play").hidden = true;
    $("#mix-counter").textContent = "";
  };
  $$("[data-mix-count]").forEach(b => b.addEventListener("click", () => {
    const c = b.dataset.mixCount;
    Mix.count = c === "all" ? window.QUESTIONS.length : +c;
    Mix.deck = shuffle(window.QUESTIONS).slice(0, Mix.count);
    Encouragement.reset();
    Mix.i = 0; Mix.score = 0;
    $("#mix-setup").hidden = true;
    $("#mix-play").hidden = false;
    mixRender();
  }));
  function mixRender() {
    Mix.tries = 0; Mix.revealed = false;
    Mix.puzzle = createPuzzle($("#mix-game"), Mix.deck[Mix.i]);
    $("#mix-counter").textContent = Mix.i + 1 + " / " + Mix.deck.length;
    $("#mix-progress").style.width = (Mix.i / Mix.deck.length) * 100 + "%";
    $("#mix-check").hidden = false; $("#mix-next").hidden = true;
    $("#mix-show").disabled = false; $("#mix-reset").disabled = false;
  }
  function mixDone(ok) {
    $("#mix-check").hidden = true; $("#mix-next").hidden = false;
    $("#mix-show").disabled = true; $("#mix-reset").disabled = true;
    Mix.puzzle.lock();
    $("#mix-next").focus();
    if (ok) {
      const praise = ["Brilliant! ✨", "Magical! 🦋", "Perfect! 💖", "Great job! 🌸", "Excellent! ⭐"];
      Mix.puzzle.feedback(praise[Math.floor(Math.random() * praise.length)], "ok");
    }
  }
  $("#mix-check").addEventListener("click", () => {
    const p = Mix.puzzle;
    if (!p.isComplete()) { p.feedback("Используй все слова 🙂", "bad"); return; }
    Mix.tries++;
    if (p.check()) {
      if (Mix.tries === 1) { Mix.score++; Encouragement.answer(true); }
      mixDone(true);
    } else {
      if (Mix.tries === 1) Encouragement.answer(false);
      p.feedback(Mix.tries >= 2 ? "Почти! Подсказка: вопрос начинается с «" + esc(p.question.split(" ")[0]) + "»" : "Почти! Попробуй ещё раз", "bad");
    }
  });
  $("#mix-reset").addEventListener("click", () => Mix.puzzle.reset());
  $("#mix-show").addEventListener("click", () => {
    Encouragement.streak = 0;
    Mix.puzzle.reveal();
    Mix.puzzle.feedback('Правильный вопрос:<span class="right">' + esc(Mix.puzzle.question) + "</span>", "");
    mixDone(false);
  });
  $("#mix-next").addEventListener("click", () => {
    Mix.i++;
    if (Mix.i < Mix.deck.length) mixRender();
    else {
      $("#mix-progress").style.width = "100%";
      showEnd("Раунд пройден! 🎉", "С первой попытки: <b>" + Mix.score + " из " + Mix.deck.length + "</b>", () => go("mix"));
    }
  });

  /* ======================================================
     3. TEST YOURSELF
     ====================================================== */
  const Test = { deck: [], i: 0, n: 0 };
  function testRender() {
    if (Test.i >= Test.deck.length) { Test.deck = shuffle(window.QUESTIONS); Test.i = 0; }
    const [point, q] = Test.deck[Test.i];
    $("#test-point").textContent = point;
    $("#test-answer").textContent = q;
    $("#test-answer").hidden = true;
    $("#test-show").disabled = false;
    $("#test-counter").textContent = "№ " + (Test.n + 1);
  }
  starters.test = () => { Test.deck = shuffle(window.QUESTIONS); Test.i = 0; Test.n = 0; testRender(); };
  $("#test-show").addEventListener("click", () => { $("#test-answer").hidden = false; $("#test-show").disabled = true; });
  $("#test-next").addEventListener("click", () => { Test.i++; Test.n++; testRender(); });

  /* ======================================================
     QUIZ — выбери правильный вопрос среди вариантов с ошибками
     ====================================================== */
  const AUX = ["is", "are", "does", "do", "can", "will", "should"];
  const SWAP = { is: "are", are: "is", does: "do", do: "does" };
  const WRONG_AUX = { is: "does", are: "do", does: "is", do: "are" };
  const PRED = /^(\w+ed|taught|held|sold|made|done|available|free|possible|safe|open|necessary|qualified|vaccinated|located|situated)$/i;
  const KEEP_CASE = /^(I|Wi-Fi|Internet|London|Russian|PE|TV)$/;
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const low = w => (KEEP_CASE.test(w) ? w : w.charAt(0).toLowerCase() + w.slice(1));
  const toQ = words => cap(words.join(" ")) + "?";

  // где кончается подлежащее (куда ученик по ошибке ставит глагол): I / there / the shop / the school's car …
  function subjectEnd(rest) {
    const l = rest.map(x => x.toLowerCase());
    if (["there", "i", "you", "it", "we", "they"].includes(l[0])) return 1;
    const p = rest.findIndex((x, i) => i > 0 && PRED.test(x));
    if (p > 0) return p;
    if (["the", "a", "an", "your", "my"].includes(l[0])) {
      let i = 1;
      while (i < rest.length - 1 && /'s$/.test(rest[i])) i++;
      return Math.min(i + 1, rest.length);
    }
    return 1;
  }

  function makeDistractors(point, q) {
    const w = q.replace(/\?$/, "").split(" ");
    const lw = w.map(x => x.toLowerCase());
    const ai = lw.findIndex(x => AUX.includes(x));
    const aux = ai >= 0 ? lw[ai] : null;
    const cands = [];
    const add = (words, why, prio) => {
      const text = Array.isArray(words) ? toQ(words) : words;
      if (text && text !== q && !cands.some(c => c.text === text)) cands.push({ text, why, prio: prio || 0 });
    };

    // 1) порядок слов
    if (ai === 0) {
      const rest = w.slice(1);
      rest[0] = low(rest[0]);
      if (aux === "do" || aux === "does") add(rest, "Порядок слов: это утверждение, а в вопросе нужен вспомогательный глагол do / does в начале", 2);
      else {
        const out = rest.slice();
        out.splice(subjectEnd(rest), 0, aux);
        add(out, "Порядок слов: в вопросе глагол (" + aux + ") стоит перед подлежащим", 2);
      }
    } else if (ai > 0) {
      const wh = w.slice(0, ai), rest = w.slice(ai + 1);
      if (aux === "do" || aux === "does") add([...wh, ...rest], "Пропущен вспомогательный глагол " + aux + " — без него получается не вопрос", 2);
      else if (aux === "is" || aux === "are") {
        const p = rest.findIndex((x, i) => i > 0 && PRED.test(x));
        const out = p > 0 ? [...wh, ...rest.slice(0, p), w[ai], ...rest.slice(p)] : [...wh, ...rest, w[ai]];
        add(out, "Порядок слов: после вопросительного слова сразу идёт " + aux + ", потом подлежащее", 2);
      } else {
        const out = rest.slice();
        out.splice(subjectEnd(rest), 0, w[ai]);
        add([...wh, ...out], "Порядок слов: после вопросительного слова сразу идёт " + aux + ", потом подлежащее", 2);
      }
    }
    // 2) согласование is/are, do/does
    if (aux && SWAP[aux] && !/staff| and /i.test(q)) {
      const out = w.slice(); out[ai] = ai === 0 ? cap(SWAP[aux]) : SWAP[aux];
      add(out, "Согласование: " + SWAP[aux] + " не подходит к подлежащему — нужно " + aux, 1);
    }
    // 3) не тот вспомогательный глагол
    if (aux && WRONG_AUX[aux]) {
      const out = w.slice(); out[ai] = ai === 0 ? cap(WRONG_AUX[aux]) : WRONG_AUX[aux];
      add(out, "Не тот вспомогательный глагол: здесь нужен " + aux + ", а не " + WRONG_AUX[aux], 1);
    }
    // 4) пропущен артикль
    const art = lw.findIndex((x, i) => i > 0 && (x === "the" || x === "a" || x === "an"));
    if (art > 0) add(w.filter((x, i) => i !== art), "Пропущен артикль " + lw[art] + " — артикли не теряем", 1);
    // 5) запрещённое What about …?
    if (!/^(if|whether|how|what|when|whom|check)\b/i.test(point)) add("What about " + point + "?", "Так нельзя: What about …? — это не полный прямой вопрос", 0);
    // 6) they вместо you
    if (/\byou\b/i.test(q)) add(q.replace(/\byou\b/g, "they").replace(/\bYou\b/g, "They").replace(/\byour\b/g, "their"), "Не используем they: обращайся на you или называй место (the shop, the club…)", 0);
    // 7) модальный глагол + to
    if (aux === "can" || aux === "should" || aux === "will") {
      const rest = w.slice(ai + 1);
      const at = ai + 1 + subjectEnd(rest);
      if (at < w.length) add([...w.slice(0, at), "to", ...w.slice(at)], "После " + aux + " глагол идёт без частицы to", 1);
    }
    // запасной вариант: лишний глагол
    const at = /^(many|much|long|often|early|big|old)$/.test(lw[1]) ? 2 : 1;
    if (!aux || SWAP[aux]) add([...w.slice(0, at), "is", ...w.slice(at)], "Лишний глагол is — в вопросе только один глагол-помощник", -1);
    else add([...w.slice(0, at), "do", ...w.slice(at)], "Лишний глагол do — с " + aux + " он не нужен", -1);

    const order = cands.filter(c => c.prio === 2);
    const others = shuffle(cands.filter(c => c.prio >= 0 && c.prio < 2));
    const spare = cands.filter(c => c.prio < 0);
    return [...order, ...others, ...spare].slice(0, 3);
  }
  window.__makeDistractors = makeDistractors; // для проверки

  const Quiz = { deck: [], i: 0, score: 0, answered: false };
  starters.quiz = () => {
    $("#quiz-setup").hidden = false;
    $("#quiz-play").hidden = true;
    $("#quiz-counter").textContent = "";
  };
  $$("[data-quiz-count]").forEach(b => b.addEventListener("click", () => {
    const c = b.dataset.quizCount;
    Quiz.deck = shuffle(window.QUESTIONS).slice(0, c === "all" ? window.QUESTIONS.length : +c);
    Encouragement.reset();
    Quiz.i = 0; Quiz.score = 0;
    $("#quiz-setup").hidden = true;
    $("#quiz-play").hidden = false;
    quizRender();
  }));
  function quizRender() {
    Quiz.answered = false;
    const [point, q] = Quiz.deck[Quiz.i];
    $("#quiz-point").textContent = point;
    $("#quiz-counter").textContent = Quiz.i + 1 + " / " + Quiz.deck.length;
    $("#quiz-progress").style.width = (Quiz.i / Quiz.deck.length) * 100 + "%";
    $("#quiz-feedback").className = "feedback"; $("#quiz-feedback").innerHTML = "";
    $("#quiz-next").hidden = true;
    const opts = shuffle([{ text: q, ok: true }, ...makeDistractors(point, q)]);
    const box = $("#quiz-options");
    box.innerHTML = "";
    opts.forEach((o, k) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "quiz-opt";
      b.innerHTML = '<span class="letter">' + "ABCD"[k] + "</span><span>" + esc(o.text) + "</span>";
      b.addEventListener("click", () => quizAnswer(b, o));
      b._opt = o;
      box.appendChild(b);
    });
  }
  function quizAnswer(btn, o) {
    if (Quiz.answered) return;
    Quiz.answered = true;
    Encouragement.answer(o.ok);
    const fb = $("#quiz-feedback");
    $$(".quiz-opt").forEach(b => {
      b.disabled = true;
      if (b._opt.ok) b.classList.add("correct");
    });
    if (o.ok) {
      Quiz.score++;
      const praise = ["Brilliant! ✨", "Perfect! 💜", "Great job! 🦋", "Excellent! 🌟"];
      fb.className = "feedback ok"; fb.textContent = praise[Math.floor(Math.random() * praise.length)];
    } else {
      btn.classList.add("wrong");
      btn.insertAdjacentHTML("beforeend", '<span class="tag">ошибка</span>');
      fb.className = "feedback bad";
      fb.innerHTML = "Неверно 🙈<span class=\"why\">" + esc(o.why) + "</span>";
    }
    $("#quiz-next").hidden = false;
    $("#quiz-next").focus();
  }
  $("#quiz-next").addEventListener("click", () => {
    Quiz.i++;
    if (Quiz.i < Quiz.deck.length) quizRender();
    else {
      $("#quiz-progress").style.width = "100%";
      showEnd("Квиз пройден! 🎉", "Правильных ответов: <b>" + Quiz.score + " из " + Quiz.deck.length + "</b>", () => go("quiz"));
    }
  });
  document.addEventListener("keydown", e => {
    if (!$("#screen-quiz").classList.contains("active") || $("#quiz-play").hidden) return;
    const k = "1234".indexOf(e.key);
    if (k >= 0 && !Quiz.answered) { const b = $$(".quiz-opt")[k]; if (b) b.click(); }
  });

  /* ======================================================
     4. FIGHT — дуэль по PIN
     Соединение: PeerJS (WebRTC, бесплатный публичный сервер).
     Для локальной проверки в двух вкладках: ?local=1 (BroadcastChannel).
     ====================================================== */
  const PREFIX = "fairytopia-q-v1-";
  const DUEL_LEN = 30;
  const LOCAL = /[?&]local=1/.test(location.search);

  function loadPeerJS() {
    if (window.Peer) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js";
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Не удалось загрузить модуль связи. Проверь интернет."));
      document.head.appendChild(s);
    });
  }

  function wrapPeerConn(conn) {
    const h = { data: () => {}, close: () => {} };
    conn.on("data", d => h.data(d));
    conn.on("close", () => h.close());
    conn.on("error", () => h.close());
    return { send: o => { try { conn.send(o); } catch (e) { /* ignore */ } }, onData: f => (h.data = f), onClose: f => (h.close = f), close: () => conn.close() };
  }

  const Net = {
    peer: null, chan: null,
    async host(pin, onConnect) {
      if (LOCAL) {
        const ch = new BroadcastChannel("fq-" + pin);
        this.chan = ch;
        let connected = false;
        const h = { data: () => {}, close: () => {} };
        ch.onmessage = e => {
          const m = e.data;
          if (m.from === "host") return;
          if (m.t === "join" && !connected) { connected = true; ch.postMessage({ from: "host", t: "joined" }); onConnect(api); }
          else if (m.t === "bye") h.close();
          else if (connected && m.t !== "join") h.data(m);
        };
        const api = { send: o => ch.postMessage(Object.assign({ from: "host" }, o)), onData: f => (h.data = f), onClose: f => (h.close = f), close: () => { ch.postMessage({ from: "host", t: "bye" }); } };
        return;
      }
      await loadPeerJS();
      return new Promise((resolve, reject) => {
        const peer = new window.Peer(PREFIX + pin, { debug: 0 });
        this.peer = peer;
        let has = false;
        peer.on("open", () => resolve());
        peer.on("error", err => reject(err));
        peer.on("connection", conn => {
          if (has) { conn.on("open", () => conn.close()); return; }
          has = true;
          conn.on("open", () => onConnect(wrapPeerConn(conn)));
        });
      });
    },
    async join(pin) {
      if (LOCAL) {
        const ch = new BroadcastChannel("fq-" + pin);
        this.chan = ch;
        return new Promise((resolve, reject) => {
          const h = { data: () => {}, close: () => {} };
          let ok = false;
          const api = { send: o => ch.postMessage(Object.assign({ from: "guest" }, o)), onData: f => (h.data = f), onClose: f => (h.close = f), close: () => ch.postMessage({ from: "guest", t: "bye" }) };
          ch.onmessage = e => {
            const m = e.data;
            if (m.from === "guest") return;
            if (m.t === "joined") { ok = true; resolve(api); }
            else if (m.t === "bye") h.close();
            else if (ok) h.data(m);
          };
          ch.postMessage({ from: "guest", t: "join" });
          setTimeout(() => { if (!ok) reject({ type: "peer-unavailable" }); }, 2500);
        });
      }
      await loadPeerJS();
      return new Promise((resolve, reject) => {
        const peer = new window.Peer({ debug: 0 });
        this.peer = peer;
        let done = false;
        const timer = setTimeout(() => { if (!done) reject({ type: "timeout" }); }, 15000);
        peer.on("error", err => { clearTimeout(timer); if (!done) reject(err); });
        peer.on("open", () => {
          const conn = peer.connect(PREFIX + pin, { reliable: true });
          conn.on("open", () => { done = true; clearTimeout(timer); resolve(wrapPeerConn(conn)); });
        });
      });
    },
    close() {
      if (this.peer) { try { this.peer.destroy(); } catch (e) { /* ignore */ } this.peer = null; }
      if (this.chan) { try { this.chan.close(); } catch (e) { /* ignore */ } this.chan = null; }
    }
  };

  const Duel = {
    conn: null, role: null, seed: 0, deck: [], i: 0, correct: 0, t0: 0,
    me: null, opp: null, puzzle: null, rnd: null, busy: false, active: false,

    panels: ["fight-lobby", "fight-wait", "fight-count", "fight-play", "fight-waitend", "fight-result"],
    panel(id) { this.panels.forEach(p => ($("#" + p).hidden = p !== id)); },
    status(msg, info) { const s = $("#fight-status"); s.textContent = msg || ""; s.classList.toggle("info", !!info); },
    myName() {
      const n = $("#fight-name").value.trim() || (this.role === "host" ? "Игрок 1" : "Игрок 2");
      store.set("fq-name", $("#fight-name").value.trim());
      return n;
    },

    reset() {
      this.conn = null; this.role = null; this.active = false; this.busy = false;
      this.me = null; this.opp = null; this.i = 0; this.correct = 0;
      $("#fight-counter").textContent = "";
      $("#fight-create").disabled = false; $("#fight-join").disabled = false;
      this.status("");
      this.panel("fight-lobby");
    },
    leave() {
      if (this.conn) { try { this.conn.send({ t: "bye" }); this.conn.close(); } catch (e) { /* ignore */ } }
      Net.close();
      this.conn = null; this.active = false;
    },

    async create() {
      this.leave();
      this.role = "host";
      $("#fight-create").disabled = true; $("#fight-join").disabled = true;
      this.status("Создаём дуэль…", true);
      for (let attempt = 0; attempt < 4; attempt++) {
        const pin = String(Math.floor(100000 + Math.random() * 900000));
        try {
          await Net.host(pin, conn => this.onConnected(conn));
          $("#fight-pin-show").textContent = pin;
          this.panel("fight-wait");
          this.status("");
          return;
        } catch (err) {
          Net.close();
          if (err && err.type === "unavailable-id") continue;
          this.status(this.errText(err));
          break;
        }
      }
      $("#fight-create").disabled = false; $("#fight-join").disabled = false;
    },

    async join() {
      const pin = $("#fight-pin").value.replace(/\D/g, "");
      if (pin.length !== 6) { this.status("PIN — это 6 цифр"); return; }
      this.leave();
      this.role = "guest";
      $("#fight-create").disabled = true; $("#fight-join").disabled = true;
      this.status("Подключаемся…", true);
      try {
        const conn = await Net.join(pin);
        this.onConnected(conn);
      } catch (err) {
        Net.close();
        this.status(this.errText(err));
        $("#fight-create").disabled = false; $("#fight-join").disabled = false;
      }
    },

    errText(err) {
      const t = err && err.type;
      if (t === "peer-unavailable") return "Дуэль с таким PIN не найдена. Проверь цифры — друг должен держать страницу с PIN открытой.";
      if (t === "timeout") return "Не получилось соединиться. Попробуйте ещё раз или другую сеть (Wi-Fi / мобильный интернет).";
      if (t === "network" || t === "server-error" || t === "socket-error") return "Нет связи с сервером дуэлей. Проверь интернет.";
      if (t === "browser-incompatible") return "Этот браузер не поддерживает дуэли. Попробуй Chrome, Safari или Firefox.";
      return (err && err.message) || "Что-то пошло не так. Попробуй ещё раз.";
    },

    onConnected(conn) {
      this.conn = conn;
      conn.onData(m => this.onMsg(m));
      conn.onClose(() => this.onOppLeft());
      this.me = { name: this.myName(), done: false, correct: 0, ms: 0, i: 0 };
      if (this.role === "host") {
        this.seed = Math.floor(Math.random() * 2 ** 31);
        conn.send({ t: "hello", name: this.me.name, seed: this.seed });
      }
    },

    onMsg(m) {
      switch (m.t) {
        case "hello":
          this.opp = { name: m.name || "Соперник", done: false, correct: 0, ms: 0, i: 0 };
          if (this.role === "guest") {
            this.seed = m.seed;
            this.conn.send({ t: "hello", name: this.me.name });
          } else {
            this.conn.send({ t: "start" });
            this.countdown();
          }
          break;
        case "start":
          this.countdown();
          break;
        case "prog":
          if (!this.opp) return;
          this.opp.i = m.i; this.opp.correct = m.correct;
          this.updateBars();
          break;
        case "done":
          if (!this.opp) return;
          this.opp.done = true; this.opp.correct = m.correct; this.opp.ms = m.ms; this.opp.i = DUEL_LEN;
          this.updateBars();
          if (this.me.done) this.result();
          break;
        case "bye":
          this.onOppLeft();
          break;
      }
    },

    onOppLeft() {
      if (!this.conn) return;
      const wasPlaying = this.active || (this.me && this.me.done);
      this.conn = null;
      Net.close();
      if (!wasPlaying) { this.reset(); this.status("Соперник отключился."); return; }
      if (this.opp && !this.opp.done) { this.opp.left = true; }
      toast("Соперник покинул дуэль");
      if (this.me.done) this.result();
    },

    countdown() {
      this.panel("fight-count");
      $("#fight-vs").textContent = this.me.name + "  vs  " + this.opp.name;
      let n = 3;
      const el = $("#fight-countdown");
      el.textContent = n;
      const tick = setInterval(() => {
        n--;
        if (n > 0) el.textContent = n;
        else if (n === 0) el.textContent = "Go!";
        else { clearInterval(tick); this.start(); }
      }, 800);
    },

    start() {
      const rnd = mulberry32(this.seed);
      this.deck = shuffle(window.QUESTIONS, rnd).slice(0, DUEL_LEN);
      this.rnd = rnd;
      Encouragement.reset();
      this.i = 0; this.correct = 0; this.t0 = Date.now(); this.active = true;
      $("#duel-me-name").textContent = this.me.name;
      $("#duel-op-name").textContent = this.opp.name;
      this.panel("fight-play");
      this.updateBars();
      this.renderQ();
    },

    renderQ() {
      this.busy = false;
      this.puzzle = createPuzzle($("#fight-game"), this.deck[this.i], this.rnd);
      $("#fight-counter").textContent = this.i + 1 + " / " + DUEL_LEN;
      $("#fight-check").disabled = false; $("#fight-reset").disabled = false;
    },

    answer() {
      if (this.busy || !this.active) return;
      const p = this.puzzle;
      if (!p.isComplete()) { p.feedback("Используй все слова 🙂", "bad"); return; }
      this.busy = true;
      $("#fight-check").disabled = true; $("#fight-reset").disabled = true;
      const ok = p.check();
      Encouragement.answer(ok);
      p.lock();
      if (ok) { this.correct++; p.feedback("Correct! ✨", "ok"); }
      else p.feedback('Неверно. Правильно:<span class="right">' + esc(p.question) + "</span>", "bad");
      this.i++;
      this.me.i = this.i; this.me.correct = this.correct;
      if (this.conn) this.conn.send({ t: "prog", i: this.i, correct: this.correct });
      this.updateBars();
      setTimeout(() => {
        if (!this.active) return;
        if (this.i < DUEL_LEN) this.renderQ();
        else this.finish();
      }, ok ? 700 : 1800);
    },

    finish() {
      this.active = false;
      this.me.done = true; this.me.ms = Date.now() - this.t0;
      if (this.conn) this.conn.send({ t: "done", correct: this.correct, ms: this.me.ms });
      $("#fight-mine").innerHTML = "Твой результат: <b>" + this.correct + " из " + DUEL_LEN + "</b> за " + fmt(this.me.ms);
      if (this.opp.done || this.opp.left || !this.conn) this.result();
      else this.panel("fight-waitend");
    },

    result() {
      const me = this.me, op = this.opp;
      let title;
      if (op.left && !op.done) title = "Победа! 🏆 Соперник вышел";
      else if (me.correct !== op.correct) title = me.correct > op.correct ? "Победа! 🏆" : "Победил(а) " + op.name + " 🦋";
      else if (me.ms !== op.ms) title = me.ms < op.ms ? "Победа! 🏆 Ты быстрее" : "Победил(а) " + op.name + " — быстрее 🦋";
      else title = "Ничья! 🤝";
      const iWin = title.startsWith("Победа");
      $("#fight-winner").textContent = title;
      const row = (p, win) => "<tr" + (win ? ' class="win"' : "") + "><td>" + (win ? "👑 " : "") + esc(p.name) + "</td><td>" + p.correct + " / " + DUEL_LEN + "</td><td>" + (p.done ? fmt(p.ms) : "—") + "</td></tr>";
      $("#fight-table").innerHTML = "<tr><th>Игрок</th><th>Верно</th><th>Время</th></tr>" + row(me, iWin) + row(op, !iWin && !title.startsWith("Ничья"));
      $("#fight-counter").textContent = "";
      this.panel("fight-result");
      if (iWin) confetti(60);
      if (this.conn) { const c = this.conn; this.conn = null; setTimeout(() => { try { c.close(); } catch (e) { /* ignore */ } Net.close(); }, 1500); }
    },

    updateBars() {
      const me = this.me || { i: 0, correct: 0 }, op = this.opp || { i: 0, correct: 0 };
      $("#duel-me").style.width = (me.i / DUEL_LEN) * 100 + "%";
      $("#duel-op").style.width = (op.i / DUEL_LEN) * 100 + "%";
      $("#duel-me-score").textContent = me.correct;
      $("#duel-op-score").textContent = op.correct;
    }
  };
  function fmt(ms) {
    const s = Math.round(ms / 1000);
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }

  starters.fight = () => {
    Duel.leave();
    Duel.reset();
    $("#fight-name").value = store.get("fq-name") || "";
    $("#fight-pin").value = "";
  };
  $("#fight-create").addEventListener("click", () => Duel.create());
  $("#fight-join").addEventListener("click", () => Duel.join());
  $("#fight-pin").addEventListener("keydown", e => { if (e.key === "Enter") Duel.join(); });
  $("#fight-pin").addEventListener("input", e => { e.target.value = e.target.value.replace(/\D/g, "").slice(0, 6); });
  $("#fight-cancel").addEventListener("click", () => { Duel.leave(); Duel.reset(); });
  $("#fight-check").addEventListener("click", () => Duel.answer());
  $("#fight-reset").addEventListener("click", () => Duel.puzzle && Duel.puzzle.reset());
  $("#fight-again").addEventListener("click", () => { Duel.leave(); Duel.reset(); });
  $("#fight-leave").addEventListener("click", () => go("home"));
  window.addEventListener("beforeunload", () => Duel.leave());

  // прямые ссылки: index.html#flash, #mix, #test, #fight
  function fromHash() {
    const h = location.hash.replace("#", "");
    if (["home", "flash", "quiz", "mix", "test", "fight"].includes(h)) go(h);
  }
  window.addEventListener("hashchange", fromHash);
  fromHash();
})();
