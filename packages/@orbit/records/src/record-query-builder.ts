import { QueryBuilderFunc } from '@orbit/data';
import { RecordIdentity } from './record';
import { RecordQueryExpression } from './record-query-expression';
import {
  FindRecordTerm,
  FindRecordsTerm,
  FindRelatedRecordTerm,
  FindRelatedRecordsTerm
} from './record-query-term';

export type RecordQueryBuilderFunc = QueryBuilderFunc<
  RecordQueryExpression,
  RecordQueryBuilder
>;

export class RecordQueryBuilder {
  /**
   * Find a record by its identity.
   */
  findRecord(record: RecordIdentity): FindRecordTerm {
    return new FindRecordTerm(record);
  }

  /**
   * Find all records of a specific type.
   *
   * If `type` is unspecified, find all records unfiltered by type.
   */
  findRecords(typeOrIdentities?: string | RecordIdentity[]): FindRecordsTerm {
    return new FindRecordsTerm(typeOrIdentities);
  }

  /**
   * Find a record in a to-one relationship.
   */
  findRelatedRecord(
    record: RecordIdentity,
    relationship: string
  ): FindRelatedRecordTerm {
    return new FindRelatedRecordTerm(record, relationship);
  }

  /**
   * Find records in a to-many relationship.
   */
  findRelatedRecords(
    record: RecordIdentity,
    relationship: string
  ): FindRelatedRecordsTerm {
    return new FindRelatedRecordsTerm(record, relationship);
  }
}
