"use strict";
//import base58 from 'base58-native';
//var base58 = require('base58-native')
//var cnUtil = require('cryptonote-util')
exports.uid = function () {
    let min = 100000000000000;
    let max = 999999999999999;
    let id = Math.floor(Math.random() * (max - min + 1)) + min;
    return id.toString();
};
exports.ringBuffer = function (maxSize) {
    var data = [];
    let cursor = 0;
    var isFull = false;
    return {
        append: function (x) {
            if (isFull) {
                data[cursor] = x;
                cursor = (cursor + 1) % maxSize;
            }
            else {
                data.push(x);
                cursor++;
                if (data.length === maxSize) {
                    cursor = 0;
                    isFull = true;
                }
            }
        },
        avg: function (plusOne) {
            var sum = data.reduce(function (a, b) { return a + b; }, plusOne || 0);
            return sum / ((isFull ? maxSize : cursor) + (plusOne ? 1 : 0));
        },
        size: function () {
            return isFull ? maxSize : cursor;
        },
        clear: function () {
            data = [];
            cursor = 0;
            isFull = false;
        }
    };
};
exports.varIntEncode = function (n) {
};
//# sourceMappingURL=utils.js.map