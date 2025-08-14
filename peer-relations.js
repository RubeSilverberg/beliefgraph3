// peer-relations.js (clean implementation with overlay toggle)
// Symmetric peer relations (alignment / antagonism) adjust only displayProb (visual layer) – core prob propagation unchanged.
// Stored per node: data('peerLinks') = [{ peerId, relation: 'aligned'|'antagonistic', strength }]
// Public exports: addPeerRelation, removePeerRelation, listPeerRelations, applyPeerInfluence, installPeerRelationUI, startPeerRelationMode

const DEFAULT_STRENGTH = 0.15;
const MAX_ABS_DELTA = 0.25;

function _getLinks(node){ return node.data('peerLinks') || []; }
function _setLinks(node, links){ if(!links || !links.length) node.removeData('peerLinks'); else node.data('peerLinks', links); }
function _hasRelation(a,b,relation){ return _getLinks(a).some(l => l.peerId === b.id() && (!relation || l.relation === relation)); }

export function addPeerRelation(cy, a, b, relation, strength = DEFAULT_STRENGTH){
	if(!cy || !a || !b) return; if(a.id() === b.id()) return; if(_hasRelation(a,b,relation)) return;
	// Disallow relations involving facts
	const ta = a.data('type'); const tb = b.data('type');
	if(ta === 'fact' || tb === 'fact') return;
	removePeerRelation(cy, a, b); // ensure at most one relation type per pair
	const la = _getLinks(a); la.push({ peerId:b.id(), relation, strength }); _setLinks(a, la);
	const lb = _getLinks(b); lb.push({ peerId:a.id(), relation, strength }); _setLinks(b, lb);
}

export function removePeerRelation(cy, a, b){
	if(!cy || !a || !b) return;
	_setLinks(a, _getLinks(a).filter(l => l.peerId !== b.id()));
	_setLinks(b, _getLinks(b).filter(l => l.peerId !== a.id()));
}

export function listPeerRelations(node){ return _getLinks(node); }

export function clearAllPeerRelationsForNode(cy, node){
	if(!cy || !node) return;
	const links = _getLinks(node);
	links.forEach(l => {
		const other = cy.getElementById(l.peerId);
		if(other && other.isNode()) removePeerRelation(cy, node, other);
	});
}

// Remove any peer relations involving facts (run when node types change)
export function pruneFactRelations(cy){
	if(!cy) return; let removed = 0;
	const toClear = [];
	cy.nodes().forEach(n => {
		if(n.data('type') !== 'fact') return;
		const links = _getLinks(n);
		if(links.length) toClear.push(n);
	});
	toClear.forEach(n => { clearAllPeerRelationsForNode(cy, n); removed++; });
	// Also remove one-sided links pointing to facts
	const factIds = new Set(cy.nodes().filter(n => n.data('type')==='fact').map(n => n.id()));
	cy.nodes().forEach(n => {
		if(factIds.has(n.id())) return;
		const links = _getLinks(n);
		const filtered = links.filter(l => !factIds.has(l.peerId));
		if(filtered.length !== links.length){ _setLinks(n, filtered); removed++; }
	});
	return removed;
}

export function applyPeerInfluence(cy){
	if(!cy) return;
	// Prune any relations involving facts (in case of type changes)
	pruneFactRelations(cy);
	// Clear previous adjustment markers
	cy.nodes().forEach(n => { n.removeData('displayProb'); n.removeData('peerAdjusted'); });
	cy.nodes().forEach(node => {
		const base = node.data('prob');
		if(typeof base !== 'number') return; // only adjust lite-mode probabilities
		if(node.data('type') === 'fact') return; // no adjustments to facts
		const links = _getLinks(node);
		if(!links.length) return;
		let delta = 0;
		for(const l of links){
			const peer = cy.getElementById(l.peerId);
			if(!peer || !peer.isNode()) continue;
			if(peer.data('type') === 'fact') continue; // skip facts
			const pp = peer.data('prob');
			if(typeof pp !== 'number') continue;
			const diff = pp - base; // positive if peer higher
			if(l.relation === 'aligned') delta += l.strength * diff;
			else if(l.relation === 'antagonistic') delta -= l.strength * diff;
		}
		if(delta >  MAX_ABS_DELTA) delta =  MAX_ABS_DELTA;
		if(delta < -MAX_ABS_DELTA) delta = -MAX_ABS_DELTA;
		const adj = Math.min(1, Math.max(0, base + delta));
		if(Math.abs(adj - base) > 0.0005){
			node.data('displayProb', adj);
			node.data('peerAdjusted', true);
		}
	});
	if(!window._peerOverlayHidden) _drawOverlays(cy); else _clearOverlays(cy);
}

export function ensurePeerRelationSymmetry(cy){
	if(!cy) return;
	let repaired = 0;
	const byId = new Map();
	cy.nodes().forEach(n => byId.set(n.id(), n));
	cy.nodes().forEach(a => {
		const links = _getLinks(a);
		const filtered = [];
		links.forEach(l => {
			if(l.peerId === a.id()) return; // drop self relation
			const b = byId.get(l.peerId);
			if(!b){ repaired++; return; }
			// ensure counterpart exists with same relation
			const bLinks = _getLinks(b);
			const match = bLinks.find(x => x.peerId === a.id());
			if(!match){ bLinks.push({ peerId: a.id(), relation: l.relation, strength: l.strength }); _setLinks(b, bLinks); repaired++; }
			else if(match.relation !== l.relation || match.strength !== l.strength){ match.relation = l.relation; match.strength = l.strength; repaired++; }
			filtered.push(l);
		});
		_setLinks(a, filtered);
	});
	if(repaired) { applyPeerInfluence(cy); if(window.computeVisuals) window.computeVisuals(cy); }
	return repaired;
}

// --- Overlay Drawing ---
function _clearOverlays(cy){ const parent = cy.container().parentElement; if(parent) parent.querySelectorAll('.peer-rel-line').forEach(el => el.remove()); }
function _drawOverlays(cy){
	const parent = cy.container().parentElement; if(!parent) return;
	_clearOverlays(cy);
	const drawn = new Set();
	const pan = cy.pan();
	const zoom = cy.zoom();
	const mkKey = (a,b)=> a<b ? a+'__'+b : b+'__'+a;
	// Helper: clip line from node center toward target to node's bounding box edge, then extend slightly outward
	const clipFromCenter = (ele, cx, cy, tx, ty, outward=10) => {
		const bb = ele.renderedBoundingBox ? ele.renderedBoundingBox() : ele.boundingBox();
		const x1 = cx, y1 = cy, x2 = tx, y2 = ty;
		const dx = x2 - x1, dy = y2 - y1;
		const INF = 1e9;
		let bestT = INF, ix = x1, iy = y1;
		if (Math.abs(dx) > 1e-6) {
			const tL = (bb.x1 - x1) / dx; const yL = y1 + tL*dy; if (tL > 0 && yL >= bb.y1 && yL <= bb.y2 && tL < bestT) { bestT = tL; ix = bb.x1; iy = yL; }
			const tR = (bb.x2 - x1) / dx; const yR = y1 + tR*dy; if (tR > 0 && yR >= bb.y1 && yR <= bb.y2 && tR < bestT) { bestT = tR; ix = bb.x2; iy = yR; }
		}
		if (Math.abs(dy) > 1e-6) {
			const tT = (bb.y1 - y1) / dy; const xT = x1 + tT*dx; if (tT > 0 && xT >= bb.x1 && xT <= bb.x2 && tT < bestT) { bestT = tT; ix = xT; iy = bb.y1; }
			const tB = (bb.y2 - y1) / dy; const xB = x1 + tB*dx; if (tB > 0 && xB >= bb.x1 && xB <= bb.x2 && tB < bestT) { bestT = tB; ix = xB; iy = bb.y2; }
		}
		if (bestT === INF) return { x: x1, y: y1 }; // fallback
		const len = Math.sqrt(dx*dx + dy*dy) || 1; const nx = dx/len, ny = dy/len;
		return { x: ix + nx * outward, y: iy + ny * outward };
	};
	cy.nodes().forEach(a => {
		if(a.data('type') === 'fact') return; // no overlays for facts
		const links = _getLinks(a);
		const posA = a.position();
		links.forEach(l => {
			const b = cy.getElementById(l.peerId); if(!b || a.id() === b.id()) return;
			if(b.data('type') === 'fact') return; // no overlays to facts
			const key = mkKey(a.id(), b.id()); if(drawn.has(key)) return; drawn.add(key);
			const posB = b.position();
			const x1c = posA.x * zoom + pan.x; const y1c = posA.y * zoom + pan.y;
			const x2c = posB.x * zoom + pan.x; const y2c = posB.y * zoom + pan.y;
			// Clip to each node's rendered bounding box to avoid overlapping labels and shapes
			const p1 = clipFromCenter(a, x1c, y1c, x2c, y2c, 6);
			const p2 = clipFromCenter(b, x2c, y2c, x1c, y1c, 6);
			const x1 = p1.x, y1 = p1.y; const x2 = p2.x, y2 = p2.y;
			const dx = x2 - x1; const dy = y2 - y1; const len = Math.sqrt(dx*dx + dy*dy); const angle = Math.atan2(dy,dx)*180/Math.PI;
			const line = document.createElement('div');
			line.className = 'peer-rel-line';
			line.style.position='absolute'; line.style.left=x1+'px'; line.style.top=y1+'px'; line.style.width=len+'px'; line.style.height='0';
			const color = l.relation === 'aligned' ? '#2e7d32' : '#c62828';
			line.style.borderTop = `2px ${l.relation === 'aligned' ? 'solid':'dashed'} ${color}`;
			line.style.transformOrigin='0 0'; line.style.transform=`rotate(${angle}deg)`; line.style.pointerEvents='none'; line.style.opacity='0.6';
			line.title = `${a.data('displayLabel')||a.id()} ↔ ${b.data('displayLabel')||b.id()} (${l.relation})`;
			parent.appendChild(line);
		});
	});
	if(!cy._peerRelListeners){
		const schedule = () => { if(!window._peerOverlayHidden) _drawOverlays(cy); };
		cy.on('pan zoom position drag free add remove', schedule);
		window.addEventListener('resize', schedule);
		cy._peerRelListeners = true;
	}
}

// --- Interactive Picking ---
let _relationMode = null; // { sourceId, relation }
function _clearBanner(){ const b = document.getElementById('peer-rel-banner'); if(b) b.remove(); }
function _showBanner(text){
	_clearBanner();
	const div = document.createElement('div');
	div.id='peer-rel-banner';
	div.style.position='fixed'; div.style.top='8px'; div.style.left='50%'; div.style.transform='translateX(-50%)';
	div.style.background='#222'; div.style.color='#fff'; div.style.padding='8px 14px'; div.style.borderRadius='18px';
	div.style.font='13px/1.3 system-ui,Segoe UI,Arial'; div.style.boxShadow='0 2px 6px rgba(0,0,0,0.25)'; div.style.zIndex=10000;
	div.textContent = text + '  (Esc to cancel)';
	document.body.appendChild(div);
}

export function startPeerRelationMode({ cy, sourceNode, relation }){
	// Disallow starting from facts
	if(sourceNode.data('type') === 'fact') { _relationMode = null; return; }
	_relationMode = { sourceId: sourceNode.id(), relation };
	_showBanner(`Select a second node to set ${relation} with "${(sourceNode.data('displayLabel')||sourceNode.data('origLabel')||sourceNode.id())}"`);
}

export function installPeerRelationUI(cy){
	document.addEventListener('keydown', e => { if(e.key==='Escape' && _relationMode){ _relationMode=null; _clearBanner(); }});
	cy.on('tap','node', evt => {
		if(!_relationMode) return;
		const source = cy.getElementById(_relationMode.sourceId);
		const target = evt.target;
	if(!source || source.id()===target.id()){ _relationMode=null; _clearBanner(); return; }
	// Prevent creating relations with facts
	if(source.data('type') === 'fact' || target.data('type') === 'fact'){ _relationMode=null; _clearBanner(); return; }
		if(_hasRelation(source,target)) removePeerRelation(cy, source, target); else addPeerRelation(cy, source, target, _relationMode.relation);
		applyPeerInfluence(cy);
		if(window.computeVisuals) window.computeVisuals(cy);
		_relationMode=null; _clearBanner();
	});
	cy.on('tap', evt => { if(evt.target === cy && _relationMode){ _relationMode=null; _clearBanner(); }});
}

// Global helpers / overlay toggle persistence
if(typeof window !== 'undefined'){
	window.listPeerRelations = listPeerRelations;
	window.addPeerRelation = (a,b,r,str)=> addPeerRelation(window.cy, a, b, r, str);
	window.removePeerRelation = (a,b)=> removePeerRelation(window.cy, a, b);
	window.startPeerRelationMode = (opts)=> startPeerRelationMode(opts);
	window.applyPeerInfluence = (cy)=> applyPeerInfluence(cy || window.cy);
	window.clearAllPeerRelationsForNode = (node)=> clearAllPeerRelationsForNode(window.cy, node);
	window.pruneFactRelations = (cy)=> pruneFactRelations(cy || window.cy);
	window.togglePeerOverlay = ()=> { window._peerOverlayHidden = !window._peerOverlayHidden; if(window._peerOverlayHidden){ _clearOverlays(window.cy); } else { applyPeerInfluence(window.cy); } localStorage.setItem('peerOverlayHidden', window._peerOverlayHidden ? '1':'0'); };
	const pref = localStorage.getItem('peerOverlayHidden'); if(pref==='1') window._peerOverlayHidden = true;
		window.ensurePeerRelationSymmetry = (cy)=> ensurePeerRelationSymmetry(cy || window.cy);
}

