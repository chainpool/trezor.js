'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.udevInstallers = exports.latestVersion = exports.installers = exports.DeviceList = exports.DescriptorStream = exports.Device = exports.UnacquiredDevice = exports.Session = undefined;

var _session = require('./session');

Object.defineProperty(exports, 'Session', {
    enumerable: true,
    get: function get() {
        return _interopRequireDefault(_session).default;
    }
});

var _unacquiredDevice = require('./unacquired-device');

Object.defineProperty(exports, 'UnacquiredDevice', {
    enumerable: true,
    get: function get() {
        return _interopRequireDefault(_unacquiredDevice).default;
    }
});

var _device = require('./device');

Object.defineProperty(exports, 'Device', {
    enumerable: true,
    get: function get() {
        return _interopRequireDefault(_device).default;
    }
});

var _descriptorStream = require('./descriptor-stream');

Object.defineProperty(exports, 'DescriptorStream', {
    enumerable: true,
    get: function get() {
        return _interopRequireDefault(_descriptorStream).default;
    }
});

var _deviceList = require('./device-list');

Object.defineProperty(exports, 'DeviceList', {
    enumerable: true,
    get: function get() {
        return _interopRequireDefault(_deviceList).default;
    }
});
exports.setSharedWorkerFactory = setSharedWorkerFactory;

var _installers = require('./installers');

Object.defineProperty(exports, 'installers', {
    enumerable: true,
    get: function get() {
        return _installers.installers;
    }
});
Object.defineProperty(exports, 'latestVersion', {
    enumerable: true,
    get: function get() {
        return _installers.latestVersion;
    }
});
Object.defineProperty(exports, 'udevInstallers', {
    enumerable: true,
    get: function get() {
        return _installers.udevInstallers;
    }
});

require('whatwg-fetch');

require('unorm');

var _trezorLink = require('trezor-link');

var _trezorLink2 = _interopRequireDefault(_trezorLink);

var _deviceList2 = _interopRequireDefault(_deviceList);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var BridgeV2 = _trezorLink2.default.BridgeV2,
    Lowlevel = _trezorLink2.default.Lowlevel,
    WebUsb = _trezorLink2.default.WebUsb,
    Fallback = _trezorLink2.default.Fallback;


var sharedWorkerFactory = null;
function setSharedWorkerFactory(swf) {
    sharedWorkerFactory = swf;
}

function sharedWorkerFactoryWrap() {
    if (sharedWorkerFactory == null) {
        return null;
    } else {
        return sharedWorkerFactory();
    }
}

_deviceList2.default._setNode(false);

_deviceList2.default._setTransport(function () {
    return new Fallback([new BridgeV2(), new Lowlevel(new WebUsb(), function () {
        return sharedWorkerFactoryWrap();
    })]);
});

_deviceList2.default._setFetch(window.fetch);
(0, _installers.setFetch)(window.fetch);