/* jshint node: true */
/* global console */
var VERSION = '0.3.0',
    fs = require('fs'),
    razor = require('./razor.js'),
    start_output = '',
    output = '',

Compiler = (function() {
    'use strict';

    function _getStart(name) {
        var start = 'Razor.Templates';
        if (name.indexOf('-') === -1) {
            return start += '.' + name;
        }
        return start += "['" + name + "']";
    }

    function _wrap(fn, name, first) {
        var code = (first ? '    ' : '\n    ') + _getStart(name) + ' = function(args) {\n';
        code += '        ' + fn.replace(/\n/g, '\n        ') + '    \n    };\n';
        return code;
    }

    function _startOutput() {
        var str = '// generated by Razor ' + VERSION + '\n';
        str += '(function() {\n';
        str += '    var Razor = {};\n';

        if (!Compiler.alone) {
            str += '    Razor.Templates = {};\n';
            str += '    Razor.render = function(name, args) {\n';
            str += '        if (Razor.Templates[name]) {\n';
            str += '            return Razor.Templates[name].call(Razor, args || {});\n';
            str += '        }\n';
            str += '        return \'\';\n';
            str += '    };\n';
        }

        return str;
    }

    function _endOutput() {
        var str = "    if (typeof module !== 'undefined' && module.exports) {\n";
        str += '        module.exports = Razor;\n';
        str += '    } else {\n';
        str += '        window.Razor = Razor;\n';
        str += '    }\n';
        str += '} ());';
        return str;
    }

    function _getEscape() {
        var str = '    Razor.map = {"&":"&amp;","<":"&lt;",">":"&gt;",\'"\':"&quot;","\'":"&#39;","/":"&#x2F;"};\n';
        str += '    Razor.escape = function(arg) {\n';
        str += '        return arg.replace(/[&<>"\'\\/]/g, function(entity) {\n';
        str += '            return Razor.map[entity];\n';
        str += '        });\n';
        str += '    };\n';
        return str;
    }

    return {
        processFile: function(src, match_regex) {
            if (match_regex && !new RegExp(match_regex).test(src)) {
                console.warn('warning:', 'file ' + src + ' does not match pattern: "' + match_regex + '", skipping...');
                return;
            }

            var first = false;

            if (!start_output) {
                start_output = _startOutput();
                first = true;
            }

            var contents = fs.readFileSync(src, 'UTF-8'),
                fn = razor.generate(contents),
                name = src.split('/').pop().split('.')[0];

            output += _wrap(fn, name, first);
        },

        processDirectory: function(src, match_regex) {
            fs.readdirSync(src).forEach(function(file) {
                var path = src + '/' + file;

                if (fs.statSync(path).isDirectory()) {

                    // ignore subdirectories
                    return;
                }

                Compiler.processFile(path, match_regex);
            });
        },

        writeToDisk: function(dest) {
            if (!this.alone && output.indexOf('this.escape(') !== -1) {
                start_output += _getEscape();
            }
            var contents = start_output + '\n' + output + '\n' + _endOutput();
            fs.writeFileSync(dest, contents.replace(/ +(?=\n)/g, ''), 'UTF-8');
            start_output = '';
            output = '';
        },

        showUsage: function(message) {
            if (message) {
                console.error('error:', message, '\n');
            }
// Ivrit
            console.log(' _ __ __ _ _______  _ __ ');
            console.log('| \'__/ _` |_  / _ \\| \'__|');
            console.log('| | | (_| |/ / (_) | |   ');
            console.log('|_|  \\__,_/___\\___/|_|   ');

            console.log('v' + VERSION);
            console.log('');
            console.log('Usage:');
            console.log('razor file1.html file2.html directory1 --output templates.js');
            console.log('razor templates --matches "(.*).html"');
            console.log('');
            console.log('Arguments:');
            console.log('--help                 show help');
            console.log('--output               js file to output compiled templates to');
            console.log('--matches              specify regex pattern to match filename against');
            console.log('--forever-alone        compile templates on their own without helper functions');
        }
    };
}) ();

/**
 * this is just fancy stuff to make the command line interface friendly
 */
exports.start = function(args) {
    args = args.slice(2);

    if (args.length === 0) {
        Compiler.showUsage('need to specify file or directory');
        return;
    }

    if (args.indexOf('--help') !== -1) {
        Compiler.showUsage();
        return;
    }

    var output_index = args.indexOf('--output'),
        match_index = args.indexOf('--matches'),
        alone_index = args.indexOf('--forever-alone'),
        match_regex,
        output_file,
        files_to_process = [],
        args_to_skip = [];

    if (output_index !== -1) {
        output_file = args[output_index + 1];
        args_to_skip.push(output_index, output_index + 1);
    }

    if (match_index !== -1) {
        match_regex = args[match_index + 1];
        args_to_skip.push(match_index, match_index + 1);
    }

    if (alone_index !== -1) {
        Compiler.alone = true;
        args_to_skip.push(alone_index);
    }

    if (!output_file && (args.length - args_to_skip.length) > 1) {
        Compiler.showUsage('no output file specified!');
        return;
    }

    args.forEach(function(arg, i) {
        if (args_to_skip.indexOf(i) !== -1) {
            return;
        }

        if (!fs.existsSync(arg)) {
            console.warn('warning: ' + arg + ' is not a file or directory');
            return;
        }

        files_to_process.push(arg);
    });

    if (files_to_process.length === 0) {
        Compiler.showUsage('no files to process!');
        return;
    }

    if (!output_file && files_to_process.length === 1) {
        output_file = files_to_process[0].replace(/\.([a-zA-Z]+)$/, '') + '.js';
    }

    files_to_process.forEach(function(path) {
        if (fs.statSync(path).isDirectory()) {
            Compiler.processDirectory(path, match_regex);
            return;
        }
        Compiler.processFile(path, match_regex);
    });

    Compiler.writeToDisk(output_file);
};
