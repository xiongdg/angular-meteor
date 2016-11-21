'use strict';
import { IterableDiffers, DefaultIterableDiffer } from '@angular/core';
import { MongoCursorDifferFactory } from './mongo_cursor_differ';
import { isListLikeIterable } from './utils';
export class DefaultIterableDifferFactory {
    constructor() {
    }
    supports(obj) { return isListLikeIterable(obj); }
    create(cdRef, trackByFn) {
        return new DefaultIterableDiffer(trackByFn);
    }
}
function meteorProviders() {
    return [
        {
            provide: IterableDiffers,
            useFactory: () => new IterableDiffers([
                new DefaultIterableDifferFactory(),
                new MongoCursorDifferFactory()
            ])
        }
    ];
}
export const METEOR_PROVIDERS = meteorProviders();
