/* Shared animation helpers for views: keyed position tweening. */
(function () {
  'use strict';
  const AV = window.AV;

  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  AV.animate = function (duration, onFrame) {
    let start = null;
    let raf = 0;
    let cancelled = false;
    const tick = (now) => {
      if (cancelled) return;
      if (start === null) start = now;
      const t = Math.min(1, (now - start) / duration);
      onFrame(ease(t));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  };

  /**
   * Move every key in `pos` towards its entry in `targets`, calling draw() each
   * frame. New keys appear at their target. Keys missing from targets are dropped.
   * Returns a cancel function. Interrupted tweens resume from where they were.
   */
  AV.tweenPositions = function (pos, targets, duration, draw) {
    const from = new Map();
    for (const [k, t] of targets) from.set(k, pos.get(k) || t);
    for (const k of [...pos.keys()]) if (!targets.has(k)) pos.delete(k);
    const apply = (e) => {
      for (const [k, t] of targets) {
        const f = from.get(k);
        pos.set(k, { x: f.x + (t.x - f.x) * e, y: f.y + (t.y - f.y) * e });
      }
      draw();
    };
    if (!(duration > 0)) {
      apply(1);
      return () => {};
    }
    apply(0);
    return AV.animate(duration, apply);
  };

  const NS = 'http://www.w3.org/2000/svg';
  AV.svg = function (tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  };

  /** A rounded label (rect + text) centred or anchored on its group origin. */
  AV.svgLabel = function (parent, text, cls, { align = 'center', charW = 6.9, padX = 7, h = 18 } = {}) {
    const g = AV.svg('g', { class: cls }, parent);
    const w = text.length * charW + padX * 2;
    const x = align === 'center' ? -w / 2 : align === 'right' ? -w : 0;
    AV.svg('rect', { x, y: -h / 2, width: w, height: h, rx: h / 2 }, g);
    const t = AV.svg('text', { x: x + w / 2, y: 0.5 }, g);
    t.textContent = text;
    return g;
  };

  AV.escapeHtml = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
})();
