/* Home page: live hero demo, stats, a real recorded step, and the algorithm catalog (all from the registry). */
(function () {
  'use strict';
  const AV = window.AV;
  const $ = (s) => document.querySelector(s);
  const esc = AV.escapeHtml;

  // ---- stats, straight from the registry ----
  const structures = new Set(AV.algorithms.map((a) => a.structure));
  $('#stats').innerHTML = [
    [AV.algorithms.length, 'built-in algorithms'],
    [structures.size, 'data structures'],
    [AV.pythonExamples.length, 'Python examples'],
  ]
    .map(([n, t]) => `<li><b>${n}</b> ${t}</li>`)
    .join('');

  // ---- live demo: the real engine running BST insert ----
  const algo = AV.findAlgorithm('bst-insert');
  const bst = AV.structures.get('bst');
  const trace = AV.runAlgorithm(algo, bst, bst.build([10, 5, 15, 3, 7, 12, 20]), { value: 6 });
  const code = new AV.CodePanel($('#demo-code'));
  code.load(trace.program);
  const view = AV.views.get('tree').create($('#demo-viz'));
  view.prepare(trace);
  let last = 0;
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let autoplay = !reduced;
  let visible = true;
  const player = new AV.Player((p) => {
    const step = p.step;
    code.show(step);
    view.render(step, { duration: reduced || Math.abs(p.index - last) !== 1 ? 0 : 420 });
    last = p.index;
    $('#demo-kind').textContent = step.kind.toUpperCase();
    $('#demo-kind').className = `kind kind-${step.kind}`;
    $('#demo-step').textContent = `Step ${step.index + 1} / ${trace.steps.length}`;
    const c = step.compare;
    $('#demo-eval').innerHTML = c ? `<code>${esc(c.evaluated)}</code> → <span class="bool ${c.result ? 'is-true' : 'is-false'}">${c.result ? 'True' : 'False'}</span>` : '';
    $('#demo-desc').textContent = step.description;
    // Loop: hold the final frame, then start over.
    if (p.atEnd && autoplay) setTimeout(() => autoplay && visible && (player.seek(0), player.play()), 2600);
  });
  player.setSpeed(1.4);
  player.load(trace);

  const toggle = $('#demo-toggle');
  const setToggle = () => {
    toggle.textContent = autoplay ? '❚❚' : '▶';
    toggle.setAttribute('aria-label', autoplay ? 'Pause demo' : 'Play demo');
  };
  toggle.addEventListener('click', () => {
    autoplay = !autoplay;
    autoplay ? player.play() : player.pause();
    setToggle();
  });
  setToggle();
  if (autoplay) player.play();
  else player.seek(trace.steps.findIndex((s) => s.compare && s.compare.expr === 'value < root.value'));
  // Only animate while the demo is on screen.
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      if (!visible) player.pause();
      else if (autoplay && !player.playing) player.play();
    }).observe($('#demo'));
  }

  // ---- a real recorded step, rendered as a card ----
  const s = trace.steps.find((x) => x.compare && x.compare.evaluated === '6 < 10');
  const top = s.stack[s.stack.length - 1];
  $('#step-card').innerHTML = `
    <div class="sc-row sc-head"><span class="kind kind-${s.kind}">${s.kind.toUpperCase()}</span><span>Step <b>${s.index + 1}</b></span><span>line <b>${s.line}</b></span><span>depth <b>${s.depth}</b></span></div>
    <div class="sc-row"><span class="sc-k">Executing</span><code class="sc-line">${AV.highlightPython(trace.program.lines[s.line - 1].trim())}</code></div>
    <div class="sc-row"><span class="sc-k">Variables</span><span>${top.vars.map((v) => `<code>${esc(v.name)} = ${esc(v.text)}</code>`).join(' ')}</span></div>
    <div class="sc-row"><span class="sc-k">Evaluates</span><span><code>${esc(s.compare.expr)}</code> → <code>${esc(s.compare.evaluated)}</code> → <span class="bool ${s.compare.result ? 'is-true' : 'is-false'}">${s.compare.result ? 'True' : 'False'}</span></span></div>
    <div class="sc-row"><span class="sc-k">Next</span><b class="sc-next">${esc(s.compare.next)}</b></div>
    <div class="sc-row"><span class="sc-k">Call stack</span><span>${s.stack.map((f) => `<code>${esc(f.fn === '<module>' ? '<module>' : f.signature)}</code>`).join(' <span class="muted">→</span> ')}</span></div>`;

  // ---- catalog ----
  const ICONS = {
    bst: '<circle cx="12" cy="5" r="2.6"/><circle cx="6" cy="18" r="2.6"/><circle cx="18" cy="18" r="2.6"/><path d="M10.5 7.2 7.3 15.7M13.5 7.2 16.7 15.7"/>',
    array: '<rect x="2" y="8" width="5" height="8" rx="1"/><rect x="9.5" y="8" width="5" height="8" rx="1"/><rect x="17" y="8" width="5" height="8" rx="1"/>',
    graph: '<circle cx="5" cy="6" r="2.4"/><circle cx="19" cy="7" r="2.4"/><circle cx="12" cy="18" r="2.4"/><path d="M7.3 6.3l9.4.5M6.2 8.2l4.6 7.6M17.8 9.1l-4.6 7"/>',
    heap: '<circle cx="12" cy="4.5" r="2.3"/><circle cx="7" cy="12" r="2.3"/><circle cx="17" cy="12" r="2.3"/><rect x="3" y="18" width="18" height="4" rx="1"/><path d="M10.7 6.4 8.3 10M13.3 6.4l2.4 3.6"/>',
    'linked-list': '<rect x="1.5" y="9" width="5.5" height="6" rx="1"/><rect x="9.25" y="9" width="5.5" height="6" rx="1"/><rect x="17" y="9" width="5.5" height="6" rx="1"/><path d="M7 12h2.2M14.8 12H17"/>',
    recursion: '<rect x="9" y="2" width="6" height="4" rx="1"/><rect x="3" y="11" width="6" height="4" rx="1"/><rect x="15" y="11" width="6" height="4" rx="1"/><path d="M12 6v2.5H6V11M12 8.5h6V11"/><path d="M6 15v3M18 15v3" stroke-dasharray="1.5 1.5"/>',
    python: '<path d="M8 7 3 12l5 5M16 7l5 5-5 5"/>',
  };
  const groups = new Map();
  for (const a of AV.algorithms) {
    if (!groups.has(a.structure)) groups.set(a.structure, []);
    groups.get(a.structure).push(a);
  }
  const card = (href, icon, tag, name, blurb, cx) => `
    <a class="algo-card" href="${href}">
      <span class="algo-top"><span class="algo-icon"><svg viewBox="0 0 24 24">${icon}</svg></span>${tag ? `<span class="algo-tag">${esc(tag)}</span>` : ''}${cx ? `<span class="algo-cx">${esc(cx)}</span>` : ''}</span>
      <h3>${esc(name)}</h3>
      <p>${esc(blurb || '')}</p>
      <span class="algo-go">Visualize <span aria-hidden="true">→</span></span>
    </a>`;
  let html = '';
  for (const [sid, algos] of groups) {
    const st = AV.structures.get(sid);
    html += `<div class="cat-group"><h3 class="cat-title">${esc(st.name)}</h3><div class="cat-cards">${algos
      .map((a) => card(`app.html?algo=${encodeURIComponent(a.id)}`, ICONS[sid] || ICONS.array, '', a.name, a.blurb, a.complexity))
      .join('')}</div></div>`;
  }
  html += `<div class="cat-group"><h3 class="cat-title">Your code (Python)</h3><div class="cat-cards">${AV.pythonExamples
    .map((ex) => card(`app.html?algo=custom&example=${encodeURIComponent(ex.id)}`, ICONS.python, '', ex.name, 'Runs as real Python in your browser. Edit it and run it again.', ''))
    .join('')}</div></div>`;
  $('#catalog').innerHTML = html;

  // ---- "bring your own code" sample ----
  const ex = AV.pythonExamples.find((x) => x.id === 'linked-list');
  $('#byo-code').innerHTML = ex.code
    .trimEnd()
    .split('\n')
    .map((l, i) => `<div class="code-line"><span class="ln">${i + 1}</span><span class="gutter"></span><span class="src">${AV.highlightPython(l) || ' '}</span></div>`)
    .join('');
})();
