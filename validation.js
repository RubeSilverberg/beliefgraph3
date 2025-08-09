// validation.js - Lightweight minimal format validator (no external deps)
// Exposes: BeliefGraphFormatValidate.validateMinimal(minimal, options)
// Options: { strict=false, checkCycles=true, allowNegativeWeights=true }
// Returns: { valid:boolean, errors: string[], warnings: string[] }
// Philosophy: Fast structural & semantic checks mirroring README rules.
(function(global){
  function validateMinimal(minimal, opts={}){
    const { strict=false, checkCycles=true, allowNegativeWeights=true } = opts;
    const errors=[]; const warnings=[];
    if(!minimal || typeof minimal !== 'object') return { valid:false, errors:['Root must be object'], warnings };
    if(!Array.isArray(minimal.nodes)) errors.push('nodes must be array');
    if(!Array.isArray(minimal.edges)) errors.push('edges must be array');
    if(errors.length) return { valid:false, errors, warnings };
    const allowedNodeTypes = ['fact','assertion','and','or','note'];
    const allowedEdgeTypes = ['supports','opposes'];
    const nodeIdSet = new Set();
    minimal.nodes.forEach((n,i)=>{
      if(!n || typeof n !== 'object'){ errors.push(`nodes[${i}] not an object`); return; }
      if(!n.id){ errors.push(`nodes[${i}] missing id`); return; }
      if(nodeIdSet.has(n.id)) errors.push(`Duplicate node id '${n.id}'`); else nodeIdSet.add(n.id);
      if(n.type && !allowedNodeTypes.includes(n.type)) errors.push(`nodes[${i}].type '${n.type}' invalid`);
      if(n.type==='note' && !n.description) warnings.push(`note node '${n.id}' missing description`);
      if(n.sizeIndex && (typeof n.sizeIndex!=='number'|| n.sizeIndex<1 || n.sizeIndex>10)) errors.push(`nodes[${i}].sizeIndex out of range 1-10`);
      if(typeof n.prob==='number' && (n.prob<0||n.prob>1)) errors.push(`nodes[${i}].prob must be 0..1`);
      if(n.cpt){ ['condTrue','condFalse','baseline'].forEach(k=>{ if(k in n.cpt && (typeof n.cpt[k] !=='number' || n.cpt[k]<0 || n.cpt[k]>100)) errors.push(`nodes[${i}].cpt.${k} must be 0..100`); }); }
    });
    const edgePairs = new Set();
    minimal.edges.forEach((e,i)=>{
      if(!e || typeof e !== 'object'){ errors.push(`edges[${i}] not an object`); return; }
      if(!e.source) errors.push(`edges[${i}] missing source`);
      if(!e.target) errors.push(`edges[${i}] missing target`);
      if(e.source && !nodeIdSet.has(e.source)) errors.push(`edges[${i}] source '${e.source}' not in nodes`);
      if(e.target && !nodeIdSet.has(e.target)) errors.push(`edges[${i}] target '${e.target}' not in nodes`);
      if(e.type && !allowedEdgeTypes.includes(e.type)) errors.push(`edges[${i}].type '${e.type}' invalid`);
      if(typeof e.weight==='number'){
        if(!allowNegativeWeights && e.weight<0) errors.push(`edges[${i}].weight negative not allowed`);
        if(e.weight < -1 || e.weight > 1) errors.push(`edges[${i}].weight must be -1..1`);
      }
      // contributingFactors (optional array of short phrases)
      if(e.contributingFactors !== undefined){
        if(!Array.isArray(e.contributingFactors)){
          errors.push(`edges[${i}].contributingFactors must be array if present`);
        } else {
          e.contributingFactors.forEach((f,fi)=>{
            if(typeof f !== 'string') errors.push(`edges[${i}].contributingFactors[${fi}] must be string`);
            else {
              const trimmed=f.trim();
              if(!trimmed) warnings.push(`edges[${i}].contributingFactors[${fi}] empty after trim`);
              if(trimmed.length>80) warnings.push(`edges[${i}].contributingFactors[${fi}] unusually long (>80 chars)`);
              if(/[.!?]$/.test(trimmed)) warnings.push(`edges[${i}].contributingFactors[${fi}] should not end with punctuation`);
              if(/\s/.test(trimmed.charAt(0))){ /* already trimmed, ignore */ }
              if(/\./.test(trimmed) && trimmed.split(/\./).length>2) warnings.push(`edges[${i}].contributingFactors[${fi}] appears to contain full sentence(s)`);
            }
          });
          // duplicate detection
          const seenCF=new Set();
          e.contributingFactors.map(f=> (f||'').trim().toLowerCase()).forEach(cf=>{ if(cf && seenCF.has(cf)) warnings.push(`edges[${i}].contributingFactors contains duplicate phrase '${cf}'`); else if(cf) seenCF.add(cf); });
        }
      }
      if(e.cpt){ ['condTrue','condFalse','baseline'].forEach(k=>{ if(k in e.cpt && (typeof e.cpt[k] !=='number' || e.cpt[k]<0 || e.cpt[k]>100)) errors.push(`edges[${i}].cpt.${k} must be 0..100`); }); }
      const pair = `${e.source}->${e.target}`;
      if(edgePairs.has(pair)) warnings.push(`Duplicate edge pair ${pair}`); else edgePairs.add(pair);
    });
    const noteIds = new Set(minimal.nodes.filter(n=>n.type==='note').map(n=>n.id));
    if(noteIds.size){
      minimal.edges.forEach((e,i)=>{ if(noteIds.has(e.source)||noteIds.has(e.target)) errors.push(`edges[${i}] connects to note node which must be isolated`); });
    }
    if(strict){
      minimal.nodes.forEach((n,i)=>{ if(!n.type) warnings.push(`nodes[${i}] missing type (will be inferred)`); });
    }
    if(checkCycles){
      const adj={}; minimal.nodes.forEach(n=>adj[n.id]=[]);
      minimal.edges.forEach(e=>{ if(adj[e.source]) adj[e.source].push(e.target); });
      const visiting=new Set(); const visited=new Set();
      function dfs(id,path){ if(visiting.has(id)){ errors.push(`Cycle detected: ${[...path,id].join(' -> ')}`); return; } if(visited.has(id)) return; visiting.add(id); path.push(id); (adj[id]||[]).forEach(n=>dfs(n,path)); path.pop(); visiting.delete(id); visited.add(id); }
      Object.keys(adj).forEach(id=>{ if(!visited.has(id)) dfs(id,[]); });
    }
    return { valid: errors.length===0, errors, warnings };
  }
  const api={ validateMinimal };
  global.BeliefGraphFormatValidate = global.BeliefGraphFormatValidate || api;
  if(typeof module!=='undefined') module.exports=api;
})(typeof window!=='undefined'?window:globalThis);

// End validation.js
