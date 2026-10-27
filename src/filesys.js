// filesys.js
// (c) tearflake, 2026
// MIT License

var Filesys = (
    function (obj) {
        return {
            parse: obj.parse,
            getEntity: obj.getEntity,
            main: obj.main
        };
    }
) (
    (function () {
        "use strict";
        
        let syntax = `
            (GRAMMAR
                (RULE START dir)

                (RULE dir
                    (LIST "DIR"
                        (LIST ATOMIC
                            items)))

                (RULE items
                    (LIST item items))

                (RULE items ())
                
                (RULE item
                    (LIST "FILE"
                        (LIST ATOMIC
                            (LIST ANY ()))))

                (RULE item
                    (LIST "LINK"
                        (LIST ATOMIC
                            (LIST ATOMIC ()))))

                (RULE item dir)
            )
        `;
        
        let sSyntax = SExpr.parse (syntax);

        function parse (program) {
            let ast = Parser.parse (program, sSyntax);
            let graph = makeTree(SExpr.removeComments (ast));
            if (graph.err) {
                throw {name: graph.err, message: graph.message, pos: SExpr.getPosition (program, graph.path).pos, path: graph.path, found: graph.found};
            }
            
            return graph;
        }
        
        function makeTree (sexpr) {
            if (sexpr[1].indexOf("/") > -1) {
                return {err: "Syntax error", message: `Entity name can not contain '/'`, path: [1], found: sexpr[1]};
            }
            let graph = {kind: "DIR", name: sexpr[1], items: {}};
            for (let i = 2; i < sexpr.length; i++) {
                let elem = sexpr[i];
                if (elem[0] === "DIR") {
                    if (isAvailable (graph.items, elem[1])) {
                        let maked = makeTree(elem);
                        if (maked.err) {
                            return {err: maked.err, message: maked.message, path: [i, ...maked.path], found: maked.found};
                        }

                        graph.items[elem[1]] = maked;
                    }
                    else {
                        return {err: "Syntax error", message: `Directory name ${elem[1]}not available`, path: [i, 1]};
                    }
                }
                if (elem[0] === "FILE") {
                    if (elem[1].indexOf("/") > -1) {
                        return {err: "Syntax error", message: `Entity name can not contain '/'`, path: [i, 1], found: elem[1]};
                    }
                    
                    if (isAvailable (graph.items, elem[1])) {
                        /*
                        if (elem[2][0] === "ASM") {
                            let parsed = Asm.enparse (elem[2]);
                            if (!parsed.err) {
                                graph.items[elem[1]] = {kind: "FILE", value: parsed}
                            }
                            else {
                                return {err: parsed.err, path: [i, 2, ...parsed.path]};
                            }                            
                        }
                        else {
                        */
                            graph.items[elem[1]] = {kind: "FILE", value: elem[2]};
                        //}
                    }
                    else {                    
                        return {err: "Syntax error", message: `File name ${elem[1]} not available`, path: [i, 1]};
                    }
                }
                if (elem[0] === "LINK") {
                    if (elem[1].indexOf("/") > -1) {
                        return {err: "Syntax error", message: `Entity name can not contain '/'`, path: [i, 1], found: elem[1]};
                    }

                    if (isAvailable (graph.items, elem[1])) {
                        if (typeof elem[2] === "string") {
                            graph.items[elem[1]] = {kind: "LINK", path: elem[2]};
                        }
                        else {
                            return {err: "Syntax error", message: `Link can contain only a path`, path: [i, 2]};
                        }
                    }
                    else {
                        return {err: "Syntax error", message: `Link name ${elem[1]} not available`, path: [i, 1]};
                    }
                }
            }
            
            return graph;
        }
        
        function getEntity (path, root, dir, rec) {
            path = path.substring(1, path.length - 1);
            if (path.trim() === ".") {
                return [dir, undefined];
            }
            
            if (!rec) {
                rec = [];
            }
            
            if (path in rec) {
                throw {name: "Error", message: `Detected cyclic link`};
            }
            
            let entity, accpath;
            let arrpath = path.split("/");
            if (arrpath[0] == "") {
                entity = root;
                accpath = "/"
                arrpath.shift();
            }
            else {
                entity = dir;
                accpath = ""
            }
            
            if (arrpath.length > 0 && arrpath[arrpath.length - 1].trim() == "") {
                arrpath.pop ();
            }
            
            let tmpdir = entity;
            for (let i = 0; i < arrpath.length; i++) {
                accpath += arrpath[i];
                if (entity.kind === "DIR") {
                    let item = entity.items['"' + arrpath[i] + '"'];
                    if (!item) {
                        throw {name: "Error", message: `Entity "${path}" does not exist`};
                    }
                    
                    tmpdir = entity;
                    entity = item;
                }
                else if (entity.kind == "LINK") {
                    [entity, ] = getEntity(entity.path, root, tmpdir, [...rec, entity.path]);
                }
                else if (entity.kind == "FILE") {
                    throw {name: "Error", message: `Entity "${accpath}" is not a directory`};
                }
                
                accpath += "/";
            }
            
            return [entity, tmpdir];
        }

        function isAvailable (binder, binding){
            return (!binder[binding] && !Object.hasOwn(binder, binding))
        }
        
        let skipComments = function (path, sexpr) {
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
        
        function main(args, root) {
            if (!root.items[`"main"`] || (root.items[`"main"`] && root.items[`"main"`].kind === "DIR")) {
                throw {name: "Error", message: `Procedure 'main' not found in the root directory`};
            }
            
            let [fmain, fdir] = getEntity(`"/main"`, root, root);
            let cmain = Asm.enparse (fmain.value, fdir);
            let res = Asm.run (cmain, args, root);
            
            return Asm.unlist (res);
        }

        function isIdentifier(expr) {
            return (
                typeof expr === 'string' &&
                (expr.charAt (0) !== '"' && expr.charAt (expr.length - 1) !== '"') &&
                Number.isNaN(Number(expr)) &&
                (expr !== "true" && expr !== "false") &&
                (Number.isNaN(Number(expr.charAt(0))))
            );
        }

        return {
            parse: parse,
            getEntity: getEntity,
            main: main
        }
    }) ()
);

var isNode = new Function ("try {return this===global;}catch(e){return false;}");

if (isNode ()) {
    // begin of Node.js support
    
    var SExpr = require ("./s-expr.js");
    var Parser = require ("./parser.js");
    var Asm = require ("./asm.js");
    var Builtins = require ("./builtins.js");
    module.exports = Main;
    
    // end of Node.js support
}

