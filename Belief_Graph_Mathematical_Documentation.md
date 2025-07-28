# 🧠 Belief Graph - Complete Mathematical Documentation

## 📋 Project Overview

This project implements a **sophisticated belief propagation system** using Bayesian networks with two distinct computational modes:

> **🔹 Lite Mode**: Using weighted edge influence with robust logit-based propagation  
> **🔸 Heavy Mode**: Using conditional probability tables (CPT) with proper Bayesian inference

The system supports multiple node types with different logical operations and provides robust mathematical foundations for uncertainty reasoning.

---

## 🔬 Core Mathematical Framework

### 1. Node Types and Their Mathematical Definitions

#### 1.1 📍 Fact Nodes
- **Mathematical Role**: Root nodes with fixed high probability
- **Probability Assignment**: 
  - **Lite Mode**: $P_{fact} = 0.99$ (avoiding logit infinity)
  - **Heavy Mode**: $P_{heavy} = 1.0$ (can be overridden with explicit probability)
- **Key Property**: No incoming edges, serve as evidence sources
- **Implementation**: Always marked as non-virgin, provide foundational beliefs

#### 1.2 💭 Assertion Nodes
- **Mathematical Role**: Belief nodes whose probability depends on parent influences
- **Initialization**:
  - **Lite Mode**: Virgin state ($P = \text{undefined}$) until parent influence received
  - **Heavy Mode**: $P_{heavy} = 0.5$ as latent prior
- **Probability Calculation**: See Section 2 for detailed algorithms

#### 1.3 ⚬ AND Nodes
- **Mathematical Definition**: Logical conjunction of parent probabilities
- **Formula**: 
$$P(\text{AND}) = \prod_{i=1}^{n} P(\text{parent}_i)$$
- **Implementation**: Product of all parent probabilities
- **Virgin State**: If any parent has undefined probability

#### 1.4 ⚭ OR Nodes
- **Mathematical Definition**: Logical disjunction assuming independence
- **Formula**: 
$$P(\text{OR}) = 1 - \prod_{i=1}^{n} (1 - P(\text{parent}_i))$$
- **Implementation**: One minus product of complement probabilities
- **Virgin State**: If any parent has undefined probability

#### 1.5 📝 Note Nodes
- **Purpose**: Documentation/annotation only
- **Mathematical Role**: None (no probability calculations)
- **Constraints**: Cannot have incoming or outgoing edges

---

## 🧮 Probability Propagation Algorithms

### 2.1 🔹 Lite Mode: Robust Belief Propagation

The lite mode uses a **sophisticated logit-based propagation algorithm** with epsilon clamping and saturation effects.

#### 2.1.1 Core Algorithm: `propagateFromParentsRobust`

**Input Parameters:**
- $P_{base}$: Prior probability (typically 0.5 for assertions)
- $\mathcal{E}$: Set of incoming edges
- $\epsilon$: Numerical stability parameter (0.01)
- $k_{sat}$: Saturation strength parameter (1.0)

**Mathematical Steps:**

**Step 1: Epsilon Clamping** (Numerical Stability)
$$P_{clamped} = \min(\max(P, \epsilon), 1-\epsilon)$$

**Step 2: Logit Transformation**
$$\text{logit}(P) = \ln\left(\frac{P}{1-P}\right)$$

$$\text{priorOdds} = \text{logit}(P_{base,clamped})$$
$$\text{parentOdds}_i = \text{logit}(P_{parent_i,clamped})$$

**Step 3: Weighted Influence Calculation**
$$\text{sign}_i = \begin{cases} 
-1 & \text{if edge opposes} \\
1 & \text{otherwise}
\end{cases}$$

$$w_{eff,i} = w_i \times \text{sign}_i$$

$$\Delta_{odds} = \sum_{i \in \mathcal{E}} w_{eff,i} \times (\text{parentOdds}_i - \text{priorOdds})$$

**Step 4: Saturation Function** (Prevents extreme influences)
$$W_{total} = \sum_{i \in \mathcal{E}} |w_{eff,i}|$$

$$\text{saturation} = 1 - e^{-k_{sat} \times W_{total}}$$

$$\Delta_{final} = \Delta_{odds} \times \text{saturation}$$

**Step 5: Final Probability**
$$\text{updatedOdds} = \text{priorOdds} + \Delta_{final}$$

$$P_{final} = \frac{1}{1 + e^{-\text{updatedOdds}}} = \text{sigmoid}(\text{updatedOdds})$$

#### 2.1.2 🚨 Special Case: Single High-Weight Edge
When a single edge has $|w_{eff}| \geq 0.99$:

$$P_{final} = \begin{cases}
P_{parent} & \text{if } w_{eff} > 0 \\
1 - P_{parent} & \text{if } w_{eff} < 0
\end{cases}$$

#### 2.1.3 👻 Virgin State Logic
An assertion node is **virgin** if:
- No incoming edges, **OR**
- All parent probabilities are undefined, **OR**  
- All edge weights are zero

### 2.2 🔸 Heavy Mode: Conditional Probability Tables (CPT)

Heavy mode uses **proper Bayesian inference** with conditional probability tables.

#### 2.2.1 📊 CPT Structure
Each edge stores:
- $P_{baseline}$: $P(\text{child} = \text{true} | \text{no parent info})$ [%]
- $P_{true}$: $P(\text{child} = \text{true} | \text{parent} = \text{true})$ [%]  
- $P_{false}$: $P(\text{child} = \text{true} | \text{parent} = \text{false})$ [%]
- $\text{inverse}$: Boolean flag inverting the relationship logic

#### 2.2.2 👥 Single Parent Calculation
For edge $A \rightarrow B$ with CPT:

$$P(B = \text{true}) = P(B|A=\text{true}) \cdot P(A=\text{true}) + P(B|A=\text{false}) \cdot P(A=\text{false})$$

Where:
$$P(B|A=\text{true}) = \min(\max(P_{true}/100, 0.001), 0.999)$$
$$P(B|A=\text{false}) = \min(\max(P_{false}/100, 0.001), 0.999)$$

#### 2.2.3 👥👥 Multiple Parent Calculation (Naive Bayes)
For multiple parents, assuming **conditional independence**:

**Step 1:** Start with neutral log-odds
$$\text{logOdds} = 0$$

**Step 2:** For each parent edge $i$:
$$P(\text{true}|A_i) = P(B|A_i=\text{true}) \cdot P(A_i) + P(B|A_i=\text{false}) \cdot (1-P(A_i))$$

$$P(\text{false}|A_i) = 1 - P(\text{true}|A_i)$$

$$\text{LR}_i = \frac{P(\text{true}|A_i)}{P(\text{false}|A_i)}$$

$$\text{logOdds} \leftarrow \text{logOdds} + \ln(\text{LR}_i)$$

**Step 3:** Convert back to probability
$$\text{odds} = e^{\text{logOdds}}$$
$$P_{final} = \frac{\text{odds}}{1 + \text{odds}}$$

#### 2.2.4 👻 Virgin State Logic (Heavy Mode)
An edge is **virgin** if:
- No CPT data exists, **OR**
- $P_{baseline}$, $P_{true}$, or $P_{false}$ are undefined

---

## 🔄 Convergence Algorithms

The system uses **iterative convergence** to handle cycles and complex dependencies.

### 3.1 ⚡ Edge Convergence (`convergeEdges`)
Updates computed edge weights based on modifiers:

$$w_{computed}^{(t+1)} = \begin{cases}
\text{getModifiedEdgeWeight}(\text{edge}) & \text{if target.type} = \text{assertion} \\
w_{base} & \text{otherwise}
\end{cases}$$

**Convergence Condition:**
$$\max_{\text{edges}} |w_{computed}^{(t+1)} - w_{computed}^{(t)}| < \text{tolerance}$$

### 3.2 🎯 Node Convergence (`convergeNodes`)
Updates node probabilities based on current edge weights:

$$P_{node}^{(t+1)} = f(\text{nodeType}, \text{parents}, \{w_{computed}\})$$

**Convergence Condition:**
$$\max_{\text{nodes}} |P_{node}^{(t+1)} - P_{node}^{(t)}| < \text{tolerance}$$

### 3.3 🌐 Global Convergence (`convergeAll`)
Orchestrates both edge and node convergence:
1. **Run edge convergence** ⚡
2. **Run node convergence** 🎯  
3. **Update visuals** 🎨

---

## ⚖️ Edge Weight and Modifier System

### 4.1 📊 Likert Scale Mapping
User inputs map to weights via **Likert scale**:

| Likert | -5 | -4 | -3 | -2 | -1 | 0 | 1 | 2 | 3 | 4 | 5 |
|--------|----|----|----|----|----|----|----|----|----|----|---- |
| **Weight** | -1.0 | -0.85 | -0.60 | -0.35 | -0.15 | 0.15 | 0.35 | 0.60 | 0.85 | 1.0 |

### 4.2 🔧 Modifier Application
Modifiers adjust base weights using `nudgeToBoundMultiplier`:

$$\text{frac} = \frac{|L|}{5}$$

$$w_{desired} = \begin{cases}
(1-\text{frac}) \times w_{current} + \text{frac} \times w_{bound} & \text{if } L > 0 \\
(1-\text{frac}) \times w_{current} & \text{if } L < 0
\end{cases}$$

$$\text{multiplier} = \frac{w_{desired}}{w_{current}}$$

### 4.3 ⚠️ Minimum Weight Enforcement
$$w_{final} = \begin{cases}
w_{current} & \text{if } |w_{current}| \geq w_{min} \\
w_{min} \times \text{sign}(w_{current}) & \text{otherwise}
\end{cases}$$

where $w_{min} = 0.01$

---

## 💪 Robustness Calculations

### 5.1 📈 Absolute Evidence Intensity (AEI)
For assertion nodes in lite mode:
$$\text{AEI} = \sum_{i \in \mathcal{E}_{valid}} |w_{modified,i}|$$

### 5.2 📉 Saturation Function
$$\text{robustness} = 1 - e^{-k \times \text{AEI}}$$
where $k$ is a scaling constant

### 5.3 🏷️ Robustness Labels
$$\text{robustness} \in [0,1] \rightarrow \begin{cases}
\text{"Weak"} & \text{(low robustness)} \\
\text{"Moderate"} & \\
\text{"Strong"} & \\
\text{"Very Strong"} & \text{(high robustness)}
\end{cases}$$

---

## 🎨 Visual Calculation System

### 6.1 🏷️ Node Label Generation
- **📍 Facts**: Simple label display
- **💭 Assertions**: Label + probability percentage  
- **⚬⚭ AND/OR**: Type label + calculated probability
- **📝 Notes**: User-defined text only

### 6.2 🌈 Edge Visual Properties
- **👻 Virgin edges**: 
  - 🔸 Heavy mode: Purple (`#A26DD2`)
  - 🔹 Lite mode: Orange (`#ff9900`)
- **⚡ Active edges**: Grayscale based on $|w|$
- **🎨 Color calculation**: 
$$\text{grayLevel} = 224 - (|w| \times 180)$$

### 6.3 📏 Border Width Calculation
For assertion nodes with robustness:
$$\text{borderWidth} = \max(2, \text{round}(\text{robustness} \times 10))$$

---

## 🚫 Cycle Prevention

### 7.1 🔍 Cycle Detection Algorithm
Uses **depth-first search** to detect cycles before edge creation:

```python
def wouldCreateCycle(sourceId, targetId):
    visited = set()
    
    def dfs(nodeId):
        if nodeId == sourceId:
            return True
        if nodeId in visited:
            return False
        visited.add(nodeId)
        
        for child in getChildren(nodeId):
            if dfs(child):
                return True
        return False
    
    return dfs(targetId)
```

**Time Complexity**: $O(V + E)$ where $V$ = nodes, $E$ = edges

---

## 🔀 Mode Switching and Data Isolation

### 8.1 🔹 Lite Mode Data Namespace
```python
# Node data
prob: float                    # Node probability [0,1]
isVirgin: bool                # Virgin state flag

# Edge data  
weight: float                 # Base edge weight
modifiers: List[Modifier]     # Modifier array
computedWeight: float         # Final calculated weight
```

### 8.2 🔸 Heavy Mode Data Namespace
```python
# Node data
heavyProb: float              # Node probability [0,1]

# Edge data
cpt: {                        # Conditional Probability Table
    baseline: float,          # P(child=true | no info) [%]
    condTrue: float,          # P(child=true | parent=true) [%]
    condFalse: float,         # P(child=true | parent=false) [%]
    inverse: bool             # Relationship inversion flag
}
```

### 8.3 🔒 Mode Isolation Principles
- **Namespaces are completely separate** 🚧
- **Mode switching cleans temporary display data** 🧹
- **No cross-contamination between calculation systems** ✅

---

## 🤖 Automatic Node Type Assignment

### 9.1 📊 Topology-Based Rules
$$\text{nodeType} = \begin{cases}
\text{FACT} & \text{if } |\text{incomingEdges}| = 0 \\
\text{ASSERTION} & \text{if } |\text{incomingEdges}| > 0
\end{cases}$$

*Excludes AND, OR, and NOTE nodes which maintain their types*

### 9.2 🎯 Probability Initialization
- **📍 New facts**: $P_{heavy} = 1.0$
- **💭 New assertions**: $P_{heavy} = 0.5$, $\text{isVirgin} = \text{true}$ (lite mode)

---

## ⚙️ Implementation Constants

```python
# 🔧 Core Constants
FACT_PROB = 0.99              # Lite mode fact probability
WEIGHT_MIN = 0.01             # Minimum edge weight
epsilon = 0.01                # Numerical stability ε
saturationK = 1.0             # Saturation strength
tolerance = 0.001             # Convergence tolerance
maxIters = 30                 # Maximum iterations

# 🏷️ Node Types
NODE_TYPE_FACT = "fact"
NODE_TYPE_ASSERTION = "assertion"  
NODE_TYPE_AND = "and"
NODE_TYPE_OR = "or"
NODE_TYPE_NOTE = "note"

# 🔗 Edge Types
EDGE_TYPE_SUPPORTS = "supports"
EDGE_TYPE_OPPOSES = "opposes"
```

---

## ⚠️ Error Handling and Edge Cases

### 11.1 🔢 Numerical Stability
- **Probability clamping**: All $P \in [\epsilon, 1-\epsilon]$ before logit operations
- **Division by zero protection**: In likelihood ratios
- **Infinity handling**: In exponential operations

### 11.2 👻 Virgin State Management
- **Proper undefined probability handling**
- **Cascade virgin marking through graph**
- **Mode-specific virgin detection logic**

### 11.3 🔄 Convergence Failure Handling
- **Maximum iteration limits**: $\text{maxIters} = 30$
- **Tolerance-based termination**: $\text{tolerance} = 0.001$
- **Graceful degradation on non-convergence**

---

## 🖥️ User Interface Integration

### 12.1 📋 CPT Modal (Heavy Mode)
**Step-by-step conditional probability elicitation:**
1. **📊 Baseline** → 2. **✅ True condition** → 3. **❌ False condition** → 4. **📝 Summary**

**Features:**
- 🔄 Inverse relationship handling
- ✅ Real-time constraint validation  
- 🎯 Interactive sliders with bounds checking

### 12.2 🏷️ Hover System
- **🔸🔹 Mode-specific information display**
- **👻 Virgin node/edge identification**
- **💪 Robustness visualization**
- **📊 Likelihood ratio display**

### 12.3 🤖 Node Type Automation
- **📊 Automatic fact/assertion classification**
- **🔧 Manual override capability for AND/OR/NOTE types**
- **👁️ Visual feedback for type changes**

---

## 📁 File Structure and Dependencies

### 13.1 🔧 Core Files
| File | Purpose |
|------|---------|
| `logic.js` | 🔹 Lite mode propagation algorithms |
| `bayes-logic.js` | 🔸 Heavy mode CPT calculations |
| `config.js` | ⚙️ Constants, utilities, modifier system |
| `Visuals.js` | 🎨 Visual calculations and hover system |
| `bayes-modal.js` | 📋 CPT interface with modal controls |

### 13.2 🔌 Integration Files
| File | Purpose |
|------|---------|
| `script_current.js` | 🔀 Mode switching and event handling |
| `menu.js` | 🖱️ Context menus and user interactions |
| `modals.js` | 📱 Additional UI components |
| `index.html` | 🏠 Main application structure |
| `style.css` | 🎨 Visual styling definitions |

---

## ✅ Mathematical Validation

### 14.1 🔑 Key Properties
- **📊 Probability conservation**: All $P \in [0,1]$
- **🔄 Consistency**: Convergence guarantees stable solutions
- **🔀 Commutativity**: Order-independent parent influence (within tolerance)
- **📐 Soundness**: Bayesian principles maintained throughout

### 14.2 🧪 Testing Scenarios
- **👥 Single parent → child relationships**
- **👥👥 Multiple parent convergence**
- **🔄 Circular dependency resolution**
- **👻 Virgin state transitions**
- **🔀 Mode switching consistency**

---

## 🎯 Summary

This documentation provides the **complete mathematical foundation** for recreating the belief graph system with **full fidelity** to the implemented algorithms and design principles. The system successfully combines:

> 🔹 **Robust lite mode** with logit-based propagation and saturation effects  
> 🔸 **Sophisticated heavy mode** with proper Bayesian CPT inference  
> 🤖 **Intelligent automation** with topology-based node typing  
> 🎨 **Rich visualization** with mode-specific displays and robustness indicators

The mathematical rigor ensures **reliable uncertainty reasoning** while the dual-mode architecture provides **flexibility** for different use cases and **mathematical approaches**.
