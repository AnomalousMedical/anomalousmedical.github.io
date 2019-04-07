(function () {
var fillPolys = function(){
    //Startswith polyfill
    //https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/startsWith
    if (!String.prototype.startsWith) {
        String.prototype.startsWith = function (searchString, position) {
            position = position || 0;
            return this.substr(position, searchString.length) === searchString;
        };
    }

    //Endswith polyfill
    //https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/endsWith
    if (!String.prototype.endsWith) {
        String.prototype.endsWith = function(search, this_len) {
            if (this_len === undefined || this_len > this.length) {
                this_len = this.length;
            }
            return this.substring(this_len - search.length, this_len) === search;
        };
    }

    //Polyfill for matches
    //https://developer.mozilla.org/en-US/docs/Web/API/Element/matches
    if (!Element.prototype.matches) {
        Element.prototype.matches =
            Element.prototype.matchesSelector ||
            Element.prototype.mozMatchesSelector ||
            Element.prototype.msMatchesSelector ||
            Element.prototype.oMatchesSelector ||
            Element.prototype.webkitMatchesSelector ||
            function (s) {
                var matches = (this.document || this.ownerDocument).querySelectorAll(s),
                    i = matches.length;
                while (--i >= 0 && matches.item(i) !== this) { }
                return i > -1;
            };
    }

    //Polyfill for promise
    //https://raw.githubusercontent.com/taylorhakes/promise-polyfill/master/promise.js
    function promiseFill(root) {

        // Store setTimeout reference so promise-polyfill will be unaffected by
        // other code modifying setTimeout (like sinon.useFakeTimers())
        var setTimeoutFunc = setTimeout;

        function noop() { }

        // Polyfill for Function.prototype.bind
        function bind(fn, thisArg) {
            return function () {
                fn.apply(thisArg, arguments);
            };
        }

        function Promise(fn) {
            if (typeof this !== 'object') throw new TypeError('Promises must be constructed via new');
            if (typeof fn !== 'function') throw new TypeError('not a function');
            this._state = 0;
            this._handled = false;
            this._value = undefined;
            this._deferreds = [];

            doResolve(fn, this);
        }

        function handle(self, deferred) {
            while (self._state === 3) {
                self = self._value;
            }
            if (self._state === 0) {
                self._deferreds.push(deferred);
                return;
            }
            self._handled = true;
            Promise._immediateFn(function () {
                var cb = self._state === 1 ? deferred.onFulfilled : deferred.onRejected;
                if (cb === null) {
                    (self._state === 1 ? resolve : reject)(deferred.promise, self._value);
                    return;
                }
                var ret;
                try {
                    ret = cb(self._value);
                } catch (e) {
                    reject(deferred.promise, e);
                    return;
                }
                resolve(deferred.promise, ret);
            });
        }

        function resolve(self, newValue) {
            try {
                // Promise Resolution Procedure: https://github.com/promises-aplus/promises-spec#the-promise-resolution-procedure
                if (newValue === self) throw new TypeError('A promise cannot be resolved with itself.');
                if (newValue && (typeof newValue === 'object' || typeof newValue === 'function')) {
                    var then = newValue.then;
                    if (newValue instanceof Promise) {
                        self._state = 3;
                        self._value = newValue;
                        finale(self);
                        return;
                    } else if (typeof then === 'function') {
                        doResolve(bind(then, newValue), self);
                        return;
                    }
                }
                self._state = 1;
                self._value = newValue;
                finale(self);
            } catch (e) {
                reject(self, e);
            }
        }

        function reject(self, newValue) {
            self._state = 2;
            self._value = newValue;
            finale(self);
        }

        function finale(self) {
            if (self._state === 2 && self._deferreds.length === 0) {
                Promise._immediateFn(function () {
                    if (!self._handled) {
                        Promise._unhandledRejectionFn(self._value);
                    }
                });
            }

            for (var i = 0, len = self._deferreds.length; i < len; i++) {
                handle(self, self._deferreds[i]);
            }
            self._deferreds = null;
        }

        function Handler(onFulfilled, onRejected, promise) {
            this.onFulfilled = typeof onFulfilled === 'function' ? onFulfilled : null;
            this.onRejected = typeof onRejected === 'function' ? onRejected : null;
            this.promise = promise;
        }

        /**
         * Take a potentially misbehaving resolver function and make sure
         * onFulfilled and onRejected are only called once.
         *
         * Makes no guarantees about asynchrony.
         */
        function doResolve(fn, self) {
            var done = false;
            try {
                fn(function (value) {
                    if (done) return;
                    done = true;
                    resolve(self, value);
                }, function (reason) {
                    if (done) return;
                    done = true;
                    reject(self, reason);
                });
            } catch (ex) {
                if (done) return;
                done = true;
                reject(self, ex);
            }
        }

        Promise.prototype['catch'] = function (onRejected) {
            return this.then(null, onRejected);
        };

        Promise.prototype.then = function (onFulfilled, onRejected) {
            var prom = new (this.constructor)(noop);

            handle(this, new Handler(onFulfilled, onRejected, prom));
            return prom;
        };

        Promise.all = function (arr) {
            var args = Array.prototype.slice.call(arr);

            return new Promise(function (resolve, reject) {
                if (args.length === 0) return resolve([]);
                var remaining = args.length;

                function res(i, val) {
                    try {
                        if (val && (typeof val === 'object' || typeof val === 'function')) {
                            var then = val.then;
                            if (typeof then === 'function') {
                                then.call(val, function (val) {
                                    res(i, val);
                                }, reject);
                                return;
                            }
                        }
                        args[i] = val;
                        if (--remaining === 0) {
                            resolve(args);
                        }
                    } catch (ex) {
                        reject(ex);
                    }
                }

                for (var i = 0; i < args.length; i++) {
                    res(i, args[i]);
                }
            });
        };

        Promise.resolve = function (value) {
            if (value && typeof value === 'object' && value.constructor === Promise) {
                return value;
            }

            return new Promise(function (resolve) {
                resolve(value);
            });
        };

        Promise.reject = function (value) {
            return new Promise(function (resolve, reject) {
                reject(value);
            });
        };

        Promise.race = function (values) {
            return new Promise(function (resolve, reject) {
                for (var i = 0, len = values.length; i < len; i++) {
                    values[i].then(resolve, reject);
                }
            });
        };

        // Use polyfill for setImmediate for performance gains
        Promise._immediateFn = (typeof setImmediate === 'function' && function (fn) { setImmediate(fn); }) ||
          function (fn) {
              setTimeoutFunc(fn, 0);
          };

        Promise._unhandledRejectionFn = function _unhandledRejectionFn(err) {
            if (typeof console !== 'undefined' && console) {
                console.warn('Possible Unhandled Promise Rejection:', err); // eslint-disable-line no-console
            }
        };

        /**
         * Set the immediate function to execute callbacks
         * @param fn {function} Function to execute
         * @deprecated
         */
        Promise._setImmediateFn = function _setImmediateFn(fn) {
            Promise._immediateFn = fn;
        };

        /**
         * Change the function to execute on unhandled rejection
         * @param {function} fn Function to execute on unhandled rejection
         * @deprecated
         */
        Promise._setUnhandledRejectionFn = function _setUnhandledRejectionFn(fn) {
            Promise._unhandledRejectionFn = fn;
        };

        root.Promise = Promise;

    };

    if (typeof (window.Promise) === 'undefined') {
        promiseFill(window);
    }

    //IsArray polyfill
    if (typeof Array.isArray === 'undefined') {
        Array.isArray = function (obj) {
            return Object.prototype.toString.call(obj) === '[object Array]';
        }
    };

    //Fetch polyfill
    (function (self) {
        'use strict';

        if (self.fetch) {
            return
        }

        var support = {
            searchParams: 'URLSearchParams' in self,
            iterable: 'Symbol' in self && 'iterator' in Symbol,
            blob: 'FileReader' in self && 'Blob' in self && (function () {
                try {
                    new Blob()
                    return true
                } catch (e) {
                    return false
                }
            })(),
            formData: 'FormData' in self,
            arrayBuffer: 'ArrayBuffer' in self
        }

        function normalizeName(name) {
            if (typeof name !== 'string') {
                name = String(name)
            }
            if (/[^a-z0-9\-#$%&'*+.\^_`|~]/i.test(name)) {
                throw new TypeError('Invalid character in header field name')
            }
            return name.toLowerCase()
        }

        function normalizeValue(value) {
            if (typeof value !== 'string') {
                value = String(value)
            }
            return value
        }

        // Build a destructive iterator for the value list
        function iteratorFor(items) {
            var iterator = {
                next: function () {
                    var value = items.shift()
                    return { done: value === undefined, value: value }
                }
            }

            if (support.iterable) {
                iterator[Symbol.iterator] = function () {
                    return iterator
                }
            }

            return iterator
        }

        function Headers(headers) {
            this.map = {}

            if (headers instanceof Headers) {
                headers.forEach(function (value, name) {
                    this.append(name, value)
                }, this)

            } else if (headers) {
                Object.getOwnPropertyNames(headers).forEach(function (name) {
                    this.append(name, headers[name])
                }, this)
            }
        }

        Headers.prototype.append = function (name, value) {
            name = normalizeName(name)
            value = normalizeValue(value)
            var list = this.map[name]
            if (!list) {
                list = []
                this.map[name] = list
            }
            list.push(value)
        }

        Headers.prototype['delete'] = function (name) {
            delete this.map[normalizeName(name)]
        }

        Headers.prototype.get = function (name) {
            var values = this.map[normalizeName(name)]
            return values ? values[0] : null
        }

        Headers.prototype.getAll = function (name) {
            return this.map[normalizeName(name)] || []
        }

        Headers.prototype.has = function (name) {
            return this.map.hasOwnProperty(normalizeName(name))
        }

        Headers.prototype.set = function (name, value) {
            this.map[normalizeName(name)] = [normalizeValue(value)]
        }

        Headers.prototype.forEach = function (callback, thisArg) {
            Object.getOwnPropertyNames(this.map).forEach(function (name) {
                this.map[name].forEach(function (value) {
                    callback.call(thisArg, value, name, this)
                }, this)
            }, this)
        }

        Headers.prototype.keys = function () {
            var items = []
            this.forEach(function (value, name) { items.push(name) })
            return iteratorFor(items)
        }

        Headers.prototype.values = function () {
            var items = []
            this.forEach(function (value) { items.push(value) })
            return iteratorFor(items)
        }

        Headers.prototype.entries = function () {
            var items = []
            this.forEach(function (value, name) { items.push([name, value]) })
            return iteratorFor(items)
        }

        if (support.iterable) {
            Headers.prototype[Symbol.iterator] = Headers.prototype.entries
        }

        function consumed(body) {
            if (body.bodyUsed) {
                return Promise.reject(new TypeError('Already read'))
            }
            body.bodyUsed = true
        }

        function fileReaderReady(reader) {
            return new Promise(function (resolve, reject) {
                reader.onload = function () {
                    resolve(reader.result)
                }
                reader.onerror = function () {
                    reject(reader.error)
                }
            })
        }

        function readBlobAsArrayBuffer(blob) {
            var reader = new FileReader()
            reader.readAsArrayBuffer(blob)
            return fileReaderReady(reader)
        }

        function readBlobAsText(blob) {
            var reader = new FileReader()
            reader.readAsText(blob)
            return fileReaderReady(reader)
        }

        function Body() {
            this.bodyUsed = false

            this._initBody = function (body) {
                this._bodyInit = body
                if (typeof body === 'string') {
                    this._bodyText = body
                } else if (support.blob && Blob.prototype.isPrototypeOf(body)) {
                    this._bodyBlob = body
                } else if (support.formData && FormData.prototype.isPrototypeOf(body)) {
                    this._bodyFormData = body
                } else if (support.searchParams && URLSearchParams.prototype.isPrototypeOf(body)) {
                    this._bodyText = body.toString()
                } else if (!body) {
                    this._bodyText = ''
                } else if (support.arrayBuffer && ArrayBuffer.prototype.isPrototypeOf(body)) {
                    // Only support ArrayBuffers for POST method.
                    // Receiving ArrayBuffers happens via Blobs, instead.
                } else {
                    throw new Error('unsupported BodyInit type')
                }

                if (!this.headers.get('content-type')) {
                    if (typeof body === 'string') {
                        this.headers.set('content-type', 'text/plain;charset=UTF-8')
                    } else if (this._bodyBlob && this._bodyBlob.type) {
                        this.headers.set('content-type', this._bodyBlob.type)
                    } else if (support.searchParams && URLSearchParams.prototype.isPrototypeOf(body)) {
                        this.headers.set('content-type', 'application/x-www-form-urlencoded;charset=UTF-8')
                    }
                }
            }

            if (support.blob) {
                this.blob = function () {
                    var rejected = consumed(this)
                    if (rejected) {
                        return rejected
                    }

                    if (this._bodyBlob) {
                        return Promise.resolve(this._bodyBlob)
                    } else if (this._bodyFormData) {
                        throw new Error('could not read FormData body as blob')
                    } else {
                        return Promise.resolve(new Blob([this._bodyText]))
                    }
                }

                this.arrayBuffer = function () {
                    return this.blob().then(readBlobAsArrayBuffer)
                }

                this.text = function () {
                    var rejected = consumed(this)
                    if (rejected) {
                        return rejected
                    }

                    if (this._bodyBlob) {
                        return readBlobAsText(this._bodyBlob)
                    } else if (this._bodyFormData) {
                        throw new Error('could not read FormData body as text')
                    } else {
                        return Promise.resolve(this._bodyText)
                    }
                }
            } else {
                this.text = function () {
                    var rejected = consumed(this)
                    return rejected ? rejected : Promise.resolve(this._bodyText)
                }
            }

            if (support.formData) {
                this.formData = function () {
                    return this.text().then(decode)
                }
            }

            this.json = function () {
                return this.text().then(JSON.parse)
            }

            return this
        }

        // HTTP methods whose capitalization should be normalized
        var methods = ['DELETE', 'GET', 'HEAD', 'OPTIONS', 'POST', 'PUT']

        function normalizeMethod(method) {
            var upcased = method.toUpperCase()
            return (methods.indexOf(upcased) > -1) ? upcased : method
        }

        function Request(input, options) {
            options = options || {}
            var body = options.body
            if (Request.prototype.isPrototypeOf(input)) {
                if (input.bodyUsed) {
                    throw new TypeError('Already read')
                }
                this.url = input.url
                this.credentials = input.credentials
                if (!options.headers) {
                    this.headers = new Headers(input.headers)
                }
                this.method = input.method
                this.mode = input.mode
                if (!body) {
                    body = input._bodyInit
                    input.bodyUsed = true
                }
            } else {
                this.url = input
            }

            this.credentials = options.credentials || this.credentials || 'omit'
            if (options.headers || !this.headers) {
                this.headers = new Headers(options.headers)
            }
            this.method = normalizeMethod(options.method || this.method || 'GET')
            this.mode = options.mode || this.mode || null
            this.referrer = null

            if ((this.method === 'GET' || this.method === 'HEAD') && body) {
                throw new TypeError('Body not allowed for GET or HEAD requests')
            }
            this._initBody(body)
        }

        Request.prototype.clone = function () {
            return new Request(this)
        }

        function decode(body) {
            var form = new FormData()
            body.trim().split('&').forEach(function (bytes) {
                if (bytes) {
                    var split = bytes.split('=')
                    var name = split.shift().replace(/\+/g, ' ')
                    var value = split.join('=').replace(/\+/g, ' ')
                    form.append(decodeURIComponent(name), decodeURIComponent(value))
                }
            })
            return form
        }

        function headers(xhr) {
            var head = new Headers()
            var pairs = (xhr.getAllResponseHeaders() || '').trim().split('\n')
            pairs.forEach(function (header) {
                var split = header.trim().split(':')
                var key = split.shift().trim()
                var value = split.join(':').trim()
                head.append(key, value)
            })
            return head
        }

        Body.call(Request.prototype)

        function Response(bodyInit, options) {
            if (!options) {
                options = {}
            }

            this.type = 'default'
            this.status = options.status
            this.ok = this.status >= 200 && this.status < 300
            this.statusText = options.statusText
            this.headers = options.headers instanceof Headers ? options.headers : new Headers(options.headers)
            this.url = options.url || ''
            this._initBody(bodyInit)
        }

        Body.call(Response.prototype)

        Response.prototype.clone = function () {
            return new Response(this._bodyInit, {
                status: this.status,
                statusText: this.statusText,
                headers: new Headers(this.headers),
                url: this.url
            })
        }

        Response.error = function () {
            var response = new Response(null, { status: 0, statusText: '' })
            response.type = 'error'
            return response
        }

        var redirectStatuses = [301, 302, 303, 307, 308]

        Response.redirect = function (url, status) {
            if (redirectStatuses.indexOf(status) === -1) {
                throw new RangeError('Invalid status code')
            }

            return new Response(null, { status: status, headers: { location: url } })
        }

        self.Headers = Headers
        self.Request = Request
        self.Response = Response

        self.fetch = function (input, init) {
            return new Promise(function (resolve, reject) {
                var request
                if (Request.prototype.isPrototypeOf(input) && !init) {
                    request = input
                } else {
                    request = new Request(input, init)
                }

                var xhr = new XMLHttpRequest()

                function responseURL() {
                    if ('responseURL' in xhr) {
                        return xhr.responseURL
                    }

                    // Avoid security warnings on getResponseHeader when not allowed by CORS
                    if (/^X-Request-URL:/m.test(xhr.getAllResponseHeaders())) {
                        return xhr.getResponseHeader('X-Request-URL')
                    }

                    return
                }

                xhr.onload = function () {
                    var options = {
                        status: xhr.status,
                        statusText: xhr.statusText,
                        headers: headers(xhr),
                        url: responseURL()
                    }
                    var body = 'response' in xhr ? xhr.response : xhr.responseText
                    resolve(new Response(body, options))
                }

                xhr.onerror = function () {
                    reject(new TypeError('Network request failed'))
                }

                xhr.ontimeout = function () {
                    reject(new TypeError('Network request failed'))
                }

                xhr.open(request.method, request.url, true)

                if (request.credentials === 'include') {
                    xhr.withCredentials = true
                }

                if ('responseType' in xhr && support.blob) {
                    xhr.responseType = 'blob'
                }

                request.headers.forEach(function (value, name) {
                    xhr.setRequestHeader(name, value)
                })

                xhr.send(typeof request._bodyInit === 'undefined' ? null : request._bodyInit)
            })
        }
        self.fetch.polyfill = true
    })(typeof self !== 'undefined' ? self : this);

    //ChildNode.remove polyfill for ie.
    //I got it from https://developer.mozilla.org/en-US/docs/Web/API/ChildNode/remove
    // from:https://github.com/jserz/js_piece/blob/master/DOM/ChildNode/remove()/remove().md
    (function (arr) {
    arr.forEach(function (item) {
        if (item.hasOwnProperty('remove')) {
        return;
        }
        Object.defineProperty(item, 'remove', {
        configurable: true,
        enumerable: true,
        writable: true,
        value: function remove() {
            this.parentNode.removeChild(this);
        }
        });
    });
    })([Element.prototype, CharacterData.prototype, DocumentType.prototype]);
};

fillPolys();

})();