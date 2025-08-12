// design-variants.js - sandbox variant switcher (no impact on main index)

const VARIANTS = {
  palette: {
    current: { label: 'Current (approx)', css: {} },
    semanticLite: { label: 'Semantic Lite', css: { '--node-assertion': '#2f6fda', '--node-fact': '#4a4f57', '--node-logic': '#7a6adb', '--node-note':'#88949f' } },
    softPastel: { label: 'Soft Pastel', css: { '--node-assertion': '#6d94e8', '--node-fact':'#5b6068', '--node-logic':'#ad9df5', '--node-note':'#a0adb8' } }
  },
  nodes: {
    current: { label: 'Current', patch: s => s },
    subtleBorders: { label: 'Subtle Borders', patch: style => {
      style.elements().filter(ele => ele.isNode()).forEach(n=>{ /* placeholder for direct styling */ });
    } },
    badgeInert: { label: 'Inert Badge', patch: style => { /* would overlay small badge */ } }
  },
  edges: {
    current: { label: 'Current', patch: ()=>{} },
    grayscaleWeight: { label: 'Grayscale Weight', patch: ()=>{} },
    hoverLabels: { label: 'Hover Labels Only', patch: ()=>{} }
  },
  tooltips: {
    current: { label: 'Current', apply: ()=>{} },
    clean: { label: 'Clean Panel', apply: ()=>{} },
    compact: { label: 'Compact', apply: ()=>{} }
  },
  focus: {
    none: { label: 'None', apply: ()=>{} },
    mildFade: { label: 'Mild Fade', apply: ()=>{} },
    strongFade: { label: 'Strong Fade', apply: ()=>{} }
  }
};

const state = {
  selected: {
    palette: 'semanticLite',
    nodes: 'current',
    edges: 'current',
    tooltips: 'current',
    focus: 'none'
  }
};

function buildRadios(groupId, obj){
  const fs = document.getElementById(groupId+'-group');
  Object.entries(obj).forEach(([key,val])=>{
    const id = groupId+'-'+key;
    const lbl = document.createElement('label');
    lbl.innerHTML = `<input type="radio" name="${groupId}" value="${key}" ${state.selected[groupId]===key?'checked':''}/> ${val.label}`;
    fs.appendChild(lbl);
  });
}
['palette','nodes','edges','tooltips','focus'].forEach(g=> buildRadios(g, VARIANTS[g]));

function applyPalette(){
  const variant = VARIANTS.palette[state.selected.palette];
  if(!variant) return;
  Object.entries(variant.css || {}).forEach(([k,v])=> document.documentElement.style.setProperty(k,v));
}

function initGraph(){
  const cy = window.cyDesign = cytoscape({
    container: document.getElementById('cy-design'),
    style: [
      { selector: 'node', style: { 'shape':'roundrectangle','background-color':'var(--node-assertion)','label':'data(label)','color':'#fff','text-wrap':'wrap','text-max-width':160,'font-size':12,'padding':'8px','border-width':1,'border-color':'var(--border-subtle)','font-family':'var(--font-stack)' }},
      { selector: 'node[type="fact"]', style: { 'background-color':'var(--node-fact)' }},
      { selector: 'node[type="fact"][inertFact]', style: { 'border-color':'var(--node-fact-inert-border)','border-width':3 }},
      { selector: 'node[type="and"], node[type="or"]', style: { 'background-color':'var(--node-logic)','shape':'diamond'}},
      { selector: 'node[type="note"]', style: { 'background-color':'var(--node-note)', 'shape':'rectangle', 'font-style':'italic'}},
      { selector: 'edge', style: { 'width':2,'line-color':'#bbb','target-arrow-shape':'triangle','target-arrow-color':'#bbb','curve-style':'bezier' }}
    ],
    elements: [
      // Sample assertion cluster
      { data:{ id:'a1', label:'Assertion Alpha'}},
      { data:{ id:'a2', label:'Assertion Beta'}},
      { data:{ id:'a3', label:'Assertion Gamma'}},
      { data:{ id:'f1', label:'Fact: Baseline', type:'fact'}},
      { data:{ id:'f2', label:'Fact: Inert', type:'fact', inertFact:true}},
      { data:{ id:'l1', label:'AND', type:'and'}},
      { data:{ id:'n1', label:'Note about context', type:'note'}},
      { data:{ id:'e1', source:'f1', target:'a1', group:'edges'}},
      { data:{ id:'e2', source:'f2', target:'a1', group:'edges'}},
      { data:{ id:'e3', source:'a1', target:'a2', group:'edges'}},
      { data:{ id:'e4', source:'a2', target:'a3', group:'edges'}},
      { data:{ id:'e5', source:'a3', target:'l1', group:'edges'}},
      { data:{ id:'e6', source:'f1', target:'l1', group:'edges'}},
      { data:{ id:'e7', source:'l1', target:'a3', group:'edges'}},
      { data:{ id:'e8', source:'n1', target:'a2', group:'edges'}},
    ],
    layout: { name:'breadthfirst', directed:true, spacingFactor:1.3 }
  });
  cy.ready(()=> cy.center());
  applyPalette();
}

initGraph();

// Event listeners
['palette','nodes','edges','tooltips','focus'].forEach(group => {
  document.getElementById(group+'-group').addEventListener('change', e => {
    if(e.target.name === group){
      state.selected[group] = e.target.value;
    }
  });
});

document.getElementById('applyVariants').addEventListener('click', ()=> {
  applyPalette();
  // (Extensions for other variant categories would go here)
});

document.getElementById('snapshotBtn').addEventListener('click', ()=> {
  const cy = window.cyDesign; if(!cy) return;
  cy.png({ output:'blob', full:true }).then(blob => {
    const url = URL.createObjectURL(blob);
    const img = document.createElement('img');
    img.src = url; img.className='snapshot-thumb';
    img.title = JSON.stringify(state.selected);
    document.getElementById('snapshotList').appendChild(img);
  });
});

document.getElementById('toggleDark').addEventListener('click', ()=> {
  document.body.classList.toggle('design-dark');
});

