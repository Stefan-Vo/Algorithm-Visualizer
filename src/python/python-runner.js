/*
 * Trace provider for user Python code: runs it in Pyodide (CPython compiled to
 * WebAssembly, loaded from the CDN on first use) and converts the tracer's
 * output into the same Step format the built-in algorithms produce, so the
 * player, code panel and state panel work unchanged.
 */
(function () {
  'use strict';
  const AV = window.AV;

  const PYODIDE_URL = 'https://cdn.jsdelivr.net/pyodide/v0.27.2/full/';
  const MAX_STEPS = 3000;
  let loading = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Could not load the Python runtime. Check your internet connection.'));
      document.head.appendChild(s);
    });
  }

  AV.python = {
    get ready() {
      return !!this._py;
    },

    load() {
      if (!loading) {
        loading = (async () => {
          if (!window.loadPyodide) await loadScript(PYODIDE_URL + 'pyodide.js');
          const py = await window.loadPyodide({ indexURL: PYODIDE_URL });
          py.runPython(AV.PY_TRACER_SOURCE);
          this._py = py;
          return py;
        })();
        loading.catch(() => {
          loading = null;
        });
      }
      return loading;
    },

    async trace(code) {
      const py = await this.load();
      const fn = py.globals.get('run_json');
      let json;
      try {
        json = fn(code, MAX_STEPS);
      } finally {
        fn.destroy();
      }
      return AV.buildPythonTrace(code, JSON.parse(json));
    },
  };

  /** A pseudo-algorithm so the rest of the UI can treat user code like any other algorithm. */
  AV.CUSTOM_ALGORITHM = { id: 'custom', name: 'Your code', structure: 'python', summary: () => 'your code' };

  AV.buildPythonTrace = function (code, res) {
    const lines = code.replace(/\r\n/g, '\n').split('\n');
    const comparisons = [];
    const steps = res.steps.map((s, index) => {
      const compare = s.compare || null;
      if (compare) comparisons.push(Object.assign({ step: index, line: s.line }, compare));
      return {
        index,
        kind: s.kind,
        line: s.line,
        description: s.desc,
        depth: s.stack.length - 1,
        stack: s.stack.map((f, depth) => ({ fn: f.fn, signature: f.sig, line: f.line, depth, vars: f.vars })),
        compare,
        returnValue: s.ret || null,
        comparisonCount: comparisons.length,
        structure: { heap: s.heap },
        viz: {},
        outLen: s.out,
      };
    });
    return {
      algorithm: AV.CUSTOM_ALGORITHM,
      structure: { id: 'python', name: 'Your code', view: 'objects' },
      program: { lines, labels: {} },
      steps,
      comparisons,
      output: res.output,
      truncated: res.truncated,
      maxSteps: MAX_STEPS,
      pyError: res.error,
      error: null,
      model: null,
      semantics: 'before',
    };
  };
})();
