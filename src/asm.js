// asm.js
// (c) tearflake, 2026
// MIT License

var Asm = (
    function (obj) {
        return {
            enparse: obj.enparse,
            enlist: obj.enlist,
            unlist: obj.unlist,
            run: obj.run
        };
    }
) (
    (function () {
        "use strict";

        let syntax = `
            (GRAMMAR
                (RULE START asm)

                (RULE asm
                    (LIST "ASM" cArgs))

                (RULE cArgs
                    (LIST args cVars))
                
                (RULE cArgs cVars)

                (RULE args
                    (LIST "ARGS" plusArg))

                (RULE plusArg
                    (LIST ATOMIC plusArg))
                
                (RULE plusArg
                    (LIST ATOMIC
                        ()))
                
                (RULE cVars
                    (LIST vars cInstr))
                
                (RULE cVars cInstr)
                
                (RULE vars
                    (LIST "VARS" plusVar))

                (RULE plusVar
                    (LIST ATOMIC plusVar))
                
                (RULE plusVar
                    (LIST ATOMIC
                        ()))

                (RULE cInstr
                    (LIST instr cInstr))
                
                (RULE cInstr
                    (LIST instr
                        ()))

                (RULE instr
                    (LIST "LABEL"
                        (LIST ATOMIC
                            ())))
                
                (RULE instr
                    (LIST "ASGN"
                        (LIST ATOMIC
                            (LIST expr
                                ()))))
                
                (RULE instr
                    (LIST "JMPNE"
                        (LIST expr
                            (LIST expr
                                (LIST ATOMIC
                                    ())))))
                
                (RULE instr
                    (LIST "JMPEQ"
                        (LIST expr
                            (LIST expr
                                (LIST ATOMIC
                                    ())))))
                
                (RULE instr
                    (LIST "JMP"
                        (LIST ATOMIC
                            ())))
                
                (RULE instr
                    (LIST "RETURN"
                        (LIST expr
                            ())))
                
                (RULE instr "RETURN")
                
                (RULE instr call)
                
                (RULE call
                    (LIST "CALL"
                        (LIST proc
                            timesExpr)))
                
                (RULE proc ATOMIC)
                
                (RULE proc call)
                
                (RULE proc asm)
                
                (RULE expr ATOMIC)
                
                (RULE expr call)
                
                (RULE expr asm)

                (RULE expr
                    (LIST "LIST" timesExpr))
                
                (RULE timesExpr
                    (LIST expr timesExpr))
                
                (RULE timesExpr ())
            )
        `;
        
        let sSyntax = SExpr.parse (syntax);

        function enparse (sProgram, dir) {
            let ast = Parser.parseSExpr (sProgram, sSyntax);
            let tree = makeTree (SExpr.removeComments (ast), dir);
            if (tree.err) {
                throw {name: "Syntax error", message: tree.err, path: skipComments(tree.path, ast), found: tree.found};
            }

            return tree;
        }
        
        function makeTree (sexpr, dir) {
            let graph = {kind: "ASM", args: [], vars: [], labels: {}, instrs: [], dir: dir};
            let prog = sexpr;
            let off = 0;
            for (let i = 1; i < prog.length; i++) {
                let elem = prog[i];
                if (elem[0] === "ARGS") {
                    for (let j = 1; j < elem.length; j++) {
                        if (isLiteral (elem[j])) {
                            return {err: "ARGS expects identifiers", path: [i, j], found: elem[j]}
                        }
                        
                        graph.args.push (elem[j]);
                    }
                    off++;
                }
                else if (elem[0] === "VARS") {
                    for (let j = 1; j < elem.length; j++) {
                        if (graph.args.indexOf (elem[j]) === -1) {
                            if (isLiteral (elem[j])) {
                                return {err: "VARS expects identifiers", path: [i, j], found: elem[j]}
                            }
                            
                            graph.vars.push (elem[j]);
                        }
                        else {
                            console.log (`WARNING: variable '${elem[j]}' occurs in args`);
                        }
                    }
                    off++;
                }
                else if (elem[0] === "LABEL") {
                    if (isAvailable (graph.labels, elem[1])) {
                        graph.labels[elem[1]] = i - 1 - off;
                    }
                    else {
                        console.log (`WARNING: label '${elem[1]}' not available`);
                    }
                    
                    graph.instrs.push ({kind: "LABEL", label: elem[1], line: i - 1 - off});
                }
                else if (elem[0] === "CALL") {
                    let c = makeExpr (elem[1], dir);
                    if (c && c.err) {
                        c.path = [1, ...c.path];
                        return c;
                    }
                    
                    let a = [];
                    for (let j = 2; j < elem.length; j++) {
                        let ae = makeExpr(elem[j], dir);
                        if (ae && ae.err) {
                            ae.path = [i, j, ...ae.path];
                            return aelem;
                        }
                        
                        a.push (ae)
                    }
                
                    graph.instrs.push ({kind: "CALL", type: "STMT", calling: c, args: a});
                }
                else if (elem[0] === "ASGN") {
                    if (!isIdentifier(elem[1])) {
                        return {err: "ASGN expects identifier as lvalue", path: [i, 1], found: (Array.isArray (elem[1]) ? "list" : elem[1])};
                    }
                    let v = makeExpr (elem[1], dir);
                    let e = makeExpr (elem[2], dir);
                    if (e && e.err) {
                        e.path = [i, 2, ...e.path];
                        return e;
                    }
                    
                    graph.instrs.push ({kind: "ASGN", var: v, value: e});
                }
                else if (elem[0] === "JMPNE" || elem[0] === "JMPEQ") {
                    let e = [];
                    for (let j = 1; j <= 2; j++) {
                        e[j] = makeExpr (elem[j], dir);
                        if (e[j] && e[j].err) {
                            e[j].path = [i, j, ...e[i].path];
                            return e[j];
                        }
                    }
                    
                    graph.instrs.push ({kind: elem[0], e1: e[1], e2: e[2], label: elem[3]});
                }
                else if (elem[0] === "JMP") {
                    graph.instrs.push ({kind: "JMP", label: elem[1]});
                }
                else if (elem[0] === "RETURN") {
                    let e = makeExpr (elem[1], dir);
                    if (e && e.err) {
                        e.path = [i, 1, ...e.path];
                        return e;
                    }
                    
                    graph.instrs.push ({kind: "RETURN", value: e});
                }
                else if (elem === "RETURN") {
                    graph.instrs.push ({kind: "RETURN", value: null});
                }
            }
            
            return graph;
        }
        
        function makeExpr (sexpr, dir) {
            if (Array.isArray (sexpr)) {
                if (sexpr[0] === "LIST") {
                    let args = [];
                    for (let i = 1; i < sexpr.length; i++) {
                        let elem = makeExpr(sexpr[i], dir);
                        if (elem && elem.err) {
                            elem.path = [i, ...elem.path];
                            return elem;
                        }
                        
                        args.push (elem)
                    }
                    
                    return {kind: "LIST", args: args};
                }
                else if (sexpr[0] === "CALL") {
                    let calling = makeExpr (sexpr[1], dir);
                    if (calling && calling.err) {
                        calling.path = [1, ...calling.path];
                        return calling;
                    }
                    
                    let args = [];
                    for (let i = 2; i < sexpr.length; i++) {
                        let elem = makeExpr(sexpr[i], dir);
                        if (elem && elem.err) {
                            elem.path = [i, ...elem.path];
                            return elem;
                        }
                        
                        args.push (elem);
                    }
                    
                    return {kind: "CALL", type: "EXPR", calling: calling, args: args};
                }
                else if (sexpr[0] === "ASM") {
                    return makeTree (sexpr, dir);
                }
                else {
                    return {err: "Make error", path: []}
                }
            }
            else if (isLiteral (sexpr)) {
                if (!Number.isNaN(Number(sexpr))) {
                    return Number(sexpr);
                }
                else if (sexpr === "TRUE") {
                    return true;
                }
                else if(sexpr === "FALSE") {
                    return false;
                }
                else if(sexpr === "NIL") {
                    return null;
                }
                else {
                    return sexpr;
                }
            }
            else if (isIdentifier (sexpr)) {
                return {kind: "VAR", name: sexpr};
            }
        }

        function isLiteral(expr) {
            return (
                typeof expr === 'string' && (
                    (expr.charAt (0) === '"' && expr.charAt (expr.length - 1) === '"') ||
                    !Number.isNaN(Number(expr)) ||
                    expr === "TRUE" ||
                    expr === "FALSE" ||
                    expr === "NIL"
                )
            );
        }

        function isIdentifier(expr) {
            return (
                typeof expr === 'string' && (
                    (expr.charAt (0) !== '"' || expr.charAt (expr.length - 1) !== '"') &&
                    Number.isNaN(Number(expr)) &&
                    expr !== "TRUE" &&
                    expr !== "FALSE" &&
                    expr !== "NIL"
                )
            );
        }
        
        function isAvailable (binder, binding) {
            return (!binder[binding] && !Object.prototype.hasOwnProperty.call(binder, binding))
        }
        
        function contains(set, el) {
            return (set[el] || Object.prototype.hasOwnProperty.call(set, el))
        }
        
        function unparse (expr) {
            return unmake (expr);
        }
        
        function unmakeTree (expr) {
            if (expr.kind === "ASM") {
                let res = ["LIST", "ASM"];
                if (expr.args.length > 0) {
                    res.push (["ARGS", ...expr.args]);
                }
                    
                if (expr.vars.length > 0) {
                    res.push (["VARS", ...expr.vars]);
                }
                    
                for (let i = 0; i < expr.instrs.length; i++) {
                    instr = expr.instrs[i];
                    if (instr.kind === "LABEL") {
                        res.push ({kind: "LIST", args: ["LABEL", instr.label]});
                    }
                    else if (instr.kind === "CALL") {
                        res.push ({kind: "LIST", args: ["CALL", unmakeExpr (instr.calling), ...instr.args.map (e => unmakeExpr (e))]});
                    }
                    else if (instr.kind === "ASGN") {
                        res.push ({kind: "LIST", args: ["ASGN", instr.var.name, unmakeExpr (instr.value)]});
                    }
                    else if (instr.kind === "JMPNE" || instr.kind === "JMPEQ") {
                        res.push ({kind: "LIST", args: [instr.kind, unmakeExpr (instr.e1), unmakeExpr (instr.e2), instr.label]});
                    }
                    else if (instr.kind === "JMP") {
                        res.push ({kind: "LIST", args: ["JMP", instr.label]});
                    }
                    else if (instr.kind === "RETURN") {
                        res.push ({kind: "LIST", args: ["RETURN", unmakeExpr (instr.value)]});
                    }
                }
                
                return res;
            }
            
            throw {name: "Runtime error", message: `Expression not valid`};
        }
        
        function unmakeExpr (expr) {
            if (expr && expr.kind === "ASM") {
                return unmakeTree (expr); 
            }
            else if (expr && expr.kind === "CALL") {
                return {kind: "LIST", args: ["CALL", unmakeExpr (expr.calling), ...expr.args.map (e => unmakeExpr (e))]};
            }
            else if (expr && expr.kind === "LIST") {
                return {kind: "LIST", args: ["LIST", ...expr.args.map (e => unmakeExpr (e))]};
            }
            else if (isLiteral (expr)) {
                if (typeof expr === "number") {
                    return expr.toString ();
                }
                else if (typeof expr === "boolean") {
                    if (expr) {
                        return "TRUE";
                    }
                    else {
                        return "FALSE"
                    }
                }
                else if (expr === null) {
                    return "NIL";
                }
                else if (typeof expr === "string" && expr.charAt (0) === '"' && expr.charAt (expr.length - 1) === '"') {
                    return expr.substring (1, expr.length - 1);
                }
                return expr;
            }
            
            throw {name: "Runtime error", message: `Expression not valid`};
        }
        
        function skipComments (path, sexpr) {
            let result = [...path];
            let ts = sexpr;
            for (let i = 0; i < path.length; i++) {
                if (ts[result[i]]){
                    for (let j = 0; j <= result[i]; j++) {
                        if (ts[j] && ts[j][0] == "**") {
                            result[i]++;
                        }
                    }
                    
                    ts = ts[result[i]];
                }
            }
            
            return result;
        }
        
        function enlist(sexpr) {
            if (Array.isArray (sexpr)) {
                return {kind: "LIST", args: sexpr.map (e => enlist (e))};
            }
            else {
                if (!Number.isNaN(Number(sexpr))) {
                    return Number(sexpr);
                }
                else if (sexpr === "TRUE") {
                    return true;
                }
                else if (sexpr === "FALSE") {
                    return false;
                }
                else if (sexpr === "NIL") {
                    return null;
                }
                else if (typeof sexpr === "string") {
                    return '"' + sexpr + '"';
                }
            }
            
            throw {name: "Runtime error", message: "Not an S-expression"};
        }
        
        function unlist(expr) {
            if (expr && expr.kind === "ASM") {
                throw {name: "Runtime error", message: "ASM nodes not allowed in the context"}; 
            }
            else if (expr && expr.kind === "LIST") {
                return expr.args.map (e => unlist (e));
            }
            else {
                if (typeof expr === "number") {
                    return expr.toString ();
                }
                else if (typeof expr === "boolean") {
                    if (expr) {
                        return "TRUE";
                    }
                    else {
                        return "FALSE"
                    }
                }
                else if (expr === null) {
                    return "NIL";
                }
                else if (typeof expr === "string" && expr.charAt (0) === '"' && expr.charAt (expr.length - 1) === '"') {
                    return expr.substring (1, expr.length - 1);
                }
            }
            
            throw {name: "Runtime error", message: "Not a tree of constants"}; 
        }
        
        function run (prog, args, root) {
            if (prog.args.length != args.length) {
                throw {name: "Runtime error", message: `Arity mismatch`};
            }
            
            let env = {};
            for (let i = 0; i < prog.args.length; i++) {
                env[prog.args[i]] = args[i];
            }
            
            for (let i = 0; i < prog.vars.length; i++) {
                env[prog.vars[i]] = undefined;
            }
            
            let labels = {};
            for (let idx = 0; idx < prog.instrs.length; idx++) {
                if (prog.instrs[idx].kind === "LABEL") {
                    labels[prog.instrs[idx].label] = idx;
                }
            }
            
            let idx = 0;
            let ctx = {env: env, root: root, dir: prog.dir};
            while (idx < prog.instrs.length) {
                let instr = prog.instrs[idx];
                if (instr.kind === "CALL") {
                    evalCall(instr, ctx);
                }
                else if (instr.kind ===  "RETURN") {
                    if (instr.value === undefined) {
                        return undefined;
                    }
                    
                    return evalExpr (instr.value, ctx);
                }
                else if (instr.kind === "ASGN") {
                    env[instr.var.name] = evalExpr (instr.value, ctx);
                }
                else if (instr.kind === "JMPNE" || instr.kind === "JMPEQ") {
                    let e1 = evalExpr (instr.e1, ctx);
                    let e2 = evalExpr (instr.e2, ctx);
                    if (!isCompiledLiteral (e1) || !isCompiledLiteral (e2)) {
                        throw {name: "Runtime error", message: `Control flow error: compared values not reduced to literals`};
                    }
                    
                    if (!contains(labels, instr.label)) {
                        throw {name: "Runtime error", message: `Nonexisting label: '${instr.label}'`};
                    }
                    if ((instr.kind === "JMPNE") == (e1 !== e2)) {
                        idx = labels[instr.label];
                    }
                }
                else if (instr.kind ===  "JMP") {
                    if (!contains (labels, instr.label)) {
                        throw {name: "Runtime error", message: `Nonexisting label: '${instr.label}'`};
                    }
                    
                    idx = labels[instr.label];
                }
                
                idx += 1;
            }
            
            return undefined;
        }

        function evalExpr (expr, ctx) {
            if (expr && expr.kind === "VAR") {
                return evalVar (expr, ctx);
            }
            else if (expr && expr.kind === "LIST") {
                return evalList (expr, ctx);
            }
            else if (expr && expr.kind === "CALL") {
                return evalCall (expr, ctx);
            }
            
            return expr;
        }

        function evalVar (expr, ctx)  {
            if (contains (ctx.env, expr.name)) {
                if (ctx.env[expr.name] === undefined) {
                    throw {name: "Runtime error", message: `Variable accessed before assignment: '${expr.name}'`};
                }
                
                return ctx.env[expr.name];
            }
            else if (contains (Builtins, expr.name)) {
                return Builtins[expr.name];
            }
            
            throw {name: "Runtime error", message: `Undeclared variable: '${expr.name}'`};
        }
        
        function evalList (expr, ctx) {
            return {kind: "LIST", args: expr.args.map (e => evalExpr (e, ctx))};
        }
                
        function evalCall (expr, ctx) {
            let fn = evalExpr (expr.calling, ctx);
            let args = expr.args.map (e => evalExpr (e, ctx));
            let result;
            if (fn.kind === "ASM") {
                result = run (fn, args, ctx.root);
            }
            else if (fn.kind === "NATIVE") {
                result = fn.apply (args, ctx.root, ctx.dir);
            }
            else {
                throw {name: "Runtime error", message: `Expression not callable`}
            }
            
            if (expr.type === "EXPR" && result === undefined) {
                throw {name: "Runtime error", message: `Function returned undefined result`};
            }
            
            return result;
        }
        
        function isCompiledLiteral(expr) {
            return (
                typeof expr === 'string' ||
                typeof expr === 'number' ||
                typeof expr === 'boolean' ||
                expr === null
            );
        }
        
        return {
            enparse: enparse,
            enlist: enlist,
            unlist: unlist,
            run: run
        }
    }) ()
);

var isNode = new Function ("try {return this===global;}catch(e){return false;}");

if (isNode ()) {
    // begin of Node.js support
    
    var SExpr = require ("./s-expr.js");
    var Parser = require ("./parser.js");
    var Builtins = require ("./builtins.js");
    module.exports = Asm;
    
    // end of Node.js support
}

