#  Belief Graph - Mathematical Algorithms

##  Mathematical Foundation

This document presents the **core mathematical algorithms** for a dual-mode belief propagation system using Bayesian networks.

---

##  Node Type Mathematical Definitions


###  Fact Nodes
$$P_{fact} = 0.995$$


###  Assertion Nodes
**Lite Mode**: $P = f(\text{parents}, \text{weights})$ via robust propagation  
**Heavy Mode**: $P = f(\text{parents}, \text{CPT})$ via Bayesian inference

### ⚬ AND Nodes
$$P(\text{AND}) = \prod_{i=1}^{n} P(\text{parent}_i)$$

### ⚭ OR Nodes  
$$P(\text{OR}) = 1 - \prod_{i=1}^{n} (1 - P(\text{parent}_i))$$

---

## 🔹 Lite Mode: Robust Belief Propagation


### Core Propagation Algorithm

**Propagation Order:**
Lite mode uses an **iterative convergence approach** to propagate probabilities through the belief network. The system performs multiple passes until convergence is achieved or maximum iterations are reached.

**Convergence Parameters:**
- Tolerance: 0.001 (default)
- Maximum iterations: 30 (default)  
- Convergence achieved when maximum probability change < tolerance

**Input Parameters:**
- $P_{base}$: Prior probability (0.5 for assertions)
- $\mathcal{E}$: Set of incoming edges  
- $\epsilon$: Numerical stability (0.01)
- $k_{sat}$: Saturation strength (1.0)

**Mathematical Steps:**
1. **Epsilon Clamping:**
   $$P_{clamped} = \min(\max(P, \epsilon), 1-\epsilon)$$
2. **Logit Transformation:**
   $$\text{logit}(P) = \ln\left(\frac{P}{1-P}\right)$$
   $$\text{priorOdds} = \text{logit}(P_{base,clamped})$$
   $$\text{parentOdds}_i = \text{logit}(P_{parent_i,clamped})$$
3. **Weighted Influence:**
   $$\text{sign}_i = \begin{cases} -1 & \text{if edge opposes} \\ 1 & \text{otherwise} \end{cases}$$
   $$w_{eff,i} = w_i \times \text{sign}_i$$
   $$\Delta_{odds} = \sum_{i \in \mathcal{E}} w_{eff,i} \times (\text{parentOdds}_i - \text{priorOdds})$$
4. **Saturation Function:**
   $$W_{total} = \sum_{i \in \mathcal{E}} |w_{eff,i}|$$
   $$\text{saturation} = 1 - e^{-k_{sat} \times W_{total}}$$
   $$\Delta_{final} = \Delta_{odds} \times \text{saturation}$$
5. **Final Probability:**
   $$\text{updatedOdds} = \text{priorOdds} + \Delta_{final}$$
   $$P_{final} = \frac{1}{1 + e^{-\text{updatedOdds}}}$$

**Saturation Design for Iterative Convergence:**
The saturation function is specifically designed for iterative systems. Over multiple iterations:
- **Low total weights**: $\text{saturation} \approx W_{total}$ (linear accumulation)
- **High total weights**: $\text{saturation} \to 1$ (prevents extreme swings)
- **Multiple iterations**: Small incremental changes accumulate to proper final values

**Special Case: High-Weight Single Edge**
When $|w_{eff}| \geq 0.99$:
$$P_{final} = \begin{cases}
P_{parent} & \text{if } w_{eff} > 0 \\
1 - P_{parent} & \text{if } w_{eff} < 0
\end{cases}$$

---

## 🔸 Heavy Mode: Bayesian CPT Inference

### Propagation Order
Heavy mode uses a single-pass, topological sort-based propagation. All nodes are updated in topological order (parents before children), ensuring correct dependency resolution in acyclic graphs.

### Fact Node Probability
$$P_{fact}^{heavy} = \text{explicitHeavyProb if set, else } 0.995$$

### CPT Structure
Each edge stores conditional probabilities as:
- $\text{condTrue}$: $P(\text{child}=\text{true} | \text{parent}=\text{true})$ [%]
- $\text{condFalse}$: $P(\text{child}=\text{true} | \text{parent}=\text{false})$ [%]
- $\text{baseline}$: $P(\text{child}=\text{true} | \text{no parent info})$ [%]

If $\text{cpt.inverse}$ is set, parent probabilities are inverted for AND/OR nodes and CPT values are swapped for assertions.

### Single Parent Calculation
For edge $A \rightarrow B$:
$$P(B) = P(B|A) \cdot P(A) + P(B|\neg A) \cdot (1 - P(A))$$
Where:
$$P(B|A) = \min(\max(\text{condTrue}/100, 0.001), 0.999)$$
$$P(B|\neg A) = \min(\max(\text{condFalse}/100, 0.001), 0.999)$$

### Multiple Parent Calculation (Exact Joint Enumeration with Baseline Normalization)
If number of parents $\leq 8$:
1. For each parent state combination, compute:
   - $P(\text{combo}) = \prod_i P(A_i)$ or $1-P(A_i)$ as appropriate
   - $\text{likelihoodProduct} = \prod_i \text{condTrue}$ or $\text{condFalse}$ as appropriate
   - $\text{baselineProduct} = \prod_i \text{baseline}$
2. Normalize: $\text{baselineNormalization} = \text{baselineProduct} / \text{baseline}_1$
3. $P(\text{child}|\text{combo}) = \text{likelihoodProduct} / \text{baselineNormalization}$
4. $P(\text{child}) = \sum_{\text{combos}} P(\text{combo}) \cdot \max(0, \min(1, P(\text{child}|\text{combo})))$

If baselines differ by more than 5%, a warning is shown and normalization is still performed.

### Fallback for Many Parents (Log-Odds Approximation)
If number of parents $> 8$:
1. For each parent edge $i$:
   - $P(\text{child}|A_i) = \text{condTrue} \cdot P(A_i) + \text{condFalse} \cdot (1-P(A_i))$
   - $\text{LR}_i = \frac{P(\text{child}|A_i)}{1 - P(\text{child}|A_i)}$
2. $\text{logOdds} = \sum_i \ln(\text{LR}_i)$
3. $P_{final} = \frac{e^{\text{logOdds}}}{1 + e^{\text{logOdds}}}$

---


## Propagation Passes

### Lite Mode: Iterative Convergence
Lite mode uses an **iterative convergence approach**:
1. **Edge Convergence**: Update all edge weights (typically converges immediately for assertions)
2. **Node Convergence**: Iteratively update all node probabilities until convergence
3. **Convergence Check**: Continue until maximum change < tolerance or max iterations reached

### Heavy Mode: Single-Pass Topological Sort
Heavy mode uses a single topological sort-based pass to update all node probabilities. No iterative updates or convergence checks are performed.

### Topological Sort Algorithm (Heavy Mode Only)

To guarantee that all parent nodes are updated before their children in Heavy mode, the propagation order is determined by a topological sort of the directed acyclic graph (DAG):

**Algorithm:**
1. Mark all nodes as unvisited.
2. For each unvisited node, perform a depth-first search (DFS):
   - Recursively visit all child nodes (nodes reachable by outgoing edges).
   - After all children are visited, add the current node to the front of the sorted list.
3. Continue until all nodes are visited.

**Pseudocode:**
```python
def topological_sort(nodes, edges):
    visited = set()
    result = []
    def dfs(node):
        if node in visited:
            return
        visited.add(node)
        for child in children(node, edges):
            dfs(child)
        result.insert(0, node)
    for node in nodes:
        dfs(node)
    return result
```

**Time Complexity:** $O(V + E)$, where $V$ is the number of nodes and $E$ is the number of edges.

---

##  Robustness Calculation

### Absolute Evidence Intensity
$$\text{AEI} = \sum_{i \in \mathcal{E}_{valid}} |w_{modified,i}|$$

### Robustness Score
$$\text{robustness} = 1 - e^{-k \times \text{AEI}}$$

---

##  Cycle Prevention

### Cycle Detection Algorithm
**Input:** Proposed edge from $s$ to $t$

**Algorithm:** Depth-first search from $t$:
$$\text{hasCycle}(s,t) = \text{DFS}(t, \{s\}, \emptyset)$$

Where:
$$\text{DFS}(v, \text{target}, \text{visited}) = \begin{cases}
\text{true} & \text{if } v \in \text{target} \\
\text{false} & \text{if } v \in \text{visited} \\
\bigvee_{c \in \text{children}(v)} \text{DFS}(c, \text{target}, \text{visited} \cup \{v\}) & \text{otherwise}
\end{cases}$$

**Time Complexity:** $O(V + E)$

---

##  Mathematical Constants

```python

# Probability bounds
FACT_PROB = 0.995             # Fact node probability (both modes)
epsilon = 0.01                # Numerical stability bound
saturationK = 1.0             # Saturation strength

# Convergence parameters (Lite mode only)
tolerance = 0.001             # Convergence tolerance
maxIters = 30                 # Maximum iterations for convergence

# Weight bounds
WEIGHT_MIN = 0.01             # Minimum edge weight magnitude
```

---

##  Key Mathematical Properties

### Probability Conservation
$$\forall \text{ nodes } n: P(n) \in [0,1]$$

### Propagation Guarantees
- **Lite Mode**: Iterative convergence ensures network stability through multiple passes
- **Heavy Mode**: Single-pass topological sort ensures dependency-respecting calculation order

### Convergence Properties (Lite Mode)
- **Monotonic Convergence**: Each iteration reduces maximum probability change
- **Stability**: System reaches equilibrium when $\max_n |\Delta P(n)| < \text{tolerance}$
- **Bounded Iterations**: Process terminates within maximum iteration limit

### Bayesian Soundness
Heavy mode satisfies:
$$P(B|A_1, A_2, \ldots, A_n) = \frac{\prod_i P(B|A_i) \cdot P(A_i)}{P(B)} \text{ (under independence)}$$

### Numerical Stability
$$\forall P \text{ in calculations}: P \in [\epsilon, 1-\epsilon]$$

This ensures all logit operations remain finite and well-defined.
