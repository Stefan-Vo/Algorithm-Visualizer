/* Linked list (reverse, delete) and pure recursion (Fibonacci naive vs memoized). */
(function () {
  'use strict';
  const AV = window.AV;
  const py = AV.py;
  const nm = (n) => (n ? `ListNode(${py(n.val)})` : 'None');

  // ---------------------------------------------------------------- reverse
  AV.registerAlgorithm({
    id: 'list-reverse',
    structure: 'linked-list',
    name: 'Reverse',
    blurb: 'Walk the list once, turning each .next arrow around. Three pointers: prev, curr, nxt.',
    complexity: 'O(n)',
    summary: () => 'reverse(head)',
    source: `
      def reverse(head):                                @@def
          prev = None                                   @@prev
          curr = head                                   @@curr
          while curr is not None:                       @@while
              nxt = curr.next                           @@nxt
              curr.next = prev                          @@link
              prev = curr                               @@adv1
              curr = nxt                                @@adv2
          return prev                                   @@ret

      # caller
      head = reverse(head)                              @@main
    `,
    run(ctx, model) {
      const main = ctx.call('<module>', { head: model.head }, 'main', 'Start: reverse the list in place.');
      const f = ctx.call('reverse', { head: model.head }, 'def', 'Enter reverse().');
      let prev = f.set('prev', null);
      ctx.step(f, 'prev', 'prev = None: the reversed part is empty so far.');
      let curr = f.set('curr', model.head);
      ctx.step(f, 'curr', `curr = ${nm(curr)}: start at the head.`);
      for (;;) {
        const more = curr !== null;
        ctx.step(f, 'while', more ? `curr is ${nm(curr)}, so there is still a node to flip.` : 'curr is None: every arrow has been flipped.', {
          compare: { expr: 'curr is not None', evaluated: `${nm(curr)} is not None`, result: more },
          viz: { at: curr && curr.id },
        });
        if (!more) break;
        const nxt = f.set('nxt', curr.next);
        ctx.step(f, 'nxt', `Remember the rest of the list: nxt = ${nm(nxt)}. Otherwise it would be lost after the next line.`, { viz: {} });
        curr.next = prev;
        ctx.step(f, 'link', `Flip the arrow: ${nm(curr)}.next now points to ${nm(prev)}.`, { viz: { link: curr.id } });
        prev = f.set('prev', curr);
        ctx.step(f, 'adv1', `prev moves forward to ${nm(prev)}.`);
        curr = f.set('curr', nxt);
        ctx.step(f, 'adv2', `curr moves forward to ${nm(curr)}.`);
      }
      ctx.ret(f, 'ret', prev, `Return ${nm(prev)}, the new head.`);
      model.head = prev;
      main.set('head', prev);
      ctx.step(main, 'main', `Done. head is now ${nm(prev)}; the list reads ${model.all.length ? listText(prev) : '(empty)'}.`);
      return prev;
    },
  });

  function listText(head) {
    const out = [];
    for (let n = head, g = 0; n && g < 50; n = n.next, g++) out.push(py(n.val));
    return out.join(' → ') + ' → None';
  }

  // ---------------------------------------------------------------- delete
  AV.registerAlgorithm({
    id: 'list-delete',
    structure: 'linked-list',
    name: 'Delete value',
    blurb: 'A dummy node before the head means deleting the first node needs no special case.',
    complexity: 'O(n)',
    summary: (p) => `delete(head, ${py(p.value)})`,
    param: { name: 'value', label: 'Value to delete', default: '3', random: (values) => values[AV.randInt(0, values.length - 1)] },
    source: `
      def delete(head, value):                          @@def
          dummy = ListNode(0, head)                     @@dummy
          prev = dummy                                  @@prev
          while prev.next is not None:                  @@while
              if prev.next.val == value:                @@cmp
                  prev.next = prev.next.next            @@unlink
                  break                                 @@break
              prev = prev.next                          @@adv
          return dummy.next                             @@ret

      # caller
      head = delete(head, value)                        @@main
    `,
    run(ctx, model, { value }) {
      const main = ctx.call('<module>', { head: model.head, value }, 'main', `Start: delete the first ${py(value)} from the list.`);
      const f = ctx.call('delete', { head: model.head, value }, 'def', 'Enter delete().');
      const dummy = new AV.ListNode(0, model.head);
      dummy.order = -1; // draw the dummy in front of the head
      model.all.unshift(dummy);
      f.set('dummy', dummy);
      ctx.step(f, 'dummy', 'Create a dummy node that points at the head, so every real node has a node before it.');
      let prev = f.set('prev', dummy);
      ctx.step(f, 'prev', 'prev starts at the dummy.');
      let removed = null;
      for (;;) {
        const more = prev.next !== null;
        ctx.step(f, 'while', more ? `prev.next is ${nm(prev.next)}.` : 'prev.next is None: we reached the end without finding the value.', {
          compare: { expr: 'prev.next is not None', evaluated: `${nm(prev.next)} is not None`, result: more },
          viz: { at: prev.id },
        });
        if (!more) break;
        const hit = prev.next.val === value;
        ctx.step(f, 'cmp', hit ? `Found it: prev.next holds ${py(value)}.` : `${py(prev.next.val)} is not ${py(value)}.`, {
          compare: { expr: 'prev.next.val == value', evaluated: `${py(prev.next.val)} == ${py(value)}`, result: hit, next: hit ? 'unlink it' : 'move on' },
          viz: { at: prev.next.id, removing: hit ? prev.next.id : undefined },
        });
        if (hit) {
          removed = prev.next;
          prev.next = prev.next.next;
          ctx.step(f, 'unlink', `Skip over it: prev.next = ${nm(prev.next)}. Nothing points to ${nm(removed)} any more.`, { viz: { removing: removed.id, link: prev.id } });
          removed.detached = true; // unreachable: Python would garbage-collect it
          ctx.step(f, 'break', 'Stop looking.');
          break;
        }
        prev = f.set('prev', prev.next);
        ctx.step(f, 'adv', `prev moves to ${nm(prev)}.`);
      }
      ctx.ret(f, 'ret', dummy.next, `Return dummy.next = ${nm(dummy.next)}, the (possibly new) head.`);
      model.head = dummy.next;
      dummy.detached = true;
      main.set('head', model.head);
      ctx.step(main, 'main', removed ? `Done. ${py(value)} was removed; the list reads ${listText(model.head)}.` : `Done. ${py(value)} was not in the list.`);
      return model.head;
    },
  });

  // ---------------------------------------------------------------- Fibonacci
  const nParam = (max, def) => ({
    name: 'n',
    label: `n (0–${max})`,
    default: String(def),
    parse(text) {
      const n = AV.parseNumber(text, 'n');
      if (!Number.isInteger(n) || n < 0 || n > max) throw new Error(`n must be a whole number from 0 to ${max}.`);
      return n;
    },
    random: () => AV.randInt(3, max),
  });

  AV.registerAlgorithm({
    id: 'fib-naive',
    structure: 'recursion',
    name: 'Fibonacci (naive)',
    blurb: 'Two recursive calls per level. The call tree shows the same subproblems being solved again and again.',
    complexity: 'O(2ⁿ)',
    summary: (p) => `fib(${p.n})`,
    param: nParam(8, 5),
    source: `
      def fib(n):                                       @@def
          if n <= 1:                                    @@base
              return n                                  @@retbase
          return fib(n - 1) + fib(n - 2)                @@rec

      # caller
      result = fib(n)                                   @@main
    `,
    run(ctx, model, { n }) {
      const main = ctx.call('<module>', { n }, 'main', `Start: compute fib(${n}) recursively.`);
      function fib(k) {
        const f = ctx.call('fib', { n: k }, 'def', `Enter fib(${k}).`);
        const base = k <= 1;
        ctx.step(f, 'base', base ? `${k} <= 1: base case.` : `${k} > 1: split into fib(${k - 1}) + fib(${k - 2}).`, {
          compare: { expr: 'n <= 1', evaluated: `${k} <= 1`, result: base },
        });
        if (base) return ctx.ret(f, 'retbase', k, `fib(${k}) = ${k}.`);
        ctx.step(f, 'rec', `First compute fib(${k - 1}).`);
        const a = fib(k - 1);
        ctx.step(f, 'rec', `fib(${k - 1}) returned ${a}. Now compute fib(${k - 2}).`);
        const b = fib(k - 2);
        return ctx.ret(f, 'rec', a + b, `fib(${k}) = ${a} + ${b} = ${a + b}.`);
      }
      const r = fib(n);
      main.set('result', r);
      ctx.step(main, 'main', `Done. fib(${n}) = ${r}.`);
      return r;
    },
  });

  AV.registerAlgorithm({
    id: 'fib-memo',
    structure: 'recursion',
    name: 'Fibonacci (memoized)',
    blurb: 'Same recursion, but each answer is saved in a dict. Compare its call tree with the naive version.',
    complexity: 'O(n)',
    summary: (p) => `fib(${p.n}, memo)`,
    param: nParam(20, 6),
    source: `
      def fib(n, memo):                                 @@def
          if n in memo:                                 @@hit
              return memo[n]                            @@rethit
          if n <= 1:                                    @@base
              return n                                  @@retbase
          memo[n] = fib(n - 1, memo) + fib(n - 2, memo) @@rec
          return memo[n]                                @@ret

      # caller
      memo = {}                                         @@init
      result = fib(n, memo)                             @@main
    `,
    run(ctx, model, { n }) {
      const memo = new Map();
      const main = ctx.call('<module>', { n }, 'init', `Start: compute fib(${n}) with memoization.`);
      main.set('memo', memo);
      ctx.step(main, 'init', 'memo = {}: answers will be cached here.');
      ctx.step(main, 'main', `Call fib(${n}, memo).`);
      let calls = 0;
      function fib(k) {
        calls++;
        const f = ctx.call('fib', { n: k, memo }, 'def', `Enter fib(${k}).`);
        const hit = memo.has(k);
        ctx.step(f, 'hit', hit ? `fib(${k}) is already in memo: no recursion needed!` : `fib(${k}) is not cached yet.`, {
          compare: { expr: 'n in memo', evaluated: `${k} in ${py(memo)}`, result: hit },
        });
        if (hit) return ctx.ret(f, 'rethit', memo.get(k), `Return the cached value ${memo.get(k)}.`);
        const base = k <= 1;
        ctx.step(f, 'base', base ? `${k} <= 1: base case.` : `${k} > 1: recurse.`, { compare: { expr: 'n <= 1', evaluated: `${k} <= 1`, result: base } });
        if (base) return ctx.ret(f, 'retbase', k, `fib(${k}) = ${k}.`);
        ctx.step(f, 'rec', `Compute fib(${k - 1}) first.`);
        const a = fib(k - 1);
        ctx.step(f, 'rec', `fib(${k - 1}) returned ${a}. Now fib(${k - 2}); it will already be cached.`);
        const b = fib(k - 2);
        memo.set(k, a + b);
        ctx.step(f, 'rec', `Store memo[${k}] = ${a} + ${b} = ${a + b}.`);
        return ctx.ret(f, 'ret', a + b, `Return ${a + b}.`);
      }
      const r = fib(n);
      main.set('result', r);
      ctx.step(main, 'main', `Done. fib(${n}) = ${r} using only ${calls} calls; the naive version grows exponentially.`);
      return r;
    },
  });
})();
