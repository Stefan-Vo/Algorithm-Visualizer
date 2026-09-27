/*
 * Python-side tracer for user code, run inside Pyodide (real CPython).
 *
 * It executes the user's program under sys.settrace and records one step per
 * call / line / return / exception event in the user's code. Each step holds the
 * user call stack (formatted locals per frame), a snapshot of every object
 * reachable from those locals (the "heap"), printed output so far, and, for
 * if/elif/while lines, the condition with its live values.
 *
 * `line` events fire *before* the line runs (standard debugger semantics).
 *
 * Kept as a string here so the app works from file:// with no fetch. The test
 * suite extracts it and runs it under the local CPython too.
 */
(function () {
  'use strict';
  const AV = (window.AV = window.AV || {});

  AV.PY_TRACER_SOURCE = String.raw`
import ast, builtins, collections, io, json, sys, types

USER = '<user>'
VALUE_KEYS = ('value', 'val', 'key', 'data', 'item', 'v')
MAX_ITEMS = 64
MAX_OBJS = 250
OPS = {ast.Lt: '<', ast.LtE: '<=', ast.Gt: '>', ast.GtE: '>=', ast.Eq: '==', ast.NotEq: '!=',
       ast.Is: 'is', ast.IsNot: 'is not', ast.In: 'in', ast.NotIn: 'not in'}
SAFE_CALLS = {'len', 'abs', 'min', 'max', 'isinstance', 'int', 'str', 'float', 'bool', 'type', 'ord', 'chr'}
SAFE_NODES = (ast.Expression, ast.Compare, ast.BoolOp, ast.UnaryOp, ast.BinOp, ast.Name, ast.Attribute,
              ast.Subscript, ast.Constant, ast.Slice, ast.Tuple, ast.List, ast.Call,
              ast.cmpop, ast.boolop, ast.unaryop, ast.operator, ast.expr_context)
HIDDEN_TYPES = (types.FunctionType, types.BuiltinFunctionType, types.ModuleType, type,
                types.MethodType, types.BuiltinMethodType)


class _StepLimit(BaseException):
    pass


def _short(s, n=48):
    s = str(s)
    return s if len(s) <= n else s[:n - 1] + '…'


def _is_prim(v):
    return v is None or isinstance(v, (bool, int, float, complex, str, bytes))


def _label(v, depth=0):
    """Short human-readable text for a value, without running untraced user code more than needed."""
    if _is_prim(v):
        return _short(repr(v))
    t = type(v)
    if depth > 1:
        return '…'
    if t in (list, tuple, set, frozenset):
        items = list(v)[:8]
        inner = ', '.join(_label(x, depth + 1) for x in items) + (', …' if len(v) > 8 else '')
        if t is list:
            return _short('[' + inner + ']', 60)
        if t is tuple:
            return _short('(' + inner + (',' if len(v) == 1 else '') + ')', 60)
        return _short('{' + inner + '}', 60) if v else 'set()'
    if t is dict:
        items = list(v.items())[:6]
        inner = ', '.join(_label(k, depth + 1) + ': ' + _label(x, depth + 1) for k, x in items)
        return _short('{' + inner + (', …' if len(v) > 6 else '') + '}', 60)
    if isinstance(v, HIDDEN_TYPES):
        return '<' + getattr(v, '__name__', t.__name__) + '>'
    if t.__repr__ is not object.__repr__:
        try:
            return _short(repr(v))
        except Exception:
            pass
    fields = getattr(v, '__dict__', None)
    if isinstance(fields, dict):
        for k in VALUE_KEYS:
            if k in fields and _is_prim(fields[k]):
                return t.__name__ + '(' + _short(repr(fields[k]), 20) + ')'
    return t.__name__ + ' object'


def _visible(name, v):
    return not name.startswith('__') and not isinstance(v, HIDDEN_TYPES)


def _is_pure(expr):
    for n in ast.walk(expr):
        if not isinstance(n, SAFE_NODES):
            return False
        if isinstance(n, ast.Call):
            if n.keywords or not (isinstance(n.func, ast.Name) and n.func.id in SAFE_CALLS):
                return False
    return True


def _compile_expr(node):
    return compile(ast.Expression(body=node), '<cond>', 'eval')


def _explainer(node):
    """Precompiled plan for showing a condition with its live values substituted."""
    if isinstance(node, ast.Compare):
        return ('cmp', [_compile_expr(node.left)] + [_compile_expr(c) for c in node.comparators],
                [OPS.get(type(o), '?') for o in node.ops])
    if isinstance(node, ast.BoolOp):
        return ('bool', 'and' if isinstance(node.op, ast.And) else 'or',
                [(_explainer(v), _compile_expr(v)) for v in node.values])
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.Not):
        return ('not', _explainer(node.operand))
    return ('val', _compile_expr(node))


def _explain(plan, gl, lo):
    kind = plan[0]
    if kind == 'cmp':
        vals = [_label(eval(p, gl, lo)) for p in plan[1]]
        return vals[0] + ''.join(' %s %s' % (op, v) for op, v in zip(plan[2], vals[1:]))
    if kind == 'bool':
        # mirror short-circuiting: stop explaining once the result is decided
        parts = []
        for sub, code in plan[2]:
            parts.append(_explain(sub, gl, lo))
            value = bool(eval(code, gl, lo))
            if (plan[1] == 'and' and not value) or (plan[1] == 'or' and value):
                break
        return (' %s ' % plan[1]).join(parts)
    if kind == 'not':
        inner = _explain(plan[1], gl, lo)
        return 'not ' + (('(' + inner + ')') if plan[1][0] != 'val' else inner)
    return _label(eval(plan[1], gl, lo))


def _conditions(tree, src):
    conds = {}
    for node in ast.walk(tree):
        if isinstance(node, (ast.If, ast.While)):
            test = node.test
            entry = {
                'kind': 'while' if isinstance(node, ast.While) else 'if',
                'text': ast.get_source_segment(src, test) or ast.unparse(test),
                'body': node.body[0].lineno,
            }
            if _is_pure(test):
                entry['code'] = _compile_expr(test)
                entry['plan'] = _explainer(test)
            conds.setdefault(node.lineno, entry)
    return conds


def _consequence(kind, result):
    if kind == 'while':
        return 'the loop body runs' if result else 'the loop ends'
    return 'this branch runs' if result else 'this branch is skipped'


def run(src, max_steps=3000):
    src = src.replace('\r\n', '\n')
    try:
        tree = ast.parse(src, USER)
        code = compile(tree, USER, 'exec')
    except SyntaxError as e:
        return {'steps': [], 'output': '', 'truncated': False,
                'error': {'type': 'SyntaxError', 'msg': e.msg, 'line': e.lineno or 0}}

    conds = _conditions(tree, src)
    out = io.StringIO()
    keep = {}              # id -> object; keeps objects alive so ids stay unique for the whole run
    steps = []
    last_vars = {}         # frame id -> (line, {name: text})
    signatures = {}        # frame id -> "fn(a=1, b=2)"
    pending = {}           # frame id -> (step index, cond entry) awaiting branch resolution
    unwinding = set()      # frame ids with an exception propagating
    state = {'exc': None}
    g = {'__name__': '__main__', '__builtins__': builtins}

    def user_frames(frame):
        frames = []
        while frame is not None:
            if frame.f_code.co_filename == USER:
                frames.append(frame)
            frame = frame.f_back
        frames.reverse()
        return frames

    def frame_vars(fr):
        loc = fr.f_globals if fr.f_code.co_name == '<module>' else fr.f_locals
        return [(k, v) for k, v in list(loc.items()) if _visible(k, v)]

    def snapshot(frames, extra=None, with_extra=False):
        heap = {}
        queue = []

        def ref(v):
            if _is_prim(v) or isinstance(v, HIDDEN_TYPES) or isinstance(v, range):
                return {'text': _label(v)}
            oid = 'o%d' % id(v)
            keep[id(v)] = v
            if oid not in heap:
                heap[oid] = None
                queue.append((oid, v))
            return {'text': _label(v), 'ref': oid}

        stack = []
        for depth, fr in enumerate(frames):
            stack.append({
                'fn': fr.f_code.co_name,
                'sig': signatures.get(id(fr), fr.f_code.co_name + '()'),
                'line': fr.f_lineno,
                'vars': [dict(name=k, **ref(v)) for k, v in frame_vars(fr)],
            })

        extra_ref = ref(extra) if with_extra else None
        count = 0
        while queue:
            oid, v = queue.pop(0)
            count += 1
            if count > MAX_OBJS:
                heap[oid] = {'k': 'other', 'text': _label(v)}
                continue
            t = type(v)
            if t in (list, tuple) or isinstance(v, collections.deque):
                v = list(v) if not isinstance(v, (list, tuple)) else v
                heap[oid] = {'k': 'list', 'type': t.__name__, 'len': len(v), 'items': [ref(x) for x in list(v)[:MAX_ITEMS]]}
            elif t in (set, frozenset):
                items = list(v)[:MAX_ITEMS]
                heap[oid] = {'k': 'list', 'type': t.__name__, 'len': len(v), 'items': [ref(x) for x in items]}
            elif t is dict:
                items = list(v.items())[:MAX_ITEMS]
                heap[oid] = {'k': 'dict', 'len': len(v), 'items': [[_label(k), ref(x)] for k, x in items]}
            elif isinstance(getattr(v, '__dict__', None), dict):
                fields = [[k, ref(x)] for k, x in list(vars(v).items())[:MAX_ITEMS] if not k.startswith('__')]
                heap[oid] = {'k': 'obj', 'cls': t.__name__, 'fields': fields}
            elif hasattr(t, '__slots__'):
                fields = [[k, ref(getattr(v, k))] for k in t.__slots__ if hasattr(v, k)]
                heap[oid] = {'k': 'obj', 'cls': t.__name__, 'fields': fields}
            else:
                heap[oid] = {'k': 'other', 'text': _label(v)}
        return stack, {k: v for k, v in heap.items() if v is not None}, extra_ref

    def eval_cond(entry, frame):
        if 'code' not in entry:
            return None
        try:
            gl, lo = frame.f_globals, frame.f_locals
            result = bool(eval(entry['code'], gl, lo))
            evaluated = _explain(entry['plan'], gl, lo)
            return {'expr': entry['text'], 'evaluated': evaluated, 'result': result}
        except Exception:
            return None

    def resolve_pending(frame, line):
        """For conditions we could not safely re-evaluate, infer the result from where execution went."""
        item = pending.pop(id(frame), None)
        if item is None:
            return
        idx, entry = item
        result = line == entry['body']
        steps[idx]['compare'] = {'expr': entry['text'], 'evaluated': entry['text'], 'result': result}
        steps[idx]['desc'] += ' Condition %s is %s, so %s.' % (entry['text'], result, _consequence(entry['kind'], result))

    def record(frame, event, arg):
        if len(steps) >= max_steps:
            raise _StepLimit()
        fid = id(frame)
        fn = frame.f_code.co_name
        line = frame.f_lineno
        frames = user_frames(frame)
        returning = event == 'return' and fid not in unwinding and fn != '<module>'
        stack, heap, ret_ref = snapshot(frames, arg, returning)
        top_vars = {v['name']: v['text'] for v in stack[-1]['vars']}
        parts = []
        step = {'kind': event, 'line': line, 'stack': stack, 'heap': heap, 'out': out.tell()}

        if event != 'call':
            prev = last_vars.get(fid)
            if prev is not None:
                prev_line, prev_vars = prev
                changes = []
                for name, text in top_vars.items():
                    if name not in prev_vars:
                        changes.append('%s = %s' % (name, text))
                    elif prev_vars[name] != text:
                        changes.append('%s: %s → %s' % (name, prev_vars[name], text))
                if changes and prev_line:
                    parts.append('Line %d changed %s.' % (prev_line, ', '.join(changes[:4]) + (', …' if len(changes) > 4 else '')))
        last_vars[fid] = (line, top_vars)

        if event == 'call':
            parts.append('Call %s.' % stack[-1]['sig'])
        elif event == 'line':
            parts.append('Next to run: line %d.' % line)
            entry = conds.get(line)
            if entry is not None:
                cmp = eval_cond(entry, frame)
                if cmp is not None:
                    step['compare'] = cmp
                    parts.append('Condition %s evaluates to %s → %s, so %s.' % (
                        cmp['expr'], cmp['evaluated'], cmp['result'], _consequence(entry['kind'], cmp['result'])))
                else:
                    pending[fid] = (len(steps), entry)
        elif event == 'return':
            if fid in unwinding:
                parts.append('%s() exits because of the exception.' % fn)
            elif fn == '<module>':
                parts.append('The program finished.')
            else:
                step['ret'] = ret_ref
                parts.append('%s() returns %s.' % (fn, step['ret']['text']))
            last_vars.pop(fid, None)
            signatures.pop(id(frame), None)
        elif event == 'exception':
            exc_type, exc, _tb = arg
            parts.append('%s: %s raised on line %d.' % (exc_type.__name__, exc, line))

        step['desc'] = ' '.join(parts)
        steps.append(step)

    def tracer(frame, event, arg):
        if frame.f_code.co_filename != USER:
            return None
        fid = id(frame)
        if event == 'call':
            co = frame.f_code
            if co.co_name == '<module>':
                return tracer
            n = co.co_argcount + co.co_kwonlyargcount
            names = list(co.co_varnames[:n])
            if co.co_flags & 0x04:
                names.append(co.co_varnames[n])
            loc = frame.f_locals
            signatures[fid] = '%s(%s)' % (co.co_name, ', '.join('%s=%s' % (a, _label(loc.get(a))) for a in names))
            record(frame, 'call', arg)
        elif event == 'line':
            resolve_pending(frame, frame.f_lineno)
            unwinding.discard(fid)
            record(frame, 'line', arg)
        elif event == 'return':
            resolve_pending(frame, -1)
            record(frame, 'return', arg)
            unwinding.discard(fid)
        elif event == 'exception':
            resolve_pending(frame, -1)
            unwinding.add(fid)
            if state['exc'] is not arg[1]:
                state['exc'] = arg[1]
                record(frame, 'exception', arg)
        return tracer

    error = None
    truncated = False
    real_stdout, real_input = sys.stdout, builtins.input
    builtins.input = lambda *a: ''
    sys.stdout = out
    sys.settrace(tracer)
    try:
        exec(code, g)
    except _StepLimit:
        truncated = True
    except BaseException as e:
        tb = e.__traceback__
        line = 0
        while tb is not None:
            if tb.tb_frame.f_code.co_filename == USER:
                line = tb.tb_lineno
            tb = tb.tb_next
        error = {'type': type(e).__name__, 'msg': str(e), 'line': line}
    finally:
        sys.settrace(None)
        sys.stdout = real_stdout
        builtins.input = real_input
    return {'steps': steps, 'output': out.getvalue(), 'truncated': truncated, 'error': error}


def run_json(src, max_steps=3000):
    return json.dumps(run(src, max_steps))
`;
})();
