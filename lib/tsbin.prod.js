var jsnsOptions = jsnsOptions || {};
var jsnsDefine =function (options) {
        var JsModuleInstance = /** @class */ (function () {
            function JsModuleInstance(definition, loader) {
                this.definition = definition;
                this.loader = loader;
                this.exports = {};
            }
            return JsModuleInstance;
        }());
        var JsModuleDefinition = /** @class */ (function () {
            function JsModuleDefinition(name, depNames, factory, loader, source, isRunner, moduleCodeFinder) {
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
            JsModuleDefinition.prototype.getModuleCode = function (ignoredSources) {
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
            };
            JsModuleDefinition.prototype.getDependenciesArg = function (preDependencies) {
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
            };
            return JsModuleDefinition;
        }());
        var ModuleManager = /** @class */ (function () {
            function ModuleManager(options) {
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
            ModuleManager.prototype.addRunner = function (name, source) {
                var runnerModule = new JsModuleDefinition(name + "Runner", [name], this.runnerFunc, this, source, true);
                if (this.fromModuleRunners !== null) {
                    this.fromModuleRunners.push(runnerModule);
                }
                else {
                    this.runners.push(runnerModule);
                    this.loadRunners();
                }
            };
            /**
             * Add a module to the module manager. Due to the variety of ways that a module could be added the user is responsible for
             * calling loadRunners() when they are ready to try to load modules.
             */
            ModuleManager.prototype.addModule = function (name, dependencies, factory, moduleWriter) {
                this.unloaded[name] = new JsModuleDefinition(name, dependencies, factory, this, undefined, false, moduleWriter);
            };
            ModuleManager.prototype.isModuleLoaded = function (name) {
                return this.loaded[name] !== undefined;
            };
            ModuleManager.prototype.isModuleLoadable = function (name) {
                return this.unloaded[name] !== undefined;
            };
            ModuleManager.prototype.isModuleDefined = function (name) {
                return this.isModuleLoaded(name) || this.isModuleLoadable(name);
            };
            ModuleManager.prototype.loadModule = function (name) {
                var loaded = this.checkModule(this.unloaded[name]);
                if (loaded) {
                    delete this.unloaded[name];
                }
                return loaded;
            };
            ModuleManager.prototype.setModuleLoaded = function (name, module) {
                if (this.loaded[name] === undefined) {
                    this.loaded[name] = module;
                    this.loadedOrder.push(name);
                }
            };
            ModuleManager.prototype.checkModule = function (check) {
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
            };
            ModuleManager.prototype.loadRunners = function () {
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
            };
            ModuleManager.prototype.debug = function () {
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
            };
            ModuleManager.prototype.printLoaded = function () {
                console.log("Loaded Modules:");
                for (var p in this.loaded) {
                    if (this.loaded.hasOwnProperty(p)) {
                        console.log(p);
                    }
                }
            };
            ModuleManager.prototype.printUnloaded = function () {
                console.log("Unloaded Modules:");
                for (var p in this.unloaded) {
                    if (this.unloaded.hasOwnProperty(p)) {
                        console.log(p);
                    }
                }
            };
            ModuleManager.prototype.createFileFromLoaded = function (ignoredSources) {
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
            };
            ModuleManager.prototype.recursiveWaitingDebug = function (name, indent) {
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
            };
            ModuleManager.prototype.runnerFunc = function () { };
            return ModuleManager;
        }());
        var Loader = /** @class */ (function () {
            function Loader(moduleManager) {
                if (moduleManager === undefined) {
                    moduleManager = new ModuleManager();
                }
                this.moduleManager = moduleManager;
            }
            Loader.prototype.define = function (name, dependencies, factory) {
                if (!this.moduleManager.isModuleDefined(name)) {
                    this.moduleManager.addModule(name, dependencies, factory);
                    this.moduleManager.loadRunners();
                }
            };
            Loader.prototype.amd = function (name, discoverFunc) {
                var _this = this;
                if (!this.moduleManager.isModuleDefined(name)) {
                    this.discoverAmd(discoverFunc, function (dependencies, factory, amdFactory) {
                        _this.moduleManager.addModule(name, dependencies, factory, function (def) { return _this.writeAmdFactory(amdFactory, def); });
                    });
                    this.moduleManager.loadRunners();
                }
            };
            /**
             * Run a module, will execute the code in the module, the module must actually
             * run some code not just export function for this to have any effect.
             *
             * Can optionally provide a source, which can be used to filter out running modules at build time
             * for tree shaking.
             */
            Loader.prototype.run = function (name, source) {
                this.moduleManager.addRunner(name, source);
            };
            Loader.prototype.debug = function () {
                this.moduleManager.debug();
            };
            Loader.prototype.printLoaded = function () {
                this.moduleManager.printLoaded();
            };
            Loader.prototype.printUnloaded = function () {
                this.moduleManager.printUnloaded();
            };
            Loader.prototype.createFileFromLoaded = function (ignoredSources) {
                return this.moduleManager.createFileFromLoaded(ignoredSources);
            };
            Loader.prototype.writeAmdFactory = function (amdFactory, def) {
                return 'define("' + def.name + '", ' + def.getDependenciesArg(["require", "exports"]) + ', ' + amdFactory + ');\n';
            };
            Loader.prototype.require = function () {
            };
            Loader.prototype.discoverAmd = function (discoverFunc, callback) {
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
                callback(dependencies, function (exports, module) {
                    var args = [];
                    for (var _i = 2; _i < arguments.length; _i++) {
                        args[_i - 2] = arguments[_i];
                    }
                    args.unshift(exports);
                    args.unshift(this.require);
                    factory.apply(this, args); //This is a bit weird here, it will be the module instance from the loader, since it sets that before calling this function.
                }, factory);
            };
            return Loader;
        }());
        //Return the instance
        return new Loader(new ModuleManager(options));
    }
var jsns = jsns || jsnsDefine(jsnsOptions);
var define = define || function (name, deps, factory) {
    jsns.amd(name, function (cbDefine) {
        cbDefine(deps, factory);
    });
}
define("hr.typeidentifiers", ["require","exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
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
});
define("hr.eventdispatcher", ["require","exports","hr.typeidentifiers"], function (require, exports, typeId) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    /**
     * This event dispatcher does not handle event listeners returning values.
     */
    var ActionEventDispatcher = /** @class */ (function () {
        function ActionEventDispatcher() {
            this.listeners = [];
        }
        ActionEventDispatcher.prototype.add = function (listener) {
            if (!typeId.isFunction(listener)) {
                throw new Error("Listener must be a function, instead got " + typeof (listener));
            }
            this.listeners.push(listener);
        };
        ActionEventDispatcher.prototype.remove = function (listener) {
            for (var i = 0; i < this.listeners.length; ++i) {
                if (this.listeners[i] === listener) {
                    this.listeners.splice(i--, 1);
                }
            }
        };
        Object.defineProperty(ActionEventDispatcher.prototype, "modifier", {
            get: function () {
                return this;
            },
            enumerable: true,
            configurable: true
        });
        ActionEventDispatcher.prototype.fire = function (arg) {
            for (var i = 0; i < this.listeners.length; ++i) {
                this.listeners[i](arg);
            }
        };
        return ActionEventDispatcher;
    }());
    exports.ActionEventDispatcher = ActionEventDispatcher;
    /**
     * This is class is for events that return a value.
     */
    var FuncEventDispatcher = /** @class */ (function () {
        function FuncEventDispatcher() {
            this.listeners = [];
        }
        FuncEventDispatcher.prototype.add = function (listener) {
            if (!typeId.isFunction(listener)) {
                throw new Error("Listener must be a function, instead got " + typeof (listener));
            }
            this.listeners.push(listener);
        };
        FuncEventDispatcher.prototype.remove = function (listener) {
            for (var i = 0; i < this.listeners.length; ++i) {
                if (this.listeners[i] === listener) {
                    this.listeners.splice(i--, 1);
                }
            }
        };
        Object.defineProperty(FuncEventDispatcher.prototype, "modifier", {
            get: function () {
                return this;
            },
            enumerable: true,
            configurable: true
        });
        FuncEventDispatcher.prototype.fire = function (arg) {
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
        };
        return FuncEventDispatcher;
    }());
    exports.FuncEventDispatcher = FuncEventDispatcher;
    /**
     * This event dispatcher will return a promise that will resolve when all events
     * are finished running. Allows async work to stay in the event flow.
     */
    var PromiseEventDispatcher = /** @class */ (function () {
        function PromiseEventDispatcher() {
            this.listeners = [];
        }
        PromiseEventDispatcher.prototype.add = function (listener) {
            if (!typeId.isFunction(listener)) {
                throw new Error("Listener must be a function, instead got " + typeof (listener));
            }
            this.listeners.push(listener);
        };
        PromiseEventDispatcher.prototype.remove = function (listener) {
            for (var i = 0; i < this.listeners.length; ++i) {
                if (this.listeners[i] === listener) {
                    this.listeners.splice(i--, 1);
                }
            }
        };
        Object.defineProperty(PromiseEventDispatcher.prototype, "modifier", {
            get: function () {
                return this;
            },
            enumerable: true,
            configurable: true
        });
        /**
         * Fire the event. The listeners can return values, if they do the values will be added
         * to an array that is returned by the promise returned by this function.
         * @returns {Promise} a promise that will resolve when all fired events resolve.
         */
        PromiseEventDispatcher.prototype.fire = function (arg) {
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
        };
        return PromiseEventDispatcher;
    }());
    exports.PromiseEventDispatcher = PromiseEventDispatcher;
});
define("hr.toggles", ["require","exports","hr.typeidentifiers","hr.eventdispatcher"], function (require, exports, typeId, evts) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var defaultStates = ['on', 'off']; //Reusuable states, so we don't end up creating tons of these arrays
    var togglePlugins = [];
    /**
     * Interface for typed toggles, provides a way to get the states as a string,
     * you should provide the names of all your functions here.
     */
    var TypedToggle = /** @class */ (function () {
        function TypedToggle() {
            this.events = {};
        }
        /**
         * Get the states this toggle can activate.
         */
        TypedToggle.prototype.getPossibleStates = function () {
            return [];
        };
        /**
         * Set the toggle states used by this strong toggle, should not be called outside of
         * the toggle build function.
         */
        TypedToggle.prototype.setStates = function (states) {
            this.states = states;
            this.states.setToggle(this);
        };
        TypedToggle.prototype.applyState = function (name) {
            if (this._currentState !== name) {
                this._currentState = name;
                if (this.states.applyState(name)) {
                    this.fireStateChange(name);
                }
            }
        };
        TypedToggle.prototype.isUsable = function () {
            return !(typeId.isObject(this.states) && this.states.constructor.prototype == NullStates.prototype);
        };
        Object.defineProperty(TypedToggle.prototype, "currentState", {
            get: function () {
                return this._currentState;
            },
            enumerable: true,
            configurable: true
        });
        TypedToggle.prototype.fireStateChange = function (name) {
            this._currentState = name; //This only should happen as the result of an applystate call or the state being changed externally to the library
            //The event will only fire on the current state, so it is safe to set the current state here.
            if (this.events[name] !== undefined) {
                this.events[name].fire(this);
            }
        };
        TypedToggle.prototype.getStateEvent = function (name) {
            if (this.events[name] === undefined) {
                this.events[name] = new evts.ActionEventDispatcher();
            }
            return this.events[name];
        };
        return TypedToggle;
    }());
    exports.TypedToggle = TypedToggle;
    /**
     * A toggle that is on and off.
     */
    var OnOffToggle = /** @class */ (function (_super) {
        __extends(OnOffToggle, _super);
        function OnOffToggle() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        OnOffToggle.prototype.on = function () {
            this.applyState("on");
        };
        OnOffToggle.prototype.off = function () {
            this.applyState("off");
        };
        Object.defineProperty(OnOffToggle.prototype, "onEvent", {
            get: function () {
                return this.getStateEvent('on').modifier;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(OnOffToggle.prototype, "offEvent", {
            get: function () {
                return this.getStateEvent('off').modifier;
            },
            enumerable: true,
            configurable: true
        });
        OnOffToggle.prototype.getPossibleStates = function () {
            return OnOffToggle.states;
        };
        OnOffToggle.prototype.toggle = function () {
            if (this.mode) {
                this.off();
            }
            else {
                this.on();
            }
        };
        Object.defineProperty(OnOffToggle.prototype, "mode", {
            get: function () {
                return this.currentState === "on";
            },
            set: function (value) {
                var currentOn = this.mode;
                if (currentOn && !value) {
                    this.off();
                }
                else if (!currentOn && value) {
                    this.on();
                }
            },
            enumerable: true,
            configurable: true
        });
        OnOffToggle.states = ['on', 'off'];
        return OnOffToggle;
    }(TypedToggle));
    exports.OnOffToggle = OnOffToggle;
    /**
     * The Group defines a collection of toggles that can be manipulated together.
     */
    var Group = /** @class */ (function () {
        function Group() {
            var toggles = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                toggles[_i] = arguments[_i];
            }
            this.toggles = toggles;
        }
        /**
         * Add a toggle to the group.
         * @param toggle - The toggle to add.
         */
        Group.prototype.add = function (toggle) {
            this.toggles.push(toggle);
        };
        /**
         * This function will set all toggles in the group (including the passed one if its in the group)
         * to the hideState and then will set the passed toggle to showState.
         * @param toggle - The toggle to set.
         * @param {string} [showState] - The state to set the passed toggle to.
         * @param {string} [hideState] - The state to set all other toggles to.
         */
        Group.prototype.activate = function (toggle, showState, hideState) {
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
        };
        return Group;
    }());
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
    var ToggleStates = /** @class */ (function () {
        function ToggleStates(next) {
            this.states = {};
            this.next = next;
        }
        ToggleStates.prototype.addState = function (name, value) {
            this.states[name] = value;
        };
        ToggleStates.prototype.applyState = function (name) {
            var state = this.states[name];
            var fireEvent = this.activateState(state);
            if (this.next) {
                fireEvent = this.next.applyState(name) || fireEvent;
            }
            return fireEvent;
        };
        ToggleStates.prototype.setToggle = function (toggle) {
            this.toggle = toggle;
        };
        ToggleStates.prototype.fireStateChange = function (name) {
            if (this.toggle) {
                this.toggle.fireStateChange(name);
            }
        };
        return ToggleStates;
    }());
    exports.ToggleStates = ToggleStates;
    /**
     * This class holds multiple toggle states as a group. This handles multiple toggles
     * with the same name by bunding them up turning them on and off together.
     * @param {ToggleStates} next
     */
    var MultiToggleStates = /** @class */ (function () {
        function MultiToggleStates(childStates) {
            this.childStates = childStates;
        }
        MultiToggleStates.prototype.applyState = function (name) {
            var fireEvent = true;
            for (var i = 0; i < this.childStates.length; ++i) {
                fireEvent = this.childStates[i].applyState(name) || fireEvent; //Fire event first so we always fire all the items in the chain
            }
            return fireEvent;
        };
        MultiToggleStates.prototype.setToggle = function (toggle) {
            for (var i = 0; i < this.childStates.length; ++i) {
                this.childStates[i].setToggle(toggle);
            }
        };
        return MultiToggleStates;
    }());
    exports.MultiToggleStates = MultiToggleStates;
    var DisabledToggleStates = /** @class */ (function (_super) {
        __extends(DisabledToggleStates, _super);
        function DisabledToggleStates(element, next) {
            var _this = _super.call(this, next) || this;
            _this.element = element;
            return _this;
        }
        DisabledToggleStates.prototype.activateState = function (style) {
            if (Boolean(style)) {
                this.element.setAttribute('disabled', 'disabled');
            }
            else {
                this.element.removeAttribute('disabled');
            }
            return true;
        };
        return DisabledToggleStates;
    }(ToggleStates));
    exports.DisabledToggleStates = DisabledToggleStates;
    var ReadonlyToggleStates = /** @class */ (function (_super) {
        __extends(ReadonlyToggleStates, _super);
        function ReadonlyToggleStates(element, next) {
            var _this = _super.call(this, next) || this;
            _this.element = element;
            return _this;
        }
        ReadonlyToggleStates.prototype.activateState = function (style) {
            if (Boolean(style)) {
                this.element.setAttribute('readonly', 'readonly');
            }
            else {
                this.element.removeAttribute('readonly');
            }
            return true;
        };
        return ReadonlyToggleStates;
    }(ToggleStates));
    exports.ReadonlyToggleStates = ReadonlyToggleStates;
    /**
     * This class toggles attributes on and off for an element.
     */
    var AttributeToggleStates = /** @class */ (function (_super) {
        __extends(AttributeToggleStates, _super);
        function AttributeToggleStates(attrName, element, next) {
            var _this = _super.call(this, next) || this;
            _this.attrName = attrName;
            _this.element = element;
            return _this;
        }
        AttributeToggleStates.prototype.activateState = function (style) {
            if (style) {
                this.element.setAttribute(this.attrName, style);
            }
            else {
                this.element.removeAttribute(this.attrName);
            }
            return true;
        };
        return AttributeToggleStates;
    }(ToggleStates));
    exports.AttributeToggleStates = AttributeToggleStates;
    /**
     * A simple toggle state that does nothing. Used to shim correctly if no toggles are defined for a toggle element.
     */
    var NullStates = /** @class */ (function (_super) {
        __extends(NullStates, _super);
        function NullStates(next) {
            return _super.call(this, next) || this;
        }
        NullStates.prototype.activateState = function (value) {
            return true;
        };
        return NullStates;
    }(ToggleStates));
    /**
     * A toggler that toggles style for an element
     */
    var StyleStates = /** @class */ (function (_super) {
        __extends(StyleStates, _super);
        function StyleStates(element, next) {
            var _this = _super.call(this, next) || this;
            _this.element = element;
            _this.originalStyles = element.style.cssText || "";
            return _this;
        }
        StyleStates.prototype.activateState = function (style) {
            if (style) {
                this.element.style.cssText = this.originalStyles + style;
            }
            else {
                this.element.style.cssText = this.originalStyles;
            }
            return true;
        };
        return StyleStates;
    }(ToggleStates));
    /**
    * A toggler that toggles classes for an element. Supports animations using an
    * idle attribute (data-hr-class-idle) that if present will have its classes
    * applied to the element when any animations have completed.
    */
    var ClassStates = /** @class */ (function (_super) {
        __extends(ClassStates, _super);
        function ClassStates(element, next) {
            var _this = _super.call(this, next) || this;
            _this.element = element;
            _this.originalClasses = element.getAttribute("class") || "";
            _this.idleClass = element.getAttribute('data-hr-class-idle');
            _this.stopAnimationCb = function () { _this.stopAnimation(); };
            return _this;
        }
        ClassStates.prototype.activateState = function (classes) {
            if (classes) {
                this.element.setAttribute("class", this.originalClasses + ' ' + classes);
            }
            else {
                this.element.setAttribute("class", this.originalClasses);
            }
            this.startAnimation();
            return true;
        };
        ClassStates.prototype.startAnimation = function () {
            if (this.idleClass) {
                this.element.classList.remove(this.idleClass);
                this.element.removeEventListener('transitionend', this.stopAnimationCb);
                this.element.removeEventListener('animationend', this.stopAnimationCb);
                this.element.addEventListener('transitionend', this.stopAnimationCb);
                this.element.addEventListener('animationend', this.stopAnimationCb);
            }
        };
        ClassStates.prototype.stopAnimation = function () {
            this.element.removeEventListener('transitionend', this.stopAnimationCb);
            this.element.removeEventListener('animationend', this.stopAnimationCb);
            this.element.classList.add(this.idleClass);
        };
        return ClassStates;
    }(ToggleStates));
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
    var toggleAttributeStart = 'data-hr-attr-';
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
define("node_modules/htmlrapier.bootstrap/src/modal", ["require","exports","hr.toggles"], function (require, exports, toggles) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    //Scrollbar fix, keeps scrollbars at correct length with multiple modals
    //Since this is on the document, only needed once, so register here
    //Works in bootstrap 3.3.7.
    //Thanks to A1rPun at https://stackoverflow.com/questions/19305821/multiple-modals-overlay
    $(document).on('hidden.bs.modal', '.modal', function () {
        $('.modal:visible').length && $(document.body).addClass('modal-open');
    });
    var LastClickTargetManager = /** @class */ (function () {
        function LastClickTargetManager() {
            var _this = this;
            this.lastOnClickTarget = null;
            window.addEventListener("click", function (evt) { _this.lastOnClickTarget = evt.target; }, true);
        }
        LastClickTargetManager.prototype.getLast = function () {
            if (this.lastOnClickTarget) {
                //Get the last click target, and clear it out, we don't care about it after the first access
                var ret = this.lastOnClickTarget;
                this.lastOnClickTarget = null;
                return ret;
            }
            return null;
        };
        LastClickTargetManager.prototype.refocus = function (element) {
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
        };
        return LastClickTargetManager;
    }());
    var lastClickTracker;
    //Toggle Plugin
    var ModalStates = /** @class */ (function (_super) {
        __extends(ModalStates, _super);
        function ModalStates(element, next) {
            var _this = _super.call(this, next) || this;
            _this.modal = $(element);
            var theModal = _this.modal.modal({
                show: false
            });
            var thisShim = _this;
            _this.modal.on('show.bs.modal', function (e) {
                _this.lastOnClickBeforeOpen = lastClickTracker.getLast();
                _this.fireStateChange('on');
            });
            _this.modal.on('hide.bs.modal', function (e) {
                _this.fireStateChange('off');
            });
            //Only listen for tracking events if the modal is setup to do it.
            if (Boolean(element.getAttribute('data-hr-bootstrap-auto-refocus'))) {
                _this.modal.on('hidden.bs.modal', function (e) {
                    lastClickTracker.refocus(_this.lastOnClickBeforeOpen);
                });
            }
            _this.addState('on', 'on');
            _this.addState('off', 'off');
            return _this;
        }
        ModalStates.prototype.activateState = function (state) {
            switch (state) {
                case 'on':
                    this.modal.modal('show');
                    break;
                case 'off':
                    this.modal.modal('hide');
                    break;
            }
            return false;
        };
        return ModalStates;
    }(toggles.ToggleStates));
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
    //Toggle Plugin
    var DropdownStates = /** @class */ (function (_super) {
        __extends(DropdownStates, _super);
        function DropdownStates(element, next) {
            var _this = _super.call(this, next) || this;
            _this.drop = $(element).dropdown();
            return _this;
        }
        DropdownStates.prototype.activateState = function (state) {
            //States not supported, handled by bootstrap
            return false; //Never fire any events for this toggle
        };
        return DropdownStates;
    }(toggles.ToggleStates));
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
    //Toggle Plugin
    var TabStates = /** @class */ (function (_super) {
        __extends(TabStates, _super);
        function TabStates(element, next) {
            var _this = _super.call(this, next) || this;
            _this.tab = $(element);
            _this.tab.on('shown.bs.tab', function (e) {
                _this.fireStateChange('on');
            });
            _this.tab.on('hide.bs.tab', function (e) {
                _this.fireStateChange('off');
            });
            _this.addState('on', 'on');
            _this.addState('off', 'off');
            return _this;
        }
        TabStates.prototype.activateState = function (state) {
            switch (state) {
                case 'on':
                    this.tab.tab('show');
                    break;
                case 'off':
                    //Can't turn off tabs, does nothing
                    break;
            }
            return false;
        };
        return TabStates;
    }(toggles.ToggleStates));
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
define("node_modules/htmlrapier.bootstrap/src/all", ["require","exports","node_modules/htmlrapier.bootstrap/src/modal","node_modules/htmlrapier.bootstrap/src/dropdown","node_modules/htmlrapier.bootstrap/src/tab"], function (require, exports, modal, dropdown, tab) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var needsActivation = true;
    /**
     * Activate all bootstrap plugins.
     */
    function activate() {
        if (needsActivation) {
            needsActivation = false;
            modal.activate();
            dropdown.activate();
            tab.activate();
        }
    }
    exports.activate = activate;
});
define("hr.bootstrap.activate", ["require","exports","node_modules/htmlrapier.bootstrap/src/all"], function (require, exports, bootstrap) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    bootstrap.activate();
});
jsns.run("hr.bootstrap.activate");
define("hr.domquery", ["require","exports","hr.typeidentifiers"], function (require, exports, typeId) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
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
        var iter = createNodeIteratorShim(document, NodeFilter.SHOW_ELEMENT);
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
define("hr.components", ["require","exports","hr.typeidentifiers","hr.domquery"], function (require, exports, typeId, domquery) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
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
define("hr.formhelper", ["require","exports","hr.domquery","hr.typeidentifiers"], function (require, exports, domQuery, typeIds) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
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
    var ClearingValidator = /** @class */ (function () {
        function ClearingValidator() {
            this.message = "";
        }
        /**
         * Get the validation error named name.
         */
        ClearingValidator.prototype.getValidationError = function (name) {
            return undefined;
        };
        /**
         * Check to see if a named validation error exists.
         */
        ClearingValidator.prototype.hasValidationError = function (name) {
            return false;
        };
        /**
         * Get all validation errors.
         */
        ClearingValidator.prototype.getValidationErrors = function () {
            return {};
        };
        /**
         * Determine if there are any validation errors.
         */
        ClearingValidator.prototype.hasValidationErrors = function () {
            return true;
        };
        ClearingValidator.prototype.addKey = function (baseName, key) {
            return "";
        };
        ClearingValidator.prototype.addIndex = function (baseName, key, index) {
            return "";
        };
        return ClearingValidator;
    }());
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
    /**
     * This form decorator will ensure that a schema is loaded before any data is added to the
     * form. You can call setData and setSchema in any order you want, but the data will not
     * be set until the schema is loaded. Just wrap your real IForm in this decorator to get this
     * feature.
     */
    var NeedsSchemaForm = /** @class */ (function () {
        function NeedsSchemaForm(wrapped) {
            this.wrapped = wrapped;
            this.loadedSchema = false;
        }
        NeedsSchemaForm.prototype.setError = function (err) {
            this.wrapped.setError(err);
        };
        NeedsSchemaForm.prototype.clearError = function () {
            this.wrapped.clearError();
        };
        /**
          * Set the data on the form.
          * @param data The data to set.
          */
        NeedsSchemaForm.prototype.setData = function (data) {
            if (this.loadedSchema) {
                this.wrapped.setData(data);
            }
            else {
                this.waitingData = data;
            }
        };
        /**
         * Remove all data from the form.
         */
        NeedsSchemaForm.prototype.clear = function () {
            this.wrapped.clear();
        };
        /**
         * Get the data on the form. If you set a prototype
         * it will be used as the prototype of the returned
         * object.
         */
        NeedsSchemaForm.prototype.getData = function () {
            return this.wrapped.getData();
        };
        NeedsSchemaForm.prototype.getValue = function (name) {
            return this.wrapped.getValue(name);
        };
        /**
         * Set the prototype object to use when getting the
         * form data with getData.
         * @param proto The prototype object.
         */
        NeedsSchemaForm.prototype.setPrototype = function (proto) {
            this.wrapped.setPrototype(proto);
        };
        /**
         * Set the schema for this form. This will add any properties found in the
         * schema that you did not already define on the form. It will match the form
         * property names to the name attribute on the elements. If you had a blank form
         * this would generate the whole thing for you from the schema.
         */
        NeedsSchemaForm.prototype.setSchema = function (schema, componentName) {
            this.wrapped.setSchema(schema, componentName);
            if (this.waitingData !== undefined) {
                this.wrapped.setData(this.waitingData);
                this.waitingData = undefined;
            }
            this.loadedSchema = true;
        };
        Object.defineProperty(NeedsSchemaForm.prototype, "onBeforeSetData", {
            get: function () {
                return this.wrapped.onBeforeSetData;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(NeedsSchemaForm.prototype, "onAfterSetData", {
            get: function () {
                return this.wrapped.onAfterSetData;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(NeedsSchemaForm.prototype, "onBeforeGetData", {
            get: function () {
                return this.wrapped.onBeforeGetData;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(NeedsSchemaForm.prototype, "onAfterGetData", {
            get: function () {
                return this.wrapped.onAfterGetData;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(NeedsSchemaForm.prototype, "onChanged", {
            get: function () {
                return this.wrapped.onChanged;
            },
            enumerable: true,
            configurable: true
        });
        return NeedsSchemaForm;
    }());
    exports.NeedsSchemaForm = NeedsSchemaForm;
    var Form = /** @class */ (function () {
        function Form(form) {
            this.form = form;
            this.baseLevel = undefined;
            this.beforeSetDataEvent = new events.ActionEventDispatcher();
            this.afterSetDataEvent = new events.ActionEventDispatcher();
            this.beforeGetDataEvent = new events.ActionEventDispatcher();
            this.afterGetDataEvent = new events.ActionEventDispatcher();
            this.onChangedEvent = new events.ActionEventDispatcher();
        }
        Form.prototype.setError = function (err) {
            if (this.formValues) {
                this.formValues.setError(err);
            }
        };
        Form.prototype.clearError = function () {
            if (this.formValues) {
                this.formValues.setError(formHelper.getSharedClearingValidator());
            }
        };
        Form.prototype.setData = function (data) {
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
        };
        Form.prototype.clear = function () {
            this.clearError();
            if (this.formValues) {
                this.formValues.setData(sharedClearer);
                this.formValues.fireDataChanged();
            }
            else {
                formHelper.populate(this.form, sharedClearer);
            }
        };
        Form.prototype.getData = function () {
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
        };
        Form.prototype.getValue = function (name) {
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
        };
        Form.prototype.setPrototype = function (proto) {
            this.proto = proto;
        };
        Form.prototype.setSchema = function (schema, componentName) {
            var _this = this;
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
                this.formValues.onChanged.add(function (a) {
                    return _this.onChangedEvent.fire({ source: _this, propertyName: a.propertyName });
                });
            }
            this.formValues.fireDataChanged();
        };
        Object.defineProperty(Form.prototype, "onBeforeSetData", {
            get: function () {
                return this.beforeSetDataEvent.modifier;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(Form.prototype, "onAfterSetData", {
            get: function () {
                return this.afterSetDataEvent.modifier;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(Form.prototype, "onBeforeGetData", {
            get: function () {
                return this.beforeGetDataEvent.modifier;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(Form.prototype, "onAfterGetData", {
            get: function () {
                return this.afterGetDataEvent.modifier;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(Form.prototype, "onChanged", {
            get: function () {
                return this.onChangedEvent.modifier;
            },
            enumerable: true,
            configurable: true
        });
        return Form;
    }());
    var NullForm = /** @class */ (function () {
        function NullForm() {
            this.beforeSetDataEvent = new events.ActionEventDispatcher();
            this.afterSetDataEvent = new events.ActionEventDispatcher();
            this.beforeGetDataEvent = new events.ActionEventDispatcher();
            this.afterGetDataEvent = new events.ActionEventDispatcher();
            this.onChangedEvent = new events.ActionEventDispatcher();
        }
        NullForm.prototype.setError = function (err) {
        };
        NullForm.prototype.clearError = function () {
        };
        NullForm.prototype.setData = function (data) {
        };
        NullForm.prototype.getValue = function (name) {
            return undefined;
        };
        NullForm.prototype.clear = function () {
        };
        NullForm.prototype.getData = function () {
            return null;
        };
        NullForm.prototype.setPrototype = function (proto) {
        };
        NullForm.prototype.setSchema = function (schema, componentName) {
        };
        Object.defineProperty(NullForm.prototype, "onBeforeSetData", {
            get: function () {
                return this.beforeSetDataEvent.modifier;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(NullForm.prototype, "onAfterSetData", {
            get: function () {
                return this.afterSetDataEvent.modifier;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(NullForm.prototype, "onBeforeGetData", {
            get: function () {
                return this.beforeGetDataEvent.modifier;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(NullForm.prototype, "onAfterGetData", {
            get: function () {
                return this.afterGetDataEvent.modifier;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(NullForm.prototype, "onChanged", {
            get: function () {
                return this.onChangedEvent.modifier;
            },
            enumerable: true,
            configurable: true
        });
        return NullForm;
    }());
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
    // Node Types
    // ----------
    // This is the full set of types that any JSEP node can be.
    // Store them here to save space when minified
    var COMPOUND = 'Compound';
    var IDENTIFIER = 'Identifier';
    var MEMBER_EXP = 'MemberExpression';
    var LITERAL = 'Literal';
    var THIS_EXP = 'ThisExpression';
    var CALL_EXP = 'CallExpression';
    var UNARY_EXP = 'UnaryExpression';
    var BINARY_EXP = 'BinaryExpression';
    var LOGICAL_EXP = 'LogicalExpression';
    var CONDITIONAL_EXP = 'ConditionalExpression';
    var ARRAY_EXP = 'ArrayExpression';
    var PERIOD_CODE = 46; // '.'
    var COMMA_CODE = 44; // ','
    var SQUOTE_CODE = 39; // single quote
    var DQUOTE_CODE = 34; // double quotes
    var OPAREN_CODE = 40; // (
    var CPAREN_CODE = 41; // )
    var OBRACK_CODE = 91; // [
    var CBRACK_CODE = 93; // ]
    var QUMARK_CODE = 63; // ?
    var SEMCOL_CODE = 59; // ;
    var COLON_CODE = 58; // :
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
    var DataAddress = /** @class */ (function () {
        function DataAddress(address) {
            this.address = address;
            //Remove any this from the address
            if (address.length > 0 && address[0].key === "this") {
                address.splice(0, 1);
            }
        }
        DataAddress.prototype.read = function (data) {
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
        };
        DataAddress.prototype.isInScope = function (scope) {
            return this.address.length > 0 && this.address[0].key === scope;
        };
        /**
         * Read scoped data, this will skip the first item of the address and will read the reminaing data out
         * of the passed in data. This makes it easy read data that another address looked up in scoped addresses.
         * @param data
         */
        DataAddress.prototype.readScoped = function (data) {
            if (DataAddress.isAddressStackLookup(data)) {
                throw new Error("Cannot read scoped data from AddressStackLookups");
            }
            return this.readAddress(data, 1);
        };
        DataAddress.prototype.readAddress = function (value, startNode) {
            for (var i = startNode; i < this.address.length && value !== undefined; ++i) {
                var item = this.address[i];
                //Arrays and objects can be read this way, which is all there is right now.
                //Functions are only supported on the top level.
                value = value[item.key];
            }
            return value;
        };
        /**
         * Determine if a data item is an addres stack lookup or a generic object. The only test this does is to see
         * if the incoming type is a function, not reliable otherwise, but helps the compiler.
         * @param data
         */
        DataAddress.isAddressStackLookup = function (data) {
            if (typeId.isFunction(data)) {
                return true;
            }
            return false;
        };
        return DataAddress;
    }());
    exports.DataAddress = DataAddress;
    var ExpressionTree = /** @class */ (function () {
        function ExpressionTree(root) {
            this.root = root;
        }
        /**
         * Get the root node's data address, can be used to lookup data. If this is undefined
         * then there is no data address for this expression tree and it can't be used to directly
         * look up data.
         */
        ExpressionTree.prototype.getDataAddress = function () {
            return this.root.address || null;
        };
        ExpressionTree.prototype.isTrue = function (valueSource) {
            return this.evaluate(this.root, valueSource);
        };
        ExpressionTree.prototype.evaluate = function (node, valueSource) {
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
        };
        ExpressionTree.prototype.getTestKey = function (node) {
            if (node.address !== undefined) {
                return node.address;
            }
            var ret = [];
            ret.push({
                key: Object.keys(node.test)[0],
                type: AddressNodeType.Object
            });
            return new DataAddress(ret);
        };
        ExpressionTree.prototype.getTestValue = function (node, address) {
            if (node.address !== undefined) {
                return node.test['value'];
            }
            return node.test[address.address[0].key];
        };
        ExpressionTree.prototype.equals = function (current, test) {
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
        };
        ExpressionTree.prototype.compare = function (current, test, operation) {
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
        };
        return ExpressionTree;
    }());
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
    var Query = /** @class */ (function () {
        function Query() {
            this.chain = [];
        }
        /**
         * Push an item, queries are derived backward (lifo).
         */
        Query.prototype.push = function (c) {
            this.chain.push(c);
        };
        /**
         * Derive the query lifo order from how they were pushed.
         */
        Query.prototype.derive = function (item) {
            var result = item;
            for (var i = this.chain.length - 1; i >= 0 && result !== undefined; --i) {
                result = this.chain[i](result);
            }
            return result;
        };
        return Query;
    }());
    var defaultQuery = new Query(); //Empty query to use as default
    var IterateResult = /** @class */ (function () {
        function IterateResult(done, value) {
            this.done = done;
            this.value = value;
        }
        return IterateResult;
    }());
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
                var item = items[i];
                var transformed = query.derive(item);
                if (transformed !== undefined) {
                    cb(transformed);
                }
            }
        }
        else if (typeId.isFunction(items)) {
            var item = items();
            while (item !== undefined) {
                item = query.derive(item);
                cb(item);
                item = items();
            }
        }
        else if (typeId.isForEachable(items)) {
            items.forEach(function (item) {
                item = query.derive(item);
                if (item !== undefined) {
                    cb(item);
                }
            });
        }
    }
    var IteratorBase = /** @class */ (function () {
        function IteratorBase() {
        }
        IteratorBase.prototype.select = function (s) {
            return new Selector(s, this);
        };
        IteratorBase.prototype.where = function (w) {
            return new Conditional(w, this);
        };
        IteratorBase.prototype.forEach = function (cb) {
            this.build(new Query()).forEach(cb);
        };
        IteratorBase.prototype.iterator = function () {
            return this.build(new Query()).iterator();
        };
        return IteratorBase;
    }());
    var Selector = /** @class */ (function (_super) {
        __extends(Selector, _super);
        function Selector(selectCb, previous) {
            var _this = _super.call(this) || this;
            _this.selectCb = selectCb;
            _this.previous = previous;
            return _this;
        }
        Selector.prototype.build = function (query) {
            var _this = this;
            query.push(function (i) { return _this.selectCb(i); });
            return this.previous.build(query);
        };
        return Selector;
    }(IteratorBase));
    var Conditional = /** @class */ (function (_super) {
        __extends(Conditional, _super);
        function Conditional(whereCb, previous) {
            var _this = _super.call(this) || this;
            _this.whereCb = whereCb;
            _this.previous = previous;
            return _this;
        }
        Conditional.prototype.build = function (query) {
            var _this = this;
            query.push(function (i) { return _this.get(i); });
            return this.previous.build(query);
        };
        Conditional.prototype.get = function (item) {
            if (this.whereCb(item)) {
                return item;
            }
        };
        return Conditional;
    }(IteratorBase));
    var Iterable = /** @class */ (function (_super) {
        __extends(Iterable, _super);
        function Iterable(items) {
            var _this = _super.call(this) || this;
            _this.items = items;
            return _this;
        }
        Iterable.prototype.build = function (query) {
            return new BuiltQuery(this.items, query);
        };
        return Iterable;
    }(IteratorBase));
    exports.Iterable = Iterable;
    var BuiltQuery = /** @class */ (function () {
        function BuiltQuery(items, query) {
            this.items = items;
            this.query = query;
        }
        BuiltQuery.prototype.forEach = function (cb) {
            _forEach(this.items, this.query, cb);
        };
        BuiltQuery.prototype.iterator = function () {
            return _iterate(this.items, this.query);
        };
        return BuiltQuery;
    }());
});
define("hr.textstream", ["require","exports","hr.escape","hr.expressiontree","hr.jsep","hr.iterable"], function (require, exports, hr_escape_1, exprTree, jsep, hr_iterable_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var NodeScope = /** @class */ (function () {
        function NodeScope(parent, scopeName, data, address) {
            this.parent = parent;
            this.scopeName = scopeName;
            this.data = data;
            this.address = address;
            parent = parent || null;
        }
        NodeScope.prototype.getRawData = function (address) {
            if (address.isInScope(this.scopeName) || this.parent === null) {
                return this.data.getRawData(address);
            }
            else {
                return this.parent.getRawData(address);
            }
        };
        NodeScope.prototype.getFormatted = function (data, address) {
            //Get top parent
            var parent = this;
            while (parent.parent !== null) {
                parent = parent.parent;
            }
            return parent.data.getFormatted(data, address);
        };
        NodeScope.prototype.getFullAddress = function (childAddress) {
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
        };
        Object.defineProperty(NodeScope.prototype, "isTopLevel", {
            get: function () {
                return this.parent === null;
            },
            enumerable: true,
            configurable: true
        });
        return NodeScope;
    }());
    var TextNode = /** @class */ (function () {
        function TextNode(str) {
            this.str = str;
        }
        TextNode.prototype.writeFunction = function (data) {
            return this.str;
        };
        return TextNode;
    }());
    var ScopedFullDataAddress = /** @class */ (function () {
        function ScopedFullDataAddress(scope, varAddress) {
            this.scope = scope;
            this.varAddress = varAddress;
        }
        Object.defineProperty(ScopedFullDataAddress.prototype, "address", {
            get: function () {
                //Build complete address, slow for now
                var address = this.scope.getFullAddress(this.varAddress);
                return address;
            },
            enumerable: true,
            configurable: true
        });
        ScopedFullDataAddress.prototype.read = function (data, startNode) {
            throw new Error("Method not supported.");
        };
        ScopedFullDataAddress.prototype.isInScope = function (scope) {
            throw new Error("Method not supported.");
        };
        ScopedFullDataAddress.prototype.readScoped = function (data) {
            throw new Error("Method not supported.");
        };
        return ScopedFullDataAddress;
    }());
    exports.ScopedFullDataAddress = ScopedFullDataAddress;
    var VariableNode = /** @class */ (function () {
        function VariableNode(variable) {
            var expressionTree = exprTree.create(variable);
            this.address = expressionTree.getDataAddress();
            if (this.address === null) {
                var message = "Expression \"" + variable + "\" is not a valid variable node expression.";
                console.log(message);
                throw new Error(message);
            }
        }
        VariableNode.prototype.writeFunction = function (data) {
            var lookedUp = data.getRawData(this.address);
            var finalAddress = this.address;
            if (!data.isTopLevel) {
                finalAddress = new ScopedFullDataAddress(data, this.address);
            }
            return data.getFormatted(lookedUp, finalAddress);
        };
        return VariableNode;
    }());
    var ReadIfData = /** @class */ (function () {
        function ReadIfData(data) {
            this.data = data;
        }
        ReadIfData.prototype.getValue = function (address) {
            return this.data.getRawData(address);
        };
        return ReadIfData;
    }());
    var IfNode = /** @class */ (function () {
        function IfNode(condition) {
            this.condition = condition;
            this.streamNodesPass = [];
            this.streamNodesFail = [];
            condition = condition.replace("&gt;", ">");
            condition = condition.replace("&lt;", "<");
            this.expressionTree = exprTree.create(condition);
        }
        IfNode.prototype.writeFunction = function (data) {
            if (this.expressionTree.isTrue(new ReadIfData(data))) {
                return format(data, this.streamNodesPass);
            }
            else {
                return format(data, this.streamNodesFail);
            }
        };
        IfNode.prototype.getStreamNodes = function () {
            return this.streamNodesPass;
        };
        IfNode.prototype.getFailNodes = function () {
            return this.streamNodesFail;
        };
        IfNode.prototype.checkPopStatement = function (variable) {
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
        };
        return IfNode;
    }());
    function isElseIf(variable) {
        return variable.length > 6 && variable[0] === 'e' && variable[1] === 'l' && variable[2] === 's' && variable[3] === 'e' && /\s/.test(variable[4]) && variable[5] === 'i' && variable[6] === 'f' && /\s/.test(variable[7]);
    }
    function isElse(variable) {
        return variable === 'else';
    }
    var ForInNode = /** @class */ (function () {
        function ForInNode(condition) {
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
        ForInNode.prototype.writeFunction = function (data) {
            var _this = this;
            var text = "";
            var iter = new hr_iterable_1.Iterable(data.getRawData(this.address));
            var localScopeName = this.scopeName;
            iter.forEach(function (item) {
                var itemScope = new NodeScope(data, _this.scopeName, {
                    getRawData: function (a) { return a.readScoped(item); },
                    getFormatted: function (d, a) { return d; } //Doesn't really do anything, won't get called
                }, _this.address);
                for (var i = 0; i < _this.streamNodes.length; ++i) {
                    text += _this.streamNodes[i].writeFunction(itemScope);
                }
            });
            return text;
        };
        ForInNode.prototype.getStreamNodes = function () {
            return this.streamNodes;
        };
        ForInNode.prototype.checkPopStatement = function (variable) {
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
        };
        return ForInNode;
    }());
    var EscapeVariableNode = /** @class */ (function () {
        function EscapeVariableNode(wrapped) {
            this.wrapped = wrapped;
        }
        EscapeVariableNode.prototype.writeFunction = function (data) {
            return hr_escape_1.escape(this.wrapped.writeFunction(data));
        };
        return EscapeVariableNode;
    }());
    var noData = {
        getFormatted: function (val, address) { return val; },
        getRawData: function (address) { return undefined; }
    };
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
    var NodeStackItem = /** @class */ (function () {
        function NodeStackItem(node, allowElseMode) {
            this.node = node;
            this.allowElseMode = allowElseMode;
            this.elseMode = false;
        }
        return NodeStackItem;
    }());
    var StreamNodeTracker = /** @class */ (function () {
        function StreamNodeTracker(baseStreamNodes) {
            this.baseStreamNodes = baseStreamNodes;
            this.blockNodeStack = [];
        }
        StreamNodeTracker.prototype.pushIfNode = function (ifNode) {
            this.blockNodeStack.push(new NodeStackItem(ifNode, true));
        };
        StreamNodeTracker.prototype.pushBlockNode = function (blockNode) {
            this.blockNodeStack.push(new NodeStackItem(blockNode, false));
        };
        StreamNodeTracker.prototype.setElseMode = function () {
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
        };
        StreamNodeTracker.prototype.popBlockNode = function (variable) {
            if (this.blockNodeStack.length === 0) {
                var message = "Popped block node without any block statement present. Is there an extra end block or elseif statement?";
                console.log(message);
                throw new Error(message);
            }
            this.getCurrentBlock().node.checkPopStatement(variable);
            this.blockNodeStack.pop();
        };
        StreamNodeTracker.prototype.getCurrentStreamNodes = function () {
            if (this.blockNodeStack.length === 0) {
                return this.baseStreamNodes;
            }
            var block = this.getCurrentBlock();
            if (block.elseMode) {
                return block.node.getFailNodes();
            }
            return block.node.getStreamNodes();
        };
        StreamNodeTracker.prototype.checkError = function () {
            if (this.blockNodeStack.length > 0) {
                var message = "Blocks still on stack when stream processed. Did you forget a close block somewhere?";
                console.log(message);
                throw new Error(message);
            }
        };
        StreamNodeTracker.prototype.getCurrentBlock = function () {
            return this.blockNodeStack[this.blockNodeStack.length - 1];
        };
        return StreamNodeTracker;
    }());
    /**
     * Create a text stream that when called with data will output
     * the original string with new data filled out. If the text contains
     * no variables no stream will be created.
     * @param {type} text
     * @returns {type}
     */
    var TextStream = /** @class */ (function () {
        function TextStream(text, options) {
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
                                var currentBracketStreamNodes = streamNodeTracker.getCurrentStreamNodes();
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
                                    var ifNode = new IfNode(variable.substring(7));
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
        TextStream.prototype.format = function (data) {
            return format(data, this.streamNodes);
        };
        TextStream.prototype.foundVariable = function () {
            return this.variablesFound;
        };
        return TextStream;
    }());
    exports.TextStream = TextStream;
});
define("hr.schema", ["require","exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
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
});
define("node_modules/htmlrapier/src/schemaprocessor", ["require","exports","hr.schema","hr.expressiontree"], function (require, exports, hr_schema_1, expression) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
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
        processed.buildType = getPropertyType(prop).toLowerCase();
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
    function getPropertyType(prop) {
        if (Array.isArray(prop.type)) {
            for (var j = 0; j < prop.type.length; ++j) {
                if (prop.type[j] !== "null") {
                    return prop.type[j];
                }
            }
        }
        else if (prop.type) { //If the property type is set, return it
            return prop.type;
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
    ;
    var schemaFormatterExtensions = [];
    function registerSchemaViewFormatterExtension(builder) {
        schemaFormatterExtensions.push(builder);
    }
    exports.registerSchemaViewFormatterExtension = registerSchemaViewFormatterExtension;
    var SchemaViewFormatter = /** @class */ (function () {
        function SchemaViewFormatter(schema) {
            this.schema = schema;
            this.cachedProperties = {};
        }
        SchemaViewFormatter.prototype.convert = function (data) {
            return new SchemaViewExtractor(this, data, this.schema, this.cachedProperties);
        };
        return SchemaViewFormatter;
    }());
    exports.SchemaViewFormatter = SchemaViewFormatter;
    var SchemaViewExtractor = /** @class */ (function () {
        function SchemaViewExtractor(dataFormatter, original, schema, cachedProperties) {
            this.dataFormatter = dataFormatter;
            this.original = original;
            this.schema = schema;
            this.cachedProperties = cachedProperties;
        }
        SchemaViewExtractor.prototype.getRawData = function (address) {
            return address.read(this.original);
        };
        SchemaViewExtractor.prototype.getFormatted = function (data, address) {
            return this.extract(data, address.address);
        };
        SchemaViewExtractor.prototype.extract = function (data, address) {
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
        };
        SchemaViewExtractor.prototype.findSchemaProperty = function (rootSchema, prop, name) {
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
        };
        SchemaViewExtractor.prototype.getPropertyForAddress = function (rootSchema, address) {
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
        };
        return SchemaViewExtractor;
    }());
});
define("hr.view", ["require","exports","hr.textstream","hr.components","hr.typeidentifiers","hr.domquery","hr.iterable","hr.viewformatter"], function (require, exports, hr_textstream_1, components, typeId, domQuery, iter, hr_viewformatter_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.SchemaViewDataFormatter = hr_viewformatter_1.SchemaViewFormatter;
    var ComponentView = /** @class */ (function () {
        function ComponentView(element, component) {
            this.element = element;
            this.component = component;
        }
        ComponentView.prototype.setData = function (data, createdCallback, variantFinderCallback) {
            components.empty(this.element);
            this.insertData(data, null, createdCallback, variantFinderCallback);
        };
        ComponentView.prototype.appendData = function (data, createdCallback, variantFinderCallback) {
            this.insertData(data, null, createdCallback, variantFinderCallback);
        };
        ComponentView.prototype.insertData = function (data, insertBeforeSibling, createdCallback, variantFinderCallback) {
            var _this = this;
            var wrapCreatedCallback = createdCallback !== undefined && createdCallback !== null;
            var wrapVariantFinderCallback = variantFinderCallback !== undefined && variantFinderCallback !== null;
            if (Array.isArray(data) || typeId.isForEachable(data)) {
                if (this.formatter !== undefined) {
                    var dataExtractors = new iter.Iterable(data).select(function (i) {
                        return _this.formatter.convert(i);
                    });
                    components.many(this.component, dataExtractors, this.element, insertBeforeSibling, wrapCreatedCallback === false ? undefined : function (b, e) {
                        return createdCallback(b, e.original);
                    }, wrapVariantFinderCallback === false ? undefined : function (i) {
                        return variantFinderCallback(i.original);
                    });
                }
                else {
                    var dataExtractors = new iter.Iterable(data).select(function (i) {
                        return new ObjectTextStreamData(i);
                    });
                    components.many(this.component, dataExtractors, this.element, insertBeforeSibling, wrapCreatedCallback === false ? undefined : function (b, e) {
                        return createdCallback(b, e.getDataObject());
                    }, wrapVariantFinderCallback === false ? undefined : function (i) {
                        return variantFinderCallback(i.getDataObject());
                    });
                }
            }
            else if (data !== undefined && data !== null) {
                if (this.formatter !== undefined) {
                    components.one(this.component, this.formatter.convert(data), this.element, insertBeforeSibling, wrapCreatedCallback === false ? undefined : function (b, e) {
                        return createdCallback(b, e.original);
                    }, wrapVariantFinderCallback === false ? undefined : function (i) {
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
                    components.one(this.component, dataStream, this.element, insertBeforeSibling, wrapCreatedCallback === false ? undefined : function (b, e) {
                        return createdCallback(b, e.getDataObject());
                    }, wrapVariantFinderCallback === false ? undefined : function (i) {
                        return variantFinderCallback(i.getDataObject());
                    });
                }
            }
        };
        ComponentView.prototype.clear = function () {
            components.empty(this.element);
        };
        ComponentView.prototype.setFormatter = function (formatter) {
            this.formatter = formatter;
        };
        return ComponentView;
    }());
    var TextNodeView = /** @class */ (function () {
        function TextNodeView(element) {
            this.element = element;
            this.dataTextElements = undefined;
        }
        TextNodeView.prototype.setData = function (data) {
            this.insertData(data);
        };
        TextNodeView.prototype.appendData = function (data) {
            this.insertData(data);
        };
        TextNodeView.prototype.insertData = function (data) {
            if (this.formatter !== undefined) {
                var extractor = this.formatter.convert(data);
                this.writeTextStream(extractor);
            }
            else {
                this.bindData(data);
            }
        };
        TextNodeView.prototype.clear = function () {
            this.bindData(sharedClearer);
        };
        TextNodeView.prototype.setFormatter = function (formatter) {
            this.formatter = formatter;
        };
        TextNodeView.prototype.bindData = function (data) {
            var callback;
            if (typeId.isFunction(data)) {
                callback = new FuncTextStreamData(data);
            }
            else {
                callback = new ObjectTextStreamData(data);
            }
            this.writeTextStream(callback);
        };
        TextNodeView.prototype.writeTextStream = function (textStream) {
            this.ensureDataTextElements();
            for (var i = 0; i < this.dataTextElements.length; ++i) {
                var node = this.dataTextElements[i];
                node.node.textContent = node.stream.format(textStream);
            }
        };
        TextNodeView.prototype.ensureDataTextElements = function () {
            var _this = this;
            if (this.dataTextElements === undefined) {
                this.dataTextElements = [];
                domQuery.iterateNodes(this.element, NodeFilter.SHOW_TEXT, function (node) {
                    var textStream = new hr_textstream_1.TextStream(node.textContent, { escape: false }); //Since we are using textContent, there is no need to escape the input
                    if (textStream.foundVariable()) {
                        _this.dataTextElements.push({
                            node: node,
                            stream: textStream
                        });
                    }
                });
            }
        };
        return TextNodeView;
    }());
    var NullView = /** @class */ (function () {
        function NullView() {
        }
        NullView.prototype.setData = function () {
        };
        NullView.prototype.appendData = function () {
        };
        NullView.prototype.insertData = function () {
        };
        NullView.prototype.clear = function () {
        };
        NullView.prototype.setFormatter = function (formatter) {
        };
        return NullView;
    }());
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
    var ObjectTextStreamData = /** @class */ (function () {
        function ObjectTextStreamData(data) {
            this.data = data;
        }
        ObjectTextStreamData.prototype.getDataObject = function () {
            return this.data;
        };
        ObjectTextStreamData.prototype.getRawData = function (address) {
            return address.read(this.data);
        };
        ObjectTextStreamData.prototype.getFormatted = function (data, address) {
            return data;
        };
        return ObjectTextStreamData;
    }());
    var FuncTextStreamData = /** @class */ (function () {
        function FuncTextStreamData(data) {
            this.data = data;
        }
        FuncTextStreamData.prototype.getDataObject = function () {
            return this.data;
        };
        FuncTextStreamData.prototype.getRawData = function (address) {
            var lookup;
            if (address.address.length > 0) {
                lookup = address.address[0].key;
            }
            else {
                lookup = "this";
            }
            return address.readScoped(this.data(lookup));
        };
        FuncTextStreamData.prototype.getFormatted = function (data, address) {
            return data;
        };
        return FuncTextStreamData;
    }());
});
define("hr.models", ["require","exports","hr.form","hr.view"], function (require, exports, forms, views) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function build(element) {
        var src = element.getAttribute('data-hr-model-src');
        if (element.nodeName === 'FORM' || element.nodeName == 'INPUT' || element.nodeName == 'TEXTAREA') {
            var shim = forms.build(element);
            shim.appendData = function (data) {
                shim.setData(data);
            };
            shim.getSrc = function () {
                return src;
            };
            return shim;
        }
        else {
            var shim2 = views.build(element);
            shim2.getData = function () {
                return {};
            };
            shim2.getSrc = function () {
                return src;
            };
            return shim2;
        }
    }
    exports.build = build;
    var NullModel = /** @class */ (function () {
        function NullModel() {
        }
        NullModel.prototype.setData = function (data) {
        };
        NullModel.prototype.appendData = function (data) {
        };
        NullModel.prototype.clear = function () {
        };
        NullModel.prototype.getData = function () {
            return {};
        };
        NullModel.prototype.getSrc = function () {
            return "";
        };
        NullModel.prototype.setPrototype = function (proto) { };
        return NullModel;
    }());
    exports.NullModel = NullModel;
    /**
     * This class is a model that enforces its type.
     */
    var StrongTypedModel = /** @class */ (function () {
        function StrongTypedModel(childModel, strongConstructor) {
            this.childModel = childModel;
            this.strongConstructor = strongConstructor;
        }
        StrongTypedModel.prototype.setData = function (data) {
            this.childModel.setData(data);
        };
        StrongTypedModel.prototype.appendData = function (data) {
            this.childModel.appendData(data);
        };
        StrongTypedModel.prototype.clear = function () {
            this.childModel.clear();
        };
        StrongTypedModel.prototype.getData = function () {
            return new this.strongConstructor(this.childModel.getData());
        };
        StrongTypedModel.prototype.getSrc = function () {
            return this.childModel.getSrc();
        };
        StrongTypedModel.prototype.setPrototype = function (proto) {
            this.childModel.setPrototype(proto);
        };
        return StrongTypedModel;
    }());
    exports.StrongTypedModel = StrongTypedModel;
});
define("hr.bindingcollection", ["require","exports","hr.domquery","hr.toggles","hr.models","hr.form","hr.view"], function (require, exports, domQuery, toggles, models, form, view) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
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
    var PooledBindings = /** @class */ (function () {
        function PooledBindings(docFrag, parent) {
            this.docFrag = docFrag;
            this.parent = parent;
        }
        PooledBindings.prototype.restore = function (insertBefore) {
            this.parent.insertBefore(this.docFrag, insertBefore);
        };
        return PooledBindings;
    }());
    exports.PooledBindings = PooledBindings;
    /**
     * The BindingCollection class allows you to get access to the HtmlElements defined on your
     * page with objects that help manipulate them. You won't get the elements directly and you
     * should not need to, using the interfaces should be enough.
     */
    var BindingCollection = /** @class */ (function () {
        function BindingCollection(elements) {
            this.elements = domQuery.all(elements);
        }
        /**
         * Set the listener for this binding collection. This listener will have its functions
         * fired when a matching event is fired.
         * @param {type} listener
         */
        BindingCollection.prototype.setListener = function (listener) {
            bindEvents(this.elements, listener);
        };
        /**
         * Get a named toggle, this will always be an on off toggle.
         */
        BindingCollection.prototype.getToggle = function (name) {
            var toggle = new toggles.OnOffToggle();
            getToggle(name, this.elements, toggle);
            return toggle;
        };
        /**
         * Get a named toggle, this will use the passed in custom toggle instance. Using this you can define
         * states other than on and off.
         */
        BindingCollection.prototype.getCustomToggle = function (name, toggle) {
            getToggle(name, this.elements, toggle);
            return toggle;
        };
        /**
         * @deprecated
         * THIS IS DEPRECATED use getForm and getView instead.
         * Get a named model. Can also provide a StrongTypeConstructor that will be called with new to create
         * the instance of the data pulled from the model. If you don't provide this the objects will be plain
         * javascript objects.
         */
        BindingCollection.prototype.getModel = function (name, strongConstructor) {
            var model = getModel(name, this.elements);
            if (strongConstructor !== undefined) {
                model = new models.StrongTypedModel(model, strongConstructor);
            }
            return model;
        };
        /**
         * Get the config for this binding collection.
         */
        BindingCollection.prototype.getConfig = function () {
            return getConfig(this.elements);
        };
        /**
         * Get a handle element. These are direct references to html elements for passing to third party libraries
         * that need them. Don't use these directly if you can help it.
         */
        BindingCollection.prototype.getHandle = function (name) {
            return getHandle(name, this.elements);
        };
        /**
         * Iterate over all the controllers in the BindingCollection.
         */
        BindingCollection.prototype.iterateControllers = function (name, cb) {
            iterateControllers(name, this.elements, cb);
        };
        /**
         * Get a named form, will return a valid IForm object no matter what, but that object
         * might not actually be a rea form on the document if name does not exist.
         * @param name The name of the form to lookup.
         */
        BindingCollection.prototype.getForm = function (name) {
            var query = '[data-hr-form=' + name + ']';
            var targetElement = this.findElement(query);
            //Backward compatibility with model
            if (targetElement === null) {
                query = '[data-hr-model=' + name + ']';
                targetElement = this.findElement(query);
            }
            return form.build(targetElement);
        };
        /**
         * Get a named view, will return a valid IView object no matter what, but that object
         * might not actually be a real view on the document if name does not exist.
         * @param name The name of the view to lookup
         */
        BindingCollection.prototype.getView = function (name) {
            var query = '[data-hr-view=' + name + ']';
            var targetElement = this.findElement(query);
            //Backward compatibility with model
            if (targetElement === null) {
                query = '[data-hr-model=' + name + ']';
                targetElement = this.findElement(query);
            }
            return view.build(targetElement);
        };
        BindingCollection.prototype.findElement = function (query) {
            for (var eIx = 0; eIx < this.elements.length; ++eIx) {
                var element = this.elements[eIx];
                var targetElement = domQuery.first(query, element);
                if (targetElement) {
                    //Found it, return now
                    return targetElement;
                }
            }
            return null; //Not found, return null
        };
        Object.defineProperty(BindingCollection.prototype, "rootElement", {
            /**
             * Return the "root" html element for this binding collection. If there is more
             * than one element, the first one will be returned and null will be returned if
             * there is no root element. Ideally you would not use this directly, but it is
             * useful to insert nodes before a set of bound elements.
             */
            get: function () {
                return this.elements.length > 0 ? this.elements[0] : null;
            },
            enumerable: true,
            configurable: true
        });
        /**
         * Remove all contained elements from the document. Be sure to use this to
         * remove the collection so all elements are properly removed.
         */
        BindingCollection.prototype.remove = function () {
            for (var eIx = 0; eIx < this.elements.length; ++eIx) {
                this.elements[eIx].remove();
            }
        };
        /**
         * Pool the elements into a document fragment. Will return a pooled bindings
         * class that can be used to restore the pooled elements to the document.
         */
        BindingCollection.prototype.pool = function () {
            var parent = this.elements[0].parentElement;
            var docFrag = document.createDocumentFragment();
            for (var eIx = 0; eIx < this.elements.length; ++eIx) {
                docFrag.appendChild(this.elements[eIx]);
            }
            return new PooledBindings(docFrag, parent);
        };
        return BindingCollection;
    }());
    exports.BindingCollection = BindingCollection;
    ;
});
define("hr.componentbuilder", ["require","exports","hr.bindingcollection","hr.textstream"], function (require, exports, hr_bindingcollection_3, hr_textstream_2) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var VariantBuilder = /** @class */ (function () {
        function VariantBuilder(componentString) {
            this.componentString = componentString;
            this.tokenizedString = null;
        }
        VariantBuilder.prototype.create = function (data, parentComponent, insertBeforeSibling) {
            this.ensureTokenizer();
            return createItem(data, this.tokenizedString, parentComponent, insertBeforeSibling);
        };
        VariantBuilder.prototype.ensureTokenizer = function () {
            if (this.tokenizedString === null) {
                this.tokenizedString = new hr_textstream_2.TextStream(this.componentString);
            }
        };
        return VariantBuilder;
    }());
    exports.VariantBuilder = VariantBuilder;
    var ComponentBuilder = /** @class */ (function () {
        function ComponentBuilder(componentString) {
            this.componentString = componentString;
            this.variants = {};
            this.tokenizedString = null;
        }
        ComponentBuilder.prototype.create = function (data, parentComponent, insertBeforeSibling, variant) {
            if (variant !== null && this.variants.hasOwnProperty(variant)) {
                return this.variants[variant].create(data, parentComponent, insertBeforeSibling);
            }
            this.ensureTokenizer();
            return createItem(data, this.tokenizedString, parentComponent, insertBeforeSibling);
        };
        ComponentBuilder.prototype.addVariant = function (name, variantBuilder) {
            this.variants[name] = variantBuilder;
        };
        ComponentBuilder.prototype.ensureTokenizer = function () {
            if (this.tokenizedString === null) {
                this.tokenizedString = new hr_textstream_2.TextStream(this.componentString);
            }
        };
        return ComponentBuilder;
    }());
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
        return new hr_bindingcollection_3.BindingCollection(arrayedItems);
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
define("hr.form.bootstrap3", ["require","exports","hr.components","hr.componentbuilder"], function (require, exports, component, hr_componentbuilder_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var builder;
    builder = new hr_componentbuilder_1.ComponentBuilder('<div data-hr-toggle="{{buildName}}Hide" data-hr-style-on="display:none;"> <div class="form-group" data-hr-toggle="{{buildName}}Error" data-hr-class-on="has-error"> <label for="{{uniqueId}}" class="control-label">{{title}}<span data-hr-view="{{buildName}}ErrorMessage" data-hr-toggle="{{buildName}}Error" data-hr-style-on="display:inline" style="display:none"> - {{{this}}}</span></label> {{if xUi.autocomplete}} <input id="{{uniqueId}}" class="form-control" name="{{buildName}}" type="{{buildType}}" list="{{uniqueId}}-datalist"> <datalist id="{{uniqueId}}-datalist"></datalist> {{else}} <input id="{{uniqueId}}" class="form-control" name="{{buildName}}" type="{{buildType}}"> {{/if}} </div> </div>');
    builder.addVariant("date-time", new hr_componentbuilder_1.VariantBuilder('<div data-hr-toggle="{{buildName}}Hide" data-hr-style-on="display:none;"> <div class="form-group" data-hr-toggle="{{buildName}}Error" data-hr-class-on="has-error"> <label for="{{uniqueId}}" class="control-label">{{title}}<span data-hr-view="{{buildName}}ErrorMessage" data-hr-toggle="{{buildName}}Error" data-hr-style-on="display:inline" style="display:none"> - {{{this}}}</span></label> <input id="{{uniqueId}}" class="form-control" name="{{buildName}}" type="text"> </div> </div>'));
    builder.addVariant("date", new hr_componentbuilder_1.VariantBuilder('<div data-hr-toggle="{{buildName}}Hide" data-hr-style-on="display:none;"> <div class="form-group" data-hr-toggle="{{buildName}}Error" data-hr-class-on="has-error"> <label for="{{uniqueId}}" class="control-label">{{title}}<span data-hr-view="{{buildName}}ErrorMessage" data-hr-toggle="{{buildName}}Error" data-hr-style-on="display:inline" style="display:none"> - {{{this}}}</span></label> <input id="{{uniqueId}}" class="form-control" name="{{buildName}}" type="text"> </div> </div>'));
    builder.addVariant("textarea", new hr_componentbuilder_1.VariantBuilder('<div data-hr-toggle="{{buildName}}Hide" data-hr-style-on="display:none;"> <div class="form-group" data-hr-toggle="{{buildName}}Error" data-hr-class-on="has-error"> <label for="{{uniqueId}}" class="control-label">{{title}}<span data-hr-view="{{buildName}}ErrorMessage" data-hr-toggle="{{buildName}}Error" data-hr-style-on="display:inline" style="display:none"> - {{{this}}}</span></label> <textarea id="{{uniqueId}}" class="form-control" name="{{buildName}}" rows="{{size}}"></textarea> </div> </div>'));
    builder.addVariant("checkbox", new hr_componentbuilder_1.VariantBuilder('<div data-hr-toggle="{{buildName}}Hide" data-hr-style-on="display:none;"> <div class="checkbox"> <label><input type="checkbox" name="{{buildName}}" value="{{buildValue}}">&nbsp;{{title}}</label> </div> </div>'));
    builder.addVariant("hidden", new hr_componentbuilder_1.VariantBuilder('<input id="{{uniqueId}}" type="hidden" name="{{buildName}}">'));
    builder.addVariant("number", new hr_componentbuilder_1.VariantBuilder('<div data-hr-toggle="{{buildName}}Hide" data-hr-style-on="display:none;"> <div class="form-group" data-hr-toggle="{{buildName}}Error" data-hr-class-on="has-error"> <label for="{{uniqueId}}" class="control-label">{{title}}<span data-hr-view="{{buildName}}ErrorMessage" data-hr-toggle="{{buildName}}Error" data-hr-style-on="display:inline" style="display:none"> - {{{this}}}</span></label> <input id="{{uniqueId}}" class="form-control" name="{{buildName}}" type="number" step="any"> </div> </div>'));
    builder.addVariant("select", new hr_componentbuilder_1.VariantBuilder('<div data-hr-toggle="{{buildName}}Hide" data-hr-style-on="display:none;"> <div class="form-group" data-hr-toggle="{{buildName}}Error" data-hr-class-on="has-error"> <label for="{{uniqueId}}" class="control-label">{{title}}<span data-hr-view="{{buildName}}ErrorMessage" data-hr-toggle="{{buildName}}Error" data-hr-style-on="display:inline" style="display:none"> - {{{this}}}</span></label> <select id="{{uniqueId}}" class="form-control" name="{{buildName}}"> </select></div></div>'));
    builder.addVariant("multiselect", new hr_componentbuilder_1.VariantBuilder('<div data-hr-toggle="{{buildName}}Hide" data-hr-style-on="display:none;"> <div class="form-group" data-hr-toggle="{{buildName}}Error" data-hr-class-on="has-error"> <label for="{{uniqueId}}" class="control-label">{{title}}<span data-hr-view="{{buildName}}ErrorMessage" data-hr-toggle="{{buildName}}Error" data-hr-style-on="display:inline" style="display:none"> - {{{this}}}</span></label> <select id="{{uniqueId}}" class="form-control" name="{{buildName}}" multiple="" size="{{size}}"> </select></div></div>'));
    builder.addVariant("arrayEditor", new hr_componentbuilder_1.VariantBuilder('<div data-hr-toggle="{{buildName}}Hide" data-hr-style-on="display:none;"> <div data-hr-toggle="{{buildName}}Error" data-hr-class-on="has-error"> <label class="control-label">{{title}}<span data-hr-view="{{buildName}}ErrorMessage" data-hr-toggle="{{buildName}}Error" data-hr-style-on="display:inline" style="display:none"> - {{{this}}}</span></label> <div class="panel panel-default"> <div class="panel-body"> <div data-hr-view="items" data-hr-view-component="hr.forms.default-arrayEditorItem"></div> <button type="button" class="btn btn-default" data-hr-on-click="add">Add</button> </div> </div> </div> </div>'));
    builder.addVariant("multicheckbox", new hr_componentbuilder_1.VariantBuilder('<div data-hr-toggle="{{buildName}}Hide" data-hr-style-on="display:none;"> <div class="form-group" data-hr-toggle="{{buildName}}Error" data-hr-class-on="has-error"> <label class="control-label">{{title}}<span data-hr-view="{{buildName}}ErrorMessage" data-hr-toggle="{{buildName}}Error" data-hr-style-on="display:inline" style="display:none"> - {{{this}}}</span></label> <div class="panel panel-default" style="max-height:150px;overflow:auto;"> {{if xUi.selectAll}} <div class="panel-body" style="padding:0px;"> <div class="checkbox"><label><input type="checkbox" value="true" data-hr-on-click="selectAll" data-hr-handle="selectAll">&nbsp;Select All</label></div> </div> {{/if}} <div data-hr-view="items" style="padding:0px;" data-hr-view-component="hr.forms.default-multicheckboxitem"></div> </div> <div class="clearfix"></div> </div> </div>'));
    builder.addVariant("radiobutton", new hr_componentbuilder_1.VariantBuilder('<div data-hr-toggle="{{buildName}}Hide" data-hr-style-on="display:none;"> <div class="form-group" data-hr-toggle="{{buildName}}Error" data-hr-class-on="has-error"> <label class="control-label">{{title}}<span data-hr-view="{{buildName}}ErrorMessage" data-hr-toggle="{{buildName}}Error" data-hr-style-on="display:inline" style="display:none"> - {{{this}}}</span></label> <div data-hr-view="items" data-hr-view-component="hr.forms.default-radiobutton"></div> </div> </div>'));
    builder.addVariant("search", new hr_componentbuilder_1.VariantBuilder('<div data-hr-toggle="{{buildName}}Hide" data-hr-style-on="display:none;"> <div class="form-group" data-hr-toggle="{{buildName}}Error" data-hr-class-on="has-error"> <label for="{{uniqueId}}" class="control-label"> {{title}}<span data-hr-view="{{buildName}}ErrorMessage" data-hr-toggle="{{buildName}}Error" data-hr-style-on="display:inline" style="display:none"> - {{{this}}}</span> </label> <div data-hr-on-focusout="stopSearch" data-hr-handle="searchFocusParent"> <input id="{{uniqueId}}" class="form-control" name="{{buildName}}" type="text" data-hr-on-input="updateSearch"> <div class="dropdown" data-hr-toggle="popup" data-hr-class-on="open"> <ul class="dropdown-menu" data-hr-view="results" data-hr-view-component="hr.forms.default-searchResult"></ul> </div> </div> </div> </div>'));
    component.register("hr.forms.default", builder);
    builder = new hr_componentbuilder_1.ComponentBuilder('<div class="checkbox"><label><input type="checkbox" value="{{value}}" data-hr-handle="check">&nbsp;{{label}}</label></div>');
    component.register("hr.forms.default-multicheckboxitem", builder);
    builder = new hr_componentbuilder_1.ComponentBuilder('<div class="radio"><label><input type="radio" name="{{name}}" value="{{value}}" data-hr-handle="radio">&nbsp;{{label}}</label></div>');
    component.register("hr.forms.default-radiobutton", builder);
    builder = new hr_componentbuilder_1.ComponentBuilder('<div class="panel panel-default"><div class="panel-body"><button type="button" data-hr-on-click="remove" class="btn btn-default" data-hr-form-end="">Remove</button></div></div>');
    component.register("hr.forms.default-arrayEditorItem", builder);
    builder = new hr_componentbuilder_1.ComponentBuilder('<li><a href="#" data-hr-on-click="selectItem">{{title}}</a></li>');
    builder.addVariant("message", new hr_componentbuilder_1.VariantBuilder('<li><a>{{title}}</a></li>'));
    component.register("hr.forms.default-searchResult", builder);
    builder = new hr_componentbuilder_1.ComponentBuilder('<div data-hr-toggle="{{buildName}}Hide" data-hr-style-on="display:none;"> <div class="form-group" data-hr-toggle="{{buildName}}Error" data-hr-class-on="has-error"> <label for="{{uniqueId}}" class="col-sm-2 control-label">{{title}}<span data-hr-view="{{buildName}}ErrorMessage" data-hr-toggle="{{buildName}}Error" data-hr-style-on="display:inline" style="display:none"> - {{{this}}}</span></label> <div class="col-sm-10"> {{if xUi.autocomplete}} <input id="{{uniqueId}}" class="form-control" name="{{buildName}}" type="{{buildType}}" list="{{uniqueId}}-datalist"> <datalist id="{{uniqueId}}-datalist"></datalist> {{else}} <input id="{{uniqueId}}" class="form-control" name="{{buildName}}" type="{{buildType}}"> {{/if}} </div> </div> </div>');
    builder.addVariant("date-time", new hr_componentbuilder_1.VariantBuilder('<div data-hr-toggle="{{buildName}}Hide" data-hr-style-on="display:none;"> <div class="form-group" data-hr-toggle="{{buildName}}Error" data-hr-class-on="has-error"> <label for="{{uniqueId}}" class="col-sm-2 control-label">{{title}}<span data-hr-view="{{buildName}}ErrorMessage" data-hr-toggle="{{buildName}}Error" data-hr-style-on="display:inline" style="display:none"> - {{{this}}}</span></label> <div class="col-sm-10"> <input id="{{uniqueId}}" class="form-control" name="{{buildName}}" type="text"> </div> </div> </div>'));
    builder.addVariant("date", new hr_componentbuilder_1.VariantBuilder('<div data-hr-toggle="{{buildName}}Hide" data-hr-style-on="display:none;"> <div class="form-group" data-hr-toggle="{{buildName}}Error" data-hr-class-on="has-error"> <label for="{{uniqueId}}" class="col-sm-2 control-label">{{title}}<span data-hr-view="{{buildName}}ErrorMessage" data-hr-toggle="{{buildName}}Error" data-hr-style-on="display:inline" style="display:none"> - {{{this}}}</span></label> <div class="col-sm-10"> <input id="{{uniqueId}}" class="form-control" name="{{buildName}}" type="text"> </div> </div> </div>'));
    builder.addVariant("textarea", new hr_componentbuilder_1.VariantBuilder('<div data-hr-toggle="{{buildName}}Hide" data-hr-style-on="display:none;"> <div class="form-group" data-hr-toggle="{{buildName}}Error" data-hr-class-on="has-error"> <label for="{{uniqueId}}" class="col-sm-2 control-label">{{title}}<span data-hr-view="{{buildName}}ErrorMessage" data-hr-toggle="{{buildName}}Error" data-hr-style-on="display:inline" style="display:none"> - {{{this}}}</span></label> <div class="col-sm-10"> <textarea id="{{uniqueId}}" class="form-control" name="{{buildName}}" rows="{{size}}"></textarea> </div> </div> </div>'));
    builder.addVariant("checkbox", new hr_componentbuilder_1.VariantBuilder('<div data-hr-toggle="{{buildName}}Hide" data-hr-style-on="display:none;"> <div class="form-group"> <div class="col-sm-offset-2 col-sm-10"> <div class="checkbox"> <label><input type="checkbox" name="{{buildName}}" value="{{buildValue}}">&nbsp;{{title}}</label> </div> </div> </div> </div>'));
    builder.addVariant("hidden", new hr_componentbuilder_1.VariantBuilder('<input type="hidden" name="{{buildName}}">'));
    builder.addVariant("number", new hr_componentbuilder_1.VariantBuilder('<div data-hr-toggle="{{buildName}}Hide" data-hr-style-on="display:none;"> <div class="form-group" data-hr-toggle="{{buildName}}Error" data-hr-class-on="has-error"> <label for="{{uniqueId}}" class="col-sm-2 control-label">{{title}}<span data-hr-view="{{buildName}}ErrorMessage" data-hr-toggle="{{buildName}}Error" data-hr-style-on="display:inline" style="display:none"> - {{{this}}}</span></label><div class="col-sm-10"> <input id="{{uniqueId}}" class="form-control" name="{{buildName}}" type="number" step="any"> </div> </div> </div>'));
    builder.addVariant("select", new hr_componentbuilder_1.VariantBuilder('<div data-hr-toggle="{{buildName}}Hide" data-hr-style-on="display:none;"> <div class="form-group" data-hr-toggle="{{buildName}}Error" data-hr-class-on="has-error"> <label for="{{uniqueId}}" class="col-sm-2 control-label">{{title}}<span data-hr-view="{{buildName}}ErrorMessage" data-hr-toggle="{{buildName}}Error" data-hr-style-on="display:inline" style="display:none"> - {{{this}}}</span></label><div class="col-sm-10"> <select id="{{uniqueId}}" class="form-control" name="{{buildName}}"> </select></div></div></div>'));
    builder.addVariant("multiselect", new hr_componentbuilder_1.VariantBuilder('<div data-hr-toggle="{{buildName}}Hide" data-hr-style-on="display:none;"> <div class="form-group" data-hr-toggle="{{buildName}}Error" data-hr-class-on="has-error"> <label for="{{uniqueId}}" class="col-sm-2 control-label">{{title}}<span data-hr-view="{{buildName}}ErrorMessage" data-hr-toggle="{{buildName}}Error" data-hr-style-on="display:inline" style="display:none"> - {{{this}}}</span></label><div class="col-sm-10"> <select id="{{uniqueId}}" class="form-control" name="{{buildName}}" multiple="" size="{{size}}"> </select></div></div></div>'));
    builder.addVariant("arrayEditor", new hr_componentbuilder_1.VariantBuilder('<div data-hr-toggle="{{buildName}}Hide" data-hr-style-on="display:none;"> <div data-hr-toggle="{{buildName}}Error" data-hr-class-on="has-error"> <label class="control-label col-sm-2">{{title}}<span data-hr-view="{{buildName}}ErrorMessage" data-hr-toggle="{{buildName}}Error" data-hr-style-on="display:inline" style="display:none"> - {{{this}}}</span></label> <div class="col-sm-10 panel panel-default"> <div class="panel-body"> <div data-hr-view="items" data-hr-view-component="hr.forms.horizontal-arrayEditorItem"></div> <button type="button" class="btn btn-default" data-hr-on-click="add">Add</button> </div> </div> </div> </div>'));
    builder.addVariant("multicheckbox", new hr_componentbuilder_1.VariantBuilder('<div data-hr-toggle="{{buildName}}Hide" data-hr-style-on="display:none;"> <div data-hr-toggle="{{buildName}}Error" data-hr-class-on="has-error"> <label class="control-label col-sm-2">{{title}}<span data-hr-view="{{buildName}}ErrorMessage" data-hr-toggle="{{buildName}}Error" data-hr-style-on="display:inline" style="display:none"> - {{{this}}}</span></label> <div class="col-sm-10 panel panel-default" style="max-height:150px;overflow:auto;"> {{if xUi.selectAll}} <div class="panel-body" style="padding:0px;"> <div class="checkbox"><label><input type="checkbox" value="true" data-hr-on-click="selectAll" data-hr-handle="selectAll">&nbsp;Select All</label></div> </div> {{/if}} <div class="panel-body" style="padding:0px;" data-hr-view="items" data-hr-view-component="hr.forms.horizontal-multicheckboxitem"></div> </div> <div class="clearfix"></div> </div> </div>'));
    builder.addVariant("radiobutton", new hr_componentbuilder_1.VariantBuilder('<div data-hr-toggle="{{buildName}}Hide" data-hr-style-on="display:none;"> <div class="form-group" data-hr-toggle="{{buildName}}Error" data-hr-class-on="has-error"> <label class="control-label col-sm-2">{{title}}<span data-hr-view="{{buildName}}ErrorMessage" data-hr-toggle="{{buildName}}Error" data-hr-style-on="display:inline" style="display:none"> - {{{this}}}</span></label> <div class="col-sm-10" data-hr-view="items" data-hr-view-component="hr.forms.horizontal-radiobutton"></div> </div> </div>'));
    builder.addVariant("search", new hr_componentbuilder_1.VariantBuilder('<div data-hr-toggle="{{buildName}}Hide" data-hr-style-on="display:none;"> <div class="form-group" data-hr-toggle="{{buildName}}Error" data-hr-class-on="has-error"> <label for="{{uniqueId}}" class="col-sm-2 control-label"> {{title}}<span data-hr-view="{{buildName}}ErrorMessage" data-hr-toggle="{{buildName}}Error" data-hr-style-on="display:inline" style="display:none"> - {{{this}}}</span> </label> <div class="col-sm-10" data-hr-on-focusout="stopSearch" data-hr-handle="searchFocusParent"> <input id="{{uniqueId}}" class="form-control" name="{{buildName}}" type="text" data-hr-on-input="updateSearch"> <div class="dropdown" data-hr-toggle="popup" data-hr-class-on="open"> <ul class="dropdown-menu" data-hr-view="results" data-hr-view-component="hr.forms.horizontal-searchResult"></ul> </div> </div> </div> </div>'));
    component.register("hr.forms.horizontal", builder);
    builder = new hr_componentbuilder_1.ComponentBuilder('<div class="checkbox"><label><input type="checkbox" value="{{value}}" data-hr-handle="check">&nbsp;{{label}}</label></div>');
    component.register("hr.forms.horizontal-multicheckboxitem", builder);
    builder = new hr_componentbuilder_1.ComponentBuilder('<div class="radio"><label><input type="radio" name="{{name}}" value="{{value}}" data-hr-handle="radio">&nbsp;{{label}}</label></div>');
    component.register("hr.forms.horizontal-radiobutton", builder);
    builder = new hr_componentbuilder_1.ComponentBuilder('<div class="panel panel-default"> <div class="panel-body"> <button type="button" data-hr-on-click="remove" class="btn btn-default" data-hr-form-end="">Remove</button> </div> </div>');
    component.register("hr.forms.horizontal-arrayEditorItem", builder);
    builder = new hr_componentbuilder_1.ComponentBuilder('<li><a href="#" data-hr-on-click="selectItem">{{title}}</a></li>');
    builder.addVariant("message", new hr_componentbuilder_1.VariantBuilder('<li><a>{{title}}</a></li>'));
    component.register("hr.forms.horizontal-searchResult", builder);
});
jsns.run("hr.form.bootstrap3");
define("hr.timedtrigger", ["require","exports","hr.eventdispatcher"], function (require, exports, hr_eventdispatcher_4) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var TimedTrigger = /** @class */ (function () {
        function TimedTrigger(delay) {
            this.handler = new hr_eventdispatcher_4.ActionEventDispatcher();
            if (delay === undefined) {
                delay = 400;
            }
            this.delay = delay;
        }
        TimedTrigger.prototype.setDelay = function (delay) {
            this.delay = delay;
        };
        TimedTrigger.prototype.cancel = function () {
            clearTimeout(this.holder);
            this.args = undefined;
        };
        TimedTrigger.prototype.fire = function (args) {
            var _this = this;
            this.cancel();
            this.holder = window.setTimeout(function () { return _this.fireHandler(); }, this.delay);
            this.args = args;
        };
        TimedTrigger.prototype.addListener = function (listener) {
            this.handler.add(listener);
        };
        TimedTrigger.prototype.removeListener = function (listener) {
            this.handler.remove(listener);
        };
        TimedTrigger.prototype.fireHandler = function () {
            this.handler.fire(this.args);
        };
        return TimedTrigger;
    }());
    exports.TimedTrigger = TimedTrigger;
});
define("hr.formbuilder", ["require","exports","hr.components","hr.domquery","hr.bindingcollection","hr.eventdispatcher","hr.formhelper","hr.schema","hr.typeidentifiers","hr.iterable","hr.timedtrigger","node_modules/htmlrapier/src/schemaprocessor"], function (require, exports, component, domquery, hr_bindingcollection_4, event, formHelper, hr_schema_2, typeIds, iterable, hr_timedtrigger_2, schemaprocessor) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var FormValuesSource = /** @class */ (function () {
        function FormValuesSource(formValues) {
            this.formValues = formValues;
        }
        FormValuesSource.prototype.getValue = function (address) {
            var value = this.formValues.getFormValue(address.address[0].key); //for now assume strings, this only supports the current level object
            if (value !== undefined) {
                var data = value.getData();
                //Only return the data if it would be included in the form data
                if (formHelper.shouldAddValue(data)) {
                    return data;
                }
            }
            return undefined;
        };
        return FormValuesSource;
    }());
    var FormValues = /** @class */ (function () {
        function FormValues() {
            this.values = [];
            this.fireChangesToValues = false;
            this.changedEventHandler = new event.ActionEventDispatcher();
            this.complexValues = true; //If this is true, the values passed in are complex, which means they are functions or objects with multiple values, otherwise they are simple and the values should be used directly.
            this.valueSource = new FormValuesSource(this);
        }
        FormValues.prototype.add = function (value) {
            var _this = this;
            this.values.push(value);
            if (value.isChangeTrigger) {
                value.onChanged.add(function (a) { return _this.fireChangedEventHandler(a.getDataName()); });
            }
            if (value.respondsToChanges) {
                this.fireChangesToValues = true;
            }
        };
        FormValues.prototype.setError = function (err, baseName) {
            if (baseName === undefined) {
                baseName = "";
            }
            for (var i = 0; i < this.values.length; ++i) {
                this.values[i].setError(err, baseName);
            }
        };
        FormValues.prototype.setData = function (data) {
            var dataType = formHelper.getDataType(data);
            var parentRecovery;
            if (this.complexValues && data !== null) { //If this is complex values, lookup the data, also be sure the data isn't null or we will get an error
                switch (dataType) {
                    case formHelper.DataType.Object:
                        parentRecovery = function (name) { return data[name]; };
                        break;
                    case formHelper.DataType.Function:
                        parentRecovery = data;
                        break;
                }
            }
            else { //Simple value or null
                if (dataType !== formHelper.DataType.Function) { //Ignore functions for simple data, otherwise take the data as the value (will also happen for null)
                    parentRecovery = function (name) { return data; };
                }
                else {
                    parentRecovery = function (name) { return null; };
                }
            }
            for (var i = 0; i < this.values.length; ++i) { //Go through all items
                var item = this.values[i];
                var itemData = parentRecovery(item.getDataName());
                item.setData(itemData, parentRecovery);
            }
        };
        FormValues.prototype.recoverData = function (proto) {
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
        };
        FormValues.prototype.changeSchema = function (componentName, schema, parentElement) {
            var keep = [];
            for (var i = 0; i < this.values.length; ++i) {
                if (!this.values[i].delete()) {
                    keep.push(this.values[i]);
                }
            }
            this.values = keep; //Replace the values with just what we kept
            buildForm(componentName, schema, parentElement, undefined, undefined, this); //Rebuild the form
        };
        FormValues.prototype.hasFormValue = function (buildName) {
            for (var i = 0; i < this.values.length; ++i) {
                if (this.values[i].getBuildName() === buildName) {
                    return true;
                }
            }
            return false;
        };
        /**
         * Get a form value by the generated build name. This will require it to be fully qualified.
         * @param buildName The build name for the form value to lookup
         */
        FormValues.prototype.getFormValue = function (buildName) {
            for (var i = 0; i < this.values.length; ++i) {
                if (this.values[i].getBuildName() === buildName) {
                    return this.values[i];
                }
            }
            return undefined;
        };
        /**
         * Get a form value by the data name. This will use the name that will be used when the final object is created.
         * @param dataName The build name for the form value to lookup
         */
        FormValues.prototype.getFormValueByDataName = function (dataName) {
            for (var i = 0; i < this.values.length; ++i) {
                if (this.values[i].getDataName() === dataName) {
                    return this.values[i];
                }
            }
            return undefined;
        };
        Object.defineProperty(FormValues.prototype, "onChanged", {
            get: function () {
                return this.changedEventHandler.modifier;
            },
            enumerable: true,
            configurable: true
        });
        FormValues.prototype.fireDataChanged = function () {
            this.fireChangedEventHandler(null);
        };
        FormValues.prototype.fireChangedEventHandler = function (propName) {
            if (this.fireChangesToValues) {
                for (var i = 0; i < this.values.length; ++i) {
                    this.values[i].handleChange(this.valueSource);
                }
            }
            this.changedEventHandler.fire({
                formValues: this,
                propertyName: propName
            });
        };
        /**
         * Set this to true to set that the values are complex and should be looked up, otherwise they are simple and
         * should be gotten / set directly.
         * @param complex
         */
        FormValues.prototype.setComplex = function (complex) {
            this.complexValues = complex;
        };
        return FormValues;
    }());
    var indexMax = 2147483647; //Sticking with 32 bit;
    var InfiniteIndex = /** @class */ (function () {
        function InfiniteIndex() {
            this.num = 0;
            this.base = "";
        }
        InfiniteIndex.prototype.getNext = function () {
            ++this.num;
            if (this.num === indexMax) {
                this.base += "b"; //Each time we hit index max we just add a 'b' to the base
                this.num = 0;
            }
            return this.base + this.num;
        };
        return InfiniteIndex;
    }());
    function sharedClearer(i) {
        return "";
    }
    var ArrayEditorRow = /** @class */ (function () {
        function ArrayEditorRow(bindings, schema, name) {
            this.bindings = bindings;
            this.name = name;
            this.removed = new event.ActionEventDispatcher();
            this.root = this.bindings.rootElement;
            var itemHandle = this.bindings.getHandle("item"); //Also supports adding to a handle named item, otherwise uses the root
            if (itemHandle !== null) {
                this.root = itemHandle;
            }
            this.formValues = buildForm('hr.forms.default', schema, this.root, this.name, true);
            bindings.setListener(this);
        }
        Object.defineProperty(ArrayEditorRow.prototype, "onRemoved", {
            get: function () {
                return this.removed.modifier;
            },
            enumerable: true,
            configurable: true
        });
        ArrayEditorRow.prototype.remove = function (evt) {
            if (evt) {
                evt.preventDefault();
            }
            this.setError(formHelper.getSharedClearingValidator(), "");
            this.pooled = this.bindings.pool();
            this.setData(sharedClearer);
            this.removed.fire(this);
        };
        ArrayEditorRow.prototype.restore = function () {
            if (this.pooled) {
                this.pooled.restore(null);
            }
        };
        ArrayEditorRow.prototype.setError = function (err, baseName) {
            this.formValues.setError(err, baseName);
        };
        ArrayEditorRow.prototype.getData = function () {
            var data = this.formValues.recoverData(null);
            if (typeIds.isObject(data)) {
                for (var key in data) { //This will pass if there is a key in data
                    return data;
                }
                return null; //Return null if the data returned has no keys in it, which means it is empty.
            }
            return data; //Not an object, just return the data
        };
        ArrayEditorRow.prototype.setData = function (data) {
            this.formValues.setData(data);
            this.setError(formHelper.getSharedClearingValidator(), "");
        };
        return ArrayEditorRow;
    }());
    var ArrayEditor = /** @class */ (function () {
        function ArrayEditor(args, schema) {
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
        ArrayEditor.prototype.setError = function (err, baseName) {
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
        };
        ArrayEditor.prototype.add = function (evt) {
            evt.preventDefault();
            this.addRow();
        };
        ArrayEditor.prototype.addRow = function () {
            var _this = this;
            if (this.pooledRows.length == 0) {
                this.itemsView.appendData(this.schema, function (bindings, data) {
                    var row = new ArrayEditorRow(bindings, data, _this.buildName + '-' + _this.indexGen.getNext());
                    row.onRemoved.add(function (r) {
                        _this.rows.splice(_this.rows.indexOf(r), 1); //It will always be there
                        _this.pooledRows.push(r);
                    });
                    _this.rows.push(row);
                });
            }
            else {
                var row = this.pooledRows.pop();
                row.restore();
                this.rows.push(row);
            }
        };
        ArrayEditor.prototype.getData = function () {
            var items = [];
            for (var i = 0; i < this.rows.length; ++i) {
                items.push(this.rows[i].getData());
            }
            if (items.length > 0) {
                return items;
            }
            return undefined;
        };
        ArrayEditor.prototype.setData = function (data) {
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
        };
        ArrayEditor.prototype.getBuildName = function () {
            return this.buildName;
        };
        ArrayEditor.prototype.getDataName = function () {
            return this.name;
        };
        ArrayEditor.prototype.delete = function () {
            if (this.generated) {
                this.bindings.remove();
            }
            return this.generated;
        };
        Object.defineProperty(ArrayEditor.prototype, "isChangeTrigger", {
            get: function () {
                return false;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(ArrayEditor.prototype, "onChanged", {
            get: function () {
                return null;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(ArrayEditor.prototype, "respondsToChanges", {
            get: function () {
                return this.displayExpression !== undefined;
            },
            enumerable: true,
            configurable: true
        });
        ArrayEditor.prototype.handleChange = function (values) {
            if (this.displayExpression) {
                if (this.displayExpression.isTrue(values)) {
                    this.hideToggle.off();
                }
                else {
                    this.hideToggle.on();
                }
            }
        };
        return ArrayEditor;
    }());
    var BasicItemEditor = /** @class */ (function () {
        function BasicItemEditor(args) {
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
            this.element.addEventListener("change", function (e) {
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
        BasicItemEditor.prototype.addOption = function (label, value) {
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
        };
        BasicItemEditor.prototype.setError = function (err, baseName) {
            var errorName = err.addKey(baseName, this.name);
            if (err.hasValidationError(errorName)) {
                this.errorToggle.on();
                this.errorMessage.setData(err.getValidationError(errorName));
            }
            else {
                this.errorToggle.off();
                this.errorMessage.setData("");
            }
        };
        BasicItemEditor.prototype.getData = function () {
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
        };
        BasicItemEditor.prototype.setData = function (data) {
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
        };
        /**
         * This function actually sets the value for the element, if you are creating a subclass for BasicItemEditor
         * you should override this function to actually set the value instead of overriding setData,
         * this way the other logic for setting data (getting the actual data, clearing errors, computing defaults) can
         * still happen. There is no need to call super.doSetData as that will only set the data on the form
         * using the formHelper.setValue function.
         * @param itemData The data to set for the item, this is the final value that should be set, no lookup needed.
         */
        BasicItemEditor.prototype.doSetValue = function (itemData) {
            formHelper.setValue(this.element, itemData);
        };
        BasicItemEditor.prototype.getBuildName = function () {
            return this.buildName;
        };
        BasicItemEditor.prototype.getDataName = function () {
            return this.name;
        };
        BasicItemEditor.prototype.delete = function () {
            if (this.generated) {
                this.bindings.remove();
            }
            return this.generated;
        };
        Object.defineProperty(BasicItemEditor.prototype, "isChangeTrigger", {
            get: function () {
                return this.changedEventHandler !== null;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(BasicItemEditor.prototype, "onChanged", {
            get: function () {
                if (this.changedEventHandler !== null) {
                    return this.changedEventHandler.modifier;
                }
                return null;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(BasicItemEditor.prototype, "respondsToChanges", {
            get: function () {
                return this.displayExpression !== undefined;
            },
            enumerable: true,
            configurable: true
        });
        BasicItemEditor.prototype.handleChange = function (values) {
            if (this.displayExpression) {
                if (this.displayExpression.isTrue(values)) {
                    this.hideToggle.off();
                }
                else {
                    this.hideToggle.on();
                }
            }
        };
        return BasicItemEditor;
    }());
    exports.BasicItemEditor = BasicItemEditor;
    var SearchResultRow = /** @class */ (function () {
        function SearchResultRow(searchEditor, bindings, data) {
            this.searchEditor = searchEditor;
            this.data = data;
            bindings.setListener(this);
        }
        SearchResultRow.prototype.selectItem = function (evt) {
            evt.preventDefault();
            this.searchEditor.setDataFromSearchResult(this.data);
        };
        return SearchResultRow;
    }());
    exports.SearchResultRow = SearchResultRow;
    var SearchResultProviderFactory = /** @class */ (function () {
        function SearchResultProviderFactory() {
            this.factories = {};
        }
        SearchResultProviderFactory.prototype.addFactory = function (name, factory) {
            this.factories[name] = factory;
        };
        SearchResultProviderFactory.prototype.create = function (name) {
            var factory = this.factories[name];
            if (factory === undefined) {
                throw new Error("A Search Provider Factory named " + name + " cannot be found. Did you forget to register it?");
            }
            return factory();
        };
        return SearchResultProviderFactory;
    }());
    exports.SearchResultProvider = new SearchResultProviderFactory();
    var SearchItemEditor = /** @class */ (function () {
        function SearchItemEditor(args) {
            var _this = this;
            this.changedEventHandler = null;
            this.typingTrigger = new hr_timedtrigger_2.TimedTrigger(400);
            this.name = args.item.name;
            this.buildName = args.item.buildName;
            this.bindings = args.bindings;
            this.generated = args.generated;
            this.element = args.inputElement;
            this.displayExpression = args.item.displayExpression;
            this.popupToggle = this.bindings.getToggle("popup");
            this.resultsView = this.bindings.getView("results");
            this.searchFocusParent = this.bindings.getHandle("searchFocusParent");
            this.typingTrigger.addListener(function (arg) { return _this.runSearch(arg); });
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
        SearchItemEditor.prototype.addOption = function (label, value) {
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
        };
        SearchItemEditor.prototype.setError = function (err, baseName) {
            var errorName = err.addKey(baseName, this.name);
            if (err.hasValidationError(errorName)) {
                this.errorToggle.on();
                this.errorMessage.setData(err.getValidationError(errorName));
            }
            else {
                this.errorToggle.off();
                this.errorMessage.setData("");
            }
        };
        SearchItemEditor.prototype.getData = function () {
            return this.currentData;
        };
        SearchItemEditor.prototype.setData = function (data, parentDataAccess) {
            this.currentData = data;
            if (this.currentValueProperty) {
                data = parentDataAccess(this.currentValueProperty);
            }
            this.currentDisplay = data;
            formHelper.setValue(this.element, data);
            this.setError(formHelper.getSharedClearingValidator(), "");
        };
        SearchItemEditor.prototype.getBuildName = function () {
            return this.buildName;
        };
        SearchItemEditor.prototype.getDataName = function () {
            return this.name;
        };
        SearchItemEditor.prototype.delete = function () {
            if (this.generated) {
                this.bindings.remove();
            }
            return this.generated;
        };
        Object.defineProperty(SearchItemEditor.prototype, "isChangeTrigger", {
            get: function () {
                return this.changedEventHandler !== null;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(SearchItemEditor.prototype, "onChanged", {
            get: function () {
                if (this.changedEventHandler !== null) {
                    return this.changedEventHandler.modifier;
                }
                return null;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(SearchItemEditor.prototype, "respondsToChanges", {
            get: function () {
                return this.displayExpression !== undefined;
            },
            enumerable: true,
            configurable: true
        });
        SearchItemEditor.prototype.handleChange = function (values) {
            if (this.displayExpression) {
                if (this.displayExpression.isTrue(values)) {
                    this.hideToggle.off();
                }
                else {
                    this.hideToggle.on();
                }
            }
        };
        SearchItemEditor.prototype.stopSearch = function (evt) {
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
        };
        SearchItemEditor.prototype.updateSearch = function (evt) {
            evt.preventDefault();
            this.typingTrigger.fire(this);
        };
        SearchItemEditor.prototype.setDataFromSearchResult = function (result) {
            formHelper.setValue(this.element, result.title);
            this.currentData = result.value;
            this.currentDisplay = result.title;
            this.popupToggle.off();
            this.changedEventHandler.fire(this);
        };
        SearchItemEditor.prototype.runSearch = function (arg) {
            return __awaiter(this, void 0, void 0, function () {
                var searchTerm, self, results, err_53;
                var _this = this;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            _a.trys.push([0, 2, , 3]);
                            this.resultsView.setData({
                                title: "Loading...",
                                value: null
                            }, null, function () { return "message"; });
                            this.popupToggle.on();
                            searchTerm = formHelper.readValue(this.element);
                            this.lastSearchTerm = searchTerm;
                            self = this;
                            return [4 /*yield*/, this.searchResultProvider.search({
                                    searchTerm: searchTerm,
                                    getFormValue: function (name) {
                                        var formValue = self.formValues.getFormValueByDataName(name);
                                        if (formValue) {
                                            return formValue.getData();
                                        }
                                        return undefined;
                                    }
                                })];
                        case 1:
                            results = _a.sent();
                            if (this.lastSearchTerm === searchTerm) {
                                this.resultsView.setData(results, function (element, data) { return new SearchResultRow(_this, new hr_bindingcollection_4.BindingCollection(element.elements), data); });
                            }
                            return [3 /*break*/, 3];
                        case 2:
                            err_53 = _a.sent();
                            this.resultsView.setData({
                                title: "An error occured searching for data. Please try again later.",
                                value: null
                            }, null, function () { return "message"; });
                            console.log(err_53.message || err_53);
                            return [3 /*break*/, 3];
                        case 3: return [2 /*return*/];
                    }
                });
            });
        };
        return SearchItemEditor;
    }());
    exports.SearchItemEditor = SearchItemEditor;
    var MultiCheckBoxEditor = /** @class */ (function () {
        function MultiCheckBoxEditor(args) {
            var _this = this;
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
                var iter = new iterable.Iterable(args.item.buildValues).select(function (i) {
                    var r = Object.create(i);
                    r.uniqueId = args.item.uniqueId + "-hr-item-id-" + uidCount++;
                    return r;
                });
                this.itemsView.setData(iter, function (created, item) { return _this.checkElementCreated(created, item); });
            }
            this.errorToggle = this.bindings.getToggle(this.buildName + "Error");
            this.errorMessage = this.bindings.getView(this.buildName + "ErrorMessage");
            this.hideToggle = this.bindings.getToggle(this.buildName + "Hide");
            this.selectAllElement = this.bindings.getHandle("selectAll");
        }
        MultiCheckBoxEditor.prototype.setError = function (err, baseName) {
            var errorName = err.addKey(baseName, this.name);
            if (err.hasValidationError(errorName)) {
                this.errorToggle.on();
                this.errorMessage.setData(err.getValidationError(errorName));
            }
            else {
                this.errorToggle.off();
                this.errorMessage.setData("");
            }
        };
        MultiCheckBoxEditor.prototype.getData = function () {
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
        };
        MultiCheckBoxEditor.prototype.setData = function (data) {
            this.doSetValue(data);
            this.setError(formHelper.getSharedClearingValidator(), "");
        };
        /**
         * This function actually sets the value for the element, if you are creating a subclass for BasicItemEditor
         * you should override this function to actually set the value instead of overriding setData,
         * this way the other logic for setting data (getting the actual data, clearing errors, computing defaults) can
         * still happen. There is no need to call super.doSetData as that will only set the data on the form
         * using the formHelper.setValue function.
         * @param itemData The data to set for the item, this is the final value that should be set, no lookup needed.
         */
        MultiCheckBoxEditor.prototype.doSetValue = function (itemData) {
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
        };
        MultiCheckBoxEditor.prototype.addOption = function (label, value) {
            var _this = this;
            this.itemsView.appendData({ label: label, value: value }, function (created, item) { return _this.checkElementCreated(created, item); });
        };
        MultiCheckBoxEditor.prototype.getBuildName = function () {
            return this.buildName;
        };
        MultiCheckBoxEditor.prototype.getDataName = function () {
            return this.name;
        };
        MultiCheckBoxEditor.prototype.delete = function () {
            if (this.generated) {
                this.bindings.remove();
            }
            return this.generated;
        };
        Object.defineProperty(MultiCheckBoxEditor.prototype, "isChangeTrigger", {
            get: function () {
                return this.changedEventHandler !== null;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MultiCheckBoxEditor.prototype, "onChanged", {
            get: function () {
                if (this.changedEventHandler !== null) {
                    return this.changedEventHandler.modifier;
                }
                return null;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MultiCheckBoxEditor.prototype, "respondsToChanges", {
            get: function () {
                return this.displayExpression !== undefined;
            },
            enumerable: true,
            configurable: true
        });
        MultiCheckBoxEditor.prototype.handleChange = function (values) {
            if (this.displayExpression) {
                if (this.displayExpression.isTrue(values)) {
                    this.hideToggle.off();
                }
                else {
                    this.hideToggle.on();
                }
            }
        };
        MultiCheckBoxEditor.prototype.selectAll = function (evt) {
            for (var i = 0; i < this.checkboxElements.length; ++i) {
                var check = this.checkboxElements[i];
                formHelper.setValue(check, true);
            }
            if (this.nullCheckboxElement !== null) {
                formHelper.setValue(this.nullCheckboxElement, false);
            }
        };
        MultiCheckBoxEditor.prototype.clearChecks = function () {
            for (var i = 0; i < this.checkboxElements.length; ++i) {
                var check = this.checkboxElements[i];
                formHelper.setValue(check, false);
            }
        };
        MultiCheckBoxEditor.prototype.checkElementCreated = function (created, item) {
            var _this = this;
            var element = created.getHandle("check");
            if (item.value !== null) {
                this.checkboxElements.push(element);
                element.addEventListener("change", function (e) {
                    if (_this.nullCheckboxElement !== null) {
                        formHelper.setValue(_this.nullCheckboxElement, false);
                    }
                    if (_this.selectAllElement !== null) {
                        formHelper.setValue(_this.selectAllElement, false);
                    }
                    _this.changedEventHandler.fire(_this);
                });
            }
            else {
                this.nullCheckboxElement = element;
                element.addEventListener("change", function (e) {
                    _this.doSetValue(null); //Clear values
                    _this.changedEventHandler.fire(_this);
                });
            }
            if (this.disabled) {
                element.setAttribute("disabled", "");
            }
        };
        return MultiCheckBoxEditor;
    }());
    exports.MultiCheckBoxEditor = MultiCheckBoxEditor;
    function looseIndexOf(array, find) {
        for (var i = 0; i < array.length; ++i) {
            if (array[i] == find) {
                return i;
            }
        }
        return -1;
    }
    var RadioButtonEditor = /** @class */ (function () {
        function RadioButtonEditor(args) {
            var _this = this;
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
            var iter = new iterable.Iterable(args.item.buildValues).select(function (i) {
                var shadow = Object.create(i);
                shadow.name = _this.buildName;
                shadow.uniqueId = args.item.uniqueId + "-hr-item-id-" + uidCount++;
                return shadow;
            });
            this.itemsView.setData(iter, function (created, item) { return _this.radioElementCreated(created, item); });
            this.errorToggle = this.bindings.getToggle(this.buildName + "Error");
            this.errorMessage = this.bindings.getView(this.buildName + "ErrorMessage");
            this.hideToggle = this.bindings.getToggle(this.buildName + "Hide");
        }
        RadioButtonEditor.prototype.addOption = function (label, value) {
            var _this = this;
            this.itemsView.appendData({ label: label, value: value }, function (created, item) { return _this.radioElementCreated(created, item); });
        };
        RadioButtonEditor.prototype.setError = function (err, baseName) {
            var errorName = err.addKey(baseName, this.name);
            if (err.hasValidationError(errorName)) {
                this.errorToggle.on();
                this.errorMessage.setData(err.getValidationError(errorName));
            }
            else {
                this.errorToggle.off();
                this.errorMessage.setData("");
            }
        };
        RadioButtonEditor.prototype.getData = function () {
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
        };
        RadioButtonEditor.prototype.setData = function (data) {
            this.doSetValue(data);
            this.setError(formHelper.getSharedClearingValidator(), "");
        };
        /**
         * This function actually sets the value for the element, if you are creating a subclass for BasicItemEditor
         * you should override this function to actually set the value instead of overriding setData,
         * this way the other logic for setting data (getting the actual data, clearing errors, computing defaults) can
         * still happen. There is no need to call super.doSetData as that will only set the data on the form
         * using the formHelper.setValue function.
         * @param itemData The data to set for the item, this is the final value that should be set, no lookup needed.
         */
        RadioButtonEditor.prototype.doSetValue = function (itemData) {
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
        };
        RadioButtonEditor.prototype.getBuildName = function () {
            return this.buildName;
        };
        RadioButtonEditor.prototype.getDataName = function () {
            return this.name;
        };
        RadioButtonEditor.prototype.delete = function () {
            if (this.generated) {
                this.bindings.remove();
            }
            return this.generated;
        };
        Object.defineProperty(RadioButtonEditor.prototype, "isChangeTrigger", {
            get: function () {
                return this.changedEventHandler !== null;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(RadioButtonEditor.prototype, "onChanged", {
            get: function () {
                if (this.changedEventHandler !== null) {
                    return this.changedEventHandler.modifier;
                }
                return null;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(RadioButtonEditor.prototype, "respondsToChanges", {
            get: function () {
                return this.displayExpression !== undefined;
            },
            enumerable: true,
            configurable: true
        });
        RadioButtonEditor.prototype.handleChange = function (values) {
            if (this.displayExpression) {
                if (this.displayExpression.isTrue(values)) {
                    this.hideToggle.off();
                }
                else {
                    this.hideToggle.on();
                }
            }
        };
        RadioButtonEditor.prototype.radioElementCreated = function (created, item) {
            var _this = this;
            var element = created.getHandle("radio");
            //If this is the null value item, keep track of its element separately
            if (item.value === null) {
                this.nullElement = element;
            }
            this.elements.push(element);
            element.addEventListener("change", function (e) {
                _this.changedEventHandler.fire(_this);
            });
            if (this.disabled) {
                element.setAttribute("disabled", "");
            }
        };
        return RadioButtonEditor;
    }());
    exports.RadioButtonEditor = RadioButtonEditor;
    var IFormValueBuilderArgs = /** @class */ (function () {
        function IFormValueBuilderArgs() {
        }
        return IFormValueBuilderArgs;
    }());
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
            propArray.sort(function (a, b) {
                return a.buildOrder - b.buildOrder;
            });
        }
        for (var i = 0; i < propArray.length; ++i) {
            var item = propArray[i];
            var existing = domquery.first('[name=' + item.buildName + ']', parentElement);
            var bindings = null;
            var generated = false;
            if (ignoreExisting || existing === null) {
                var placeholder = domquery.first('[data-hr-form-place=' + item.buildName + ']', parentElement);
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
                bindings = component.one(actualComponentName, new FormComponentTextStream(item), insertParent, insertElement, undefined, function (i) {
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
                            bindings = new hr_bindingcollection_4.BindingCollection(bindParent);
                        }
                        else {
                            bindParent = bindParent.parentElement;
                        }
                    }
                    if (bindings === null) { //Could not find form data-hr-input-start element, just use the element as the base for the binding collection
                        bindings = new hr_bindingcollection_4.BindingCollection(existing);
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
            var resolvedItems = hr_schema_2.resolveRef(args.item.items, args.schema);
            //This will treat the schema as a root schema, so setup parent if needed
            if (resolvedItems !== args.schema) { //Make sure we didnt just get the original schema back
                //If so, set the parent 
                resolvedItems = Object.create(resolvedItems);
                resolvedItems.parent = args.schema;
            }
            return new ArrayEditor(args, resolvedItems);
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
    var FormComponentTextStream = /** @class */ (function () {
        function FormComponentTextStream(data) {
            this.data = data;
        }
        FormComponentTextStream.prototype.getDataObject = function () {
            return this.data;
        };
        FormComponentTextStream.prototype.getRawData = function (address) {
            return address.read(this.data);
        };
        FormComponentTextStream.prototype.getFormatted = function (data, address) {
            if (data !== undefined) { //Don't return undefined, return empty string instead
                return data;
            }
            return "";
        };
        return FormComponentTextStream;
    }());
});
jsns.run("hr.formbuilder");
define("hr.ignored", ["require","exports","hr.domquery"], function (require, exports, domQuery) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
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
define("hr.componentgatherer", ["require","exports","hr.components","hr.ignored","hr.iterable","hr.componentbuilder"], function (require, exports, components, ignoredNodes, hr_iterable_2, hr_componentbuilder_2) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
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
            var builder = new hr_componentbuilder_2.ComponentBuilder(componentString);
            extractedBuilders[componentName] = builder;
            components.register(componentName, builder);
            return builder;
        }
        else {
            if (componentName === null) {
                if (currentBuilder !== undefined) {
                    currentBuilder.addVariant(variantName, new hr_componentbuilder_2.VariantBuilder(componentString));
                }
                else {
                    console.log('Attempted to create a variant named "' + variantName + '" with no default component in the chain. Please start your template element chain with a data-hr-component or a anonymous template. This template has been ignored.');
                }
            }
            else {
                extractedBuilders[componentName].addVariant(variantName, new hr_componentbuilder_2.VariantBuilder(componentString));
            }
            return currentBuilder;
        }
    }
});
jsns.run("hr.componentgatherer");
define("hr.runattributes", ["require","exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
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
    var CookieStorageDriver = /** @class */ (function () {
        function CookieStorageDriver(name, days, path) {
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
        CookieStorageDriver.prototype.getValue = function () {
            return CookieStorageDriver.readRaw(this.name);
        };
        CookieStorageDriver.prototype.setValue = function (val) {
            CookieStorageDriver.createRaw(this.name, val, this.path, this.days);
        };
        //These three functions (createRaw, readRaw and erase) are from
        //http://www.quirksmode.org/js/cookies.html
        //The names were changed
        /**
         * Create a cookie on the doucment.
         * @param {type} name - The name of the cookie
         * @param {type} value - The value of the cookie
         * @param {type} days - The expiration in days for the cookie
         */
        CookieStorageDriver.createRaw = function (name, value, path, days) {
            if (days) {
                var date = new Date();
                date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
                var expires = "; expires=" + date.toUTCString();
            }
            else
                var expires = "";
            document.cookie = name + "=" + value + expires + "; path=" + path;
        };
        /**
         * Read a cookie from the document.
         * @param {type} name - The name of the cookie to read
         * @returns {type} - The cookie value.
         */
        CookieStorageDriver.readRaw = function (name) {
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
        };
        /**
         * Erase a cookie from the document.
         * @param {type} name
         */
        CookieStorageDriver.prototype.erase = function () {
            CookieStorageDriver.createRaw(this.name, "", this.path, -1);
        };
        return CookieStorageDriver;
    }());
    exports.CookieStorageDriver = CookieStorageDriver;
    var SessionStorageDriver = /** @class */ (function () {
        function SessionStorageDriver(name) {
            this.name = name;
        }
        /**
         * Get the value stored by the driver, will be null if there is no value
         */
        SessionStorageDriver.prototype.getValue = function () {
            return sessionStorage.getItem(this.name);
        };
        /**
         * Set the value stored by the driver.
         */
        SessionStorageDriver.prototype.setValue = function (val) {
            sessionStorage.setItem(this.name, val);
        };
        /**
         * Erase the value stored by the driver.
         */
        SessionStorageDriver.prototype.erase = function () {
            this.setValue(null);
        };
        return SessionStorageDriver;
    }());
    exports.SessionStorageDriver = SessionStorageDriver;
    var LocalStorageDriver = /** @class */ (function () {
        function LocalStorageDriver(name) {
            this.name = name;
        }
        /**
         * Get the value stored by the driver, will be null if there is no value
         */
        LocalStorageDriver.prototype.getValue = function () {
            return localStorage.getItem(this.name);
        };
        /**
         * Set the value stored by the driver.
         */
        LocalStorageDriver.prototype.setValue = function (val) {
            localStorage.setItem(this.name, val);
        };
        /**
         * Erase the value stored by the driver.
         */
        LocalStorageDriver.prototype.erase = function () {
            this.setValue(null);
        };
        return LocalStorageDriver;
    }());
    exports.LocalStorageDriver = LocalStorageDriver;
    var JsonStorage = /** @class */ (function () {
        function JsonStorage(storageDriver) {
            this.storageDriver = storageDriver;
        }
        JsonStorage.prototype.setSerializerOptions = function (replacer, space) {
            this.replacer = replacer;
            this.space = space;
        };
        JsonStorage.prototype.getValue = function (defaultValue) {
            var str = this.storageDriver.getValue();
            var recovered;
            if (str !== null) {
                recovered = JSON.parse(str);
            }
            else {
                recovered = defaultValue;
            }
            return recovered;
        };
        JsonStorage.prototype.setValue = function (val) {
            this.storageDriver.setValue(JSON.stringify(val, this.replacer, this.space));
        };
        JsonStorage.prototype.erase = function () {
            this.storageDriver.erase();
        };
        return JsonStorage;
    }());
    exports.JsonStorage = JsonStorage;
    var StringStorage = /** @class */ (function () {
        function StringStorage(storageDriver) {
            this.storageDriver = storageDriver;
        }
        StringStorage.prototype.getValue = function (defaultValue) {
            return this.storageDriver.getValue();
        };
        StringStorage.prototype.setValue = function (val) {
            this.storageDriver.setValue(val);
        };
        StringStorage.prototype.erase = function () {
            this.storageDriver.erase();
        };
        return StringStorage;
    }());
    exports.StringStorage = StringStorage;
});
define("hr.fetcher", ["require","exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    // Type definitions for Fetch API
    // Altered to fit htmlrapier by Andrew Piper
    // Based on:
    // Project: https://github.com/github/fetch
    // Definitions by: Ryan Graham <https://github.com/ryan-codingintrigue>, Kagami Sascha Rosylight <https://github.com/saschanaz>
    // Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped
    function fetch(url, init) {
        return window.fetch(url, init);
    }
    exports.fetch = fetch;
    var Fetcher = /** @class */ (function () {
        function Fetcher() {
        }
        return Fetcher;
    }());
    exports.Fetcher = Fetcher;
});
define("hr.windowfetch", ["require","exports","hr.fetcher"], function (require, exports, hr_fetcher_2) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    /**
     * A fetcher implementation that calls the global window fetch function.
     * Use this to terminate fetcher chains and do the real fetch work.
     * @returns
     */
    var WindowFetch = /** @class */ (function (_super) {
        __extends(WindowFetch, _super);
        function WindowFetch() {
            return _super.call(this) || this;
        }
        WindowFetch.prototype.fetch = function (url, init) {
            return hr_fetcher_2.fetch(url, init);
        };
        return WindowFetch;
    }(hr_fetcher_2.Fetcher));
    exports.WindowFetch = WindowFetch;
});
define("hr.http", ["require","exports","hr.windowfetch"], function (require, exports, hr_windowfetch_2) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var defaultFetcher = new hr_windowfetch_2.WindowFetch();
    /**
     * A simple function to get data from a url without caching. This still
     * uses fetch, but is available since this is a a pretty common operation.
     * If you need something more advanced use fetch directly.
     * @param {string} url - The url to get from
     * @returns
     */
    function get(url, fetcher) {
        if (fetcher === undefined) {
            fetcher = defaultFetcher;
        }
        return fetcher.fetch(url, {
            method: "GET",
            cache: "no-cache",
            headers: {
                "Content-Type": "application/json; charset=UTF-8"
            },
            credentials: "include"
        }).then(function (response) {
            return processResult(response);
        });
    }
    exports.get = get;
    /**
     * A simple function to post to a url. This still uses fetch, but
     * simplifies its usage. If you need something more advanced use
     * fetch directly.
     */
    function post(url, data, fetcher) {
        if (fetcher === undefined) {
            fetcher = defaultFetcher;
        }
        var body = undefined;
        if (data !== undefined) {
            body = JSON.stringify(data);
        }
        return fetcher.fetch(url, {
            method: "POST",
            cache: "no-cache",
            headers: {
                "Content-Type": "application/json; charset=UTF-8"
            },
            body: body,
            credentials: "include"
        }).then(function (response) {
            return processResult(response);
        });
    }
    exports.post = post;
    function processResult(response) {
        return response.text().then(function (data) {
            var resultData = data === "" ? null : JSON.parse(data);
            if (response.status > 199 && response.status < 300) {
                return resultData;
            }
            throw resultData;
        });
    }
});
define("hr.di", ["require","exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function IsDiFuncitonId(test) {
        return test && test.id !== undefined && test.arg !== undefined;
    }
    function IsInjectableConstructor(test) {
        return test["InjectorArgs"] !== undefined;
    }
    var DiIdProperty = "__diId";
    var Scopes;
    (function (Scopes) {
        Scopes[Scopes["Shared"] = 0] = "Shared";
        Scopes[Scopes["Transient"] = 1] = "Transient";
    })(Scopes || (Scopes = {}));
    var InjectedProperties = /** @class */ (function () {
        function InjectedProperties() {
            this.resolvers = [];
        }
        /**
         * Add a resolver.
         * @param resolver The resolver to add
         */
        InjectedProperties.prototype.addResolver = function (resolver) {
            this.resolvers.push(resolver);
        };
        /**
         * Resolve a service for a given id, which can be undefined. If no service is found, undefined is returned.
         */
        InjectedProperties.prototype.resolve = function (id, scope) {
            for (var i = this.resolvers.length - 1; i >= 0; --i) {
                var resolver = this.resolvers[i];
                if (resolver.id === id) {
                    return {
                        instance: resolver.resolver(scope),
                        scope: resolver.scope
                    };
                }
            }
        };
        /**
         * Determine if there is a resolver for a given id.
         * @param id The id to lookup
         */
        InjectedProperties.prototype.hasResolverForId = function (id) {
            for (var i = this.resolvers.length - 1; i >= 0; --i) {
                var resolver = this.resolvers[i];
                if (resolver.id === id) {
                    return true;
                }
            }
            return false;
        };
        return InjectedProperties;
    }());
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
    var ServiceCollection = /** @class */ (function () {
        function ServiceCollection() {
            this.resolvers = {};
        }
        /**
         * Add a shared service to the collection, shared services are created the first time they are requested
         * and persist across child scopes.
         * @param {function} typeHandle The constructor function for the type that represents this injected object.
         * @param {ResolverFunction<T>} resolver The resolver function for the object, can return promises.
         * @returns
         */
        ServiceCollection.prototype.addShared = function (typeHandle, resolver) {
            return this.addSharedId(undefined, typeHandle, resolver);
        };
        /**
         * Add a shared service to the collection, shared services are created the first time they are requested
         * and persist across child scopes. This version will additionally require an id object to get the service back.
         * @param {function} typeHandle The constructor function for the type that represents this injected object.
         * @param {ResolverFunction<T>} resolver The resolver function for the object, can return promises.
         * @returns
         */
        ServiceCollection.prototype.addSharedId = function (id, typeHandle, resolver) {
            if (IsInjectableConstructor(resolver)) {
                return this.add(id, typeHandle, Scopes.Shared, this.createConstructorResolver(resolver));
            }
            else {
                return this.add(id, typeHandle, Scopes.Shared, resolver);
            }
        };
        /**
         * Add a shared service to the collection if it does not exist in the collection already. Note that the ServiceCollections do not
         * have parents or any concept of parents, so services added this way to a ServiceCollection that is a child of another service
         * collection will override the service in the child collection as if you added it with add, since it has no way to check parents
         * for the existance of a service.
         * @param {DiFunction<T>} typeHandle
         * @param {InjectableConstructor<T> | T} resolver
         * @returns
         */
        ServiceCollection.prototype.tryAddShared = function (typeHandle, resolver) {
            return this.tryAddSharedId(undefined, typeHandle, resolver);
        };
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
        ServiceCollection.prototype.tryAddSharedId = function (id, typeHandle, resolver) {
            if (!this.hasTypeHandle(id, typeHandle)) {
                this.addSharedId(id, typeHandle, resolver);
            }
            return this;
        };
        /**
         * Add a transient service to the collection, transient services are created each time they are asked for.
         * @param {function} typeHandle The constructor function for the type that represents this injected object.
         * @param {ResolverFunction<T>} resolver The resolver function for the object, can return promises.
         * @returns
         */
        ServiceCollection.prototype.addTransient = function (typeHandle, resolver) {
            return this.addTransientId(undefined, typeHandle, resolver);
        };
        /**
         * Add a transient service to the collection, transient services are created each time they are asked for.
         * This version will additionally require an id object to get the service back.
         * @param {function} typeHandle The constructor function for the type that represents this injected object.
         * @param {ResolverFunction<T>} resolver The resolver function for the object, can return promises.
         * @returns
         */
        ServiceCollection.prototype.addTransientId = function (id, typeHandle, resolver) {
            if (IsInjectableConstructor(resolver)) {
                return this.add(id, typeHandle, Scopes.Transient, this.createConstructorResolver(resolver));
            }
            else {
                return this.add(id, typeHandle, Scopes.Transient, resolver);
            }
        };
        /**
         * Add a transient service to the collection if it does not exist in the collection already. Note that the ServiceCollections do not
         * have parents or any concept of parents, so services added this way to a ServiceCollection that is a child of another service
         * collection will override the service in the child collection as if you added it with add, since it has no way to check parents
         * for the existance of a service.
         * @param {DiFunction<T>} typeHandle
         * @param {InjectableConstructor<T> | T} resolver
         * @returns
         */
        ServiceCollection.prototype.tryAddTransient = function (typeHandle, resolver) {
            return this.tryAddTransientId(undefined, typeHandle, resolver);
        };
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
        ServiceCollection.prototype.tryAddTransientId = function (id, typeHandle, resolver) {
            if (!this.hasTypeHandle(id, typeHandle)) {
                this.addTransientId(id, typeHandle, resolver);
            }
            return this;
        };
        /**
         * Add an existing object instance as a singleton to this injector. Existing instances can only be added
         * as singletons.
         * @param {function} typeHandle The constructor function for the type that represents this injected object.
         * @param {ResolverFunction<T>} resolver The resolver function for the object, can return promises.
         * @returns
         */
        ServiceCollection.prototype.addSharedInstance = function (typeHandle, instance) {
            return this.addSharedInstanceId(undefined, typeHandle, instance);
        };
        /**
         * Add an existing object instance as a singleton to this injector. Existing instances can only be added
         * as singletons. This version will additionally require an id object to get the service back.
         * @param {function} typeHandle The constructor function for the type that represents this injected object.
         * @param {ResolverFunction<T>} resolver The resolver function for the object, can return promises.
         * @returns
         */
        ServiceCollection.prototype.addSharedInstanceId = function (id, typeHandle, instance) {
            return this.add(id, typeHandle, Scopes.Shared, function (s) { return instance; });
        };
        /**
         * Add a singleton service to the collection if it does not exist in the collection already. Note that the ServiceCollections do not
         * have parents or any concept of parents, so services added this way to a ServiceCollection that is a child of another service
         * collection will override the service in the child collection as if you added it with add, since it has no way to check parents
         * for the existance of a service.
         * @param {DiFunction<T>} typeHandle
         * @param {InjectableConstructor<T> | T} resolver
         * @returns
         */
        ServiceCollection.prototype.tryAddSharedInstance = function (typeHandle, instance) {
            return this.tryAddSharedInstanceId(undefined, typeHandle, instance);
        };
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
        ServiceCollection.prototype.tryAddSharedInstanceId = function (id, typeHandle, instance) {
            if (!this.hasTypeHandle(id, typeHandle)) {
                this.addSharedInstanceId(id, typeHandle, instance);
            }
            return this;
        };
        /**
         * Add a service to this service collection.
         * @param {function} typeHandle The constructor function for the type that represents this injected object.
         * @param {ResolverFunction<T>} resolver The resolver function for the object, can return promises.
         */
        ServiceCollection.prototype.add = function (id, typeHandle, scope, resolver) {
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
        };
        /**
         * Determine if this service collection already has a resolver for the given type handle.
         * @param {DiFunction<T>} typeHandle The type handle to lookup
         * @returns True if there is a resolver, and false if there is not.
         */
        ServiceCollection.prototype.hasTypeHandle = function (id, typeHandle) {
            if (typeHandle.prototype.hasOwnProperty(DiIdProperty)) {
                var typeId = typeHandle.prototype[DiIdProperty];
                var resolver = this.resolvers[typeId];
                if (resolver !== undefined) {
                    return resolver.hasResolverForId(id);
                }
            }
            return false;
        };
        /**
         * Helper function to create a resolver that constructs objects from constructor functions, it will di
         * the arguments to the function.
         * @param {InjectableConstructor} resolver
         * @returns
         */
        ServiceCollection.prototype.createConstructorResolver = function (constructor) {
            return function (s) {
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
                var controllerObj = Object.create(constructor.prototype);
                constructor.apply(controllerObj, args);
                return controllerObj;
            };
        };
        /**
         * Resolve a service, note that every time this is called the service will be instantiated,
         * the scopes will hold the instances. Don't call this directly, but instead use the scopes
         * created by calling createScope.
         * @param {function} typeHandle
         * @param {Scope} scope
         * @internal
         * @returns
         */
        ServiceCollection.prototype.__resolveService = function (id, typeHandle, scope) {
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
        };
        /**
         * Create a scope to hold instantiated variables.
         * @returns The new scope.
         */
        ServiceCollection.prototype.createScope = function () {
            return new Scope(this);
        };
        ServiceCollection.idIndex = 0;
        return ServiceCollection;
    }());
    exports.ServiceCollection = ServiceCollection;
    var InstanceHandler = /** @class */ (function () {
        function InstanceHandler() {
            this.instances = [];
        }
        InstanceHandler.prototype.addInstance = function (instance) {
            this.instances.push(instance);
        };
        /**
         * Get an instance by id if it exists, otherwise return undefined.
         */
        InstanceHandler.prototype.getInstance = function (id) {
            for (var i = this.instances.length - 1; i >= 0; --i) {
                var instance = this.instances[i];
                if (instance.id === id) {
                    return instance.instance;
                }
            }
            return undefined;
        };
        return InstanceHandler;
    }());
    var InstanceHolder = /** @class */ (function () {
        function InstanceHolder() {
        }
        return InstanceHolder;
    }());
    /**
     * A scope for dependency injection.
     * @param {ServiceCollection} services
     * @param {Scope} parentScope?
     * @returns
     */
    var Scope = /** @class */ (function () {
        function Scope(services, parentScope) {
            this.singletons = {};
            this.services = services;
            this.parentScope = parentScope;
        }
        /**
         * Get a service defined by the given constructor function.
         * @param {function} typeHandle
         * @returns
         */
        Scope.prototype.getService = function (typeHandle) {
            return this.getServiceId(undefined, typeHandle);
        };
        /**
         * Get a service defined by the given constructor function and id.
         * @param {function} typeHandle
         * @returns
         */
        Scope.prototype.getServiceId = function (id, typeHandle) {
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
        };
        /**
         * Get a service defined by the given constructor function. If the service does not exist an error is thrown.
         * @param {function} typeHandle
         * @returns
         */
        Scope.prototype.getRequiredService = function (typeHandle) {
            return this.getRequiredServiceId(undefined, typeHandle);
        };
        /**
        * Get a service defined by the given constructor function and id. If the service does not exist an error is thrown.
        * @param {function} typeHandle
        * @returns
        */
        Scope.prototype.getRequiredServiceId = function (id, typeHandle) {
            var instance = this.getServiceId(id, typeHandle);
            if (instance === undefined) {
                var funcNameRegex = /^function\s+([\w\$]+)\s*\(/;
                var typeResult = funcNameRegex.exec(typeHandle.prototype.constructor.toString());
                var typeName = typeResult ? typeResult[1] : "anonymous";
                var withId = "";
                if (id !== undefined) {
                    withId = " with id " + id + " ";
                }
                throw new Error("Cannot find required service for function " + typeName + withId + ". Did you forget to inject it?");
            }
            return instance;
        };
        /**
         * Create a child scope that shares service definitions and singleton instances.
         * @returns
         */
        Scope.prototype.createChildScope = function (serviceCollection) {
            if (serviceCollection === undefined) {
                serviceCollection = new ServiceCollection();
            }
            return new Scope(serviceCollection, this);
        };
        /**
         * Walk up the tree looking for singletons, if one is found return it otherwise undefined is returned.
         * @param {DiFunction<T>} typeHandle
         * @returns
         */
        Scope.prototype.bubbleFindSingletonInstance = function (id, typeHandle) {
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
        };
        /**
         * Helper to resolve services, only looks at the service collection, walks entire tree to create a service.
         * @param {DiFunction<T>} typeHandle
         * @returns
         */
        Scope.prototype.resolveService = function (id, typeHandle, scope) {
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
        };
        return Scope;
    }());
    exports.Scope = Scope;
});
define("hr.controller", ["require","exports","hr.bindingcollection","hr.bindingcollection","hr.toggles","hr.domquery","hr.ignored","hr.eventdispatcher","hr.di","hr.di"], function (require, exports, hr_bindingcollection_1, hr_bindingcollection_2, hr_toggles_1, domQuery, ignoredNodes, hr_eventdispatcher_1, di, hr_di_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.BindingCollection = hr_bindingcollection_2.BindingCollection;
    exports.OnOffToggle = hr_toggles_1.OnOffToggle;
    exports.TypedToggle = hr_toggles_1.TypedToggle;
    exports.ServiceCollection = hr_di_1.ServiceCollection;
    /**
     * This class provides a way to get a handle to the data provided by the
     * createOnCallback data argument. Return this type from your InjectorArgs
     * where you take the row data argument, and the appropriate data object
     * will be returned. There is only a need for one of these, since controllers
     * can only accept one piece of callback data.
     */
    var InjectControllerData = /** @class */ (function () {
        function InjectControllerData() {
        }
        return InjectControllerData;
    }());
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
    var InjectedControllerBuilder = /** @class */ (function () {
        /**
         * Create a new ControllerBuilder, can reference a parent controller by passing it.
         * @param controllerConstructor
         * @param scope The scope to use for dependency injection into the controller
         */
        function InjectedControllerBuilder(scope) {
            this.controllerCreatedEvent = new hr_eventdispatcher_1.ActionEventDispatcher();
            this.serviceCollection = new di.ServiceCollection();
            if (scope) {
                this.baseScope = scope.createChildScope(this.serviceCollection);
            }
            else {
                this.baseScope = new di.Scope(this.serviceCollection);
            }
        }
        Object.defineProperty(InjectedControllerBuilder.prototype, "Services", {
            /**
             * Get the service collection to define services for this builder. Don't create scopes with this
             * use createUnbound if you need to make an instance of something in the service collection, this
             * will prevent your scopes from getting messed up.
             */
            get: function () {
                return this.serviceCollection;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(InjectedControllerBuilder.prototype, "controllerCreated", {
            /**
             * This event is fired when this builder creates a controller.
             */
            get: function () {
                return this.controllerCreatedEvent.modifier;
            },
            enumerable: true,
            configurable: true
        });
        /**
         * Create a child builder from this controller builder, this allows you to add
         * shared instances to the child that will not be present in the parent.
         */
        InjectedControllerBuilder.prototype.createChildBuilder = function () {
            return new InjectedControllerBuilder(this.baseScope.createChildScope(new di.ServiceCollection()));
        };
        /**
         * Create a new controller instance on the named nodes in the document.
         * @param name The name of the data-hr-controller nodes to lookup.
         * @param controllerConstructor The controller to create when a node is found.
         * @param parentBindings The parent bindings to restrict the controller search.
         */
        InjectedControllerBuilder.prototype.create = function (name, controllerConstructor, parentBindings) {
            return this.createId(undefined, name, controllerConstructor, parentBindings);
        };
        /**
         * Create a new controller instance on the named nodes in the document using an id based service.
         * @param name The name of the data-hr-controller nodes to lookup.
         * @param controllerConstructor The controller to create when a node is found.
         * @param parentBindings The parent bindings to restrict the controller search.
         */
        InjectedControllerBuilder.prototype.createId = function (id, name, controllerConstructor, parentBindings) {
            var _this = this;
            var createdControllers = [];
            var foundElement = function (element) {
                if (!ignoredNodes.isIgnored(element)) {
                    var services = new di.ServiceCollection();
                    var scope = _this.baseScope.createChildScope(services);
                    var bindings = new hr_bindingcollection_1.BindingCollection(element);
                    services.addTransient(hr_bindingcollection_1.BindingCollection, function (s) { return bindings; });
                    element.removeAttribute('data-hr-controller');
                    var controller = _this.createController(id, controllerConstructor, services, scope, bindings);
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
        };
        /**
         * This will create a single instance of the service that resolves to constructorFunc
         * without looking for html elements, it will not have a binding collection.
         * This can be used to create any kind of object, not just controllers. Do this for anything
         * you want to use from the service scope for this controller.
         */
        InjectedControllerBuilder.prototype.createUnbound = function (constructorFunc) {
            return this.createUnboundId(undefined, constructorFunc);
        };
        /**
         * This will create a single instance of the service that resolves to constructorFunc
         * without looking for html elements, it will not have a binding collection.
         * This can be used to create any kind of object, not just controllers. Do this for anything
         * you want to use from the service scope for this controller. This verison works by creating
         * the version of a service with the given id.
         */
        InjectedControllerBuilder.prototype.createUnboundId = function (id, constructorFunc) {
            var services = new di.ServiceCollection();
            var scope = this.baseScope.createChildScope(services);
            services.addTransient(InjectedControllerBuilder, function (s) { return new InjectedControllerBuilder(scope); });
            var controller = scope.getRequiredServiceId(id, constructorFunc);
            if (controller.postBind !== undefined) {
                controller.postBind();
            }
            this.controllerCreatedEvent.fire(controller);
            return controller;
        };
        /**
         * This will create a callback function that will create a new controller when it is called.
         * @returns
         */
        InjectedControllerBuilder.prototype.createOnCallback = function (controllerConstructor) {
            return this.createOnCallbackId(undefined, controllerConstructor);
        };
        /**
         * This will create a callback function that will create a new controller when it is called.
         * This version will use the service identified by id.
         * @returns
         */
        InjectedControllerBuilder.prototype.createOnCallbackId = function (id, controllerConstructor) {
            var _this = this;
            return function (bindings, data) {
                var services = new di.ServiceCollection();
                var scope = _this.baseScope.createChildScope(services);
                services.addTransient(hr_bindingcollection_1.BindingCollection, function (s) { return bindings; });
                //If some data was provided, use it as our InjectControllerData service
                //for the newly created scope.
                if (data !== undefined) {
                    services.addTransient(InjectControllerData, function (s) { return data; });
                }
                return _this.createController(id, controllerConstructor, services, scope, bindings);
            };
        };
        InjectedControllerBuilder.prototype.createController = function (id, controllerConstructor, services, scope, bindings) {
            services.addTransient(InjectedControllerBuilder, function (s) { return new InjectedControllerBuilder(scope); });
            var controller = scope.getRequiredServiceId(id, controllerConstructor);
            bindings.setListener(controller);
            if (controller.postBind !== undefined) {
                controller.postBind();
            }
            this.controllerCreatedEvent.fire(controller);
            return controller;
        };
        return InjectedControllerBuilder;
    }());
    exports.InjectedControllerBuilder = InjectedControllerBuilder;
});
define("hr.uri", ["require","exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
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
    var Uri = /** @class */ (function () {
        /**
         * Constructor. Optionally takes the url to parse, otherwise uses current
         * page url.
         * @param {string} url? The url to parse, if this is not passed it will use the window's url, if null is passed no parsing will take place.
         */
        function Uri(url) {
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
        Uri.prototype.getPathPart = function (i) {
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
        };
        /**
         * Set the query portion of the url to the given object's keys and values.
         * The keys will not be altered, the values will be uri encoded. If a value
         * in the object is null or undefined it will not be included in the query string.
         * If data is null or undefined, the query will be cleared.
         * @param {type} data The object to make into a query.
         */
        Uri.prototype.setQueryFromObject = function (data) {
            var queryString = "";
            if (data === undefined || data === null) { //set to empty object if undefined or null to clear the string
                data = {};
            }
            for (var key in data) {
                if (data[key] !== undefined && data[key] !== null) {
                    if (Array.isArray(data[key])) {
                        var arr = data[key];
                        for (var i = 0; i < arr.length; ++i) {
                            queryString += key + '=' + encodeURIComponent(arr[i]) + '&';
                        }
                    }
                    else if (data[key] instanceof Date) {
                        var parsedDate = data[key].toISOString();
                        queryString += queryString += key + '=' + encodeURIComponent(parsedDate) + '&';
                    }
                    else {
                        queryString += key + '=' + encodeURIComponent(data[key]) + '&';
                    }
                }
            }
            if (queryString.length > 0) {
                queryString = queryString.substr(0, queryString.length - 1);
            }
            this.query = queryString;
        };
        /**
         * Create an object from the uri's query string. The values will
         * all be run through decodeURIComponent.
         * All query string names will be set to lower case
         * to make looking them back up possible no matter the url case.
         * @returns An object version of the query string.
         */
        Uri.prototype.getQueryObject = function () {
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
                        pairValue = decodeURIComponent(pair[1].replace(/\+/g, ' '));
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
        };
        /**
         * Build the complete url from the current settings.
         * This will do the following concatentaion:
         * protocol + '://' + authority + directory + file + '?' + query
         * @returns
         */
        Uri.prototype.build = function () {
            var query = this.query;
            if (query && query.charAt(0) !== '?') {
                query = '?' + query;
            }
            return this.protocol + '://' + this.authority + this.directory + this.file + query;
        };
        return Uri;
    }());
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
define("node_modules/htmlrapier.treemenu/src/TreeMenu", ["require","exports","hr.storage","hr.http","hr.controller","hr.fetcher","hr.iterable","hr.domquery","hr.uri"], function (require, exports, storage, http, controller, hr_fetcher_5, iter, domQuery, uri) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function IsFolder(node) {
        return node !== undefined && node.children !== undefined;
    }
    exports.IsFolder = IsFolder;
    var TreeMenuProvider = /** @class */ (function () {
        function TreeMenuProvider(fetcher, menuStore) {
            this.fetcher = fetcher;
            this.menuStore = menuStore;
            this.menuStore.setSerializerOptions(TreeMenuProvider.serializerReplace);
        }
        Object.defineProperty(TreeMenuProvider, "InjectorArgs", {
            get: function () {
                return [hr_fetcher_5.Fetcher, TreeMenuStorage];
            },
            enumerable: true,
            configurable: true
        });
        TreeMenuProvider.prototype.loadMenu = function (url, version, urlRoot) {
            return __awaiter(this, void 0, void 0, function () {
                var rootNode, err_14;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            this.saveUrl = url;
                            this.pageUrl = new uri.Uri();
                            this.urlRoot = urlRoot;
                            this.version = version;
                            this.sessionData = this.menuStore.getValue(null);
                            if (!(this.sessionData === null || version === undefined || this.sessionData.version !== version)) return [3 /*break*/, 5];
                            _a.label = 1;
                        case 1:
                            _a.trys.push([1, 3, , 4]);
                            return [4 /*yield*/, http.get(url, this.fetcher)];
                        case 2:
                            rootNode = _a.sent();
                            rootNode.expanded = true;
                            return [3 /*break*/, 4];
                        case 3:
                            err_14 = _a.sent();
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
                            return [3 /*break*/, 4];
                        case 4:
                            this.sessionData = {
                                data: rootNode,
                                scrollLeft: 0,
                                scrollTop: 0,
                                version: version
                            };
                            _a.label = 5;
                        case 5:
                            //Always have to recalculate parents, since they can't be saved due to circular refs
                            this.setupRuntimeInfo(this.RootNode, undefined);
                            return [2 /*return*/];
                    }
                });
            });
        };
        TreeMenuProvider.prototype.cacheMenu = function (scrollLeft, scrollTop) {
            var cacheData = {
                data: this.sessionData.data,
                version: this.version,
                scrollLeft: scrollLeft,
                scrollTop: scrollTop
            };
            this.menuStore.setValue(cacheData);
        };
        /**
         * This function is called when something causes the menu or part of the menu to rebuild.
         */
        TreeMenuProvider.prototype.menuRebuilt = function () {
        };
        TreeMenuProvider.prototype.setupRuntimeInfo = function (node, parent) {
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
        };
        TreeMenuProvider.prototype.setParentsCurrent = function (node) {
            while (node) {
                node.expanded = true;
                node.currentPage = true;
                node = node.parent;
            }
        };
        TreeMenuProvider.serializerReplace = function (key, value) {
            return key !== 'parent' && key !== 'currentPage' ? value : undefined;
        };
        Object.defineProperty(TreeMenuProvider.prototype, "RootNode", {
            get: function () {
                return this.sessionData.data;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(TreeMenuProvider.prototype, "ScrollLeft", {
            get: function () {
                return this.sessionData.scrollLeft;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(TreeMenuProvider.prototype, "ScrollTop", {
            get: function () {
                return this.sessionData.scrollTop;
            },
            enumerable: true,
            configurable: true
        });
        return TreeMenuProvider;
    }());
    exports.TreeMenuProvider = TreeMenuProvider;
    function VariantFinder(node) {
        if (!IsFolder(node.original)) {
            return "link";
        }
    }
    function RootVariant(node) {
        return "root";
    }
    var TreeMenu = /** @class */ (function () {
        function TreeMenu(bindings, treeMenuProvider, builder) {
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
        Object.defineProperty(TreeMenu, "InjectorArgs", {
            get: function () {
                return [controller.BindingCollection, TreeMenuProvider, controller.InjectedControllerBuilder];
            },
            enumerable: true,
            configurable: true
        });
        TreeMenu.prototype.loadMenu = function () {
            return __awaiter(this, void 0, void 0, function () {
                var _this = this;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, this.treeMenuProvider.loadMenu(this.ajaxurl, this.version, this.urlRoot)];
                        case 1:
                            _a.sent();
                            //Only cache menus that loaded correctly
                            window.addEventListener("beforeunload", function (e) {
                                //Cheat to handle scroll position, using handles
                                var scrollLeft = 0;
                                var scrollTop = 0;
                                if (_this.scrollElement) {
                                    scrollLeft = _this.scrollElement.scrollLeft;
                                    scrollTop = _this.scrollElement.scrollTop;
                                }
                                _this.treeMenuProvider.cacheMenu(scrollLeft, scrollTop);
                            });
                            //Build child tree nodes
                            this.buildMenu();
                            //Now that the menu is built, restore the scroll position
                            if (this.scrollElement) {
                                this.scrollElement.scrollLeft = this.treeMenuProvider.ScrollLeft;
                                this.scrollElement.scrollTop = this.treeMenuProvider.ScrollTop;
                            }
                            return [2 /*return*/];
                    }
                });
            });
        };
        TreeMenu.prototype.buildMenu = function () {
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
        };
        TreeMenu.prototype.rebuildMenu = function () {
            this.buildMenu();
            this.treeMenuProvider.menuRebuilt();
        };
        return TreeMenu;
    }());
    exports.TreeMenu = TreeMenu;
    var TreeMenuItem = /** @class */ (function () {
        function TreeMenuItem(bindings, folderMenuItemInfo, builder) {
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
        Object.defineProperty(TreeMenuItem, "InjectorArgs", {
            get: function () {
                return [controller.BindingCollection, controller.InjectControllerData, controller.InjectedControllerBuilder];
            },
            enumerable: true,
            configurable: true
        });
        TreeMenuItem.prototype.postBind = function () {
            if (this.folder && this.folder.expanded) {
                this.buildChildren();
                this.childToggle.on();
            }
            else {
                this.childToggle.off();
            }
        };
        TreeMenuItem.prototype.toggleMenuItem = function (evt) {
            evt.preventDefault();
            evt.stopPropagation();
            this.buildChildren();
            this.childToggle.toggle();
            this.folder.expanded = this.childToggle.mode;
        };
        TreeMenuItem.prototype.buildChildren = function () {
            var _this = this;
            if (this.folder && !this.loadedChildren) {
                this.loadedChildren = true;
                //Select nodes, treat all nodes as link nodes
                var childIter = new iter.Iterable(this.folder.children).select(function (i) {
                    return {
                        original: i,
                        name: i.name,
                        link: i.link,
                        target: i.target ? i.target : "_self",
                        urlRoot: _this.folderMenuItemInfo.urlRoot,
                        parentItem: _this,
                        provider: _this.folderMenuItemInfo.provider
                    };
                });
                this.childModel.setData(childIter, this.builder.createOnCallback(TreeMenuItem), VariantFinder);
            }
        };
        /**
         * Rebuild the children for this menu item
         * @param node - The menu node to stop at and rebuild. Will do nothing if the node cannot be found.
         */
        TreeMenuItem.prototype.rebuildParent = function (node) {
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
        };
        return TreeMenuItem;
    }());
    exports.TreeMenuItem = TreeMenuItem;
    var TreeMenuStorage = /** @class */ (function (_super) {
        __extends(TreeMenuStorage, _super);
        function TreeMenuStorage(storageDriver) {
            return _super.call(this, storageDriver) || this;
        }
        return TreeMenuStorage;
    }(storage.JsonStorage));
    exports.TreeMenuStorage = TreeMenuStorage;
    /**
     * Add the default services for the tree menu. Note this will create a default storage for the
     * menu in sesssion storage called defaultTreeMenu. If you only have one tree menu per page
     * this should be fine, otherwise inject your own TreeMenuStorage with a unique name.
     * @param services
     */
    function addServices(services) {
        services.tryAddTransient(TreeMenuStorage, function (s) { return new TreeMenuStorage(new storage.SessionStorageDriver("defaultTreeMenu")); }); //Create a default session storage, users are encouraged to make their own
        services.tryAddTransient(TreeMenuProvider, TreeMenuProvider);
        services.tryAddTransient(TreeMenu, TreeMenu);
        services.tryAddTransient(TreeMenuItem, TreeMenuItem);
    }
    exports.addServices = addServices;
});
define("hr.pageconfig", ["require","exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
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
    var config = undefined;
    function IsEditMode() {
        if (config === undefined) {
            var config = pageConfig.read();
        }
        return config.editSettings !== undefined;
    }
    exports.IsEditMode = IsEditMode;
});
define("node_modules/htmlrapier.sidebar/src/sidebartoggle", ["require","exports","hr.domquery"], function (require, exports, domQuery) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    /**
     * This class toggles bootstrap sidebars when an element has a data-toggle="sidebar" attribute on
     * it. Use data-target="#wrapper" where #wrapper is the query you want to use to find the wrapper to toggle.
     */
    var SidebarMenuToggle = /** @class */ (function () {
        function SidebarMenuToggle(toggleElement) {
            var _this = this;
            var targetName = toggleElement.getAttribute("data-target");
            this.target = domQuery.first(targetName);
            toggleElement.onclick = function (evt) { return _this.toggle(evt); };
        }
        SidebarMenuToggle.prototype.toggle = function (evt) {
            evt.preventDefault();
            if (this.target.classList.contains("toggled")) {
                this.target.classList.remove("toggled");
            }
            else {
                this.target.classList.add("toggled");
            }
        };
        return SidebarMenuToggle;
    }());
    exports.SidebarMenuToggle = SidebarMenuToggle;
    /**
     * Activate any toggles that can be automatically activated.
     */
    function activate() {
        var elements = domQuery.all('[data-toggle=sidebar]');
        elements.forEach(function (i) {
            new SidebarMenuToggle(i);
        });
    }
    exports.activate = activate;
});
define("edity.theme.layouts.default", ["require","exports","node_modules/htmlrapier.treemenu/src/TreeMenu","node_modules/editymceditface.client/EditorCore/EditModeDetector","hr.controller","node_modules/htmlrapier.bootstrap/src/all","node_modules/htmlrapier.sidebar/src/sidebartoggle","hr.fetcher","hr.windowfetch"], function (require, exports, TreeMenu, EditModeDetector, controller, bootstrap, SidebarToggle, fetcher, windowFetch) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    bootstrap.activate();
    SidebarToggle.activate();
    //Only create tree menu if not in edit mode, otherwise the editor will create an editing tree menu instead
    if (!EditModeDetector.IsEditMode()) {
        var builder = new controller.InjectedControllerBuilder();
        builder.Services.addShared(fetcher.Fetcher, function (s) { return new windowFetch.WindowFetch(); });
        TreeMenu.addServices(builder.Services);
        builder.create("treeMenu", TreeMenu.TreeMenu);
    }
});
