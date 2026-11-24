/* extension.js - PGC Canvas & Drawing Extensions for fe.js */
(function (root) {
  "use strict";

  var TYPE_PAIR = 0;
  var TYPE_NUMBER = 1;
  var TYPE_STRING = 3;

  function isPair(x) {
    return !!x && x.type === TYPE_PAIR;
  }

  function isNumber(x) {
    return !!x && x.type === TYPE_NUMBER;
  }

  function isString(x) {
    return !!x && x.type === TYPE_STRING;
  }

  function getColor(idx) {
    var i = Math.floor(Number(idx)) || 0;
    if (typeof SWEETIE !== "undefined" && SWEETIE.length > 0) {
      i = ((i % SWEETIE.length) + SWEETIE.length) % SWEETIE.length;
      return SWEETIE[i];
    }
    return "#f4f4f4";
  }

  function registerPgcExtensions(feCtx, canvas, ctx) {
    var width = canvas.width;
    var height = canvas.height;

    function drawGlyph(charCode, x, y, scale, color) {
      if (typeof font === "undefined" || !font.glyphs) {
        return;
      }
      var glyph = font.glyphs[charCode];
      if (!glyph) {
        return;
      }

      ctx.fillStyle = color;
      for (var row = 0; row < font.height; row++) {
        var rowByte = glyph[row];
        for (var col = 0; col < font.width; col++) {
          var bitMask = 1 << (font.width - 1 - col);
          if ((rowByte & bitMask) !== 0) {
            ctx.fillRect(
              Math.floor(x + col * scale),
              Math.floor(y + row * scale),
              Math.ceil(scale),
              Math.ceil(scale)
            );
          }
        }
      }
    }

    function drawText(text, x, y, scale, spacing, color) {
      var gw = typeof font !== "undefined" ? font.width : 8;
      var gh = typeof font !== "undefined" ? font.height : 8;
      var cursorX = x;
      var cursorY = y;
      var step = (gw + spacing) * scale;
      var lineStep = (gh + 1) * scale;
      var tabWidth = step * 4;

      for (var i = 0; i < text.length; i++) {
        var code = text.charCodeAt(i);

        /* Backspace (\b) */
        if (code === 8) {
          cursorX = Math.max(x, cursorX - step);
          continue;
        }

        /* Horizontal tab (\t) - align to next 4-column tab stop */
        if (code === 9) {
          if (step > 0) {
            var relX = Math.max(0, cursorX - x);
            var nextTab = (Math.floor(relX / tabWidth) + 1) * tabWidth;
            cursorX = x + nextTab;
          }
          continue;
        }

        /* Line feed (\n) - new line & return cursor to start X */
        if (code === 10) {
          cursorY += lineStep;
          cursorX = x;
          continue;
        }

        /* Vertical tab (\v) - move down one line, keep X */
        if (code === 11) {
          cursorY += lineStep;
          continue;
        }

        /* Form feed (\f) - advance down one line & return cursor to start X */
        if (code === 12) {
          cursorY += lineStep;
          cursorX = x;
          continue;
        }

        /* Carriage return (\r) - return cursor to start X */
        if (code === 13) {
          cursorX = x;
          continue;
        }

        /* Skip other control characters (0x00-0x1F) and DEL (0x7F) */
        if (code < 32 || code === 127) {
          continue;
        }

        drawGlyph(code, cursorX, cursorY, scale, color);
        cursorX += step;
      }
    }

    function readArgs(args) {
      var out = [];
      var cur = args;
      while (isPair(cur)) {
        out.push(cur.car);
        cur = cur.cdr;
      }
      return out;
    }

    /* (clear [colorIdx]) */
    feCtx.addCFunc("clear", function (_, args) {
      var a = readArgs(args);
      var colIdx = (a.length > 0 && isNumber(a[0])) ? a[0].value : 0;
      ctx.fillStyle = getColor(colIdx);
      ctx.fillRect(0, 0, width, height);
      return feCtx.NIL;
    });

    /* (pset x y [colorIdx]) */
    feCtx.addCFunc("pset", function (_, args) {
      var a = readArgs(args);
      var x = (a.length > 0 && isNumber(a[0])) ? Math.floor(a[0].value) : 0;
      var y = (a.length > 1 && isNumber(a[1])) ? Math.floor(a[1].value) : 0;
      var colIdx = (a.length > 2 && isNumber(a[2])) ? a[2].value : 12;
      ctx.fillStyle = getColor(colIdx);
      ctx.fillRect(x, y, 1, 1);
      return feCtx.NIL;
    });

    /* (rect x y w h [colorIdx]) */
    feCtx.addCFunc("frect", function (_, args) {
      var a = readArgs(args);
      var x = (a.length > 0 && isNumber(a[0])) ? Math.floor(a[0].value) : 0;
      var y = (a.length > 1 && isNumber(a[1])) ? Math.floor(a[1].value) : 0;
      var w = (a.length > 2 && isNumber(a[2])) ? Math.floor(a[2].value) : 1;
      var h = (a.length > 3 && isNumber(a[3])) ? Math.floor(a[3].value) : 1;
      var colIdx = (a.length > 4 && isNumber(a[4])) ? a[4].value : 12;
      ctx.fillStyle = getColor(colIdx);
      ctx.fillRect(x, y, w, h);
      return feCtx.NIL;
    });

    /* (rectb x y w h [colorIdx]) */
    feCtx.addCFunc("drect", function (_, args) {
      var a = readArgs(args);
      var x = (a.length > 0 && isNumber(a[0])) ? Math.floor(a[0].value) : 0;
      var y = (a.length > 1 && isNumber(a[1])) ? Math.floor(a[1].value) : 0;
      var w = (a.length > 2 && isNumber(a[2])) ? Math.floor(a[2].value) : 1;
      var h = (a.length > 3 && isNumber(a[3])) ? Math.floor(a[3].value) : 1;
      var colIdx = (a.length > 4 && isNumber(a[4])) ? a[4].value : 12;
      ctx.fillStyle = getColor(colIdx);
      if (w > 0 && h > 0) {
        ctx.fillRect(x, y, w, 1);
        ctx.fillRect(x, y + h - 1, w, 1);
        ctx.fillRect(x, y, 1, h);
        ctx.fillRect(x + w - 1, y, 1, h);
      }
      return feCtx.NIL;
    });

    /* (line x0 y0 x1 y1 [colorIdx]) - Bresenham pixel line */
    feCtx.addCFunc("dline", function (_, args) {
      var a = readArgs(args);
      var x0 = (a.length > 0 && isNumber(a[0])) ? Math.floor(a[0].value) : 0;
      var y0 = (a.length > 1 && isNumber(a[1])) ? Math.floor(a[1].value) : 0;
      var x1 = (a.length > 2 && isNumber(a[2])) ? Math.floor(a[2].value) : 0;
      var y1 = (a.length > 3 && isNumber(a[3])) ? Math.floor(a[3].value) : 0;
      var colIdx = (a.length > 4 && isNumber(a[4])) ? a[4].value : 12;

      ctx.fillStyle = getColor(colIdx);
      var dx = Math.abs(x1 - x0);
      var dy = Math.abs(y1 - y0);
      var sx = x0 < x1 ? 1 : -1;
      var sy = y0 < y1 ? 1 : -1;
      var err = dx - dy;

      while (true) {
        ctx.fillRect(x0, y0, 1, 1);
        if (x0 === x1 && y0 === y1) {
          break;
        }
        var e2 = 2 * err;
        if (e2 > -dy) {
          err -= dy;
          x0 += sx;
        }
        if (e2 < dx) {
          err += dx;
          y0 += sy;
        }
      }
      return feCtx.NIL;
    });

    /* (circ cx cy r [colorIdx]) - Filled pixel circle */
    feCtx.addCFunc("fcirc", function (_, args) {
      var a = readArgs(args);
      var cx = (a.length > 0 && isNumber(a[0])) ? Math.floor(a[0].value) : 0;
      var cy = (a.length > 1 && isNumber(a[1])) ? Math.floor(a[1].value) : 0;
      var r = (a.length > 2 && isNumber(a[2])) ? Math.floor(a[2].value) : 1;
      var colIdx = (a.length > 3 && isNumber(a[3])) ? a[3].value : 12;

      ctx.fillStyle = getColor(colIdx);
      for (var dy = -r; dy <= r; dy++) {
        var span = Math.floor(Math.sqrt(r * r - dy * dy));
        ctx.fillRect(cx - span, cy + dy, span * 2 + 1, 1);
      }
      return feCtx.NIL;
    });

    /* (circb cx cy r [colorIdx]) - Outline pixel circle */
    feCtx.addCFunc("dcirc", function (_, args) {
      var a = readArgs(args);
      var cx = (a.length > 0 && isNumber(a[0])) ? Math.floor(a[0].value) : 0;
      var cy = (a.length > 1 && isNumber(a[1])) ? Math.floor(a[1].value) : 0;
      var r = (a.length > 2 && isNumber(a[2])) ? Math.floor(a[2].value) : 1;
      var colIdx = (a.length > 3 && isNumber(a[3])) ? a[3].value : 12;

      ctx.fillStyle = getColor(colIdx);
      var x = r;
      var y = 0;
      var err = 0;

      while (x >= y) {
        ctx.fillRect(cx + x, cy + y, 1, 1);
        ctx.fillRect(cx + y, cy + x, 1, 1);
        ctx.fillRect(cx - y, cy + x, 1, 1);
        ctx.fillRect(cx - x, cy + y, 1, 1);
        ctx.fillRect(cx - x, cy - y, 1, 1);
        ctx.fillRect(cx - y, cy - x, 1, 1);
        ctx.fillRect(cx + y, cy - x, 1, 1);
        ctx.fillRect(cx + x, cy - y, 1, 1);

        y += 1;
        err += 1 + 2 * y;
        if (2 * (err - x) + 1 > 0) {
          x -= 1;
          err += 1 - 2 * x;
        }
      }
      return feCtx.NIL;
    });

    /* (text str x y [scale] [colorIdx] [spacing]) */
    feCtx.addCFunc("text", function (_, args) {
      var a = readArgs(args);
      var str = a.length > 0
        ? (isString(a[0]) ? a[0].value : feCtx.toString(a[0]))
        : "";
      var x = (a.length > 1 && isNumber(a[1])) ? a[1].value : 0;
      var y = (a.length > 2 && isNumber(a[2])) ? a[2].value : 0;
      var scale = (a.length > 3 && isNumber(a[3])) ? a[3].value : 1;
      var colIdx = (a.length > 4 && isNumber(a[4])) ? a[4].value : 12;
      var spacing = (a.length > 5 && isNumber(a[5])) ? a[5].value : 1;

      drawText(str, x, y, scale, spacing, getColor(colIdx));
      return feCtx.NIL;
    });

    /* (width) and (height) */
    feCtx.addCFunc("width", function () {
      return feCtx.makeNumber(width);
    });

    feCtx.addCFunc("height", function () {
      return feCtx.makeNumber(height);
    });
  }

  root.registerPgcExtensions = registerPgcExtensions;
})(this);