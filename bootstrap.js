/*global define, callbackApplication */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        // AMD. Register as an anonymous module.
        define('mr', ['exports', 'require', 'bluebird'], factory);
    } else if (typeof exports === 'object') {
        // Node. Does not work with strict CommonJS, but
        // only CommonJS-like environments that support module.exports,
        // like Node.
        factory(exports);
    } else {
        // Browser globals (root is window)
        factory((root.mr = {}));
    }
}(this, function (exports, Promise, Require) {
    
    "use strict";

    // reassigning causes eval to not use lexical scope.
    var globalEval = eval,
    /*jshint evil:true */
    global = globalEval('this'); 
    /*jshint evil:false */

    //
    // Browser Platform 
    //

    var paramsCache,
        dataAttrPreffix = 'mr',
        bootstrapScriptName = 'bootstrap',
        dataAttrPattern = /^data-(.*)$/,
        boostrapPattern = new RegExp('^(.*)' + bootstrapScriptName + '.js(?:[\?\.]|$)', 'i'),
        letterAfterDashPattern = /-([a-z])/g;

    function upperCaseChar(_, c) {
        return c.toUpperCase();
    }

    function getParams() {
        var i, j,
            match, script, scripts,
            scriptLocation, attr, name;

        if (!paramsCache) {
            paramsCache = {};
            // Find the <script> that loads us, so we can divine our
            // parameters from its attributes.
            scripts = document.getElementsByTagName("script");
            for (i = 0; i < scripts.length; i++) {
                script = scripts[i];
                if (script.src && (match = script.src.match(boostrapPattern))) {
                    scriptLocation = match[1];
                }
                if (script.hasAttribute("data-" + dataAttrPreffix + "-location")) {
                    scriptLocation = script.getAttribute("data-" + dataAttrPreffix + "-location");
                }
                if (scriptLocation) {
                    if (script.dataset) {
                        for (name in script.dataset) {
                            if (script.dataset.hasOwnProperty(name)) {
                                paramsCache[name] = script.dataset[name];
                            }
                        }
                    } else if (script.attributes) {
                        for (j = 0; j < script.attributes.length; j++) {
                            attr = script.attributes[j];
                            match = attr.name.match(dataAttrPattern);
                            if (match) {
                                paramsCache[match[1].replace(letterAfterDashPattern, upperCaseChar)] = attr.value;
                            }
                        }
                    }
                    // Permits multiple bootstrap.js <scripts>; by
                    // removing as they are discovered, next one
                    // finds itself.
                    script.parentNode.removeChild(script);
                    paramsCache.bootstrapLocation = paramsCache[dataAttrPreffix + 'Location'] = scriptLocation;
                    break;
                }
            }
        }

        return paramsCache;
    }

    function load(location, loadCallback, errorCallback, finallyCallback) {
        var script;

        function finallyHandler() {
            if (finallyCallback) {
                finallyCallback(script);
            }

            // remove clutter
            if (script.parentNode) {
                script.parentNode.removeChild(script);   
            }
        }

        if (typeof document !== "undefined") {
            script = document.createElement("script");
            script.setAttribute('async', '');
            script.setAttribute('src', location);
            script.onload = function () {
                if (loadCallback) {
                    loadCallback(script);
                }
                finallyHandler();
            };
            script.onerror = function (err) {
                if (errorCallback) {
                    errorCallback(err, script);
                }
                finallyHandler();
            };
            document.head.appendChild(script);
        } else {
            errorCallback(new Error("document not supported"));
            finallyHandler();
        }   
    }

    // mini-url library
    var resolve = (function makeResolve() {
            
        try {

            var testHost = "http://example.org",
                testPath = "/test.html",
                resolved = new URL(testPath, testHost).href;

            if (!resolved || resolved !== testHost + testPath) {
                throw new Error('NotSupported');
            }

            return function (base, relative) {
                return new URL(relative, base).href;
            };

        } catch (err) {

            var IS_ABSOLUTE_REG = /^[\w\-]+:/,
                head = document.querySelector("head"),
                currentBaseElement = head.querySelector("base"),
                baseElement = document.createElement("base"),
                relativeElement = document.createElement("a"),
                needsRestore = false;

                if(currentBaseElement) {
                    needsRestore = true;
                }
                else {
                    currentBaseElement = document.createElement("base");
                }

            // Optimization, we won't check ogain if there's a base tag.
            baseElement.href = "";

            return function (base, relative) {
                var restore;

                if (!needsRestore) {
                    head.appendChild(currentBaseElement);
                }

                base = String(base);
                if (IS_ABSOLUTE_REG.test(base) === false) {
                    throw new Error("Can't resolve from a relative location: " + JSON.stringify(base) + " " + JSON.stringify(relative));
                }
                if(needsRestore) {
                    restore = currentBaseElement.href;
                }
                currentBaseElement.href = base;
                relativeElement.href = relative;
                var resolved = relativeElement.href;
                if (needsRestore) {
                    currentBaseElement.href = restore;
                } else {
                    head.removeChild(currentBaseElement);
                }
                return resolved;
            };
        }
    }());

    //
    //
    //

    var readyStatePattern = /interactive|complete/;
    var bootstrap = function (callback) {

        callback = callback || callbackApplication;

        // determine which scripts to load
        var pending = {
            "promise": "node_modules/bluebird/js/browser/bluebird.min.js",
            "require": "require.js",
            "require/browser": "browser.js",
        };

        var domLoaded, URL,
            params = getParams();

        function callbackIfReady() {
            if (domLoaded && Require) {
                callback(Require, Promise, URL);
            }
        }

        // observe dom loading and load scripts in parallel
        function domLoad() {
            // observe dom loaded
            document.removeEventListener("DOMContentLoaded", domLoad, true);
            domLoaded = true;
            callbackIfReady();
        }

        // miniature module system
        var bootModules = {};
        var definitions = {};
        function bootRequire(id) {
            if (!bootModules[id] && definitions[id]) {
                var exports = bootModules[id] = {};
                bootModules[id] = definitions[id](bootRequire, exports) || exports;
            }
            return bootModules[id];
        }

        // execute bootstrap scripts
        function allModulesLoaded() {
            Promise = bootRequire("promise");
            Require = bootRequire("require");
            URL = bootRequire("mini-url");
            callbackIfReady();
        }

        // this permits bootstrap.js to be injected after DOMContentLoaded
        // http://jsperf.com/readystate-boolean-vs-regex/2
        if (readyStatePattern.test(document.readyState)) {
            domLoad();
        } else {
            document.addEventListener("DOMContentLoaded", domLoad, true);
        }

        // register module definitions for deferred, serial execution
        function bootstrapModule(id, factory) {
            definitions[id] = factory;
            delete pending[id];
            for (id in pending) {
                if (pending.hasOwnProperty(id)) {
                    // this causes the function to exit if there are any remaining
                    // scripts loading, on the first iteration.  consider it
                    // equivalent to an array length check
                    return;
                }
            }
            // if we get past the for loop, bootstrapping is complete.  get rid
            // of the bootstrap function and proceed.
            delete global.bootstrap;
            allModulesLoaded();
        }

        function bootstrapModulePromise(Promise) {
            bootstrapModule("bluebird", function (mrRequire, exports) {
                return Promise;
            });

            bootstrapModule("promise", function (mrRequire, exports) {
                return Promise;
            });
        }

        // Expose bootstrap
        global.bootstrap = bootstrapModule;

        // one module loaded for free, for use in require.js, browser.js
        bootstrapModule("mini-url", function (mrRequire, exports) {
            exports.resolve = resolve;
        });

        // load in parallel, but only if we're not using a preloaded cache.
        // otherwise, these scripts will be inlined after already
        if (!global.preload || !global.BUNDLE) {
            var bootstrapLocation = resolve(window.location, params.bootstrapLocation);

            if (Promise) {
                //global.bootstrap cleans itself from window once all known are loaded. "bluebird" is not known, so needs to do it first
                bootstrapModulePromise(Promise);
            } else {
                var promiseLocation = params.promiseLocation || resolve(bootstrapLocation, pending.promise);
                // Special Case bluebird for now:
                load(promiseLocation, function() {
                    bootstrapModulePromise((Promise = window.Promise));
                });   
            }

            // Load other module and skip promise
            for (var id in pending) {
                if (pending.hasOwnProperty(id)) {
                    if (id !== 'promise') { // Let special case load promise
                        load(resolve(bootstrapLocation, pending[id]));   
                    }
                }
            }       
        }
    };

    var browser = {
        getParams: getParams,
        bootstrap: bootstrap
    };

    //
    // External API
    //

    // Bootstrapping for multiple-platforms
    exports.getPlatform = function() {
        if (typeof window !== "undefined" && window && window.document) {
            return browser;
        } else if (typeof process !== "undefined") {
            return require("./node.js");
        } else {
            throw new Error("Platform not supported.");
        }
    };

    /**
     * Initializes Montage and creates the application singleton if
     * necessary.
     */
    exports.initMontageRequire = function() {
        var platform = exports.getPlatform();

        // Platform dependent
        return platform.bootstrap(function(mrRequire, Promise, URL) {

            var config = {},
                params = platform.getParams(),
                applicationModuleId = params.module || "",
                applicationLocation = URL.resolve(mrRequire.getLocation(), params.package || ".");

            // execute the preloading plan and stall the fallback module loader
            // until it has finished
            if (global.preload) {

                var bundleDefinitions = {};
                var getDefinition = function (name) {
                    return bundleDefinitions[name] =
                        bundleDefinitions[name] ||
                            Promise.resolve();
                };
                
                global.bundleLoaded = function (name) {
                    return getDefinition(name).resolve();
                };
                
                var preloading = Promise.resolve();
                config.preloaded = preloading.promise;
                // preload bundles sequentially

                var preloaded = Promise.resolve();
                global.preload.forEach(function (bundleLocations) {
                    preloaded = preloaded.then(function () {
                        return Promise.all(bundleLocations.map(function (bundleLocation) {
                            load(bundleLocation);
                            return getDefinition(bundleLocation).promise;
                        }));
                    });
                });

                // then release the module loader to run normally
                preloading.resolve(preloaded.then(function () {
                    delete global.preload;
                    delete global.bundleLoaded;
                }));
            }

            mrRequire.loadPackage({
                location: params.bootstrapLocation,
                hash: params.mrHash
            }, config).then(function (mrRequire) {
                mrRequire.inject("mini-url", URL);
                mrRequire.inject("promise", Promise); 
                mrRequire.inject("require", mrRequire);

                if ("autoPackage" in params) {
                    mrRequire.injectPackageDescription(applicationLocation, {});
                }

                return mrRequire.loadPackage({
                    location: applicationLocation,
                    hash: params.applicationHash
                }).then(function (pkg) {

                    // Expose global require
                    global.require = pkg;
                    
                    return pkg.async(applicationModuleId);
                });
            });
        });
    };

    if (typeof window !== "undefined") {
        if (global.__MONTAGE_REQUIRE_LOADED__) {
            console.warn("MontageRequire already loaded!");
        } else {
            global.__MONTAGE_REQUIRE_LOADED__ = true;
            exports.initMontageRequire();
        }
    } else {
        // may cause additional exports to be injected:
        exports.getPlatform();
    }
}));
