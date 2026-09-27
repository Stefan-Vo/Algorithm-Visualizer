/* Starter programs for "Your code" mode. Any Python works; these show off what the view detects. */
(function () {
  'use strict';
  const AV = (window.AV = window.AV || {});

  const dedent = (s) => {
    const lines = s.replace(/^\n/, '').replace(/\s+$/, '').split('\n');
    const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length));
    return lines.map((l) => l.slice(indent)).join('\n') + '\n';
  };

  AV.pythonExamples = [
    {
      id: 'bst',
      name: 'BST insert',
      code: dedent(`
        class Node:
            def __init__(self, value):
                self.value = value
                self.left = None
                self.right = None

        def insert(root, value):
            if root is None:
                return Node(value)
            if value < root.value:
                root.left = insert(root.left, value)
            else:
                root.right = insert(root.right, value)
            return root

        root = None
        for v in [10, 5, 15, 3, 7]:
            root = insert(root, v)
        print("inserted", v)
      `),
    },
    {
      id: 'linked-list',
      name: 'Reverse linked list',
      code: dedent(`
        class ListNode:
            def __init__(self, val, next=None):
                self.val = val
                self.next = next

        def reverse(head):
            prev = None
            curr = head
            while curr is not None:
                nxt = curr.next
                curr.next = prev
                prev = curr
                curr = nxt
            return prev

        head = None
        for v in [4, 3, 2, 1]:
            head = ListNode(v, head)
        head = reverse(head)
      `),
    },
    {
      id: 'insertion-sort',
      name: 'Insertion sort',
      code: dedent(`
        def insertion_sort(arr):
            for i in range(1, len(arr)):
                key = arr[i]
                j = i - 1
                while j >= 0 and arr[j] > key:
                    arr[j + 1] = arr[j]
                    j -= 1
                arr[j + 1] = key
            return arr

        nums = [29, 10, 14, 37, 13]
        insertion_sort(nums)
        print(nums)
      `),
    },
    {
      id: 'binary-search',
      name: 'Binary search',
      code: dedent(`
        def binary_search(arr, target):
            lo, hi = 0, len(arr) - 1
            while lo <= hi:
                mid = (lo + hi) // 2
                if arr[mid] == target:
                    return mid
                elif arr[mid] < target:
                    lo = mid + 1
                else:
                    hi = mid - 1
            return -1

        arr = [2, 5, 8, 12, 16, 23, 38, 56, 72]
        print(binary_search(arr, 23))
      `),
    },
    {
      id: 'fib-memo',
      name: 'Fibonacci (memo)',
      code: dedent(`
        def fib(n, memo):
            if n in memo:
                return memo[n]
            if n <= 1:
                return n
            memo[n] = fib(n - 1, memo) + fib(n - 2, memo)
            return memo[n]

        memo = {}
        print(fib(6, memo))
      `),
    },
    {
      id: 'grid-dp',
      name: 'Grid paths (2D DP)',
      code: dedent(`
        def unique_paths(rows, cols):
            dp = [[0] * cols for _ in range(rows)]
            for i in range(rows):
                for j in range(cols):
                    if i == 0 or j == 0:
                        dp[i][j] = 1
                    else:
                        dp[i][j] = dp[i - 1][j] + dp[i][j - 1]
            return dp[rows - 1][cols - 1]

        print(unique_paths(3, 4))
      `),
    },
    {
      id: 'bfs',
      name: 'BFS on a graph',
      code: dedent(`
        from collections import deque

        graph = {
            'A': ['B', 'C'],
            'B': ['D'],
            'C': ['D', 'E'],
            'D': ['F'],
            'E': ['F'],
            'F': [],
        }

        def bfs(start):
            visited = [start]
            queue = deque([start])
            while queue:
                node = queue.popleft()
                for nb in graph[node]:
                    if nb not in visited:
                        visited.append(nb)
                        queue.append(nb)
            return visited

        print(bfs('A'))
      `),
    },
  ];
})();
