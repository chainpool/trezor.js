'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.BITCOIN_COIN_INFO = undefined;
exports.bjsNode2privNode = bjsNode2privNode;
exports.pubNode2bjsNode = pubNode2bjsNode;
exports.pubKey2bjsNode = pubKey2bjsNode;
exports.derivePubKeyHash = derivePubKeyHash;
exports.getHDNode = getHDNode;
exports.harden = harden;

var _bitcoinjsLibZcash = require('bitcoinjs-lib-zcash');

var bitcoin = _interopRequireWildcard(_bitcoinjsLibZcash);

var _ecurve = require('ecurve');

var ecurve = _interopRequireWildcard(_ecurve);

var _trezortypes = require('../trezortypes');

var trezor = _interopRequireWildcard(_trezortypes);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

var curve = ecurve.getCurveByName('secp256k1');

// simplified CoinInfo object passed from mytrezor
var BITCOIN_COIN_INFO = exports.BITCOIN_COIN_INFO = {
    name: 'Bitcoin',
    network: bitcoin.networks.bitcoin,
    segwitPubMagic: 77429938
};

function bjsNode2privNode(node) {
    var d = node.keyPair.d;
    if (!d) {
        throw new Error('Not a private node.');
    }
    var depth = node.depth;
    var fingerprint = node.parentFingerprint;
    var child_num = node.index;
    var private_key = d.toString(16);
    var chain_code = node.chainCode.toString('hex');
    return { depth: depth, fingerprint: fingerprint, child_num: child_num, chain_code: chain_code, private_key: private_key };
}

function pubNode2bjsNode(node, network) {
    var chainCode = new Buffer(node.chain_code, 'hex');
    var publicKey = new Buffer(node.public_key, 'hex');

    if (curve == null) {
        throw new Error('secp256k1 is null');
    }
    var Q = ecurve.Point.decodeFrom(curve, publicKey);
    var res = new bitcoin.HDNode(new bitcoin.ECPair(null, Q, { network: network }), chainCode);

    res.depth = +node.depth;
    res.index = +node.child_num;
    res.parentFingerprint = node.fingerprint;

    return res;
}

// stupid hack, because trezor serializes all xpubs with bitcoin magic
function convertXpub(original, network) {
    if (network.bip32.public === 0x0488b21e) {
        // it's bitcoin-like => return xpub
        return original;
    } else {
        var node = bitcoin.HDNode.fromBase58(original); // use bitcoin magic

        // "hard-fix" the new network into the HDNode keypair
        node.keyPair.network = network;
        return node.toBase58();
    }
}

// converts from internal PublicKey format to bitcoin.js HDNode
// network info is necessary. throws error on wrong xpub
function pubKey2bjsNode(key, network) {
    var convert = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : true;

    var keyNode = key.message.node;
    var bjsNode = pubNode2bjsNode(keyNode, network);

    var bjsXpub = bjsNode.toBase58();
    // const keyXpub: string = convertXpub(key.message.xpub, network);
    var keyXpub = convert ? convertXpub(key.message.xpub, network) : bitcoin.HDNode.fromBase58(key.message.xpub, network).toBase58();

    if (bjsXpub !== keyXpub) {
        throw new Error('Invalid public key transmission detected - ' + 'invalid xpub check. ' + 'Key: ' + bjsXpub + ', ' + 'Received: ' + keyXpub);
    }

    return bjsNode;
}

/* export function checkDerivation(
    parBjsNode: bitcoin.HDNode,
    childBjsNode: bitcoin.HDNode,
    suffix: number
): void {
    const derivedChildBjsNode = parBjsNode.derive(suffix);

    const derivedXpub = derivedChildBjsNode.toBase58();
    const compXpub = childBjsNode.toBase58();

    if (derivedXpub !== compXpub) {
        throw new Error('Invalid public key transmission detected - ' +
                    'invalid child cross-check. ' +
                    'Computed derived: ' + derivedXpub + ', ' +
                    'Computed received: ' + compXpub);
    }
}*/

function derivePubKeyHash(nodes, nodeIx, addressIx) {
    var node = nodes[nodeIx].derive(addressIx);
    var pkh = node.getIdentifier();
    return pkh;
}

// Proxy
// Generate xpub with or without script_type
function getHDNode(session, path, networkOrCoinInfo, xpubDerive) {
    var device = session.device;
    var canUseScriptType = device && (device.features.major_version === 2 && device.atLeast('2.0.10') || device.features.major_version === 1 && device.atLeast('1.7.2'));
    var coinInfo = typeof networkOrCoinInfo.name === 'string' ? networkOrCoinInfo : null;
    if (canUseScriptType && coinInfo) {
        return getScriptTypeHDNode(session, path, coinInfo, xpubDerive);
    }
    var network = coinInfo ? coinInfo.network : networkOrCoinInfo;
    return getBitcoinHDNode(session, path, network, xpubDerive);
}

function getScriptType(path, coinInfo) {
    if (!Array.isArray(path) || path.length < 1) return;
    var s = (path[0] & ~0x80000000) >>> 0;
    switch (s) {
        case 44:
            return 'SPENDADDRESS';
        case 48:
            return 'SPENDMULTISIG';
        case 49:
            return coinInfo.segwitPubMagic ? 'SPENDP2SHWITNESS' : undefined;
        case 84:
            return coinInfo.segwitNativePubMagic ? 'SPENDWITNESS' : undefined;
        default:
            return;
    }
}

function getScriptTypeNetwork(scriptType, coinInfo) {
    var clone = JSON.parse(JSON.stringify(coinInfo));
    if (scriptType === 'SPENDP2SHWITNESS' && coinInfo.segwitPubMagic) {
        clone.network.bip32.public = coinInfo.segwitPubMagic;
    }
    if (scriptType === 'SPENDWITNESS' && coinInfo.segwitNativePubMagic) {
        clone.network.bip32.public = coinInfo.segwitNativePubMagic;
    }
    return clone.network;
}

// calling GetPublicKey message with script_type field
// to make it work we need to have more information about network (segwitPubMagic and segwitNativePubMagic)
// that's why this method should accept CoinInfo object only, an extended coin definition from "mytrezor"
// consider to add script_type values witch segwit and bech32 magic fields to bitcoinjs-trezor lib
function getScriptTypeHDNode(session, path, coinInfo, xpubDerive) {
    var suffix = 0;
    var childPath = path.concat([suffix]);
    var scriptType = getScriptType(path, coinInfo);
    var network = getScriptTypeNetwork(scriptType, coinInfo);

    return session._getPublicKeyInternal(path, coinInfo.name, scriptType).then(function (resKey) {
        var resNode = pubKey2bjsNode(resKey, network, false);
        var resXpub = resKey.message.xpub;

        return session._getPublicKeyInternal(childPath, coinInfo.name, scriptType).then(function (childKey) {
            // const childNode = pubKey2bjsNode(childKey, network);
            var childXpub = childKey.message.xpub;
            return xpubDerive(resXpub, network, suffix).then(function (actualChildXpub) {
                if (actualChildXpub !== childXpub) {
                    throw new Error('Invalid public key transmission detected - ' + 'invalid child cross-check. ' + 'Computed derived: ' + actualChildXpub + ', ' + 'Computed received: ' + childXpub);
                }
                // mytrezor wallet is still expecting xpubs to be in legacy format
                // network.public should be set to default (CoinInfo.xpub_magic)
                // Since network is already converted in "getScriptTypeNetwork" method xpub_magic_segwit_p2sh may be used at this point
                // set back network to default
                // it should be fixed in mytrezor to avoid unnecessary conversion back and forth
                resNode.keyPair.network = coinInfo.network;
                return resNode;
            });
        });
    });
}

// fw below 1.7.1 and 2.0.8 does not return xpubs in proper format
function getBitcoinHDNode(session, path, network, xpubDerive) {
    var suffix = 0;
    var childPath = path.concat([suffix]);

    return session._getPublicKeyInternal(path).then(function (resKey) {
        var resNode = pubKey2bjsNode(resKey, network);
        var resXpub = resKey.message.xpub;

        return session._getPublicKeyInternal(childPath).then(function (childKey) {
            // const childNode = pubKey2bjsNode(childKey, network);
            var childXpub = childKey.message.xpub;
            return xpubDerive(resXpub, bitcoin.networks.bitcoin, suffix).then(function (actualChildXpub) {
                if (actualChildXpub !== childXpub) {
                    throw new Error('Invalid public key transmission detected - ' + 'invalid child cross-check. ' + 'Computed derived: ' + actualChildXpub + ', ' + 'Computed received: ' + childXpub);
                }
                return resNode;
            });
        });
    });
}

var HARDENING = 0x80000000;

function harden(number) {
    return (number | HARDENING) >>> 0;
}