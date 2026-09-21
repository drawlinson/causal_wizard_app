import { hasCycle, hasDirectedPath, findBackdoorSet, findFrontdoorSet, findInstrumentalVariables } from "./dag.js";
import { getCompatibleModels, ESTIMAND_TYPE } from "./causal-methods.js";

/**
 * CD+PO identification: mirrors DoWhy's identify_effect() (graph-theory
 * part only - see ROADMAP.md). Returns either {valid:false, issue} using
 * the same issue-key vocabulary as the rest of Check, or
 * {valid:true, estimands: [{type, name, variables, models}]}.
 *
 * @param graph { nodes: string[], edges: [string,string][] }
 * @param observable Set of node ids with actual data (excludes unobserved "u..." nodes)
 */
export function identifyEffect(graph, treatment, outcome, observable, { outcomeType, outcomeCardinality } = {}) {
  const { nodes, edges } = graph;

  if (!nodes.includes(treatment) || !nodes.includes(outcome)) {
    return { valid: false, issue: "treatment_or_outcome_not_in_graph" };
  }
  if (hasCycle(nodes, edges)) {
    return { valid: false, issue: "has_cycles" };
  }
  if (!hasDirectedPath(treatment, outcome, edges)) {
    return { valid: false, issue: "no_directed_path" };
  }

  const estimands = [];

  const backdoor = findBackdoorSet(treatment, outcome, nodes, edges, observable);
  if (backdoor) {
    estimands.push({
      type: ESTIMAND_TYPE.BACKDOOR,
      name: "Backdoor",
      variables: backdoor.variables,
      exhaustive: backdoor.exhaustive,
      models: getCompatibleModels(ESTIMAND_TYPE.BACKDOOR, {
        backdoorVariables: backdoor.variables,
        outcomeType,
        outcomeCardinality,
      }),
    });
  }

  const frontdoor = findFrontdoorSet(treatment, outcome, nodes, edges, observable);
  if (frontdoor) {
    estimands.push({
      type: ESTIMAND_TYPE.FRONTDOOR,
      name: "Frontdoor",
      variables: frontdoor.variables,
      models: getCompatibleModels(ESTIMAND_TYPE.FRONTDOOR, {}),
    });
  }

  const instruments = findInstrumentalVariables(treatment, outcome, nodes, edges, observable);
  if (instruments.length > 0) {
    estimands.push({
      type: ESTIMAND_TYPE.IV,
      name: "Instrumental Variable",
      variables: instruments,
      models: getCompatibleModels(ESTIMAND_TYPE.IV, {}),
    });
  }

  if (estimands.length === 0) {
    // Matches the old site: no specific issue key, just "nothing found".
    return { valid: false, issue: null };
  }
  return { valid: true, estimands };
}
