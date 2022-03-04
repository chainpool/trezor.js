'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.CallHelper = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _randombytes = require('randombytes');

var _randombytes2 = _interopRequireDefault(_randombytes);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function assertType(res, resTypes) {
    var splitResTypes = resTypes.split('|');
    if (!splitResTypes.includes(res.type)) {
        throw new TypeError('Response of unexpected type: ' + res.type);
    }
}

function generateEntropy(len) {
    if (global.crypto || global.msCrypto) {
        return (0, _randombytes2.default)(len);
    } else {
        throw new Error('Browser does not support crypto random');
    }
}

function filterForLog(type, msg) {
    var blacklist = {
        PassphraseAck: {
            passphrase: '(redacted...)'
        },
        CipheredKeyValue: {
            value: '(redacted...)'
        },
        GetPublicKey: {
            address_n: '(redacted...)'
        },
        PublicKey: {
            node: '(redacted...)',
            xpub: '(redacted...)'
        },
        DecryptedMessage: {
            message: '(redacted...)',
            address: '(redacted...)'
        },
        FirmwareUpload: {
            payload: '...'
        }
    };

    if (type in blacklist) {
        return _extends({}, msg, blacklist[type]);
    } else {
        return msg;
    }
}

var CallHelper = exports.CallHelper = function () {
    function CallHelper(transport, sessionId, session) {
        _classCallCheck(this, CallHelper);

        this.transport = transport;
        this.sessionId = sessionId;
        this.session = session;
    }

    _createClass(CallHelper, [{
        key: 'read',
        value: function read() {
            var _this = this;

            return this.transport.read(this.sessionId, this.session.debugLink).then(function (res) {
                var logMessage = filterForLog(res.type, res.message);

                if (_this.session.debug) {
                    console.log('[trezor.js] [call] Received', res.type, logMessage);
                }
                _this.session.receiveEvent.emit(res.type, res.message);
                return res;
            }, function (err) {
                if (_this.session.debug) {
                    console.log('[trezor.js] [call] Received error', err);
                }
                _this.session.errorEvent.emit(err);
                throw err;
            });
        }
    }, {
        key: 'post',
        value: function post(type, msg) {
            var _this2 = this;

            var logMessage = filterForLog(type, msg);

            if (this.session.debug) {
                console.log('[trezor.js] [call] Sending', type, logMessage);
            }
            this.session.sendEvent.emit(type, msg);

            return this.transport.post(this.sessionId, type, msg, this.session.debugLink).catch(function (err) {
                if (_this2.session.debug) {
                    console.log('[trezor.js] [call] Received error', err);
                }
                _this2.session.errorEvent.emit(err);
                throw err;
            });
        }

        // Sends an async message to the opened device.

    }, {
        key: 'call',
        value: function call(type, msg) {
            var _this3 = this;

            var logMessage = filterForLog(type, msg);

            if (this.session.debug) {
                console.log('[trezor.js] [call] Sending', type, logMessage);
            }
            this.session.sendEvent.emit(type, msg);

            return this.transport.call(this.sessionId, type, msg, this.session.debugLink).then(function (res) {
                var logMessage = filterForLog(res.type, res.message);

                if (_this3.session.debug) {
                    console.log('[trezor.js] [call] Received', res.type, logMessage);
                }
                _this3.session.receiveEvent.emit(res.type, res.message);
                return res;
            }, function (err) {
                if (_this3.session.debug) {
                    console.log('[trezor.js] [call] Received error', err);
                }
                _this3.session.errorEvent.emit(err);
                throw err;
            });
        }
    }, {
        key: 'typedCall',
        value: function typedCall(type, resType, msg) {
            return this._commonCall(type, msg).then(function (res) {
                assertType(res, resType);
                return res;
            });
        }
    }, {
        key: '_commonCall',
        value: function _commonCall(type, msg) {
            var _this4 = this;

            return this.call(type, msg).then(function (res) {
                return _this4._filterCommonTypes(res);
            });
        }
    }, {
        key: '_filterCommonTypes',
        value: function _filterCommonTypes(res) {
            var _this5 = this;

            if (res.type === 'Failure') {
                var e = new Error(res.message.message);
                // $FlowIssue extending errors in ES6 "correctly" is a PITA
                e.code = res.message.code;
                return Promise.reject(e);
            }

            if (res.type === 'ButtonRequest') {
                this.session.buttonEvent.emit(res.message.code);
                return this._commonCall('ButtonAck', {});
            }

            if (res.type === 'EntropyRequest') {
                return this._commonCall('EntropyAck', {
                    entropy: generateEntropy(32).toString('hex')
                });
            }

            if (res.type === 'PinMatrixRequest') {
                return this._promptPin(res.message.type).then(function (pin) {
                    return _this5._commonCall('PinMatrixAck', { pin: pin });
                }, function () {
                    return _this5._commonCall('Cancel', {});
                });
            }

            if (res.type === 'PassphraseStateRequest') {
                if (this.session.device) {
                    var currentState = this.session.device.passphraseState;
                    var receivedState = res.message.state;
                    if (currentState != null && currentState !== receivedState) {
                        return Promise.reject(new Error('Device has entered inconsistent state. Please reconnect the device.'));
                    }
                    this.session.device.passphraseState = receivedState;
                    return this._commonCall('PassphraseStateAck', {});
                }
                // ??? nowhere to save the state, throwing error
                return Promise.reject(new Error('Nowhere to save passphrase state.'));
            }

            if (res.type === 'PassphraseRequest') {
                if (res.message.on_device) {
                    // "fake" button event
                    this.session.buttonEvent.emit('PassphraseOnDevice');
                    if (this.session.device && this.session.device.passphraseState) {
                        return this._commonCall('PassphraseAck', { state: this.session.device.passphraseState });
                    }
                    return this._commonCall('PassphraseAck', {});
                }
                return this._promptPassphrase().then(function (passphrase) {
                    if (_this5.session.device && _this5.session.device.passphraseState) {
                        return _this5._commonCall('PassphraseAck', { passphrase: passphrase, state: _this5.session.device.passphraseState });
                    }

                    return _this5._commonCall('PassphraseAck', { passphrase: passphrase });
                }, function (err) {
                    return _this5._commonCall('Cancel', {}).catch(function (e) {
                        throw err || e;
                    });
                });
            }

            if (res.type === 'WordRequest') {
                return this._promptWord().then(function (word) {
                    return _this5._commonCall('WordAck', { word: word });
                }, function () {
                    return _this5._commonCall('Cancel', {});
                });
            }

            return Promise.resolve(res);
        }
    }, {
        key: '_promptPin',
        value: function _promptPin(type) {
            var _this6 = this;

            return new Promise(function (resolve, reject) {
                if (!_this6.session.pinEvent.emit(type, function (err, pin) {
                    if (err || pin == null) {
                        reject(err);
                    } else {
                        resolve(pin);
                    }
                })) {
                    if (_this6.session.debug) {
                        console.warn('[trezor.js] [call] PIN callback not configured, cancelling request');
                    }
                    reject(new Error('PIN callback not configured'));
                }
            });
        }
    }, {
        key: '_promptPassphrase',
        value: function _promptPassphrase() {
            var _this7 = this;

            return new Promise(function (resolve, reject) {
                if (!_this7.session.passphraseEvent.emit(function (err, passphrase) {
                    if (err || passphrase == null) {
                        reject(err);
                    } else {
                        resolve(passphrase.normalize('NFKD'));
                    }
                })) {
                    if (_this7.session.debug) {
                        console.warn('[trezor.js] [call] Passphrase callback not configured, cancelling request');
                    }
                    reject(new Error('Passphrase callback not configured'));
                }
            });
        }
    }, {
        key: '_promptWord',
        value: function _promptWord() {
            var _this8 = this;

            return new Promise(function (resolve, reject) {
                if (!_this8.session.wordEvent.emit(function (err, word) {
                    if (err || word == null) {
                        reject(err);
                    } else {
                        resolve(word.toLocaleLowerCase());
                    }
                })) {
                    if (_this8.session.debug) {
                        console.warn('[trezor.js] [call] Word callback not configured, cancelling request');
                    }
                    reject(new Error('Word callback not configured'));
                }
            });
        }
    }]);

    return CallHelper;
}();