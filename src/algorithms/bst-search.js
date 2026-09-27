(function () {
  'use strict';
  const AV = window.AV;
  const { name, focus } = AV.bst;
  const py = AV.py;

  AV.registerAlgorithm({
    id: 'bst-search',
    structure: 'bst',
    name: 'Search',
    blurb: 'Smaller goes left, larger goes right: each comparison throws away a whole subtree.',
    complexity: 'O(h)',
    summary: (p) => `search(root, ${py(p.value)})`,
    param: Object.assign(
      AV.bst.param('Value to find', (values) =>
        Math.random() < 0.75 && values.length ? values[AV.randInt(0, values.length - 1)] : AV.randInt(1, 99)
      ),
      { default: '12' }
    ),
    source: `
      def search(root, value):                          @@def
          if root is None:                              @@isnone
              return None                               @@notfound
          if value == root.value:                       @@eq
              return root                               @@found
          if value < root.value:                        @@lt
              return search(root.left, value)           @@left
          else:
              return search(root.right, value)          @@right

      # caller
      result = search(root, value)                      @@main
    `,

    run(ctx, model, { value }) {
      const persist = ctx.persist;
      persist.path = [];

      const main = ctx.call(
        '<module>',
        { root: model.root, value },
        'main',
        `Start: call search(root, ${py(value)}) to look for ${py(value)} in the tree.`,
        { viz: { probe: { label: 'value', value } } }
      );

      function search(root, slot) {
        if (root) persist.path.push(root.id);
        const f = ctx.call(
          'search',
          { root, value },
          'def',
          root ? `Enter search() with root = ${name(root)}.` : `Enter search() with root = None (an empty child link).`,
          { viz: focus(root, slot, value) }
        );

        const isNone = root === null;
        ctx.step(
          f,
          'isnone',
          isNone
            ? `root is None: we walked off the tree without finding ${py(value)}.`
            : `root is ${name(root)}, not None, so there is a node to examine.`,
          { compare: { expr: 'root is None', evaluated: `${name(root)} is None`, result: isNone }, viz: focus(root, slot, value) }
        );
        if (isNone) {
          return ctx.ret(f, 'notfound', null, `${py(value)} is not in the tree. Return None.`, {
            viz: focus(root, slot, value, { notFound: true }),
          });
        }

        const eq = value === root.value;
        ctx.step(
          f,
          'eq',
          eq
            ? `${py(value)} == ${py(root.value)} is True. This is the node we are looking for!`
            : `${py(value)} == ${py(root.value)} is False, so this is not the node. Decide which side to search next.`,
          {
            compare: { expr: 'value == root.value', evaluated: `${py(value)} == ${py(root.value)}`, result: eq, next: eq ? 'found' : null },
            viz: focus(root, slot, value),
          }
        );
        if (eq) {
          persist.found = root.id;
          return ctx.ret(f, 'found', root, `Return ${name(root)}, the node containing ${py(value)}.`, { viz: focus(root, slot, value) });
        }

        const goLeft = value < root.value;
        const side = goLeft ? 'left' : 'right';
        ctx.step(
          f,
          'lt',
          `${py(value)} < ${py(root.value)} is ${py(goLeft)}. In a BST, smaller values live on the left, so search the ${side} subtree.`,
          {
            compare: { expr: 'value < root.value', evaluated: `${py(value)} < ${py(root.value)}`, result: goLeft, next: `go ${side}` },
            viz: focus(root, slot, value, { nextEdge: { from: root.id, side } }),
          }
        );

        const child = root[side];
        ctx.step(f, side, `Call search(root.${side}, ${py(value)}) on ${name(child)}. Whatever it returns is returned directly.`, {
          viz: focus(root, slot, value, { nextEdge: { from: root.id, side } }),
        });
        const r = search(child, { parent: root.id, side });
        return ctx.ret(f, side, r, `Back in search(${name(root)}). Pass the result (${name(r)}) straight up to the caller.`, {
          viz: focus(root, slot, value),
        });
      }

      const r = search(model.root, { parent: null, side: null });
      main.set('result', r);
      ctx.step(
        main,
        'main',
        r ? `search() returned ${name(r)}: ${py(value)} is in the tree. Done.` : `search() returned None: ${py(value)} is not in the tree. Done.`,
        {}
      );
      return r;
    },
  });
})();
