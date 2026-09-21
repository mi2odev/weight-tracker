import React, { useState } from 'react';
import { View } from 'react-native';

import { useTheme } from '../theme/ThemeContext';
import { font, radius, space, tnum } from '../theme/tokens';
import { useStore } from '../data/store';
import { useUnits } from '../data/derived';
import { Card, Grid } from '../components/Card';
import { EmptyState, NumberField, PrimaryButton } from '../components/Controls';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Overlays';
import { Screen } from '../components/Screen';
import { Body, Caption, Stat } from '../components/Type';
import { MEASUREMENT_FIELDS, measurementDeltas } from '../lib/calc';
import { formatShort, todayKey } from '../lib/date';

type Draft = Record<string, string>;

export function BodyScreen({ onBack }: { onBack: () => void }) {
  const { colors } = useTheme();
  const { data, addMeasurement, showToast } = useStore();
  const u = useUnits();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>({});

  const rows = measurementDeltas(data.measurements);
  const sorted = data.measurements.slice().sort((a, b) => (a.logDate < b.logDate ? -1 : 1));
  const hasBaseline = rows.length > 0;

  const submit = () => {
    const values = MEASUREMENT_FIELDS.map(({ key }) => Number.parseFloat(draft[key] ?? ''));
    if (values.some((v) => !Number.isFinite(v) || v <= 0)) {
      showToast('Fill in all five measurements');
      return;
    }
    addMeasurement({
      logDate: todayKey(),
      waistCm: values[0],
      chestCm: values[1],
      armsCm: values[2],
      thighsCm: values[3],
      neckCm: values[4],
      photo: null,
    });
    setDraft({});
    setSheetOpen(false);
    showToast(hasBaseline ? 'Measurement saved' : 'Baseline recorded');
  };

  return (
    <Screen title="Body" meta="Measurements" onBack={onBack}>
      {hasBaseline ? (
        <>
          <View style={{ gap: space.sm }}>
            {rows.map((row) => {
              const shrunk = row.deltaCm <= 0;
              return (
                <Card
                  key={row.key}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 17, paddingVertical: 15 }}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Body style={{ fontFamily: font.semibold, fontSize: 14.5 }}>{row.label}</Body>
                    <Caption style={{ fontSize: 11.5 }}>
                      Since first measurement · {u.length(row.firstCm)}
                    </Caption>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 1 }}>
                    <Stat>{u.lengthValue(row.latestCm)}</Stat>
                    <Caption
                      style={[{ fontSize: 12, fontFamily: font.semibold }, tnum]}
                      color={shrunk ? colors.greenText : colors.text}
                    >
                      {Math.abs(row.deltaCm) < 0.05
                        ? 'No change'
                        : `${shrunk ? '↓' : '↑'} ${u.length(Math.abs(row.deltaCm))}`}
                    </Caption>
                  </View>
                </Card>
              );
            })}
          </View>

          <Card hero style={{ padding: 18, marginTop: space.sm }}>
            <Body style={{ fontFamily: font.semibold, fontSize: 14 }}>Progress photos</Body>
            <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}>
              {sorted.slice(-4).map((m) => (
                <View
                  key={m.id}
                  style={{
                    flex: 1,
                    aspectRatio: 3 / 4,
                    borderRadius: radius.md,
                    backgroundColor: colors.rail,
                    borderWidth: 1,
                    borderStyle: 'dashed',
                    borderColor: colors.line,
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  <Icon name="camera" size={18} color={colors.muted} strokeWidth={1.4} />
                  <Caption style={{ fontSize: 10, fontFamily: font.semibold }}>{formatShort(m.logDate)}</Caption>
                </View>
              ))}
            </View>
            <Caption style={{ fontSize: 11.5, lineHeight: 17, marginTop: space.md }}>
              Photo placeholders — attach one per measurement entry. Stored on device only.
            </Caption>
          </Card>
        </>
      ) : (
        <EmptyState
          icon="ruler"
          message="Take waist, chest, arms, thighs and neck today — that first set becomes the baseline every later change is measured against."
        />
      )}

      <PrimaryButton
        label={hasBaseline ? 'Add a new measurement' : 'Record my baseline'}
        onPress={() => setSheetOpen(true)}
        style={{ marginTop: space.md }}
      />

      <Sheet visible={sheetOpen} title="New measurement" onClose={() => setSheetOpen(false)}>
        <Caption style={{ fontSize: 12.5, lineHeight: 18 }}>
          All five in {u.units === 'imperial' ? 'inches' : 'centimetres'}, for {formatShort(todayKey())}.
        </Caption>
        <Grid columns={2}>
          {MEASUREMENT_FIELDS.map(({ key, label }) => (
            <NumberField
              key={key}
              label={label}
              unit={u.labels.length}
              value={draft[key] ?? ''}
              onChangeText={(text) => setDraft((prev) => ({ ...prev, [key]: text }))}
            />
          ))}
        </Grid>
        <PrimaryButton label="Save measurement" onPress={submit} style={{ marginTop: space.xs }} />
      </Sheet>
    </Screen>
  );
}
