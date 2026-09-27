/*
 * Execution engine.
 *
 * An algorithm's `run(ctx, model, params)` is real code operating on a real
 * data structure. As it executes it reports to the Tracer (`ctx`):
 *
 *   const f = ctx.call(fn, args, label, text)   -> push a frame, record a CALL step
 *   ctx.step(f, label, text, extra)             -> record a LINE step
 *   return ctx.ret(f, label, value, text)       -> record a RETURN step, pop the frame
 *
 * Every recorded step is an immutable snapshot of the program at that moment:
 * current line, whole call stack with formatted locals, the comparison being
 * evaluated, the return value, a snapshot of the data structure, and
 * visualization hints. The UI renders from these snapshots only, which is what
 * keeps code, state and picture in sync.
 *
 * Step semantics follow Python's tracer: a step fires on a function call, on
 * each executed line, and on a return. A step shows the state *after* the
 * highlighted line takes effect. A line that contains a call produces one step
 * before the call and one after its result has been used.
 */
(function () {
  'use strict';
  const AV = window.AV;

  class Frame {
    constructor(fn, args, depth) {
      this.fn = fn;
      this.depth = depth;
      this.vars = {};
      this.order = [];
      this.line = 0;
      for (const k of Object.keys(args)) this.set(k, args[k]);
    }
    /** Assign a local variable; returns the value so it can be used inline. */
    set(name, value) {
      if (!(name in this.vars)) this.order.push(name);
      this.vars[name] = value;
      return value;
    }
  }

  const clone = (o) => JSON.parse(JSON.stringify(o));

  class Tracer {
    constructor({ program, snapshot, formatValue, maxSteps = 5000 }) {
      this.program = program;
      this.snapshot = snapshot;
      this.formatValue = formatValue;
      this.maxSteps = maxSteps;
      this.stack = [];
      this.steps = [];
      this.comparisons = [];
      /** Visualization hints that stay in effect across steps until changed. */
      this.persist = {};
    }

    get depth() {
      return this.stack.length;
    }

    fmt(v) {
      return (this.formatValue && this.formatValue(v)) || { text: AV.py(v) };
    }

    call(fn, args, label, description, extra = {}) {
      const frame = new Frame(fn, args, this.stack.length);
      frame.signature = `${fn}(${frame.order.map((n) => `${n}=${this.fmt(frame.vars[n]).text}`).join(', ')})`;
      this.stack.push(frame);
      this._record('call', frame, label, description, extra);
      return frame;
    }

    step(frame, label, description, extra = {}) {
      this._record('line', frame, label, description, extra);
    }

    ret(frame, label, value, description, extra = {}) {
      this._record('return', frame, label, description, Object.assign({}, extra, { hasReturn: true, returnValue: value }));
      const top = this.stack.pop();
      if (top !== frame) throw new Error(`Tracer: returned from ${frame.fn}() but ${top && top.fn}() was executing.`);
      return value;
    }

    _record(kind, frame, label, description, extra) {
      if (this.stack[this.stack.length - 1] !== frame) {
        throw new Error(`Tracer: step recorded for ${frame.fn}() while it is not the executing frame.`);
      }
      if (this.steps.length >= this.maxSteps) {
        throw new Error(`Step limit (${this.maxSteps}) reached; the input is too large or the algorithm does not terminate.`);
      }
      const line = this.program.labels[label];
      if (!line) throw new Error(`Tracer: unknown line label "@@${label}".`);
      frame.line = line;

      const index = this.steps.length;
      const compare = extra.compare ? Object.assign({}, extra.compare) : null;
      if (compare) this.comparisons.push(Object.assign({ step: index, line }, compare));

      this.steps.push({
        index,
        kind,
        line,
        label,
        description,
        depth: this.stack.length - 1,
        stack: this.stack.map((f) => ({
          fn: f.fn,
          signature: f.signature,
          line: f.line,
          depth: f.depth,
          vars: f.order.map((name) => Object.assign({ name }, this.fmt(f.vars[name]))),
        })),
        compare,
        returnValue: extra.hasReturn ? this.fmt(extra.returnValue) : null,
        comparisonCount: this.comparisons.length,
        structure: this.snapshot(),
        viz: clone(Object.assign({}, this.persist, extra.viz || {})),
      });
    }
  }

  AV.Tracer = Tracer;

  /**
   * Execute an algorithm against a freshly built model and return its trace.
   * On error the steps recorded so far are kept, so the UI can show where it stopped.
   */
  AV.runAlgorithm = function (algorithm, structure, model, params) {
    const tracer = new Tracer({
      program: algorithm.program,
      snapshot: () => structure.snapshot(model),
      formatValue: structure.formatValue,
    });
    let result;
    let error = null;
    try {
      result = algorithm.run(tracer, model, params);
    } catch (e) {
      error = e;
    }
    return {
      algorithm,
      structure,
      program: algorithm.program,
      steps: tracer.steps,
      comparisons: tracer.comparisons,
      model,
      params,
      result,
      error,
    };
  };
})();
