var jsnsOptions = jsnsOptions || {};
var jsnsDefine =function (options) {
        class JsModuleInstance {
            constructor(definition, loader) {
                this.definition = definition;
                this.loader = loader;
                this.exports = {};
            }
        }
        class JsModuleDefinition {
            constructor(name, depNames, factory, loader, source, isRunner, moduleCodeFinder) {
                this.source = source;
                this.isRunner = isRunner;
                this.moduleCodeFinder = moduleCodeFinder;
                this.dependencies = [];
                this.name = name;
                this.factory = factory;
                if (depNames) {
                    for (var i = 0; i < depNames.length; ++i) {
                        var depName = depNames[i];
                        this.dependencies.push({
                            name: depName,
                            loaded: loader.isModuleLoaded(depName)
                        });
                    }
                }
            }
            getModuleCode(ignoredSources) {
                if (ignoredSources.indexOf(this.source) !== -1) {
                    return '';
                }
                if (this.isRunner) {
                    return 'jsns.run("' + this.dependencies[0].name + '");\n';
                }
                if (this.moduleCodeFinder !== undefined) {
                    return this.moduleCodeFinder(this);
                }
                else {
                    return 'jsns.define("' + this.name + '", ' + this.getDependenciesArg() + ', ' + this.factory + ');\n';
                }
            }
            getDependenciesArg(preDependencies) {
                var deps = '[';
                var sep = '';
                if (preDependencies) {
                    for (var i = 0; i < preDependencies.length; ++i) {
                        deps += sep + '"' + preDependencies[i] + '"';
                        sep = ',';
                    }
                }
                for (var i = 0; i < this.dependencies.length; ++i) {
                    deps += sep + '"' + this.dependencies[i].name + '"';
                    sep = ',';
                }
                deps += ']';
                return deps;
            }
        }
        class ModuleManager {
            constructor(options) {
                this.loaded = {};
                this.loadedOrder = [];
                this.unloaded = {};
                this.runners = [];
                this.fromModuleRunners = null; //When calling run from a module you can't add the runner to the runner's list, this will accumulate the runners during that time.
                if (options === undefined) {
                    options = {};
                }
                this.options = options;
            }
            /**
             * Add a runner to the module manager. This will add the runner in such a way that more runners can be defined during
             * module execution. If such a run is invoked it will be deferred until the current module stops executing.
             * Because of this management, loadRunners will be called automaticly by the addRunner funciton. There is no reason
             * for a client class to call that function for runners, and in fact that can create errors.
             */
            addRunner(name, source) {
                var runnerModule = new JsModuleDefinition(name + "Runner", [name], this.runnerFunc, this, source, true);
                if (this.fromModuleRunners !== null) {
                    this.fromModuleRunners.push(runnerModule);
                }
                else {
                    this.runners.push(runnerModule);
                    this.loadRunners();
                }
            }
            /**
             * Add a module to the module manager. Due to the variety of ways that a module could be added the user is responsible for
             * calling loadRunners() when they are ready to try to load modules.
             */
            addModule(name, dependencies, factory, moduleWriter) {
                this.unloaded[name] = new JsModuleDefinition(name, dependencies, factory, this, undefined, false, moduleWriter);
            }
            isModuleLoaded(name) {
                return this.loaded[name] !== undefined;
            }
            isModuleLoadable(name) {
                return this.unloaded[name] !== undefined;
            }
            isModuleDefined(name) {
                return this.isModuleLoaded(name) || this.isModuleLoadable(name);
            }
            loadModule(name) {
                var loaded = this.checkModule(this.unloaded[name]);
                if (loaded) {
                    delete this.unloaded[name];
                }
                return loaded;
            }
            setModuleLoaded(name, module) {
                if (this.loaded[name] === undefined) {
                    this.loaded[name] = module;
                    this.loadedOrder.push(name);
                }
            }
            checkModule(check) {
                var dependencies = check.dependencies;
                var fullyLoaded = true;
                var module = undefined;
                //Check to see if depenedencies are loaded and if they aren't and can be, load them
                for (var i = 0; i < dependencies.length; ++i) {
                    var dep = dependencies[i];
                    dep.loaded = this.isModuleLoaded(dep.name);
                    if (!dep.loaded && this.isModuleLoadable(dep.name)) {
                        dep.loaded = this.loadModule(dep.name);
                    }
                    fullyLoaded = fullyLoaded && dep.loaded;
                }
                //If all dependencies are loaded, load this library
                if (fullyLoaded) {
                    module = new JsModuleInstance(check, this);
                    if (!this.options.simulateModuleLoading) {
                        var args = [module.exports, module];
                        //Inject dependency arguments
                        for (var i = 0; i < dependencies.length; ++i) {
                            var dep = dependencies[i];
                            args.push(this.loaded[dep.name].exports);
                        }
                        check.factory.apply(module, args);
                    }
                    this.setModuleLoaded(check.name, module);
                }
                return fullyLoaded;
            }
            loadRunners() {
                this.fromModuleRunners = [];
                for (var i = 0; i < this.runners.length; ++i) {
                    var runner = this.runners[i];
                    if (this.checkModule(runner)) {
                        this.runners.splice(i--, 1);
                    }
                }
                var moreRunners = this.fromModuleRunners.length > 0;
                if (moreRunners) {
                    this.runners = this.runners.concat(this.fromModuleRunners);
                }
                this.fromModuleRunners = null;
                if (moreRunners) {
                    this.loadRunners();
                }
            }
            debug() {
                if (this.runners.length > 0) {
                    for (var i = 0; i < this.runners.length; ++i) {
                        var runner = this.runners[i];
                        console.log("Runner waiting " + runner.name);
                        for (var j = 0; j < runner.dependencies.length; ++j) {
                            var dependency = runner.dependencies[j];
                            if (!this.isModuleLoaded(dependency.name)) {
                                this.recursiveWaitingDebug(dependency.name, 1);
                            }
                        }
                    }
                }
                else {
                    console.log("No runners remaining.");
                }
            }
            printLoaded() {
                console.log("Loaded Modules:");
                for (var p in this.loaded) {
                    if (this.loaded.hasOwnProperty(p)) {
                        console.log(p);
                    }
                }
            }
            printUnloaded() {
                console.log("Unloaded Modules:");
                for (var p in this.unloaded) {
                    if (this.unloaded.hasOwnProperty(p)) {
                        console.log(p);
                    }
                }
            }
            createFileFromLoaded(ignoredSources) {
                if (ignoredSources === undefined) {
                    ignoredSources = [];
                }
                var modules = "var jsnsOptions = jsnsOptions || {};\nvar jsnsDefine =" + jsnsDefine + "\nvar jsns = jsns || jsnsDefine(jsnsOptions);\nvar define = define || " + define + '\n';
                for (var i = 0; i < this.loadedOrder.length; ++i) {
                    var p = this.loadedOrder[i];
                    if (this.loaded.hasOwnProperty(p)) {
                        var mod = this.loaded[p];
                        modules += mod.definition.getModuleCode(ignoredSources);
                    }
                }
                return modules;
            }
            recursiveWaitingDebug(name, indent) {
                var indentStr = '';
                for (var i = 0; i < indent; ++i) {
                    indentStr += ' ';
                }
                var module = this.unloaded[name];
                if (module !== undefined) {
                    console.log(indentStr + module.name);
                    for (var j = 0; j < module.dependencies.length; ++j) {
                        var dependency = module.dependencies[j];
                        if (!this.isModuleLoaded(dependency.name)) {
                            this.recursiveWaitingDebug(dependency.name, indent + 4);
                        }
                    }
                }
                else {
                    console.log(indentStr + name + ' module not yet loaded.');
                }
            }
            runnerFunc() { }
        }
        class Loader {
            constructor(moduleManager) {
                if (moduleManager === undefined) {
                    moduleManager = new ModuleManager();
                }
                this.moduleManager = moduleManager;
            }
            define(name, dependencies, factory) {
                if (!this.moduleManager.isModuleDefined(name)) {
                    this.moduleManager.addModule(name, dependencies, factory);
                    this.moduleManager.loadRunners();
                }
            }
            amd(name, discoverFunc) {
                if (!this.moduleManager.isModuleDefined(name)) {
                    this.discoverAmd(discoverFunc, (dependencies, factory, amdFactory) => {
                        this.moduleManager.addModule(name, dependencies, factory, (def) => this.writeAmdFactory(amdFactory, def));
                    });
                    this.moduleManager.loadRunners();
                }
            }
            /**
             * Run a module, will execute the code in the module, the module must actually
             * run some code not just export function for this to have any effect.
             *
             * Can optionally provide a source, which can be used to filter out running modules at build time
             * for tree shaking.
             */
            run(name, source) {
                this.moduleManager.addRunner(name, source);
            }
            debug() {
                this.moduleManager.debug();
            }
            printLoaded() {
                this.moduleManager.printLoaded();
            }
            printUnloaded() {
                this.moduleManager.printUnloaded();
            }
            createFileFromLoaded(ignoredSources) {
                return this.moduleManager.createFileFromLoaded(ignoredSources);
            }
            writeAmdFactory(amdFactory, def) {
                return 'define("' + def.name + '", ' + def.getDependenciesArg(["require", "exports"]) + ', ' + amdFactory + ');\n';
            }
            require() {
            }
            discoverAmd(discoverFunc, callback) {
                var dependencies;
                var factory;
                discoverFunc(function (dep, fac) {
                    dependencies = dep;
                    factory = fac;
                });
                //Remove crap that gets added by tsc (require and exports)
                dependencies.splice(0, 2);
                //Fix up paths, remove leading ./ that tsc likes to add / need
                for (var i = 0; i < dependencies.length; ++i) {
                    var dep = dependencies[i];
                    if (dep[0] === '.' && dep[1] === '/') {
                        dependencies[i] = dep.substring(2);
                    }
                }
                callback(dependencies, function (exports, module, ...args) {
                    args.unshift(exports);
                    args.unshift(this.require);
                    factory.apply(this, args); //This is a bit weird here, it will be the module instance from the loader, since it sets that before calling this function.
                }, factory);
            }
        }
        //Return the instance
        return new Loader(new ModuleManager(options));
    }
var jsns = jsns || jsnsDefine(jsnsOptions);
var define = define || function (name, deps, factory) {
    jsns.amd(name, function (cbDefine) {
        cbDefine(deps, factory);
    });
}
define("hr.runattributes", ["require","exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.ran = void 0;
    //Find all data-hr-run attributes and run the runner they specify, it does not matter what kind of element
    //contains the runner.
    var runnerElements = document.querySelectorAll('[data-hr-run]');
    for (var i = 0; i < runnerElements.length; ++i) {
        var runnerElement = runnerElements[i];
        var runnerAttr = runnerElement.getAttribute('data-hr-run');
        if (runnerAttr) {
            jsns.run(runnerAttr);
        }
    }
    exports.ran = true; //Dummy operation to force this to be a module
});
define("hr.storage", ["require","exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.StringStorage = exports.JsonStorage = exports.LocalStorageDriver = exports.SessionStorageDriver = exports.CookieStorageDriver = void 0;
    class CookieStorageDriver {
        constructor(name, days, path) {
            this.name = name;
            this.path = '/';
            this.days = undefined;
            if (days !== undefined && days !== null) {
                this.days = days;
            }
            if (path !== undefined) {
                this.path = path;
            }
        }
        getValue() {
            return CookieStorageDriver.readRaw(this.name);
        }
        setValue(val) {
            CookieStorageDriver.createRaw(this.name, val, this.path, this.days);
        }
        //These three functions (createRaw, readRaw and erase) are from
        //http://www.quirksmode.org/js/cookies.html
        //The names were changed
        /**
         * Create a cookie on the doucment.
         * @param {type} name - The name of the cookie
         * @param {type} value - The value of the cookie
         * @param {type} days - The expiration in days for the cookie
         */
        static createRaw(name, value, path, days) {
            if (days) {
                var date = new Date();
                date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
                var expires = "; expires=" + date.toUTCString();
            }
            else
                var expires = "";
            document.cookie = name + "=" + value + expires + "; path=" + path;
        }
        /**
         * Read a cookie from the document.
         * @param {type} name - The name of the cookie to read
         * @returns {type} - The cookie value.
         */
        static readRaw(name) {
            var nameEQ = name + "=";
            var ca = document.cookie.split(';');
            for (var i = 0; i < ca.length; i++) {
                var c = ca[i];
                while (c.charAt(0) == ' ')
                    c = c.substring(1, c.length);
                if (c.indexOf(nameEQ) == 0)
                    return c.substring(nameEQ.length, c.length);
            }
            return null;
        }
        /**
         * Erase a cookie from the document.
         * @param {type} name
         */
        erase() {
            CookieStorageDriver.createRaw(this.name, "", this.path, -1);
        }
    }
    exports.CookieStorageDriver = CookieStorageDriver;
    class SessionStorageDriver {
        constructor(name) {
            this.name = name;
        }
        /**
         * Get the value stored by the driver, will be null if there is no value
         */
        getValue() {
            return sessionStorage.getItem(this.name);
        }
        /**
         * Set the value stored by the driver.
         */
        setValue(val) {
            sessionStorage.setItem(this.name, val);
        }
        /**
         * Erase the value stored by the driver.
         */
        erase() {
            this.setValue(null);
        }
    }
    exports.SessionStorageDriver = SessionStorageDriver;
    class LocalStorageDriver {
        constructor(name) {
            this.name = name;
        }
        /**
         * Get the value stored by the driver, will be null if there is no value
         */
        getValue() {
            return localStorage.getItem(this.name);
        }
        /**
         * Set the value stored by the driver.
         */
        setValue(val) {
            localStorage.setItem(this.name, val);
        }
        /**
         * Erase the value stored by the driver.
         */
        erase() {
            this.setValue(null);
        }
    }
    exports.LocalStorageDriver = LocalStorageDriver;
    class JsonStorage {
        constructor(storageDriver) {
            this.storageDriver = storageDriver;
        }
        setSerializerOptions(replacer, space) {
            this.replacer = replacer;
            this.space = space;
        }
        getValue(defaultValue) {
            var str = this.storageDriver.getValue();
            var recovered;
            if (str !== null) {
                recovered = JSON.parse(str);
            }
            else {
                recovered = defaultValue;
            }
            return recovered;
        }
        setValue(val) {
            this.storageDriver.setValue(JSON.stringify(val, this.replacer, this.space));
        }
        erase() {
            this.storageDriver.erase();
        }
    }
    exports.JsonStorage = JsonStorage;
    class StringStorage {
        constructor(storageDriver) {
            this.storageDriver = storageDriver;
        }
        getValue(defaultValue) {
            return this.storageDriver.getValue();
        }
        setValue(val) {
            this.storageDriver.setValue(val);
        }
        erase() {
            this.storageDriver.erase();
        }
    }
    exports.StringStorage = StringStorage;
});
define("hr.typeidentifiers", ["require","exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.isGenerator = exports.isForEachable = exports.isObject = exports.isFunction = exports.isString = exports.isArray = void 0;
    /**
     * Determine if a variable is an array.
     * @param test - The object to test
     * @returns {boolean} - True if the object is an array
     */
    function isArray(test) {
        return Array.isArray(test);
    }
    exports.isArray = isArray;
    /**
     * Determine if a variable is a string.
     * @param test - The object to test
     * @returns {boolean} - True if a string, false if not
     */
    function isString(test) {
        return typeof (test) === 'string';
    }
    exports.isString = isString;
    /**
     * Determine if a variable is a function.
     * @param test - The object to test
     * @returns {boolean} - True if a function, false if not
     */
    function isFunction(test) {
        return typeof (test) === 'function';
    }
    exports.isFunction = isFunction;
    /**
     * Determine if a variable is an object.
     * @param test - The object to test
     * @returns {boolean} - True if an object, false if not
     */
    function isObject(test) {
        return typeof test === 'object';
    }
    exports.isObject = isObject;
    ;
    function isForEachable(test) {
        return test && isFunction(test['forEach']);
    }
    exports.isForEachable = isForEachable;
    function isGenerator(test) {
        return test && isFunction(test['next']) && isFunction(test['return']) && isFunction(test['throw']);
    }
    exports.isGenerator = isGenerator;
});
define("hr.domquery", ["require","exports","hr.typeidentifiers"], function (require, exports, typeId) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.matches = exports.iterateElementNodes = exports.iterateNodes = exports.iterate = exports.all = exports.first = void 0;
    /**
     * Derive the plain javascript element from a passed element
     * @param {string|Node} element - the element to detect
     * @returns {Node} - The located html element.
     */
    function first(element, context) {
        if (typeof element === 'string') {
            if (context !== undefined) {
                if (matches(context, element)) {
                    return context;
                }
                else {
                    return context.querySelector(element);
                }
            }
            else {
                return document.querySelector(element);
            }
        }
        if (element instanceof Node) {
            return element;
        }
    }
    exports.first = first;
    ;
    /**
     * Query all passed javascript elements
     * @param {string|HTMLElement} element - the element to detect
     * @param {HTMLElement} element - the context to search
     * @returns {array[HTMLElement]} - The results array to append to.
     * @returns {array[HTMLElement]} - The located html element. Will be the results array if one is passed otherwise a new one.
     */
    function all(element, context, results) {
        if (typeof element === 'string') {
            if (results === undefined) {
                results = [];
            }
            if (context !== undefined) {
                //Be sure to include the main element if it matches the selector.
                if (matches(context, element)) {
                    results.push(context);
                }
                //This will add all child elements that match the selector.
                nodesToArray(context.querySelectorAll(element), results);
            }
            else {
                nodesToArray(document.querySelectorAll(element), results);
            }
        }
        else if (element instanceof HTMLElement) {
            if (results === undefined) {
                results = [element];
            }
            else {
                results.push(element);
            }
        }
        else {
            if (results === undefined) {
                results = element;
            }
            else {
                for (var i = 0; i < element.length; ++i) {
                    results.push(element[i]);
                }
            }
        }
        return results;
    }
    exports.all = all;
    ;
    /**
     * Query all passed javascript elements
     * @param {string|HTMLElement} element - the element to detect
     * @param {HTMLElement} element - the context to search
     * @param cb - Called with each htmlelement that is found
     */
    function iterate(element, context, cb) {
        if (typeId.isString(element)) {
            if (context) {
                if (matches(context, element)) {
                    cb(context);
                }
                else {
                    iterateQuery(context.querySelectorAll(element), cb);
                }
            }
            else {
                iterateQuery(document.querySelectorAll(element), cb);
            }
        }
        else if (element instanceof HTMLElement) {
            cb(element);
        }
        else if (Array.isArray(element)) {
            for (var i = 0; i < element.length; ++i) {
                cb(element[i]);
            }
        }
    }
    exports.iterate = iterate;
    ;
    function alwaysTrue(node) {
        return true;
    }
    //createNodeIterator is tricky, this will make sure it can be called on ie and modern browsers
    var createNodeIteratorShim = function (root, whatToShow) {
        return document.createNodeIterator(root, whatToShow);
    };
    try {
        //See if the default version works, no error should occur during the following call.
        const iter = createNodeIteratorShim(document, NodeFilter.SHOW_ELEMENT);
    }
    catch (_) {
        //If we get an error here the default version does not work, so use the shimmed version for ie.
        createNodeIteratorShim = function (root, whatToShow) {
            return document.createNodeIterator(root, whatToShow, alwaysTrue, false);
        };
    }
    /**
     * Iterate a node collection using createNodeIterator. There is no query for this version
     * as it iterates everything and allows you to extract what is needed.
     * @param  element - The root element
     * @param {NodeFilter} whatToShow - see createNodeIterator, defaults to SHOW_ALL
     * @param  cb - The function called for each item iterated
     */
    function iterateNodes(node, whatToShow, cb) {
        var iter = createNodeIteratorShim(node, whatToShow);
        var resultNode;
        while (resultNode = iter.nextNode()) {
            cb(resultNode);
        }
    }
    exports.iterateNodes = iterateNodes;
    /**
     * Iterate an element collection using createNodeIterator with SHOW_ELEMENT as its arg.
     * There is no query for this version as it iterates everything and allows you to extract what is needed.
     * @param  element - The root element
     * @param {NodeFilter} whatToShow - see createNodeIterator, defaults to SHOW_ALL
     * @param  cb - The function called for each item iterated
     */
    function iterateElementNodes(node, cb) {
        var iter = createNodeIteratorShim(node, NodeFilter.SHOW_ELEMENT);
        var resultNode;
        while (resultNode = iter.nextNode()) {
            cb(resultNode);
        }
    }
    exports.iterateElementNodes = iterateElementNodes;
    /**
     * Determine if an element matches the given selector.
     * @param {type} element
     * @param {type} selector
     * @returns {type}
     */
    function matches(element, selector) {
        return element.matches(selector);
    }
    exports.matches = matches;
    function nodesToArray(nodes, arr) {
        for (var i = 0; i < nodes.length; ++i) {
            arr.push(nodes[i]);
        }
    }
    function iterateQuery(nodes, cb) {
        for (var i = 0; i < nodes.length; ++i) {
            cb(nodes[i]);
        }
    }
});
define("hr.eventdispatcher", ["require","exports","hr.typeidentifiers"], function (require, exports, typeId) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.PromiseEventDispatcher = exports.FuncEventDispatcher = exports.ActionEventDispatcher = void 0;
    /**
     * This event dispatcher does not handle event listeners returning values.
     */
    class ActionEventDispatcher {
        constructor() {
            this.listeners = [];
        }
        add(listener) {
            if (!typeId.isFunction(listener)) {
                throw new Error("Listener must be a function, instead got " + typeof (listener));
            }
            this.listeners.push(listener);
        }
        remove(listener) {
            for (var i = 0; i < this.listeners.length; ++i) {
                if (this.listeners[i] === listener) {
                    this.listeners.splice(i--, 1);
                }
            }
        }
        get modifier() {
            return this;
        }
        fire(arg) {
            for (var i = 0; i < this.listeners.length; ++i) {
                this.listeners[i](arg);
            }
        }
    }
    exports.ActionEventDispatcher = ActionEventDispatcher;
    /**
     * This is class is for events that return a value.
     */
    class FuncEventDispatcher {
        constructor() {
            this.listeners = [];
        }
        add(listener) {
            if (!typeId.isFunction(listener)) {
                throw new Error("Listener must be a function, instead got " + typeof (listener));
            }
            this.listeners.push(listener);
        }
        remove(listener) {
            for (var i = 0; i < this.listeners.length; ++i) {
                if (this.listeners[i] === listener) {
                    this.listeners.splice(i--, 1);
                }
            }
        }
        get modifier() {
            return this;
        }
        fire(arg) {
            var result = undefined;
            var nextResult;
            for (var i = 0; i < this.listeners.length; ++i) {
                var listener = this.listeners[i];
                nextResult = listener(arg);
                if (nextResult !== undefined) {
                    if (result === undefined) {
                        result = [];
                    }
                    result.push(nextResult);
                }
            }
            return result;
        }
    }
    exports.FuncEventDispatcher = FuncEventDispatcher;
    /**
     * This event dispatcher will return a promise that will resolve when all events
     * are finished running. Allows async work to stay in the event flow.
     */
    class PromiseEventDispatcher {
        constructor() {
            this.listeners = [];
        }
        add(listener) {
            if (!typeId.isFunction(listener)) {
                throw new Error("Listener must be a function, instead got " + typeof (listener));
            }
            this.listeners.push(listener);
        }
        remove(listener) {
            for (var i = 0; i < this.listeners.length; ++i) {
                if (this.listeners[i] === listener) {
                    this.listeners.splice(i--, 1);
                }
            }
        }
        get modifier() {
            return this;
        }
        /**
         * Fire the event. The listeners can return values, if they do the values will be added
         * to an array that is returned by the promise returned by this function.
         * @returns {Promise} a promise that will resolve when all fired events resolve.
         */
        fire(arg) {
            var result;
            var promises = [];
            for (var i = 0; i < this.listeners.length; ++i) {
                var listener = this.listeners[i];
                promises.push(new Promise(function (resovle, reject) {
                    resovle(listener(arg));
                })
                    .then(function (data) {
                    if (data !== undefined) {
                        if (result === undefined) {
                            result = [];
                        }
                        result.push(data);
                    }
                }));
            }
            return Promise.all(promises)
                .then(function (data) {
                return result;
            });
        }
    }
    exports.PromiseEventDispatcher = PromiseEventDispatcher;
});
define("hr.toggles", ["require","exports","hr.typeidentifiers","hr.eventdispatcher"], function (require, exports, typeId, evts) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.build = exports.getStartState = exports.AttributeToggleStates = exports.ReadonlyToggleStates = exports.DisabledToggleStates = exports.MultiToggleStates = exports.ToggleStates = exports.addTogglePlugin = exports.Group = exports.OnOffToggle = exports.TypedToggle = void 0;
    var defaultStates = ['on', 'off']; //Reusuable states, so we don't end up creating tons of these arrays
    var togglePlugins = [];
    /**
     * Interface for typed toggles, provides a way to get the states as a string,
     * you should provide the names of all your functions here.
     */
    class TypedToggle {
        constructor() {
            this.events = {};
        }
        /**
         * Get the states this toggle can activate.
         */
        getPossibleStates() {
            return [];
        }
        /**
         * Set the toggle states used by this strong toggle, should not be called outside of
         * the toggle build function.
         */
        setStates(states) {
            this.states = states;
            this.states.setToggle(this);
        }
        applyState(name) {
            if (this._currentState !== name) {
                this._currentState = name;
                if (this.states.applyState(name)) {
                    this.fireStateChange(name);
                }
            }
        }
        isUsable() {
            return !(typeId.isObject(this.states) && this.states.constructor.prototype == NullStates.prototype);
        }
        get currentState() {
            return this._currentState;
        }
        fireStateChange(name) {
            this._currentState = name; //This only should happen as the result of an applystate call or the state being changed externally to the library
            //The event will only fire on the current state, so it is safe to set the current state here.
            if (this.events[name] !== undefined) {
                this.events[name].fire(this);
            }
        }
        getStateEvent(name) {
            if (this.events[name] === undefined) {
                this.events[name] = new evts.ActionEventDispatcher();
            }
            return this.events[name];
        }
    }
    exports.TypedToggle = TypedToggle;
    /**
     * A toggle that is on and off.
     */
    class OnOffToggle extends TypedToggle {
        on() {
            this.applyState("on");
        }
        off() {
            this.applyState("off");
        }
        get onEvent() {
            return this.getStateEvent('on').modifier;
        }
        get offEvent() {
            return this.getStateEvent('off').modifier;
        }
        getPossibleStates() {
            return OnOffToggle.states;
        }
        toggle() {
            if (this.mode) {
                this.off();
            }
            else {
                this.on();
            }
        }
        get mode() {
            return this.currentState === "on";
        }
        set mode(value) {
            var currentOn = this.mode;
            if (currentOn && !value) {
                this.off();
            }
            else if (!currentOn && value) {
                this.on();
            }
        }
    }
    exports.OnOffToggle = OnOffToggle;
    OnOffToggle.states = ['on', 'off'];
    /**
     * The Group defines a collection of toggles that can be manipulated together.
     */
    class Group {
        constructor(...toggles) {
            this.toggles = toggles;
        }
        /**
         * Add a toggle to the group.
         * @param toggle - The toggle to add.
         */
        add(toggle) {
            this.toggles.push(toggle);
        }
        /**
         * This function will set all toggles in the group (including the passed one if its in the group)
         * to the hideState and then will set the passed toggle to showState.
         * @param toggle - The toggle to set.
         * @param {string} [showState] - The state to set the passed toggle to.
         * @param {string} [hideState] - The state to set all other toggles to.
         */
        activate(toggle, showState, hideState) {
            if (showState === undefined) {
                showState = 'on';
            }
            if (hideState === undefined) {
                hideState = 'off';
            }
            for (var i = 0; i < this.toggles.length; ++i) {
                this.toggles[i].applyState(hideState);
            }
            toggle.applyState(showState);
        }
    }
    exports.Group = Group;
    /**
     * Add a toggle plugin that can create additional items on the toggle chain.
     * @param {type} plugin
     */
    function addTogglePlugin(plugin) {
        togglePlugins.push(plugin);
    }
    exports.addTogglePlugin = addTogglePlugin;
    /**
     * Base class for toggle state collections. Implemented as a chain.
     * @param {ToggleStates} next
     */
    class ToggleStates {
        constructor(next) {
            this.states = {};
            this.next = next;
        }
        addState(name, value) {
            this.states[name] = value;
        }
        applyState(name) {
            var state = this.states[name];
            var fireEvent = this.activateState(state);
            if (this.next) {
                fireEvent = this.next.applyState(name) || fireEvent;
            }
            return fireEvent;
        }
        setToggle(toggle) {
            this.toggle = toggle;
        }
        fireStateChange(name) {
            if (this.toggle) {
                this.toggle.fireStateChange(name);
            }
        }
    }
    exports.ToggleStates = ToggleStates;
    /**
     * This class holds multiple toggle states as a group. This handles multiple toggles
     * with the same name by bunding them up turning them on and off together.
     * @param {ToggleStates} next
     */
    class MultiToggleStates {
        constructor(childStates) {
            this.childStates = childStates;
        }
        applyState(name) {
            var fireEvent = true;
            for (var i = 0; i < this.childStates.length; ++i) {
                fireEvent = this.childStates[i].applyState(name) || fireEvent; //Fire event first so we always fire all the items in the chain
            }
            return fireEvent;
        }
        setToggle(toggle) {
            for (var i = 0; i < this.childStates.length; ++i) {
                this.childStates[i].setToggle(toggle);
            }
        }
    }
    exports.MultiToggleStates = MultiToggleStates;
    class DisabledToggleStates extends ToggleStates {
        constructor(element, next) {
            super(next);
            this.element = element;
        }
        activateState(style) {
            if (Boolean(style)) {
                this.element.setAttribute('disabled', 'disabled');
            }
            else {
                this.element.removeAttribute('disabled');
            }
            return true;
        }
    }
    exports.DisabledToggleStates = DisabledToggleStates;
    class ReadonlyToggleStates extends ToggleStates {
        constructor(element, next) {
            super(next);
            this.element = element;
        }
        activateState(style) {
            if (Boolean(style)) {
                this.element.setAttribute('readonly', 'readonly');
            }
            else {
                this.element.removeAttribute('readonly');
            }
            return true;
        }
    }
    exports.ReadonlyToggleStates = ReadonlyToggleStates;
    /**
     * This class toggles attributes on and off for an element.
     */
    class AttributeToggleStates extends ToggleStates {
        constructor(attrName, element, next) {
            super(next);
            this.attrName = attrName;
            this.element = element;
        }
        activateState(style) {
            if (style) {
                this.element.setAttribute(this.attrName, style);
            }
            else {
                this.element.removeAttribute(this.attrName);
            }
            return true;
        }
    }
    exports.AttributeToggleStates = AttributeToggleStates;
    /**
     * A simple toggle state that does nothing. Used to shim correctly if no toggles are defined for a toggle element.
     */
    class NullStates extends ToggleStates {
        constructor(next) {
            super(next);
        }
        activateState(value) {
            return true;
        }
    }
    /**
     * A toggler that toggles style for an element
     */
    class StyleStates extends ToggleStates {
        constructor(element, next) {
            super(next);
            this.element = element;
            this.originalStyles = element.style.cssText || "";
        }
        activateState(style) {
            if (style) {
                this.element.style.cssText = this.originalStyles + style;
            }
            else {
                this.element.style.cssText = this.originalStyles;
            }
            return true;
        }
    }
    /**
    * A toggler that toggles classes for an element. Supports animations using an
    * idle attribute (data-hr-class-idle) that if present will have its classes
    * applied to the element when any animations have completed.
    */
    class ClassStates extends ToggleStates {
        constructor(element, next) {
            super(next);
            this.element = element;
            this.originalClasses = element.getAttribute("class") || "";
            this.idleClass = element.getAttribute('data-hr-class-idle');
            this.stopAnimationCb = () => { this.stopAnimation(); };
        }
        activateState(classes) {
            if (classes) {
                this.element.setAttribute("class", this.originalClasses + ' ' + classes);
            }
            else {
                this.element.setAttribute("class", this.originalClasses);
            }
            this.startAnimation();
            return true;
        }
        startAnimation() {
            if (this.idleClass) {
                this.element.classList.remove(this.idleClass);
                this.element.removeEventListener('transitionend', this.stopAnimationCb);
                this.element.removeEventListener('animationend', this.stopAnimationCb);
                this.element.addEventListener('transitionend', this.stopAnimationCb);
                this.element.addEventListener('animationend', this.stopAnimationCb);
            }
        }
        stopAnimation() {
            this.element.removeEventListener('transitionend', this.stopAnimationCb);
            this.element.removeEventListener('animationend', this.stopAnimationCb);
            this.element.classList.add(this.idleClass);
        }
    }
    /**
     * Extract all the states from a given element to build a single toggle in the chain.
     * You pass in the prefix and states you want to extract as well as the constructor
     * to use to create new states.
     * @param {type} element - The element to extract toggles from
     * @param {type} states - The states to look for
     * @param {type} attrPrefix - The prefix for the attribute that defines the state. Will be concated with each state to form the lookup attribute.
     * @param {type} toggleConstructor - The constructor to use if a toggle is created.
     * @param {type} nextToggle - The next toggle to use in the chain
     * @returns {type} The toggle that should be the next element in the chain, will be the new toggle if one was created or nextToggle if nothing was created.
     */
    function extractStates(element, states, attrPrefix, toggleConstructor, nextToggle) {
        var toggleStates = null;
        for (var i = 0; i < states.length; ++i) {
            var name = states[i];
            var attr = attrPrefix + name;
            if (element.hasAttribute(attr)) {
                var value = element.getAttribute(attr);
                if (toggleStates === null) {
                    toggleStates = new toggleConstructor(element, nextToggle);
                }
                toggleStates.addState(name, value);
            }
        }
        if (toggleStates) {
            return toggleStates;
        }
        return nextToggle;
    }
    const toggleAttributeStart = 'data-hr-attr-';
    function extractAttrStates(element, states, nextToggle) {
        var lastCreated = null;
        var ariaStates = {};
        var attributes = element.attributes;
        for (var a = 0; a < attributes.length; ++a) { //For each attribute
            var attr = attributes[a];
            var attrName = attr.name;
            for (var i = 0; i < states.length; ++i) { //For each state
                var state = states[i];
                var end = "-" + state;
                if (attrName.startsWith(toggleAttributeStart) && attrName.endsWith(end)) { //If the attribute name matches the expected value (data-hr-attr-ATTRIBUTE-STATE)
                    var toggleAttrName = attrName.substring(toggleAttributeStart.length, attrName.length - end.length);
                    if (lastCreated === null) { //See if we need to create the attribute toggle
                        nextToggle = lastCreated = new AttributeToggleStates(toggleAttrName, element, nextToggle);
                    }
                    lastCreated.addState(state, attr.value);
                }
            }
            lastCreated = null; //Reset the last created toggle, so a new one is made for each attribute.
        }
        return nextToggle;
    }
    function getStartState(element) {
        var attr = "data-hr-state";
        if (element.hasAttribute(attr)) {
            var value = element.getAttribute(attr);
            return value;
        }
        return null;
    }
    exports.getStartState = getStartState;
    /**
     * Build a toggle chain from the given element
     * @param {string} element - The element to build toggles for
     * @param {string[]} [stateNames] - The states the toggle needs, will create functions on
     * the toggle for each one. If this is undefined will default to "on" and "off".
     * @returns A new ToggleChain with the defined states as functions
     */
    function build(element, stateNames) {
        if (stateNames === undefined) {
            stateNames = defaultStates;
        }
        var toggle = null;
        if (element !== null) {
            toggle = extractStates(element, stateNames, 'data-hr-style-', StyleStates, toggle);
            toggle = extractStates(element, stateNames, 'data-hr-class-', ClassStates, toggle);
            toggle = extractStates(element, stateNames, 'data-hr-disabled-', DisabledToggleStates, toggle);
            toggle = extractStates(element, stateNames, 'data-hr-readonly-', ReadonlyToggleStates, toggle);
            //Find aria states
            toggle = extractAttrStates(element, stateNames, toggle);
            //Now toggle plugin chain
            for (var i = 0; i < togglePlugins.length; ++i) {
                toggle = togglePlugins[i](element, stateNames, toggle);
            }
        }
        //If we get all the way here with no toggle, use the null toggle.
        if (toggle === null) {
            toggle = new NullStates(toggle);
        }
        return toggle;
    }
    exports.build = build;
});
define("hr.formhelper", ["require","exports","hr.domquery","hr.typeidentifiers"], function (require, exports, domQuery, typeIds) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.getSharedClearingValidator = exports.buildForm = exports.setBuildFormFunc = exports.setValue = exports.populate = exports.getDataType = exports.DataType = exports.readValue = exports.serialize = exports.shouldAddValue = exports.IsFormElement = void 0;
    function IsFormElement(element) {
        return element && (element.nodeName === 'FORM' || element.nodeName == 'INPUT' || element.nodeName == 'TEXTAREA');
    }
    exports.IsFormElement = IsFormElement;
    /**
     * This function will return true if the value should be added to an output object, and false if it should not.
     * @param value
     */
    function shouldAddValue(value) {
        return value !== undefined && value !== ""; //Prevents empty strings and undefined from being added to the output object
    }
    exports.shouldAddValue = shouldAddValue;
    function addValue(q, name, value, level) {
        if (!shouldAddValue(value)) {
            return;
        }
        name = extractLevelName(level, name);
        if (q[name] === undefined) {
            q[name] = value;
        }
        else if (!typeIds.isArray(q[name])) {
            var tmp = q[name];
            q[name] = [tmp, value];
        }
        else {
            q[name].push(value);
        }
    }
    function allowWrite(element, level) {
        return level === undefined || element.getAttribute('data-hr-form-level') === level;
    }
    /**
     * Serialze a form to a javascript object
     * @param form - A selector or form element for the form to serialize.
     * @returns - The object that represents the form contents as an object.
     */
    function serialize(form, proto, level) {
        //This is from https://code.google.com/archive/p/form-serialize/downloads
        //Modified to return an object instead of a query string
        var formElements;
        if (IsFormElement(form)) {
            formElements = form.elements;
        }
        else {
            formElements = domQuery.all("[name]", form); //All elements with a name, they will be filtered by what is supported below
        }
        var i, j, q = Object.create(proto || null);
        var elementsLength = formElements.length;
        for (i = 0; i < elementsLength; ++i) {
            var element = formElements[i];
            if (element.name === "" || !allowWrite(element, level)) {
                continue;
            }
            var value = readValue(element);
            if (value !== undefined) {
                addValue(q, element.name, value, level);
            }
        }
        return q;
    }
    exports.serialize = serialize;
    /**
     * Read the value out of an HTMLFormElement. Will return undefined if there is no value.
     * @param element The HTMLFormElement to read.
     */
    function readValue(element) {
        switch (element.nodeName) {
            case 'INPUT':
                switch (element.type) {
                    case 'file':
                        var file = element.files;
                        if (!element.hasAttribute("multiple") && file.length > 0) {
                            file = file[0];
                        }
                        return file;
                    case 'checkbox':
                    case 'radio':
                        if (element.checked) {
                            return element.value;
                        }
                        break;
                    default:
                        return element.value;
                }
                break;
            case 'TEXTAREA':
                return element.value;
            case 'SELECT':
                switch (element.type) {
                    case 'select-one':
                        return element.value;
                    case 'select-multiple':
                        var selected = [];
                        for (var j = element.options.length - 1; j >= 0; j = j - 1) {
                            var option = element.options[j];
                            if (option.selected && option.value !== "") {
                                selected.push(element.options[j].value);
                            }
                        }
                        if (selected.length > 0) {
                            return selected;
                        }
                        break;
                }
                break;
            case 'BUTTON':
                switch (element.type) {
                    case 'reset':
                    case 'submit':
                    case 'button':
                        return element.value;
                }
                break;
        }
        return undefined;
    }
    exports.readValue = readValue;
    var DataType;
    (function (DataType) {
        DataType[DataType["Object"] = 0] = "Object";
        DataType[DataType["Function"] = 1] = "Function";
    })(DataType = exports.DataType || (exports.DataType = {}));
    function containsCoerced(items, search) {
        for (var i = 0; i < items.length; ++i) {
            if (items[i] == search) {
                return true;
            }
        }
        return false;
    }
    function extractLevelName(level, name) {
        if (level !== undefined && level !== null && level.length > 0) {
            name = name.substring(level.length + 1); //Account for delimiter, but we don't care what it is
        }
        return name;
    }
    function getDataType(data) {
        if (typeIds.isObject(data)) {
            return DataType.Object;
        }
        else if (typeIds.isFunction(data)) {
            return DataType.Function;
        }
    }
    exports.getDataType = getDataType;
    /**
     * Populate a form with data.
     * @param form - The form to populate or a query string for the form.
     * @param data - The data to bind to the form, form name attributes will be mapped to the keys in the object.
     */
    function populate(form, data, level) {
        var formElement = domQuery.first(form);
        var nameAttrs = domQuery.all('[name]', formElement);
        var dataType = getDataType(data);
        for (var i = 0; i < nameAttrs.length; ++i) {
            var element = nameAttrs[i];
            if (allowWrite(element, level)) {
                var itemData;
                var dataName = extractLevelName(level, element.getAttribute('name'));
                switch (dataType) {
                    case DataType.Object:
                        itemData = data[dataName];
                        break;
                    case DataType.Function:
                        itemData = data(dataName);
                        break;
                }
                setValue(element, itemData);
            }
        }
    }
    exports.populate = populate;
    function setValue(element, itemData) {
        if (itemData === undefined) {
            itemData = "";
        }
        switch (element.nodeName) {
            case 'INPUT':
                switch (element.type) {
                    case 'radio':
                    case 'checkbox':
                        element.checked = itemData;
                        break;
                    default:
                        element.value = itemData;
                        break;
                }
                break;
            case 'TEXTAREA':
                element.value = itemData ? itemData : "";
                break;
            case 'SELECT':
                switch (element.type) {
                    case 'select-multiple':
                        var options = element.options;
                        if (Array.isArray(itemData)) {
                            for (var j = options.length - 1; j >= 0; j = j - 1) {
                                options[j].selected = containsCoerced(itemData, options[j].value);
                            }
                        }
                        break;
                    case 'select-one':
                        var options = element.options;
                        var valueToSet = "";
                        if (options.length > 0) { //Default to setting the first value
                            valueToSet = options[0].value;
                        }
                        if (itemData !== null && itemData !== undefined) {
                            var itemDataString = String(itemData);
                            //Scan options to find the value that is attempting to be set, if it does not exist, this will default back to the first value
                            for (var j = options.length - 1; j >= 0; j = j - 1) {
                                if (options[j].value === itemDataString) {
                                    valueToSet = itemDataString;
                                }
                            }
                        }
                        element.value = valueToSet;
                        break;
                }
                break;
            default:
                element.value = itemData;
                break;
        }
    }
    exports.setValue = setValue;
    var buildFormCb;
    function setBuildFormFunc(buildForm) {
        buildFormCb = buildForm;
    }
    exports.setBuildFormFunc = setBuildFormFunc;
    function buildForm(componentName, schema, parentElement) {
        return buildFormCb(componentName, schema, parentElement);
    }
    exports.buildForm = buildForm;
    class ClearingValidator {
        constructor() {
            this.message = "";
        }
        /**
         * Get the validation error named name.
         */
        getValidationError(name) {
            return undefined;
        }
        /**
         * Check to see if a named validation error exists.
         */
        hasValidationError(name) {
            return false;
        }
        /**
         * Get all validation errors.
         */
        getValidationErrors() {
            return {};
        }
        /**
         * Determine if there are any validation errors.
         */
        hasValidationErrors() {
            return true;
        }
        addKey(baseName, key) {
            return "";
        }
        addIndex(baseName, key, index) {
            return "";
        }
    }
    var sharedClearingValidator = new ClearingValidator();
    /**
     * Get a shared instance of a validator that will clear all data passed in.
     */
    function getSharedClearingValidator() {
        return sharedClearingValidator;
    }
    exports.getSharedClearingValidator = getSharedClearingValidator;
});
define("hr.form", ["require","exports","hr.formhelper","hr.eventdispatcher"], function (require, exports, formHelper, events) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.build = exports.NeedsSchemaForm = void 0;
    /**
     * This form decorator will ensure that a schema is loaded before any data is added to the
     * form. You can call setData and setSchema in any order you want, but the data will not
     * be set until the schema is loaded. Just wrap your real IForm in this decorator to get this
     * feature.
     */
    class NeedsSchemaForm {
        constructor(wrapped) {
            this.wrapped = wrapped;
            this.loadedSchema = false;
        }
        setError(err) {
            this.wrapped.setError(err);
        }
        clearError() {
            this.wrapped.clearError();
        }
        /**
          * Set the data on the form.
          * @param data The data to set.
          */
        setData(data) {
            if (this.loadedSchema) {
                this.wrapped.setData(data);
            }
            else {
                this.waitingData = data;
            }
        }
        /**
         * Remove all data from the form.
         */
        clear() {
            this.wrapped.clear();
        }
        /**
         * Get the data on the form. If you set a prototype
         * it will be used as the prototype of the returned
         * object.
         */
        getData() {
            return this.wrapped.getData();
        }
        getValue(name) {
            return this.wrapped.getValue(name);
        }
        /**
         * Set the prototype object to use when getting the
         * form data with getData.
         * @param proto The prototype object.
         */
        setPrototype(proto) {
            this.wrapped.setPrototype(proto);
        }
        /**
         * Set the schema for this form. This will add any properties found in the
         * schema that you did not already define on the form. It will match the form
         * property names to the name attribute on the elements. If you had a blank form
         * this would generate the whole thing for you from the schema.
         */
        setSchema(schema, componentName) {
            this.wrapped.setSchema(schema, componentName);
            if (this.waitingData !== undefined) {
                this.wrapped.setData(this.waitingData);
                this.waitingData = undefined;
            }
            this.loadedSchema = true;
        }
        get onBeforeSetData() {
            return this.wrapped.onBeforeSetData;
        }
        get onAfterSetData() {
            return this.wrapped.onAfterSetData;
        }
        get onBeforeGetData() {
            return this.wrapped.onBeforeGetData;
        }
        get onAfterGetData() {
            return this.wrapped.onAfterGetData;
        }
        get onChanged() {
            return this.wrapped.onChanged;
        }
    }
    exports.NeedsSchemaForm = NeedsSchemaForm;
    class Form {
        constructor(form) {
            this.form = form;
            this.baseLevel = undefined;
            this.beforeSetDataEvent = new events.ActionEventDispatcher();
            this.afterSetDataEvent = new events.ActionEventDispatcher();
            this.beforeGetDataEvent = new events.ActionEventDispatcher();
            this.afterGetDataEvent = new events.ActionEventDispatcher();
            this.onChangedEvent = new events.ActionEventDispatcher();
        }
        setError(err) {
            if (this.formValues) {
                this.formValues.setError(err);
            }
        }
        clearError() {
            if (this.formValues) {
                this.formValues.setError(formHelper.getSharedClearingValidator());
            }
        }
        setData(data) {
            this.beforeSetDataEvent.fire({
                data: data,
                source: this
            });
            if (this.formValues) {
                this.formValues.setData(data);
                this.formValues.fireDataChanged();
            }
            else {
                formHelper.populate(this.form, data, this.baseLevel);
            }
            this.afterSetDataEvent.fire({
                data: data,
                source: this
            });
            this.clearError();
        }
        clear() {
            this.clearError();
            if (this.formValues) {
                this.formValues.setData(sharedClearer);
                this.formValues.fireDataChanged();
            }
            else {
                formHelper.populate(this.form, sharedClearer);
            }
        }
        getData() {
            this.beforeGetDataEvent.fire({
                source: this
            });
            var data;
            if (this.formValues) { //If there are form values, use them to read the data.
                data = this.formValues.recoverData(this.proto);
            }
            else { //Otherwise read the form raw
                data = formHelper.serialize(this.form, this.proto, this.baseLevel);
            }
            this.afterGetDataEvent.fire({
                data: data,
                source: this
            });
            for (var key in data) { //This will pass if there is a key in data, ok to also check prototype, if user set it they want it.
                return data;
            }
            return null; //Return null if the data returned has no keys in it, which means it is empty.
        }
        getValue(name) {
            if (this.formValues) {
                var formValue = this.formValues.getFormValue(name);
                if (formValue) {
                    return formValue.getData();
                }
            }
            else {
                //Since there is no formvalues, we must serialize the entire form and return the result.
                var data = formHelper.serialize(this.form, this.proto, this.baseLevel);
                return data[name];
            }
            return undefined;
        }
        setPrototype(proto) {
            this.proto = proto;
        }
        setSchema(schema, componentName) {
            if (componentName === undefined) {
                componentName = this.form.getAttribute("data-hr-form-component");
                if (componentName === null) {
                    componentName = "hr.forms.default";
                }
            }
            this.clear();
            if (this.formValues) {
                this.formValues.changeSchema(componentName, schema, this.form);
            }
            else {
                this.formValues = formHelper.buildForm(componentName, schema, this.form);
                this.baseLevel = "";
                this.formValues.onChanged.add(a => this.onChangedEvent.fire({ source: this, propertyName: a.propertyName }));
            }
            this.formValues.fireDataChanged();
        }
        get onBeforeSetData() {
            return this.beforeSetDataEvent.modifier;
        }
        get onAfterSetData() {
            return this.afterSetDataEvent.modifier;
        }
        get onBeforeGetData() {
            return this.beforeGetDataEvent.modifier;
        }
        get onAfterGetData() {
            return this.afterGetDataEvent.modifier;
        }
        get onChanged() {
            return this.onChangedEvent.modifier;
        }
    }
    class NullForm {
        constructor() {
            this.beforeSetDataEvent = new events.ActionEventDispatcher();
            this.afterSetDataEvent = new events.ActionEventDispatcher();
            this.beforeGetDataEvent = new events.ActionEventDispatcher();
            this.afterGetDataEvent = new events.ActionEventDispatcher();
            this.onChangedEvent = new events.ActionEventDispatcher();
        }
        setError(err) {
        }
        clearError() {
        }
        setData(data) {
        }
        getValue(name) {
            return undefined;
        }
        clear() {
        }
        getData() {
            return null;
        }
        setPrototype(proto) {
        }
        setSchema(schema, componentName) {
        }
        get onBeforeSetData() {
            return this.beforeSetDataEvent.modifier;
        }
        get onAfterSetData() {
            return this.afterSetDataEvent.modifier;
        }
        get onBeforeGetData() {
            return this.beforeGetDataEvent.modifier;
        }
        get onAfterGetData() {
            return this.afterGetDataEvent.modifier;
        }
        get onChanged() {
            return this.onChangedEvent.modifier;
        }
    }
    /**
     * Create a new form element.
     * @param element
     */
    function build(element) {
        if (formHelper.IsFormElement(element)) {
            return new Form(element);
        }
        return new NullForm();
    }
    exports.build = build;
    function sharedClearer(i) {
        return "";
    }
});
define("hr.escape", ["require","exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.escape = void 0;
    /**
     * Escape text to prevent html characters from being output. Helps prevent xss, called automatically
     * by formatText, if it is configured to escape. If you manually write user data consider using this
     * function to escape it, but it is not needed using other HtmlRapier functions like repeat, createComponent
     * or formatText. This escape function should be good enough to write html including attributes with ", ', ` or no quotes
     * but probably not good enough for css or javascript. Since separating these is the major goal of this library writing
     * out javascript or html with this method will not be supported and could be unsafe.
     *
     * TL, DR: Only for HTML, not javascript or css, escapes &, <, >, ", ', `, , !, @, $, %, (, ), =, +, {, }, [, and ]
     * @param {string} text - the text to escape.
     * @returns {type} - The escaped version of text.
     */
    function escape(text) {
        text = String(text);
        var status = {
            textStart: 0,
            bracketStart: 0,
            output: ""
        };
        for (var i = 0; i < text.length; ++i) {
            switch (text[i]) {
                case '&':
                    outputEncoded(i, text, status, '&amp;');
                    break;
                case '<':
                    outputEncoded(i, text, status, '&lt;');
                    break;
                case '>':
                    outputEncoded(i, text, status, '&gt;');
                    break;
                case '"':
                    outputEncoded(i, text, status, '&quot;');
                    break;
                case '\'':
                    outputEncoded(i, text, status, '&#39;');
                    break;
                case '`':
                    outputEncoded(i, text, status, '&#96;');
                    break;
                case ' ':
                    outputEncoded(i, text, status, '&#32;');
                    break;
                case '!':
                    outputEncoded(i, text, status, '&#33;');
                    break;
                case '@':
                    outputEncoded(i, text, status, '&#64;');
                    break;
                case '$':
                    outputEncoded(i, text, status, '&#36;');
                    break;
                case '%':
                    outputEncoded(i, text, status, '&#37;');
                    break;
                case '(':
                    outputEncoded(i, text, status, '&#40;');
                    break;
                case ')':
                    outputEncoded(i, text, status, '&#41;');
                    break;
                case '=':
                    outputEncoded(i, text, status, '&#61;');
                    break;
                case '+':
                    outputEncoded(i, text, status, '&#43;');
                    break;
                case '{':
                    outputEncoded(i, text, status, '&#123;');
                    break;
                case '}':
                    outputEncoded(i, text, status, '&#125;');
                    break;
                case '[':
                    outputEncoded(i, text, status, '&#91;');
                    break;
                case ']':
                    outputEncoded(i, text, status, '&#93;');
                    break;
                default:
                    break;
            }
        }
        if (status.textStart < text.length) {
            status.output += text.substring(status.textStart, text.length);
        }
        return status.output;
    }
    exports.escape = escape;
    //Helper function for escaping
    function outputEncoded(i, text, status, replacement) {
        status.bracketStart = i;
        status.output += text.substring(status.textStart, status.bracketStart) + replacement;
        status.textStart = i + 1;
    }
});
define("hr.jsep", ["require","exports"], function (require, exports) {
    'use strict';
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.parse = void 0;
    // Node Types
    // ----------
    // This is the full set of types that any JSEP node can be.
    // Store them here to save space when minified
    const COMPOUND = 'Compound';
    const IDENTIFIER = 'Identifier';
    const MEMBER_EXP = 'MemberExpression';
    const LITERAL = 'Literal';
    const THIS_EXP = 'ThisExpression';
    const CALL_EXP = 'CallExpression';
    const UNARY_EXP = 'UnaryExpression';
    const BINARY_EXP = 'BinaryExpression';
    const LOGICAL_EXP = 'LogicalExpression';
    const CONDITIONAL_EXP = 'ConditionalExpression';
    const ARRAY_EXP = 'ArrayExpression';
    const PERIOD_CODE = 46; // '.'
    const COMMA_CODE = 44; // ','
    const SQUOTE_CODE = 39; // single quote
    const DQUOTE_CODE = 34; // double quotes
    const OPAREN_CODE = 40; // (
    const CPAREN_CODE = 41; // )
    const OBRACK_CODE = 91; // [
    const CBRACK_CODE = 93; // ]
    const QUMARK_CODE = 63; // ?
    const SEMCOL_CODE = 59; // ;
    const COLON_CODE = 58; // :
    function throwError(message, index) {
        var error = new Error(message + ' at character ' + index);
        error.index = index;
        error.description = message;
        throw error;
    }
    ;
    // Operations
    // ----------
    var unary_ops = { '-': true, '!': true, '~': true, '+': true };
    // Also use a map for the binary operations but set their values to their
    // binary precedence for quick reference:
    // see [Order of operations](http://en.wikipedia.org/wiki/Order_of_operations#Programming_language)
    var binary_ops = {
        '||': 1, '&&': 2, '|': 3, '^': 4, '&': 5,
        '==': 6, '!=': 6, '===': 6, '!==': 6,
        '<': 7, '>': 7, '<=': 7, '>=': 7,
        '<<': 8, '>>': 8, '>>>': 8,
        '+': 9, '-': 9,
        '*': 10, '/': 10, '%': 10
    };
    // Get return the longest key length of any object
    function getMaxKeyLen(obj) {
        var max_len = 0, len;
        for (var key in obj) {
            if ((len = key.length) > max_len && obj.hasOwnProperty(key)) {
                max_len = len;
            }
        }
        return max_len;
    }
    ;
    var max_unop_len = getMaxKeyLen(unary_ops);
    var max_binop_len = getMaxKeyLen(binary_ops);
    // Literals
    // ----------
    // Store the values to return for the various literals we may encounter
    var literals = {
        'true': true,
        'false': false,
        'null': null
    };
    // Except for `this`, which is special. This could be changed to something like `'self'` as well
    var this_str = 'this';
    // Returns the precedence of a binary operator or `0` if it isn't a binary operator
    function binaryPrecedence(op_val) {
        return binary_ops[op_val] || 0;
    }
    ;
    // Utility function (gets called from multiple places)
    // Also note that `a && b` and `a || b` are *logical* expressions, not binary expressions
    function createBinaryExpression(operator, left, right) {
        var type = (operator === '||' || operator === '&&') ? LOGICAL_EXP : BINARY_EXP;
        return {
            type: type,
            operator: operator,
            left: left,
            right: right
        };
    }
    ;
    // `ch` is a character code in the next three functions
    function isDecimalDigit(ch) {
        return (ch >= 48 && ch <= 57); // 0...9
    }
    ;
    function isIdentifierStart(ch) {
        return (ch === 36) || (ch === 95) || // `$` and `_`
            (ch >= 65 && ch <= 90) || // A...Z
            (ch >= 97 && ch <= 122) || // a...z
            (ch >= 128 && !binary_ops[String.fromCharCode(ch)]); // any non-ASCII that is not an operator
    }
    ;
    function isIdentifierPart(ch) {
        return (ch === 36) || (ch === 95) || // `$` and `_`
            (ch >= 65 && ch <= 90) || // A...Z
            (ch >= 97 && ch <= 122) || // a...z
            (ch >= 48 && ch <= 57) || // 0...9
            (ch >= 128 && !binary_ops[String.fromCharCode(ch)]); // any non-ASCII that is not an operator
    }
    ;
    /**
     * Parse
     * @param expr a string with the passed in expression
     */
    function parse(expr) {
        // `index` stores the character number we are currently at while `length` is a constant
        // All of the gobbles below will modify `index` as we move along
        var index = 0, charAtFunc = expr.charAt, charCodeAtFunc = expr.charCodeAt, exprI = function (i) { return charAtFunc.call(expr, i); }, exprICode = function (i) { return charCodeAtFunc.call(expr, i); }, length = expr.length, 
        // Push `index` up to the next non-space character
        gobbleSpaces = function () {
            var ch = exprICode(index);
            // space or tab
            while (ch === 32 || ch === 9 || ch === 10 || ch === 13) {
                ch = exprICode(++index);
            }
        }, 
        // The main parsing function. Much of this code is dedicated to ternary expressions
        gobbleExpression = function () {
            var test = gobbleBinaryExpression(), consequent, alternate;
            gobbleSpaces();
            if (exprICode(index) === QUMARK_CODE) {
                // Ternary expression: test ? consequent : alternate
                index++;
                consequent = gobbleExpression();
                if (!consequent) {
                    throwError('Expected expression', index);
                }
                gobbleSpaces();
                if (exprICode(index) === COLON_CODE) {
                    index++;
                    alternate = gobbleExpression();
                    if (!alternate) {
                        throwError('Expected expression', index);
                    }
                    return {
                        type: CONDITIONAL_EXP,
                        test: test,
                        consequent: consequent,
                        alternate: alternate
                    };
                }
                else {
                    throwError('Expected :', index);
                }
            }
            else {
                return test;
            }
        }, 
        // Search for the operation portion of the string (e.g. `+`, `===`)
        // Start by taking the longest possible binary operations (3 characters: `===`, `!==`, `>>>`)
        // and move down from 3 to 2 to 1 character until a matching binary operation is found
        // then, return that binary operation
        gobbleBinaryOp = function () {
            gobbleSpaces();
            var biop, to_check = expr.substr(index, max_binop_len), tc_len = to_check.length;
            while (tc_len > 0) {
                // Don't accept a binary op when it is an identifier.
                // Binary ops that start with a identifier-valid character must be followed
                // by a non identifier-part valid character
                if (binary_ops.hasOwnProperty(to_check) && (!isIdentifierStart(exprICode(index)) ||
                    (index + to_check.length < expr.length && !isIdentifierPart(exprICode(index + to_check.length))))) {
                    index += tc_len;
                    return to_check;
                }
                to_check = to_check.substr(0, --tc_len);
            }
            return false;
        }, 
        // This function is responsible for gobbling an individual expression,
        // e.g. `1`, `1+2`, `a+(b*2)-Math.sqrt(2)`
        gobbleBinaryExpression = function () {
            var ch_i, node, biop, prec, stack, biop_info, left, right, i, cur_biop;
            // First, try to get the leftmost thing
            // Then, check to see if there's a binary operator operating on that leftmost thing
            left = gobbleToken();
            biop = gobbleBinaryOp();
            // If there wasn't a binary operator, just return the leftmost node
            if (!biop) {
                return left;
            }
            // Otherwise, we need to start a stack to properly place the binary operations in their
            // precedence structure
            biop_info = { value: biop, prec: binaryPrecedence(biop) };
            right = gobbleToken();
            if (!right) {
                throwError("Expected expression after " + biop, index);
            }
            stack = [left, biop_info, right];
            // Properly deal with precedence using [recursive descent](http://www.engr.mun.ca/~theo/Misc/exp_parsing.htm)
            while ((biop = gobbleBinaryOp())) {
                prec = binaryPrecedence(biop);
                if (prec === 0) {
                    break;
                }
                biop_info = { value: biop, prec: prec };
                cur_biop = biop;
                // Reduce: make a binary expression from the three topmost entries.
                while ((stack.length > 2) && (prec <= stack[stack.length - 2].prec)) {
                    right = stack.pop();
                    biop = stack.pop().value;
                    left = stack.pop();
                    node = createBinaryExpression(biop, left, right);
                    stack.push(node);
                }
                node = gobbleToken();
                if (!node) {
                    throwError("Expected expression after " + cur_biop, index);
                }
                stack.push(biop_info, node);
            }
            i = stack.length - 1;
            node = stack[i];
            while (i > 1) {
                node = createBinaryExpression(stack[i - 1].value, stack[i - 2], node);
                i -= 2;
            }
            return node;
        }, 
        // An individual part of a binary expression:
        // e.g. `foo.bar(baz)`, `1`, `"abc"`, `(a % 2)` (because it's in parenthesis)
        gobbleToken = function () {
            var ch, to_check, tc_len;
            gobbleSpaces();
            ch = exprICode(index);
            if (isDecimalDigit(ch) || ch === PERIOD_CODE) {
                // Char code 46 is a dot `.` which can start off a numeric literal
                return gobbleNumericLiteral();
            }
            else if (ch === SQUOTE_CODE || ch === DQUOTE_CODE) {
                // Single or double quotes
                return gobbleStringLiteral();
            }
            else if (ch === OBRACK_CODE) {
                return gobbleArray();
            }
            else {
                to_check = expr.substr(index, max_unop_len);
                tc_len = to_check.length;
                while (tc_len > 0) {
                    // Don't accept an unary op when it is an identifier.
                    // Unary ops that start with a identifier-valid character must be followed
                    // by a non identifier-part valid character
                    if (unary_ops.hasOwnProperty(to_check) && (!isIdentifierStart(exprICode(index)) ||
                        (index + to_check.length < expr.length && !isIdentifierPart(exprICode(index + to_check.length))))) {
                        index += tc_len;
                        return {
                            type: UNARY_EXP,
                            operator: to_check,
                            argument: gobbleToken(),
                            prefix: true
                        };
                    }
                    to_check = to_check.substr(0, --tc_len);
                }
                if (isIdentifierStart(ch) || ch === OPAREN_CODE) { // open parenthesis
                    // `foo`, `bar.baz`
                    return gobbleVariable();
                }
            }
            return false;
        }, 
        // Parse simple numeric literals: `12`, `3.4`, `.5`. Do this by using a string to
        // keep track of everything in the numeric literal and then calling `parseFloat` on that string
        gobbleNumericLiteral = function () {
            var number = '', ch, chCode;
            while (isDecimalDigit(exprICode(index))) {
                number += exprI(index++);
            }
            if (exprICode(index) === PERIOD_CODE) { // can start with a decimal marker
                number += exprI(index++);
                while (isDecimalDigit(exprICode(index))) {
                    number += exprI(index++);
                }
            }
            ch = exprI(index);
            if (ch === 'e' || ch === 'E') { // exponent marker
                number += exprI(index++);
                ch = exprI(index);
                if (ch === '+' || ch === '-') { // exponent sign
                    number += exprI(index++);
                }
                while (isDecimalDigit(exprICode(index))) { //exponent itself
                    number += exprI(index++);
                }
                if (!isDecimalDigit(exprICode(index - 1))) {
                    throwError('Expected exponent (' + number + exprI(index) + ')', index);
                }
            }
            chCode = exprICode(index);
            // Check to make sure this isn't a variable name that start with a number (123abc)
            if (isIdentifierStart(chCode)) {
                throwError('Variable names cannot start with a number (' +
                    number + exprI(index) + ')', index);
            }
            else if (chCode === PERIOD_CODE) {
                throwError('Unexpected period', index);
            }
            return {
                type: LITERAL,
                value: parseFloat(number),
                raw: number
            };
        }, 
        // Parses a string literal, staring with single or double quotes with basic support for escape codes
        // e.g. `"hello world"`, `'this is\nJSEP'`
        gobbleStringLiteral = function () {
            var str = '', quote = exprI(index++), closed = false, ch;
            while (index < length) {
                ch = exprI(index++);
                if (ch === quote) {
                    closed = true;
                    break;
                }
                else if (ch === '\\') {
                    // Check for all of the common escape codes
                    ch = exprI(index++);
                    switch (ch) {
                        case 'n':
                            str += '\n';
                            break;
                        case 'r':
                            str += '\r';
                            break;
                        case 't':
                            str += '\t';
                            break;
                        case 'b':
                            str += '\b';
                            break;
                        case 'f':
                            str += '\f';
                            break;
                        case 'v':
                            str += '\x0B';
                            break;
                        default: str += ch;
                    }
                }
                else {
                    str += ch;
                }
            }
            if (!closed) {
                throwError('Unclosed quote after "' + str + '"', index);
            }
            return {
                type: LITERAL,
                value: str,
                raw: quote + str + quote
            };
        }, 
        // Gobbles only identifiers
        // e.g.: `foo`, `_value`, `$x1`
        // Also, this function checks if that identifier is a literal:
        // (e.g. `true`, `false`, `null`) or `this`
        gobbleIdentifier = function () {
            var ch = exprICode(index), start = index, identifier;
            if (isIdentifierStart(ch)) {
                index++;
            }
            else {
                throwError('Unexpected ' + exprI(index), index);
            }
            while (index < length) {
                ch = exprICode(index);
                if (isIdentifierPart(ch)) {
                    index++;
                }
                else {
                    break;
                }
            }
            identifier = expr.slice(start, index);
            if (literals.hasOwnProperty(identifier)) {
                return {
                    type: LITERAL,
                    value: literals[identifier],
                    raw: identifier
                };
            }
            else if (identifier === this_str) {
                return { type: THIS_EXP };
            }
            else {
                return {
                    type: IDENTIFIER,
                    name: identifier
                };
            }
        }, 
        // Gobbles a list of arguments within the context of a function call
        // or array literal. This function also assumes that the opening character
        // `(` or `[` has already been gobbled, and gobbles expressions and commas
        // until the terminator character `)` or `]` is encountered.
        // e.g. `foo(bar, baz)`, `my_func()`, or `[bar, baz]`
        gobbleArguments = function (termination) {
            var ch_i, args = [], node, closed = false;
            while (index < length) {
                gobbleSpaces();
                ch_i = exprICode(index);
                if (ch_i === termination) { // done parsing
                    closed = true;
                    index++;
                    break;
                }
                else if (ch_i === COMMA_CODE) { // between expressions
                    index++;
                }
                else {
                    node = gobbleExpression();
                    if (!node || node.type === COMPOUND) {
                        throwError('Expected comma', index);
                    }
                    args.push(node);
                }
            }
            if (!closed) {
                throwError('Expected ' + String.fromCharCode(termination), index);
            }
            return args;
        }, 
        // Gobble a non-literal variable name. This variable name may include properties
        // e.g. `foo`, `bar.baz`, `foo['bar'].baz`
        // It also gobbles function calls:
        // e.g. `Math.acos(obj.angle)`
        gobbleVariable = function () {
            var ch_i, node;
            ch_i = exprICode(index);
            if (ch_i === OPAREN_CODE) {
                node = gobbleGroup();
            }
            else {
                node = gobbleIdentifier();
            }
            gobbleSpaces();
            ch_i = exprICode(index);
            while (ch_i === PERIOD_CODE || ch_i === OBRACK_CODE || ch_i === OPAREN_CODE) {
                index++;
                if (ch_i === PERIOD_CODE) {
                    gobbleSpaces();
                    node = {
                        type: MEMBER_EXP,
                        computed: false,
                        object: node,
                        property: gobbleIdentifier()
                    };
                }
                else if (ch_i === OBRACK_CODE) {
                    node = {
                        type: MEMBER_EXP,
                        computed: true,
                        object: node,
                        property: gobbleExpression()
                    };
                    gobbleSpaces();
                    ch_i = exprICode(index);
                    if (ch_i !== CBRACK_CODE) {
                        throwError('Unclosed [', index);
                    }
                    index++;
                }
                else if (ch_i === OPAREN_CODE) {
                    // A function call is being made; gobble all the arguments
                    node = {
                        type: CALL_EXP,
                        'arguments': gobbleArguments(CPAREN_CODE),
                        callee: node
                    };
                }
                gobbleSpaces();
                ch_i = exprICode(index);
            }
            return node;
        }, 
        // Responsible for parsing a group of things within parentheses `()`
        // This function assumes that it needs to gobble the opening parenthesis
        // and then tries to gobble everything within that parenthesis, assuming
        // that the next thing it should see is the close parenthesis. If not,
        // then the expression probably doesn't have a `)`
        gobbleGroup = function () {
            index++;
            var node = gobbleExpression();
            gobbleSpaces();
            if (exprICode(index) === CPAREN_CODE) {
                index++;
                return node;
            }
            else {
                throwError('Unclosed (', index);
            }
        }, 
        // Responsible for parsing Array literals `[1, 2, 3]`
        // This function assumes that it needs to gobble the opening bracket
        // and then tries to gobble the expressions as arguments.
        gobbleArray = function () {
            index++;
            return {
                type: ARRAY_EXP,
                elements: gobbleArguments(CBRACK_CODE)
            };
        }, nodes = [], ch_i, node;
        while (index < length) {
            ch_i = exprICode(index);
            // Expressions can be separated by semicolons, commas, or just inferred without any
            // separators
            if (ch_i === SEMCOL_CODE || ch_i === COMMA_CODE) {
                index++; // ignore separators
            }
            else {
                // Try to gobble each expression individually
                if ((node = gobbleExpression())) {
                    nodes.push(node);
                    // If we weren't able to find a binary expression and are out of room, then
                    // the expression passed in probably has too much
                }
                else if (index < length) {
                    throwError('Unexpected "' + exprI(index) + '"', index);
                }
            }
        }
        // If there's only one expression just try returning the expression
        if (nodes.length === 1) {
            return nodes[0];
        }
        else {
            return {
                type: COMPOUND,
                body: nodes
            };
        }
    }
    exports.parse = parse;
    ;
});
define("hr.expressiontree", ["require","exports","hr.jsep","hr.typeidentifiers"], function (require, exports, jsep, typeId) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.createFromParsed = exports.create = exports.ExpressionTree = exports.DataAddress = exports.getAddressStringNoIndicies = exports.getAddressString = exports.AddressNodeType = exports.OperationType = void 0;
    var OperationType;
    (function (OperationType) {
        OperationType[OperationType["And"] = "And"] = "And";
        OperationType[OperationType["Or"] = "Or"] = "Or";
        OperationType[OperationType["Not"] = "Not"] = "Not";
        OperationType[OperationType["Equal"] = "Equal"] = "Equal";
        OperationType[OperationType["NotEqual"] = "NotEqual"] = "NotEqual";
        OperationType[OperationType["GreaterThan"] = "GreaterThan"] = "GreaterThan";
        OperationType[OperationType["LessThan"] = "LessThan"] = "LessThan";
        OperationType[OperationType["GreaterThanOrEqual"] = "GreaterThanOrEqual"] = "GreaterThanOrEqual";
        OperationType[OperationType["LessThanOrEqual"] = "LessThanOrEqual"] = "LessThanOrEqual";
    })(OperationType = exports.OperationType || (exports.OperationType = {}));
    var AddressNodeType;
    (function (AddressNodeType) {
        AddressNodeType[AddressNodeType["Object"] = 0] = "Object";
        AddressNodeType[AddressNodeType["Array"] = 1] = "Array";
    })(AddressNodeType = exports.AddressNodeType || (exports.AddressNodeType = {}));
    /**
     * Get the address as a string. Array indicies will be included, so foo.bar[5] will returned for an address with object: foo, object: bar array: 5.
     * @param address
     */
    function getAddressString(address) {
        var sep = "";
        var name = "";
        for (var i = 0; i < address.length; ++i) {
            var node = address[i];
            switch (node.type) {
                case AddressNodeType.Object:
                    name += sep + address[i].key;
                    break;
                case AddressNodeType.Array:
                    name += '[' + address[i].key + ']';
                    break;
            }
            sep = ".";
        }
        return name;
    }
    exports.getAddressString = getAddressString;
    /**
     * Get an address string, but do not include any indicies in arrays, so foo[4] is returned as foo[].
     * This is better if you want to use addresses to lookup cached properties.
     * @param address
     */
    function getAddressStringNoIndicies(address) {
        var sep = "";
        var name = "";
        for (var i = 0; i < address.length; ++i) {
            var node = address[i];
            switch (node.type) {
                case AddressNodeType.Object:
                    name += sep + address[i].key;
                    break;
                case AddressNodeType.Array:
                    name += '[]';
                    break;
            }
            sep = ".";
        }
        return name;
    }
    exports.getAddressStringNoIndicies = getAddressStringNoIndicies;
    class DataAddress {
        constructor(address) {
            this.address = address;
            //Remove any this from the address
            if (address.length > 0 && address[0].key === "this") {
                address.splice(0, 1);
            }
        }
        read(data) {
            if (DataAddress.isAddressStackLookup(data)) {
                return data({
                    parent: null,
                    data: data,
                    address: this
                });
            }
            else {
                return this.readAddress(data, 0);
            }
        }
        isInScope(scope) {
            return this.address.length > 0 && this.address[0].key === scope;
        }
        /**
         * Read scoped data, this will skip the first item of the address and will read the reminaing data out
         * of the passed in data. This makes it easy read data that another address looked up in scoped addresses.
         * @param data
         */
        readScoped(data) {
            if (DataAddress.isAddressStackLookup(data)) {
                throw new Error("Cannot read scoped data from AddressStackLookups");
            }
            return this.readAddress(data, 1);
        }
        readAddress(value, startNode) {
            for (var i = startNode; i < this.address.length && value !== undefined; ++i) {
                var item = this.address[i];
                //Arrays and objects can be read this way, which is all there is right now.
                //Functions are only supported on the top level.
                value = value[item.key];
            }
            return value;
        }
        /**
         * Determine if a data item is an addres stack lookup or a generic object. The only test this does is to see
         * if the incoming type is a function, not reliable otherwise, but helps the compiler.
         * @param data
         */
        static isAddressStackLookup(data) {
            if (typeId.isFunction(data)) {
                return true;
            }
            return false;
        }
    }
    exports.DataAddress = DataAddress;
    class ExpressionTree {
        constructor(root) {
            this.root = root;
        }
        /**
         * Get the root node's data address, can be used to lookup data. If this is undefined
         * then there is no data address for this expression tree and it can't be used to directly
         * look up data.
         */
        getDataAddress() {
            return this.root.address || null;
        }
        isTrue(valueSource) {
            return this.evaluate(this.root, valueSource);
        }
        evaluate(node, valueSource) {
            switch (node.operation) {
                case OperationType.And:
                    return this.evaluate(node.left, valueSource) && this.evaluate(node.right, valueSource);
                case OperationType.Or:
                    return this.evaluate(node.left, valueSource) || this.evaluate(node.right, valueSource);
                case OperationType.Equal:
                    var testKey = this.getTestKey(node);
                    return this.equals(valueSource.getValue(testKey), this.getTestValue(node, testKey));
                case OperationType.NotEqual:
                    var testKey = this.getTestKey(node);
                    return !this.equals(valueSource.getValue(testKey), this.getTestValue(node, testKey));
                case OperationType.Not:
                    return !this.evaluate(node.left, valueSource);
                case OperationType.GreaterThan:
                case OperationType.GreaterThanOrEqual:
                case OperationType.LessThan:
                case OperationType.LessThanOrEqual:
                    var testKey = this.getTestKey(node);
                    return this.compare(valueSource.getValue(testKey), this.getTestValue(node, testKey), node.operation);
            }
            return false;
        }
        getTestKey(node) {
            if (node.address !== undefined) {
                return node.address;
            }
            var ret = [];
            ret.push({
                key: Object.keys(node.test)[0],
                type: AddressNodeType.Object
            });
            return new DataAddress(ret);
        }
        getTestValue(node, address) {
            if (node.address !== undefined) {
                return node.test['value'];
            }
            return node.test[address.address[0].key];
        }
        equals(current, test) {
            //Normalize undefined to null, only javascript has the undefined concept and we are consuming generic expressions.
            if (current === undefined) {
                current = null;
            }
            if (current === null) {
                //If current is null, just check it against the test value, there is no need to try to convert test is null or it isn't
                return current === test;
            }
            //This makes sure we are checking current as the same type as test
            switch (typeof (test)) {
                case "boolean":
                    if (typeof (current) === "string" && current.toLowerCase !== undefined) { //The toLowerCase check is for chrome, not good enough to just check the types.
                        //Special type conversion for string
                        //Boolean('false') is true, so this looks for true for real
                        current = current.toLowerCase() === 'true';
                    }
                    return Boolean(current) === test;
                case "number":
                    return Number(current) === test;
                case "object":
                    if (current === undefined || current === null || current === "") {
                        return test === null; //Current is undefined, null or empty string and test is null, consider equivalent
                    }
                case "string":
                    return String(current) === test;
            }
            return false; //No match, or type could not be determined
        }
        compare(current, test, operation) {
            switch (typeof (test)) {
                case "number":
                    var currentAsNum = Number(current);
                    if (!isNaN(currentAsNum)) {
                        switch (operation) {
                            case OperationType.GreaterThan:
                                return currentAsNum > test;
                            case OperationType.GreaterThanOrEqual:
                                return currentAsNum >= test;
                            case OperationType.LessThan:
                                return currentAsNum < test;
                            case OperationType.LessThanOrEqual:
                                return currentAsNum <= test;
                        }
                    }
            }
            return false;
        }
    }
    exports.ExpressionTree = ExpressionTree;
    //Parse jsep trees to our runnable trees
    var opMap = {
        '||': OperationType.Or,
        '&&': OperationType.And,
        //'|'
        //'^'
        //'&'
        '==': OperationType.Equal,
        '!=': OperationType.NotEqual,
        '===': OperationType.Equal,
        '!==': OperationType.NotEqual,
        '<': OperationType.LessThan,
        '>': OperationType.GreaterThan,
        '<=': OperationType.LessThanOrEqual,
        '>=': OperationType.GreaterThanOrEqual,
        //'<<'
        //'>>'
        //'>>>'
        //'+'
        //'-'
        //'*'
        //'/'
        //'%'
        '!': OperationType.Not
    };
    function create(expr) {
        var jsepResult = jsep.parse(expr);
        return new ExpressionTree(setupNode(jsepResult));
    }
    exports.create = create;
    function createFromParsed(parsed) {
        return new ExpressionTree(setupNode(parsed));
    }
    exports.createFromParsed = createFromParsed;
    function setupNode(jsepNode) {
        if (jsepNode === undefined) {
            return undefined;
        }
        var result = {
            operation: undefined,
            left: undefined,
            right: undefined,
            test: undefined
        };
        var address = undefined;
        switch (jsepNode.type) {
            case "LogicalExpression":
                result.operation = opMap[jsepNode.operator];
                result.left = setupNode(jsepNode.left);
                result.right = setupNode(jsepNode.right);
                break;
            case "BinaryExpression":
                var literal = undefined;
                address = getIdentifierAddress(jsepNode.left);
                if (address !== undefined) {
                    if (jsepNode.right.type === "Literal") {
                        literal = jsepNode.right;
                    }
                }
                else {
                    address = getIdentifierAddress(jsepNode.right);
                    if (jsepNode.left.type === "Literal") {
                        literal = jsepNode.left;
                    }
                }
                if (literal === undefined || address === undefined) {
                    throw new Error("Cannot build valid expression from statement.");
                }
                result.operation = opMap[jsepNode.operator];
                result.test = {};
                result.test['value'] = literal.value;
                result.address = address;
                break;
            case "UnaryExpression":
                if (jsepNode.operator !== '!') {
                    throw new Error("Cannot support unary operations that are not not (!).");
                }
                address = getIdentifierAddress(jsepNode.argument);
                if (address === undefined) {
                    throw new Error("Cannot build valid expression from statement.");
                }
                result.operation = OperationType.Not;
                result.left = {
                    operation: OperationType.Equal,
                    left: undefined,
                    right: undefined,
                    test: undefined
                };
                result.left.test = {};
                result.left.test['value'] = true;
                result.left.address = address;
                break;
            case "Identifier":
            case "MemberExpression":
            case "ThisExpression":
                address = getIdentifierAddress(jsepNode);
                if (address === undefined) {
                    throw new Error("Cannot build valid expression from statement.");
                }
                result.operation = OperationType.Equal;
                result.test = {};
                result.test['value'] = true;
                result.address = address;
                break;
        }
        return result;
    }
    function getIdentifierAddress(node) {
        var addrNodes = null;
        switch (node.type) {
            case "ThisExpression":
                addrNodes = [];
                break;
            case "Identifier":
                addrNodes = [{
                        key: node.name,
                        type: AddressNodeType.Object
                    }];
                break;
            case "MemberExpression":
                addrNodes = convertMemberExpressionToAddress(node);
                break;
        }
        if (addrNodes !== null) {
            return new DataAddress(addrNodes);
        }
        return undefined;
    }
    function convertMemberExpressionToAddress(node) {
        switch (node.object.type) {
            case "Identifier":
                var result = [{
                        key: node.object.name,
                        type: AddressNodeType.Object
                    }];
                result.push(readMemberExpressionProperty(node));
                return result;
            case "MemberExpression":
                var result = convertMemberExpressionToAddress(node);
                result.push(readMemberExpressionProperty(node));
                return result;
        }
    }
    function readMemberExpressionProperty(node) {
        var ret = {
            type: AddressNodeType.Object,
            key: undefined
        };
        if (node.computed) {
            ret.type = AddressNodeType.Array;
        }
        switch (node.property.type) {
            case "Literal":
                ret.key = node.property.value;
                break;
            case "Identifier":
                ret.key = node.property.name;
                break;
        }
        return ret;
    }
});
define("hr.iterable", ["require","exports","hr.typeidentifiers"], function (require, exports, typeId) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Iterable = void 0;
    class Query {
        constructor() {
            this.chain = [];
        }
        /**
         * Push an item, queries are derived backward (lifo).
         */
        push(c) {
            this.chain.push(c);
        }
        /**
         * Derive the query lifo order from how they were pushed.
         */
        derive(item) {
            var result = item;
            for (var i = this.chain.length - 1; i >= 0 && result !== undefined; --i) {
                result = this.chain[i](result);
            }
            return result;
        }
    }
    var defaultQuery = new Query(); //Empty query to use as default
    class IterateResult {
        constructor(done, value) {
            this.done = done;
            this.value = value;
        }
    }
    function _iterate(items, query) {
        var i;
        if (typeId.isArray(items)) {
            i = 0;
            return {
                next: function () {
                    var result = undefined;
                    while (result === undefined && i < items.length) {
                        var item = items[i++];
                        result = query.derive(item);
                    }
                    if (result === undefined) {
                        return new IterateResult(true);
                    }
                    else {
                        return new IterateResult(false, result);
                    }
                }
            };
        }
        else if (typeId.isFunction(items)) {
            return {
                next: function () {
                    var result = undefined;
                    while (result === undefined) {
                        var item = items();
                        if (item !== undefined) { //Terminate iterator if fake generator returns undefined
                            result = query.derive(item);
                        }
                        else {
                            break;
                        }
                    }
                    if (result === undefined) {
                        return new IterateResult(true);
                    }
                    else {
                        return new IterateResult(false, result);
                    }
                }
            };
        }
    }
    function _forEach(items, query, cb) {
        var i;
        if (typeId.isArray(items)) {
            for (i = 0; i < items.length; ++i) {
                let item = items[i];
                var transformed = query.derive(item);
                if (transformed !== undefined) {
                    cb(transformed);
                }
            }
        }
        else if (typeId.isFunction(items)) {
            let item = items();
            while (item !== undefined) {
                item = query.derive(item);
                cb(item);
                item = items();
            }
        }
        else if (typeId.isForEachable(items)) {
            items.forEach(item => {
                item = query.derive(item);
                if (item !== undefined) {
                    cb(item);
                }
            });
        }
        else if (typeId.isGenerator(items)) {
            let item = items.next();
            while (!item.done) {
                item = query.derive(item);
                cb(item.value);
                item = items.next();
            }
        }
    }
    class IteratorBase {
        select(s) {
            return new Selector(s, this);
        }
        where(w) {
            return new Conditional(w, this);
        }
        forEach(cb) {
            this.build(new Query()).forEach(cb);
        }
        iterator() {
            return this.build(new Query()).iterator();
        }
    }
    class Selector extends IteratorBase {
        constructor(selectCb, previous) {
            super();
            this.selectCb = selectCb;
            this.previous = previous;
        }
        build(query) {
            query.push(i => this.selectCb(i));
            return this.previous.build(query);
        }
    }
    class Conditional extends IteratorBase {
        constructor(whereCb, previous) {
            super();
            this.whereCb = whereCb;
            this.previous = previous;
        }
        build(query) {
            query.push((i) => this.getItem(i));
            return this.previous.build(query);
        }
        getItem(item) {
            if (this.whereCb(item)) {
                return item;
            }
        }
    }
    class Iterable extends IteratorBase {
        constructor(items) {
            super();
            this.items = items;
        }
        build(query) {
            return new BuiltQuery(this.items, query);
        }
    }
    exports.Iterable = Iterable;
    class BuiltQuery {
        constructor(items, query) {
            this.items = items;
            this.query = query;
        }
        forEach(cb) {
            _forEach(this.items, this.query, cb);
        }
        iterator() {
            return _iterate(this.items, this.query);
        }
    }
});
define("hr.textstream", ["require","exports","hr.escape","hr.expressiontree","hr.jsep","hr.iterable"], function (require, exports, hr_escape_1, exprTree, jsep, hr_iterable_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.TextStream = exports.ScopedFullDataAddress = void 0;
    class NodeScope {
        constructor(parent, scopeName, data, address) {
            this.parent = parent;
            this.scopeName = scopeName;
            this.data = data;
            this.address = address;
            parent = parent || null;
        }
        getRawData(address) {
            if (address.isInScope(this.scopeName) || this.parent === null) {
                return this.data.getRawData(address);
            }
            else {
                return this.parent.getRawData(address);
            }
        }
        getFormatted(data, address) {
            //Get top parent
            var parent = this;
            while (parent.parent !== null) {
                parent = parent.parent;
            }
            return parent.data.getFormatted(data, address);
        }
        getFullAddress(childAddress) {
            var address;
            var first = 0;
            if (this.parent !== null) {
                address = this.parent.getFullAddress(this.address);
                first = 1; //In scopes skip the first variable
            }
            else {
                address = [];
            }
            if (childAddress) {
                var childAddrArray = childAddress.address;
                for (var i = first; i < childAddrArray.length; ++i) {
                    address.push(childAddrArray[i]);
                }
            }
            return address;
        }
        get isTopLevel() {
            return this.parent === null;
        }
    }
    class TextNode {
        constructor(str) {
            this.str = str;
        }
        writeFunction(data) {
            return this.str;
        }
    }
    class ScopedFullDataAddress {
        constructor(scope, varAddress) {
            this.scope = scope;
            this.varAddress = varAddress;
        }
        get address() {
            //Build complete address, slow for now
            var address = this.scope.getFullAddress(this.varAddress);
            return address;
        }
        read(data, startNode) {
            throw new Error("Method not supported.");
        }
        isInScope(scope) {
            throw new Error("Method not supported.");
        }
        readScoped(data) {
            throw new Error("Method not supported.");
        }
    }
    exports.ScopedFullDataAddress = ScopedFullDataAddress;
    class VariableNode {
        constructor(variable) {
            var expressionTree = exprTree.create(variable);
            this.address = expressionTree.getDataAddress();
            if (this.address === null) {
                var message = "Expression \"" + variable + "\" is not a valid variable node expression.";
                console.log(message);
                throw new Error(message);
            }
        }
        writeFunction(data) {
            var lookedUp = data.getRawData(this.address);
            var finalAddress = this.address;
            if (!data.isTopLevel) {
                finalAddress = new ScopedFullDataAddress(data, this.address);
            }
            return data.getFormatted(lookedUp, finalAddress);
        }
    }
    class ReadIfData {
        constructor(data) {
            this.data = data;
        }
        getValue(address) {
            return this.data.getRawData(address);
        }
    }
    class IfNode {
        constructor(condition) {
            this.condition = condition;
            this.streamNodesPass = [];
            this.streamNodesFail = [];
            condition = condition.replace(/&gt;/g, ">");
            condition = condition.replace(/&lt;/g, "<");
            condition = condition.replace(/&amp;/g, "&");
            this.expressionTree = exprTree.create(condition);
        }
        writeFunction(data) {
            if (this.expressionTree.isTrue(new ReadIfData(data))) {
                return format(data, this.streamNodesPass);
            }
            else {
                return format(data, this.streamNodesFail);
            }
        }
        getStreamNodes() {
            return this.streamNodesPass;
        }
        getFailNodes() {
            return this.streamNodesFail;
        }
        checkPopStatement(variable) {
            if (variable.length === 3 && variable[0] === '/' && variable[1] === 'i' && variable[2] === 'f') {
                return;
            }
            if (variable.length === 1 && variable[0] === '/') {
                return;
            }
            if (variable.length > 4 && variable[0] === '/' && variable[1] === 'i' && variable[2] === 'f' && /\s/.test(variable[3])) {
                return;
            }
            if (isElseIf(variable)) {
                return;
            }
            if (isElse(variable)) {
                return;
            }
            var message = "Invalid closing if statement " + variable;
            console.log(message);
            throw new Error(message);
        }
    }
    function isElseIf(variable) {
        return variable.length > 6 && variable[0] === 'e' && variable[1] === 'l' && variable[2] === 's' && variable[3] === 'e' && /\s/.test(variable[4]) && variable[5] === 'i' && variable[6] === 'f' && /\s/.test(variable[7]);
    }
    function isElse(variable) {
        return variable === 'else';
    }
    class ForInNode {
        constructor(condition) {
            this.condition = condition;
            this.streamNodes = [];
            var nodes = jsep.parse(condition);
            if (nodes.type !== "Compound") {
                var message = "Expression \"" + condition + "\" is not a valid for in node expression.";
                console.log(message);
                throw new Error(message);
            }
            if (nodes.body.length !== 4) {
                var message = "Expression \"" + condition + "\" is not a valid for in node expression.";
                console.log(message);
                throw new Error(message);
            }
            this.scopeName = nodes.body[1].name;
            var expressionTree = exprTree.createFromParsed(nodes.body[3]);
            this.address = expressionTree.getDataAddress();
            if (this.address === null) {
                var message = "Expression \"" + condition + "\" is not a valid for in node expression.";
                console.log(message);
                throw new Error(message);
            }
        }
        writeFunction(data) {
            var text = "";
            var iter = new hr_iterable_1.Iterable(data.getRawData(this.address));
            var localScopeName = this.scopeName;
            iter.forEach(item => {
                var itemScope = new NodeScope(data, this.scopeName, {
                    getRawData: a => a.readScoped(item),
                    getFormatted: (d, a) => d //Doesn't really do anything, won't get called
                }, this.address);
                for (var i = 0; i < this.streamNodes.length; ++i) {
                    text += this.streamNodes[i].writeFunction(itemScope);
                }
            });
            return text;
        }
        getStreamNodes() {
            return this.streamNodes;
        }
        checkPopStatement(variable) {
            if (variable.length === 4 && variable[0] === '/' && variable[1] === 'f' && variable[2] === 'o' && variable[3] === 'r') {
                return;
            }
            if (variable.length === 1 && variable[0] === '/') {
                return;
            }
            if (variable.length > 5 && variable[0] === '/' && variable[1] === 'f' && variable[2] === 'o' && variable[3] === 'r' && /\s/.test(variable[4])) {
                return;
            }
            var message = "Invalid closing for statement " + variable;
            console.log(message);
            throw new Error(message);
        }
    }
    class EscapeVariableNode {
        constructor(wrapped) {
            this.wrapped = wrapped;
        }
        writeFunction(data) {
            return hr_escape_1.escape(this.wrapped.writeFunction(data));
        }
    }
    class NoDataStream {
        getFormatted(val, address) {
            return val;
        }
        getRawData(address) {
            return undefined;
        }
    }
    const noData = new NoDataStream();
    function format(data, streamNodes) {
        if (data === null || data === undefined) {
            data = noData;
        }
        var text = "";
        var nodeScope = new NodeScope(null, null, data, null);
        for (var i = 0; i < streamNodes.length; ++i) {
            text += streamNodes[i].writeFunction(nodeScope);
        }
        return text;
    }
    class NodeStackItem {
        constructor(node, allowElseMode) {
            this.node = node;
            this.allowElseMode = allowElseMode;
            this.elseMode = false;
        }
    }
    class StreamNodeTracker {
        constructor(baseStreamNodes) {
            this.baseStreamNodes = baseStreamNodes;
            this.blockNodeStack = [];
        }
        pushIfNode(ifNode) {
            this.blockNodeStack.push(new NodeStackItem(ifNode, true));
        }
        pushBlockNode(blockNode) {
            this.blockNodeStack.push(new NodeStackItem(blockNode, false));
        }
        setElseMode() {
            if (this.blockNodeStack.length === 0) {
                var message = "Attempted to else with no current block.";
                console.log(message);
                throw new Error(message);
            }
            var currentIf = this.getCurrentBlock();
            if (!currentIf.allowElseMode) {
                var message = "Attempted to else when the current block does not support else statements.";
                console.log(message);
                throw new Error(message);
            }
            currentIf.elseMode = true;
        }
        popBlockNode(variable) {
            if (this.blockNodeStack.length === 0) {
                var message = "Popped block node without any block statement present. Is there an extra end block or elseif statement?";
                console.log(message);
                throw new Error(message);
            }
            this.getCurrentBlock().node.checkPopStatement(variable);
            this.blockNodeStack.pop();
        }
        getCurrentStreamNodes() {
            if (this.blockNodeStack.length === 0) {
                return this.baseStreamNodes;
            }
            var block = this.getCurrentBlock();
            if (block.elseMode) {
                return block.node.getFailNodes();
            }
            return block.node.getStreamNodes();
        }
        checkError() {
            if (this.blockNodeStack.length > 0) {
                var message = "Blocks still on stack when stream processed. Did you forget a close block somewhere?";
                console.log(message);
                throw new Error(message);
            }
        }
        getCurrentBlock() {
            return this.blockNodeStack[this.blockNodeStack.length - 1];
        }
    }
    /**
     * Create a text stream that when called with data will output
     * the original string with new data filled out. If the text contains
     * no variables no stream will be created.
     * @param {type} text
     * @returns {type}
     */
    class TextStream {
        constructor(text, options) {
            this.streamNodes = [];
            this.variablesFound = false;
            if (options === undefined) {
                options = {};
            }
            var open = options.open;
            var close = options.close;
            var escape = options.escape;
            //Escape by default.
            if (escape === undefined) {
                escape = true;
            }
            if (open === undefined) {
                open = '{';
            }
            if (close === undefined) {
                close = '}';
            }
            var textStart = 0;
            var bracketStart = 0;
            var bracketEnd = 0;
            var bracketCount = 0;
            var bracketCheck = 0;
            var leadingText;
            var variable;
            var bracketVariable;
            //This holds text we have not created a TextNode for as we parse, this way we can combine output variables with surrounding text for the stream itself
            var skippedTextBuffer = "";
            var streamNodeTracker = new StreamNodeTracker(this.streamNodes);
            for (var i = 0; i < text.length; ++i) {
                if (text[i] == open) {
                    //Count up opening brackets
                    bracketStart = i;
                    bracketCount = 1;
                    while (++i < text.length && text[i] == open) {
                        ++bracketCount;
                    }
                    //Find closing bracket chain, ignore if mismatched
                    bracketCheck = bracketCount;
                    while (++i < text.length) {
                        if ((text[i] == close && --bracketCheck == 0)) {
                            break;
                        }
                    }
                    //If the check got back to 0 we found a variable
                    if (bracketCheck == 0) {
                        leadingText = text.substring(textStart, bracketStart);
                        bracketEnd = i;
                        bracketVariable = text.substring(bracketStart, bracketEnd + 1);
                        switch (bracketCount) {
                            case 1:
                                //1 bracket, add to buffer
                                skippedTextBuffer += leadingText + bracketVariable;
                                break;
                            case 2:
                                let currentBracketStreamNodes = streamNodeTracker.getCurrentStreamNodes();
                                currentBracketStreamNodes.push(new TextNode(skippedTextBuffer + leadingText));
                                skippedTextBuffer = ""; //This is reset every time we actually output something
                                variable = bracketVariable.substring(2, bracketVariable.length - 2);
                                var variableNode = null;
                                //See if this is an if node, if so recurse
                                if (variable.length > 2 && variable[0] === 'i' && variable[1] === 'f' && /\s/.test(variable[2])) {
                                    variableNode = new IfNode(variable.substring(3));
                                    streamNodeTracker.pushIfNode(variableNode);
                                }
                                else if (isElseIf(variable)) {
                                    //Set else mode and get the current stream nodes
                                    streamNodeTracker.setElseMode();
                                    var elseStreamNodes = streamNodeTracker.getCurrentStreamNodes();
                                    let ifNode = new IfNode(variable.substring(7));
                                    elseStreamNodes.push(ifNode);
                                    //Use the new if node as the current top level node in the tracker
                                    streamNodeTracker.popBlockNode(variable);
                                    streamNodeTracker.pushIfNode(ifNode);
                                }
                                else if (isElse(variable)) {
                                    streamNodeTracker.setElseMode();
                                }
                                else if (variable.length > 4 && variable[0] === 'f' && variable[1] === 'o' && variable[2] === 'r' && /\s/.test(variable[3])) {
                                    variableNode = new ForInNode(variable);
                                    streamNodeTracker.pushBlockNode(variableNode);
                                }
                                else if (variable.length > 0 && variable[0] === '/') {
                                    streamNodeTracker.popBlockNode(variable);
                                }
                                //Normal Variable node
                                else {
                                    variableNode = new VariableNode(variable);
                                    //If we are escaping decorate the variable node we created with the escape version.
                                    if (escape) {
                                        variableNode = new EscapeVariableNode(variableNode);
                                    }
                                }
                                if (variableNode !== null) {
                                    currentBracketStreamNodes.push(variableNode);
                                }
                                break;
                            default:
                                //Multiple brackets, escape by removing one and add to buffer
                                skippedTextBuffer += leadingText + bracketVariable.substring(1, bracketVariable.length - 1);
                                break;
                        }
                        textStart = i + 1;
                        this.variablesFound = true;
                    }
                }
            }
            streamNodeTracker.checkError();
            if (textStart < text.length) {
                this.streamNodes.push(new TextNode(skippedTextBuffer + text.substring(textStart, text.length)));
            }
        }
        format(data) {
            return format(data, this.streamNodes);
        }
        foundVariable() {
            return this.variablesFound;
        }
    }
    exports.TextStream = TextStream;
});
define("hr.components", ["require","exports","hr.typeidentifiers","hr.domquery"], function (require, exports, typeId, domquery) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.empty = exports.many = exports.one = exports.getComponent = exports.isDefined = exports.register = void 0;
    var factory = {};
    /**
     * Register a function with the component system.
     * @param name - The name of the component
     * @param createFunc - The function that creates the new component.
     */
    function register(name, builder) {
        factory[name] = builder;
    }
    exports.register = register;
    function isDefined(name) {
        return factory[name] !== undefined;
    }
    exports.isDefined = isDefined;
    function getComponent(name) {
        return factory[name];
    }
    exports.getComponent = getComponent;
    /**
     * Get the default vaule if variant is undefined.
     * @returns variant default value (null)
     */
    function getDefaultVariant(item) {
        return null;
    }
    /**
     * Create a single component.
     */
    function one(name, data, parentComponent, insertBeforeSibling, createdCallback, variantFinder) {
        var variant;
        if (variantFinder === undefined) {
            variantFinder = getDefaultVariant(data);
        }
        else if (typeId.isFunction(variantFinder)) {
            variant = variantFinder(data);
        }
        return doCreateComponent(name, data, parentComponent, insertBeforeSibling, variant, createdCallback);
    }
    exports.one = one;
    /**
     * Create a component for each element in data using that element as the data for the component.
     * @param {string} name - The name of the component to create.
     * @param {HTMLElement} parentComponent - The html element to attach the component to.
     * @param {array|object} data - The data to repeat and bind, must be an array or object with a forEach method to be iterated.
     * If it is a function return the data and then return null to stop iteration.
     * @param {exports.createComponent~callback} createdCallback
     */
    function many(name, data, parentComponent, insertBeforeSibling, createdCallback, variantFinder) {
        if (variantFinder === undefined) {
            variantFinder = getDefaultVariant;
        }
        //Look for an insertion point
        var insertBefore = parentComponent.firstElementChild;
        var variant;
        while (insertBefore != null && !insertBefore.hasAttribute('data-hr-insert')) {
            insertBefore = insertBefore.nextElementSibling;
        }
        var fragmentParent = document.createDocumentFragment();
        //Output
        if (typeId.isArray(data)) {
            //An array, read it as fast as possible
            var arrData = data;
            for (var i = 0; i < arrData.length; ++i) {
                variant = variantFinder(arrData[i]);
                doCreateComponent(name, arrData[i], fragmentParent, null, variant, createdCallback);
            }
        }
        else if (typeId.isForEachable(data)) {
            //Data supports a 'foreach' method, use this to iterate it
            data.forEach(function (item) {
                variant = variantFinder(item);
                doCreateComponent(name, item, fragmentParent, null, variant, createdCallback);
            });
        }
        parentComponent.insertBefore(fragmentParent, insertBefore);
    }
    exports.many = many;
    /**
     * Remove all children from an html element
     */
    function empty(parentComponent) {
        var parent = domquery.first(parentComponent);
        var currentNode = parent.firstChild;
        var nextNode = null;
        //Walk the nodes and remove any non keepers
        while (currentNode != null) {
            nextNode = currentNode.nextSibling;
            if (currentNode.nodeType !== 1 || !(currentNode instanceof HTMLElement && currentNode.hasAttribute('data-hr-keep'))) {
                parent.removeChild(currentNode);
            }
            currentNode = nextNode;
        }
    }
    exports.empty = empty;
    function doCreateComponent(name, data, parentComponent, insertBeforeSibling, variant, createdCallback) {
        parentComponent = domquery.first(parentComponent);
        if (factory.hasOwnProperty(name)) {
            var created = factory[name].create(data, parentComponent, insertBeforeSibling, variant);
            if (createdCallback !== undefined && createdCallback !== null) {
                createdCallback(created, data);
            }
            return created;
        }
        else {
            console.log("Failed to create component '" + name + "', cannot find factory, did you forget to define it on the page?");
        }
    }
});
define("hr.schema", ["require","exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.getOneOfSchema = exports.resolveRef = exports.isRefNode = void 0;
    function isRefNode(test) {
        return test.$ref !== undefined;
    }
    exports.isRefNode = isRefNode;
    /**
     * Find the ref and return it for node if it exists.
     * @param node The node to expand
     */
    function resolveRef(node, schema) {
        if (node.$ref !== undefined) {
            var walker = schema;
            var refs = node.$ref.split('/');
            for (var i = 1; i < refs.length; ++i) {
                walker = walker[refs[i]];
                if (walker === undefined) {
                    if (schema.parent) {
                        return resolveRef(node, schema.parent);
                    }
                    throw new Error("Cannot find ref '" + node.$ref + "' in schema.");
                }
            }
            return walker;
        }
        return node;
    }
    exports.resolveRef = resolveRef;
    function getOneOfSchema(prop, schema) {
        //Look for oneof property with ref
        if (!Array.isArray(prop.oneOf)) {
            throw new Error("Cannot find a oneOf array on the passed in property.");
        }
        for (var j = 0; j < prop.oneOf.length; ++j) {
            var item = prop.oneOf[j];
            if (isRefNode(item)) {
                return resolveRef(item, schema);
            }
        }
        throw new Error("Cannot find OneOf node with $ref element.");
    }
    exports.getOneOfSchema = getOneOfSchema;
});
define("node_modules/htmlrapier/src/schemaprocessor", ["require","exports","hr.schema","hr.expressiontree"], function (require, exports, hr_schema_1, expression) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.processProperty = void 0;
    function processProperty(prop, schema, uniqueId, name, buildName) {
        //Assign the xUi type to the x-ui-type for the prop, since that is what we expect to process.
        if (prop.xUi && prop.xUi.type) {
            prop["x-ui-type"] = prop.xUi.type;
        }
        var processed = Object.create(prop);
        processed.uniqueId = uniqueId;
        processed.buildName = buildName;
        processed.name = name;
        if (processed.title === undefined) { //Set title if it is not set
            processed.title = name;
        }
        if (prop["x-ui-order"] !== undefined) {
            processed.buildOrder = prop["x-ui-order"];
        }
        else {
            processed.buildOrder = Number.MAX_VALUE;
        }
        if (prop["x-display-if"] !== undefined) {
            processed.displayExpression = new expression.ExpressionTree(prop["x-display-if"]);
        }
        //Set this build type to what has been passed in, this will be processed further below
        processed.buildType = getBuildType(prop).toLowerCase();
        //Look for collections, anything defined as an array or that has x-values defined
        if (processed.buildType === 'array') {
            //In an array we might have items with values defined, so look for that
            var valuesProp = prop;
            if (valuesProp.items && valuesProp.items.$ref) {
                valuesProp = valuesProp.items;
            }
            extractPropValues(valuesProp, processed, schema, prop);
            if (processed.buildValues !== undefined || processed["x-lazy-load-values"] === true) {
                //Only supports checkbox and multiselect ui types. Checkboxes have to be requested.
                if (prop["x-ui-type"] === "checkbox") {
                    processed.buildType = "multicheckbox";
                }
                else {
                    processed.buildType = "multiselect";
                    if (processed.buildValues !== undefined) {
                        processed.size = processed.buildValues.length;
                        if (processed.size > 15) {
                            processed.size = 15;
                        }
                    }
                }
            }
            else {
                //Array of complex objects, since values are not provided
                processed.buildType = "arrayEditor";
            }
        }
        else {
            extractPropValues(prop, processed, schema, prop);
            if (prop["x-ui-type"] !== undefined) {
                processed.buildType = prop["x-ui-type"];
            }
            else if (prop["x-search"] !== undefined) {
                processed.buildType = "search";
            }
            else {
                if (processed.buildValues !== undefined || processed["x-lazy-load-values"] === true) {
                    //Has build options, force to select unless the user chose something else.
                    processed.buildType = "select";
                }
                else {
                    //Regular type, no options, derive html type
                    switch (processed.buildType) {
                        case 'integer':
                            processed.buildType = 'number';
                            break;
                        case 'boolean':
                            processed.buildType = 'checkbox';
                            break;
                        case 'string':
                            switch (processed.format) {
                                case 'date-time':
                                    processed.buildType = 'date-time';
                                    break;
                                default:
                                    processed.buildType = 'text';
                                    break;
                            }
                            break;
                        case 'object':
                            processed.buildType = "objectEditor";
                            break;
                    }
                }
            }
            //Post process elements that might have more special properties
            //Do this here, since we don't really know how we got to this build type
            switch (processed.buildType) {
                case 'checkbox':
                    processed.buildValue = "true";
                    if (prop["x-value"] !== undefined) {
                        processed.buildValue = prop["x-value"];
                    }
                    break;
                case 'textarea':
                    if (processed.size === undefined) {
                        processed.size = 5;
                    }
                    break;
            }
        }
        return processed;
    }
    exports.processProperty = processProperty;
    function extractLabels(valuesProp, originalProp) {
        var values = [];
        var foundNull = false;
        var theEnum = valuesProp.enum;
        var enumNames = theEnum;
        if (valuesProp["x-enumNames"] !== undefined) {
            enumNames = valuesProp["x-enumNames"];
        }
        for (var i = 0; i < theEnum.length; ++i) {
            var value = theEnum[i];
            foundNull = foundNull || value === null;
            values.push({
                label: enumNames[i],
                value: value
            });
        }
        if (!foundNull && propertyCanBeNull(originalProp)) {
            var nullLabel = originalProp['x-null-value-label'] || "None";
            values.splice(0, 0, {
                label: nullLabel,
                value: null
            });
        }
        return values;
    }
    function extractPropValues(prop, processed, schema, originalProp) {
        if (prop["x-values"] !== undefined) {
            processed.buildValues = prop["x-values"];
        }
        else if (prop.enum !== undefined) {
            processed.buildValues = extractLabels(prop, originalProp);
        }
        else {
            var refType = null;
            if (hr_schema_1.isRefNode(prop)) {
                refType = hr_schema_1.resolveRef(prop, schema);
                if (refType && refType.enum !== undefined) {
                    processed.buildValues = extractLabels(refType, originalProp);
                }
            }
        }
    }
    function getBuildType(prop) {
        if (Array.isArray(prop.type)) {
            for (let j = 0; j < prop.type.length; ++j) {
                if (prop.type[j] !== "null") {
                    return prop.type[j];
                }
            }
        }
        else if (prop.type) { //If the property type is set, return it
            return prop.type;
        }
        else if (Array.isArray(prop.oneOf)) { //Check to see if we have any ref oneOf properties, if so consider this an object
            for (let j = 0; j < prop.oneOf.length; ++j) {
                if (hr_schema_1.isRefNode(prop.oneOf[j])) {
                    return "object";
                }
            }
        }
        return "string"; //Otherwise fallback to string
    }
    function propertyCanBeNull(prop) {
        if (Array.isArray(prop.type)) {
            for (var j = 0; j < prop.type.length; ++j) {
                if (prop.type[j] === "null") {
                    return true;
                }
            }
        }
        else if (prop.type === "null") {
            return true;
        }
        return false;
    }
});
define("hr.viewformatter", ["require","exports","hr.schema","hr.expressiontree","node_modules/htmlrapier/src/schemaprocessor"], function (require, exports, schema, exprTree, schemaprocessor) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.SchemaViewFormatter = exports.registerSchemaViewFormatterExtension = void 0;
    ;
    var schemaFormatterExtensions = [];
    function registerSchemaViewFormatterExtension(builder) {
        schemaFormatterExtensions.push(builder);
    }
    exports.registerSchemaViewFormatterExtension = registerSchemaViewFormatterExtension;
    class SchemaViewFormatter {
        constructor(schema) {
            this.schema = schema;
            this.cachedProperties = {};
        }
        convert(data) {
            return new SchemaViewExtractor(this, data, this.schema, this.cachedProperties);
        }
    }
    exports.SchemaViewFormatter = SchemaViewFormatter;
    class SchemaViewExtractor {
        constructor(dataFormatter, original, schema, cachedProperties) {
            this.dataFormatter = dataFormatter;
            this.original = original;
            this.schema = schema;
            this.cachedProperties = cachedProperties;
        }
        getRawData(address) {
            return address.read(this.original);
        }
        getFormatted(data, address) {
            return this.extract(data, address.address);
        }
        extract(data, address) {
            //Need to lookup info better than this
            var name = address[address.length - 1].key; //Assume string for now
            var prop = this.getPropertyForAddress(this.schema, address);
            var rawData = data;
            if (rawData === undefined) {
                rawData = null; //Normalize to null
            }
            if (prop) {
                var args = {
                    data: data,
                    name: name,
                    prop: prop,
                    propData: rawData,
                    schema: this.schema,
                };
                for (var i = 0; i < schemaFormatterExtensions.length; ++i) {
                    var extracted = schemaFormatterExtensions[i].extract(args);
                    if (extracted !== undefined) {
                        return extracted;
                    }
                }
                var values = prop.buildValues;
                if (values !== undefined && Array.isArray(values)) {
                    for (var i = 0; i < values.length; ++i) {
                        if (values[i].value == rawData) {
                            return values[i].label;
                        }
                    }
                }
                //Check for dates, come in a couple ways
                if (rawData !== null) {
                    switch (prop.buildType) {
                        case 'date':
                            var date = new Date(rawData);
                            return date.toLocaleDateString();
                        case 'date-time':
                            var xUi = prop.xUi;
                            if (xUi && xUi.dataTimezone) {
                                if (moment && moment.tz) {
                                    //Schema provided a display timezone
                                    if (xUi.displayTimezone) {
                                        moment.tz.setDefault(xUi.dataTimezone);
                                        rawData = moment(rawData).tz(xUi.displayTimezone).format('YYYY-MM-DD[T]HH:mm:ss');
                                        moment.tz.setDefault();
                                    }
                                    //Schema did not provide a timezone, guess the browser's time.
                                    else {
                                        var displayTimezone = moment.tz.guess();
                                        if (displayTimezone) {
                                            moment.tz.setDefault(xUi.dataTimezone);
                                            rawData = moment(rawData).tz(displayTimezone).format('YYYY-MM-DD[T]HH:mm:ss');
                                            moment.tz.setDefault();
                                        }
                                        else {
                                            console.warn("Cannot determine browser's timezone. Times will not be localized.");
                                        }
                                    }
                                }
                                else {
                                    console.warn("The date element specified a timezone, but moment-timezone.js is not loaded. Times will not be localized.");
                                }
                            }
                            var date = new Date(rawData);
                            return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
                    }
                }
            }
            //Handle undefined and null the same way
            if (rawData === null) {
                return (prop !== undefined && prop['x-null-value']) || "";
            }
            //Handle true values
            if (rawData === true) {
                return (prop !== undefined && prop['x-value']) || "Yes";
            }
            //Handle false values
            if (rawData === false) {
                return (prop !== undefined && prop['x-false-value']) || "No";
            }
            return rawData;
        }
        findSchemaProperty(rootSchema, prop, name) {
            //Find ref node
            var ref;
            if (prop.oneOf) {
                for (var i = 0; i < prop.oneOf.length; ++i) {
                    var type = prop.oneOf[i];
                    if (schema.isRefNode(type)) {
                        ref = type;
                        break;
                    }
                }
            }
            else if (prop.items) {
                if (schema.isRefNode(prop.items)) {
                    ref = prop.items;
                }
            }
            if (!ref) {
                throw new Error("Cannot find ref in schema properties.");
            }
            var ref = schema.resolveRef(ref, rootSchema);
            return ref.properties[name];
        }
        getPropertyForAddress(rootSchema, address) {
            var addressName = exprTree.getAddressStringNoIndicies(address);
            var retProp = this.cachedProperties[addressName];
            if (retProp === undefined) {
                var prop = rootSchema.properties[address[0].key];
                if (prop === undefined) {
                    return undefined;
                }
                for (var i = 1; i < address.length; ++i) {
                    var item = address[i];
                    prop = this.findSchemaProperty(rootSchema, prop, item.key); //Assuming strings for now
                    if (prop === undefined) {
                        return undefined;
                    }
                }
                retProp = schemaprocessor.processProperty(prop, rootSchema, null, null, null);
                this.cachedProperties[addressName] = retProp;
            }
            return retProp;
        }
    }
});
define("hr.view", ["require","exports","hr.textstream","hr.components","hr.typeidentifiers","hr.domquery","hr.iterable","hr.viewformatter"], function (require, exports, hr_textstream_1, components, typeId, domQuery, iter, hr_viewformatter_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.build = exports.SchemaViewDataFormatter = void 0;
    Object.defineProperty(exports, "SchemaViewDataFormatter", { enumerable: true, get: function () { return hr_viewformatter_1.SchemaViewFormatter; } });
    class ComponentView {
        constructor(element, component) {
            this.element = element;
            this.component = component;
        }
        setData(data, createdCallback, variantFinderCallback) {
            components.empty(this.element);
            this.insertData(data, null, createdCallback, variantFinderCallback);
        }
        appendData(data, createdCallback, variantFinderCallback) {
            this.insertData(data, null, createdCallback, variantFinderCallback);
        }
        insertData(data, insertBeforeSibling, createdCallback, variantFinderCallback) {
            var wrapCreatedCallback = createdCallback !== undefined && createdCallback !== null;
            var wrapVariantFinderCallback = variantFinderCallback !== undefined && variantFinderCallback !== null;
            if (Array.isArray(data) || typeId.isForEachable(data)) {
                if (this.formatter !== undefined) {
                    var dataExtractors = new iter.Iterable(data).select(i => {
                        return this.formatter.convert(i);
                    });
                    components.many(this.component, dataExtractors, this.element, insertBeforeSibling, wrapCreatedCallback === false ? undefined : (b, e) => {
                        return createdCallback(b, e.original);
                    }, wrapVariantFinderCallback === false ? undefined : (i) => {
                        return variantFinderCallback(i.original);
                    });
                }
                else {
                    var dataExtractors = new iter.Iterable(data).select(i => {
                        return new ObjectTextStreamData(i);
                    });
                    components.many(this.component, dataExtractors, this.element, insertBeforeSibling, wrapCreatedCallback === false ? undefined : (b, e) => {
                        return createdCallback(b, e.getDataObject());
                    }, wrapVariantFinderCallback === false ? undefined : (i) => {
                        return variantFinderCallback(i.getDataObject());
                    });
                }
            }
            else if (data !== undefined && data !== null) {
                if (this.formatter !== undefined) {
                    components.one(this.component, this.formatter.convert(data), this.element, insertBeforeSibling, wrapCreatedCallback === false ? undefined : (b, e) => {
                        return createdCallback(b, e.original);
                    }, wrapVariantFinderCallback === false ? undefined : (i) => {
                        return variantFinderCallback(i.original);
                    });
                }
                else {
                    var dataStream;
                    if (typeId.isFunction(data)) {
                        dataStream = new FuncTextStreamData(data);
                    }
                    else {
                        dataStream = new ObjectTextStreamData(data);
                    }
                    components.one(this.component, dataStream, this.element, insertBeforeSibling, wrapCreatedCallback === false ? undefined : (b, e) => {
                        return createdCallback(b, e.getDataObject());
                    }, wrapVariantFinderCallback === false ? undefined : (i) => {
                        return variantFinderCallback(i.getDataObject());
                    });
                }
            }
        }
        clear() {
            components.empty(this.element);
        }
        setFormatter(formatter) {
            this.formatter = formatter;
        }
    }
    class TextNodeView {
        constructor(element) {
            this.element = element;
            this.dataTextElements = undefined;
        }
        setData(data) {
            this.insertData(data);
        }
        appendData(data) {
            this.insertData(data);
        }
        insertData(data) {
            if (this.formatter !== undefined) {
                var extractor = this.formatter.convert(data);
                this.writeTextStream(extractor);
            }
            else {
                this.bindData(data);
            }
        }
        clear() {
            this.bindData(sharedClearer);
        }
        setFormatter(formatter) {
            this.formatter = formatter;
        }
        bindData(data) {
            if (data === null || data === undefined) {
                //If the incoming data is null or undefined, don't try to read it just clear the view
                this.bindData(sharedClearer);
            }
            else {
                var callback;
                if (typeId.isFunction(data)) {
                    callback = new FuncTextStreamData(data);
                }
                else {
                    callback = new ObjectTextStreamData(data);
                }
                this.writeTextStream(callback);
            }
        }
        writeTextStream(textStream) {
            this.ensureDataTextElements();
            for (var i = 0; i < this.dataTextElements.length; ++i) {
                var node = this.dataTextElements[i];
                node.node.textContent = node.stream.format(textStream);
            }
        }
        ensureDataTextElements() {
            if (this.dataTextElements === undefined) {
                this.dataTextElements = [];
                domQuery.iterateNodes(this.element, NodeFilter.SHOW_TEXT, (node) => {
                    var textStream = new hr_textstream_1.TextStream(node.textContent, { escape: false }); //Since we are using textContent, there is no need to escape the input
                    if (textStream.foundVariable()) {
                        this.dataTextElements.push({
                            node: node,
                            stream: textStream
                        });
                    }
                });
            }
        }
    }
    class NullView {
        constructor() {
        }
        setData() {
        }
        appendData() {
        }
        insertData() {
        }
        clear() {
        }
        setFormatter(formatter) {
        }
    }
    function IsHTMLElement(element) {
        //Just check a couple functions, no need to go overboard, only comparing to node anyway
        return element && element.nodeType == 1;
    }
    function build(element) {
        if (IsHTMLElement(element)) {
            var component;
            if (element.hasAttribute('data-hr-view-component')) {
                component = element.getAttribute('data-hr-view-component');
            }
            else if (element.hasAttribute('data-hr-model-component')) { //Backward compatibility
                component = element.getAttribute('data-hr-model-component');
            }
            if (component) {
                return new ComponentView(element, component);
            }
            else {
                return new TextNodeView(element);
            }
        }
        return new NullView();
    }
    exports.build = build;
    function sharedClearer(i) {
        return "";
    }
    class ObjectTextStreamData {
        constructor(data) {
            this.data = data;
        }
        getDataObject() {
            return this.data;
        }
        getRawData(address) {
            return address.read(this.data);
        }
        getFormatted(data, address) {
            return data;
        }
    }
    class FuncTextStreamData {
        constructor(data) {
            this.data = data;
        }
        getDataObject() {
            return this.data;
        }
        getRawData(address) {
            var lookup;
            if (address.address.length > 0) {
                lookup = address.address[0].key;
            }
            else {
                lookup = "this";
            }
            return address.readScoped(this.data(lookup));
        }
        getFormatted(data, address) {
            return data;
        }
    }
});
define("hr.models", ["require","exports","hr.form","hr.view"], function (require, exports, forms, views) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.StrongTypedModel = exports.NullModel = exports.build = void 0;
    function build(element) {
        var src = element.getAttribute('data-hr-model-src');
        if (element.nodeName === 'FORM' || element.nodeName == 'INPUT' || element.nodeName == 'TEXTAREA') {
            var shim = forms.build(element);
            shim.appendData = (data) => {
                shim.setData(data);
            };
            shim.getSrc = () => {
                return src;
            };
            return shim;
        }
        else {
            var shim2 = views.build(element);
            shim2.getData = () => {
                return {};
            };
            shim2.getSrc = () => {
                return src;
            };
            return shim2;
        }
    }
    exports.build = build;
    class NullModel {
        constructor() {
        }
        setData(data) {
        }
        appendData(data) {
        }
        clear() {
        }
        getData() {
            return {};
        }
        getSrc() {
            return "";
        }
        setPrototype(proto) { }
    }
    exports.NullModel = NullModel;
    /**
     * This class is a model that enforces its type.
     */
    class StrongTypedModel {
        constructor(childModel, strongConstructor) {
            this.childModel = childModel;
            this.strongConstructor = strongConstructor;
        }
        setData(data) {
            this.childModel.setData(data);
        }
        appendData(data) {
            this.childModel.appendData(data);
        }
        clear() {
            this.childModel.clear();
        }
        getData() {
            return new this.strongConstructor(this.childModel.getData());
        }
        getSrc() {
            return this.childModel.getSrc();
        }
        setPrototype(proto) {
            this.childModel.setPrototype(proto);
        }
    }
    exports.StrongTypedModel = StrongTypedModel;
});
define("hr.bindingcollection", ["require","exports","hr.domquery","hr.toggles","hr.models","hr.form","hr.view"], function (require, exports, domQuery, toggles, models, form, view) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.BindingCollection = exports.PooledBindings = void 0;
    function EventRunner(name, listener) {
        this.execute = function (evt) {
            var cb = listener[name];
            if (cb) {
                cb.call(listener, evt);
            }
        };
    }
    function bindEvents(elements, listener) {
        for (var eIx = 0; eIx < elements.length; ++eIx) {
            var element = elements[eIx];
            domQuery.iterateElementNodes(element, function (node) {
                //Look for attribute
                for (var i = 0; i < node.attributes.length; i++) {
                    var attribute = node.attributes[i];
                    if (attribute.name.startsWith('data-hr-on-')) {
                        var eventFunc = attribute.value;
                        if (listener[eventFunc]) {
                            var runner = new EventRunner(eventFunc, listener);
                            node.addEventListener(attribute.name.substr(11), runner.execute);
                        }
                    }
                }
            });
        }
    }
    function getToggle(name, elements, typedToggle) {
        var states = typedToggle.getPossibleStates();
        var toggleArray = [];
        var query = '[data-hr-toggle=' + name + ']';
        var startState = null;
        //Find all the toggles in the collection with the given name
        for (var eIx = 0; eIx < elements.length; ++eIx) {
            var element = elements[eIx];
            var toggleElements = domQuery.all(query, element);
            for (var i = 0; i < toggleElements.length; ++i) {
                toggleArray.push(toggles.build(toggleElements[i], states));
                startState = startState ? startState : toggles.getStartState(toggleElements[i]);
            }
        }
        if (toggleArray.length === 0) {
            //Nothing, null toggle
            typedToggle.setStates(toggles.build(null, states));
        }
        else if (toggleArray.length === 1) {
            //One thing, use toggle state directly
            typedToggle.setStates(toggleArray[0]);
        }
        else {
            //Multiple things, create a multi state and use that
            typedToggle.setStates(new toggles.MultiToggleStates(toggleArray));
        }
        if (startState != null) {
            typedToggle.applyState(startState);
        }
    }
    function getModel(name, elements) {
        var model;
        var query = '[data-hr-model=' + name + ']';
        for (var eIx = 0; eIx < elements.length; ++eIx) {
            var element = elements[eIx];
            var targetElement = domQuery.first(query, element);
            if (targetElement) {
                model = models.build(targetElement);
                return model; //Found it, need to break element loop, done here if found
            }
            else {
                model = null;
            }
        }
        if (model === null) {
            model = (new models.NullModel());
        }
        return model;
    }
    function getHandle(name, elements) {
        var model;
        var query = '[data-hr-handle=' + name + ']';
        for (var eIx = 0; eIx < elements.length; ++eIx) {
            var element = elements[eIx];
            var targetElement = domQuery.first(query, element);
            if (targetElement && targetElement instanceof HTMLElement) {
                return targetElement;
            }
        }
        return null;
    }
    function getConfig(elements) {
        var data = {};
        for (var eIx = 0; eIx < elements.length; ++eIx) {
            var element = elements[eIx];
            domQuery.iterateElementNodes(element, function (node) {
                //Look for attribute
                for (var i = 0; i < node.attributes.length; i++) {
                    var attribute = node.attributes[i];
                    if (attribute.name.startsWith('data-hr-config-')) {
                        data[attribute.name.substr(15)] = attribute.value;
                    }
                }
            });
        }
        return data;
    }
    function iterateControllers(name, elements, cb) {
        for (var eIx = 0; eIx < elements.length; ++eIx) {
            var element = elements[eIx];
            domQuery.iterate('[data-hr-controller="' + name + '"]', element, cb);
        }
    }
    class PooledBindings {
        constructor(docFrag, parent) {
            this.docFrag = docFrag;
            this.parent = parent;
        }
        restore(insertBefore) {
            this.parent.insertBefore(this.docFrag, insertBefore);
        }
    }
    exports.PooledBindings = PooledBindings;
    /**
     * The BindingCollection class allows you to get access to the HtmlElements defined on your
     * page with objects that help manipulate them. You won't get the elements directly and you
     * should not need to, using the interfaces should be enough.
     */
    class BindingCollection {
        constructor(elements) {
            this.elements = domQuery.all(elements);
        }
        /**
         * Set the listener for this binding collection. This listener will have its functions
         * fired when a matching event is fired.
         * @param {type} listener
         */
        setListener(listener) {
            bindEvents(this.elements, listener);
        }
        /**
         * Get a named toggle, this will always be an on off toggle.
         */
        getToggle(name) {
            var toggle = new toggles.OnOffToggle();
            getToggle(name, this.elements, toggle);
            return toggle;
        }
        /**
         * Get a named toggle, this will use the passed in custom toggle instance. Using this you can define
         * states other than on and off.
         */
        getCustomToggle(name, toggle) {
            getToggle(name, this.elements, toggle);
            return toggle;
        }
        /**
         * @deprecated
         * THIS IS DEPRECATED use getForm and getView instead.
         * Get a named model. Can also provide a StrongTypeConstructor that will be called with new to create
         * the instance of the data pulled from the model. If you don't provide this the objects will be plain
         * javascript objects.
         */
        getModel(name, strongConstructor) {
            var model = getModel(name, this.elements);
            if (strongConstructor !== undefined) {
                model = new models.StrongTypedModel(model, strongConstructor);
            }
            return model;
        }
        /**
         * Get the config for this binding collection.
         */
        getConfig() {
            return getConfig(this.elements);
        }
        /**
         * Get a handle element. These are direct references to html elements for passing to third party libraries
         * that need them. Don't use these directly if you can help it.
         */
        getHandle(name) {
            return getHandle(name, this.elements);
        }
        /**
         * Iterate over all the controllers in the BindingCollection.
         */
        iterateControllers(name, cb) {
            iterateControllers(name, this.elements, cb);
        }
        /**
         * Get a named form, will return a valid IForm object no matter what, but that object
         * might not actually be a rea form on the document if name does not exist.
         * @param name The name of the form to lookup.
         */
        getForm(name) {
            var query = '[data-hr-form=' + name + ']';
            var targetElement = this.findElement(query);
            //Backward compatibility with model
            if (targetElement === null) {
                query = '[data-hr-model=' + name + ']';
                targetElement = this.findElement(query);
            }
            return form.build(targetElement);
        }
        /**
         * Get a named view, will return a valid IView object no matter what, but that object
         * might not actually be a real view on the document if name does not exist.
         * @param name The name of the view to lookup
         */
        getView(name) {
            var query = '[data-hr-view=' + name + ']';
            var targetElement = this.findElement(query);
            //Backward compatibility with model
            if (targetElement === null) {
                query = '[data-hr-model=' + name + ']';
                targetElement = this.findElement(query);
            }
            return view.build(targetElement);
        }
        findElement(query) {
            for (var eIx = 0; eIx < this.elements.length; ++eIx) {
                var element = this.elements[eIx];
                var targetElement = domQuery.first(query, element);
                if (targetElement) {
                    //Found it, return now
                    return targetElement;
                }
            }
            return null; //Not found, return null
        }
        /**
         * Return the "root" html element for this binding collection. If there is more
         * than one element, the first one will be returned and null will be returned if
         * there is no root element. Ideally you would not use this directly, but it is
         * useful to insert nodes before a set of bound elements.
         */
        get rootElement() {
            return this.elements.length > 0 ? this.elements[0] : null;
        }
        /**
         * Remove all contained elements from the document. Be sure to use this to
         * remove the collection so all elements are properly removed.
         */
        remove() {
            for (var eIx = 0; eIx < this.elements.length; ++eIx) {
                this.elements[eIx].remove();
            }
        }
        /**
         * Pool the elements into a document fragment. Will return a pooled bindings
         * class that can be used to restore the pooled elements to the document.
         */
        pool() {
            var parent = this.elements[0].parentElement;
            var docFrag = document.createDocumentFragment();
            for (var eIx = 0; eIx < this.elements.length; ++eIx) {
                docFrag.appendChild(this.elements[eIx]);
            }
            return new PooledBindings(docFrag, parent);
        }
    }
    exports.BindingCollection = BindingCollection;
    ;
});
define("hr.ignored", ["require","exports","hr.domquery"], function (require, exports, domQuery) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.isIgnored = void 0;
    //This module defines html nodes that are ignored and a way to check to see if a node is ignored or the
    //child of an ignored node. Ignored nodes are defined with the data-hr-ignored attribute.
    var ignoredNodes = domQuery.all('[data-hr-ignored]');
    function isIgnored(node) {
        for (var i = 0; i < ignoredNodes.length; ++i) {
            if (ignoredNodes[i].contains(node)) {
                return true;
            }
        }
        return false;
    }
    exports.isIgnored = isIgnored;
});
define("hr.di", ["require","exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Scope = exports.ServiceCollection = void 0;
    function IsDiFuncitonId(test) {
        return test && test.id !== undefined && test.arg !== undefined;
    }
    function IsInjectableConstructor(test) {
        return test["InjectorArgs"] !== undefined;
    }
    const DiIdProperty = "__diId";
    var Scopes;
    (function (Scopes) {
        Scopes[Scopes["Shared"] = 0] = "Shared";
        Scopes[Scopes["Transient"] = 1] = "Transient";
    })(Scopes || (Scopes = {}));
    class InjectedProperties {
        constructor() {
            this.resolvers = [];
        }
        /**
         * Add a resolver.
         * @param resolver The resolver to add
         */
        addResolver(resolver) {
            this.resolvers.push(resolver);
        }
        /**
         * Resolve a service for a given id, which can be undefined. If no service is found, undefined is returned.
         */
        resolve(id, scope) {
            for (var i = this.resolvers.length - 1; i >= 0; --i) {
                var resolver = this.resolvers[i];
                if (resolver.id === id) {
                    return {
                        instance: resolver.resolver(scope),
                        scope: resolver.scope
                    };
                }
            }
        }
        /**
         * Determine if there is a resolver for a given id.
         * @param id The id to lookup
         */
        hasResolverForId(id) {
            for (var i = this.resolvers.length - 1; i >= 0; --i) {
                var resolver = this.resolvers[i];
                if (resolver.id === id) {
                    return true;
                }
            }
            return false;
        }
    }
    /**
     * A collection of services for injection into other classes.
     * Currently this can only accept non generic typescript classes to inject.
     * It works by creating a hierarchy of service collections, which can then have scopes
     * created with additional servics defined if needed. Servics can be shared or transient.
     * If they are shared a single instance will be created when requested and stored at the
     * level in the instance resolver that it was defined on. If any child scopes attempt to
     * create a shared service they will get the shared instance. Note that this is not quite a
     * singleton because you can have multiple service stacks. Transient services are not shared
     * and a new instance will be created each time an instance is requested.
     * @returns
     */
    class ServiceCollection {
        constructor() {
            this.resolvers = {};
        }
        /**
         * Add a shared service to the collection, shared services are created the first time they are requested
         * and persist across child scopes.
         * @param {function} typeHandle The constructor function for the type that represents this injected object.
         * @param {ResolverFunction<T>} resolver The resolver function for the object, can return promises.
         * @returns
         */
        addShared(typeHandle, resolver) {
            return this.addSharedId(undefined, typeHandle, resolver);
        }
        /**
         * Add a shared service to the collection, shared services are created the first time they are requested
         * and persist across child scopes. This version will additionally require an id object to get the service back.
         * @param {function} typeHandle The constructor function for the type that represents this injected object.
         * @param {ResolverFunction<T>} resolver The resolver function for the object, can return promises.
         * @returns
         */
        addSharedId(id, typeHandle, resolver) {
            if (IsInjectableConstructor(resolver)) {
                return this.add(id, typeHandle, Scopes.Shared, this.createConstructorResolver(resolver));
            }
            else {
                return this.add(id, typeHandle, Scopes.Shared, resolver);
            }
        }
        /**
         * Add a shared service to the collection if it does not exist in the collection already. Note that the ServiceCollections do not
         * have parents or any concept of parents, so services added this way to a ServiceCollection that is a child of another service
         * collection will override the service in the child collection as if you added it with add, since it has no way to check parents
         * for the existance of a service.
         * @param {DiFunction<T>} typeHandle
         * @param {InjectableConstructor<T> | T} resolver
         * @returns
         */
        tryAddShared(typeHandle, resolver) {
            return this.tryAddSharedId(undefined, typeHandle, resolver);
        }
        /**
         * Add a shared service to the collection if it does not exist in the collection already. Note that the ServiceCollections do not
         * have parents or any concept of parents, so services added this way to a ServiceCollection that is a child of another service
         * collection will override the service in the child collection as if you added it with add, since it has no way to check parents
         * for the existance of a service. This version will additionally require an id object to get the service back. You can add multiple
         * objects of the same type as long as they have different ids, but a match of id and object type will be blocked.
         * @param {DiFunction<T>} typeHandle
         * @param {InjectableConstructor<T> | T} resolver
         * @returns
         */
        tryAddSharedId(id, typeHandle, resolver) {
            if (!this.hasTypeHandle(id, typeHandle)) {
                this.addSharedId(id, typeHandle, resolver);
            }
            return this;
        }
        /**
         * Add a transient service to the collection, transient services are created each time they are asked for.
         * @param {function} typeHandle The constructor function for the type that represents this injected object.
         * @param {ResolverFunction<T>} resolver The resolver function for the object, can return promises.
         * @returns
         */
        addTransient(typeHandle, resolver) {
            return this.addTransientId(undefined, typeHandle, resolver);
        }
        /**
         * Add a transient service to the collection, transient services are created each time they are asked for.
         * This version will additionally require an id object to get the service back.
         * @param {function} typeHandle The constructor function for the type that represents this injected object.
         * @param {ResolverFunction<T>} resolver The resolver function for the object, can return promises.
         * @returns
         */
        addTransientId(id, typeHandle, resolver) {
            if (IsInjectableConstructor(resolver)) {
                return this.add(id, typeHandle, Scopes.Transient, this.createConstructorResolver(resolver));
            }
            else {
                return this.add(id, typeHandle, Scopes.Transient, resolver);
            }
        }
        /**
         * Add a transient service to the collection if it does not exist in the collection already. Note that the ServiceCollections do not
         * have parents or any concept of parents, so services added this way to a ServiceCollection that is a child of another service
         * collection will override the service in the child collection as if you added it with add, since it has no way to check parents
         * for the existance of a service.
         * @param {DiFunction<T>} typeHandle
         * @param {InjectableConstructor<T> | T} resolver
         * @returns
         */
        tryAddTransient(typeHandle, resolver) {
            return this.tryAddTransientId(undefined, typeHandle, resolver);
        }
        /**
         * Add a transient service to the collection if it does not exist in the collection already. Note that the ServiceCollections do not
         * have parents or any concept of parents, so services added this way to a ServiceCollection that is a child of another service
         * collection will override the service in the child collection as if you added it with add, since it has no way to check parents
         * for the existance of a service. This version will additionally require an id object to get the service back. You can add multiple
         * objects of the same type as long as they have different ids, but a match of id and object type will be blocked.
         * @param {DiFunction<T>} typeHandle
         * @param {InjectableConstructor<T> | T} resolver
         * @returns
         */
        tryAddTransientId(id, typeHandle, resolver) {
            if (!this.hasTypeHandle(id, typeHandle)) {
                this.addTransientId(id, typeHandle, resolver);
            }
            return this;
        }
        /**
         * Add an existing object instance as a singleton to this injector. Existing instances can only be added
         * as singletons.
         * @param {function} typeHandle The constructor function for the type that represents this injected object.
         * @param {ResolverFunction<T>} resolver The resolver function for the object, can return promises.
         * @returns
         */
        addSharedInstance(typeHandle, instance) {
            return this.addSharedInstanceId(undefined, typeHandle, instance);
        }
        /**
         * Add an existing object instance as a singleton to this injector. Existing instances can only be added
         * as singletons. This version will additionally require an id object to get the service back.
         * @param {function} typeHandle The constructor function for the type that represents this injected object.
         * @param {ResolverFunction<T>} resolver The resolver function for the object, can return promises.
         * @returns
         */
        addSharedInstanceId(id, typeHandle, instance) {
            return this.add(id, typeHandle, Scopes.Shared, s => instance);
        }
        /**
         * Add a singleton service to the collection if it does not exist in the collection already. Note that the ServiceCollections do not
         * have parents or any concept of parents, so services added this way to a ServiceCollection that is a child of another service
         * collection will override the service in the child collection as if you added it with add, since it has no way to check parents
         * for the existance of a service.
         * @param {DiFunction<T>} typeHandle
         * @param {InjectableConstructor<T> | T} resolver
         * @returns
         */
        tryAddSharedInstance(typeHandle, instance) {
            return this.tryAddSharedInstanceId(undefined, typeHandle, instance);
        }
        /**
         * Add a singleton service to the collection if it does not exist in the collection already. Note that the ServiceCollections do not
         * have parents or any concept of parents, so services added this way to a ServiceCollection that is a child of another service
         * collection will override the service in the child collection as if you added it with add, since it has no way to check parents
         * for the existance of a service. This version will additionally require an id object to get the service back. You can add multiple
         * objects of the same type as long as they have different ids, but a match of id and object type will be blocked.
         * @param {DiFunction<T>} typeHandle
         * @param {InjectableConstructor<T> | T} resolver
         * @returns
         */
        tryAddSharedInstanceId(id, typeHandle, instance) {
            if (!this.hasTypeHandle(id, typeHandle)) {
                this.addSharedInstanceId(id, typeHandle, instance);
            }
            return this;
        }
        /**
         * Add a service to this service collection.
         * @param {function} typeHandle The constructor function for the type that represents this injected object.
         * @param {ResolverFunction<T>} resolver The resolver function for the object, can return promises.
         */
        add(id, typeHandle, scope, resolver) {
            if (!typeHandle.prototype.hasOwnProperty(DiIdProperty)) {
                typeHandle.prototype[DiIdProperty] = ServiceCollection.idIndex++;
            }
            var injector = this.resolvers[typeHandle.prototype[DiIdProperty]];
            if (!injector) {
                injector = new InjectedProperties();
                this.resolvers[typeHandle.prototype[DiIdProperty]] = injector;
            }
            injector.addResolver({
                resolver: resolver,
                scope: scope,
                id: id
            });
            return this;
        }
        /**
         * Determine if this service collection already has a resolver for the given type handle.
         * @param {DiFunction<T>} typeHandle The type handle to lookup
         * @returns True if there is a resolver, and false if there is not.
         */
        hasTypeHandle(id, typeHandle) {
            if (typeHandle.prototype.hasOwnProperty(DiIdProperty)) {
                var typeId = typeHandle.prototype[DiIdProperty];
                var resolver = this.resolvers[typeId];
                if (resolver !== undefined) {
                    return resolver.hasResolverForId(id);
                }
            }
            return false;
        }
        /**
         * Helper function to create a resolver that constructs objects from constructor functions, it will di
         * the arguments to the function.
         * @param {InjectableConstructor} resolver
         * @returns
         */
        createConstructorResolver(constructor) {
            return (s) => {
                var argTypes = constructor.InjectorArgs;
                var args = [];
                for (var i = 0; i < argTypes.length; ++i) {
                    var injectType = argTypes[i];
                    if (IsDiFuncitonId(injectType)) {
                        args[i] = s.getRequiredServiceId(injectType.id, injectType.arg);
                    }
                    else { //Has to be DiFunction<any> at this point
                        args[i] = s.getRequiredService(injectType);
                    }
                }
                return new constructor(...args);
            };
        }
        /**
         * Resolve a service, note that every time this is called the service will be instantiated,
         * the scopes will hold the instances. Don't call this directly, but instead use the scopes
         * created by calling createScope.
         * @param {function} typeHandle
         * @param {Scope} scope
         * @internal
         * @returns
         */
        __resolveService(id, typeHandle, scope) {
            var diId = typeHandle.prototype[DiIdProperty];
            if (this.resolvers[diId] !== undefined) {
                //Instantiate service, have scope handle instances
                var info = this.resolvers[diId];
                var result = info.resolve(id, scope);
                if (result !== undefined) {
                    return result;
                }
            }
            return undefined;
        }
        /**
         * Create a scope to hold instantiated variables.
         * @returns The new scope.
         */
        createScope() {
            return new Scope(this);
        }
    }
    exports.ServiceCollection = ServiceCollection;
    ServiceCollection.idIndex = 0;
    class InstanceHandler {
        constructor() {
            this.instances = [];
        }
        addInstance(instance) {
            this.instances.push(instance);
        }
        /**
         * Get an instance by id if it exists, otherwise return undefined.
         */
        getInstance(id) {
            for (var i = this.instances.length - 1; i >= 0; --i) {
                var instance = this.instances[i];
                if (instance.id === id) {
                    return instance.instance;
                }
            }
            return undefined;
        }
    }
    class InstanceHolder {
    }
    /**
     * A scope for dependency injection.
     * @param {ServiceCollection} services
     * @param {Scope} parentScope?
     * @returns
     */
    class Scope {
        constructor(services, parentScope) {
            this.singletons = {};
            this.services = services;
            this.parentScope = parentScope;
        }
        /**
         * Get a service defined by the given constructor function.
         * @param {function} typeHandle
         * @returns
         */
        getService(typeHandle) {
            return this.getServiceId(undefined, typeHandle);
        }
        /**
         * Get a service defined by the given constructor function and id.
         * @param {function} typeHandle
         * @returns
         */
        getServiceId(id, typeHandle) {
            var typeId = typeHandle.prototype[DiIdProperty];
            var instance = this.bubbleFindSingletonInstance(id, typeHandle);
            //If the service is not found, resolve from our service collection
            if (instance === undefined) {
                var result = this.resolveService(id, typeHandle, this);
                //Add scoped results to the scope instances if one was returned
                if (result !== undefined) {
                    instance = result.instance;
                }
            }
            return instance;
        }
        /**
         * Get a service defined by the given constructor function. If the service does not exist an error is thrown.
         * @param {function} typeHandle
         * @returns
         */
        getRequiredService(typeHandle) {
            return this.getRequiredServiceId(undefined, typeHandle);
        }
        /**
        * Get a service defined by the given constructor function and id. If the service does not exist an error is thrown.
        * @param {function} typeHandle
        * @returns
        */
        getRequiredServiceId(id, typeHandle) {
            let rethrowError = false;
            try {
                let instance = this.getServiceId(id, typeHandle);
                if (instance === undefined) {
                    let fullTypeName = this.getTypeName(typeHandle, id);
                    rethrowError = true;
                    throw new Error(`Cannot find required service for function ${fullTypeName}. Did you forget to inject it?`);
                }
                return instance;
            }
            catch (err) {
                if (rethrowError) {
                    throw err; //The original error travels through here too. This way we don't show it twice.
                }
                let fullTypeName = this.getTypeName(typeHandle, id);
                let innerError;
                if (err instanceof Error) {
                    //Update the error message and rethrow
                    err.message = `Error creating required services for ${fullTypeName}
---${err.message}`;
                    throw err;
                }
                else {
                    try {
                        innerError = JSON.stringify(err);
                    }
                    catch (err) {
                        innerError = "Totally unknown error. Could not parse to json.";
                    }
                }
                throw new Error(`Unknown Error creating required services for ${fullTypeName}
---${innerError}`);
            }
        }
        getTypeName(typeHandle, id) {
            let typeName = typeHandle.name;
            let withId = "";
            if (id !== undefined) {
                withId = " with id " + id + " ";
            }
            var fullTypeName = typeName + withId;
            return fullTypeName;
        }
        /**
         * Create a child scope that shares service definitions and singleton instances.
         * @returns
         */
        createChildScope(serviceCollection) {
            if (serviceCollection === undefined) {
                serviceCollection = new ServiceCollection();
            }
            return new Scope(serviceCollection, this);
        }
        /**
         * Walk up the tree looking for singletons, if one is found return it otherwise undefined is returned.
         * @param {DiFunction<T>} typeHandle
         * @returns
         */
        bubbleFindSingletonInstance(id, typeHandle) {
            var typeId = typeHandle.prototype[DiIdProperty];
            var handler = this.singletons[typeId];
            var instance;
            if (handler !== undefined) {
                instance = handler.getInstance(id);
            }
            if (instance === undefined && this.parentScope !== undefined) {
                instance = this.parentScope.bubbleFindSingletonInstance(id, typeHandle);
            }
            return instance;
        }
        /**
         * Helper to resolve services, only looks at the service collection, walks entire tree to create a service.
         * @param {DiFunction<T>} typeHandle
         * @returns
         */
        resolveService(id, typeHandle, scope) {
            var result = this.services.__resolveService(id, typeHandle, scope);
            if (result === undefined) {
                //Cannot find service at this level, search parent services.
                if (this.parentScope) {
                    result = this.parentScope.resolveService(id, typeHandle, scope);
                }
            }
            else if (result.scope === Scopes.Shared) {
                //If we found an instance and its a singleton, add it to this scope's list of singletons.
                //Do it here so its stored on the level that resolved it.
                var typeId = typeHandle.prototype[DiIdProperty];
                var handler = this.singletons[typeId];
                if (handler === undefined) {
                    handler = new InstanceHandler();
                    this.singletons[typeId] = handler;
                }
                handler.addInstance({
                    instance: result.instance,
                    id: id
                });
            }
            return result;
        }
    }
    exports.Scope = Scope;
});
define("node_modules/htmlrapier/src/es5component", ["require","exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.setupPolyfill = void 0;
    /**
     * This shim allows elements written in, or compiled to, ES5 to work on native
     * implementations of Custom Elements v1. It sets new.target to the value of
     * this.constructor so that the native HTMLElement constructor can access the
     * current under-construction element's definition.
     */
    function setupPolyfill() {
        if (
        // No Reflect, no classes, no need for shim because native custom elements
        // require ES2015 classes or Reflect.
        window.Reflect === undefined ||
            window.customElements === undefined ||
            // The webcomponentsjs custom elements polyfill doesn't require
            // ES2015-compatible construction (`super()` or `Reflect.construct`).
            window.customElements.polyfillWrapFlushCallback) {
            return;
        }
        const BuiltInHTMLElement = HTMLElement;
        /**
         * With jscompiler's RECOMMENDED_FLAGS the function name will be optimized away.
         * However, if we declare the function as a property on an object literal, and
         * use quotes for the property name, then closure will leave that much intact,
         * which is enough for the JS VM to correctly set Function.prototype.name.
         */
        const wrapperForTheName = {
            'HTMLElement': /** @this {!Object} */ function HTMLElement() {
                return Reflect.construct(BuiltInHTMLElement, [], /** @type {!Function} */ (this.constructor));
            }
        };
        window.HTMLElement = wrapperForTheName['HTMLElement'];
        HTMLElement.prototype = BuiltInHTMLElement.prototype;
        HTMLElement.prototype.constructor = HTMLElement;
        Object.setPrototypeOf(HTMLElement, BuiltInHTMLElement);
    }
    exports.setupPolyfill = setupPolyfill;
    ;
});
define("hr.controller", ["require","exports","hr.bindingcollection","hr.bindingcollection","hr.toggles","hr.domquery","hr.ignored","hr.eventdispatcher","hr.di","hr.di","node_modules/htmlrapier/src/es5component"], function (require, exports, hr_bindingcollection_1, hr_bindingcollection_2, hr_toggles_1, domQuery, ignoredNodes, hr_eventdispatcher_1, di, hr_di_1, es5component) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.InjectedControllerBuilder = exports.InjectControllerData = exports.ServiceCollection = exports.TypedToggle = exports.OnOffToggle = exports.BindingCollection = void 0;
    Object.defineProperty(exports, "BindingCollection", { enumerable: true, get: function () { return hr_bindingcollection_2.BindingCollection; } });
    Object.defineProperty(exports, "OnOffToggle", { enumerable: true, get: function () { return hr_toggles_1.OnOffToggle; } });
    Object.defineProperty(exports, "TypedToggle", { enumerable: true, get: function () { return hr_toggles_1.TypedToggle; } });
    Object.defineProperty(exports, "ServiceCollection", { enumerable: true, get: function () { return hr_di_1.ServiceCollection; } });
    es5component.setupPolyfill();
    // End polyfill block
    /**
     * This class provides a way to get a handle to the data provided by the
     * createOnCallback data argument. Return this type from your InjectorArgs
     * where you take the row data argument, and the appropriate data object
     * will be returned. There is only a need for one of these, since controllers
     * can only accept one piece of callback data.
     */
    class InjectControllerData {
    }
    exports.InjectControllerData = InjectControllerData;
    /**
     * This class builds controllers using dependency injection.
     * Controllers are pretty much normal dependency injected classes, they have no superclass and don't
     * have any constructor requirements, however, you might want to take controller.BindingCollection at a minimum.
     * In addition to this your controller can define a function called postBind that will be called after the
     * controller's constructor and setting the controller as the binding collection listener. This is the best
     * place to create additional neseted controllers without messing up the binding collection.
     *
     * The way to handle a controller is as follows:
     * 1. Create the controller class with any InjectorArgs defined that need to be injected, likely at a minimnum this is controller.BindingCollection
     * 2. Implement the constructor for the controller taking in arguments for everything you need injected.
     *    In the controller read anything you will need out of the BindingCollection, do not store it for later or read it later, it will change as the page
     *    changes, so if you have nested controllers they can potentially end up seeing each others elements.
     * 3. Implement protected postBind() to do any work that should happen after bindings are complete. This will fire after the constructor has run and after
     *    the new controller instance has bound its functions to the dom. Ideally this method is protected so subclasses can call it but nothing else in typescript
     *    can see it.
     */
    class InjectedControllerBuilder {
        /**
         * Create a new ControllerBuilder, can reference a parent controller by passing it.
         * @param controllerConstructor
         * @param scope The scope to use for dependency injection into the controller
         */
        constructor(scope) {
            this.controllerCreatedEvent = new hr_eventdispatcher_1.ActionEventDispatcher();
            this.serviceCollection = new di.ServiceCollection();
            if (scope) {
                this.baseScope = scope.createChildScope(this.serviceCollection);
            }
            else {
                this.baseScope = new di.Scope(this.serviceCollection);
            }
        }
        /**
         * Get the service collection to define services for this builder. Don't create scopes with this
         * use createUnbound if you need to make an instance of something in the service collection, this
         * will prevent your scopes from getting messed up.
         */
        get Services() {
            return this.serviceCollection;
        }
        /**
         * This event is fired when this builder creates a controller.
         */
        get controllerCreated() {
            return this.controllerCreatedEvent.modifier;
        }
        /**
         * Create a child builder from this controller builder, this allows you to add
         * shared instances to the child that will not be present in the parent.
         */
        createChildBuilder() {
            return new InjectedControllerBuilder(this.baseScope.createChildScope(new di.ServiceCollection()));
        }
        /**
         * Create a new controller instance on the named nodes in the document.
         * @param name The name of the data-hr-controller nodes to lookup.
         * @param controllerConstructor The controller to create when a node is found.
         * @param parentBindings The parent bindings to restrict the controller search.
         */
        create(name, controllerConstructor, parentBindings) {
            return this.createId(undefined, name, controllerConstructor, parentBindings);
        }
        /**
         * Create a new controller instance on the named nodes in the document using an id based service.
         * @param name The name of the data-hr-controller nodes to lookup.
         * @param controllerConstructor The controller to create when a node is found.
         * @param parentBindings The parent bindings to restrict the controller search.
         */
        createId(id, name, controllerConstructor, parentBindings) {
            const createdControllers = [];
            const foundElement = (element) => {
                if (!ignoredNodes.isIgnored(element)) {
                    const services = new di.ServiceCollection();
                    const scope = this.baseScope.createChildScope(services);
                    const bindings = new hr_bindingcollection_1.BindingCollection(element);
                    services.addTransient(hr_bindingcollection_1.BindingCollection, s => bindings);
                    element.removeAttribute('data-hr-controller');
                    const controller = this.createController(id, controllerConstructor, services, scope, bindings);
                    createdControllers.push(controller);
                }
            };
            if (parentBindings) {
                parentBindings.iterateControllers(name, foundElement);
            }
            else {
                domQuery.iterate('[data-hr-controller="' + name + '"]', null, foundElement);
            }
            return createdControllers;
        }
        /**
         * This will create a single instance of the service that resolves to constructorFunc
         * without looking for html elements, it will not have a binding collection.
         * This can be used to create any kind of object, not just controllers. Do this for anything
         * you want to use from the service scope for this controller.
         */
        createUnbound(constructorFunc) {
            return this.createUnboundId(undefined, constructorFunc);
        }
        /**
         * This will create a single instance of the service that resolves to constructorFunc
         * without looking for html elements, it will not have a binding collection.
         * This can be used to create any kind of object, not just controllers. Do this for anything
         * you want to use from the service scope for this controller. This verison works by creating
         * the version of a service with the given id.
         */
        createUnboundId(id, constructorFunc) {
            const services = new di.ServiceCollection();
            const scope = this.baseScope.createChildScope(services);
            services.addTransient(InjectedControllerBuilder, s => new InjectedControllerBuilder(scope));
            const controller = scope.getRequiredServiceId(id, constructorFunc);
            if (controller.postBind !== undefined) {
                controller.postBind();
            }
            this.controllerCreatedEvent.fire(controller);
            return controller;
        }
        /**
         * This will create a callback function that will create a new controller when it is called.
         * @returns
         */
        createOnCallback(controllerConstructor) {
            return this.createOnCallbackId(undefined, controllerConstructor);
        }
        /**
         * This will create a callback function that will create a new controller when it is called.
         * This version will use the service identified by id.
         * @returns
         */
        createOnCallbackId(id, controllerConstructor) {
            return (bindings, data) => {
                const services = new di.ServiceCollection();
                const scope = this.baseScope.createChildScope(services);
                services.addTransient(hr_bindingcollection_1.BindingCollection, s => bindings);
                //If some data was provided, use it as our InjectControllerData service
                //for the newly created scope.
                if (data !== undefined) {
                    services.addTransient(InjectControllerData, s => data);
                }
                return this.createController(id, controllerConstructor, services, scope, bindings);
            };
        }
        /**
         * Register a controller to be created when the custom elements are found. Note that your class is not a HTMLElement like a normal
         * web component class. Instead a web component is created that forwards the events to your class. Your class's constructor is called
         * after the component is fully formed with the dependencies injected from DI. This happens during the web component connectedCallback.
         * Before then nothing is created. This also alters the expected lifecycle. Normally you would expect
         * constructed -> attributeChangedCallback -> connectedCallback for a new component, but now it will be constructor -> connectedCallback. The
         * component is not fully formed enough on the first attributeChangedCallback to respond usefully.
         * @param elementName
         * @param controllerConstructor
         * @param options
         */
        registerWebComponent(elementName, controllerConstructor, options) {
            this.registerWebComponentId(undefined, elementName, controllerConstructor, options);
        }
        registerWebComponentId(id, elementName, controllerConstructor, options) {
            //Stuff we need to pass into the class defined below.
            var self = this;
            class ControllerElement extends HTMLElement {
                connectedCallback() {
                    if (!this.controller) {
                        const services = new di.ServiceCollection();
                        const scope = self.baseScope.createChildScope(services);
                        const bindings = new hr_bindingcollection_1.BindingCollection(this);
                        services.addTransient(hr_bindingcollection_1.BindingCollection, s => bindings);
                        this.removeAttribute('data-hr-controller');
                        this.controller = self.createController(id, controllerConstructor, services, scope, bindings);
                    }
                    if (this.controller.connectedCallback) {
                        this.controller.connectedCallback();
                    }
                }
                disconnectedCallback() {
                    if (this.controller.disconnectedCallback) {
                        this.controller.disconnectedCallback();
                    }
                }
                adoptedCallback() {
                    if (this.controller.adoptedCallback) {
                        this.controller.adoptedCallback();
                    }
                }
                attributeChangedCallback() {
                    if (this.controller.attributeChangedCallback) {
                        this.controller.attributeChangedCallback();
                    }
                }
            }
            window.customElements.define(elementName, ControllerElement, options);
        }
        createController(id, controllerConstructor, services, scope, bindings) {
            services.addTransient(InjectedControllerBuilder, s => new InjectedControllerBuilder(scope));
            const controller = scope.getRequiredServiceId(id, controllerConstructor);
            bindings.setListener(controller);
            if (controller.postBind !== undefined) {
                controller.postBind();
            }
            this.controllerCreatedEvent.fire(controller);
            return controller;
        }
    }
    exports.InjectedControllerBuilder = InjectedControllerBuilder;
});
define("hr.fetcher", ["require","exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Fetcher = void 0;
    class Fetcher {
    }
    exports.Fetcher = Fetcher;
});
define("hr.uri", ["require","exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.parseUri = exports.getQueryObject = exports.Uri = void 0;
    // based on parseUri 1.2.2
    // (c) Steven Levithan <stevenlevithan.com>
    // MIT License
    // http://blog.stevenlevithan.com/archives/parseuri
    var parseUriOptions = {
        strictMode: false,
        key: ["source", "protocol", "authority", "userInfo", "user", "password", "host", "port", "relative", "path", "directory", "file", "query", "anchor"],
        q: {
            name: "queryKey",
            parser: /(?:^|&)([^&=]*)=?([^&]*)/g
        },
        parser: {
            strict: /^(?:([^:\/?#]+):)?(?:\/\/((?:(([^:@]*)(?::([^:@]*))?)?@)?([^:\/?#]*)(?::(\d*))?))?((((?:[^?#\/]*\/)*)([^?#]*))(?:\?([^#]*))?(?:#(.*))?)/,
            loose: /^(?:(?![^:@]+:[^:@\/]*@)([^:\/?#.]+):)?(?:\/\/)?((?:(([^:@]*)(?::([^:@]*))?)?@)?([^:\/?#]*)(?::(\d*))?)(((\/(?:[^?#](?![^?#\/]*\.[^?#\/.]+(?:[?#]|$)))*\/?)?([^?#\/]*))(?:\?([^#]*))?(?:#(.*))?)/
        }
    };
    var jsonPrefix = "_json_";
    class Uri {
        /**
         * Constructor. Optionally takes the url to parse, otherwise uses current
         * page url.
         * @param {string} url? The url to parse, if this is not passed it will use the window's url, if null is passed no parsing will take place.
         */
        constructor(url) {
            if (url === undefined && window !== undefined) {
                url = window.location.href;
            }
            if (url !== null) {
                var o = parseUriOptions;
                var m = o.parser[o.strictMode ? "strict" : "loose"].exec(url);
                var uri = this;
                var i = 14;
                while (i--)
                    uri[o.key[i]] = m[i] || "";
                uri[o.q.name] = {};
                uri[o.key[12]].replace(o.q.parser, function ($0, $1, $2) {
                    if ($1)
                        uri[o.q.name][$1] = $2;
                });
                this.path = this.path.replace('\\', '/'); //Normalize slashes
            }
        }
        /**
         * Get the section of the path specified by the index i.
         * @param {number} i The index of the section of the path to get use negative numbers to start at the end.
         * @returns
         */
        getPathPart(i) {
            if (this.splitPath === undefined) {
                this.splitPath = this.path.split('/');
            }
            //Negative index, start from back
            var part = null;
            if (i < 0) {
                if (-i < this.splitPath.length) {
                    part = this.splitPath[this.splitPath.length + i];
                }
            }
            else if (i < this.splitPath.length) {
                part = this.splitPath[i];
            }
            return part;
        }
        /**
         * Set the query portion of the url to the given object's keys and values.
         * The keys will not be altered, the values will be uri encoded. If a value
         * in the object is null or undefined it will not be included in the query string.
         * If data is null or undefined, the query will be cleared.
         * @param {type} data The object to make into a query.
         */
        setQueryFromObject(data) {
            var queryString = "";
            if (data === undefined || data === null) { //set to empty object if undefined or null to clear the string
                data = {};
            }
            for (var key in data) {
                if (data[key] !== undefined && data[key] !== null) {
                    if (Array.isArray(data[key])) {
                        var arr = data[key];
                        //Determine what kind of array we have
                        if (arr.length > 0 && (typeof arr[0] === 'object' || Array.isArray(arr[0]))) {
                            //Array of objects or arrays, write as json
                            queryString += key + '=' + this.getEncoded(arr) + '&';
                        }
                        else {
                            //Array of primitives (or empty). Write as multiple key entries
                            for (var i = 0; i < arr.length; ++i) {
                                queryString += key + '=' + this.getEncoded(arr[i]) + '&';
                            }
                        }
                    }
                    else {
                        queryString += key + '=' + this.getEncoded(data[key]) + '&';
                    }
                }
            }
            if (queryString.length > 0) {
                queryString = queryString.substr(0, queryString.length - 1);
            }
            this.query = queryString;
        }
        getEncoded(v) {
            if (v instanceof Date) {
                var parsedDate = v.toISOString();
                return encodeURIComponent(parsedDate);
            }
            else if (Array.isArray(v) || typeof v === 'object') {
                return jsonPrefix + encodeURIComponent(JSON.stringify(v));
            }
            else {
                return encodeURIComponent(v);
            }
        }
        /**
         * Create an object from the uri's query string. The values will
         * all be run through decodeURIComponent.
         * All query string names will be set to lower case
         * to make looking them back up possible no matter the url case.
         * @returns An object version of the query string.
         */
        getQueryObject() {
            var cleanQuery = this.query;
            if (cleanQuery.charAt(0) === '?') {
                cleanQuery = cleanQuery.substr(1);
            }
            var qs = cleanQuery.split('&');
            var val = {};
            for (var i = 0; i < qs.length; ++i) {
                var pair = qs[i].split('=', 2);
                if (pair.length > 0) {
                    var name = pair[0].toLowerCase();
                    var pairValue = "";
                    if (pair.length > 1) {
                        var raw = pair[1].replace(/\+/g, ' ');
                        if (raw.startsWith(jsonPrefix)) {
                            raw = raw.substr(jsonPrefix.length);
                            pairValue = JSON.parse(decodeURIComponent(raw));
                        }
                        else {
                            pairValue = decodeURIComponent(raw);
                        }
                    }
                    if (val[name] === undefined) {
                        //Undefined, set value directly
                        val[name] = pairValue;
                    }
                    else if (Array.isArray(val[name])) {
                        //Already an array, add the value
                        val[name].push(pairValue);
                    }
                    else {
                        //One value set, add 2nd into array
                        val[name] = [val[name], pairValue];
                    }
                }
            }
            return val;
        }
        /**
         * Build the complete url from the current settings.
         * This will do the following concatentaion:
         * protocol + '://' + authority + directory + file + '?' + query
         * @returns
         */
        build() {
            var query = this.query;
            if (query && query.charAt(0) !== '?') {
                query = '?' + query;
            }
            return this.protocol + '://' + this.authority + this.directory + this.file + query;
        }
    }
    exports.Uri = Uri;
    /**
     * Get an object with the values from the query string. The values will all be
     * uri decoded before being returned. All query string names will be set to lower case
     * to make looking them back up possible no matter the url case.
     * @returns {type} The window's query as an object.
     */
    function getQueryObject() {
        var url = new Uri(null);
        url.query = window.location.search;
        return url.getQueryObject();
    }
    exports.getQueryObject = getQueryObject;
    /**
     * Parse a uri and return a new uri object.
     * @param {type} str The url to parse
     * @deprecated Use the Uri class directly.
     * @returns
     */
    function parseUri(str) {
        return new Uri(str);
    }
    exports.parseUri = parseUri;
    ;
});
define("node_modules/htmlrapier.treemenu/src/TreeMenu", ["require","exports","hr.storage","hr.controller","hr.fetcher","hr.iterable","hr.domquery","hr.uri"], function (require, exports, storage, controller, hr_fetcher_3, iter, domQuery, uri) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.addServices = exports.TreeMenuStorage = exports.TreeMenuItem = exports.TreeMenu = exports.TreeMenuProvider = exports.IsFolder = void 0;
    function IsFolder(node) {
        return node !== undefined && node.children !== undefined;
    }
    exports.IsFolder = IsFolder;
    class TreeMenuProvider {
        constructor(fetcher, menuStore) {
            this.fetcher = fetcher;
            this.menuStore = menuStore;
            this.menuStore.setSerializerOptions(TreeMenuProvider.serializerReplace);
        }
        static get InjectorArgs() {
            return [hr_fetcher_3.Fetcher, TreeMenuStorage];
        }
        loadMenu(url, version, urlRoot) {
            return __awaiter(this, void 0, void 0, function* () {
                var rootNode;
                this.saveUrl = url;
                this.pageUrl = new uri.Uri();
                this.urlRoot = urlRoot;
                this.version = version;
                this.sessionData = this.menuStore.getValue(null);
                if (this.sessionData === null || version === undefined || this.sessionData.version !== version) {
                    //No data, get it
                    try {
                        const response = yield this.fetcher.fetch(url, {
                            method: "GET",
                            cache: "no-cache",
                            headers: {
                                "Content-Type": "application/json; charset=UTF-8"
                            },
                            credentials: "include"
                        });
                        const text = yield response.text();
                        rootNode = JSON.parse(text);
                        rootNode.expanded = true;
                    }
                    catch (err) {
                        rootNode = {
                            name: "Root",
                            children: [{
                                    "name": "Main Page",
                                    "link": "/",
                                    parent: undefined,
                                    currentPage: false
                                }],
                            parent: undefined,
                            expanded: true,
                            currentPage: false
                        };
                    }
                    this.sessionData = {
                        data: rootNode,
                        scrollLeft: 0,
                        scrollTop: 0,
                        version: version
                    };
                }
                //Always have to recalculate parents, since they can't be saved due to circular refs
                this.setupRuntimeInfo(this.RootNode, undefined);
            });
        }
        cacheMenu(scrollLeft, scrollTop) {
            var cacheData = {
                data: this.sessionData.data,
                version: this.version,
                scrollLeft: scrollLeft,
                scrollTop: scrollTop
            };
            this.menuStore.setValue(cacheData);
        }
        /**
         * This function is called when something causes the menu or part of the menu to rebuild.
         */
        menuRebuilt() {
        }
        setupRuntimeInfo(node, parent) {
            node.parent = parent;
            if (IsFolder(node)) {
                var children = node.children;
                for (var i = 0; i < children.length; ++i) {
                    //Recursion, I don't care, how nested is your menu that you run out of stack space here? Can a user really use that?
                    this.setupRuntimeInfo(children[i], node);
                }
            }
            else { //Page link, check to see if it is the current page
                node.currentPage = (this.urlRoot + node.link) === this.pageUrl.path;
                if (node.currentPage) {
                    //If page is the current page, set it and all its parents to expanded
                    this.setParentsCurrent(node.parent);
                }
            }
        }
        setParentsCurrent(node) {
            while (node) {
                node.expanded = true;
                node.currentPage = true;
                node = node.parent;
            }
        }
        static serializerReplace(key, value) {
            return key !== 'parent' && key !== 'currentPage' ? value : undefined;
        }
        get RootNode() {
            return this.sessionData.data;
        }
        get ScrollLeft() {
            return this.sessionData.scrollLeft;
        }
        get ScrollTop() {
            return this.sessionData.scrollTop;
        }
    }
    exports.TreeMenuProvider = TreeMenuProvider;
    function VariantFinder(node) {
        if (!IsFolder(node.original)) {
            return "link";
        }
    }
    function RootVariant(node) {
        return "root";
    }
    class TreeMenu {
        constructor(bindings, treeMenuProvider, builder) {
            this.bindings = bindings;
            this.treeMenuProvider = treeMenuProvider;
            this.builder = builder;
            this.rootModel = bindings.getModel('childItems');
            var config = bindings.getConfig();
            this.editMode = config["treemenu-editmode"] === 'true';
            this.version = config["treemenu-version"];
            this.ajaxurl = config.menu;
            this.urlRoot = config.urlroot;
            if (this.urlRoot === undefined) {
                this.urlRoot = "";
            }
            if (this.urlRoot.length > 0) {
                var lastChar = this.urlRoot[this.urlRoot.length - 1];
                if (lastChar === '\\' || lastChar === '/') {
                    this.urlRoot = this.urlRoot.substr(0, this.urlRoot.length - 1);
                }
            }
            if (config.scrollelement) {
                var node = domQuery.first(config.scrollelement);
                if (node instanceof HTMLElement) {
                    this.scrollElement = node;
                }
                else if (node) {
                    throw new Error("Scroll element " + config.scrollelement + " is not an HTMLElement.");
                }
            }
            this.loadMenu();
        }
        static get InjectorArgs() {
            return [controller.BindingCollection, TreeMenuProvider, controller.InjectedControllerBuilder];
        }
        loadMenu() {
            return __awaiter(this, void 0, void 0, function* () {
                yield this.treeMenuProvider.loadMenu(this.ajaxurl, this.version, this.urlRoot);
                //Only cache menus that loaded correctly
                window.addEventListener("beforeunload", e => {
                    //Cheat to handle scroll position, using handles
                    var scrollLeft = 0;
                    var scrollTop = 0;
                    if (this.scrollElement) {
                        scrollLeft = this.scrollElement.scrollLeft;
                        scrollTop = this.scrollElement.scrollTop;
                    }
                    this.treeMenuProvider.cacheMenu(scrollLeft, scrollTop);
                });
                //Build child tree nodes
                this.buildMenu();
                //Now that the menu is built, restore the scroll position
                if (this.scrollElement) {
                    this.scrollElement.scrollLeft = this.treeMenuProvider.ScrollLeft;
                    this.scrollElement.scrollTop = this.treeMenuProvider.ScrollTop;
                }
            });
        }
        buildMenu() {
            //Build child tree nodes
            var rootNode = this.treeMenuProvider.RootNode;
            var rootData = {
                original: rootNode,
                name: rootNode.name,
                link: undefined,
                target: undefined,
                urlRoot: this.urlRoot,
                parentItem: undefined,
                provider: this.treeMenuProvider
            };
            this.rootModel.setData(rootData, this.builder.createOnCallback(TreeMenuItem), RootVariant);
        }
        rebuildMenu() {
            this.buildMenu();
            this.treeMenuProvider.menuRebuilt();
        }
    }
    exports.TreeMenu = TreeMenu;
    class TreeMenuItem {
        constructor(bindings, folderMenuItemInfo, builder) {
            this.bindings = bindings;
            this.folderMenuItemInfo = folderMenuItemInfo;
            this.builder = builder;
            this.loadedChildren = false;
            this.childModel = this.bindings.getModel("children");
            if (IsFolder(folderMenuItemInfo.original)) {
                this.folder = folderMenuItemInfo.original;
            }
            this.childToggle = bindings.getToggle("children");
            var currentToggle = bindings.getToggle("current");
            currentToggle.mode = folderMenuItemInfo.original.currentPage;
        }
        static get InjectorArgs() {
            return [controller.BindingCollection, controller.InjectControllerData, controller.InjectedControllerBuilder];
        }
        postBind() {
            if (this.folder && this.folder.expanded) {
                this.buildChildren();
                this.childToggle.on();
            }
            else {
                this.childToggle.off();
            }
        }
        toggleMenuItem(evt) {
            evt.preventDefault();
            evt.stopPropagation();
            this.buildChildren();
            this.childToggle.toggle();
            this.folder.expanded = this.childToggle.mode;
        }
        buildChildren() {
            if (this.folder && !this.loadedChildren) {
                this.loadedChildren = true;
                //Select nodes, treat all nodes as link nodes
                var childIter = new iter.Iterable(this.folder.children).select(i => {
                    return {
                        original: i,
                        name: i.name,
                        link: i.link,
                        target: i.target ? i.target : "_self",
                        urlRoot: this.folderMenuItemInfo.urlRoot,
                        parentItem: this,
                        provider: this.folderMenuItemInfo.provider
                    };
                });
                this.childModel.setData(childIter, this.builder.createOnCallback(TreeMenuItem), VariantFinder);
            }
        }
        /**
         * Rebuild the children for this menu item
         * @param node - The menu node to stop at and rebuild. Will do nothing if the node cannot be found.
         */
        rebuildParent(node) {
            if (this.folderMenuItemInfo.original == node) {
                this.loadedChildren = false;
                this.buildChildren();
                this.folderMenuItemInfo.provider.menuRebuilt();
            }
            else {
                var parent = this.folderMenuItemInfo.parentItem;
                if (parent) {
                    parent.rebuildParent(node);
                }
            }
        }
    }
    exports.TreeMenuItem = TreeMenuItem;
    class TreeMenuStorage extends storage.JsonStorage {
        constructor(storageDriver) {
            super(storageDriver);
        }
    }
    exports.TreeMenuStorage = TreeMenuStorage;
    /**
     * Add the default services for the tree menu. Note this will create a default storage for the
     * menu in sesssion storage called defaultTreeMenu. If you only have one tree menu per page
     * this should be fine, otherwise inject your own TreeMenuStorage with a unique name.
     * @param services
     */
    function addServices(services) {
        services.tryAddTransient(TreeMenuStorage, s => new TreeMenuStorage(new storage.SessionStorageDriver("defaultTreeMenu"))); //Create a default session storage, users are encouraged to make their own
        services.tryAddTransient(TreeMenuProvider, TreeMenuProvider);
        services.tryAddTransient(TreeMenu, TreeMenu);
        services.tryAddTransient(TreeMenuItem, TreeMenuItem);
    }
    exports.addServices = addServices;
});
define("hr.pageconfig", ["require","exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.read = void 0;
    /**
     * Read the config off the page. You can optionally pass existing config. This function returns the configuration object after it is read.
     * @param config An existing config value to further fill out.
     */
    function read(config) {
        if (config === undefined) {
            config = {};
        }
        return window.hr_config ? window.hr_config(config) : config;
    }
    exports.read = read;
});
define("node_modules/editymceditface.client/EditorCore/EditModeDetector", ["require","exports","hr.pageconfig"], function (require, exports, pageConfig) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.IsEditMode = void 0;
    var config = undefined;
    function IsEditMode() {
        if (config === undefined) {
            var config = pageConfig.read();
        }
        return config.editSettings !== undefined;
    }
    exports.IsEditMode = IsEditMode;
});
define("node_modules/htmlrapier.bootstrap/src/modal", ["require","exports","hr.toggles"], function (require, exports, toggles) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.activate = void 0;
    //Scrollbar fix, keeps scrollbars at correct length with multiple modals
    //Since this is on the document, only needed once, so register here
    //Works in bootstrap 3.3.7.
    //Thanks to A1rPun at https://stackoverflow.com/questions/19305821/multiple-modals-overlay
    $(document).on('hidden.bs.modal', '.modal', function () {
        $('.modal:visible').length && $(document.body).addClass('modal-open');
    });
    class LastClickTargetManager {
        constructor() {
            this.lastOnClickTarget = null;
            window.addEventListener("click", evt => { this.lastOnClickTarget = evt.target; }, true);
        }
        getLast() {
            if (this.lastOnClickTarget) {
                //Get the last click target, and clear it out, we don't care about it after the first access
                var ret = this.lastOnClickTarget;
                this.lastOnClickTarget = null;
                return ret;
            }
            return null;
        }
        refocus(element) {
            if (element) {
                element.focus();
            }
            else {
                //Return main element on page
                var target = null;
                var lookup = window.document.getElementsByTagName("main");
                if (lookup.length > 0) {
                    target = lookup[0];
                }
                //Couldn't find anything, use current doc body.
                if (target === null) {
                    target = window.document.body;
                }
                if (!target.hasAttribute("tabindex")) {
                    target.setAttribute("tabindex", "-1");
                }
                target.focus();
            }
        }
    }
    var lastClickTracker;
    //Toggle Plugin
    class ModalStates extends toggles.ToggleStates {
        constructor(element, next) {
            super(next);
            this.modal = $(element);
            var theModal = this.modal.modal({
                show: false
            });
            var thisShim = this;
            this.modal.on('show.bs.modal', (e) => {
                this.lastOnClickBeforeOpen = lastClickTracker.getLast();
                this.fireStateChange('on');
            });
            this.modal.on('hide.bs.modal', (e) => {
                this.fireStateChange('off');
            });
            //Only listen for tracking events if the modal is setup to do it.
            if (Boolean(element.getAttribute('data-hr-bootstrap-auto-refocus'))) {
                this.modal.on('hidden.bs.modal', (e) => {
                    lastClickTracker.refocus(this.lastOnClickBeforeOpen);
                });
            }
            this.addState('on', 'on');
            this.addState('off', 'off');
        }
        activateState(state) {
            switch (state) {
                case 'on':
                    this.modal.modal('show');
                    break;
                case 'off':
                    this.modal.modal('hide');
                    break;
            }
            return false;
        }
    }
    /**
     * Activate all modal htmlrapier plugin.
     */
    function activate() {
        lastClickTracker = new LastClickTargetManager();
        toggles.addTogglePlugin(function (element, states, toggle) {
            if (element.classList.contains('modal')) {
                toggle = new ModalStates(element, toggle);
            }
            return toggle;
        });
    }
    exports.activate = activate;
});
define("node_modules/htmlrapier.bootstrap/src/dropdown", ["require","exports","hr.toggles"], function (require, exports, toggles) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.activate = void 0;
    //Toggle Plugin
    class DropdownStates extends toggles.ToggleStates {
        constructor(element, next) {
            super(next);
            this.drop = $(element).dropdown();
        }
        activateState(state) {
            //States not supported, handled by bootstrap
            return false; //Never fire any events for this toggle
        }
    }
    /**
     * Activate the dropdown htmlrapier plugin.
     */
    function activate() {
        toggles.addTogglePlugin(function (element, states, toggle) {
            if (element.classList.contains('dropdown-toggle')) {
                toggle = new DropdownStates(element, toggle);
            }
            return toggle;
        });
    }
    exports.activate = activate;
});
define("node_modules/htmlrapier.bootstrap/src/tab", ["require","exports","hr.toggles"], function (require, exports, toggles) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.activate = void 0;
    //Toggle Plugin
    class TabStates extends toggles.ToggleStates {
        constructor(element, next) {
            super(next);
            this.tab = $(element);
            this.tab.on('shown.bs.tab', (e) => {
                this.fireStateChange('on');
            });
            this.tab.on('hide.bs.tab', (e) => {
                this.fireStateChange('off');
            });
            this.addState('on', 'on');
            this.addState('off', 'off');
        }
        activateState(state) {
            switch (state) {
                case 'on':
                    this.tab.tab('show');
                    break;
                case 'off':
                    //Can't turn off tabs, does nothing
                    break;
            }
            return false;
        }
    }
    /**
     * Activate all modal htmlrapier plugin.
     */
    function activate() {
        toggles.addTogglePlugin(function (element, states, toggle) {
            if (element.getAttribute("data-toggle") === 'tab') {
                toggle = new TabStates(element, toggle);
            }
            return toggle;
        });
    }
    exports.activate = activate;
});
define("node_modules/htmlrapier.bootstrap/src/main", ["require","exports","node_modules/htmlrapier.bootstrap/src/modal","node_modules/htmlrapier.bootstrap/src/dropdown","node_modules/htmlrapier.bootstrap/src/tab"], function (require, exports, modal, dropdown, tab) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.setup = void 0;
    modal.activate();
    dropdown.activate();
    tab.activate();
    function setup() {
        //Does not do anything, but makes module work
        return true;
    }
    exports.setup = setup;
});
define("node_modules/htmlrapier.sidebar/src/sidebartoggle", ["require","exports","hr.domquery"], function (require, exports, domQuery) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.activate = exports.SidebarMenuToggle = void 0;
    /**
     * This class toggles bootstrap sidebars when an element has a data-toggle="sidebar" attribute on
     * it. Use data-target="#wrapper" where #wrapper is the query you want to use to find the wrapper to toggle.
     */
    class SidebarMenuToggle {
        constructor(toggleElement) {
            var targetName = toggleElement.getAttribute("data-target");
            this.target = domQuery.first(targetName);
            toggleElement.onclick = evt => this.toggle(evt);
        }
        toggle(evt) {
            evt.preventDefault();
            if (this.target.classList.contains("toggled")) {
                this.target.classList.remove("toggled");
            }
            else {
                this.target.classList.add("toggled");
            }
        }
    }
    exports.SidebarMenuToggle = SidebarMenuToggle;
    /**
     * Activate any toggles that can be automatically activated.
     */
    function activate() {
        var elements = domQuery.all('[data-toggle=sidebar]');
        elements.forEach(i => {
            new SidebarMenuToggle(i);
        });
    }
    exports.activate = activate;
});
define("hr.timedtrigger", ["require","exports","hr.eventdispatcher"], function (require, exports, hr_eventdispatcher_2) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.TimedTrigger = void 0;
    class TimedTrigger {
        constructor(delay) {
            this.handler = new hr_eventdispatcher_2.ActionEventDispatcher();
            if (delay === undefined) {
                delay = 400;
            }
            this.delay = delay;
        }
        setDelay(delay) {
            this.delay = delay;
        }
        cancel() {
            clearTimeout(this.holder);
            this.args = undefined;
        }
        fire(args) {
            this.cancel();
            this.holder = window.setTimeout(() => this.fireHandler(), this.delay);
            this.args = args;
        }
        addListener(listener) {
            this.handler.add(listener);
        }
        removeListener(listener) {
            this.handler.remove(listener);
        }
        fireHandler() {
            this.handler.fire(this.args);
        }
    }
    exports.TimedTrigger = TimedTrigger;
});
define("hr.formbuilder", ["require","exports","hr.components","hr.domquery","hr.bindingcollection","hr.eventdispatcher","hr.formhelper","hr.schema","hr.typeidentifiers","hr.iterable","hr.timedtrigger","node_modules/htmlrapier/src/schemaprocessor"], function (require, exports, component, domquery, hr_bindingcollection_3, event, formHelper, hr_schema_2, typeIds, iterable, hr_timedtrigger_1, schemaprocessor) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.setup = exports.registerFormValueBuilder = exports.IFormValueBuilderArgs = exports.RadioButtonEditor = exports.MultiCheckBoxEditor = exports.SearchItemEditor = exports.SearchResultProvider = exports.SearchResultRow = exports.BasicItemEditor = void 0;
    class FormValuesSource {
        constructor(formValues) {
            this.formValues = formValues;
        }
        getValue(address) {
            var value = this.formValues.getFormValue(address.address[0].key); //for now assume strings, this only supports the current level object
            if (value !== undefined) {
                var data = value.getData();
                //Only return the data if it would be included in the form data
                if (formHelper.shouldAddValue(data)) {
                    return data;
                }
            }
            return undefined;
        }
    }
    class FormValues {
        constructor() {
            this.values = [];
            this.fireChangesToValues = false;
            this.changedEventHandler = new event.ActionEventDispatcher();
            this.complexValues = true; //If this is true, the values passed in are complex, which means they are functions or objects with multiple values, otherwise they are simple and the values should be used directly.
            this.valueSource = new FormValuesSource(this);
        }
        add(value) {
            this.values.push(value);
            if (value.isChangeTrigger) {
                value.onChanged.add(a => this.fireChangedEventHandler(a.getDataName()));
            }
            if (value.respondsToChanges) {
                this.fireChangesToValues = true;
            }
        }
        setError(err, baseName) {
            if (baseName === undefined) {
                baseName = "";
            }
            for (var i = 0; i < this.values.length; ++i) {
                this.values[i].setError(err, baseName);
            }
        }
        setData(data) {
            var dataType = formHelper.getDataType(data);
            var parentRecovery;
            if (this.complexValues && data !== null) { //If this is complex values, lookup the data, also be sure the data isn't null or we will get an error
                switch (dataType) {
                    case formHelper.DataType.Object:
                        parentRecovery = (name) => data[name];
                        break;
                    case formHelper.DataType.Function:
                        parentRecovery = data;
                        break;
                }
            }
            else { //Simple value or null
                if (dataType !== formHelper.DataType.Function) { //Ignore functions for simple data, otherwise take the data as the value (will also happen for null)
                    parentRecovery = (name) => data;
                }
                else {
                    parentRecovery = (name) => null;
                }
            }
            for (var i = 0; i < this.values.length; ++i) { //Go through all items
                var item = this.values[i];
                var itemData = parentRecovery(item.getDataName());
                item.setData(itemData, parentRecovery);
            }
        }
        recoverData(proto) {
            if (this.complexValues) {
                var data = Object.create(proto || null);
                for (var i = 0; i < this.values.length; ++i) {
                    var item = this.values[i];
                    var value = item.getData();
                    if (formHelper.shouldAddValue(value)) { //Do not record undefined, null or empty values
                        data[item.getDataName()] = value;
                    }
                }
                return data;
            }
            else {
                //Simple data only supports one return value, so return the first value item
                if (this.values.length > 0) {
                    return this.values[0].getData();
                }
                return undefined; //No data to get, return undefined.
            }
        }
        changeSchema(componentName, schema, parentElement) {
            var keep = [];
            for (var i = 0; i < this.values.length; ++i) {
                if (!this.values[i].delete()) {
                    keep.push(this.values[i]);
                }
            }
            this.values = keep; //Replace the values with just what we kept
            buildForm(componentName, schema, parentElement, undefined, undefined, this); //Rebuild the form
        }
        hasFormValue(buildName) {
            for (var i = 0; i < this.values.length; ++i) {
                if (this.values[i].getBuildName() === buildName) {
                    return true;
                }
            }
            return false;
        }
        /**
         * Get a form value by the generated build name. This will require it to be fully qualified.
         * @param buildName The build name for the form value to lookup
         */
        getFormValue(buildName) {
            for (var i = 0; i < this.values.length; ++i) {
                if (this.values[i].getBuildName() === buildName) {
                    return this.values[i];
                }
            }
            return undefined;
        }
        /**
         * Get a form value by the data name. This will use the name that will be used when the final object is created.
         * @param dataName The build name for the form value to lookup
         */
        getFormValueByDataName(dataName) {
            for (var i = 0; i < this.values.length; ++i) {
                if (this.values[i].getDataName() === dataName) {
                    return this.values[i];
                }
            }
            return undefined;
        }
        get onChanged() {
            return this.changedEventHandler.modifier;
        }
        fireDataChanged() {
            this.fireChangedEventHandler(null);
        }
        fireChangedEventHandler(propName) {
            if (this.fireChangesToValues) {
                for (var i = 0; i < this.values.length; ++i) {
                    this.values[i].handleChange(this.valueSource);
                }
            }
            this.changedEventHandler.fire({
                formValues: this,
                propertyName: propName
            });
        }
        /**
         * Set this to true to set that the values are complex and should be looked up, otherwise they are simple and
         * should be gotten / set directly.
         * @param complex
         */
        setComplex(complex) {
            this.complexValues = complex;
        }
    }
    const indexMax = 2147483647; //Sticking with 32 bit;
    class InfiniteIndex {
        constructor() {
            this.num = 0;
            this.base = "";
        }
        getNext() {
            ++this.num;
            if (this.num === indexMax) {
                this.base += "b"; //Each time we hit index max we just add a 'b' to the base
                this.num = 0;
            }
            return this.base + this.num;
        }
    }
    function sharedClearer(i) {
        return "";
    }
    class ArrayEditorRow {
        constructor(bindings, schema, name) {
            this.bindings = bindings;
            this.name = name;
            this.removed = new event.ActionEventDispatcher();
            this.root = this.bindings.rootElement;
            var itemHandle = this.bindings.getHandle("item"); //Also supports adding to a handle named item, otherwise uses the root
            if (itemHandle !== null) {
                this.root = itemHandle;
            }
            this.formValues = buildForm('hr.forms.default', schema, this.root, this.name);
            bindings.setListener(this);
        }
        get onRemoved() {
            return this.removed.modifier;
        }
        remove(evt) {
            if (evt) {
                evt.preventDefault();
            }
            this.setError(formHelper.getSharedClearingValidator(), "");
            this.pooled = this.bindings.pool();
            this.setData(sharedClearer);
            this.removed.fire(this);
        }
        restore() {
            if (this.pooled) {
                this.pooled.restore(null);
            }
        }
        setError(err, baseName) {
            this.formValues.setError(err, baseName);
        }
        getData() {
            var data = this.formValues.recoverData(null);
            if (typeIds.isObject(data)) {
                for (var key in data) { //This will pass if there is a key in data
                    return data;
                }
                return null; //Return null if the data returned has no keys in it, which means it is empty.
            }
            return data; //Not an object, just return the data
        }
        setData(data) {
            this.formValues.setData(data);
            this.setError(formHelper.getSharedClearingValidator(), "");
        }
    }
    class ArrayEditor {
        constructor(args, schema) {
            this.schema = schema;
            this.pooledRows = [];
            this.rows = [];
            this.indexGen = new InfiniteIndex();
            var baseTitle = args.item.title;
            var bindings = args.bindings;
            this.name = args.item.name;
            this.buildName = args.item.buildName;
            this.bindings = args.bindings;
            this.generated = args.generated;
            this.displayExpression = args.item.displayExpression;
            this.itemsView = bindings.getView("items");
            bindings.setListener(this);
            if (this.schema.title === undefined) {
                this.schema = Object.create(this.schema);
                if (baseTitle !== undefined) {
                    this.schema.title = baseTitle + " Item";
                }
                else {
                    this.schema.title = "Item";
                }
            }
            this.errorToggle = this.bindings.getToggle(this.buildName + "Error");
            this.errorMessage = this.bindings.getView(this.buildName + "ErrorMessage");
            this.hideToggle = this.bindings.getToggle(this.buildName + "Hide");
        }
        setError(err, baseName) {
            for (var i = 0; i < this.rows.length; ++i) {
                var rowName = err.addIndex(baseName, this.name, i);
                this.rows[i].setError(err, rowName);
            }
            var errorName = err.addKey(baseName, this.name);
            if (err.hasValidationError(errorName)) {
                this.errorToggle.on();
                this.errorMessage.setData(err.getValidationError(errorName));
            }
            else {
                this.errorToggle.off();
                this.errorMessage.setData("");
            }
        }
        add(evt) {
            evt.preventDefault();
            this.addRow();
        }
        addRow() {
            if (this.pooledRows.length == 0) {
                this.itemsView.appendData(this.schema, (bindings, data) => {
                    var row = new ArrayEditorRow(bindings, data, this.buildName + '-' + this.indexGen.getNext());
                    row.onRemoved.add((r) => {
                        this.rows.splice(this.rows.indexOf(r), 1); //It will always be there
                        this.pooledRows.push(r);
                    });
                    this.rows.push(row);
                });
            }
            else {
                var row = this.pooledRows.pop();
                row.restore();
                this.rows.push(row);
            }
        }
        getData() {
            var items = [];
            for (var i = 0; i < this.rows.length; ++i) {
                items.push(this.rows[i].getData());
            }
            if (items.length > 0) {
                return items;
            }
            return undefined;
        }
        setData(data) {
            var i = 0;
            if (data) {
                //Make sure data is an array
                if (!typeIds.isArray(data)) {
                    data = [data];
                }
                for (; i < data.length; ++i) {
                    if (i >= this.rows.length) {
                        this.addRow();
                    }
                    this.rows[i].setData(data[i]);
                }
            }
            for (; i < this.rows.length;) { //Does not increment, removing rows will de index for us
                this.rows[i].remove();
            }
        }
        getBuildName() {
            return this.buildName;
        }
        getDataName() {
            return this.name;
        }
        delete() {
            if (this.generated) {
                this.bindings.remove();
            }
            return this.generated;
        }
        get isChangeTrigger() {
            return false;
        }
        get onChanged() {
            return null;
        }
        get respondsToChanges() {
            return this.displayExpression !== undefined;
        }
        handleChange(values) {
            if (this.displayExpression) {
                if (this.displayExpression.isTrue(values)) {
                    this.hideToggle.off();
                }
                else {
                    this.hideToggle.on();
                }
            }
        }
    }
    class ObjectEditor {
        constructor(args, schema) {
            this.schema = schema;
            var baseTitle = args.item.title;
            var bindings = args.bindings;
            this.name = args.item.name;
            this.buildName = args.item.buildName;
            this.bindings = args.bindings;
            this.generated = args.generated;
            this.displayExpression = args.item.displayExpression;
            this.itemsView = bindings.getView("items");
            bindings.setListener(this);
            if (this.schema.title === undefined) {
                this.schema = Object.create(this.schema);
                if (baseTitle !== undefined) {
                    this.schema.title = baseTitle + " Item";
                }
                else {
                    this.schema.title = "Item";
                }
            }
            this.errorToggle = this.bindings.getToggle(this.buildName + "Error");
            this.errorMessage = this.bindings.getView(this.buildName + "ErrorMessage");
            this.hideToggle = this.bindings.getToggle(this.buildName + "Hide");
            this.itemsView.appendData(this.schema, (bindings, data) => {
                this.row = new ArrayEditorRow(bindings, data, this.buildName + '-0');
            });
        }
        setError(err, baseName) {
            var rowName = err.addKey(baseName, this.name);
            this.row.setError(err, rowName);
            var errorName = err.addKey(baseName, this.name);
            if (err.hasValidationError(errorName)) {
                this.errorToggle.on();
                this.errorMessage.setData(err.getValidationError(errorName));
            }
            else {
                this.errorToggle.off();
                this.errorMessage.setData("");
            }
        }
        getData() {
            return this.row.getData();
        }
        setData(data) {
            if (data === undefined) {
                data = null;
            }
            this.row.setData(data);
        }
        getBuildName() {
            return this.buildName;
        }
        getDataName() {
            return this.name;
        }
        delete() {
            if (this.generated) {
                this.bindings.remove();
            }
            return this.generated;
        }
        get isChangeTrigger() {
            return false;
        }
        get onChanged() {
            return null;
        }
        get respondsToChanges() {
            return this.displayExpression !== undefined;
        }
        handleChange(values) {
            if (this.displayExpression) {
                if (this.displayExpression.isTrue(values)) {
                    this.hideToggle.off();
                }
                else {
                    this.hideToggle.on();
                }
            }
        }
    }
    class BasicItemEditor {
        constructor(args) {
            this.changedEventHandler = null;
            this.name = args.item.name;
            this.buildName = args.item.buildName;
            this.bindings = args.bindings;
            this.generated = args.generated;
            this.element = args.inputElement;
            this.displayExpression = args.item.displayExpression;
            if (args.item["x-ui-disabled"] === true || args.item.readOnly === true || args.item["x-readOnly"] === true) {
                this.element.setAttribute("disabled", "");
            }
            var self = this;
            this.changedEventHandler = new event.ActionEventDispatcher();
            this.element.addEventListener("change", e => {
                self.changedEventHandler.fire(self);
            });
            this.errorToggle = this.bindings.getToggle(this.buildName + "Error");
            this.errorMessage = this.bindings.getView(this.buildName + "ErrorMessage");
            this.hideToggle = this.bindings.getToggle(this.buildName + "Hide");
            //If there are values defined for the element, put them on the page, this works for both
            //predefined and generated elements, which allows you to have predefined selects that can have dynamic values
            if (args.item.buildValues !== undefined) {
                if (IsSelectElement(args.inputElement) || HasDatalist(args.inputElement)) {
                    for (var q = 0; q < args.item.buildValues.length; ++q) {
                        var current = args.item.buildValues[q];
                        this.addOption(current.label, current.value);
                    }
                }
                if (HasDatalist(args.inputElement)) {
                    this.datalistValues = args.item.buildValues;
                }
            }
        }
        addOption(label, value) {
            if (IsSelectElement(this.element)) {
                var option = document.createElement("option");
                option.text = label;
                if (value !== null && value !== undefined) {
                    option.value = value;
                }
                else {
                    option.value = ""; //Make sure this stays as empty string, which will be null for these forms
                }
                this.element.options.add(option);
            }
            else if (HasDatalist(this.element)) {
                //Dataset options are different, we just handle the option value
                var option = document.createElement("option");
                option.value = label;
                this.element.list.appendChild(option);
            }
        }
        setError(err, baseName) {
            var errorName = err.addKey(baseName, this.name);
            if (err.hasValidationError(errorName)) {
                this.errorToggle.on();
                this.errorMessage.setData(err.getValidationError(errorName));
            }
            else {
                this.errorToggle.off();
                this.errorMessage.setData("");
            }
        }
        getData() {
            var value = formHelper.readValue(this.element);
            if (this.datalistValues !== undefined) {
                //Reverse lookup value from the datalist values
                for (var q = 0; q < this.datalistValues.length; ++q) {
                    var current = this.datalistValues[q];
                    if (current.label == value) {
                        value = current.value;
                        break;
                    }
                }
            }
            return value;
        }
        setData(data) {
            if (this.datalistValues !== undefined) {
                //See if there is a datalist value to display instead
                for (var q = 0; q < this.datalistValues.length; ++q) {
                    var current = this.datalistValues[q];
                    if (current.value == data) {
                        data = current.label;
                        break;
                    }
                }
            }
            this.doSetValue(data);
            this.setError(formHelper.getSharedClearingValidator(), "");
        }
        /**
         * This function actually sets the value for the element, if you are creating a subclass for BasicItemEditor
         * you should override this function to actually set the value instead of overriding setData,
         * this way the other logic for setting data (getting the actual data, clearing errors, computing defaults) can
         * still happen. There is no need to call super.doSetData as that will only set the data on the form
         * using the formHelper.setValue function.
         * @param itemData The data to set for the item, this is the final value that should be set, no lookup needed.
         */
        doSetValue(itemData) {
            formHelper.setValue(this.element, itemData);
        }
        getBuildName() {
            return this.buildName;
        }
        getDataName() {
            return this.name;
        }
        delete() {
            if (this.generated) {
                this.bindings.remove();
            }
            return this.generated;
        }
        get isChangeTrigger() {
            return this.changedEventHandler !== null;
        }
        get onChanged() {
            if (this.changedEventHandler !== null) {
                return this.changedEventHandler.modifier;
            }
            return null;
        }
        get respondsToChanges() {
            return this.displayExpression !== undefined;
        }
        handleChange(values) {
            if (this.displayExpression) {
                if (this.displayExpression.isTrue(values)) {
                    this.hideToggle.off();
                }
                else {
                    this.hideToggle.on();
                }
            }
        }
    }
    exports.BasicItemEditor = BasicItemEditor;
    class SearchResultRow {
        constructor(searchEditor, bindings, data) {
            this.searchEditor = searchEditor;
            this.data = data;
            bindings.setListener(this);
        }
        selectItem(evt) {
            evt.preventDefault();
            this.searchEditor.setDataFromSearchResult(this.data);
        }
    }
    exports.SearchResultRow = SearchResultRow;
    class SearchResultProviderFactory {
        constructor() {
            this.factories = {};
        }
        addFactory(name, factory) {
            this.factories[name] = factory;
        }
        create(name) {
            var factory = this.factories[name];
            if (factory === undefined) {
                throw new Error("A Search Provider Factory named " + name + " cannot be found. Did you forget to register it?");
            }
            return factory();
        }
    }
    exports.SearchResultProvider = new SearchResultProviderFactory();
    class SearchItemEditor {
        constructor(args) {
            this.changedEventHandler = null;
            this.typingTrigger = new hr_timedtrigger_1.TimedTrigger(400);
            this.name = args.item.name;
            this.buildName = args.item.buildName;
            this.bindings = args.bindings;
            this.generated = args.generated;
            this.element = args.inputElement;
            this.displayExpression = args.item.displayExpression;
            this.popupToggle = this.bindings.getToggle("popup");
            this.resultsView = this.bindings.getView("results");
            this.searchFocusParent = this.bindings.getHandle("searchFocusParent");
            this.typingTrigger.addListener(arg => this.runSearch(arg));
            this.searchResultProvider = args.searchResultProviderFactory.create(args.item["x-search"].provider);
            this.formValues = args.formValues;
            if (args.item["x-ui-disabled"] === true || args.item.readOnly === true) {
                this.element.setAttribute("disabled", "");
            }
            this.currentValueProperty = args.item["x-search"].valueProperty;
            var self = this;
            this.changedEventHandler = new event.ActionEventDispatcher();
            this.bindings.setListener(this);
            this.errorToggle = this.bindings.getToggle(this.buildName + "Error");
            this.errorMessage = this.bindings.getView(this.buildName + "ErrorMessage");
            this.hideToggle = this.bindings.getToggle(this.buildName + "Hide");
            //If there are values defined for the element, put them on the page, this works for both
            //predefined and generated elements, which allows you to have predefined selects that can have dynamic values
            if (args.item.buildValues !== undefined) {
                if (IsSelectElement(args.inputElement)) {
                    for (var q = 0; q < args.item.buildValues.length; ++q) {
                        var current = args.item.buildValues[q];
                        this.addOption(current.label, current.value);
                    }
                }
            }
        }
        addOption(label, value) {
            if (IsSelectElement(this.element)) {
                var option = document.createElement("option");
                option.text = label;
                if (value !== null && value !== undefined) {
                    option.value = value;
                }
                else {
                    option.value = ""; //Make sure this stays as empty string, which will be null for these forms
                }
                this.element.options.add(option);
            }
        }
        setError(err, baseName) {
            var errorName = err.addKey(baseName, this.name);
            if (err.hasValidationError(errorName)) {
                this.errorToggle.on();
                this.errorMessage.setData(err.getValidationError(errorName));
            }
            else {
                this.errorToggle.off();
                this.errorMessage.setData("");
            }
        }
        getData() {
            return this.currentData;
        }
        setData(data, parentDataAccess) {
            this.currentData = data;
            if (this.currentValueProperty) {
                data = parentDataAccess(this.currentValueProperty);
            }
            this.currentDisplay = data;
            formHelper.setValue(this.element, data);
            this.setError(formHelper.getSharedClearingValidator(), "");
        }
        getBuildName() {
            return this.buildName;
        }
        getDataName() {
            return this.name;
        }
        delete() {
            if (this.generated) {
                this.bindings.remove();
            }
            return this.generated;
        }
        get isChangeTrigger() {
            return this.changedEventHandler !== null;
        }
        get onChanged() {
            if (this.changedEventHandler !== null) {
                return this.changedEventHandler.modifier;
            }
            return null;
        }
        get respondsToChanges() {
            return this.displayExpression !== undefined;
        }
        handleChange(values) {
            if (this.displayExpression) {
                if (this.displayExpression.isTrue(values)) {
                    this.hideToggle.off();
                }
                else {
                    this.hideToggle.on();
                }
            }
        }
        stopSearch(evt) {
            evt.preventDefault();
            if (!this.searchFocusParent.contains(evt.relatedTarget)) {
                this.typingTrigger.cancel();
                //If the current value is null, undefined or empty clear the input.
                if (this.element.value === "" || this.element.value === null || this.element.value === undefined) {
                    this.currentDisplay = "";
                    this.currentData = null;
                }
                formHelper.setValue(this.element, this.currentDisplay);
                this.popupToggle.off();
            }
        }
        updateSearch(evt) {
            evt.preventDefault();
            this.typingTrigger.fire(this);
        }
        setDataFromSearchResult(result) {
            formHelper.setValue(this.element, result.title);
            this.currentData = result.value;
            this.currentDisplay = result.title;
            this.popupToggle.off();
            this.changedEventHandler.fire(this);
        }
        runSearch(arg) {
            return __awaiter(this, void 0, void 0, function* () {
                try {
                    this.resultsView.setData({
                        title: "Loading...",
                        value: null
                    }, null, () => "message");
                    this.popupToggle.on();
                    var searchTerm = formHelper.readValue(this.element);
                    this.lastSearchTerm = searchTerm;
                    var self = this;
                    var results = yield this.searchResultProvider.search({
                        searchTerm: searchTerm,
                        getFormValue: (name) => {
                            var formValue = self.formValues.getFormValueByDataName(name);
                            if (formValue) {
                                return formValue.getData();
                            }
                            return undefined;
                        }
                    });
                    if (this.lastSearchTerm === searchTerm) {
                        this.resultsView.setData(results, (element, data) => new SearchResultRow(this, new hr_bindingcollection_3.BindingCollection(element.elements), data));
                    }
                }
                catch (err) {
                    this.resultsView.setData({
                        title: "An error occured searching for data. Please try again later.",
                        value: null
                    }, null, () => "message");
                    console.log(err.message || err);
                }
            });
        }
    }
    exports.SearchItemEditor = SearchItemEditor;
    class MultiCheckBoxEditor {
        constructor(args) {
            this.changedEventHandler = null;
            this.checkboxElements = [];
            this.nullCheckboxElement = null;
            this.selectAllElement = null;
            this.itemsView = args.bindings.getView("items");
            this.name = args.item.name;
            this.buildName = args.item.buildName;
            this.bindings = args.bindings;
            this.bindings.setListener(this);
            this.generated = args.generated;
            this.displayExpression = args.item.displayExpression;
            this.disabled = args.item["x-ui-disabled"] === true || args.item.readOnly === true;
            this.changedEventHandler = new event.ActionEventDispatcher();
            if (args.item.buildValues !== undefined) {
                var uidCount = 0;
                var iter = new iterable.Iterable(args.item.buildValues).select(i => {
                    var r = Object.create(i);
                    r.uniqueId = args.item.uniqueId + "-hr-item-id-" + uidCount++;
                    return r;
                });
                this.itemsView.setData(iter, (created, item) => this.checkElementCreated(created, item));
            }
            this.errorToggle = this.bindings.getToggle(this.buildName + "Error");
            this.errorMessage = this.bindings.getView(this.buildName + "ErrorMessage");
            this.hideToggle = this.bindings.getToggle(this.buildName + "Hide");
            this.selectAllElement = this.bindings.getHandle("selectAll");
        }
        setError(err, baseName) {
            var errorName = err.addKey(baseName, this.name);
            if (err.hasValidationError(errorName)) {
                this.errorToggle.on();
                this.errorMessage.setData(err.getValidationError(errorName));
            }
            else {
                this.errorToggle.off();
                this.errorMessage.setData("");
            }
        }
        getData() {
            var results = [];
            var dataOnlyNull = true; //If we only read null data values, return null instead of array with null in it
            for (var i = 0; i < this.checkboxElements.length; ++i) {
                var check = this.checkboxElements[i];
                var data = formHelper.readValue(check);
                if (data !== undefined) {
                    results.push(data);
                    dataOnlyNull = dataOnlyNull && data === null;
                }
            }
            if (results.length > 0) {
                if (dataOnlyNull) {
                    return null;
                }
                return results;
            }
            return undefined;
        }
        setData(data) {
            this.doSetValue(data);
            this.setError(formHelper.getSharedClearingValidator(), "");
        }
        /**
         * This function actually sets the value for the element, if you are creating a subclass for BasicItemEditor
         * you should override this function to actually set the value instead of overriding setData,
         * this way the other logic for setting data (getting the actual data, clearing errors, computing defaults) can
         * still happen. There is no need to call super.doSetData as that will only set the data on the form
         * using the formHelper.setValue function.
         * @param itemData The data to set for the item, this is the final value that should be set, no lookup needed.
         */
        doSetValue(itemData) {
            if (itemData !== null && itemData !== undefined && itemData.length > 0) {
                for (var i = 0; i < this.checkboxElements.length; ++i) {
                    var check = this.checkboxElements[i];
                    formHelper.setValue(check, looseIndexOf(itemData, check.value) !== -1);
                }
                if (this.nullCheckboxElement !== null) {
                    formHelper.setValue(this.nullCheckboxElement, false);
                }
            }
            else {
                this.clearChecks();
                if (this.nullCheckboxElement !== null) {
                    formHelper.setValue(this.nullCheckboxElement, true);
                }
            }
            //Always clear select all
            if (this.selectAllElement !== null) {
                formHelper.setValue(this.selectAllElement, false);
            }
        }
        addOption(label, value) {
            this.itemsView.appendData({ label: label, value: value }, (created, item) => this.checkElementCreated(created, item));
        }
        getBuildName() {
            return this.buildName;
        }
        getDataName() {
            return this.name;
        }
        delete() {
            if (this.generated) {
                this.bindings.remove();
            }
            return this.generated;
        }
        get isChangeTrigger() {
            return this.changedEventHandler !== null;
        }
        get onChanged() {
            if (this.changedEventHandler !== null) {
                return this.changedEventHandler.modifier;
            }
            return null;
        }
        get respondsToChanges() {
            return this.displayExpression !== undefined;
        }
        handleChange(values) {
            if (this.displayExpression) {
                if (this.displayExpression.isTrue(values)) {
                    this.hideToggle.off();
                }
                else {
                    this.hideToggle.on();
                }
            }
        }
        selectAll(evt) {
            for (var i = 0; i < this.checkboxElements.length; ++i) {
                var check = this.checkboxElements[i];
                formHelper.setValue(check, true);
            }
            if (this.nullCheckboxElement !== null) {
                formHelper.setValue(this.nullCheckboxElement, false);
            }
        }
        clearChecks() {
            for (var i = 0; i < this.checkboxElements.length; ++i) {
                var check = this.checkboxElements[i];
                formHelper.setValue(check, false);
            }
        }
        checkElementCreated(created, item) {
            var element = created.getHandle("check");
            if (item.value !== null) {
                this.checkboxElements.push(element);
                element.addEventListener("change", e => {
                    if (this.nullCheckboxElement !== null) {
                        formHelper.setValue(this.nullCheckboxElement, false);
                    }
                    if (this.selectAllElement !== null) {
                        formHelper.setValue(this.selectAllElement, false);
                    }
                    this.changedEventHandler.fire(this);
                });
            }
            else {
                this.nullCheckboxElement = element;
                element.addEventListener("change", e => {
                    this.doSetValue(null); //Clear values
                    this.changedEventHandler.fire(this);
                });
            }
            if (this.disabled) {
                element.setAttribute("disabled", "");
            }
        }
    }
    exports.MultiCheckBoxEditor = MultiCheckBoxEditor;
    function looseIndexOf(array, find) {
        for (var i = 0; i < array.length; ++i) {
            if (array[i] == find) {
                return i;
            }
        }
        return -1;
    }
    class RadioButtonEditor {
        constructor(args) {
            this.changedEventHandler = null;
            this.elements = [];
            this.nullElement = null;
            this.itemsView = args.bindings.getView("items");
            this.name = args.item.name;
            this.buildName = args.item.buildName;
            this.bindings = args.bindings;
            this.generated = args.generated;
            this.displayExpression = args.item.displayExpression;
            this.disabled = args.item["x-ui-disabled"] === true || args.item.readOnly === true;
            this.changedEventHandler = new event.ActionEventDispatcher();
            var uidCount = 0;
            var iter = new iterable.Iterable(args.item.buildValues).select(i => {
                var shadow = Object.create(i);
                shadow.name = this.buildName;
                shadow.uniqueId = args.item.uniqueId + "-hr-item-id-" + uidCount++;
                return shadow;
            });
            this.itemsView.setData(iter, (created, item) => this.radioElementCreated(created, item));
            this.errorToggle = this.bindings.getToggle(this.buildName + "Error");
            this.errorMessage = this.bindings.getView(this.buildName + "ErrorMessage");
            this.hideToggle = this.bindings.getToggle(this.buildName + "Hide");
        }
        addOption(label, value) {
            this.itemsView.appendData({ label: label, value: value }, (created, item) => this.radioElementCreated(created, item));
        }
        setError(err, baseName) {
            var errorName = err.addKey(baseName, this.name);
            if (err.hasValidationError(errorName)) {
                this.errorToggle.on();
                this.errorMessage.setData(err.getValidationError(errorName));
            }
            else {
                this.errorToggle.off();
                this.errorMessage.setData("");
            }
        }
        getData() {
            for (var i = 0; i < this.elements.length; ++i) {
                var radio = this.elements[i];
                if (radio.checked) {
                    if (radio === this.nullElement) {
                        return null;
                    }
                    return formHelper.readValue(radio);
                }
            }
            return undefined;
        }
        setData(data) {
            this.doSetValue(data);
            this.setError(formHelper.getSharedClearingValidator(), "");
        }
        /**
         * This function actually sets the value for the element, if you are creating a subclass for BasicItemEditor
         * you should override this function to actually set the value instead of overriding setData,
         * this way the other logic for setting data (getting the actual data, clearing errors, computing defaults) can
         * still happen. There is no need to call super.doSetData as that will only set the data on the form
         * using the formHelper.setValue function.
         * @param itemData The data to set for the item, this is the final value that should be set, no lookup needed.
         */
        doSetValue(itemData) {
            if (itemData !== null && itemData !== undefined) {
                for (var i = 0; i < this.elements.length; ++i) {
                    var check = this.elements[i];
                    if (check.value === itemData) {
                        formHelper.setValue(check, true);
                    }
                }
            }
            else {
                if (this.nullElement !== null) {
                    formHelper.setValue(this.nullElement, true);
                }
            }
        }
        getBuildName() {
            return this.buildName;
        }
        getDataName() {
            return this.name;
        }
        delete() {
            if (this.generated) {
                this.bindings.remove();
            }
            return this.generated;
        }
        get isChangeTrigger() {
            return this.changedEventHandler !== null;
        }
        get onChanged() {
            if (this.changedEventHandler !== null) {
                return this.changedEventHandler.modifier;
            }
            return null;
        }
        get respondsToChanges() {
            return this.displayExpression !== undefined;
        }
        handleChange(values) {
            if (this.displayExpression) {
                if (this.displayExpression.isTrue(values)) {
                    this.hideToggle.off();
                }
                else {
                    this.hideToggle.on();
                }
            }
        }
        radioElementCreated(created, item) {
            var element = created.getHandle("radio");
            //If this is the null value item, keep track of its element separately
            if (item.value === null) {
                this.nullElement = element;
            }
            this.elements.push(element);
            element.addEventListener("change", e => {
                this.changedEventHandler.fire(this);
            });
            if (this.disabled) {
                element.setAttribute("disabled", "");
            }
        }
    }
    exports.RadioButtonEditor = RadioButtonEditor;
    class IFormValueBuilderArgs {
    }
    exports.IFormValueBuilderArgs = IFormValueBuilderArgs;
    function processFormProperty(prop, schema, uniqueId, name, buildName, formItemClass) {
        var result = schemaprocessor.processProperty(prop, schema, uniqueId, name, buildName);
        if (formItemClass !== null) {
            result.formItemClass = formItemClass; //Don't include this if the attribute came back null
        }
        return result;
    }
    var propertyUniqueIndex = new InfiniteIndex();
    function getNextIndex() {
        return "hr-form-prop-" + propertyUniqueIndex.getNext();
    }
    function buildForm(componentName, schema, parentElement, baseName, ignoreExisting, formValues) {
        if (ignoreExisting === undefined) {
            ignoreExisting = false;
        }
        if (baseName === undefined) {
            baseName = "";
        }
        if (formValues === undefined) {
            formValues = new FormValues();
        }
        var formItemClass = parentElement.getAttribute("data-hr-form-item-class");
        var dynamicInsertParent = parentElement;
        var dynamicInsertElement = domquery.first("[data-hr-form-end]", parentElement);
        if (dynamicInsertElement !== null) {
            //Adjust parent to end element if one was found
            dynamicInsertParent = dynamicInsertElement.parentElement;
        }
        var propArray = [];
        var props = schema.properties;
        if (props === undefined) {
            //No props, add the schema itself as a property, this also means our formValues are simple values
            propArray.push(processFormProperty(schema, schema, getNextIndex(), baseName, baseName, formItemClass));
            formValues.setComplex(false);
        }
        else {
            //There are properties, so the formValues are complex values
            formValues.setComplex(true);
            var baseNameWithSep = baseName;
            if (baseNameWithSep !== "") {
                baseNameWithSep = baseNameWithSep + '-';
            }
            for (var key in props) {
                propArray.push(processFormProperty(props[key], schema, getNextIndex(), key, baseNameWithSep + key, formItemClass));
            }
            propArray.sort((a, b) => {
                return a.buildOrder - b.buildOrder;
            });
        }
        for (var i = 0; i < propArray.length; ++i) {
            var item = propArray[i];
            var existing = domquery.first('[name=' + item.name + ']', parentElement);
            var bindings = null;
            var generated = false;
            if (ignoreExisting || existing === null) {
                var placeholder = domquery.first('[data-hr-form-place=' + item.name + ']', parentElement);
                var insertElement = dynamicInsertElement;
                var insertParent = dynamicInsertParent;
                if (placeholder !== null) {
                    insertElement = placeholder;
                    insertParent = insertElement.parentElement;
                }
                //Create component if it is null
                var actualComponentName = (item.xUi && item.xUi.overrideComponent) || componentName;
                if (!component.isDefined(actualComponentName)) {
                    //If the component is not defined, fall back to the original
                    actualComponentName = componentName;
                }
                bindings = component.one(actualComponentName, new FormComponentTextStream(item), insertParent, insertElement, undefined, (i) => {
                    return i.getDataObject().buildType;
                });
                //Refresh existing, should be found now, when doing this always grab the last match.
                var elements = domquery.all('[name=' + item.buildName + ']', parentElement);
                if (elements.length > 0) {
                    existing = elements[elements.length - 1];
                }
                else {
                    existing = null;
                }
                generated = true;
            }
            else {
                //If this was an exising element, see if we should reuse what was found before, if the formValues already has an item, do nothing here
                if (!formValues.hasFormValue(item.buildName)) {
                    //Not found, try to create a binding collection for it
                    //Walk up element parents trying to find one with a data-hr-input-start attribute on it.
                    var bindParent = existing;
                    while (bindings === null && bindParent !== null && bindParent !== parentElement) {
                        if (bindParent.hasAttribute("data-hr-input-start")) {
                            bindings = new hr_bindingcollection_3.BindingCollection(bindParent);
                        }
                        else {
                            bindParent = bindParent.parentElement;
                        }
                    }
                    if (bindings === null) { //Could not find form data-hr-input-start element, just use the element as the base for the binding collection
                        bindings = new hr_bindingcollection_3.BindingCollection(existing);
                    }
                    generated = false;
                }
            }
            if (bindings !== null) {
                formValues.add(createBindings({
                    bindings: bindings,
                    generated: generated,
                    item: item,
                    schema: schema,
                    inputElement: existing,
                    searchResultProviderFactory: exports.SearchResultProvider,
                    formValues: formValues
                }));
            }
            //If this is a child form, mark the element as a child so the form serializer will ignore it
            if (IsElement(existing)) {
                existing.setAttribute("data-hr-form-level", baseName);
            }
        }
        return formValues;
    }
    function createBindings(args) {
        //See if there is a custom handler first
        for (var i = 0; i < formValueBuilders.length; ++i) {
            var created = formValueBuilders[i].create(args);
            if (created !== null) {
                return created;
            }
        }
        if (args.item.buildType === "arrayEditor") {
            let itemSchema = hr_schema_2.resolveRef(args.item.items, args.schema);
            //This will treat the schema as a root schema, so setup parent if needed
            if (itemSchema !== args.schema) { //Make sure we didnt just get the original schema back
                //If so, set the parent 
                itemSchema = Object.create(itemSchema);
                itemSchema.parent = args.schema;
            }
            return new ArrayEditor(args, itemSchema);
        }
        else if (args.item.buildType === "objectEditor") {
            let objectSchema = hr_schema_2.getOneOfSchema(args.item, args.schema);
            //This will treat the schema as a root schema, so setup parent if needed
            if (objectSchema !== args.schema) { //Make sure we didnt just get the original schema back
                //If so, set the parent 
                objectSchema = Object.create(objectSchema);
                objectSchema.parent = args.schema;
            }
            return new ObjectEditor(args, objectSchema);
        }
        else if (args.item.buildType === "multicheckbox") {
            return new MultiCheckBoxEditor(args);
        }
        else if (args.item.buildType === "radiobutton") {
            return new RadioButtonEditor(args);
        }
        else if (args.item.buildType === "search") {
            return new SearchItemEditor(args);
        }
        else {
            return new BasicItemEditor(args);
        }
    }
    function IsElement(element) {
        return element && (element.nodeName !== undefined);
    }
    function IsSelectElement(element) {
        return element && (element.nodeName === 'SELECT');
    }
    function HasDatalist(element) {
        return element && (element.nodeName === 'INPUT' && element.list !== null && element.list !== undefined);
    }
    var formValueBuilders = [];
    function registerFormValueBuilder(builder) {
        formValueBuilders.push(builder);
    }
    exports.registerFormValueBuilder = registerFormValueBuilder;
    //Register form build function
    formHelper.setBuildFormFunc(buildForm);
    class FormComponentTextStream {
        constructor(data) {
            this.data = data;
        }
        getDataObject() {
            return this.data;
        }
        getRawData(address) {
            return address.read(this.data);
        }
        getFormatted(data, address) {
            if (data !== undefined) { //Don't return undefined, return empty string instead
                return data;
            }
            return "";
        }
    }
    function setup() {
        //Doesn't do anything, but makes module load correctly.
        return true;
    }
    exports.setup = setup;
});
define("hr.componentbuilder", ["require","exports","hr.bindingcollection","hr.textstream"], function (require, exports, hr_bindingcollection_4, hr_textstream_2) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.ComponentBuilder = exports.VariantBuilder = void 0;
    class VariantBuilder {
        constructor(componentString) {
            this.componentString = componentString;
            this.tokenizedString = null;
        }
        create(data, parentComponent, insertBeforeSibling) {
            this.ensureTokenizer();
            return createItem(data, this.tokenizedString, parentComponent, insertBeforeSibling);
        }
        ensureTokenizer() {
            if (this.tokenizedString === null) {
                this.tokenizedString = new hr_textstream_2.TextStream(this.componentString);
            }
        }
    }
    exports.VariantBuilder = VariantBuilder;
    class ComponentBuilder {
        constructor(componentString) {
            this.componentString = componentString;
            this.variants = {};
            this.tokenizedString = null;
        }
        create(data, parentComponent, insertBeforeSibling, variant) {
            if (variant !== null && this.variants.hasOwnProperty(variant)) {
                return this.variants[variant].create(data, parentComponent, insertBeforeSibling);
            }
            this.ensureTokenizer();
            return createItem(data, this.tokenizedString, parentComponent, insertBeforeSibling);
        }
        addVariant(name, variantBuilder) {
            this.variants[name] = variantBuilder;
        }
        ensureTokenizer() {
            if (this.tokenizedString === null) {
                this.tokenizedString = new hr_textstream_2.TextStream(this.componentString);
            }
        }
    }
    exports.ComponentBuilder = ComponentBuilder;
    //Component creation function
    function createItem(data, componentStringStream, parentComponent, insertBeforeSibling) {
        var itemMarkup = componentStringStream.format(data);
        var newItems = str2DOMElement(itemMarkup);
        var arrayedItems = [];
        for (var i = 0; i < newItems.length; ++i) {
            var newItem = newItems[i];
            parentComponent.insertBefore(newItem, insertBeforeSibling);
            arrayedItems.push(newItem);
        }
        return new hr_bindingcollection_4.BindingCollection(arrayedItems);
    }
    //Actual creation function
    function str2DOMElement(html) {
        //From j Query and the discussion on http://krasimirtsonev.com/blog/article/Revealing-the-magic-how-to-properly-convert-HTML-string-to-a-DOM-element
        //Modified, does not support body tags and returns collections of children
        var wrapMap = {
            option: [1, "<select multiple='multiple'>", "</select>"],
            legend: [1, "<fieldset>", "</fieldset>"],
            area: [1, "<map>", "</map>"],
            param: [1, "<object>", "</object>"],
            thead: [1, "<table>", "</table>"],
            tr: [2, "<table><tbody>", "</tbody></table>"],
            col: [2, "<table><tbody></tbody><colgroup>", "</colgroup></table>"],
            td: [3, "<table><tbody><tr>", "</tr></tbody></table>"],
            body: [0, "", ""],
            _default: [1, "<div>", "</div>"]
        };
        wrapMap.optgroup = wrapMap.option;
        wrapMap.tbody = wrapMap.tfoot = wrapMap.colgroup = wrapMap.caption = wrapMap.thead;
        wrapMap.th = wrapMap.td;
        var match = /<\s*\w.*?>/g.exec(html);
        var element = document.createElement('div');
        if (match != null) {
            var tag = match[0].replace(/</g, '').replace(/>/g, '').split(' ')[0];
            var map = wrapMap[tag] || wrapMap._default, element;
            html = map[1] + html + map[2];
            element.innerHTML = html;
            // Descend through wrappers to the right content
            var j = map[0];
            while (j--) {
                element = element.lastChild;
            }
        }
        else {
            element.innerHTML = html;
        }
        return element.childNodes;
    }
});
define("hr.componentgatherer", ["require","exports","hr.components","hr.ignored","hr.iterable","hr.componentbuilder"], function (require, exports, components, ignoredNodes, hr_iterable_2, hr_componentbuilder_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.setup = void 0;
    var browserSupportsTemplates = 'content' in document.createElement('template');
    var anonTemplateIndex = 0;
    var extractedBuilders = {};
    function buildTemplateElements(nestedElementsStack) {
        if (nestedElementsStack.length > 0) {
            var currentTopLevelTemplate = nestedElementsStack[nestedElementsStack.length - 1].next();
            if (!currentTopLevelTemplate.done) {
                var element = currentTopLevelTemplate.value;
                var templateElement = document.createElement('div');
                templateElement.appendChild(document.importNode(element.content, true));
                var innerTemplates = templateElement.getElementsByTagName("TEMPLATE");
                if (innerTemplates.length > 0) {
                    nestedElementsStack.push(new hr_iterable_2.Iterable(Array.prototype.slice.call(innerTemplates)).iterator());
                }
                return {
                    element: element,
                    templateElement: templateElement
                };
            }
            else {
                nestedElementsStack.pop();
                return buildTemplateElements(nestedElementsStack);
            }
        }
    }
    var templateIterables = new hr_iterable_2.Iterable(Array.prototype.slice.call(document.getElementsByTagName("TEMPLATE")));
    var templateElements;
    //If the browser supports templates, iterate through them after creating temp ones.
    if (browserSupportsTemplates) {
        var nestedElementsStack = [];
        nestedElementsStack.push(templateIterables.iterator());
        templateElements = new hr_iterable_2.Iterable(function () {
            return buildTemplateElements(nestedElementsStack);
        }).iterator();
    }
    else {
        templateElements = templateIterables.select(function (t) {
            return {
                element: t,
                templateElement: t
            };
        }).iterator();
    }
    var currentTemplate = templateElements.next();
    while (!currentTemplate.done) {
        var currentBuilder = extractTemplate(currentTemplate.value, currentBuilder);
        //The iterator is incremented below where the comment says INC HERE
    }
    //Extract templates off the page
    function extractTemplate(elementPair, currentBuilder) {
        var element = elementPair.element;
        //INC HERE - This is where currentTemplate is incremented to its next value
        //This single iter is shared for all levels of the gatherer
        currentTemplate = templateElements.next();
        //Check to see if this is an ignored element, and quickly exit if it is
        if (ignoredNodes.isIgnored(element)) {
            return currentBuilder;
        }
        var templateElement = elementPair.templateElement;
        //Look for nested child templates, do this before taking inner html so children are removed
        while (!currentTemplate.done && templateElement.contains(currentTemplate.value.element)) {
            var currentBuilder = extractTemplate(currentTemplate.value, currentBuilder);
        }
        var componentString = templateElement.innerHTML.trim();
        //Special case for tables in ie, cannot create templates without a surrounding table element, this will eliminate that unless requested otherwise
        if (templateElement.childElementCount === 1 && templateElement.firstElementChild.tagName === 'TABLE' && !element.hasAttribute('data-hr-keep-table')) {
            var tableElement = templateElement.firstElementChild;
            if (tableElement.childElementCount > 0 && tableElement.firstElementChild.tagName === 'TBODY') {
                componentString = tableElement.firstElementChild.innerHTML.trim();
            }
            else {
                componentString = tableElement.innerHTML.trim();
            }
        }
        var elementParent = element.parentElement;
        elementParent.removeChild(element);
        var variantName = element.getAttribute("data-hr-variant");
        var componentName = element.getAttribute("data-hr-component");
        if (variantName === null) {
            //Check to see if this is an anonymous template, if so adjust the parent element and
            //name the template
            if (componentName === null) {
                componentName = 'AnonTemplate_' + anonTemplateIndex++;
                elementParent.setAttribute("data-hr-view-component", componentName);
            }
            var builder = new hr_componentbuilder_1.ComponentBuilder(componentString);
            extractedBuilders[componentName] = builder;
            components.register(componentName, builder);
            return builder;
        }
        else {
            if (componentName === null) {
                if (currentBuilder !== undefined) {
                    currentBuilder.addVariant(variantName, new hr_componentbuilder_1.VariantBuilder(componentString));
                }
                else {
                    console.log('Attempted to create a variant named "' + variantName + '" with no default component in the chain. Please start your template element chain with a data-hr-component or a anonymous template. This template has been ignored.');
                }
            }
            else {
                extractedBuilders[componentName].addVariant(variantName, new hr_componentbuilder_1.VariantBuilder(componentString));
            }
            return currentBuilder;
        }
    }
    function setup() {
        //Doesn't do anything, but makes module load correctly.
        return true;
    }
    exports.setup = setup;
});
define("node_modules/htmlrapier/src/main", ["require","exports","hr.formbuilder","hr.componentgatherer"], function (require, exports, formbuilder, componentgatherer) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.setup = void 0;
    formbuilder.setup();
    componentgatherer.setup();
    function setup() {
        return true;
    }
    exports.setup = setup;
});
define("hr.windowfetch", ["require","exports","hr.fetcher"], function (require, exports, hr_fetcher_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.WindowFetch = void 0;
    /**
     * A fetcher implementation that calls the global window fetch function.
     * Use this to terminate fetcher chains and do the real fetch work.
     * @returns
     */
    class WindowFetch extends hr_fetcher_1.Fetcher {
        constructor() {
            super();
        }
        fetch(url, init) {
            return fetch(url, init);
        }
    }
    exports.WindowFetch = WindowFetch;
});
define("edity.theme.layouts.default", ["require","exports","node_modules/htmlrapier.treemenu/src/TreeMenu","node_modules/editymceditface.client/EditorCore/EditModeDetector","hr.controller","node_modules/htmlrapier.bootstrap/src/main","node_modules/htmlrapier.sidebar/src/sidebartoggle","hr.fetcher","node_modules/htmlrapier/src/main","hr.windowfetch"], function (require, exports, TreeMenu, EditModeDetector, controller, bootstrap, SidebarToggle, fetcher, hr, windowFetch) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    //Activate htmlrapier
    hr.setup();
    bootstrap.setup();
    SidebarToggle.activate();
    //Only create tree menu if not in edit mode, otherwise the editor will create an editing tree menu instead
    if (!EditModeDetector.IsEditMode()) {
        var builder = new controller.InjectedControllerBuilder();
        builder.Services.addShared(fetcher.Fetcher, s => new windowFetch.WindowFetch());
        TreeMenu.addServices(builder.Services);
        builder.create("treeMenu", TreeMenu.TreeMenu);
    }
});
