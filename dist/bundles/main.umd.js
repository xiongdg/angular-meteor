(function (global, factory) {
   typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('angular2-meteor-polyfills'), require('underscore'), require('@angular/core')) :
   typeof define === 'function' && define.amd ? define(['exports', 'angular2-meteor-polyfills', 'underscore', '@angular/core'], factory) :
   (factory((global.ng = global.ng || {}, global.ng.meteor = global.ng.meteor || {}),global.ng.meteor.polyfills,global.underscore,global.ng.core));
}(this, (function (exports,angular2MeteorPolyfills,_,_angular_core) { 'use strict';

const subscribeEvents = ['onReady', 'onError', 'onStop'];
function isMeteorCallbacks(callbacks) {
    return _.isFunction(callbacks) || isCallbacksObject(callbacks);
}
// Checks if callbacks of {@link CallbacksObject} type.
function isCallbacksObject(callbacks) {
    return callbacks && subscribeEvents.some((event) => {
        return _.isFunction(callbacks[event]);
    });
}

const g = typeof global === 'object' ? global :
    typeof window === 'object' ? window :
        typeof self === 'object' ? self : undefined;
const gZone = g.Zone.current;
const check = Package['check'].check;
/* tslint:disable */

function debounce(func, wait, onInit) {
    let timeout, result, data;
    let later = function (context, args) {
        timeout = null;
        result = func.apply(context, [...args, data]);
    };
    let debounced = function (...args) {
        if (!timeout) {
            data = onInit && onInit();
        }
        if (timeout) {
            clearTimeout(timeout);
        }
        timeout = _.delay(later, wait, this, args);
        return result;
    };
    return debounced;
}

function noop() { }
function isListLikeIterable(obj) {
    if (!isJsObject(obj))
        return false;
    return isArray(obj) ||
        (!(obj instanceof Map) &&
            getSymbolIterator() in obj); // JS Iterable have a Symbol.iterator prop
}
function isArray(obj) {
    return Array.isArray(obj);
}
function isPresent(obj) {
    return obj !== undefined && obj !== null;
}
function isBlank(obj) {
    return obj === undefined || obj === null;
}
function isJsObject(o) {
    return o !== null && (typeof o === 'function' || typeof o === 'object');
}
var _symbolIterator = null;
function getSymbolIterator() {
    if (isBlank(_symbolIterator)) {
        if (isPresent(g.Symbol) && isPresent(Symbol.iterator)) {
            _symbolIterator = Symbol.iterator;
        }
        else {
            // es6-shim specific logic
            var keys = Object.getOwnPropertyNames(Map.prototype);
            for (var i = 0; i < keys.length; ++i) {
                var key = keys[i];
                if (key !== 'entries' && key !== 'size' &&
                    Map.prototype[key] === Map.prototype['entries']) {
                    _symbolIterator = key;
                }
            }
        }
    }
    return _symbolIterator;
}

class ZoneRunScheduler {
    constructor() {
        this._zoneTasks = new Map();
        this._onRunCbs = new Map();
    }
    zoneRun(zone) {
        return () => {
            zone.run(noop);
            this._runAfterRunCbs(zone);
            this._zoneTasks.delete(zone);
        };
    }
    runZones() {
        this._zoneTasks.forEach((task, zone) => {
            task.invoke();
        });
    }
    _runAfterRunCbs(zone) {
        if (this._onRunCbs.has(zone)) {
            let cbs = this._onRunCbs.get(zone);
            while (cbs.length !== 0) {
                (cbs.pop())();
            }
            this._onRunCbs.delete(zone);
        }
    }
    scheduleRun(zone) {
        if (zone === gZone) {
            return;
        }
        let runTask = this._zoneTasks.get(zone);
        if (runTask) {
            runTask.cancelFn(runTask);
            this._zoneTasks.delete(zone);
        }
        runTask = gZone.scheduleMacroTask('runZones', this.zoneRun(zone), { isPeriodic: true }, task => {
            task._tHandler = setTimeout(task.invoke);
        }, task => {
            clearTimeout(task._tHandler);
        });
        this._zoneTasks.set(zone, runTask);
    }
    onAfterRun(zone, cb) {
        check(cb, Function);
        if (!this._zoneTasks.has(zone)) {
            cb();
            return;
        }
        let cbs = this._onRunCbs.get(zone);
        if (!cbs) {
            cbs = [];
            this._onRunCbs.set(zone, cbs);
        }
        cbs.push(cb);
    }
}
const zoneRunScheduler = new ZoneRunScheduler();
function wrapFuncInZone(zone, method, context) {
    return function (...args) {
        gZone.run(() => {
            method.apply(context, args);
        });
        zoneRunScheduler.scheduleRun(zone);
    };
}
function wrapCallbackInZone(zone, callback, context) {
    if (_.isFunction(callback)) {
        return wrapFuncInZone(zone, callback, context);
    }
    for (let fn of _.functions(callback)) {
        callback[fn] = wrapFuncInZone(zone, callback[fn], context);
    }
    return callback;
}
function scheduleMicroTask(fn) {
    Zone.current.scheduleMicroTask('scheduleMicrotask', fn);
}

class CursorHandle {
    constructor(hCurObserver, hAutoNotify) {
        check(hAutoNotify, Match.Optional(Tracker.Computation));
        check(hCurObserver, Match.Where(function (observer) {
            return !!observer.stop;
        }));
        this._hAutoNotify = hAutoNotify;
        this._hCurObserver = hCurObserver;
    }
    stop() {
        if (this._hAutoNotify) {
            this._hAutoNotify.stop();
        }
        this._hCurObserver.stop();
    }
}

class AddChange {
    constructor(index, item) {
        this.index = index;
        this.item = item;
    }
}
class UpdateChange {
    constructor(index, item) {
        this.index = index;
        this.item = item;
    }
}
class MoveChange {
    constructor(fromIndex, toIndex) {
        this.fromIndex = fromIndex;
        this.toIndex = toIndex;
    }
}
class RemoveChange {
    constructor(index) {
        this.index = index;
    }
}
/**
 * Class that does a background work of observing
 * Mongo collection changes (through a cursor)
 * and notifying subscribers about them.
 */
class MongoCursorObserver extends _angular_core.EventEmitter {
    constructor(cursor, _debounceMs = 50) {
        super();
        this._debounceMs = _debounceMs;
        this._lastChanges = [];
        this._ngZone = g.Zone.current;
        this._isSubscribed = false;
        check(cursor, Match.Where(MongoCursorObserver.isCursor));
        this._cursor = cursor;
    }
    static isCursor(cursor) {
        return cursor && !!cursor.observe;
    }
    subscribe(events) {
        let sub = super.subscribe(events);
        // Start processing of the cursor lazily.
        if (!this._isSubscribed) {
            this._isSubscribed = true;
            this._hCursor = this._processCursor(this._cursor);
        }
        return sub;
    }
    get lastChanges() {
        return this._lastChanges;
    }
    destroy() {
        if (this._hCursor) {
            this._hCursor.stop();
        }
        this._hCursor = null;
    }
    _processCursor(cursor) {
        // On the server side fetch data, don't observe.
        if (Meteor.isServer) {
            let changes = [];
            let index = 0;
            for (let doc of cursor.fetch()) {
                changes.push(this._addAt(doc, index++));
            }
            this.emit(changes);
            return null;
        }
        let hCurObserver = this._startCursorObserver(cursor);
        return new CursorHandle(hCurObserver);
    }
    _startCursorObserver(cursor) {
        let changes = [];
        let callEmit = () => {
            this.emit(changes.slice());
            changes.length = 0;
        };
        // Since cursor changes are now applied in bulk
        // (due to emit debouncing), scheduling macro task
        // allows us to use MeteorApp.onStable,
        // i.e. to know when the app is stable.
        let scheduleEmit = () => {
            return this._ngZone.scheduleMacroTask('emit', callEmit, null, noop);
        };
        let init = false;
        let runTask = task => {
            task.invoke();
            this._ngZone.run(noop);
            init = true;
        };
        let emit = null;
        if (this._debounceMs) {
            emit = debounce(task => runTask(task), this._debounceMs, scheduleEmit);
        }
        else {
            let initAdd = debounce(task => runTask(task), 0, scheduleEmit);
            emit = () => {
                // This is for the case when cursor.observe
                // is called multiple times in a row
                // when the initial docs are being added.
                if (!init) {
                    initAdd();
                    return;
                }
                runTask(scheduleEmit());
            };
        }
        return gZone.run(() => cursor.observe({
            addedAt: (doc, index) => {
                let change = this._addAt(doc, index);
                changes.push(change);
                emit();
            },
            changedAt: (nDoc, oDoc, index) => {
                let change = this._updateAt(nDoc, index);
                changes.push(change);
                emit();
            },
            movedTo: (doc, fromIndex, toIndex) => {
                let change = this._moveTo(doc, fromIndex, toIndex);
                changes.push(change);
                emit();
            },
            removedAt: (doc, atIndex) => {
                let change = this._removeAt(atIndex);
                changes.push(change);
                emit();
            }
        }));
    }
    _updateAt(doc, index) {
        return new UpdateChange(index, doc);
    }
    _addAt(doc, index) {
        let change = new AddChange(index, doc);
        return change;
    }
    _moveTo(doc, fromIndex, toIndex) {
        return new MoveChange(fromIndex, toIndex);
    }
    _removeAt(index) {
        return new RemoveChange(index);
    }
}

function checkIfMongoCursor(cursor) {
    return MongoCursorObserver.isCursor(cursor);
}
// Creates an MongoCursorObserver instance for a Mongo.Cursor instance.
// Add one more level of abstraction, but currently is not really needed.
class MongoCursorObserverFactory {
    create(cursor) {
        if (checkIfMongoCursor(cursor)) {
            return new MongoCursorObserver(cursor);
        }
        return null;
    }
}
// An instance of this factory (see providers.ts) is registered globally
// as one of the providers of collection differs.
// These providers are being checked by an ngFor instance to find out which
// differ it needs to create and use for the current collection.
class MongoCursorDifferFactory {
    supports(obj) { return checkIfMongoCursor(obj); }
    create(cdRef) {
        return new MongoCursorDiffer(cdRef, new MongoCursorObserverFactory());
    }
}
const trackById = (index, item) => item._id;
/**
 * A class that implements Angular 2's concept of differs for ngFor.
 * API consists mainly of diff method and methods like forEachAddedItem
 * that is being run on each change detection cycle to apply new changes if any.
 */
class MongoCursorDiffer extends _angular_core.DefaultIterableDiffer {
    constructor(cdRef, obsFactory) {
        super(trackById);
        this._inserted = [];
        this._removed = [];
        this._moved = [];
        this._updated = [];
        this._changes = [];
        this._forSize = 0;
        this._obsFactory = obsFactory;
    }
    forEachAddedItem(fn) {
        for (let insert of this._inserted) {
            fn(insert);
        }
    }
    forEachMovedItem(fn) {
        for (let move of this._moved) {
            fn(move);
        }
    }
    forEachRemovedItem(fn) {
        for (let remove of this._removed) {
            fn(remove);
        }
    }
    forEachIdentityChange(fn) {
        for (let update of this._updated) {
            fn(update);
        }
    }
    forEachOperation(fn) {
        for (let change of this._changes) {
            fn(change, change.previousIndex, change.currentIndex);
        }
    }
    diff(cursor) {
        this._reset();
        let newCursor = false;
        if (cursor && this._cursor !== cursor) {
            newCursor = true;
            this._destroyObserver();
            this._cursor = cursor;
            this._curObserver = this._obsFactory.create(cursor);
            this._sub = this._curObserver.subscribe({
                next: changes => this._updateLatestValue(changes)
            });
        }
        if (this._lastChanges) {
            this._applyChanges(this._lastChanges);
        }
        /**
         * If either last changes or new cursor is true, then
         * return "this" to notify Angular2 to re-build views.
         * If last changes or new cursor are true simultaneously
         * means that Mongo cursor has been changed and it's expected
         * that last changes (if any) of that cursor are additions only
         * (otherwise it won't likely work).
         * So removals of the previous cursor and additions of
         * the new one will processed at the same time.
         */
        if (this._lastChanges || newCursor) {
            this._lastChanges = null;
            return this;
        }
        return null;
    }
    onDestroy() {
        this._destroyObserver();
    }
    get observer() {
        return this._curObserver;
    }
    _destroyObserver() {
        if (this._curObserver) {
            this._curObserver.destroy();
        }
        if (this._sub) {
            this._sub.unsubscribe();
        }
        this._applyCleanup();
    }
    _updateLatestValue(changes) {
        this._lastChanges = changes;
    }
    _reset() {
        this._inserted.length = 0;
        this._moved.length = 0;
        this._removed.length = 0;
        this._updated.length = 0;
        this._changes.length = 0;
    }
    // Reset previous state of the differ by removing all currently shown documents.
    _applyCleanup() {
        for (let index = 0; index < this._forSize; index++) {
            let remove = this._createChangeRecord(null, 0, null);
            this._removed.push(remove);
            this._changes.push(remove);
        }
        this._forSize = 0;
    }
    _applyChanges(changes) {
        for (let change of changes) {
            if (change instanceof AddChange) {
                let add = this._createChangeRecord(change.index, null, change.item);
                this._inserted.push(add);
                this._changes.push(add);
                this._forSize++;
            }
            if (change instanceof MoveChange) {
                let move = this._createChangeRecord(change.toIndex, change.fromIndex, change.item);
                this._moved.push(move);
                this._changes.push(move);
            }
            if (change instanceof RemoveChange) {
                let remove = this._createChangeRecord(null, change.index, change.item);
                this._removed.push(remove);
                this._changes.push(remove);
                this._forSize--;
            }
            if (change instanceof UpdateChange) {
                this._updated.push(this._createChangeRecord(change.index, null, change.item));
            }
        }
    }
    _createChangeRecord(currentIndex, prevIndex, item) {
        let record = new _angular_core.CollectionChangeRecord(item, trackById);
        record.currentIndex = currentIndex;
        record.previousIndex = prevIndex;
        return record;
    }
}

/**
 * A basic class to extend @Component and @Pipe.
 * Contains wrappers over main Meteor methods
 * that does some maintenance work behind the scene:
 * - Destroys subscription handles
 *   when the component or pipe is destroyed by Angular 2.
 * - Debounces ngZone runs reducing number of
 *   change detection runs.
 */
class MeteorReactive {
    constructor() {
        this._hAutoruns = [];
        this._hSubscribes = [];
        this._ngZone = g.Zone.current;
    }
    /**
     * Method has the same notation as Meteor.autorun
     * except the last parameter.
     * @param {MeteorReactive~autorunCallback} func - Callback to be executed when current computation is
     * invalidated. The Tracker.Computation object will be passed as argument to
     * this callback.
     * @param {Boolean} autoBind - Determine whether Angular2 Zone will run
     *   after the func call to initiate change detection.
     * @returns {Tracker.Computation} - Object representing the Meteor computation
     * @example
     * class MyComponent extends MeteorReactive {
     *    private myData: Mongo.Cursor;
     *    private dataId: any;
     *
     *    constructor() {
     *      super();
     *
     *      this.autorun(() => {
     *        this.myData = MyCollection.find({ _id: dataId});
     *      }, true);
     *    }
     * }
     *
     * @see {@link https://docs.meteor.com/api/tracker.html#tracker_computation|Tracker.Computation in Meteor documentation}
     * @see {@link https://docs.meteor.com/api/tracker.html#Tracker-autorun|autorun in Meteor documentation}
     */
    autorun(func, autoBind = true) {
        let { pargs } = this._prepArgs([func, autoBind]);
        let hAutorun = Tracker.autorun(pargs[0]);
        this._hAutoruns.push(hAutorun);
        return hAutorun;
    }
    /**
     *  Method has the same notation as Meteor.subscribe:
     *    subscribe(name, [args1, args2], [callbacks], [autoBind])
     *  except the last autoBind param (see autorun above).
     *  @param {String} name - Name of the publication in the Meteor server
     *  @param {any} args - Parameters that will be forwarded to the publication.
     *  @param {Boolean} autoBind - Determine whether Angular 2 zone will run
     *   after the func call to initiate change detection.
     *  @returns {Meteor.SubscriptionHandle} - The handle of the subscription created by Meteor.
     *  @example
     *  class MyComponent extends MeteorReactive {
     *     constructor() {
     *       super();
     *
     *       this.subscribe("myData", 10);
     *     }
     *  }
     *
     *  @see {@link http://docs.meteor.com/api/pubsub.html|Publication/Subscription in Meteor documentation}
     */
    subscribe(name, ...args) {
        let { pargs } = this._prepArgs(args);
        if (!Meteor.subscribe) {
            throw new Error('Meteor.subscribe is not defined on the server side');
        }
        
        let hSubscribe = Meteor.subscribe(name, ...pargs);
        if (Meteor.isClient) {
            this._hSubscribes.push(hSubscribe);
        }
        
        if (Meteor.isServer) {
            let callback = pargs[pargs.length - 1];
            if (_.isFunction(callback)) {
                callback();
            }
            if (isCallbacksObject(callback)) {
                callback.onReady();
            }
        }
        return hSubscribe;
    }
    /**
   *  Method has the same notation as Meteor.call:
   *    call(name, [args1, args2], [callbacks], [autoBind])
   *  except the last autoBind param (see autorun above).
   *  @param {String} name - Name of the publication in the Meteor server
   *  @param {any} args - Parameters that will be forwarded to the method.
   *  @param {Boolean} autoBind - autoBind Determine whether Angular 2 zone will run
   *   after the func call to initiate change detection.
   *  @example
   *  class MyComponent extends MeteorReactive {
   *     constructor() {
   *       super();
   *
   *       this.call("serverMethod", (err, result) => {
   *          // Handle response...
   *       });
   *     }
   *  }
   *
   *  @return {void}
   */
    call(name, ...args) {
        let { pargs } = this._prepArgs(args);
        return Meteor.call(name, ...pargs);
    }
    ngOnDestroy() {
        for (let hAutorun of this._hAutoruns) {
            hAutorun.stop();
        }
        for (let hSubscribe of this._hSubscribes) {
            hSubscribe.stop();
        }
        this._hAutoruns = null;
        this._hSubscribes = null;
    }
    _prepArgs(args) {
        let lastParam = args[args.length - 1];
        let penultParam = args[args.length - 2];
        let autoBind = true;
        if (_.isBoolean(lastParam) &&
            isMeteorCallbacks(penultParam)) {
            args.pop();
            autoBind = lastParam !== false;
        }
        lastParam = args[args.length - 1];
        if (isMeteorCallbacks(lastParam)) {
            args.pop();
        }
        else {
            lastParam = noop;
        }
        // If autoBind is set to false then
        // we run user's callback in the global zone
        // instead of the current Angular 2 zone.
        let zone = autoBind ? this._ngZone : gZone;
        lastParam = wrapCallbackInZone(zone, lastParam, this);
        args.push(lastParam);
        return { pargs: args, autoBind };
    }
}
/**
 * This callback called when autorun triggered by Meteor.
 * @callback MeteorReactive~autorunCallback
 * @param {Tracker.Computation} computation
 */
// For the versions compatibility.
/* tslint:disable */
const MeteorComponent = MeteorReactive;

class DefaultIterableDifferFactory {
    constructor() {
    }
    supports(obj) { return isListLikeIterable(obj); }
    create(cdRef, trackByFn) {
        return new _angular_core.DefaultIterableDiffer(trackByFn);
    }
}
function meteorProviders() {
    return [
        {
            provide: _angular_core.IterableDiffers,
            useFactory: () => new _angular_core.IterableDiffers([
                new DefaultIterableDifferFactory(),
                new MongoCursorDifferFactory()
            ])
        }
    ];
}
const METEOR_PROVIDERS = meteorProviders();

/// <reference types="zone.js" />
/// <reference types="meteor-typings" />
/// <reference types="@types/underscore" />

exports.ZoneRunScheduler = ZoneRunScheduler;
exports.zoneRunScheduler = zoneRunScheduler;
exports.wrapCallbackInZone = wrapCallbackInZone;
exports.scheduleMicroTask = scheduleMicroTask;
exports.AddChange = AddChange;
exports.UpdateChange = UpdateChange;
exports.MoveChange = MoveChange;
exports.RemoveChange = RemoveChange;
exports.MongoCursorObserver = MongoCursorObserver;
exports.MongoCursorDifferFactory = MongoCursorDifferFactory;
exports.MongoCursorDiffer = MongoCursorDiffer;
exports.MeteorReactive = MeteorReactive;
exports.MeteorComponent = MeteorComponent;
exports.DefaultIterableDifferFactory = DefaultIterableDifferFactory;
exports.METEOR_PROVIDERS = METEOR_PROVIDERS;

Object.defineProperty(exports, '__esModule', { value: true });

})));
