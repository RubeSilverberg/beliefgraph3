# 🧮 Belief Graph - Mathematical Algorithms

## 📐 Mathematical Foundation

This document presents the **core mathematical algorithms** for a dual-mode belief propagation system using Bayesian networks.

---

## 🔬 Node Type Mathematical Definitions

### 📍 Fact Nodes
$$P_{fact} = \begin{cases}
0.99 & \text{(Lite Mode)} \\
1.0 & \text{(Heavy Mode)}
\end{cases}$$

### 💭 Assertion Nodes
**Lite Mode**: $P = f(\text{parents}, \text{weights})$ via robust propagation  
**Heavy Mode**: $P = f(\text{parents}, \text{CPT})$ via Bayesian inference

### ⚬ AND Nodes
$$P(\text{AND}) = \prod_{i=1}^{n} P(\text{parent}_i)$$

### ⚭ OR Nodes  
$$P(\text{OR}) = 1 - \prod_{i=1}^{n} (1 - P(\text{parent}_i))$$

---

## 🔹 Lite Mode: Robust Belief Propagation

### Core Propagation Algorithm

**Input Parameters:**
- $P_{base}$: Prior probability (0.5 for assertions)
- $\mathcal{E}$: Set of incoming edges  
- $\epsilon$: Numerical stability (0.01)
- $k_{sat}$: Saturation strength (1.0)

### Mathematical Steps

**Step 1: Epsilon Clamping**
$$P_{clamped} = \min(\max(P, \epsilon), 1-\epsilon)$$

**Step 2: Logit Transformation**
$$\text{logit}(P) = \ln\left(\frac{P}{1-P}\right)$$

$$\text{priorOdds} = \text{logit}(P_{base,clamped})$$
$$\text{parentOdds}_i = \text{logit}(P_{parent_i,clamped})$$

**Step 3: Weighted Influence**
$$\text{sign}_i = \begin{cases} 
-1 & \text{if edge opposes} \\
1 & \text{otherwise}
\end{cases}$$

$$w_{eff,i} = w_i \times \text{sign}_i$$

$$\Delta_{odds} = \sum_{i \in \mathcal{E}} w_{eff,i} \times (\text{parentOdds}_i - \text{priorOdds})$$

**Step 4: Saturation Function**
$$W_{total} = \sum_{i \in \mathcal{E}} |w_{eff,i}|$$

$$\text{saturation} = 1 - e^{-k_{sat} \times W_{total}}$$

$$\Delta_{final} = \Delta_{odds} \times \text{saturation}$$

**Step 5: Final Probability**
$$\text{updatedOdds} = \text{priorOdds} + \Delta_{final}$$

$$P_{final} = \frac{1}{1 + e^{-\text{updatedOdds}}}$$

### Special Case: High-Weight Single Edge
When $|w_{eff}| \geq 0.99$:

$$P_{final} = \begin{cases}
P_{parent} & \text{if } w_{eff} > 0 \\
1 - P_{parent} & \text{if } w_{eff} < 0
\end{cases}$$

---

## 🔸 Heavy Mode: Bayesian CPT Inference

### CPT Structure
Each edge stores conditional probabilities:
- $P_{baseline}$: $P(\text{child} = \text{true} | \text{no parent info})$ [%]
- $P_{true}$: $P(\text{child} = \text{true} | \text{parent} = \text{true})$ [%]
- $P_{false}$: $P(\text{child} = \text{true} | \text{parent} = \text{false})$ [%]

### Single Parent Calculation
For edge $A \rightarrow B$:

$$P(B) = P(B|A) \cdot P(A) + P(B|\neg A) \cdot P(\neg A)$$

Where:
$$P(B|A) = \min(\max(P_{true}/100, 0.001), 0.999)$$
$$P(B|\neg A) = \min(\max(P_{false}/100, 0.001), 0.999)$$

### Multiple Parent Calculation (Naive Bayes)

**Step 1:** Initialize neutral log-odds
$$\text{logOdds} = 0$$

**Step 2:** For each parent edge $i$:
$$P(\text{child}|A_i) = P(\text{child}|A_i=\text{true}) \cdot P(A_i) + P(\text{child}|A_i=\text{false}) \cdot (1-P(A_i))$$

$$\text{LR}_i = \frac{P(\text{child}|A_i)}{1 - P(\text{child}|A_i)}$$

$$\text{logOdds} \leftarrow \text{logOdds} + \ln(\text{LR}_i)$$

**Step 3:** Convert to probability
$$P_{final} = \frac{e^{\text{logOdds}}}{1 + e^{\text{logOdds}}}$$

---

## 🔄 Convergence Mathematics

### Edge Weight Convergence
$$w_{computed}^{(t+1)} = w_{base}$$

**Convergence condition:**
$$\max_{\text{edges}} |w_{computed}^{(t+1)} - w_{computed}^{(t)}| < \tau$$

### Node Probability Convergence  
$$P_{node}^{(t+1)} = f(\text{nodeType}, \text{parents}, \{w_{computed}^{(t+1)}\})$$

**Convergence condition:**
$$\max_{\text{nodes}} |P_{node}^{(t+1)} - P_{node}^{(t)}| < \tau$$

Where $\tau = 0.001$ (tolerance) and maximum iterations = 30.

---

## 💪 Robustness Calculation

### Absolute Evidence Intensity
$$\text{AEI} = \sum_{i \in \mathcal{E}_{valid}} |w_{modified,i}|$$

### Robustness Score
$$\text{robustness} = 1 - e^{-k \times \text{AEI}}$$

---

## 🚫 Cycle Prevention

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

## ⚙️ Mathematical Constants

```python
# Probability bounds
FACT_PROB = 0.99              # Lite mode fact probability  
epsilon = 0.01                # Numerical stability bound
saturationK = 1.0             # Saturation strength

# Convergence parameters  
tolerance = 0.001             # Convergence threshold
maxIters = 30                 # Maximum iterations

# Weight bounds
WEIGHT_MIN = 0.01             # Minimum edge weight magnitude
```

---

## 🎯 Key Mathematical Properties

### Probability Conservation
$$\forall \text{ nodes } n: P(n) \in [0,1]$$

### Convergence Guarantee  
$$\lim_{t \to \infty} |P^{(t+1)} - P^{(t)}| \to 0$$

### Bayesian Soundness
Heavy mode satisfies:
$$P(B|A_1, A_2, \ldots, A_n) = \frac{\prod_i P(B|A_i) \cdot P(A_i)}{P(B)} \text{ (under independence)}$$

### Numerical Stability
$$\forall P \text{ in calculations}: P \in [\epsilon, 1-\epsilon]$$

This ensures all logit operations remain finite and well-defined.
