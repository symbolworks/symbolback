// s-expr.js
// (c) tearflake, 2026
// MIT License

"use strict"

var SExpr = (
    function (obj) {
        return {
            parse: obj.parse,
            removeComments: obj.removeComments,
            getPosition: obj.getPosition,
            stringify: obj.stringify
        };
    }
) (
    (function () {

        function tokenize(input) {
          let i = 0, line = 1, col = 1;
          const tokens = [];

          function advance(n = 1) {
            while (n-- > 0) {
              if (input[i] === "\n") { line++; col = 1; }
              else col++;
              i++;
            }
          }

          function peek(n = 0) { return input[i + n]; }

          while (i < input.length) {
            const ch = peek();

            // whitespace
            if (/\s/.test(ch)) { advance(); continue; }
            
            // strings (single, double, or repeated)
            if (ch === '"' || ch === "'") {
              let quoteChar = ch;
              let startLine = line, startCol = col;
              let count = 0;
              while (peek(count) === quoteChar) count++;
              if (count === 1 || count % 2 === 0) {
                advance();
                let value = "";
                let success = false;
                while (i < input.length) {
                  if (input[i] === '\n')
                    throw {name: "Syntax error", message: "String not terminated", pos: {x: startCol, y: startLine}};
                  if (input[i - 1] !== '\\' && input.startsWith(quoteChar, i)) {
                    success = true;
                    advance();
                    break;
                  }
                  value += peek();
                  advance();
                }
                if (quoteChar === '"') {
                  value = '"' + value + '"';
                  try {
                      value = '"' + JSON.parse(value) + '"';
                  }
                  catch {
                      throw {name: "Syntax error", message: "String not valid", pos: {x: startCol, y: startLine}};
                  }
                }
                    
                if (!success)
                  return {name: "Syntax error", message: "String not terminated", pos: {x: startCol, y: startLine}};
                tokens.push({ type: "STRING", value, line: startLine, col: startCol });
                continue;
              } else {
                advance(count);
                var start, end;
                end = i - 1;
                while (true) {
                  while (input[end] !== undefined && input[end] !== ' ' && input[end] !== '\n') {
                      end--;
                  }
                  start = end;
                  while (input[start] !== undefined && input[start] === ' ') {
                      start--;
                  }
                  if (start === end) break;
                  if (start < 0 || input[start] === '\n') {
                    start++;
                    end++;
                    break;
                  } else {
                    end = start;
                  }
                }
                  
                if (!input.startsWith('\n', i)) {
                  throw {name: "Syntax error", message: "Expected newline", pos: {x: col, y: line}};
                }
                advance();

                let prefix = input.substring(start, end);
                let value = "";
                let success = false;
                while (i < input.length && input.startsWith(prefix, i)) {
                  advance(prefix.length);

                  if (input.startsWith(quoteChar.repeat(count), i)) {
                    if (ch === '"') {
                      value = ch + value + ch;
                    }
                    success = true;
                    advance(count);
                    break;
                  }
                  
                  let lnStart = i;
                  while (i < input.length && input[i] !== '\n') advance();
                  value += input.substring(lnStart, i) + '\n';
                  advance();
                }

                if (!success) {
                  throw {name: "Syntax error", message: "String not terminated", pos: {x: startCol, y: startLine}};
                }

                tokens.push({ type: "STRING", value, line: startLine, col: startCol });
                continue;
              }
            }

            // parens
            if (ch === "(") { tokens.push({ type: "LPAREN", line, col }); advance(); continue; }
            if (ch === ")") { tokens.push({ type: "RPAREN", line, col }); advance(); continue; }

            // atom
            if (/[^()\s]/.test(ch)) {
              let startLine = line, startCol = col;
              let value = "";
              while (i < input.length && !/['\"()\s]/.test(peek())) {
                value += peek();
                advance();
              }
              tokens.push({ type: "ATOM", value, line: startLine, col: startCol });
              continue;
            }

            throw {name: "Syntax error", message: `Unexpected character '${ch}'`, pos: {x: line, y: col}};
          }
          return tokens;
        }

        function getAst(tokens) {
          let pos = 0;
          let positions = new Map();

          function parseExpr() {
            let tok = tokens[pos];

            if (!tok)
              throw {name: "Syntax error", message: "Unexpected end of s-expression", found: '""', pos: {x: 1, y: 1}};

            if (tok.type === "LPAREN") {
              pos++;
              let list = [];
              positions.set(list, { line: tok.line, col: tok.col });
              while (tokens[pos] && tokens[pos].type !== "RPAREN") {
                list.push(parseExpr());
              }
              if (!tokens[pos])
                throw {name: "Syntax error", message: "Unclosed parenthesis", pos: {x: tok.col, y: tok.line}};
              pos++; // consume RPAREN
              return list;
            }
            if (tok.type === "ATOM" || tok.type === "STRING") {
              pos++;
              positions.set(tok, { line: tok.line, col: tok.col });
              return tok;
            }
          }
          
          let ast = parseExpr();
          if (tokens[pos] !== undefined) {
            throw {name: "Syntax error", message: "Expected end of s-expression", found: tokens[pos].value, pos: {x: tokens[pos].col, y: tokens[pos].line}};
          }

          return { ast, positions };
        }

        function getPosition(code, indexPath) {
          let tokens = tokenize(code);
          const { ast, positions } = getAst(tokens);

          let node = ast;
          for (let idx of indexPath) {
            if(!Array.isArray(node))
              return {
                name: "Syntax error",
                found: node.value,
                pos: {y: positions.get(node).line, x: positions.get(node).col}
              };
            
            if(idx >= node.length){
                if(node.length === 0) {
                  return {
                    name: "Syntax error",
                    message: "Missing list elements",
                    found: "empty list",
                    pos: {
                        y: positions.get(node).line,
                        x: positions.get(node).col
                    }
                  };
                } else {
                  return {
                    name: "Syntax error",
                    message: "Missing list elements",
                    found: "end of list",
                    pos: {
                        y: positions.get(node).line,
                        x: positions.get(node).col
                    }
                  };
                }
            }
            node = node[idx];
          }
          return {
            name: "Syntax error",
            found: (Array.isArray (node) ? "list" : node.value),
            pos: {y: positions.get(node).line, x: positions.get(node).col}
          };
        }
        
        function makeNodeTree(ast) {
          if(ast.value !== undefined) {
            return ast.value;
          } else {
            return ast.map (makeNodeTree);
          }
        }
        
        function parse(code) {
          let tokens = tokenize(code);
          const { ast, positions } = getAst(tokens);
          return makeNodeTree(ast);
        }

        function stringify (node, ind) {
            if (!ind) {
                ind = "  ";
            }
            
            const stack = [{ node, indent: "", index: 0, result: "" }];
            let output = "";

            while (stack.length > 0) {
                const current = stack.pop();
                const { node, indent, index, result } = current;

                if (Array.isArray (node) && index === 0) {
                    if (typeof node === "string") {
                        output += indent + quoteIfNecessary (node) + "\n";
                        continue;
                    }
                    output += indent + "(\n";
                }

                if (node === undefined) {
                    output +=  "UNDEFINED";
                }
                else if (node === true) {
                    output +=  "TRUE";
                }
                else if (node === false) {
                    output +=  "FALSE";
                }
                else if (node === null) {
                    output +=  "NIL";
                }
                else if (Array.isArray (node)) {
                    let i = index;
                    for (; i < node.length; i++) {
                        if (Array.isArray (node[i])) {
                            stack.push ({ node, indent, index: i + 1, result });
                            stack.push ({ node: node[i], indent: indent + ind, index: 0, result: "" });
                            break;
                        }
                        else {
                            let part;
                            if (node[i] === undefined) {
                                part = "UNDEFINED";
                            }
                            else if (node[i] === true) {
                                part = "TRUE";
                            }
                            else if (node[i] === false) {
                                part = "FALSE";
                            }
                            else if (node[i] === null) {
                                part = "NIL";
                            }
                            else {
                                part = formatString(node[i], indent + ind);
                            }
                            output += indent + ind + part + "\n";
                        }
                    }

                    if (i === node.length) {
                        output += indent + ")\n";
                    }
                }
                else {
                    output += formatString(node, indent);
                }
            }

            return output;
        }
        
        function formatString(node, indent) {
            let part;
            if (typeof node === 'string' && (node.charAt (0) === '"' && node.charAt (node.length - 1) === '"')) {
                if (node.indexOf("\n") === -1) {
                    part = node;
                }
                else {
                    part = "\"\n";
                    let tmp = node.substring(1, node.length - 1).split("\n");
                    for (let j = 0; j < tmp.length; j++) {
                        part += indent + tmp[j] + ((j < tmp.length - 1) ? "\n" : "");
                    }
                    part += "\"";
                }
            }
            else {
                part = quoteIfNecessary (node);
            }
            
            return part;
        }

        function quoteIfNecessary (str) {
            var quoted = false;
            if (typeof str === 'string' && str.charAt(0) !== '"' && str.charAt(str.length - 1) !== '"') {
                for (var i = 0; i < str.length; i++) {
                    if (str === "" || '() \t\n\r'.indexOf (str.charAt (i)) > -1) {
                        quoted = true;
                        break;
                    }
                }
            }
            
            return (quoted ? "'" + str + "'" : str);
        }

        function removeComments(sexpr) {
            if(Array.isArray(sexpr)) {
                let result = [];
                for (let i = 0; i < sexpr.length; i++) {
                    if (sexpr[i] && sexpr[i][0] !== "**") {
                        result.push (removeComments(sexpr[i]));
                    }
                }
                
                return result;
            }
            else {
                return sexpr;
            }
        }
        
        return {
            parse: parse,
            removeComments: removeComments,
            getPosition: getPosition,
            stringify: stringify
        }
    }) ()
);

var isNode = new Function ("try {return this===global;}catch(e){return false;}");

if (isNode ()) {
    // begin of Node.js support

    module.exports = SExpr;
    
    function escapeRegExp(string) {
      return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
    }

    function replaceAll(str, match, replacement){
       return str.replace(new RegExp(escapeRegExp(match), 'g'), ()=>replacement);
    }

    if(typeof String.prototype.replaceAll === "undefined") {
        String.prototype.replaceAll = function (match, replace) {return replaceAll (this.valueOf (), match, replace);};
    }

    // end of Node.js support
}

