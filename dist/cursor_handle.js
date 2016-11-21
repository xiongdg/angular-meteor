'use strict';
import { check } from './utils';
export class CursorHandle {
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
