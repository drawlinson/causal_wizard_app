// Pure graph-theory algorithms for causal identification: d-separation,
// backdoor/frontdoor criteria, instrumental-variable detection. This is
// exactly the part of DoWhy's identify_effect() that's pure graph theory
// (no statistical fitting) - see ROADMAP.md's "in-browser identification"
// decision. The notebook re-validates everything, so this exists to guide
// the user, not to be the final word.
//
// Graph shape used throughout: { nodes: string[], edges: [string, string][] }
// - edges are directed, [from, to], meaning "from causes to".

function parents(node, edges) {
  return edges.filter(([, to]) => to === node).map(([from]) => from);
}

function children(node, edges) {
  return edges.filter(([from]) => from === node).map(([, to]) => to);
}

export function ancestors(node, edges) {
  const visited = new Set();
  const stack = [node];
  while (stack.length) {
    const n = stack.pop();
    for (const p of parents(n, edges)) {
      if (!visited.has(p)) {
        visited.add(p);
        stack.push(p);
      }
    }
  }
  return visited;
}

export function descendants(node, edges) {
  const visited = new Set();
  const stack = [node];
  while (stack.length) {
    const n = stack.pop();
    for (const c of children(n, edges)) {
      if (!visited.has(c)) {
        visited.add(c);
        stack.push(c);
      }
    }
  }
  return visited;
}

function ancestorsOfSet(nodeSet, edges) {
  const result = new Set(nodeSet);
  for (const n of nodeSet) for (const a of ancestors(n, edges)) result.add(a);
  return result;
}

export function hasCycle(nodes, edges) {
  const UNVISITED = 0;
  const VISITING = 1;
  const DONE = 2;
  const state = new Map(nodes.map((n) => [n, UNVISITED]));

  function visit(n) {
    state.set(n, VISITING);
    for (const c of children(n, edges)) {
      if (state.get(c) === VISITING) return true;
      if (state.get(c) === UNVISITED && visit(c)) return true;
    }
    state.set(n, DONE);
    return false;
  }

  for (const n of nodes) {
    if (state.get(n) === UNVISITED && visit(n)) return true;
  }
  return false;
}

export function hasDirectedPath(from, to, edges) {
  return descendants(from, edges).has(to);
}

/**
 * d-separation test via the moralized-ancestral-graph algorithm:
 * 1. Restrict to the ancestral set of {x, y} u z.
 * 2. Moralize (marry parents that share a child, then drop direction).
 * 3. Remove z. x and y are d-separated iff they're disconnected.
 */
export function dSeparated(x, y, z, nodes, edges) {
  const relevant = ancestorsOfSet(new Set([x, y, ...z]), edges);
  const subNodes = nodes.filter((n) => relevant.has(n));
  const subEdges = edges.filter(([a, b]) => relevant.has(a) && relevant.has(b));

  const key = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const undirected = new Set();
  for (const [a, b] of subEdges) undirected.add(key(a, b));
  for (const n of subNodes) {
    const ps = parents(n, subEdges);
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) undirected.add(key(ps[i], ps[j]));
    }
  }

  const remaining = new Set(subNodes.filter((n) => !z.has(n)));
  if (!remaining.has(x) || !remaining.has(y)) return true;

  const adj = new Map([...remaining].map((n) => [n, []]));
  for (const k of undirected) {
    const [a, b] = k.split("|");
    if (remaining.has(a) && remaining.has(b)) {
      adj.get(a).push(b);
      adj.get(b).push(a);
    }
  }

  const seen = new Set([x]);
  const queue = [x];
  while (queue.length) {
    const n = queue.shift();
    for (const nb of adj.get(n) || []) {
      if (!seen.has(nb)) {
        seen.add(nb);
        queue.push(nb);
      }
    }
  }
  return !seen.has(y);
}

function* combinations(arr, k) {
  if (k === 0) {
    yield [];
    return;
  }
  for (let i = 0; i <= arr.length - k; i++) {
    for (const rest of combinations(arr.slice(i + 1), k - 1)) {
      yield [arr[i], ...rest];
    }
  }
}

const MAX_BACKDOOR_CANDIDATES = 20;

export function satisfiesBackdoor(x, y, zSet, nodes, edges) {
  const xDesc = descendants(x, edges);
  for (const z of zSet) if (xDesc.has(z)) return false;
  const edgesNoXOut = edges.filter(([a]) => a !== x);
  return dSeparated(x, y, zSet, nodes, edgesNoXOut);
}

/**
 * Smallest valid backdoor adjustment set (increasing-size search, return
 * the first that works). A minimal set is a reasonable, well-justified
 * choice - not necessarily bit-for-bit what DoWhy's own "default set"
 * heuristic picks, which is fine since the notebook re-identifies anyway.
 *
 * `observable` restricts which nodes may appear IN the returned set (you
 * can't condition on a variable with no data) - unobserved nodes still
 * fully participate in the underlying graph/d-separation structure, since
 * they still affect what needs blocking.
 */
export function findBackdoorSet(x, y, nodes, edges, observable) {
  const xDesc = descendants(x, edges);
  const candidates = nodes.filter((n) => n !== x && n !== y && !xDesc.has(n) && observable.has(n));

  if (candidates.length > MAX_BACKDOOR_CANDIDATES) {
    const all = new Set(candidates);
    if (satisfiesBackdoor(x, y, all, nodes, edges)) {
      return { variables: candidates, exhaustive: false };
    }
    return null;
  }

  for (let size = 0; size <= candidates.length; size++) {
    for (const combo of combinations(candidates, size)) {
      if (satisfiesBackdoor(x, y, new Set(combo), nodes, edges)) {
        return { variables: combo, exhaustive: true };
      }
    }
  }
  return null;
}

/**
 * Best-effort frontdoor detection: takes the full mediator set (every node
 * on some directed x->y path) as the candidate Z and checks Pearl's three
 * conditions. Doesn't search smaller mediator subsets - frontdoor identification
 * is rare enough in practice that this is a reasonable v1.
 */
export function findFrontdoorSet(x, y, nodes, edges, observable) {
  const xDesc = descendants(x, edges);
  const yAnc = ancestors(y, edges);
  const mediators = nodes.filter((n) => n !== x && n !== y && xDesc.has(n) && yAnc.has(n));
  if (mediators.length === 0) return null;
  if (!mediators.every((m) => observable.has(m))) return null; // can't condition on an unobserved mediator

  const zSet = new Set(mediators);
  const edgesWithoutZ = edges.filter(([a, b]) => !zSet.has(a) && !zSet.has(b));
  if (hasDirectedPath(x, y, edgesWithoutZ)) return null; // some path bypasses the mediators

  const edgesNoXOut = edges.filter(([a]) => a !== x);
  for (const z of mediators) {
    if (!dSeparated(x, z, new Set(), nodes, edgesNoXOut)) return null; // backdoor path x->z
  }

  for (const z of mediators) {
    const edgesNoZOut = edges.filter(([a]) => a !== z);
    if (!dSeparated(z, y, new Set([x]), nodes, edgesNoZOut)) return null; // unblocked backdoor path z->y
  }

  return { variables: mediators };
}

/**
 * Instrumental variables: ancestors of x that don't affect y except
 * through x, and aren't confounded with y.
 */
export function findInstrumentalVariables(x, y, nodes, edges, observable) {
  const xAnc = ancestors(x, edges);
  const candidates = nodes.filter((n) => n !== x && n !== y && xAnc.has(n) && observable.has(n));
  const edgesNoX = edges.filter(([a, b]) => a !== x && b !== x);

  return candidates.filter((z) => {
    if (hasDirectedPath(z, y, edgesNoX)) return false; // affects y other than via x
    const edgesNoZOut = edges.filter(([a]) => a !== z);
    return dSeparated(z, y, new Set(), nodes, edgesNoZOut); // not confounded with y
  });
}

/**
 * All variables lying on some directed path from x to y (excluding x, y
 * themselves) - a general "is this a mediator of the treatment effect"
 * check, for diagram highlighting. Broader than findFrontdoorSet's
 * mediator set, which additionally requires the whole set to satisfy
 * Pearl's frontdoor conditions.
 */
export function findMediators(x, y, nodes, edges) {
  const xDesc = descendants(x, edges);
  const yAnc = ancestors(y, edges);
  return nodes.filter((n) => n !== x && n !== y && xDesc.has(n) && yAnc.has(n));
}

/**
 * Colliders: nodes with two or more parents (a common effect of separate
 * causes) - conditioning on one can open a spurious association between
 * its causes, so these are flagged for the diagram regardless of whether
 * they're on a treatment-outcome path.
 */
export function findColliders(nodes, edges) {
  return nodes.filter((n) => parents(n, edges).length >= 2);
}
