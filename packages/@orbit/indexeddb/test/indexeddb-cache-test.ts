import { getRecordFromIndexedDB } from './support/indexeddb';
import { Record, RecordSchema, RecordKeyMap } from '@orbit/records';
import { IndexedDBCache } from '../src/indexeddb-cache';

const { module, test } = QUnit;

module('IndexedDBCache', function (hooks) {
  let schema: RecordSchema, cache: IndexedDBCache, keyMap: RecordKeyMap;

  hooks.beforeEach(async () => {
    schema = new RecordSchema({
      models: {
        planet: {
          keys: { remoteId: {} },
          attributes: {
            name: { type: 'string' },
            classification: { type: 'string' },
            revised: { type: 'boolean' }
          },
          relationships: {
            moons: { kind: 'hasMany', type: 'moon', inverse: 'planet' },
            solarSystem: {
              kind: 'hasOne',
              type: 'solarSystem',
              inverse: 'planets'
            }
          }
        },
        moon: {
          keys: { remoteId: {} },
          attributes: {
            name: { type: 'string' }
          },
          relationships: {
            planet: { kind: 'hasOne', type: 'planet', inverse: 'moons' }
          }
        },
        solarSystem: {
          keys: { remoteId: {} },
          attributes: {
            name: { type: 'string' }
          },
          relationships: {
            planets: {
              kind: 'hasMany',
              type: 'planet',
              inverse: 'solarSystem'
            }
          }
        }
      }
    });

    keyMap = new RecordKeyMap();

    cache = new IndexedDBCache({ schema, keyMap });
    await cache.openDB();
  });

  hooks.afterEach(() => {
    return cache.deleteDB();
  });

  test('it exists', function (assert) {
    assert.ok(cache);
    assert.strictEqual(cache.schema, schema, 'schema has been assigned');
    assert.strictEqual(cache.keyMap, keyMap, 'keyMap has been assigned');
  });

  test('is assigned a default dbName', function (assert) {
    assert.equal(cache.dbName, 'orbit', '`dbName` is `orbit` by default');
  });

  test('sets/gets records individually', async function (assert) {
    const jupiter = {
      type: 'planet',
      id: 'jupiter',
      attributes: { name: 'Jupiter' }
    };
    const io = { type: 'moon', id: 'io', attributes: { name: 'Io' } };
    const europa = {
      type: 'moon',
      id: 'europa',
      attributes: { name: 'Europa' }
    };

    await cache.setRecordAsync(jupiter);
    await cache.setRecordAsync(io);
    await cache.setRecordAsync(europa);

    assert.deepEqual(await cache.getRecordAsync(jupiter), jupiter);
    assert.deepEqual(await cache.getRecordAsync(io), io);
    assert.deepEqual(await cache.getRecordAsync(europa), europa);

    await cache.removeRecordAsync(jupiter);
    await cache.removeRecordAsync(io);
    await cache.removeRecordAsync(europa);

    assert.deepEqual(await cache.getRecordAsync(jupiter), undefined);
    assert.deepEqual(await cache.getRecordAsync(io), undefined);
    assert.deepEqual(await cache.getRecordAsync(europa), undefined);
  });

  test('sets/gets records in bulk', async function (assert) {
    const jupiter = {
      type: 'planet',
      id: 'jupiter',
      attributes: { name: 'Jupiter' }
    };
    const io = { type: 'moon', id: 'io', attributes: { name: 'Io' } };
    const europa = {
      type: 'moon',
      id: 'europa',
      attributes: { name: 'Europa' }
    };

    await cache.setRecordsAsync([jupiter, io, europa]);

    assert.deepEqual(await cache.getRecordsAsync([jupiter, io, europa]), [
      jupiter,
      io,
      europa
    ]);

    await cache.removeRecordsAsync([jupiter, io, europa]);

    assert.deepEqual(await cache.getRecordsAsync([jupiter, io, europa]), []);
  });

  test('sets/gets inverse relationships', async function (assert) {
    const jupiter = { type: 'planet', id: 'jupiter' };
    const io = { type: 'moon', id: 'io' };
    const europa = { type: 'moon', id: 'europa' };
    const callisto = { type: 'moon', id: 'callisto' };

    assert.deepEqual(
      await cache.getInverseRelationshipsAsync(jupiter),
      [],
      'no inverse relationships to start'
    );

    await cache.addInverseRelationshipsAsync([
      { record: jupiter, relationship: 'moons', relatedRecord: io },
      { record: jupiter, relationship: 'moons', relatedRecord: europa },
      { record: jupiter, relationship: 'moons', relatedRecord: callisto }
    ]);

    assert.deepEqual(
      await cache.getInverseRelationshipsAsync(jupiter),
      [
        { record: jupiter, relationship: 'moons', relatedRecord: callisto },
        { record: jupiter, relationship: 'moons', relatedRecord: europa },
        { record: jupiter, relationship: 'moons', relatedRecord: io }
      ],
      'inverse relationships have been added'
    );

    await cache.removeInverseRelationshipsAsync([
      { record: jupiter, relationship: 'moons', relatedRecord: io },
      { record: jupiter, relationship: 'moons', relatedRecord: europa },
      { record: jupiter, relationship: 'moons', relatedRecord: callisto }
    ]);

    assert.deepEqual(
      await cache.getInverseRelationshipsAsync(jupiter),
      [],
      'inverse relationships have been removed'
    );
  });

  test('#update - addRecord', async function (assert) {
    assert.expect(2);

    let planet: Record = {
      type: 'planet',
      id: 'jupiter',
      keys: {
        remoteId: 'j'
      },
      attributes: {
        name: 'Jupiter',
        classification: 'gas giant'
      }
    };

    await cache.update((t) => t.addRecord(planet));

    assert.deepEqual(
      await getRecordFromIndexedDB(cache, planet),
      planet,
      'indexeddb contains record'
    );

    assert.equal(
      keyMap.keyToId('planet', 'remoteId', 'j'),
      'jupiter',
      'key has been mapped'
    );
  });

  test('#update - updateRecord', async function (assert) {
    assert.expect(2);

    let original: Record = {
      type: 'planet',
      id: 'jupiter',
      keys: {
        remoteId: 'j'
      },
      attributes: {
        name: 'Jupiter'
      },
      relationships: {
        moons: {
          data: [{ type: 'moon', id: 'moon1' }]
        }
      }
    };

    let updates: Record = {
      type: 'planet',
      id: 'jupiter',
      attributes: {
        classification: 'gas giant'
      },
      relationships: {
        solarSystem: {
          data: { type: 'solarSystem', id: 'ss1' }
        }
      }
    };

    let expected: Record = {
      type: 'planet',
      id: 'jupiter',
      keys: {
        remoteId: 'j'
      },
      attributes: {
        name: 'Jupiter',
        classification: 'gas giant'
      },
      relationships: {
        moons: {
          data: [{ type: 'moon', id: 'moon1' }]
        },
        solarSystem: {
          data: { type: 'solarSystem', id: 'ss1' }
        }
      }
    };

    await cache.update((t) => t.addRecord(original));
    await cache.update((t) => t.updateRecord(updates));
    assert.deepEqual(
      await getRecordFromIndexedDB(cache, expected),
      expected,
      'indexeddb contains record'
    );
    assert.equal(
      keyMap.keyToId('planet', 'remoteId', 'j'),
      'jupiter',
      'key has been mapped'
    );
  });

  test('#update - updateRecord - when record does not exist', async function (assert) {
    assert.expect(1);

    let revised = {
      type: 'planet',
      id: 'jupiter',
      attributes: {
        name: 'Jupiter',
        classification: 'gas giant',
        revised: true
      }
    };

    await cache.update((t) => t.updateRecord(revised));
    assert.deepEqual(
      await getRecordFromIndexedDB(cache, revised),
      revised,
      'indexeddb contains record'
    );
  });

  test('#update - removeRecord', async function (assert) {
    assert.expect(1);

    let planet: Record = {
      type: 'planet',
      id: 'jupiter',
      attributes: {
        name: 'Jupiter',
        classification: 'gas giant'
      }
    };

    await cache.update((t) => t.addRecord(planet));
    await cache.update((t) => t.removeRecord(planet));
    assert.equal(
      await getRecordFromIndexedDB(cache, planet),
      null,
      'indexeddb does not contain record'
    );
  });

  test('#update - removeRecord - when record does not exist', async function (assert) {
    assert.expect(1);

    let planet = {
      type: 'planet',
      id: 'jupiter'
    };

    await cache.update((t) => t.removeRecord(planet));
    assert.equal(
      await getRecordFromIndexedDB(cache, planet),
      null,
      'indexeddb does not contain record'
    );
  });

  test('#update - replaceKey', async function (assert) {
    assert.expect(2);

    let original: Record = {
      type: 'planet',
      id: 'jupiter',
      attributes: {
        name: 'Jupiter',
        classification: 'gas giant'
      }
    };

    let revised: Record = {
      type: 'planet',
      id: 'jupiter',
      attributes: {
        name: 'Jupiter',
        classification: 'gas giant'
      },
      keys: {
        remoteId: '123'
      }
    };

    await cache.update((t) => t.addRecord(original));
    await cache.update((t) => t.replaceKey(original, 'remoteId', '123'));
    assert.deepEqual(
      await getRecordFromIndexedDB(cache, revised),
      revised,
      'indexeddb contains record'
    );

    assert.equal(
      keyMap.keyToId('planet', 'remoteId', '123'),
      'jupiter',
      'key has been mapped'
    );
  });

  test('#update - replaceKey - when base record does not exist', async function (assert) {
    assert.expect(2);

    let revised: Record = {
      type: 'planet',
      id: 'jupiter',
      keys: {
        remoteId: '123'
      }
    };

    await cache.update((t) =>
      t.replaceKey({ type: 'planet', id: 'jupiter' }, 'remoteId', '123')
    );
    assert.deepEqual(
      await getRecordFromIndexedDB(cache, revised),
      revised,
      'indexeddb contains record'
    );

    assert.equal(
      keyMap.keyToId('planet', 'remoteId', '123'),
      'jupiter',
      'key has been mapped'
    );
  });

  test('#update - replaceAttribute', async function (assert) {
    assert.expect(1);

    let original: Record = {
      type: 'planet',
      id: 'jupiter',
      attributes: {
        name: 'Jupiter',
        classification: 'gas giant'
      }
    };

    let revised: Record = {
      type: 'planet',
      id: 'jupiter',
      attributes: {
        name: 'Jupiter',
        classification: 'gas giant',
        order: 5
      }
    };

    await cache.update((t) => t.addRecord(original));
    await cache.update((t) => t.replaceAttribute(original, 'order', 5));
    assert.deepEqual(
      await getRecordFromIndexedDB(cache, revised),
      revised,
      'indexeddb contains record'
    );
  });

  test('#update - replaceAttribute - when base record does not exist', async function (assert) {
    assert.expect(1);

    let revised: Record = {
      type: 'planet',
      id: 'jupiter',
      attributes: {
        order: 5
      }
    };

    await cache.update((t) =>
      t.replaceAttribute({ type: 'planet', id: 'jupiter' }, 'order', 5)
    );
    assert.deepEqual(
      await getRecordFromIndexedDB(cache, revised),
      revised,
      'indexeddb contains record'
    );
  });

  test('#update - addToRelatedRecords', async function (assert) {
    assert.expect(1);

    let original: Record = {
      type: 'planet',
      id: 'jupiter',
      attributes: {
        name: 'Jupiter',
        classification: 'gas giant'
      },
      relationships: {
        moons: {
          data: []
        }
      }
    };

    let revised: Record = {
      type: 'planet',
      id: 'jupiter',
      attributes: {
        name: 'Jupiter',
        classification: 'gas giant'
      },
      relationships: {
        moons: {
          data: [{ type: 'moon', id: 'moon1' }]
        }
      }
    };

    await cache.update((t) => t.addRecord(original));
    await cache.update((t) =>
      t.addToRelatedRecords(original, 'moons', { type: 'moon', id: 'moon1' })
    );
    assert.deepEqual(
      await getRecordFromIndexedDB(cache, revised),
      revised,
      'indexeddb contains record'
    );
  });

  test('#update - addToRelatedRecords - when base record does not exist', async function (assert) {
    assert.expect(1);

    let revised: Record = {
      type: 'planet',
      id: 'jupiter',
      relationships: {
        moons: {
          data: [{ type: 'moon', id: 'moon1' }]
        }
      }
    };

    await cache.update((t) =>
      t.addToRelatedRecords({ type: 'planet', id: 'jupiter' }, 'moons', {
        type: 'moon',
        id: 'moon1'
      })
    );
    assert.deepEqual(
      await getRecordFromIndexedDB(cache, revised),
      revised,
      'indexeddb contains record'
    );
  });

  test('#update - removeFromRelatedRecords', async function (assert) {
    assert.expect(1);

    let original: Record = {
      type: 'planet',
      id: 'jupiter',
      attributes: {
        name: 'Jupiter',
        classification: 'gas giant'
      },
      relationships: {
        moons: {
          data: [
            { type: 'moon', id: 'moon1' },
            { type: 'moon', id: 'moon2' }
          ]
        }
      }
    };

    let revised: Record = {
      type: 'planet',
      id: 'jupiter',
      attributes: {
        name: 'Jupiter',
        classification: 'gas giant'
      },
      relationships: {
        moons: {
          data: [{ type: 'moon', id: 'moon1' }]
        }
      }
    };

    await cache.update((t) => t.addRecord(original));
    await cache.update((t) =>
      t.removeFromRelatedRecords(original, 'moons', {
        type: 'moon',
        id: 'moon2'
      })
    );
    assert.deepEqual(
      await getRecordFromIndexedDB(cache, revised),
      revised,
      'indexeddb contains record'
    );
  });

  test('#update - removeFromRelatedRecords - when base record does not exist', async function (assert) {
    assert.expect(1);

    let revised: Record = {
      type: 'planet',
      id: 'jupiter',
      relationships: {
        moons: {
          data: []
        }
      }
    };

    await cache.update((t) =>
      t.removeFromRelatedRecords({ type: 'planet', id: 'jupiter' }, 'moons', {
        type: 'moon',
        id: 'moon2'
      })
    );
    assert.equal(
      await getRecordFromIndexedDB(cache, revised),
      null,
      'indexeddb does not contain record'
    );
  });

  test('#update - replaceRelatedRecords', async function (assert) {
    assert.expect(1);

    let original: Record = {
      type: 'planet',
      id: 'jupiter',
      attributes: {
        name: 'Jupiter',
        classification: 'gas giant'
      },
      relationships: {
        moons: {
          data: [{ type: 'moon', id: 'moon1' }]
        }
      }
    };

    let revised: Record = {
      type: 'planet',
      id: 'jupiter',
      attributes: {
        name: 'Jupiter',
        classification: 'gas giant'
      },
      relationships: {
        moons: {
          data: [
            { type: 'moon', id: 'moon2' },
            { type: 'moon', id: 'moon3' }
          ]
        }
      }
    };

    await cache.update((t) => t.addRecord(original));
    await cache.update((t) =>
      t.replaceRelatedRecords(original, 'moons', [
        { type: 'moon', id: 'moon2' },
        { type: 'moon', id: 'moon3' }
      ])
    );
    assert.deepEqual(
      await getRecordFromIndexedDB(cache, revised),
      revised,
      'indexeddb contains record'
    );
  });

  test('#update - replaceRelatedRecords - when base record does not exist', async function (assert) {
    assert.expect(1);

    let revised: Record = {
      type: 'planet',
      id: 'jupiter',
      relationships: {
        moons: {
          data: [
            { type: 'moon', id: 'moon2' },
            { type: 'moon', id: 'moon3' }
          ]
        }
      }
    };

    await cache.update((t) =>
      t.replaceRelatedRecords({ type: 'planet', id: 'jupiter' }, 'moons', [
        { type: 'moon', id: 'moon2' },
        { type: 'moon', id: 'moon3' }
      ])
    );
    assert.deepEqual(
      await getRecordFromIndexedDB(cache, revised),
      revised,
      'indexeddb contains record'
    );
  });

  test('#update - replaceRelatedRecord - with record', async function (assert) {
    assert.expect(1);

    let original: Record = {
      type: 'planet',
      id: 'jupiter',
      attributes: {
        name: 'Jupiter',
        classification: 'gas giant'
      },
      relationships: {
        solarSystem: {
          data: null
        }
      }
    };

    let revised: Record = {
      type: 'planet',
      id: 'jupiter',
      attributes: {
        name: 'Jupiter',
        classification: 'gas giant'
      },
      relationships: {
        solarSystem: {
          data: { type: 'solarSystem', id: 'ss1' }
        }
      }
    };

    await cache.update((t) => t.addRecord(original));
    await cache.update((t) =>
      t.replaceRelatedRecord(original, 'solarSystem', {
        type: 'solarSystem',
        id: 'ss1'
      })
    );
    assert.deepEqual(
      await getRecordFromIndexedDB(cache, revised),
      revised,
      'indexeddb contains record'
    );
  });

  test('#update - replaceRelatedRecord - with record - when base record does not exist', async function (assert) {
    assert.expect(1);

    let revised: Record = {
      type: 'planet',
      id: 'jupiter',
      relationships: {
        solarSystem: {
          data: { type: 'solarSystem', id: 'ss1' }
        }
      }
    };

    await cache.update((t) =>
      t.replaceRelatedRecord({ type: 'planet', id: 'jupiter' }, 'solarSystem', {
        type: 'solarSystem',
        id: 'ss1'
      })
    );
    assert.deepEqual(
      await getRecordFromIndexedDB(cache, revised),
      revised,
      'indexeddb contains record'
    );
  });

  test('#update - replaceRelatedRecord - with null', async function (assert) {
    assert.expect(1);

    let original: Record = {
      type: 'planet',
      id: 'jupiter',
      attributes: {
        name: 'Jupiter',
        classification: 'gas giant'
      },
      relationships: {
        solarSystem: {
          data: { type: 'solarSystem', id: 'ss1' }
        }
      }
    };

    let revised: Record = {
      type: 'planet',
      id: 'jupiter',
      attributes: {
        name: 'Jupiter',
        classification: 'gas giant'
      },
      relationships: {
        solarSystem: {
          data: null
        }
      }
    };

    await cache.update((t) => t.addRecord(original));
    await cache.update((t) =>
      t.replaceRelatedRecord(original, 'solarSystem', null)
    );
    assert.deepEqual(
      await getRecordFromIndexedDB(cache, revised),
      revised,
      'indexeddb contains record'
    );
  });

  test('#update - replaceRelatedRecord - with null - when base record does not exist', async function (assert) {
    assert.expect(1);

    let revised: Record = {
      type: 'planet',
      id: 'jupiter',
      relationships: {
        solarSystem: {
          data: null
        }
      }
    };

    await cache.update((t) =>
      t.replaceRelatedRecord(
        { type: 'planet', id: 'jupiter' },
        'solarSystem',
        null
      )
    );
    assert.deepEqual(
      await getRecordFromIndexedDB(cache, revised),
      revised,
      'indexeddb contains record'
    );
  });

  test('#query - all records', async function (assert) {
    assert.expect(4);

    let earth: Record = {
      type: 'planet',
      id: 'earth',
      keys: {
        remoteId: 'p1'
      },
      attributes: {
        name: 'Earth',
        classification: 'terrestrial'
      }
    };

    let jupiter: Record = {
      type: 'planet',
      id: 'jupiter',
      keys: {
        remoteId: 'p2'
      },
      attributes: {
        name: 'Jupiter',
        classification: 'gas giant'
      }
    };

    let io: Record = {
      type: 'moon',
      id: 'io',
      keys: {
        remoteId: 'm1'
      },
      attributes: {
        name: 'Io'
      }
    };

    await cache.update((t) => [
      t.addRecord(earth),
      t.addRecord(jupiter),
      t.addRecord(io)
    ]);

    // reset keyMap to verify that querying records also adds keys
    keyMap.reset();

    let records = await cache.query((q) => q.findRecords());
    assert.deepEqual(
      records,
      [io, earth, jupiter],
      'query results are expected'
    );

    assert.equal(
      keyMap.keyToId('planet', 'remoteId', 'p1'),
      'earth',
      'key has been mapped'
    );
    assert.equal(
      keyMap.keyToId('planet', 'remoteId', 'p2'),
      'jupiter',
      'key has been mapped'
    );
    assert.equal(
      keyMap.keyToId('moon', 'remoteId', 'm1'),
      'io',
      'key has been mapped'
    );
  });

  test('#query - records of one type', async function (assert) {
    assert.expect(1);

    let earth: Record = {
      type: 'planet',
      id: 'earth',
      attributes: {
        name: 'Earth',
        classification: 'terrestrial'
      }
    };

    let jupiter: Record = {
      type: 'planet',
      id: 'jupiter',
      attributes: {
        name: 'Jupiter',
        classification: 'gas giant'
      }
    };

    let io: Record = {
      type: 'moon',
      id: 'io',
      attributes: {
        name: 'Io'
      }
    };

    await cache.update((t) => [
      t.addRecord(earth),
      t.addRecord(jupiter),
      t.addRecord(io)
    ]);

    let records = await cache.query((q) => q.findRecords('planet'));
    assert.deepEqual(records, [earth, jupiter], 'query results are expected');
  });

  test('#query - records by identity', async function (assert) {
    assert.expect(1);

    let earth: Record = {
      type: 'planet',
      id: 'earth',
      attributes: {
        name: 'Earth',
        classification: 'terrestrial'
      }
    };

    let jupiter: Record = {
      type: 'planet',
      id: 'jupiter',
      attributes: {
        name: 'Jupiter',
        classification: 'gas giant'
      }
    };

    let io: Record = {
      type: 'moon',
      id: 'io',
      attributes: {
        name: 'Io'
      }
    };

    await cache.update((t) => [
      t.addRecord(earth),
      t.addRecord(jupiter),
      t.addRecord(io)
    ]);

    let records = await cache.query((q) =>
      q.findRecords([earth, io, { type: 'planet', id: 'FAKE' }])
    );
    assert.deepEqual(records, [earth, io], 'only matches are returned');
  });

  test('#query - a specific record', async function (assert) {
    assert.expect(2);

    let earth: Record = {
      type: 'planet',
      id: 'earth',
      attributes: {
        name: 'Earth',
        classification: 'terrestrial'
      }
    };

    let jupiter: Record = {
      type: 'planet',
      id: 'jupiter',
      keys: {
        remoteId: 'p2'
      },
      attributes: {
        name: 'Jupiter',
        classification: 'gas giant'
      }
    };

    let io: Record = {
      type: 'moon',
      id: 'io',
      attributes: {
        name: 'Io'
      }
    };

    await cache.update((t) => [
      t.addRecord(earth),
      t.addRecord(jupiter),
      t.addRecord(io)
    ]);

    // reset keyMap to verify that pulling records also adds keys
    keyMap.reset();

    let record = await cache.query((q) => q.findRecord(jupiter));

    assert.deepEqual(record, jupiter, 'query results are expected');

    assert.equal(
      keyMap.keyToId('planet', 'remoteId', 'p2'),
      'jupiter',
      'key has been mapped'
    );
  });
});
