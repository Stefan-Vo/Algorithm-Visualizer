(function () {
  'use strict';
  const AV = window.AV;
  const { name, focus } = AV.bst;
  const py = AV.py;

  AV.registerAlgorithm({
    id: 'bst-delete',
    structure: 'bst',
    name: 'Delete',
    blurb: 'Three cases: no child, one child, or two children, where the in-order successor takes its place.',
    complexity: 'O(h)',
    summary: (p) => `delete(root, ${py(p.value)})`,
    param: Object.assign(
      AV.bst.param('Value to delete', (values) =>
        values.length && Math.random() < 0.85 ? values[AV.randInt(0, values.length - 1)] : AV.randInt(1, 99)
      ),
      { default: '15' }
    ),
    source: `
      def delete(root, value):                          @@def
          if root is None:                              @@isnone
              return None                               @@retnone
          if value < root.value:                        @@lt
              root.left = delete(root.left, value)      @@left
          elif value > root.value:                      @@gt
              root.right = delete(root.right, value)    @@right
          else:
              # value == root.value: delete this node
              if root.left is None:                     @@noleft
                  return root.right                     @@retright
              if root.right is None:                    @@noright
                  return root.left                      @@retleft
              successor = min_node(root.right)          @@succ
              root.value = successor.value              @@copy
              root.right = delete(root.right, successor.value)  @@delsucc
          return root                                   @@ret

      def min_node(node):                               @@mdef
          while node.left is not None:                  @@mwhile
              node = node.left                          @@mstep
          return node                                   @@mret

      # caller
      root = delete(root, value)                        @@main
    `,

    run(ctx, model, { value }) {
      const persist = ctx.persist;
      persist.path = [];

      const main = ctx.call(
        '<module>',
        { root: model.root, value },
        'main',
        `Start: call delete(root, ${py(value)}) to remove ${py(value)} from the tree.`,
        { viz: { probe: { label: 'value', value } } }
      );

      function del(root, value, slot) {
        if (root) persist.path.push(root.id);
        const f = ctx.call('delete', { root, value }, 'def', root ? `Enter delete() with root = ${name(root)}, value = ${py(value)}.` : `Enter delete() with root = None.`, {
          viz: focus(root, slot, value),
        });
        const here = (extra) => focus(root, slot, value, extra);

        const isNone = root === null;
        ctx.step(f, 'isnone', isNone ? `root is None: ${py(value)} is not on this path.` : `root is ${name(root)}, not None.`, {
          compare: { expr: 'root is None', evaluated: `${name(root)} is None`, result: isNone },
          viz: here({}),
        });
        if (isNone) {
          return ctx.ret(f, 'retnone', null, `${py(value)} is not in the tree, so nothing is deleted. Return None (the empty link stays empty).`, {
            viz: here({ notFound: true }),
          });
        }

        // Recurse into one side, then re-link whatever subtree comes back.
        const recurse = (side, label) => {
          const child = root[side];
          ctx.step(f, label, `Recursive call on root.${side} (${name(child)}). This call waits for the new ${side} subtree to come back.`, {
            viz: here({ nextEdge: { from: root.id, side } }),
          });
          const sub = del(child, value, { parent: root.id, side });
          root[side] = sub;
          const changed = sub !== child;
          if (changed) persist.target = null;
          ctx.step(
            f,
            label,
            changed
              ? `Back in delete(${name(root)}). Assign the returned subtree (${name(sub)}) to root.${side}. The deleted node is now unlinked from the tree.`
              : `Back in delete(${name(root)}). root.${side} = ${name(sub)}, which is unchanged at this level.`,
            { viz: here({}) }
          );
          return ctx.ret(f, 'ret', root, `Return ${name(root)} to the caller so it can re-link this subtree.`, { viz: here({}) });
        };

        const lt = value < root.value;
        ctx.step(f, 'lt', `${py(value)} < ${py(root.value)} is ${py(lt)}.${lt ? ' The value can only be in the left subtree.' : ''}`, {
          compare: { expr: 'value < root.value', evaluated: `${py(value)} < ${py(root.value)}`, result: lt, next: lt ? 'go left' : null },
          viz: here(lt ? { nextEdge: { from: root.id, side: 'left' } } : {}),
        });
        if (lt) return recurse('left', 'left');

        const gt = value > root.value;
        ctx.step(
          f,
          'gt',
          gt ? `${py(value)} > ${py(root.value)} is True. The value can only be in the right subtree.` : `${py(value)} > ${py(root.value)} is False. Neither smaller nor larger, so ${py(value)} == ${py(root.value)}: this is the node to delete.`,
          {
            compare: { expr: 'value > root.value', evaluated: `${py(value)} > ${py(root.value)}`, result: gt, next: gt ? 'go right' : 'found' },
            viz: here(gt ? { nextEdge: { from: root.id, side: 'right' } } : {}),
          }
        );
        if (gt) return recurse('right', 'right');

        // Found the node to delete.
        persist.target = root.id;
        const noLeft = root.left === null;
        ctx.step(f, 'noleft', noLeft ? `${name(root)} has no left child.` : `${name(root)} has a left child (${name(root.left)}).`, {
          compare: { expr: 'root.left is None', evaluated: `${name(root.left)} is None`, result: noLeft },
          viz: here({}),
        });
        if (noLeft) {
          return ctx.ret(
            f,
            'retright',
            root.right,
            `No left child, so the right child (${name(root.right)}) takes this node's place. Returning it lets the caller skip over ${name(root)}.`,
            { viz: here({ removing: root.id }) }
          );
        }

        const noRight = root.right === null;
        ctx.step(f, 'noright', noRight ? `${name(root)} has no right child.` : `${name(root)} also has a right child (${name(root.right)}), so it has two children.`, {
          compare: { expr: 'root.right is None', evaluated: `${name(root.right)} is None`, result: noRight },
          viz: here({}),
        });
        if (noRight) {
          return ctx.ret(f, 'retleft', root.left, `No right child, so the left child (${name(root.left)}) takes this node's place.`, {
            viz: here({ removing: root.id }),
          });
        }

        ctx.step(
          f,
          'succ',
          `Two children: we can't simply unlink it. Find the in-order successor, the smallest value in the right subtree (starting at ${name(root.right)}).`,
          { viz: here({ nextEdge: { from: root.id, side: 'right' } }) }
        );
        const successor = minNode(root.right);
        f.set('successor', successor);
        ctx.step(f, 'succ', `min_node returned ${name(successor)}, so successor = ${name(successor)}.`, {
          viz: here({ successor: successor.id }),
        });

        const old = root.value;
        root.value = successor.value; // the real mutation
        ctx.step(
          f,
          'copy',
          `Copy the successor's value into this node (${py(old)} → ${py(successor.value)}). The tree is still ordered, but ${py(successor.value)} now appears twice.`,
          { viz: here({ successor: successor.id, changed: root.id }) }
        );

        persist.target = successor.id;
        ctx.step(f, 'delsucc', `Delete the duplicate ${py(successor.value)} from the right subtree. It has no left child, so this is the simple case.`, {
          viz: here({ nextEdge: { from: root.id, side: 'right' } }),
        });
        const sub = del(root.right, successor.value, { parent: root.id, side: 'right' });
        root.right = sub;
        persist.target = null;
        ctx.step(f, 'delsucc', `Back in delete(${name(root)}). Assign the cleaned-up right subtree (${name(sub)}) to root.right.`, { viz: here({}) });

        return ctx.ret(f, 'ret', root, `Return ${name(root)} to the caller.`, { viz: here({}) });
      }

      function minNode(node) {
        const f = ctx.call('min_node', { node }, 'mdef', `Enter min_node(${name(node)}). The smallest value is found by going left as far as possible.`, {
          viz: { current: node.id },
        });
        for (;;) {
          const hasLeft = node.left !== null;
          ctx.step(
            f,
            'mwhile',
            hasLeft ? `${name(node)} has a left child (${name(node.left)}), so there is a smaller value. Keep going left.` : `${name(node)} has no left child, so it is the minimum.`,
            {
              compare: { expr: 'node.left is not None', evaluated: `${name(node.left)} is not None`, result: hasLeft, next: hasLeft ? 'go left' : 'stop' },
              viz: Object.assign({ current: node.id }, hasLeft ? { nextEdge: { from: node.id, side: 'left' } } : {}),
            }
          );
          if (!hasLeft) break;
          node = f.set('node', node.left);
          ctx.step(f, 'mstep', `Move left: node = ${name(node)}.`, { viz: { current: node.id } });
        }
        return ctx.ret(f, 'mret', node, `Return ${name(node)}, the in-order successor.`, { viz: { current: node.id, successor: node.id } });
      }

      const oldRoot = model.root;
      const newRoot = del(model.root, value, { parent: null, side: null });
      model.root = newRoot;
      main.set('root', newRoot);
      persist.target = null;
      ctx.step(
        main,
        'main',
        newRoot !== oldRoot
          ? `The root itself was replaced; root is now ${name(newRoot)}. Done.`
          : `delete() returned the root ${name(newRoot)}. The tree is updated. Done.`,
        {}
      );
      return newRoot;
    },
  });
})();
