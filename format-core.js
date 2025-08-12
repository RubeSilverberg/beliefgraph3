// format-core.js - Core minimal format utilities (stable experimental)
// Provides concise export/import without visual/runtime noise.
(function(global){
  function detectFormat(json){ if(Array.isArray(json)) return 'elements'; if(json&&Array.isArray(json.graph)) return 'graph-wrapper'; if(json&&Array.isArray(json.nodes)&&Array.isArray(json.edges)) return 'minimal'; return 'unknown'; }
  function nodeType(d){ const allowed=['fact','assertion','and','or','note']; return (d.type&&allowed.includes(d.type))?d.type:'assertion'; }
  function styleOut(d){ const s={}; if(d.textColor) s.textColor=d.textColor; if(d.sizeIndex&&d.sizeIndex!==3) s.sizeIndex=d.sizeIndex; if(d.floretColor) s.floretColor=d.floretColor; return Object.keys(s).length?s:undefined; }
  function pruneCpt(cpt){ if(!cpt) return; const {condTrue,condFalse,baseline,inverse}=cpt; const o={}; if(typeof condTrue==='number') o.condTrue=condTrue; if(typeof condFalse==='number') o.condFalse=condFalse; if(typeof baseline==='number') o.baseline=baseline; if(inverse===true) o.inverse=true; return Object.keys(o).length?o:undefined; }
  function exportMinimalGraph(cy,{includePositions=true,version='2'}={}){
    if(!cy) throw new Error('cy required');
    const nodes=cy.nodes().map(n=>{
      const d=n.data();
      const o={id:d.id,label:d.origLabel||d.label||d.id,type:nodeType(d)};
      if(d.hoverLabel) o.description=d.hoverLabel; // long sentence / full statement
      if(typeof d.prob==='number') o.prob=d.prob;
      if(d.type==='fact' && d.inertFact) o.inert=true;
      if(d.cpt){const pc=pruneCpt(d.cpt); if(pc) o.cpt=pc;}
      const st=styleOut(d); if(st) o.style=st;
      return o;
    });
    const edges=cy.edges().map(e=>{
      const d=e.data();
      const w=d.userAssignedWeight??d.weight;
      const o={id:d.id,source:d.source,target:d.target,type:d.type||'supports'};
      if(typeof w==='number') o.weight=w;
      if(d.rationale) o.rationale=d.rationale; // kept for backward compatibility / deep dive panel
      if(d.contributingFactors && Array.isArray(d.contributingFactors) && d.contributingFactors.length){
        // Store as trimmed unique factors (preserve order)
        const seen=new Set();
        o.contributingFactors=d.contributingFactors.map(f=> (f||'').trim()).filter(f=>{ if(!f||seen.has(f)) return false; seen.add(f); return true; });
      }
      if(d.cpt){const pc=pruneCpt(d.cpt); if(pc) o.cpt=pc;}
      return o;
    });
    const out={version,nodes,edges};
    const ann=global.textAnnotations?.exportAnnotations?.(); if(ann&&ann.length) out.annotations=ann;
    if(includePositions){
      const pos={};
      cy.nodes().forEach(n=>{const p=n.position(); pos[n.id()]={x:p.x,y:p.y};});
      out.layout={positions:pos};
    }
    return out;
  }
  function normalizeFromElements(elements){
    const nodes=[]; const edges=[];
    (elements||[]).forEach(el=>{
      if(!el||!el.data) return;
      if(el.group==='nodes'||(!el.data.source&&!el.data.target)){
        const d=el.data; const o={id:d.id,label:d.origLabel||d.label||d.id,type:nodeType(d)};
        if(d.type==='fact' && d.inertFact) o.inert=true;
        if(d.hoverLabel) o.description=d.hoverLabel;
        if(typeof d.prob==='number') o.prob=d.prob;
        if(d.cpt){const pc=pruneCpt(d.cpt); if(pc) o.cpt=pc;}
        const st=styleOut(d); if(st) o.style=st;
        nodes.push(o);
      } else {
        const d=el.data; const w=d.userAssignedWeight??d.weight; const o={id:d.id,source:d.source,target:d.target,type:d.type||'supports'};
        if(typeof w==='number') o.weight=w;
        if(d.rationale) o.rationale=d.rationale;
        if(d.contributingFactors && Array.isArray(d.contributingFactors) && d.contributingFactors.length){
          const seen=new Set();
            o.contributingFactors=d.contributingFactors.map(f=> (f||'').trim()).filter(f=>{ if(!f||seen.has(f)) return false; seen.add(f); return true; });
        }
        if(d.cpt){const pc=pruneCpt(d.cpt); if(pc) o.cpt=pc;}
        edges.push(o);
      }
    });
    return {version:'2',nodes,edges};
  }
  function migrateGraphWrapper(json){ const m=normalizeFromElements(json.graph||[]); if(json.textAnnotations) m.annotations=json.textAnnotations; return m; }
  function migrateMinimalV1(json){ const c=JSON.parse(JSON.stringify(json)); c.version='2'; return c; }
  function normalizeAny(json){ const kind=detectFormat(json); switch(kind){ case 'elements': return normalizeFromElements(json); case 'graph-wrapper': return migrateGraphWrapper(json); case 'minimal': return json.version==='2'?json:migrateMinimalV1(json); default: throw new Error('Unrecognized format'); } }
  // Generate deterministic fallback positions when none are provided.
  // Strategy: attempt layered (topological) layout; on cycles fallback to circle.
  function generateFallbackPositions(minimal){
    const nodes = minimal.nodes||[];
    const edges = minimal.edges||[];
    const haveAnyProvided = nodes.some(n=> n.position || (minimal.layout && minimal.layout.positions && minimal.layout.positions[n.id]));
    if(haveAnyProvided) return null; // Respect user / stored positions if any exist (even partial for now)
    const idSet = new Set(nodes.map(n=>n.id));
    const out = {};
    // Build indegree and parent tracking
    const indeg = {}; const parents = {}; const children = {};
    nodes.forEach(n=>{ indeg[n.id]=0; parents[n.id]=new Set(); children[n.id]=new Set(); });
    edges.forEach(e=>{ if(idSet.has(e.source) && idSet.has(e.target)) { indeg[e.target]++; parents[e.target].add(e.source); children[e.source].add(e.target); } });
    // Collect roots
    const roots = nodes.filter(n=> indeg[n.id]===0).map(n=>n.id);
    // Kahn's algorithm layering
    const layer = {}; const queue=[...roots];
    roots.forEach(r=>{ layer[r]=0; });
    let processed=0; let isDag=true;
    while(queue.length){
      const id=queue.shift(); processed++;
      const l = layer[id];
      children[id].forEach(ch=>{
        // assign layer candidate
        layer[ch] = Math.max(layer[ch]||0, l+1);
        indeg[ch]--;
        if(indeg[ch]===0) queue.push(ch);
      });
    }
    if(processed !== nodes.length){
      isDag=false; // cycle present
    }
    if(isDag){
      // Radial concentric ring layout by layer
      const groups = {};
      let maxLayer = 0;
      nodes.forEach(n=>{ const l=layer[n.id]||0; maxLayer=Math.max(maxLayer,l); (groups[l]=groups[l]||[]).push(n.id); });
      // Sort ids within each group for deterministic placement
      Object.values(groups).forEach(arr=>arr.sort());
      // Base parameters (will be adaptively scaled per ring)
      const baseRadius = 160; // starting radius for first outward ring
      const minGap = 180;     // minimum additional radius per layer
      const approxNodeDiameter = 140; // heuristic average (width/height blend)
      const desiredSpacingFactor = 1.25; // >1 ensures angular gap

      function computeRingRadius(layerIndex, count){
        if(count<=0) return baseRadius + (layerIndex-1)*minGap;
        // Required circumference for spacing
        const targetCircumference = count * approxNodeDiameter * desiredSpacingFactor;
        const minLayerRadius = baseRadius + (layerIndex-1)*minGap;
        const radiusFromSpacing = targetCircumference / (2*Math.PI);
        return Math.max(minLayerRadius, radiusFromSpacing);
      }
      // If a layer is extremely large, optionally split into two concentric sub-rings to reduce overlap
      function maybeSplit(arr){
        const MAX_PER_RING = 40; // heuristic threshold
        if(arr.length <= MAX_PER_RING) return [arr];
        // Split roughly evenly into multiple rings
        const rings = [];
        let start=0;
        while(start < arr.length){
          rings.push(arr.slice(start, start+MAX_PER_RING));
          start += MAX_PER_RING;
        }
        return rings;
      }
      // If only one layer (all roots) treat as simple circle
      if(maxLayer===0){
        const arr = groups[0];
        const N = arr.length; const radius = baseRadius + 40;
        arr.forEach((id,i)=>{ const angle=(2*Math.PI*i)/N; out[id]={ x: Math.round(radius*Math.cos(angle)), y: Math.round(radius*Math.sin(angle)) }; });
        return out;
      }
      // Place layer 0 roots near center (small circle / or a single node at origin)
      const centerGroup = groups[0];
      if(centerGroup.length===1){ out[centerGroup[0]] = { x:0, y:0 }; }
      else {
        // Put multiple roots on an inner ring sized to avoid overlap with first outward ring
        const innerRadius = computeRingRadius(0.4, centerGroup.length); // fractional layer index for inner ring
        centerGroup.forEach((id,i)=>{ const a=(2*Math.PI*i)/centerGroup.length; out[id]={ x:Math.round(innerRadius*Math.cos(a)), y:Math.round(innerRadius*Math.sin(a))}; });
      }
      // Remaining layers on concentric rings (adaptive radius + optional splits)
      for(let l=1;l<=maxLayer;l++){
        const layerNodes = groups[l]||[]; if(!layerNodes.length) continue;
        const splits = maybeSplit(layerNodes); // one or more sub-rings
        splits.forEach((ringArr,idx)=>{
          const ringIndex = l + idx*0.35; // stagger sub-rings slightly outward
            const ringRadius = computeRingRadius(ringIndex, ringArr.length);
            const N = ringArr.length;
            ringArr.forEach((id,i)=>{ const angle = (2*Math.PI*i)/N + (l%2?0:Math.PI/N); out[id] = { x: Math.round(ringRadius*Math.cos(angle)), y: Math.round(ringRadius*Math.sin(angle)) }; });
        });
      }
      return out;
    }
    // Fallback circle for cyclic / fully connected case
    const N = nodes.length; const radius = Math.max(200, N*55);
    nodes.forEach((n,i)=>{ const angle = (2*Math.PI*i)/N; out[n.id]={ x: Math.round(radius*Math.cos(angle)), y: Math.round(radius*Math.sin(angle)) }; });
    return out;
  }
  function expandToElements(minimal){
    const els=[]; const fallbackPositions = generateFallbackPositions(minimal);
  minimal.nodes.forEach(n=>{ const d={id:n.id,label:n.label,origLabel:n.label,type:nodeType(n)}; if(n.description) d.hoverLabel=n.description; if(typeof n.prob==='number') d.prob=n.prob; if(n.cpt) d.cpt={...n.cpt}; if(n.inert && d.type==='fact') d.inertFact=true; if(n.style){ if(n.style.textColor) d.textColor=n.style.textColor; if(n.style.sizeIndex) d.sizeIndex=n.style.sizeIndex; if(n.style.floretColor) d.floretColor=n.style.floretColor; } const position = (minimal.layout?.positions?.[n.id]) || n.position || (fallbackPositions && fallbackPositions[n.id]); els.push({group:'nodes',data:d,position}); });
    minimal.edges.forEach(e=>{ const d={id:e.id,source:e.source,target:e.target,type:e.type||'supports'}; if(typeof e.weight==='number'){ d.weight=e.weight; d.userAssignedWeight=e.weight; } if(e.rationale) d.rationale=e.rationale; if(e.contributingFactors && Array.isArray(e.contributingFactors) && e.contributingFactors.length){ d.contributingFactors=[...e.contributingFactors]; } if(e.cpt) d.cpt={...e.cpt}; els.push({group:'edges',data:d}); });
    return els;
  }
  global.BeliefGraphFormatCore={detectFormat,exportMinimalGraph,normalizeAny,expandToElements};
})(typeof window!=='undefined'?window:globalThis);

// End of format-core.js
