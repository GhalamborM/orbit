import { ClientError, NetworkError, TransformNotAllowed } from '@orbit/data';
import {
  RecordKeyMap,
  Record,
  RecordOperation,
  ReplaceKeyOperation,
  RecordSchema,
  RecordTransform,
  AddRecordOperation,
  UpdateRecordOperation
} from '@orbit/records';
import * as sinon from 'sinon';
import { SinonStub } from 'sinon';
import { JSONAPIResourceSerializer } from '../src';
import { JSONAPISource } from '../src/jsonapi-source';
import { JSONAPISerializers } from '../src/serializers/jsonapi-serializers';
import { jsonapiResponse } from './support/jsonapi';
import {
  createSchemaWithoutKeys,
  createSchemaWithRemoteKey
} from './support/setup';

const { module, test } = QUnit;

module('JSONAPISource - updatable', function (hooks) {
  let fetchStub: SinonStub;
  let keyMap: RecordKeyMap;
  let schema: RecordSchema;
  let source: JSONAPISource;
  let resourceSerializer: JSONAPIResourceSerializer;

  hooks.beforeEach(() => {
    fetchStub = sinon.stub(self, 'fetch');
  });

  hooks.afterEach(() => {
    fetchStub.restore();
  });

  module('with a secondary key', function (hooks) {
    hooks.beforeEach(() => {
      schema = createSchemaWithRemoteKey();
      keyMap = new RecordKeyMap();
      source = new JSONAPISource({
        schema,
        keyMap
      });
      resourceSerializer = source.requestProcessor.serializerFor(
        JSONAPISerializers.Resource
      ) as JSONAPIResourceSerializer;
    });

    test('#update - can add records', async function (assert) {
      assert.expect(7);

      let transformCount = 0;

      const planet: Record = resourceSerializer.deserialize({
        type: 'planet',
        attributes: { name: 'Jupiter', classification: 'gas giant' }
      });

      const addPlanetOp: AddRecordOperation = {
        op: 'addRecord',
        record: {
          type: 'planet',
          id: planet.id,
          attributes: {
            name: 'Jupiter',
            classification: 'gas giant'
          }
        }
      };

      const addPlanetRemoteIdOp: ReplaceKeyOperation = {
        op: 'replaceKey',
        record: { type: 'planet', id: planet.id },
        key: 'remoteId',
        value: '12345'
      };

      source.on('transform', function (transform: RecordTransform) {
        transformCount++;

        if (transformCount === 1) {
          assert.deepEqual(
            transform.operations,
            [addPlanetOp],
            'transform event initially returns add-record op'
          );
        } else if (transformCount === 2) {
          // Remote ID is added as a separate operation
          assert.deepEqual(
            transform.operations,
            [addPlanetRemoteIdOp],
            'transform event then returns add-remote-id op'
          );
        }
      });

      fetchStub.withArgs('/planets').returns(
        jsonapiResponse(201, {
          data: {
            id: '12345',
            type: 'planet',
            attributes: { name: 'Jupiter', classification: 'gas giant' }
          }
        })
      );

      await source.update((t) => t.addRecord(planet));

      assert.ok(true, 'transform resolves successfully');

      assert.equal(fetchStub.callCount, 1, 'fetch called once');
      assert.equal(
        fetchStub.getCall(0).args[1].method,
        'POST',
        'fetch called with expected method'
      );
      assert.equal(
        fetchStub.getCall(0).args[1].headers['Content-Type'],
        'application/vnd.api+json',
        'fetch called with expected content type'
      );
      assert.deepEqual(
        JSON.parse(fetchStub.getCall(0).args[1].body),
        {
          data: {
            type: 'planet',
            attributes: {
              name: 'Jupiter',
              classification: 'gas giant'
            }
          }
        },
        'fetch called with expected data'
      );
    });

    test('#update - can add sideloaded records', async function (assert) {
      assert.expect(8);

      let transformCount = 0;

      const planet: Record = resourceSerializer.deserialize({
        type: 'planet',
        attributes: { name: 'Jupiter', classification: 'gas giant' }
      });

      const addPlanetOp: AddRecordOperation = {
        op: 'addRecord',
        record: {
          type: 'planet',
          id: planet.id,
          attributes: {
            name: 'Jupiter',
            classification: 'gas giant'
          }
        }
      };

      const addPlanetRemoteIdOp: ReplaceKeyOperation = {
        op: 'replaceKey',
        record: { type: 'planet', id: planet.id },
        key: 'remoteId',
        value: '12345'
      };

      let addMoonOp = {
        op: 'updateRecord',
        record: {
          type: 'moon',
          keys: {
            remoteId: '321'
          },
          attributes: {
            name: 'Europa'
          }
        }
      };

      source.on('transform', (transform: RecordTransform) => {
        transformCount++;

        if (transformCount === 1) {
          assert.deepEqual(
            transform.operations,
            [addPlanetOp],
            'transform event initially returns add-record op'
          );
        } else if (transformCount === 2) {
          // Remote ID is added as a separate operation
          assert.deepEqual(
            transform.operations,
            [addPlanetRemoteIdOp],
            'transform event then returns add-remote-id op'
          );
        } else if (transformCount === 3) {
          let operationsWithoutId = transform.operations.map((op) => {
            let clonedOp = Object.assign({}, op) as RecordOperation;
            delete (clonedOp as any).record.id;
            return clonedOp;
          });
          assert.deepEqual(
            operationsWithoutId,
            [addMoonOp as any],
            'transform event to add included records'
          );
        }
      });

      fetchStub.withArgs('/planets').returns(
        jsonapiResponse(201, {
          data: {
            id: '12345',
            type: 'planet',
            attributes: { name: 'Jupiter', classification: 'gas giant' },
            relationships: { moons: [{ id: '321', type: 'moon' }] }
          },
          included: [
            {
              id: '321',
              type: 'moon',
              attributes: {
                name: 'Europa'
              }
            }
          ]
        })
      );

      await source.update((t) => t.addRecord(planet));

      assert.ok(true, 'transform resolves successfully');
      assert.equal(fetchStub.callCount, 1, 'fetch called once');
      assert.equal(
        fetchStub.getCall(0).args[1].method,
        'POST',
        'fetch called with expected method'
      );
      assert.equal(
        fetchStub.getCall(0).args[1].headers['Content-Type'],
        'application/vnd.api+json',
        'fetch called with expected content type'
      );
      assert.deepEqual(
        JSON.parse(fetchStub.getCall(0).args[1].body),
        {
          data: {
            type: 'planet',
            attributes: {
              name: 'Jupiter',
              classification: 'gas giant'
            }
          }
        },
        'fetch called with expected data'
      );
    });

    test('#update - can transform records', async function (assert) {
      assert.expect(6);

      let transformCount = 0;

      const planet: Record = resourceSerializer.deserialize({
        type: 'planet',
        id: '12345',
        attributes: {
          name: 'Jupiter',
          classification: 'gas giant'
        }
      });

      const replacePlanetOp: UpdateRecordOperation = {
        op: 'updateRecord',
        record: {
          type: 'planet',
          id: planet.id,
          attributes: {
            name: 'Jupiter',
            classification: 'gas giant'
          },
          keys: {
            remoteId: '12345'
          }
        }
      };

      source.on('transform', (transform: RecordTransform) => {
        transformCount++;

        if (transformCount === 1) {
          assert.deepEqual(
            transform.operations,
            [replacePlanetOp],
            'transform event initially returns replace-record op'
          );
        }
      });

      fetchStub.withArgs('/planets/12345').returns(
        jsonapiResponse(200, {
          data: {
            id: '12345',
            type: 'planet',
            attributes: { name: 'Jupiter', classification: 'gas giant' }
          }
        })
      );

      await source.update((t) => t.updateRecord(planet));

      assert.ok(true, 'transform resolves successfully');

      assert.equal(fetchStub.callCount, 1, 'fetch called once');
      assert.equal(
        fetchStub.getCall(0).args[1].method,
        'PATCH',
        'fetch called with expected method'
      );
      assert.equal(
        fetchStub.getCall(0).args[1].headers['Content-Type'],
        'application/vnd.api+json',
        'fetch called with expected content type'
      );
      assert.deepEqual(
        JSON.parse(fetchStub.getCall(0).args[1].body),
        {
          data: {
            type: 'planet',
            id: '12345',
            attributes: {
              name: 'Jupiter',
              classification: 'gas giant'
            }
          }
        },
        'fetch called with expected data'
      );
    });

    test('#update - can replace a single attribute', async function (assert) {
      assert.expect(5);

      const planet: Record = resourceSerializer.deserialize({
        type: 'planet',
        id: '12345',
        attributes: {
          name: 'Jupiter',
          classification: 'gas giant'
        }
      });

      fetchStub.withArgs('/planets/12345').returns(jsonapiResponse(204));

      await source.update((t) =>
        t.replaceAttribute(planet, 'classification', 'terrestrial')
      );

      assert.ok(true, 'record patched');

      assert.equal(fetchStub.callCount, 1, 'fetch called once');
      assert.equal(
        fetchStub.getCall(0).args[1].method,
        'PATCH',
        'fetch called with expected method'
      );
      assert.equal(
        fetchStub.getCall(0).args[1].headers['Content-Type'],
        'application/vnd.api+json',
        'fetch called with expected content type'
      );
      assert.deepEqual(
        JSON.parse(fetchStub.getCall(0).args[1].body),
        {
          data: {
            type: 'planet',
            id: '12345',
            attributes: {
              classification: 'terrestrial'
            }
          }
        },
        'fetch called with expected data'
      );
    });

    test('#update - can accept remote changes', async function (assert) {
      assert.expect(3);

      const planet: Record = resourceSerializer.deserialize({
        type: 'planet',
        id: '12345',
        attributes: {
          name: 'Jupiter',
          classification: 'gas giant'
        }
      });

      fetchStub.withArgs('/planets/12345').returns(
        jsonapiResponse(200, {
          data: {
            type: 'planet',
            id: 'remote-id-123',
            attributes: {
              name: 'Mars',
              classification: 'terrestrial'
            }
          }
        })
      );

      let transforms: RecordTransform[] = [];
      source.on('transform', (transform: RecordTransform) => {
        transforms.push(transform);
      });

      let data = await source.update((t) =>
        t.replaceAttribute(planet, 'classification', 'terrestrial')
      );

      assert.deepEqual(
        transforms[1].operations.map((o) => o.op),
        ['replaceAttribute', 'replaceKey']
      );
      assert.deepEqual(
        transforms[1].operations.map((o) => (o as ReplaceKeyOperation).value),
        ['Mars', 'remote-id-123']
      );
      assert.deepEqual(data, {
        type: 'planet',
        id: planet.id,
        keys: {
          remoteId: 'remote-id-123'
        },
        attributes: {
          name: 'Mars',
          classification: 'terrestrial'
        }
      });
    });

    test('#update - can delete records', async function (assert) {
      assert.expect(4);

      const planet: Record = resourceSerializer.deserialize({
        type: 'planet',
        id: '12345'
      });

      fetchStub.withArgs('/planets/12345').returns(jsonapiResponse(200));

      await source.update((t) => t.removeRecord(planet));

      assert.ok(true, 'record deleted');
      assert.equal(fetchStub.callCount, 1, 'fetch called once');
      assert.equal(
        fetchStub.getCall(0).args[1].method,
        'DELETE',
        'fetch called with expected method'
      );
      assert.equal(
        fetchStub.getCall(0).args[1].body,
        null,
        'fetch called with no data'
      );
    });

    test('#update - can add a hasMany relationship with POST', async function (assert) {
      assert.expect(5);

      const planet: Record = resourceSerializer.deserialize({
        type: 'planet',
        id: '12345'
      }) as Record;

      let moon = resourceSerializer.deserialize({
        type: 'moon',
        id: '987'
      }) as Record;

      fetchStub
        .withArgs('/planets/12345/relationships/moons')
        .returns(jsonapiResponse(204));

      await source.update((t) => t.addToRelatedRecords(planet, 'moons', moon));

      assert.ok(true, 'records linked');
      assert.equal(fetchStub.callCount, 1, 'fetch called once');
      assert.equal(
        fetchStub.getCall(0).args[1].method,
        'POST',
        'fetch called with expected method'
      );
      assert.equal(
        fetchStub.getCall(0).args[1].headers['Content-Type'],
        'application/vnd.api+json',
        'fetch called with expected content type'
      );
      assert.deepEqual(
        JSON.parse(fetchStub.getCall(0).args[1].body),
        { data: [{ type: 'moon', id: '987' }] },
        'fetch called with expected data'
      );
    });

    test('#update - can remove a relationship with DELETE', async function (assert) {
      assert.expect(4);

      const planet: Record = resourceSerializer.deserialize({
        type: 'planet',
        id: '12345'
      });

      const moon: Record = resourceSerializer.deserialize({
        type: 'moon',
        id: '987'
      });

      fetchStub
        .withArgs('/planets/12345/relationships/moons')
        .returns(jsonapiResponse(200));

      await source.update((t) =>
        t.removeFromRelatedRecords(planet, 'moons', moon)
      );

      assert.ok(true, 'records unlinked');
      assert.equal(fetchStub.callCount, 1, 'fetch called once');
      assert.equal(
        fetchStub.getCall(0).args[1].method,
        'DELETE',
        'fetch called with expected method'
      );
      assert.deepEqual(
        JSON.parse(fetchStub.getCall(0).args[1].body),
        { data: [{ type: 'moon', id: '987' }] },
        'fetch called with expected data'
      );
    });

    test('#update - can update a hasOne relationship with PATCH', async function (assert) {
      assert.expect(5);

      const planet: Record = resourceSerializer.deserialize({
        type: 'planet',
        id: '12345'
      });

      const moon: Record = resourceSerializer.deserialize({
        type: 'moon',
        id: '987'
      });

      fetchStub.withArgs('/moons/987').returns(jsonapiResponse(200));

      await source.update((t) =>
        t.replaceRelatedRecord(moon, 'planet', planet)
      );

      assert.ok(true, 'relationship replaced');

      assert.equal(fetchStub.callCount, 1, 'fetch called once');
      assert.equal(
        fetchStub.getCall(0).args[1].method,
        'PATCH',
        'fetch called with expected method'
      );
      assert.equal(
        fetchStub.getCall(0).args[1].headers['Content-Type'],
        'application/vnd.api+json',
        'fetch called with expected content type'
      );
      assert.deepEqual(
        JSON.parse(fetchStub.getCall(0).args[1].body),
        {
          data: {
            type: 'moon',
            id: '987',
            relationships: {
              planet: { data: { type: 'planet', id: '12345' } }
            }
          }
        },
        'fetch called with expected data'
      );
    });

    test('#update - can update a hasOne relationship with PATCH with newly created record', async function (assert) {
      assert.expect(5);

      let planet = {
        type: 'planet',
        id: 'jupiter',
        attributes: { name: 'Jupiter', classification: 'gas giant' }
      };

      let moon = resourceSerializer.deserialize({
        type: 'moon',
        id: '987'
      }) as Record;

      fetchStub.withArgs('/planets').returns(
        jsonapiResponse(201, {
          data: {
            id: 'planet-remote-id',
            type: 'planet',
            attributes: { name: 'Jupiter', classification: 'gas giant' }
          }
        })
      );

      fetchStub.withArgs('/moons/987').returns(jsonapiResponse(200));

      await source.update((t) => [
        t.addRecord(planet),
        t.replaceRelatedRecord(moon, 'planet', planet)
      ]);

      assert.ok(true, 'relationship replaced');

      assert.equal(fetchStub.callCount, 2, 'fetch called twice');
      assert.equal(
        fetchStub.getCall(1).args[1].method,
        'PATCH',
        'fetch called with expected method'
      );
      assert.equal(
        fetchStub.getCall(1).args[1].headers['Content-Type'],
        'application/vnd.api+json',
        'fetch called with expected content type'
      );
      assert.deepEqual(
        JSON.parse(fetchStub.getCall(1).args[1].body),
        {
          data: {
            type: 'moon',
            id: '987',
            relationships: {
              planet: { data: { type: 'planet', id: 'planet-remote-id' } }
            }
          }
        },
        'fetch called with expected data'
      );
    });

    test('#update - can clear a hasOne relationship with PATCH', async function (assert) {
      assert.expect(5);

      let moon = resourceSerializer.deserialize({
        type: 'moon',
        id: '987'
      }) as Record;

      fetchStub.withArgs('/moons/987').returns(jsonapiResponse(200));

      await source.update((t) => t.replaceRelatedRecord(moon, 'planet', null));

      assert.ok(true, 'relationship replaced');

      assert.equal(fetchStub.callCount, 1, 'fetch called once');
      assert.equal(
        fetchStub.getCall(0).args[1].method,
        'PATCH',
        'fetch called with expected method'
      );
      assert.equal(
        fetchStub.getCall(0).args[1].headers['Content-Type'],
        'application/vnd.api+json',
        'fetch called with expected content type'
      );
      assert.deepEqual(
        JSON.parse(fetchStub.getCall(0).args[1].body),
        {
          data: {
            type: 'moon',
            id: '987',
            relationships: { planet: { data: null } }
          }
        },
        'fetch called with expected data'
      );
    });

    test('#update - can replace a hasMany relationship with PATCH', async function (assert) {
      assert.expect(5);

      const planet: Record = resourceSerializer.deserialize({
        type: 'planet',
        id: '12345'
      }) as Record;

      let moon = resourceSerializer.deserialize({
        type: 'moon',
        id: '987'
      }) as Record;

      fetchStub.withArgs('/planets/12345').returns(jsonapiResponse(200));

      await source.update((t) =>
        t.replaceRelatedRecords(planet, 'moons', [moon])
      );

      assert.ok(true, 'relationship replaced');

      assert.equal(fetchStub.callCount, 1, 'fetch called once');
      assert.equal(
        fetchStub.getCall(0).args[1].method,
        'PATCH',
        'fetch called with expected method'
      );
      assert.equal(
        fetchStub.getCall(0).args[1].headers['Content-Type'],
        'application/vnd.api+json',
        'fetch called with expected content type'
      );
      assert.deepEqual(
        JSON.parse(fetchStub.getCall(0).args[1].body),
        {
          data: {
            type: 'planet',
            id: '12345',
            relationships: { moons: { data: [{ type: 'moon', id: '987' }] } }
          }
        },
        'fetch called with expected data'
      );
    });

    test('#update - a single transform can result in multiple requests', async function (assert) {
      assert.expect(6);

      let planet1 = resourceSerializer.deserialize({
        type: 'planet',
        id: '1'
      }) as Record;
      let planet2 = resourceSerializer.deserialize({
        type: 'planet',
        id: '2'
      }) as Record;

      fetchStub.withArgs('/planets/1').returns(jsonapiResponse(200));

      fetchStub.withArgs('/planets/2').returns(jsonapiResponse(200));

      await source.update((t) => [
        t.removeRecord(planet1),
        t.removeRecord(planet2)
      ]);

      assert.ok(true, 'records deleted');

      assert.equal(fetchStub.callCount, 2, 'fetch called twice');

      assert.equal(
        fetchStub.getCall(0).args[1].method,
        'DELETE',
        'fetch called with expected method'
      );
      assert.equal(
        fetchStub.getCall(0).args[1].body,
        null,
        'fetch called with no data'
      );

      assert.equal(
        fetchStub.getCall(1).args[1].method,
        'DELETE',
        'fetch called with expected method'
      );
      assert.equal(
        fetchStub.getCall(1).args[1].body,
        null,
        'fetch called with no data'
      );
    });

    test('#update - source can limit the number of allowed requests per transform with `maxRequestsPerTransform` (deprecated)', async function (assert) {
      assert.expect(1);

      let planet1 = resourceSerializer.deserialize({
        type: 'planet',
        id: '1'
      }) as Record;
      let planet2 = resourceSerializer.deserialize({
        type: 'planet',
        id: '2'
      }) as Record;

      source.maxRequestsPerTransform = 1;

      try {
        await source.update((t) => [
          t.removeRecord(planet1),
          t.removeRecord(planet2)
        ]);
      } catch (e) {
        assert.ok(
          e instanceof TransformNotAllowed,
          'TransformNotAllowed thrown'
        );
      }
    });

    test('#update - source can limit the number of allowed requests per transform with `maxRequests` option', async function (assert) {
      assert.expect(1);

      let planet1 = resourceSerializer.deserialize({
        type: 'planet',
        id: '1'
      }) as Record;
      let planet2 = resourceSerializer.deserialize({
        type: 'planet',
        id: '2'
      }) as Record;

      source.defaultTransformOptions = {
        maxRequests: 1
      };

      try {
        await source.update((t) => [
          t.removeRecord(planet1),
          t.removeRecord(planet2)
        ]);
      } catch (e) {
        assert.ok(
          e instanceof TransformNotAllowed,
          'TransformNotAllowed thrown'
        );
      }
    });

    test('#update - request can timeout', async function (assert) {
      assert.expect(2);

      const planet: Record = resourceSerializer.deserialize({
        type: 'planet',
        id: '12345',
        attributes: {
          name: 'Jupiter',
          classification: 'gas giant'
        }
      }) as Record;

      // 10ms timeout
      source.requestProcessor.defaultFetchSettings.timeout = 10;

      fetchStub
        .withArgs('/planets/12345')
        .returns(jsonapiResponse(200, null, 20)); // 20ms delay

      try {
        await source.update((t) =>
          t.replaceAttribute(planet, 'classification', 'terrestrial')
        );
        assert.ok(false, 'should not be reached');
      } catch (e) {
        assert.ok(e instanceof NetworkError, 'Network error raised');
        assert.equal(e.description, 'No fetch response within 10ms.');
      }
    });

    test('#update - allowed timeout can be specified per-request', async function (assert) {
      assert.expect(2);

      const planet: Record = resourceSerializer.deserialize({
        type: 'planet',
        id: '12345',
        attributes: {
          name: 'Jupiter',
          classification: 'gas giant'
        }
      }) as Record;

      const options = {
        sources: {
          jsonapi: {
            settings: {
              timeout: 10 // 10ms timeout
            }
          }
        }
      };

      fetchStub
        .withArgs('/planets/12345')
        .returns(jsonapiResponse(200, null, 20)); // 20ms delay

      try {
        await source.update(
          (t) => t.replaceAttribute(planet, 'classification', 'terrestrial'),
          options
        );
        assert.ok(false, 'should not be reached');
      } catch (e) {
        assert.ok(e instanceof NetworkError, 'Network error raised');
        assert.equal(e.description, 'No fetch response within 10ms.');
      }
    });

    test('#update - fetch can reject with a NetworkError', async function (assert) {
      assert.expect(2);

      const planet: Record = resourceSerializer.deserialize({
        type: 'planet',
        id: '12345',
        attributes: {
          name: 'Jupiter',
          classification: 'gas giant'
        }
      }) as Record;

      fetchStub.withArgs('/planets/12345').returns(Promise.reject(':('));

      try {
        await source.update((t) =>
          t.replaceAttribute(planet, 'classification', 'terrestrial')
        );
        assert.ok(false, 'should not be reached');
      } catch (e) {
        assert.ok(e instanceof NetworkError, 'Network error raised');
        assert.equal(e.description, ':(');
      }
    });

    test('#update - response can trigger a ClientError', async function (assert) {
      assert.expect(3);

      const planet: Record = resourceSerializer.deserialize({
        type: 'planet',
        id: '12345',
        attributes: {
          name: 'Jupiter',
          classification: 'gas giant'
        }
      }) as Record;

      let errors = [
        {
          status: '422',
          title: 'Invalid classification specified'
        }
      ];

      fetchStub
        .withArgs('/planets/12345')
        .returns(jsonapiResponse(422, { errors }));

      try {
        await source.update((t) =>
          t.replaceAttribute(planet, 'classification', 'terrestrial')
        );
        assert.ok(false, 'should not be reached');
      } catch (e) {
        assert.ok(e instanceof ClientError, 'Client error raised');
        assert.equal(e.description, 'Unprocessable Entity');
        assert.deepEqual(e.data, { errors }, 'Error data included');
      }
    });
  });

  module('with no secondary keys', function (hooks) {
    hooks.beforeEach(function () {
      let schema = createSchemaWithoutKeys();
      source = new JSONAPISource({ schema });
      resourceSerializer = source.requestProcessor.serializerFor(
        JSONAPISerializers.Resource
      ) as JSONAPIResourceSerializer;
    });

    test('#update - can add single record', async function (assert) {
      assert.expect(5);

      let planet = {
        type: 'planet',
        id: 'p1',
        attributes: { name: 'Jupiter' }
      } as Record;

      fetchStub.withArgs('/planets').returns(
        jsonapiResponse(201, {
          data: {
            type: 'planet',
            id: 'p1',
            attributes: { name: 'Jupiter' }
          }
        })
      );

      await source.update((t) => t.addRecord(planet));

      assert.ok(true, 'transform resolves successfully');

      assert.equal(fetchStub.callCount, 1, 'fetch called once');
      assert.equal(
        fetchStub.getCall(0).args[1].method,
        'POST',
        'fetch called with expected method'
      );
      assert.equal(
        fetchStub.getCall(0).args[1].headers['Content-Type'],
        'application/vnd.api+json',
        'fetch called with expected content type'
      );
      assert.deepEqual(
        JSON.parse(fetchStub.getCall(0).args[1].body),
        {
          data: {
            type: 'planet',
            id: 'p1',
            attributes: {
              name: 'Jupiter'
            }
          }
        },
        'fetch called with expected data'
      );
    });

    test('#update - can add multiple records in series', async function (assert) {
      assert.expect(10);

      const planet1: Record = {
        type: 'planet',
        id: 'p1',
        attributes: { name: 'Jupiter' }
      };

      const moon1: Record = {
        type: 'moon',
        id: 'm1',
        attributes: { name: 'Io' }
      };

      fetchStub.withArgs('/planets').returns(
        jsonapiResponse(201, {
          data: planet1
        })
      );
      fetchStub.withArgs('/moons').returns(
        jsonapiResponse(201, {
          data: moon1
        })
      );

      let [planet, moon] = (await source.update((t) => [
        t.addRecord(planet1),
        t.addRecord(moon1)
      ])) as Record[];

      assert.ok(true, 'transform resolves successfully');

      assert.deepEqual(planet, planet1, 'planet matches');
      assert.deepEqual(moon, moon1, 'moon matches');

      assert.equal(fetchStub.callCount, 2, 'fetch called twice');

      const firstFetchCall = fetchStub.getCall(0);
      assert.equal(
        firstFetchCall.args[1].method,
        'POST',
        'fetch called with expected method'
      );
      assert.equal(
        firstFetchCall.args[1].headers['Content-Type'],
        'application/vnd.api+json',
        'fetch called with expected content type'
      );
      assert.deepEqual(
        JSON.parse(firstFetchCall.args[1].body),
        {
          data: planet1
        },
        'fetch called with expected data'
      );

      const secondFetchCall = fetchStub.getCall(1);
      assert.equal(
        secondFetchCall.args[1].method,
        'POST',
        'fetch called with expected method'
      );
      assert.equal(
        secondFetchCall.args[1].headers['Content-Type'],
        'application/vnd.api+json',
        'fetch called with expected content type'
      );
      assert.deepEqual(
        JSON.parse(secondFetchCall.args[1].body),
        {
          data: moon1
        },
        'fetch called with expected data'
      );
    });
  });
});
