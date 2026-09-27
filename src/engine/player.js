/* Playback controller: moves an index through a recorded trace. */
(function () {
  'use strict';
  const AV = window.AV;

  class Player {
    constructor(onChange) {
      this.onChange = onChange;
      this.trace = null;
      this.index = 0;
      this.playing = false;
      this.speed = 2; // steps per second
      this.timer = null;
    }

    get length() {
      return this.trace ? this.trace.steps.length : 0;
    }
    get step() {
      return this.trace ? this.trace.steps[this.index] : null;
    }
    get atEnd() {
      return this.index >= this.length - 1;
    }
    get interval() {
      return 1000 / this.speed;
    }

    load(trace) {
      this._stop();
      this.trace = trace;
      this.index = 0;
      this._emit();
    }

    seek(i) {
      if (!this.length) return;
      this.index = Math.max(0, Math.min(this.length - 1, i));
      if (this.atEnd) this._stop();
      this._emit();
    }

    next() {
      this.seek(this.index + 1);
    }
    prev() {
      this._stop();
      this.seek(this.index - 1);
    }
    reset() {
      this._stop();
      this.seek(0);
    }

    play() {
      if (!this.length) return;
      if (this.atEnd) this.index = 0;
      this.playing = true;
      this._schedule();
      this._emit();
    }
    pause() {
      if (!this.playing) return;
      this._stop();
      this._emit();
    }
    toggle() {
      this.playing ? this.pause() : this.play();
    }

    setSpeed(stepsPerSecond) {
      this.speed = stepsPerSecond;
      if (this.playing) this._schedule();
    }

    _schedule() {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        if (!this.playing) return;
        this.next();
        if (this.playing) this._schedule();
      }, this.interval);
    }
    _stop() {
      this.playing = false;
      clearTimeout(this.timer);
    }
    _emit() {
      this.onChange(this);
    }
  }

  AV.Player = Player;
})();
