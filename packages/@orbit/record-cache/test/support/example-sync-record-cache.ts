/* eslint-disable valid-jsdoc */
import { clone, deepGet, deepSet, Dict, objectValues } from '@orbit/utils';
import { Record, RecordIdentity, equalRecordIdentities } from '@orbit/records';
import { RecordRelationshipIdentity } from '../../src/record-accessor';
import {
  SyncRecordCache,
  SyncRecordCacheSettings
} from '../../src/sync-record-cache';

/**
 * A minimal implementation of `SyncRecordCache`.
 */
export class ExampleSyncRecordCache extends SyncRecordCache {
  protected _records: Dict<Dict<Record>>;
  protected _inverseRelationships: Dict<Dict<RecordRelationshipIdentity[]>>;

  constructor(settings: SyncRecordCacheSettings) {
    super(settings);

    this._records = {};
    this._inverseRelationships = {};

    Object.keys(this._schema.models).forEach((type) => {
      this._records[type] = {};
      this._inverseRelationships[type] = {};
    });
  }

  getRecordSync(identity: RecordIdentity): Record | undefined {
    return deepGet(this._records, [identity.type, identity.id]);
  }

  getRecordsSync(typeOrIdentities?: string | RecordIdentity[]): Record[] {
    if (typeof typeOrIdentities === 'string') {
      return objectValues(this._records[typeOrIdentities]);
    } else if (Array.isArray(typeOrIdentities)) {
      const records: Record[] = [];
      const identities: RecordIdentity[] = typeOrIdentities;
      for (let i of identities) {
        let record = this.getRecordSync(i);
        if (record) {
          records.push(record);
        }
      }
      return records;
    } else {
      throw new Error('typeOrIdentities must be specified in getRecordsSync');
    }
  }

  setRecordSync(record: Record): void {
    deepSet(this._records, [record.type, record.id], record);
  }

  setRecordsSync(records: Record[]): void {
    for (let record of records) {
      deepSet(this._records, [record.type, record.id], record);
    }
  }

  removeRecordSync(recordIdentity: RecordIdentity): Record | undefined {
    const record = this.getRecordSync(recordIdentity);
    if (record) {
      delete this._records[recordIdentity.type][recordIdentity.id];
      return record;
    } else {
      return undefined;
    }
  }

  removeRecordsSync(recordIdentities: RecordIdentity[]): Record[] {
    const records = [];
    for (let recordIdentity of recordIdentities) {
      let record = this.getRecordSync(recordIdentity);
      if (record) {
        records.push(record);
        delete this._records[recordIdentity.type][recordIdentity.id];
      }
    }
    return records;
  }

  getInverseRelationshipsSync(
    recordIdentity: RecordIdentity
  ): RecordRelationshipIdentity[] {
    return (
      deepGet(this._inverseRelationships, [
        recordIdentity.type,
        recordIdentity.id
      ]) || []
    );
  }

  addInverseRelationshipsSync(
    relationships: RecordRelationshipIdentity[]
  ): void {
    for (let relationship of relationships) {
      let rels: any = deepGet(this._inverseRelationships, [
        relationship.relatedRecord.type,
        relationship.relatedRecord.id
      ]);
      rels = rels ? clone(rels) : [];
      rels.push(relationship);
      deepSet(
        this._inverseRelationships,
        [relationship.relatedRecord.type, relationship.relatedRecord.id],
        rels
      );
    }
  }

  removeInverseRelationshipsSync(
    relationships: RecordRelationshipIdentity[]
  ): void {
    for (let relationship of relationships) {
      let rels: any = deepGet(this._inverseRelationships, [
        relationship.relatedRecord.type,
        relationship.relatedRecord.id
      ]);
      if (rels) {
        let newRels: any = rels.filter(
          (rel: any) =>
            !(
              equalRecordIdentities(rel.record, relationship.record) &&
              rel.relationship === relationship.relationship
            )
        );
        deepSet(
          this._inverseRelationships,
          [relationship.relatedRecord.type, relationship.relatedRecord.id],
          newRels
        );
      }
    }
  }
}
