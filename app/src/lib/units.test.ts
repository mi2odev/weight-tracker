/**
 * Unit display is "display only ... always store metric" (spec §1), so the
 * property that matters most is the round trip: whatever the user types must
 * come back out as the same number after a conversion each way.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { METRIC, formatterFor, kgToLb, lbToKg } from './units';

const imperial = formatterFor('imperial');

describe('conversions', () => {
  it('uses the international pound', () => {
    assert.equal(kgToLb(100).toFixed(4), '220.4623');
    assert.equal(lbToKg(220.4623).toFixed(4), '100.0000');
  });

  it('round-trips a weight through the field and back', () => {
    // 152.2 kg → "335.5 lb" → back to kg, within the tenth of a pound shown.
    const field = imperial.weightField(152.2);
    const back = imperial.parseWeight(field);
    assert.ok(back != null);
    assert.ok(Math.abs(back! - 152.2) < 0.05, `round-tripped to ${back}`);
  });

  it('round-trips a length and a volume', () => {
    const cm = imperial.parseLength(imperial.lengthField(178));
    assert.ok(cm != null && Math.abs(cm! - 178) < 0.15);

    const litres = imperial.parseVolume(imperial.volumeField(3));
    assert.ok(litres != null && Math.abs(litres! - 3) < 0.02);
  });
});

describe('formatting', () => {
  it('labels each system', () => {
    assert.deepEqual(METRIC.labels, { weight: 'kg', length: 'cm', volume: 'L' });
    assert.deepEqual(imperial.labels, { weight: 'lb', length: 'in', volume: 'fl oz' });
  });

  it('renders a weight in the right unit', () => {
    assert.equal(METRIC.weight(152.2), '152.2 kg');
    assert.equal(imperial.weight(152.2), '335.5 lb');
  });

  it('shows height as feet and inches only in imperial', () => {
    assert.equal(METRIC.height(178), '178 cm');
    assert.equal(imperial.height(178), "5'10\"");
  });

  it('drops the decimal on fluid ounces, which are already fine-grained', () => {
    assert.equal(METRIC.volume(2.8), '2.8 L');
    assert.equal(imperial.volume(2.8), '95 fl oz');
  });

  it('carries an arrow on every delta, so colour is never the only signal', () => {
    assert.equal(METRIC.weightDelta(-0.3), '↓ 0.3 kg');
    assert.equal(METRIC.weightDelta(0.4), '↑ 0.4 kg');
    assert.equal(METRIC.weightDelta(0), 'No change');
  });

  it('reports no change below what the displayed unit can show', () => {
    // 0.02 kg is under a tenth of a pound as well as a tenth of a kilo.
    assert.equal(METRIC.weightDelta(-0.02), 'No change');
    assert.equal(imperial.weightDelta(-0.02), 'No change');
  });

  it('renders nothing as an em dash rather than NaN', () => {
    assert.equal(METRIC.weight(null), '—');
    assert.equal(imperial.weightValue(undefined), '—');
    assert.equal(METRIC.weightField(null), '');
  });

  it('accepts a comma decimal separator', () => {
    assert.equal(METRIC.parseWeight('152,2'), 152.2);
  });

  it('rejects text that is not a number', () => {
    assert.equal(METRIC.parseWeight(''), null);
    assert.equal(METRIC.parseWeight('abc'), null);
  });
});
