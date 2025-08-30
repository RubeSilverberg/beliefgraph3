/* spec-runner.js
 * Lightweight runner for custom graph spec (heavy/lite/do) in tests/dev-tools.
 * - Deterministic logic: OR/AND/NOT/THRESHOLD
 * - Heavy combine with independent parent influences or logistic (lite placeholder)
 * - Do-interventions: clamp nodes and cut incoming effects in computation
 * - Time unrolling for DBN (replicate 2026 block to 2027..2030 with Adoption_t-1 -> Adoption_t)
 * - Converts to Cytoscape elements for visualization in the main app
 */
(function(global){
  function deepClone(o){ return JSON.parse(JSON.stringify(o)); }
  function clamp01(x){ x = Number(x); if (isNaN(x)) return 0; return Math.max(0, Math.min(1, x)); }
  function logistic(z){ return 1/(1+Math.exp(-z)); }

  // Interpret priors which may be categorical. We treat last provided state as the active default if given as a map,
  // otherwise allow numeric prior via {p: number} or {yes:prob} for binary. We normalize to boolean-esque p in [0,1].
  function priorToP(node){
    const pr = node.prior || {};
    // Direct numeric p
    if (typeof pr.p === 'number') return clamp01(pr.p);
    // Binary yes/no or similar
    const stateKeys = Object.keys(pr);
    if (stateKeys.length){
      // If the node has explicit states and a designated default state assigned a probability, map to boolean "passes" later.
      // As a simple heuristic here, if there's a state that sounds affirmative (yes/true/direct/high/above/mid/ok/meets/med/low/late), map to mid-probability.
      // Better: if exactly one key has a numeric, assume that state's mass and use 1 for that state vs others 0.
      const onlyKey = stateKeys.length===1 ? stateKeys[0] : null;
      if (onlyKey && typeof pr[onlyKey] === 'number'){
        // For categorical, we store the mode and use 1 if a THRESHOLD considers it a pass; otherwise 0 at source.
        // For non-deterministic targets (like Adoption_2025 with {p:0.10}) caller should use p.
        // Here return null so deterministic nodes can derive from state; probabilistic consumers can override with p.
        return null;
      }
    }
    return null;
  }

  function evalDeterministic(nodeId, spec, ctx){
    const n = spec.nodeIndex[nodeId];
    if (!n || !n.deterministic) return undefined;
    const d = n.deterministic;

  function valOf(id){
      // Deterministic inputs are boolean in this phase.
      if (id in ctx.boolCache) return ctx.boolCache[id];
      // If parent is deterministic, evaluate recursively.
      const pn = spec.nodeIndex[id];
      if (pn && pn.deterministic){
        const v = !!evalDeterministic(id, spec, ctx);
        ctx.boolCache[id] = v; return v;
      }
      // If parent is base assertion with states and a THRESHOLD will check for categories later; here support pass-by-default via states in ctx.stateMap.
      const s = ctx.stateMap[id];
      if (s !== undefined) return !!s;
      return false;
    }

    switch(d.type){
      case 'OR': {
        const res = (d.inputs||[]).some(valOf); ctx.boolCache[nodeId]=res; return res;
      }
      case 'AND': {
        const res = (d.inputs||[]).every(valOf); ctx.boolCache[nodeId]=res; return res;
      }
      case 'NOT': {
        const a = (d.inputs||[])[0]; const res = !valOf(a); ctx.boolCache[nodeId]=res; return res;
      }
      case 'THRESHOLD': {
        // For THRESHOLD, we treat input categorical state and passes list.
        const src = (d.inputs||[])[0];
        const passes = (d.params && (d.params.passes||d.params.threshold||[])) || [];
        const observedState = ctx.catState[src];
        const res = observedState ? passes.includes(observedState) : false;
        ctx.boolCache[nodeId]=res; return res;
      }
      default: return undefined;
    }
  }

  function getActivation(nodeId, ctx){
    // 0..1 activation for a parent (boolean or probability if available)
    if (nodeId in ctx.probCache) return clamp01(ctx.probCache[nodeId]);
    if (nodeId in ctx.boolCache) return ctx.boolCache[nodeId] ? 1 : 0;
    // From manual state overrides
    if (nodeId in ctx.stateMap) return ctx.stateMap[nodeId] ? 1 : 0;
    return 0;
  }

  function computeHeavyTarget(targetId, parents, params, ctx){
    // params.influences: map parentId -> influence (can be negative)
    // params.bias: additive bias after combination (as probability/logit? We'll apply in prob space with clamp)
    const infl = params && params.influences || {};
    let posProd = 1; // for independent 1 - Π(1-p_i)
    let negProd = 1; // treat negative as reducing probability via an opposing channel
    parents.forEach(pid => {
      const a = clamp01(getActivation(pid, ctx));
      const w = Number(infl[pid]);
      if (!isFinite(w) || w===0) return;
      if (w > 0){
        const p = clamp01(w) * a;
        posProd *= (1 - p);
      } else {
        const nmag = clamp01(-w);
        const p = nmag * a;
        negProd *= (1 - p);
      }
    });
    let pPos = 1 - posProd;
    let pNeg = 1 - negProd;
    // Combine positive and negative as: final = 1 - (1 - pPos) * (1 - max(0, pNeg)) per spec hint
    const p = 1 - (1 - pPos) * (1 - Math.max(0, pNeg));
    const withBias = clamp01(p + (params && typeof params.bias==='number' ? params.bias : 0));
    return withBias;
  }

  function getSignal(nodeId, ctx){
    // Signal is boolean readiness for parents; deterministic evaluations produce boolean
    if (nodeId in ctx.boolCache) return ctx.boolCache[nodeId];
    // Evaluate deterministic if needed
    const n = ctx.spec.nodeIndex[nodeId];
    if (n && n.deterministic){
      return evalDeterministic(nodeId, ctx.spec, ctx);
    }
    // Otherwise from catState fallback (for raw assertions used in thresholds)
    return !!ctx.stateMap[nodeId];
  }

  function buildSpec(raw){
    const spec = deepClone(raw);
    spec.nodeIndex = Object.create(null);
    (spec.nodes||[]).forEach(n=>{ spec.nodeIndex[n.id] = n; });
    return spec;
  }

  function inferAssumptions(spec){
    const a = [];
    a.push('- THRESHOLD nodes read categorical states from prior keys (single provided key is treated as mode).');
    a.push('- Deterministic nodes produce boolean signals for heavy target combination.');
    a.push('- Heavy combine uses independent influences with support for negative weights and bias in probability space.');
    a.push('- Lite mode placeholder routes to logistic(weighted sum); not used unless mode:"lite".');
    return a;
  }

  // Parse categorical priors to choose a default state label for threshold checks.
  function computeCatStateMap(spec){
    const cat = {}; // nodeId -> chosen state label
    (spec.nodes||[]).forEach(n=>{
      if (!n.states || !Array.isArray(n.states) || !n.prior) return;
      // Choose the only key present in prior, else default to first state
      const keys = Object.keys(n.prior);
      if (keys.length===1) {
        cat[n.id] = keys[0];
      } else if (keys.length>1) {
        // Pick the state with max value
        let best = keys[0], bv = n.prior[keys[0]];
        keys.forEach(k=>{ if (n.prior[k] > bv){ best=k; bv=n.prior[k]; } });
        cat[n.id] = best;
      } else {
        cat[n.id] = n.states[0];
      }
    });
    return cat;
  }

  function runScenario(spec, run){
    // Build context
    const ctx = {
      spec,
      boolCache: Object.create(null), // deterministic node cache
      stateMap: Object.create(null),  // boolean map for raw assertions if needed
      catState: computeCatStateMap(spec), // selected categorical state
      doMap: Object.create(null),
      probCache: Object.create(null)
    };

    // Apply do[] by clamping state/logic outputs of targets; here we clamp only for targets or mediators if provided
    (run.do||[]).forEach(d=>{ ctx.doMap[d.node] = d.set; });
    // Materialize do[] into state maps:
    Object.entries(ctx.doMap).forEach(([id, setVal]) => {
      const n = spec.nodeIndex[id] || {};
      if (typeof setVal === 'number') {
        ctx.probCache[id] = clamp01(setVal);
      } else {
        const sval = String(setVal).toLowerCase();
        if (n.states && n.states.includes(setVal)) {
          // categorical assignment
          ctx.catState[id] = setVal;
        } else if (['yes','true','on','1'].includes(sval)) {
          ctx.stateMap[id] = true;
          ctx.boolCache[id] = true;
        } else if (['no','false','off','0'].includes(sval)) {
          ctx.stateMap[id] = false;
          ctx.boolCache[id] = false;
        }
      }
    });

    // Evaluate deterministic nodes first in topo order over deterministic-only subgraph
    spec.nodes.forEach(n=>{ if (n.deterministic) evalDeterministic(n.id, spec, ctx); });

    // Compute targets
    const target = spec.combine && spec.combine.target;
    let targetParents = [];
    if (target){
      // Parents: incoming edges to target
      targetParents = (spec.edges||[]).filter(e => e.to===target).map(e => e.from);
    }

    const probs = {};
    // If target exists and combine defined
    if (target && spec.combine){
      const method = spec.combine.method || 'independent_parents_or_logistic';
      // Special handling: adoption_dbn_v1 compute across years 2026..2030 using same combine structure
      if (spec.graphId === 'adoption_dbn_v1'){
        // Seed Adoption_2025 from prior if available
        const n2025 = spec.nodeIndex['Adoption_2025'];
        if (n2025 && n2025.prior && typeof n2025.prior.p === 'number') ctx.probCache['Adoption_2025'] = clamp01(n2025.prior.p);
        // Iterate years
        const years = [2026,2027,2028,2029,2030];
        years.forEach(yr => {
          const tgt = `Adoption_${yr}`;
          const infl = spec.combine.params && spec.combine.params.influences || {};
          const parents = [`Adoption_${yr-1}`, `Tailwind_${yr}`, `Friction_${yr}`].filter(id => spec.nodeIndex[id]);
          const p = (method==='independent_parents_or_logistic')
            ? computeHeavyTarget(tgt, parents, { influences: remapInfluences(infl, yr), bias: spec.combine.params?.bias||0 }, ctx)
            : clamp01(logistic(((spec.combine.params?.bias)||0) + parents.reduce((acc,id)=> acc + (infl[mapYear(id,yr)]||0) * (getActivation(id,ctx)||0), 0)));
          ctx.probCache[tgt] = p; probs[tgt] = p;
        });
        // Viability at 2030
        probs['ViableSolutions_2030'] = (ctx.probCache['Adoption_2030'] >= 0.6) ? 1 : 0;
      } else {
        if (ctx.doMap[target] !== undefined){
          // Hard set if do() applied to target
          const v = ctx.doMap[target];
          probs[target] = (v === 1 || v === 'yes' || v === true) ? 1 : 0;
        } else {
          if (method === 'independent_parents_or_logistic'){
            const p = computeHeavyTarget(target, targetParents, spec.combine.params||{}, ctx);
            ctx.probCache[target] = p; probs[target] = p;
          } else {
            // Placeholder: logistic over weighted signals
            const infl = (spec.combine.params && spec.combine.params.influences) || {};
            let z = (spec.combine.params && spec.combine.params.bias) || 0;
            targetParents.forEach(pid => { const s = getActivation(pid, ctx); z += (infl[pid]||0) * s; });
            const p = clamp01(logistic(z));
            ctx.probCache[target] = p; probs[target] = p;
          }
        }
      }
    }

    // Return snapshot of relevant nodes and all deterministic boolean values for inspection
    return { probs, bools: ctx.boolCache, catState: ctx.catState };
  }

  // Unroll DBN block 2026 -> copy for 2027..2030
  function unrollAdoptionDBN(spec){
    const years = [2027, 2028, 2029, 2030];
    const baseYear = 2026;
    function repl(id, yr){ return String(id).replace(String(baseYear), String(yr)); }

    years.forEach(yr => {
      // Duplicate nodes with _2026 → _yr
      const origNodes = spec.nodes.slice();
      origNodes.forEach(n => {
        if(!String(n.id).includes(String(baseYear))) return;
        const nn = deepClone(n); nn.id = repl(nn.id, yr);
        if (nn.deterministic && Array.isArray(nn.deterministic.inputs)){
          nn.deterministic.inputs = nn.deterministic.inputs.map(inp => repl(inp, yr));
        }
        // Remove priors for future Adoption_t (they’ll be computed)
        if (/^Adoption_\d{4}$/.test(nn.id) && yr!==2025) delete nn.prior;
        spec.nodes.push(nn);
      });
      (spec.edges||[]).forEach(e => {
        if(!String(e.from).includes(String(baseYear)) && !String(e.to).includes(String(baseYear))) return;
        const ne = deepClone(e); ne.from = repl(ne.from, yr); ne.to = repl(ne.to, yr);
        spec.edges.push(ne);
      });
      // Add temporal link Adoption_{yr-1} -> Adoption_{yr}
      const prev = `Adoption_${yr-1}`; const cur = `Adoption_${yr}`;
      spec.edges.push({ from: prev, to: cur, sign: '+' });
    });
    return spec;
  }

  function mapYear(id, yr){ return String(id).replace(/20\d{2}/, String(yr)); }
  function remapInfluences(infl, yr){
    // Map keys like Adoption_2025,Tailwind_2026,Friction_2026 to this year’s parents
    const m = {};
    Object.entries(infl||{}).forEach(([k,v]) => { m[mapYear(k, yr)] = v; });
    return m;
  }

  function prepare(raw){
    const spec0 = buildSpec(raw);
    // If adoption_dbn_v1, unroll 2027..2030
    if (spec0.graphId === 'adoption_dbn_v1') {
      unrollAdoptionDBN(spec0);
    }
    return { spec: spec0, assumptions: inferAssumptions(spec0) };
  }

  function runAll(spec){
    const results = [];
    (spec.runs||[{runId:'baseline', mode: spec.mode||'heavy'}]).forEach(run => {
      const out = runScenario(spec, run);
      results.push({ runId: run.runId || 'run', mode: run.mode||spec.mode, probs: out.probs, bools: out.bools });
    });
    // Compute deltas vs baseline if present
    const base = results.find(r => r.runId==='baseline');
    if (base){
      results.forEach(r => {
        if (r===base) return;
        r.delta = {};
        Object.keys(r.probs||{}).forEach(k => {
          const a = r.probs[k]; const b = base.probs[k];
          if (typeof a==='number' && typeof b==='number') r.delta[k] = +(a-b).toFixed(4);
        });
      });
    }
    return { graphId: spec.graphId, runs: results };
  }

  // Convert spec into Cytoscape JSON for visualization (baseline structure only)
  function toElements(spec, { baseline } = {}){
    const els = [];
    // Nodes
    (spec.nodes||[]).forEach(n => {
      const type = n.deterministic ? (n.deterministic.type==='OR' ? 'or' : (n.deterministic.type==='AND' ? 'and' : 'assertion')) : (n.kind === 'target' ? 'assertion' : 'assertion');
      els.push({ group:'nodes', data: { id:n.id, label: n.id, origLabel:n.id, type } });
    });
    // Edges from deterministic wiring and explicit edges
    (spec.nodes||[]).forEach(n => {
      if (!n.deterministic) return;
      (n.deterministic.inputs||[]).forEach((src, idx) => {
        const id = `${src}->${n.id}#${idx}`;
        els.push({ group:'edges', data: { id, source: src, target: n.id, type: 'supports', weight: 0.8 } });
      });
    });
    (spec.edges||[]).forEach((e, i) => {
      const id = e.id || `e${i}_${e.from}_${e.to}`;
      els.push({ group:'edges', data: { id, source: e.from, target: e.to, type: e.sign==='-'?'opposes':'supports', weight: e.sign==='-'? -0.6 : 0.6 } });
    });
    return els;
  }

  // Example specs (trimmed from the user’s prompt)
  const examples = {
    graph1: {
      graphId: 'winnability_driver_v1',
      mode: 'heavy',
      nodes: [
        {id:'Relationship_Strength',kind:'assertion',states:['none','indirect','direct'],prior:{direct:0.2}},
        {id:'Consortium_Member',kind:'assertion',states:['no','yes'],prior:{yes:0.3}},
        {id:'EdReports_Rating',kind:'assertion',states:['below','meets','above'],prior:{meets:0.5}},
        {id:'Evidence_Level',kind:'assertion',states:['none','quasi','RCT'],prior:{quasi:0.4}},
        {id:'K12_Alignment',kind:'assertion',states:['low','med','high'],prior:{med:0.6}},
        {id:'Interoperability',kind:'assertion',states:['low','med','high'],prior:{med:0.5}},
        {id:'Unit_Economics',kind:'assertion',states:['poor','ok','good'],prior:{ok:0.6}},
        {id:'LLM_Risk',kind:'assertion',states:['high','med','low'],prior:{med:0.5}},
        {id:'Product_Maturity',kind:'assertion',states:['early','mid','late'],prior:{mid:0.5}},

        {id:'MarketAccess',kind:'logic',deterministic:{type:'OR',inputs:['Rel_access1','Rel_access2']}},
        {id:'Rel_access1',kind:'logic',deterministic:{type:'THRESHOLD',inputs:['Relationship_Strength'],params:{passes:['indirect','direct']}}},
        {id:'Rel_access2',kind:'logic',deterministic:{type:'THRESHOLD',inputs:['Consortium_Member'],params:{passes:['yes']}}},

        {id:'Credibility',kind:'logic',deterministic:{type:'OR',inputs:['Cred1','Cred2','Cred3','Cred4']}},
        {id:'Cred1',kind:'logic',deterministic:{type:'THRESHOLD',inputs:['EdReports_Rating'],params:{passes:['meets','above']}}},
        {id:'Cred2',kind:'logic',deterministic:{type:'THRESHOLD',inputs:['Evidence_Level'],params:{passes:['quasi','RCT']}}},
        {id:'Cred3',kind:'logic',deterministic:{type:'THRESHOLD',inputs:['K12_Alignment'],params:{passes:['med','high']}}},
        {id:'Cred4',kind:'logic',deterministic:{type:'THRESHOLD',inputs:['Product_Maturity'],params:{passes:['mid','late']}}},
        {id:'ProductFit',kind:'logic',deterministic:{type:'OR',inputs:['Credibility']}},

        {id:'Low_LLM_Risk',kind:'logic',deterministic:{type:'THRESHOLD',inputs:['LLM_Risk'],params:{passes:['med','low']}}},
        {id:'Scale_enablers',kind:'logic',deterministic:{type:'OR',inputs:['InterOpPass','UnitEconPass','Low_LLM_Risk','MaturityPass']}},
        {id:'InterOpPass',kind:'logic',deterministic:{type:'THRESHOLD',inputs:['Interoperability'],params:{passes:['med','high']}}},
        {id:'UnitEconPass',kind:'logic',deterministic:{type:'THRESHOLD',inputs:['Unit_Economics'],params:{passes:['ok','good']}}},
        {id:'MaturityPass',kind:'logic',deterministic:{type:'THRESHOLD',inputs:['Product_Maturity'],params:{passes:['mid','late']}}},
        {id:'Scalability',kind:'logic',deterministic:{type:'OR',inputs:['Scale_enablers']}},

        {id:'Winnability_2030',kind:'target',heavy:{independentInfluence:0.0}}
      ],
      edges: [
        {from:'MarketAccess',to:'Winnability_2030',sign:'+'},
        {from:'ProductFit',to:'Winnability_2030',sign:'+'},
        {from:'Scalability',to:'Winnability_2030',sign:'+'}
      ],
      combine: {
        target:'Winnability_2030',
        method:'independent_parents_or_logistic',
        params:{ influences:{MarketAccess:0.35, ProductFit:0.45, Scalability:0.40}, bias:0.02 }
      },
      runs:[
        {runId:'baseline',mode:'heavy'},
        {runId:'consortium_push',mode:'do',do:[{node:'Consortium_Member',set:'yes'}]},
        {runId:'evidence_upgrade',mode:'do',do:[{node:'Evidence_Level',set:'RCT'}]}
      ]
    },
    graph2: {
      graphId:'adoption_dbn_v1', mode:'heavy',
      nodes:[
        {id:'Adoption_2025',kind:'target',prior:{p:0.10}},
        {id:'Adoption_2026',kind:'target'}, {id:'Adoption_2027',kind:'target'}, {id:'Adoption_2028',kind:'target'}, {id:'Adoption_2029',kind:'target'}, {id:'Adoption_2030',kind:'target'},
        {id:'Intervention_Funding_2026',kind:'intervention',states:['no','yes'],prior:{no:1}},
        {id:'Intervention_Consortium_2026',kind:'intervention',states:['no','yes'],prior:{no:1}},
        {id:'Intervention_TA_2026',kind:'intervention',states:['no','yes'],prior:{no:1}},
        {id:'Budget_Pressure_2026',kind:'assertion',states:['low','med','high'],prior:{med:0.6}},
        {id:'Policy_Shock_2026',kind:'assertion',states:['negative','none','positive'],prior:{none:0.7}},
        {id:'Interventions_2026',kind:'logic',deterministic:{type:'OR',inputs:['Intervention_Funding_2026','Intervention_Consortium_2026','Intervention_TA_2026']}},
        {id:'Friction_2026',kind:'logic',deterministic:{type:'OR',inputs:['FrBudget_2026','FrShock_2026']}},
        {id:'FrBudget_2026',kind:'logic',deterministic:{type:'THRESHOLD',inputs:['Budget_Pressure_2026'],params:{passes:['med','high']}}},
        {id:'FrShock_2026',kind:'logic',deterministic:{type:'THRESHOLD',inputs:['Policy_Shock_2026'],params:{passes:['negative']}}},
        {id:'Tailwind_2026',kind:'logic',deterministic:{type:'OR',inputs:['TwShock_2026','Interventions_2026']}},
        {id:'TwShock_2026',kind:'logic',deterministic:{type:'THRESHOLD',inputs:['Policy_Shock_2026'],params:{passes:['positive']}}}
      ],
      edges:[
        {from:'Adoption_2025',to:'Adoption_2026',sign:'+'},
        {from:'Tailwind_2026',to:'Adoption_2026',sign:'+'},
        {from:'Friction_2026',to:'Adoption_2026',sign:'-'}
      ],
      combine:{ target:'Adoption_2026', method:'independent_parents_or_logistic', params:{ influences:{Adoption_2025:0.30,Tailwind_2026:0.25,Friction_2026:-0.20}, bias:0.00, clip:[0,1] } },
      runs:[ {runId:'baseline',mode:'heavy'} ]
    },
    graph3: {
      graphId:'policy_mediation_v1',mode:'heavy',
      nodes:[
        {id:'Funding_Boost',kind:'intervention',states:['no','yes'],prior:{no:1}},
        {id:'Consortium_Member',kind:'mediator',states:['no','yes'],prior:{no:0.7}},
        {id:'Partnership_Leverage',kind:'mediator',states:['low','med','high'],prior:{low:0.6}},
        {id:'MarketAccess',kind:'mediator'},
        {id:'Adoption_2030',kind:'target'},
        {id:'FBoost_to_Member',kind:'logic',deterministic:{type:'THRESHOLD',inputs:['Funding_Boost'],params:{passes:['yes']}}},
        {id:'Leverage_from_Member',kind:'logic',deterministic:{type:'THRESHOLD',inputs:['Consortium_Member'],params:{passes:['yes']}}},
        {id:'Market_from_Leverage',kind:'logic',deterministic:{type:'THRESHOLD',inputs:['Partnership_Leverage'],params:{passes:['med','high']}}}
      ],
      edges:[
        {from:'FBoost_to_Member',to:'Consortium_Member',sign:'+'},
        {from:'Leverage_from_Member',to:'Partnership_Leverage',sign:'+'},
        {from:'Market_from_Leverage',to:'MarketAccess',sign:'+'},
        {from:'MarketAccess',to:'Adoption_2030',sign:'+'},
        {from:'Funding_Boost',to:'Adoption_2030',sign:'+'}
      ],
      combine:{ target:'Adoption_2030', method:'independent_parents_or_logistic', params:{ influences:{ MarketAccess:0.35, Funding_Boost:0.05 }, bias:0.0 } },
      runs:[ {runId:'baseline',mode:'heavy'} ]
    }
  };

  global.SpecRunner = { prepare, runAll, toElements, examples };
})(typeof window!=='undefined'?window:globalThis);
