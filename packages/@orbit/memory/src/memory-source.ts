import { Assertion } from '@orbit/core';
import {
  coalesceRecordOperations,
  RecordIdentity,
  RecordOperation,
  RecordQueryResult,
  RecordQueryExpressionResult,
  RecordTransformResult,
  RecordSource,
  RecordSourceSettings,
  RecordQueryBuilder,
  RecordTransformBuilder,
  RecordQueryExpression,
  RecordTransform,
  RecordQuery,
  RecordSyncable,
  RecordUpdatable,
  RecordQueryable,
  RecordSourceQueryOptions
} from '@orbit/records';
import {
  DataOrFullResponse,
  syncable,
  QueryOrExpressions,
  RequestOptions,
  queryable,
  updatable,
  TransformOrOperations,
  buildTransform,
  FullResponse
} from '@orbit/data';
import { ResponseHints } from '@orbit/data';
import { Dict } from '@orbit/utils';
import { MemoryCache, MemoryCacheSettings } from './memory-cache';

export interface MemorySourceSettings extends RecordSourceSettings {
  base?: MemorySource;
  cacheSettings?: Partial<MemoryCacheSettings>;
}

export interface MemorySourceMergeOptions {
  coalesce?: boolean;
  sinceTransformId?: string;
  transformOptions?: RequestOptions;
}

@syncable
@queryable
@updatable
export class MemorySource
  extends RecordSource
  implements
    RecordSyncable,
    RecordUpdatable<unknown>,
    RecordQueryable<unknown> {
  private _cache: MemoryCache;
  private _base?: MemorySource;
  private _forkPoint?: string;
  private _transforms: Dict<RecordTransform>;
  private _transformInverses: Dict<RecordOperation[]>;

  // Syncable interface stubs
  sync!: (
    transformOrTransforms: RecordTransform | RecordTransform[]
  ) => Promise<void>;

  // Queryable interface stubs
  query!: <RO extends RecordSourceQueryOptions>(
    queryOrExpressions: QueryOrExpressions<
      RecordQueryExpression,
      RecordQueryBuilder
    >,
    options?: RO,
    id?: string
  ) => Promise<
    DataOrFullResponse<RecordQueryResult, unknown, RecordOperation, RO>
  >;

  // Updatable interface stubs
  update!: <RO extends RequestOptions>(
    transformOrOperations: TransformOrOperations<
      RecordOperation,
      RecordTransformBuilder
    >,
    options?: RO,
    id?: string
  ) => Promise<
    DataOrFullResponse<RecordTransformResult, unknown, RecordOperation, RO>
  >;

  constructor(settings: MemorySourceSettings) {
    const { keyMap, schema } = settings;

    settings.name = settings.name || 'memory';

    super(settings);

    this._transforms = {};
    this._transformInverses = {};

    this.transformLog.on('clear', this._logCleared.bind(this));
    this.transformLog.on('truncate', this._logTruncated.bind(this));
    this.transformLog.on('rollback', this._logRolledback.bind(this));

    let cacheSettings: Partial<MemoryCacheSettings> =
      settings.cacheSettings || {};
    cacheSettings.schema = schema;
    cacheSettings.keyMap = keyMap;
    cacheSettings.queryBuilder =
      cacheSettings.queryBuilder || this.queryBuilder;
    cacheSettings.transformBuilder =
      cacheSettings.transformBuilder || this.transformBuilder;
    if (settings.base) {
      this._base = settings.base;
      this._forkPoint = this._base.transformLog.head;
      cacheSettings.base = this._base.cache;
    }
    this._cache = new MemoryCache(cacheSettings as MemoryCacheSettings);
  }

  get cache(): MemoryCache {
    return this._cache;
  }

  get base(): MemorySource | undefined {
    return this._base;
  }

  get forkPoint(): string | undefined {
    return this._forkPoint;
  }

  upgrade(): Promise<void> {
    this._cache.upgrade();
    return Promise.resolve();
  }

  /////////////////////////////////////////////////////////////////////////////
  // Syncable interface implementation
  /////////////////////////////////////////////////////////////////////////////

  async _sync(transform: RecordTransform): Promise<void> {
    if (!this.transformLog.contains(transform.id)) {
      this._applyTransform(transform);
      await this.transformed([transform]);
    }
  }

  /////////////////////////////////////////////////////////////////////////////
  // Updatable interface implementation
  /////////////////////////////////////////////////////////////////////////////

  async _update(
    transform: RecordTransform,
    hints?: ResponseHints<RecordTransformResult, unknown>
  ): Promise<FullResponse<RecordTransformResult, unknown, RecordOperation>> {
    let results: RecordTransformResult;
    const response: FullResponse<
      RecordTransformResult,
      unknown,
      RecordOperation
    > = {};

    if (!this.transformLog.contains(transform.id)) {
      results = this._applyTransform(transform);
      response.transforms = [transform];
    }

    if (hints?.data) {
      if (transform.operations.length > 1 && Array.isArray(hints.data)) {
        response.data = hints.data.map((id) => {
          return id ? this._cache.getRecordSync(id) : undefined;
        });
      } else {
        response.data = this._cache.getRecordSync(hints.data as RecordIdentity);
      }
    } else if (results) {
      if (transform.operations.length === 1 && Array.isArray(results)) {
        response.data = results[0];
      } else {
        response.data = results;
      }
    }

    if (hints?.details) {
      response.details = hints.details;
    }

    return response;
  }

  /////////////////////////////////////////////////////////////////////////////
  // Queryable interface implementation
  /////////////////////////////////////////////////////////////////////////////

  async _query(
    query: RecordQuery,
    hints?: ResponseHints<RecordQueryResult, unknown>
  ): Promise<FullResponse<RecordQueryResult, unknown, RecordOperation>> {
    let response: FullResponse<RecordQueryResult, unknown, RecordOperation>;

    if (hints?.data) {
      response = {};
      if (query.expressions.length > 1 && Array.isArray(hints.data)) {
        let hintsData = hints.data as (RecordIdentity | RecordIdentity[])[];
        response.data = hintsData.map((idOrIds) =>
          this._retrieveFromCache(idOrIds)
        );
      } else {
        let hintsData = hints.data as RecordIdentity | RecordIdentity[];
        response.data = this._retrieveFromCache(hintsData);
      }
    } else {
      response = this._cache.query(query, { fullResponse: true });
    }

    if (hints?.details) {
      response.details = hints.details;
    }

    return response;
  }

  /////////////////////////////////////////////////////////////////////////////
  // Public methods
  /////////////////////////////////////////////////////////////////////////////

  /**
   * Create a clone, or "fork", from a "base" source.
   *
   * The forked source will have the same `schema` and `keyMap` as its base source.
   * The forked source's cache will start with the same immutable document as
   * the base source. Its contents and log will evolve independently.
   *
   * @returns The forked source.
   */
  fork(settings: MemorySourceSettings = { schema: this.schema }): MemorySource {
    const schema = this.schema;

    settings.schema = schema;
    settings.cacheSettings = settings.cacheSettings || { schema };
    settings.keyMap = this._keyMap;
    settings.queryBuilder = this.queryBuilder;
    settings.transformBuilder = this.transformBuilder;
    settings.base = this;

    return new MemorySource(settings);
  }

  /**
   * Merge transforms from a forked source back into a base source.
   *
   * By default, all of the operations from all of the transforms in the forked
   * source's history will be reduced into a single transform. A subset of
   * operations can be selected by specifying the `sinceTransformId` option.
   *
   * The `coalesce` option controls whether operations are coalesced into a
   * minimal equivalent set before being reduced into a transform.
   *
   * @param forkedSource - The source to merge.
   * @param options - Merge options
   * @returns The result of calling `update()` with the forked transforms.
   */
  merge(
    forkedSource: MemorySource,
    options: MemorySourceMergeOptions = {}
  ): Promise<any> {
    let transforms: RecordTransform[];
    if (options.sinceTransformId) {
      transforms = forkedSource.transformsSince(options.sinceTransformId);
    } else {
      transforms = forkedSource.allTransforms();
    }

    let reducedTransform;
    let ops: RecordOperation[] = [];
    transforms.forEach((t) => {
      Array.prototype.push.apply(ops, t.operations);
    });

    if (options.coalesce !== false) {
      ops = coalesceRecordOperations(ops);
    }

    reducedTransform = buildTransform(ops, options.transformOptions);

    return this.update(reducedTransform);
  }

  /**
   * Rebase works similarly to a git rebase:
   *
   * After a source is forked, there is a parent- and a child-source. Both may be
   * updated with transforms. If, after some updates on both sources
   * `childSource.rebase()` is called, the result on the child source will look
   * like, as if all updates to the parent source were added first, followed by
   * those made in the child source. This means that updates in the child source
   * have a tendency of winning.
   */
  rebase(): void {
    let base = this._base;
    let forkPoint = this._forkPoint;

    if (!base) {
      throw new Assertion(
        'A `base` source must be defined for `rebase` to work'
      );
    }

    let baseTransforms: RecordTransform[];
    if (forkPoint === undefined) {
      // source was empty at fork point
      baseTransforms = base.allTransforms();
    } else {
      baseTransforms = base.transformsSince(forkPoint);
    }

    if (baseTransforms.length > 0) {
      let localTransforms = this.allTransforms();

      localTransforms.reverse().forEach((transform) => {
        const inverseOperations = this._transformInverses[transform.id];
        if (inverseOperations) {
          this.cache.patch(inverseOperations);
        }
        this._clearTransformFromHistory(transform.id);
      });

      baseTransforms.forEach((transform) => this._applyTransform(transform));
      localTransforms.forEach((transform) => this._applyTransform(transform));
      this._forkPoint = base.transformLog.head;
    }
  }

  /**
   * Rolls back the source to a particular `transformId`.
   *
   * `relativePosition` can be a positive or negative integer used to specify a
   * position relative to `transformId`.
   */
  rollback(transformId: string, relativePosition = 0): Promise<void> {
    return this.transformLog.rollback(transformId, relativePosition);
  }

  /**
   * Returns all transforms since a particular `transformId`.
   */
  transformsSince(transformId: string): RecordTransform[] {
    return this.transformLog
      .after(transformId)
      .map((id) => this._transforms[id]);
  }

  /**
   * Returns all tracked transforms.
   */
  allTransforms(): RecordTransform[] {
    return this.transformLog.entries.map((id) => this._transforms[id]);
  }

  getTransform(transformId: string): RecordTransform {
    return this._transforms[transformId];
  }

  getInverseOperations(transformId: string): RecordOperation[] {
    return this._transformInverses[transformId];
  }

  /////////////////////////////////////////////////////////////////////////////
  // Protected methods
  /////////////////////////////////////////////////////////////////////////////

  protected _retrieveFromCache(
    idOrIds: RecordIdentity[] | RecordIdentity | null
  ): RecordQueryExpressionResult {
    if (Array.isArray(idOrIds)) {
      return this._cache.getRecordsSync(idOrIds);
    } else if (idOrIds) {
      return this._cache.getRecordSync(idOrIds);
    } else {
      return idOrIds;
    }
  }

  protected _applyTransform(transform: RecordTransform): RecordTransformResult {
    const { data, details } = this.cache.update(transform, {
      fullResponse: true
    });
    this._transforms[transform.id] = transform;
    this._transformInverses[transform.id] = details?.inverseOperations || [];
    return data;
  }

  protected _clearTransformFromHistory(transformId: string): void {
    delete this._transforms[transformId];
    delete this._transformInverses[transformId];
  }

  protected _logCleared(): void {
    this._transforms = {};
    this._transformInverses = {};
  }

  protected _logTruncated(
    transformId: string,
    relativePosition: number,
    removed: string[]
  ): void {
    removed.forEach((id) => this._clearTransformFromHistory(id));
  }

  protected _logRolledback(
    transformId: string,
    relativePosition: number,
    removed: string[]
  ): void {
    removed.reverse().forEach((id) => {
      const inverseOperations = this._transformInverses[id];
      if (inverseOperations) {
        this.cache.patch(inverseOperations);
      }
      this._clearTransformFromHistory(id);
    });
  }
}
