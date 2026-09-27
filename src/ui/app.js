/* App wiring: input form -> engine -> player -> panels + view. */
(function () {
  'use strict';
  const AV = window.AV;
  const $ = (s) => document.querySelector(s);

  const SPEEDS = [0.5, 1, 1.5, 2, 3, 4, 6, 10]; // steps per second

  const els = {
    form: $('#setup'),
    algo: $('#algo'),
    runBtn: $('#run'),
    dataWrap: $('#data-wrap'),
    data: $('#data'),
    exampleWrap: $('#example-wrap'),
    example: $('#example'),
    editor: $('#editor'),
    editCode: $('#edit-code'),
    dataHint: $('#data-hint'),
    paramWrap: $('#param-wrap'),
    paramLabel: $('#param-label'),
    param: $('#param'),
    random: $('#random'),
    keep: $('#keep'),
    message: $('#message'),
    code: $('#code'),
    codeTitle: $('#code-title'),
    viz: $('#viz'),
    vizTitle: $('#viz-title'),
    tabs: $('#viz-tabs'),
    calltree: $('#calltree'),
    callsCount: $('#calls-count'),
    state: $('#state'),
    prev: $('#prev'),
    play: $('#play'),
    next: $('#next'),
    reset: $('#reset'),
    scrub: $('#scrub'),
    counter: $('#counter'),
    speed: $('#speed'),
    speedLabel: $('#speed-label'),
  };

  const app = { algo: null, structure: null, trace: null, view: null, viewId: null, lastIndex: 0, custom: false };
  const CODE_KEY = 'av.customCode';
  const store = {
    get() {
      try {
        return localStorage.getItem(CODE_KEY);
      } catch (_) {
        return null;
      }
    },
    set(v) {
      try {
        localStorage.setItem(CODE_KEY, v);
      } catch (_) {}
    },
  };
  const codePanel = new AV.CodePanel(els.code);
  const player = new AV.Player(render);

  function showMessage(text, kind = 'error') {
    els.message.hidden = !text;
    els.message.className = `message ${kind}`;
    els.message.textContent = text || '';
  }

  function populateAlgorithms() {
    const own = document.createElement('optgroup');
    own.label = 'Your code';
    own.appendChild(new Option('Paste your own (Python)', 'custom'));
    els.algo.appendChild(own);

    const groups = new Map();
    for (const a of AV.algorithms) {
      if (!groups.has(a.structure)) groups.set(a.structure, []);
      groups.get(a.structure).push(a);
    }
    for (const [sid, algos] of groups) {
      const og = document.createElement('optgroup');
      og.label = AV.structures.get(sid).name;
      for (const a of algos) og.appendChild(new Option(a.name, a.id));
      els.algo.appendChild(og);
    }

    els.example.appendChild(new Option('My code', 'mine'));
    for (const ex of AV.pythonExamples) els.example.appendChild(new Option(ex.name, ex.id));
  }

  function selectAlgorithm(id) {
    setUrl(id, id === 'custom' ? els.example.value : null);
    if (id === 'custom') return enterCustom();
    if (app.custom) exitCustom();
    const algo = AV.findAlgorithm(id);
    const structure = AV.structures.get(algo.structure);
    // Switch the input to this algorithm's default unless the user typed their own data.
    const defaults = new Set([structure.defaultData, ...AV.algorithms.filter((a) => a.structure === structure.id && a.defaultData).map((a) => a.defaultData)]);
    if (!app.structure || app.structure.id !== structure.id || defaults.has(els.data.value)) els.data.value = algo.defaultData || structure.defaultData || '';
    app.algo = algo;
    app.structure = structure;
    els.algo.value = id;
    els.dataWrap.hidden = !!structure.noData;
    els.dataHint.textContent = structure.dataHint || '';
    els.paramWrap.hidden = !algo.param;
    if (algo.param) {
      els.paramLabel.textContent = algo.param.label;
      els.param.value = algo.param.default;
    }
    els.keep.hidden = !structure.serialize;
    run();
  }

  function ensureView(viewId) {
    if (app.viewId === viewId) return;
    if (app.view) app.view.destroy();
    els.viz.textContent = '';
    app.view = AV.views.get(viewId).create(els.viz);
    app.viewId = viewId;
    if (app.view instanceof AV.CallTree) app.view.onSeek = seekTo;
  }

  // ---- call tree tab ----
  const callTree = new AV.CallTree(els.calltree, { onSeek: seekTo });
  let tab = 'structure';
  let callTreeTrace = null;
  try {
    tab = localStorage.getItem('av.tab') === 'calls' ? 'calls' : 'structure';
  } catch (_) {}

  function seekTo(i) {
    player.pause();
    player.seek(i);
  }

  function setTab(t) {
    const onlyView = app.viewId === 'calltree'; // the main view already is a call tree
    tab = onlyView ? 'structure' : t;
    try {
      localStorage.setItem('av.tab', t);
    } catch (_) {}
    els.tabs.hidden = onlyView;
    els.viz.hidden = tab !== 'structure';
    els.calltree.hidden = tab !== 'calls';
    for (const b of els.tabs.querySelectorAll('[data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
    if (tab === 'calls' && app.trace) {
      if (callTreeTrace !== app.trace) {
        callTree.prepare(app.trace);
        callTreeTrace = app.trace;
      }
      if (player.step) callTree.render(player.step);
    }
  }

  function traceLoaded(trace) {
    const calls = trace.steps.filter((s) => s.kind === 'call' && s.stack[s.stack.length - 1].fn !== '<module>').length;
    els.callsCount.textContent = calls ? String(calls) : '';
    setTab(tab);
  }

  function setUrl(id, example) {
    try {
      const u = new URL(location.href);
      u.searchParams.set('algo', id);
      if (example && example !== 'mine') u.searchParams.set('example', example);
      else u.searchParams.delete('example');
      history.replaceState(null, '', u);
    } catch (_) {}
  }

  function run() {
    if (app.custom) return runCustom();
    showMessage(null);
    const { algo, structure } = app;
    let values;
    const params = {};
    try {
      values = structure.parse(els.data.value);
      if (algo.param) {
        params[algo.param.name] = algo.param.parse ? algo.param.parse(els.param.value, values) : AV.parseNumber(els.param.value, algo.param.label);
      }
    } catch (e) {
      showMessage(e.message);
      return;
    }
    if (algo.prepareInput) {
      let prepared;
      try {
        prepared = algo.prepareInput(values);
      } catch (e) {
        showMessage(e.message);
        return;
      }
      values = prepared.values;
      if (prepared.note) {
        if (Array.isArray(values) && prepared.rewrite !== false) els.data.value = values.join(', ');
        showMessage(prepared.note, 'info');
      }
    }

    const trace = AV.runAlgorithm(algo, structure, structure.build(values), params);
    if (trace.error) {
      console.error(trace.error);
      showMessage(`Execution stopped: ${trace.error.message}`);
    }
    if (!trace.steps.length) return;

    app.trace = trace;
    ensureView(structure.view);
    app.view.prepare(trace);
    codePanel.load(trace.program);
    els.codeTitle.textContent = `${algo.name}.py`;
    els.vizTitle.textContent = `${structure.name} · ${algo.summary ? algo.summary(params) : algo.name}`;
    app.lastIndex = 0;
    player.load(trace);
    traceLoaded(trace);
  }

  function render(p) {
    const trace = app.trace;
    const step = p.step;
    if (!trace || !step) return;

    const jump = Math.abs(p.index - app.lastIndex);
    app.lastIndex = p.index;
    const duration = jump === 0 ? 0 : jump > 1 ? 220 : Math.min(480, p.interval * 0.8);

    codePanel.show(step);
    AV.renderState(els.state, trace, step);
    app.view.render(step, { duration });
    if (tab === 'calls' && callTreeTrace === trace) callTree.render(step);

    els.play.innerHTML = p.playing ? '<span aria-hidden="true">❚❚</span> Pause' : '<span aria-hidden="true">▶</span> Play';
    els.play.classList.toggle('is-playing', p.playing);
    els.prev.disabled = p.index === 0;
    els.next.disabled = p.atEnd;
    els.scrub.max = p.length - 1;
    els.scrub.value = p.index;
    els.counter.textContent = `${p.index + 1} / ${p.length}`;
    els.keep.disabled = !(p.atEnd && !trace.error);
  }

  function setSpeed(i) {
    player.setSpeed(SPEEDS[i]);
    els.speedLabel.textContent = `${SPEEDS[i]} steps/s`;
  }

  // ---- "Your code" mode: user Python traced in Pyodide ----
  function enterCustom() {
    app.custom = true;
    els.algo.value = 'custom';
    els.dataWrap.hidden = true;
    els.paramWrap.hidden = true;
    els.exampleWrap.hidden = false;
    els.random.hidden = true;
    els.keep.hidden = true;
    if (!els.editor.value) {
      const saved = store.get();
      if (saved) {
        els.editor.value = saved;
        els.example.value = 'mine';
      } else {
        els.example.value = AV.pythonExamples[0].id;
        els.editor.value = AV.pythonExamples[0].code;
      }
    }
    showEditor(true);
    runCustom();
  }

  function exitCustom() {
    app.custom = false;
    runToken++;
    setBusy(false);
    els.dataWrap.hidden = false;
    els.exampleWrap.hidden = true;
    els.random.hidden = false;
    showEditor(false);
  }

  function showEditor(on) {
    els.editor.hidden = !on;
    els.code.hidden = on && app.custom;
    els.editCode.hidden = !app.custom || on;
    if (app.custom) els.codeTitle.textContent = on ? 'editing · Ctrl+Enter to run' : 'your_code.py';
  }

  function setBusy(busy) {
    els.runBtn.disabled = busy;
    els.runBtn.textContent = busy ? 'Running…' : 'Run';
  }

  let runToken = 0;
  async function runCustom() {
    const code = els.editor.value;
    const token = ++runToken;
    player.pause();
    setBusy(true);
    showMessage(AV.python.ready ? null : 'Loading the Python runtime (one-time download, about 10 MB)…', 'info');
    let trace;
    try {
      trace = await AV.python.trace(code);
    } catch (e) {
      if (token !== runToken) return;
      setBusy(false);
      showMessage(e.message);
      return;
    }
    if (token !== runToken || !app.custom) return;
    setBusy(false);
    showMessage(null);

    const err = trace.pyError;
    if (err) showMessage(`${err.type}${err.line ? ` on line ${err.line}` : ''}: ${err.msg}`);
    else if (trace.truncated) showMessage(`Stopped after ${trace.maxSteps} steps. Showing the first ${trace.maxSteps} (is there an infinite loop?).`, 'info');

    if (!trace.steps.length) {
      showEditor(true);
      if (err && err.line) selectEditorLine(err.line);
      return;
    }
    app.trace = trace;
    ensureView('objects');
    app.view.prepare(trace);
    codePanel.load(trace.program);
    showEditor(false);
    els.vizTitle.textContent = 'Your code · structures detected automatically';
    app.lastIndex = 0;
    player.load(trace);
    traceLoaded(trace);
    if (err) {
      const exc = trace.steps.map((s) => s.kind).lastIndexOf('exception');
      if (exc >= 0) player.seek(exc);
    }
  }

  function selectEditorLine(line) {
    const lines = els.editor.value.split('\n');
    const start = lines.slice(0, line - 1).reduce((n, l) => n + l.length + 1, 0);
    els.editor.focus();
    els.editor.setSelectionRange(start, start + (lines[line - 1] || '').length);
  }

  els.editCode.addEventListener('click', () => {
    player.pause();
    showEditor(true);
    const step = player.step;
    if (step) selectEditorLine(step.line);
    else els.editor.focus();
  });
  els.editor.addEventListener('input', () => {
    store.set(els.editor.value);
    if (els.example.value !== 'mine') setUrl('custom');
    els.example.value = 'mine';
  });
  els.editor.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      runCustom();
    } else if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      els.editor.setRangeText('    ', els.editor.selectionStart, els.editor.selectionEnd, 'end');
      els.editor.dispatchEvent(new Event('input'));
    }
  });
  els.example.addEventListener('change', () => {
    const ex = AV.pythonExamples.find((x) => x.id === els.example.value);
    els.editor.value = ex ? ex.code : store.get() || '';
    setUrl('custom', els.example.value);
    showEditor(true);
    runCustom();
  });

  // ---- events ----
  els.form.addEventListener('submit', (e) => {
    e.preventDefault();
    run();
  });
  els.algo.addEventListener('change', () => selectAlgorithm(els.algo.value));
  els.random.addEventListener('click', () => {
    if (app.structure.random) els.data.value = app.structure.random();
    if (app.algo.param && app.algo.param.random) {
      try {
        els.param.value = app.algo.param.random(app.structure.parse(els.data.value));
      } catch (_) {}
    }
    run();
  });
  els.keep.addEventListener('click', () => {
    if (!app.trace) return;
    els.data.value = app.structure.serialize(app.trace.model);
    if (app.algo.param && app.algo.param.random) els.param.value = app.algo.param.random(app.structure.parse(els.data.value));
    run();
  });

  els.prev.addEventListener('click', () => player.prev());
  els.next.addEventListener('click', () => {
    player.pause();
    player.next();
  });
  els.play.addEventListener('click', () => player.toggle());
  els.reset.addEventListener('click', () => player.reset());
  els.scrub.addEventListener('input', () => {
    const i = Number(els.scrub.value); // read before pause() re-renders the slider
    player.pause();
    player.seek(i);
  });
  els.speed.addEventListener('input', () => setSpeed(Number(els.speed.value)));

  // Clicking a comparison jumps to the step that made it; hovering a node reference highlights it.
  els.state.addEventListener('click', (e) => {
    const li = e.target.closest('[data-step]');
    if (li) {
      player.pause();
      player.seek(Number(li.dataset.step));
    }
  });
  els.state.addEventListener('mouseover', (e) => {
    const r = e.target.closest('[data-ref]');
    if (app.view) app.view.setHover(r ? r.dataset.ref : null);
  });
  els.state.addEventListener('mouseleave', () => app.view && app.view.setHover(null));

  els.tabs.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (b) setTab(b.dataset.tab);
  });

  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, select, textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
    const actions = {
      ArrowRight: () => (player.pause(), player.next()),
      ArrowLeft: () => player.prev(),
      ' ': () => player.toggle(),
      Home: () => player.reset(),
      End: () => (player.pause(), player.seek(player.length - 1)),
      c: () => setTab(tab === 'calls' ? 'structure' : 'calls'),
    };
    if (actions[e.key]) {
      e.preventDefault();
      actions[e.key]();
    }
  });

  // ---- boot ----
  populateAlgorithms();
  els.speed.max = SPEEDS.length - 1;
  els.speed.value = 2;
  setSpeed(2);

  // Deep links: app.html?algo=dijkstra, app.html?algo=custom&example=bfs
  const query = new URLSearchParams(location.search);
  let startId = query.get('algo') || 'bst-insert';
  if (startId !== 'custom' && !AV.findAlgorithm(startId)) startId = 'bst-insert';
  const example = AV.pythonExamples.find((x) => x.id === query.get('example'));
  if (startId === 'custom' && example) {
    els.editor.value = example.code;
    els.example.value = example.id;
  }
  selectAlgorithm(startId);
})();
