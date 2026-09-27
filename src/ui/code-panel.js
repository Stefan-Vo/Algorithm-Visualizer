/* Source code panel: syntax highlighting, current line, paused caller lines. */
(function () {
  'use strict';
  const AV = window.AV;
  const esc = AV.escapeHtml;

  const KEYWORDS = new Set(
    'def return if elif else while for in not is and or break continue class pass lambda None True False'.split(' ')
  );
  const BUILTINS = new Set(['len', 'range', 'print', 'min', 'max', 'abs']);

  function highlight(line) {
    const re = /(#.*$)|('[^']*'|"[^"]*")|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)|(\s+)|(.)/g;
    let out = '';
    let prevWord = '';
    let m;
    while ((m = re.exec(line))) {
      if (m[1]) out += `<span class="tk-com">${esc(m[1])}</span>`;
      else if (m[2]) out += `<span class="tk-str">${esc(m[2])}</span>`;
      else if (m[3]) out += `<span class="tk-num">${m[3]}</span>`;
      else if (m[4]) {
        const w = m[4];
        let cls = '';
        if (KEYWORDS.has(w)) cls = 'tk-kw';
        else if (prevWord === 'def') cls = 'tk-def';
        else if (BUILTINS.has(w)) cls = 'tk-builtin';
        else if (line[re.lastIndex] === '(') cls = 'tk-call';
        out += cls ? `<span class="${cls}">${w}</span>` : w;
        prevWord = w;
        continue;
      } else out += esc(m[0]);
      if (!m[5]) prevWord = '';
    }
    return out;
  }

  class CodePanel {
    constructor(el) {
      this.el = el;
      this.lineEls = [];
    }

    load(program) {
      this.el.innerHTML = program.lines
        .map(
          (text, i) =>
            `<div class="code-line" data-line="${i + 1}"><span class="ln">${i + 1}</span><span class="gutter"></span><span class="src">${highlight(text) || ' '}</span></div>`
        )
        .join('');
      this.lineEls = [...this.el.querySelectorAll('.code-line')];
    }

    show(step) {
      for (const l of this.lineEls) {
        l.className = 'code-line';
        l.querySelector('.gutter').textContent = '';
        l.removeAttribute('title');
      }
      if (!step) return;

      // Lines where outer frames are paused, waiting on a call to return.
      const waiting = new Map();
      for (const f of step.stack.slice(0, -1)) waiting.set(f.line, (waiting.get(f.line) || 0) + 1);
      for (const [line, count] of waiting) {
        const l = this.lineEls[line - 1];
        if (!l) continue;
        l.classList.add('caller');
        l.querySelector('.gutter').textContent = count > 1 ? `×${count}` : '↳';
        l.title = `${count} paused call${count > 1 ? 's' : ''} waiting here for a return value`;
      }

      const cur = this.lineEls[step.line - 1];
      if (cur) {
        cur.className = `code-line current kind-${step.kind}`;
        cur.querySelector('.gutter').textContent = '▶';
        cur.removeAttribute('title');
        // Scroll only the code box (scrollIntoView would also scroll the page).
        const box = this.el.getBoundingClientRect();
        const r = cur.getBoundingClientRect();
        if (r.top < box.top || r.bottom > box.bottom) {
          this.el.scrollTo({ top: this.el.scrollTop + (r.top - box.top) - box.height / 2 + r.height / 2, behavior: 'smooth' });
        }
      }
    }
  }

  AV.CodePanel = CodePanel;
  AV.highlightPython = highlight;
})();
