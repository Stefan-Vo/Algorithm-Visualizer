(function () {
  'use strict';
  const AV = window.AV;
  const { name, focus } = AV.bst;
  const py = AV.py;

  AV.registerAlgorithm({
    id: 'bst-insert',
    structure: 'bst',
    name: 'Insert',
    blurb: 'Walk down comparing with each node until an empty link is found, then attach the new node there.',
    complexity: 'O(h)',
    summary: (p) => `insert(root, ${py(p.value)})`,
    param: AV.bst.param('Value to insert', (values) => {
      let v;
      do v = AV.randInt(1, 99);
      while (values.includes(v));
      return v;
    }),
    source: `
      # Node has .value, .left and .right
      def insert(root, value):                          @@def
          if root is None:                              @@isnone
              return Node(value)                        @@new

          if value < root.value:                        @@cmp
              root.left = insert(root.left, value)      @@left
          else:
              root.right = insert(root.right, value)    @@right

          return root                                   @@ret

      # caller
      root = insert(root, value)                        @@main
    `,

    run(ctx, model, { value }) {
      const persist = ctx.persist;
      persist.path = [];
      let createdId = null;

      const main = ctx.call(
        '<module>',
        { root: model.root, value },
        'main',
        `Start: call insert(root, ${py(value)}) on ${model.root ? `the tree rooted at ${model.root.value}` : 'an empty tree'}.`,
        { viz: { probe: { label: 'value', value } } }
      );

      function insert(root, slot) {
        if (root) persist.path.push(root.id);
        const f = ctx.call(
          'insert',
          { root, value },
          'def',
          root
            ? `Enter insert() with root = ${name(root)}. We need to decide which side of ${root.value} the value ${py(value)} belongs on.`
            : `Enter insert() with root = None. This call was made on an empty child link.`,
          { viz: focus(root, slot, value) }
        );

        const isNone = root === null;
        ctx.step(
          f,
          'isnone',
          isNone
            ? `root is None, so there is no node here. This empty spot is where ${py(value)} belongs.`
            : `root is ${name(root)}, not None, so keep looking for an empty spot below it.`,
          {
            compare: { expr: 'root is None', evaluated: `${name(root)} is None`, result: isNone },
            viz: focus(root, slot, value),
          }
        );

        if (isNone) {
          const node = new AV.TreeNode(value);
          createdId = node.id;
          persist.detached = { id: node.id, value, parent: slot.parent, side: slot.side };
          return ctx.ret(
            f,
            'new',
            node,
            `Create ${name(node)} and return it. It is not linked into the tree yet; the caller will attach it.`,
            { viz: { current: node.id, created: node.id, probe: { label: 'value', value } } }
          );
        }

        const goLeft = value < root.value;
        const side = goLeft ? 'left' : 'right';
        ctx.step(
          f,
          'cmp',
          `Compare the value being inserted with the current node: ${py(value)} < ${py(root.value)} is ${py(goLeft)}, so ${py(value)} belongs in the ${side} subtree of ${root.value}.`,
          {
            compare: { expr: 'value < root.value', evaluated: `${py(value)} < ${py(root.value)}`, result: goLeft, next: `go ${side}` },
            viz: focus(root, slot, value, { nextEdge: { from: root.id, side } }),
          }
        );

        const child = root[side];
        ctx.step(
          f,
          side,
          `Recursive call on root.${side} (${name(child)}). This call to insert() is paused until the recursive call returns.`,
          { viz: focus(root, slot, value, { nextEdge: { from: root.id, side } }) }
        );

        const sub = insert(child, { parent: root.id, side });
        root[side] = sub; // the real assignment
        const attached = persist.detached && persist.detached.id === sub.id;
        if (attached) persist.detached = null;
        ctx.step(
          f,
          side,
          attached
            ? `Back in insert(${name(root)}). The call returned the new node, so assign it to root.${side}. ${py(value)} is now linked into the tree.`
            : `Back in insert(${name(root)}). The call returned ${name(sub)}, the same child as before, so root.${side} is unchanged.`,
          { viz: focus(root, slot, value, attached ? { created: sub.id } : {}) }
        );

        return ctx.ret(
          f,
          'ret',
          root,
          `Return ${name(root)} (this subtree's root) to the caller, which re-assigns it to the link it came from.`,
          { viz: focus(root, slot, value) }
        );
      }

      const newRoot = insert(model.root, { parent: null, side: null });
      const wasEmpty = model.root === null;
      model.root = newRoot;
      main.set('root', newRoot);
      persist.detached = null;
      ctx.step(
        main,
        'main',
        wasEmpty
          ? `The tree was empty, so the returned ${name(newRoot)} becomes the root. Done.`
          : `insert() returned the root ${name(newRoot)} (unchanged). ${py(value)} is in the tree. Done.`,
        { viz: { created: createdId } }
      );
      return newRoot;
    },
  });
})();
