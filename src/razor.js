/* jshint node:true */
var compiler = require('./compiler.js');

var Razor = (function() {
    'use strict';

    function _indent(count) {
        count *= 4;
        return new Array(++count).join(' ');
    }

    function _escape(string) {
        return string.replace(/%([\w\-]+)/g, 'this.escape(@$1)');
    }

    function _templateNameFromView(view) {
        return view.split('.')[0];
    }

    function _replaceArgs(string) {
        return string.replace(/\$([\w\-]+)/g, function(match, arg) {
            if (arg.indexOf('-') === -1) {
                return 'args.' + arg;
            }

            return 'args[\'' + arg + '\']';
        });
    }

    function _templateToJavascript(string) {

        string = string.replace(/\s{2,}/g, ' ').replace(/> </g, '><');

        // replace inline variables
        string = string.replace(new RegExp('{{\\s*(.*?);?\\s*}}', 'g'), function(group, code) {
            code = _replaceArgs(_escape(code));
            code = "' + " + code + " + '";
            return code.replace(/\'/g, '_QUOTE_');
        });

        var regex = new RegExp('{%\\s*(.*?):?\\s*%}', 'g'),
            bits = string.split(regex),
            length = bits.length,
            matches,
            bit,
            line,
            start,
            definedVars = {},
            activeVar = 't',
            line_ending,
            code = [],
            first_word,
            expression,
            extend,
            indent = 0,
            i;

        for (i = 0; i < length; i++) {
            line = bits[i].replace(/^\s+/, '').replace(/\s+$/, '');

            if (!line) {
                continue;
            }

            if (i % 2) {
                first_word = line.split(' ')[0];
                bit = line.replace(first_word, '');
                line_ending = ';';

                if (first_word === 'elseif') {
                    first_word = 'else if';
                }

                switch (first_word) {
                    case 'case':
                        line_ending = ':';
                        break;
                    case 'if':
                    case 'for':
                    case 'switch':
                        line_ending = ' {';
                        break;
                    case 'else if':
                    case 'else':
                        indent -= 1;
                        first_word = '} ' + first_word;
                        line_ending = ' {';
                        break;
                }

                // if the first line is an if statement or loop we need to make
                // sure that t is defined for later
                if (!start) {
                    start = 'var ' + activeVar + ' = \'\';\n\n';
                    definedVars[activeVar] = 1;
                    code.push(start);
                }

                if (first_word.indexOf('end') === 0) {
                    if (extend && --extend.level === 0) {
                        code.push(_indent(indent) + 't += this.render(\'' + extend.templateName + '\', {' + extend.variableName + ': ' + extend.variableName + '});\n');
                        extend = false;
                        activeVar = 't';
                        continue;
                    }

                    indent -= 1;
                    code.push(_indent(Math.max(indent, 0)) + '}\n\n');
                    continue;
                }

                expression = line_ending === ';';

                if (expression && bit.charAt(bit.length - 1) === ';') {
                    line_ending = '';
                }

                // special case for extending views
                if (first_word === 'extend' || first_word.indexOf('extend(') === 0) {
                    matches = /extend\s*\(\s*(['"])(.*?)\1\s*,\s*\$(.*?)\)/.exec(line);
                    extend = {};
                    extend.level = 1;
                    extend.templateName = _templateNameFromView(matches[2]);
                    extend.variableName = matches[3];
                    activeVar = extend.variableName;
                    continue;
                }

                // special case for rendering sub views
                if (first_word === 'render' || first_word.indexOf('render(') === 0) {
                    matches = /render\s*\(\s*(['"])(.*?)\1(,(.*?)$)?/.exec(line);
                    var templateName = _templateNameFromView(matches[2]);
                    code.push(_indent(indent) + activeVar + ' += this.' + _replaceArgs(line.replace(matches[2], templateName)) + line_ending + '\n');
                    continue;
                }

                if (extend) {
                    extend.level++;
                }

                code.push(_indent(indent) + first_word + _replaceArgs(_escape(bit)) + line_ending + '\n');

                if (!expression) {
                    indent += 1;
                }

                if (first_word === 'break') {
                    indent -= 1;
                }

                continue;
            }

            start = activeVar + ' += ';
            if (!definedVars[activeVar]) {
                start = 'var ' + activeVar + ' = ';
                definedVars[activeVar] = 1;
            }

            code.push(_indent(indent) + start + '\'' + line.replace(/\'/g, "\\'").replace(/\n/g, '').replace(/_QUOTE_/g, "'") + '\'' + ';\n');
        }

        code.push('return t;');
        return code.join('');
    }

    return {
        generate: function(string) {
            return _templateToJavascript(string);
        },

        compile: function(string) {
            return new Function(string);
        },

        process: compiler.process
    };
}) ();

module.exports = Razor;
