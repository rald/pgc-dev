/* fe.js - ES5 port/interpreter inspired by rxi/fe */
(function (root) {
  "use strict";

  var TYPE_PAIR = 0;
  var TYPE_NUMBER = 1;
  var TYPE_SYMBOL = 2;
  var TYPE_STRING = 3;
  var TYPE_FUNC = 4;
  var TYPE_MACRO = 5;
  var TYPE_CFUNC = 6;
  var TYPE_NIL = 7;

  var NIL_OBJ = { type: TYPE_NIL };

  function isNil(x) {
    return !x || x.type === TYPE_NIL;
  }

  function isPair(x) {
    return !!x && x.type === TYPE_PAIR;
  }

  function isNumber(x) {
    return !!x && x.type === TYPE_NUMBER;
  }

  function isSymbol(x) {
    return !!x && x.type === TYPE_SYMBOL;
  }

  function isString(x) {
    return !!x && x.type === TYPE_STRING;
  }

  function createContext(opts) {
    opts = opts || {};
    var syms = {};
    var callstack = [];
    var onError = opts.onError || null;
    var onPrint = opts.onPrint || function (str) {
      if (typeof console !== "undefined" && console.log) {
        console.log(str);
      }
    };

    var ctx = {
      syms: syms,
      callstack: callstack,
      onPrint: onPrint,
      onError: onError,
      evalExpr: null,
      evalList: null,
      toString: null
    };

    function error(msg) {
      var frames = callstack.slice().reverse();
      var trace = frames.map(function (node) {
        return "  at " + formatValue(node, true);
      }).join("\n");
      var fullMsg = msg + (trace ? "\n" + trace : "");
      if (typeof ctx.onError === "function") {
        ctx.onError(msg, trace, fullMsg);
      }
      throw new Error(fullMsg);
    }

    function makePair(car, cdr) {
      return {
        type: TYPE_PAIR,
        car: isNil(car) ? NIL_OBJ : car,
        cdr: isNil(cdr) ? NIL_OBJ : cdr
      };
    }

    function makeNumber(n) {
      if (typeof n !== "number" || isNaN(n) || !isFinite(n)) {
        error("invalid number");
      }
      return {
        type: TYPE_NUMBER,
        value: n
      };
    }

    function makeString(s) {
      return {
        type: TYPE_STRING,
        value: String(s)
      };
    }

    function makeSymbol(name) {
      name = String(name);
      if (syms.hasOwnProperty(name)) {
        return syms[name];
      }
      var sym = {
        type: TYPE_SYMBOL,
        name: name,
        value: NIL_OBJ
      };
      syms[name] = sym;
      return sym;
    }

    function makeFunc(params, body, env) {
      return {
        type: TYPE_FUNC,
        params: params,
        body: body,
        env: isNil(env) ? NIL_OBJ : env
      };
    }

    function makeMacro(params, body, env) {
      return {
        type: TYPE_MACRO,
        params: params,
        body: body,
        env: isNil(env) ? NIL_OBJ : env
      };
    }

    function makeCFunc(fn) {
      return {
        type: TYPE_CFUNC,
        fn: fn
      };
    }

    var SYM_NIL = makeSymbol("nil");
    SYM_NIL.value = NIL_OBJ;
    var SYM_QUOTE = makeSymbol("quote");
    var SYM_CONS = makeSymbol("cons");
    var SYM_CAR = makeSymbol("car");
    var SYM_CDR = makeSymbol("cdr");
    var SYM_SETCAR = makeSymbol("setcar");
    var SYM_SETCDR = makeSymbol("setcdr");
    var SYM_LIST = makeSymbol("list");
    var SYM_NOT = makeSymbol("not");
    var SYM_IS = makeSymbol("is");
    var SYM_ATOM = makeSymbol("atom");
    var SYM_PRINT = makeSymbol("print");
    var SYM_EVAL = makeSymbol("eval");
    var SYM_DO = makeSymbol("do");
    var SYM_IF = makeSymbol("if");
    var SYM_WHILE = makeSymbol("while");
    var SYM_LET = makeSymbol("let");
    var SYM_SET = makeSymbol("=");
    var SYM_FN = makeSymbol("fn");
    var SYM_MAC = makeSymbol("mac");

    function escapeString(s) {
      var out = "";
      var i, ch;
      for (i = 0; i < s.length; i++) {
        ch = s.charAt(i);
        if (ch === "\\") {
          out += "\\\\";
        } else if (ch === "\"") {
          out += "\\\"";
        } else if (ch === "\n") {
          out += "\\n";
        } else if (ch === "\r") {
          out += "\\r";
        } else if (ch === "\t") {
          out += "\\t";
        } else {
          out += ch;
        }
      }
      return "\"" + out + "\"";
    }

    function formatValue(obj, readable) {
      if (isNil(obj)) {
        return "nil";
      }
      switch (obj.type) {
        case TYPE_NUMBER:
          return String(obj.value);
        case TYPE_SYMBOL:
          return obj.name;
        case TYPE_STRING:
          return readable ? escapeString(obj.value) : obj.value;
        case TYPE_FUNC:
          return "<fn>";
        case TYPE_MACRO:
          return "<mac>";
        case TYPE_CFUNC:
          return "<cfunc>";
        case TYPE_PAIR: {
          var parts = [];
          var cur = obj;
          while (isPair(cur)) {
            parts.push(formatValue(cur.car, true));
            cur = cur.cdr;
          }
          if (!isNil(cur)) {
            parts.push(".");
            parts.push(formatValue(cur, true));
          }
          return "(" + parts.join(" ") + ")";
        }
        default:
          return "nil";
      }
    }

    ctx.toString = function (obj) {
      return formatValue(obj, true);
    };

    /* Reader / Parser */
    function parseSource(src) {
      var len = src.length;
      var pos = 0;

      function isWhitespace(c) {
        return c === " " || c === "\t" || c === "\r" || c === "\n";
      }

      function isDelimiter(c) {
        return !c || isWhitespace(c) || c === "(" || c === ")" || c === "'" || c === ";";
      }

      function skipWhitespaceAndComments() {
        while (pos < len) {
          var c = src.charAt(pos);
          if (isWhitespace(c)) {
            pos++;
          } else if (c === ";") {
            while (pos < len && src.charAt(pos) !== "\n") {
              pos++;
            }
          } else {
            break;
          }
        }
      }

      function readString() {
        var quoteChar = src.charAt(pos++);
        var str = "";
        var closed = false;
        while (pos < len) {
          var c = src.charAt(pos++);
          if (c === quoteChar) {
            closed = true;
            break;
          }
          if (c === "\\") {
            if (pos >= len) {
              error("unterminated escape in string");
            }
            var esc = src.charAt(pos++);
            if (esc === "n") {
              str += "\n";
            } else if (esc === "r") {
              str += "\r";
            } else if (esc === "t") {
              str += "\t";
            } else if (esc === "\\") {
              str += "\\";
            } else if (esc === "\"") {
              str += "\"";
            } else if (esc === "'") {
              str += "'";
            } else {
              str += esc;
            }
          } else {
            str += c;
          }
        }
        if (!closed) {
          error("unterminated string literal");
        }
        return makeString(str);
      }

      function readList() {
        pos++; /* consume '(' */
        skipWhitespaceAndComments();
        if (pos >= len) {
          error("unterminated list");
        }
        if (src.charAt(pos) === ")") {
          pos++;
          return NIL_OBJ;
        }

        var head = NIL_OBJ;
        var tail = NIL_OBJ;

        while (pos < len) {
          skipWhitespaceAndComments();
          if (pos >= len) {
            error("unterminated list");
          }
          if (src.charAt(pos) === ")") {
            pos++;
            return head;
          }

          var item = readExpr();
          if (isSymbol(item) && item.name === ".") {
            var cdrVal = readExpr();
            skipWhitespaceAndComments();
            if (pos >= len || src.charAt(pos) !== ")") {
              error("expected ')' after dotted pair cdr");
            }
            pos++;
            if (isNil(head)) {
              error("invalid dotted list");
            }
            tail.cdr = isNil(cdrVal) ? NIL_OBJ : cdrVal;
            return head;
          }

          var pair = makePair(item, NIL_OBJ);
          if (isNil(head)) {
            head = pair;
            tail = pair;
          } else {
            tail.cdr = pair;
            tail = pair;
          }
        }

        error("unterminated list");
      }

      function readAtom() {
        var start = pos;
        while (pos < len && !isDelimiter(src.charAt(pos))) {
          pos++;
        }
        var token = src.slice(start, pos);
        if (token === "nil") {
          return NIL_OBJ;
        }
        if (/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(token)) {
          return makeNumber(parseFloat(token));
        }
        return makeSymbol(token);
      }

      function readExpr() {
        skipWhitespaceAndComments();
        if (pos >= len) {
          return null;
        }
        var c = src.charAt(pos);
        if (c === ")") {
          error("unexpected ')'");
        }
        if (c === "(") {
          return readList();
        }
        if (c === "\"" || c === "'") {
          if (c === "'") {
            pos++;
            var target = readExpr();
            if (target === null) {
              error("unexpected EOF after quote");
            }
            return makePair(SYM_QUOTE, makePair(target, NIL_OBJ));
          }
          return readString();
        }
        return readAtom();
      }

      var exprs = [];
      var expr;
      while ((expr = readExpr()) !== null) {
        exprs.push(expr);
      }
      return exprs;
    }

    /* Environment helpers (association list: ((sym . val) ...)) */
    function envLookup(sym, env) {
      var cur = env;
      while (isPair(cur)) {
        var binding = cur.car;
        if (isPair(binding) && binding.car === sym) {
          return binding;
        }
        cur = cur.cdr;
      }
      return null;
    }

    function envExtend(params, args, env) {
      var newEnv = isNil(env) ? NIL_OBJ : env;
      var p = params;
      var a = args;

      while (isPair(p)) {
        if (!isSymbol(p.car)) {
          error("parameter must be a symbol");
        }
        var val = isPair(a) ? a.car : NIL_OBJ;
        newEnv = makePair(makePair(p.car, val), newEnv);
        p = p.cdr;
        a = isPair(a) ? a.cdr : NIL_OBJ;
      }

      if (isSymbol(p)) {
        /* Variadic rest parameter */
        newEnv = makePair(makePair(p, isNil(a) ? NIL_OBJ : a), newEnv);
      }

      return newEnv;
    }

    function evalList(lst, env) {
      var head = NIL_OBJ;
      var tail = NIL_OBJ;
      var cur = lst;
      while (isPair(cur)) {
        var val = evalExpr(cur.car, env);
        var node = makePair(val, NIL_OBJ);
        if (isNil(head)) {
          head = node;
          tail = node;
        } else {
          tail.cdr = node;
          tail = node;
        }
        cur = cur.cdr;
      }
      return head;
    }

    function evalBlock(body, env) {
      var res = NIL_OBJ;
      var cur = body;
      while (isPair(cur)) {
        res = evalExpr(cur.car, env);
        cur = cur.cdr;
      }
      return res;
    }

    function valuesEqual(a, b) {
      if (isNil(a) && isNil(b)) {
        return true;
      }
      if (isNil(a) || isNil(b)) {
        return false;
      }
      if (a.type !== b.type) {
        return false;
      }
      if (a.type === TYPE_NUMBER || a.type === TYPE_STRING) {
        return a.value === b.value;
      }
      return a === b;
    }

    function evalExpr(expr, env) {
      if (isNil(expr)) {
        return NIL_OBJ;
      }
      if (isNumber(expr) || isString(expr)) {
        return expr;
      }
      if (isSymbol(expr)) {
        var local = envLookup(expr, env);
        if (local) {
          return local.cdr;
        }
        return expr.value;
      }
      if (!isPair(expr)) {
        return expr;
      }

      callstack.push(expr);
      try {
        var op = expr.car;
        var args = expr.cdr;

        /* Special forms */
        if (op === SYM_QUOTE) {
          return isPair(args) ? args.car : NIL_OBJ;
        }

        if (op === SYM_DO) {
          return evalBlock(args, env);
        }

        if (op === SYM_IF) {
          var cond = isPair(args) ? evalExpr(args.car, env) : NIL_OBJ;
          var branch = isPair(args) ? args.cdr : NIL_OBJ;
          if (!isNil(cond)) {
            return isPair(branch) ? evalExpr(branch.car, env) : NIL_OBJ;
          }
          var elseBranch = isPair(branch) ? branch.cdr : NIL_OBJ;
          return evalBlock(elseBranch, env);
        }

        if (op === SYM_WHILE) {
          var testExpr = isPair(args) ? args.car : NIL_OBJ;
          var loopBody = isPair(args) ? args.cdr : NIL_OBJ;
          var lastRes = NIL_OBJ;
          while (!isNil(evalExpr(testExpr, env))) {
            lastRes = evalBlock(loopBody, env);
          }
          return lastRes;
        }

        if (op === SYM_LET) {
          var sym = isPair(args) ? args.car : NIL_OBJ;
          if (!isSymbol(sym)) {
            error("'let' expects a symbol");
          }
          var rest = isPair(args) ? args.cdr : NIL_OBJ;
          var initVal = isPair(rest) ? evalExpr(rest.car, env) : NIL_OBJ;
          var letBody = isPair(rest) ? rest.cdr : NIL_OBJ;
          var nextEnv = makePair(makePair(sym, initVal), isNil(env) ? NIL_OBJ : env);
          return evalBlock(letBody, nextEnv);
        }

        if (op === SYM_SET) {
          var targetSym = isPair(args) ? args.car : NIL_OBJ;
          if (!isSymbol(targetSym)) {
            error("'=' expects a symbol");
          }
          var valRest = isPair(args) ? args.cdr : NIL_OBJ;
          var newVal = isPair(valRest) ? evalExpr(valRest.car, env) : NIL_OBJ;
          var existing = envLookup(targetSym, env);
          if (existing) {
            existing.cdr = newVal;
          } else {
            targetSym.value = newVal;
          }
          return newVal;
        }

        if (op === SYM_FN) {
          var params = isPair(args) ? args.car : NIL_OBJ;
          var fnBody = isPair(args) ? args.cdr : NIL_OBJ;
          return makeFunc(params, fnBody, env);
        }

        if (op === SYM_MAC) {
          var mParams = isPair(args) ? args.car : NIL_OBJ;
          var mBody = isPair(args) ? args.cdr : NIL_OBJ;
          return makeMacro(mParams, mBody, env);
        }

        /* Evaluate operator */
        var fnObj = evalExpr(op, env);
        if (!fnObj || fnObj.type === TYPE_NIL) {
          error("attempt to call nil");
        }

        /* Macro expansion (in-place rewrite of call form, like rxi/fe) */
        if (fnObj.type === TYPE_MACRO) {
          var macroEnv = envExtend(fnObj.params, args, fnObj.env);
          var expanded = evalBlock(fnObj.body, macroEnv);
          if (isPair(expanded)) {
            expr.car = expanded.car;
            expr.cdr = expanded.cdr;
          } else {
            expr.car = SYM_QUOTE;
            expr.cdr = makePair(expanded, NIL_OBJ);
          }
          return evalExpr(expr, env);
        }

        /* Lambda / closure call */
        if (fnObj.type === TYPE_FUNC) {
          var evalArgs = evalList(args, env);
          var callEnv = envExtend(fnObj.params, evalArgs, fnObj.env);
          return evalBlock(fnObj.body, callEnv);
        }

        /* Native CFunc call */
        if (fnObj.type === TYPE_CFUNC) {
          var cArgs = evalList(args, env);
          return fnObj.fn(ctx, cArgs, env);
        }

        error("attempt to call non-callable value: " + formatValue(fnObj, true));
      } finally {
        callstack.pop();
      }
    }

    /* Built-in CFuncs */
    function checkNum(x, name) {
      if (!isNumber(x)) {
        error("'" + name + "' expects a number");
      }
      return x.value;
    }

    function bindCFunc(name, fn) {
      makeSymbol(name).value = makeCFunc(fn);
    }

    bindCFunc("cons", function (_, args) {
      var a = isPair(args) ? args.car : NIL_OBJ;
      var rest = isPair(args) ? args.cdr : NIL_OBJ;
      var b = isPair(rest) ? rest.car : NIL_OBJ;
      return makePair(a, b);
    });

    bindCFunc("car", function (_, args) {
      var a = isPair(args) ? args.car : NIL_OBJ;
      if (isNil(a)) {
        return NIL_OBJ;
      }
      if (!isPair(a)) {
        error("'car' expects a pair");
      }
      return a.car;
    });

    bindCFunc("cdr", function (_, args) {
      var a = isPair(args) ? args.car : NIL_OBJ;
      if (isNil(a)) {
        return NIL_OBJ;
      }
      if (!isPair(a)) {
        error("'cdr' expects a pair");
      }
      return a.cdr;
    });

    bindCFunc("setcar", function (_, args) {
      var p = isPair(args) ? args.car : NIL_OBJ;
      if (!isPair(p)) {
        error("'setcar' expects a pair");
      }
      var rest = args.cdr;
      var v = isPair(rest) ? rest.car : NIL_OBJ;
      p.car = isNil(v) ? NIL_OBJ : v;
      return p;
    });

    bindCFunc("setcdr", function (_, args) {
      var p = isPair(args) ? args.car : NIL_OBJ;
      if (!isPair(p)) {
        error("'setcdr' expects a pair");
      }
      var rest = args.cdr;
      var v = isPair(rest) ? rest.car : NIL_OBJ;
      p.cdr = isNil(v) ? NIL_OBJ : v;
      return p;
    });

    bindCFunc("list", function (_, args) {
      return isNil(args) ? NIL_OBJ : args;
    });

    bindCFunc("not", function (_, args) {
      var a = isPair(args) ? args.car : NIL_OBJ;
      return isNil(a) ? makeSymbol("t") : NIL_OBJ;
    });

    bindCFunc("is", function (_, args) {
      var a = isPair(args) ? args.car : NIL_OBJ;
      var rest = isPair(args) ? args.cdr : NIL_OBJ;
      var b = isPair(rest) ? rest.car : NIL_OBJ;
      return valuesEqual(a, b) ? makeSymbol("t") : NIL_OBJ;
    });

    bindCFunc("atom", function (_, args) {
      var a = isPair(args) ? args.car : NIL_OBJ;
      return !isPair(a) ? makeSymbol("t") : NIL_OBJ;
    });

    bindCFunc("print", function (c, args) {
      var out = [];
      var cur = args;
      while (isPair(cur)) {
        out.push(formatValue(cur.car, false));
        cur = cur.cdr;
      }
      c.onPrint(out.join(" "));
      return isPair(args) ? args.car : NIL_OBJ;
    });

    bindCFunc("eval", function (c, args, env) {
      var x = isPair(args) ? args.car : NIL_OBJ;
      return c.evalExpr(x, env);
    });

    bindCFunc("+", function (_, args) {
      var sum = 0;
      var cur = args;
      while (isPair(cur)) {
        sum += checkNum(cur.car, "+");
        cur = cur.cdr;
      }
      return makeNumber(sum);
    });

    bindCFunc("*", function (_, args) {
      var prod = 1;
      var cur = args;
      while (isPair(cur)) {
        prod *= checkNum(cur.car, "*");
        cur = cur.cdr;
      }
      return makeNumber(prod);
    });

    bindCFunc("-", function (_, args) {
      if (!isPair(args)) {
        error("'-' expects at least one argument");
      }
      var first = checkNum(args.car, "-");
      var cur = args.cdr;
      if (isNil(cur)) {
        return makeNumber(-first);
      }
      var total = first;
      while (isPair(cur)) {
        total -= checkNum(cur.car, "-");
        cur = cur.cdr;
      }
      return makeNumber(total);
    });

    bindCFunc("/", function (_, args) {
      if (!isPair(args)) {
        error("'/' expects at least one argument");
      }
      var first = checkNum(args.car, "/");
      var cur = args.cdr;
      if (isNil(cur)) {
        if (first === 0) {
          error("division by zero");
        }
        return makeNumber(1 / first);
      }
      var total = first;
      while (isPair(cur)) {
        var d = checkNum(cur.car, "/");
        if (d === 0) {
          error("division by zero");
        }
        total /= d;
        cur = cur.cdr;
      }
      return makeNumber(total);
    });

    function makeCmp(fnName, cmpFn) {
      return function (_, args) {
        if (!isPair(args) || !isPair(args.cdr)) {
          error("'" + fnName + "' expects at least two arguments");
        }
        var prev = checkNum(args.car, fnName);
        var cur = args.cdr;
        while (isPair(cur)) {
          var next = checkNum(cur.car, fnName);
          if (!cmpFn(prev, next)) {
            return NIL_OBJ;
          }
          prev = next;
          cur = cur.cdr;
        }
        return makeSymbol("t");
      };
    }

    bindCFunc("<", makeCmp("<", function (a, b) { return a < b; }));
    bindCFunc("<=", makeCmp("<=", function (a, b) { return a <= b; }));
    bindCFunc(">", makeCmp(">", function (a, b) { return a > b; }));
    bindCFunc(">=", makeCmp(">=", function (a, b) { return a >= b; }));
    bindCFunc("==", function (_, args) {
      var a = isPair(args) ? args.car : NIL_OBJ;
      var rest = isPair(args) ? args.cdr : NIL_OBJ;
      var b = isPair(rest) ? rest.car : NIL_OBJ;
      return valuesEqual(a, b) ? makeSymbol("t") : NIL_OBJ;
    });
    bindCFunc("!=", function (_, args) {
      var a = isPair(args) ? args.car : NIL_OBJ;
      var rest = isPair(args) ? args.cdr : NIL_OBJ;
      var b = isPair(rest) ? rest.car : NIL_OBJ;
      return !valuesEqual(a, b) ? makeSymbol("t") : NIL_OBJ;
    });

    ctx.evalExpr = evalExpr;
    ctx.evalList = evalList;

    ctx.evalString = function (code) {
      var exprs = parseSource(code);
      var res = NIL_OBJ;
      var i;
      for (i = 0; i < exprs.length; i++) {
        res = evalExpr(exprs[i], NIL_OBJ);
      }
      return res;
    };

    ctx.addCFunc = bindCFunc;
    ctx.makeNumber = makeNumber;
    ctx.makeString = makeString;
    ctx.makeSymbol = makeSymbol;
    ctx.makePair = makePair;
    ctx.NIL = NIL_OBJ;

    return ctx;
  }

  var fe = {
    createContext: createContext,
    run: function (code, opts) {
      var ctx = createContext(opts);
      return ctx.evalString(code);
    }
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = fe;
  } else {
    root.fe = fe;
  }
})(this);