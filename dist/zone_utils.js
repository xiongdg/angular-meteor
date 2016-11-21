'use strict';
import * as _ from 'underscore';
import { gZone, check, noop } from './utils';
export class ZoneRunScheduler {
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
export const zoneRunScheduler = new ZoneRunScheduler();
function wrapFuncInZone(zone, method, context) {
    return function (...args) {
        gZone.run(() => {
            method.apply(context, args);
        });
        zoneRunScheduler.scheduleRun(zone);
    };
}
export function wrapCallbackInZone(zone, callback, context) {
    if (_.isFunction(callback)) {
        return wrapFuncInZone(zone, callback, context);
    }
    for (let fn of _.functions(callback)) {
        callback[fn] = wrapFuncInZone(zone, callback[fn], context);
    }
    return callback;
}
export function scheduleMicroTask(fn) {
    Zone.current.scheduleMicroTask('scheduleMicrotask', fn);
}
