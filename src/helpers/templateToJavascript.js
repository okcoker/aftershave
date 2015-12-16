var transform = require('./transform');
var templateNameFromPath = require('./templateNameFromPath');
var utils = require('./utils');
var constants = require('./constants');

function templateToJavascript(string, options) {
    options = options || {};

    string = string.replace(/\s{2,}/g, ' ').replace(/> </g, '><');

    // replace inline variables
    string = string.replace(new RegExp('{{\\s*(.*?);?\\s*}}', 'g'), function(group, code) {
        code = "' + " + code + " + '";
        return code.replace(/\'/g, '_QUOTE_');
    });

    // strip out html comments
    string = string.replace(/<!--(.*?)-->/g, '');

    var regex = new RegExp('{%\\s*(.*?)[:;]?\\s*%}', 'g'),
        functionRegex = /^\s*?([a-zA-Z0-9_]+)?\s*\((.*)\)/,
        bits = string.split(regex),
        length = bits.length,
        matches,
        bit,
        line,
        start,
        definedVars = {},
        defaultVar = '_t',
        useBasename,
        activeVar = defaultVar,
        lineEnding,
        code = [],
        firstWord,
        expression,
        extend,
        block,
        indent = 0,
        i,
        imports = [];

    for (i = 0; i < length; i++) {
        line = bits[i];

        // Strip out and save import statements
        if (line.indexOf('import') === 0) {
            // Add semicolon if not already added
            if (line[line.length - 1] !== ';') {
                line += ';'
            }

            imports.push(line);

            line = '';
        }

        // if it is all spaces then remove them
        if (line.replace(/ /g, '') === '') {
            line = '';
        }

        if (!line) {
            continue;
        }

        if (i % 2) {
            firstWord = line.split(' ')[0];
            bit = line.replace(firstWord, '');
            lineEnding = ';';

            if (firstWord === 'elseif') {
                firstWord = 'else if';
            }

            switch (firstWord) {
                case 'case':
                case 'default':
                    lineEnding = ':';
                    break;
                case 'if':
                case 'for':
                case 'switch':
                    lineEnding = ' {';
                    break;
                case 'else if':
                case 'else':
                    indent -= 1;
                    firstWord = '} ' + firstWord;
                    lineEnding = ' {';
                    break;
            }

            // if the first line is an if statement or loop we need to make
            // sure that t is defined for later
            if (!definedVars[activeVar]) {
                start = 'var ' + activeVar + ' = \'\';\n\n';
                definedVars[activeVar] = 1;
                code.push(start);
            }

            if (firstWord.indexOf('end') === 0) {
                if (block && --block === 0) {

                    // if this is not an extended block
                    // then allow the default block value to come through
                    if (!extend) {
                        code.push(utils.indent(indent) + defaultVar + ' += ' + activeVar.replace(/Block$/, '') + ' || ' + activeVar + ';\n');
                    }

                    activeVar = defaultVar;
                    continue;
                }

                indent -= 1;
                code.push(utils.indent(Math.max(indent, 0)) + '}\n\n');
                continue;
            }

            expression = lineEnding === ';';

            // if there is an expression that ends on the same line
            if (lineEnding === ' {' && bit.charAt(bit.length - 1) === '}') {
                expression = true;
                lineEnding = '';
            }

            if (expression && bit.charAt(bit.length - 1) === ';') {
                lineEnding = '';
            }

            if (firstWord === 'block') {
                block = 1;
                activeVar = utils.trim(utils.stripQuotes(bit)) + 'Block';
                continue;
            }

            // special case for extending views
            if (firstWord === 'extend' || firstWord === 'extends') {
                useBasename = false;
                extend = templateNameFromPath(utils.stripQuotes(bit), useBasename);
                continue;
            }

            // render helper functions
            if (expression && functionRegex.test(line)) {
                matches = functionRegex.exec(line);
                var functionName = matches[1];
                var functionArgs = matches[2].split(',');

                if (functionName != 'if' && functionName != 'for' && functionName != 'switch') {

                    if (!constants.NATIVE_FUNCTIONS.hasOwnProperty(functionName)) {
                        functionName = 'this.helpers.' + functionName;

                        // special for render and escape
                        if (matches[1] === 'render') {
                            useBasename = false;

                            // if it starts with a quote then do some magic
                            if (functionArgs[0].charAt(0) == "'" || functionArgs[0].charAt(0) == '"') {
                                functionArgs[0] = '\'' + templateNameFromPath(functionArgs[0].replace(/['"]/g, ''), useBasename) + '\'';
                            }

                            functionName = 'render';

                            if (!options.exports) {
                                functionName = 'this.' + functionName;
                            }
                        }

                        if (matches[1] === 'escape') {
                            functionName = 'escape';

                            if (!options.exports) {
                                functionName = 'this.' + functionName;
                            }
                        }
                    }

                    code.push(utils.indent(indent) + activeVar + ' += (' + functionName + '(' + functionArgs.join(',') + ') || \'\')' +lineEnding + '\n');
                    continue;
                }
            }

            // only increase block level with if for and switch statements
            // when an else statement happens it shouldn't increase again
            // because there is still only one {% end %} statement that is
            // expected
            if (block && ['if', 'for', 'switch'].indexOf(firstWord) !== -1) {
                block += 1;
            }

            code.push(utils.indent(indent) + firstWord + bit + lineEnding + '\n');

            if (!expression) {
                indent += 1;
            }

            if (firstWord === 'break') {
                indent -= 1;
            }

            continue;
        }

        start = activeVar + ' += ';
        if (!definedVars[activeVar]) {
            start = 'var ' + activeVar + ' = ';
            definedVars[activeVar] = 1;
        }

        code.push(utils.indent(indent) + start + '\'' + line.replace(/\'/g, "\\'").replace(/\n/g, '').replace(/_QUOTE_/g, "'") + '\'' + ';\n');
    }

    if (extend) {
        for (var key in definedVars) {
            if (key != defaultVar) {
                code.push(utils.indent(indent) + 'args.' + key.replace(/Block$/, '') + ' = ' + key + ';\n');
            }
        }

        code.push(defaultVar + ' += this.render(\'' + extend + '\', args);\n');
    }

    code.push('return ' + defaultVar + ';');

    return transform(code.join(''), options, imports);
}

module.exports = templateToJavascript;