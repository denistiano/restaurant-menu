/**
 * layout-editor.js - restaurant floor-plan layout editor (v2)
 * TAP inactive = activate | TAP active = configure | HOLD = move | PINCH = zoom/pan
 */
(function () {
  'use strict';
  var HOLD_MS=420,PAN_THR=8,ZOOM_MIN=0.2,ZOOM_MAX=5.0,CELL_SIZE=60,CELL_GAP=3,CELL_PAD=10,DEF_COLS=10,DEF_ROWS=10;
  var TEMPLATES=[{label:'10 x 10',cols:10,rows:10},{label:'20 x 20',cols:20,rows:20},{label:'30 x 30',cols:30,rows:30}];
  var COMBOS=[{shape:'square',cap:2},{shape:'square',cap:4},{shape:'rect',cap:2},{shape:'rect',cap:4},{shape:'rect',cap:6},{shape:'rect',cap:8},{shape:'circle',cap:2},{shape:'circle',cap:4},{shape:'circle',cap:6},{shape:'circle',cap:8},{shape:'ellipse',cap:4},{shape:'ellipse',cap:6},{shape:'ellipse',cap:8},{shape:'ellipse',cap:10}];
  var _cfg=null,_container,_apiBase,_rid,_jwt,_dirty=false,_saving=false;
  var _lastShape='square',_lastCap=4;
  var _ptrs=new Map(),_hadMulti=false;
  var _pinching=false,_pinch0Dist=0,_pinch0Zoom=1,_pinch0Mid={x:0,y:0},_pinch0Pan={x:0,y:0};
  var _panning=false,_pan0X=0,_pan0Y=0,_pan0PX=0,_pan0PY=0;
  var _moveActive=false,_moveSrc=null,_moveHoverEl=null,_holdTimer=null,_holdTarget=null;
  var _tapPtId=null,_tapDownX=0,_tapDownY=0,_tapMoved=false;
  var _zoom=1,_panX=0,_panY=0,_isFullscreen=false;
  var _zonePlacing=false,_zoneDraftLabel='',_comboTarget=null;
  var $modeBar,$panelSimple,$panelTables,$panelGrid,$simpleCount,$tablesList;
  var $canvas,$canvasTransform,$canvasWrapper,$zonesOverlay,$colsIn,$rowsIn;
  var $saveStatus,$saveBtn,$zoomPct,$fullscreenBtn;
  var $comboOverlay,$comboSheet,$comboGrid,$comboDel,$comboRot,$comboLabel;
  window.LayoutEditor={init:init,setJwt:function(j){_jwt=j;},tableSvg:tableSvg};

  async function init(opts){
    _container=opts.container;_apiBase=opts.apiBase;_rid=opts.restaurantId;_jwt=opts.jwt;
    _container.innerHTML=_shell();_refs();_events();
    try{
      var r=await fetch(_apiBase+'/api/public/layout/'+_rid);
      if(r.status===204||r.status===404){_cfg=_dfltCfg();}
      else if(r.ok){var d=await r.json();_cfg=JSON.parse(d.configJson);}
      else{_cfg=_dfltCfg();}
    }catch(e){_cfg=_dfltCfg();}
    _dirty=false;_render();
  }
  function _dfltCfg(){return{version:2,mode:'simple',tableCount:5};}

  function _shell(){
    var tp=TEMPLATES.map(function(t){return '<button class="lf-tpl-opt" data-cols="'+t.cols+'" data-rows="'+t.rows+'">'+t.label+'</button>';}).join('');
    var rb=[0,90,180,270].map(function(d){return '<button class="lf-combo-rot-btn" data-rot="'+d+'">'+d+'&deg;</button>';}).join('');
    return '<div class="lf-wrap">'+
      '<div class="lf-mode-bar" id="lfModeBar">'+
        '<button class="lf-mode-btn" data-mode="simple">Simple</button>'+
        '<button class="lf-mode-btn" data-mode="tables">Tables</button>'+
        '<button class="lf-mode-btn" data-mode="grid">Floor Plan</button>'+
      '</div>'+
      '<div id="lfPanelSimple" class="lf-simple" style="display:none">'+
        '<span class="lf-simple__label">Number of tables</span>'+
        '<div class="lf-simple__stepper">'+
          '<button class="lf-simple__btn" id="lfMinus">&#8722;</button>'+
          '<span class="lf-simple__count" id="lfCount">5</span>'+
          '<button class="lf-simple__btn" id="lfPlus">+</button>'+
        '</div></div>'+
      '<div id="lfPanelTables" class="lf-tables" style="display:none">'+
        '<div class="lf-tables__list" id="lfTablesList"></div>'+
        '<button class="lf-tables__add" id="lfTablesAdd"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add table</button>'+
      '</div>'+
      '<div id="lfPanelGrid" style="display:none">'+
        '<div class="lf-grid-controls">'+
          '<div class="lf-grid-controls__fields">'+
            '<div class="lf-grid-controls__field"><label for="lfCols">Cols</label><input id="lfCols" class="lf-grid-controls__input" type="number" inputmode="numeric" min="3" max="30" value="'+DEF_COLS+'"/></div>'+
            '<div class="lf-grid-controls__field"><label for="lfRows">Rows</label><input id="lfRows" class="lf-grid-controls__input" type="number" inputmode="numeric" min="2" max="30" value="'+DEF_ROWS+'"/></div>'+
          '</div>'+
          '<div class="lf-grid-controls__actions">'+
            '<div class="lf-tpl-wrap"><button class="lf-ctrl-pill" id="lfTplBtn">Templates</button><div class="lf-tpl-drop" id="lfTplDrop" style="display:none">'+tp+'</div></div>'+
            '<button class="lf-ctrl-pill lf-ctrl-pill--ghost" id="lfZoneAddBtn">+ Area label</button>'+
          '</div>'+
          '<div id="lfZoneInput" class="lf-zone-input" style="display:none">'+
            '<input type="text" id="lfZoneLabelIn" class="lf-zone-input__text" placeholder="e.g. Bar, Terrace, VIP"/>'+
            '<button id="lfZonePlaceBtn" class="lf-zone-input__confirm">Tap cell to place</button>'+
            '<button id="lfZoneCancelBtn" class="lf-zone-input__cancel">&#x2715;</button>'+
          '</div>'+
          '<p class="lf-grid-hint">Tap=activate &middot; Tap active=configure &middot; Hold=move &middot; Pinch=zoom</p>'+
        '</div>'+
        '<div class="lf-canvas-wrapper" id="lfCanvasWrapper">'+
          '<div class="lf-canvas-transform" id="lfCanvasTransform">'+
            '<div class="lf-zones-overlay" id="lfZonesOverlay"></div>'+
            '<div class="lf-canvas" id="lfCanvas"></div>'+
          '</div>'+
          '<div class="lf-canvas-hud">'+
            '<span class="lf-zoom-pct" id="lfZoomPct">100%</span>'+
            '<button class="lf-hud-btn" id="lfFitBtn" title="Fit"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg></button>'+
            '<button class="lf-hud-btn" id="lfFullscreenBtn" title="Fullscreen"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg></button>'+
          '</div>'+
        '</div>'+
      '</div>'+
      '<div class="lf-save-bar"><span class="lf-save-bar__status" id="lfSaveStatus">No unsaved changes</span><button class="lf-save-btn" id="lfSaveBtn" disabled>Save layout</button></div>'+
      '</div>'+
      '<div class="lf-combo-overlay" id="lfComboOverlay" style="display:none"></div>'+
      '<div class="lf-combo-sheet" id="lfComboSheet" style="display:none">'+
        '<div class="lf-combo-sheet__handle"></div>'+
        '<div class="lf-combo-sheet__head"><span class="lf-combo-sheet__title">Choose table type</span><button class="lf-combo-sheet__close" id="lfComboClose">&#x2715;</button></div>'+
        '<div class="lf-combo-sheet__body">'+
          '<div class="lf-combo-grid" id="lfComboGrid"></div>'+
          '<div class="lf-combo-extras">'+
            '<div class="lf-combo-extras__row"><span class="lf-combo-extras__label">Rotation</span><div class="lf-combo-rot" id="lfComboRot">'+rb+'</div></div>'+
            '<div class="lf-combo-extras__row"><span class="lf-combo-extras__label">Name</span><input type="text" id="lfComboLabel" class="lf-combo-label-in" placeholder="Auto-numbered"/></div>'+
          '</div>'+
        '</div>'+
        '<div class="lf-combo-sheet__footer"><button class="lf-combo-del" id="lfComboDel">Remove table</button></div>'+
      '</div>';
  }

  function _refs(){
    $modeBar=_container.querySelector('#lfModeBar');$panelSimple=_container.querySelector('#lfPanelSimple');
    $panelTables=_container.querySelector('#lfPanelTables');$panelGrid=_container.querySelector('#lfPanelGrid');
    $simpleCount=_container.querySelector('#lfCount');$tablesList=_container.querySelector('#lfTablesList');
    $canvas=_container.querySelector('#lfCanvas');$canvasTransform=_container.querySelector('#lfCanvasTransform');
    $canvasWrapper=_container.querySelector('#lfCanvasWrapper');$zonesOverlay=_container.querySelector('#lfZonesOverlay');
    $colsIn=_container.querySelector('#lfCols');$rowsIn=_container.querySelector('#lfRows');
    $saveStatus=_container.querySelector('#lfSaveStatus');$saveBtn=_container.querySelector('#lfSaveBtn');
    $zoomPct=_container.querySelector('#lfZoomPct');$fullscreenBtn=_container.querySelector('#lfFullscreenBtn');
    $comboOverlay=_container.querySelector('#lfComboOverlay');$comboSheet=_container.querySelector('#lfComboSheet');
    $comboGrid=_container.querySelector('#lfComboGrid');$comboDel=_container.querySelector('#lfComboDel');
    $comboRot=_container.querySelector('#lfComboRot');$comboLabel=_container.querySelector('#lfComboLabel');
  }

  function _events(){
    $modeBar.addEventListener('click',function(e){var b=e.target.closest('[data-mode]');if(!b)return;_cfg.mode=b.dataset.mode;_markDirty();_render();});
    _container.querySelector('#lfMinus').addEventListener('click',function(){_cfg.tableCount=Math.max(1,(_cfg.tableCount||5)-1);_markDirty();_renderSimple();});
    _container.querySelector('#lfPlus').addEventListener('click',function(){_cfg.tableCount=Math.min(50,(_cfg.tableCount||5)+1);_markDirty();_renderSimple();});
    _container.querySelector('#lfTablesAdd').addEventListener('click',_addTable);
    $colsIn.addEventListener('change',function(){var v=_clamp(parseInt($colsIn.value,10),3,30);$colsIn.value=v;_cfg.gridCols=v;_markDirty();_renderGrid();});
    $rowsIn.addEventListener('change',function(){var v=_clamp(parseInt($rowsIn.value,10),2,30);$rowsIn.value=v;_cfg.gridRows=v;_markDirty();_renderGrid();});
    _container.querySelector('#lfTplBtn').addEventListener('click',function(e){e.stopPropagation();var d=_container.querySelector('#lfTplDrop');d.style.display=d.style.display==='none'?'':'none';});
    _container.querySelector('#lfTplDrop').addEventListener('click',function(e){var b=e.target.closest('[data-cols]');if(!b)return;_cfg.gridCols=+b.dataset.cols;_cfg.gridRows=+b.dataset.rows;_cfg.cells=[];_cfg.zones=[];$colsIn.value=_cfg.gridCols;$rowsIn.value=_cfg.gridRows;_container.querySelector('#lfTplDrop').style.display='none';_markDirty();_renderGrid();setTimeout(_fitToScreen,60);});
    document.addEventListener('click',function(e){var d=_container.querySelector('#lfTplDrop');if(d&&!e.target.closest('#lfTplBtn'))d.style.display='none';});
    _container.querySelector('#lfZoneAddBtn').addEventListener('click',function(){var zi=_container.querySelector('#lfZoneInput');zi.style.display=zi.style.display==='none'?'':'none';if(zi.style.display!=='none')_container.querySelector('#lfZoneLabelIn').focus();});
    _container.querySelector('#lfZoneCancelBtn').addEventListener('click',_cancelZonePlacement);
    _container.querySelector('#lfZonePlaceBtn').addEventListener('click',function(){var label=_container.querySelector('#lfZoneLabelIn').value.trim();if(!label){_container.querySelector('#lfZoneLabelIn').focus();return;}_zoneDraftLabel=label;_zonePlacing=true;$canvasWrapper.classList.add('lf-zone-mode');_container.querySelector('#lfZonePlaceBtn').textContent='Tap a cell…';});
    $canvasWrapper.addEventListener('pointerdown',_onPD,{passive:false});
    $canvasWrapper.addEventListener('pointermove',_onPM,{passive:false});
    $canvasWrapper.addEventListener('pointerup',_onPU,{passive:false});
    $canvasWrapper.addEventListener('pointercancel',_onPU,{passive:false});
    $canvasWrapper.addEventListener('contextmenu',function(e){e.preventDefault();});
    _container.querySelector('#lfFitBtn').addEventListener('click',_fitToScreen);
    $fullscreenBtn.addEventListener('click',_toggleFullscreen);
    $saveBtn.addEventListener('click',_save);
    $comboOverlay.addEventListener('click',_closeComboPicker);
    _container.querySelector('#lfComboClose').addEventListener('click',_closeComboPicker);
    $comboDel.addEventListener('click',function(){if(_comboTarget&&('col'in _comboTarget)){var c=_getCellAt(_comboTarget.col,_comboTarget.row);if(c)c.active=false;_markDirty();_renderGrid();}$comboDel.onclick=null;_closeComboPicker();});
    $comboRot.addEventListener('click',function(e){var b=e.target.closest('[data-rot]');if(!b||!_comboTarget||!('col'in _comboTarget))return;$comboRot.querySelectorAll('[data-rot]').forEach(function(x){x.classList.remove('is-active');});b.classList.add('is-active');var c=_getCellAt(_comboTarget.col,_comboTarget.row);if(c){c.rotation=+b.dataset.rot;_markDirty();_renderGrid();}});
    document.addEventListener('keydown',function(e){if(e.key==='Escape')_closeComboPicker();});
  }

  function _render(){
    $modeBar.querySelectorAll('.lf-mode-btn').forEach(function(b){b.classList.toggle('is-active',b.dataset.mode===_cfg.mode);});
    $panelSimple.style.display=_cfg.mode==='simple'?'':'none';$panelTables.style.display=_cfg.mode==='tables'?'':'none';$panelGrid.style.display=_cfg.mode==='grid'?'':'none';
    if(_cfg.mode==='simple')_renderSimple();if(_cfg.mode==='tables')_renderTables();if(_cfg.mode==='grid'){_renderGrid();setTimeout(_fitToScreen,60);}
  }
  function _renderSimple(){$simpleCount.textContent=_cfg.tableCount||5;}

  function _renderTables(){
    if(!_cfg.tables)_cfg.tables=[];
    $tablesList.innerHTML=_cfg.tables.map(function(t,i){
      return '<div class="lf-tcard" data-idx="'+i+'">'+tableSvg(t.shape||'square',52,t.capacity||2,false,t.rotation||0)+'<span class="lf-tcard__label">'+_esc(t.label||t.id)+'</span><span class="lf-tcard__cap">'+(t.capacity||2)+' seats</span><button class="lf-tcard__del" data-del="'+i+'">×</button></div>';
    }).join('');
    $tablesList.querySelectorAll('.lf-tcard').forEach(function(card){card.addEventListener('click',function(e){if(e.target.closest('[data-del]'))return;_openTablesCombo(parseInt(card.dataset.idx,10));});});
    $tablesList.querySelectorAll('[data-del]').forEach(function(btn){btn.addEventListener('click',function(e){e.stopPropagation();_cfg.tables.splice(parseInt(btn.dataset.del,10),1);_markDirty();_renderTables();});});
  }

  function _renderGrid(){
    if(!_cfg.cells)_cfg.cells=[];if(!_cfg.zones)_cfg.zones=[];
    var cols=_cfg.gridCols||DEF_COLS,rows=_cfg.gridRows||DEF_ROWS;
    $colsIn.value=cols;$rowsIn.value=rows;
    var byPos={};_cfg.cells.forEach(function(c){byPos[c.col+'_'+c.row]=c;});
    $canvas.style.gridTemplateColumns='repeat('+cols+', '+CELL_SIZE+'px)';$canvas.style.gridTemplateRows='repeat('+rows+', '+CELL_SIZE+'px)';
    var html='';
    for(var r=0;r<rows;r++){for(var c=0;c<cols;c++){
      var cell=byPos[c+'_'+r],active=cell&&cell.active,lbl=active?(cell.label||''):'',cap=active?(cell.capacity||0):0;
      html+='<div class="lf-cell'+(active?' is-active':'')+'" data-col="'+c+'" data-row="'+r+'" style="width:'+CELL_SIZE+'px;height:'+CELL_SIZE+'px">'+
        (active?tableSvg(cell.shape||'square',CELL_SIZE,cell.capacity||2,false,cell.rotation||0):'')+
        (lbl?'<span class="lf-cell__label">'+_esc(lbl)+'</span>':'')+
        (cap?'<span class="lf-cell__cap-badge">'+cap+'</span>':'')+
        '</div>';
    }}
    $canvas.innerHTML=html;_renderZones();
  }

  function _renderZones(){
    if(!$zonesOverlay)return;if(!_cfg.zones||!_cfg.zones.length){$zonesOverlay.innerHTML='';return;}
    var ZC=['rgba(196,149,90,0.28)','rgba(74,144,226,0.22)','rgba(76,175,117,0.22)','rgba(224,92,92,0.22)'];
    $zonesOverlay.innerHTML=_cfg.zones.map(function(z){
      var x=CELL_PAD+z.col*(CELL_SIZE+CELL_GAP),y=CELL_PAD+z.row*(CELL_SIZE+CELL_GAP);
      return '<div class="lf-zone-chip" style="left:'+x+'px;top:'+y+'px;background:'+(z.color||ZC[0])+'"><span class="lf-zone-chip__text">'+_esc(z.label)+'</span><button class="lf-zone-chip__del" data-zid="'+z.id+'">×</button></div>';
    }).join('');
    $zonesOverlay.querySelectorAll('.lf-zone-chip__del').forEach(function(btn){btn.addEventListener('click',function(e){e.stopPropagation();_cfg.zones=_cfg.zones.filter(function(z){return z.id!==btn.dataset.zid;});_markDirty();_renderZones();});});
  }

  function _onPD(e){
    e.preventDefault();_ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});$canvasWrapper.setPointerCapture(e.pointerId);
    if(_ptrs.size>=2){_hadMulti=true;_cancelHold();if(_moveActive)_cancelMove();_panning=false;_startPinch();return;}
    _hadMulti=false;_tapPtId=e.pointerId;_tapDownX=e.clientX;_tapDownY=e.clientY;_tapMoved=false;
    var el=document.elementFromPoint(e.clientX,e.clientY),cell=el&&el.closest('.lf-cell');
    if(cell&&cell.classList.contains('is-active')){
      _holdTarget={col:+cell.dataset.col,row:+cell.dataset.row,el:cell};
      _holdTimer=setTimeout(function(){if(!_tapMoved&&!_hadMulti)_startMoveMode(_holdTarget);},HOLD_MS);
    }
  }

  function _onPM(e){
    if(!_ptrs.has(e.pointerId))return;_ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(_pinching){_updatePinch();e.preventDefault();return;}if(_ptrs.size>=2)return;
    var dx=e.clientX-_tapDownX,dy=e.clientY-_tapDownY;
    if(Math.sqrt(dx*dx+dy*dy)>PAN_THR&&!_moveActive){
      _tapMoved=true;_cancelHold();
      if(!_panning){_panning=true;_pan0X=e.clientX;_pan0Y=e.clientY;_pan0PX=_panX;_pan0PY=_panY;}
    }
    if(_panning){_panX=_pan0PX+(e.clientX-_pan0X);_panY=_pan0PY+(e.clientY-_pan0Y);_applyTransform();e.preventDefault();return;}
    if(_moveActive)_updateMoveHover(e.clientX,e.clientY);
  }

  function _onPU(e){
    if(!_ptrs.has(e.pointerId))return;var wasMove=_moveActive,wasPan=_panning;
    if(_moveActive){_dropMove(e.clientX,e.clientY);_ptrs.delete(e.pointerId);if(_ptrs.size===0){_panning=false;_pinching=false;}return;}
    _ptrs.delete(e.pointerId);
    if(_pinching&&_ptrs.size<2){_pinching=false;return;}
    if(wasPan){if(_ptrs.size===0)_panning=false;return;}
    if(!_hadMulti&&!_tapMoved&&e.pointerId===_tapPtId&&!wasMove){
      _cancelHold();var el=document.elementFromPoint(e.clientX,e.clientY),cell=el&&el.closest('.lf-cell');
      if(cell)_handleCellTap(+cell.dataset.col,+cell.dataset.row);
    }
    if(_ptrs.size===0){_panning=false;_tapPtId=null;}
  }

  function _handleCellTap(col,row){
    if(_zonePlacing){_placeZone(col,row);return;}
    var cell=_getCellAt(col,row);
    if(!cell||!cell.active)_activateWithLast(col,row);else _openComboPicker(col,row);
  }

  function _activateWithLast(col,row){
    if(!_cfg.cells)_cfg.cells=[];var cell=_getCellAt(col,row);
    if(!cell){cell={id:'t_'+col+'_'+row,col:col,row:row,active:true,label:String(_nextLabel()),shape:_lastShape,capacity:_lastCap,rotation:0};_cfg.cells.push(cell);}
    else{cell.active=true;cell.shape=_lastShape;cell.capacity=_lastCap;if(!cell.label)cell.label=String(_nextLabel());}
    _markDirty();_renderGrid();
  }

  function _nextLabel(){
    var nums=(_cfg.cells||[]).filter(function(c){return c.active;}).map(function(c){return parseInt(c.label,10);}).filter(function(n){return!isNaN(n);});
    return nums.length?Math.max.apply(null,nums)+1:1;
  }

  function _getCellAt(col,row){var cells=_cfg.cells||[];for(var i=0;i<cells.length;i++){if(cells[i].col===col&&cells[i].row===row)return cells[i];}return null;}

  function _startMoveMode(target){var cell=_getCellAt(target.col,target.row);if(!cell||!cell.active)return;_moveActive=true;_moveSrc={col:target.col,row:target.row};target.el.classList.add('is-moving');}
  function _cancelHold(){if(_holdTimer){clearTimeout(_holdTimer);_holdTimer=null;}_holdTarget=null;}
  function _cancelMove(){_moveActive=false;_moveSrc=null;if(_moveHoverEl){_moveHoverEl.classList.remove('is-move-target');_moveHoverEl=null;}_renderGrid();}
  function _updateMoveHover(cx,cy){
    var el=document.elementFromPoint(cx,cy),cell=el&&el.closest('.lf-cell');
    if(_moveHoverEl){_moveHoverEl.classList.remove('is-move-target');_moveHoverEl=null;}
    if(cell&&(cell.dataset.col!==String(_moveSrc.col)||cell.dataset.row!==String(_moveSrc.row))){cell.classList.add('is-move-target');_moveHoverEl=cell;}
  }
  function _dropMove(cx,cy){
    var el=document.elementFromPoint(cx,cy),tgt=el&&el.closest('.lf-cell');
    if(tgt&&_moveSrc){var tc=+tgt.dataset.col,tr=+tgt.dataset.row;
      if(tc!==_moveSrc.col||tr!==_moveSrc.row){
        var src=_getCellAt(_moveSrc.col,_moveSrc.row),dst=_getCellAt(tc,tr);
        if(src){if(dst&&dst.active){var sc=src.col,sr=src.row;src.col=dst.col;src.row=dst.row;dst.col=sc;dst.row=sr;}else{src.col=tc;src.row=tr;}_markDirty();}
      }
    }
    _moveActive=false;_moveSrc=null;_moveHoverEl=null;_renderGrid();
  }

  function _startPinch(){_pinching=true;var pts=Array.from(_ptrs.values());_pinch0Dist=_ptDist(pts[0],pts[1]);_pinch0Zoom=_zoom;_pinch0Mid=_ptMid(pts[0],pts[1]);_pinch0Pan={x:_panX,y:_panY};}
  function _updatePinch(){
    var pts=Array.from(_ptrs.values());if(pts.length<2)return;
    var nd=_ptDist(pts[0],pts[1]),nm=_ptMid(pts[0],pts[1]),nz=_clamp(_pinch0Zoom*(nd/_pinch0Dist),ZOOM_MIN,ZOOM_MAX);
    var rect=$canvasWrapper.getBoundingClientRect(),rx=_pinch0Mid.x-rect.left,ry=_pinch0Mid.y-rect.top;
    var cvX=(rx-_pinch0Pan.x)/_pinch0Zoom,cvY=(ry-_pinch0Pan.y)/_pinch0Zoom;
    _zoom=nz;_panX=rx-cvX*nz+(nm.x-_pinch0Mid.x);_panY=ry-cvY*nz+(nm.y-_pinch0Mid.y);_applyTransform();
  }
  function _applyTransform(){$canvasTransform.style.transformOrigin='0 0';$canvasTransform.style.transform='translate('+_panX+'px,'+_panY+'px) scale('+_zoom+')';if($zoomPct)$zoomPct.textContent=Math.round(_zoom*100)+'%';}
  function _fitToScreen(){
    if(!$canvasWrapper)return;var wr=$canvasWrapper.getBoundingClientRect();if(!wr.width||!wr.height)return;
    var cols=(_cfg&&_cfg.gridCols)||DEF_COLS,rows=(_cfg&&_cfg.gridRows)||DEF_ROWS;
    var cvW=cols*(CELL_SIZE+CELL_GAP)-CELL_GAP+CELL_PAD*2,cvH=rows*(CELL_SIZE+CELL_GAP)-CELL_GAP+CELL_PAD*2;
    _zoom=_clamp(Math.min((wr.width-CELL_PAD*2)/cvW,(wr.height-CELL_PAD*2)/cvH),ZOOM_MIN,1.0);
    _panX=(wr.width-cvW*_zoom)/2;_panY=(wr.height-cvH*_zoom)/2;_applyTransform();
  }
  function _toggleFullscreen(){
    _isFullscreen=!_isFullscreen;$canvasWrapper.classList.toggle('lf-canvas-fullscreen',_isFullscreen);
    $fullscreenBtn.innerHTML=_isFullscreen
      ?'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="10" y1="14" x2="3" y2="21"/><line x1="21" y1="3" x2="14" y2="10"/></svg>'
      :'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>';
    setTimeout(_fitToScreen,60);
  }

  function _buildComboGrid(cur){
    var sec={};COMBOS.forEach(function(c){if(!sec[c.shape])sec[c.shape]=[];sec[c.shape].push(c.cap);});
    return Object.keys(sec).map(function(shape){
      return '<div class="lf-combo-section"><div class="lf-combo-section__label">'+shape+'</div><div class="lf-combo-section__row">'+
        sec[shape].map(function(cap){
          var isC=cur?(cur.shape===shape&&cur.capacity===cap):(_lastShape===shape&&_lastCap===cap);
          return '<button class="lf-combo-card'+(isC?' is-current':'')+'" data-shape="'+shape+'" data-cap="'+cap+'">'+tableSvg(shape,68,cap,false,0)+'<span class="lf-combo-card__num">'+cap+'</span></button>';
        }).join('')+'</div></div>';
    }).join('');
  }

  function _openComboPicker(col,row){
    _comboTarget={col:col,row:row};var cell=_getCellAt(col,row);
    $comboGrid.innerHTML=_buildComboGrid(cell);
    $comboGrid.querySelectorAll('.lf-combo-card').forEach(function(btn){btn.addEventListener('click',function(){_applyCombo(btn.dataset.shape,+btn.dataset.cap);});});
    var rot=(cell&&cell.rotation)||0;$comboRot.querySelectorAll('[data-rot]').forEach(function(b){b.classList.toggle('is-active',+b.dataset.rot===rot);});
    $comboLabel.value=(cell&&cell.label)||'';$comboDel.style.display=(cell&&cell.active)?'':'none';_showComboSheet();
  }

  function _applyCombo(shape,cap){
    _lastShape=shape;_lastCap=cap;
    if(_comboTarget&&('col'in _comboTarget)){
      var col=_comboTarget.col,row=_comboTarget.row,cell=_getCellAt(col,row);
      if(!cell){cell={id:'t_'+col+'_'+row,col:col,row:row,active:true,label:String(_nextLabel()),shape:shape,capacity:cap,rotation:0};if(!_cfg.cells)_cfg.cells=[];_cfg.cells.push(cell);}
      else{cell.active=true;cell.shape=shape;cell.capacity=cap;if(!cell.label)cell.label=String(_nextLabel());}
      var lv=$comboLabel.value.trim();if(lv)cell.label=lv;
      _markDirty();_renderGrid();
    }
    _closeComboPicker();
  }

  function _openTablesCombo(idx){
    var t=_cfg.tables[idx];if(!t)return;_comboTarget={_tabIdx:idx};
    $comboGrid.innerHTML=_buildComboGrid(t);
    $comboGrid.querySelectorAll('.lf-combo-card').forEach(function(btn){btn.addEventListener('click',function(){t.shape=btn.dataset.shape;t.capacity=+btn.dataset.cap;_closeComboPicker();_markDirty();_renderTables();});});
    $comboRot.querySelectorAll('[data-rot]').forEach(function(b){b.classList.toggle('is-active',+b.dataset.rot===(t.rotation||0));});
    $comboRot.onclick=function(e){var b=e.target.closest('[data-rot]');if(!b)return;$comboRot.querySelectorAll('[data-rot]').forEach(function(x){x.classList.remove('is-active');});b.classList.add('is-active');t.rotation=+b.dataset.rot;_markDirty();_renderTables();};
    $comboLabel.value=t.label||'';$comboDel.style.display='';
    $comboDel.onclick=function(){_cfg.tables.splice(idx,1);_closeComboPicker();_markDirty();_renderTables();};
    _showComboSheet();
  }

  function _showComboSheet(){$comboOverlay.style.display='';$comboSheet.style.display='';requestAnimationFrame(function(){$comboOverlay.classList.add('is-open');$comboSheet.classList.add('is-open');});}
  function _closeComboPicker(){$comboOverlay.classList.remove('is-open');$comboSheet.classList.remove('is-open');setTimeout(function(){$comboOverlay.style.display='none';$comboSheet.style.display='none';},260);_comboTarget=null;$comboRot.onclick=null;$comboDel.onclick=null;}

  var ZONE_COLORS=['rgba(196,149,90,0.25)','rgba(74,144,226,0.2)','rgba(76,175,117,0.2)','rgba(224,92,92,0.2)'];
  function _placeZone(col,row){if(!_cfg.zones)_cfg.zones=[];_cfg.zones.push({id:'z_'+Date.now(),label:_zoneDraftLabel,col:col,row:row,color:ZONE_COLORS[_cfg.zones.length%ZONE_COLORS.length]});_cancelZonePlacement();_markDirty();_renderZones();}
  function _cancelZonePlacement(){_zonePlacing=false;_zoneDraftLabel='';$canvasWrapper.classList.remove('lf-zone-mode');var zi=_container.querySelector('#lfZoneInput'),lbl=_container.querySelector('#lfZoneLabelIn'),btn=_container.querySelector('#lfZonePlaceBtn');if(zi)zi.style.display='none';if(lbl)lbl.value='';if(btn)btn.textContent='Tap cell to place';}

  function _addTable(){if(!_cfg.tables)_cfg.tables=[];var n=_cfg.tables.length+1;_cfg.tables.push({id:'t'+n,label:'T'+n,shape:'square',capacity:4,rotation:0});_markDirty();_renderTables();}

  async function _save(){
    if(_saving||!_dirty)return;_saving=true;$saveBtn.disabled=true;$saveStatus.textContent='Saving…';$saveStatus.className='lf-save-bar__status';
    try{var r=await fetch(_apiBase+'/api/super/layout/'+_rid,{method:'PUT',headers:{'Content-Type':'application/json','Authorization':'Bearer '+_jwt},body:JSON.stringify(_cfg)});if(!r.ok)throw new Error(await r.text());_dirty=false;$saveStatus.textContent='Layout saved ✓';$saveStatus.className='lf-save-bar__status is-saved';$saveBtn.disabled=true;}
    catch(err){$saveStatus.textContent='Save failed — '+err.message;$saveStatus.className='lf-save-bar__status is-error';$saveBtn.disabled=false;}
    finally{_saving=false;}
  }
  function _markDirty(){_dirty=true;$saveStatus.textContent='Unsaved changes';$saveStatus.className='lf-save-bar__status is-dirty';$saveBtn.disabled=false;}

  /* ── Table + Chairs SVG ─────────────────────────────────── */
  function tableSvg(shape,S,capacity,_u,rotation){
    var cx=S/2,cy=S/2,cap=_clamp(capacity||2,1,14);
    var cW=Math.round(S*0.135),cH=Math.round(S*0.092),cR=2,gap=Math.max(2,Math.round(S*0.038)),ins=cH+gap+Math.round(S*0.04);
    var tSty='style="fill:var(--tf,rgba(196,149,90,0.3));stroke:var(--ts,#c4955a);stroke-width:1.5"';
    var cSty='style="fill:var(--cf,rgba(196,149,90,0.5));stroke:var(--cs,#c4955a);stroke-width:1"';
    var tEl='',chairs='';
    if(shape==='circle'){var r=Math.round(S/2-ins);tEl='<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" '+tSty+'/>';chairs=_circleChairs(cx,cy,r,cap,gap,cW,cH,cR,cSty);}
    else if(shape==='ellipse'){var rx=Math.round(S/2-ins*0.45),ry=Math.round(S/2-ins*1.4);tEl='<ellipse cx="'+cx+'" cy="'+cy+'" rx="'+rx+'" ry="'+ry+'" '+tSty+'/>';chairs=_ellipseChairs(cx,cy,rx,ry,cap,gap,cW,cH,cR,cSty);}
    else if(shape==='rect'){var tw=Math.round(S-ins),th=Math.round(S*0.40),tx=Math.round(cx-tw/2),ty=Math.round(cy-th/2);tEl='<rect x="'+tx+'" y="'+ty+'" width="'+tw+'" height="'+th+'" rx="4" '+tSty+'/>';chairs=_perimeterChairs(tx,ty,tw,th,cap,gap,cW,cH,cR,cSty);}
    else{var ts=Math.round(S-ins*2),tsx=Math.round(cx-ts/2),tsy=Math.round(cy-ts/2);tEl='<rect x="'+tsx+'" y="'+tsy+'" width="'+ts+'" height="'+ts+'" rx="5" '+tSty+'/>';chairs=_perimeterChairs(tsx,tsy,ts,ts,cap,gap,cW,cH,cR,cSty);}
    var gR=rotation?' transform="rotate('+rotation+','+cx+','+cy+')"':'';
    return '<svg width="'+S+'" height="'+S+'" viewBox="0 0 '+S+' '+S+'" aria-hidden="true" style="position:absolute;inset:0;width:100%;height:100%;overflow:visible"><g'+gR+'>'+chairs+tEl+'</g></svg>';
  }
  function _circleChairs(cx,cy,r,N,gap,cW,cH,cR,cSty){var h='',d=r+gap+cH/2;for(var i=0;i<N;i++){var a=(2*Math.PI*i/N)-Math.PI/2;h+=_chair(cx+d*Math.cos(a),cy+d*Math.sin(a),cW,cH,cR,a*180/Math.PI+90,cSty);}return h;}
  function _ellipseChairs(cx,cy,rx,ry,N,gap,cW,cH,cR,cSty){var h='';for(var i=0;i<N;i++){var t=(2*Math.PI*i/N)-Math.PI/2,px=rx*Math.cos(t),py=ry*Math.sin(t),nx=px/(rx*rx),ny=py/(ry*ry),nl=Math.sqrt(nx*nx+ny*ny),d=gap+cH/2;h+=_chair(cx+px+d*nx/nl,cy+py+d*ny/nl,cW,cH,cR,Math.atan2(ny/nl,nx/nl)*180/Math.PI+90,cSty);}return h;}
  function _perimeterChairs(tx,ty,tw,th,N,gap,cW,cH,cR,cSty){var h='',p=2*(tw+th);for(var i=0;i<N;i++){var d=((i+0.5)/N)*p,x,y,deg;if(d<tw){x=tx+d;y=ty-gap-cH/2;deg=0;}else if(d<tw+th){x=tx+tw+gap+cH/2;y=ty+(d-tw);deg=90;}else if(d<2*tw+th){x=tx+(tw-(d-tw-th));y=ty+th+gap+cH/2;deg=180;}else{x=tx-gap-cH/2;y=ty+(th-(d-2*tw-th));deg=270;}h+=_chair(x,y,cW,cH,cR,deg,cSty);}return h;}
  function _chair(cx,cy,w,h,r,deg,cSty){var x=(cx-w/2).toFixed(1),y=(cy-h/2).toFixed(1);return '<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="'+r+'" '+cSty+' transform="rotate('+deg.toFixed(1)+','+cx.toFixed(1)+','+cy.toFixed(1)+')"/>';}

  function _ptDist(a,b){return Math.sqrt((a.x-b.x)*(a.x-b.x)+(a.y-b.y)*(a.y-b.y));}
  function _ptMid(a,b){return{x:(a.x+b.x)/2,y:(a.y+b.y)/2};}
  function _clamp(v,mn,mx){return isNaN(v)?mn:Math.min(mx,Math.max(mn,v));}
  function _esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
})();
