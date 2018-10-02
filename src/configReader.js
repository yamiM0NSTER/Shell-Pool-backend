"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
class Config {
    constructor() {
        this.donationAddresses = {
            devDonation: {
                XMR: '45Jmf8PnJKziGyrLouJMeBFw2yVyX1QB52sKEQ4S1VSU2NVsaVGPNu4bWKkaHaeZ6tWCepP6iceZk8XhTLzDaEVa72QrtVh'
            },
            coreDevDonation: {
                BCN: '252m7ru3wT5McAUztrZDExJ9PgnmyJVgk2ayucQLt13dFrf5DE4SrSBVkbtVhvZbRj1Ty4cVWaE6MGDVArZLpuMhCkrvToA',
                BBR: '@zoidberg',
                XMR: '46BeWrHpwXmHDpDEUmZBWZfoQpdc6HaERCNmx1pEYL2rAcuwufPN9rXHHtyUA4QVy66qeFQkn6sfK8aHYjA3jk3o1Bv16em',
                QCN: '1R9wwAH68XNGHZBsSCbyPL5EBepCoqnPPYpUuYx7jyZtc1SqekoM5p4iiB4EnkHBMXUrkwg7vR35vcoC6h48t7AjKXqXWqX',
                FCN: '6ntYwFY2syKVha7K1KZrhD8Uyzc2VsCpAjGi8YptCVHmfeqkAyRWQSX8gV23uvnHZY2LssBMoidGfCrVAc9k1RSsN7WKSf2',
                AEON: 'WmsG9mv8iSeJ8w2U9J1jRXNbLT7bCUj9VShzGuBctrhEBMHWxLZ2noSYhs8WgM4RDR68mrMW7hm33NRiDV8bNVu52azJb6XoN',
                OEC: 'C9ouydpeiyT2gVr5MqPUjHVJ26nJ9b8ZmMtVYRRTpGqHXA973MvzUWiFFhFCapkLmdVivd1c8Fj5wKDNw3oao7K44bUeAqx',
                DSH: 'D3z2DDWygoZU4NniCNa4oMjjKi45dC2KHUWUyD1RZ1pfgnRgcHdfLVQgh5gmRv4jwEjCX5LoLERAf5PbjLS43Rkd8vFUM1m',
                KRB: 'Kdev1L9V5ow3cdKNqDpLcFFxZCqu5W2GE9xMKewsB2pUXWxcXvJaUWHcSrHuZw91eYfQFzRtGfTemReSSMN4kE445i6Etb3'
            },
            extraFeaturesDevDonation: {
                XDN: 'dddcPW8VjhJA9U2QDPunnkL8Yky83TdEBGThXsETtmAx8q7jvni7Kt4hn8pqS3ks7GhM2z9BeD22jgKewZ2kQhWK27ZaGfLHQ',
                BCN: '23emzdEQqoWAifE1ZQLTrGAmVkdzjami82xgX4zWoX2VbiuGuunMJ1oF14PPa1cVRgGFz8tUWevsSNzMcPqHiQmF7iSzS1g',
                BBR: '1Gy4NimzTgyhcZ22432N4ojP9HC6mHpML2g8SsmmjPZS4o8SYNFND99LAihRPHA2ddarf3okkJ3umTC2gLpysKBfLi4hfTF',
                XMR: '43JNtJkxnhX789pJnCV6W4DQt8BqAWVoV4pqjGiWZ9845ee3aTBRBibMBzSziQi9BD5aEEpegQjLwguUgsXecB5bCY5wrMe',
                QCN: '1MafhBsdrkW3ssQexQzHf8Q2VBEWE3DmrbySKJzXXNJFeHHTWahDkJ3iLkiKnAMMtzHPeLrsYVmkQJJ9DJx3ToodKUapV8p',
                FCN: '6iAu6xDGnSFekMxJj7S61aepNVXbyCrV7PgWWKSfsEPyXbUjHAxjgq3KwED3dWrgddCRRtwBrrYgmVLZR7vdBr3KLe9Cowd',
                MCN: 'Vdufe8Pjkp2apvJC2N3Q7KdqiDDnLR3cH8hPhB2hjBtdXRxnHmHdgESbCjAD5dv1oiFrA1jKJQqszHWELdNygCGW2Ri6qRH1B',
                AEON: 'Wmsfi4rDdUC4xQyMo7f4BkfuPtSooPZ3wfx8e7JFXaKyfFY5buDJF4UakwhLp3FXxKVwB3ZFLQ3bTUBksCoG3tVQ2tzkrCZDm',
                OEC: 'C53KdM3sWk2P27yvqihNDEVsCtDQH9koJTdmEX96ftqgTvSsuvg5HMJ2dLnynwcWr5d3oMvwzsQVKdVeYchG5iU6L5rNJjd',
                DSH: 'D9t1KjB9w2haRp29ueJ9jHfTyq1FSzpMqavKpfFuwa8yEdHKuryfmh4W6ZzbHC71JFLoRD4ny7HWm15jb52JYcye7bBjD62',
                INF8: 'inf8FtwGgmaATeXKvycUT7BfxiawxqhfRXaahPog7s4c7L8qreSvnebNDvwfDBXrip8ptgKgbToV73mS5M1cNviY5sbKhKitCd'
            }
        };
        this.donations = [];
        this.version = 'v1.1.4';
        this.config = undefined;
        this.ReadConfig();
    }
    static get Instance() {
        // Do you need arguments? Make it a regular method instead.
        return this._instance || (this._instance = new this());
    }
    ReadConfig() {
        try {
            this.config = JSON.parse(fs_1.default.readFileSync(this.GetConfigFileName()).toString());
        }
        catch (e) {
            console.error('Failed to read config file: ' + this.GetConfigFileName() + '\n\n' + e);
            return;
        }
        for (let configOption in this.donationAddresses) {
            let percent = this.config.blockUnlocker[configOption];
            let wallet = this.donationAddresses[configOption][this.config.symbol];
            if (percent && wallet) {
                this.donations[wallet] = percent;
            }
        }
    }
    GetConfigFileName() {
        for (let i = 0; i < process.argv.length; i++) {
            if (process.argv[i].indexOf('-config=') === 0)
                return process.argv[i].split('=')[1];
        }
        return 'config.json';
    }
}
exports.default = Config;
//# sourceMappingURL=configReader.js.map