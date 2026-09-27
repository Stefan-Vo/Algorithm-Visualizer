/* Execution-state panel: explanation, evaluation, variables, return value, call stack, comparisons. */
(function () {
  'use strict';
  const AV = window.AV;
  const esc = AV.escapeHtml;

  const KIND_LABEL = { call: 'CALL', line: 'LINE', return: 'RETURN', exception: 'EXCEPTION' };

  function value(v) {
    const ref = v.ref ? ` data-ref="${esc(v.ref)}"` : '';
    return `<code class="val${v.ref ? ' ref' : ''}"${ref}>${esc(v.text)}</code>`;
  }

  function bool(b) {
    return `<span class="bool ${b ? 'is-true' : 'is-false'}">${b ? 'True' : 'False'}</span>`;
  }

  AV.renderState = function (el, trace, step) {
    const prev = step.index > 0 ? trace.steps[step.index - 1] : null;
    const top = step.stack[step.stack.length - 1];
    const prevTop = prev && prev.stack.length === step.stack.length ? prev.stack[prev.stack.length - 1] : null;
    const prevVars = new Map(prevTop && prevTop.fn === top.fn ? prevTop.vars.map((v) => [v.name, v.text]) : []);
    const lineText = trace.program.lines[step.line - 1].trim();
    const html = [];

    html.push(`
      <section class="card explain">
        <div class="meta">
          <span class="kind kind-${step.kind}">${KIND_LABEL[step.kind]}</span>
          <span>Step <b>${step.index + 1}</b> / ${trace.steps.length}</span>
          <span>line <b>${step.line}</b></span>
          <span>depth <b>${step.depth}</b></span>
        </div>
        <div class="executing"><span class="lbl">${trace.semantics === 'before' && step.kind === 'line' ? 'Next line' : 'Executing'}</span><code>${AV.highlightPython(lineText)}</code></div>
        <p class="desc">${esc(step.description)}</p>
      </section>`);

    if (step.compare) {
      const c = step.compare;
      html.push(`
        <section class="card eval">
          <h3>Evaluation</h3>
          <div class="chain">
            <code>${esc(c.expr)}</code><span class="arr">→</span>
            <code>${esc(c.evaluated)}</code><span class="arr">→</span>${bool(c.result)}
          </div>
          ${c.next ? `<div class="next">Next: <b>${esc(c.next)}</b></div>` : ''}
        </section>`);
    }

    if (step.returnValue) {
      html.push(`
        <section class="card ret">
          <h3>Return value</h3>
          <div><code>${esc(top.fn)}()</code> returns ${value(step.returnValue)}</div>
        </section>`);
    }

    const rows = top.vars
      .map((v) => {
        const changed = prevVars.size && prevVars.get(v.name) !== v.text;
        return `<tr class="${changed ? 'changed' : ''}"><th>${esc(v.name)}</th><td>${value(v)}</td></tr>`;
      })
      .join('');
    html.push(`
      <section class="card vars">
        <h3>Variables <small>in ${esc(top.fn)}${top.fn === '<module>' ? '' : '()'}</small></h3>
        <table>${rows || '<tr><td class="muted">none</td></tr>'}</table>
      </section>`);

    const frames = step.stack
      .map((f, i) => ({ f, i }))
      .reverse()
      .map(
        ({ f, i }) => `
        <li class="${i === step.stack.length - 1 ? 'active' : ''}">
          <span class="depth">${f.depth}</span>
          <code>${esc(f.fn === '<module>' ? '<module>' : f.signature)}</code>
          <span class="at">line ${f.line}</span>
        </li>`
      )
      .join('');
    html.push(`
      <section class="card stack">
        <h3>Call stack <small>recursion depth ${step.depth}</small></h3>
        <ol>${frames}</ol>
      </section>`);

    const log = trace.comparisons.slice(0, step.comparisonCount);
    const items = log
      .map(
        (c) => `
        <li data-step="${c.step}" class="${c.step === step.index ? 'active' : ''}" title="Jump to step ${c.step + 1}">
          <span class="n">#${c.step + 1}</span><code>${esc(c.evaluated)}</code>${bool(c.result)}
        </li>`
      )
      .join('');
    html.push(`
      <section class="card log">
        <h3>Comparisons <small>${log.length} so far</small></h3>
        <ol>${items || '<li class="muted">none yet</li>'}</ol>
      </section>`);

    if (trace.output !== undefined) {
      const out = trace.output.slice(0, step.outLen);
      html.push(`
      <section class="card output">
        <h3>Output <small>print()</small></h3>
        <pre>${out ? esc(out) : '<span class="muted">nothing printed yet</span>'}</pre>
      </section>`);
    }

    el.innerHTML = html.join('');
    const pre = el.querySelector('.output pre');
    if (pre) pre.scrollTop = pre.scrollHeight;
    const list = el.querySelector('.log ol');
    if (list) list.scrollTop = list.scrollHeight;
  };
})();
