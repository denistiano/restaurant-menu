/**
 * Shared layout "content frame" for floor-plan (grid mode).
 * Tables/zones are stored as grid indices; this module derives the bounding
 * rectangle (origin + span) so views can fit meaningful content to the screen
 * without relying on pixel coordinates on the canvas.
 */
(function (global) {
  'use strict';

  var CELL_SIZE = 60;
  var CELL_GAP = 3;
  var CELL_PAD = 10;

  /**
   * @param {object} layout - layout config (grid mode)
   * @returns {{ originCol: number, originRow: number, spanCols: number, spanRows: number, fullCols: number, fullRows: number }}
   */
  function computeContentFrame(layout) {
    if (!layout || layout.mode !== 'grid') return null;
    var fullCols = layout.gridCols || 10;
    var fullRows = layout.gridRows || 10;
    var minC = Infinity;
    var minR = Infinity;
    var maxC = -1;
    var maxR = -1;
    (layout.cells || []).forEach(function (c) {
      if (c && c.active) {
        minC = Math.min(minC, c.col);
        minR = Math.min(minR, c.row);
        maxC = Math.max(maxC, c.col);
        maxR = Math.max(maxR, c.row);
      }
    });
    (layout.zones || []).forEach(function (z) {
      if (!z) return;
      minC = Math.min(minC, z.col);
      minR = Math.min(minR, z.row);
      maxC = Math.max(maxC, z.col);
      maxR = Math.max(maxR, z.row);
    });
    if (maxC < 0 || !isFinite(minC)) {
      return {
        originCol: 0,
        originRow: 0,
        spanCols: fullCols,
        spanRows: fullRows,
        fullCols: fullCols,
        fullRows: fullRows
      };
    }
    var pad = 1;
    minC = Math.max(0, minC - pad);
    minR = Math.max(0, minR - pad);
    maxC = Math.min(fullCols - 1, maxC + pad);
    maxR = Math.min(fullRows - 1, maxR + pad);
    return {
      originCol: minC,
      originRow: minR,
      spanCols: maxC - minC + 1,
      spanRows: maxR - minR + 1,
      fullCols: fullCols,
      fullRows: fullRows
    };
  }

  /**
   * Prefer persisted contentFrame (same origin as saved); else compute from cells.
   */
  function getFrameOrStored(layout) {
    if (!layout || layout.mode !== 'grid') return null;
    var cf = layout.contentFrame;
    if (
      cf &&
      typeof cf.originCol === 'number' &&
      typeof cf.originRow === 'number' &&
      typeof cf.spanCols === 'number' &&
      typeof cf.spanRows === 'number' &&
      cf.spanCols > 0 &&
      cf.spanRows > 0
    ) {
      return {
        originCol: cf.originCol,
        originRow: cf.originRow,
        spanCols: cf.spanCols,
        spanRows: cf.spanRows,
        fullCols: layout.gridCols || 10,
        fullRows: layout.gridRows || 10
      };
    }
    return computeContentFrame(layout);
  }

  /**
   * Pan/zoom so the content frame is centered in the editor viewport (grid mode).
   */
  function editorFitPanZoom(wrapperRect, cfg, zoomMin, zoomMax) {
    var frame = getFrameOrStored(cfg);
    if (!frame) return { zoom: 1, panX: 0, panY: 0 };
    var bw = frame.spanCols * (CELL_SIZE + CELL_GAP) - CELL_GAP;
    var bh = frame.spanRows * (CELL_SIZE + CELL_GAP) - CELL_GAP;
    var bx0 = CELL_PAD + frame.originCol * (CELL_SIZE + CELL_GAP);
    var by0 = CELL_PAD + frame.originRow * (CELL_SIZE + CELL_GAP);
    var cx = bx0 + bw / 2;
    var cy = by0 + bh / 2;
    var wr = wrapperRect;
    var z = Math.min((wr.width - 24) / bw, (wr.height - 24) / bh, 1.0);
    if (zoomMin != null) z = Math.max(zoomMin, z);
    if (zoomMax != null) z = Math.min(zoomMax, z);
    return {
      zoom: z,
      panX: wr.width / 2 - cx * z,
      panY: wr.height / 2 - cy * z
    };
  }

  /** @returns {object|null} frame object suitable for JSON (grid mode only) */
  function frameToPersist(cfg) {
    var f = computeContentFrame(cfg);
    if (!f) return null;
    return {
      originCol: f.originCol,
      originRow: f.originRow,
      spanCols: f.spanCols,
      spanRows: f.spanRows
    };
  }

  global.LayoutBounds = {
    computeContentFrame: computeContentFrame,
    getFrameOrStored: getFrameOrStored,
    editorFitPanZoom: editorFitPanZoom,
    frameToPersist: frameToPersist,
    CELL_SIZE: CELL_SIZE,
    CELL_GAP: CELL_GAP,
    CELL_PAD: CELL_PAD
  };
})(typeof window !== 'undefined' ? window : this);
