import Source from 'orbit/source';
import Transform from 'orbit/transform';

module('Orbit - Source', function(hooks) {
  let source;

  hooks.beforeEach(function() {
    source = new Source();
  });

  test('it exists', function(assert) {
    assert.ok(source);
    assert.ok(source.transformLog, 'has a transform log');
  });

  test('it should mixin Evented', function(assert) {
    ['on', 'off', 'emit'].forEach(function(prop) {
      assert.ok(source[prop], 'should have Evented properties');
    });
  });

  test('#_transformed should trigger `transform` event BEFORE resolving', function(assert) {
    assert.expect(3);

    let order = 0;
    const appliedTransform = Transform.from({ op: 'addRecord', value: {} });

    source.on('transform', (transform) => {
      assert.equal(++order, 1, '`transform` event triggered after action performed successfully');
      assert.strictEqual(transform, appliedTransform, 'applied transform matches');
    });

    return source._transformed([appliedTransform])
      .then(() => {
        assert.equal(++order, 2, '_transformed promise resolved last');
      });
  });

  test('#transformLog contains transforms applied', function(assert) {
    assert.expect(2);

    const appliedTransform = Transform.from({ op: 'addRecord', value: {} });

    assert.ok(!source.transformLog.contains(appliedTransform.id));

    return source
      ._transformed([appliedTransform])
      .then(() => assert.ok(source.transformLog.contains(appliedTransform.id)));
  });
});