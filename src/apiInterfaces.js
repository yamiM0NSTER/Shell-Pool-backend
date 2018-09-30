"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = __importDefault(require("http"));
const https_1 = __importDefault(require("https"));
function jsonHttpRequest(host, port, data, callback, path) {
    path = path || '/json_rpc';
    var options = {
        hostname: host,
        port: port,
        path: path,
        method: data ? 'POST' : 'GET',
        headers: {
            'Content-Length': data.length,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
    };
    let req;
    // TODO: wrapper or similar method to commented
    if (port == 443) {
        req = https_1.default.request(options, function (res) {
            var replyData = '';
            res.setEncoding('utf8');
            res.on('data', function (chunk) {
                replyData += chunk;
            });
            res.on('end', function () {
                var replyJson;
                try {
                    replyJson = JSON.parse(replyData);
                }
                catch (e) {
                    callback(e);
                    return;
                }
                callback(null, replyJson);
            });
        });
    }
    else {
        req = http_1.default.request(options, function (res) {
            let replyData = '';
            res.setEncoding('utf8');
            res.on('data', function (chunk) {
                replyData += chunk;
            });
            res.on('end', function () {
                var replyJson;
                try {
                    replyJson = JSON.parse(replyData);
                }
                catch (e) {
                    callback(e);
                    return;
                }
                callback(null, replyJson);
            });
        });
    }
    //   var req = (port == 443 ? https : http).request(options, function (res) {
    //     var replyData = ''
    //     res.setEncoding('utf8')
    //     res.on('data', function (chunk) {
    //       replyData += chunk
    //     })
    //     res.on('end', function () {
    //       var replyJson
    //       try {
    //         replyJson = JSON.parse(replyData)
    //       } catch (e) {
    //         callback(e)
    //         return
    //       }
    //       callback(null, replyJson)
    //     })
    //   })
    req.on('error', function (e) {
        callback(e);
    });
    req.end(data);
}
function rpc(host, port, method, params, callback, password) {
    let request = {
        id: '0',
        jsonrpc: '2.0',
        method: method,
        params: params
    };
    if (password !== undefined) {
        request['password'] = password;
    }
    var data = JSON.stringify(request);
    jsonHttpRequest(host, port, data, function (error, replyJson) {
        if (error) {
            callback(error);
            return;
        }
        callback(replyJson.error, replyJson.result);
    });
}
function batchRpc(host, port, array, callback) {
    let rpcArray = [];
    for (let i = 0; i < array.length; i++) {
        rpcArray.push({
            id: i.toString(),
            jsonrpc: '2.0',
            method: array[i][0],
            params: array[i][1]
        });
    }
    let data = JSON.stringify(rpcArray);
    jsonHttpRequest(host, port, data, callback);
}
module.exports = function (daemonConfig, walletConfig, poolApiConfig) {
    return {
        batchRpcDaemon: function (batchArray, callback) {
            batchRpc(daemonConfig.host, daemonConfig.port, batchArray, callback);
        },
        rpcDaemon: function (method, params, callback) {
            rpc(daemonConfig.host, daemonConfig.port, method, params, callback);
        },
        rpcWallet: function (method, params, callback) {
            rpc(walletConfig.host, walletConfig.port, method, params, callback, walletConfig.password);
        },
        pool: function (method, callback) {
            if (poolApiConfig.host == undefined)
                poolApiConfig.host = '127.0.0.1';
            jsonHttpRequest(poolApiConfig.host, poolApiConfig.port, '', callback, method);
        },
        // jsonHttpRequest: jsonHttpRequest,
        jsonHttpRequest: function (host, port, data, callback, path) {
            jsonHttpRequest(host, port, data, callback, path);
        }
    };
};
class apiInterfaces {
    constructor(daemonConfig, walletConfig, poolApiConfig) {
        this.daemonConfig = daemonConfig;
        this.walletConfig = walletConfig;
        this.poolApiConfig = poolApiConfig;
    }
    batchRpcDaemon(batchArray, callback) {
        batchRpc(this.daemonConfig.host, this.daemonConfig.port, batchArray, callback);
    }
    rpcDaemon(method, params, callback) {
        rpc(this.daemonConfig.host, this.daemonConfig.port, method, params, callback);
    }
    rpcWallet(method, params, callback) {
        rpc(this.walletConfig.host, this.walletConfig.port, method, params, callback, this.walletConfig.password);
    }
    pool(method, callback) {
        if (this.poolApiConfig.host == undefined)
            this.poolApiConfig.host = '127.0.0.1';
        jsonHttpRequest(this.poolApiConfig.host, this.poolApiConfig.port, '', callback, method);
    }
    jsonHttpRequest(host, port, data, callback, path) {
        jsonHttpRequest(host, port, data, callback, path);
    }
}
exports.default = apiInterfaces;
//# sourceMappingURL=apiInterfaces.js.map