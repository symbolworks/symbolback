// builtins.js
// (c) tearflake, 2026
// MIT License

var Builtins = (function() {
    function pathSplit(strPath) {
        strPath = strPath.substring(1, strPath.length - 1);
        path = strPath.split("/")
        name = path.pop()
        return {path: path, name: '"' + name + '"'}
    }

    function typeCheck(args, types) {
        if(types.length !== args.length) {
            throw {name: "Runtime error", message: `Arity mismatch`};
        }
        
        for(let i = 0; i < args.length; i++) {
            if(types[i] === "atom") {
                if(Array.isArray(args[i]) || typeof args[i] === "object") {
                    throw {name: "Runtime error", message: `Expected atom`};
                }
            }
            else if(types[i] === "list") {
                if(args[i] && args[i].kind !== "LIST") {
                    throw {name: "Runtime error", message: `Expected list`};
                }
            }
            else if(types[i] === "sexpr") {
            }
            else if(types[i] === "asm") {
                if(args[i] && args[i].kind !== "ASM") {
                    throw {name: "Runtime error", message: `Expected 'ASM' element`};
                }
            }
            else if(types[i] == "string") {
                if(typeof args[i] !== "string") {
                    throw {name: "Runtime error", message: `Expected string`}
                }
            }
            else if(types[i] === "any") {
            }
        }
    }

    return {
        /*
            testing expressions
        */
        
        "isatom": {
            kind: "NATIVE",
            args: ["any"],
            apply: (args, root, dir) => {
                typeCheck(args, Builtins["isatom"].args);

                return (!Array.isArray(args[0]) && typeof args[0] !== "object");
            }
        },
        "islist": {
            kind: "NATIVE",
            args: ["any"],
            apply: (args, root, dir) => {
                typeCheck(args, Builtins["islist"].args);

                return (typeof args[0] === "object" && args[0].kind === "LIST");
            }
        },
        "iscallable": {
            kind: "NATIVE",
            args: ["any"],
            apply: (args, root, dir) => {
                typeCheck(args, Builtins["iscallable"].args);

                return (typeof args[0] === "object" && (args[0].kind === "ASM" || args[0].kind === "NATIVE"));
            }
        },
        
        /*
            list functions
        */
        
        "cons": {
            kind: "NATIVE",
            args: ["atom", "list"],
            apply: (args, root, dir) => {
                typeCheck(args, Builtins["cons"].args);

                return {kind: "LIST", args: [args[0], ...args[1].args]};
            }
        },
        "head": {
            kind: "NATIVE",
            args: ["list"],
            apply: (args, root, dir) => {
                typeCheck(args, Builtins["head"].args);
                
                if(args[0].args.length == 0) {
                    return null;
                }
                else {
                    return args[0].args[0];
                }
            }
        },
        "tail": {
            kind: "NATIVE",
            args: ["list"],
            apply: (args, root, dir) => {
                typeCheck(args, Builtins["tail"].args);

                return {kind: "LIST", args: args[0].args.slice(1)};
            }
        },
        
        /*
            callable conversion
        */
        
        "enasm": {
            kind: "NATIVE",
            args: ["string", "list"],
            apply: (args, root, dir) => {
                typeCheck(args, Builtins["enasm"].args);

                let [item, ] = Filesys.getEntity(args[0], root, dir);
                return Asm.enparse(Asm.unlist(args[1]), item);
            },
        },
        "unasm": {
            kind: "NATIVE",
            args: ["asm"],
            apply:  (args, root, dir) => {
                typeCheck(args, Builtins["unasm"].args);

                return Asm.enlist(Asm.unparse(args[0]))
            },
        },
        
        /*
            virtual filesystem operations
        */
        
        "read": {
            kind: "NATIVE",
            args: ["string"],
            apply: (args, root, dir) => {
                typeCheck(args, Builtins["read"].args);
                
                let [item, ] = Filesys.getEntity(args[0], root, dir);
                while (item.kind == "LINK") {
                    [item, dir] = Filesys.getEntity(item.path, root, dir);
                }
                
                if(item.kind === "FILE") {
                    return Asm.enlist(item.value);
                }
                else {
                    throw {name: "Runtime error", message: `Applying 'read' function to a non-file entity`};
                }
            }
        },
        "write": {
            kind: "NATIVE",
            args: ["string", "any"],
            apply: (args, root, dir) => {
                typeCheck(args, Builtins["write"].args);
                
                let [item, ] = Filesys.getEntity(args[0], root, dir);
                while (item.kind == "LINK") {
                    [item, dir] = Filesys.getEntity(item.path, root, dir);
                }

                if(item.kind === "FILE") {
                    item.value = Asm.unlist(args[1])
                }
                else {
                    throw {name: "Runtime error", message: `Applying 'write' function to a non-file entity ${args[0]}`};
                }
            }
        },
        "readlnk": {
            kind: "NATIVE",
            args: ["string"],
            apply: (args, root, dir) => {
                typeCheck(args, Builtins["readlnk"].args);
                
                let [item, ] = Filesys.getEntity(args[0], root, dir);
                if(item.kind !== "LINK") {
                    throw {name: "Runtime error", message: `Applying 'readlnk' function to a non-link entity ${args[0]}`};
                }

                return item.path
            }
        },
        "writelnk": {
            kind: "NATIVE",
            args: ["string", "string"],
            apply: (args, root, dir) => {
                typeCheck(args, Builtins["writelnk"].args);
                
                let [item, ] = Filesys.getEntity(args[0], root, dir);
                if(item.kind !== "LINK") {
                    throw {name: "Runtime error", message: `Applying 'writelnk' function to a non-link entity ${args[0]}`};
                }
                
                item.path = args[1]
            }
        },
        "mkdir": {
            kind: "NATIVE",
            args: ["string"],
            apply: (args, root, dir) => {
                typeCheck(args, Builtins["mkdir"].args);
                
                tmp = pathSplit(args[0]);
                let [item, ] = Filesys.getEntity('"' + tmp.path.join("/") + '"', root, dir);
                if(item.kind !== "DIR") {
                    throw {name: "Runtime error", message: `Entity "${tmp.path.join("/")}" is not a directory`};
                    Error(`'${tmp.path}' is not a directory`)
                }
                else if (item.items[tmp.name]) {
                    throw {name: "Runtime error", message: `Entity ${args[0]} already exists`};
                }
                
                item.items[tmp.name] = {kind: "DIR", name: tmp.name, items: {}};
            }
        },
        "mkfile": {
            kind: "NATIVE",
            args: ["string"],
            apply: (args, root, dir) => {
                typeCheck(args, Builtins["mkfile"].args);
                
                tmp = pathSplit(args[0]);
                let [item, ] = Filesys.getEntity('"' + tmp.path.join("/") + '"', root, dir);
                if(item.kind !== "DIR") {
                    throw {name: "Runtime error", message: `Entity "${tmp.path.join("/")}" is not a directory`};
                    Error(`'${tmp.path}' is not a directory`)
                }
                else if (item.items[tmp.name]) {
                    throw {name: "Runtime error", message: `Entity ${args[0]} already exists`};
                }
                
                item.items[tmp.name] = {kind: "FILE", value: ""}
            }
        },
        "mklink": {
            kind: "NATIVE",
            args: ["string"],
            apply: (args, root, dir) => {
                typeCheck(args, Builtins["mklink"].args);
                
                tmp = pathSplit(args[0]);
                let [item, ] = Filesys.getEntity('"' + tmp.path.join("/") + '"', root, dir);
                if(item.kind !== "DIR") {
                    throw {name: "Runtime error", message: `Entity "${tmp.path.join("/")}" is not a directory`};
                    Error(`'${tmp.path}' is not a directory`)
                }
                else if (item.items[tmp.name]) {
                    throw {name: "Runtime error", message: `Entity ${args[0]} already exists`};
                }
                
                item.items[tmp.name] = {kind: "LINK", path: ""};
            }
        },
        "delete": {
            kind: "NATIVE",
            args: ["string"],
            apply: (args, root, dir) => {
                typeCheck(args, Builtins["delete"].args);
                
                if(Builtins["exists"].apply([args[0]], root, dir)) {
                    let [item, tmpdir] = Filesys.getEntity(args[0], root, dir);
                    tmp = pathSplit(args[0])
                    delete tmpdir.items[tmp.name];
                }
                else {
                    throw {name: "Runtime error", message: `Entity ${args[0]} does not exist`};
                }
            }
        },
        "exists": {
            kind: "NATIVE",
            args: ["string"],
            apply: (args, root, dir) => {
                typeCheck(args, Builtins["exists"].args);
                
                try {
                    let [item, ] = Filesys.getEntity(args[0], root, dir);
                }
                catch(e) {
                    return false;
                }

                return true;
            }
        },
        "kind": {
            kind: "NATIVE",
            args: ["string"],
            apply: (args, root, dir) => {
                typeCheck(args, Builtins["kind"].args);
                
                let [item, ] = Filesys.getEntity(args[0], root, dir);
                return `"` + item.kind + `"`;
            }
        },
        "listdir": {
            kind: "NATIVE",
            args: ["string"],
            apply: (args, root, dir) => {
                typeCheck(args, Builtins["listdir"].args);
                
                let [item, ] = Filesys.getEntity(args[0], root, dir);
                if(item.kind !== "DIR") {
                    throw {name: "Runtime error", message: `Entity ${args[0]} is not a directory`};
                }
                
                let lst = []
                for (name in item.items) {
                    lst.push(name);
                }
                
                return {kind: "LIST", args: lst};
            }
        }
    }
})()

var isNode = new Function ("try {return this===global;}catch(e){return false;}");

if (isNode ()) {
    // begin of Node.js support
    
    var Filesys = require ("./filesys.js");
    var Asm = require ("./asm.js");
    module.exports = Builtins;
    
    // end of Node.js support
}

