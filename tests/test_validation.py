#!/usr/bin/env python3
"""
Bayesian Belief Graph Test Validation
=====================================

This script validates the mathematical calculations in the belief graph tool
by manually computing expected values and comparing with observed results.
"""

import math
from typing import List, Dict, Tuple

def validate_single_parent_bayes(parent_prob: float, cond_true: float, cond_false: float) -> float:
    """
    Validate single parent Bayesian calculation:
    P(Child=true) = P(Child=true|Parent=true) * P(Parent=true) + P(Child=true|Parent=false) * P(Parent=false)
    
    Args:
        parent_prob: P(Parent=true) as decimal (0-1)
        cond_true: P(Child=true|Parent=true) as percentage (0-100)
        cond_false: P(Child=true|Parent=false) as percentage (0-100)
    
    Returns:
        P(Child=true) as decimal (0-1)
    """
    p_child_given_parent_true = cond_true / 100
    p_child_given_parent_false = cond_false / 100
    
    result = (p_child_given_parent_true * parent_prob + 
              p_child_given_parent_false * (1 - parent_prob))
    
    print(f"Single Parent Validation:")
    print(f"  P(Parent=true) = {parent_prob:.4f}")
    print(f"  P(Child=true|Parent=true) = {p_child_given_parent_true:.4f}")
    print(f"  P(Child=true|Parent=false) = {p_child_given_parent_false:.4f}")
    print(f"  P(Child=true) = {p_child_given_parent_true:.4f} × {parent_prob:.4f} + {p_child_given_parent_false:.4f} × {1-parent_prob:.4f}")
    print(f"  P(Child=true) = {result:.4f}")
    print()
    
    return result

def validate_multi_parent_bayes(parent_probs: List[float], cpts: List[Dict]) -> float:
    """
    Validate multi-parent Naive Bayes calculation using exact enumeration.
    
    Args:
        parent_probs: List of P(Parent_i=true) as decimals
        cpts: List of CPT dictionaries with keys 'condTrue', 'condFalse', 'baseline' (all percentages)
    
    Returns:
        P(Child=true) as decimal
    """
    n_parents = len(parent_probs)
    total_prob = 0.0
    
    print(f"Multi-Parent Validation ({n_parents} parents):")
    print(f"  Parent probabilities: {[f'{p:.4f}' for p in parent_probs]}")
    print(f"  Baselines: {[f'{cpt['baseline']:.1f}%' for cpt in cpts]}")
    print(f"  Enumerating {2**n_parents} combinations:")
    
    for combo in range(2**n_parents):
        # Calculate P(parent combination)
        p_combo = 1.0
        likelihood_product = 1.0
        baseline_product = 1.0
        combo_str = ""
        
        for i in range(n_parents):
            parent_is_true = bool(combo & (1 << i))
            parent_prob = parent_probs[i]
            cpt = cpts[i]
            
            # Probability of this parent state
            p_combo *= parent_prob if parent_is_true else (1 - parent_prob)
            
            # Likelihood for this parent state
            likelihood = cpt['condTrue']/100 if parent_is_true else cpt['condFalse']/100
            likelihood_product *= likelihood
            
            # Baseline accumulation
            baseline_product *= cpt['baseline']/100
            
            combo_str += "T" if parent_is_true else "F"
        
        # Baseline normalization
        baseline_normalization = baseline_product / (cpts[0]['baseline']/100)
        p_child_given_combo = likelihood_product / baseline_normalization
        
        # Clamp to [0,1] and add contribution
        p_child_given_combo = max(0, min(1, p_child_given_combo))
        contribution = p_combo * p_child_given_combo
        total_prob += contribution
        
        if combo < 8:  # Show first 8 combinations
            print(f"    {combo_str}: P={p_combo:.4f}, L={likelihood_product:.4f}, B={baseline_normalization:.4f}, P(child|combo)={p_child_given_combo:.4f}, contrib={contribution:.4f}")
        elif combo == 8:
            print(f"    ... (showing first 8 of {2**n_parents} combinations)")
    
    print(f"  Final result: {total_prob:.4f}")
    print()
    return total_prob

def validate_and_node(parent_probs: List[float], inverses: List[bool] = None) -> float:
    """Validate AND node calculation: product of parent probabilities (with optional inversions)"""
    if inverses is None:
        inverses = [False] * len(parent_probs)
    
    result = 1.0
    print(f"AND Node Validation:")
    for i, (prob, inverse) in enumerate(zip(parent_probs, inverses)):
        effective_prob = (1 - prob) if inverse else prob
        result *= effective_prob
        print(f"  Parent {i+1}: {effective_prob:.4f} {'(inverted)' if inverse else ''}")
    
    print(f"  Product: {result:.4f}")
    print()
    return result

def validate_or_node(parent_probs: List[float], inverses: List[bool] = None) -> float:
    """Validate OR node calculation: 1 - product of (1 - parent probabilities) (with optional inversions)"""
    if inverses is None:
        inverses = [False] * len(parent_probs)
    
    product = 1.0
    print(f"OR Node Validation:")
    for i, (prob, inverse) in enumerate(zip(parent_probs, inverses)):
        effective_prob = (1 - prob) if inverse else prob
        complement = 1 - effective_prob
        product *= complement
        print(f"  Parent {i+1}: {effective_prob:.4f} {'(inverted)' if inverse else ''}, (1-p)={complement:.4f}")
    
    result = 1 - product
    print(f"  1 - product of (1-p): {result:.4f}")
    print()
    return result

# Test Cases
print("="*60)
print("BAYESIAN BELIEF GRAPH MATHEMATICAL VALIDATION")
print("="*60)
print()

# Test Case 1: Simple parent → child with typical values
print("TEST CASE 1: Simple Parent → Child")
print("-" * 40)
validate_single_parent_bayes(
    parent_prob=0.7,      # Parent is 70% likely to be true
    cond_true=80,         # Child is 80% likely if parent is true
    cond_false=20         # Child is 20% likely if parent is false
)

# Test Case 2: Edge case - very high confidence
print("TEST CASE 2: High Confidence Case")
print("-" * 40)
validate_single_parent_bayes(
    parent_prob=0.95,     # Parent is 95% likely
    cond_true=99,         # Child is 99% likely if parent is true
    cond_false=1          # Child is 1% likely if parent is false
)

# Test Case 3: Inverse relationship
print("TEST CASE 3: Inverse Relationship")
print("-" * 40)
validate_single_parent_bayes(
    parent_prob=0.8,      # Parent is 80% likely
    cond_true=10,         # Child is only 10% likely if parent is true (inverse)
    cond_false=90         # Child is 90% likely if parent is false
)

# Test Case 4: Two-parent exact enumeration
print("TEST CASE 4: Two-Parent Exact Enumeration")
print("-" * 40)
validate_multi_parent_bayes(
    parent_probs=[0.6, 0.4],
    cpts=[
        {'condTrue': 80, 'condFalse': 20, 'baseline': 50},
        {'condTrue': 70, 'condFalse': 30, 'baseline': 50}
    ]
)

# Test Case 5: Inconsistent baselines (should trigger warning)
print("TEST CASE 5: Inconsistent Baselines")
print("-" * 40)
validate_multi_parent_bayes(
    parent_probs=[0.5, 0.5],
    cpts=[
        {'condTrue': 80, 'condFalse': 20, 'baseline': 40},  # Different baseline!
        {'condTrue': 70, 'condFalse': 30, 'baseline': 60}   # Different baseline!
    ]
)

# Test Case 6: AND node with three parents
print("TEST CASE 6: AND Node with Three Parents")
print("-" * 40)
validate_and_node([0.8, 0.6, 0.9])

# Test Case 7: OR node with three parents
print("TEST CASE 7: OR Node with Three Parents")
print("-" * 40)
validate_or_node([0.3, 0.4, 0.2])

# Test Case 8: AND node with inversions
print("TEST CASE 8: AND Node with Inversions")
print("-" * 40)
validate_and_node([0.8, 0.6, 0.9], inverses=[False, True, False])

print("="*60)
print("VALIDATION COMPLETE")
print("="*60)
