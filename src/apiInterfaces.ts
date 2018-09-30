import http from 'http';
import https from 'https';

function jsonHttpRequest(host: any, port: any, data: any, callback: any, path?: any) {
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

    let req: http.ClientRequest;
    // TODO: wrapper or similar method to commented
    if (port == 443) {
        req = https.request(options, function (res) {
            var replyData = ''
            res.setEncoding('utf8')
            res.on('data', function (chunk) {
                replyData += chunk;
            });
            res.on('end', function () {
                var replyJson
                try {
                    replyJson = JSON.parse(replyData);
                } catch (e) {
                    callback(e);
                    return;
                }
                callback(null, replyJson)
            });
        });


    }
    else {
        req = http.request(options, function (res) {
            let replyData = ''
            res.setEncoding('utf8')
            res.on('data', function (chunk) {
                replyData += chunk
            })
            res.on('end', function () {
                var replyJson
                try {
                    replyJson = JSON.parse(replyData)
                } catch (e) {
                    callback(e)
                    return
                }
                callback(null, replyJson)
            })
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
        callback(e)
    })

    req.end(data)
}

function rpc(host: any, port: any, method: any, params: any, callback: any, password?: any) {
    let request: { [key: string]: any } = {
        id: '0',
        jsonrpc: '2.0',
        method: method,
        params: params
    }
    if (password !== undefined) {
        request['password'] = password;
    }
    var data = JSON.stringify(request)
    jsonHttpRequest(host, port, data, function (error: any, replyJson: any) {
        if (error) {
            callback(error);
            return;
        }
        callback(replyJson.error, replyJson.result);
    })
}

function batchRpc(host: any, port: any, array: any, callback: any) {
    let rpcArray = [];
    for (let i = 0; i < array.length; i++) {
        rpcArray.push({
            id: i.toString(),
            jsonrpc: '2.0',
            method: array[i][0],
            params: array[i][1]
        })
    }
    let data = JSON.stringify(rpcArray);
    jsonHttpRequest(host, port, data, callback);
}



// module.exports = function (daemonConfig: any, walletConfig: any, poolApiConfig: any) {
//     return {
//         batchRpcDaemon: function (batchArray: any, callback: any) {
//             batchRpc(daemonConfig.host, daemonConfig.port, batchArray, callback)
//         },
//         rpcDaemon: function (method: any, params: any, callback: any) {
//             rpc(daemonConfig.host, daemonConfig.port, method, params, callback)
//         },
//         rpcWallet: function (method: any, params: any, callback: any) {
//             rpc(walletConfig.host, walletConfig.port, method, params, callback,
//                 walletConfig.password)
//         },
//         pool: function (method: any, callback: any) {
//             if (poolApiConfig.host == undefined)
//                 poolApiConfig.host = '127.0.0.1';
//             jsonHttpRequest(poolApiConfig.host, poolApiConfig.port, '', callback, method);
//         },
//         // jsonHttpRequest: jsonHttpRequest,
//         jsonHttpRequest: function(host: any, port: any, data: any, callback: any, path?: any) {
//             jsonHttpRequest(host, port, data, callback, path);
//         }
//     }
// }

class apiInterfaces {
    daemonConfig: any;
    walletConfig: any;
    poolApiConfig: any;

    constructor(daemonConfig: any, walletConfig: any, poolApiConfig: any) {
        this.daemonConfig = daemonConfig;
        this.walletConfig = walletConfig;
        this.poolApiConfig = poolApiConfig;
    }

    batchRpcDaemon(batchArray: any, callback: any) {
        batchRpc(this.daemonConfig.host, this.daemonConfig.port, batchArray, callback);
    }

    rpcDaemon(method: any, params: any, callback: any) {
        rpc(this.daemonConfig.host, this.daemonConfig.port, method, params, callback);
    }

    rpcWallet(method: any, params: any, callback: any) {
        rpc(this.walletConfig.host, this.walletConfig.port, method, params, callback,
            this.walletConfig.password);
    }

    pool(method: any, callback: any) {
        if (this.poolApiConfig.host == undefined)
            this.poolApiConfig.host = '127.0.0.1';
        jsonHttpRequest(this.poolApiConfig.host, this.poolApiConfig.port, '', callback, method);
    }

    jsonHttpRequest(host: any, port: any, data: any, callback: any, path?: any) {
        jsonHttpRequest(host, port, data, callback, path);
    }
}

export default apiInterfaces;